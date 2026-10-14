import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type {
  McpServerConfig,
  McpTargetBinding,
  McpTargetEntryDigest,
} from "@prompthub/shared/types/mcp";
import { isMcpTargetKind, MCP_TARGET_KINDS } from "@prompthub/shared/types/mcp";
import { normalizeMcpNativeOptions } from "@prompthub/shared/utils/mcp-native-options";
import type { McpSecretReferences } from "@prompthub/shared/types/mcp-storage";

import {
  readResourceBundle,
  type ResourceBundleManifest,
  type ResourceBundlePayloadSource,
} from "./resource-bundle";
import {
  resolveResourceBundleWriteRevision,
  writeResourceBundle,
  type ResourceBundleWritePolicy,
} from "./resource-bundle-publication";

export const MCP_SERVER_RESOURCE_KIND = "prompthub-mcp-server-resource";
export const MCP_SERVER_VERSION_RESOURCE_KIND =
  "prompthub-mcp-server-version-resource";
export const MCP_SERVER_RESOURCE_SCHEMA_VERSION = 1;
export const MCP_BINDING_CONFIG_KIND = "prompthub-mcp-binding-config";
export const MCP_SERVER_RESOURCE_MAX_VERSION = 999_999;

export const MCP_RESOURCE_MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = MCP_RESOURCE_MAX_DOCUMENT_BYTES;
const TRANSPORTS = new Set(["stdio", "streamable-http", "sse"]);
const SCOPES = new Set(["global", "workspace", "custom"]);
const EMBEDDED_SECRET_PATTERN =
  /(?:token|secret|password|passwd|api[-_]?key|authorization)[=:]\s*[^$<{\s][^\s]*/iu;

export type McpResourceSecretReferences = McpSecretReferences;

export interface ExtractedMcpSecret {
  ref: string;
  field: "env" | "headers" | "oauth";
  key: string;
  value: string;
  version: number;
}

export interface McpServerResourceVersionInput {
  version: number;
  server: McpServerConfig;
  createdAt: string;
  note?: string;
  restoredFromVersion?: number;
}

export interface McpServerResourceDocument {
  kind: typeof MCP_SERVER_RESOURCE_KIND;
  schemaVersion: 1;
  currentVersion: number;
  semanticDigest: string;
  server: McpServerConfig;
  secretReferences: McpResourceSecretReferences;
  [key: string]: unknown;
}

export interface McpServerVersionResourceDocument {
  kind: typeof MCP_SERVER_VERSION_RESOURCE_KIND;
  schemaVersion: 1;
  version: number;
  semanticDigest: string;
  createdAt: string;
  note?: string;
  restoredFromVersion?: number;
  server: McpServerConfig;
  secretReferences: McpResourceSecretReferences;
  [key: string]: unknown;
}

export interface MaterializeMcpServerResourceInput {
  bundlePath: string;
  server: McpServerConfig;
  currentVersion?: number;
  versions?: readonly McpServerResourceVersionInput[];
  writePolicy?: ResourceBundleWritePolicy;
}

export interface MaterializeMcpServerResourceResult {
  manifest: ResourceBundleManifest;
  extractedSecrets: ExtractedMcpSecret[];
}

export interface ReadMcpServerResourceResult {
  server: McpServerConfig;
  currentVersion: number;
  semanticDigest: string;
  secretReferences: McpResourceSecretReferences;
  versions: McpServerVersionResourceDocument[];
  bundleManifest: ResourceBundleManifest;
  document: McpServerResourceDocument;
}

export interface McpBindingConfigDocument {
  kind: typeof MCP_BINDING_CONFIG_KIND;
  version: 1;
  deviceId: string;
  updatedAt: string;
  bindings: McpTargetBinding[];
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
    throw new Error(`MCP resource ${label} is invalid`);
  }
}

function assertBindingId(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !value ||
    Buffer.byteLength(value, "utf8") > 4096 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error("MCP resource binding id is invalid");
  }
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string")
    throw new Error(`MCP resource ${label} must be a string`);
}

function assertOptionalString(value: unknown, label: string): void {
  if (value !== undefined && typeof value !== "string")
    throw new Error(`MCP resource ${label} must be a string`);
}

