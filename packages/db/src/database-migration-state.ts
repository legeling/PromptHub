import { SYNC_TARGET_SCHEMA_VERSION } from "./sync-target";
import { PLUGIN_SCHEMA_VERSION } from "./plugin";
import fs from "fs";

import Database from "./adapter";
import { MCP_STORAGE_TABLES } from "@prompthub/shared/types/mcp-storage";

export const CURRENT_DATABASE_SCHEMA_VERSION = PLUGIN_SCHEMA_VERSION;
const DATABASE_BUSY_TIMEOUT_MS = 5_000;

export interface DatabaseMigrationManifestEntry {
  migrationId: number;
  name: string;
  checksum: string;
  appVersion: string;
  destructive: boolean;
  invariants?: DatabaseSchemaInvariants;
}

export interface DatabaseSchemaInvariants {
  tables: readonly string[];
  indexes: readonly string[];
  columns: Readonly<Record<string, readonly string[]>>;
  legacyMigrations: readonly DatabaseLegacyMigrationManifestEntry[];
}

export interface DatabaseLegacyMigrationManifestEntry {
  migrationId: string;
  name: string;
  checksum: string;
  destructive: boolean;
}

const CURRENT_DATABASE_SCHEMA_INVARIANTS: DatabaseSchemaInvariants =
  Object.freeze({
    tables: Object.freeze([
      "schema_migrations",
      "users",
      "refresh_tokens",
      "user_settings",
      "prompt_relations",
      "skill_versions",
      "rules",
      "rule_versions",
      "agent_provider_profiles",
      "agent_provider_model_mappings",
      "agent_provider_snapshots",
      "agent_session_sources",
      "agent_session_index",
      "agent_conversation_metadata",
      "agent_conversation_handoffs",
      "canonical_resources",
    ]),
    indexes: Object.freeze([
      "idx_prompts_folder",
      "idx_versions_prompt",
      "idx_skills_source_id",
      "idx_agent_provider_profiles_platform",
      "idx_canonical_resources_type_updated",
    ]),
    columns: Object.freeze({
      prompts: Object.freeze([
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
      ]),
      folders: Object.freeze([
        "is_private",
        "updated_at",
        "owner_user_id",
        "visibility",
      ]),
      skills: Object.freeze([
        "source_url",
        "source_id",
        "source_label",
        "source_branch",
        "source_directory",
        "canonical_skill_path",
        "logical_name",
        "variant_key",
        "directory_fingerprint",
        "icon_url",
        "icon_emoji",
        "icon_background",
        "category",
        "is_builtin",
        "registry_slug",
        "content_url",
        "installed_content_hash",
        "installed_directory_fingerprint",
        "fingerprint_algorithm",
        "source_last_checked_at",
        "source_last_error",
        "source_binding_state",
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
      ]),
      users: Object.freeze(["role"]),
      prompt_versions: Object.freeze([
        "system_prompt_en",
        "user_prompt_en",
        "ai_response",
      ]),
    }),
    legacyMigrations: Object.freeze(
      [
        {
          migrationId: "legacy-001",
          name: "backfill_local_repo_path_v1",
          checksum:
            "f630936ddd43437fda6f5f3f9e9f15a3759cb6d2fc04527dfec8b913daf783cf",
          destructive: false,
        },
        {
          migrationId: "legacy-002",
          name: "normalize_skill_version_tracking_v1",
          checksum:
            "b1028740be64e22b5b369da90eb25e6fdd649ac7e283650c49b72eaa528e128b",
          destructive: false,
        },
        {
          migrationId: "legacy-003",
          name: "server_auth_tables_v1",
          checksum:
            "cc43cc7d9d39a2966c0ed8ab2705ecb472adddf7ff4b86a11bb757a81b76e6b1",
          destructive: false,
        },
        {
          migrationId: "legacy-004",
          name: "drop_skill_name_unique_v2",
          checksum:
            "b43f16525778686eff2966d7e6356a221261b055b5c8471a97d6f3cbb7be731f",
          destructive: true,
        },
        {
          migrationId: "legacy-005",
          name: "fix_prompt_current_version_v1",
          checksum:
            "e3ffabf4350e74d30ec30ca99593480d28cfaeb5aad88b0a9f7debba4689a43f",
          destructive: false,
        },
        {
          migrationId: "legacy-006",
          name: "backfill_skill_legacy_fingerprint_algorithm_v1",
          checksum:
            "fb5633498277f21016453248e287505dcc7b6ce019c8e6124431012d37c823c1",
          destructive: false,
        },
        {
          migrationId: "legacy-007",
          name: "agent_provider_profiles_v1",
          checksum:
            "1a47c2244501fd3567a1b70c8646fd8ba7e18975279789fb04ab561f8e9b1a44",
          destructive: false,
        },
        {
          migrationId: "legacy-008",
          name: "agent_session_index_v1",
          checksum:
            "fe3ddda336e8e6b21ce43234dbebafa7b33a51a5d13775942d91dc672ff4a623",
          destructive: false,
        },
        {
          migrationId: "legacy-009",
          name: "agent_conversation_projection_v1",
          checksum:
            "6c98af16953c8cdca408f7e707d6002a141fae027cadeba2e4d80a65721190bf",
          destructive: false,
        },
        {
          migrationId: "legacy-010",
          name: "agent_conversation_handoff_launch_v2",
          checksum:
            "119941083a063625f69633c3202eda8b7b8056177ba6889143fbb309cc5bea66",
          destructive: true,
        },
        {
          migrationId: "legacy-011",
          name: "repair_empty_prompt_version_chain_v1",
          checksum:
            "4e8ccdd5f8bf1ea7de8b7ad6c48707253be30d4c16c91f4cd6875fc013bfdd97",
          destructive: false,
        },
        {
          migrationId: "legacy-012",
          name: "drop_agent_conversation_metadata_deleted_at_v1",
          checksum:
            "90009359c490a98ccaeac0058caac2727263dfbdbfbbae4766e61a0c79eb0ae8",
          destructive: true,
        },
        {
          migrationId: "legacy-013",
          name: "allow_duplicate_agent_provider_profile_names_v1",
          checksum:
            "56b5ced9ab22768e44352785ff0df6ca5157a11470140797f4b4d7e906c12735",
          destructive: true,
        },
      ].map((entry) => Object.freeze(entry)),
    ),
  });

