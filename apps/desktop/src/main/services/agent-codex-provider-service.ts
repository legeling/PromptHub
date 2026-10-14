import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";
import path from "node:path";
import { getAgentPrimaryModelConfigPath } from "./agent-model-config-paths";
import { isAgentDepthCapabilityAvailable } from "@prompthub/shared/constants/agent-platform-capabilities";

import { parse as parseToml } from "smol-toml";

import type {
  AgentCodexProvider,
  AgentCodexProviderList,
  AgentCodexProviderTestResult,
  UpsertAgentCodexProviderInput,
} from "@prompthub/shared/types";

import {
  assertConfigUnchanged,
  atomicWrite,
  createBackup,
  fileExists,
  readTextConfig,
  restoreModelConfig,
  sanitizeEndpoint,
} from "./agent-model-config";
import type { AgentSecretStore } from "./agent-secret-store";
import { AgentCodexProviderError } from "./agent-codex-provider-error";
import type {
  AgentCodexProviderMigrationInspection,
  AgentCodexProviderMigrationSource,
} from "./agent-codex-provider-migration-service";
import {
  removeTable,
  setTopLevelString,
  upsertTableEntries,
} from "./codex-toml-editor";
import { SkillInstaller } from "./skill-installer";
import { getPlatformRootDir } from "./skill-installer-utils";
import { isBlockedHostname, isPrivateAddress } from "./skill-installer-remote";

type JsonRecord = Record<string, unknown>;

export {
  AgentCodexProviderError,
  type AgentCodexProviderErrorCode,
} from "./agent-codex-provider-error";

export interface AgentCodexProviderWriteHooks {
  /** Test seam: runs after the backup and before the concurrency digest. */
  beforeWrite?: (targetPath: string) => Promise<void>;
  /** Test seam: runs after the atomic write and before re-read verification. */
  afterWrite?: (targetPath: string) => Promise<void>;
}

export interface AgentCodexProviderServiceOptions {
  secretStore: AgentSecretStore;
  backupRoot: string;
  resolveConfigRoot?: (agentId: string) => string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  env?: NodeJS.ProcessEnv;
  lookupHost?: (hostname: string) => Promise<Array<{ address: string }>>;
  hooks?: AgentCodexProviderWriteHooks;
}

export interface AgentCodexProviderService {
  listProviders(agentId: string): Promise<AgentCodexProviderList>;
  inspectMigrationSources(
    agentId: string,
  ): Promise<AgentCodexProviderMigrationInspection>;
  upsertProvider(
    input: UpsertAgentCodexProviderInput,
  ): Promise<AgentCodexProviderList>;
  removeProvider(
    agentId: string,
    providerId: string,
  ): Promise<AgentCodexProviderList>;
  setDefaultProvider(
    agentId: string,
    providerId: string,
  ): Promise<AgentCodexProviderList>;
  testProvider(
    agentId: string,
    providerId: string,
  ): Promise<AgentCodexProviderTestResult>;
}

const RESERVED_PROVIDER_IDS = new Set(["openai", "ollama", "lmstudio"]);
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-_]*$/;
const MAX_PROVIDER_ID_LENGTH = 64;
const MAX_PROVIDER_NAME_LENGTH = 80;
const MAX_PROFILE_MODEL_LENGTH = 512;
const TEST_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Small record helpers (mirror agent-model-config conventions)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getRecord(value: unknown, key: string): JsonRecord | undefined {
  if (!isRecord(value)) return undefined;
  const child = value[key];
  return isRecord(child) ? child : undefined;
}

function getString(value: unknown, key: string): string | null {
  if (!isRecord(value) || typeof value[key] !== "string") return null;
  return (value[key] as string).trim() || null;
}

function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value);
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function normalizeProviderId(providerId: string): string {
  if (
    typeof providerId !== "string" ||
    providerId.length > MAX_PROVIDER_ID_LENGTH ||
    !PROVIDER_ID_PATTERN.test(providerId)
  ) {
    throw new AgentCodexProviderError("invalid-provider-id");
  }
  if (RESERVED_PROVIDER_IDS.has(providerId)) {
    throw new AgentCodexProviderError("reserved-provider-id");
  }
  return providerId;
}