function assertEpoch(value: unknown, label: string): asserts value is number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 0 ||
    !Number.isFinite(new Date(Number(value)).getTime())
  ) {
    throw new Error(`MCP resource ${label} is invalid`);
  }
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
    throw new Error(`MCP resource ${label} is invalid`);
  }
}

function positiveVersion(value: unknown, label: string): number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 1 ||
    Number(value) > MCP_SERVER_RESOURCE_MAX_VERSION
  )
    throw new Error(`MCP resource ${label} is invalid`);
  return Number(value);
}

function validateStringArray(
  value: unknown,
  label: string,
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    throw new Error(`MCP resource ${label} is invalid`);
  return value;
}

function validateStringMap(
  value: unknown,
  label: string,
): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    Object.entries(value).some(
      ([key, item]) =>
        !key || /[\u0000-\u001f\u007f]/u.test(key) || typeof item !== "string",
    )
  ) {
    throw new Error(`MCP resource ${label} is invalid`);
  }
  return value as Record<string, string>;
}

function assertPortableUrl(value: string | undefined, label: string): void {
  if (value === undefined) return;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw new Error(`MCP resource ${label} is invalid`, { cause: error });
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  )
    throw new Error(`MCP resource ${label} is not a portable HTTP URL`);
  for (const key of parsed.searchParams.keys()) {
    if (/(?:token|secret|password|passwd|api[-_]?key|auth)/iu.test(key))
      throw new Error(`MCP resource ${label} contains an embedded credential`);
  }
}

function assertNoEmbeddedCredential(
  value: string | undefined,
  label: string,
): void {
  if (value && EMBEDDED_SECRET_PATTERN.test(value))
    throw new Error(`MCP resource ${label} contains an embedded credential`);
}

function validateSource(value: unknown): McpServerConfig["source"] {
  if (
    !isRecord(value) ||
    !["manual", "market", "import"].includes(String(value.type))
  )
    throw new Error("MCP resource source is invalid");
  for (const field of [
    "id",
    "label",
    "url",
    "marketSourceId",
    "marketSourceUrl",
    "installedTemplateVersion",
    "installedTemplateFingerprint",
    "marketLastError",
  ])
    assertOptionalString(value[field], `source ${field}`);
  assertPortableUrl(value.url as string | undefined, "source url");
  assertPortableUrl(
    value.marketSourceUrl as string | undefined,
    "source marketSourceUrl",
  );
  if (value.marketLastCheckedAt !== undefined)
    assertEpoch(value.marketLastCheckedAt, "source marketLastCheckedAt");
  return value as unknown as McpServerConfig["source"];
}

function validateServer(
  value: unknown,
  allowSecrets: boolean,
): McpServerConfig {
  if (!isRecord(value)) throw new Error("MCP resource server is invalid");
  assertId(value.id, "server id");
  assertId(value.name, "server name");
  assertString(value.displayName, "displayName");
  assertOptionalString(value.description, "description");
  assertOptionalString(value.notes, "notes");
  if (typeof value.transport !== "string" || !TRANSPORTS.has(value.transport))
    throw new Error("MCP resource transport is invalid");
  assertOptionalString(value.command, "command");
  assertOptionalString(value.cwd, "cwd");
  assertOptionalString(value.url, "url");
  const args = validateStringArray(value.args, "args");
  const tags = validateStringArray(value.tags, "tags");
  const env = validateStringMap(value.env, "env");
  const headers = validateStringMap(value.headers, "headers");
  const envRefs = validateStringMap(value.envRefs, "envRefs");
  const headerRefs = validateStringMap(value.headerRefs, "headerRefs");
  const nativeOptions = normalizeMcpNativeOptions(value);
  const containsLiteralCredential = [env, headers].some((entries) =>
    Object.values(entries ?? {}).some((item) => item.length > 0),
  );
  if (
    !allowSecrets &&
    (containsLiteralCredential || Boolean(nativeOptions.oauth?.clientSecret))
  )
    throw new Error("MCP resource cannot contain literal credentials");
  if (value.transport === "stdio" && !String(value.command ?? "").trim())
    throw new Error("MCP resource stdio server requires command");
  if (value.transport !== "stdio")
    assertPortableUrl(value.url as string, "url");
  for (const [index, argument] of (args ?? []).entries())
    assertNoEmbeddedCredential(argument, `args[${index}]`);
  assertNoEmbeddedCredential(value.command as string | undefined, "command");
  if (typeof value.enabled !== "boolean")
    throw new Error("MCP resource enabled is invalid");
  if (value.isFavorite !== undefined && typeof value.isFavorite !== "boolean")
    throw new Error("MCP resource favorite is invalid");
  assertEpoch(value.createdAt, "createdAt");
  assertEpoch(value.updatedAt, "updatedAt");
  const source = validateSource(value.source);
  return {
    ...(value as unknown as McpServerConfig),
    args,
    tags,
    env,
    headers,
    envRefs,
    headerRefs,
    ...nativeOptions,
    source,
  };
}

