import { createHash } from "node:crypto";
import path from "node:path";
import { getAgentPrimaryModelConfigPath } from "./agent-model-config-paths";

import { parse as parseToml, stringify as stringifyToml } from "smol-toml";

import {
  reconcileAgentProviderState,
  type AgentProviderAdapter,
} from "@prompthub/core";
import type {
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
import type { AgentSecretStoreEncryption } from "./agent-secret-store";

type JsonRecord = Record<string, unknown>;
type GrokBackend = "chat_completions" | "responses" | "messages";
type GrokProtocol = DirectProviderProtocol | "platform-native";
type AuthOwnership =
  | "environment"
  | "platform-session"
  | "native-inline"
  | "sensitive-headers";

interface AgentGrokProviderAdapterOptions extends ProviderProbeOptions {
  backupRoot: string;
  backupEncryption: AgentSecretStoreEncryption;
  environment?: Record<string, string | undefined>;
  now?: () => number;
  hooks?: {
    beforeWrite?: () => Promise<void>;
    afterWrite?: () => Promise<void>;
  };
}

interface NativeConfig {
  raw: string | null;
  data: JsonRecord;
  state: AgentProviderComparableState;
}

interface ActiveProjection {
  providerId: string | null;
  provider: string;
  protocol: GrokProtocol;
  endpoint: string | null;
  model: string | null;
  upstreamModel: string | null;
  contextWindow: number | null;
  envKey: string | null;
  authOwnership: AuthOwnership;
  credentialStatus: "configured" | "platform-managed" | "missing";
}

interface DesiredGrokProvider {
  providerId: string;
  provider: string;
  protocol: GrokProtocol;
  endpoint: string | null;
  model: string;
  upstreamModel: string;
  contextWindow: number | null;
  envKey: string | null;
  authOwnership: AuthOwnership;
  credentialStatus: "configured" | "platform-managed" | "missing";
  native: boolean;
}

const ADAPTER_VERSION = "grok-provider-profile-v1";
const MAX_NAME_LENGTH = 80;
const MAX_MODEL_LENGTH = 512;
const MAX_CONTEXT_WINDOW = 10_000_000;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const BACKEND_PROTOCOLS: Record<GrokBackend, DirectProviderProtocol> = {
  chat_completions: "openai-chat",
  responses: "openai-responses",
  messages: "anthropic-messages",
};
const PROTOCOL_BACKENDS: Record<DirectProviderProtocol, GrokBackend> = {
  "openai-chat": "chat_completions",
  "openai-responses": "responses",
  "anthropic-messages": "messages",
  "google-generative-ai": "chat_completions",
};
const PROTOCOL_PROVIDERS: Record<DirectProviderProtocol, string> = {
  "openai-chat": "openai-compatible",
  "openai-responses": "openai-responses",
  "anthropic-messages": "anthropic",
  "google-generative-ai": "openai-compatible",
};

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
  if (
    !isRecord(value) ||
    typeof value[key] !== "number" ||
    !Number.isSafeInteger(value[key]) ||
    (value[key] as number) < 1
  ) {
    return null;
  }
  return value[key] as number;
}

function parseConfig(raw: string): JsonRecord {
  try {
    return parseToml(raw) as JsonRecord;
  } catch {
    throw new Error("AGENT_GROK_PROVIDER_CONFIG_INVALID");
  }
}

function requireContext(context: AgentProviderAdapterContext): string {
  if (
    context.agentId !== "grok" ||
    context.platformId !== "grok" ||
    typeof context.rootPath !== "string" ||
    !context.rootPath.trim() ||
    !path.isAbsolute(context.rootPath) ||
    context.rootPath.includes("\0")
  ) {
    throw new Error("AGENT_GROK_PROVIDER_CONTEXT_INVALID");
  }
  return path.join(path.resolve(context.rootPath), getAgentPrimaryModelConfigPath("grok"));
}

function digest(raw: string | null): string {
  return createHash("sha256")
    .update(raw === null ? "\0" : raw)
    .digest("hex");
}

function backend(value: unknown): GrokBackend | null {
  const candidate = getString(value, "api_backend");
  return candidate && Object.hasOwn(BACKEND_PROTOCOLS, candidate)
    ? (candidate as GrokBackend)
    : null;
}

function hasSensitiveHeaders(model: JsonRecord | undefined): boolean {
  return Boolean(
    getRecord(model, "extra_headers") ||
    getRecord(model, "headers") ||
    getString(model, "authorization"),
  );
}

