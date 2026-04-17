/**
 * Desktop-specific database initialization and recovery.
 *
 * Re-exports everything from @prompthub/db and adds Electron-specific logic:
 * - Path resolution via runtime-paths (getUserDataPath)
 * - Stale data recovery (detectRecoverableDatabases, performDatabaseRecovery)
 * - Skill repo path resolution hook (getSkillsDir)
 */
import path from "path";
import fs from "fs";
import {
  DatabaseAdapter,
  initDatabase as dbInit,
  getDatabase,
  closeDatabase,
  isDatabaseEmpty,
} from "@prompthub/db";
import type { InitDatabaseHooks } from "@prompthub/db";
import {
  getLegacyPromptsWorkspaceDir,
  getLegacyWorkspaceDir,
  getSkillsDir,
  getUserDataPath,
} from "../runtime-paths";

// ── Re-exports from @prompthub/db ────────────────────────────────────────────
// All consumers in the desktop app can continue importing from this file.
export { getDatabase, closeDatabase, isDatabaseEmpty };
export { DatabaseAdapter } from "@prompthub/db";
export type { Database } from "@prompthub/db";
export { SCHEMA_TABLES, SCHEMA_INDEXES, SCHEMA } from "@prompthub/db";
export { PromptDB } from "@prompthub/db";
export { FolderDB } from "@prompthub/db";
export { SkillDB } from "@prompthub/db";

// ── Desktop-specific types ───────────────────────────────────────────────────

/** Information about a recoverable database found at another location. */
export interface RecoverableDatabase {
  /** Absolute path to the directory containing the old database. */
  sourcePath: string;
  /** Number of prompts found in the old database. */
  promptCount: number;
  /** Number of folders found in the old database. */
  folderCount: number;
  /** Number of skills found in the old database. */
  skillCount: number;
  /** Size of the database file in bytes. */
  dbSizeBytes: number;
}

const BROWSER_STORAGE_DIRS = [
  "IndexedDB",
  "Local Storage",
  "Session Storage",
];
const FILE_STORAGE_DIRS = ["workspace", "data"];

// ── Path resolution ──────────────────────────────────────────────────────────

function getDbPath(): string {
  const userDataPath = getUserDataPath();
  return path.join(userDataPath, "prompthub.db");
}

// ── Skill repo path resolution hook ──────────────────────────────────────────

function resolveSkillRepoPath(skill: {
  id: string;
  name: string;
  source_url: string | null;
}): string | null {
  const skillsDir = getSkillsDir();

  // (a) Check skillsDir/skill.name
  const byName = path.join(skillsDir, skill.name);
  if (fs.existsSync(byName) && fs.statSync(byName).isDirectory()) {
    return byName;
  }

  // (b) Derive folder from GitHub source_url
  if (skill.source_url && skill.source_url.includes("github.com")) {
    const urlParts = skill.source_url
      .replace("https://github.com/", "")
      .split("/");
    const userDir = urlParts[0];
    const repoName = urlParts[1];
    if (userDir && repoName) {
      const githubFolder = `${userDir}-${repoName}`;
      const byGithub = path.join(skillsDir, githubFolder);
      if (fs.existsSync(byGithub) && fs.statSync(byGithub).isDirectory()) {
        return byGithub;
      }
    }
  }

  // (c) source_url is a local filesystem path
  if (skill.source_url && !skill.source_url.includes("github.com")) {
    try {
      const stat = fs.statSync(skill.source_url);
      if (stat.isDirectory()) {
        return skill.source_url;
      }
    } catch {
      // path doesn't exist or can't be stat'd — skip
    }
  }

  return null;
}

// ── Desktop initDatabase wrapper ─────────────────────────────────────────────

const UPGRADE_BACKUP_MARKER = ".prompthub-0.5.3-backup-done";

/**
 * Make a one-time copy of prompthub.db before the first 0.5.3 boot touches it.
 * A marker file in userData prevents the backup from being repeated.
 *
 * v0.5.3: 首次启动前对 prompthub.db 做一次性备份，防止升级逻辑误伤数据。
 * 使用标记文件避免重复备份。
 */
