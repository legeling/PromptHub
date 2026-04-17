import fs from "fs";
import path from "path";

/**
 * Upgrade backup service
 *
 * Creates, lists, restores, and deletes "pre-upgrade" snapshots of the entire
 * userData directory so users can recover after a botched upgrade (see #94).
 *
 * Layout (v0.5.4+):
 *   <userData>/backups/
 *       v<fromVersion>-<timestamp>/
 *           backup-manifest.json
 *           prompthub.db
 *           skills/...
 *           workspace/...
 *           ...
 *       .legacy-migrated                (marker, see migrateLegacyUpgradeBackups)
 *
 * Legacy layout (v0.5.3, to be migrated once and removed):
 *   <userData>/../PromptHub-upgrade-backups/
 *       v<version>-<timestamp>/
 *           backup-manifest.json        (schemaVersion implicit, `version` field)
 *           ...
 */

/** New backup root name (lives INSIDE userData). */
const UPGRADE_BACKUP_ROOT_NAME = "backups";

/** Legacy backup root name (sibling of userData). Kept for one-time migration. */
const LEGACY_UPGRADE_BACKUP_ROOT_NAME = "PromptHub-upgrade-backups";

/** Marker file written into the new root once legacy migration has run. */
const LEGACY_MIGRATION_MARKER = ".legacy-migrated";

const MANIFEST_FILE_NAME = "backup-manifest.json";

const MANIFEST_KIND = "prompthub-upgrade-backup";
const MANIFEST_SCHEMA_VERSION = 2;

export interface UpgradeBackupManifest {
  kind: typeof MANIFEST_KIND;
  schemaVersion: number;
  createdAt: string;
  /** Version the data was written by (i.e. the version being replaced). */
  fromVersion: string;
  /**
   * Version the user is upgrading TO. Optional because the snapshot may be
   * created before the new binary has ever run (install-time trigger), in
   * which case only `fromVersion` is known.
   */
  toVersion?: string;
  sourcePath: string;
  copiedItems: string[];
  platform: string;
  /** Absolute path this backup was migrated from, if applicable. */
  legacyMigratedFrom?: string;
}

export interface UpgradeBackupSnapshot {
  /** Absolute path of the snapshot directory. */
  backupPath: string;
  /** Directory name only (usable as a stable id within <userData>/backups). */
  backupId: string;
  manifest: UpgradeBackupManifest;
}

export interface UpgradeBackupEntry {
  backupPath: string;
  backupId: string;
  manifest: UpgradeBackupManifest;
  /** Total size of the snapshot on disk, in bytes. */
  sizeBytes: number;
}

export interface CreateUpgradeDataSnapshotOptions {
  /** Version of the data being backed up (required). */
  fromVersion: string;
  /** Version being upgraded to, if known. */
  toVersion?: string;
}

export interface MigrateLegacyResult {
  migrated: number;
  skipped: number;
  legacyRoot: string;
  alreadyDone: boolean;
}

// ── Path helpers ─────────────────────────────────────────────────────────────

function formatTimestampForPath(timestamp: string): string {
  return timestamp.replace(/[:.]/g, "-");
}

function sanitizeVersion(version: string): string {
  return version.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export function getUpgradeBackupRoot(userDataPath: string): string {
  return path.join(path.resolve(userDataPath), UPGRADE_BACKUP_ROOT_NAME);
}

export function getLegacyUpgradeBackupRoot(userDataPath: string): string {
  return path.join(
    path.dirname(path.resolve(userDataPath)),
    LEGACY_UPGRADE_BACKUP_ROOT_NAME,
  );
}

// ── Filesystem utilities ─────────────────────────────────────────────────────

async function directorySize(dirPath: string): Promise<number> {
  let total = 0;
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += await directorySize(entryPath);
    } else if (entry.isFile()) {
      const stat = await fs.promises.stat(entryPath);
      total += stat.size;
    }
  }
  return total;
}

