import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  deriveLocalResourceDeviceId,
  readCanonicalStorageAuthority,
  readPromptCanonicalGraph,
  readRendererPersistenceMigrationMarker,
  refreshRuntimeStorageContext,
} from "@prompthub/core";

import {
  DatabaseAdapter,
  repairPromptVersionConsistency,
} from "@prompthub/db";

import {
  publishCanonicalStorageAuthority,
  type PublishCanonicalStorageAuthorityOptions,
  type PublishCanonicalStorageAuthorityResult,
} from "./canonical-storage-authority";
import {
  reconcileCanonicalStorageCatalog,
  repairCanonicalStorageFromPromptWorkspace,
  type RepairCanonicalStorageFromPromptWorkspaceResult,
} from "./canonical-storage-self-heal";

type AuthorityPublisher = (
  options: PublishCanonicalStorageAuthorityOptions,
) => Promise<PublishCanonicalStorageAuthorityResult>;

type InvalidAuthorityRepairer = (options: {
  activeRoot: string;
  sourceDatabasePath: string;
}) => Promise<RepairCanonicalStorageFromPromptWorkspaceResult>;

type CatalogReconciler = (options: {
  activeRoot: string;
  databasePath: string;
}) => { status: "current" | "rebuilt" };

export interface EnsureCanonicalStorageAuthorityOnStartupOptions extends Omit<
  PublishCanonicalStorageAuthorityOptions,
  "activeRoot" | "sourceDatabasePath" | "checkpointPath" | "deviceId"
> {
  activeRoot: string;
  sourceDatabasePath: string;
  checkpointPath?: string;
  publish?: AuthorityPublisher;
  prepareSourceDatabase?: () => void | Promise<void>;
  refreshRuntimeContext?: () => void;
  repairInvalidAuthority?: InvalidAuthorityRepairer;
  reconcileCatalog?: CatalogReconciler;
}

export type CanonicalStorageAuthorityStartupResult =
  | { status: "already-canonical" }
  | {
      status: "recovery-required";
      reason: "invalid-canonical-prompt-graph" | "invalid-canonical-storage";
      error: string;
    }
  | { status: "catalog-rebuilt" }
  | { status: "self-healed"; recoveryArtifactPath: string }
  | { status: "waiting-renderer-migration" }
  | { status: "source-database-missing" }
  | ({ status: "published" } & Omit<
      PublishCanonicalStorageAuthorityResult,
      "status"
    >);

