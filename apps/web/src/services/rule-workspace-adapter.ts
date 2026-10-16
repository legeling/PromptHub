import crypto from "node:crypto";
import { RULE_VERSION_LIMIT } from "@prompthub/core/rules-workspace-support";
import type {
  RuleBackupRecord,
  RuleFileContent,
  RuleFileId,
  RuleVersionSnapshot,
} from "@prompthub/shared";
import {
  createProjectRule,
  exportRuleBackupRecords,
  importRuleBackupRecords,
  removeProjectRule,
  readRuleBackupRecord,
} from "./rule-workspace.js";

function getRuleRecord(
  userId: string,
  ruleId: RuleFileId,
): RuleBackupRecord | null {
  return readRuleBackupRecord(userId, ruleId);
}

export function saveRuleContent(
  userId: string,
  ruleId: RuleFileId,
  content: string,
): RuleFileContent {
  const record = getRuleRecord(userId, ruleId);
  if (!record) {
    throw new Error(`Rule not found: ${ruleId}`);
  }

  const nextVersions: RuleVersionSnapshot[] = [
    {
      id: crypto.randomUUID(),
      savedAt: new Date().toISOString(),
      source: record.content.trim().length > 0 ? "manual-save" : "create",
      content,
    } satisfies RuleVersionSnapshot,
    ...record.versions,
  ].slice(0, RULE_VERSION_LIMIT);

  importRuleBackupRecords(userId, [
    {
      ...record,
      content,
      versions: nextVersions,
    },
  ]);

  const updated = getRuleRecord(userId, ruleId);
  if (!updated) {
    throw new Error(`Rule not found after save: ${ruleId}`);
  }

  return {
    id: updated.id,
    platformId: updated.platformId,
    platformName: updated.platformName,
    platformIcon: updated.platformIcon,
    platformDescription: updated.platformDescription,
    name: updated.name,
    description: updated.description,
    path: updated.targetPath || updated.path,
    exists: true,
    group: updated.id.startsWith("project:") ? "workspace" : "assistant",
    managedPath: updated.managedPath,
    targetPath: updated.targetPath,
    projectRootPath: updated.projectRootPath ?? null,
    syncStatus: updated.syncStatus,
    content: updated.content,
    versions: updated.versions,
  };
}

export function readRuleVersions(
  userId: string,
  ruleId: RuleFileId,
): RuleVersionSnapshot[] {
  return getRuleRecord(userId, ruleId)?.versions ?? [];
}

export function removeRuleVersion(
  userId: string,
  ruleId: RuleFileId,
  versionId: string,
): RuleVersionSnapshot[] {
  const record = getRuleRecord(userId, ruleId);
  if (!record) {
    return [];
  }

  const nextVersions = record.versions.filter(
    (version) => version.id !== versionId,
  );
  importRuleBackupRecords(userId, [
    {
      ...record,
      versions: nextVersions,
    },
  ]);

  return getRuleRecord(userId, ruleId)?.versions ?? [];
}

export {
  createProjectRule,
  exportRuleBackupRecords,
  importRuleBackupRecords,
  removeProjectRule,
  readRuleBackupRecord,
};
