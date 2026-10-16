import { isRuleFileId, isRulePlatformId } from "@prompthub/shared";
import type { RuleBackupRecord, RuleRecord } from "@prompthub/shared";
import {
  getRuleManagedPath,
  type RuleStorageDB,
  type RuleStorageGraph,
} from "@prompthub/core/rule-storage";
import {
  hashContent,
  RULE_VERSION_LIMIT,
} from "@prompthub/core/rules-workspace-support";
import { validateRuleVersionSnapshot } from "@prompthub/core/rule-resource-schema";

export function validateRuleBackupRecords(
  records: RuleBackupRecord[],
  rulesRoot: string,
): void {
  const ids = new Set<string>();
  for (const record of records) {
    if (
      !record ||
      !isRuleFileId(record.id) ||
      !isRulePlatformId(record.platformId) ||
      ids.has(record.id)
    )
      throw new Error(
        "Sync snapshot is invalid: invalid or duplicate Rule identity",
      );
    ids.add(record.id);
    for (const key of [
      "platformName",
      "platformIcon",
      "platformDescription",
      "name",
      "description",
      "path",
      "content",
    ] as const) {
      if (
        typeof record[key] !== "string" ||
        (key !== "content" && record[key].includes("\0"))
      )
        throw new Error(
          `Sync snapshot is invalid: Rule ${key} must be valid text`,
        );
    }
    if (
      (record.targetPath !== undefined &&
        (typeof record.targetPath !== "string" ||
          record.targetPath.includes("\0"))) ||
      (record.projectRootPath != null &&
        (typeof record.projectRootPath !== "string" ||
          record.projectRootPath.includes("\0")))
    )
      throw new Error(
        "Sync snapshot is invalid: Rule project binding is invalid",
      );
    if (
      record.syncStatus !== undefined &&
      !["synced", "target-missing", "out-of-sync", "sync-error"].includes(
        record.syncStatus,
      )
    )
      throw new Error("Sync snapshot is invalid: Rule sync status is invalid");
    try {
      getRuleManagedPath(
        {
          id: record.id,
          scope: record.id.startsWith("project:") ? "project" : "global",
          canonicalFileName: record.name,
        },
        rulesRoot,
      );
    } catch {
      throw new Error("Sync snapshot is invalid: unsafe rule path segment");
    }
    if (!Array.isArray(record.versions))
      throw new Error(
        "Sync snapshot is invalid: Rule versions must be an array",
      );
    const versionIds = new Set<string>();
    for (const version of record.versions) {
      try {
        validateRuleVersionSnapshot(version);
      } catch {
        throw new Error("Sync snapshot is invalid: Rule version is invalid");
      }
      if (versionIds.has(version.id))
        throw new Error(
          "Sync snapshot is invalid: duplicate Rule version identity",
        );
      versionIds.add(version.id);
    }
  }
}

export function buildRuleStorageGraphs(
  records: RuleBackupRecord[],
  repository: RuleStorageDB,
  rulesRoot: string,
  preserveAllHistory = false,
): RuleStorageGraph[] {
  validateRuleBackupRecords(records, rulesRoot);
  return records.map((record) => {
    const existing = repository.getById(record.id);
    const ordered = [...record.versions].sort(
      (a, b) => Date.parse(a.savedAt) - Date.parse(b.savedAt),
    );
    const versions = preserveAllHistory
      ? ordered
      : ordered.slice(-RULE_VERSION_LIMIT);
    const now = new Date().toISOString();
    const rule: RuleRecord = {
      id: record.id,
      scope: record.id.startsWith("project:") ? "project" : "global",
      platformId: record.platformId,
      platformName: record.platformName,
      platformIcon: record.platformIcon,
      platformDescription: record.platformDescription,
      canonicalFileName: record.name,
      description: record.description,
      managedPath: "",
      targetPath: record.targetPath ?? record.path,
      projectRootPath: record.projectRootPath ?? null,
      syncStatus: record.syncStatus ?? "target-missing",
      currentVersion: versions.length,
      contentHash: hashContent(record.content),
      createdAt: existing?.createdAt ?? ordered[0]?.savedAt ?? now,
      updatedAt: now,
    };
    rule.managedPath = getRuleManagedPath(rule, rulesRoot);
    return { rule, content: record.content, versions };
  });
}
