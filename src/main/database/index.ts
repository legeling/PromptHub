import Database from "./sqlite";
import path from "path";
import fs from "fs";
import { SCHEMA_TABLES, SCHEMA_INDEXES } from "./schema";
import { getSkillsDir, getUserDataPath } from "../runtime-paths";

let db: Database.Database | null = null;

/**
 * Get database file path
 * 获取数据库文件路径
 */
function getDbPath(): string {
  const userDataPath = getUserDataPath();
  return path.join(userDataPath, "prompthub.db");
}

/**
 * node-sqlite3-wasm 使用目录锁 `<dbfile>.lock`。
 * 若上一次运行异常退出，该目录会残留并导致下次启动报 "database is locked"。
 * 在打开数据库前主动清理它。
 */
function clearStaleLock(dbPath: string): void {
  const lockDir = `${dbPath}.lock`;
  try {
    fs.rmSync(lockDir, { recursive: true, force: true });
    console.log(`[DB] Cleared stale lock: ${lockDir}`);
  } catch (e: any) {
    if (e.code !== "ENOENT") {
      console.warn(`[DB] Failed to clear stale lock (${lockDir}):`, e);
    }
  }
}

/**
 * Initialize database
 * 初始化数据库
 */
export function initDatabase(): Database.Database {
  if (db) return db;

  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  clearStaleLock(dbPath);
  db = new Database(dbPath);

  // Enable foreign key constraints
  // 启用外键约束
  db.pragma("foreign_keys = ON");

  // Create tables only (indexes come after migrations)
  db.exec(SCHEMA_TABLES);

  // Run all migrations in a single transaction to avoid lock contention.
  // Each table's column list is fetched exactly once and reused.
  // 所有迁移在同一事务中执行，避免多次独立读事务与写操作交叉产生锁竞争。
  // 每张表的列信息只查询一次，后续复用。
  const runMigrations = db.transaction(() => {
    // ── schema_migrations table ───────────────────────────────────────────────
    // Tracks one-time data migrations so they are never re-run on subsequent
    // startups. Must be created before any migration check that uses it.
    db!.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )
    `);

    const hasMigration = (name: string): boolean => {
      return !!db!
        .prepare("SELECT 1 FROM schema_migrations WHERE name = ?")
        .get(name);
    };
    const markMigration = (name: string): void => {
      db!
        .prepare(
          "INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES (?, ?)",
        )
        .run(name, Date.now());
    };

    // ── prompts table ─────────────────────────────────────────────────────────
    // 迁移：prompts 表，只查一次 table_info
    const promptCols = (db!.pragma("table_info(prompts)") as any[]).map(
      (c) => c.name,
    );

    if (!promptCols.includes("images")) {
      console.log("Migrating: Adding images column to prompts table");
      db!.prepare("ALTER TABLE prompts ADD COLUMN images TEXT").run();
    }

    if (!promptCols.includes("is_pinned")) {
      console.log("Migrating: Adding is_pinned column to prompts table");
      db!
        .prepare("ALTER TABLE prompts ADD COLUMN is_pinned INTEGER DEFAULT 0")
        .run();
    }

    if (!promptCols.includes("source")) {
      console.log("Migrating: Adding source column to prompts table");
      db!.prepare("ALTER TABLE prompts ADD COLUMN source TEXT").run();
    }

    if (!promptCols.includes("notes")) {
      console.log("Migrating: Adding notes column to prompts table");
      db!.prepare("ALTER TABLE prompts ADD COLUMN notes TEXT").run();
    }

    if (!promptCols.includes("prompt_type")) {
      console.log("Migrating: Adding prompt_type column to prompts table");
      db!
        .prepare(
          "ALTER TABLE prompts ADD COLUMN prompt_type TEXT DEFAULT 'text'",
        )
        .run();
    }

    // ── folders table ─────────────────────────────────────────────────────────
    // 迁移：folders 表，只查一次 table_info
    const folderCols = (db!.pragma("table_info(folders)") as any[]).map(
      (c) => c.name,
    );

    if (!folderCols.includes("is_private")) {
      console.log("Migrating: Adding is_private column to folders table");
      db!
        .prepare("ALTER TABLE folders ADD COLUMN is_private INTEGER DEFAULT 0")
        .run();
    }

    if (!folderCols.includes("updated_at")) {
      console.log("Migrating: Adding updated_at column to folders table");
      db!.prepare("ALTER TABLE folders ADD COLUMN updated_at INTEGER").run();
    }

    // ── skills table ──────────────────────────────────────────────────────────
    // 迁移：skills 表，只查一次 table_info
    const skillCols = (db!.pragma("table_info(skills)") as any[]).map(
      (c) => c.name,
    );

    const skillNewColumns: { name: string; type: string }[] = [
      { name: "source_url", type: "TEXT" },
      { name: "icon_url", type: "TEXT" },
      { name: "icon_emoji", type: "TEXT" },
      { name: "icon_background", type: "TEXT" },
      { name: "category", type: "TEXT DEFAULT 'general'" },
      { name: "is_builtin", type: "INTEGER DEFAULT 0" },
      { name: "registry_slug", type: "TEXT" },
      { name: "content_url", type: "TEXT" },
      { name: "prerequisites", type: "TEXT" },
      { name: "compatibility", type: "TEXT" },
      { name: "original_tags", type: "TEXT" },
      { name: "current_version", type: "INTEGER DEFAULT 0" },
      { name: "version_tracking_enabled", type: "INTEGER DEFAULT 0" },
      { name: "local_repo_path", type: "TEXT" },
    ];

    for (const col of skillNewColumns) {
      if (!skillCols.includes(col.name)) {
        console.log(`Migrating: Adding ${col.name} column to skills table`);
        db!
          .prepare(`ALTER TABLE skills ADD COLUMN ${col.name} ${col.type}`)
          .run();
      }
    }

    // Backfill: set original_tags = tags for existing skills that don't have original_tags yet
    // Backfill：original_tags 列是新增的，为存量数据回填
    if (!skillCols.includes("original_tags")) {
      db!
        .prepare(
          "UPDATE skills SET original_tags = tags WHERE original_tags IS NULL",
        )
        .run();
      console.log("Migrated: Backfilled original_tags for existing skills");
    }

    // ── skills backfill: local_repo_path ──────────────────────────────────────
    // Backfill local_repo_path for existing skills that don't have it set yet.
    // Priority: (a) skillsDir/skill.name, (b) github folder derived from source_url
    // Wrapped in a one-time migration guard so it only runs on first startup.
    if (!hasMigration("backfill_local_repo_path_v1")) {
      try {
        const skillsDir = getSkillsDir();
        const skillsWithoutPath = db!
          .prepare(
            "SELECT id, name, source_url FROM skills WHERE local_repo_path IS NULL OR local_repo_path = ''",
          )
          .all() as { id: string; name: string; source_url: string | null }[];

        for (const skill of skillsWithoutPath) {
          let foundPath: string | null = null;

          // (a) Check skillsDir/skill.name
          const byName = path.join(skillsDir, skill.name);
          if (fs.existsSync(byName) && fs.statSync(byName).isDirectory()) {
            foundPath = byName;
          }

          // (b) Derive folder from GitHub source_url
          if (
            !foundPath &&
            skill.source_url &&
            skill.source_url.includes("github.com")
          ) {
            const urlParts = skill.source_url
              .replace("https://github.com/", "")
              .split("/");
            const userDir = urlParts[0];
            const repoName = urlParts[1];
            if (userDir && repoName) {
              const githubFolder = `${userDir}-${repoName}`;
              const byGithub = path.join(skillsDir, githubFolder);
              if (
                fs.existsSync(byGithub) &&
                fs.statSync(byGithub).isDirectory()
              ) {
                foundPath = byGithub;
              }
            }
          }

          // (c) source_url is a local filesystem path (e.g. from scanLocal or importScannedSkills)
          if (
            !foundPath &&
            skill.source_url &&
            !skill.source_url.includes("github.com")
          ) {
            try {
              const stat = fs.statSync(skill.source_url);
              if (stat.isDirectory()) {
                foundPath = skill.source_url;
              }
            } catch {
              // path doesn't exist or can't be stat'd — skip
            }
          }

          if (foundPath) {
            db!
              .prepare("UPDATE skills SET local_repo_path = ? WHERE id = ?")
              .run(foundPath, skill.id);
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
      }
      markMigration("backfill_local_repo_path_v1");
    }

    if (!hasMigration("normalize_skill_version_tracking_v1")) {
      try {
        const skillsWithVersionStats = db!
          .prepare(
            `SELECT
               s.id AS id,
               MAX(sv.version) AS max_version
             FROM skills s
             LEFT JOIN skill_versions sv ON sv.skill_id = s.id
             GROUP BY s.id`,
          )
          .all() as Array<{ id: string; max_version: number | null }>;

        for (const skill of skillsWithVersionStats) {
          const hasTrackedVersions =
            typeof skill.max_version === "number" && skill.max_version > 0;
          db!
            .prepare(
              "UPDATE skills SET current_version = ?, version_tracking_enabled = ? WHERE id = ?",
            )
            .run(
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
      }
      markMigration("normalize_skill_version_tracking_v1");
    }

    // ── skill_versions table ────────────────────────────────────────────────
    // 迁移：skill_versions 表
    const skillVersionsExists = db!
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='skill_versions'",
      )
      .get();

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
  });

  try {
    runMigrations();
  } catch (error) {
    console.error("Database migration failed:", error);
    throw error;
  }

  // Now that all columns exist, create indexes + FTS
  // 所有列迁移完成后再建索引
  db.exec(SCHEMA_INDEXES);

  console.log(`Database initialized at: ${dbPath}`);
  return db;
}

/**
 * Get database instance
 * 获取数据库实例
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized");
  }
  return db;
}

/**
 * Close database connection
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export { db };
