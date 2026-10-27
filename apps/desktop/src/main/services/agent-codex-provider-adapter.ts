import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getAgentPrimaryModelConfigPath } from "./agent-model-config-paths";

import { parse as parseToml } from "smol-toml";

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
  assertConfigUnchanged,
  atomicWrite,
  fileExists,
  readTextConfig,
  restoreModelConfig,
  sanitizeEndpoint,
} from "./agent-model-config";
import type {
  AgentSecretStore,
  AgentSecretStoreEncryption,
} from "./agent-secret-store";
import {
  createEncryptedConfigBackup,
  readEncryptedConfigBackup,
} from "./agent-encrypted-config-backup";
import {
  testOpenAICompatibleProviderConnection,
  type OpenAICompatibleConnectionInput,
} from "./agent-provider-connectivity";
import {
  testOpenAICompatibleProviderModel,
  type OpenAICompatibleModelTestInput,
} from "./agent-provider-model-test";
import {
  testCodexNativeProviderConnection,
  testCodexNativeProviderModel,
  type CodexNativeConnectionInput,
  type CodexNativeModelTestInput,
} from "./agent-codex-native-provider-probe";
import {
  removeTopLevelScalar,
  removeTableFields,
  setTopLevelNumber,
  setTopLevelString,
  upsertTableEntries,
} from "./codex-toml-editor";

type JsonRecord = Record<string, unknown>;

interface CodexProviderAdapterOptions {
  backupRoot: string;
  backupEncryption: AgentSecretStoreEncryption;
  secretStore: Pick<AgentSecretStore, "read">;
  env?: NodeJS.ProcessEnv;
  testConnection?: (
    input: OpenAICompatibleConnectionInput,
  ) => Promise<
    Omit<AgentProviderConnectionTestResult, "platformId" | "profileId">
  >;
  testModel?: (
    input: OpenAICompatibleModelTestInput,
  ) => Promise<Omit<AgentProviderModelTestResult, "platformId" | "profileId">>;
  testNativeConnection?: (
    input: CodexNativeConnectionInput,
  ) => Promise<
    Omit<AgentProviderConnectionTestResult, "platformId" | "profileId">
  >;
  testNativeModel?: (
    input: CodexNativeModelTestInput,
  ) => Promise<Omit<AgentProviderModelTestResult, "platformId" | "profileId">>;
  now?: () => number;
  hooks?: {
    beforeWrite?: (targetPath: string) => Promise<void>;
    afterWrite?: (targetPath: string) => Promise<void>;
  };
}

interface NativeConfig {
  raw: string | null;
  data: JsonRecord;
  state: AgentProviderComparableState;
}

interface DesiredCodexProvider {
  providerId: string;
  name: string;
  endpoint: string | null;
  protocol: "chat" | "responses" | "platform-native";
  model: string;
  reasoningEffort: CodexReasoningEffort | null;
  contextWindow: number | null;
  envKey: string | null;
  secret: string | null;
  credentialStatus: "configured" | "environment" | "platform-managed";
}

type CodexReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

interface ParsedCodexModelMapping {
  modelId: string;
  reasoningEffort: CodexReasoningEffort | null;
  contextWindow: number | null;
}

