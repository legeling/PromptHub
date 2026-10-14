import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { getAgentModelConfigPaths } from "./agent-model-config-paths";
import { readOpenCodeConfigFiles } from "./agent-opencode-config-files";

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
  atomicWrite,
  fileExists,
  readTextConfig,
  restoreModelConfig,
} from "./agent-model-config";
import {
  isJsonRecord,
  parseOpenCodeAuth,
  projectOpenCodeState,
  renderOpenCodeAuth,
  renderOpenCodeConfig,
  renderOpenCodeSelection,
  type JsonRecord,
  type OpenCodeActiveProjection,
  type OpenCodeDirectProjection,
} from "./agent-opencode-native-config";
import {
  createProviderProbeDispatcher,
  type DirectProviderProtocol,
  type ProviderProbeOptions,
} from "./agent-provider-probe-dispatch";
import type {
  AgentSecretStore,
  AgentSecretStoreEncryption,
} from "./agent-secret-store";

type OpenCodeProtocol = "openai-chat" | "openai-responses";

interface OpenCodeProviderAdapterOptions extends ProviderProbeOptions {
  backupRoot: string;
  backupEncryption: AgentSecretStoreEncryption;
  secretStore: Pick<AgentSecretStore, "read">;
  authPath?: string;
  now?: () => number;
  hooks?: {
    beforeWrite?: () => Promise<void>;
    afterConfigWrite?: () => Promise<void>;
    afterWrite?: () => Promise<void>;
  };
}

interface OpenCodePaths {
  rootPath: string;
  configPath: string;
  configRelativePath: string;
  authPath: string;
  bundlePath: string;
}

interface OpenCodeNativeState {
  configRaw: string | null;
  authRaw: string | null;
  config: JsonRecord;
  inherited: JsonRecord;
  auth: JsonRecord;
  projection: OpenCodeActiveProjection;
  paths: OpenCodePaths;
  state: AgentProviderComparableState;
}

interface DesiredOpenCodeProvider extends OpenCodeDirectProjection {
  native: false;
  protocol: OpenCodeProtocol;
  secret: string;
}

interface DesiredOpenCodeNative {
  native: true;
  providerId: string;
  model: string;
  secondaryModel: string | null;
  values: Record<string, AgentProviderComparableValue>;
}

type DesiredOpenCode = DesiredOpenCodeProvider | DesiredOpenCodeNative;

interface OpenCodeBackupBundle {
  version: 1;
  configRelativePath: string;
  config: string | null;
  auth: string | null;
  /** Selection-only operations must never restore platform-owned credentials. */
  preserveAuth?: true;
}

const ADAPTER_VERSION = "opencode-provider-profile-v2";
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_NAME_LENGTH = 80;
const MAX_MODEL_LENGTH = 512;
const PACKAGE_BY_PROTOCOL: Record<OpenCodeProtocol, string> = {
  "openai-chat": "@ai-sdk/openai-compatible",
  "openai-responses": "@ai-sdk/openai",
};

