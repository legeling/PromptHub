import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { getDatabase, McpDB, type DatabaseAdapter } from "@prompthub/db";
import {
  mergeMcpLibraryFromTransport,
  MCP_REDACTED_VALUE,
} from "@prompthub/shared/utils/mcp-config";
import type {
  McpServerConfig,
  McpTargetBinding,
} from "@prompthub/shared/types/mcp";

import {
  createMcpBindingConfigDocument,
  hydrateMcpServerVersionSecretsSync,
  parseMcpBindingConfigDocument,
  readMcpServerResourceBundle,
  validateMcpServer,
  type McpServerVersionResourceDocument,
  extractMcpSecrets,
  computeMcpSemanticDigest,
  MCP_SERVER_VERSION_RESOURCE_KIND,
} from "./mcp-resource-schema";
import {
  storeMcpVersionContent,
  commitMcpHistory,
  readMcpSqliteLibrary,
  mcpSecretReader,
  mcpStorageContext,
  type McpStorageOptions,
} from "./mcp-storage";
import {
  createMcpMasterKeyStore,
  decryptMcpSecret,
  encryptMcpSecret,
  McpCredentialError,
} from "./mcp-credentials";

import { localResourceDeviceIdFromRootIdentity } from "./storage-root-identity";
import { publishCanonicalEntries } from "./canonical-entry-publication";
import { publishRecoveryArtifact } from "./recovery-artifact-publication";
import {
  getRecoveryArtifactRoot,
  pruneRecoveryArtifacts,
} from "./recovery-artifact-registry";
import { assertStoragePathComponentsSafe } from "./runtime-storage-context";
import { reconcileMcpHistoricalContents } from "./mcp-history-files";
import { MAX_RECOVERY_MCP_LIBRARY_BYTES } from "./mcp-library-persistence";

