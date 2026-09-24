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
  createDatabaseSafetyPoint,
  DatabaseAdapter,
  initDatabase as dbInit,
  getDatabase,
  closeDatabase,
  isDatabaseEmpty,
} from "@prompthub/db";
import {
  assertStorageMaintenanceAvailable,
  CanonicalRuleDB,
  CanonicalSkillDB,
  getRuntimeStorageContext,
  recoverCanonicalResourcePublications,
  recoverCanonicalEntryPublications,
} from "@prompthub/core";
import type { RecoveryContentCounts } from "@prompthub/shared/types";
import {
  getLegacyPromptsWorkspaceDir,
  getDataDir,
  getDatabasePath,
  getLegacyWorkspaceDir,
  getSkillsDir,
  getUserDataPath,
} from "../runtime-paths";
import { reconcileDesktopSkillRepoPaths } from "../services/skill-repo-reconciliation";

// ── Re-exports from @prompthub/db ────────────────────────────────────────────
// All consumers in the desktop app can continue importing from this file.
export { getDatabase, closeDatabase, isDatabaseEmpty };
export { DatabaseAdapter } from "@prompthub/db";
export type { Database } from "@prompthub/db";
export { SCHEMA_TABLES, SCHEMA_INDEXES, SCHEMA } from "@prompthub/db";
export {
  PromptDB,
  PromptRelationDB,
  PromptOutputFormatDB,
  FolderDB,
} from "@prompthub/core";
export { SkillDB, RuleDB } from "@prompthub/core";

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
  /** Whether a readable SQLite database file exists at this location. */
  hasDatabaseFile?: boolean;
  /** Whether prompt workspace files exist at this location. */
  hasWorkspaceData?: boolean;
  /** Whether browser storage artifacts exist at this location. */
  hasBrowserStorage?: boolean;
  /** File counts for durable data that is not represented by SQLite rows. */
  contentCounts?: RecoveryContentCounts;
}

const BROWSER_STORAGE_DIRS = ["IndexedDB", "Local Storage", "Session Storage"];
const FILE_STORAGE_DIRS = ["workspace", "data"];
const DURABLE_CONTENT_PATHS = {
  mcp: ["mcp", path.join("data", "mcp")],
  rules: ["rules", path.join("data", "rules")],
  plugins: ["plugins", path.join("data", "plugins")],
  config: ["config"],
  media: [
    "images",
    "videos",
    path.join("data", "assets"),
    path.join("data", "images"),
    path.join("data", "videos"),
  ],
} as const;
const KNOWN_DATA_ENTRIES = new Set([
  "assets",
  "folders.json",
  "images",
  "mcp",
  "plugins",
  "prompts",
  "rules",
  "skills",
  "videos",
]);
const ADDITIONAL_RECOVERY_TABLES = [
  "prompt_versions",
  "prompt_relations",
  "prompt_output_format_items",
  "settings",
  "skill_versions",
  "rules",
  "rule_versions",
  "user_settings",
] as const;
type RecoveryTableName =
  | "prompts"
  | "folders"
  | "skills"
  | (typeof ADDITIONAL_RECOVERY_TABLES)[number];

