import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";

import {
  getPlatformById,
  type SkillPlatform,
} from "@prompthub/shared/constants/platforms";
import { KNOWN_RULE_FILE_TEMPLATES } from "@prompthub/shared/constants/rules";
import type {
  CustomRuleFileId,
  CreateRuleProjectInput,
  KnownRuleFileId,
  RuleBackupRecord,
  RuleConflictResolutionStrategy,
  RuleFileContent,
  RuleFileDescriptor,
  RuleFileGroup,
  RuleFileId,
  RuleRecord,
  RuleSyncStatus,
  RuleVersionRecord,
  RuleVersionSnapshot,
} from "@prompthub/shared/types";

import { initDatabase, RuleDB } from "./database";
import {
  getDefaultPlatformGlobalRulePath,
  getDefaultPlatformRootDir,
} from "./platform-paths";
import { getRulesDir } from "./runtime-paths";

const RULE_VERSION_LIMIT = 20;
const RULE_META_FILE_NAME = "_rule.json";
const RULE_VERSION_INDEX_FILE_NAME = "index.json";
const RULE_VERSION_STAGING_PREFIX = ".versions-staging-";
const RULE_VERSION_BACKUP_PREFIX = ".versions-backup-";
const LEGACY_RULE_HISTORY_DIR_NAME = "rule-history";
const SAFE_PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

type ProjectRuleId = `project:${string}`;

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

interface AppendRuleVersionResult {
  index: StoredRuleVersionIndexEntry[];
  versions: RuleVersionSnapshot[];
}

interface ReadRuleVersionsResult {
  index: StoredRuleVersionIndexEntry[];
  versions: RuleVersionSnapshot[];
  repaired: boolean;
}

