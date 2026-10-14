import crypto from "crypto";
import fs from "fs";
import path from "path";

import {
  acquireStorageMaintenanceIntent,
  assertStorageMaintenanceIntentHeld,
  createStorageInventory,
  readCanonicalStorageShadow,
  stageCanonicalStorageDatabase,
  MCP_STORAGE_SNAPSHOT_FILE,
  readMcpStorageSnapshotLibrary,
  type ExtractedMcpSecret,
} from "@prompthub/core";
import {
  createConsistentDatabaseImage,
  DatabaseAdapter,
  inspectDatabaseClientLeases,
  cleanupOwnedTemporaryDatabase,
  createOwnedTemporaryDatabasePath,
} from "@prompthub/db";

import {
  projectCanonicalStorageShadow,
  type CanonicalStorageProjectorOptions,
} from "./canonical-storage-projector";

const CHECKPOINT_KIND = "prompthub-canonical-storage-checkpoint";
const CHECKPOINT_VERSION = 1;
const CAPACITY_HEADROOM_BYTES = 16 * 1024 * 1024;

export interface CanonicalStorageCheckpointManifest {
  kind: typeof CHECKPOINT_KIND;
  version: typeof CHECKPOINT_VERSION;
  createdAt: string;
  consistencyId: string;
  canonicalPath: "canonical";
  catalogPath: "catalog/prompthub.db";
  catalogByteSize: number;
  catalogSha256: string;
  promptGraphHash: string;
  resourceCatalogHash: string;
  mcpStateSha256?: string;
  resourceCount: number;
  domainCounts: Record<string, number>;
  deviceMcpBindingsPath?: "device/mcp-bindings.json";
}

export interface CreateCanonicalStorageCheckpointOptions extends Omit<
  CanonicalStorageProjectorOptions,
  "targetPath"
> {
  targetPath: string;
  persistExtractedMcpSecrets?: (
    secrets: readonly ExtractedMcpSecret[],
  ) => void | Promise<void>;
}

export interface CanonicalStorageCheckpointResult {
  targetPath: string;
  manifest: CanonicalStorageCheckpointManifest;
}

export interface CreateCanonicalCheckpointFromClosedDatabaseOptions extends Omit<
  CreateCanonicalStorageCheckpointOptions,
  "database"
> {
  activeRoot: string;
  sourceDatabasePath: string;
  getAvailableBytes?: (targetParent: string) => number;
  maintenanceOperationId?: string;
}

function hashFile(filePath: string): string {
  const hash = crypto.createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest("hex");
}

