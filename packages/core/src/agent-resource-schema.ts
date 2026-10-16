import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type {
  AgentProviderModelMapping,
  AgentProviderProfile,
} from "@prompthub/shared/types/agent";
import type {
  AgentIdentityPreferences,
  BuiltinAgentOverrideConfig,
  CustomAgentConfig,
} from "@prompthub/shared/types/settings";
import {
  assertAgentProviderPublicConfig,
  normalizeAgentProviderEndpoint,
} from "@prompthub/shared/utils/agent-provider-config";

import {
  readResourceBundle,
  type ResourceBundleManifest,
} from "./resource-bundle";
import {
  resolveResourceBundleWriteRevision,
  writeResourceBundle,
  type ResourceBundleWritePolicy,
} from "./resource-bundle-publication";

export const AGENT_PROVIDER_RESOURCE_KIND = "prompthub-agent-provider-resource";
export const AGENT_PROVIDER_RESOURCE_SCHEMA_VERSION = 1;
export const AGENT_DEVICE_CONFIG_KIND = "prompthub-agent-device-config";

const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const PROFILE_SOURCES = new Set([
  "manual",
  "native-import",
  "universal",
  "import",
]);
const RELATIVE_PATH_FIELDS = [
  "skillsRelativePath",
  "mcpRelativePath",
  "pluginsRelativePath",
  "rulesRelativePath",
  "agentsRelativePath",
  "commandsRelativePath",
] as const;

type PortableAgentProviderProfile = Omit<AgentProviderProfile, "secretRef">;

export interface AgentProviderResourceDocument {
  kind: typeof AGENT_PROVIDER_RESOURCE_KIND;
  schemaVersion: 1;
  profile: PortableAgentProviderProfile;
  modelMappings: AgentProviderModelMapping[];
  requiresSecret: boolean;
  [key: string]: unknown;
}

export interface ReadAgentProviderResourceResult {
  profile: AgentProviderProfile;
  modelMappings: AgentProviderModelMapping[];
  requiresSecret: boolean;
  bundleManifest: ResourceBundleManifest;
  document: AgentProviderResourceDocument;
}

export interface AgentDeviceConfigDocument {
  kind: typeof AGENT_DEVICE_CONFIG_KIND;
  version: 1;
  deviceId: string;
  updatedAt: string;
  builtinAgentOverrides: Record<string, BuiltinAgentOverrideConfig>;
  customAgents: CustomAgentConfig[];
  disabledPlatformIds: string[];
  agentIdentityPreferences: AgentIdentityPreferences;
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertId(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !value ||
    Buffer.byteLength(value, "utf8") > 256 ||
    /[\u0000-\u001f\u007f/\\]/u.test(value)
  ) {
    throw new Error(`Agent resource ${label} is invalid`);
  }
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`Agent resource ${label} is invalid`);
}

function assertTimestamp(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error(`Agent resource ${label} is invalid`);
  }
}

function assertEpoch(value: unknown, label: string): asserts value is number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 0 ||
    !Number.isFinite(new Date(Number(value)).getTime())
  ) {
    throw new Error(`Agent resource ${label} is invalid`);
  }
}

function validatePlainPublicObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Agent resource ${label} is invalid`);
  assertAgentProviderPublicConfig(value);
  JSON.stringify(value);
  return value;
}

function validateProfile(value: unknown): PortableAgentProviderProfile {
  if (!isRecord(value)) throw new Error("Agent provider profile is invalid");
  assertId(value.id, "profile id");
  assertId(value.platformId, "platformId");
  assertString(value.name, "profile name");
  assertId(value.providerKind, "providerKind");
  assertId(value.protocol, "protocol");
  if (value.endpoint !== null && typeof value.endpoint !== "string")
    throw new Error("Agent provider endpoint is invalid");
  const endpoint = normalizeAgentProviderEndpoint(
    value.endpoint as string | null,
  );
  const config = validatePlainPublicObject(value.config, "profile config");
  if (typeof value.source !== "string" || !PROFILE_SOURCES.has(value.source))
    throw new Error("Agent provider source is invalid");
  if (typeof value.archived !== "boolean")
    throw new Error("Agent provider archived flag is invalid");
  if (value.secretRef !== undefined)
    throw new Error(
      "Agent provider resource cannot persist device secret refs",
    );
  assertEpoch(value.createdAt, "profile createdAt");
  assertEpoch(value.updatedAt, "profile updatedAt");
  if (value.updatedAt < value.createdAt)
    throw new Error("Agent provider timestamps are invalid");
  return {
    id: value.id,
    platformId: value.platformId,
    name: value.name.trim(),
    providerKind: value.providerKind,
    protocol: value.protocol,
    endpoint,
    config,
    source: value.source as AgentProviderProfile["source"],
    archived: value.archived,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function portableProfile(
  input: AgentProviderProfile,
): PortableAgentProviderProfile {
  const { secretRef: _secretRef, ...profile } = structuredClone(input);
  return profile;
}

function validateMapping(
  value: unknown,
  profileId: string,
): AgentProviderModelMapping {
  if (!isRecord(value)) throw new Error("Agent provider mapping is invalid");
  assertId(value.id, "mapping id");
  if (value.providerProfileId !== profileId)
    throw new Error("Agent provider mapping does not belong to its profile");
  assertId(value.routeKey, "mapping routeKey");
  assertString(value.modelId, "mapping modelId");
  const parameters = validatePlainPublicObject(
    value.parameters,
    "mapping parameters",
  );
  return {
    id: value.id,
    providerProfileId: profileId,
    routeKey: value.routeKey,
    modelId: value.modelId.trim(),
    parameters,
  };
}

function validateMappings(
  values: readonly unknown[],
  profileId: string,
): AgentProviderModelMapping[] {
  const mappings = values.map((value) => validateMapping(value, profileId));
  if (
    new Set(mappings.map((mapping) => mapping.id)).size !== mappings.length ||
    new Set(mappings.map((mapping) => mapping.routeKey)).size !==
      mappings.length
  ) {
    throw new Error("Agent provider resource contains duplicate mappings");
  }
  return mappings.sort((left, right) =>
    left.routeKey.localeCompare(right.routeKey),
  );
}

export function parseAgentProviderResourceDocument(
  value: unknown,
): AgentProviderResourceDocument {
  if (
    !isRecord(value) ||
    value.kind !== AGENT_PROVIDER_RESOURCE_KIND ||
    value.schemaVersion !== AGENT_PROVIDER_RESOURCE_SCHEMA_VERSION ||
    typeof value.requiresSecret !== "boolean" ||
    !Array.isArray(value.modelMappings)
  ) throw new Error("Agent provider resource header is unsupported");
  const profile = validateProfile(value.profile);
  return {
    kind: AGENT_PROVIDER_RESOURCE_KIND,
    schemaVersion: AGENT_PROVIDER_RESOURCE_SCHEMA_VERSION,
    profile,
    modelMappings: validateMappings(value.modelMappings, profile.id),
    requiresSecret: value.requiresSecret,
  };
}

function writeDocumentSource(directory: string, document: unknown): string {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filePath = path.join(directory, "agent.json");
  const content = `${JSON.stringify(document, null, 2)}\n`;
  if (Buffer.byteLength(content, "utf8") > MAX_DOCUMENT_BYTES)
    throw new Error("Agent provider resource byte limit exceeded");
  fs.writeFileSync(filePath, content, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  return filePath;
}

export function materializeAgentProviderResourceBundle(input: {
  bundlePath: string;
  profile: AgentProviderProfile;
  modelMappings: readonly AgentProviderModelMapping[];
  writePolicy?: ResourceBundleWritePolicy;
}): ResourceBundleManifest {
  const profile = validateProfile(portableProfile(input.profile));
  const modelMappings = validateMappings(
    structuredClone(input.modelMappings),
    profile.id,
  );
  const document: AgentProviderResourceDocument = {
    kind: AGENT_PROVIDER_RESOURCE_KIND,
    schemaVersion: 1,
    profile,
    modelMappings,
    requiresSecret: Boolean(input.profile.secretRef),
  };
  const parentPath = path.dirname(input.bundlePath);
  fs.mkdirSync(parentPath, { recursive: true });
  const sourceRoot = path.join(
    parentPath,
    `.agent-sources-${crypto.randomUUID()}`,
  );
  try {
    const sourcePath = writeDocumentSource(sourceRoot, document);
    const revision = resolveResourceBundleWriteRevision(
      input.bundlePath,
      "agent-provider",
      profile.id,
      1,
      input.writePolicy,
    );
    return writeResourceBundle(
      {
        bundlePath: input.bundlePath,
        resourceType: "agent-provider",
        resourceId: profile.id,
        schemaVersion: 1,
        revision,
        createdAt: new Date(profile.createdAt).toISOString(),
        updatedAt: new Date(profile.updatedAt).toISOString(),
        provenance: { source: "sqlite-agent-profile-shadow-export" },
        payloads: [{ path: "agent.json", sourcePath, role: "current" }],
      },
      { mode: input.writePolicy?.mode },
    ).manifest;
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
}

function parseJsonRecord(filePath: string): Record<string, unknown> {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_DOCUMENT_BYTES)
    throw new Error("Agent provider resource document is invalid");
  try {
    const value: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!isRecord(value)) throw new Error("document is not an object");
    return value;
  } catch (error) {
    throw new Error("Agent provider resource contains invalid JSON", {
      cause: error,
    });
  }
}

export function readAgentProviderResourceBundle(
  bundlePath: string,
): ReadAgentProviderResourceResult {
  const bundle = readResourceBundle(bundlePath, {
    expectedResourceType: "agent-provider",
  });
  if (
    bundle.manifest.payloadFiles.length !== 1 ||
    bundle.manifest.payloadFiles[0].path !== "agent.json" ||
    bundle.manifest.payloadFiles[0].role !== "current"
  ) {
    throw new Error("Agent provider resource payload is invalid");
  }
  const value = parseJsonRecord(path.join(bundlePath, "agent.json"));
  if (
    value.kind !== AGENT_PROVIDER_RESOURCE_KIND ||
    value.schemaVersion !== 1 ||
    typeof value.requiresSecret !== "boolean" ||
    !Array.isArray(value.modelMappings)
  ) {
    throw new Error("Agent provider resource header is unsupported");
  }
  const profile = validateProfile(value.profile);
  if (profile.id !== bundle.manifest.resourceId)
    throw new Error("Agent provider resource id does not match its bundle");
  const modelMappings = validateMappings(value.modelMappings, profile.id);
  const secretRef = value.requiresSecret
    ? `agent-provider:${profile.id}`
    : null;
  const document = {
    ...value,
    kind: AGENT_PROVIDER_RESOURCE_KIND,
    schemaVersion: 1,
    profile,
    modelMappings,
    requiresSecret: value.requiresSecret,
  } as AgentProviderResourceDocument;
  return {
    profile: { ...profile, secretRef },
    modelMappings,
    requiresSecret: value.requiresSecret,
    bundleManifest: bundle.manifest,
    document,
  };
}

function validateAbsolutePath(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !value ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    (!path.posix.isAbsolute(value) && !path.win32.isAbsolute(value))
  ) {
    throw new Error(`Agent device ${label} is invalid`);
  }
  return path.normalize(value);
}

function validateRelativePath(
  value: unknown,
  label: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    !value ||
    /\p{Cc}|\\/u.test(value) ||
    path.posix.isAbsolute(value) ||
    path.posix.normalize(value) !== value ||
    value
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Agent device ${label} is invalid`);
  }
  return value;
}

