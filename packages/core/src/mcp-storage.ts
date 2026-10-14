import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { getDatabase, McpDB, type DatabaseAdapter } from "@prompthub/db";
import type {
  McpLibraryFile,
  McpServerConfig,
} from "@prompthub/shared/types/mcp";
import type {
  McpSecretReferences,
  McpStoredServer,
} from "@prompthub/shared/types/mcp-storage";
import { MCP_REDACTED_VALUE } from "@prompthub/shared/utils/mcp-config";
import type { CanonicalMcpLibraryOptions } from "./canonical-mcp-library";
import {
  publishCanonicalEntries,
  type CanonicalEntryMutation,
} from "./canonical-entry-publication";
import {
  computeMcpSemanticDigest,
  extractMcpSecrets,
  hydrateMcpServerVersionSecretsSync,
  validateMcpServer,
  createMcpBindingConfigDocument,
  MCP_SERVER_VERSION_RESOURCE_KIND,
  type McpServerVersionResourceDocument,
  MCP_SERVER_RESOURCE_MAX_VERSION,
  MCP_RESOURCE_MAX_DOCUMENT_BYTES,
} from "./mcp-resource-schema";
import {
  createMcpMasterKeyStore,
  decryptMcpSecret,
  encryptMcpSecret,
  McpCredentialError,
  type McpMasterKeyStore,
} from "./mcp-credentials";
import { getRuntimeStorageContext } from "./runtime-paths";
import type { RuntimeStorageContext } from "./runtime-storage-context";
import {
  mcpHistoryPath,
  reconcileMcpHistoricalContents,
} from "./mcp-history-files";
export { mcpHistoryPath, readMcpHistoricalDocument } from "./mcp-history-files";
import { assertStorageMaintenanceAvailable } from "./storage-maintenance-intent";

