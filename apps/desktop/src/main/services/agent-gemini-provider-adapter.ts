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
  testGoogleGeminiProviderConnection,
  testGoogleGeminiProviderModel,
  type GoogleGeminiProviderConnectionInput,
  type GoogleGeminiProviderModelTestInput,
} from "./agent-google-gemini-provider-probe";
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
import type {
  AgentSecretStore,
  AgentSecretStoreEncryption,
} from "./agent-secret-store";

type JsonRecord = Record<string, unknown>;
type NativeAuthType =
  | "oauth-personal"
  | "vertex-ai"
  | "compute-default-credentials"
  | "cloud-shell"
  | "gateway";

interface GeminiProviderAdapterOptions {
  backupRoot: string;
  backupEncryption: AgentSecretStoreEncryption;
  secretStore: Pick<AgentSecretStore, "read">;
  testConnection?: (
    input: GoogleGeminiProviderConnectionInput,
  ) => Promise<
    Omit<AgentProviderConnectionTestResult, "platformId" | "profileId">
  >;
  testModel?: (
    input: GoogleGeminiProviderModelTestInput,
  ) => Promise<Omit<AgentProviderModelTestResult, "platformId" | "profileId">>;
  now?: () => number;
  hooks?: {
    beforeWrite?: () => Promise<void>;
    afterSettingsWrite?: () => Promise<void>;
    afterWrite?: () => Promise<void>;
  };
}

