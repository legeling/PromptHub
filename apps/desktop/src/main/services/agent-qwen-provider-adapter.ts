import { createHash } from "node:crypto";
import path from "node:path";
import { getAgentPrimaryModelConfigPath } from "./agent-model-config-paths";

import {
  applyEdits,
  modify,
  parse as parseJsonc,
  type ParseError,
} from "jsonc-parser";

import {
  reconcileAgentProviderState,
  type AgentProviderAdapter,
} from "@prompthub/core";
import type {
  AgentProviderActivationInput,
  AgentProviderActivationPlan,
  AgentProviderAdapterContext,
  AgentProviderApplyReceipt,
  AgentProviderComparableState,
  AgentProviderComparableValue,
  AgentProviderConnectionTestResult,
  AgentProviderImportPreview,
  AgentProviderModelMapping,
  AgentProviderModelTestResult,
  AgentProviderProfile,
  AgentProviderRollbackResult,
  AgentProviderVerification,
} from "@prompthub/shared";

import {
  createEncryptedConfigBackup,
  readEncryptedConfigBackup,
} from "./agent-encrypted-config-backup";
import { parseDotEnv, renderDotEnv } from "./agent-dotenv-config";
import {
  assertConfigUnchanged,
  atomicWrite,
  fileExists,
  readTextConfig,
  restoreModelConfig,
  sanitizeEndpoint,
} from "./agent-model-config";
import {
  createProviderProbeDispatcher,
  type DirectProviderProtocol,
  type ProviderProbeOptions,
} from "./agent-provider-probe-dispatch";
import type {
  AgentSecretStore,
  AgentSecretStoreEncryption,
} from "./agent-secret-store";

type JsonRecord = Record<string, unknown>;
type DirectProviderKind = "openai" | "anthropic" | "gemini";
type NativeAuthOwnership = "vertex-adc" | "oauth" | "coding-plan";
type AuthOwnership = "native-inline" | NativeAuthOwnership | "missing";

interface QwenProviderAdapterOptions extends ProviderProbeOptions {
  backupRoot: string;
  backupEncryption: AgentSecretStoreEncryption;
  secretStore: Pick<AgentSecretStore, "read">;
  now?: () => number;
  hooks?: {
    beforeWrite?: () => Promise<void>;
    afterSettingsWrite?: () => Promise<void>;
    afterWrite?: () => Promise<void>;
  };
}

interface QwenPaths {
  settingsPath: string;
  envPath: string;
  bundlePath: string;
}

interface NativeConfig {
  settingsRaw: string | null;
  envRaw: string | null;
  settings: JsonRecord;
  env: Map<string, string>;
  state: AgentProviderComparableState;
}

interface ActiveProjection {
  providerId: string | null;
  provider: DirectProviderKind | "vertex-ai" | "qwen-oauth" | null;
  protocol: DirectProviderProtocol | "platform-native" | null;
  endpoint: string | null;
  model: string | null;
  envKey: string | null;
  authOwnership: AuthOwnership;
  credentialStatus: "configured" | "platform-managed" | "missing";
}

interface DesiredQwenProvider {
  providerId: string;
  provider: DirectProviderKind | "vertex-ai" | "qwen-oauth";
  protocol: DirectProviderProtocol | "platform-native";
  endpoint: string | null;
  model: string;
  envKey: string | null;
  authOwnership: "native-inline" | NativeAuthOwnership;
  credentialStatus: "configured" | "platform-managed";
  secret: string | null;
  native: boolean;
}

interface QwenBackupBundle {
  version: 1;
  settings: string | null;
  env: string | null;
}

const ADAPTER_VERSION = "qwen-provider-profile-v1";
const MAX_NAME_LENGTH = 80;
const MAX_MODEL_LENGTH = 512;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const DIRECT_PROTOCOLS: Record<DirectProviderKind, DirectProviderProtocol> = {
  openai: "openai-chat",
  anthropic: "anthropic-messages",
  gemini: "google-generative-ai",
};
const formatting = { insertSpaces: true, tabSize: 2, eol: "\n" };

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getRecord(value: unknown, key: string): JsonRecord | undefined {
  return isRecord(value) && isRecord(value[key])
    ? (value[key] as JsonRecord)
    : undefined;
}

function getString(value: unknown, key: string): string | null {
  if (!isRecord(value) || typeof value[key] !== "string") return null;
  return (value[key] as string).trim() || null;
}

