import fs from "fs";
import path from "path";
import crypto from "crypto";

import { createUpgradeDataSnapshot } from "./upgrade-backup";

const LAYOUT_MIGRATION_MARKER = ".data-layout-v0.5.5.json";

/**
 * Legacy root-level directories that must move into `data/` or `config/`.
 * Order matters: "workspace" is processed before "skills" so that
 * `workspace/skills/` (if present in some intermediate build) is handled
 * as part of the `workspace` subtree rather than a standalone entry.
 *
 * 旧版根级目录，需要移动到 `data/` 或 `config/`。
 * 顺序有意义：workspace 先处理，避免其内部的 skills 子目录被重复迁移。
 */
const ROOT_TO_DATA_DIRS = ["workspace", "skills", "images", "videos"] as const;
const ROOT_TO_CONFIG_FILES = ["shortcuts.json", "shortcut-mode.json"] as const;

export type DataLayoutMigrationStatus =
  | "already-migrated"
  | "no-legacy-data"
  | "migrated"
  | "partial-failure";

export interface DataLayoutMigrationResult {
  status: DataLayoutMigrationStatus;
  backupId: string | null;
  movedEntries: string[];
  failedEntries: string[];
  markerPath: string;
}

interface LayoutMarkerRecord {
  version: string;
  migratedAt: string;
  movedEntries: string[];
  failedEntries?: string[];
  backupId?: string;
}

function getMarkerPath(userDataPath: string): string {
  return path.join(path.resolve(userDataPath), LAYOUT_MIGRATION_MARKER);
}

function hasDataEntries(targetPath: string): boolean {
  if (!fs.existsSync(targetPath)) {
    return false;
  }

  try {
    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) {
      return stat.size > 0;
    }

    return fs.readdirSync(targetPath).length > 0;
  } catch {
    return false;
  }
}

function ensureDir(targetPath: string): void {
  fs.mkdirSync(targetPath, { recursive: true });
}

function assertPathWithinRoot(rootPath: string, targetPath: string, label: string): void {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedTarget = path.resolve(targetPath);
  if (
    resolvedTarget !== resolvedRoot &&
    !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error(
      `[data-layout-migration] Refusing to access ${label} outside userData root: ${resolvedTarget}`,
    );
  }
}

function computeFileHash(filePath: string): string {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function ensureSameFileContents(sourcePath: string, targetPath: string): void {
  if (!fs.existsSync(targetPath)) {
    throw new Error(
      `[data-layout-migration] Missing copied file "${targetPath}" for source "${sourcePath}".`,
    );
  }

  const sourceStat = fs.statSync(sourcePath);
  const targetStat = fs.statSync(targetPath);
  if (sourceStat.size !== targetStat.size) {
    throw new Error(
      `[data-layout-migration] File verification failed for "${sourcePath}": ` +
        `source size ${sourceStat.size} but target size ${targetStat.size}.`,
    );
  }

  if (computeFileHash(sourcePath) !== computeFileHash(targetPath)) {
    throw new Error(
      `[data-layout-migration] File verification failed for "${sourcePath}": ` +
        `target "${targetPath}" exists but content differs.`,
    );
  }
}

/**
 * Copy sourcePath → targetPath recursively (never overwrites existing target files).
 * Returns the number of files successfully copied.
 *
 * 递归复制目录，不覆盖目标中已有的文件，返回成功复制的文件数量。
 */
function copyDirRecursive(sourcePath: string, targetPath: string): number {
  ensureDir(targetPath);
  let copied = 0;

  const entries = fs.readdirSync(sourcePath, { withFileTypes: true });
  for (const entry of entries) {
    const fromPath = path.join(sourcePath, entry.name);
    const toPath = path.join(targetPath, entry.name);

    if (entry.isDirectory()) {
      copied += copyDirRecursive(fromPath, toPath);
      continue;
    }

    if (!fs.existsSync(toPath)) {
      fs.copyFileSync(fromPath, toPath);
      copied++;
      continue;
    }

    ensureSameFileContents(fromPath, toPath);
  }

  return copied;
}

/**
 * Verify every source file has an identical counterpart under targetPath.
 *
 * 验证源目录中的每个文件在目标目录中都存在且内容一致。
 */
function verifyDirectoryContents(sourcePath: string, targetPath: string): void {
  const entries = fs.readdirSync(sourcePath, { withFileTypes: true });
  for (const entry of entries) {
    const fromPath = path.join(sourcePath, entry.name);
    const toPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      verifyDirectoryContents(fromPath, toPath);
      continue;
    }
    ensureSameFileContents(fromPath, toPath);
  }
}

/**
 * Safe directory move: copy-verify-delete pattern.
 *
 * 1. Try atomic rename (same filesystem, instant).
 * 2. If rename fails (cross-device or target exists), copy then verify every source file.
 * 3. Only delete source after every source file exists at target with identical content.
 * 4. Throws on failure — caller must handle and preserve the source directory.
 *
 * 安全目录移动：复制-验证-删除模式。
 * rename 失败（跨卷或目标已存在）时退化为 copy + 全量校验 + delete。
 * 验证失败时抛出异常，由调用方决定是否继续，绝不静默丢失数据。
 */
