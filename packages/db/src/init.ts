import { migrateGenerationMetadata } from "./generation-schema";
import { migrateRuleOwnership } from "./rule-schema";
import Database from "./adapter";
import path from "path";
import fs from "fs";
import { SCHEMA_TABLES, SCHEMA_INDEXES } from "./schema";
import { STORAGE_PUBLICATION_SCHEMA } from "./storage-publication";
import { PLUGIN_SCHEMA } from "./plugin";
import {
  acquireDatabaseClientLease,
  inspectDatabaseClientLeases,
  recoverDatabaseClientLock,
  type DatabaseClientLease,
} from "./database-client-lock";
import {
  acquireDatabaseMigrationIntent,
  DatabaseMigrationBusyError,
} from "./database-migration-intent";
import {
  createDatabaseSafetyPoint,
  type DatabaseSafetyPoint,
  type DatabaseSafetyPointReason,
} from "./database-safety-point";
import {
  assertDatabaseCompatibility,
  CURRENT_LEGACY_SCHEMA_MIGRATION_NAMES,
  getCurrentDatabaseSchemaInvariants,
  recordCurrentDatabaseMigration,
} from "./database-migration-state";

/** Column metadata returned by `PRAGMA table_info(...)`. */
interface PragmaColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

const QUICK_CHECK_OK = "ok";
const DATABASE_BUSY_TIMEOUT_MS = 5_000;
const QUICK_CHECK_DATABASE_HEADER = /^\*{3} in database .+ \*{3}$/;
const FREELIST_MISMATCH = /^Freelist: size is \d+ but should be \d+$/;
const INDEX_ENTRY_MISMATCH = /^wrong # of entries in index (.+)$/;
const CURRENT_SCHEMA_INVARIANTS = getCurrentDatabaseSchemaInvariants();

function getQuickCheckDiagnostics(probe: Database.Database): string[] {
  const rows = probe.pragma("quick_check");
  if (!Array.isArray(rows)) {
    throw new Error("SQLite quick check returned an invalid result");
  }
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("SQLite quick check returned an invalid row");
    }
    return Object.values(row as Record<string, unknown>).flatMap((value) => {
      if (typeof value !== "string") {
        throw new Error("SQLite quick check returned a non-text diagnostic");
      }
      return value
        .split("\n")
        .map((line) => line.trim())
        .filter(
          (line) => Boolean(line) && !QUICK_CHECK_DATABASE_HEADER.test(line),
        );
    });
  });
}

function isHealthyQuickCheck(diagnostics: string[]): boolean {
  return diagnostics.length === 1 && diagnostics[0] === QUICK_CHECK_OK;
}

function isFreelistOnlyMismatch(diagnostics: string[]): boolean {
  return (
    diagnostics.length > 0 &&
    diagnostics.every((diagnostic) => FREELIST_MISMATCH.test(diagnostic))
  );
}

function getIndexOnlyMismatchNames(diagnostics: string[]): string[] | null {
  if (diagnostics.length === 0) return null;

  const names = new Set<string>();
  for (const diagnostic of diagnostics) {
    const match = INDEX_ENTRY_MISMATCH.exec(diagnostic);
    const indexName = match?.[1]?.trim();
    if (!indexName) return null;
    names.add(indexName);
  }
  return [...names];
}

function quoteSqliteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function inspectDatabaseIntegrity(dbPath: string): string[] {
  const probe = new Database(dbPath);
  try {
    probe.pragma(`busy_timeout = ${DATABASE_BUSY_TIMEOUT_MS}`);
    return getQuickCheckDiagnostics(probe);
  } finally {
    probe.close();
  }
}