function secretRef(
  serverId: string,
  version: number,
  field: string,
  key: string,
): string {
  const serverHash = crypto.createHash("sha256").update(serverId).digest("hex");
  const keyHash = crypto.createHash("sha256").update(key).digest("hex");
  return `mcp.${serverHash}.v${String(version).padStart(6, "0")}.${field}.${keyHash}`;
}

function extractSecrets(
  server: McpServerConfig,
  version: number,
): {
  server: McpServerConfig;
  references: McpResourceSecretReferences;
  secrets: ExtractedMcpSecret[];
} {
  const portable = structuredClone(server);
  const references: McpResourceSecretReferences = { env: {}, headers: {} };
  const secrets: ExtractedMcpSecret[] = [];
  for (const field of ["env", "headers"] as const) {
    const placeholders: Record<string, string> = {};
    for (const [key, value] of Object.entries(server[field] ?? {})) {
      if (value.length === 0) {
        Object.defineProperty(placeholders, key, {
          value,
          enumerable: true,
          writable: true,
          configurable: true,
        });
        continue;
      }
      const ref = secretRef(server.id, version, field, key);
      Object.defineProperty(references[field], key, {
        value: ref,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      secrets.push({ ref, field, key, value, version });
    }
    if (Object.keys(placeholders).length > 0) {
      portable[field] = placeholders;
    } else {
      delete portable[field];
    }
  }
  const clientSecret = server.oauth?.clientSecret;
  if (clientSecret) {
    const ref = secretRef(server.id, version, "oauth", "clientSecret");
    references.oauth = { clientSecret: ref };
    secrets.push({
      ref,
      field: "oauth",
      key: "clientSecret",
      value: clientSecret,
      version,
    });
    if (portable.oauth) delete portable.oauth.clientSecret;
  }
  return { server: portable, references, secrets };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

export function getMcpVersionedDefinition(
  server: McpServerConfig,
): Record<string, unknown> {
  // Excluding named metadata fields requires a keyed snapshot, not mutations to the typed server.
  const snapshot = structuredClone(server) as unknown as Record<
    string,
    unknown
  >;
  for (const field of ["isFavorite", "tags", "notes", "createdAt", "updatedAt"])
    delete snapshot[field];
  return snapshot;
}

function semanticSnapshot(
  server: McpServerConfig,
  references: McpResourceSecretReferences,
): Record<string, unknown> {
  return { ...getMcpVersionedDefinition(server), secretReferences: references };
}

function semanticDigest(
  server: McpServerConfig,
  references: McpResourceSecretReferences,
): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stableValue(semanticSnapshot(server, references))))
    .digest("hex");
}

function versionPath(version: number): string {
  return `versions/${String(version).padStart(6, "0")}.json`;
}

