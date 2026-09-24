import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  collectPromptCanonicalGraph,
  createStorageInventory,
  listRecoveryArtifacts,
  materializePromptCanonicalGraph,
  runJournaledStorageRestore,
  stageCanonicalStorageDatabase,
  reconcileCanonicalStorageCatalog as reconcileCoreCatalog,
  writeCanonicalStorageAuthority,
  writeRuntimeLayoutState,
  type StorageRestorePublicationStage,
} from "@prompthub/core";
import {
  acquireDatabaseMigrationIntent,
  DatabaseAdapter,
  FolderDB,
  PromptDB,
  inspectDatabaseClientLeases,
  cleanupOwnedTemporaryDatabase,
  createOwnedTemporaryDatabasePath,
} from "@prompthub/db";

import {
  createCanonicalStorageConsistencyId,
  type CanonicalStorageCheckpointManifest,
} from "./canonical-storage-checkpoint";
import { verifyCanonicalAuthorityRoot } from "./canonical-storage-authority";
import {
  createVerifiedPromptMediaResolver,
  stageFileAuthoritativePromptCatalog,
} from "./file-authoritative-prompt-recovery";
import { listUpgradeBackups } from "./upgrade-backup";
import { isGeneratedDatabaseBackupFileName } from "./recovery-candidates";

const CAPACITY_HEADROOM_BYTES = 16 * 1024 * 1024;
const LEGACY_WORKSPACE_ENTRIES = [
  ".prompthub-0.5.3-backup-done",
  ".trash",
  ".versions",
  "folders.json",
  "images",
  "videos",
] as const;
const PROMPT_GRAPH_ENTRIES = [
  "catalog.json",
  "prompts",
  "folders",
  "tags",
  "relations",
  "output-formats",
] as const;

export interface RepairCanonicalStorageFromPromptWorkspaceOptions {
  activeRoot: string;
  sourceDatabasePath: string;
  trustedRoots?: readonly string[];
  now?: Date;
  injectFailure?: (stage: StorageRestorePublicationStage) => void;
}

export interface RepairCanonicalStorageFromPromptWorkspaceResult {
  recoveryArtifactPath: string;
}