const MCP_DATABASE_SCHEMA_INVARIANTS: DatabaseSchemaInvariants = Object.freeze({
  ...CURRENT_DATABASE_SCHEMA_INVARIANTS,
  tables: Object.freeze([
    ...CURRENT_DATABASE_SCHEMA_INVARIANTS.tables,
    ...MCP_STORAGE_TABLES,
  ]),
  columns: Object.freeze({
    ...CURRENT_DATABASE_SCHEMA_INVARIANTS.columns,
    mcp_servers: Object.freeze([
      "current_version",
      "max_version",
      "config_json",
    ]),
    mcp_versions: Object.freeze(["content_path", "content_sha256"]),
  }),
});

export const DATABASE_MIGRATION_MANIFEST: readonly DatabaseMigrationManifestEntry[] =
  Object.freeze([
    Object.freeze({
      migrationId: 1,
      name: "shared-schema-baseline-v1",
      checksum:
        "c3f5afb1253a833e319686cab98c6f8b36fae9c17d74ce0845927d1dbe0bc408",
      appVersion: "0.6.0",
      destructive: true,
    }),
    Object.freeze({
      migrationId: 2,
      name: "skills-logical-identity-v2",
      checksum:
        "a2cd25aca1d04fc3351252402db15f74e128470ce404af58ccef15e0bac76f1f",
      appVersion: "0.6.0",
      destructive: false,
    }),
    Object.freeze({
      migrationId: 3,
      name: "canonical-resource-catalog-v3",
      checksum:
        "e3b1b811d812c75e69b4709e2b9f9ef43b8c9bb5bcf1a3cc49a26ee4d2ce0e77",
      appVersion: "0.6.0",
      destructive: false,
      invariants: CURRENT_DATABASE_SCHEMA_INVARIANTS,
    }),
    Object.freeze({
      migrationId: 4,
      name: "mcp-sqlite-storage-v4",
      checksum:
        "ef4eda3ac75400615369bc25d1c466a6105bd32911f9ce1c4c7f880e30a516c6",
      appVersion: "0.6.0",
      destructive: false,
      invariants: MCP_DATABASE_SCHEMA_INVARIANTS,
    }),
    Object.freeze({
      migrationId: 5,
      name: "storage-publication-receipts-v5",
      checksum:
        "2500948fac04b424c4b6296aa1e34e0e3e63307c8b97d405ceb72ccb03a0a005",
      appVersion: "0.6.0",
      destructive: false,
      invariants: Object.freeze({
        ...MCP_DATABASE_SCHEMA_INVARIANTS,
        tables: Object.freeze([
          ...MCP_DATABASE_SCHEMA_INVARIANTS.tables,
          "storage_publication_receipts",
        ]),
        columns: Object.freeze({
          ...MCP_DATABASE_SCHEMA_INVARIANTS.columns,
          storage_publication_receipts: Object.freeze([
            "operation_key",
            "operation_id",
            "committed_at",
          ]),
        }),
      }),
    }),
    Object.freeze({
      migrationId: 6,
      name: "rule-tenant-ownership-v6",
      checksum: "b2683c9d953283b4cabccfcc37016f8fef109da79cd3e86c131fad72abb55c9f",
      appVersion: "0.6.0",
      destructive: false,
      invariants: Object.freeze({
        ...MCP_DATABASE_SCHEMA_INVARIANTS,
        tables: Object.freeze([...MCP_DATABASE_SCHEMA_INVARIANTS.tables, "storage_publication_receipts"]),
        columns: Object.freeze({
          ...MCP_DATABASE_SCHEMA_INVARIANTS.columns,
          rules: Object.freeze(["owner_user_id"]),
          rule_versions: Object.freeze(["owner_user_id"]),
          storage_publication_receipts: Object.freeze(["operation_key", "operation_id", "committed_at"]),
        }),
      }),
    }),
    Object.freeze({
      migrationId: 7,
      name: "generation-metadata-v7",
      checksum: "b5aaf8cb9ee82366ce3894eb288eb15af72904e68161181b764f3b0ece996cce",
      appVersion: "0.6.0",
      destructive: false,
      invariants: Object.freeze({
        ...MCP_DATABASE_SCHEMA_INVARIANTS,
        tables: Object.freeze([...MCP_DATABASE_SCHEMA_INVARIANTS.tables, "storage_publication_receipts", "generation_batches", "generation_outputs"]),
        columns: Object.freeze({
          ...MCP_DATABASE_SCHEMA_INVARIANTS.columns,
          rules: Object.freeze(["owner_user_id"]),
          rule_versions: Object.freeze(["owner_user_id"]),
          storage_publication_receipts: Object.freeze(["operation_key", "operation_id", "committed_at"]),
          generation_batches: Object.freeze(["request_json"]),
          generation_outputs: Object.freeze(["error_json", "revised_prompt"]),
        }),
      }),
    }),
    Object.freeze({
      migrationId: SYNC_TARGET_SCHEMA_VERSION,
      name: "causal-sync-state-v8",
      checksum: "543517c2f0bd580eebaca92b17a544e281aba49fc9342a8001950475fa565f81",
      appVersion: "0.6.0",
      destructive: false,
      invariants: Object.freeze({
        ...MCP_DATABASE_SCHEMA_INVARIANTS,
        tables: Object.freeze([...MCP_DATABASE_SCHEMA_INVARIANTS.tables, "storage_publication_receipts", "generation_batches", "generation_outputs", "sync_targets"]),
        columns: Object.freeze({
          ...MCP_DATABASE_SCHEMA_INVARIANTS.columns,
          rules: Object.freeze(["owner_user_id"]),
          rule_versions: Object.freeze(["owner_user_id"]),
          storage_publication_receipts: Object.freeze(["operation_key", "operation_id", "committed_at"]),
          sync_targets: Object.freeze(["id", "device_id", "sync_id", "base_json", "pending_json"]),
          generation_batches: Object.freeze(["request_json"]),
          generation_outputs: Object.freeze(["error_json", "revised_prompt"]),
        }),
      }),
    }),
    Object.freeze({
      migrationId: PLUGIN_SCHEMA_VERSION,
      name: "plugin-metadata-v9",
      checksum: "caac97634f3ccdf4590493dc6ec4be09ebf18d51e5ca3455b47f18dfef791281",
      appVersion: "0.6.0",
      destructive: false,
      invariants: Object.freeze({
        ...MCP_DATABASE_SCHEMA_INVARIANTS,
        tables: Object.freeze([...MCP_DATABASE_SCHEMA_INVARIANTS.tables, "storage_publication_receipts", "generation_batches", "generation_outputs", "sync_targets", "plugins", "plugin_versions"]),
        columns: Object.freeze({
          ...MCP_DATABASE_SCHEMA_INVARIANTS.columns,
          rules: Object.freeze(["owner_user_id"]),
          rule_versions: Object.freeze(["owner_user_id"]),
          storage_publication_receipts: Object.freeze(["operation_key", "operation_id", "committed_at"]),
          sync_targets: Object.freeze(["id", "device_id", "sync_id", "base_json", "pending_json"]),
          generation_batches: Object.freeze(["request_json"]),
          generation_outputs: Object.freeze(["error_json", "revised_prompt"]),
          plugins: Object.freeze(["id", "name", "installed_at", "updated_at", "metadata_json"]),
          plugin_versions: Object.freeze(["id", "plugin_id", "version", "created_at", "metadata_json", "has_package_snapshot"]),
        }),
      }),
    }),
  ]);