// ── Path resolution ──────────────────────────────────────────────────────────

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
  assertStorageMaintenanceAvailable(getUserDataPath());
  recoverCanonicalEntryPublications(getUserDataPath());
  recoverCanonicalResourcePublications(getDataDir());
  const dbPath = getDatabasePath();
  const database = dbInit(dbPath, {
    // Main-process initialization runs only after Electron's single-instance gate.
    recoverUnregisteredLock: true,
  });
  try {
    if (getRuntimeStorageContext().localAuthority === "canonical-files") {
      new CanonicalSkillDB(database).reconcileCanonicalWorkspaces();
      new CanonicalRuleDB(database).reconcileCanonicalWorkspaces();
    } else {
      reconcileDesktopSkillRepoPaths(
        database,
        path.join(
          getDataDir(),
          "operations",
          "migrations",
          "desktop-skill-repo-v1.json",
        ),
        resolveSkillRepoPath,
      );
    }
    return database;
  } catch (error) {
    closeDatabase();
    throw error;
  }
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

    const candidateStat = readLinkSafeStats(candidate);
    if (!candidateStat?.isDirectory() || candidateStat.isSymbolicLink()) {
      continue;
    }

    const dbFile = getExistingLinkSafeCanonicalDbPath(candidate);
    const browserStorageBytes = getBrowserStorageBytes(candidate);
    const fileStorageBytes = getFileStorageBytes(candidate);
    const workspaceStats = getWorkspaceRecoveryStats(candidate);
    const fileSkillCount = getFileSkillCount(candidate);
    const contentCounts = getDurableContentCounts(candidate);

    let dbSizeBytes = 0;
    let promptCount = 0;
    let folderCount = 0;
    let skillCount = 0;
    let hasAdditionalDatabaseData = false;
    let databaseTemporarilyUnavailable = false;

    let candidateDb: DatabaseAdapter.Database | null = null;
    if (dbFile) {
      try {
        const stat = readLinkSafeStats(dbFile);
        if (!stat?.isFile() || stat.isSymbolicLink()) {
          continue;
        }
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
          hasAdditionalDatabaseData = databaseHasAdditionalRecords(candidateDb);
        }
      } catch (err) {
        databaseTemporarilyUnavailable = /(?:locked|busy)/i.test(
          err instanceof Error ? err.message : String(err),
        );
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

    const effectivePromptCount = Math.max(
      promptCount,
      workspaceStats.promptCount,
    );
    const effectiveFolderCount = Math.max(
      folderCount,
      workspaceStats.folderCount,
    );
    const effectiveSkillCount = Math.max(skillCount, fileSkillCount);

    // Only surface candidates that appear to contain real user data.
    // A stray empty workspace/, folders.json, or .trash snapshot should not
    // keep nagging the user with a "recoverable data" dialog that shows all 0s.
    if (
      effectivePromptCount === 0 &&
      effectiveSkillCount === 0 &&
      browserStorageBytes === 0 &&
      sumContentCounts(contentCounts) === 0 &&
      !hasAdditionalDatabaseData &&
      !databaseTemporarilyUnavailable
    ) {
      continue;
    }

    results.push({
      sourcePath: candidate,
      promptCount: effectivePromptCount,
      folderCount: effectiveFolderCount,
      skillCount: effectiveSkillCount,
      dbSizeBytes:
        dbSizeBytes > 0
          ? dbSizeBytes
          : browserStorageBytes +
            fileStorageBytes +
            getDirectorySize(path.join(candidate, "config")),
      hasDatabaseFile: dbSizeBytes >= 4096,
      hasWorkspaceData:
        workspaceStats.promptCount > 0 || workspaceStats.folderCount > 0,
      hasBrowserStorage: browserStorageBytes > 0,
      contentCounts,
    });
  }

  return results;
}

/**
 * Inspect standalone SQLite backup files (for example
 * `prompthub.db.backup-before-0.5.3.*.db`) and surface those that still
 * contain user data.
 */
export function detectRecoverableDatabaseFiles(
  currentDataPath: string,
  candidateFiles: string[],
): RecoverableDatabase[] {
  const results: RecoverableDatabase[] = [];
  const normalizedCurrentDb = path.resolve(getDatabasePath()).toLowerCase();

  for (const candidateFile of candidateFiles) {
    const normalizedCandidate = path.resolve(candidateFile).toLowerCase();
    if (normalizedCandidate === normalizedCurrentDb) {
      continue;
    }

    const inspected = inspectRecoverableDatabaseFile(candidateFile);
    if (inspected) results.push(inspected);
  }

  return results;
}

function inspectRecoverableDatabaseFile(
  candidateFile: string,
): RecoverableDatabase | null {
  const stat = readLinkSafeStats(candidateFile);
  if (!stat?.isFile() || stat.isSymbolicLink() || stat.size < 4096) return null;

  let candidateDb: DatabaseAdapter.Database | null = null;
  try {
    candidateDb = new DatabaseAdapter(candidateFile, { readOnly: true });
    candidateDb.pragma("foreign_keys = OFF");
    const promptCount = readRecoveryTableCount(candidateDb, "prompts");
    const folderCount = readRecoveryTableCount(candidateDb, "folders");
    const skillCount = readRecoveryTableCount(candidateDb, "skills", true);
    if (
      promptCount === 0 &&
      folderCount === 0 &&
      skillCount === 0 &&
      !databaseHasAdditionalRecords(candidateDb)
    ) {
      return null;
    }
    return {
      sourcePath: candidateFile,
      promptCount,
      folderCount,
      skillCount,
      dbSizeBytes: stat.size,
      hasDatabaseFile: true,
      hasWorkspaceData: false,
      hasBrowserStorage: false,
    };
  } catch (err) {
    console.warn(
      `[Recovery] Failed to inspect backup database file at ${candidateFile}:`,
      err,
    );
    return null;
  } finally {
    try {
      candidateDb?.close();
    } catch {
      // ignore close errors
    }
  }
}