function ensurePreUpgradeBackup(dbPath: string): void {
  try {
    if (!fs.existsSync(dbPath)) {
      return; // fresh install, nothing to back up
    }
    const markerPath = path.join(path.dirname(dbPath), UPGRADE_BACKUP_MARKER);
    if (fs.existsSync(markerPath)) {
      return; // already done on a previous 0.5.3 boot
    }

    const stats = fs.statSync(dbPath);
    if (stats.size < 4096) {
      // Trivially small DB — nothing meaningful to back up. Do NOT write the
      // marker here: if the user later imports real data and restarts, we want
      // the first "real" boot to still produce a safety backup.
      // v0.5.3 review 反馈修复：空库不写 marker，待真实数据出现时仍能触发备份。
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${dbPath}.backup-before-0.5.3.${timestamp}.db`;
    fs.copyFileSync(dbPath, backupPath);
    fs.writeFileSync(markerPath, new Date().toISOString(), "utf8");
    console.log(`[startup] Pre-0.5.3 backup created at: ${backupPath}`);
  } catch (error) {
    // Backup is defensive — never let it crash startup.
    // 备份属于防御措施，失败不得阻断启动。
    console.warn("[startup] ensurePreUpgradeBackup failed (continuing):", error);
  }
}

/**
 * Initialize database with desktop-specific path resolution and hooks.
 */
export function initDatabase(): DatabaseAdapter.Database {
  const dbPath = getDbPath();
  ensurePreUpgradeBackup(dbPath);
  const hooks: InitDatabaseHooks = {
    resolveSkillRepoPath,
  };
  return dbInit(dbPath, hooks);
}

// ── Data recovery (desktop-only) ─────────────────────────────────────────────

/**
 * Scan candidate directories for recoverable databases that contain user data.
 */
export function detectRecoverableDatabases(
  currentDataPath: string,
  candidatePaths: string[],
): RecoverableDatabase[] {
  const results: RecoverableDatabase[] = [];
  const normalizedCurrent = path.resolve(currentDataPath).toLowerCase();

  for (const candidate of candidatePaths) {
    const normalizedCandidate = path.resolve(candidate).toLowerCase();
    if (normalizedCandidate === normalizedCurrent) {
      continue;
    }

    const dbFile = path.join(candidate, "prompthub.db");
    const browserStorageBytes = getBrowserStorageBytes(candidate);
    const fileStorageBytes = getFileStorageBytes(candidate);
    const workspaceStats = getWorkspaceRecoveryStats(candidate);

    let dbSizeBytes = 0;
    let promptCount = 0;
    let folderCount = 0;
    let skillCount = 0;

    let candidateDb: DatabaseAdapter.Database | null = null;
    if (fs.existsSync(dbFile)) {
      try {
        const stat = fs.statSync(dbFile);
        dbSizeBytes = stat.size;

        // Skip empty/tiny SQLite files unless there is renderer storage data.
        if (stat.size >= 4096) {
          candidateDb = new DatabaseAdapter(dbFile, { readOnly: true });
          candidateDb.pragma("foreign_keys = OFF");

          const promptRow = candidateDb
            .prepare("SELECT COUNT(*) as count FROM prompts")
            .get() as { count: number } | undefined;
          promptCount = promptRow?.count ?? 0;

          const folderRow = candidateDb
            .prepare("SELECT COUNT(*) as count FROM folders")
            .get() as { count: number } | undefined;
          folderCount = folderRow?.count ?? 0;

          try {
            const skillRow = candidateDb
              .prepare("SELECT COUNT(*) as count FROM skills")
              .get() as { count: number } | undefined;
            skillCount = skillRow?.count ?? 0;
          } catch {
            // skills table may not exist in very old databases
          }
        }
      } catch (err) {
        console.warn(
          `[Recovery] Failed to inspect candidate database at ${dbFile}:`,
          err,
        );
      } finally {
        try {
          candidateDb?.close();
        } catch {
          // ignore close errors
        }
      }
    }

    const effectivePromptCount = Math.max(promptCount, workspaceStats.promptCount);
    const effectiveFolderCount = Math.max(folderCount, workspaceStats.folderCount);

    // Only surface candidates that appear to contain meaningful prompt data.
    // A stray empty workspace/, folders.json, or .trash snapshot should not
    // keep nagging the user with a "recoverable data" dialog that shows all 0s.
    if (effectivePromptCount === 0 && browserStorageBytes === 0) {
      continue;
    }

    results.push({
      sourcePath: candidate,
      promptCount: effectivePromptCount,
      folderCount: effectiveFolderCount,
      skillCount,
      dbSizeBytes:
        dbSizeBytes > 0 ? dbSizeBytes : browserStorageBytes + fileStorageBytes,
    });
  }

  return results;
}

/**
 * Recover data from a source directory by copying the database and associated
 * asset directories into the current data path.
 */
export function performDatabaseRecovery(
  sourcePath: string,
  currentDataPath: string,
): { success: boolean; error?: string; backupPath?: string } {
  const sourceDb = path.join(sourcePath, "prompthub.db");
  const targetDb = path.join(currentDataPath, "prompthub.db");

  if (
    !fs.existsSync(sourceDb) &&
    getBrowserStorageBytes(sourcePath) === 0 &&
    getFileStorageBytes(sourcePath) === 0
  ) {
    return {
      success: false,
      error: `Source path has no recoverable data: ${sourcePath}`,
    };
  }

  try {
    // 1. Backup current database
    let backupPath: string | undefined;
    if (fs.existsSync(sourceDb) && fs.existsSync(targetDb)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      backupPath = `${targetDb}.pre-recovery-${timestamp}`;
      fs.copyFileSync(targetDb, backupPath);
      console.log(`[Recovery] Backed up current DB to: ${backupPath}`);
    }

    // 2. Copy source database over current
    if (fs.existsSync(sourceDb)) {
      fs.copyFileSync(sourceDb, targetDb);
      console.log(`[Recovery] Copied database from ${sourceDb} to ${targetDb}`);
    }

    // 3. Copy associated asset directories if they exist in source but not in target
    const assetDirs = [
      "images",
      "videos",
      "skills",
      ...FILE_STORAGE_DIRS,
      ...BROWSER_STORAGE_DIRS,
    ];
    for (const dir of assetDirs) {
      const sourceDir = path.join(sourcePath, dir);
      const targetDir = path.join(currentDataPath, dir);
      if (fs.existsSync(sourceDir) && fs.statSync(sourceDir).isDirectory()) {
        copyDirMerge(sourceDir, targetDir);
        console.log(`[Recovery] Merged asset directory: ${dir}`);
      }
    }

    // 4. Copy config files
    const configFiles = ["shortcuts.json", "shortcut-mode.json"];
    for (const file of configFiles) {
      const sourceFile = fs.existsSync(path.join(sourcePath, "config", file))
        ? path.join(sourcePath, "config", file)
        : path.join(sourcePath, file);
      const targetFile = fs.existsSync(path.join(currentDataPath, "config"))
        ? path.join(currentDataPath, "config", file)
        : path.join(currentDataPath, file);
      if (fs.existsSync(sourceFile) && !fs.existsSync(targetFile)) {
        fs.mkdirSync(path.dirname(targetFile), { recursive: true });
        fs.copyFileSync(sourceFile, targetFile);
        console.log(`[Recovery] Copied config file: ${file}`);
      }
    }

    return { success: true, backupPath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Recovery] Failed to perform recovery:", err);
    return { success: false, error: message };
  }
}

/**
 * Recursively merge source directory into target, copying files that don't
 * already exist in the target.
 */
function copyDirMerge(src: string, dest: string): void {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirMerge(srcPath, destPath);
    } else if (!fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function getBrowserStorageBytes(basePath: string): number {
  return BROWSER_STORAGE_DIRS.reduce((total, dirName) => {
    return total + getDirectorySize(path.join(basePath, dirName));
  }, 0);
}

function getWorkspaceRecoveryStats(basePath: string): {
  promptCount: number;
  folderCount: number;
} {
  const legacyWorkspaceDir = path.join(basePath, path.basename(getLegacyWorkspaceDir()));
  const legacyPromptsDir = path.join(
    legacyWorkspaceDir,
    path.basename(getLegacyPromptsWorkspaceDir()),
  );
  const legacyFoldersFile = path.join(legacyWorkspaceDir, "folders.json");

  const dataDir = path.join(basePath, "data");
  const dataPromptsDir = path.join(dataDir, "prompts");
  const dataFoldersFile = path.join(dataDir, "folders.json");

  return {
    promptCount: Math.max(
      countWorkspacePromptFiles(legacyPromptsDir),
      countWorkspacePromptFiles(dataPromptsDir),
    ),
    folderCount: Math.max(
      readWorkspaceFolderCount(legacyFoldersFile),
      readWorkspaceFolderCount(dataFoldersFile),
    ),
  };
}

function countWorkspacePromptFiles(targetPath: string): number {
  if (!fs.existsSync(targetPath)) {
    return 0;
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(targetPath);
  } catch {
    return 0;
  }

  if (!stat.isDirectory()) {
    return path.basename(targetPath) === "prompt.md" ? 1 : 0;
  }

  let total = 0;
  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    total += countWorkspacePromptFiles(path.join(targetPath, entry.name));
  }
  return total;
}

function readWorkspaceFolderCount(foldersFile: string): number {
  if (!fs.existsSync(foldersFile)) {
    return 0;
  }

  try {
    const raw = fs.readFileSync(foldersFile, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function getFileStorageBytes(basePath: string): number {
  return FILE_STORAGE_DIRS.reduce((total, dirName) => {
    return total + getDirectorySize(path.join(basePath, dirName));
  }, 0);
}

function getDirectorySize(targetPath: string): number {
  if (!fs.existsSync(targetPath)) {
    return 0;
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(targetPath);
  } catch {
    return 0;
  }

  if (!stat.isDirectory()) {
    return stat.size;
  }

  let total = 0;
  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    total += getDirectorySize(path.join(targetPath, entry.name));
  }
  return total;
}