export const CURRENT_LEGACY_SCHEMA_MIGRATION_NAMES =
  CURRENT_DATABASE_SCHEMA_INVARIANTS.legacyMigrations.map(
    (migration) => migration.name,
  );

export function getCurrentDatabaseSchemaInvariants(): DatabaseSchemaInvariants {
  const current = DATABASE_MIGRATION_MANIFEST.at(-1)?.invariants;
  if (!current) {
    throw new Error("Current database migration has no schema invariants");
  }
  return current;
}

interface MigrationHistoryRow {
  migration_id: number;
  name: string;
  checksum: string;
}

function tableExists(database: Database.Database, tableName: string): boolean {
  return Boolean(
    database.get(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      tableName,
    ),
  );
}

function readUserVersion(database: Database.Database): number {
  const rows = database.pragma("user_version");
  const version =
    Array.isArray(rows) && rows.length === 1 && rows[0]
      ? (rows[0] as Record<string, unknown>).user_version
      : undefined;
  if (!Number.isSafeInteger(version) || Number(version) < 0) {
    throw new Error("SQLite returned an invalid database schema version");
  }
  return Number(version);
}

function validateMigrationHistory(
  database: Database.Database,
  userVersion: number,
): void {
  const historyExists = tableExists(database, "database_migration_history");
  if (!historyExists) {
    if (userVersion > 0) {
      throw new Error("Database migration history is missing");
    }
    return;
  }

  const rows = database.all(
    `SELECT migration_id, name, checksum
     FROM database_migration_history
     ORDER BY migration_id ASC`,
  ) as MigrationHistoryRow[];
  if (rows.length !== userVersion) {
    throw new Error("Database migration history does not match user_version");
  }
  for (const row of rows) {
    const manifest = DATABASE_MIGRATION_MANIFEST.find(
      (entry) => entry.migrationId === row.migration_id,
    );
    if (!manifest || manifest.name !== row.name) {
      throw new Error(
        `Unknown database migration history entry (${row.migration_id})`,
      );
    }
    if (manifest.checksum !== row.checksum) {
      throw new Error(
        `Database migration checksum mismatch (${row.migration_id})`,
      );
    }
  }
}