function writeJsonSource(
  root: string,
  relativePath: string,
  value: unknown,
): string {
  const filePath = path.join(root, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(content, "utf8") > MAX_DOCUMENT_BYTES)
    throw new Error("MCP resource document byte limit exceeded");
  fs.writeFileSync(filePath, content, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  return filePath;
}

function defaultVersions(
  server: McpServerConfig,
): McpServerResourceVersionInput[] {
  return [
    {
      version: 1,
      server,
      createdAt: new Date(server.createdAt).toISOString(),
      note: "legacy baseline",
    },
  ];
}

function prepareVersionDocuments(
  server: McpServerConfig,
  currentVersion: number,
  inputs: readonly McpServerResourceVersionInput[],
): {
  documents: McpServerVersionResourceDocument[];
  secrets: ExtractedMcpSecret[];
} {
  const numbers = new Set<number>();
  const documents: McpServerVersionResourceDocument[] = [];
  const secrets: ExtractedMcpSecret[] = [];
  for (const input of inputs) {
    const version = positiveVersion(input.version, "version number");
    if (numbers.has(version))
      throw new Error("MCP resource contains a duplicate version");
    numbers.add(version);
    assertTimestamp(input.createdAt, "version createdAt");
    assertOptionalString(input.note, "version note");
    if (input.restoredFromVersion !== undefined)
      positiveVersion(input.restoredFromVersion, "restoredFromVersion");
    const validated = validateServer(structuredClone(input.server), true);
    if (validated.id !== server.id)
      throw new Error("MCP version does not belong to the owning server");
    const extracted = extractSecrets(validated, version);
    const portable = validateServer(extracted.server, false);
    documents.push({
      kind: MCP_SERVER_VERSION_RESOURCE_KIND,
      schemaVersion: 1,
      version,
      semanticDigest: semanticDigest(portable, extracted.references),
      createdAt: input.createdAt,
      ...(input.note === undefined ? {} : { note: input.note }),
      ...(input.restoredFromVersion === undefined
        ? {}
        : { restoredFromVersion: input.restoredFromVersion }),
      server: portable,
      secretReferences: extracted.references,
    });
    secrets.push(...extracted.secrets);
  }
  if (!numbers.has(currentVersion))
    throw new Error("MCP resource current version is missing");
  if (Math.max(...numbers) !== currentVersion)
    throw new Error(
      "MCP resource contains a version newer than currentVersion",
    );
  return {
    documents: documents.sort((left, right) => left.version - right.version),
    secrets,
  };
}

export function materializeMcpServerResourceBundle(
  input: MaterializeMcpServerResourceInput,
): MaterializeMcpServerResourceResult {
  const server = validateServer(structuredClone(input.server), true);
  const versions = input.versions?.length
    ? input.versions
    : defaultVersions(server);
  const currentVersion = positiveVersion(
    input.currentVersion ?? Math.max(...versions.map((item) => item.version)),
    "currentVersion",
  );
  const prepared = prepareVersionDocuments(server, currentVersion, versions);
  const current = prepared.documents.find(
    (item) => item.version === currentVersion,
  )!;
  const currentExtracted = extractSecrets(server, currentVersion);
  const portableServer = validateServer(currentExtracted.server, false);
  const digest = semanticDigest(portableServer, currentExtracted.references);
  if (digest !== current.semanticDigest)
    throw new Error(
      "MCP resource current server does not match current version",
    );
  const document: McpServerResourceDocument = {
    kind: MCP_SERVER_RESOURCE_KIND,
    schemaVersion: 1,
    currentVersion,
    semanticDigest: digest,
    server: portableServer,
    secretReferences: currentExtracted.references,
  };
  const parentPath = path.dirname(input.bundlePath);
  fs.mkdirSync(parentPath, { recursive: true });
  const sourceRoot = path.join(
    parentPath,
    `.mcp-sources-${crypto.randomUUID()}`,
  );
  try {
    fs.mkdirSync(sourceRoot, { mode: 0o700 });
    const payloads: ResourceBundlePayloadSource[] = [
      {
        path: "server.json",
        sourcePath: writeJsonSource(sourceRoot, "server.json", document),
        role: "current",
      },
      ...prepared.documents.map((version) => {
        const relativePath = versionPath(version.version);
        return {
          path: relativePath,
          sourcePath: writeJsonSource(sourceRoot, relativePath, version),
          role: "version",
        };
      }),
    ];
    const revision = resolveResourceBundleWriteRevision(
      input.bundlePath,
      "mcp-server",
      server.id,
      currentVersion,
      input.writePolicy,
    );
    const manifest = writeResourceBundle(
      {
        bundlePath: input.bundlePath,
        resourceType: "mcp-server",
        resourceId: server.id,
        schemaVersion: 1,
        revision,
        createdAt: new Date(server.createdAt).toISOString(),
        updatedAt: new Date(server.updatedAt).toISOString(),
        provenance: { source: "mcp-library-shadow-export" },
        payloads,
      },
      { mode: input.writePolicy?.mode },
    ).manifest;
    return { manifest, extractedSecrets: prepared.secrets };
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
}

function parseJsonRecord(filePath: string): Record<string, unknown> {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_DOCUMENT_BYTES)
    throw new Error("MCP resource document is invalid");
  try {
    const value: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!isRecord(value)) throw new Error("document is not an object");
    return value;
  } catch (error) {
    throw new Error("MCP resource document contains invalid JSON", {
      cause: error,
    });
  }
}

