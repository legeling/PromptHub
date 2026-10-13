import { createHash } from "node:crypto";
import path from "node:path";
import { getAgentPrimaryModelConfigPath } from "./agent-model-config-paths";

import { parse as parseToml, stringify as stringifyToml } from "smol-toml";

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
import {
  assertConfigUnchanged,
  atomicWrite,
  fileExists,
  readTextConfig,
  restoreModelConfig,
  sanitizeEndpoint,
} from "./agent-model-config";
import {
  createKimiProviderProbeDispatcher,
  type KimiProviderProbeOptions,
} from "./agent-kimi-provider-probe-dispatch";
import type {
  AgentSecretStore,
  AgentSecretStoreEncryption,
} from "./agent-secret-store";

type JsonRecord = Record<string, unknown>;
type KimiProviderType =
  | "kimi"
  | "anthropic"
  | "openai"
  | "openai_responses"
  | "google-genai"
  | "vertexai";
type KimiDirectProviderType = Exclude<KimiProviderType, "vertexai">;
type KimiProtocol =
  | "openai-chat"
  | "openai-responses"
  | "anthropic-messages"
  | "google-generative-ai"
  | "platform-native";
type AuthOwnership =
  | "native-inline"
  | "oauth"
  | "provider-env"
  | "custom-headers"
  | "vertex-adc"
  | "missing";

