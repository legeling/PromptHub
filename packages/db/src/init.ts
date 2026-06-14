import Database from "./adapter";
import path from "path";
import fs from "fs";
import { SCHEMA_TABLES, SCHEMA_INDEXES } from "./schema";

/** Column metadata returned by `PRAGMA table_info(...)`. */
interface PragmaColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

/**
 * Hook functions that allow the host application to inject environment-specific
 * behaviour into the database initialization process.
 *
 * For example, the `resolveSkillRepoPath` hook lets the Electron desktop app
 * supply its skills directory for the `backfill_local_repo_path_v1` migration
 * without the database package needing to know about Electron APIs.
 */
export interface InitDatabaseHooks {
  /**
   * Given a skill row (id, name, source_url), resolve the local repository
   * path by scanning the filesystem. Return `null` if no path can be found.
   *
   * If this hook is not provided, the `backfill_local_repo_path_v1` migration
   * will be skipped (and retried on next startup).
   */
  resolveSkillRepoPath?: (skill: {
    id: string;
    name: string;
    source_url: string | null;
  }) => string | null;
}

let db: Database.Database | null = null;

const REQUIRED_MIGRATION_NAMES = [
  "backfill_local_repo_path_v1",
  "normalize_skill_version_tracking_v1",
  "server_auth_tables_v1",
  "drop_skill_name_unique_v2",
  "fix_prompt_current_version_v1",
] as const;

const REQUIRED_TABLES = [
  "schema_migrations",
  "users",
  "refresh_tokens",
  "user_settings",
  "prompt_relations",
  "skill_versions",
  "rules",
  "rule_versions",
] as const;

const REQUIRED_COLUMNS: Record<string, string[]> = {
  prompts: [
    "images",
    "is_pinned",
    "source",
    "notes",
    "prompt_type",
    "system_prompt_en",
    "user_prompt_en",
    "videos",
    "last_ai_response",
    "owner_user_id",
    "visibility",
    "parent_id",
    "sort_order",
  ],
  folders: ["is_private", "updated_at", "owner_user_id", "visibility"],
  skills: [
    "source_url",
    "source_id",
    "source_label",
    "source_branch",
    "source_directory",
    "canonical_skill_path",
    "directory_fingerprint",
    "icon_url",
    "icon_emoji",
    "icon_background",
    "category",
    "is_builtin",
    "registry_slug",
    "content_url",
    "installed_content_hash",
    "installed_version",
    "installed_at",
    "updated_from_store_at",
    "prerequisites",
    "compatibility",
    "original_tags",
    "current_version",
    "version_tracking_enabled",
    "local_repo_path",
    "safety_level",
    "safety_score",
    "safety_report",
    "safety_scanned_at",
    "owner_user_id",
    "visibility",
  ],
  users: ["role"],
  prompt_versions: ["system_prompt_en", "user_prompt_en", "ai_response"],
};

/**
 * node-sqlite3-wasm uses a directory lock `<dbfile>.lock`.
 * If the previous run crashed, the lock directory may remain and cause
 * "database is locked" on the next startup. Proactively clean it up.
 */
function clearStaleLock(dbPath: string): void {
  const lockDir = `${dbPath}.lock`;
  try {
    if (!fs.existsSync(lockDir)) {
      return;
    }
    fs.rmSync(lockDir, { recursive: true, force: true });
    console.log(`[DB] Cleared stale lock: ${lockDir}`);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.warn(`[DB] Failed to clear stale lock (${lockDir}):`, err);
    }
  }
}

function tableExists(probe: Database.Database, tableName: string): boolean {
  return Boolean(
    probe.get(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      tableName,
    ),
  );
}

function columnNames(
  probe: Database.Database,
  tableName: string,
): Set<string> | null {
  if (!tableExists(probe, tableName)) {
    return null;
  }
  return new Set(
    (probe.pragma(`table_info(${tableName})`) as PragmaColumnInfo[]).map(
      (column) => column.name,
    ),
  );
}

function databaseAppearsCurrent(probe: Database.Database): boolean {
  for (const tableName of REQUIRED_TABLES) {
    if (!tableExists(probe, tableName)) {
      return false;
    }
  }

  for (const migrationName of REQUIRED_MIGRATION_NAMES) {
    if (
      !probe.get(
        "SELECT 1 FROM schema_migrations WHERE name = ?",
        migrationName,
      )
    ) {
      return false;
    }
  }

  for (const [tableName, requiredColumns] of Object.entries(REQUIRED_COLUMNS)) {
    const existingColumns = columnNames(probe, tableName);
    if (!existingColumns) {
      return false;
    }
    if (requiredColumns.some((column) => !existingColumns.has(column))) {
      return false;
    }
  }

  return true;
}