function validateConfigPaths(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value))
    throw new Error("Agent device configRelativePaths is invalid");
  const paths = value.map((entry, index) =>
    validateRelativePath(entry, `configRelativePaths[${index}]`),
  ) as string[];
  if (new Set(paths).size !== paths.length)
    throw new Error("Agent device configRelativePaths contains duplicates");
  return paths;
}

function validateAssetConfig(
  value: unknown,
  requireRoot: boolean,
): BuiltinAgentOverrideConfig {
  if (!isRecord(value)) throw new Error("Agent device asset config is invalid");
  const rootPath =
    value.rootPath === undefined
      ? undefined
      : validateAbsolutePath(value.rootPath, "rootPath");
  if (requireRoot && !rootPath)
    throw new Error("Agent device custom Agent rootPath is required");
  const result: BuiltinAgentOverrideConfig = {
    ...(rootPath ? { rootPath } : {}),
  };
  for (const field of RELATIVE_PATH_FIELDS) {
    const relativePath = validateRelativePath(value[field], field);
    if (relativePath) result[field] = relativePath;
  }
  const configRelativePaths = validateConfigPaths(value.configRelativePaths);
  if (configRelativePaths) result.configRelativePaths = configRelativePaths;
  return result;
}

function validateCustomAgent(value: unknown): CustomAgentConfig {
  if (!isRecord(value)) throw new Error("Agent device custom Agent is invalid");
  assertId(value.id, "custom Agent id");
  assertString(value.name, "custom Agent name");
  if (value.enabled !== undefined && typeof value.enabled !== "boolean")
    throw new Error("Agent device custom Agent enabled is invalid");
  const config = validateAssetConfig(value, true);
  return {
    id: value.id,
    name: value.name.trim(),
    rootPath: config.rootPath!,
    enabled: value.enabled !== false,
    ...Object.fromEntries(
      Object.entries(config).filter(([key]) => key !== "rootPath"),
    ),
  } as CustomAgentConfig;
}