interface KimiProviderAdapterOptions extends KimiProviderProbeOptions {
  backupRoot: string;
  backupEncryption: AgentSecretStoreEncryption;
  secretStore: Pick<AgentSecretStore, "read">;
  validateNativeConfig?: (targetPath: string) => Promise<void>;
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

interface DesiredKimiProvider {
  providerId: string;
  provider: KimiProviderType;
  protocol: KimiProtocol;
  endpoint: string | null;
  model: string;
  upstreamModel: string;
  maxContextSize: number;
  authOwnership: AuthOwnership;
  credentialStatus: "configured" | "platform-managed";
  secret: string | null;
  native: boolean;
}

interface KimiBackupBundle {
  version: 1;
  config: string | null;
}

const ADAPTER_VERSION = "kimi-provider-profile-v1";
const BUNDLE_FILE_NAME = "provider-config.toml";
const MAX_NAME_LENGTH = 80;
const MAX_MODEL_LENGTH = 512;
const MAX_CONTEXT_SIZE = 10_000_000;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const EXTERNAL_AUTH_OWNERSHIP = new Set<AuthOwnership>([
  "oauth",
  "provider-env",
  "custom-headers",
  "vertex-adc",
]);
const PROVIDER_PROTOCOLS: Record<KimiProviderType, KimiProtocol> = {
  kimi: "openai-chat",
  anthropic: "anthropic-messages",
  openai: "openai-chat",
  openai_responses: "openai-responses",
  "google-genai": "google-generative-ai",
  vertexai: "platform-native",
};
const DEFAULT_ENDPOINTS: Record<KimiDirectProviderType, string> = {
  kimi: "https://api.moonshot.ai/v1",
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com/v1",
  openai_responses: "https://api.openai.com/v1",
  "google-genai": "https://generativelanguage.googleapis.com",
};

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

function hasEntries(value: JsonRecord | undefined): boolean {
  return Boolean(value && Object.keys(value).length > 0);
}

function parseConfig(raw: string): JsonRecord {
  try {
    return parseToml(raw) as JsonRecord;
  } catch {
    throw new Error("AGENT_KIMI_PROVIDER_CONFIG_INVALID");
  }
}

function requireContext(context: AgentProviderAdapterContext): string {
  if (
    context.agentId !== "kimi" ||
    context.platformId !== "kimi" ||
    typeof context.rootPath !== "string" ||
    !context.rootPath.trim() ||
    !path.isAbsolute(context.rootPath) ||
    context.rootPath.includes("\0")
  ) {
    throw new Error("AGENT_KIMI_PROVIDER_CONTEXT_INVALID");
  }
  return path.join(path.resolve(context.rootPath), getAgentPrimaryModelConfigPath("kimi"));
}

function digest(raw: string | null): string {
  return createHash("sha256")
    .update(raw === null ? "\0" : raw)
    .digest("hex");
}

function providerType(value: unknown): KimiProviderType | null {
  const type = getString(value, "type");
  return type && Object.hasOwn(PROVIDER_PROTOCOLS, type)
    ? (type as KimiProviderType)
    : null;
}

function authOwnership(
  type: KimiProviderType | null,
  provider: JsonRecord | undefined,
): AuthOwnership {
  if (type === "vertexai") return "vertex-adc";
  if (hasEntries(getRecord(provider, "oauth"))) return "oauth";
  if (hasEntries(getRecord(provider, "custom_headers"))) {
    return "custom-headers";
  }
  if (hasEntries(getRecord(provider, "env"))) return "provider-env";
  if (getString(provider, "api_key")) return "native-inline";
  return "missing";
}

function activeProjection(data: JsonRecord): {
  providerId: string | null;
  provider: KimiProviderType | null;
  protocol: KimiProtocol | null;
  endpoint: string | null;
  model: string | null;
  upstreamModel: string | null;
  maxContextSize: number | null;
  authOwnership: AuthOwnership;
  credentialStatus: "configured" | "platform-managed" | "missing";
} {
  const model = getString(data, "default_model");
  const modelConfig = model
    ? getRecord(getRecord(data, "models"), model)
    : null;
  const providerId = getString(modelConfig, "provider");
  const providerConfig = providerId
    ? getRecord(getRecord(data, "providers"), providerId)
    : undefined;
  const provider = providerType(providerConfig);
  const ownership = authOwnership(provider, providerConfig);
  return {
    providerId,
    provider,
    protocol: provider
      ? EXTERNAL_AUTH_OWNERSHIP.has(ownership)
        ? "platform-native"
        : PROVIDER_PROTOCOLS[provider]
      : null,
    endpoint: sanitizeEndpoint(getString(providerConfig, "base_url")),
    model,
    upstreamModel: getString(modelConfig, "model"),
    maxContextSize: getPositiveInteger(modelConfig, "max_context_size"),
    authOwnership: ownership,
    credentialStatus:
      ownership === "native-inline"
        ? "configured"
        : EXTERNAL_AUTH_OWNERSHIP.has(ownership)
          ? "platform-managed"
          : "missing",
  };
}

function comparableState(
  raw: string | null,
  data: JsonRecord,
): AgentProviderComparableState {
  const active = activeProjection(data);
  return {
    platformId: "kimi",
    adapterVersion: ADAPTER_VERSION,
    nativeDigest: digest(raw),
    values: {
      providerId: active.providerId,
      provider: active.provider,
      protocol: active.protocol,
      endpoint: active.endpoint,
      model: active.model,
      upstreamModel: active.upstreamModel,
      maxContextSize: active.maxContextSize,
      authOwnership: active.authOwnership,
      credentialStatus: active.credentialStatus,
      sourceRelativePath: getAgentPrimaryModelConfigPath("kimi"),
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
    throw new Error("AGENT_KIMI_PROVIDER_CONFIG_INVALID");
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

function publicDesiredValues(
  desired: DesiredKimiProvider,
): Record<string, AgentProviderComparableValue> {
  return {
    providerId: desired.providerId,
    provider: desired.provider,
    protocol: desired.protocol,
    endpoint: desired.endpoint,
    model: desired.model,
    upstreamModel: desired.upstreamModel,
    maxContextSize: desired.maxContextSize,
    authOwnership: desired.authOwnership,
    credentialStatus: desired.credentialStatus,
  };
}

function hasOnlyKeys(value: JsonRecord, allowed: string[]): boolean {
  return Object.keys(value).every(
    (key) => allowed.includes(key) || key === "adapter",
  );
}

function providerEntry(
  native: NativeConfig,
  providerId: string,
): JsonRecord | undefined {
  return getRecord(getRecord(native.data, "providers"), providerId);
}

function modelEntry(
  native: NativeConfig,
  model: string,
): JsonRecord | undefined {
  return getRecord(getRecord(native.data, "models"), model);
}

async function resolveDesired(
  target: {
    profile: AgentProviderProfile;
    modelMappings: AgentProviderModelMapping[];
  },
  native: NativeConfig,
  secretStore: Pick<AgentSecretStore, "read">,
): Promise<{
  blockedReasons: string[];
  desired: DesiredKimiProvider | null;
}> {
  const blockedReasons: string[] = [];
  const mapping = primaryMapping(target.modelMappings);
  const profile = target.profile;
  const providerId =
    typeof profile.config.providerId === "string"
      ? profile.config.providerId.trim()
      : "";
  const provider = providerType({ type: profile.providerKind });
  const model = mapping?.modelId.trim() ?? "";
  const upstreamModel =
    typeof mapping?.parameters.upstreamModelId === "string"
      ? mapping.parameters.upstreamModelId.trim()
      : "";
  const maxContextSize = mapping?.parameters.maxContextSize;
  const nativeOwnership =
    typeof profile.config.nativeAuthOwnership === "string"
      ? (profile.config.nativeAuthOwnership as AuthOwnership)
      : null;
  const nativeMode =
    profile.protocol === "platform-native" &&
    nativeOwnership !== null &&
    EXTERNAL_AUTH_OWNERSHIP.has(nativeOwnership);

  if (!profile.name.trim() || profile.name.length > MAX_NAME_LENGTH) {
    blockedReasons.push("provider-name-invalid");
  }
  if (!PROVIDER_ID_PATTERN.test(providerId)) {
    blockedReasons.push("provider-id-invalid");
  }
  if (!provider) blockedReasons.push("provider-kind-unsupported");
  if (!validText(model, MAX_MODEL_LENGTH)) {
    blockedReasons.push("primary-model-required");
  }
  if (!validText(upstreamModel, MAX_MODEL_LENGTH)) {
    blockedReasons.push("upstream-model-required");
  }
  if (
    typeof maxContextSize !== "number" ||
    !Number.isSafeInteger(maxContextSize) ||
    maxContextSize < 1 ||
    maxContextSize > MAX_CONTEXT_SIZE
  ) {
    blockedReasons.push("model-context-size-invalid");
  }
  if (
    !mapping ||
    !hasOnlyKeys(mapping.parameters, ["upstreamModelId", "maxContextSize"])
  ) {
    blockedReasons.push("model-parameters-unsupported");
  }
  if (
    !hasOnlyKeys(profile.config, [
      "providerId",
      ...(nativeMode ? ["nativeAuthOwnership"] : []),
    ])
  ) {
    blockedReasons.push("provider-config-unsupported");
  }
  if (
    provider &&
    (nativeMode
      ? provider === "vertexai"
        ? nativeOwnership !== "vertex-adc"
        : nativeOwnership === "vertex-adc"
      : PROVIDER_PROTOCOLS[provider] !== profile.protocol)
  ) {
    blockedReasons.push("provider-protocol-unsupported");
  }

  const normalizedEndpoint = normalizeEndpoint(profile.endpoint);
  if (profile.endpoint && !normalizedEndpoint) {
    blockedReasons.push("provider-endpoint-invalid");
  }
  if (nativeMode && (profile.endpoint || profile.secretRef)) {
    blockedReasons.push("native-provider-read-only");
  }
  if (provider === "vertexai" && !nativeMode) {
    blockedReasons.push("native-provider-read-only");
  }

  const currentProvider = providerEntry(native, providerId);
  const currentOwnership = authOwnership(
    providerType(currentProvider),
    currentProvider,
  );
  if (!nativeMode && EXTERNAL_AUTH_OWNERSHIP.has(currentOwnership)) {
    blockedReasons.push("native-provider-auth-owned");
  }

  let secret: string | null = null;
  if (nativeMode) {
    const currentModel = modelEntry(native, model);
    if (
      !currentProvider ||
      !currentModel ||
      providerType(currentProvider) !== provider ||
      getString(currentModel, "provider") !== providerId ||
      getString(currentModel, "model") !== upstreamModel ||
      getPositiveInteger(currentModel, "max_context_size") !== maxContextSize ||
      currentOwnership !== nativeOwnership
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

  if (
    blockedReasons.length > 0 ||
    !provider ||
    !mapping ||
    typeof maxContextSize !== "number"
  ) {
    return {
      blockedReasons: [...new Set(blockedReasons)],
      desired: null,
    };
  }
  return {
    blockedReasons: [],
    desired: {
      providerId,
      provider,
      protocol: profile.protocol as KimiProtocol,
      endpoint: nativeMode
        ? sanitizeEndpoint(getString(currentProvider, "base_url"))
        : (normalizedEndpoint ??
          DEFAULT_ENDPOINTS[provider as KimiDirectProviderType]),
      model,
      upstreamModel,
      maxContextSize,
      authOwnership: nativeMode ? nativeOwnership! : "native-inline",
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
  desired: DesiredKimiProvider,
): void {
  for (const [field, value] of Object.entries(publicDesiredValues(desired))) {
    const planned = desiredField(plan, field);
    if (planned !== undefined && planned !== value) {
      throw new Error("AGENT_KIMI_PROVIDER_PLAN_INVALID");
    }
  }
}

function renderConfig(
  native: NativeConfig,
  desired: DesiredKimiProvider,
): string {
  const data = { ...native.data };
  if (!desired.native) {
    const providers = { ...(getRecord(data, "providers") ?? {}) };
    providers[desired.providerId] = {
      ...(isRecord(providers[desired.providerId])
        ? (providers[desired.providerId] as JsonRecord)
        : {}),
      type: desired.provider,
      base_url: desired.endpoint,
      api_key: desired.secret,
    };
    data.providers = providers;

    const models = { ...(getRecord(data, "models") ?? {}) };
    models[desired.model] = {
      ...(isRecord(models[desired.model])
        ? (models[desired.model] as JsonRecord)
        : {}),
      provider: desired.providerId,
      model: desired.upstreamModel,
      max_context_size: desired.maxContextSize,
    };
    data.models = models;
  }
  data.default_model = desired.model;
  const rendered = `${stringifyToml(data)}\n`;
  parseConfig(rendered);
  return rendered;
}

function verifyDesired(
  state: AgentProviderComparableState,
  desired: DesiredKimiProvider,
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
    platformId: "kimi",
    profileId: profile.id,
    protocol: profile.protocol,
    endpointOrigin: null,
    model:
      typeof primaryMapping(mappings)?.parameters.upstreamModelId === "string"
        ? (primaryMapping(mappings)!.parameters.upstreamModelId as string)
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
  return {
    platformId: "kimi",
    profileId: profile.id,
    protocol: profile.protocol,
    endpointOrigin: null,
    model:
      typeof primaryMapping(mappings)?.parameters.upstreamModelId === "string"
        ? (primaryMapping(mappings)!.parameters.upstreamModelId as string)
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
  return JSON.stringify({ version: 1, config: native.raw });
}

function parseBackup(raw: string): KimiBackupBundle {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      (parsed.config !== null && typeof parsed.config !== "string")
    ) {
      throw new Error("invalid");
    }
    return parsed as unknown as KimiBackupBundle;
  } catch {
    throw new Error("AGENT_KIMI_PROVIDER_BACKUP_INVALID");
  }
}

async function importPreview(
  native: NativeConfig,
): Promise<AgentProviderImportPreview> {
  const active = activeProjection(native.data);
  if (
    !active.providerId ||
    !active.provider ||
    !active.model ||
    !active.upstreamModel ||
    !active.maxContextSize
  ) {
    throw new Error("AGENT_KIMI_PROVIDER_IMPORT_UNAVAILABLE");
  }
  const external = EXTERNAL_AUTH_OWNERSHIP.has(active.authOwnership);
  return {
    state: native.state,
    profile: {
      platformId: "kimi",
      name: `Kimi ${active.providerId}`,
      providerKind: active.provider,
      protocol: external
        ? "platform-native"
        : PROVIDER_PROTOCOLS[active.provider],
      endpoint: external ? null : active.endpoint,
      config: {
        providerId: active.providerId,
        ...(external ? { nativeAuthOwnership: active.authOwnership } : {}),
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
          maxContextSize: active.maxContextSize,
        },
      },
    ],
    warnings: [
      ...(active.authOwnership === "native-inline"
        ? ["native-credential-not-imported"]
        : []),
      ...(external ? ["native-provider-read-only"] : []),
      ...(active.authOwnership === "missing"
        ? ["native-credential-missing"]
        : []),
      "native-formatting-may-change",
    ],
  };
}

export function createAgentKimiProviderAdapter(
  options: KimiProviderAdapterOptions,
): AgentProviderAdapter {
  const now = options.now ?? Date.now;
  const probes = createKimiProviderProbeDispatcher(options);

  return {
    platformId: "kimi",
    version: ADAPTER_VERSION,
    async testConnection(context, target) {
      if (target.profile.platformId !== "kimi") {
        throw new Error("AGENT_PROVIDER_PROFILE_PLATFORM_MISMATCH");
      }
      const resolved = await resolveDesired(
        target,
        await readNative(context),
        options.secretStore,
      );
      if (
        !resolved.desired ||
        resolved.desired.protocol === "platform-native"
      ) {
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
        protocol: resolved.desired.protocol,
        endpoint: resolved.desired.endpoint,
        credential: resolved.desired.secret,
        model: resolved.desired.upstreamModel,
      });
    },
    async testModel(context, target, signal) {
      if (target.profile.platformId !== "kimi") {
        throw new Error("AGENT_PROVIDER_PROFILE_PLATFORM_MISMATCH");
      }
      const resolved = await resolveDesired(
        target,
        await readNative(context),
        options.secretStore,
      );
      if (
        !resolved.desired ||
        resolved.desired.protocol === "platform-native"
      ) {
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
          protocol: resolved.desired.protocol,
          endpoint: resolved.desired.endpoint,
          credential: resolved.desired.secret,
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
      if (input.profile.platformId !== "kimi") {
        return reconcileAgentProviderState({
          profileId: input.profile.id,
          baseline: null,
          current: native.state,
          desired: { platformId: "kimi", values: {} },
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
          platformId: "kimi",
          values: resolved.desired ? publicDesiredValues(resolved.desired) : {},
        },
        supportedKeys: [
          "providerId",
          "provider",
          "protocol",
          "endpoint",
          "model",
          "upstreamModel",
          "maxContextSize",
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
        plan.platformId !== "kimi" ||
        plan.profileId !== target.profile.id ||
        plan.adapterVersion !== ADAPTER_VERSION ||
        plan.currentDigest !== native.state.nativeDigest ||
        plan.status !== "apply" ||
        !plan.canApply
      ) {
        throw new Error("AGENT_KIMI_PROVIDER_PLAN_INVALID");
      }
      const resolved = await resolveDesired(
        target,
        native,
        options.secretStore,
      );
      if (!resolved.desired) {
        throw new Error("AGENT_KIMI_PROVIDER_PROFILE_INVALID");
      }
      assertPlanMatchesDesired(plan, resolved.desired);
      const next = renderConfig(native, resolved.desired);
      const backupRef = await createEncryptedConfigBackup({
        backupRoot: options.backupRoot,
        agentId: "kimi",
        sourcePath: path.join(path.dirname(configPath), BUNDLE_FILE_NAME),
        content: backupContent(native),
        encryption: options.backupEncryption,
      });
      await options.hooks?.beforeWrite?.();
      try {
        await assertConfigUnchanged(configPath, native.raw);
      } catch {
        throw new Error("AGENT_KIMI_PROVIDER_CONCURRENT_CHANGE");
      }
      try {
        await atomicWrite(configPath, next);
        await options.validateNativeConfig?.(configPath);
        await options.hooks?.afterWrite?.();
        const after = await readNative(context);
        if (!verifyDesired(after.state, resolved.desired)) {
          throw new Error("verification");
        }
        return {
          platformId: "kimi",
          profileId: plan.profileId,
          adapterVersion: ADAPTER_VERSION,
          nativeDigestBefore: native.state.nativeDigest,
          nativeDigestAfter: after.state.nativeDigest,
          backupRef,
          appliedAt: now(),
        };
      } catch {
        await restoreModelConfig(configPath, native.raw).catch(() => undefined);
        throw new Error("AGENT_KIMI_PROVIDER_WRITE_FAILED");
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
        receipt.platformId === "kimi" &&
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
        if (!receipt.backupRef) {
          throw new Error("AGENT_KIMI_PROVIDER_BACKUP_INVALID");
        }
        const bundle = parseBackup(
          await readEncryptedConfigBackup({
            backupRoot: options.backupRoot,
            backupRef: receipt.backupRef,
            encryption: options.backupEncryption,
          }),
        );
        await restoreModelConfig(configPath, bundle.config);
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