function shouldBackupDatabaseBeforeMigration(dbPath: string): boolean {
  if (!fs.existsSync(dbPath)) {
    return false;
  }
  const stat = fs.statSync(dbPath);
  if (stat.size === 0) {
    return false;
  }

  const probe = new Database(dbPath);
  try {
    return !databaseAppearsCurrent(probe);
  } catch {
    // If probing fails, keep the conservative recovery behavior.
    return true;
  } finally {
    probe.close();
  }
}

/**
 * Create a timestamped backup of the database file before running migrations.
 * Returns the backup path on success, or null if no backup was needed/possible.
 */
function backupDatabaseBeforeMigration(dbPath: string): string | null {
  try {
    if (!shouldBackupDatabaseBeforeMigration(dbPath)) {
      return null;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${dbPath}.backup-${timestamp}`;
    fs.copyFileSync(dbPath, backupPath);
    console.log(`[DB] Pre-migration backup created: ${backupPath}`);
    return backupPath;
  } catch (err) {
    console.warn("[DB] Failed to create pre-migration backup:", err);
    return null;
  }
}

/**
 * Initialize database at the given path, run schema creation and migrations.
 *
 * @param dbPath  Absolute path to the SQLite database file.
 * @param hooks   Optional hooks for environment-specific behaviour (e.g. filesystem scanning).
 */
export function initDatabase(
  dbPath: string,
  hooks?: InitDatabaseHooks,
): Database.Database {
  if (db) return db;

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  clearStaleLock(dbPath);
  backupDatabaseBeforeMigration(dbPath);
  db = new Database(dbPath);

  // Enable foreign key constraints
  db.pragma("foreign_keys = ON");

  // Create tables only (indexes come after migrations)
  db.exec(SCHEMA_TABLES);

  // Run all migrations in a single transaction to avoid lock contention.
  // Each table's column list is fetched exactly once and reused.
  const runMigrations = db.transaction(() => {
    // ── schema_migrations table ───────────────────────────────────────────────
    db!.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )
    `);

    const hasMigration = (name: string): boolean => {
      return !!db!.get(
        "SELECT 1 FROM schema_migrations WHERE name = ?",
        name,
      );
    };
    const markMigration = (name: string): void => {
      db!.run(
        "INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES (?, ?)",
        name,
        Date.now(),
      );
    };

    // Migrations: prompts table (query column list once)
    const promptCols = (
      db!.pragma("table_info(prompts)") as PragmaColumnInfo[]
    ).map((c) => c.name);

    if (!promptCols.includes("images")) {
      console.log("Migrating: Adding images column to prompts table");
      db!.run("ALTER TABLE prompts ADD COLUMN images TEXT");
    }

    if (!promptCols.includes("is_pinned")) {
      console.log("Migrating: Adding is_pinned column to prompts table");
      db!.run("ALTER TABLE prompts ADD COLUMN is_pinned INTEGER DEFAULT 0");
    }

    if (!promptCols.includes("source")) {
      console.log("Migrating: Adding source column to prompts table");
      db!.run("ALTER TABLE prompts ADD COLUMN source TEXT");
    }

    if (!promptCols.includes("notes")) {
      console.log("Migrating: Adding notes column to prompts table");
      db!.run("ALTER TABLE prompts ADD COLUMN notes TEXT");
    }

    if (!promptCols.includes("prompt_type")) {
      console.log("Migrating: Adding prompt_type column to prompts table");
      db!.run("ALTER TABLE prompts ADD COLUMN prompt_type TEXT DEFAULT 'text'");
    }

    if (!promptCols.includes("system_prompt_en")) {
      console.log("Migrating: Adding system_prompt_en column to prompts table");
      db!.run("ALTER TABLE prompts ADD COLUMN system_prompt_en TEXT");
    }

    if (!promptCols.includes("user_prompt_en")) {
      console.log("Migrating: Adding user_prompt_en column to prompts table");
      db!.run("ALTER TABLE prompts ADD COLUMN user_prompt_en TEXT");
    }

    if (!promptCols.includes("videos")) {
      console.log("Migrating: Adding videos column to prompts table");
      db!.run("ALTER TABLE prompts ADD COLUMN videos TEXT");
    }

    if (!promptCols.includes("last_ai_response")) {
      console.log("Migrating: Adding last_ai_response column to prompts table");
      db!.run("ALTER TABLE prompts ADD COLUMN last_ai_response TEXT");
    }

    if (!promptCols.includes("owner_user_id")) {
      console.log("Migrating: Adding owner_user_id column to prompts table");
      db!.run(
        "ALTER TABLE prompts ADD COLUMN owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL",
      );
    }

    if (!promptCols.includes("visibility")) {
      console.log("Migrating: Adding visibility column to prompts table");
      db!.run("ALTER TABLE prompts ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'");
    }

    if (!promptCols.includes("parent_id")) {
      console.log("Migrating: Adding parent_id column to prompts table");
      db!.run(
        "ALTER TABLE prompts ADD COLUMN parent_id TEXT REFERENCES prompts(id) ON DELETE SET NULL",
      );
    }

    if (!promptCols.includes("sort_order")) {
      console.log("Migrating: Adding sort_order column to prompts table");
      db!.run("ALTER TABLE prompts ADD COLUMN sort_order INTEGER DEFAULT 0");
    }

    // Migrations: folders table (query column list once)
    const folderCols = (
      db!.pragma("table_info(folders)") as PragmaColumnInfo[]
    ).map((c) => c.name);

    if (!folderCols.includes("is_private")) {
      console.log("Migrating: Adding is_private column to folders table");
      db!.run("ALTER TABLE folders ADD COLUMN is_private INTEGER DEFAULT 0");
    }

    if (!folderCols.includes("updated_at")) {
      console.log("Migrating: Adding updated_at column to folders table");
      db!.run("ALTER TABLE folders ADD COLUMN updated_at INTEGER");
    }

    if (!folderCols.includes("owner_user_id")) {
      console.log("Migrating: Adding owner_user_id column to folders table");
      db!.run(
        "ALTER TABLE folders ADD COLUMN owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL",
      );
    }

    if (!folderCols.includes("visibility")) {
      console.log("Migrating: Adding visibility column to folders table");
      db!.run("ALTER TABLE folders ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'");
    }

    // Migrations: skills table (query column list once)
    const skillCols = (
      db!.pragma("table_info(skills)") as PragmaColumnInfo[]
    ).map((c) => c.name);

    const skillNewColumns: { name: string; type: string }[] = [
      { name: "source_url", type: "TEXT" },
      { name: "source_id", type: "TEXT" },
      { name: "source_label", type: "TEXT" },
      { name: "source_branch", type: "TEXT" },
      { name: "source_directory", type: "TEXT" },
      { name: "canonical_skill_path", type: "TEXT" },
      { name: "directory_fingerprint", type: "TEXT" },
      { name: "icon_url", type: "TEXT" },
      { name: "icon_emoji", type: "TEXT" },
      { name: "icon_background", type: "TEXT" },
      { name: "category", type: "TEXT DEFAULT 'general'" },
      { name: "is_builtin", type: "INTEGER DEFAULT 0" },
      { name: "registry_slug", type: "TEXT" },
      { name: "content_url", type: "TEXT" },
      { name: "installed_content_hash", type: "TEXT" },
      { name: "installed_version", type: "TEXT" },
      { name: "installed_at", type: "INTEGER" },
      { name: "updated_from_store_at", type: "INTEGER" },
      { name: "prerequisites", type: "TEXT" },
      { name: "compatibility", type: "TEXT" },
      { name: "original_tags", type: "TEXT" },
      { name: "current_version", type: "INTEGER DEFAULT 0" },
      { name: "version_tracking_enabled", type: "INTEGER DEFAULT 0" },
      { name: "local_repo_path", type: "TEXT" },
      { name: "safety_level", type: "TEXT" },
      { name: "safety_score", type: "INTEGER" },
      { name: "safety_report", type: "TEXT" },
      { name: "safety_scanned_at", type: "INTEGER" },
    ];

    for (const col of skillNewColumns) {
      if (!skillCols.includes(col.name)) {
        console.log(`Migrating: Adding ${col.name} column to skills table`);
        db!.run(`ALTER TABLE skills ADD COLUMN ${col.name} ${col.type}`);
      }
    }

    if (!skillCols.includes("owner_user_id")) {
      console.log("Migrating: Adding owner_user_id column to skills table");
      db!.run(
        "ALTER TABLE skills ADD COLUMN owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL",
      );
    }

    if (!skillCols.includes("visibility")) {
      console.log("Migrating: Adding visibility column to skills table");
      db!.run("ALTER TABLE skills ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'");
    }

    // Backfill: set original_tags = tags for existing skills that don't have original_tags yet
    if (!skillCols.includes("original_tags")) {
      db!
        .run(
          "UPDATE skills SET original_tags = tags WHERE original_tags IS NULL",
        );
      console.log("Migrated: Backfilled original_tags for existing skills");
    }

    // ── skills backfill: local_repo_path ──────────────────────────────────────
    if (!hasMigration("backfill_local_repo_path_v1")) {
      if (hooks?.resolveSkillRepoPath) {
        try {
          const skillsWithoutPath = db!
            .all(
              "SELECT id, name, source_url FROM skills WHERE local_repo_path IS NULL OR local_repo_path = ''",
            ) as {
            id: string;
            name: string;
            source_url: string | null;
          }[];

          for (const skill of skillsWithoutPath) {
            const foundPath = hooks.resolveSkillRepoPath(skill);
            if (foundPath) {
              db!
                .run("UPDATE skills SET local_repo_path = ? WHERE id = ?", foundPath, skill.id);
              console.log(
                `Migrated: Backfilled local_repo_path for skill "${skill.name}" → ${foundPath}`,
              );
            }
          }
        } catch (backfillError) {
          console.error(
            "Failed to backfill local_repo_path for skills (non-fatal):",
            backfillError,
          );
          // Do NOT mark migration as completed on failure — it will be retried next startup
          return;
        }
      }
      markMigration("backfill_local_repo_path_v1");
    }

    if (!hasMigration("normalize_skill_version_tracking_v1")) {
      try {
        const skillsWithVersionStats = db!
          .all(
            `SELECT
               s.id AS id,
               MAX(sv.version) AS max_version
             FROM skills s
             LEFT JOIN skill_versions sv ON sv.skill_id = s.id
             GROUP BY s.id`,
          ) as Array<{ id: string; max_version: number | null }>;

        for (const skill of skillsWithVersionStats) {
          const hasTrackedVersions =
            typeof skill.max_version === "number" && skill.max_version > 0;
          db!.run(
            "UPDATE skills SET current_version = ?, version_tracking_enabled = ? WHERE id = ?",
            hasTrackedVersions ? skill.max_version : 0,
            hasTrackedVersions ? 1 : 0,
            skill.id,
          );
        }
      } catch (error) {
        console.error(
          "Failed to normalize skill version tracking state:",
          error,
        );
        return;
      }
      markMigration("normalize_skill_version_tracking_v1");
    }

    if (!hasMigration("server_auth_tables_v1")) {
      db!.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS refresh_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_settings (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, key)
        );
      `);
      markMigration("server_auth_tables_v1");
    }

    const userCols = (
      db!.pragma("table_info(users)") as PragmaColumnInfo[]
    ).map((c) => c.name);

    if (!userCols.includes("role")) {
      console.log("Migrating: Adding role column to users table");
      db!.run("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
    }

    const userSettingsExists = db!
      .get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='user_settings'",
      );

    if (!userSettingsExists) {
      console.log("Migrating: Creating user_settings table");
      db!.exec(`
        CREATE TABLE IF NOT EXISTS user_settings (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, key)
        )
      `);
    }

    // ── skill_versions table ────────────────────────────────────────────────
    const skillVersionsExists = db!
      .get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='skill_versions'",
      );

    if (!skillVersionsExists) {
      console.log("Migrating: Creating skill_versions table");
      db!.exec(`
        CREATE TABLE IF NOT EXISTS skill_versions (
          id TEXT PRIMARY KEY,
          skill_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          content TEXT,
          files_snapshot TEXT,
          note TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
          UNIQUE(skill_id, version)
        )
      `);
    }

    const rulesExists = db!
      .get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='rules'",
      );

    if (!rulesExists) {
      console.log("Migrating: Creating rules table");
      db!.exec(`
        CREATE TABLE IF NOT EXISTS rules (
          id TEXT PRIMARY KEY,
          scope TEXT NOT NULL CHECK(scope IN ('global', 'project')),
          platform_id TEXT NOT NULL,
          platform_name TEXT NOT NULL,
          platform_icon TEXT NOT NULL,
          platform_description TEXT NOT NULL,
          canonical_file_name TEXT NOT NULL,
          description TEXT NOT NULL,
          managed_path TEXT NOT NULL,
          target_path TEXT NOT NULL,
          project_root_path TEXT,
          sync_status TEXT NOT NULL CHECK(sync_status IN ('synced', 'target-missing', 'out-of-sync', 'sync-error')),
          current_version INTEGER NOT NULL DEFAULT 0,
          content_hash TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
    }

    const ruleVersionsExists = db!
      .get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='rule_versions'",
      );

    if (!ruleVersionsExists) {
      console.log("Migrating: Creating rule_versions table");
      db!.exec(`
        CREATE TABLE IF NOT EXISTS rule_versions (
          id TEXT PRIMARY KEY,
          rule_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          file_path TEXT NOT NULL,
          source TEXT NOT NULL CHECK(source IN ('manual-save', 'ai-rewrite', 'create')),
          created_at INTEGER NOT NULL,
          FOREIGN KEY (rule_id) REFERENCES rules(id) ON DELETE CASCADE,
          UNIQUE(rule_id, version)
        )
      `);
    }

    if (!hasMigration("drop_skill_name_unique_v2")) {
      try {
        db!.run("DROP INDEX IF EXISTS idx_skills_name_lower");
      } catch (error) {
        console.error("Failed to drop idx_skills_name_lower:", error);
        return;
      }
      markMigration("drop_skill_name_unique_v2");
    }

    const promptVersionCols = (
      db!.pragma("table_info(prompt_versions)") as PragmaColumnInfo[]
    ).map((c) => c.name);

    if (!promptVersionCols.includes("system_prompt_en")) {
      console.log("Migrating: Adding system_prompt_en column to prompt_versions table");
      db!.run("ALTER TABLE prompt_versions ADD COLUMN system_prompt_en TEXT");
    }

    if (!promptVersionCols.includes("user_prompt_en")) {
      console.log("Migrating: Adding user_prompt_en column to prompt_versions table");
      db!.run("ALTER TABLE prompt_versions ADD COLUMN user_prompt_en TEXT");
    }

    if (!promptVersionCols.includes("ai_response")) {
      console.log("Migrating: Adding ai_response column to prompt_versions table");
      db!.run("ALTER TABLE prompt_versions ADD COLUMN ai_response TEXT");
    }

    if (!hasMigration("fix_prompt_current_version_v1")) {
      console.log(
        "Migrating: Aligning prompt current_version with latest stored version",
      );
      db!.run(
        `UPDATE prompts
         SET current_version = COALESCE(
           (SELECT MAX(version) FROM prompt_versions WHERE prompt_id = prompts.id),
           0
         )`,
      );
      markMigration("fix_prompt_current_version_v1");
    }
  });

  try {
    runMigrations();
  } catch (error) {
    console.error("Database migration failed:", error);
    throw error;
  }

  // Now that all columns exist, create indexes + FTS
  db.exec(SCHEMA_INDEXES);

  console.log(`Database initialized at: ${dbPath}`);
  return db;
}

/**
 * Get database instance
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized");
  }
  return db;
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Check if the current database is empty (no user data).
 * Used to detect whether a data recovery prompt should be shown.
 */
export function isDatabaseEmpty(database: Database.Database): boolean {
  try {
    const promptRow = database
      .prepare("SELECT COUNT(*) as count FROM prompts")
      .get() as { count: number } | undefined;
    const folderRow = database
      .prepare("SELECT COUNT(*) as count FROM folders")
      .get() as { count: number } | undefined;

    let skillCount = 0;
    try {
      const skillRow = database
        .prepare("SELECT COUNT(*) as count FROM skills")
        .get() as { count: number } | undefined;
      skillCount = skillRow?.count ?? 0;
    } catch {
      // skills table may not exist in older schemas
    }

    return (
      (promptRow?.count ?? 0) === 0 &&
      (folderRow?.count ?? 0) === 0 &&
      skillCount === 0
    );
  } catch {
    // Table might not exist in a freshly created DB
    return true;
  }
}

export { db };