function isValidBackupId(backupId: string): boolean {
  // Prevent path traversal / absolute paths / hidden system entries.
  if (!backupId || backupId.trim().length === 0) return false;
  if (backupId.includes("/") || backupId.includes("\\")) return false;
  if (backupId === "." || backupId === "..") return false;
  if (backupId.startsWith(".")) return false;
  return true;
}

function parseManifest(raw: unknown): UpgradeBackupManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.kind !== MANIFEST_KIND) return null;

  // v0.5.3 legacy manifests used `version` instead of `fromVersion`.
  const fromVersion =
    typeof obj.fromVersion === "string"
      ? obj.fromVersion
      : typeof obj.version === "string"
        ? obj.version
        : null;
  if (!fromVersion) return null;

  if (typeof obj.createdAt !== "string") return null;
  if (typeof obj.sourcePath !== "string") return null;
  if (!Array.isArray(obj.copiedItems)) return null;
  const copiedItems = obj.copiedItems.filter(
    (item): item is string => typeof item === "string",
  );
  if (copiedItems.length !== obj.copiedItems.length) return null;

  const schemaVersion =
    typeof obj.schemaVersion === "number" ? obj.schemaVersion : 1;

  return {
    kind: MANIFEST_KIND,
    schemaVersion,
    createdAt: obj.createdAt,
    fromVersion,
    toVersion:
      typeof obj.toVersion === "string" && obj.toVersion.length > 0
        ? obj.toVersion
        : undefined,
    sourcePath: obj.sourcePath,
    copiedItems,
    platform: typeof obj.platform === "string" ? obj.platform : "unknown",
    legacyMigratedFrom:
      typeof obj.legacyMigratedFrom === "string"
        ? obj.legacyMigratedFrom
        : undefined,
  };
}