interface StoredRuleMeta {
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

interface StoredRuleVersionIndexEntry {
  id: string;
  savedAt: string;
  source: RuleVersionSnapshot["source"];
  fileName: string;
}

interface ImportRuleBackupRecordsOptions {
  replace?: boolean;
}

export interface RulesWorkspaceServiceDeps {
  getRulesDir: () => string;
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
  saveRuleContent: (ruleId: RuleFileId, content: string) => Promise<RuleFileContent>;
  resolveRuleConflict: (
    ruleId: RuleFileId,
    strategy: RuleConflictResolutionStrategy,
  ) => Promise<RuleFileContent>;
  deleteRuleVersion: (ruleId: RuleFileId, versionId: string) => Promise<RuleVersionSnapshot[]>;
  createProjectRule: (input: CreateRuleProjectInput) => Promise<RuleFileDescriptor>;
  bootstrapRuleWorkspace: () => Promise<void>;
  removeProjectRule: (projectId: string) => Promise<void>;
  exportRuleBackupRecords: () => Promise<RuleBackupRecord[]>;
  importRuleBackupRecords: (
    records: RuleBackupRecord[],
    options?: ImportRuleBackupRecordsOptions,
  ) => Promise<void>;
}

function isProjectRuleFileId(ruleId: RuleFileId): ruleId is ProjectRuleId {
  return ruleId.startsWith("project:");
}

function isCustomRuleFileId(ruleId: RuleFileId): ruleId is CustomRuleFileId {
  return ruleId.startsWith("custom:");
}

function assertSafeProjectId(projectId: string): void {
  if (!SAFE_PROJECT_ID_PATTERN.test(projectId)) {
    throw new Error("Invalid rule project id: project id contains unsafe characters");
  }
}

function ensureDir(targetPath: string): void {
  fs.mkdirSync(targetPath, { recursive: true });
}

function slugify(input: string | null | undefined): string {
  const normalized = (input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "rule";
}

function encodeRuleId(ruleId: RuleFileId): string {
  return encodeURIComponent(ruleId);
}

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function hasErrorCode(value: unknown): value is { code?: unknown } {
  return typeof value === "object" && value !== null && "code" in value;
}

function resolveDisplayedRuleFileName(
  canonicalFileName: string,
  targetPath: string,
): string {
  const targetFileName = path.basename(targetPath);
  return targetFileName || canonicalFileName;
}

function getErrorCode(error: unknown): string | undefined {
  if (!hasErrorCode(error)) {
    return undefined;
  }

  const code = error.code;
  return typeof code === "string" ? code : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRuleVersionSource(value: unknown): RuleVersionSnapshot["source"] {
  if (value === "create" || value === "manual-save" || value === "ai-rewrite") {
    return value;
  }

  if (typeof value === "string" && value.toLowerCase().includes("rewrite")) {
    return "ai-rewrite";
  }

  return "manual-save";
}

function normalizeLegacySavedAt(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  return null;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fsp.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeTextFileAtomic(filePath, JSON.stringify(value, null, 2));
}

async function writeTextFileAtomic(filePath: string, content: string): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`,
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

async function createSiblingTempDirectory(targetDir: string, prefix: string): Promise<string> {
  await fsp.mkdir(path.dirname(targetDir), { recursive: true });
  return fsp.mkdtemp(path.join(path.dirname(targetDir), prefix));
}

async function replaceDirectoryAtomic(targetDir: string, stagingDir: string): Promise<void> {
  const backupDir = await createSiblingTempDirectory(targetDir, RULE_VERSION_BACKUP_PREFIX);
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
    if (!(await fileExists(targetDir)) && liveMoved && (await fileExists(backupDir))) {
      await fsp.rename(backupDir, targetDir);
    }
    throw error;
  }
}

function ruleGroupForKnownId(ruleId: RuleFileId): RuleFileGroup {
  if (isProjectRuleFileId(ruleId)) {
    return "workspace";
  }

  if (isCustomRuleFileId(ruleId)) {
    return "assistant";
  }

  return KNOWN_RULE_FILE_TEMPLATES[ruleId].group;
}

export function createRulesWorkspaceService(
  deps: RulesWorkspaceServiceDeps,
): RulesWorkspaceService {
  const pendingRuleVersionWrites = new Map<RuleFileId, Promise<AppendRuleVersionResult>>();

  function getAllGlobalRuleTemplates(): Array<
    | (typeof KNOWN_RULE_FILE_TEMPLATES)[KnownRuleFileId]
    | ExtraGlobalRuleTemplate
  > {
    return [
      ...Object.values(KNOWN_RULE_FILE_TEMPLATES),
      ...(deps.getExtraGlobalRuleTemplates?.() ?? []),
    ];
  }

  function getActiveCustomRuleIds(): Set<CustomRuleFileId> {
    return new Set(
      (deps.getExtraGlobalRuleTemplates?.() ?? []).map((template) => template.id),
    );
  }

  function getRuleDb(): RuleDB {
    return deps.createRuleDb();
  }

  function getRuleProjectsRoot(): string {
    return path.join(deps.getRulesDir(), "projects");
  }

  function getRuleVersionsRoot(): string {
    return path.join(deps.getRulesDir(), ".versions");
  }

  function getRuleVersionsDir(ruleId: RuleFileId): string {
    return path.join(getRuleVersionsRoot(), encodeRuleId(ruleId));
  }

  function getRuleVersionIndexPath(ruleId: RuleFileId): string {
    return path.join(getRuleVersionsDir(ruleId), RULE_VERSION_INDEX_FILE_NAME);
  }

  function getLegacyRuleHistoryDir(): string {
    return path.join(
      path.dirname(path.dirname(deps.getRulesDir())),
      LEGACY_RULE_HISTORY_DIR_NAME,
    );
  }

  function getLegacyRuleHistoryCandidateFiles(ruleId: RuleFileId): string[] {
    const legacyDir = getLegacyRuleHistoryDir();
    const safeRuleId = ruleId.replace(/[^A-Za-z0-9._-]+/gu, "_");
    return Array.from(
      new Set([
        path.join(legacyDir, `${ruleId}.json`),
        path.join(legacyDir, `${encodeRuleId(ruleId)}.json`),
        path.join(legacyDir, `${safeRuleId}.json`),
      ]),
    );
  }

  function getRuleMetaPath(managedPath: string): string {
    return path.join(path.dirname(managedPath), RULE_META_FILE_NAME);
  }

  function getManagedPlatformRulePath(ruleId: KnownRuleFileId): string {
    const template = KNOWN_RULE_FILE_TEMPLATES[ruleId];
    const platform = getPlatformById(template.platformId);
    if (!platform) {
      throw new Error(`Unknown rules platform: ${template.platformId}`);
    }

    const rulePath = deps.getPlatformGlobalRulePath(platform);
    if (!rulePath) {
      throw new Error(`Rules file path is not defined for platform: ${template.platformId}`);
    }

    return rulePath;
  }

  function getManagedCustomRulePath(template: ExtraGlobalRuleTemplate): string {
    return path.join(deps.getRulesDir(), "global", template.platformId, template.name);
  }

  function getManagedCopyPathForGlobal(ruleId: KnownRuleFileId): string {
    const template = KNOWN_RULE_FILE_TEMPLATES[ruleId];
    return path.join(deps.getRulesDir(), "global", template.platformId, template.name);
  }

  function buildGlobalMeta(ruleId: KnownRuleFileId): StoredRuleMeta {
    const template = KNOWN_RULE_FILE_TEMPLATES[ruleId];
    return {
      id: ruleId,
      scope: "global",
      platformId: template.platformId,
      platformName: template.platformName,
      platformIcon: template.platformIcon,
      platformDescription: template.platformDescription,
      canonicalFileName: template.name,
      description: template.description,
      managedPath: getManagedCopyPathForGlobal(ruleId),
      targetPath: getManagedPlatformRulePath(ruleId),
      syncStatus: "target-missing",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function buildCustomGlobalMeta(template: ExtraGlobalRuleTemplate): StoredRuleMeta {
    const targetPath =
      deps.getExtraGlobalRuleTargetPath?.(template) ??
      getManagedCustomRulePath(template);
    return {
      id: template.id,
      scope: "global",
      platformId: template.platformId,
      platformName: template.platformName,
      platformIcon: template.platformIcon,
      platformDescription: template.platformDescription,
      canonicalFileName: template.name,
      description: template.description,
      managedPath: getManagedCustomRulePath(template),
      targetPath,
      syncStatus: "target-missing",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async function readVersionIndex(ruleId: RuleFileId): Promise<StoredRuleVersionIndexEntry[]> {
    return (await readJsonFile<StoredRuleVersionIndexEntry[]>(getRuleVersionIndexPath(ruleId))) ?? [];
  }

  async function writeVersionIndex(
    ruleId: RuleFileId,
    index: StoredRuleVersionIndexEntry[],
  ): Promise<void> {
    await writeJsonFile(getRuleVersionIndexPath(ruleId), index);
  }

  function getVersionSequenceFromFileName(fileName: string): number {
    const match = fileName.match(/^(\d+)\.md$/);
    if (!match) {
      return 0;
    }

    return Number.parseInt(match[1], 10) || 0;
  }

  function getNextVersionSequence(index: StoredRuleVersionIndexEntry[]): number {
    const highestExistingSequence = index.reduce((highest, entry) => {
      return Math.max(highest, getVersionSequenceFromFileName(entry.fileName));
    }, 0);

    return highestExistingSequence + 1;
  }

  async function readRuleVersionsFromIndex(
    ruleId: RuleFileId,
    index: StoredRuleVersionIndexEntry[],
  ): Promise<ReadRuleVersionsResult> {
    const versionDir = getRuleVersionsDir(ruleId);
    const nextIndex: StoredRuleVersionIndexEntry[] = [];
    const versions: RuleVersionSnapshot[] = [];
    let repaired = false;

    for (const entry of index) {
      try {
        const content = await fsp.readFile(path.join(versionDir, entry.fileName), "utf-8");
        nextIndex.push(entry);
        versions.push({
          id: entry.id,
          savedAt: entry.savedAt,
          source: entry.source,
          content,
        } satisfies RuleVersionSnapshot);
      } catch (error) {
        if (getErrorCode(error) === "ENOENT") {
          repaired = true;
          continue;
        }

        throw error;
      }
    }

    return {
      index: nextIndex,
      versions,
      repaired,
    };
  }

  async function readRuleVersions(ruleId: RuleFileId): Promise<ReadRuleVersionsResult> {
    const index = await readVersionIndex(ruleId);
    const result = await readRuleVersionsFromIndex(ruleId, index);
    if (result.repaired) {
      await writeVersionIndex(ruleId, result.index);
    }

    return result;
  }

  function collectLegacyHistoryValues(
    value: unknown,
    ruleId: RuleFileId,
    allowUnscoped: boolean,
  ): unknown[] {
    if (Array.isArray(value)) {
      return value.flatMap((entry) => collectLegacyHistoryValues(entry, ruleId, allowUnscoped));
    }

    if (!isRecord(value)) {
      return [];
    }

    const scopedValue =
      value[ruleId] ??
      value[encodeRuleId(ruleId)] ??
      value[ruleId.replace(/[^A-Za-z0-9._-]+/gu, "_")];
    if (scopedValue !== undefined) {
      return collectLegacyHistoryValues(scopedValue, ruleId, true);
    }

    const declaredRuleId =
      typeof value.ruleId === "string"
        ? value.ruleId
        : typeof value.fileId === "string"
          ? value.fileId
          : typeof value.ruleFileId === "string"
            ? value.ruleFileId
            : undefined;
    const scoped = declaredRuleId === ruleId;

    if (Array.isArray(value.versions)) {
      return allowUnscoped || scoped
        ? value.versions.flatMap((entry) => collectLegacyHistoryValues(entry, ruleId, true))
        : [];
    }

    if (typeof value.content === "string" && (allowUnscoped || scoped)) {
      return [value];
    }

    return [];
  }

  function normalizeLegacyHistoryVersion(
    ruleId: RuleFileId,
    value: unknown,
  ): RuleVersionSnapshot | null {
    if (!isRecord(value) || typeof value.content !== "string") {
      return null;
    }

    const savedAt =
      normalizeLegacySavedAt(value.savedAt) ??
      normalizeLegacySavedAt(value.createdAt) ??
      normalizeLegacySavedAt(value.updatedAt) ??
      normalizeLegacySavedAt(value.timestamp) ??
      normalizeLegacySavedAt(value.date);
    if (!savedAt) {
      return null;
    }

    const id = typeof value.id === "string" && value.id.trim()
      ? value.id
      : `legacy-${hashContent(`${ruleId}\n${savedAt}\n${value.content}`).slice(0, 16)}`;

    return {
      id,
      savedAt,
      content: value.content,
      source: normalizeRuleVersionSource(value.source),
    };
  }

  async function readLegacyRuleHistoryVersions(ruleId: RuleFileId): Promise<RuleVersionSnapshot[]> {
    const legacyDir = getLegacyRuleHistoryDir();
    if (!(await fileExists(legacyDir))) {
      return [];
    }

    const versions: RuleVersionSnapshot[] = [];
    const seen = new Set<string>();
    const addVersions = (raw: unknown[], targetRuleId: RuleFileId) => {
      for (const item of raw) {
        const version = normalizeLegacyHistoryVersion(targetRuleId, item);
        if (!version) {
          continue;
        }
        const key = `${version.savedAt}\n${version.content}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        versions.push(version);
      }
    };