function readRecoveryTableCount(
  database: DatabaseAdapter.Database,
  tableName: RecoveryTableName,
  optional = false,
): number {
  try {
    const row = database
      .prepare(`SELECT COUNT(*) as count FROM ${tableName}`)
      .get() as { count: number } | undefined;
    return row?.count ?? 0;
  } catch (error) {
    if (optional) return 0;
    throw error;
  }
}

function databaseHasAdditionalRecords(
  database: DatabaseAdapter.Database,
): boolean {
  return ADDITIONAL_RECOVERY_TABLES.some(
    (tableName) => readRecoveryTableCount(database, tableName, true) > 0,
  );
}

/**
 * Recover data from a source directory by copying the database and associated
 * asset directories into the current data path.
 */
export function performDatabaseRecovery(
  sourcePath: string,
  currentDataPath: string,
): { success: boolean; error?: string; backupPath?: string } {
  const sourceStat = readLinkSafeStats(sourcePath);
  const sourceExists = sourceStat !== null;
  const sourceIsDbFile =
    sourceStat?.isFile() === true && !sourceStat.isSymbolicLink();
  const sourceDb = sourceIsDbFile
    ? sourcePath
    : getExistingLinkSafeCanonicalDbPath(sourcePath);
  const targetDb = getCanonicalDbPath(currentDataPath);

  if (
    (sourceIsDbFile && !inspectRecoverableDatabaseFile(sourcePath)) ||
    (!sourceDb &&
      (!sourceExists ||
        !sourceStat?.isDirectory() ||
        (getBrowserStorageBytes(sourcePath) === 0 &&
          getFileStorageBytes(sourcePath) === 0 &&
          sumContentCounts(getDurableContentCounts(sourcePath)) === 0)))
  ) {
    return {
      success: false,
      error: `Source path has no recoverable data: ${sourcePath}`,
    };
  }

  try {
    // 1. Backup current database
    let backupPath: string | undefined;
    if (sourceDb && fs.existsSync(targetDb)) {
      const safetyPoint = createDatabaseSafetyPoint(targetDb, "pre-recovery");
      backupPath = path.join(safetyPoint.directoryPath, "database.sqlite");
      console.log(
        `[Recovery] Preserved current DB in safety point: ${safetyPoint.id}`,
      );
    }

    // 2. Copy source database over current
    if (sourceDb) {
      fs.mkdirSync(path.dirname(targetDb), { recursive: true });
      fs.copyFileSync(sourceDb, targetDb);
      console.log(`[Recovery] Copied database from ${sourceDb} to ${targetDb}`);
    }

    // 3. Copy associated asset directories if they exist in source but not in target
    if (!sourceIsDbFile) {
      const assetDirs = [
        "images",
        "videos",
        "skills",
        "mcp",
        "rules",
        "plugins",
        ...FILE_STORAGE_DIRS,
        ...BROWSER_STORAGE_DIRS,
      ];
      for (const dir of assetDirs) {
        const sourceDir = path.join(sourcePath, dir);
        const targetDir = path.join(currentDataPath, dir);
        if (isRecoverableDirectory(sourceDir)) {
          copyDirMerge(sourceDir, targetDir);
          console.log(`[Recovery] Merged asset directory: ${dir}`);
        }
      }

      // 4. Merge all configuration files without replacing current settings.
      const sourceConfig = path.join(sourcePath, "config");
      if (isRecoverableDirectory(sourceConfig)) {
        copyDirMerge(sourceConfig, path.join(currentDataPath, "config"));
        console.log("[Recovery] Merged config directory");
      }
      for (const file of ["shortcuts.json", "shortcut-mode.json"]) {
        const sourceFile = path.join(sourcePath, file);
        const targetFile = path.join(currentDataPath, file);
        if (isRecoverableFile(sourceFile) && !fs.existsSync(targetFile)) {
          fs.copyFileSync(sourceFile, targetFile);
        }
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
  const sourceStat = readLinkSafeStats(src);
  if (!sourceStat?.isDirectory() || sourceStat.isSymbolicLink()) {
    return;
  }

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) {
      continue;
    }
    if (entry.isDirectory()) {
      copyDirMerge(srcPath, destPath);
    } else if (!fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function readLinkSafeStats(targetPath: string): fs.Stats | null {
  try {
    return fs.lstatSync(targetPath);
  } catch (error) {
    if (
      ["ENOENT", "ENOTDIR"].includes(
        (error as NodeJS.ErrnoException).code ?? "",
      )
    ) {
      return null;
    }
    throw error;
  }
}

function isRecoverableDirectory(targetPath: string): boolean {
  const stat = readLinkSafeStats(targetPath);
  return stat?.isDirectory() === true && !stat.isSymbolicLink();
}

function isRecoverableFile(targetPath: string): boolean {
  const stat = readLinkSafeStats(targetPath);
  return stat?.isFile() === true && !stat.isSymbolicLink();
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
  const legacyWorkspaceDir = path.join(
    basePath,
    path.basename(getLegacyWorkspaceDir()),
  );
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
  const stat = readLinkSafeStats(targetPath);
  if (!stat || stat.isSymbolicLink()) {
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

function countSkillDirectories(targetPath: string): number {
  const stat = readLinkSafeStats(targetPath);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) {
    return 0;
  }

  try {
    return fs
      .readdirSync(targetPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).length;
  } catch {
    return 0;
  }
}

function getFileSkillCount(basePath: string): number {
  return Math.max(
    countSkillDirectories(path.join(basePath, "skills")),
    countSkillDirectories(path.join(basePath, "data", "skills")),
  );
}

function getFileStorageBytes(basePath: string): number {
  return FILE_STORAGE_DIRS.reduce((total, dirName) => {
    return total + getDirectorySize(path.join(basePath, dirName));
  }, 0);
}

function getDurableContentCounts(basePath: string): RecoveryContentCounts {
  const counts: RecoveryContentCounts = {};
  for (const [kind, relativePaths] of Object.entries(DURABLE_CONTENT_PATHS)) {
    let count = 0;
    for (const relativePath of relativePaths) {
      count += countLinkSafeFiles(path.join(basePath, relativePath));
    }
    if (count > 0) counts[kind as keyof RecoveryContentCounts] = count;
  }

  const dataPath = path.join(basePath, "data");
  const otherData = countUnknownDataFiles(dataPath);
  if (otherData > 0) counts.otherData = otherData;
  return counts;
}

function sumContentCounts(counts: RecoveryContentCounts): number {
  return Object.values(counts).reduce(
    (total, count) => total + (count ?? 0),
    0,
  );
}

function countUnknownDataFiles(dataPath: string): number {
  const stat = readLinkSafeStats(dataPath);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) return 0;

  try {
    return fs
      .readdirSync(dataPath, { withFileTypes: true })
      .reduce((total, entry) => {
        if (entry.isSymbolicLink() || KNOWN_DATA_ENTRIES.has(entry.name)) {
          return total;
        }
        if (/^prompthub\.db(?:$|[-.])/i.test(entry.name)) return total;
        return total + countLinkSafeFiles(path.join(dataPath, entry.name));
      }, 0);
  } catch {
    return 0;
  }
}

function countLinkSafeFiles(targetPath: string): number {
  const stat = readLinkSafeStats(targetPath);
  if (!stat || stat.isSymbolicLink()) return 0;
  if (!stat.isDirectory()) return stat.isFile() ? 1 : 0;

  try {
    return fs
      .readdirSync(targetPath, { withFileTypes: true })
      .reduce(
        (total, entry) =>
          entry.isSymbolicLink()
            ? total
            : total + countLinkSafeFiles(path.join(targetPath, entry.name)),
        0,
      );
  } catch {
    return 0;
  }
}

function getCanonicalDbPath(basePath: string): string {
  const unifiedDbPath = path.join(basePath, "data", "prompthub.db");
  const legacyDbPath = path.join(basePath, "prompthub.db");
  if (fs.existsSync(unifiedDbPath)) {
    return unifiedDbPath;
  }
  if (fs.existsSync(legacyDbPath)) {
    return legacyDbPath;
  }
  return unifiedDbPath;
}

function getExistingLinkSafeCanonicalDbPath(basePath: string): string | null {
  const candidates = [
    path.join(basePath, "data", "prompthub.db"),
    path.join(basePath, "prompthub.db"),
  ];

  for (const candidate of candidates) {
    const stat = readLinkSafeStatsWithin(basePath, candidate);
    if (stat?.isFile() && !stat.isSymbolicLink()) {
      return candidate;
    }
  }

  return null;
}

function readLinkSafeStatsWithin(
  basePath: string,
  targetPath: string,
): fs.Stats | null {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(resolvedBase, resolvedTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  let currentPath = resolvedBase;
  let currentStat = readLinkSafeStats(currentPath);
  if (!currentStat || currentStat.isSymbolicLink()) {
    return null;
  }

  for (const segment of relative.split(path.sep).filter(Boolean)) {
    currentPath = path.join(currentPath, segment);
    currentStat = readLinkSafeStats(currentPath);
    if (!currentStat || currentStat.isSymbolicLink()) {
      return null;
    }
  }

  return currentStat;
}

function getDirectorySize(targetPath: string): number {
  const stat = readLinkSafeStats(targetPath);
  if (!stat || stat.isSymbolicLink()) {
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