export function assertDatabaseCompatibility(dbPath: string): void {
  let stats: fs.Stats;
  try {
    stats = fs.lstatSync(dbPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`Database path is not a regular file: ${dbPath}`);
  }
  if (stats.size === 0) return;
  const database = new Database(dbPath);
  try {
    database.pragma(`busy_timeout = ${DATABASE_BUSY_TIMEOUT_MS}`);
    const userVersion = readUserVersion(database);
    if (userVersion > CURRENT_DATABASE_SCHEMA_VERSION) {
      throw new Error(
        `PromptHub data uses a newer database schema version (${userVersion})`,
      );
    }
    validateMigrationHistory(database, userVersion);
  } finally {
    database.close();
  }
}

export function recordCurrentDatabaseMigration(
  database: Database.Database,
  durationMs: number,
): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS database_migration_history (
      migration_id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      app_version TEXT NOT NULL,
      applied_at INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL
    )
  `);
  for (const manifest of DATABASE_MIGRATION_MANIFEST) {
    const existing = database.get(
      `SELECT migration_id, name, checksum
       FROM database_migration_history
       WHERE migration_id = ?`,
      manifest.migrationId,
    ) as MigrationHistoryRow | null;
    if (existing) {
      if (
        existing.name !== manifest.name ||
        existing.checksum !== manifest.checksum
      ) {
        throw new Error(
          `Database migration checksum mismatch (${manifest.migrationId})`,
        );
      }
      continue;
    }
    database.run(
      `INSERT INTO database_migration_history (
           migration_id, name, checksum, app_version, applied_at, duration_ms
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      manifest.migrationId,
      manifest.name,
      manifest.checksum,
      manifest.appVersion,
      Date.now(),
      Math.max(0, Math.trunc(durationMs)),
    );
  }
  // Even assigning the same SQLite header value causes a durable write on reopen.
  if (readUserVersion(database) !== CURRENT_DATABASE_SCHEMA_VERSION)
    database.pragma(`user_version = ${CURRENT_DATABASE_SCHEMA_VERSION}`);
}

export function recordCurrentLegacySchemaMigrations(
  database: Database.Database,
  appliedAt = Date.now(),
): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);
  const insert = database.prepare(
    "INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES (?, ?)",
  );
  for (const name of CURRENT_LEGACY_SCHEMA_MIGRATION_NAMES) {
    insert.run(name, appliedAt);
  }
}