function parseSettings(raw: string): JsonRecord {
  const errors: ParseError[] = [];
  const parsed = parseJsonc(raw, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length > 0 || !isRecord(parsed)) {
    throw new Error("AGENT_QWEN_PROVIDER_CONFIG_INVALID");
  }
  return parsed;
}

function requireContext(context: AgentProviderAdapterContext): QwenPaths {
  if (
    context.agentId !== "qwen" ||
    context.platformId !== "qwen" ||
    typeof context.rootPath !== "string" ||
    !context.rootPath.trim() ||
    !path.isAbsolute(context.rootPath) ||
    context.rootPath.includes("\0")
  ) {
    throw new Error("AGENT_QWEN_PROVIDER_CONTEXT_INVALID");
  }
  const rootPath = path.resolve(context.rootPath);
  return {
    settingsPath: path.join(rootPath, getAgentPrimaryModelConfigPath("qwen")),
    envPath: path.join(rootPath, ".env"),
    bundlePath: path.join(rootPath, "provider-bundle.json"),
  };
}

function digest(settingsRaw: string | null, envRaw: string | null): string {
  return createHash("sha256")
    .update(settingsRaw === null ? "\0" : `s:${settingsRaw}`)
    .update(envRaw === null ? "\0" : `e:${envRaw}`)
    .digest("hex");
}

function modelEntries(
  settings: JsonRecord,
  providerId: string | null,
): JsonRecord[] {
  if (!providerId) return [];
  const providers = getRecord(settings, "modelProviders");
  const entries = providers?.[providerId];
  return Array.isArray(entries) ? entries.filter(isRecord) : [];
}

function selectedModelEntry(
  settings: JsonRecord,
  providerId: string | null,
  model: string | null,
): JsonRecord | undefined {
  if (!model) return undefined;
  return modelEntries(settings, providerId).find(
    (entry) => getString(entry, "id") === model,
  );
}

function providerKind(
  settings: JsonRecord,
  providerId: string | null,
): ActiveProjection["provider"] {
  if (!providerId) return null;
  if (providerId === "vertex-ai" || providerId === "qwen-oauth") {
    return providerId;
  }
  if (Object.hasOwn(DIRECT_PROTOCOLS, providerId)) {
    return providerId as DirectProviderKind;
  }
  const mapped = getString(getRecord(settings, "providerProtocol"), providerId);
  return mapped && Object.hasOwn(DIRECT_PROTOCOLS, mapped)
    ? (mapped as DirectProviderKind)
    : null;
}

function activeProjection(
  settings: JsonRecord,
  env: Map<string, string>,
): ActiveProjection {
  const auth = getRecord(getRecord(settings, "security"), "auth");
  const providerId = getString(auth, "selectedType");
  const model = getString(getRecord(settings, "model"), "name");
  const entry = selectedModelEntry(settings, providerId, model);
  const provider = providerKind(settings, providerId);
  const envKey = getString(entry, "envKey");
  const settingsEnv = getRecord(settings, "env");
  const hasCredential = Boolean(
    envKey &&
    (env.has(envKey) ||
      (settingsEnv && typeof settingsEnv[envKey] === "string")),
  );
  const ownership: AuthOwnership =
    providerId === "vertex-ai"
      ? "vertex-adc"
      : providerId === "qwen-oauth"
        ? "oauth"
        : envKey === "BAILIAN_CODING_PLAN_API_KEY"
          ? "coding-plan"
          : hasCredential
            ? "native-inline"
            : "missing";
  const native = ownership !== "native-inline" && ownership !== "missing";
  return {
    providerId,
    provider,
    protocol: native
      ? "platform-native"
      : provider
        ? DIRECT_PROTOCOLS[provider as DirectProviderKind]
        : null,
    endpoint: sanitizeEndpoint(getString(entry, "baseUrl")),
    model,
    envKey,
    authOwnership: ownership,
    credentialStatus: native
      ? "platform-managed"
      : hasCredential
        ? "configured"
        : "missing",
  };
}

