import { createHash } from "node:crypto";
import fs from "node:fs/promises";
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
  testAnthropicProviderConnection,
  testAnthropicProviderModel,
  type AnthropicProviderConnectionInput,
  type AnthropicProviderModelTestInput,
} from "./agent-anthropic-provider-probe";
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
import type {
  AgentSecretStore,
  AgentSecretStoreEncryption,
} from "./agent-secret-store";

type JsonRecord = Record<string, unknown>;
type CredentialEnvKey = "ANTHROPIC_API_KEY" | "ANTHROPIC_AUTH_TOKEN";
type CredentialKind = "api-key" | "auth-token" | "none";
type ClaudeModelRoute = "primary" | "sonnet" | "opus" | "haiku" | "subagent";

interface ClaudeProviderAdapterOptions {
  backupRoot: string;
  backupEncryption: AgentSecretStoreEncryption;
  secretStore: Pick<AgentSecretStore, "read">;
  testConnection?: (
    input: AnthropicProviderConnectionInput,
  ) => Promise<
    Omit<AgentProviderConnectionTestResult, "platformId" | "profileId">
  >;
  testModel?: (
    input: AnthropicProviderModelTestInput,
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

interface DesiredClaudeProvider {
  provider: "anthropic" | "custom-gateway";
  endpoint: string | null;
  protocol: "anthropic-messages" | "platform-native";
  model: string;
  sonnetModel: string | null;
  opusModel: string | null;
  haikuModel: string | null;
  subagentModel: string | null;
  credentialEnvKey: CredentialEnvKey | null;
  credentialKind: CredentialKind;
  secret: string | null;
  credentialStatus: "configured" | "platform-managed";
}

const ADAPTER_VERSION = "claude-provider-profile-v2";
const DEFAULT_ENDPOINT = "https://api.anthropic.com";
const MAX_NAME_LENGTH = 80;
const MAX_MODEL_LENGTH = 512;
const CREDENTIAL_ENV_KEYS = new Set<CredentialEnvKey>([
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
]);
const DIRECT_PROVIDER_ENV_KEYS = [
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
] as const;
const MODEL_ROUTE_ENV_KEYS = {
  sonnet: "ANTHROPIC_DEFAULT_SONNET_MODEL",
  opus: "ANTHROPIC_DEFAULT_OPUS_MODEL",
  haiku: "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  subagent: "CLAUDE_CODE_SUBAGENT_MODEL",
} as const;
const MODEL_ROUTE_KEYS = new Set<ClaudeModelRoute>([
  "primary",
  "sonnet",
  "opus",
  "haiku",
  "subagent",
]);
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

function parseConfig(raw: string): JsonRecord {
  const errors: ParseError[] = [];
  const parsed = parseJsonc(raw, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length > 0 || !isRecord(parsed)) {
    throw new Error("AGENT_CLAUDE_PROVIDER_CONFIG_INVALID");
  }
  return parsed;
}

function requireContext(context: AgentProviderAdapterContext): string {
  if (
    context.agentId !== "claude" ||
    context.platformId !== "claude" ||
    typeof context.rootPath !== "string" ||
    !context.rootPath.trim() ||
    !path.isAbsolute(context.rootPath) ||
    context.rootPath.includes("\0")
  ) {
    throw new Error("AGENT_CLAUDE_PROVIDER_CONTEXT_INVALID");
  }
  const root = path.resolve(context.rootPath);
  return path.resolve(root, getAgentPrimaryModelConfigPath("claude"));
}

function digest(raw: string | null): string {
  return createHash("sha256")
    .update(raw ?? "")
    .digest("hex");
}

function nativeProvider(env: JsonRecord | undefined): string {
  if (getString(env, "CLAUDE_CODE_USE_BEDROCK")) return "amazon-bedrock";
  if (getString(env, "CLAUDE_CODE_USE_VERTEX")) return "google-vertex";
  if (getString(env, "CLAUDE_CODE_USE_FOUNDRY")) return "microsoft-foundry";
  return getString(env, "ANTHROPIC_BASE_URL") ? "custom-gateway" : "anthropic";
}

function nativeCredential(env: JsonRecord | undefined): {
  kind: CredentialKind;
  status: "configured" | "platform-managed";
  envKey: CredentialEnvKey | null;
} {
  if (getString(env, "ANTHROPIC_API_KEY")) {
    return {
      kind: "api-key",
      status: "configured",
      envKey: "ANTHROPIC_API_KEY",
    };
  }
  if (getString(env, "ANTHROPIC_AUTH_TOKEN")) {
    return {
      kind: "auth-token",
      status: "configured",
      envKey: "ANTHROPIC_AUTH_TOKEN",
    };
  }
  return { kind: "none", status: "platform-managed", envKey: null };
}

function comparableState(
  raw: string | null,
  data: JsonRecord,
): AgentProviderComparableState {
  const env = getRecord(data, "env");
  const credential = nativeCredential(env);
  const provider = nativeProvider(env);
  const endpoint = sanitizeEndpoint(getString(env, "ANTHROPIC_BASE_URL"));
  return {
    platformId: "claude",
    adapterVersion: ADAPTER_VERSION,
    nativeDigest: digest(raw),
    values: {
      provider,
      endpoint,
      protocol:
        credential.kind === "none" ||
        !["anthropic", "custom-gateway"].includes(provider)
          ? "platform-native"
          : "anthropic-messages",
      model: getString(data, "model"),
      sonnetModel: getString(env, MODEL_ROUTE_ENV_KEYS.sonnet),
      opusModel: getString(env, MODEL_ROUTE_ENV_KEYS.opus),
      haikuModel: getString(env, MODEL_ROUTE_ENV_KEYS.haiku),
      subagentModel: getString(env, MODEL_ROUTE_ENV_KEYS.subagent),
      credentialKind: credential.kind,
      credentialStatus: credential.status,
      sourceRelativePath: getAgentPrimaryModelConfigPath("claude"),
    },
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
    throw new Error("AGENT_CLAUDE_PROVIDER_CONFIG_INVALID");
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

function validModelId(value: string): boolean {
  return (
    Boolean(value) &&
    value.length <= MAX_MODEL_LENGTH &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function parseModelMappings(
  mappings: AgentProviderModelMapping[],
): Record<ClaudeModelRoute, AgentProviderModelMapping | null> | null {
  if (mappings.length > MODEL_ROUTE_KEYS.size) return null;
  const parsed: Record<ClaudeModelRoute, AgentProviderModelMapping | null> = {
    primary: null,
    sonnet: null,
    opus: null,
    haiku: null,
    subagent: null,
  };
  for (const mapping of mappings) {
    if (
      !MODEL_ROUTE_KEYS.has(mapping.routeKey as ClaudeModelRoute) ||
      Object.keys(mapping.parameters).length > 0
    ) {
      return null;
    }
    const route = mapping.routeKey as ClaudeModelRoute;
    const modelId = mapping.modelId.trim();
    if (parsed[route] || !validModelId(modelId)) return null;
    parsed[route] = { ...mapping, modelId };
  }
  return parsed.primary ? parsed : null;
}

function primaryMapping(
  mappings: AgentProviderModelMapping[],
): AgentProviderModelMapping | null {
  return parseModelMappings(mappings)?.primary ?? null;
}

function credentialEnvKey(
  profile: AgentProviderProfile,
): CredentialEnvKey | null {
  const value = profile.config.credentialEnvKey;
  return typeof value === "string" &&
    CREDENTIAL_ENV_KEYS.has(value as CredentialEnvKey)
    ? (value as CredentialEnvKey)
    : null;
}

function publicDesiredValues(
  desired: DesiredClaudeProvider,
): Record<string, AgentProviderComparableValue> {
  return {
    provider: desired.provider,
    endpoint: desired.endpoint,
    protocol: desired.protocol,
    model: desired.model,
    sonnetModel: desired.sonnetModel,
    opusModel: desired.opusModel,
    haikuModel: desired.haikuModel,
    subagentModel: desired.subagentModel,
    credentialKind: desired.credentialKind,
    credentialStatus: desired.credentialStatus,
  };
}

async function resolveDesired(
  input: Pick<AgentProviderActivationInput, "profile" | "modelMappings">,
  secretStore: Pick<AgentSecretStore, "read">,
): Promise<{
  blockedReasons: string[];
  desired: DesiredClaudeProvider | null;
}> {
  const blockedReasons: string[] = [];
  const profile = input.profile;
  const models = parseModelMappings(input.modelMappings);
  const model = models?.primary?.modelId ?? "";
  const endpoint = normalizeEndpoint(profile.endpoint);
  const native =
    profile.providerKind === "anthropic" &&
    profile.protocol === "platform-native" &&
    !profile.endpoint &&
    !profile.secretRef;
  const messages =
    ["anthropic", "anthropic-compatible", "custom-gateway"].includes(
      profile.providerKind,
    ) && profile.protocol === "anthropic-messages";
  const envKey = credentialEnvKey(profile);

  if (!profile.name.trim() || profile.name.length > MAX_NAME_LENGTH) {
    blockedReasons.push("provider-name-invalid");
  }
  if (!models || !validModelId(model)) {
    blockedReasons.push("primary-model-required");
  }
  if (!native && !messages) {
    blockedReasons.push("provider-protocol-unsupported");
  }
  if (profile.endpoint && !endpoint) {
    blockedReasons.push("provider-endpoint-invalid");
  }
  if (messages && profile.providerKind !== "anthropic" && !profile.endpoint) {
    blockedReasons.push("provider-endpoint-required");
  }
  if (messages && !envKey) {
    blockedReasons.push("provider-credential-kind-invalid");
  }
  if (
    Object.keys(profile.config).some(
      (key) => key !== "credentialEnvKey" && key !== "adapter",
    )
  ) {
    blockedReasons.push("provider-config-unsupported");
  }

  let secret: string | null = null;
  if (messages && profile.secretRef) {
    try {
      secret = await secretStore.read(profile.secretRef);
    } catch {
      blockedReasons.push("provider-secret-unavailable");
    }
    if (!secret) blockedReasons.push("provider-secret-missing");
  } else if (messages) {
    blockedReasons.push("provider-credential-required");
  }

  if (blockedReasons.length > 0 || !models || (!native && !messages)) {
    return {
      blockedReasons: [...new Set(blockedReasons)],
      desired: null,
    };
  }
  const credentialKind: CredentialKind = native
    ? "none"
    : envKey === "ANTHROPIC_AUTH_TOKEN"
      ? "auth-token"
      : "api-key";
  return {
    blockedReasons: [],
    desired: {
      provider: endpoint ? "custom-gateway" : "anthropic",
      endpoint,
      protocol: native ? "platform-native" : "anthropic-messages",
      model,
      sonnetModel: models.sonnet?.modelId ?? null,
      opusModel: models.opus?.modelId ?? null,
      haikuModel: models.haiku?.modelId ?? null,
      subagentModel: models.subagent?.modelId ?? null,
      credentialEnvKey: native ? null : envKey,
      credentialKind,
      secret,
      credentialStatus: native ? "platform-managed" : "configured",
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
  desired: DesiredClaudeProvider,
): void {
  for (const [field, value] of Object.entries(publicDesiredValues(desired))) {
    const planned = desiredField(plan, field);
    if (planned !== undefined && planned !== value) {
      throw new Error("AGENT_CLAUDE_PROVIDER_PLAN_INVALID");
    }
  }
}

function edit(raw: string, pathSegments: string[], value: unknown): string {
  return applyEdits(
    raw,
    modify(raw, pathSegments, value, { formattingOptions: formatting }),
  );
}

function hasEnvKey(raw: string, key: string): boolean {
  const env = getRecord(parseConfig(raw), "env");
  return Boolean(env && Object.prototype.hasOwnProperty.call(env, key));
}

function renderConfig(
  original: string | null,
  desired: DesiredClaudeProvider,
): string {
  let next = original ?? "{}\n";
  next = edit(next, ["model"], desired.model);
  for (const key of DIRECT_PROVIDER_ENV_KEYS) {
    if (hasEnvKey(next, key)) {
      next = edit(next, ["env", key], undefined);
    }
  }
  for (const key of Object.values(MODEL_ROUTE_ENV_KEYS)) {
    if (hasEnvKey(next, key)) {
      next = edit(next, ["env", key], undefined);
    }
  }
  for (const [route, envKey] of Object.entries(MODEL_ROUTE_ENV_KEYS)) {
    const model = desired[`${route}Model` as keyof DesiredClaudeProvider];
    if (typeof model === "string") {
      next = edit(next, ["env", envKey], model);
    }
  }
  if (desired.protocol === "anthropic-messages") {
    if (desired.endpoint) {
      next = edit(next, ["env", "ANTHROPIC_BASE_URL"], desired.endpoint);
    }
    next = edit(next, ["env", desired.credentialEnvKey!], desired.secret);
  }
  parseConfig(next);
  return next.endsWith("\n") ? next : `${next}\n`;
}

function verifyDesired(
  state: AgentProviderComparableState,
  desired: DesiredClaudeProvider,
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
    platformId: "claude",
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
    platformId: "claude",
    profileId: profile.id,
    protocol: profile.protocol,
    endpointOrigin: null,
    model: primaryMapping(mappings)?.modelId.trim() || null,
    status,
    startedAt: timestamp,
    finishedAt: timestamp,
    totalMs: 0,
    retryCount: 0,
    firstTokenMs: null,
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
      "provider-secret-missing",
      "provider-secret-unavailable",
      "provider-credential-required",
    ].includes(reason),
  )
    ? "no-credentials"
    : "unsupported";
}

export function createAgentClaudeProviderAdapter(
  options: ClaudeProviderAdapterOptions,
): AgentProviderAdapter {
  const now = options.now ?? Date.now;
  const testConnection =
    options.testConnection ?? testAnthropicProviderConnection;
  const testModel = options.testModel ?? testAnthropicProviderModel;

  return {
    platformId: "claude",
    version: ADAPTER_VERSION,
    async testConnection(_context, target) {
      if (target.profile.platformId !== "claude") {
        throw new Error("AGENT_PROVIDER_PROFILE_PLATFORM_MISMATCH");
      }
      const resolved = await resolveDesired(target, options.secretStore);
      if (!resolved.desired) {
        return emptyConnectionResult(
          target.profile,
          target.modelMappings,
          unavailableStatus(resolved.blockedReasons),
          now,
        );
      }
      if (resolved.desired.protocol === "platform-native") {
        return emptyConnectionResult(
          target.profile,
          target.modelMappings,
          "unsupported",
          now,
        );
      }
      return {
        platformId: "claude",
        profileId: target.profile.id,
        ...(await testConnection({
          endpoint: resolved.desired.endpoint ?? DEFAULT_ENDPOINT,
          credential: resolved.desired.secret,
          credentialKind: resolved.desired.credentialKind as
            | "api-key"
            | "auth-token",
          model: resolved.desired.model,
          protocol: resolved.desired.protocol,
        })),
      };
    },
    async testModel(_context, target, signal) {
      if (target.profile.platformId !== "claude") {
        throw new Error("AGENT_PROVIDER_PROFILE_PLATFORM_MISMATCH");
      }
      const resolved = await resolveDesired(target, options.secretStore);
      if (!resolved.desired) {
        return emptyModelResult(
          target.profile,
          target.modelMappings,
          unavailableStatus(resolved.blockedReasons),
          now,
        );
      }
      if (resolved.desired.protocol === "platform-native") {
        return emptyModelResult(
          target.profile,
          target.modelMappings,
          "unsupported",
          now,
        );
      }
      return {
        platformId: "claude",
        profileId: target.profile.id,
        ...(await testModel({
          endpoint: resolved.desired.endpoint ?? DEFAULT_ENDPOINT,
          credential: resolved.desired.secret,
          credentialKind: resolved.desired.credentialKind as
            | "api-key"
            | "auth-token",
          model: resolved.desired.model,
          protocol: resolved.desired.protocol,
          signal,
        })),
      };
    },
    async inspect(context) {
      return (await readNative(context)).state;
    },
    async importCurrent(context): Promise<AgentProviderImportPreview> {
      const native = await readNative(context);
      const env = getRecord(native.data, "env");
      const provider = native.state.values.provider as string;
      const credential = nativeCredential(env);
      const model = getString(native.data, "model");
      const routeMappings = (
        Object.entries(MODEL_ROUTE_ENV_KEYS) as Array<
          [Exclude<ClaudeModelRoute, "primary">, string]
        >
      ).flatMap(([routeKey, envKey]) => {
        const modelId = getString(env, envKey);
        return modelId ? [{ routeKey, modelId, parameters: {} }] : [];
      });
      return {
        state: native.state,
        profile: {
          platformId: "claude",
          name: `Claude ${provider}`,
          providerKind:
            provider === "anthropic"
              ? "anthropic"
              : provider === "custom-gateway"
                ? "anthropic-compatible"
                : provider,
          protocol: native.state.values.protocol as string,
          endpoint: native.state.values.endpoint as string | null,
          config: credential.envKey
            ? { credentialEnvKey: credential.envKey }
            : {},
          secretRef: null,
          source: "native-import",
        },
        modelMappings: [
          ...(model
            ? [{ routeKey: "primary", modelId: model, parameters: {} }]
            : []),
          ...routeMappings,
        ],
        warnings: [
          ...(credential.envKey ? ["native-credential-not-imported"] : []),
          ...(!["anthropic", "custom-gateway"].includes(provider)
            ? ["native-provider-read-only"]
            : []),
        ],
      };
    },
    async planActivation(input) {
      requireContext(input.context);
      if (input.profile.platformId !== "claude") {
        return reconcileAgentProviderState({
          profileId: input.profile.id,
          baseline: null,
          current: (await readNative(input.context)).state,
          desired: { platformId: "claude", values: {} },
          supportedKeys: [],
          blockedReasons: ["provider-platform-mismatch"],
        });
      }
      const native = await readNative(input.context);
      const resolved = await resolveDesired(input, options.secretStore);
      return reconcileAgentProviderState({
        profileId: input.profile.id,
        baseline:
          input.baseline?.adapterVersion === ADAPTER_VERSION
            ? input.baseline
            : null,
        current: native.state,
        desired: {
          platformId: "claude",
          values: resolved.desired ? publicDesiredValues(resolved.desired) : {},
        },
        supportedKeys: [
          "provider",
          "endpoint",
          "protocol",
          "model",
          "sonnetModel",
          "opusModel",
          "haikuModel",
          "subagentModel",
          "credentialKind",
          "credentialStatus",
        ],
        blockedReasons: resolved.blockedReasons,
      });
    },
    async apply(context, plan, target): Promise<AgentProviderApplyReceipt> {
      const targetPath = requireContext(context);
      const native = await readNative(context);
      if (
        plan.platformId !== "claude" ||
        plan.profileId !== target.profile.id ||
        plan.adapterVersion !== ADAPTER_VERSION ||
        plan.currentDigest !== native.state.nativeDigest ||
        plan.status !== "apply" ||
        !plan.canApply
      ) {
        throw new Error("AGENT_CLAUDE_PROVIDER_PLAN_INVALID");
      }
      const resolved = await resolveDesired(target, options.secretStore);
      if (!resolved.desired) {
        if (resolved.blockedReasons.includes("provider-secret-missing")) {
          throw new Error("AGENT_CLAUDE_PROVIDER_SECRET_MISSING");
        }
        throw new Error("AGENT_CLAUDE_PROVIDER_PROFILE_INVALID");
      }
      assertPlanMatchesDesired(plan, resolved.desired);
      const nextText = renderConfig(native.raw, resolved.desired);
      const backupRef = await createEncryptedConfigBackup({
        backupRoot: options.backupRoot,
        agentId: "claude",
        sourcePath: targetPath,
        content: native.raw,
        encryption: options.backupEncryption,
      });
      await options.hooks?.beforeWrite?.(targetPath);
      try {
        await assertConfigUnchanged(targetPath, native.raw);
      } catch {
        throw new Error("AGENT_CLAUDE_PROVIDER_CONCURRENT_CHANGE");
      }
      try {
        await atomicWrite(targetPath, nextText);
        await options.hooks?.afterWrite?.(targetPath);
        const after = await readNative(context);
        if (!verifyDesired(after.state, resolved.desired)) {
          throw new Error("verification");
        }
        return {
          platformId: "claude",
          profileId: plan.profileId,
          adapterVersion: ADAPTER_VERSION,
          nativeDigestBefore: native.state.nativeDigest,
          nativeDigestAfter: after.state.nativeDigest,
          backupRef,
          appliedAt: now(),
        };
      } catch {
        await restoreModelConfig(targetPath, native.raw).catch(() => undefined);
        throw new Error("AGENT_CLAUDE_PROVIDER_WRITE_FAILED");
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
        receipt.platformId === "claude" &&
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