function normalizeProviderName(name: string): string {
  if (typeof name !== "string") {
    throw new AgentCodexProviderError("invalid-name");
  }
  const trimmed = name.trim();
  if (
    !trimmed ||
    trimmed.length > MAX_PROVIDER_NAME_LENGTH ||
    hasControlCharacters(trimmed)
  ) {
    throw new AgentCodexProviderError("invalid-name");
  }
  return trimmed;
}

function normalizeWireApi(wireApi: string): "responses" {
  if (wireApi !== "responses") {
    throw new AgentCodexProviderError("invalid-wire-api");
  }
  return wireApi;
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }
  const bare = normalized.replace(/^\[|\]$/g, "");
  if (bare === "::1") return true;
  if (net.isIP(bare) === 4) {
    return bare.split(".")[0] === "127";
  }
  return false;
}

function normalizeProviderBaseUrl(baseUrl: string): string {
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    throw new AgentCodexProviderError("invalid-base-url");
  }
  let parsed: URL;
  try {
    parsed = new URL(baseUrl.trim());
  } catch {
    throw new AgentCodexProviderError("invalid-base-url");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new AgentCodexProviderError("invalid-base-url");
  }
  if (parsed.protocol === "http:" && !isLoopbackHost(parsed.hostname)) {
    throw new AgentCodexProviderError("invalid-base-url");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AgentCodexProviderError("invalid-base-url");
  }
  return parsed.toString().replace(/\/+$/, "");
}