export function resolveOpenCodeAuthPath(
  options: {
    platform?: NodeJS.Platform;
    homeDir?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): string {
  const platform = options.platform ?? process.platform;
  const homeDir = options.homeDir ?? os.homedir();
  const env = options.env ?? process.env;
  if (env.XDG_DATA_HOME?.trim()) {
    return path.join(env.XDG_DATA_HOME, "opencode", "auth.json");
  }
  if (platform === "win32" && env.LOCALAPPDATA?.trim()) {
    return path.join(env.LOCALAPPDATA, "opencode", "auth.json");
  }
  return path.join(homeDir, ".local", "share", "opencode", "auth.json");
}

function requireContext(
  context: AgentProviderAdapterContext,
  authPath?: string,
): Omit<OpenCodePaths, "configPath" | "configRelativePath"> {
  if (
    context.agentId !== "opencode" ||
    context.platformId !== "opencode" ||
    typeof context.rootPath !== "string" ||
    !context.rootPath.trim() ||
    !path.isAbsolute(context.rootPath) ||
    context.rootPath.includes("\0")
  ) {
    throw new Error("AGENT_OPENCODE_PROVIDER_CONTEXT_INVALID");
  }
  const rootPath = path.resolve(context.rootPath);
  const resolvedAuthPath = path.resolve(authPath ?? resolveOpenCodeAuthPath());
  return {
    rootPath,
    authPath: resolvedAuthPath,
    bundlePath: path.join(rootPath, "provider-bundle.json"),
  };
}

async function readOptional(filePath: string): Promise<string | null> {
  return (await fileExists(filePath)) ? readTextConfig(filePath) : null;
}

function digest(configRaw: string | null, authRaw: string | null): string {
  return createHash("sha256")
    .update(configRaw === null ? "\0" : `c:${configRaw}`)
    .update(authRaw === null ? "\0" : `a:${authRaw}`)
    .digest("hex");
}

function comparableState(
  paths: OpenCodePaths,
  configRaw: string | null,
  authRaw: string | null,
  projection: OpenCodeActiveProjection,
): AgentProviderComparableState {
  const protocol =
    projection.packageName === "@ai-sdk/openai-compatible"
      ? "openai-chat"
      : projection.packageName === "@ai-sdk/openai"
        ? "openai-responses"
        : "platform-native";
  return {
    platformId: "opencode",
    adapterVersion: ADAPTER_VERSION,
    nativeDigest: digest(configRaw, authRaw),
    values: {
      providerId: projection.providerId,
      package: projection.packageName,
      protocol,
      endpoint: projection.endpoint,
      model: projection.model,
      secondaryModel: projection.secondaryModel,
      authOwnership: projection.authOwnership,
      credentialStatus: projection.credentialStatus,
      configRelativePath: paths.configRelativePath,
      v2ProviderConfig: projection.v2ProviderConfig,
      authorizationHeaderConflict: projection.authorizationHeaderConflict,
    },
  };
}

async function readNative(
  context: AgentProviderAdapterContext,
  authPath?: string,
): Promise<OpenCodeNativeState> {
  const base = requireContext(context, authPath);
  try {
    const [merged, authRaw] = await Promise.all([
      readOpenCodeConfigFiles(base.rootPath),
      readOptional(base.authPath),
    ]);
    const paths = {
      ...base,
      configRelativePath: merged.selected.relativePath,
      configPath: path.join(base.rootPath, merged.selected.relativePath),
    };
    const configRaw = merged.selected.raw;
    const config = merged.config;
    const auth = authRaw === null ? {} : parseOpenCodeAuth(authRaw);
    const projection = projectOpenCodeState(config, auth);
    return {
      configRaw,
      authRaw,
      config,
      inherited: merged.inherited,
      auth,
      projection,
      paths,
      state: comparableState(
        paths,
        JSON.stringify(merged.files),
        authRaw,
        projection,
      ),
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("AGENT_OPENCODE_PROVIDER_")
    ) {
      throw error;
    }
    throw new Error("AGENT_OPENCODE_PROVIDER_CONFIG_INVALID");
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

function validText(value: string, maxLength: number): boolean {
  return (
    Boolean(value) &&
    value.length <= maxLength &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function mappingByRoute(
  mappings: AgentProviderModelMapping[],
  routeKey: "primary" | "secondary",
): AgentProviderModelMapping | null {
  const matches = mappings.filter((mapping) => mapping.routeKey === routeKey);
  return matches.length === 1 ? matches[0] : null;
}

function resolveNativeSelection(
  target: Pick<AgentProviderActivationInput, "profile" | "modelMappings">,
  native: OpenCodeNativeState,
): { blockedReasons: string[]; desired: DesiredOpenCodeNative | null } {
  const { profile, modelMappings } = target;
  const providerId = profile.config.providerId;
  const primary = mappingByRoute(modelMappings, "primary");
  const secondary = mappingByRoute(modelMappings, "secondary");
  if (
    typeof providerId !== "string" ||
    !PROVIDER_ID_PATTERN.test(providerId) ||
    !primary ||
    !validText(primary.modelId, MAX_MODEL_LENGTH) ||
    modelMappings.length > 2 ||
    modelMappings.some(
      (mapping) => Object.keys(mapping.parameters).length > 0,
    ) ||
    profile.providerKind !== "platform-native" ||
    profile.secretRef ||
    profile.source !== "native-import"
  ) {
    return {
      blockedReasons: ["native-provider-state-mismatch"],
      desired: null,
    };
  }
  const model = primary.modelId;
  const secondaryModel = secondary?.modelId ?? null;
  const selected = {
    ...native.config,
    model: `${providerId}/${model}`,
    small_model: secondaryModel ? `${providerId}/${secondaryModel}` : "",
  };
  const projection = projectOpenCodeState(selected, native.auth);
  const providers = native.config.provider;
  const provider = isJsonRecord(providers) ? providers[providerId] : undefined;
  const models = isJsonRecord(provider) ? provider.models : undefined;
  if (
    projection.v2ProviderConfig ||
    projection.credentialStatus === "missing" ||
    projection.authOwnership !== profile.config.nativeAuthOwnership ||
    projection.packageName !== profile.config.package ||
    projection.endpoint !== profile.endpoint ||
    (isJsonRecord(models) &&
      (!Object.hasOwn(models, model) ||
        (secondaryModel !== null && !Object.hasOwn(models, secondaryModel))))
  ) {
    return {
      blockedReasons: ["native-provider-state-mismatch"],
      desired: null,
    };
  }
  return {
    blockedReasons: [],
    desired: {
      native: true,
      providerId,
      model,
      secondaryModel,
      values: comparableState(native.paths, null, null, projection).values,
    },
  };
}

async function resolveDesired(
  target: Pick<AgentProviderActivationInput, "profile" | "modelMappings">,
  native: OpenCodeNativeState,
  secretStore: Pick<AgentSecretStore, "read">,
): Promise<{
  blockedReasons: string[];
  desired: DesiredOpenCode | null;
}> {
  if (
    target.profile.protocol === "platform-native" &&
    target.profile.source === "native-import" &&
    target.profile.providerKind === "platform-native"
  )
    return resolveNativeSelection(target, native);
  const blockedReasons: string[] = [];
  const profile = target.profile;
  const providerId =
    typeof profile.config.providerId === "string"
      ? profile.config.providerId.trim()
      : "";
  const packageName =
    typeof profile.config.package === "string"
      ? profile.config.package.trim()
      : "";
  const primary = mappingByRoute(target.modelMappings, "primary");
  const secondary = mappingByRoute(target.modelMappings, "secondary");
  const model = primary?.modelId.trim() ?? "";
  const secondaryModel = secondary?.modelId.trim() || null;
  const endpoint = normalizeEndpoint(profile.endpoint);
  const protocol =
    profile.protocol === "openai-chat" ||
    profile.protocol === "openai-responses"
      ? profile.protocol
      : null;

  if (native.projection.v2ProviderConfig) {
    blockedReasons.push("opencode-v2-provider-config-unsupported");
  }
  const targetProjection = projectOpenCodeState(
    { ...native.config, model: `${providerId}/${model}` },
    native.auth,
  );
  if (
    targetProjection.authOwnership === "oauth" ||
    targetProjection.authOwnership === "wellknown"
  ) {
    blockedReasons.push("native-provider-auth-owned");
  }
  if (targetProjection.authorizationHeaderConflict) {
    blockedReasons.push("native-authorization-header-conflict");
  }
  if (!validText(profile.name.trim(), MAX_NAME_LENGTH)) {
    blockedReasons.push("provider-name-invalid");
  }
  if (!PROVIDER_ID_PATTERN.test(providerId)) {
    blockedReasons.push("provider-id-invalid");
  }
  if (
    !primary ||
    target.modelMappings.length > 2 ||
    Object.keys(primary.parameters).length > 0 ||
    (secondary && Object.keys(secondary.parameters).length > 0) ||
    !validText(model, MAX_MODEL_LENGTH) ||
    (secondaryModel && !validText(secondaryModel, MAX_MODEL_LENGTH))
  ) {
    blockedReasons.push("provider-model-mapping-invalid");
  }
  if (
    !protocol ||
    PACKAGE_BY_PROTOCOL[protocol] !== packageName ||
    profile.providerKind !==
      (protocol === "openai-chat" ? "openai-compatible" : "openai")
  ) {
    blockedReasons.push("provider-protocol-unsupported");
  }
  if (!endpoint) blockedReasons.push("provider-endpoint-invalid");
  if (
    Object.keys(profile.config).some(
      (key) => !["providerId", "package", "adapter"].includes(key),
    )
  ) {
    blockedReasons.push("provider-config-unsupported");
  }
  if (!profile.secretRef) {
    blockedReasons.push("provider-credential-required");
  }

  let secret: string | null = null;
  if (profile.secretRef) {
    try {
      secret = await secretStore.read(profile.secretRef);
    } catch {
      blockedReasons.push("provider-secret-unavailable");
    }
    if (!secret) blockedReasons.push("provider-secret-missing");
  }

  if (
    blockedReasons.length > 0 ||
    !protocol ||
    !endpoint ||
    !primary ||
    !secret
  ) {
    return { blockedReasons: [...new Set(blockedReasons)], desired: null };
  }
  return {
    blockedReasons: [],
    desired: {
      native: false,
      providerId,
      packageName: packageName as DesiredOpenCodeProvider["packageName"],
      endpoint,
      name: profile.name.trim(),
      model,
      secondaryModel,
      protocol,
      secret,
    },
  };
}

function publicDesiredValues(
  desired: DesiredOpenCode,
  configRelativePath: string,
): Record<string, AgentProviderComparableValue> {
  if (desired.native === true) return desired.values;
  return {
    providerId: desired.providerId,
    package: desired.packageName,
    protocol: desired.protocol,
    endpoint: desired.endpoint,
    model: desired.model,
    secondaryModel: desired.secondaryModel,
    authOwnership: "api",
    credentialStatus: "platform-managed",
    configRelativePath,
    v2ProviderConfig: false,
    authorizationHeaderConflict: false,
  };
}

function importPreview(
  native: OpenCodeNativeState,
): AgentProviderImportPreview {
  const active = native.projection;
  if (!active.providerId || !active.model) {
    throw new Error("AGENT_OPENCODE_PROVIDER_IMPORT_UNAVAILABLE");
  }
  return {
    state: native.state,
    profile: {
      platformId: "opencode",
      name: `OpenCode ${active.providerId}`,
      providerKind: "platform-native",
      protocol: "platform-native",
      endpoint: active.endpoint,
      config: {
        providerId: active.providerId,
        package: active.packageName,
        nativeAuthOwnership: active.authOwnership,
      },
      secretRef: null,
      source: "native-import",
    },
    modelMappings: [
      { routeKey: "primary", modelId: active.model, parameters: {} },
      ...(active.secondaryModel
        ? [
            {
              routeKey: "secondary",
              modelId: active.secondaryModel,
              parameters: {},
            },
          ]
        : []),
    ],
    warnings: [
      "native-provider-read-only",
      ...(active.credentialStatus === "missing"
        ? ["native-credential-missing"]
        : []),
    ],
  };
}

function backupContent(
  native: OpenCodeNativeState,
  preserveAuth: boolean,
): string {
  return JSON.stringify({
    version: 1,
    configRelativePath: native.paths.configRelativePath,
    config: native.configRaw,
    auth: preserveAuth ? null : native.authRaw,
    ...(preserveAuth ? { preserveAuth: true as const } : {}),
  } satisfies OpenCodeBackupBundle);
}

function parseBackup(raw: string): OpenCodeBackupBundle {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("AGENT_OPENCODE_PROVIDER_BACKUP_INVALID");
  }
  if (
    !isJsonRecord(value) ||
    value.version !== 1 ||
    typeof value.configRelativePath !== "string" ||
    !getAgentModelConfigPaths("opencode").includes(value.configRelativePath) ||
    (value.config !== null && typeof value.config !== "string") ||
    (value.auth !== null && typeof value.auth !== "string") ||
    (value.preserveAuth !== undefined && value.preserveAuth !== true)
  ) {
    throw new Error("AGENT_OPENCODE_PROVIDER_BACKUP_INVALID");
  }
  return value as unknown as OpenCodeBackupBundle;
}

async function restoreBundle(
  paths: OpenCodePaths,
  bundle: OpenCodeBackupBundle,
): Promise<void> {
  const configPath = path.join(paths.rootPath, bundle.configRelativePath);
  await Promise.all([
    restoreModelConfig(configPath, bundle.config),
    ...(bundle.preserveAuth
      ? []
      : [restoreModelConfig(paths.authPath, bundle.auth)]),
  ]);
}

function verifyDesired(
  state: AgentProviderComparableState,
  desired: DesiredOpenCode,
  configRelativePath: string,
): boolean {
  return Object.entries(publicDesiredValues(desired, configRelativePath)).every(
    ([field, value]) => state.values[field] === value,
  );
}

function primaryModel(mappings: AgentProviderModelMapping[]): string | null {
  return mappingByRoute(mappings, "primary")?.modelId.trim() || null;
}

function emptyConnection(
  profile: AgentProviderProfile,
  mappings: AgentProviderModelMapping[],
  status: "no-credentials" | "unsupported",
  now: () => number,
): AgentProviderConnectionTestResult {
  const timestamp = now();
  return {
    platformId: "opencode",
    profileId: profile.id,
    protocol: profile.protocol,
    endpointOrigin: null,
    model: primaryModel(mappings),
    status,
    startedAt: timestamp,
    finishedAt: timestamp,
    totalMs: 0,
    retryCount: 0,
    modelCount: null,
    modelAvailable: null,
  };
}

function emptyModel(
  profile: AgentProviderProfile,
  mappings: AgentProviderModelMapping[],
  status: "no-credentials" | "unsupported",
  now: () => number,
): AgentProviderModelTestResult {
  const timestamp = now();
  return {
    platformId: "opencode",
    profileId: profile.id,
    protocol: profile.protocol,
    endpointOrigin: null,
    model: primaryModel(mappings),
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
  reasons: string[],
): "no-credentials" | "unsupported" {
  return reasons.some((reason) => reason.includes("secret"))
    ? "no-credentials"
    : "unsupported";
}

export function createAgentOpenCodeProviderAdapter(
  options: OpenCodeProviderAdapterOptions,
): AgentProviderAdapter {
  const now = options.now ?? Date.now;
  const probes = createProviderProbeDispatcher("opencode", options);
  return {
    platformId: "opencode",
    version: ADAPTER_VERSION,
    async testConnection(context, target) {
      const native = await readNative(context, options.authPath);
      const resolved = await resolveDesired(
        target,
        native,
        options.secretStore,
      );
      if (!resolved.desired || resolved.desired.native === true) {
        return emptyConnection(
          target.profile,
          target.modelMappings,
          unavailableStatus(resolved.blockedReasons),
          now,
        );
      }
      return probes.testConnection({
        profileId: target.profile.id,
        protocol: resolved.desired.protocol,
        endpoint: resolved.desired.endpoint,
        credential: resolved.desired.secret,
        model: resolved.desired.model,
      });
    },
    async testModel(context, target, signal) {
      const native = await readNative(context, options.authPath);
      const resolved = await resolveDesired(
        target,
        native,
        options.secretStore,
      );
      if (!resolved.desired || resolved.desired.native === true) {
        return emptyModel(
          target.profile,
          target.modelMappings,
          unavailableStatus(resolved.blockedReasons),
          now,
        );
      }
      return probes.testModel(
        {
          profileId: target.profile.id,
          protocol: resolved.desired.protocol,
          endpoint: resolved.desired.endpoint,
          credential: resolved.desired.secret,
          model: resolved.desired.model,
        },
        signal,
      );
    },
    async inspect(context) {
      return (await readNative(context, options.authPath)).state;
    },
    async importCurrent(context) {
      return importPreview(await readNative(context, options.authPath));
    },
    async planActivation(input) {
      const native = await readNative(input.context, options.authPath);
      if (input.profile.platformId !== "opencode") {
        return reconcileAgentProviderState({
          profileId: input.profile.id,
          baseline: null,
          current: native.state,
          desired: { platformId: "opencode", values: {} },
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
          platformId: "opencode",
          values: resolved.desired
            ? publicDesiredValues(
                resolved.desired,
                native.paths.configRelativePath,
              )
            : {},
        },
        supportedKeys: [
          "providerId",
          "package",
          "protocol",
          "endpoint",
          "model",
          "secondaryModel",
          "authOwnership",
          "credentialStatus",
          "configRelativePath",
          "v2ProviderConfig",
          "authorizationHeaderConflict",
        ],
        blockedReasons: resolved.blockedReasons,
      });
    },
    async apply(context, plan, target) {
      const native = await readNative(context, options.authPath);
      if (plan.currentDigest !== native.state.nativeDigest) {
        throw new Error("AGENT_PROVIDER_PLAN_STALE");
      }
      const resolved = await resolveDesired(
        target,
        native,
        options.secretStore,
      );
      if (
        !resolved.desired &&
        resolved.blockedReasons.some((reason) => reason.includes("secret"))
      ) {
        throw new Error("AGENT_OPENCODE_PROVIDER_SECRET_UNAVAILABLE");
      }
      if (
        plan.platformId !== "opencode" ||
        plan.profileId !== target.profile.id ||
        plan.adapterVersion !== ADAPTER_VERSION ||
        plan.status !== "apply" ||
        !plan.canApply
      ) {
        throw new Error("AGENT_OPENCODE_PROVIDER_PLAN_INVALID");
      }
      if (!resolved.desired) {
        throw new Error("AGENT_OPENCODE_PROVIDER_PROFILE_INVALID");
      }
      const inheritedSecondary =
        typeof native.inherited.small_model === "string";
      const nextConfig =
        resolved.desired.native === true
          ? renderOpenCodeSelection(
              native.configRaw,
              resolved.desired.providerId,
              resolved.desired.model,
              resolved.desired.secondaryModel,
              inheritedSecondary,
            )
          : renderOpenCodeConfig(
              native.configRaw,
              native.config,
              resolved.desired,
              inheritedSecondary,
            );
      const nextAuth =
        resolved.desired.native === true
          ? null
          : renderOpenCodeAuth(
              native.auth,
              resolved.desired.providerId,
              resolved.desired.secret,
            );
      const backupRef = await createEncryptedConfigBackup({
        backupRoot: options.backupRoot,
        agentId: "opencode",
        sourcePath: native.paths.bundlePath,
        content: backupContent(native, resolved.desired.native),
        encryption: options.backupEncryption,
      });
      await options.hooks?.beforeWrite?.();
      try {
        const beforeWrite = await readNative(context, options.authPath);
        if (beforeWrite.state.nativeDigest !== native.state.nativeDigest)
          throw new Error("AGENT_PROVIDER_PLAN_STALE");
      } catch {
        throw new Error("AGENT_PROVIDER_PLAN_STALE");
      }
      try {
        await atomicWrite(native.paths.configPath, nextConfig);
        await options.hooks?.afterConfigWrite?.();
        if (nextAuth !== null)
          await atomicWrite(native.paths.authPath, nextAuth);
        await options.hooks?.afterWrite?.();
        const after = await readNative(context, options.authPath);
        if (
          !verifyDesired(
            after.state,
            resolved.desired,
            native.paths.configRelativePath,
          )
        ) {
          throw new Error("AGENT_OPENCODE_PROVIDER_VERIFICATION_FAILED");
        }
        return {
          platformId: "opencode",
          profileId: plan.profileId,
          adapterVersion: ADAPTER_VERSION,
          nativeDigestBefore: native.state.nativeDigest,
          nativeDigestAfter: after.state.nativeDigest,
          backupRef,
          appliedAt: now(),
        };
      } catch (error) {
        await restoreBundle(native.paths, {
          version: 1,
          configRelativePath: native.paths.configRelativePath,
          config: native.configRaw,
          auth: native.authRaw,
          ...(resolved.desired.native ? { preserveAuth: true as const } : {}),
        });
        throw error;
      }
    },
    async verify(context, plan, receipt) {
      const state = (await readNative(context, options.authPath)).state;
      const fieldsMatch = plan.decisions.every(
        (decision) =>
          decision.status !== "apply" ||
          state.values[decision.field] === decision.desired,
      );
      const verified =
        receipt.platformId === "opencode" &&
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
    async rollback(context, receipt) {
      try {
        const native = await readNative(context, options.authPath);
        if (!receipt.backupRef) {
          throw new Error("AGENT_OPENCODE_PROVIDER_BACKUP_INVALID");
        }
        const bundle = parseBackup(
          await readEncryptedConfigBackup({
            backupRoot: options.backupRoot,
            backupRef: receipt.backupRef,
            encryption: options.backupEncryption,
          }),
        );
        await restoreBundle(native.paths, bundle);
        const restored = await readNative(context, options.authPath);
        // Existing encrypted v1 receipts used a single-file digest. Keep this
        // conversion at recovery only; normal reads use the merged v2 state.
        const restoredDigest =
          receipt.adapterVersion === "opencode-provider-profile-v1"
            ? digest(restored.configRaw, restored.authRaw)
            : restored.state.nativeDigest;
        return {
          restored: restoredDigest === receipt.nativeDigestBefore,
          nativeDigest: restored.state.nativeDigest,
          ...(restoredDigest === receipt.nativeDigestBefore
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