function repairFreelistIntegrity(
  dbPath: string,
  diagnostics: string[],
  ensureSafetyPoint: (reason: DatabaseSafetyPointReason) => DatabaseSafetyPoint,
): void {
  if (!isFreelistOnlyMismatch(diagnostics)) {
    throw new Error(
      `Database integrity check failed: ${diagnostics.join("; ").slice(0, 500)}`,
    );
  }

  const safetyPoint = ensureSafetyPoint("integrity-repair");

  const repairDatabase = new Database(dbPath);
  try {
    repairDatabase.pragma(`busy_timeout = ${DATABASE_BUSY_TIMEOUT_MS}`);
    repairDatabase.exec("VACUUM");
  } finally {
    repairDatabase.close();
  }

  const repairedDiagnostics = inspectDatabaseIntegrity(dbPath);
  if (!isHealthyQuickCheck(repairedDiagnostics)) {
    throw new Error(
      `Database integrity repair failed: ${repairedDiagnostics.join("; ").slice(0, 500)}`,
    );
  }
  console.log(
    `[DB] Repaired SQLite freelist metadata; safetyPoint=${safetyPoint.id}`,
  );
}

function repairIndexIntegrity(
  dbPath: string,
  diagnostics: string[],
  ensureSafetyPoint: (reason: DatabaseSafetyPointReason) => DatabaseSafetyPoint,
): void {
  const indexNames = getIndexOnlyMismatchNames(diagnostics);
  if (!indexNames) {
    throw new Error(
      `Database integrity check failed: ${diagnostics.join("; ").slice(0, 500)}`,
    );
  }

  const safetyPoint = ensureSafetyPoint("integrity-repair");
  const repairDatabase = new Database(dbPath);
  try {
    repairDatabase.pragma(`busy_timeout = ${DATABASE_BUSY_TIMEOUT_MS}`);
    const repair = repairDatabase.transaction(() => {
      for (const indexName of indexNames) {
        const existing = repairDatabase.get(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?",
          indexName,
        );
        if (!existing) {
          throw new Error(`SQLite index does not exist: ${indexName}`);
        }
        repairDatabase.exec(`REINDEX ${quoteSqliteIdentifier(indexName)}`);
      }

      const transactionalDiagnostics = getQuickCheckDiagnostics(repairDatabase);
      if (!isHealthyQuickCheck(transactionalDiagnostics)) {
        throw new Error(
          `Database integrity repair failed: ${transactionalDiagnostics.join("; ").slice(0, 500)}`,
        );
      }
    });
    repair();
  } finally {
    repairDatabase.close();
  }

  const repairedDiagnostics = inspectDatabaseIntegrity(dbPath);
  if (!isHealthyQuickCheck(repairedDiagnostics)) {
    throw new Error(
      `Database integrity repair failed: ${repairedDiagnostics.join("; ").slice(0, 500)}`,
    );
  }
  console.log(
    `[DB] Rebuilt SQLite indexes (${indexNames.join(", ")}); safetyPoint=${safetyPoint.id}`,
  );
}

function ensureDatabaseIntegrity(
  dbPath: string,
  ensureSafetyPoint: (reason: DatabaseSafetyPointReason) => DatabaseSafetyPoint,
): void {
  if (!fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0) return;
  const diagnostics = inspectDatabaseIntegrity(dbPath);
  if (isHealthyQuickCheck(diagnostics)) return;
  if (isFreelistOnlyMismatch(diagnostics)) {
    repairFreelistIntegrity(dbPath, diagnostics, ensureSafetyPoint);
    return;
  }
  if (getIndexOnlyMismatchNames(diagnostics)) {
    repairIndexIntegrity(dbPath, diagnostics, ensureSafetyPoint);
    return;
  }
  throw new Error(
    `Database integrity check failed: ${diagnostics.join("; ").slice(0, 500)}`,
  );
}

/**
 * Hook functions for database lifecycle behavior that remains host-neutral.
 */
export interface InitDatabaseHooks {
  /**
   * Recover a legacy lock without lease metadata. Only hosts with an external
   * single-instance guarantee may enable this; shared callers default to false.
   */
  recoverUnregisteredLock?: boolean;
  /** Test/failure-injection hook executed inside the migration transaction. */
  beforeMigrationCommit?: () => void;
  /** Test/failure-injection hook executed after commit and before verification. */
  afterMigrationCommit?: () => void;
}