function hashFile(filePath: string): string {
  const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY);
  const hash = crypto.createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  try {
    let size = 0;
    do {
      size = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (size > 0) hash.update(buffer.subarray(0, size));
    } while (size > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest("hex");
}

function removeDatabaseFiles(databasePath: string): void {
  cleanupOwnedTemporaryDatabase(databasePath);
}

function isReadableDatabaseImage(databasePath: string): boolean {
  try {
    const stats = fs.lstatSync(databasePath);
    if (!stats.isFile() || stats.isSymbolicLink()) return false;
    const database = new DatabaseAdapter(databasePath, { readOnly: true });
    try {
      const rows = database.pragma("quick_check") as Array<{
        quick_check?: unknown;
      }>;
      return rows.length === 1 && rows[0]?.quick_check === "ok";
    } finally {
      database.close();
    }
  } catch {
    return false;
  }
}

function stageCatalog(
  dataPath: string,
  stagedPath: string,
  operationalSourceDatabasePath?: string,
  publishedCanonicalRootPath = dataPath,
) {
  return stageCanonicalStorageDatabase(dataPath, stagedPath, {
    operationalSourceDatabasePath,
    publishedCanonicalRootPath,
  });
}

function assertDatabaseClientsClosed(databasePath: string): void {
  const leases = inspectDatabaseClientLeases(databasePath);
  if (leases.livePids.length > 0 || leases.unknownEntries.length > 0) {
    throw new Error(
      "Canonical file repair requires all database clients to be closed",
    );
  }
}

export function reconcileCanonicalStorageCatalog(options: {
  activeRoot: string;
  databasePath: string;
}): { status: "current" | "rebuilt" } {
  return reconcileCoreCatalog({ ...options, unreadableDatabase: "rebuild" });
}

function regularFileSize(filePath: string): number {
  try {
    const stats = fs.lstatSync(filePath);
    return stats.isFile() && !stats.isSymbolicLink() ? stats.size : 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
}

function assertRepairCapacity(
  activeRoot: string,
  sourceDatabasePath: string,
): void {
  const inventory = createStorageInventory(activeRoot, {
    includeSecrets: false,
  });
  const stats = fs.statfsSync(activeRoot);
  const availableBytes = stats.bavail * stats.bsize;
  const requiredBytes =
    inventory.totalBytes +
    regularFileSize(sourceDatabasePath) +
    CAPACITY_HEADROOM_BYTES;
  if (availableBytes < requiredBytes) {
    throw new Error(
      `Insufficient space for canonical file repair: required=${requiredBytes}, available=${availableBytes}`,
    );
  }
}

function readPromptSnapshot(databasePath: string) {
  const database = new DatabaseAdapter(databasePath, { readOnly: true });
  try {
    return collectPromptCanonicalGraph(
      new PromptDB(database),
      new FolderDB(database),
      database,
    );
  } finally {
    database.close();
  }
}

function clearLegacyPromptLayout(candidateDataPath: string): void {
  for (const entry of [...PROMPT_GRAPH_ENTRIES, ...LEGACY_WORKSPACE_ENTRIES]) {
    fs.rmSync(path.join(candidateDataPath, entry), {
      recursive: true,
      force: true,
    });
  }
  for (const entry of fs.readdirSync(candidateDataPath, {
    withFileTypes: true,
  })) {
    if (entry.isFile() && isGeneratedDatabaseBackupFileName(entry.name)) {
      fs.rmSync(path.join(candidateDataPath, entry.name));
    }
  }
  const databasePath = path.join(candidateDataPath, "prompthub.db");
  removeDatabaseFiles(databasePath);
  fs.rmSync(`${databasePath}.migration-intent.json`, { force: true });
  fs.rmSync(`${databasePath}.clients`, { recursive: true, force: true });
}

function mergePromptGraph(graphPath: string, candidateDataPath: string): void {
  for (const entry of fs.readdirSync(graphPath)) {
    const sourcePath = path.join(graphPath, entry);
    if (entry === "assets") {
      fs.cpSync(sourcePath, path.join(candidateDataPath, entry), {
        recursive: true,
        force: true,
      });
    } else {
      fs.renameSync(sourcePath, path.join(candidateDataPath, entry));
    }
  }
}

function buildRepairManifest(
  candidateDataPath: string,
  staged: ReturnType<typeof stageCanonicalStorageDatabase>,
  now: Date,
): CanonicalStorageCheckpointManifest {
  const databasePath = path.join(candidateDataPath, "prompthub.db");
  return {
    kind: "prompthub-canonical-storage-checkpoint",
    version: 1,
    createdAt: now.toISOString(),
    consistencyId: createCanonicalStorageConsistencyId(
      staged.promptGraphHash,
      staged.resourceCatalogHash,
    ),
    canonicalPath: "canonical",
    catalogPath: "catalog/prompthub.db",
    catalogByteSize: fs.statSync(databasePath).size,
    catalogSha256: hashFile(databasePath),
    promptGraphHash: staged.promptGraphHash,
    resourceCatalogHash: staged.resourceCatalogHash,
    resourceCount: staged.resourceCount,
    domainCounts: staged.domainCounts,
  };
}

function finalizeRepairCandidate(options: {
  activeRoot: string;
  candidateRoot: string;
  operationId: string;
  now: Date;
  sourceDatabasePath: string;
}): CanonicalStorageCheckpointManifest {
  const candidateDataPath = path.join(options.candidateRoot, "data");
  const databasePath = path.join(candidateDataPath, "prompthub.db");
  const source = isReadableDatabaseImage(options.sourceDatabasePath)
    ? options.sourceDatabasePath
    : undefined;
  const staged = stageCatalog(
    candidateDataPath,
    databasePath,
    source,
    path.join(options.activeRoot, "data"),
  );
  const manifest = buildRepairManifest(candidateDataPath, staged, options.now);
  writeRuntimeLayoutState(options.candidateRoot, {
    identityRoot: options.activeRoot,
    lastVerifiedOperation: options.operationId,
    now: options.now,
  });
  writeCanonicalStorageAuthority(options.candidateRoot, {
    consistencyId: manifest.consistencyId,
    operationId: options.operationId,
    identityRoot: options.activeRoot,
    now: options.now,
  });
  return manifest;
}

async function defaultTrustedRoots(activeRoot: string): Promise<string[]> {
  const recovery = listRecoveryArtifacts(activeRoot).map(
    (artifact) => artifact.directoryPath,
  );
  const upgrades = (await listUpgradeBackups(activeRoot)).map(
    (backup) => backup.backupPath,
  );
  return [...recovery, ...upgrades];
}

interface RepairPublicationOptions {
  activeRoot: string;
  sourceDatabasePath: string;
  operationId: string;
  now: Date;
  promptSnapshot: ReturnType<typeof readPromptSnapshot>;
  resolveMediaSource: ReturnType<typeof createVerifiedPromptMediaResolver>;
  injectFailure?: (stage: StorageRestorePublicationStage) => void;
}

function prepareRepairCandidate(
  options: RepairPublicationOptions,
  candidateRoot: string,
): CanonicalStorageCheckpointManifest {
  const candidateDataPath = path.join(candidateRoot, "data");
  fs.cpSync(path.join(options.activeRoot, "data"), candidateDataPath, {
    recursive: true,
    dereference: false,
  });
  clearLegacyPromptLayout(candidateDataPath);
  const graphPath = path.join(candidateRoot, ".prompt-graph");
  materializePromptCanonicalGraph(graphPath, options.promptSnapshot, {
    createdAt: options.now.toISOString(),
    resolveMediaSource: options.resolveMediaSource,
  });
  mergePromptGraph(graphPath, candidateDataPath);
  fs.rmSync(graphPath, { recursive: true, force: true });
  return finalizeRepairCandidate({
    activeRoot: options.activeRoot,
    candidateRoot,
    operationId: options.operationId,
    now: options.now,
    sourceDatabasePath: options.sourceDatabasePath,
  });
}

async function publishPromptWorkspaceRepair(
  options: RepairPublicationOptions,
): Promise<RepairCanonicalStorageFromPromptWorkspaceResult> {
  let manifest: CanonicalStorageCheckpointManifest | undefined;
  const result = await runJournaledStorageRestore({
    activeRoot: options.activeRoot,
    operationId: options.operationId,
    entryNames: ["data"],
    prepareCandidate(candidateRoot) {
      manifest = prepareRepairCandidate(options, candidateRoot);
    },
    verifyCandidate(candidateRoot) {
      if (!manifest) throw new Error("Canonical repair manifest is missing");
      verifyCanonicalAuthorityRoot(candidateRoot, manifest, options.activeRoot);
    },
    verifyActive(publishedRoot) {
      if (!manifest) throw new Error("Canonical repair manifest is missing");
      verifyCanonicalAuthorityRoot(publishedRoot, manifest);
    },
    injectFailure: options.injectFailure,
    now: options.now,
  });
  return { recoveryArtifactPath: result.recoveryArtifactPath };
}

export async function repairCanonicalStorageFromPromptWorkspace(
  options: RepairCanonicalStorageFromPromptWorkspaceOptions,
): Promise<RepairCanonicalStorageFromPromptWorkspaceResult> {
  const activeRoot = path.resolve(options.activeRoot);
  const sourceDatabasePath = path.resolve(options.sourceDatabasePath);
  const now = options.now ?? new Date();
  const operationId = `canonical-file-repair-${crypto.randomUUID()}`;
  const stagedPromptDatabasePath = createOwnedTemporaryDatabasePath(
    path.join(activeRoot, "cache"),
    "prompt-recovery",
  );
  const migration = acquireDatabaseMigrationIntent(sourceDatabasePath);
  try {
    assertDatabaseClientsClosed(sourceDatabasePath);
    assertRepairCapacity(activeRoot, sourceDatabasePath);
    stageFileAuthoritativePromptCatalog({
      activeRoot,
      sourceDatabasePath,
      targetDatabasePath: stagedPromptDatabasePath,
    });
    const trustedRoots = options.trustedRoots
      ? [...options.trustedRoots]
      : await defaultTrustedRoots(activeRoot);
    return publishPromptWorkspaceRepair({
      activeRoot,
      sourceDatabasePath,
      operationId,
      now,
      promptSnapshot: readPromptSnapshot(stagedPromptDatabasePath),
      resolveMediaSource: createVerifiedPromptMediaResolver({
        activeRoot,
        trustedRoots,
      }),
      injectFailure: options.injectFailure,
    });
  } finally {
    removeDatabaseFiles(stagedPromptDatabasePath);
    migration.release();
  }
}