function validateSecretReferences(value: unknown): McpResourceSecretReferences {
  if (!isRecord(value))
    throw new Error("MCP resource secret references are invalid");
  return {
    env: validateStringMap(value.env, "secret env references") ?? {},
    headers: validateStringMap(value.headers, "secret header references") ?? {},
    ...(value.oauth !== undefined && {
      oauth: validateStringMap(value.oauth, "secret OAuth references"),
    }),
  };
}

function parseVersionDocument(
  value: Record<string, unknown>,
): McpServerVersionResourceDocument {
  if (
    value.kind !== MCP_SERVER_VERSION_RESOURCE_KIND ||
    value.schemaVersion !== 1
  )
    throw new Error("MCP version resource header is unsupported");
  const version = positiveVersion(value.version, "version number");
  assertTimestamp(value.createdAt, "version createdAt");
  assertOptionalString(value.note, "version note");
  if (value.restoredFromVersion !== undefined)
    positiveVersion(value.restoredFromVersion, "restoredFromVersion");
  const server = validateServer(value.server, false);
  const references = validateSecretReferences(value.secretReferences);
  const digest = semanticDigest(server, references);
  if (value.semanticDigest !== digest)
    throw new Error("MCP version resource semantic digest is invalid");
  return {
    ...value,
    kind: MCP_SERVER_VERSION_RESOURCE_KIND,
    schemaVersion: 1,
    version,
    semanticDigest: digest,
    createdAt: value.createdAt,
    server,
    secretReferences: references,
  } as McpServerVersionResourceDocument;
}

export {
  validateServer as validateMcpServer,
  extractSecrets as extractMcpSecrets,
  semanticDigest as computeMcpSemanticDigest,
  parseVersionDocument as parseMcpVersionDocument,
};

export function readMcpServerResourceBundle(
  bundlePath: string,
  requestedVersions?: readonly number[],
): ReadMcpServerResourceResult {
  let newestPath: string | undefined;
  const requestedPaths = new Set(requestedVersions?.map(versionPath));
  const bundle = readResourceBundle(bundlePath, {
    expectedResourceType: "mcp-server",
    ...(requestedVersions !== undefined && {
      verifyPayload: (file, manifest) => {
        newestPath ??= manifest.payloadFiles
          .filter((p) => p.role === "version")
          .map((p) => p.path)
          .sort()
          .at(-1);
        return (
          file.role === "current" ||
          file.path === newestPath ||
          requestedPaths.has(file.path)
        );
      },
    }),
  });
  const currentPayloads = bundle.manifest.payloadFiles.filter(
    (file) => file.role === "current",
  );
  if (currentPayloads.length !== 1 || currentPayloads[0].path !== "server.json")
    throw new Error("MCP resource current payload is invalid");
  if (
    bundle.manifest.payloadFiles.some(
      (file) => !["current", "version"].includes(String(file.role)),
    )
  )
    throw new Error("MCP resource payload role is unsupported");
  const value = parseJsonRecord(path.join(bundlePath, "server.json"));
  if (value.kind !== MCP_SERVER_RESOURCE_KIND || value.schemaVersion !== 1)
    throw new Error("MCP resource header is unsupported");
  const server = validateServer(value.server, false);
  if (server.id !== bundle.manifest.resourceId)
    throw new Error("MCP resource id does not match its bundle");
  const currentVersion = positiveVersion(
    value.currentVersion,
    "currentVersion",
  );
  const references = validateSecretReferences(value.secretReferences);
  const digest = semanticDigest(server, references);
  if (value.semanticDigest !== digest)
    throw new Error("MCP resource semantic digest is invalid");
  const versions = bundle.manifest.payloadFiles
    .filter((file) => file.role === "version")
    .filter(
      (file) =>
        requestedVersions === undefined ||
        file.path === versionPath(currentVersion) ||
        requestedPaths.has(file.path),
    )
    .map((file) => {
      const document = parseVersionDocument(
        parseJsonRecord(path.join(bundlePath, ...file.path.split("/"))),
      );
      if (file.path !== versionPath(document.version))
        throw new Error("MCP version resource path is invalid");
      if (document.server.id !== server.id)
        throw new Error("MCP version does not belong to the owning server");
      return document;
    })
    .sort((left, right) => left.version - right.version);
  const numbers = new Set(versions.map((version) => version.version));
  if (numbers.size !== versions.length)
    throw new Error("MCP resource contains a duplicate version");
  const current = versions.find(
    (version) => version.version === currentVersion,
  );
  if (!current || current.semanticDigest !== digest)
    throw new Error(
      "MCP resource current version does not match current server",
    );
  if (Math.max(...numbers) !== currentVersion)
    throw new Error(
      "MCP resource contains a version newer than currentVersion",
    );
  const document = {
    ...value,
    kind: MCP_SERVER_RESOURCE_KIND,
    schemaVersion: 1,
    currentVersion,
    semanticDigest: digest,
    server,
    secretReferences: references,
  } as McpServerResourceDocument;
  return {
    server,
    currentVersion,
    semanticDigest: digest,
    secretReferences: references,
    versions,
    bundleManifest: bundle.manifest,
    document,
  };
}