function writeJsonExclusive(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const descriptor = fs.openSync(filePath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

export function createCanonicalStorageConsistencyId(
  promptGraphHash: string,
  resourceCatalogHash: string,
  mcpStateSha256?: string,
): string {
  return crypto
    .createHash("sha256")
    .update(
      `${promptGraphHash}:${resourceCatalogHash}${mcpStateSha256 === undefined ? "" : `:${mcpStateSha256}`}`,
      "utf8",
    )
    .digest("hex");
}

function parseManifest(value: unknown): CanonicalStorageCheckpointManifest {
  const manifest = value as CanonicalStorageCheckpointManifest | undefined;
  if (
    manifest?.kind !== CHECKPOINT_KIND ||
    manifest.version !== CHECKPOINT_VERSION ||
    manifest.canonicalPath !== "canonical" ||
    manifest.catalogPath !== "catalog/prompthub.db" ||
    !/^[a-f0-9]{64}$/u.test(manifest.consistencyId) ||
    !/^[a-f0-9]{64}$/u.test(manifest.catalogSha256) ||
    !/^[a-f0-9]{64}$/u.test(manifest.promptGraphHash) ||
    !/^[a-f0-9]{64}$/u.test(manifest.resourceCatalogHash) ||
    (manifest.mcpStateSha256 !== undefined &&
      !/^[a-f0-9]{64}$/u.test(manifest.mcpStateSha256))
  ) {
    throw new Error("Canonical storage checkpoint manifest is invalid");
  }
  return manifest;
}

function readManifest(rootPath: string): CanonicalStorageCheckpointManifest {
  const manifestPath = path.join(rootPath, "checkpoint.json");
  const stats = fs.lstatSync(manifestPath);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > 1024 * 1024) {
    throw new Error("Canonical storage checkpoint manifest is unsafe");
  }
  return parseManifest(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
}

function assertCheckpointCatalog(
  rootPath: string,
  manifest: CanonicalStorageCheckpointManifest,
): void {
  const catalogPath = path.join(rootPath, ...manifest.catalogPath.split("/"));
  const stats = fs.lstatSync(catalogPath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error("Canonical storage checkpoint catalog is unsafe");
  }
  if (
    stats.size !== manifest.catalogByteSize ||
    hashFile(catalogPath) !== manifest.catalogSha256
  ) {
    throw new Error("Canonical storage checkpoint catalog digest mismatch");
  }
}

export function verifyCanonicalStorageCheckpoint(
  rootPath: string,
): CanonicalStorageCheckpointManifest {
  const root = path.resolve(rootPath);
  const manifest = readManifest(root);
  const canonicalPath = path.join(root, manifest.canonicalPath);
  assertCheckpointCatalog(root, manifest);
  return verifyCanonicalStorageCheckpointContent(
    canonicalPath,
    manifest,
    path.join(root, ...manifest.catalogPath.split("/")),
  );
}

export function verifyCanonicalStorageCheckpointContent(
  canonicalPathValue: string,
  manifestValue: unknown,
  catalogPath?: string,
): CanonicalStorageCheckpointManifest {
  const canonicalPath = path.resolve(canonicalPathValue);
  const manifest = parseManifest(manifestValue);
  const mcpImage = path.join(canonicalPath, "mcp", MCP_STORAGE_SNAPSHOT_FILE);
  if (fs.existsSync(mcpImage) !== (manifest.mcpStateSha256 !== undefined))
    throw new Error("Canonical MCP snapshot is missing or undeclared");
  if (manifest.mcpStateSha256 !== undefined) {
    if (hashFile(mcpImage) !== manifest.mcpStateSha256)
      throw new Error("Canonical MCP snapshot digest mismatch");
    readMcpStorageSnapshotLibrary(mcpImage);
  }
  readCanonicalStorageShadow(canonicalPath);
  const rebuiltPath = createOwnedTemporaryDatabasePath(
    path.dirname(canonicalPath),
    "catalog-verify",
  );
  try {
    const rebuilt = stageCanonicalStorageDatabase(canonicalPath, rebuiltPath, {
      mcpSourceDatabasePath:
        manifest.mcpStateSha256 === undefined ? catalogPath : mcpImage,
    });
    const consistencyId = createCanonicalStorageConsistencyId(
      rebuilt.promptGraphHash,
      rebuilt.resourceCatalogHash,
      manifest.mcpStateSha256,
    );
    if (
      rebuilt.promptGraphHash !== manifest.promptGraphHash ||
      rebuilt.resourceCatalogHash !== manifest.resourceCatalogHash ||
      rebuilt.resourceCount !== manifest.resourceCount ||
      consistencyId !== manifest.consistencyId ||
      JSON.stringify(rebuilt.domainCounts) !==
        JSON.stringify(manifest.domainCounts)
    ) {
      throw new Error("Canonical storage checkpoint rebuild mismatch");
    }
    return manifest;
  } finally {
    cleanupOwnedTemporaryDatabase(rebuiltPath);
  }
}

async function persistSecretMigration(
  secrets: readonly ExtractedMcpSecret[],
  persist?: CreateCanonicalStorageCheckpointOptions["persistExtractedMcpSecrets"],
): Promise<void> {
  if (secrets.length === 0) return;
  if (!persist) {
    throw new Error(
      "Canonical storage checkpoint requires a secure MCP secret migration sink",
    );
  }
  await persist(secrets);
}

type StorageProjection = Awaited<
  ReturnType<typeof projectCanonicalStorageShadow>
>;

function publishProjectionCatalog(
  stagePath: string,
  projection: StorageProjection,
): string {
  const catalogPath = path.join(stagePath, "catalog", "prompthub.db");
  fs.mkdirSync(path.dirname(catalogPath), { recursive: true, mode: 0o700 });
  fs.renameSync(projection.verificationDatabasePath, catalogPath);
  return catalogPath;
}

function writeDeviceBinding(
  stagePath: string,
  projection: StorageProjection,
): boolean {
  if (!projection.materialized.mcpBindingConfig) return false;
  writeJsonExclusive(
    path.join(stagePath, "device", "mcp-bindings.json"),
    projection.materialized.mcpBindingConfig,
  );
  return true;
}

function buildCheckpointManifest(
  projection: StorageProjection,
  catalogPath: string,
  hasDeviceBinding: boolean,
): CanonicalStorageCheckpointManifest {
  const staged = projection.stagedDatabase;
  const mcpImage = path.join(
    projection.targetPath,
    "mcp",
    MCP_STORAGE_SNAPSHOT_FILE,
  );
  const mcpStateSha256 = fs.existsSync(mcpImage)
    ? hashFile(mcpImage)
    : undefined;
  return {
    kind: CHECKPOINT_KIND,
    version: CHECKPOINT_VERSION,
    createdAt: projection.materialized.manifest.createdAt,
    consistencyId: createCanonicalStorageConsistencyId(
      staged.promptGraphHash,
      staged.resourceCatalogHash,
      mcpStateSha256,
    ),
    canonicalPath: "canonical",
    catalogPath: "catalog/prompthub.db",
    catalogByteSize: fs.statSync(catalogPath).size,
    catalogSha256: hashFile(catalogPath),
    promptGraphHash: staged.promptGraphHash,
    resourceCatalogHash: staged.resourceCatalogHash,
    resourceCount: staged.resourceCount,
    domainCounts: staged.domainCounts,
    ...(mcpStateSha256 === undefined ? {} : { mcpStateSha256 }),
    ...(hasDeviceBinding
      ? { deviceMcpBindingsPath: "device/mcp-bindings.json" as const }
      : {}),
  };
}

async function materializeCheckpointStage(
  stagePath: string,
  options: CreateCanonicalStorageCheckpointOptions,
): Promise<CanonicalStorageCheckpointManifest> {
  const projection = await projectCanonicalStorageShadow({
    ...options,
    targetPath: path.join(stagePath, "canonical"),
  });
  await persistSecretMigration(
    projection.materialized.extractedMcpSecrets,
    options.persistExtractedMcpSecrets,
  );
  const catalogPath = publishProjectionCatalog(stagePath, projection);
  const manifest = buildCheckpointManifest(
    projection,
    catalogPath,
    writeDeviceBinding(stagePath, projection),
  );
  writeJsonExclusive(path.join(stagePath, "checkpoint.json"), manifest);
  return manifest;
}

export async function createCanonicalStorageCheckpoint(
  options: CreateCanonicalStorageCheckpointOptions,
): Promise<CanonicalStorageCheckpointResult> {
  const targetPath = path.resolve(options.targetPath);
  if (fs.existsSync(targetPath)) {
    throw new Error(
      `Canonical storage checkpoint target already exists: ${targetPath}`,
    );
  }
  const parentPath = path.dirname(targetPath);
  fs.mkdirSync(parentPath, { recursive: true, mode: 0o700 });
  const parentStats = fs.lstatSync(parentPath);
  if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) {
    throw new Error(
      `Canonical storage checkpoint parent is unsafe: ${parentPath}`,
    );
  }
  const stagePath = path.join(
    parentPath,
    `.checkpoint-stage-${crypto.randomUUID()}`,
  );
  fs.mkdirSync(stagePath, { mode: 0o700 });
  try {
    const manifest = await materializeCheckpointStage(stagePath, options);
    fs.renameSync(stagePath, targetPath);
    verifyCanonicalStorageCheckpoint(targetPath);
    return { targetPath, manifest };
  } catch (error) {
    fs.rmSync(stagePath, { recursive: true, force: true });
    fs.rmSync(targetPath, { recursive: true, force: true });
    throw error;
  }
}

function defaultAvailableBytes(targetParent: string): number {
  const stats = fs.statfsSync(targetParent);
  return stats.bavail * stats.bsize;
}

function assertClosedDatabase(databasePath: string): void {
  const leases = inspectDatabaseClientLeases(databasePath);
  if (leases.livePids.length > 0 || leases.unknownEntries.length > 0) {
    throw new Error(
      "Canonical storage checkpoint requires all database clients to be closed",
    );
  }
}

function assertCheckpointCapacity(
  options: CreateCanonicalCheckpointFromClosedDatabaseOptions,
  sourceDatabasePath: string,
): void {
  const inventory = createStorageInventory(options.activeRoot, {
    includeSecrets: false,
  });
  const parentPath = path.dirname(path.resolve(options.targetPath));
  fs.mkdirSync(parentPath, { recursive: true, mode: 0o700 });
  const requiredBytes =
    inventory.totalBytes +
    fs.statSync(sourceDatabasePath).size +
    CAPACITY_HEADROOM_BYTES;
  const availableBytes = (options.getAvailableBytes ?? defaultAvailableBytes)(
    parentPath,
  );
  if (availableBytes < requiredBytes) {
    throw new Error(
      `Insufficient space for canonical checkpoint: required=${requiredBytes}, available=${availableBytes}`,
    );
  }
}

async function createFromDatabaseImage(
  options: CreateCanonicalCheckpointFromClosedDatabaseOptions,
  sourceDatabasePath: string,
  snapshotPath: string,
): Promise<CanonicalStorageCheckpointResult> {
  assertClosedDatabase(sourceDatabasePath);
  assertCheckpointCapacity(options, sourceDatabasePath);
  createConsistentDatabaseImage(sourceDatabasePath, snapshotPath);
  const database = new DatabaseAdapter(snapshotPath, { readOnly: true });
  try {
    return await createCanonicalStorageCheckpoint({
      ...options,
      database,
      operationalSourceDatabasePath: snapshotPath,
    });
  } finally {
    database.close();
  }
}

export async function createCanonicalCheckpointFromClosedDatabase(
  options: CreateCanonicalCheckpointFromClosedDatabaseOptions,
): Promise<CanonicalStorageCheckpointResult> {
  const activeRoot = path.resolve(options.activeRoot);
  const sourceDatabasePath = path.resolve(options.sourceDatabasePath);
  const operationId = `canonical-${crypto.randomUUID()}`;
  if (options.maintenanceOperationId) {
    assertStorageMaintenanceIntentHeld(
      activeRoot,
      options.maintenanceOperationId,
    );
  }
  const maintenance = options.maintenanceOperationId
    ? null
    : acquireStorageMaintenanceIntent(activeRoot, {
        operationId,
        operationKind: "canonical-checkpoint",
      });
  const snapshotPath = createOwnedTemporaryDatabasePath(
    path.dirname(path.resolve(options.targetPath)),
    "canonical-source",
  );
  try {
    return await createFromDatabaseImage(
      options,
      sourceDatabasePath,
      snapshotPath,
    );
  } finally {
    cleanupOwnedTemporaryDatabase(snapshotPath);
    maintenance?.release();
  }
}