function validateIdentityPreferences(value: unknown): AgentIdentityPreferences {
  if (!isRecord(value))
    throw new Error("Agent device identity preferences are invalid");
  const result: AgentIdentityPreferences = {};
  for (const [platformId, preference] of Object.entries(value)) {
    if (platformId !== "codex" || !isRecord(preference))
      throw new Error("Agent device identity preference platform is invalid");
    if (
      !["codex", "chatgpt"].includes(String(preference.name)) ||
      !["codex", "chatgpt"].includes(String(preference.icon))
    ) {
      throw new Error("Agent device identity preference is invalid");
    }
    result.codex = {
      name: preference.name as "codex" | "chatgpt",
      icon: preference.icon as "codex" | "chatgpt",
    };
  }
  return result;
}

function validateDeviceConfig(input: {
  deviceId: unknown;
  updatedAt: unknown;
  builtinAgentOverrides: unknown;
  customAgents: unknown;
  disabledPlatformIds: unknown;
  agentIdentityPreferences: unknown;
}): AgentDeviceConfigDocument {
  assertId(input.deviceId, "device id");
  assertTimestamp(input.updatedAt, "device updatedAt");
  if (!isRecord(input.builtinAgentOverrides))
    throw new Error("Agent device built-in overrides are invalid");
  const builtinAgentOverrides = Object.fromEntries(
    Object.entries(input.builtinAgentOverrides).map(([id, config]) => {
      assertId(id, "built-in Agent id");
      return [id, validateAssetConfig(config, false)];
    }),
  );
  if (!Array.isArray(input.customAgents))
    throw new Error("Agent device custom Agents are invalid");
  const customAgents = input.customAgents.map(validateCustomAgent);
  if (
    new Set(customAgents.map((agent) => agent.id)).size !==
      customAgents.length ||
    new Set(customAgents.map((agent) => agent.rootPath.toLocaleLowerCase()))
      .size !== customAgents.length
  ) {
    throw new Error("Agent device custom Agents contain duplicate identities");
  }
  if (
    !Array.isArray(input.disabledPlatformIds) ||
    input.disabledPlatformIds.some((id) => typeof id !== "string")
  )
    throw new Error("Agent device disabled platform ids are invalid");
  const disabledPlatformIds = [
    ...new Set(input.disabledPlatformIds as string[]),
  ].sort();
  for (const id of disabledPlatformIds) assertId(id, "disabled platform id");
  const agentIdentityPreferences = validateIdentityPreferences(
    input.agentIdentityPreferences,
  );
  return {
    kind: AGENT_DEVICE_CONFIG_KIND,
    version: 1,
    deviceId: input.deviceId,
    updatedAt: input.updatedAt,
    builtinAgentOverrides,
    customAgents,
    disabledPlatformIds,
    agentIdentityPreferences,
  };
}

export function createAgentDeviceConfigDocument(input: {
  deviceId: string;
  updatedAt?: string;
  builtinAgentOverrides: Record<string, BuiltinAgentOverrideConfig>;
  customAgents: readonly CustomAgentConfig[];
  disabledPlatformIds: readonly string[];
  agentIdentityPreferences: AgentIdentityPreferences;
}): AgentDeviceConfigDocument {
  return validateDeviceConfig({
    ...input,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    customAgents: structuredClone(input.customAgents),
    disabledPlatformIds: [...input.disabledPlatformIds],
  });
}

export function parseAgentDeviceConfigDocument(
  content: string,
  options: { expectedDeviceId: string },
): AgentDeviceConfigDocument {
  if (Buffer.byteLength(content, "utf8") > MAX_DOCUMENT_BYTES)
    throw new Error("Agent device config byte limit exceeded");
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    throw new Error("Agent device config contains invalid JSON", {
      cause: error,
    });
  }
  if (
    !isRecord(value) ||
    value.kind !== AGENT_DEVICE_CONFIG_KIND ||
    value.version !== 1 ||
    value.deviceId !== options.expectedDeviceId
  ) {
    throw new Error("Agent device config header is invalid");
  }
  return validateDeviceConfig({
    deviceId: value.deviceId,
    updatedAt: value.updatedAt,
    builtinAgentOverrides: value.builtinAgentOverrides,
    customAgents: value.customAgents,
    disabledPlatformIds: value.disabledPlatformIds,
    agentIdentityPreferences: value.agentIdentityPreferences,
  });
}
