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
import { getSkillsDir, getUserDataPath } from "../runtime-paths";

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

/**
 * Initialize database with desktop-specific path resolution and hooks.
 */
export function initDatabase(): DatabaseAdapter.Database {
  const dbPath = getDbPath();
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
    if (!fs.existsSync(dbFile)) {
      continue;
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(dbFile);
    } catch {
      continue;
    }

    // Skip empty/tiny files (< 4KB is basically an empty SQLite file)
    if (stat.size < 4096) {
      continue;
    }

    let candidateDb: DatabaseAdapter.Database | null = null;
    try {
      candidateDb = new DatabaseAdapter(dbFile, { readOnly: true });
      candidateDb.pragma("foreign_keys = OFF");

      const promptRow = candidateDb
        .prepare("SELECT COUNT(*) as count FROM prompts")
        .get() as { count: number } | undefined;
      const promptCount = promptRow?.count ?? 0;

      if (promptCount === 0) {
        continue;
      }

      const folderRow = candidateDb
        .prepare("SELECT COUNT(*) as count FROM folders")
        .get() as { count: number } | undefined;
      const folderCount = folderRow?.count ?? 0;

      let skillCount = 0;
      try {
        const skillRow = candidateDb
          .prepare("SELECT COUNT(*) as count FROM skills")
          .get() as { count: number } | undefined;
        skillCount = skillRow?.count ?? 0;
      } catch {
        // skills table may not exist in very old databases
      }

      results.push({
        sourcePath: candidate,
        promptCount,
        folderCount,
        skillCount,
        dbSizeBytes: stat.size,
      });
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

  if (!fs.existsSync(sourceDb)) {
    return { success: false, error: `Source database not found: ${sourceDb}` };
  }

  try {
    // 1. Backup current database
    let backupPath: string | undefined;
    if (fs.existsSync(targetDb)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      backupPath = `${targetDb}.pre-recovery-${timestamp}`;
      fs.copyFileSync(targetDb, backupPath);
      console.log(`[Recovery] Backed up current DB to: ${backupPath}`);
    }

    // 2. Copy source database over current
    fs.copyFileSync(sourceDb, targetDb);
    console.log(`[Recovery] Copied database from ${sourceDb} to ${targetDb}`);

    // 3. Copy associated asset directories if they exist in source but not in target
    const assetDirs = ["images", "videos", "skills"];
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
      const sourceFile = path.join(sourcePath, file);
      const targetFile = path.join(currentDataPath, file);
      if (fs.existsSync(sourceFile) && !fs.existsSync(targetFile)) {
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
