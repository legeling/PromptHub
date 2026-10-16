import crypto from "crypto";
import fsp from "fs/promises";
import path from "path";

import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
import { KNOWN_RULE_FILE_TEMPLATES } from "@prompthub/shared/constants/rules";
import type {
  CreateRuleProjectInput,
  CustomRuleFileId,
  RuleBackupRecord,
  RuleConflictResolutionStrategy,
  RuleFileContent,
  RuleFileDescriptor,
  RuleFileGroup,
  RuleFileId,
  RuleMissingCleanupResult,
  RuleSyncStatus,
  RuleVersionSnapshot,
} from "@prompthub/shared/types";

import type { RuleDB } from "./database";

export const RULE_VERSION_LIMIT = 20;
export const LEGACY_RULE_HISTORY_DIR_NAME = "rule-history";
export const SAFE_PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

export type ProjectRuleId = `project:${string}`;

export interface StoredRuleMeta {
  id: RuleFileId;
  scope: "global" | "project";
  platformId: RuleFileDescriptor["platformId"];
  platformName: string;
  platformIcon: string;
  platformDescription: string;
  canonicalFileName: string;
  description: string;
  managedPath: string;
  targetPath: string;
  projectRootPath?: string | null;
  syncStatus?: RuleSyncStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StoredRuleVersionIndexEntry {
  id: string;
  savedAt: string;
  source: RuleVersionSnapshot["source"];
  fileName: string;
}

export interface RuleSyncInspection {
  exists: boolean;
  syncStatus: RuleSyncStatus;
}

export interface ImportRuleBackupRecordsOptions {
  replace?: boolean;
}

export interface ExtraGlobalRuleTemplate {
  id: CustomRuleFileId;
  platformId: RuleFileDescriptor["platformId"];
  platformName: string;
  platformIcon: string;
  platformDescription: string;
  name: string;
  description: string;
  group: RuleFileGroup;
}

export interface RulesWorkspaceServiceDeps {
  getRulesDir: () => string;
  assertStorageAvailable?: () => void;
  createRuleDb: () => RuleDB;
  getPlatformGlobalRulePath: (platform: SkillPlatform) => string | null;
  getPlatformRootDir: (platform: SkillPlatform) => string;
  getExtraGlobalRuleTemplates?: () => ExtraGlobalRuleTemplate[];
  getExtraGlobalRuleTargetPath?: (template: ExtraGlobalRuleTemplate) => string;
}

export interface RulesWorkspaceService {
  listRuleDescriptors: () => Promise<RuleFileDescriptor[]>;
  listCachedRuleDescriptors: () => Promise<RuleFileDescriptor[]>;
  scanRuleDescriptors: () => Promise<RuleFileDescriptor[]>;
  getProjectMetaById: (ruleId: ProjectRuleId) => Promise<StoredRuleMeta | null>;
  resolveRuleMeta: (ruleId: RuleFileId) => Promise<StoredRuleMeta>;
  readRuleContent: (ruleId: RuleFileId) => Promise<RuleFileContent>;
  saveRuleContent: (
    ruleId: RuleFileId,
    content: string,
  ) => Promise<RuleFileContent>;
  resolveRuleConflict: (
    ruleId: RuleFileId,
    strategy: RuleConflictResolutionStrategy,
  ) => Promise<RuleFileContent>;
  deleteRuleVersion: (
    ruleId: RuleFileId,
    versionId: string,
  ) => Promise<RuleVersionSnapshot[]>;
  createProjectRule: (
    input: CreateRuleProjectInput,
  ) => Promise<RuleFileDescriptor>;
  bootstrapRuleWorkspace: () => Promise<void>;
  removeProjectRule: (projectId: string) => Promise<void>;
  removeMissingProjectRules: (
    ruleIds: string[],
  ) => Promise<RuleMissingCleanupResult>;
  exportRuleBackupRecords: () => Promise<RuleBackupRecord[]>;
  importRuleBackupRecords: (
    records: RuleBackupRecord[],
    options?: ImportRuleBackupRecordsOptions,
  ) => Promise<void>;
}

export function isProjectRuleFileId(
  ruleId: RuleFileId,
): ruleId is ProjectRuleId {
  return ruleId.startsWith("project:");
}

export function isCustomRuleFileId(
  ruleId: RuleFileId,
): ruleId is CustomRuleFileId {
  return ruleId.startsWith("custom:");
}

export function assertSafeProjectId(projectId: string): void {
  if (!SAFE_PROJECT_ID_PATTERN.test(projectId)) {
    throw new Error(
      "Invalid rule project id: project id contains unsafe characters",
    );
  }
}

export function pathsEqual(left: string, right: string): boolean {
  const normalize = (value: string) => {
    const resolved = path.normalize(path.resolve(value));
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

export function encodeRuleId(ruleId: RuleFileId): string {
  return encodeURIComponent(ruleId);
}

export function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function hasErrorCode(value: unknown): value is { code?: unknown } {
  return typeof value === "object" && value !== null && "code" in value;
}

export function resolveDisplayedRuleFileName(
  canonicalFileName: string,
  targetPath: string,
): string {
  const targetFileName = path.basename(targetPath);
  return targetFileName || canonicalFileName;
}

export function getErrorCode(error: unknown): string | undefined {
  if (!hasErrorCode(error)) {
    return undefined;
  }

  const code = error.code;
  return typeof code === "string" ? code : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeRuleVersionSource(
  value: unknown,
): RuleVersionSnapshot["source"] {
  if (value === "create" || value === "manual-save" || value === "ai-rewrite") {
    return value;
  }

  if (typeof value === "string" && value.toLowerCase().includes("rewrite")) {
    return "ai-rewrite";
  }

  return "manual-save";
}

export function normalizeLegacySavedAt(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  return null;
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function ruleGroupForKnownId(ruleId: RuleFileId): RuleFileGroup {
  if (isProjectRuleFileId(ruleId)) {
    return "workspace";
  }

  if (isCustomRuleFileId(ruleId)) {
    return "assistant";
  }

  return KNOWN_RULE_FILE_TEMPLATES[ruleId].group;
}