async function readManifest(
  backupPath: string,
): Promise<UpgradeBackupManifest | null> {
  const manifestPath = path.join(backupPath, MANIFEST_FILE_NAME);
  try {
    const raw = await fs.promises.readFile(manifestPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return parseManifest(parsed);
  } catch {
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Copy the entire userData tree into <userData>/backups/v<from>-<timestamp>/
 * and write a manifest describing what was copied.
 *
 * Never silently overwrites: if a directory with the same name already exists
 * the operation fails rather than merging content.
 */
export async function createUpgradeDataSnapshot(
  userDataPath: string,
  options: CreateUpgradeDataSnapshotOptions,
): Promise<UpgradeBackupSnapshot> {
  if (!userDataPath || userDataPath.trim().length === 0) {
    throw new Error("Cannot create upgrade backup without a user data path");
  }
  if (!options.fromVersion || options.fromVersion.trim().length === 0) {
    throw new Error("Cannot create upgrade backup without fromVersion");
  }

  const resolvedUserDataPath = path.resolve(userDataPath);
  if (!fs.existsSync(resolvedUserDataPath)) {
    throw new Error(
      `Cannot create upgrade backup because the user data path does not exist: ${resolvedUserDataPath}`,
    );
  }

  const entries = await fs.promises.readdir(resolvedUserDataPath, {
    withFileTypes: true,
  });
  const copiedItems = entries
    .map((entry) => entry.name)
    // Skip the backup root itself so we don't recursively copy previous snapshots.
    .filter((entryName) => entryName !== UPGRADE_BACKUP_ROOT_NAME);

  if (copiedItems.length === 0) {
    throw new Error(
      `Cannot create upgrade backup because the user data path is empty: ${resolvedUserDataPath}`,
    );
  }

  const createdAt = new Date().toISOString();
  const backupRoot = getUpgradeBackupRoot(resolvedUserDataPath);
  const backupId = `v${sanitizeVersion(options.fromVersion)}-${formatTimestampForPath(createdAt)}`;
  const backupPath = path.join(backupRoot, backupId);

  await fs.promises.mkdir(backupPath, { recursive: true });

  for (const entryName of copiedItems) {
    const sourcePath = path.join(resolvedUserDataPath, entryName);
    const targetPath = path.join(backupPath, entryName);
    await fs.promises.cp(sourcePath, targetPath, {
      recursive: true,
      preserveTimestamps: true,
      errorOnExist: true,
      force: false,
    });
  }

  const manifest: UpgradeBackupManifest = {
    kind: MANIFEST_KIND,
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    createdAt,
    fromVersion: options.fromVersion,
    toVersion: options.toVersion,
    sourcePath: resolvedUserDataPath,
    copiedItems,
    platform: process.platform,
  };

  await fs.promises.writeFile(
    path.join(backupPath, MANIFEST_FILE_NAME),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  return { backupPath, backupId, manifest };
}

/**
 * List all valid upgrade backups under <userData>/backups, newest first.
 * Directories without a readable manifest are ignored silently.
 */
export async function listUpgradeBackups(
  userDataPath: string,
): Promise<UpgradeBackupEntry[]> {
  const root = getUpgradeBackupRoot(userDataPath);
  if (!fs.existsSync(root)) return [];

  const dirEntries = await fs.promises.readdir(root, { withFileTypes: true });
  const results: UpgradeBackupEntry[] = [];

  for (const entry of dirEntries) {
    if (!entry.isDirectory()) continue;
    if (!isValidBackupId(entry.name)) continue;

    const backupPath = path.join(root, entry.name);
    const manifest = await readManifest(backupPath);
    if (!manifest) continue;

    let sizeBytes = 0;
    try {
      sizeBytes = await directorySize(backupPath);
    } catch {
      sizeBytes = 0;
    }

    results.push({
      backupPath,
      backupId: entry.name,
      manifest,
      sizeBytes,
    });
  }

  results.sort((a, b) =>
    b.manifest.createdAt.localeCompare(a.manifest.createdAt),
  );
  return results;
}

/**
 * Delete a single upgrade backup by id. The id must be the directory name as
 * returned by {@link listUpgradeBackups}; arbitrary paths are rejected.
 */
export async function deleteUpgradeBackup(
  userDataPath: string,
  backupId: string,
): Promise<void> {
  if (!isValidBackupId(backupId)) {
    throw new Error(`Invalid upgrade backup id: ${backupId}`);
  }
  const root = getUpgradeBackupRoot(userDataPath);
  const backupPath = path.join(root, backupId);

  // Defence in depth: ensure the resolved path is still inside the root.
  const resolved = path.resolve(backupPath);
  const resolvedRoot = path.resolve(root);
  if (
    resolved !== path.join(resolvedRoot, backupId) ||
    !resolved.startsWith(resolvedRoot + path.sep)
  ) {
    throw new Error(`Refusing to delete backup outside root: ${resolved}`);
  }

  if (!fs.existsSync(backupPath)) return;

  // Require a valid manifest so we don't delete an unrelated directory that
  // someone may have dropped into <userData>/backups.
  const manifest = await readManifest(backupPath);
  if (!manifest) {
    throw new Error(
      `Refusing to delete '${backupId}': not a valid upgrade backup (missing manifest)`,
    );
  }

  await fs.promises.rm(backupPath, { recursive: true, force: true });
}

/**
 * Look up a single upgrade backup by id, returning its manifest and absolute
 * path. Returns null if the id is invalid or the backup is missing/corrupt.
 */
export async function getUpgradeBackup(
  userDataPath: string,
  backupId: string,
): Promise<UpgradeBackupEntry | null> {
  if (!isValidBackupId(backupId)) return null;
  const root = getUpgradeBackupRoot(userDataPath);
  const backupPath = path.join(root, backupId);
  if (!fs.existsSync(backupPath)) return null;

  const manifest = await readManifest(backupPath);
  if (!manifest) return null;

  let sizeBytes = 0;
  try {
    sizeBytes = await directorySize(backupPath);
  } catch {
    sizeBytes = 0;
  }

  return { backupPath, backupId, manifest, sizeBytes };
}

/**
 * One-time migration: move snapshots from the legacy sibling directory
 * (<userData>/../PromptHub-upgrade-backups) into <userData>/backups, then
 * write a marker so we never run again. Failures are non-fatal — the legacy
 * directory is left intact so a retry is possible on the next launch.
 */
export async function migrateLegacyUpgradeBackups(
  userDataPath: string,
): Promise<MigrateLegacyResult> {
  const resolvedUserDataPath = path.resolve(userDataPath);
  const legacyRoot = getLegacyUpgradeBackupRoot(resolvedUserDataPath);
  const newRoot = getUpgradeBackupRoot(resolvedUserDataPath);
  const markerPath = path.join(newRoot, LEGACY_MIGRATION_MARKER);

  // If the marker is already present, we've run before.
  if (fs.existsSync(markerPath)) {
    return { migrated: 0, skipped: 0, legacyRoot, alreadyDone: true };
  }

  // Nothing to migrate — still write the marker so future launches are cheap.
  if (!fs.existsSync(legacyRoot)) {
    await fs.promises.mkdir(newRoot, { recursive: true });
    await fs.promises.writeFile(markerPath, new Date().toISOString(), "utf8");
    return { migrated: 0, skipped: 0, legacyRoot, alreadyDone: false };
  }

  await fs.promises.mkdir(newRoot, { recursive: true });

  let migrated = 0;
  let skipped = 0;

  const legacyEntries = await fs.promises.readdir(legacyRoot, {
    withFileTypes: true,
  });

  for (const entry of legacyEntries) {
    if (!entry.isDirectory()) {
      skipped++;
      continue;
    }
    if (!isValidBackupId(entry.name)) {
      skipped++;
      continue;
    }

    const legacyBackupPath = path.join(legacyRoot, entry.name);
    const newBackupPath = path.join(newRoot, entry.name);

    // Skip if already present in the new root (previous partial migration).
    if (fs.existsSync(newBackupPath)) {
      skipped++;
      continue;
    }

    const manifest = await readManifest(legacyBackupPath);

    try {
      await fs.promises.cp(legacyBackupPath, newBackupPath, {
        recursive: true,
        preserveTimestamps: true,
        errorOnExist: true,
        force: false,
      });
    } catch (error) {
      console.warn(
        `[upgrade-backup] Failed to migrate '${entry.name}' from legacy root:`,
        error,
      );
      // Best-effort cleanup of a partial copy so retries remain possible.
      await fs.promises.rm(newBackupPath, { recursive: true, force: true });
      skipped++;
      continue;
    }

    // Rewrite the manifest with the new schema + legacyMigratedFrom hint.
    if (manifest) {
      const upgraded: UpgradeBackupManifest = {
        ...manifest,
        schemaVersion: MANIFEST_SCHEMA_VERSION,
        legacyMigratedFrom: legacyBackupPath,
      };
      try {
        await fs.promises.writeFile(
          path.join(newBackupPath, MANIFEST_FILE_NAME),
          JSON.stringify(upgraded, null, 2),
          "utf8",
        );
      } catch (error) {
        console.warn(
          `[upgrade-backup] Migrated '${entry.name}' but could not rewrite manifest:`,
          error,
        );
      }
    }

    // Legacy copy removed only after the new copy is in place.
    try {
      await fs.promises.rm(legacyBackupPath, { recursive: true, force: true });
    } catch (error) {
      console.warn(
        `[upgrade-backup] Migrated '${entry.name}' but could not remove legacy copy:`,
        error,
      );
    }

    migrated++;
  }

  // Remove the legacy root if it's now empty, so users don't see a stale dir.
  try {
    const remaining = await fs.promises.readdir(legacyRoot);
    if (remaining.length === 0) {
      await fs.promises.rm(legacyRoot, { recursive: true, force: true });
    }
  } catch {
    // non-fatal
  }

  await fs.promises.writeFile(markerPath, new Date().toISOString(), "utf8");

  return { migrated, skipped, legacyRoot, alreadyDone: false };
}
