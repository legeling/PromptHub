import type Database from "./adapter";

export const RULE_SCHEMA = `CREATE TABLE IF NOT EXISTS rules (
  owner_user_id TEXT NOT NULL DEFAULT '',
  id TEXT NOT NULL,
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
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(owner_user_id, id)
);

CREATE TABLE IF NOT EXISTS rule_versions (
  owner_user_id TEXT NOT NULL DEFAULT '',
  id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('manual-save', 'ai-rewrite', 'create')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(owner_user_id, id),
  FOREIGN KEY (owner_user_id, rule_id) REFERENCES rules(owner_user_id, id) ON DELETE CASCADE,
  UNIQUE(owner_user_id, rule_id, version)
);

`;

/** Preserve the issued local Rule graph while adding tenant-scoped identities. */
export function migrateRuleOwnership(database: Database.Database): void {
  const columns = database.all("PRAGMA table_info(rules)");
  if (
    columns.some(
      (row: unknown) =>
        typeof row === "object" &&
        row !== null &&
        "name" in row &&
        row.name === "owner_user_id",
    )
  )
    return;
  database.exec(
    RULE_SCHEMA.replaceAll(
      "rule_versions",
      "rule_versions_tenant_migration",
    ).replaceAll(/\brules\b/gu, "rules_tenant_migration"),
  );
  database.exec(`
    INSERT INTO rules_tenant_migration SELECT '', id, scope, platform_id, platform_name, platform_icon, platform_description, canonical_file_name, description, managed_path, target_path, project_root_path, sync_status, current_version, content_hash, created_at, updated_at FROM rules;
    INSERT INTO rule_versions_tenant_migration SELECT '', id, rule_id, version, file_path, source, created_at FROM rule_versions;
    DROP TABLE rule_versions;
    DROP TABLE rules;
    ALTER TABLE rules_tenant_migration RENAME TO rules;
    ALTER TABLE rule_versions_tenant_migration RENAME TO rule_versions;
  `);
}