function moveDirectory(sourcePath: string, targetPath: string): void {
  if (!fs.existsSync(sourcePath)) {
    return;
  }

  // Fast path: atomic rename when target doesn't exist.
  // 快速路径：目标不存在时直接 rename（原子操作）。
  if (!fs.existsSync(targetPath)) {
    ensureDir(path.dirname(targetPath));
    try {
      fs.renameSync(sourcePath, targetPath);
      return;
    } catch {
      // renameSync can fail across devices (EXDEV) or on Windows (EPERM).
      // Fall through to copy-verify-delete.
      // rename 可能因跨设备 (EXDEV) 或 Windows 权限 (EPERM) 失败，降级为安全复制。
    }
  }

  // Safe copy-verify-delete.
  // 安全复制-验证-删除。
  copyDirRecursive(sourcePath, targetPath);
  verifyDirectoryContents(sourcePath, targetPath);

  fs.rmSync(sourcePath, { recursive: true, force: true });
}

/**
 * Safe file move: copy-verify-delete pattern.
 *
 * 安全文件移动：复制/比对 + 内容验证 + 删除源。
 */
function moveFile(sourcePath: string, targetPath: string): void {
  if (!fs.existsSync(sourcePath)) {
    return;
  }

  ensureDir(path.dirname(targetPath));

  // Fast path: target doesn't exist yet.
  if (!fs.existsSync(targetPath)) {
    try {
      fs.renameSync(sourcePath, targetPath);
      return;
    } catch {
      // Fall through to copy-verify-delete on rename failure.
    }
  }

  if (!fs.existsSync(targetPath)) {
    fs.copyFileSync(sourcePath, targetPath);
  }

  ensureSameFileContents(sourcePath, targetPath);
  fs.rmSync(sourcePath, { force: true });
}

function getTargetPath(userDataPath: string, entryName: string): string {
  if (entryName === "workspace") {
    return path.join(userDataPath, "data");
  }
  if (entryName === "skills") {
    return path.join(userDataPath, "data", "skills");
  }
  if (entryName === "images") {
    return path.join(userDataPath, "data", "assets", "images");
  }
  if (entryName === "videos") {
    return path.join(userDataPath, "data", "assets", "videos");
  }
  if (entryName === "shortcuts.json" || entryName === "shortcut-mode.json") {
    return path.join(userDataPath, "config", entryName);
  }

  return path.join(userDataPath, entryName);
}

/**
 * Detect legacy root-level entries.
 *
 * 检测旧版根级条目。
 * 保持纯检测，不在此阶段改动磁盘状态。
 */
function detectLegacyEntries(userDataPath: string): string[] {
  const entries: string[] = [];

  for (const dirName of ROOT_TO_DATA_DIRS) {
    if (hasDataEntries(path.join(userDataPath, dirName))) {
      entries.push(dirName);
    }
  }

  for (const fileName of ROOT_TO_CONFIG_FILES) {
    if (hasDataEntries(path.join(userDataPath, fileName))) {
      entries.push(fileName);
    }
  }

  return entries;
}

function writeMarker(
  userDataPath: string,
  movedEntries: string[],
  failedEntries: string[],
  backupId: string | null,
): string {
  const markerPath = getMarkerPath(userDataPath);
  const payload: LayoutMarkerRecord = {
    version: "0.5.5",
    migratedAt: new Date().toISOString(),
    movedEntries,
    ...(failedEntries.length > 0 ? { failedEntries } : {}),
    ...(backupId ? { backupId } : {}),
  };

  fs.writeFileSync(markerPath, JSON.stringify(payload, null, 2), "utf8");
  return markerPath;
}

function readMarker(userDataPath: string): Partial<LayoutMarkerRecord> | null {
  const markerPath = getMarkerPath(userDataPath);
  if (!fs.existsSync(markerPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(markerPath, "utf8")) as Partial<LayoutMarkerRecord>;
  } catch {
    return null;
  }
}

export function getDataLayoutMigrationMarkerPath(userDataPath: string): string {
  return getMarkerPath(userDataPath);
}

/**
 * Returns true if the migration marker exists AND all previously failed
 * entries are now gone from the legacy root (i.e., a retry succeeded).
 * Used by the startup log to surface residual migration problems.
 *
 * 若标记存在且之前失败的条目已不在旧根目录中，返回 true（重试成功）。
 */
export function isDataLayoutFullyMigrated(userDataPath: string): boolean {
  const markerPath = getMarkerPath(path.resolve(userDataPath));
  if (!fs.existsSync(markerPath)) return false;

  try {
    const record = JSON.parse(
      fs.readFileSync(markerPath, "utf8"),
    ) as Partial<LayoutMarkerRecord>;
    const failed = record.failedEntries ?? [];
    return failed.every(
      (entry) => !hasDataEntries(path.join(path.resolve(userDataPath), entry)),
    );
  } catch {
    return false;
  }
}