export interface McpStorageOptions extends CanonicalMcpLibraryOptions {
  database?: DatabaseAdapter.Database;
  masterKeyStore?: McpMasterKeyStore;
  storageContext?: RuntimeStorageContext;
}
export function mcpStorageContext(
  options: McpStorageOptions,
): RuntimeStorageContext {
  return options.storageContext ?? getRuntimeStorageContext();
}
const READ_REVISION = Symbol("mcp-sqlite-read-revision");
function revision(records: McpDB): string {
  return createHash("sha256")
    .update(JSON.stringify([records.servers(), records.bindings()]))
    .digest("hex");
}
export function mcpRecords(options: McpStorageOptions = {}): McpDB {
  const records = new McpDB(options.database ?? getDatabase());
  const state = records.state();
  if (!state || !state.adoptedAt)
    throw new Error("MCP SQLite storage has not been initialized");
  return records;
}
export function mcpSecretReader(
  options: McpStorageOptions,
  redacted = false,
): (ref: string) => string | null {
  if (redacted) return () => MCP_REDACTED_VALUE;
  const records = mcpRecords(options),
    store = options.masterKeyStore ?? createMcpMasterKeyStore();
  return (ref) => {
    const secret = records.secret(ref);
    if (!secret) throw new Error("MCP encrypted credential record is missing");
    if (secret.availability === "unavailable") throw new McpCredentialError();
    return decryptMcpSecret(secret, store);
  };
}
function currentDocument(
  records: McpDB,
  row: McpStoredServer,
): McpServerVersionResourceDocument {
  const meta = records.version(row.server.id, row.currentVersion);
  if (!meta) throw new Error("MCP current version metadata is missing");
  const server = validateMcpServer(row.server, false);
  if (
    computeMcpSemanticDigest(server, meta.secretReferences) !==
    meta.semanticDigest
  )
    throw new Error("MCP current definition does not match its version");
  return {
    kind: MCP_SERVER_VERSION_RESOURCE_KIND,
    schemaVersion: 1,
    ...meta,
    server,
  };
}
export function hydrateMcpStoredServer(
  row: McpStoredServer,
  options: McpStorageOptions,
  redacted = false,
): McpServerConfig {
  return hydrateMcpServerVersionSecretsSync(
    currentDocument(mcpRecords(options), row),
    mcpSecretReader(options, redacted),
  );
}
export function readMcpSqliteLibrary(
  options: McpStorageOptions = {},
  redacted = false,
): McpLibraryFile {
  const records = mcpRecords(options),
    reader = mcpSecretReader(options, redacted);
  const servers = records
    .servers()
    .map((row) =>
      hydrateMcpServerVersionSecretsSync(currentDocument(records, row), reader),
    );
  const bindings = records.bindings();
  return Object.assign(
    {
      kind: "prompthub-mcp-library" as const,
      version: 1 as const,
      updatedAt: new Date(
        Math.max(
          0,
          ...servers.map((s) => s.updatedAt),
          ...bindings.map((b) => b.updatedAt),
        ),
      ).toISOString(),
      servers,
      bindings,
    },
    { [READ_REVISION]: revision(records) },
  );
}
function retainOrEncrypt(
  server: McpServerConfig,
  version: number,
  previous: McpSecretReferences | undefined,
  records: McpDB,
  options: McpStorageOptions,
): { server: McpServerConfig; references: McpSecretReferences } {
  const input = validateMcpServer(structuredClone(server), true);
  const extracted = extractMcpSecrets(input, version);
  const keys = options.masterKeyStore ?? createMcpMasterKeyStore();
  const state = records.state();
  if (!state) throw new Error("MCP storage state is missing");
  for (const secret of extracted.secrets) {
    const oldRef = previous?.[secret.field]?.[secret.key];
    const old = oldRef ? records.secret(oldRef) : null;
    if (secret.value === MCP_REDACTED_VALUE && !old)
      throw new Error("A masked MCP credential cannot create a new credential");
    if (
      old &&
      (secret.value === MCP_REDACTED_VALUE ||
        (old.availability === "available" &&
          decryptMcpSecret(old, keys) === secret.value))
    ) {
      Object.defineProperty(
        (extracted.references[secret.field] ??= {}),
        secret.key,
        {
          value: old.ref,
          enumerable: true,
          writable: true,
          configurable: true,
        },
      );
    } else {
      records.putSecret(
        encryptMcpSecret(
          { ref: secret.ref, serverId: server.id, keyId: state.keyId },
          secret.value,
          keys,
          !records.hasSecretsForKey(state.keyId),
        ),
      );
    }
  }
  return {
    server: validateMcpServer(extracted.server, false),
    references: extracted.references,
  };
}
export interface McpVersionAppend {
  note?: string;
  restoredFromVersion?: number;
  force?: boolean;
}
export function storeMcpVersionContent(
  records: McpDB,
  document: McpServerVersionResourceDocument,
  options: McpStorageOptions,
  mutations: CanonicalEntryMutation[],
): void {
  const content = `${JSON.stringify(document, null, 2)}\n`;
  if (Buffer.byteLength(content, "utf8") > MCP_RESOURCE_MAX_DOCUMENT_BYTES)
    throw new Error(
      "MCP historical content exceeds the resource document size limit",
    );
  const contentPath = `${document.server.id}/versions/${String(document.version).padStart(6, "0")}.json`;
  const targetPath = mcpHistoryPath(
    contentPath,
    path.join(mcpStorageContext(options).dataPath, "mcp"),
  );
  if (fs.existsSync(targetPath))
    throw new Error(
      "Unreferenced MCP historical content requires startup reconciliation",
    );
  mutations.push({
    targetPath,
    prepare(stage) {
      fs.writeFileSync(stage, content, { flag: "wx", mode: 0o600 });
    },
  });
  records.putVersion({
    serverId: document.server.id,
    version: document.version,
    createdAt: document.createdAt,
    note: document.note,
    restoredFromVersion: document.restoredFromVersion,
    semanticDigest: document.semanticDigest,
    contentSha256: createHash("sha256").update(content).digest("hex"),
    contentPath,
    secretReferences: document.secretReferences,
  });
}
export function appendMcpVersion(
  records: McpDB,
  server: McpServerConfig,
  options: McpStorageOptions,
  mutations: CanonicalEntryMutation[],
  append: McpVersionAppend = {},
): number {
  const previous = records.server(server.id);
  const version = (previous?.maxVersion ?? 0) + 1;
  if (version > MCP_SERVER_RESOURCE_MAX_VERSION)
    throw new Error(
      "MCP historical version number exceeds the resource format",
    );
  const priorMeta = previous
    ? records.version(server.id, previous.currentVersion)
    : null;
  if (previous && !priorMeta)
    throw new Error("MCP current version metadata is missing");
  const portable = retainOrEncrypt(
    server,
    version,
    priorMeta?.secretReferences,
    records,
    options,
  );
  const digest = computeMcpSemanticDigest(portable.server, portable.references);
  if (!append.force && priorMeta && priorMeta.semanticDigest === digest) {
    records.putServer({
      server: portable.server,
      currentVersion: previous!.currentVersion,
      maxVersion: previous!.maxVersion,
    });
    return previous!.currentVersion;
  }
  const document: McpServerVersionResourceDocument = {
    kind: MCP_SERVER_VERSION_RESOURCE_KIND,
    schemaVersion: 1,
    version,
    semanticDigest: digest,
    server: portable.server,
    secretReferences: portable.references,
    createdAt: new Date(server.updatedAt).toISOString(),
    ...append,
  };
  delete document.force;
  storeMcpVersionContent(records, document, options, mutations);
  records.putServer({
    server: portable.server,
    currentVersion: version,
    maxVersion: version,
  });
  return version;
}
export function publishMcpHistory(
  mutations: CanonicalEntryMutation[],
  options: McpStorageOptions,
): void {
  if (!mutations.length) return;
  publishCanonicalEntries({
    rootPath: mcpStorageContext(options).activeRoot,
    operationKey: "mcp-sqlite-history",
    entries: mutations,
    injectFailure: options.injectPublicationFailure,
  });
}
export function commitMcpHistory<T>(
  records: McpDB,
  options: McpStorageOptions,
  operation: (mutations: CanonicalEntryMutation[]) => T,
): T {
  assertStorageMaintenanceAvailable(mcpStorageContext(options).activeRoot);
  const mutations: CanonicalEntryMutation[] = [];
  try {
    return records.transaction(() => {
      const result = operation(mutations);
      publishMcpHistory(mutations, options);
      return result;
    });
  } catch (error) {
    // Immutable files are published before SQLite commit. Remove only files without committed metadata.
    for (const mutation of mutations) {
      const relative = path
        .relative(
          path.join(mcpStorageContext(options).dataPath, "mcp"),
          mutation.targetPath,
        )
        .split(path.sep)
        .join("/");
      if (
        !records.hasContentPath(relative) &&
        fs.existsSync(mutation.targetPath)
      )
        fs.unlinkSync(mutation.targetPath);
    }
    throw error;
  }
}
export function writeMcpSqliteLibrary(
  library: McpLibraryFile,
  options: McpStorageOptions = {},
): void {
  const records = mcpRecords(options);
  const knownIds = new Set(library.servers.map((server) => server.id));
  if (knownIds.size !== library.servers.length)
    throw new Error("MCP library contains duplicate server ids");
  const state = records.state();
  if (!state) throw new Error("MCP storage state is missing");
  createMcpBindingConfigDocument({
    deviceId: state.deviceId,
    bindings: library.bindings,
    knownServerIds: knownIds,
  });
  const removed = new Set(
    records
      .servers()
      .filter((row) => !knownIds.has(row.server.id))
      .map((row) => row.server.id),
  );
  commitMcpHistory(records, options, (mutations) => {
    // Enumerable symbol follows internal spread copies but is never part of JSON/IPC payloads.
    const expected = (library as McpLibraryFile & { [READ_REVISION]?: string })[
      READ_REVISION
    ];
    if (expected !== undefined && expected !== revision(records))
      throw new Error(
        "MCP library changed in another process; reload before saving",
      );
    for (const server of library.servers)
      appendMcpVersion(records, server, options, mutations);
    records.clearBindings();
    for (const binding of library.bindings) records.putBinding(binding);
    for (const row of records.servers())
      if (!knownIds.has(row.server.id)) records.deleteServer(row.server.id);
    records.pruneSecrets();
  });
  if (removed.size)
    reconcileMcpHistoricalContents(
      records,
      removed,
      path.join(mcpStorageContext(options).dataPath, "mcp"),
    );
}