function authOwnership(model: JsonRecord | undefined): AuthOwnership {
  if (!model) return "platform-session";
  if (getString(model, "api_key")) return "native-inline";
  if (hasSensitiveHeaders(model)) return "sensitive-headers";
  if (getString(model, "env_key")) return "environment";
  return "platform-session";
}

function activeProjection(data: JsonRecord): ActiveProjection {
  const alias = getString(getRecord(data, "models"), "default");
  const modelEntry = alias ? getRecord(getRecord(data, "model"), alias) : null;
  const ownership = authOwnership(modelEntry);
  const selectedBackend = backend(modelEntry);
  const directProtocol = selectedBackend
    ? BACKEND_PROTOCOLS[selectedBackend]
    : "openai-chat";
  const readOnly =
    ownership === "native-inline" ||
    ownership === "sensitive-headers" ||
    !modelEntry;
  return {
    providerId: alias,
    provider: readOnly ? "grok" : PROTOCOL_PROVIDERS[directProtocol],
    protocol: readOnly ? "platform-native" : directProtocol,
    endpoint: sanitizeEndpoint(getString(modelEntry, "base_url")),
    model: alias,
    upstreamModel: getString(modelEntry, "model") ?? alias,
    contextWindow: getPositiveInteger(modelEntry, "context_window"),
    envKey: getString(modelEntry, "env_key"),
    authOwnership: ownership,
    credentialStatus:
      ownership === "environment" ? "configured" : "platform-managed",
  };
}

function comparableState(
  raw: string | null,
  data: JsonRecord,
): AgentProviderComparableState {
  const active = activeProjection(data);
  return {
    platformId: "grok",
    adapterVersion: ADAPTER_VERSION,
    nativeDigest: digest(raw),
    values: {
      providerId: active.providerId,
      provider: active.provider,
      protocol: active.protocol,
      endpoint: active.endpoint,
      model: active.model,
      upstreamModel: active.upstreamModel,
      contextWindow: active.contextWindow,
      envKey: active.envKey,
      authOwnership: active.authOwnership,
      credentialStatus: active.credentialStatus,
      sourceRelativePath: getAgentPrimaryModelConfigPath("grok"),
    },
  };
}