let db: Database.Database | null = null;
let dbClientLease: DatabaseClientLease | null = null;

function resetFailedDatabaseInitialization(): void {
  const failedDatabase = db;
  db = null;
  try {
    failedDatabase?.close();
  } catch (error) {
    console.warn("[DB] Failed to close an incomplete database:", error);
  } finally {
    dbClientLease?.release();
    dbClientLease = null;
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
  for (const tableName of CURRENT_SCHEMA_INVARIANTS.tables) {
    if (!tableExists(probe, tableName)) {
      return false;
    }
  }

  for (const migrationName of CURRENT_LEGACY_SCHEMA_MIGRATION_NAMES) {
    if (
      !probe.get(
        "SELECT 1 FROM schema_migrations WHERE name = ?",
        migrationName,
      )
    ) {
      return false;
    }
  }

  for (const [tableName, requiredColumns] of Object.entries(
    CURRENT_SCHEMA_INVARIANTS.columns,
  )) {
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

function databaseRequiresExclusiveMaintenance(dbPath: string): boolean {
  if (!fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0) return true;
  const diagnostics = inspectDatabaseIntegrity(dbPath);
  return (
    !isHealthyQuickCheck(diagnostics) ||
    shouldBackupDatabaseBeforeMigration(dbPath)
  );
}

function assertNoOtherDatabaseClients(dbPath: string): void {
  const clients = inspectDatabaseClientLeases(dbPath, {
    excludePids: [process.pid],
  });
  if (clients.livePids.length > 0 || clients.unknownEntries.length > 0) {
    throw new DatabaseMigrationBusyError(
      "Database maintenance requires all other clients to close",
    );
  }
}

function verifyInitializedDatabase(
  dbPath: string,
  database: Database.Database,
): void {
  const diagnostics = getQuickCheckDiagnostics(database);
  if (!isHealthyQuickCheck(diagnostics)) {
    throw new Error(
      `Post-migration quick check failed: ${diagnostics.join("; ").slice(0, 500)}`,
    );
  }
  if (!databaseAppearsCurrent(database)) {
    throw new Error("Post-migration schema invariants are incomplete");
  }
  const missingIndex = CURRENT_SCHEMA_INVARIANTS.indexes.find(
    (indexName) =>
      !database.get(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?",
        indexName,
      ),
  );
  if (missingIndex) {
    throw new Error(`Post-migration index is missing: ${missingIndex}`);
  }
  const foreignKeyErrors = database.pragma("foreign_key_check");
  if (!Array.isArray(foreignKeyErrors) || foreignKeyErrors.length > 0) {
    throw new Error("Post-migration foreign key verification failed");
  }
  assertDatabaseCompatibility(dbPath);
  const reopenedDiagnostics = inspectDatabaseIntegrity(dbPath);
  if (!isHealthyQuickCheck(reopenedDiagnostics)) {
    throw new Error("Fresh-reopen database verification failed");
  }
}

/**
 * Create a timestamped backup of the database file before running migrations.
 * Returns the backup path on success, or null if no backup was needed.
 */
function backupDatabaseBeforeMigration(
  dbPath: string,
  ensureSafetyPoint: (reason: DatabaseSafetyPointReason) => DatabaseSafetyPoint,
): DatabaseSafetyPoint | null {
  if (!shouldBackupDatabaseBeforeMigration(dbPath)) {
    return null;
  }
  const safetyPoint = ensureSafetyPoint("pre-migration");
  console.log(`[DB] Pre-migration safety point created: ${safetyPoint.id}`);
  return safetyPoint;
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
  const migrationIntent = acquireDatabaseMigrationIntent(dbPath);
  let safetyPoint: DatabaseSafetyPoint | null = null;
  const ensureSafetyPoint = (
    reason: DatabaseSafetyPointReason,
  ): DatabaseSafetyPoint => {
    safetyPoint ??= createDatabaseSafetyPoint(dbPath, reason);
    return safetyPoint;
  };
  try {
    if (hooks?.recoverUnregisteredLock) {
      const recovery = recoverDatabaseClientLock(dbPath);
      if (recovery.status === "blocked") {
        throw new DatabaseMigrationBusyError(
          "Database lock cannot be recovered while another client may own it",
        );
      }
    }
    assertDatabaseCompatibility(dbPath);
    const requiresExclusiveMaintenance =
      databaseRequiresExclusiveMaintenance(dbPath);
    if (requiresExclusiveMaintenance) assertNoOtherDatabaseClients(dbPath);
    dbClientLease = acquireDatabaseClientLease(dbPath, {
      recoverUnregisteredLock: hooks?.recoverUnregisteredLock,
    });
    if (requiresExclusiveMaintenance) assertNoOtherDatabaseClients(dbPath);
    ensureDatabaseIntegrity(dbPath, ensureSafetyPoint);
    backupDatabaseBeforeMigration(dbPath, ensureSafetyPoint);
    db = new Database(dbPath);

    // Serialize short cross-process write overlaps before reporting a conflict.
    db.pragma(`busy_timeout = ${DATABASE_BUSY_TIMEOUT_MS}`);

    // Enable foreign key constraints
    db.pragma("foreign_keys = ON");
  } catch (error) {
    resetFailedDatabaseInitialization();
    migrationIntent.release();
    throw error;
  }

  // Run all migrations in a single transaction to avoid lock contention.
  // Each table's column list is fetched exactly once and reused.
  const runMigrations = () => {
    db!.exec(PLUGIN_SCHEMA);
    // Schema v5 adds only operational receipts; existing business rows stay intact.
    db!.exec(STORAGE_PUBLICATION_SCHEMA);
    // ── schema_migrations table ───────────────────────────────────────────────
    db!.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )
    `);

    const hasMigration = (name: string): boolean => {
      return !!db!.get("SELECT 1 FROM schema_migrations WHERE name = ?", name);
    };
    const markMigration = (name: string): void => {
      db!.run(
        "INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES (?, ?)",
        name,
        Date.now(),
      );
    };

    if (!hasMigration("agent_provider_profiles_v1")) {
      const requiredProviderTables = [
        "agent_provider_profiles",
        "agent_provider_model_mappings",
        "agent_provider_snapshots",
      ];
      if (requiredProviderTables.some((table) => !tableExists(db!, table))) {
        throw new Error("Agent provider profile tables were not created");
      }
      markMigration("agent_provider_profiles_v1");
    }

    if (!hasMigration("allow_duplicate_agent_provider_profile_names_v1")) {
      db!.run("DROP INDEX IF EXISTS idx_agent_provider_profiles_active_name");
      markMigration("allow_duplicate_agent_provider_profile_names_v1");
    }

    if (!hasMigration("agent_session_index_v1")) {
      const requiredSessionTables = [
        "agent_session_sources",
        "agent_session_index",
      ];
      if (requiredSessionTables.some((table) => !tableExists(db!, table))) {
        throw new Error("Agent session index tables were not created");
      }
      markMigration("agent_session_index_v1");
    }

    if (!hasMigration("agent_conversation_projection_v1")) {
      const requiredConversationTables = [
        "agent_conversation_metadata",
        "agent_conversation_handoffs",
      ];
      if (
        requiredConversationTables.some((table) => !tableExists(db!, table))
      ) {
        throw new Error(
          "Agent conversation projection tables were not created",
        );
      }
      markMigration("agent_conversation_projection_v1");
    }

    if (!hasMigration("agent_conversation_handoff_launch_v2")) {
      const handoffTable = db!.get(
        `SELECT sql FROM sqlite_master
         WHERE type = 'table' AND name = 'agent_conversation_handoffs'`,
      ) as { sql?: string } | undefined;
      if (handoffTable?.sql?.includes("launch-and-copy")) {
        db!.exec(`
          ALTER TABLE agent_conversation_handoffs
            RENAME TO agent_conversation_handoffs_legacy;
          CREATE TABLE agent_conversation_handoffs (
            id TEXT PRIMARY KEY,
            source_agent_id TEXT NOT NULL,
            source_session_id TEXT NOT NULL,
            target_agent_id TEXT NOT NULL,
            project_id TEXT,
            project_path TEXT,
            transport TEXT NOT NULL
              CHECK(transport IN ('direct', 'launch', 'unavailable')),
            payload_digest TEXT NOT NULL,
            status TEXT NOT NULL
              CHECK(status IN ('planned', 'launched', 'failed')),
            target_session_id TEXT,
            error_code TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          INSERT INTO agent_conversation_handoffs (
            id, source_agent_id, source_session_id, target_agent_id,
            project_id, project_path, transport, payload_digest, status,
            target_session_id, error_code, created_at, updated_at
          )
          SELECT
            id, source_agent_id, source_session_id, target_agent_id,
            project_id, project_path,
            CASE WHEN transport = 'launch-and-copy' THEN 'launch' ELSE transport END,
            payload_digest,
            CASE
              WHEN status = 'copied' AND error_code IS NOT NULL THEN 'failed'
              WHEN status = 'copied' THEN 'launched'
              ELSE status
            END,
            target_session_id, error_code, created_at, updated_at
          FROM agent_conversation_handoffs_legacy;
          DROP TABLE agent_conversation_handoffs_legacy;
        `);
      }
      markMigration("agent_conversation_handoff_launch_v2");
    }

    if (!hasMigration("drop_agent_conversation_metadata_deleted_at_v1")) {
      const metadataColumns = columnNames(db!, "agent_conversation_metadata");
      if (metadataColumns?.has("deleted_at")) {
        db!.exec(`
          ALTER TABLE agent_conversation_metadata
            RENAME TO agent_conversation_metadata_legacy;
          CREATE TABLE agent_conversation_metadata (
            id TEXT PRIMARY KEY,
            agent_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            title TEXT,
            project_id TEXT,
            project_path TEXT,
            tags_json TEXT NOT NULL DEFAULT '[]',
            note TEXT,
            is_favorite INTEGER NOT NULL DEFAULT 0
              CHECK(is_favorite IN (0, 1)),
            archived_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            UNIQUE(agent_id, session_id)
          );
          INSERT INTO agent_conversation_metadata (
            id, agent_id, session_id, title, project_id, project_path,
            tags_json, note, is_favorite, archived_at, created_at, updated_at
          )
          SELECT
            id, agent_id, session_id, title, project_id, project_path,
            tags_json, note, is_favorite, archived_at, created_at, updated_at
          FROM agent_conversation_metadata_legacy
          WHERE deleted_at IS NULL;
          DROP TABLE agent_conversation_metadata_legacy;
        `);
      }
      markMigration("drop_agent_conversation_metadata_deleted_at_v1");
    }

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
      db!.run(
        "ALTER TABLE prompts ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'",
      );
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
      db!.run(
        "ALTER TABLE folders ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'",
      );
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
      { name: "logical_name", type: "TEXT" },
      { name: "variant_key", type: "TEXT" },
      { name: "directory_fingerprint", type: "TEXT" },
      { name: "icon_url", type: "TEXT" },
      { name: "icon_emoji", type: "TEXT" },
      { name: "icon_background", type: "TEXT" },
      { name: "category", type: "TEXT DEFAULT 'general'" },
      { name: "is_builtin", type: "INTEGER DEFAULT 0" },
      { name: "registry_slug", type: "TEXT" },
      { name: "content_url", type: "TEXT" },
      { name: "installed_content_hash", type: "TEXT" },
      { name: "installed_directory_fingerprint", type: "TEXT" },
      { name: "fingerprint_algorithm", type: "TEXT" },
      { name: "source_last_checked_at", type: "INTEGER" },
      { name: "source_last_error", type: "TEXT" },
      { name: "source_binding_state", type: "TEXT" },
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

    if (!hasMigration("backfill_skill_legacy_fingerprint_algorithm_v1")) {
      db!.run(
        `UPDATE skills
         SET fingerprint_algorithm = 'legacy-stable-text-v1'
         WHERE (fingerprint_algorithm IS NULL OR fingerprint_algorithm = '')
           AND directory_fingerprint IS NOT NULL
           AND directory_fingerprint != ''`,
      );
      markMigration("backfill_skill_legacy_fingerprint_algorithm_v1");
      console.log(
        "Migrated: Backfilled legacy fingerprint_algorithm for existing skills",
      );
    }

    if (!skillCols.includes("owner_user_id")) {
      console.log("Migrating: Adding owner_user_id column to skills table");
      db!.run(
        "ALTER TABLE skills ADD COLUMN owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL",
      );
    }

    if (!skillCols.includes("visibility")) {
      console.log("Migrating: Adding visibility column to skills table");
      db!.run(
        "ALTER TABLE skills ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'",
      );
    }

    // Backfill: set original_tags = tags for existing skills that don't have original_tags yet
    if (!skillCols.includes("original_tags")) {
      db!.run(
        "UPDATE skills SET original_tags = tags WHERE original_tags IS NULL",
      );
      console.log("Migrated: Backfilled original_tags for existing skills");
    }

    // Host-specific path discovery is a separate Desktop reconciliation stage.
    if (!hasMigration("backfill_local_repo_path_v1")) {
      markMigration("backfill_local_repo_path_v1");
    }

    if (!hasMigration("normalize_skill_version_tracking_v1")) {
      try {
        const skillsWithVersionStats = db!.all(
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
        throw error;
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

    const userSettingsExists = db!.get(
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
    const skillVersionsExists = db!.get(
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

    const rulesExists = db!.get(
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

    const ruleVersionsExists = db!.get(
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
        throw error;
      }
      markMigration("drop_skill_name_unique_v2");
    }

    const promptVersionCols = (
      db!.pragma("table_info(prompt_versions)") as PragmaColumnInfo[]
    ).map((c) => c.name);

    if (!promptVersionCols.includes("system_prompt_en")) {
      console.log(
        "Migrating: Adding system_prompt_en column to prompt_versions table",
      );
      db!.run("ALTER TABLE prompt_versions ADD COLUMN system_prompt_en TEXT");
    }

    if (!promptVersionCols.includes("user_prompt_en")) {
      console.log(
        "Migrating: Adding user_prompt_en column to prompt_versions table",
      );
      db!.run("ALTER TABLE prompt_versions ADD COLUMN user_prompt_en TEXT");
    }

    if (!promptVersionCols.includes("ai_response")) {
      console.log(
        "Migrating: Adding ai_response column to prompt_versions table",
      );
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

    if (!hasMigration("repair_empty_prompt_version_chain_v1")) {
      console.log(
        "Migrating: Repairing prompts without a stored version chain",
      );
      db!.run(
        `INSERT INTO prompt_versions (
           id, prompt_id, version, system_prompt, system_prompt_en,
           user_prompt, user_prompt_en, variables, note, ai_response, created_at
         )
         SELECT
           'recovered-' || lower(hex(randomblob(16))),
           prompts.id,
           1,
           prompts.system_prompt,
           prompts.system_prompt_en,
           prompts.user_prompt,
           prompts.user_prompt_en,
           COALESCE(prompts.variables, '[]'),
           NULL,
           prompts.last_ai_response,
           prompts.created_at
         FROM prompts
         WHERE NOT EXISTS (
           SELECT 1
           FROM prompt_versions
           WHERE prompt_versions.prompt_id = prompts.id
         )`,
      );
      db!.run(
        `UPDATE prompts
         SET current_version = (
           SELECT MAX(version)
           FROM prompt_versions
           WHERE prompt_versions.prompt_id = prompts.id
             AND prompt_versions.version > 0
         )
         WHERE EXISTS (
           SELECT 1
           FROM prompt_versions
           WHERE prompt_versions.prompt_id = prompts.id
             AND prompt_versions.version > 0
         )
           AND (
             current_version IS NULL
             OR current_version != (
               SELECT MAX(version)
               FROM prompt_versions
               WHERE prompt_versions.prompt_id = prompts.id
                 AND prompt_versions.version > 0
             )
           )`,
      );
      markMigration("repair_empty_prompt_version_chain_v1");
    }
  };

  try {
    const migrationStartedAt = Date.now();
    const initializeSchema = db.transaction(() => {
      db!.exec(SCHEMA_TABLES);
      runMigrations();
      migrateRuleOwnership(db!);
      migrateGenerationMetadata(db!);
      db!.exec(SCHEMA_INDEXES);
      hooks?.beforeMigrationCommit?.();
      recordCurrentDatabaseMigration(db!, Date.now() - migrationStartedAt);
    });
    initializeSchema();
    hooks?.afterMigrationCommit?.();
    verifyInitializedDatabase(dbPath, db);
  } catch (error) {
    console.error("Database migration failed:", error);
    resetFailedDatabaseInitialization();
    migrationIntent.release();
    throw error;
  }

  migrationIntent.release();
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
  const databaseToClose = db;
  db = null;
  try {
    databaseToClose?.close();
  } finally {
    dbClientLease?.release();
    dbClientLease = null;
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

/** File migration calls this in its publication transaction, after durable payload staging. */
export function completeSkillPayloadMigration(
  database: Database.Database,
  migrationName: string,
): void {
  database.run("UPDATE skills SET content = NULL");
  database.run(
    "UPDATE skill_versions SET content = NULL, files_snapshot = NULL",
  );
  database.run(
    "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
    migrationName,
    Date.now(),
  );
  ensureSkillPayloadGuards(database);
}

export function ensureSkillPayloadGuards(database: Database.Database): void {
  const guardNames = [
    "skills_reject_sql_payload_insert",
    "skills_reject_sql_payload_update",
    "skill_versions_reject_sql_payload_insert",
    "skill_versions_reject_sql_payload_update",
  ];
  // A preserved SQL catalog may lack triggers; normal opens need only a metadata lookup.
  const count = database.get(
    `SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'trigger' AND name IN (${guardNames.map(() => "?").join(",")})`,
    ...guardNames,
  );
  if (
    count &&
    typeof count === "object" &&
    "count" in count &&
    count.count === guardNames.length
  )
    return;

  // Retired columns remain solely for opening pre-migration databases and portable staging.
  // Runtime writers must use SkillMetadataDB; fail visibly if an old writer bypasses it.
  database.exec(`
    CREATE TRIGGER IF NOT EXISTS skills_reject_sql_payload_insert BEFORE INSERT ON skills
      WHEN NEW.content IS NOT NULL BEGIN SELECT RAISE(ABORT, 'Skill content must be stored in files'); END;
    CREATE TRIGGER IF NOT EXISTS skills_reject_sql_payload_update BEFORE UPDATE OF content ON skills
      WHEN NEW.content IS NOT NULL BEGIN SELECT RAISE(ABORT, 'Skill content must be stored in files'); END;
    CREATE TRIGGER IF NOT EXISTS skill_versions_reject_sql_payload_insert BEFORE INSERT ON skill_versions
      WHEN NEW.content IS NOT NULL OR NEW.files_snapshot IS NOT NULL
      BEGIN SELECT RAISE(ABORT, 'Skill history must be stored in files'); END;
    CREATE TRIGGER IF NOT EXISTS skill_versions_reject_sql_payload_update BEFORE UPDATE OF content, files_snapshot ON skill_versions
      WHEN NEW.content IS NOT NULL OR NEW.files_snapshot IS NOT NULL
      BEGIN SELECT RAISE(ABORT, 'Skill history must be stored in files'); END;
  `);
}