const ADAPTER_VERSION = "codex-provider-profile-v2";
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-_]*$/;
const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED_CUSTOM_PROVIDER_IDS = new Set(["openai", "ollama", "lmstudio"]);
const MAX_PROVIDER_ID_LENGTH = 64;
const MAX_NAME_LENGTH = 80;
const MAX_MODEL_LENGTH = 512;
const MAX_CONTEXT_WINDOW = 10_000_000;
const REASONING_EFFORTS = new Set<CodexReasoningEffort>([
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getRecord(value: unknown, key: string): JsonRecord | undefined {
  if (!isRecord(value)) return undefined;
  return isRecord(value[key]) ? (value[key] as JsonRecord) : undefined;
}

function getString(value: unknown, key: string): string | null {
  if (!isRecord(value) || typeof value[key] !== "string") return null;
  return (value[key] as string).trim() || null;
}

function getPositiveInteger(value: unknown, key: string): number | null {
  if (!isRecord(value)) return null;
  const candidate = value[key];
  return typeof candidate === "number" &&
    Number.isSafeInteger(candidate) &&
    candidate > 0 &&
    candidate <= MAX_CONTEXT_WINDOW
    ? candidate
    : null;
}

function parseConfig(raw: string): JsonRecord {
  try {
    return parseToml(raw) as JsonRecord;
  } catch {
    throw new Error("AGENT_CODEX_PROVIDER_CONFIG_INVALID");
  }
}

function requireContext(context: AgentProviderAdapterContext): string {
  if (
    context.agentId !== "codex" ||
    context.platformId !== "codex" ||
    typeof context.rootPath !== "string" ||
    !context.rootPath.trim() ||
    !path.isAbsolute(context.rootPath) ||
    context.rootPath.includes("\0")
  ) {
    throw new Error("AGENT_CODEX_PROVIDER_CONTEXT_INVALID");
  }
  const root = path.resolve(context.rootPath);
  return path.resolve(root, getAgentPrimaryModelConfigPath("codex"));
}

function nativeDigest(raw: string | null): string {
  return createHash("sha256")
    .update(raw ?? "")
    .digest("hex");
}

function activeProviderData(data: JsonRecord): {
  providerId: string;
  provider: JsonRecord | undefined;
} {
  const providerId = getString(data, "model_provider") ?? "openai";
  return {
    providerId,
    provider: getRecord(getRecord(data, "model_providers"), providerId),
  };
}

function comparableState(
  raw: string | null,
  data: JsonRecord,
): AgentProviderComparableState {
  const active = activeProviderData(data);
  const inlineToken = getString(active.provider, "experimental_bearer_token");
  const envKey = getString(active.provider, "env_key");
  const endpoint = sanitizeEndpoint(getString(active.provider, "base_url"));
  const protocol =
    active.provider && getString(active.provider, "wire_api") === "chat"
      ? "chat"
      : active.provider
        ? "responses"
        : "platform-native";
  const values: Record<string, AgentProviderComparableValue> = {
    provider: active.providerId,
    endpoint,
    protocol,
    model: getString(data, "model") ?? null,
    reasoningEffort: getString(data, "model_reasoning_effort"),
    contextWindow: getPositiveInteger(data, "model_context_window"),
    credentialStatus:
      active.providerId === "openai" && !active.provider
        ? "platform-managed"
        : inlineToken
          ? "configured"
          : envKey
            ? "environment"
            : "missing",
    sourceRelativePath: getAgentPrimaryModelConfigPath("codex"),
  };
  return {
    platformId: "codex",
    adapterVersion: ADAPTER_VERSION,
    nativeDigest: nativeDigest(raw),
    values,
  };
}

async function readNative(
  context: AgentProviderAdapterContext,
): Promise<NativeConfig> {
  const targetPath = requireContext(context);
  if (!(await fileExists(targetPath))) {
    return {
      raw: null,
      data: {},
      state: comparableState(null, {}),
    };
  }
  try {
    const raw = await readTextConfig(targetPath);
    const data = parseConfig(raw);
    return { raw, data, state: comparableState(raw, data) };
  } catch {
    throw new Error("AGENT_CODEX_PROVIDER_CONFIG_INVALID");
  }
}

function normalizedProviderId(profile: AgentProviderProfile): string | null {
  const configured =
    profile.config.providerId ?? profile.config.legacyProviderId;
  if (
    typeof configured !== "string" ||
    configured.length > MAX_PROVIDER_ID_LENGTH ||
    !PROVIDER_ID_PATTERN.test(configured)
  ) {
    return null;
  }
  return configured;
}

function normalizedProtocol(
  value: string,
): "chat" | "responses" | "platform-native" | null {
  if (value === "responses" || value === "openai-responses") return "responses";
  if (value === "platform-native" || value === "native")
    return "platform-native";
  return null;
}

function normalizedEndpoint(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const loopback =
      parsed.hostname === "localhost" ||
      parsed.hostname.endsWith(".localhost") ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "[::1]";
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
): ParsedCodexModelMapping | null {
  const primary = mappings.filter((mapping) => mapping.routeKey === "primary");
  if (primary.length !== 1) return null;
  if (mappings.some((mapping) => mapping.routeKey !== "primary")) return null;
  const parameters = primary[0].parameters;
  if (
    Object.keys(parameters).some(
      (key) => key !== "reasoningEffort" && key !== "contextWindow",
    )
  )
    return null;
  const reasoningEffort = parameters.reasoningEffort;
  if (
    reasoningEffort !== undefined &&
    (typeof reasoningEffort !== "string" ||
      !REASONING_EFFORTS.has(reasoningEffort as CodexReasoningEffort))
  )
    return null;
  const contextWindow = parameters.contextWindow;
  if (
    contextWindow !== undefined &&
    (typeof contextWindow !== "number" ||
      !Number.isSafeInteger(contextWindow) ||
      contextWindow < 1 ||
      contextWindow > MAX_CONTEXT_WINDOW)
  )
    return null;
  return {
    modelId: primary[0].modelId,
    reasoningEffort:
      (reasoningEffort as CodexReasoningEffort | undefined) ?? null,
    contextWindow: (contextWindow as number | undefined) ?? null,
  };
}

function publicDesiredValues(
  desired: DesiredCodexProvider,
): Record<string, AgentProviderComparableValue> {
  return {
    provider: desired.providerId,
    endpoint: desired.endpoint,
    protocol: desired.protocol,
    model: desired.model,
    reasoningEffort: desired.reasoningEffort,
    contextWindow: desired.contextWindow,
    credentialStatus: desired.credentialStatus,
  };
}

async function resolveDesired(
  input: Pick<AgentProviderActivationInput, "profile" | "modelMappings">,
  secretStore: Pick<AgentSecretStore, "read">,
): Promise<{ blockedReasons: string[]; desired: DesiredCodexProvider | null }> {
  const blockedReasons: string[] = [];
  const providerId = normalizedProviderId(input.profile);
  const protocol = normalizedProtocol(input.profile.protocol);
  const mapping = primaryMapping(input.modelMappings);
  const endpoint = normalizedEndpoint(input.profile.endpoint);
  const envKey =
    typeof input.profile.config.envKey === "string" &&
    input.profile.config.envKey
      ? input.profile.config.envKey
      : null;

  if (!providerId) blockedReasons.push("provider-id-required");
  if (!protocol) blockedReasons.push("provider-protocol-unsupported");
  if (!mapping || !mapping.modelId.trim()) {
    blockedReasons.push("primary-model-required");
  } else if (
    mapping.modelId.length > MAX_MODEL_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(mapping.modelId)
  ) {
    blockedReasons.push("primary-model-invalid");
  }
  if (
    mapping?.reasoningEffort &&
    protocol !== "responses" &&
    !(providerId === "openai" && protocol === "platform-native")
  ) {
    blockedReasons.push("model-reasoning-effort-unsupported");
  }
  if (
    !input.profile.name.trim() ||
    input.profile.name.length > MAX_NAME_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(input.profile.name)
  ) {
    blockedReasons.push("provider-name-invalid");
  }
  if (input.profile.endpoint && !endpoint) {
    blockedReasons.push("provider-endpoint-invalid");
  }
  if (envKey && !ENV_KEY_PATTERN.test(envKey)) {
    blockedReasons.push("provider-env-key-invalid");
  }
  if (envKey && input.profile.secretRef) {
    blockedReasons.push("provider-credential-conflict");
  }

  const nativeOpenAI =
    providerId === "openai" &&
    input.profile.providerKind === "openai" &&
    protocol === "platform-native" &&
    !input.profile.endpoint &&
    !input.profile.secretRef &&
    !envKey;
  if (
    providerId &&
    RESERVED_CUSTOM_PROVIDER_IDS.has(providerId) &&
    !nativeOpenAI
  ) {
    blockedReasons.push("provider-id-reserved");
  }
  if (providerId && providerId !== "openai" && !endpoint) {
    blockedReasons.push("provider-endpoint-required");
  }
  if (providerId && providerId !== "openai" && protocol === "platform-native") {
    blockedReasons.push("provider-protocol-unsupported");
  }

  let secret: string | null = null;
  if (input.profile.secretRef && !envKey) {
    try {
      secret = await secretStore.read(input.profile.secretRef);
    } catch {
      blockedReasons.push("provider-secret-unavailable");
    }
    if (!secret) blockedReasons.push("provider-secret-missing");
  } else if (providerId && providerId !== "openai" && !envKey) {
    blockedReasons.push("provider-credential-required");
  }

  if (blockedReasons.length > 0 || !providerId || !protocol || !mapping) {
    return {
      blockedReasons: [...new Set(blockedReasons)],
      desired: null,
    };
  }
  return {
    blockedReasons: [],
    desired: {
      providerId,
      name: input.profile.name.trim(),
      endpoint,
      protocol,
      model: mapping.modelId.trim(),
      reasoningEffort: mapping.reasoningEffort,
      contextWindow: mapping.contextWindow,
      envKey,
      secret,
      credentialStatus:
        providerId === "openai"
          ? "platform-managed"
          : secret
            ? "configured"
            : "environment",
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
  desired: DesiredCodexProvider,
): void {
  const values = publicDesiredValues(desired);
  for (const [field, value] of Object.entries(values)) {
    const planned = desiredField(plan, field);
    if (planned !== undefined && planned !== value) {
      throw new Error("AGENT_CODEX_PROVIDER_PLAN_INVALID");
    }
  }
}

function renderConfig(
  original: string | null,
  desired: DesiredCodexProvider,
): string {
  let next = setTopLevelString(
    original ?? "",
    "model_provider",
    desired.providerId,
  );
  next = setTopLevelString(next, "model", desired.model);
  next = desired.reasoningEffort
    ? setTopLevelString(next, "model_reasoning_effort", desired.reasoningEffort)
    : removeTopLevelScalar(next, "model_reasoning_effort");
  next = desired.contextWindow
    ? setTopLevelNumber(next, "model_context_window", desired.contextWindow)
    : removeTopLevelScalar(next, "model_context_window");
  if (desired.providerId === "openai") return next;

  const set: Array<[string, string]> = [
    ["name", desired.name],
    ["base_url", desired.endpoint!],
    ["wire_api", desired.protocol],
  ];
  const remove: string[] = [];
  if (desired.secret) {
    set.push(["experimental_bearer_token", desired.secret]);
    remove.push("env_key");
  } else {
    set.push(["env_key", desired.envKey!]);
    remove.push("experimental_bearer_token");
  }
  // Activating an explicitly selected credential replaces this provider's auth
  // mechanism; keep the original in the existing encrypted rollback bundle.
  next = removeTableFields(
    next,
    ["model_providers", desired.providerId],
    ["auth", "requires_openai_auth"],
  );
  return upsertTableEntries(
    next,
    ["model_providers", desired.providerId],
    set,
    remove,
  );
}

function verifyDesired(
  state: AgentProviderComparableState,
  desired: DesiredCodexProvider,
): boolean {
  return Object.entries(publicDesiredValues(desired)).every(
    ([field, value]) => state.values[field] === value,
  );
}

function hasConflictingNativeAuth(data: JsonRecord): boolean {
  const provider = activeProviderData(data).provider;
  return Boolean(
    provider?.auth &&
    (provider.env_key ||
      provider.experimental_bearer_token ||
      provider.requires_openai_auth),
  );
}

export function createAgentCodexProviderAdapter(
  options: CodexProviderAdapterOptions,
): AgentProviderAdapter {
  const now = options.now ?? Date.now;
  const env = options.env ?? process.env;
  const testConnection =
    options.testConnection ?? testOpenAICompatibleProviderConnection;
  const testModel = options.testModel ?? testOpenAICompatibleProviderModel;
  const testNativeConnection =
    options.testNativeConnection ?? testCodexNativeProviderConnection;
  const testNativeModel =
    options.testNativeModel ?? testCodexNativeProviderModel;

  return {
    platformId: "codex",
    version: ADAPTER_VERSION,
    async testConnection(context, target) {
      if (target.profile.platformId !== "codex") {
        throw new Error("AGENT_PROVIDER_PROFILE_PLATFORM_MISMATCH");
      }
      const resolved = await resolveDesired(target, options.secretStore);
      if (!resolved.desired) {
        const timestamp = now();
        return {
          platformId: "codex",
          profileId: target.profile.id,
          protocol: target.profile.protocol,
          endpointOrigin: null,
          model: primaryMapping(target.modelMappings)?.modelId.trim() || null,
          status: resolved.blockedReasons.some((reason) =>
            [
              "provider-secret-missing",
              "provider-secret-unavailable",
              "provider-credential-required",
            ].includes(reason),
          )
            ? "no-credentials"
            : "unsupported",
          startedAt: timestamp,
          finishedAt: timestamp,
          totalMs: 0,
          retryCount: 0,
          modelCount: null,
          modelAvailable: null,
        };
      }
      const desired = resolved.desired;
      const credential =
        desired.secret ?? (desired.envKey ? env[desired.envKey] : null) ?? null;
      if (desired.protocol === "platform-native") {
        return {
          platformId: "codex",
          profileId: target.profile.id,
          ...(await testNativeConnection({
            codexHome: path.dirname(requireContext(context)),
            model: desired.model,
          })),
        };
      }
      return {
        platformId: "codex",
        profileId: target.profile.id,
        ...(await testConnection({
          endpoint: desired.endpoint,
          credential,
          model: desired.model,
          protocol: desired.protocol,
        })),
      };
    },
    async testModel(context, target, signal) {
      if (target.profile.platformId !== "codex") {
        throw new Error("AGENT_PROVIDER_PROFILE_PLATFORM_MISMATCH");
      }
      const resolved = await resolveDesired(target, options.secretStore);
      if (!resolved.desired) {
        const timestamp = now();
        return {
          platformId: "codex",
          profileId: target.profile.id,
          protocol: target.profile.protocol,
          endpointOrigin: null,
          model: primaryMapping(target.modelMappings)?.modelId.trim() || null,
          status: resolved.blockedReasons.some((reason) =>
            [
              "provider-secret-missing",
              "provider-secret-unavailable",
              "provider-credential-required",
            ].includes(reason),
          )
            ? "no-credentials"
            : "unsupported",
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
      const desired = resolved.desired;
      const credential =
        desired.secret ?? (desired.envKey ? env[desired.envKey] : null) ?? null;
      if (desired.protocol === "platform-native") {
        return {
          platformId: "codex",
          profileId: target.profile.id,
          ...(await testNativeModel({
            codexHome: path.dirname(requireContext(context)),
            model: desired.model,
            signal,
          })),
        };
      }
      return {
        platformId: "codex",
        profileId: target.profile.id,
        ...(await testModel({
          endpoint: desired.endpoint,
          credential,
          model: desired.model,
          protocol: desired.protocol,
          signal,
        })),
      };
    },
    async inspect(context) {
      return (await readNative(context)).state;
    },
    async importCurrent(context): Promise<AgentProviderImportPreview> {
      const native = await readNative(context);
      const active = activeProviderData(native.data);
      const endpoint = sanitizeEndpoint(getString(active.provider, "base_url"));
      const inlineCredential = getString(
        active.provider,
        "experimental_bearer_token",
      );
      const envKey = getString(active.provider, "env_key");
      const model = getString(native.data, "model");
      const reasoningEffort = getString(native.data, "model_reasoning_effort");
      const contextWindow = getPositiveInteger(
        native.data,
        "model_context_window",
      );
      return {
        state: native.state,
        profile: {
          platformId: "codex",
          name:
            getString(active.provider, "name") ??
            (active.providerId === "openai" ? "OpenAI" : active.providerId),
          providerKind:
            active.providerId === "openai" ? "openai" : "openai-compatible",
          protocol: native.state.values.protocol as string,
          endpoint,
          config: {
            providerId: active.providerId,
            ...(envKey ? { envKey } : {}),
          },
          secretRef: null,
          source: "native-import",
        },
        modelMappings: model
          ? [
              {
                routeKey: "primary",
                modelId: model,
                parameters: {
                  ...(reasoningEffort &&
                  REASONING_EFFORTS.has(reasoningEffort as CodexReasoningEffort)
                    ? { reasoningEffort }
                    : {}),
                  ...(contextWindow ? { contextWindow } : {}),
                },
              },
            ]
          : [],
        warnings: inlineCredential ? ["native-credential-not-imported"] : [],
      };
    },
    async planActivation(input) {
      requireContext(input.context);
      if (input.profile.platformId !== "codex") {
        throw new Error("AGENT_PROVIDER_PROFILE_PLATFORM_MISMATCH");
      }
      const native = await readNative(input.context);
      const resolved = await resolveDesired(input, options.secretStore);
      const desiredValues = resolved.desired
        ? publicDesiredValues(resolved.desired)
        : {};
      return reconcileAgentProviderState({
        profileId: input.profile.id,
        baseline:
          input.baseline?.adapterVersion === ADAPTER_VERSION
            ? input.baseline
            : null,
        current: native.state,
        desired: { platformId: "codex", values: desiredValues },
        supportedKeys: [
          "provider",
          "endpoint",
          "protocol",
          "model",
          "reasoningEffort",
          "contextWindow",
          "credentialStatus",
        ],
        blockedReasons: resolved.blockedReasons,
      });
    },
    async apply(context, plan, target): Promise<AgentProviderApplyReceipt> {
      const targetPath = requireContext(context);
      const native = await readNative(context);
      if (
        plan.platformId !== "codex" ||
        plan.profileId !== target.profile.id ||
        plan.adapterVersion !== ADAPTER_VERSION ||
        plan.currentDigest !== native.state.nativeDigest ||
        plan.status !== "apply" ||
        !plan.canApply
      ) {
        throw new Error("AGENT_CODEX_PROVIDER_PLAN_INVALID");
      }
      const resolved = await resolveDesired(target, options.secretStore);
      if (!resolved.desired) {
        if (resolved.blockedReasons.includes("provider-secret-missing")) {
          throw new Error("AGENT_CODEX_PROVIDER_SECRET_MISSING");
        }
        throw new Error("AGENT_CODEX_PROVIDER_PROFILE_INVALID");
      }
      assertPlanMatchesDesired(plan, resolved.desired);
      const nextText = renderConfig(native.raw, resolved.desired);
      const backupRef = await createEncryptedConfigBackup({
        backupRoot: options.backupRoot,
        agentId: "codex",
        sourcePath: targetPath,
        content: native.raw,
        encryption: options.backupEncryption,
      });
      await options.hooks?.beforeWrite?.(targetPath);
      try {
        await assertConfigUnchanged(targetPath, native.raw);
      } catch {
        throw new Error("AGENT_CODEX_PROVIDER_CONCURRENT_CHANGE");
      }
      try {
        await atomicWrite(targetPath, nextText);
        await options.hooks?.afterWrite?.(targetPath);
        const after = await readNative(context);
        if (
          hasConflictingNativeAuth(after.data) ||
          !verifyDesired(after.state, resolved.desired)
        ) {
          throw new Error("verification");
        }
        return {
          platformId: "codex",
          profileId: plan.profileId,
          adapterVersion: ADAPTER_VERSION,
          nativeDigestBefore: native.state.nativeDigest,
          nativeDigestAfter: after.state.nativeDigest,
          backupRef,
          appliedAt: now(),
        };
      } catch {
        await restoreModelConfig(targetPath, native.raw).catch(() => undefined);
        throw new Error("AGENT_CODEX_PROVIDER_WRITE_FAILED");
      }
    },
    async verify(context, plan, receipt): Promise<AgentProviderVerification> {
      const native = await readNative(context);
      const state = native.state;
      const fieldsMatch = plan.decisions.every(
        (decision) =>
          decision.status !== "apply" ||
          state.values[decision.field] === decision.desired,
      );
      const verified =
        !hasConflictingNativeAuth(native.data) &&
        receipt.platformId === "codex" &&
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
        const targetPath = requireContext(context);
        if (receipt.backupRef) {
          await atomicWrite(
            targetPath,
            await readEncryptedConfigBackup({
              backupRoot: options.backupRoot,
              backupRef: receipt.backupRef,
              encryption: options.backupEncryption,
            }),
          );
        } else {
          await fs.rm(targetPath, { force: true });
        }
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