function assertRegularDatabaseOrMissing(databasePath: string): boolean {
  try {
    const stats = fs.lstatSync(databasePath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error("Canonical authority source database is unsafe");
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function canonicalPromptGraphError(activeRoot: string): string | null {
  try {
    readPromptCanonicalGraph(path.join(activeRoot, "data"));
    return null;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "Canonical Prompt graph is invalid";
  }
}

async function repairInvalidAuthority(
  options: EnsureCanonicalStorageAuthorityOnStartupOptions,
  activeRoot: string,
  graphError: string,
): Promise<CanonicalStorageAuthorityStartupResult> {
  try {
    const repaired = await (
      options.repairInvalidAuthority ??
      ((input) => repairCanonicalStorageFromPromptWorkspace(input))
    )({
      activeRoot,
      sourceDatabasePath: path.resolve(options.sourceDatabasePath),
    });
    (options.refreshRuntimeContext ?? refreshRuntimeStorageContext)();
    return {
      status: "self-healed",
      recoveryArtifactPath: repaired.recoveryArtifactPath,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Automatic file repair failed";
    return {
      status: "recovery-required",
      reason: "invalid-canonical-prompt-graph",
      error: `${graphError}; automatic file repair failed: ${message}`,
    };
  }
}

async function ensureExistingCanonicalAuthority(
  options: EnsureCanonicalStorageAuthorityOnStartupOptions,
  activeRoot: string,
): Promise<CanonicalStorageAuthorityStartupResult> {
  const graphError = canonicalPromptGraphError(activeRoot);
  if (graphError) {
    return repairInvalidAuthority(options, activeRoot, graphError);
  }
  try {
    const result = (
      options.reconcileCatalog ?? reconcileCanonicalStorageCatalog
    )({
      activeRoot,
      databasePath: path.resolve(options.sourceDatabasePath),
    });
    return {
      status:
        result.status === "rebuilt" ? "catalog-rebuilt" : "already-canonical",
    };
  } catch (error) {
    return {
      status: "recovery-required",
      reason: "invalid-canonical-storage",
      error:
        error instanceof Error ? error.message : "Canonical storage is invalid",
    };
  }
}

/**
 * Best-effort source repair before canonical authority is projected: converge
 * every prompt's `current_version` onto its stored version history so
 * `validateVersionSet` no longer aborts startup with a "Prompt resource
 * current version is missing" error. Only recognized SQLite images are opened;
 * other/mock file contents are left untouched so unrelated recovery flows keep
 * their behavior.
 *
 * 在投影 canonical authority 前对源库做尽力而为修复：把每个 prompt 的
 * current_version 收敛到既有版本历史，从而不再因版本缺失中断启动。
 */
function healPromptVersionPointers(sourceDatabasePath: string): void {
  let imagePrefix: Buffer | undefined;
  try {
    const descriptor = fs.openSync(sourceDatabasePath, fs.constants.O_RDONLY);
    try {
      imagePrefix = Buffer.alloc(16);
      imagePrefix = imagePrefix.subarray(
        0,
        fs.readSync(descriptor, imagePrefix, 0, imagePrefix.length, 0),
      ) as Buffer;
    } finally {
      fs.closeSync(descriptor);
    }
  } catch {
    return;
  }
  if (
    !imagePrefix ||
    imagePrefix.toString("utf8", 0, 16) !== "SQLite format 3\x00"
  ) {
    return;
  }
  const database = new DatabaseAdapter(sourceDatabasePath);
  try {
    repairPromptVersionConsistency(database);
  } finally {
    database.close();
  }
}

/**
 * Relocate a stale `data/.trash/cache/prompt-workspace` leftover out of the
 * canonical authority root without deleting it. In canonical-files mode every
 * file under `data/` must be declared by the Prompt graph manifest (or be a
 * trusted domain/asset prefix); an old file-workspace snapshot that ended up
 * nested under the canonical root makes `verifyInventory` fail on every prompt
 * mutation (`canonical graph file inventory count mismatch`). A non-destructive
 * move to `<activeRoot>/recovery/...` clears the root while preserving the
 * archived snapshot for the user. Idempotent: once moved, the source path no
 * longer exists.
 *
 * 把旧版误入 canonical 根的 `data/.trash/cache/prompt-workspace` 快照非破坏地
 * 搬迁到 recovery 目录再删除 prompt，避免每次 reconcile 时的 inventory mismatch；
 * 仅当该子路径确实存在时才动作，绝不改动、删除快照内容。
 */
/**
 * Returns true when any already-existing segment under `root` is a symbolic
 * link or a non-directory. Missing trailing segments are safe (they will be
 * created as real directories). Used to guarantee relocation never moves a
 * path that resolves outside the canonical root through a symlink ancestor.
 */
function hasUnsafeDirectoryChain(root: string, segments: string[]): boolean {
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) return true;
  }
  return false;
}

export function relocateTrashedPromptWorkspaceFromCanonicalRoot(
  dataRoot: string,
  activeRoot: string,
): void {
  const leftoverSegments = [".trash", "cache", "prompt-workspace"];
  const leftoverRoot = path.join(dataRoot, ...leftoverSegments);
  try {
    if (hasUnsafeDirectoryChain(dataRoot, leftoverSegments)) {
      // A symlinked or non-directory ancestor means leftoverRoot may resolve
      // outside the canonical root. Never relocate such a path.
      return;
    }
    let sourceStat: fs.Stats;
    try {
      sourceStat = fs.lstatSync(leftoverRoot);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) {
      return; // not the well-known snapshot dir; leave other shapes untouched
    }
    const destSegments = ["recovery", "canonical-prompt-trash"];
    if (hasUnsafeDirectoryChain(activeRoot, destSegments)) {
      return;
    }
    const destRoot = path.join(activeRoot, ...destSegments);
    fs.mkdirSync(destRoot, { recursive: true, mode: 0o700 });
    const dest = path.join(
      destRoot,
      `prompt-workspace-${Date.now()}-${process.pid}`,
    );
    fs.renameSync(leftoverRoot, dest);
  } catch (error) {
    // Best-effort relocation: a stale snapshot must never block canonical
    // authority publication (e.g. EACCES on the recovery root or EXDEV across
    // filesystems). Record the full error and continue startup.
    console.warn(
      "[startup] failed to relocate stray canonical prompt-workspace snapshot:",
      error,
    );
  }
}

export async function ensureCanonicalStorageAuthorityOnStartup(
  options: EnsureCanonicalStorageAuthorityOnStartupOptions,
): Promise<CanonicalStorageAuthorityStartupResult> {
  const activeRoot = path.resolve(options.activeRoot);
  if (readCanonicalStorageAuthority(activeRoot)) {
    // Existing authority: relocate any leftover prompt-workspace snapshot found
    // under the canonical root. Pure filesystem relocation is safe here; do NOT
    // open the operational SQLite (an app-held WAL lock must not block startup).
    const sourceDatabasePath = path.resolve(options.sourceDatabasePath);
    if (assertRegularDatabaseOrMissing(sourceDatabasePath)) {
      relocateTrashedPromptWorkspaceFromCanonicalRoot(
        path.dirname(sourceDatabasePath),
        activeRoot,
      );
    }
    return ensureExistingCanonicalAuthority(options, activeRoot);
  }
  if (!readRendererPersistenceMigrationMarker(activeRoot)) {
    return { status: "waiting-renderer-migration" };
  }
  const sourceDatabasePath = path.resolve(options.sourceDatabasePath);
  if (!assertRegularDatabaseOrMissing(sourceDatabasePath)) {
    return { status: "source-database-missing" };
  }
  await options.prepareSourceDatabase?.();
  healPromptVersionPointers(sourceDatabasePath);
  relocateTrashedPromptWorkspaceFromCanonicalRoot(
    path.dirname(sourceDatabasePath),
    activeRoot,
  );
  const checkpointPath = path.resolve(
    options.checkpointPath ??
      path.join(
        activeRoot,
        "cache",
        `.canonical-checkpoint-${crypto.randomUUID()}`,
      ),
  );
  const {
    publish = publishCanonicalStorageAuthority,
    prepareSourceDatabase: _prepareSourceDatabase,
    refreshRuntimeContext = refreshRuntimeStorageContext,
    repairInvalidAuthority: _repairInvalidAuthority,
    reconcileCatalog: _reconcileCatalog,
    ...publicationOptions
  } = options;
  const result = await publish({
    ...publicationOptions,
    activeRoot,
    sourceDatabasePath,
    checkpointPath,
    deviceId: deriveLocalResourceDeviceId(activeRoot),
  });
  refreshRuntimeContext();
  return {
    status: "published",
    operationId: result.operationId,
    consistencyId: result.consistencyId,
    recoveryArtifactPath: result.recoveryArtifactPath,
  };
}