function comparableState(
  settingsRaw: string | null,
  envRaw: string | null,
  settings: JsonRecord,
  env: Map<string, string>,
): AgentProviderComparableState {
  const active = activeProjection(settings, env);
  return {
    platformId: "qwen",
    adapterVersion: ADAPTER_VERSION,
    nativeDigest: digest(settingsRaw, envRaw),
    values: {
      providerId: active.providerId,
      provider: active.provider,
      protocol: active.protocol,
      endpoint: active.endpoint,
      model: active.model,
      envKey: active.envKey,
      authOwnership: active.authOwnership,
      credentialStatus: active.credentialStatus,
      sourceRelativePath: `${getAgentPrimaryModelConfigPath("qwen")} + .env`,
    },
  };
}

async function readOptionalConfig(filePath: string): Promise<string | null> {
  return (await fileExists(filePath)) ? readTextConfig(filePath) : null;
}

async function readNative(
  context: AgentProviderAdapterContext,
): Promise<NativeConfig> {
  const paths = requireContext(context);
  try {
    const [settingsRaw, envRaw] = await Promise.all([
      readOptionalConfig(paths.settingsPath),
      readOptionalConfig(paths.envPath),
    ]);
    const settings = settingsRaw === null ? {} : parseSettings(settingsRaw);
    const env = parseDotEnv(envRaw);
    return {
      settingsRaw,
      envRaw,
      settings,
      env,
      state: comparableState(settingsRaw, envRaw, settings, env),
    };
  } catch {
    throw new Error("AGENT_QWEN_PROVIDER_CONFIG_INVALID");
  }
}