interface GeminiPaths {
  rootPath: string;
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

interface DesiredGeminiProvider {
  provider: "google-gemini" | NativeAuthType;
  endpoint: string | null;
  protocol: "google-generative-ai" | "platform-native";
  authType: "gemini-api-key" | NativeAuthType;
  model: string;
  secret: string | null;
  credentialStatus: "configured" | "platform-managed";
}

interface GeminiBackupBundle {
  version: 1;
  settings: string | null;
  env: string | null;
}

const ADAPTER_VERSION = "gemini-provider-profile-v1";
const DEFAULT_ENDPOINT = "https://generativelanguage.googleapis.com";
const MAX_NAME_LENGTH = 80;
const MAX_MODEL_LENGTH = 512;
const MANAGED_ENV_KEYS = ["GEMINI_API_KEY", "GOOGLE_GEMINI_BASE_URL"] as const;
const NATIVE_AUTH_TYPES = new Set<NativeAuthType>([
  "oauth-personal",
  "vertex-ai",
  "compute-default-credentials",
  "cloud-shell",
  "gateway",
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

function parseSettings(raw: string): JsonRecord {
  const errors: ParseError[] = [];
  const parsed = parseJsonc(raw, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length > 0 || !isRecord(parsed)) {
    throw new Error("AGENT_GEMINI_PROVIDER_CONFIG_INVALID");
  }
  return parsed;
}

function requireContext(context: AgentProviderAdapterContext): GeminiPaths {
  if (
    context.agentId !== "gemini" ||
    context.platformId !== "gemini" ||
    typeof context.rootPath !== "string" ||
    !context.rootPath.trim() ||
    !path.isAbsolute(context.rootPath) ||
    context.rootPath.includes("\0")
  ) {
    throw new Error("AGENT_GEMINI_PROVIDER_CONTEXT_INVALID");
  }
  const rootPath = path.resolve(context.rootPath);
  return {
    rootPath,
    settingsPath: path.join(rootPath, getAgentPrimaryModelConfigPath("gemini")),
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

function selectedAuthType(
  settings: JsonRecord,
  env: Map<string, string>,
): "gemini-api-key" | NativeAuthType {
  const selected = getString(
    getRecord(getRecord(settings, "security"), "auth"),
    "selectedType",
  );
  if (selected === "gemini-api-key") return selected;
  if (NATIVE_AUTH_TYPES.has(selected as NativeAuthType)) {
    return selected as NativeAuthType;
  }
  if (env.has("GEMINI_API_KEY")) return "gemini-api-key";
  if (env.get("GOOGLE_GENAI_USE_VERTEXAI")?.toLowerCase() === "true") {
    return "vertex-ai";
  }
  return "oauth-personal";
}

function observedEndpoint(env: Map<string, string>): string | null {
  const value = env.get("GOOGLE_GEMINI_BASE_URL");
  return sanitizeEndpoint(value ? value.trim() : null);
}

function comparableState(
  settingsRaw: string | null,
  envRaw: string | null,
  settings: JsonRecord,
  env: Map<string, string>,
): AgentProviderComparableState {
  const authType = selectedAuthType(settings, env);
  const managed = authType === "gemini-api-key";
  return {
    platformId: "gemini",
    adapterVersion: ADAPTER_VERSION,
    nativeDigest: digest(settingsRaw, envRaw),
    values: {
      provider: managed ? "google-gemini" : authType,
      endpoint: managed ? observedEndpoint(env) : null,
      protocol: managed ? "google-generative-ai" : "platform-native",
      authType,
      model: getString(getRecord(settings, "model"), "name"),
      credentialStatus:
        managed && env.has("GEMINI_API_KEY")
          ? "configured"
          : "platform-managed",
      sourceRelativePath: `${getAgentPrimaryModelConfigPath("gemini")} + .env`,
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
    throw new Error("AGENT_GEMINI_PROVIDER_CONFIG_INVALID");
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
    mappings.some(
      (mapping) =>
        mapping.routeKey !== "primary" ||
        Object.keys(mapping.parameters).length > 0,
    )
  ) {
    return null;
  }
  return primary[0];
}

function publicDesiredValues(
  desired: DesiredGeminiProvider,
): Record<string, AgentProviderComparableValue> {
  return {
    provider: desired.provider,
    endpoint: desired.endpoint,
    protocol: desired.protocol,
    authType: desired.authType,
    model: desired.model,
    credentialStatus: desired.credentialStatus,
  };
}

function nativeAuthType(profile: AgentProviderProfile): NativeAuthType | null {
  const configured = profile.config.nativeAuthType;
  if (
    typeof configured === "string" &&
    NATIVE_AUTH_TYPES.has(configured as NativeAuthType) &&
    configured === profile.providerKind
  ) {
    return configured as NativeAuthType;
  }
  return null;
}

function hasOnlyConfigKeys(
  profile: AgentProviderProfile,
  allowed: string[],
): boolean {
  return Object.keys(profile.config).every(
    (key) => allowed.includes(key) || key === "adapter",
  );
}

async function resolveDesired(
  input: Pick<AgentProviderActivationInput, "profile" | "modelMappings">,
  secretStore: Pick<AgentSecretStore, "read">,
): Promise<{
  blockedReasons: string[];
  desired: DesiredGeminiProvider | null;
}> {
  const blockedReasons: string[] = [];
  const { profile } = input;
  const mapping = primaryMapping(input.modelMappings);
  const model = mapping?.modelId.trim() ?? "";
  const endpoint = normalizeEndpoint(profile.endpoint);
  const nativeAuth = nativeAuthType(profile);
  const managed =
    profile.providerKind === "google-gemini" &&
    profile.protocol === "google-generative-ai";
  const native =
    profile.protocol === "platform-native" &&
    nativeAuth !== null &&
    !profile.endpoint &&
    !profile.secretRef;

  if (!profile.name.trim() || profile.name.length > MAX_NAME_LENGTH) {
    blockedReasons.push("provider-name-invalid");
  }
  if (
    !mapping ||
    !model ||
    model.length > MAX_MODEL_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(model)
  ) {
    blockedReasons.push("primary-model-required");
  }
  if (!managed && !native) {
    blockedReasons.push("provider-protocol-unsupported");
  }
  if (profile.endpoint && !endpoint) {
    blockedReasons.push("provider-endpoint-invalid");
  }
  if (
    managed &&
    (profile.config.credentialEnvKey !== "GEMINI_API_KEY" ||
      !hasOnlyConfigKeys(profile, ["credentialEnvKey"]))
  ) {
    blockedReasons.push("provider-credential-kind-invalid");
  }
  if (native && !hasOnlyConfigKeys(profile, ["nativeAuthType"])) {
    blockedReasons.push("provider-config-unsupported");
  }

  let secret: string | null = null;
  if (managed && profile.secretRef) {
    try {
      secret = await secretStore.read(profile.secretRef);
    } catch {
      blockedReasons.push("provider-secret-unavailable");
    }
    if (!secret) blockedReasons.push("provider-secret-missing");
  } else if (managed) {
    blockedReasons.push("provider-credential-required");
  }

  if (blockedReasons.length > 0 || !mapping || (!managed && !native)) {
    return {
      blockedReasons: [...new Set(blockedReasons)],
      desired: null,
    };
  }
  return {
    blockedReasons: [],
    desired: {
      provider: native ? nativeAuth! : "google-gemini",
      endpoint: managed ? endpoint : null,
      protocol: managed ? "google-generative-ai" : "platform-native",
      authType: native ? nativeAuth! : "gemini-api-key",
      model,
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
  desired: DesiredGeminiProvider,
): void {
  for (const [field, value] of Object.entries(publicDesiredValues(desired))) {
    const planned = desiredField(plan, field);
    if (planned !== undefined && planned !== value) {
      throw new Error("AGENT_GEMINI_PROVIDER_PLAN_INVALID");
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
  desired: DesiredGeminiProvider,
): string {
  let next = original ?? "{}\n";
  next = edit(next, ["model", "name"], desired.model);
  next = edit(next, ["security", "auth", "selectedType"], desired.authType);
  parseSettings(next);
  return next.endsWith("\n") ? next : `${next}\n`;
}

function renderEnv(
  original: string | null,
  desired: DesiredGeminiProvider,
): string {
  return renderDotEnv(
    original,
    MANAGED_ENV_KEYS.map((key) => [
      key,
      desired.protocol !== "google-generative-ai"
        ? null
        : key === "GEMINI_API_KEY"
          ? desired.secret
          : desired.endpoint,
    ]),
  );
}

function verifyDesired(
  state: AgentProviderComparableState,
  desired: DesiredGeminiProvider,
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
    platformId: "gemini",
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
    platformId: "gemini",
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

function backupContent(native: NativeConfig): string {
  const bundle: GeminiBackupBundle = {
    version: 1,
    settings: native.settingsRaw,
    env: native.envRaw,
  };
  return JSON.stringify(bundle);
}

function parseBackupBundle(raw: string): GeminiBackupBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AGENT_GEMINI_PROVIDER_BACKUP_INVALID");
  }
  if (
    !isRecord(parsed) ||
    parsed.version !== 1 ||
    (parsed.settings !== null && typeof parsed.settings !== "string") ||
    (parsed.env !== null && typeof parsed.env !== "string")
  ) {
    throw new Error("AGENT_GEMINI_PROVIDER_BACKUP_INVALID");
  }
  return parsed as unknown as GeminiBackupBundle;
}

async function restoreBundle(
  paths: GeminiPaths,
  bundle: GeminiBackupBundle,
): Promise<void> {
  await Promise.all([
    restoreModelConfig(paths.settingsPath, bundle.settings),
    restoreModelConfig(paths.envPath, bundle.env),
  ]);
}

export function createAgentGeminiProviderAdapter(
  options: GeminiProviderAdapterOptions,
): AgentProviderAdapter {
  const now = options.now ?? Date.now;
  const testConnection =
    options.testConnection ?? testGoogleGeminiProviderConnection;
  const testModel = options.testModel ?? testGoogleGeminiProviderModel;

  return {
    platformId: "gemini",
    version: ADAPTER_VERSION,
    async testConnection(_context, target) {
      if (target.profile.platformId !== "gemini") {
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
        platformId: "gemini",
        profileId: target.profile.id,
        ...(await testConnection({
          endpoint: resolved.desired.endpoint ?? DEFAULT_ENDPOINT,
          credential: resolved.desired.secret,
          model: resolved.desired.model,
          protocol: resolved.desired.protocol,
        })),
      };
    },
    async testModel(_context, target, signal) {
      if (target.profile.platformId !== "gemini") {
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
        platformId: "gemini",
        profileId: target.profile.id,
        ...(await testModel({
          endpoint: resolved.desired.endpoint ?? DEFAULT_ENDPOINT,
          credential: resolved.desired.secret,
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
      const authType = native.state.values.authType as
        | "gemini-api-key"
        | NativeAuthType;
      const managed = authType === "gemini-api-key";
      const model = getString(getRecord(native.settings, "model"), "name");
      return {
        state: native.state,
        profile: {
          platformId: "gemini",
          name: managed ? "Gemini paid API" : `Gemini ${authType}`,
          providerKind: managed ? "google-gemini" : authType,
          protocol: managed ? "google-generative-ai" : "platform-native",
          endpoint: managed
            ? (native.state.values.endpoint as string | null)
            : null,
          config: managed
            ? { credentialEnvKey: "GEMINI_API_KEY" }
            : { nativeAuthType: authType },
          secretRef: null,
          source: "native-import",
        },
        modelMappings: model
          ? [{ routeKey: "primary", modelId: model, parameters: {} }]
          : [],
        warnings: [
          ...(managed && native.env.has("GEMINI_API_KEY")
            ? ["native-credential-not-imported"]
            : []),
          ...(!managed ? ["native-provider-read-only"] : []),
        ],
      };
    },
    async planActivation(input) {
      requireContext(input.context);
      const native = await readNative(input.context);
      if (input.profile.platformId !== "gemini") {
        return reconcileAgentProviderState({
          profileId: input.profile.id,
          baseline: null,
          current: native.state,
          desired: { platformId: "gemini", values: {} },
          supportedKeys: [],
          blockedReasons: ["provider-platform-mismatch"],
        });
      }
      const resolved = await resolveDesired(input, options.secretStore);
      return reconcileAgentProviderState({
        profileId: input.profile.id,
        baseline:
          input.baseline?.adapterVersion === ADAPTER_VERSION
            ? input.baseline
            : null,
        current: native.state,
        desired: {
          platformId: "gemini",
          values: resolved.desired ? publicDesiredValues(resolved.desired) : {},
        },
        supportedKeys: [
          "provider",
          "endpoint",
          "protocol",
          "authType",
          "model",
          "credentialStatus",
        ],
        blockedReasons: resolved.blockedReasons,
      });
    },
    async apply(context, plan, target): Promise<AgentProviderApplyReceipt> {
      const paths = requireContext(context);
      const native = await readNative(context);
      if (
        plan.platformId !== "gemini" ||
        plan.profileId !== target.profile.id ||
        plan.adapterVersion !== ADAPTER_VERSION ||
        plan.currentDigest !== native.state.nativeDigest ||
        plan.status !== "apply" ||
        !plan.canApply
      ) {
        throw new Error("AGENT_GEMINI_PROVIDER_PLAN_INVALID");
      }
      const resolved = await resolveDesired(target, options.secretStore);
      if (!resolved.desired) {
        if (resolved.blockedReasons.includes("provider-secret-missing")) {
          throw new Error("AGENT_GEMINI_PROVIDER_SECRET_MISSING");
        }
        throw new Error("AGENT_GEMINI_PROVIDER_PROFILE_INVALID");
      }
      assertPlanMatchesDesired(plan, resolved.desired);
      const nextSettings = renderSettings(native.settingsRaw, resolved.desired);
      const nextEnv = renderEnv(native.envRaw, resolved.desired);
      const backupRef = await createEncryptedConfigBackup({
        backupRoot: options.backupRoot,
        agentId: "gemini",
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
        throw new Error("AGENT_GEMINI_PROVIDER_CONCURRENT_CHANGE");
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
          platformId: "gemini",
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
        throw new Error("AGENT_GEMINI_PROVIDER_WRITE_FAILED");
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
        receipt.platformId === "gemini" &&
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
          throw new Error("AGENT_GEMINI_PROVIDER_BACKUP_INVALID");
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
