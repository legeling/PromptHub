import Database from "./adapter";
import { isRuleFileId, isRulePlatformId } from "@prompthub/shared";
import type { RuleRecord, RuleVersionRecord } from "@prompthub/shared";

interface RuleRow {
  id: string;
  scope: "global" | "project";
  platform_id: string;
  platform_name: string;
  platform_icon: string;
  platform_description: string;
  canonical_file_name: string;
  description: string;
  managed_path: string;
  target_path: string;
  project_root_path: string | null;
  sync_status: RuleRecord["syncStatus"];
  current_version: number;
  content_hash: string;
  created_at: number;
  updated_at: number;
}

interface RuleVersionRow {
  id: string;
  rule_id: string;
  version: number;
  file_path: string;
  source: RuleVersionRecord["source"];
  created_at: number;
}

// REPLACE deletes the parent row and cascades into rule_versions.
const UPSERT_RULE_SQL = `INSERT INTO rules (
  owner_user_id, id, scope, platform_id, platform_name, platform_icon, platform_description,
  canonical_file_name, description, managed_path, target_path, project_root_path,
  sync_status, current_version, content_hash, created_at, updated_at
) VALUES (
  @owner_user_id, @id, @scope, @platform_id, @platform_name, @platform_icon, @platform_description,
  @canonical_file_name, @description, @managed_path, @target_path, @project_root_path,
  @sync_status, @current_version, @content_hash, @created_at, @updated_at
) ON CONFLICT(owner_user_id, id) DO UPDATE SET
  scope = excluded.scope,
  platform_id = excluded.platform_id,
  platform_name = excluded.platform_name,
  platform_icon = excluded.platform_icon,
  platform_description = excluded.platform_description,
  canonical_file_name = excluded.canonical_file_name,
  description = excluded.description,
  managed_path = excluded.managed_path,
  target_path = excluded.target_path,
  project_root_path = excluded.project_root_path,
  sync_status = excluded.sync_status,
  current_version = excluded.current_version,
  content_hash = excluded.content_hash,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at`;

export class RuleDB {
  constructor(
    protected db: Database.Database,
    protected ownerUserId = "",
  ) {
    if (ownerUserId.includes("\0")) throw new Error("Invalid Rule owner");
  }

  getAll(): RuleRecord[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM rules WHERE owner_user_id = ? ORDER BY scope ASC, updated_at DESC",
      )
      .all(this.ownerUserId) as RuleRow[];
    return rows.map((row) => this.rowToRule(row));
  }

  getById(id: string): RuleRecord | null {
    const row = this.db
      .prepare("SELECT * FROM rules WHERE id = ? AND owner_user_id = ?")
      .get(id, this.ownerUserId) as RuleRow | undefined;
    return row ? this.rowToRule(row) : null;
  }

  upsert(rule: RuleRecord): void {
    if (
      Object.values(rule).some(
        (value) => typeof value === "string" && value.includes("\0"),
      )
    )
      throw new Error("Rule metadata contains a null byte");
    this.db.prepare(UPSERT_RULE_SQL).run({
      "@owner_user_id": this.ownerUserId,
      "@id": rule.id,
      "@scope": rule.scope,
      "@platform_id": rule.platformId,
      "@platform_name": rule.platformName,
      "@platform_icon": rule.platformIcon,
      "@platform_description": rule.platformDescription,
      "@canonical_file_name": rule.canonicalFileName,
      "@description": rule.description,
      "@managed_path": rule.managedPath,
      "@target_path": rule.targetPath,
      "@project_root_path": rule.projectRootPath ?? null,
      "@sync_status": rule.syncStatus,
      "@current_version": rule.currentVersion,
      "@content_hash": rule.contentHash,
      "@created_at": new Date(rule.createdAt).getTime(),
      "@updated_at": new Date(rule.updatedAt).getTime(),
    });
  }

  delete(id: string): void {
    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          "DELETE FROM rule_versions WHERE rule_id = ? AND owner_user_id = ?",
        )
        .run(id, this.ownerUserId);
      this.db
        .prepare("DELETE FROM rules WHERE id = ? AND owner_user_id = ?")
        .run(id, this.ownerUserId);
    });
    transaction();
  }

  replaceVersions(ruleId: string, versions: RuleVersionRecord[]): void {
    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          "DELETE FROM rule_versions WHERE rule_id = ? AND owner_user_id = ?",
        )
        .run(ruleId, this.ownerUserId);
      const stmt = this.db.prepare(
        `INSERT INTO rule_versions (
          owner_user_id, id, rule_id, version, file_path, source, created_at
        ) VALUES (
          @owner_user_id, @id, @rule_id, @version, @file_path, @source, @created_at
        )`,
      );
      for (const version of versions) {
        if (
          Object.values(version).some(
            (value) => typeof value === "string" && value.includes("\0"),
          )
        )
          throw new Error("Rule version metadata contains a null byte");
        stmt.run({
          "@owner_user_id": this.ownerUserId,
          "@id": version.id,
          "@rule_id": version.ruleId,
          "@version": version.version,
          "@file_path": version.filePath,
          "@source": version.source,
          "@created_at": new Date(version.createdAt).getTime(),
        });
      }
    });
    transaction();
  }

  getVersions(ruleId: string): RuleVersionRecord[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM rule_versions WHERE rule_id = ? AND owner_user_id = ? ORDER BY version DESC",
      )
      .all(ruleId, this.ownerUserId) as RuleVersionRow[];
    return rows.map((row) => this.rowToRuleVersion(row));
  }

  getAllVersions(): RuleVersionRecord[] {
    // The adapter returns untyped rows; this SELECT uses the RuleVersionRow schema.
    const rows = this.db
      .prepare(
        "SELECT * FROM rule_versions WHERE owner_user_id = ? ORDER BY rule_id, version",
      )
      .all(this.ownerUserId) as RuleVersionRow[];
    return rows.map((row) => this.rowToRuleVersion(row));
  }

  private rowToRule(row: RuleRow): RuleRecord {
    if (!isRuleFileId(row.id)) {
      throw new Error(`Invalid rule id in database: ${row.id}`);
    }

    if (!isRulePlatformId(row.platform_id)) {
      throw new Error(
        `Invalid rule platform id in database: ${row.platform_id}`,
      );
    }

    return {
      id: row.id,
      scope: row.scope,
      platformId: row.platform_id,
      platformName: row.platform_name,
      platformIcon: row.platform_icon,
      platformDescription: row.platform_description,
      canonicalFileName: row.canonical_file_name,
      description: row.description,
      managedPath: row.managed_path,
      targetPath: row.target_path,
      projectRootPath: row.project_root_path ?? null,
      syncStatus: row.sync_status,
      currentVersion: row.current_version,
      contentHash: row.content_hash,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private rowToRuleVersion(row: RuleVersionRow): RuleVersionRecord {
    if (!isRuleFileId(row.rule_id)) {
      throw new Error(
        `Invalid rule version rule id in database: ${row.rule_id}`,
      );
    }

    return {
      id: row.id,
      ruleId: row.rule_id,
      version: row.version,
      filePath: row.file_path,
      source: row.source,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}