    const candidateFiles = getLegacyRuleHistoryCandidateFiles(ruleId);
    for (const filePath of candidateFiles) {
      const payload = await readJsonFile<unknown>(filePath);
      if (payload !== null) {
        addVersions(collectLegacyHistoryValues(payload, ruleId, true), ruleId);
      }
    }

    const candidateSet = new Set(candidateFiles.map((filePath) => path.resolve(filePath)));
    const entries = await fsp.readdir(legacyDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) {
        continue;
      }
      const filePath = path.join(legacyDir, entry.name);
      if (candidateSet.has(path.resolve(filePath))) {
        continue;
      }
      const payload = await readJsonFile<unknown>(filePath);
      if (payload !== null) {
        addVersions(collectLegacyHistoryValues(payload, ruleId, false), ruleId);
      }
    }

    return versions.sort(
      (left, right) => new Date(right.savedAt).getTime() - new Date(left.savedAt).getTime(),
    );
  }

  function mergeImportedContentWithLegacyVersions(
    ruleId: RuleFileId,
    importedContent: string | null,
    legacyVersions: RuleVersionSnapshot[],
  ): RuleVersionSnapshot[] {
    const versions = [...legacyVersions];
    if (
      typeof importedContent === "string" &&
      importedContent.trim() &&
      !versions.some((version) => version.content === importedContent)
    ) {
      versions.push({
        id: `${encodeRuleId(ruleId)}-initial-import`,
        savedAt: new Date().toISOString(),
        content: importedContent,
        source: "create",
      });
    }

    return versions;
  }

  async function replaceRuleVersions(
    ruleId: RuleFileId,
    versions: RuleVersionSnapshot[],
  ): Promise<StoredRuleVersionIndexEntry[]> {
    const versionDir = getRuleVersionsDir(ruleId);
    const stagingDir = await createSiblingTempDirectory(versionDir, RULE_VERSION_STAGING_PREFIX);

    const orderedVersions = [...versions]
      .sort((left, right) => new Date(left.savedAt).getTime() - new Date(right.savedAt).getTime())
      .slice(-RULE_VERSION_LIMIT);

    try {
      const index: StoredRuleVersionIndexEntry[] = [];
      for (const [indexPosition, version] of orderedVersions.entries()) {
        const fileName = `${String(indexPosition + 1).padStart(4, "0")}.md`;
        await writeTextFileAtomic(path.join(stagingDir, fileName), version.content);
        index.unshift({
          id: version.id,
          savedAt: version.savedAt,
          source: version.source,
          fileName,
        });
      }

      await writeJsonFile(path.join(stagingDir, RULE_VERSION_INDEX_FILE_NAME), index);
      await replaceDirectoryAtomic(versionDir, stagingDir);
      return index;
    } catch (error) {
      await fsp.rm(stagingDir, { recursive: true, force: true });
      throw error;
    }
  }

  async function initializeRuleVersionsIfEmpty(
    ruleId: RuleFileId,
    versions: RuleVersionSnapshot[],
  ): Promise<AppendRuleVersionResult> {
    const previousWrite =
      pendingRuleVersionWrites.get(ruleId) ??
      Promise.resolve<AppendRuleVersionResult>({
        index: [],
        versions: [],
      });

    const nextWrite = previousWrite.then(async () => {
      const existing = await readRuleVersions(ruleId);
      if (existing.index.length > 0) {
        return {
          index: existing.index,
          versions: existing.versions,
        };
      }

      const index = await replaceRuleVersions(ruleId, versions);
      const restored = await readRuleVersionsFromIndex(ruleId, index);
      return {
        index,
        versions: restored.versions,
      };
    });

    pendingRuleVersionWrites.set(ruleId, nextWrite);
    try {
      return await nextWrite;
    } finally {
      if (pendingRuleVersionWrites.get(ruleId) === nextWrite) {
        pendingRuleVersionWrites.delete(ruleId);
      }
    }
  }

  async function appendRuleVersion(
    ruleId: RuleFileId,
    content: string,
    source: RuleVersionSnapshot["source"],
  ): Promise<AppendRuleVersionResult> {
    const previousWrite =
      pendingRuleVersionWrites.get(ruleId) ??
      Promise.resolve<AppendRuleVersionResult>({
        index: [],
        versions: [],
      });

    const nextWrite = previousWrite.then(async () => {
      const { index: previousIndex, versions: current } = await readRuleVersions(ruleId);
      if (current[0]?.content === content) {
        return {
          index: previousIndex,
          versions: current,
        };
      }

      const versionDir = getRuleVersionsDir(ruleId);
      ensureDir(versionDir);
      const versionSequence = getNextVersionSequence(previousIndex);
      const fileName = `${String(versionSequence).padStart(4, "0")}.md`;
      const nextVersion: RuleVersionSnapshot = {
        id: `${encodeRuleId(ruleId)}-${Date.now()}`,
        savedAt: new Date().toISOString(),
        content,
        source,
      };

      await writeTextFileAtomic(path.join(versionDir, fileName), content);

      const nextIndex: StoredRuleVersionIndexEntry[] = [
        {
          id: nextVersion.id,
          savedAt: nextVersion.savedAt,
          source: nextVersion.source,
          fileName,
        },
        ...previousIndex,
      ].slice(0, RULE_VERSION_LIMIT);

      const staleEntries = previousIndex.slice(RULE_VERSION_LIMIT - 1);
      await writeVersionIndex(ruleId, nextIndex);

      await Promise.all(
        staleEntries.map(async (entry) => {
          try {
            await fsp.rm(path.join(versionDir, entry.fileName), { force: true });
          } catch {
            return;
          }
        }),
      );

      return {
        index: nextIndex,
        versions: [nextVersion, ...current].slice(0, RULE_VERSION_LIMIT),
      };
    });

    pendingRuleVersionWrites.set(ruleId, nextWrite);

    try {
      return await nextWrite;
    } finally {
      if (pendingRuleVersionWrites.get(ruleId) === nextWrite) {
        pendingRuleVersionWrites.delete(ruleId);
      }
    }
  }

  async function writeManagedRule(meta: StoredRuleMeta, content: string): Promise<void> {
    await writeTextFileAtomic(meta.managedPath, content);
  }

  async function writeTargetRule(meta: StoredRuleMeta, content: string): Promise<RuleSyncStatus> {
    try {
      await fsp.mkdir(path.dirname(meta.targetPath), { recursive: true });
      await fsp.writeFile(meta.targetPath, content, "utf-8");
      return "synced";
    } catch {
      return "sync-error";
    }
  }

  async function readStoredMeta(metaPath: string): Promise<StoredRuleMeta | null> {
    return readJsonFile<StoredRuleMeta>(metaPath);
  }

  async function writeMeta(meta: StoredRuleMeta): Promise<void> {
    await writeJsonFile(getRuleMetaPath(meta.managedPath), meta);
  }

  async function syncStatusForMeta(meta: StoredRuleMeta): Promise<RuleSyncStatus> {
    if (!(await fileExists(meta.targetPath))) {
      return "target-missing";
    }

    try {
      const managedExists = await fileExists(meta.managedPath);
      const [managedContent, targetContent] = await Promise.all([
        managedExists ? fsp.readFile(meta.managedPath, "utf-8") : Promise.resolve(""),
        fsp.readFile(meta.targetPath, "utf-8"),
      ]);

      return hashContent(managedContent) === hashContent(targetContent)
        ? "synced"
        : "out-of-sync";
    } catch {
      return "sync-error";
    }
  }

  async function buildDescriptor(meta: StoredRuleMeta): Promise<RuleFileDescriptor> {
    const exists = await fileExists(meta.targetPath);
    return {
      id: meta.id,
      platformId: meta.platformId,
      platformName: meta.platformName,
      platformIcon: meta.platformIcon,
      platformDescription: meta.platformDescription,
      name: resolveDisplayedRuleFileName(meta.canonicalFileName, meta.targetPath),
      description: meta.description,
      path: meta.targetPath,
      targetPath: meta.targetPath,
      managedPath: meta.managedPath,
      projectRootPath: meta.projectRootPath ?? null,
      exists,
      group: meta.scope === "project" ? "workspace" : ruleGroupForKnownId(meta.id),
      syncStatus: await syncStatusForMeta(meta),
    };
  }

  function descriptorFromRuleRecord(record: RuleRecord): RuleFileDescriptor {
    return {
      id: record.id,
      platformId: record.platformId,
      platformName: record.platformName,
      platformIcon: record.platformIcon,
      platformDescription: record.platformDescription,
      name: resolveDisplayedRuleFileName(record.canonicalFileName, record.targetPath),
      description: record.description,
      path: record.targetPath,
      targetPath: record.targetPath,
      managedPath: record.managedPath,
      projectRootPath: record.projectRootPath ?? null,
      exists: record.syncStatus !== "target-missing",
      group: record.scope === "project" ? "workspace" : ruleGroupForKnownId(record.id),
      syncStatus: record.syncStatus,
    };
  }

  function metaFromRuleRecord(record: RuleRecord): StoredRuleMeta {
    return {
      id: record.id,
      scope: record.scope,
      platformId: record.platformId,
      platformName: record.platformName,
      platformIcon: record.platformIcon,
      platformDescription: record.platformDescription,
      canonicalFileName: record.canonicalFileName,
      description: record.description,
      managedPath: record.managedPath,
      targetPath: record.targetPath,
      projectRootPath: record.projectRootPath ?? null,
      syncStatus: record.syncStatus,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  function toRuleRecord(meta: StoredRuleMeta, currentVersion: number, contentHash: string): RuleRecord {
    return {
      id: meta.id,
      scope: meta.scope,
      platformId: meta.platformId,
      platformName: meta.platformName,
      platformIcon: meta.platformIcon,
      platformDescription: meta.platformDescription,
      canonicalFileName: meta.canonicalFileName,
      description: meta.description,
      managedPath: meta.managedPath,
      targetPath: meta.targetPath,
      projectRootPath: meta.projectRootPath ?? null,
      syncStatus: meta.syncStatus ?? "target-missing",
      currentVersion,
      contentHash,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    };
  }

  function toRuleVersionRecords(
    ruleId: RuleFileId,
    index: StoredRuleVersionIndexEntry[],
  ): RuleVersionRecord[] {
    return index.map((entry, indexPosition) => ({
      id: entry.id,
      ruleId,
      version: index.length - indexPosition,
      filePath: path.join(getRuleVersionsDir(ruleId), entry.fileName),
      source: entry.source,
      createdAt: entry.savedAt,
    }));
  }

  async function syncRuleIndex(meta: StoredRuleMeta): Promise<void> {
    const db = getRuleDb();
    const content = (await fileExists(meta.managedPath))
      ? await fsp.readFile(meta.managedPath, "utf-8")
      : "";
    const versionRead = await readRuleVersions(meta.id);
    db.upsert(toRuleRecord(meta, versionRead.index.length, hashContent(content)));
    db.replaceVersions(meta.id, toRuleVersionRecords(meta.id, versionRead.index));
  }

  async function syncRuleIndexWithData(
    meta: StoredRuleMeta,
    content: string,
    versionIndex: StoredRuleVersionIndexEntry[],
  ): Promise<void> {
    const db = getRuleDb();
    db.upsert(toRuleRecord(meta, versionIndex.length, hashContent(content)));
    db.replaceVersions(meta.id, toRuleVersionRecords(meta.id, versionIndex));
  }

  async function ensureGlobalRuleMaterialized(
    ruleId: KnownRuleFileId | CustomRuleFileId,
  ): Promise<StoredRuleMeta> {
    const customTemplate = deps
      .getExtraGlobalRuleTemplates?.()
      .find((template) => template.id === ruleId);
    const baseMeta = customTemplate
      ? buildCustomGlobalMeta(customTemplate)
      : buildGlobalMeta(ruleId as KnownRuleFileId);
    const metaPath = getRuleMetaPath(baseMeta.managedPath);
    const existingMeta = await readStoredMeta(metaPath);
    const meta = existingMeta
      ? {
          ...existingMeta,
          targetPath: baseMeta.targetPath,
          platformName: baseMeta.platformName,
          platformIcon: baseMeta.platformIcon,
          platformDescription: baseMeta.platformDescription,
          canonicalFileName: baseMeta.canonicalFileName,
          description: baseMeta.description,
        }
      : baseMeta;

    if (!(await fileExists(meta.managedPath))) {
      const targetExists = await fileExists(meta.targetPath);
      const versionIndex = await readVersionIndex(ruleId);
      if (targetExists) {
        const importedContent = await fsp.readFile(meta.targetPath, "utf-8");
        await writeManagedRule(meta, importedContent);
        if (versionIndex.length === 0) {
          const legacyVersions = await readLegacyRuleHistoryVersions(ruleId);
          const mergedVersions = mergeImportedContentWithLegacyVersions(
            ruleId,
            importedContent,
            legacyVersions,
          );
          if (mergedVersions.length > 0) {
            await initializeRuleVersionsIfEmpty(meta.id, mergedVersions);
          } else {
            await appendRuleVersion(meta.id, importedContent, "create");
          }
        }
      } else if (versionIndex.length === 0) {
        const legacyVersions = await readLegacyRuleHistoryVersions(ruleId);
        if (legacyVersions.length > 0) {
          const latestLegacyVersion = legacyVersions[0];
          await writeManagedRule(meta, latestLegacyVersion.content);
          await initializeRuleVersionsIfEmpty(meta.id, legacyVersions);
        }
      }
    }

    meta.syncStatus = await syncStatusForMeta(meta);
    await writeMeta(meta);
    await syncRuleIndex(meta);
    return meta;
  }

  async function listProjectMetaPaths(): Promise<string[]> {
    const root = getRuleProjectsRoot();
    if (!(await fileExists(root))) {
      return [];
    }

    const entries = await fsp.readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, entry.name, RULE_META_FILE_NAME));
  }

  async function listRuleDescriptors(): Promise<RuleFileDescriptor[]> {
    return scanRuleDescriptors();
  }

  async function listCachedRuleDescriptors(): Promise<RuleFileDescriptor[]> {
    const records = getRuleDb().getAll();
    if (records.length > 0) {
      const activeCustomRuleIds = getActiveCustomRuleIds();
      const all = records.map(descriptorFromRuleRecord);
      const filtered = (
        await Promise.all(
          all.map(async (descriptor) => {
            if (descriptor.id.startsWith("project:")) {
              return descriptor;
            }

            if (descriptor.platformId.startsWith("custom:")) {
              return activeCustomRuleIds.has(descriptor.id as CustomRuleFileId)
                ? descriptor
                : null;
            }

            if (descriptor.exists) {
              return descriptor;
            }

            const platform = getPlatformById(descriptor.platformId);
            if (!platform) {
              return null;
            }

            const rootDir = deps.getPlatformRootDir(platform);
            return (await fileExists(rootDir)) ? descriptor : null;
          }),
        )
      ).filter((item): item is RuleFileDescriptor => item !== null);

      return filtered;
    }

    return scanRuleDescriptors();
  }

  async function scanRuleDescriptors(): Promise<RuleFileDescriptor[]> {
    const allGlobalDescriptors = await Promise.all(
      getAllGlobalRuleTemplates().map(async (template) =>
        buildDescriptor(await ensureGlobalRuleMaterialized(template.id)),
      ),
    );

    const globalDescriptors = (
      await Promise.all(
        allGlobalDescriptors.map(async (descriptor) => {
          if (descriptor.exists) {
            return descriptor;
          }

          if (descriptor.platformId.startsWith("custom:")) {
            return descriptor;
          }

          const platform = getPlatformById(descriptor.platformId);
          if (!platform) {
            return null;
          }

          const rootDir = deps.getPlatformRootDir(platform);
          return (await fileExists(rootDir)) ? descriptor : null;
        }),
      )
    ).filter((item): item is RuleFileDescriptor => item !== null);

    const projectDescriptors = await Promise.all(
      (await listProjectMetaPaths()).map(async (metaPath) => {
        const meta = await readStoredMeta(metaPath);
        if (!meta) {
          return null;
        }

        return buildDescriptor(meta);
      }),
    );

    return [...globalDescriptors, ...projectDescriptors.filter((item): item is RuleFileDescriptor => item !== null)];
  }

  async function getProjectMetaById(ruleId: ProjectRuleId): Promise<StoredRuleMeta | null> {
    const metaPaths = await listProjectMetaPaths();
    for (const metaPath of metaPaths) {
      const meta = await readStoredMeta(metaPath);
      if (meta?.id === ruleId) {
        return meta;
      }
    }

    return null;
  }

  async function resolveRuleMeta(ruleId: RuleFileId): Promise<StoredRuleMeta> {
    if (isProjectRuleFileId(ruleId)) {
      const projectMeta = await getProjectMetaById(ruleId);
      if (!projectMeta) {
        throw new Error(`Unknown rule file id: ${ruleId}`);
      }

      return projectMeta;
    }

    return ensureGlobalRuleMaterialized(ruleId);
  }

  async function resolveCachedRuleMeta(ruleId: RuleFileId): Promise<StoredRuleMeta> {
    const cachedRecord = getRuleDb().getById(ruleId);
    if (cachedRecord) {
      return metaFromRuleRecord(cachedRecord);
    }

    return resolveRuleMeta(ruleId);
  }

  async function readRuleContent(ruleId: RuleFileId): Promise<RuleFileContent> {
    const meta = await resolveRuleMeta(ruleId);
    const syncStatus = await syncStatusForMeta(meta);
    const nextMeta: StoredRuleMeta = {
      ...meta,
      syncStatus,
    };
    if (syncStatus !== meta.syncStatus) {
      await writeMeta(nextMeta);
    }
    const descriptor = await buildDescriptor(nextMeta);
    const content = (await fileExists(meta.managedPath))
      ? await fsp.readFile(meta.managedPath, "utf-8")
      : descriptor.exists
        ? await fsp.readFile(meta.targetPath, "utf-8")
        : "";
    const targetContent =
      syncStatus === "out-of-sync" && (await fileExists(meta.targetPath))
        ? await fsp.readFile(meta.targetPath, "utf-8")
        : undefined;
    const versionRead = await readRuleVersions(ruleId);
    if (versionRead.repaired || syncStatus !== meta.syncStatus) {
      await syncRuleIndexWithData(nextMeta, content, versionRead.index);
    }

    return {
      ...descriptor,
      content,
      targetContent,
      versions: versionRead.versions,
    };
  }

  async function saveRuleContent(ruleId: RuleFileId, content: string): Promise<RuleFileContent> {
    const meta = await resolveRuleMeta(ruleId);
    const existedBefore = await fileExists(meta.managedPath);

    await writeManagedRule(meta, content);

    const syncStatus = await writeTargetRule(meta, content);
    const versionWrite = await appendRuleVersion(
      ruleId,
      content,
      existedBefore ? "manual-save" : "create",
    );

    const nextMeta: StoredRuleMeta = {
      ...meta,
      syncStatus,
      updatedAt: new Date().toISOString(),
    };

    await writeMeta(nextMeta);
    await syncRuleIndexWithData(nextMeta, content, versionWrite.index);

    const descriptor = await buildDescriptor(nextMeta);
    return {
      ...descriptor,
      content,
      versions: versionWrite.versions,
    };
  }

  async function resolveRuleConflict(
    ruleId: RuleFileId,
    strategy: RuleConflictResolutionStrategy,
  ): Promise<RuleFileContent> {
    if (strategy !== "use-managed" && strategy !== "use-target") {
      throw new Error(`Unknown rule conflict resolution strategy: ${strategy}`);
    }

    const meta = await resolveRuleMeta(ruleId);
    const managedContent = (await fileExists(meta.managedPath))
      ? await fsp.readFile(meta.managedPath, "utf-8")
      : "";

    if (strategy === "use-managed") {
      const syncStatus = await writeTargetRule(meta, managedContent);
      const nextMeta: StoredRuleMeta = {
        ...meta,
        syncStatus,
        updatedAt: new Date().toISOString(),
      };
      const versionRead = await readRuleVersions(ruleId);
      await writeMeta(nextMeta);
      await syncRuleIndexWithData(nextMeta, managedContent, versionRead.index);

      const descriptor = await buildDescriptor(nextMeta);
      return {
        ...descriptor,
        content: managedContent,
        versions: versionRead.versions,
      };
    }

    if (!(await fileExists(meta.targetPath))) {
      throw new Error(`Cannot resolve rule conflict because target file is missing: ${meta.targetPath}`);
    }

    const targetContent = await fsp.readFile(meta.targetPath, "utf-8");
    await writeManagedRule(meta, targetContent);
    const versionWrite = await appendRuleVersion(ruleId, targetContent, "manual-save");
    const nextMeta: StoredRuleMeta = {
      ...meta,
      syncStatus: await syncStatusForMeta(meta),
      updatedAt: new Date().toISOString(),
    };

    await writeMeta(nextMeta);
    await syncRuleIndexWithData(nextMeta, targetContent, versionWrite.index);

    const descriptor = await buildDescriptor(nextMeta);
    return {
      ...descriptor,
      content: targetContent,
      versions: versionWrite.versions,
    };
  }

  async function deleteRuleVersion(
    ruleId: RuleFileId,
    versionId: string,
  ): Promise<RuleVersionSnapshot[]> {
    const meta = await resolveCachedRuleMeta(ruleId);
    const versionDir = getRuleVersionsDir(ruleId);
    const index = await readVersionIndex(ruleId);
    const entry = index.find((candidate) => candidate.id === versionId);
    if (!entry) {
      const versionRead = await readRuleVersions(ruleId);
      const content = (await fileExists(meta.managedPath))
        ? await fsp.readFile(meta.managedPath, "utf-8")
        : (await fileExists(meta.targetPath))
          ? await fsp.readFile(meta.targetPath, "utf-8")
          : "";
      await syncRuleIndexWithData(meta, content, versionRead.index);
      return versionRead.versions;
    }

    const nextIndex = index.filter((candidate) => candidate.id !== versionId);
    await writeVersionIndex(ruleId, nextIndex);
    try {
      await fsp.rm(path.join(versionDir, entry.fileName), { force: true });
    } catch {
      const versionRead = await readRuleVersions(ruleId);
      const content = (await fileExists(meta.managedPath))
        ? await fsp.readFile(meta.managedPath, "utf-8")
        : (await fileExists(meta.targetPath))
          ? await fsp.readFile(meta.targetPath, "utf-8")
          : "";
      await syncRuleIndexWithData(meta, content, versionRead.index);
      return versionRead.versions;
    }

    const versionRead = await readRuleVersions(ruleId);
    const content = (await fileExists(meta.managedPath))
      ? await fsp.readFile(meta.managedPath, "utf-8")
      : (await fileExists(meta.targetPath))
        ? await fsp.readFile(meta.targetPath, "utf-8")
        : "";
    await syncRuleIndexWithData(meta, content, versionRead.index);
    return versionRead.versions;
  }

  async function createProjectRule(input: CreateRuleProjectInput): Promise<RuleFileDescriptor> {
    const name = input.name.trim();
    const rootPath = input.rootPath.trim();
    if (!name || !rootPath) {
      throw new Error("Rule project name and rootPath are required");
    }

    const existingProjectMeta = await Promise.all(
      (await listProjectMetaPaths()).map((metaPath) => readStoredMeta(metaPath)),
    );
    const duplicate = existingProjectMeta.find(
      (meta) => meta?.projectRootPath?.toLowerCase() === rootPath.toLowerCase(),
    );
    if (duplicate) {
      throw new Error("Rule project root path already exists");
    }

    const projectId = input.id ?? crypto.randomUUID();
    assertSafeProjectId(projectId);
    const ruleId = `project:${projectId}` as RuleFileId;
    const dirName = `${slugify(name)}__${projectId}`;
    const managedPath = path.join(getRuleProjectsRoot(), dirName, "AGENTS.md");
    const targetPath = path.join(rootPath, "AGENTS.md");
    const now = new Date().toISOString();
    const meta: StoredRuleMeta = {
      id: ruleId,
      scope: "project",
      platformId: "workspace",
      platformName: name,
      platformIcon: "FolderRoot",
      platformDescription: `Project rules from ${rootPath}`,
      canonicalFileName: "AGENTS.md",
      description: "Project rule file loaded from a user-managed directory.",
      managedPath,
      targetPath,
      projectRootPath: rootPath,
      syncStatus: "target-missing",
      createdAt: now,
      updatedAt: now,
    };

    const targetExists = await fileExists(targetPath);
    const initialContent = targetExists ? await fsp.readFile(targetPath, "utf-8") : "";
    await writeManagedRule(meta, initialContent);
    if (initialContent.trim()) {
      const versionIndex = await readVersionIndex(ruleId);
      if (versionIndex.length === 0) {
        await appendRuleVersion(ruleId, initialContent, "create");
      }
    }

    await writeMeta(meta);
    await syncRuleIndex(meta);
    return buildDescriptor(meta);
  }

  async function removeMissingProjectRules(importedRecords: RuleBackupRecord[]): Promise<void> {
    const importedProjectIds = new Set(
      importedRecords.map((record) => record.id).filter(isProjectRuleFileId),
    );

    const metaPaths = await listProjectMetaPaths();
    for (const metaPath of metaPaths) {
      const meta = await readStoredMeta(metaPath);
      if (!meta || !isProjectRuleFileId(meta.id)) {
        continue;
      }

      if (!importedProjectIds.has(meta.id)) {
        await removeProjectRule(meta.id.slice("project:".length));
      }
    }
  }

  async function bootstrapRuleWorkspace(): Promise<void> {
    await fsp.mkdir(deps.getRulesDir(), { recursive: true });
    await fsp.mkdir(getRuleProjectsRoot(), { recursive: true });
    await fsp.mkdir(getRuleVersionsRoot(), { recursive: true });
  }

  async function removeProjectRule(projectId: string): Promise<void> {
    const ruleId: ProjectRuleId = `project:${projectId}`;
    const meta = await getProjectMetaById(ruleId);
    if (!meta) {
      return;
    }

    await fsp.rm(path.dirname(meta.managedPath), { recursive: true, force: true });
    await fsp.rm(getRuleVersionsDir(meta.id), { recursive: true, force: true });
    getRuleDb().delete(meta.id);
  }

  async function exportRuleBackupRecords(): Promise<RuleBackupRecord[]> {
    const descriptors = await listRuleDescriptors();
    return Promise.all(
      descriptors.map(async (descriptor) => {
        const content = await readRuleContent(descriptor.id);
        return {
          id: content.id,
          platformId: content.platformId,
          platformName: content.platformName,
          platformIcon: content.platformIcon,
          platformDescription: content.platformDescription,
          name: content.name,
          description: content.description,
          path: content.path,
          managedPath: content.managedPath,
          targetPath: content.targetPath,
          projectRootPath: content.projectRootPath ?? null,
          syncStatus: content.syncStatus,
          content: content.content,
          versions: content.versions,
        } satisfies RuleBackupRecord;
      }),
    );
  }

  async function importRuleBackupRecords(
    records: RuleBackupRecord[],
    options: ImportRuleBackupRecordsOptions = {},
  ): Promise<void> {
    await bootstrapRuleWorkspace();

    if (options.replace) {
      await removeMissingProjectRules(records);
    }

    for (const record of records) {
      if (isProjectRuleFileId(record.id)) {
        const projectId = record.id.slice("project:".length);
        const existing = await getProjectMetaById(record.id);
        if (!existing) {
          await createProjectRule({
            id: projectId,
            name: record.platformName,
            rootPath: record.projectRootPath ?? path.dirname(record.targetPath ?? record.path),
          });
        }
      }

      const meta = await resolveRuleMeta(record.id);
      await writeManagedRule(meta, record.content);
      const restoredSyncStatus = await writeTargetRule(meta, record.content);
      const index = await replaceRuleVersions(record.id, record.versions);
      const nextMeta: StoredRuleMeta = {
        ...meta,
        syncStatus: restoredSyncStatus,
        updatedAt: new Date().toISOString(),
      };
      await writeMeta(nextMeta);
      await syncRuleIndex(nextMeta);
    }
  }

  return {
    listRuleDescriptors,
    listCachedRuleDescriptors,
    scanRuleDescriptors,
    getProjectMetaById,
    resolveRuleMeta,
    readRuleContent,
    saveRuleContent,
    resolveRuleConflict,
    deleteRuleVersion,
    createProjectRule,
    bootstrapRuleWorkspace,
    removeProjectRule,
    exportRuleBackupRecords,
    importRuleBackupRecords,
  };
}

export const coreRulesWorkspaceService = createRulesWorkspaceService({
  getRulesDir,
  createRuleDb: () => new RuleDB(initDatabase()),
  getPlatformGlobalRulePath: getDefaultPlatformGlobalRulePath,
  getPlatformRootDir: getDefaultPlatformRootDir,
});

export const {
  listRuleDescriptors,
  listCachedRuleDescriptors,
  scanRuleDescriptors,
  getProjectMetaById,
  resolveRuleMeta,
  readRuleContent,
  saveRuleContent,
  deleteRuleVersion,
  createProjectRule,
  bootstrapRuleWorkspace,
  removeProjectRule,
  exportRuleBackupRecords,
  importRuleBackupRecords,
} = coreRulesWorkspaceService;