const MIGRATION = "mcp-sqlite-v1";
export interface McpMigrationOptions extends McpStorageOptions {
  legacySecretReader?: (ref: string) => string | null;
  keyId?: string;
  credentialSourceDatabase?: DatabaseAdapter.Database;
}
function legacyReader(
  options: McpMigrationOptions,
): (ref: string) => string | null {
  if (options.legacySecretReader) return options.legacySecretReader;
  if (options.secretStore) return (ref) => options.secretStore!.read(ref);
  if (options.credentialSourceDatabase)
    return mcpSecretReader({
      ...options,
      database: options.credentialSourceDatabase,
    });
  return () => null;
}
function readLegacyValue(
  ref: string,
  options: McpMigrationOptions,
): string | null {
  try {
    return legacyReader(options)(ref);
  } catch (error) {
    if (
      error instanceof McpCredentialError ||
      (error instanceof Error &&
        error.message === "MCP_RESOURCE_SECRET_STORE_UNAVAILABLE")
    )
      return null;
    throw error;
  }
}
function storeMigratedCredential(
  records: McpDB,
  serverId: string,
  ref: string,
  value: string | null,
  options: McpMigrationOptions,
): void {
  const state = records.state(),
    keys = options.masterKeyStore ?? createMcpMasterKeyStore();
  if (!state) throw new Error("MCP upgrade state is missing");
  let encrypted;
  try {
    if (value !== null)
      encrypted = encryptMcpSecret(
        { ref, serverId, keyId: state.keyId },
        value,
        keys,
        !records.hasSecretsForKey(state.keyId),
      );
  } catch (error) {
    if (!(error instanceof McpCredentialError)) throw error;
  }
  if (encrypted) records.putSecret(encrypted);
  else records.putUnavailableSecret(ref, serverId);
}
function importJsonServer(
  server: McpServerConfig,
  records: McpDB,
  options: McpMigrationOptions,
  mutations: Parameters<typeof storeMcpVersionContent>[3],
): void {
  const extracted = extractMcpSecrets(server, 1);
  for (const secret of extracted.secrets) {
    if (secret.value === MCP_REDACTED_VALUE)
      throw new Error(
        "Historical MCP masked credentials require their original device source",
      );
    storeMigratedCredential(
      records,
      server.id,
      secret.ref,
      secret.value,
      options,
    );
  }
  const document: McpServerVersionResourceDocument = {
    kind: MCP_SERVER_VERSION_RESOURCE_KIND,
    schemaVersion: 1,
    version: 1,
    createdAt: new Date(server.updatedAt).toISOString(),
    server: extracted.server,
    secretReferences: extracted.references,
    semanticDigest: computeMcpSemanticDigest(
      extracted.server,
      extracted.references,
    ),
  };
  storeMcpVersionContent(records, document, options, mutations);
  records.putServer({
    server: extracted.server,
    currentVersion: 1,
    maxVersion: 1,
  });
}
interface SourceFile {
  path: string;
  sha256: string;
  encrypt: boolean;
}
interface AdoptionInput {
  servers: McpServerConfig[];
  bindings: McpTargetBinding[];
  bundles: string[];
  files: SourceFile[];
}
interface AdoptionJournal {
  kind: "prompthub-mcp-sqlite-adoption";
  version: 1;
  operationId: string;
  keyId: string;
  files: SourceFile[];
}
function digest(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}
function sourceFile(
  filePath: string,
  options: McpMigrationOptions,
  encrypt = false,
): SourceFile {
  assertStoragePathComponentsSafe(
    mcpStorageContext(options).activeRoot,
    filePath,
  );
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink() || !stat.isFile())
    throw new Error("MCP upgrade source is not a regular file");
  return { path: filePath, sha256: digest(fs.readFileSync(filePath)), encrypt };
}
function hasCredentials(server: McpServerConfig): boolean {
  return (
    [server.env, server.headers].some((values) =>
      Object.values(values ?? {}).some((value) => value.length > 0),
    ) || Boolean(server.oauth?.clientSecret)
  );
}
function readLegacyJson(
  filePath: string,
  options: McpMigrationOptions,
): { servers: McpServerConfig[]; bindings: McpTargetBinding[] } {
  if (fs.statSync(filePath).size > MAX_RECOVERY_MCP_LIBRARY_BYTES)
    throw new Error("MCP legacy library exceeds the recovery input size limit");
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    throw new Error("MCP legacy library JSON is invalid");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("MCP legacy library is invalid");
  const raw = value as Record<string, unknown>; // Checked JSON object at the upgrade boundary.
  if (raw.kind !== "prompthub-mcp-library" || raw.version !== 1)
    throw new Error("MCP legacy library header is unsupported");
  if (!Array.isArray(raw.servers) || !Array.isArray(raw.bindings))
    throw new Error("MCP legacy library arrays are invalid");
  const servers = raw.servers.map((server) => {
    if (!server || typeof server !== "object" || Array.isArray(server))
      throw new Error("MCP legacy server is invalid");
    return validateMcpServer(
      { isFavorite: false, source: { type: "manual" }, ...server },
      true,
    );
  });
  const document = createMcpBindingConfigDocument({
    deviceId: "upgrade-validation",
    bindings: raw.bindings,
    knownServerIds: new Set(servers.map((server) => server.id)),
  });
  if (options.credentialSourceDatabase) {
    const current = readMcpSqliteLibrary({
      ...options,
      database: options.credentialSourceDatabase,
    });
    return mergeMcpLibraryFromTransport(current, {
      kind: "prompthub-mcp-library",
      version: 1,
      updatedAt: new Date().toISOString(),
      servers,
      bindings: document.bindings,
    });
  }
  return { servers, bindings: document.bindings };
}
function mergeInput(
  input: AdoptionInput,
  servers: McpServerConfig[],
  bindings: McpTargetBinding[],
): void {
  const byId = new Map(input.servers.map((server) => [server.id, server]));
  for (const server of servers) {
    server.isFavorite ??= false;
    const prior = byId.get(server.id);
    if (prior && stable(prior) !== stable(server))
      throw new Error(`MCP upgrade sources conflict for server ${server.id}`);
    if (!prior) {
      input.servers.push(server);
      byId.set(server.id, server);
    }
  }
  const byBinding = new Map(
    input.bindings.map((binding) => [binding.id, binding]),
  );
  for (const binding of bindings) {
    const prior = byBinding.get(binding.id);
    if (prior && stable(prior) !== stable(binding))
      throw new Error("MCP upgrade sources contain conflicting bindings");
    if (!prior) {
      input.bindings.push(binding);
      byBinding.set(binding.id, binding);
    }
  }
}
function collectInputs(options: McpMigrationOptions): AdoptionInput {
  const input: AdoptionInput = {
    servers: [],
    bindings: [],
    bundles: [],
    files: [],
  };
  const root = path.join(mcpStorageContext(options).dataPath, "mcp");
  const vault = path.join(
    mcpStorageContext(options).secretsPath,
    "mcp-resource-secrets.json",
  );
  if (fs.existsSync(vault)) sourceFile(vault, options);
  if (fs.existsSync(root)) {
    const stat = fs.lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("MCP upgrade library path is unsafe");
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const bundle = path.join(root, entry.name);
      if (!fs.existsSync(path.join(bundle, "manifest.json"))) continue;
      if (entry.isSymbolicLink())
        throw new Error("MCP upgrade resource path is unsafe");
      readMcpServerResourceBundle(bundle);
      input.bundles.push(bundle);
      input.files.push(
        sourceFile(path.join(bundle, "manifest.json"), options),
        sourceFile(path.join(bundle, "server.json"), options),
      );
    }
  }
  if (input.bundles.length) {
    const reader = (ref: string) =>
      readLegacyValue(ref, options) ?? MCP_REDACTED_VALUE;
    const servers = input.bundles.map((bundle) => {
      const resource = readMcpServerResourceBundle(bundle);
      const current = resource.versions.find(
        (version) => version.version === resource.currentVersion,
      );
      if (!current) throw new Error("MCP upgrade current version is missing");
      return hydrateMcpServerVersionSecretsSync(
        { ...current, server: resource.server },
        reader,
      );
    });
    const bindingPath = path.join(
      mcpStorageContext(options).configPath,
      "devices",
      "mcp-bindings.json",
    );
    if (fs.existsSync(bindingPath)) sourceFile(bindingPath, options);
    const bindings = fs.existsSync(bindingPath)
      ? parseMcpBindingConfigDocument(fs.readFileSync(bindingPath, "utf8"), {
          expectedDeviceId:
            options.deviceId ??
            JSON.parse(fs.readFileSync(bindingPath, "utf8")).deviceId,
          knownServerIds: new Set(servers.map((server) => server.id)),
        }).bindings
      : [];
    mergeInput(input, servers, bindings);
    if (fs.existsSync(bindingPath))
      input.files.push(sourceFile(bindingPath, options));
  }
  for (const file of [
    path.join(root, "library.json"),
    path.join(mcpStorageContext(options).configPath, "mcp-library.json"),
  ]) {
    if (!fs.existsSync(file)) continue;
    sourceFile(file, options);
    const library = readLegacyJson(file, options);
    mergeInput(input, library.servers, library.bindings);
    input.files.push(
      sourceFile(file, options, library.servers.some(hasCredentials)),
    );
  }
  if (input.bundles.length && fs.existsSync(vault))
    input.files.push(sourceFile(vault, options));
  return input;
}
function importBundle(
  bundle: string,
  records: McpDB,
  options: McpMigrationOptions,
): void {
  const resource = readMcpServerResourceBundle(bundle),
    state = records.state();
  if (!state) throw new Error("MCP upgrade state is missing");
  records.putServer({
    server: resource.server,
    currentVersion: resource.currentVersion,
    maxVersion: Math.max(
      ...resource.versions.map((version) => version.version),
    ),
  });
  const seen = new Set<string>();
  for (const version of resource.versions) {
    for (const ref of [
      ...Object.values(version.secretReferences.env),
      ...Object.values(version.secretReferences.headers),
      ...Object.values(version.secretReferences.oauth ?? {}),
    ]) {
      if (seen.has(ref)) continue;
      storeMigratedCredential(
        records,
        resource.server.id,
        ref,
        readLegacyValue(ref, options),
        options,
      );
      seen.add(ref);
    }
    const contentPath = `${resource.server.id}/versions/${String(version.version).padStart(6, "0")}.json`;
    records.putVersion({
      serverId: resource.server.id,
      version: version.version,
      createdAt: version.createdAt,
      note: version.note,
      restoredFromVersion: version.restoredFromVersion,
      semanticDigest: version.semanticDigest,
      contentSha256: digest(
        fs.readFileSync(path.join(path.dirname(bundle), contentPath)),
      ),
      contentPath,
      secretReferences: version.secretReferences,
    });
  }
}
function journalPath(options: McpMigrationOptions): string {
  return path.join(
    mcpStorageContext(options).dataPath,
    "operations",
    "migrations",
    `${MIGRATION}.json`,
  );
}
function publishJournal(
  journal: AdoptionJournal,
  options: McpMigrationOptions,
): void {
  publishCanonicalEntries({
    rootPath: mcpStorageContext(options).activeRoot,
    operationKey: `${MIGRATION}-journal`,
    entries: [
      {
        targetPath: journalPath(options),
        prepare(stage) {
          fs.writeFileSync(stage, JSON.stringify(journal), {
            flag: "wx",
            mode: 0o600,
          });
        },
      },
    ],
  });
}
function readJournal(
  records: McpDB,
  options: McpMigrationOptions,
): AdoptionJournal | null {
  if (!fs.existsSync(journalPath(options))) return null;
  const value: unknown = JSON.parse(
    fs.readFileSync(journalPath(options), "utf8"),
  );
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("MCP adoption journal is invalid");
  const journal = value as AdoptionJournal; // Validate every field before using journal paths.
  if (
    journal.kind !== "prompthub-mcp-sqlite-adoption" ||
    journal.version !== 1 ||
    !/^[a-f0-9-]{36}$/u.test(journal.operationId) ||
    !Array.isArray(journal.files) ||
    journal.keyId !== records.state()?.keyId
  )
    throw new Error("MCP adoption journal header is invalid");
  for (const file of journal.files) {
    if (
      !file ||
      typeof file.path !== "string" ||
      typeof file.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/u.test(file.sha256) ||
      typeof file.encrypt !== "boolean"
    )
      throw new Error("MCP adoption journal source is invalid");
    assertStoragePathComponentsSafe(
      mcpStorageContext(options).activeRoot,
      file.path,
    );
  }
  return journal;
}
function credentialSource(
  file: SourceFile,
  options: McpMigrationOptions,
): boolean {
  return (
    file.encrypt ||
    file.path ===
      path.join(
        mcpStorageContext(options).secretsPath,
        "mcp-resource-secrets.json",
      )
  );
}
function recoveryManifest(
  records: McpDB,
  options: McpMigrationOptions,
  journal: AdoptionJournal,
  files: SourceFile[],
  group: string,
) {
  return {
    kind: "storage-restore-recovery-artifact" as const,
    id: `${MIGRATION}-${journal.operationId}-${group}`,
    operationId: journal.operationId,
    artifactType: "mcp-storage-adoption",
    sourceRoot: mcpStorageContext(options).activeRoot,
    entries: files.map((file) =>
      path.relative(mcpStorageContext(options).activeRoot, file.path),
    ),
    createdAt: records.state()!.adoptedAt,
  };
}
function publishRecoveryGroup(
  records: McpDB,
  options: McpMigrationOptions,
  journal: AdoptionJournal,
  files: SourceFile[],
  group: string,
): void {
  const owner = mcpStorageContext(options).activeRoot,
    manifest = recoveryManifest(records, options, journal, files, group);
  const staging = path.join(
    mcpStorageContext(options).operationsPath,
    "migrations",
    manifest.id,
  );
  const artifactRoot = path.join(
    getRecoveryArtifactRoot(owner),
    manifest.id,
    "root",
  );
  const pending = files.filter((file) => fs.existsSync(file.path));
  if (!pending.length) return;
  const keys = options.masterKeyStore ?? createMcpMasterKeyStore();
  if (!fs.existsSync(artifactRoot))
    fs.mkdirSync(staging, { recursive: true, mode: 0o700 });
  for (const file of pending) {
    const relative = path.relative(owner, file.path);
    if (sourceFile(file.path, options).sha256 !== file.sha256)
      throw new Error("MCP upgrade source changed before retirement");
    if (!fs.existsSync(artifactRoot)) {
      const content = fs.readFileSync(file.path, "utf8");
      const payload = file.encrypt
        ? {
            path: relative,
            encrypted: encryptMcpSecret(
              { ref: relative, serverId: MIGRATION, keyId: journal.keyId },
              content,
              keys,
            ),
          }
        : { path: relative, content };
      fs.writeFileSync(
        path.join(staging, `${digest(relative)}.json`),
        JSON.stringify(payload),
        { mode: 0o600 },
      );
    }
  }
  publishRecoveryArtifact({
    ownerRoot: owner,
    registryRoot: getRecoveryArtifactRoot(owner),
    priorRoot: staging,
    manifest,
  });
  for (const file of pending) {
    const relative = path.relative(owner, file.path);
    const backup = JSON.parse(
      fs.readFileSync(
        path.join(artifactRoot, `${digest(relative)}.json`),
        "utf8",
      ),
    );
    const content = file.encrypt
      ? decryptMcpSecret(backup.encrypted, keys)
      : backup.content;
    if (
      backup.path !== relative ||
      typeof content !== "string" ||
      digest(content) !== file.sha256
    )
      throw new Error("MCP upgrade recovery artifact verification failed");
  }
  for (const file of pending) fs.unlinkSync(file.path);
}
function retireSources(records: McpDB, options: McpMigrationOptions): void {
  const journal = readJournal(records, options);
  if (!journal) return;
  publishRecoveryGroup(
    records,
    options,
    journal,
    journal.files.filter((file) => !credentialSource(file, options)),
    "metadata",
  );
  if (!records.hasUnavailableSecrets())
    publishRecoveryGroup(
      records,
      options,
      journal,
      journal.files.filter((file) => credentialSource(file, options)),
      "credentials",
    );
  if (journal.files.every((file) => !fs.existsSync(file.path)))
    fs.unlinkSync(journalPath(options));
  pruneRecoveryArtifacts(mcpStorageContext(options).activeRoot);
}
function resolvePendingCredentials(
  records: McpDB,
  options: McpMigrationOptions,
): void {
  const missing = records.unavailableSecrets(),
    state = records.state();
  if (!missing.length || !state) return;
  const values = new Map<string, string>();
  const journal = readJournal(records, options);
  for (const file of journal?.files ?? []) {
    if (!file.encrypt || !fs.existsSync(file.path)) continue;
    if (sourceFile(file.path, options).sha256 !== file.sha256)
      throw new Error("MCP credential upgrade source changed");
    for (const server of readLegacyJson(file.path, options).servers) {
      for (const secret of extractMcpSecrets(server, 1).secrets)
        values.set(secret.ref, secret.value);
    }
  }
  const keys = options.masterKeyStore ?? createMcpMasterKeyStore();
  records.transaction(() => {
    for (const secret of missing) {
      const value =
        values.get(secret.ref) ?? readLegacyValue(secret.ref, options);
      if (value === null) continue;
      try {
        const encrypted = encryptMcpSecret(
          { ...secret, keyId: state.keyId },
          value,
          keys,
          !records.hasSecretsForKey(state.keyId),
        );
        records.resolveUnavailableSecret(encrypted);
      } catch (error) {
        if (!(error instanceof McpCredentialError)) throw error;
      }
    }
  });
}
function finalizeAdoption(records: McpDB, options: McpMigrationOptions): void {
  try {
    resolvePendingCredentials(records, options);
    retireSources(records, options);
  } catch (error) {
    console.warn(
      "MCP definitions were adopted; credential/recovery-source migration remains pending",
      error,
    );
  }
  reconcileMcpHistoricalContents(
    records,
    undefined,
    path.join(mcpStorageContext(options).dataPath, "mcp"),
  );
}
export function initializeMcpStorage(options: McpMigrationOptions = {}): void {
  const records = new McpDB(options.database ?? getDatabase());
  if (records.state()?.adoptedAt) {
    finalizeAdoption(records, options);
    return;
  }
  const input = collectInputs(options);
  const deviceId =
    options.deviceId ??
    localResourceDeviceIdFromRootIdentity(
      mcpStorageContext(options).rootIdentity,
    );
  if (!records.state())
    records.transaction(() =>
      records.putState({
        formatVersion: 1,
        deviceId,
        keyId: options.keyId ?? randomUUID(),
        adoptedAt: "",
      }),
    );
  const state = records.state();
  if (!state) throw new Error("MCP pending upgrade state is missing");
  const priorJournal = fs.existsSync(journalPath(options))
    ? JSON.parse(fs.readFileSync(journalPath(options), "utf8"))
    : null;
  const operationId: string =
    priorJournal?.keyId === state.keyId &&
    stable(priorJournal.files) === stable(input.files) &&
    typeof priorJournal.operationId === "string"
      ? priorJournal.operationId
      : randomUUID();
  publishJournal(
    {
      kind: "prompthub-mcp-sqlite-adoption",
      version: 1,
      operationId,
      keyId: state.keyId,
      files: input.files,
    },
    options,
  );
  commitMcpHistory(records, options, (mutations) => {
    if (records.state()?.adoptedAt) return;
    for (const bundle of input.bundles) importBundle(bundle, records, options);
    for (const server of input.servers)
      if (!records.server(server.id))
        importJsonServer(server, records, options, mutations);
    for (const binding of input.bindings) records.putBinding(binding);
    for (const file of input.files) {
      if (sourceFile(file.path, options).sha256 !== file.sha256)
        throw new Error("MCP upgrade source changed during adoption");
    }
    records.putState({ ...state, adoptedAt: new Date().toISOString() });
    const library = readMcpSqliteLibrary(options, true);
    const expected = input.servers.map((server) => {
      const extracted = extractMcpSecrets(server, 1);
      return hydrateMcpServerVersionSecretsSync(
        {
          kind: MCP_SERVER_VERSION_RESOURCE_KIND,
          schemaVersion: 1,
          version: 1,
          createdAt: new Date(server.updatedAt).toISOString(),
          semanticDigest: computeMcpSemanticDigest(
            extracted.server,
            extracted.references,
          ),
          server: extracted.server,
          secretReferences: extracted.references,
        },
        () => MCP_REDACTED_VALUE,
      );
    });
    if (
      stable(library.servers) !==
      stable(expected.sort((a, b) => a.id.localeCompare(b.id)))
    )
      throw new Error("MCP SQLite adoption verification failed");
  });
  finalizeAdoption(records, options);
}