async function readNative(
  context: AgentProviderAdapterContext,
): Promise<NativeConfig> {
  const configPath = requireContext(context);
  try {
    const raw = (await fileExists(configPath))
      ? await readTextConfig(configPath)
      : null;
    const data = raw === null ? {} : parseConfig(raw);
    return { raw, data, state: comparableState(raw, data) };
  } catch {
    throw new Error("AGENT_GROK_PROVIDER_CONFIG_INVALID");
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
  return primary.length === 1 && mappings.length === 1 ? primary[0] : null;
}

function validText(value: string, maxLength: number): boolean {
  return (
    Boolean(value) &&
    value.length <= maxLength &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function hasOnlyKeys(value: JsonRecord, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function publicDesiredValues(
  desired: DesiredGrokProvider,
): Record<string, AgentProviderComparableValue> {
  return {
    providerId: desired.providerId,
    provider: desired.provider,
    protocol: desired.protocol,
    endpoint: desired.endpoint,
    model: desired.model,
    upstreamModel: desired.upstreamModel,
    contextWindow: desired.contextWindow,
    envKey: desired.envKey,
    authOwnership: desired.authOwnership,
    credentialStatus: desired.credentialStatus,
  };
}

function modelEntry(
  native: NativeConfig,
  providerId: string,
): JsonRecord | undefined {
  return getRecord(getRecord(native.data, "model"), providerId);
}

function protocolSupported(value: string): value is DirectProviderProtocol {
  return (
    value === "openai-chat" ||
    value === "openai-responses" ||
    value === "anthropic-messages"
  );
}

function resolveDesired(
  target: {
    profile: AgentProviderProfile;
    modelMappings: AgentProviderModelMapping[];
  },
  native: NativeConfig,
  environment: Record<string, string | undefined>,
): {
  blockedReasons: string[];
  desired: DesiredGrokProvider | null;
  credential: string | null;
} {
  const blockedReasons: string[] = [];
  const profile = target.profile;
  const mapping = primaryMapping(target.modelMappings);
  const providerId =
    typeof profile.config.providerId === "string"
      ? profile.config.providerId.trim()
      : "";
  const envKey =
    typeof profile.config.envKey === "string"
      ? profile.config.envKey.trim()
      : "";
  const nativeOwnership =
    typeof profile.config.nativeAuthOwnership === "string"
      ? (profile.config.nativeAuthOwnership as AuthOwnership)
      : null;
  const nativeMode =
    profile.protocol === "platform-native" && nativeOwnership !== null;
  const model = mapping?.modelId.trim() ?? "";
  const upstreamModel =
    typeof mapping?.parameters.upstreamModelId === "string"
      ? mapping.parameters.upstreamModelId.trim()
      : "";
  const contextWindow = mapping?.parameters.contextWindow;

  if (!profile.name.trim() || profile.name.length > MAX_NAME_LENGTH) {
    blockedReasons.push("provider-name-invalid");
  }
  if (!PROVIDER_ID_PATTERN.test(providerId)) {
    blockedReasons.push("provider-id-invalid");
  }
  if (!validText(model, MAX_MODEL_LENGTH)) {
    blockedReasons.push("primary-model-required");
  }
  if (!validText(upstreamModel, MAX_MODEL_LENGTH)) {
    blockedReasons.push("upstream-model-required");
  }
  if (
    contextWindow !== undefined &&
    (typeof contextWindow !== "number" ||
      !Number.isSafeInteger(contextWindow) ||
      contextWindow < 1 ||
      contextWindow > MAX_CONTEXT_WINDOW)
  ) {
    blockedReasons.push("model-context-size-invalid");
  }
  if (
    !mapping ||
    !hasOnlyKeys(mapping.parameters, ["upstreamModelId", "contextWindow"])
  ) {
    blockedReasons.push("model-parameters-unsupported");
  }
  if (
    !hasOnlyKeys(profile.config, [
      "providerId",
      ...(nativeMode ? ["nativeAuthOwnership"] : ["envKey"]),
    ])
  ) {
    blockedReasons.push("provider-config-unsupported");
  }
  if (profile.secretRef) blockedReasons.push("provider-secret-unsupported");

  const currentOwnership = authOwnership(modelEntry(native, providerId));
  if (
    !nativeMode &&
    (currentOwnership === "native-inline" ||
      currentOwnership === "sensitive-headers")
  ) {
    blockedReasons.push("native-provider-auth-owned");
  }

  let endpoint: string | null = null;
  let credential: string | null = null;
  if (nativeMode) {
    if (
      nativeOwnership === "native-inline" ||
      nativeOwnership === "sensitive-headers"
    ) {
      blockedReasons.push("native-provider-read-only");
    }
    if (
      nativeOwnership !== "platform-session" ||
      modelEntry(native, providerId)
    ) {
      blockedReasons.push("native-provider-state-mismatch");
    }
  } else {
    if (!protocolSupported(profile.protocol)) {
      blockedReasons.push("provider-protocol-unsupported");
    }
    endpoint = normalizeEndpoint(profile.endpoint);
    if (!profile.endpoint || !endpoint) {
      blockedReasons.push("provider-endpoint-invalid");
    }
    if (!ENV_KEY_PATTERN.test(envKey)) {
      blockedReasons.push("provider-env-key-invalid");
    }
    credential = ENV_KEY_PATTERN.test(envKey)
      ? environment[envKey]?.trim() || null
      : null;
  }

  if (!mapping || blockedReasons.length > 0) {
    return {
      blockedReasons: [...new Set(blockedReasons)],
      desired: null,
      credential,
    };
  }

  const protocol = nativeMode
    ? "platform-native"
    : (profile.protocol as DirectProviderProtocol);
  return {
    blockedReasons: [],
    credential,
    desired: {
      providerId,
      provider: nativeMode
        ? "grok"
        : PROTOCOL_PROVIDERS[protocol as DirectProviderProtocol],
      protocol,
      endpoint,
      model,
      upstreamModel,
      contextWindow: typeof contextWindow === "number" ? contextWindow : null,
      envKey: nativeMode ? null : envKey,
      authOwnership: nativeMode ? "platform-session" : "environment",
      credentialStatus: nativeMode
        ? "platform-managed"
        : credential
          ? "configured"
          : "missing",
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
  desired: DesiredGrokProvider,
): void {
  for (const [field, value] of Object.entries(publicDesiredValues(desired))) {
    const planned = desiredField(plan, field);
    if (planned !== undefined && planned !== value) {
      throw new Error("AGENT_GROK_PROVIDER_PLAN_INVALID");
    }
  }
}

function renderConfig(
  native: NativeConfig,
  desired: DesiredGrokProvider,
  profileName: string,
): string {
  const data = { ...native.data };
  const models = { ...(getRecord(data, "models") ?? {}) };
  models.default = desired.model;
  data.models = models;

  if (!desired.native) {
    const model = { ...(getRecord(data, "model") ?? {}) };
    const entry = {
      ...(isRecord(model[desired.providerId])
        ? (model[desired.providerId] as JsonRecord)
        : {}),
    };
    delete entry.api_key;
    delete entry.extra_headers;
    delete entry.headers;
    delete entry.authorization;
    entry.model = desired.upstreamModel;
    entry.base_url = desired.endpoint;
    entry.name = profileName;
    entry.env_key = desired.envKey;
    entry.api_backend =
      PROTOCOL_BACKENDS[desired.protocol as DirectProviderProtocol];
    if (desired.contextWindow) {
      entry.context_window = desired.contextWindow;
    } else {
      delete entry.context_window;
    }
    model[desired.providerId] = entry;
    data.model = model;
  }

  const rendered = `${stringifyToml(data)}\n`;
  parseConfig(rendered);
  return rendered;
}

function verifyDesired(
  state: AgentProviderComparableState,
  desired: DesiredGrokProvider,
): boolean {
  return Object.entries(publicDesiredValues(desired)).every(
    ([field, value]) => state.values[field] === value,
  );
}

function importPreview(native: NativeConfig): AgentProviderImportPreview {
  const active = activeProjection(native.data);
  if (!active.model || !active.upstreamModel || !active.providerId) {
    throw new Error("AGENT_GROK_PROVIDER_IMPORT_UNAVAILABLE");
  }
  const external =
    active.authOwnership === "native-inline" ||
    active.authOwnership === "sensitive-headers";
  const nativeMode = external || active.authOwnership === "platform-session";
  return {
    state: native.state,
    profile: {
      platformId: "grok",
      name:
        getString(modelEntry(native, active.providerId), "name") ||
        active.providerId,
      providerKind: nativeMode ? "grok" : active.provider,
      protocol: nativeMode ? "platform-native" : active.protocol,
      endpoint: active.endpoint,
      config: {
        providerId: active.providerId,
        ...(nativeMode
          ? { nativeAuthOwnership: active.authOwnership }
          : { envKey: active.envKey }),
      },
      secretRef: null,
      source: "native-import",
    },
    modelMappings: [
      {
        routeKey: "primary",
        modelId: active.model,
        parameters: {
          upstreamModelId: active.upstreamModel,
          ...(active.contextWindow
            ? { contextWindow: active.contextWindow }
            : {}),
        },
      },
    ],
    warnings: [
      ...(external ? ["native-provider-read-only"] : []),
      "native-formatting-may-change",
    ],
  };
}

function emptyConnectionResult(
  profile: AgentProviderProfile,
  mappings: AgentProviderModelMapping[],
  status: "no-credentials" | "unsupported",
  now: () => number,
): AgentProviderConnectionTestResult {
  const timestamp = now();
  const mapping = primaryMapping(mappings);
  return {
    platformId: "grok",
    profileId: profile.id,
    protocol: profile.protocol,
    endpointOrigin: null,
    model:
      typeof mapping?.parameters.upstreamModelId === "string"
        ? mapping.parameters.upstreamModelId
        : null,
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
  const mapping = primaryMapping(mappings);
  return {
    platformId: "grok",
    profileId: profile.id,
    protocol: profile.protocol,
    endpointOrigin: null,
    model:
      typeof mapping?.parameters.upstreamModelId === "string"
        ? mapping.parameters.upstreamModelId
        : null,
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

export function createAgentGrokProviderAdapter(
  options: AgentGrokProviderAdapterOptions,
): AgentProviderAdapter {
  const now = options.now ?? Date.now;
  const environment = options.environment ?? process.env;
  const probes = createProviderProbeDispatcher("grok", options);

  return {
    platformId: "grok",
    version: ADAPTER_VERSION,
    async testConnection(context, target) {
      if (target.profile.platformId !== "grok") {
        throw new Error("AGENT_PROVIDER_PROFILE_PLATFORM_MISMATCH");
      }
      const resolved = resolveDesired(
        target,
        await readNative(context),
        environment,
      );
      if (!resolved.desired || resolved.desired.native) {
        return emptyConnectionResult(
          target.profile,
          target.modelMappings,
          resolved.desired ? "unsupported" : "no-credentials",
          now,
        );
      }
      if (!resolved.credential) {
        return emptyConnectionResult(
          target.profile,
          target.modelMappings,
          "no-credentials",
          now,
        );
      }
      return probes.testConnection({
        profileId: target.profile.id,
        protocol: resolved.desired.protocol as DirectProviderProtocol,
        endpoint: resolved.desired.endpoint,
        credential: resolved.credential,
        model: resolved.desired.upstreamModel,
      });
    },
    async testModel(context, target, signal) {
      if (target.profile.platformId !== "grok") {
        throw new Error("AGENT_PROVIDER_PROFILE_PLATFORM_MISMATCH");
      }
      const resolved = resolveDesired(
        target,
        await readNative(context),
        environment,
      );
      if (!resolved.desired || resolved.desired.native) {
        return emptyModelResult(
          target.profile,
          target.modelMappings,
          resolved.desired ? "unsupported" : "no-credentials",
          now,
        );
      }
      if (!resolved.credential) {
        return emptyModelResult(
          target.profile,
          target.modelMappings,
          "no-credentials",
          now,
        );
      }
      return probes.testModel(
        {
          profileId: target.profile.id,
          protocol: resolved.desired.protocol as DirectProviderProtocol,
          endpoint: resolved.desired.endpoint,
          credential: resolved.credential,
          model: resolved.desired.upstreamModel,
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
      if (input.profile.platformId !== "grok") {
        return reconcileAgentProviderState({
          profileId: input.profile.id,
          baseline: null,
          current: native.state,
          desired: { platformId: "grok", values: {} },
          supportedKeys: [],
          blockedReasons: ["provider-platform-mismatch"],
        });
      }
      const resolved = resolveDesired(input, native, environment);
      return reconcileAgentProviderState({
        profileId: input.profile.id,
        baseline:
          input.baseline?.adapterVersion === ADAPTER_VERSION
            ? input.baseline
            : null,
        current: native.state,
        desired: {
          platformId: "grok",
          values: resolved.desired ? publicDesiredValues(resolved.desired) : {},
        },
        supportedKeys: [
          "providerId",
          "provider",
          "protocol",
          "endpoint",
          "model",
          "upstreamModel",
          "contextWindow",
          "envKey",
          "authOwnership",
          "credentialStatus",
        ],
        blockedReasons: resolved.blockedReasons,
      });
    },
    async apply(context, plan, target): Promise<AgentProviderApplyReceipt> {
      const configPath = requireContext(context);
      const native = await readNative(context);
      if (
        plan.platformId !== "grok" ||
        plan.profileId !== target.profile.id ||
        plan.adapterVersion !== ADAPTER_VERSION ||
        plan.currentDigest !== native.state.nativeDigest ||
        plan.status !== "apply" ||
        !plan.canApply
      ) {
        throw new Error("AGENT_GROK_PROVIDER_PLAN_INVALID");
      }
      const resolved = resolveDesired(target, native, environment);
      if (!resolved.desired) {
        throw new Error("AGENT_GROK_PROVIDER_PROFILE_INVALID");
      }
      assertPlanMatchesDesired(plan, resolved.desired);
      const next = renderConfig(
        native,
        resolved.desired,
        target.profile.name.trim(),
      );
      const backupRef = await createEncryptedConfigBackup({
        backupRoot: options.backupRoot,
        agentId: "grok",
        sourcePath: configPath,
        content: native.raw,
        encryption: options.backupEncryption,
      });
      await options.hooks?.beforeWrite?.();
      try {
        await assertConfigUnchanged(configPath, native.raw);
      } catch {
        throw new Error("AGENT_GROK_PROVIDER_CONCURRENT_CHANGE");
      }
      try {
        await atomicWrite(configPath, next);
        await options.hooks?.afterWrite?.();
        const after = await readNative(context);
        if (!verifyDesired(after.state, resolved.desired)) {
          throw new Error("verification");
        }
        return {
          platformId: "grok",
          profileId: plan.profileId,
          adapterVersion: ADAPTER_VERSION,
          nativeDigestBefore: native.state.nativeDigest,
          nativeDigestAfter: after.state.nativeDigest,
          backupRef,
          appliedAt: now(),
        };
      } catch {
        await restoreModelConfig(configPath, native.raw).catch(() => undefined);
        throw new Error("AGENT_GROK_PROVIDER_WRITE_FAILED");
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
        receipt.platformId === "grok" &&
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
        const configPath = requireContext(context);
        const original = receipt.backupRef
          ? await readEncryptedConfigBackup({
              backupRoot: options.backupRoot,
              backupRef: receipt.backupRef,
              encryption: options.backupEncryption,
            })
          : null;
        await restoreModelConfig(configPath, original);
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
