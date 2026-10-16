import crypto from "node:crypto";
import path from "node:path";
import type {
  CreateRuleProjectInput,
  RuleBackupRecord,
  RuleFileId,
  RuleRecord,
} from "@prompthub/shared";
import {
  RuleStorageDB,
  type RuleStoragePublication,
} from "@prompthub/core/rule-storage";
import { getServerDatabase } from "../database.js";
import { getRootDir, getUserRulesDir } from "../runtime-paths.js";
import {
  buildRuleStorageGraphs,
  validateRuleBackupRecords,
} from "./rule-storage-plan.js";

export function getRuleRepository(userId: string): RuleStorageDB {
  const rulesRoot = getUserRulesDir(userId);
  const database = getServerDatabase();
  if (!database.get("SELECT id FROM users WHERE id = ?", userId))
    throw new Error("Rule owner does not exist");
  return new RuleStorageDB(database, {
    rootPath: getRootDir(),
    rulesRoot,
    ownerUserId: userId,
  });
}

export function validateRuleWorkspaceSnapshotPaths(
  userId: string,
  records: RuleBackupRecord[],
): void {
  validateRuleBackupRecords(records, getUserRulesDir(userId));
}

function toBackupRecord(
  repository: RuleStorageDB,
  rule: RuleRecord,
): RuleBackupRecord {
  return {
    id: rule.id,
    platformId: rule.platformId,
    platformName: rule.platformName,
    platformIcon: rule.platformIcon,
    platformDescription: rule.platformDescription,
    name: rule.canonicalFileName,
    description: rule.description,
    path: rule.targetPath,
    managedPath: rule.managedPath,
    targetPath: rule.targetPath,
    projectRootPath: rule.projectRootPath,
    syncStatus: rule.syncStatus,
    content: repository.readContent(rule),
    versions: repository.readVersions(rule.id),
  };
}

export function readRuleBackupRecord(
  userId: string,
  id: RuleFileId,
): RuleBackupRecord | null {
  const repository = getRuleRepository(userId),
    rule = repository.getById(id);
  return rule ? toBackupRecord(repository, rule) : null;
}

export function exportRuleBackupRecords(userId: string): RuleBackupRecord[] {
  const repository = getRuleRepository(userId);
  return repository.getAll().map((rule) => toBackupRecord(repository, rule));
}

export function prepareRuleBackupImport(
  userId: string,
  records: RuleBackupRecord[],
): RuleStoragePublication {
  const repository = getRuleRepository(userId);
  return repository.preparePublication(
    buildRuleStorageGraphs(records, repository, getUserRulesDir(userId)),
  );
}

export function importRuleBackupRecords(
  userId: string,
  records: RuleBackupRecord[],
): void {
  const repository = getRuleRepository(userId);
  repository.publishGraphs(
    buildRuleStorageGraphs(records, repository, getUserRulesDir(userId)),
  );
}

export function bootstrapRuleWorkspace(): void {
  // Initialization converts historical files and recovers all Rule publications.
  getServerDatabase();
}

export function createProjectRule(
  userId: string,
  input: CreateRuleProjectInput,
): RuleBackupRecord {
  const name = input.name.trim(),
    rootPath = input.rootPath.trim();
  if (!name || !rootPath)
    throw new Error("Rule project name and rootPath are required");
  const repository = getRuleRepository(userId);
  if (
    repository
      .getAll()
      .some(
        (rule) =>
          rule.scope === "project" &&
          rule.projectRootPath?.toLowerCase() === rootPath.toLowerCase(),
      )
  )
    throw new Error("Rule project root path already exists");
  const id = `project:${input.id ?? crypto.randomUUID()}` as const;
  if (repository.getById(id))
    throw new Error("Rule project identity already exists");
  const record: RuleBackupRecord = {
    id,
    platformId: "workspace",
    platformName: name,
    platformIcon: "FolderRoot",
    platformDescription: `Project rules from ${rootPath}`,
    name: "AGENTS.md",
    description: "Project rule file loaded from a user-managed directory.",
    path: path.join(rootPath, "AGENTS.md"),
    targetPath: path.join(rootPath, "AGENTS.md"),
    projectRootPath: rootPath,
    syncStatus: "target-missing",
    content: "",
    versions: [],
  };
  importRuleBackupRecords(userId, [record]);
  const saved = readRuleBackupRecord(userId, id);
  if (!saved) throw new Error("Rule project was not persisted");
  return saved;
}

export function removeProjectRule(userId: string, projectId: string): void {
  getRuleRepository(userId).delete(`project:${projectId}`);
}