export async function hydrateMcpServerResourceSecrets(
  resource: ReadMcpServerResourceResult,
  readSecret: (ref: string) => Promise<string | null>,
): Promise<McpServerConfig> {
  const hydrated = structuredClone(resource.server);
  for (const field of ["env", "headers"] as const) {
    const values: Record<string, string> = { ...hydrated[field] };
    for (const [key, ref] of Object.entries(resource.secretReferences[field])) {
      const value = await readSecret(ref);
      if (value === null) throw new Error(`missing MCP secret: ${ref}`);
      Object.defineProperty(values, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    if (Object.keys(values).length > 0) hydrated[field] = values;
  }
  const ref = resource.secretReferences.oauth?.clientSecret;
  if (ref) {
    const value = await readSecret(ref);
    if (value === null) throw new Error(`missing MCP secret: ${ref}`);
    hydrated.oauth = { ...hydrated.oauth, clientSecret: value };
  }
  return hydrated;
}

export function hydrateMcpServerResourceSecretsSync(
  resource: ReadMcpServerResourceResult,
  readSecret: (ref: string) => string | null,
): McpServerConfig {
  const hydrated = structuredClone(resource.server);
  for (const field of ["env", "headers"] as const) {
    const values: Record<string, string> = { ...hydrated[field] };
    for (const [key, ref] of Object.entries(resource.secretReferences[field])) {
      const value = readSecret(ref);
      if (value === null) throw new Error(`missing MCP secret: ${ref}`);
      Object.defineProperty(values, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    if (Object.keys(values).length > 0) hydrated[field] = values;
  }
  const ref = resource.secretReferences.oauth?.clientSecret;
  if (ref) {
    const value = readSecret(ref);
    if (value === null) throw new Error(`missing MCP secret: ${ref}`);
    hydrated.oauth = { ...hydrated.oauth, clientSecret: value };
  }
  return hydrated;
}

export function hydrateMcpServerVersionSecretsSync(
  version: McpServerVersionResourceDocument,
  readSecret: (ref: string) => string | null,
): McpServerConfig {
  const hydrated = structuredClone(version.server);
  for (const field of ["env", "headers"] as const) {
    const values: Record<string, string> = { ...hydrated[field] };
    for (const [key, ref] of Object.entries(version.secretReferences[field])) {
      const value = readSecret(ref);
      if (value === null) throw new Error(`missing MCP secret: ${ref}`);
      Object.defineProperty(values, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    if (Object.keys(values).length > 0) hydrated[field] = values;
  }
  const ref = version.secretReferences.oauth?.clientSecret;
  if (ref) {
    const value = readSecret(ref);
    if (value === null) throw new Error(`missing MCP secret: ${ref}`);
    hydrated.oauth = { ...hydrated.oauth, clientSecret: value };
  }
  return hydrated;
}

function validateTargetPath(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !value ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    (!path.posix.isAbsolute(value) && !path.win32.isAbsolute(value))
  ) {
    throw new Error("MCP binding target path is invalid");
  }
}

function validateEntryDigest(
  value: unknown,
  serverId: string,
): McpTargetEntryDigest {
  if (
    !isRecord(value) ||
    value.algorithm !== "mcp-target-entry-sha256-v1" ||
    typeof value.digest !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.digest) ||
    typeof value.serverName !== "string"
  ) {
    throw new Error(`MCP binding entry digest is invalid for ${serverId}`);
  }
  assertEpoch(value.recordedAt, "binding digest recordedAt");
  return value as unknown as McpTargetEntryDigest;
}

function validateBinding(
  value: unknown,
  knownServerIds: ReadonlySet<string>,
): McpTargetBinding {
  if (!isRecord(value)) throw new Error("MCP binding is invalid");
  // Binding ids are opaque keys derived from target + scope + absolute path.
  // Unlike resource ids, valid persisted values therefore contain separators.
  assertBindingId(value.id);
  if (!Array.isArray(value.serverIds) || value.serverIds.length === 0)
    throw new Error("MCP binding serverIds are invalid");
  const serverIds = value.serverIds.map((serverId) => {
    assertId(serverId, "binding server id");
    if (!knownServerIds.has(serverId))
      throw new Error(`MCP binding references unknown MCP server: ${serverId}`);
    return serverId;
  });
  if (new Set(serverIds).size !== serverIds.length)
    throw new Error("MCP binding contains duplicate server ids");
  if (!isMcpTargetKind(value.target))
    throw new Error(
      `MCP binding target is invalid; expected ${MCP_TARGET_KINDS.join(", ")}`,
    );
  if (typeof value.scope !== "string" || !SCOPES.has(value.scope))
    throw new Error("MCP binding scope is invalid");
  validateTargetPath(value.path);
  if (typeof value.enabled !== "boolean")
    throw new Error("MCP binding enabled is invalid");
  assertEpoch(value.createdAt, "binding createdAt");
  assertEpoch(value.updatedAt, "binding updatedAt");
  if (value.lastAppliedAt !== undefined)
    assertEpoch(value.lastAppliedAt, "binding lastAppliedAt");
  let entryDigests: Record<string, McpTargetEntryDigest> | undefined;
  if (value.entryDigests !== undefined) {
    if (!isRecord(value.entryDigests))
      throw new Error("MCP binding entryDigests are invalid");
    entryDigests = Object.fromEntries(
      Object.entries(value.entryDigests).map(([serverId, digest]) => {
        if (!serverIds.includes(serverId))
          throw new Error("MCP binding digest references an unbound server");
        return [serverId, validateEntryDigest(digest, serverId)];
      }),
    );
  }
  return {
    ...(value as unknown as McpTargetBinding),
    serverIds,
    entryDigests,
  };
}

export function createMcpBindingConfigDocument(input: {
  deviceId: string;
  bindings: readonly McpTargetBinding[];
  knownServerIds: ReadonlySet<string>;
}): McpBindingConfigDocument {
  assertId(input.deviceId, "device id");
  const bindings = input.bindings.map((binding) =>
    validateBinding(structuredClone(binding), input.knownServerIds),
  );
  if (new Set(bindings.map((binding) => binding.id)).size !== bindings.length)
    throw new Error("MCP binding config contains duplicate binding ids");
  const updatedAt = new Date(
    Math.max(0, ...bindings.map((binding) => binding.updatedAt)),
  ).toISOString();
  return {
    kind: MCP_BINDING_CONFIG_KIND,
    version: 1,
    deviceId: input.deviceId,
    updatedAt,
    bindings: bindings.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function parseMcpBindingConfigDocument(
  content: string,
  options: {
    expectedDeviceId: string;
    knownServerIds: ReadonlySet<string>;
  },
): McpBindingConfigDocument {
  if (Buffer.byteLength(content, "utf8") > MAX_DOCUMENT_BYTES)
    throw new Error("MCP binding config byte limit exceeded");
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    throw new Error("MCP binding config contains invalid JSON", {
      cause: error,
    });
  }
  if (
    !isRecord(value) ||
    value.kind !== MCP_BINDING_CONFIG_KIND ||
    value.version !== 1 ||
    value.deviceId !== options.expectedDeviceId ||
    !Array.isArray(value.bindings)
  ) {
    throw new Error("MCP binding config header is invalid");
  }
  assertTimestamp(value.updatedAt, "binding config updatedAt");
  return createMcpBindingConfigDocument({
    deviceId: options.expectedDeviceId,
    bindings: value.bindings as McpTargetBinding[],
    knownServerIds: options.knownServerIds,
  });
}