function normalizeEndpoint(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const loopback =
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "127.0.0.1" ||
      hostname === "::1";
    if (
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      (parsed.protocol !== "https:" &&
        !(parsed.protocol === "http:" && loopback))
    ) {
      return null;
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function primaryMapping(
  mappings: AgentProviderModelMapping[],
): AgentProviderModelMapping | null {
  const primary = mappings.filter((mapping) => mapping.routeKey === "primary");
  if (
    primary.length !== 1 ||
    mappings.length !== 1 ||
    Object.keys(primary[0].parameters).length > 0
  ) {
    return null;
  }
  return primary[0];
}

function validText(value: string, maxLength: number): boolean {
  return (
    Boolean(value) &&
    value.length <= maxLength &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function directProviderKind(value: string): DirectProviderKind | null {
  return Object.hasOwn(DIRECT_PROTOCOLS, value)
    ? (value as DirectProviderKind)
    : null;
}

function publicDesiredValues(
  desired: DesiredQwenProvider,
): Record<string, AgentProviderComparableValue> {
  return {
    providerId: desired.providerId,
    provider: desired.provider,
    protocol: desired.protocol,
    endpoint: desired.endpoint,
    model: desired.model,
    envKey: desired.envKey,
    authOwnership: desired.authOwnership,
    credentialStatus: desired.credentialStatus,
  };
}

function hasOnlyConfigKeys(profile: AgentProviderProfile, allowed: string[]) {
  return Object.keys(profile.config).every(
    (key) => allowed.includes(key) || key === "adapter",
  );
}

function nativeOwnership(
  profile: AgentProviderProfile,
): NativeAuthOwnership | null {
  const value = profile.config.nativeAuthOwnership;
  return value === "vertex-adc" || value === "oauth" || value === "coding-plan"
    ? value
    : null;
}

async function resolveDesired(
  target: Pick<AgentProviderActivationInput, "profile" | "modelMappings">,
  native: NativeConfig,
  secretStore: Pick<AgentSecretStore, "read">,
): Promise<{
  blockedReasons: string[];
  desired: DesiredQwenProvider | null;
}> {
  const blockedReasons: string[] = [];
  const profile = target.profile;
  const mapping = primaryMapping(target.modelMappings);
  const model = mapping?.modelId.trim() ?? "";
  const providerId =
    typeof profile.config.providerId === "string"
      ? profile.config.providerId.trim()
      : "";
  const envKey =
    typeof profile.config.envKey === "string"
      ? profile.config.envKey.trim()
      : "";
  const provider = directProviderKind(profile.providerKind);
  const ownership = nativeOwnership(profile);
  const nativeMode =
    profile.protocol === "platform-native" && ownership !== null;
  const endpoint = normalizeEndpoint(profile.endpoint);

  if (!profile.name.trim() || profile.name.length > MAX_NAME_LENGTH) {
    blockedReasons.push("provider-name-invalid");
  }
  if (!PROVIDER_ID_PATTERN.test(providerId)) {
    blockedReasons.push("provider-id-invalid");
  }
  if (!mapping || !validText(model, MAX_MODEL_LENGTH)) {
    blockedReasons.push("primary-model-required");
  }
  if (nativeMode) {
    if (
      !hasOnlyConfigKeys(profile, ["providerId", "nativeAuthOwnership"]) ||
      profile.endpoint ||
      profile.secretRef
    ) {
      blockedReasons.push("native-provider-read-only");
    }
  } else {
    if (!provider || DIRECT_PROTOCOLS[provider] !== profile.protocol) {
      blockedReasons.push("provider-protocol-unsupported");
    }
    if (!ENV_KEY_PATTERN.test(envKey)) {
      blockedReasons.push("provider-env-key-invalid");
    }
    if (!profile.endpoint || !endpoint) {
      blockedReasons.push("provider-endpoint-invalid");
    }
    if (!hasOnlyConfigKeys(profile, ["providerId", "envKey"])) {
      blockedReasons.push("provider-config-unsupported");
    }
  }

  let secret: string | null = null;
  if (nativeMode) {
    const current = activeProjection(native.settings, native.env);
    if (
      current.providerId !== providerId ||
      current.model !== model ||
      current.authOwnership !== ownership
    ) {
      blockedReasons.push("native-provider-state-mismatch");
    }
  } else if (!profile.secretRef) {
    blockedReasons.push("provider-credential-required");
  } else {
    try {
      secret = await secretStore.read(profile.secretRef);
    } catch {
      blockedReasons.push("provider-secret-unavailable");
    }
    if (!secret) blockedReasons.push("provider-secret-missing");
  }

  if (blockedReasons.length > 0 || !mapping || (!nativeMode && !provider)) {
    return {
      blockedReasons: [...new Set(blockedReasons)],
      desired: null,
    };
  }
  const nativeProvider =
    ownership === "vertex-adc"
      ? "vertex-ai"
      : ownership === "oauth"
        ? "qwen-oauth"
        : provider!;
  return {
    blockedReasons: [],
    desired: {
      providerId,
      provider: nativeMode ? nativeProvider : provider!,
      protocol: nativeMode ? "platform-native" : DIRECT_PROTOCOLS[provider!],
      endpoint: nativeMode ? null : endpoint,
      model,
      envKey: nativeMode ? null : envKey,
      authOwnership: nativeMode ? ownership! : "native-inline",
      credentialStatus: nativeMode ? "platform-managed" : "configured",
      secret,
      native: nativeMode,
    },
  };
}

function desiredField(
  plan: AgentProviderActivationPlan,
  field: string,
): AgentProviderComparableValue | undefined {
  const decision = plan.decisions.find(
    (candidate) => candidate.field === field,
  );
  return decision?.status === "apply" ? decision.desired : undefined;
}

function assertPlanMatchesDesired(
  plan: AgentProviderActivationPlan,
  desired: DesiredQwenProvider,
): void {
  for (const [field, value] of Object.entries(publicDesiredValues(desired))) {
    const planned = desiredField(plan, field);
    if (planned !== undefined && planned !== value) {
      throw new Error("AGENT_QWEN_PROVIDER_PLAN_INVALID");
    }
  }
}

function edit(raw: string, pathSegments: string[], value: unknown): string {
  return applyEdits(
    raw,
    modify(raw, pathSegments, value, { formattingOptions: formatting }),
  );
}

function renderSettings(
  original: string | null,
  native: NativeConfig,
  desired: DesiredQwenProvider,
): string {
  let next = original ?? "{}\n";
  next = edit(next, ["$version"], 4);
  const existing = modelEntries(native.settings, desired.providerId);
  const matchingIndex = existing.findIndex(
    (entry) =>
      getString(entry, "id") === desired.model &&
      sanitizeEndpoint(getString(entry, "baseUrl")) === desired.endpoint,
  );
  const managedEntry = {
    ...(matchingIndex >= 0 ? existing[matchingIndex] : {}),
    id: desired.model,
    envKey: desired.envKey,
    baseUrl: desired.endpoint,
  };
  const entries =
    matchingIndex >= 0
      ? existing.map((entry, index) =>
          index === matchingIndex ? managedEntry : entry,
        )
      : [...existing, managedEntry];
  next = edit(next, ["modelProviders", desired.providerId], entries);
  if (!Object.hasOwn(DIRECT_PROTOCOLS, desired.providerId)) {
    next = edit(
      next,
      ["providerProtocol", desired.providerId],
      desired.provider,
    );
  }
  next = edit(next, ["security", "auth", "selectedType"], desired.providerId);
  const auth = getRecord(getRecord(native.settings, "security"), "auth");
  if (auth && Object.hasOwn(auth, "apiKey")) {
    next = edit(next, ["security", "auth", "apiKey"], undefined);
  }
  if (auth && Object.hasOwn(auth, "baseUrl")) {
    next = edit(next, ["security", "auth", "baseUrl"], undefined);
  }
  next = edit(next, ["model", "name"], desired.model);
  const settingsEnv = getRecord(native.settings, "env");
  if (settingsEnv && Object.hasOwn(settingsEnv, desired.envKey!)) {
    next = edit(next, ["env", desired.envKey!], undefined);
  }
  parseSettings(next);
  return next.endsWith("\n") ? next : `${next}\n`;
}

function renderEnv(
  original: string | null,
  desired: DesiredQwenProvider,
): string {
  return renderDotEnv(original, [[desired.envKey!, desired.secret]]);
}

function verifyDesired(
  state: AgentProviderComparableState,
  desired: DesiredQwenProvider,
): boolean {
  return Object.entries(publicDesiredValues(desired)).every(
    ([field, value]) => state.values[field] === value,
  );
}

function emptyConnectionResult(
  profile: AgentProviderProfile,
  mappings: AgentProviderModelMapping[],
  status: "no-credentials" | "unsupported",
  now: () => number,
): AgentProviderConnectionTestResult {
  const timestamp = now();
  return {
    platformId: "qwen",
    profileId: profile.id,
    protocol: profile.protocol,
    endpointOrigin: null,
    model: primaryMapping(mappings)?.modelId.trim() || null,
    status,
    startedAt: timestamp,
    finishedAt: timestamp,
    totalMs: 0,
    retryCount: 0,
    modelCount: null,
    modelAvailable: null,
  };
}

function emptyModelResult(
  profile: AgentProviderProfile,
  mappings: AgentProviderModelMapping[],
  status: "no-credentials" | "unsupported",
  now: () => number,
): AgentProviderModelTestResult {
  const timestamp = now();
  return {
    platformId: "qwen",
    profileId: profile.id,
    protocol: profile.protocol,
    endpointOrigin: null,
    model: primaryMapping(mappings)?.modelId.trim() || null,
    status,
    startedAt: timestamp,
    finishedAt: timestamp,
    totalMs: 0,
    firstTokenMs: null,
    retryCount: 0,
    inputTokens: null,
    outputTokens: null,
    outputPreview: null,
  };
}

function unavailableStatus(
  blockedReasons: string[],
): "no-credentials" | "unsupported" {
  return blockedReasons.some((reason) =>
    [
      "provider-credential-required",
      "provider-secret-missing",
      "provider-secret-unavailable",
    ].includes(reason),
  )
    ? "no-credentials"
    : "unsupported";
}

function backupContent(native: NativeConfig): string {
  const bundle: QwenBackupBundle = {
    version: 1,
    settings: native.settingsRaw,
    env: native.envRaw,
  };
  return JSON.stringify(bundle);
}

function parseBackupBundle(raw: string): QwenBackupBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AGENT_QWEN_PROVIDER_BACKUP_INVALID");
  }
  if (
    !isRecord(parsed) ||
    parsed.version !== 1 ||
    (parsed.settings !== null && typeof parsed.settings !== "string") ||
    (parsed.env !== null && typeof parsed.env !== "string")
  ) {
    throw new Error("AGENT_QWEN_PROVIDER_BACKUP_INVALID");
  }
  return parsed as unknown as QwenBackupBundle;
}

async function restoreBundle(
  paths: QwenPaths,
  bundle: QwenBackupBundle,
): Promise<void> {
  await Promise.all([
    restoreModelConfig(paths.settingsPath, bundle.settings),
    restoreModelConfig(paths.envPath, bundle.env),
  ]);
}

function deprecatedAuthFields(settings: JsonRecord): boolean {
  const auth = getRecord(getRecord(settings, "security"), "auth");
  return Boolean(getString(auth, "apiKey") || getString(auth, "baseUrl"));
}

function importPreview(native: NativeConfig): AgentProviderImportPreview {
  const active = activeProjection(native.settings, native.env);
  if (!active.providerId || !active.provider || !active.model) {
    throw new Error("AGENT_QWEN_PROVIDER_IMPORT_UNAVAILABLE");
  }
  const nativeMode =
    active.authOwnership !== "native-inline" &&
    active.authOwnership !== "missing";
  return {
    state: native.state,
    profile: {
      platformId: "qwen",
      name: `Qwen ${active.providerId}`,
      providerKind: active.provider,
      protocol: nativeMode ? "platform-native" : active.protocol!,
      endpoint: nativeMode ? null : active.endpoint,
      config: nativeMode
        ? {
            providerId: active.providerId,
            nativeAuthOwnership: active.authOwnership,
          }
        : {
            providerId: active.providerId,
            envKey: active.envKey,
          },
      secretRef: null,
      source: "native-import",
    },
    modelMappings: [
      {
        routeKey: "primary",
        modelId: active.model,
        parameters: {},
      },
    ],
    warnings: [
      ...(!nativeMode && active.credentialStatus === "configured"
        ? ["native-credential-not-imported"]
        : []),
      ...(nativeMode ? ["native-provider-read-only"] : []),
      ...(active.credentialStatus === "missing"
        ? ["native-credential-missing"]
        : []),
      ...(deprecatedAuthFields(native.settings)
        ? ["deprecated-native-auth-fields"]
        : []),
    ],
  };
}

export function createAgentQwenProviderAdapter(
  options: QwenProviderAdapterOptions,
): AgentProviderAdapter {
  const now = options.now ?? Date.now;
  const probes = createProviderProbeDispatcher("qwen", options);

  return {
    platformId: "qwen",
    version: ADAPTER_VERSION,
    async testConnection(context, target) {
      if (target.profile.platformId !== "qwen") {
        throw new Error("AGENT_PROVIDER_PROFILE_PLATFORM_MISMATCH");
      }
      const resolved = await resolveDesired(
        target,
        await readNative(context),
        options.secretStore,
      );
      if (!resolved.desired || resolved.desired.native) {
        return emptyConnectionResult(
          target.profile,
          target.modelMappings,
          resolved.desired
            ? "unsupported"
            : unavailableStatus(resolved.blockedReasons),
          now,
        );
      }
      return probes.testConnection({
        profileId: target.profile.id,
        protocol: resolved.desired.protocol as DirectProviderProtocol,
        endpoint: resolved.desired.endpoint,
        credential: resolved.desired.secret,
        model: resolved.desired.model,
      });
    },
    async testModel(context, target, signal) {
      if (target.profile.platformId !== "qwen") {
        throw new Error("AGENT_PROVIDER_PROFILE_PLATFORM_MISMATCH");
      }
      const resolved = await resolveDesired(
        target,
        await readNative(context),
        options.secretStore,
      );
      if (!resolved.desired || resolved.desired.native) {
        return emptyModelResult(
          target.profile,
          target.modelMappings,
          resolved.desired
            ? "unsupported"
            : unavailableStatus(resolved.blockedReasons),
          now,
        );
      }
      return probes.testModel(
        {
          profileId: target.profile.id,
          protocol: resolved.desired.protocol as DirectProviderProtocol,
          endpoint: resolved.desired.endpoint,
          credential: resolved.desired.secret,
          model: resolved.desired.model,
        },
        signal,
      );
    },
    async inspect(context) {
      return (await readNative(context)).state;
    },
    async importCurrent(context) {
      return importPreview(await readNative(context));
    },
    async planActivation(input) {
      requireContext(input.context);
      const native = await readNative(input.context);
      if (input.profile.platformId !== "qwen") {
        return reconcileAgentProviderState({
          profileId: input.profile.id,
          baseline: null,
          current: native.state,
          desired: { platformId: "qwen", values: {} },
          supportedKeys: [],
          blockedReasons: ["provider-platform-mismatch"],
        });
      }
      const resolved = await resolveDesired(input, native, options.secretStore);
      return reconcileAgentProviderState({
        profileId: input.profile.id,
        baseline:
          input.baseline?.adapterVersion === ADAPTER_VERSION
            ? input.baseline
            : null,
        current: native.state,
        desired: {
          platformId: "qwen",
          values: resolved.desired ? publicDesiredValues(resolved.desired) : {},
        },
        supportedKeys: [
          "providerId",
          "provider",
          "protocol",
          "endpoint",
          "model",
          "envKey",
          "authOwnership",
          "credentialStatus",
        ],
        blockedReasons: resolved.blockedReasons,
      });
    },
    async apply(context, plan, target): Promise<AgentProviderApplyReceipt> {
      const paths = requireContext(context);
      const native = await readNative(context);
      if (
        plan.platformId !== "qwen" ||
        plan.profileId !== target.profile.id ||
        plan.adapterVersion !== ADAPTER_VERSION ||
        plan.currentDigest !== native.state.nativeDigest ||
        plan.status !== "apply" ||
        !plan.canApply
      ) {
        throw new Error("AGENT_QWEN_PROVIDER_PLAN_INVALID");
      }
      const resolved = await resolveDesired(
        target,
        native,
        options.secretStore,
      );
      if (!resolved.desired || resolved.desired.native) {
        throw new Error("AGENT_QWEN_PROVIDER_PROFILE_INVALID");
      }
      assertPlanMatchesDesired(plan, resolved.desired);
      const nextSettings = renderSettings(
        native.settingsRaw,
        native,
        resolved.desired,
      );
      const nextEnv = renderEnv(native.envRaw, resolved.desired);
      const backupRef = await createEncryptedConfigBackup({
        backupRoot: options.backupRoot,
        agentId: "qwen",
        sourcePath: paths.bundlePath,
        content: backupContent(native),
        encryption: options.backupEncryption,
      });
      await options.hooks?.beforeWrite?.();
      try {
        await Promise.all([
          assertConfigUnchanged(paths.settingsPath, native.settingsRaw),
          assertConfigUnchanged(paths.envPath, native.envRaw),
        ]);
      } catch {
        throw new Error("AGENT_QWEN_PROVIDER_CONCURRENT_CHANGE");
      }
      try {
        await atomicWrite(paths.settingsPath, nextSettings);
        await options.hooks?.afterSettingsWrite?.();
        await atomicWrite(paths.envPath, nextEnv);
        await options.hooks?.afterWrite?.();
        const after = await readNative(context);
        if (!verifyDesired(after.state, resolved.desired)) {
          throw new Error("verification");
        }
        return {
          platformId: "qwen",
          profileId: plan.profileId,
          adapterVersion: ADAPTER_VERSION,
          nativeDigestBefore: native.state.nativeDigest,
          nativeDigestAfter: after.state.nativeDigest,
          backupRef,
          appliedAt: now(),
        };
      } catch {
        await restoreBundle(paths, {
          version: 1,
          settings: native.settingsRaw,
          env: native.envRaw,
        }).catch(() => undefined);
        throw new Error("AGENT_QWEN_PROVIDER_WRITE_FAILED");
      }
    },
    async verify(context, plan, receipt): Promise<AgentProviderVerification> {
      const state = (await readNative(context)).state;
      const fieldsMatch = plan.decisions.every(
        (decision) =>
          decision.status !== "apply" ||
          state.values[decision.field] === decision.desired,
      );
      const verified =
        receipt.platformId === "qwen" &&
        receipt.profileId === plan.profileId &&
        receipt.adapterVersion === ADAPTER_VERSION &&
        state.nativeDigest === receipt.nativeDigestAfter &&
        fieldsMatch;
      return {
        verified,
        nativeDigest: state.nativeDigest,
        state,
        ...(verified ? {} : { errorCode: "provider-state-mismatch" }),
      };
    },
    async rollback(context, receipt): Promise<AgentProviderRollbackResult> {
      try {
        const paths = requireContext(context);
        if (!receipt.backupRef) {
          throw new Error("AGENT_QWEN_PROVIDER_BACKUP_INVALID");
        }
        const bundle = parseBackupBundle(
          await readEncryptedConfigBackup({
            backupRoot: options.backupRoot,
            backupRef: receipt.backupRef,
            encryption: options.backupEncryption,
          }),
        );
        await restoreBundle(paths, bundle);
        const state = (await readNative(context)).state;
        return {
          restored: state.nativeDigest === receipt.nativeDigestBefore,
          nativeDigest: state.nativeDigest,
          ...(state.nativeDigest === receipt.nativeDigestBefore
            ? {}
            : { errorCode: "provider-rollback-mismatch" }),
        };
      } catch {
        return {
          restored: false,
          nativeDigest: null,
          errorCode: "provider-rollback-failed",
        };
      }
    },
  };
}
