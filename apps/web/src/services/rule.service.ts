import { readRuleBackupRecord } from './rule-workspace.js';
import type {
  CreateRuleProjectInput,
  RuleFileContent,
  RuleFileDescriptor,
  RuleFileId,
  RuleVersionSnapshot,
} from '@prompthub/shared';
import {
  createProjectRule as createWorkspaceProjectRule,
  exportRuleBackupRecords,
  importRuleBackupRecords,
  readRuleVersions as readWorkspaceRuleVersions,
  removeProjectRule as removeWorkspaceProjectRule,
  removeRuleVersion as removeWorkspaceRuleVersion,
  saveRuleContent as saveWorkspaceRuleContent,
} from './rule-workspace-adapter.js';

function toRuleDescriptor(record: ReturnType<typeof exportRuleBackupRecords>[number]): RuleFileDescriptor {
  return {
    id: record.id,
    platformId: record.platformId,
    platformName: record.platformName,
    platformIcon: record.platformIcon,
    platformDescription: record.platformDescription,
    name: record.name,
    description: record.description,
    path: record.targetPath || record.path,
    exists: true,
    group: record.id.startsWith('project:') ? 'workspace' : 'assistant',
    managedPath: record.managedPath,
    targetPath: record.targetPath,
    projectRootPath: record.projectRootPath ?? null,
    syncStatus: record.syncStatus,
  };
}

export function readRuleContent(userId: string, ruleId: RuleFileId): RuleFileContent | null {
  const record = readRuleBackupRecord(userId,ruleId);
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    platformId: record.platformId,
    platformName: record.platformName,
    platformIcon: record.platformIcon,
    platformDescription: record.platformDescription,
    name: record.name,
    description: record.description,
    path: record.targetPath || record.path,
    exists: true,
    group: record.id.startsWith('project:') ? 'workspace' : 'assistant',
    managedPath: record.managedPath,
    targetPath: record.targetPath,
    projectRootPath: record.projectRootPath ?? null,
    syncStatus: record.syncStatus,
    content: record.content,
    versions: record.versions,
  };
}

export function saveRuleContent(
  userId: string,
  ruleId: RuleFileId,
  content: string,
): RuleFileContent {
  return saveWorkspaceRuleContent(userId, ruleId, content);
}

export function readRuleVersions(userId: string, ruleId: RuleFileId): RuleVersionSnapshot[] {
  return readWorkspaceRuleVersions(userId, ruleId);
}

export function removeRuleVersion(
  userId: string,
  ruleId: RuleFileId,
  versionId: string,
): RuleVersionSnapshot[] {
  return removeWorkspaceRuleVersion(userId, ruleId, versionId);
}

export function createProjectRule(
  userId: string,
  input: CreateRuleProjectInput,
): RuleFileDescriptor {
  return toRuleDescriptor(createWorkspaceProjectRule(userId, input));
}

export function removeProjectRule(userId: string, projectId: string): void {
  removeWorkspaceProjectRule(userId, projectId);
}

export { exportRuleBackupRecords, importRuleBackupRecords };
