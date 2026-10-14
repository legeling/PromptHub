import crypto from "crypto";
import fs from "fs";
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
export const RULE_META_FILE_NAME = "_rule.json";
export const RULE_VERSION_INDEX_FILE_NAME = "index.json";
export const RULE_VERSION_STAGING_PREFIX = ".versions-staging-";
const RULE_VERSION_BACKUP_PREFIX = ".versions-backup-";
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

export function ensureDir(targetPath: string): void {
  fs.mkdirSync(targetPath, { recursive: true });
}

export function slugify(input: string | null | undefined): string {
  const normalized = (input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "rule";
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

export async function coalesceInFlight<K, V>(
  pending: Map<K, Promise<V>>,
  key: K,
  create: () => Promise<V>,
): Promise<V> {
  const current = pending.get(key);
  if (current) return current;
  const operation = create();
  pending.set(key, operation);
  try {
    return await operation;
  } finally {
    if (pending.get(key) === operation) pending.delete(key);
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fsp.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJsonFile(
  filePath: string,
  value: unknown,
): Promise<void> {
  await writeTextFileAtomic(filePath, JSON.stringify(value, null, 2));
}

export async function writeTextFileAtomic(
  filePath: string,
  content: string,
): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.rule-write-${crypto.randomUUID()}.tmp`,
  );

  try {
    await fsp.writeFile(tempPath, content, "utf-8");
    await fsp.rename(tempPath, filePath);
  } catch (error) {
    try {
      await fsp.rm(tempPath, { force: true });
    } catch {
      // Best-effort cleanup; preserving the original write error matters most.
    }
    throw error;
  }
}

export async function createSiblingTempDirectory(
  targetDir: string,
  prefix: string,
): Promise<string> {
  await fsp.mkdir(path.dirname(targetDir), { recursive: true });
  return fsp.mkdtemp(path.join(path.dirname(targetDir), prefix));
}

export async function replaceDirectoryAtomic(
  targetDir: string,
  stagingDir: string,
): Promise<void> {
  const backupDir = await createSiblingTempDirectory(
    targetDir,
    RULE_VERSION_BACKUP_PREFIX,
  );
  await fsp.rm(backupDir, { recursive: true, force: true });

  let liveMoved = false;
  try {
    if (await fileExists(targetDir)) {
      await fsp.rename(targetDir, backupDir);
      liveMoved = true;
    }

    await fsp.rename(stagingDir, targetDir);
    try {
      await fsp.rm(backupDir, { recursive: true, force: true });
    } catch {
      // The replacement is already published; stale backup cleanup is best-effort.
    }
  } catch (error) {
    if (
      !(await fileExists(targetDir)) &&
      liveMoved &&
      (await fileExists(backupDir))
    ) {
      await fsp.rename(backupDir, targetDir);
    }
    throw error;
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