/**
 * Check whether any legacy entries are still present at the root, indicating
 * a previous migration attempt did not fully complete. This is used by the
 * startup diagnostics to populate `DataRecoveryDialog` with a warning.
 *
 * 检查根目录是否仍有旧版条目残留（说明上次迁移未完成）。
 * 启动诊断使用此函数，以便在 DataRecoveryDialog 中显示警告。
 */
export function detectResidualLegacyEntries(userDataPath: string): string[] {
  const resolved = path.resolve(userDataPath);
  const residual: string[] = [];

  for (const dirName of ROOT_TO_DATA_DIRS) {
    if (hasDataEntries(path.join(resolved, dirName))) {
      residual.push(dirName);
    }
  }

  for (const fileName of ROOT_TO_CONFIG_FILES) {
    if (hasDataEntries(path.join(resolved, fileName))) {
      residual.push(fileName);
    }
  }

  return residual;
}

export async function migrateLegacyDataLayout(
  userDataPath: string,
  currentVersion: string,
): Promise<DataLayoutMigrationResult> {
  const resolvedUserDataPath = path.resolve(userDataPath);
  const markerPath = getMarkerPath(resolvedUserDataPath);

  const previousMarker = readMarker(resolvedUserDataPath);
  const residualEntries = detectResidualLegacyEntries(resolvedUserDataPath);
  const legacyEntries =
    previousMarker !== null ? residualEntries : detectLegacyEntries(resolvedUserDataPath);

  if (previousMarker !== null && legacyEntries.length === 0) {
    return {
      status: "already-migrated",
      backupId: null,
      movedEntries: [],
      failedEntries: [],
      markerPath,
    };
  }

  if (legacyEntries.length === 0) {
    return {
      status: "no-legacy-data",
      backupId: null,
      movedEntries: [],
      failedEntries: [],
      markerPath,
    };
  }

  const snapshot = await createUpgradeDataSnapshot(resolvedUserDataPath, {
    fromVersion: `${currentVersion}-pre-layout-migration`,
    toVersion: currentVersion,
  });

  const movedEntries: string[] = [];
  const failedEntries: string[] = [];

  for (const entryName of legacyEntries) {
    const sourcePath = path.join(resolvedUserDataPath, entryName);
    const targetPath = getTargetPath(resolvedUserDataPath, entryName);

    try {
      assertPathWithinRoot(resolvedUserDataPath, sourcePath, "source path");
      assertPathWithinRoot(resolvedUserDataPath, targetPath, "target path");
      const stat = fs.statSync(sourcePath);
      if (stat.isDirectory()) {
        moveDirectory(sourcePath, targetPath);
      } else {
        moveFile(sourcePath, targetPath);
      }
      movedEntries.push(entryName);
      console.log(
        `[data-layout-migration] Moved "${entryName}" → "${path.relative(resolvedUserDataPath, targetPath)}"`,
      );
    } catch (err) {
      // Per-entry failure: log and continue. A partial migration is better
      // than a crash. Source directory is preserved on failure so data is safe.
      // The failed entry will be recorded in the marker so the UI can warn.
      //
      // 单条目失败：记录日志并继续。部分迁移优于崩溃。
      // 失败时源目录得到保留，数据安全。失败条目会写入标记供 UI 展示警告。
      console.error(`[data-layout-migration] Failed to move "${entryName}":`, err);
      failedEntries.push(entryName);
    }
  }

  ensureDir(path.join(resolvedUserDataPath, "data"));
  ensureDir(path.join(resolvedUserDataPath, "config"));
  ensureDir(path.join(resolvedUserDataPath, "logs"));

  // Write/update the marker even on partial failure. Residual legacy entries
  // are detected on next startup and retried, so the marker acts as progress
  // bookkeeping rather than a "do not run again" sentinel.
  //
  // 无论是否部分失败都写/更新标记。下次启动仍会检测残留条目并重试，
  // 因此该标记只是进度记录，而不是“永不再跑”的哨兵。
  const mergedMovedEntries = Array.from(
    new Set([...(previousMarker?.movedEntries ?? []), ...movedEntries]),
  );

  // Preserve the original backup reference from the first run.
  // The first snapshot captures the complete pre-migration state; retry snapshots
  // only cover residual entries and are sparse — they must NOT replace the
  // canonical reference stored by the initial run.
  //
  // 保留首次运行时的备份 ID。初次快照涵盖完整迁移前状态；重试快照只包含残留条目，
  // 不得用稀疏快照覆盖首次完整备份的引用。
  const canonicalBackupId = previousMarker?.backupId ?? snapshot.backupId;

  const writtenMarkerPath = writeMarker(
    resolvedUserDataPath,
    mergedMovedEntries,
    failedEntries,
    canonicalBackupId,
  );

  return {
    status: failedEntries.length > 0 ? "partial-failure" : "migrated",
    backupId: canonicalBackupId,
    movedEntries: mergedMovedEntries,
    failedEntries,
    markerPath: writtenMarkerPath,
  };
}