function normalizeProfileModel(
  profileModel: string | null | undefined,
): string | null {
  if (profileModel === null || profileModel === undefined) return null;
  const trimmed = profileModel.trim();
  if (
    !trimmed ||
    trimmed.length > MAX_PROFILE_MODEL_LENGTH ||
    hasControlCharacters(trimmed)
  ) {
    throw new AgentCodexProviderError("invalid-profile-model");
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

function defaultResolveConfigRoot(agentId: string): string {
  const platform = SkillInstaller.getSupportedPlatforms().find(
    (candidate) => candidate.id === agentId,
  );
  if (!platform) {
    throw new Error(`Unknown Agent platform: ${agentId}`);
  }
  return getPlatformRootDir(platform);
}

function secretRefForProvider(providerId: string): string {
  return `codex-provider:${providerId}`;
}

function parseCodexToml(raw: string): JsonRecord {
  try {
    const parsed = parseToml(raw);
    if (!isRecord(parsed)) throw new Error("not a table");
    return parsed;
  } catch {
    throw new AgentCodexProviderError("invalid-config");
  }
}

export function createAgentCodexProviderService(
  options: AgentCodexProviderServiceOptions,
): AgentCodexProviderService {
  const resolveConfigRoot =
    options.resolveConfigRoot ?? defaultResolveConfigRoot;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const env = options.env ?? process.env;
  const lookupHost =
    options.lookupHost ??
    ((hostname: string) => dnsLookup(hostname, { all: true, verbatim: true }));

  function resolveCodexRoot(agentId: string): string {
    if (!isAgentDepthCapabilityAvailable(agentId, "providerModel")) {
      throw new AgentCodexProviderError("unsupported-agent");
    }
    if (typeof agentId !== "string" || !agentId.trim()) {
      throw new AgentCodexProviderError("unsupported-agent");
    }
    let root: string;
    try {
      root = resolveConfigRoot(agentId);
    } catch {
      // The registry lookup doubles as the agentId allowlist check and must
      // reject before any filesystem or network work happens.
      throw new AgentCodexProviderError("unsupported-agent");
    }
    if (agentId !== "codex") {
      throw new AgentCodexProviderError("unsupported-agent");
    }
    return root;
  }

  async function secretCall<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "AGENT_SECRET_STORE_UNAVAILABLE") {
        throw new AgentCodexProviderError("secret-store-unavailable");
      }
      if (message === "AGENT_SECRET_STORE_INVALID") {
        throw new AgentCodexProviderError("secret-store-invalid");
      }
      throw error;
    }
  }

  async function readConfig(
    targetPath: string,
  ): Promise<{ original: string | null; data: JsonRecord }> {
    if (!(await fileExists(targetPath))) {
      return { original: null, data: {} };
    }
    const original = await readTextConfig(targetPath);
    return { original, data: parseCodexToml(original) };
  }

  async function buildProviderList(
    agentId: string,
    data: JsonRecord,
  ): Promise<AgentCodexProviderList> {
    const activeProvider = getString(data, "model_provider") || "openai";
    const defaultModel = getString(data, "model");
    const providersTable = getRecord(data, "model_providers") ?? {};
    const profiles = getRecord(data, "profiles") ?? {};

    const providers: AgentCodexProvider[] = [];
    for (const [id, value] of Object.entries(providersTable)) {
      const entry = isRecord(value) ? value : {};
      const envKey = getString(entry, "env_key");
      const managed = await secretCall(() =>
        options.secretStore.has(secretRefForProvider(id)),
      );
      const hasInlineToken = Boolean(
        getString(entry, "experimental_bearer_token"),
      );
      providers.push({
        id,
        name: getString(entry, "name") ?? id,
        baseUrl: sanitizeEndpoint(getString(entry, "base_url")) ?? "",
        wireApi: getString(entry, "wire_api") === "chat" ? "chat" : "responses",
        envKey,
        keySource: managed ? "managed" : envKey ? "env" : "none",
        hasKey: managed || Boolean(envKey) || hasInlineToken,
        isActive: id === activeProvider,
        profileModel: getString(getRecord(profiles, id), "model"),
      });
    }

    return { agentId, activeProvider, defaultModel, providers };
  }

  async function listProviders(
    agentId: string,
  ): Promise<AgentCodexProviderList> {
    const root = resolveCodexRoot(agentId);
    const { data } = await readConfig(path.join(root, getAgentPrimaryModelConfigPath("codex")));
    return buildProviderList(agentId, data);
  }

  async function inspectMigrationSources(
    agentId: string,
  ): Promise<AgentCodexProviderMigrationInspection> {
    const root = resolveCodexRoot(agentId);
    const { original, data } = await readConfig(
      path.join(root, getAgentPrimaryModelConfigPath("codex")),
    );
    const activeProvider = getString(data, "model_provider") || "openai";
    const defaultModel = getString(data, "model");
    const providers = getRecord(data, "model_providers") ?? {};
    const profiles = getRecord(data, "profiles") ?? {};
    const sources: AgentCodexProviderMigrationSource[] = [];
    for (const [providerId, value] of Object.entries(providers)) {
      const entry = isRecord(value) ? value : {};
      const envKey = getString(entry, "env_key");
      const managedCredential = await secretCall(() =>
        options.secretStore.read(secretRefForProvider(providerId)),
      );
      const inlineCredential = getString(entry, "experimental_bearer_token");
      const credentialSource = managedCredential
        ? ("legacy-managed" as const)
        : envKey
          ? ("environment" as const)
          : inlineCredential
            ? ("native-inline" as const)
            : ("none" as const);
      sources.push({
        providerId,
        name: getString(entry, "name") ?? providerId,
        baseUrl: sanitizeEndpoint(getString(entry, "base_url")) ?? "",
        wireApi: getString(entry, "wire_api") === "chat" ? "chat" : "responses",
        envKey,
        credentialSource,
        credential: managedCredential ?? inlineCredential,
        isActive: providerId === activeProvider,
        profileModel: getString(getRecord(profiles, providerId), "model"),
      });
    }
    const publicSourceState = sources.map(({ credential, ...item }) => ({
      ...item,
      credentialReady:
        item.credentialSource === "environment"
          ? Boolean(item.envKey)
          : Boolean(credential),
    }));
    const nativeDigest = createHash("sha256")
      .update(original ?? "")
      .update(JSON.stringify(publicSourceState))
      .digest("hex");
    return { nativeDigest, defaultModel, sources };
  }

  async function runWritePipeline(context: {
    agentId: string;
    targetPath: string;
    original: string | null;
    nextText: string;
    verify: () => Promise<void>;
    applySecrets: () => Promise<void>;
    rollbackSecrets: () => Promise<void>;
  }): Promise<void> {
    await createBackup(context.targetPath, options.backupRoot, context.agentId);
    await options.hooks?.beforeWrite?.(context.targetPath);
    try {
      await assertConfigUnchanged(context.targetPath, context.original);
    } catch {
      throw new AgentCodexProviderError("concurrent-change");
    }
    try {
      await atomicWrite(context.targetPath, context.nextText);
      await options.hooks?.afterWrite?.(context.targetPath);
      await context.verify();
      await context.applySecrets();
    } catch (error) {
      await restoreModelConfig(context.targetPath, context.original).catch(
        () => undefined,
      );
      await context.rollbackSecrets().catch(() => undefined);
      if (error instanceof AgentCodexProviderError) throw error;
      throw new AgentCodexProviderError("write-failed");
    }
  }

  async function upsertProvider(
    input: UpsertAgentCodexProviderInput,
  ): Promise<AgentCodexProviderList> {
    const root = resolveCodexRoot(input.agentId);
    const providerId = normalizeProviderId(input.providerId);
    const name = normalizeProviderName(input.name);
    const baseUrl = normalizeProviderBaseUrl(input.baseUrl);
    const wireApi = normalizeWireApi(input.wireApi);
    const profileModel = normalizeProfileModel(input.profileModel);

    const apiKey = typeof input.apiKey === "string" ? input.apiKey : null;
    const envKey =
      typeof input.envKey === "string" && input.envKey.trim()
        ? input.envKey.trim()
        : null;
    if (apiKey && envKey) {
      throw new AgentCodexProviderError("conflicting-credentials");
    }
    if (apiKey !== null && apiKey !== "" && hasControlCharacters(apiKey)) {
      throw new AgentCodexProviderError("conflicting-credentials");
    }
    // "managed": project the key into experimental_bearer_token and keep the
    // encrypted master in the secret store. "env": reference an environment
    // variable and drop any managed key. "clear": drop the managed key only.
    // "preserve": edit mode keeps whatever auth fields already exist.
    const authMode: "managed" | "env" | "clear" | "preserve" = apiKey
      ? "managed"
      : envKey
        ? "env"
        : apiKey === ""
          ? "clear"
          : "preserve";

    const targetPath = path.join(root, getAgentPrimaryModelConfigPath("codex"));
    const { original, data } = await readConfig(targetPath);
    const providersTable = getRecord(data, "model_providers") ?? {};
    const existingEntry = getRecord(providersTable, providerId);
    const isEdit = existingEntry !== undefined;

    if (!isEdit) {
      // Adding must not hijack an existing profile that points at another
      // provider; the profile namespace is shared with provider ids.
      const profile = getRecord(getRecord(data, "profiles"), providerId);
      const profileProvider = profile
        ? getString(profile, "model_provider")
        : null;
      if (profile && profileProvider && profileProvider !== providerId) {
        throw new AgentCodexProviderError("provider-id-conflict");
      }
    }

    const secretRef = secretRefForProvider(providerId);
    const priorSecret = await secretCall(() =>
      options.secretStore.read(secretRef),
    );

    const setEntries: Array<[string, string]> = [
      ["name", name],
      ["base_url", baseUrl],
      ["wire_api", wireApi],
    ];
    const removeKeys: string[] = [];
    if (authMode === "managed" && apiKey) {
      setEntries.push(["experimental_bearer_token", apiKey]);
      removeKeys.push("env_key");
    } else if (authMode === "env" && envKey) {
      setEntries.push(["env_key", envKey]);
      removeKeys.push("experimental_bearer_token");
    } else if (authMode === "clear") {
      removeKeys.push("experimental_bearer_token");
    }

    let nextText = upsertTableEntries(
      original ?? "",
      ["model_providers", providerId],
      setEntries,
      removeKeys,
    );
    if (profileModel) {
      nextText = upsertTableEntries(
        nextText,
        ["profiles", providerId],
        [
          ["model", profileModel],
          ["model_provider", providerId],
        ],
        [],
      );
    }

    await runWritePipeline({
      agentId: input.agentId,
      targetPath,
      original,
      nextText,
      verify: async () => {
        const verified = parseCodexToml(await readTextConfig(targetPath));
        const entry = getRecord(
          getRecord(verified, "model_providers"),
          providerId,
        );
        const matches =
          entry &&
          getString(entry, "name") === name &&
          getString(entry, "base_url") === baseUrl &&
          getString(entry, "wire_api") === wireApi &&
          (authMode === "managed"
            ? getString(entry, "experimental_bearer_token") === apiKey &&
              getString(entry, "env_key") === null
            : authMode === "env"
              ? getString(entry, "env_key") === envKey &&
                getString(entry, "experimental_bearer_token") === null
              : authMode === "clear"
                ? getString(entry, "experimental_bearer_token") === null
                : true);
        if (!matches) {
          throw new AgentCodexProviderError("verification-failed");
        }
        if (profileModel) {
          const profile = getRecord(
            getRecord(verified, "profiles"),
            providerId,
          );
          if (
            !profile ||
            getString(profile, "model") !== profileModel ||
            getString(profile, "model_provider") !== providerId
          ) {
            throw new AgentCodexProviderError("verification-failed");
          }
        }
      },
      applySecrets: async () => {
        if (authMode === "managed" && apiKey) {
          await secretCall(() => options.secretStore.write(secretRef, apiKey));
        } else if (authMode === "env" || authMode === "clear") {
          await secretCall(() => options.secretStore.clear(secretRef));
        }
      },
      rollbackSecrets: async () => {
        if (priorSecret === null) {
          await options.secretStore.clear(secretRef);
        } else {
          await options.secretStore.write(secretRef, priorSecret);
        }
      },
    });

    return listProviders(input.agentId);
  }

  async function removeProvider(
    agentId: string,
    providerId: string,
  ): Promise<AgentCodexProviderList> {
    const root = resolveCodexRoot(agentId);
    if (typeof providerId !== "string" || !providerId.trim()) {
      throw new AgentCodexProviderError("invalid-provider-id");
    }
    const targetPath = path.join(root, getAgentPrimaryModelConfigPath("codex"));
    const { original, data } = await readConfig(targetPath);
    const providersTable = getRecord(data, "model_providers") ?? {};
    if (!getRecord(providersTable, providerId)) {
      throw new AgentCodexProviderError("provider-not-found");
    }
    const activeProvider = getString(data, "model_provider") || "openai";
    if (providerId === activeProvider) {
      throw new AgentCodexProviderError("active-provider");
    }

    const profiles = getRecord(data, "profiles") ?? {};
    const referencingProfiles = Object.keys(profiles).filter(
      (profileId) =>
        getString(getRecord(profiles, profileId), "model_provider") ===
        providerId,
    );

    const secretRef = secretRefForProvider(providerId);
    const priorSecret = await secretCall(() =>
      options.secretStore.read(secretRef),
    );

    let nextText = removeTable(original ?? "", ["model_providers", providerId]);
    for (const profileId of referencingProfiles) {
      nextText = removeTable(nextText, ["profiles", profileId]);
    }

    await runWritePipeline({
      agentId,
      targetPath,
      original,
      nextText,
      verify: async () => {
        const verified = parseCodexToml(await readTextConfig(targetPath));
        if (
          getRecord(getRecord(verified, "model_providers"), providerId) !==
          undefined
        ) {
          throw new AgentCodexProviderError("verification-failed");
        }
        const verifiedProfiles = getRecord(verified, "profiles") ?? {};
        for (const profileId of referencingProfiles) {
          if (
            getString(
              getRecord(verifiedProfiles, profileId),
              "model_provider",
            ) === providerId
          ) {
            throw new AgentCodexProviderError("verification-failed");
          }
        }
      },
      applySecrets: async () => {
        await secretCall(() => options.secretStore.clear(secretRef));
      },
      rollbackSecrets: async () => {
        if (priorSecret !== null) {
          await options.secretStore.write(secretRef, priorSecret);
        }
      },
    });

    return listProviders(agentId);
  }

  async function setDefaultProvider(
    agentId: string,
    providerId: string,
  ): Promise<AgentCodexProviderList> {
    const root = resolveCodexRoot(agentId);
    if (typeof providerId !== "string" || !providerId.trim()) {
      throw new AgentCodexProviderError("invalid-provider-id");
    }
    const targetPath = path.join(root, getAgentPrimaryModelConfigPath("codex"));
    const { original, data } = await readConfig(targetPath);
    if (
      providerId !== "openai" &&
      !getRecord(getRecord(data, "model_providers"), providerId)
    ) {
      throw new AgentCodexProviderError("provider-not-found");
    }

    if (providerId !== "openai")
      normalizeWireApi(
        getString(
          getRecord(getRecord(data, "model_providers"), providerId),
          "wire_api",
        ) ?? "responses",
      );
    const nextText = setTopLevelString(
      original ?? "",
      "model_provider",
      providerId,
    );

    await runWritePipeline({
      agentId,
      targetPath,
      original,
      nextText,
      verify: async () => {
        const verified = parseCodexToml(await readTextConfig(targetPath));
        if (getString(verified, "model_provider") !== providerId) {
          throw new AgentCodexProviderError("verification-failed");
        }
      },
      applySecrets: async () => undefined,
      rollbackSecrets: async () => undefined,
    });

    return listProviders(agentId);
  }

  async function validateTestUrl(
    baseUrl: string,
  ): Promise<AgentCodexProviderTestResult | null> {
    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch {
      return { status: "invalid-url", latencyMs: null, modelCount: null };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { status: "invalid-url", latencyMs: null, modelCount: null };
    }
    if (parsed.username || parsed.password) {
      return { status: "invalid-url", latencyMs: null, modelCount: null };
    }
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    // Loopback targets are first-class (local Ollama and similar servers);
    // a desktop user pointing at their own machine is not an SSRF vector.
    if (isLoopbackHost(hostname)) {
      return null;
    }
    if (isBlockedHostname(hostname)) {
      return { status: "invalid-url", latencyMs: null, modelCount: null };
    }
    if (net.isIP(hostname)) {
      return isPrivateAddress(hostname)
        ? { status: "invalid-url", latencyMs: null, modelCount: null }
        : null;
    }
    let addresses: Array<{ address: string }>;
    try {
      addresses = await lookupHost(hostname);
    } catch {
      return { status: "network-error", latencyMs: null, modelCount: null };
    }
    if (
      addresses.some(
        (entry) =>
          isPrivateAddress(entry.address) && !isLoopbackHost(entry.address),
      )
    ) {
      return { status: "invalid-url", latencyMs: null, modelCount: null };
    }
    return null;
  }

  async function testProvider(
    agentId: string,
    providerId: string,
  ): Promise<AgentCodexProviderTestResult> {
    const root = resolveCodexRoot(agentId);
    if (typeof providerId !== "string" || !providerId.trim()) {
      throw new AgentCodexProviderError("invalid-provider-id");
    }
    const targetPath = path.join(root, getAgentPrimaryModelConfigPath("codex"));
    const { data } = await readConfig(targetPath);
    const entry = getRecord(getRecord(data, "model_providers"), providerId);
    if (!entry) {
      throw new AgentCodexProviderError("provider-not-found");
    }

    const baseUrl = getString(entry, "base_url");
    if (!baseUrl) {
      return { status: "invalid-url", latencyMs: null, modelCount: null };
    }
    const blocked = await validateTestUrl(baseUrl);
    if (blocked) return blocked;

    // Resolve the credential in the main process only; it never enters the
    // result payload, error messages, or logs.
    let key: string | null = null;
    const secretRef = secretRefForProvider(providerId);
    if (await secretCall(() => options.secretStore.has(secretRef))) {
      key = await secretCall(() => options.secretStore.read(secretRef));
    } else {
      const envKey = getString(entry, "env_key");
      if (envKey) {
        const value = env[envKey];
        key = typeof value === "string" && value ? value : null;
      } else {
        key = getString(entry, "experimental_bearer_token");
      }
    }
    if (!key) {
      return { status: "no-credentials", latencyMs: null, modelCount: null };
    }

    const target = `${baseUrl.replace(/\/+$/, "")}/models`;
    const startedAt = now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(target, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
      const latencyMs = Math.max(0, now() - startedAt);
      if (response.status === 401 || response.status === 403) {
        return { status: "auth-error", latencyMs, modelCount: null };
      }
      if (!response.ok) {
        return {
          status: "http-error",
          latencyMs,
          modelCount: null,
          errorCode: `http-${response.status}`,
        };
      }
      let modelCount: number | null = null;
      try {
        const body: unknown = await response.json();
        const list = isRecord(body) ? body.data : undefined;
        if (Array.isArray(list)) modelCount = list.length;
      } catch {
        modelCount = null;
      }
      return { status: "ok", latencyMs, modelCount };
    } catch (error) {
      const latencyMs = Math.max(0, now() - startedAt);
      const isTimeout = error instanceof Error && error.name === "AbortError";
      return {
        status: isTimeout ? "timeout" : "network-error",
        latencyMs,
        modelCount: null,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    listProviders,
    inspectMigrationSources,
    upsertProvider,
    removeProvider,
    setDefaultProvider,
    testProvider,
  };
}
