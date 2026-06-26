import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Skill,
  CreateSkillParams,
  UpdateSkillParams,
  RegistrySkill,
  SkillCategory,
  ScannedSkill,
  SkillStoreSource,
  SkillMCPConfig,
  MCPServerConfig,
  ScanLocalResult,
  SkillProject,
  SkillPlatformScanResult,
  SkillSafetyLevel,
  SkillSafetyReport,
  SafetyScanAIConfig,
} from "@prompthub/shared/types";
import { SKILL_CATEGORIES } from "@prompthub/shared/constants/skill-categories";
import { isGitHubHost, parseGitRepo } from "@prompthub/shared/utils/git-repo";
import {
  buildSkillSourceId,
  shouldIgnoreSkillDirectoryEntry,
} from "@prompthub/shared/utils/skill-identity";
import { resolveScenarioAIConfig } from "../services/ai-defaults";
import {
  filterVisibleScannedSkills,
  filterVisibleSkills,
} from "../services/skill-filter";
import { normalizeSkill, normalizeSkills } from "../services/skill-normalize";
import {
  normalizeGitStoreSourceInput,
  validateStoreSourceInput,
  isLikelyLocalSource,
  normalizeLocalSkillDirectoryPath,
  type CustomStoreSourceType,
} from "../services/skill-store-source";
import {
  computeSkillContentFingerprint,
  computeSkillContentHash,
  findInstalledRegistrySkill,
  getRegistrySkillUpdateStatus,
  hasRegistrySkillVersionChanged,
  type RegistrySkillUpdateCheck,
} from "../services/skill-store-update";
import { scheduleAllSaveSync } from "../services/webdav-save-sync";
import { useSettingsStore } from "./settings.store";
import { getSafetyScanAIConfig } from "../components/skill/detail-utils";
import {
  getRemoteStoreSkillCount,
  getRemoteStoreSkills,
} from "../services/remote-store-entry";

export type SkillFilterType =
  | "all"
  | "favorites"
  | "installed"
  | "deployed"
  | "pending";
export type SkillViewMode = "gallery" | "list";
export type SkillGalleryColumnMode =
  | "auto"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8";
export type SkillStoreView =
  | "my-skills"
  | "projects"
  | "agents"
  | "distribution"
  | "store";
// Translation cache constraints
// 翻译缓存限制
const TRANSLATION_CACHE_MAX_SIZE = 200;
const TRANSLATION_CACHE_EVICT_COUNT = 50;
const TRANSLATION_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
const REMOTE_CONTENT_CONCURRENCY = 6;
const REMOTE_REPO_SYNC_CONCURRENCY = 6;
const DEPLOYED_STATUS_CACHE_TTL_MS = 30_000;

let deployedStatusRefreshPromise: Promise<void> | null = null;
let deployedStatusLoadedAt = 0;
let skillTranslationAIPromise:
  | Promise<{
      chatCompletion: typeof import("../services/ai").chatCompletion;
    }>
  | null = null;

function loadSkillTranslationAI() {
  skillTranslationAIPromise ??= import("../services/ai").then((aiService) => ({
    chatCompletion: aiService.chatCompletion,
  }));
  return skillTranslationAIPromise;
}

async function loadBuiltinSkillRegistry(): Promise<RegistrySkill[]> {
  const { BUILTIN_SKILL_REGISTRY } = await import(
    "@prompthub/shared/constants/skill-registry"
  );
  return BUILTIN_SKILL_REGISTRY.map(ensureRegistrySkillSourceId);
}

interface ParsedGitHubSkillLocation {
  owner: string;
  repo: string;
  branch: string;
  directoryPath: string;
}

interface TranslationCacheEntry {
  value: string;
  timestamp: number;
  sourceFingerprint?: string;
}

interface TranslationLookup {
  value: string | null;
  hasTranslation: boolean;
  isStale: boolean;
}

export interface ScannedImportResult {
  importedCount: number;
  importedSkills: Skill[];
  skipped: Array<{ name: string; reason: string }>;
  failed: Array<{ name: string; reason: string }>;
}

export interface SkillSafetyBatchSummary {
  total: number;
  safe: number;
  warn: number;
  highRisk: number;
  blocked: number;
  bySkillId: Record<string, SkillSafetyLevel>;
}

export interface ProjectSkillScanState {
  scannedSkills: ScannedSkill[];
  isScanning: boolean;
  scannedAt?: number;
  error?: string | null;
}

export interface AgentSkillScanState {
  result: SkillPlatformScanResult | null;
  isScanning: boolean;
  scannedAt?: number;
  error?: string | null;
}

function sanitizePersistedProjectScanState(
  projectScanState: Record<string, ProjectSkillScanState>,
): Record<string, ProjectSkillScanState> {
  const nextState: Record<string, ProjectSkillScanState> = {};

  for (const [projectId, state] of Object.entries(projectScanState)) {
    if (!state) {
      continue;
    }

    nextState[projectId] = {
      scannedSkills: Array.isArray(state.scannedSkills)
        ? state.scannedSkills.map((skill) => ({
            ...skill,
            instructions: "",
          }))
        : [],
      isScanning: false,
      scannedAt: state.scannedAt,
      error: state.error ?? null,
    };
  }

  return nextState;
}

function sanitizePersistedAgentScanState(
  agentScanState: Record<string, AgentSkillScanState>,
): Record<string, AgentSkillScanState> {
  const nextState: Record<string, AgentSkillScanState> = {};

  for (const [platformId, state] of Object.entries(agentScanState)) {
    if (!state) {
      continue;
    }

    nextState[platformId] = {
      result: state.result
        ? {
            ...state.result,
            scannedSkills: Array.isArray(state.result.scannedSkills)
              ? state.result.scannedSkills.map((skill) => ({
                  ...skill,
                  instructions: "",
                }))
              : [],
          }
        : null,
      isScanning: false,
      scannedAt: state.scannedAt,
      error: state.error ?? null,
    };
  }

  return nextState;
}

export type RegistrySkillUpdateResult =
  | { status: "updated"; skill: Skill; check: RegistrySkillUpdateCheck }
  | { status: "up-to-date"; skill?: Skill | null; check: RegistrySkillUpdateCheck }
  | {
      status: "conflict" | "local-modified" | "not-installed";
      check: RegistrySkillUpdateCheck;
    };

/**
 * Prune the translation cache: remove expired entries and evict oldest
 * when size exceeds the limit.
 * 清理翻译缓存：移除过期条目，超出上限时淘汰最旧条目。
 */
function pruneTranslationCache(
  cache: Record<string, TranslationCacheEntry>,
): Record<string, TranslationCacheEntry> {
  const now = Date.now();
  // 1. Remove expired entries / 移除过期条目
  const entries = Object.entries(cache).filter(
    ([, entry]) => now - entry.timestamp < TRANSLATION_CACHE_TTL,
  );

  // 2. If still over limit, evict oldest / 如果仍超出上限，淘汰最旧条目
  if (entries.length > TRANSLATION_CACHE_MAX_SIZE) {
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const trimmed = entries.slice(
      entries.length -
        (TRANSLATION_CACHE_MAX_SIZE - TRANSLATION_CACHE_EVICT_COUNT),
    );
    return Object.fromEntries(trimmed);
  }

  return Object.fromEntries(entries);
}

function getTranslationStateFromCache(
  cache: Record<string, TranslationCacheEntry>,
  cacheKey: string,
  sourceFingerprint?: string,
): TranslationLookup {
  const entry = cache[cacheKey];
  if (!entry) {
    return { value: null, hasTranslation: false, isStale: false };
  }

  if (Date.now() - entry.timestamp >= TRANSLATION_CACHE_TTL) {
    return { value: null, hasTranslation: false, isStale: false };
  }

  const isStale = Boolean(
    sourceFingerprint &&
    entry.sourceFingerprint &&
    entry.sourceFingerprint !== sourceFingerprint,
  );

  return {
    value: isStale ? null : entry.value,
    hasTranslation: true,
    isStale,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const DEFAULT_PROJECT_SCAN_SUBDIRECTORIES = [
  ".claude/skills",
  ".agents/skills",
  "skills",
  ".gemini",
] as const;

function joinProjectPath(rootPath: string, subPath: string): string {
  const normalizedRoot = rootPath.replace(/[\\/]+$/, "");
  return `${normalizedRoot}/${subPath}`;
}

export function getProjectScanPaths(project: SkillProject): string[] {
  const explicitPaths = (project.scanPaths || [])
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const normalizedRootPath = project.rootPath.trim();
  if (!normalizedRootPath) {
    return explicitPaths;
  }

  return Array.from(
    new Set([
      ...DEFAULT_PROJECT_SCAN_SUBDIRECTORIES.map((subPath) =>
        joinProjectPath(normalizedRootPath, subPath),
      ),
      ...explicitPaths,
    ]),
  );
}

function stripSkillFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

/**
 * Compute a numeric safety score (0-100) from a SkillSafetyReport.
 * Higher score = safer.
 *   blocked   → 0–10   (based on finding count)
 *   high-risk → 20–40
 *   warn      → 50–70
 *   safe      → 80–100
 */
function computeSafetyScore(report: SkillSafetyReport): number {
  const findingCount = (report.findings ?? []).length;
  switch (report.level) {
    case "blocked":
      return Math.max(0, 10 - findingCount * 2);
    case "high-risk":
      return Math.max(20, 40 - findingCount * 3);
    case "warn":
      return Math.max(50, 70 - findingCount * 4);
    case "safe":
      return Math.max(80, 100 - findingCount * 5);
    default:
      return 50;
  }
}

function hasMeaningfulSkillBody(content?: string): boolean {
  if (typeof content !== "string") {
    return false;
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return false;
  }

  const body = stripSkillFrontmatter(trimmed).trim();
  return body.length > 0;
}

function getRegistrySkillCandidates(state: SkillState): RegistrySkill[] {
  const remoteSkills = Object.values(state.remoteStoreEntries).flatMap(
    (entry) => getRemoteStoreSkills(entry),
  );
  return [...state.registrySkills, ...remoteSkills];
}

function findRegistrySkillCandidateByKey(
  state: SkillState,
  key: string,
): RegistrySkill | null {
  const normalizedKey = key.trim().toLowerCase();
  if (!normalizedKey) {
    return null;
  }

  return (
    getRegistrySkillCandidates(state).find((skill) =>
      [skill.source_id, skill.slug, skill.source_url, skill.content_url].some(
        (value) => value?.trim().toLowerCase() === normalizedKey,
      ),
    ) || null
  );
}

function deriveGitHubSkillContentUrl(
  sourceUrl?: string,
  contentUrl?: string,
): string | undefined {
  if (contentUrl?.trim()) {
    return contentUrl;
  }

  const location = parseGitHubSkillLocation(sourceUrl, contentUrl);
  if (!location?.directoryPath) {
    return undefined;
  }

  return `https://raw.githubusercontent.com/${location.owner}/${location.repo}/${location.branch}/${location.directoryPath}/SKILL.md`;
}

function getInstalledSkillSourceCandidateKeys(skill: Skill): string[] {
  return [skill.source_id, skill.content_url, skill.source_url].filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );
}

function buildInstalledSkillSourceCandidate(
  skill: Skill,
): RegistrySkill | null {
  const contentUrl = deriveGitHubSkillContentUrl(
    skill.source_url,
    skill.content_url,
  );
  const sourceUrl = skill.source_url?.trim();
  if (!sourceUrl && !contentUrl) {
    return null;
  }

  return {
    slug: skill.registry_slug || skill.logical_name || skill.name,
    name: skill.name,
    install_name: skill.name,
    source_id:
      skill.source_id ||
      buildSkillSourceId({
        sourceType: "installed-source",
        sourceUrl,
        branch: skill.source_branch,
        directory: skill.source_directory,
        skillPath: skill.canonical_skill_path || contentUrl,
      }),
    source_label: skill.source_label,
    source_branch: skill.source_branch,
    source_directory: skill.source_directory,
    canonical_skill_path: skill.canonical_skill_path,
    directory_fingerprint: skill.directory_fingerprint,
    description: skill.description || "",
    category: skill.category || "general",
    icon_url: skill.icon_url,
    icon_emoji: skill.icon_emoji,
    icon_background: skill.icon_background,
    author: skill.author || "Unknown",
    source_url: sourceUrl || contentUrl || "",
    tags: skill.original_tags || skill.tags || [],
    version: "source",
    content: skill.content || skill.instructions || "",
    content_url: contentUrl,
    prerequisites: skill.prerequisites,
    compatibility: skill.compatibility,
  };
}

function findInstalledSkillSourceCandidate(
  state: SkillState,
  skill: Skill,
): RegistrySkill | null {
  for (const key of getInstalledSkillSourceCandidateKeys(skill)) {
    const candidate = findRegistrySkillCandidateByKey(state, key);
    if (candidate) {
      return candidate;
    }
  }

  return buildInstalledSkillSourceCandidate(skill);
}

function ensureRegistrySkillSourceId(skill: RegistrySkill): RegistrySkill {
  if (skill.source_id) {
    return skill;
  }

  return {
    ...skill,
    source_id: buildSkillSourceId({
      sourceType: "builtin-registry",
      sourceUrl: skill.source_url,
      skillPath: skill.content_url || skill.slug,
    }),
  };
}

function isLocalRegistrySkill(
  skill: Pick<RegistrySkill, "content_url" | "source_url">,
): boolean {
  return Boolean(
    (typeof skill.content_url === "string" &&
      isLikelyLocalSource(skill.content_url)) ||
    (typeof skill.source_url === "string" &&
      isLikelyLocalSource(skill.source_url)),
  );
}

function normalizeLocalRegistryDirectory(
  regSkill: Pick<RegistrySkill, "content_url" | "source_url">,
): string {
  const candidates = [regSkill.content_url, regSkill.source_url]
    .filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    )
    .map((value) => normalizeLocalSkillDirectoryPath(value));

  return candidates[0] ?? "";
}

async function syncLocalRegistrySkillRepo(
  skillId: string,
  regSkill: RegistrySkill,
): Promise<Skill | null> {
  const localDir = normalizeLocalRegistryDirectory(regSkill);
  if (!localDir) {
    return null;
  }

  await window.api.skill.saveToRepo(skillId, localDir, "copy");
  const syncedSkill = await window.api.skill.syncFromRepo(skillId);
  return refreshInstalledContentHashFromSyncedSkill(
    skillId,
    syncedSkill,
    regSkill,
  );
}

async function resolveRegistrySkillContent(
  regSkill: RegistrySkill,
): Promise<string> {
  if (
    typeof regSkill.content_url === "string" &&
    isLikelyLocalSource(regSkill.content_url)
  ) {
    const localDir = normalizeLocalRegistryDirectory(regSkill);
    const localSkillMd = await window.api.skill.readLocalFileByPath(
      localDir,
      "SKILL.md",
    );
    if (localSkillMd?.content?.trim()) {
      return localSkillMd.content;
    }
    return regSkill.content;
  }

  let remoteContent = regSkill.content;
  if (regSkill.content_url) {
    const freshContent = await window.api.skill.fetchRemoteContent(
      regSkill.content_url,
    );
    if (typeof freshContent === "string" && freshContent.trim()) {
      remoteContent = freshContent;
    }
  }

  return remoteContent;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function isGitHubTreeEntry(
  value: unknown,
): value is { path: string; type: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    typeof value.path === "string" &&
    "type" in value &&
    typeof value.type === "string"
  );
}

function parseGitHubSkillLocation(
  sourceUrl?: string,
  contentUrl?: string,
): ParsedGitHubSkillLocation | null {
  if (sourceUrl) {
    try {
      const parsed = new URL(sourceUrl);
      if (parsed.hostname.toLowerCase() === "github.com") {
        const parts = parsed.pathname.split("/").filter(Boolean);
        if (parts.length >= 4 && parts[2] === "tree") {
          return {
            owner: parts[0],
            repo: parts[1],
            branch: parts[3],
            directoryPath: parts.slice(4).join("/"),
          };
        }
      }
    } catch {
      // Ignore invalid source URL and try contentUrl fallback.
    }
  }

  if (contentUrl) {
    try {
      const parsed = new URL(contentUrl);
      if (parsed.hostname.toLowerCase() === "raw.githubusercontent.com") {
        const parts = parsed.pathname.split("/").filter(Boolean);
        if (parts.length >= 4) {
          return {
            owner: parts[0],
            repo: parts[1],
            branch: parts[2],
            directoryPath: parts.slice(3, -1).join("/"),
          };
        }
      }
    } catch {
      // Ignore invalid content URL.
    }
  }

  return null;
}

async function resolveRemoteRegistryDirectoryFingerprint(
  regSkill: RegistrySkill,
): Promise<string | undefined> {
  const sourceUrl = regSkill.source_url;
  if (!sourceUrl || isLikelyLocalSource(sourceUrl) || !parseGitRepo(sourceUrl)) {
    return regSkill.directory_fingerprint;
  }
  const treeLocation = parseGitHubSkillLocation(sourceUrl);

  return (
    (await window.api.skill.getRemoteGitPackageFingerprint({
      repoUrl: sourceUrl,
      branch: regSkill.source_branch || treeLocation?.branch,
      directory:
        getRegistrySkillDirectory(regSkill) || treeLocation?.directoryPath,
    })) || regSkill.directory_fingerprint
  );
}

function shouldSkipRemoteRepoFile(relativePath: string): boolean {
  return shouldIgnoreSkillDirectoryEntry(relativePath);
}

function getRegistrySkillDirectory(
  regSkill: Pick<RegistrySkill, "source_directory" | "canonical_skill_path">,
): string | undefined {
  const explicitDirectory = regSkill.source_directory
    ?.trim()
    .replace(/^\/+|\/+$/g, "");
  if (explicitDirectory) {
    return explicitDirectory;
  }

  const canonicalPath = regSkill.canonical_skill_path
    ?.trim()
    .replace(/^\/+|\/+$/g, "");
  if (!canonicalPath || canonicalPath.toLowerCase() === "skill.md") {
    return undefined;
  }

  const parts = canonicalPath.split("/");
  parts.pop();
  return parts.join("/") || undefined;
}

function shouldCloneRegistrySkillPackage(
  regSkill: Pick<
    RegistrySkill,
    | "source_url"
    | "content_url"
    | "package_url"
    | "store_url"
    | "source_label"
    | "source_directory"
    | "canonical_skill_path"
    | "directory_fingerprint"
  >,
): boolean {
  const publicDirectoryStoreValues = [
    regSkill.store_url,
    regSkill.content_url,
    regSkill.source_label,
  ]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase());
  if (
    publicDirectoryStoreValues.some(
      (value) => value.includes("clawhub.ai"),
    ) &&
    !getRegistrySkillDirectory(regSkill)
  ) {
    return false;
  }

  if (!regSkill.source_url || isLikelyLocalSource(regSkill.source_url)) {
    return false;
  }

  const parsedRepo = parseGitRepo(regSkill.source_url);
  if (!parsedRepo) {
    return false;
  }

  if (
    publicDirectoryStoreValues.some((value) => value.includes("skills.sh"))
  ) {
    return true;
  }

  const hasPackageMetadata = Boolean(
    getRegistrySkillDirectory(regSkill) ||
      regSkill.canonical_skill_path ||
      regSkill.directory_fingerprint,
  );

  if (
    regSkill.content_url &&
    isGitHubHost(parsedRepo.host) &&
    !hasPackageMetadata
  ) {
    return false;
  }

  return hasPackageMetadata;
}

async function syncRemoteGitHubSkillRepo(
  skillId: string,
  sourceUrl?: string,
  contentUrl?: string,
): Promise<void> {
  const location = parseGitHubSkillLocation(sourceUrl, contentUrl);
  if (!location) {
    return;
  }

  const treeRaw = await window.api.skill.fetchRemoteContent(
    `https://api.github.com/repos/${location.owner}/${location.repo}/git/trees/${location.branch}?recursive=1`,
  );
  const treeData = parseJson<{
    tree?: Array<{ path?: string; type?: string }>;
  }>(treeRaw || "{}", {});
  const directoryPrefix = location.directoryPath
    ? `${location.directoryPath}/`
    : "";
  const files = Array.isArray(treeData.tree)
    ? treeData.tree.filter(
        (entry): entry is { path: string; type: string } =>
          isGitHubTreeEntry(entry) &&
          entry.type === "blob" &&
          (directoryPrefix
            ? entry.path.startsWith(directoryPrefix)
            : true),
      )
    : [];

  await runWithConcurrency(
    files,
    REMOTE_REPO_SYNC_CONCURRENCY,
    async (file) => {
      const relativePath = file.path.slice(directoryPrefix.length);
      if (!relativePath || shouldSkipRemoteRepoFile(relativePath)) {
        return;
      }
      const rawUrl = `https://raw.githubusercontent.com/${location.owner}/${location.repo}/${location.branch}/${file.path}`;
      if (relativePath.toLowerCase() === "skill.md") {
        const content = await window.api.skill.fetchRemoteContent(rawUrl);
        await window.api.skill.writeLocalFile(skillId, relativePath, content, {
          skipVersionSnapshot: true,
        });
        return;
      }

      const repoPath = await window.api.skill.getRepoPath(skillId);
      if (!repoPath) {
        throw new Error(`Missing local repo path for skill: ${skillId}`);
      }
      const content = await window.api.skill.fetchRemoteContentBytes(rawUrl);
      await window.api.skill.writeLocalFileBufferByPath(
        repoPath,
        relativePath,
        content,
      );
    },
  );
}

async function syncRemoteRegistrySkillRepo(
  skillId: string,
  regSkill: RegistrySkill,
  effectiveContent: string,
): Promise<Skill | null> {
  if (regSkill.package_url?.trim()) {
    await window.api.skill.saveRemoteZipToRepo(skillId, {
      zipUrl: regSkill.package_url,
    });
    const syncedSkill = await window.api.skill.syncFromRepo(skillId);
    return refreshInstalledContentHashFromSyncedSkill(
      skillId,
      syncedSkill,
      regSkill,
    );
  }

  if (shouldCloneRegistrySkillPackage(regSkill)) {
    await window.api.skill.saveRemoteGitToRepo(skillId, {
      repoUrl: regSkill.source_url,
      branch: regSkill.source_branch,
      directory: getRegistrySkillDirectory(regSkill),
    });
    const syncedSkill = await window.api.skill.syncFromRepo(skillId);
    return refreshInstalledContentHashFromSyncedSkill(
      skillId,
      syncedSkill,
      regSkill,
    );
  }

  await window.api.skill.writeLocalFile(skillId, "SKILL.md", effectiveContent, {
    skipVersionSnapshot: true,
  });
  await syncRemoteGitHubSkillRepo(
    skillId,
    regSkill.source_url,
    regSkill.content_url,
  );
  return null;
}

async function refreshInstalledContentHashFromSyncedSkill(
  skillId: string,
  syncedSkill: Skill | null | undefined,
  regSkill: Pick<RegistrySkill, "version">,
): Promise<Skill | null> {
  const syncedContent = syncedSkill?.content ?? syncedSkill?.instructions;
  if (typeof syncedContent !== "string" || !syncedContent.trim()) {
    return syncedSkill ?? null;
  }

  const installedContentHash = await computeSkillContentHash(syncedContent);
  return window.api.skill.update(skillId, {
    installed_content_hash: installedContentHash,
    installed_version: regSkill.version,
  });
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;

  const runWorker = async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await worker(items[currentIndex], currentIndex);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => runWorker()),
  );
}

interface SkillState {
  skills: Skill[];
  selectedSkillId: string | null;
  isLoading: boolean;
  error: string | null;

  // View mode
  // 视图模式
  viewMode: SkillViewMode;
  galleryColumns: SkillGalleryColumnMode;

  // Search & Filter
  searchQuery: string;
  filterType: SkillFilterType;

  // Skill Store (registry)
  // 技能商店（注册表）
  storeView: SkillStoreView;
  selectedProjectId: string | null;
  projectScanState: Record<string, ProjectSkillScanState>;
  agentScanState: Record<string, AgentSkillScanState>;
  registrySkills: RegistrySkill[];
  isLoadingRegistry: boolean;
  storeCategory: SkillCategory | "all";
  storeSearchQuery: string;
  selectedRegistrySlug: string | null;
  customStoreSources: SkillStoreSource[];
  selectedStoreSourceId: string;
  remoteStoreEntries: Record<
    string,
    {
      loadedAt: number;
      currentCursor?: string | null;
      cursorHistory?: Array<string | null>;
      error?: string | null;
      matchedCount?: number;
      nextCursor?: string | null;
      pageCount?: number;
      pageIndex?: number;
      pageSize?: number;
      query?: string;
      skills: RegistrySkill[];
      totalCount?: number;
    }
  >;
  pendingPluginChildDeploySkillIds: string[];

  // Actions
  loadSkills: (options?: { preferCache?: boolean }) => Promise<void>;
  selectSkill: (id: string | null) => void;
  requestPluginChildSkillDeploy: (skillIds: string[]) => void;
  consumePluginChildSkillDeployRequest: () => string[];
  createSkill: (data: CreateSkillParams) => Promise<Skill | null>;
  updateSkill: (id: string, data: UpdateSkillParams) => Promise<Skill | null>;
  syncSkillFromRepo: (id: string) => Promise<Skill | null>;
  deleteSkill: (
    id: string,
    options?: { removeCopyInstallations?: boolean },
  ) => Promise<boolean>;
  toggleFavorite: (id: string) => Promise<void>;
  scanLocalSkills: () => Promise<ScanLocalResult>;
  scanLocalPreview: (customPaths?: string[]) => Promise<ScannedSkill[]>;
  importScannedSkills: (
    skills: ScannedSkill[],
    userTagsByPath?: Record<string, string[]>,
    importMode?: "copy" | "symlink",
  ) => Promise<ScannedImportResult>;
  scanInstalledSkillSafety: (
    skillIds?: string[],
    aiConfig?: SafetyScanAIConfig,
  ) => Promise<SkillSafetyBatchSummary>;
  saveSafetyReport: (
    skillId: string,
    report: SkillSafetyReport,
  ) => Promise<void>;
  installToPlatform: (
    platform: "claude" | "cursor",
    name: string,
    mcpConfig: SkillMCPConfig | MCPServerConfig,
  ) => Promise<void>;
  uninstallFromPlatform: (
    platform: "claude" | "cursor",
    name: string,
  ) => Promise<void>;
  getPlatformStatus: (name: string) => Promise<Record<string, boolean>>;

  // View mode actions
  // 视图模式操作
  setViewMode: (mode: SkillViewMode) => void;
  setGalleryColumns: (mode: SkillGalleryColumnMode) => void;

  // Search & Filter Actions
  setSearchQuery: (query: string) => void;
  setFilterType: (filter: SkillFilterType) => void;
  filterTags: string[];
  toggleFilterTag: (tag: string) => void;
  clearFilterTags: () => void;
  getFilteredSkills: () => Skill[];

  // Skill Store Actions
  // 技能商店操作
  setStoreView: (view: SkillStoreView) => void;
  selectProject: (projectId: string | null) => void;
  scanProjectSkills: (project: SkillProject) => Promise<ScannedSkill[]>;
  setProjectScanState: (
    projectId: string,
    state: ProjectSkillScanState,
  ) => void;
  scanAgentPlatformSkills: (
    platformId: string,
  ) => Promise<SkillPlatformScanResult>;
  setAgentScanState: (platformId: string, state: AgentSkillScanState) => void;
  getVisibleProjectScannedSkills: (
    projectId: string,
    options?: { searchQuery?: string },
  ) => ScannedSkill[];
  loadRegistry: () => Promise<void>;
  computeRegistrySkillHash: (content: string) => Promise<string>;
  getRegistrySkillUpdateStatus: (
    skill: RegistrySkill,
  ) => Promise<RegistrySkillUpdateCheck>;
  getInstalledSkillSourceUpdateStatus: (
    skillId: string,
  ) => Promise<RegistrySkillUpdateCheck | null>;
  updateRegistrySkill: (
    sourceId: string,
    options?: { overwriteLocalChanges?: boolean },
  ) => Promise<RegistrySkillUpdateResult | null>;
  updateInstalledSkillFromSource: (
    skillId: string,
    options?: { overwriteLocalChanges?: boolean },
  ) => Promise<RegistrySkillUpdateResult | null>;
  installRegistrySkill: (skill: RegistrySkill) => Promise<Skill | null>;
  installFromRegistry: (sourceId: string) => Promise<Skill | null>;
  uninstallRegistrySkill: (sourceId: string) => Promise<boolean>;
  setStoreCategory: (category: SkillCategory | "all") => void;
  setStoreSearchQuery: (query: string) => void;
  selectRegistrySkill: (sourceId: string | null) => void;
  selectStoreSource: (id: string) => void;
  upsertRegistrySkills: (skills: RegistrySkill[]) => void;
  addCustomStoreSource: (
    name: string,
    url: string,
    type?: CustomStoreSourceType,
    options?: { branch?: string; directory?: string },
  ) => void;
  removeCustomStoreSource: (id: string) => void;
  toggleCustomStoreSource: (id: string) => void;
  setRemoteStoreEntry: (
    sourceId: string,
    entry: {
      loadedAt: number;
      currentCursor?: string | null;
      cursorHistory?: Array<string | null>;
      error?: string | null;
      matchedCount?: number;
      nextCursor?: string | null;
      pageCount?: number;
      pageIndex?: number;
      pageSize?: number;
      query?: string;
      skills: RegistrySkill[];
      totalCount?: number;
    },
  ) => void;
  getInstalledSlugs: () => string[];
  getRecommendedSkills: () => RegistrySkill[];
  getFilteredRegistrySkills: () => {
    installed: RegistrySkill[];
    recommended: RegistrySkill[];
  };

  // Deployed tracking
  // 已分发到平台的技能名称集合
  deployedSkillNames: Set<string>;
  loadDeployedStatus: (options?: { force?: boolean }) => Promise<void>;

  // Translation cache (with TTL + size limit)
  // 翻译缓存（带 TTL + 大小限制）
  translationCache: Record<string, TranslationCacheEntry>;
  translateContent: (
    content: string,
    cacheKey: string,
    targetLang: string,
    options?: { forceRefresh?: boolean; sourceFingerprint?: string },
  ) => Promise<string | null>;
  getTranslationState: (
    cacheKey: string,
    sourceFingerprint?: string,
  ) => TranslationLookup;
  getTranslation: (cacheKey: string) => string | null;
  clearTranslation: (cacheKey: string) => void;
}

type RemoteStoreEntry = SkillState["remoteStoreEntries"][string];

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRegistrySkillLike(value: unknown): value is RegistrySkill {
  if (!isObjectRecord(value)) {
    return false;
  }

  return (
    typeof value.slug === "string" &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    typeof value.category === "string" &&
    typeof value.author === "string" &&
    typeof value.source_url === "string" &&
    typeof value.version === "string" &&
    typeof value.content === "string" &&
    Array.isArray(value.tags)
  );
}

function normalizeRemoteRegistrySkill(
  sourceId: string,
  skill: RegistrySkill,
  customStoreSources: SkillStoreSource[],
): RegistrySkill {
  const source = customStoreSources.find((item) => item.id === sourceId);
  const skillPath = skill.canonical_skill_path || skill.content_url || skill.slug;

  if (source?.type === "git-repo") {
    try {
      const normalizedSource = normalizeGitStoreSourceInput(
        source.url,
        source.branch,
        source.directory,
      );
      return {
        ...skill,
        source_id: buildSkillSourceId({
          sourceType: "git-repo",
          sourceUrl: normalizedSource.url,
          branch: normalizedSource.branch,
          directory: normalizedSource.directory,
          skillPath,
        }),
        source_branch: normalizedSource.branch,
        source_directory: normalizedSource.directory,
        canonical_skill_path: skillPath,
      };
    } catch {
      return skill;
    }
  }

  if (source?.type === "local-dir" || isLocalRegistrySkill(skill)) {
    return {
      ...skill,
      source_id: buildSkillSourceId({
        sourceType: "local-dir",
        sourceUrl: skill.source_url || source?.url,
        skillPath,
      }),
      source_branch: undefined,
      source_directory: undefined,
      canonical_skill_path: skillPath,
    };
  }

  if (source?.type === "marketplace-json") {
    return {
      ...skill,
      source_id: buildSkillSourceId({
        sourceType: "marketplace-json",
        sourceUrl: skill.source_url || source.url,
        skillPath,
      }),
      canonical_skill_path: skillPath,
    };
  }

  return ensureRegistrySkillSourceId(skill);
}

function normalizeRemoteStoreEntries(
  entries: unknown,
  customStoreSources: SkillStoreSource[],
): SkillState["remoteStoreEntries"] {
  if (!isObjectRecord(entries)) {
    return {};
  }

  const normalizedEntries: SkillState["remoteStoreEntries"] = {};
  for (const [sourceId, entry] of Object.entries(entries)) {
    if (!isObjectRecord(entry) || !Array.isArray(entry.skills)) {
      continue;
    }

    const skills = entry.skills
      .filter(isRegistrySkillLike)
      .map((skill) =>
        normalizeRemoteRegistrySkill(sourceId, skill, customStoreSources),
      );
    if (skills.length === 0) {
      continue;
    }

    normalizedEntries[sourceId] = {
      ...(entry as Partial<RemoteStoreEntry>),
      loadedAt: typeof entry.loadedAt === "number" ? entry.loadedAt : 0,
      error: null,
      skills,
    };
  }

  return normalizedEntries;
}

async function applyRegistrySkillUpdateToInstalledSkill(
  installedSkill: Skill,
  regSkill: RegistrySkill,
  check: RegistrySkillUpdateCheck,
  options: {
    notePrefix: string;
    markAsBuiltin: boolean;
    updateSkill: SkillState["updateSkill"];
  },
): Promise<Skill | null> {
  await window.api.skill.versionCreate(
    installedSkill.id,
    `${options.notePrefix}: ${installedSkill.version || "unknown"} -> ${regSkill.version}`,
  );
  scheduleAllSaveSync("skill:create-version");

  const now = Date.now();
  const updatedSkill = await options.updateSkill(installedSkill.id, {
    description: regSkill.description,
    instructions: check.remoteContent,
    content: check.remoteContent,
    version: regSkill.version,
    author: regSkill.author,
    source_url: regSkill.source_url,
    source_id: regSkill.source_id,
    source_label: installedSkill.source_label || regSkill.source_label,
    source_branch: regSkill.source_branch,
    source_directory: regSkill.source_directory,
    canonical_skill_path: regSkill.canonical_skill_path,
    icon_url: regSkill.icon_url,
    icon_emoji: regSkill.icon_emoji,
    icon_background: regSkill.icon_background,
    category: regSkill.category,
    is_builtin: options.markAsBuiltin ? true : installedSkill.is_builtin,
    registry_slug: regSkill.slug,
    directory_fingerprint: regSkill.directory_fingerprint,
    content_url: regSkill.content_url,
    original_tags: regSkill.tags,
    prerequisites: regSkill.prerequisites,
    compatibility: regSkill.compatibility,
    installed_content_hash: check.remoteHash,
    installed_version: regSkill.version,
    updated_from_store_at: now,
  });

  if (!updatedSkill) {
    return null;
  }

  const syncedSkill = isLocalRegistrySkill(regSkill)
    ? await syncLocalRegistrySkillRepo(installedSkill.id, regSkill)
    : await syncRemoteRegistrySkillRepo(
      installedSkill.id,
      regSkill,
      check.remoteContent,
    );

  return syncedSkill ?? updatedSkill;
}

async function refreshRegistrySkillBaselineIfNeeded(
  check: RegistrySkillUpdateCheck,
  updateSkill: SkillState["updateSkill"],
): Promise<Skill | null> {
  const installedSkill = check.installedSkill;
  if (!installedSkill || check.status !== "up-to-date") {
    return null;
  }

  const needsHashRefresh =
    installedSkill.installed_content_hash !== check.remoteHash;
  const needsVersionRefresh = hasRegistrySkillVersionChanged(
    installedSkill,
    check.registrySkill,
  );
  if (!needsHashRefresh && !needsVersionRefresh) {
    return null;
  }

  return updateSkill(installedSkill.id, {
    installed_content_hash: check.remoteHash,
    installed_version: check.registrySkill.version,
  });
}

export const useSkillStore = create<SkillState>()(
  persist(
    (set, get) => ({
      skills: [],
      selectedSkillId: null,
      isLoading: false,
      error: null,
      viewMode: "gallery" as SkillViewMode,
      galleryColumns: "auto" as SkillGalleryColumnMode,
      searchQuery: "",
      filterType: "all",
      filterTags: [] as string[],

      // Deployed tracking
      deployedSkillNames: new Set<string>(),

      // Skill Store state
      storeView: "my-skills" as SkillStoreView,
      selectedProjectId: null,
      projectScanState: {},
      agentScanState: {},
      registrySkills: [] as RegistrySkill[],
      isLoadingRegistry: false,
      storeCategory: "all" as SkillCategory | "all",
      storeSearchQuery: "",
      selectedRegistrySlug: null,
      customStoreSources: [] as SkillStoreSource[],
      selectedStoreSourceId: "official",
      remoteStoreEntries: {},
      pendingPluginChildDeploySkillIds: [],

      loadSkills: async (options) => {
        const hasCachedSkills = get().skills.length > 0;
        if (!options?.preferCache || !hasCachedSkills) {
          set({ isLoading: true, error: null });
        } else {
          set({ error: null });
        }
        try {
          const skills = normalizeSkills(await window.api.skill.getAll());
          set({ skills, isLoading: false });
        } catch (error) {
          console.error("Failed to load skills:", error);
          set({ error: String(error), isLoading: false });
        }
      },

      loadDeployedStatus: async (options) => {
        if (!options?.force && deployedStatusRefreshPromise) {
          return deployedStatusRefreshPromise;
        }
        if (
          !options?.force &&
          deployedStatusLoadedAt > 0 &&
          Date.now() - deployedStatusLoadedAt < DEPLOYED_STATUS_CACHE_TTL_MS
        ) {
          return;
        }

        const { skills } = get();
        const run = async () => {
          const deployed = new Set<string>();
          try {
            const skillIds = skills.map((s) => s.id);
            if (skillIds.length === 0) {
              set({ deployedSkillNames: deployed });
              deployedStatusLoadedAt = Date.now();
              return;
            }
            const results =
              await window.api.skill.getMdInstallStatusBatch(skillIds);
            for (const [skillId, status] of Object.entries(results)) {
              if (Object.values(status).some(Boolean)) {
                deployed.add(skillId);
              }
            }
            deployedStatusLoadedAt = Date.now();
          } catch (error) {
            console.warn("Failed to load deployed status:", error);
          }
          set({ deployedSkillNames: deployed });
        };

        deployedStatusRefreshPromise = run().finally(() => {
          deployedStatusRefreshPromise = null;
        });
        return deployedStatusRefreshPromise;
      },

      selectSkill: (id) => {
        set({ selectedSkillId: id });
      },

      requestPluginChildSkillDeploy: (skillIds) => {
        const normalizedIds = Array.from(
          new Set(skillIds.filter((id) => id.trim().length > 0)),
        );
        set({ pendingPluginChildDeploySkillIds: normalizedIds });
      },

      consumePluginChildSkillDeployRequest: () => {
        const pendingIds = get().pendingPluginChildDeploySkillIds;
        set({ pendingPluginChildDeploySkillIds: [] });
        return pendingIds;
      },

      createSkill: async (data) => {
        set({ isLoading: true, error: null });
        try {
          const newSkill = await window.api.skill.create(data);
          if (newSkill) {
            let storedSkill = normalizeSkill(newSkill);
            const repoContent =
              data.instructions ||
              data.content ||
              newSkill.instructions ||
              newSkill.content ||
              "";
            if (typeof repoContent === "string") {
              try {
                await window.api.skill.writeLocalFile(
                  newSkill.id,
                  "SKILL.md",
                  repoContent,
                  { skipVersionSnapshot: true },
                );
                const repoPath = await window.api.skill.getRepoPath(
                  newSkill.id,
                );
                if (repoPath) {
                  storedSkill = { ...newSkill, local_repo_path: repoPath };
                }
              } catch (repoError) {
                console.warn(
                  `Failed to write local repo for skill "${newSkill.name}":`,
                  repoError,
                );
              }
            }
            set((state) => ({
              skills: [storedSkill, ...state.skills],
              selectedSkillId: storedSkill.id,
              isLoading: false,
            }));
            scheduleAllSaveSync("skill:create");
            return storedSkill;
          }
          return null;
        } catch (error) {
          console.error("Failed to create skill:", error);
          set({ error: String(error), isLoading: false });
          throw error;
        }
      },

      updateSkill: async (id, data) => {
        try {
          const updatedSkill = await window.api.skill.update(id, data);
          if (updatedSkill) {
            let storedSkill = normalizeSkill(updatedSkill);
            const shouldSyncRepoContent =
              Object.prototype.hasOwnProperty.call(data, "instructions") ||
              Object.prototype.hasOwnProperty.call(data, "content");
            const nextContent =
              data.instructions ??
              data.content ??
              updatedSkill.instructions ??
              updatedSkill.content;
            if (shouldSyncRepoContent && typeof nextContent === "string") {
              try {
                await window.api.skill.writeLocalFile(
                  id,
                  "SKILL.md",
                  nextContent,
                  { skipVersionSnapshot: true },
                );
                const repoPath = await window.api.skill.getRepoPath(id);
                if (repoPath) {
                  storedSkill = { ...updatedSkill, local_repo_path: repoPath };
                }
              } catch (repoError) {
                console.warn(
                  `Failed to sync local repo for skill "${updatedSkill.name}":`,
                  repoError,
                );
              }
            }
            set((state) => ({
              skills: state.skills.map((s) => (s.id === id ? storedSkill : s)),
            }));
            scheduleAllSaveSync("skill:update");
            return storedSkill;
          }
          return null;
        } catch (error) {
          console.error("Failed to update skill:", error);
          throw error;
        }
      },

      syncSkillFromRepo: async (id) => {
        try {
          const syncedSkill = await window.api.skill.syncFromRepo(id);
          if (!syncedSkill) {
            return null;
          }

          const normalizedSkill = normalizeSkill(syncedSkill);
          set((state) => ({
            skills: state.skills.map((skill) =>
              skill.id === id ? normalizedSkill : skill,
            ),
          }));
          return normalizedSkill;
        } catch (error) {
          console.error("Failed to sync skill from repo:", error);
          return null;
        }
      },

      deleteSkill: async (id, options) => {
        try {
          const success =
            options === undefined
              ? await window.api.skill.delete(id)
              : await window.api.skill.delete(id, options);
          if (success) {
            set((state) => ({
              skills: state.skills.filter((s) => s.id !== id),
              selectedSkillId:
                state.selectedSkillId === id ? null : state.selectedSkillId,
            }));
            scheduleAllSaveSync("skill:delete");
            return true;
          }
          return false;
        } catch (error) {
          console.error("Failed to delete skill:", error);
          return false;
        }
      },

      scanLocalSkills: async () => {
        set({ isLoading: true, error: null });
        try {
          const result: ScanLocalResult = await window.api.skill.scanLocal();
          if (result.imported > 0) {
            const skills = normalizeSkills(await window.api.skill.getAll());
            set({ skills, isLoading: false });
          } else {
            set({ isLoading: false });
          }
          return result;
        } catch (error) {
          console.error("Failed to scan local skills:", error);
          set({ error: String(error), isLoading: false });
          return { imported: 0, skipped: [] };
        }
      },

      scanLocalPreview: async (customPaths?: string[]) => {
        set({ isLoading: true, error: null });
        try {
          const aiConfig = getSafetyScanAIConfig(
            useSettingsStore.getState().aiModels,
          );
          const scannedSkills = await window.api.skill.scanLocalPreview(
            customPaths,
            aiConfig,
          );
          set({ isLoading: false });
          return scannedSkills;
        } catch (error) {
          console.error("Failed to preview local skills:", error);
          set({ error: String(error), isLoading: false });
          return [];
        }
      },

      importScannedSkills: async (
        scannedSkills: ScannedSkill[],
        userTagsByPath?: Record<string, string[]>,
        importMode: "copy" | "symlink" = "copy",
      ) => {
        set({ isLoading: true, error: null });
        try {
          let importCount = 0;
          const importedSkills: Skill[] = [];
          const skipped: ScannedImportResult["skipped"] = [];
          const failed: ScannedImportResult["failed"] = [];
          for (const scanned of scannedSkills) {
            if (!scanned.name || scanned.name.trim().length === 0) {
              skipped.push({
                name: scanned.localPath || "unknown",
                reason: "Missing skill name",
              });
              continue;
            }

            try {
              const userTags = userTagsByPath?.[scanned.localPath] ?? [];
              const scannedPlatformName =
                "platformSkillPath" in scanned &&
                typeof scanned.platforms?.[0] === "string"
                  ? scanned.platforms[0]
                  : undefined;
              const newSkill = await window.api.skill.create({
                name: scanned.name,
                description: scanned.description,
                instructions: scanned.instructions,
                content: scanned.instructions,
                protocol_type: "skill",
                version: scanned.version,
                author: scanned.author,
                tags: userTags,
                original_tags: scanned.tags,
                is_favorite: false,
                source_url: scanned.localPath,
                source_label: scannedPlatformName,
                local_repo_path: scanned.localPath,
              });

              // Copy skill files from original location into local repo
              // localPath is the parent directory of SKILL.md (skill folder path)
              if (scanned.localPath) {
                try {
                  const repoPath = await window.api.skill.saveToRepo(
                    newSkill.id,
                    scanned.localPath,
                    importMode,
                  );
                  // Write back the repo path so SkillFileEditor can find the files
                  if (repoPath && newSkill?.id) {
                    await window.api.skill.update(newSkill.id, {
                      local_repo_path: repoPath,
                    });
                  }
                } catch (error: unknown) {
                  console.warn(
                    `Skill "${scanned.name}" imported to DB but failed to copy files to local repo:`,
                    getErrorMessage(error),
                  );
                }
              }

              importCount++;
              if (newSkill) {
                importedSkills.push(normalizeSkill(newSkill));
              }
            } catch (error: unknown) {
              failed.push({
                name: scanned.name,
                reason: getErrorMessage(error) || "Unknown import error",
              });
              console.warn(
                `Failed to import skill "${scanned.name}":`,
                getErrorMessage(error),
              );
            }
          }
          // Refresh skills after import
          const skills = normalizeSkills(await window.api.skill.getAll());
          set({ skills, isLoading: false });
          return {
            importedCount: importCount,
            importedSkills,
            skipped,
            failed,
          };
        } catch (error) {
          console.error("Failed to import scanned skills:", error);
          set({ error: String(error), isLoading: false });
          return {
            importedCount: 0,
            importedSkills: [],
            skipped: [],
            failed: [
              {
                name: "scan",
                reason: String(error),
              },
            ],
          };
        }
      },

      scanInstalledSkillSafety: async (skillIds, aiConfig) => {
        const targetSkills = get().skills.filter(
          (skill) => !skillIds || skillIds.includes(skill.id),
        );
        const summary: SkillSafetyBatchSummary = {
          total: targetSkills.length,
          safe: 0,
          warn: 0,
          highRisk: 0,
          blocked: 0,
          bySkillId: {},
        };

        for (const skill of targetSkills) {
          const report = await window.api.skill.scanSafety({
            name: skill.name,
            content: skill.instructions || skill.content,
            sourceUrl: skill.source_url,
            contentUrl: skill.content_url,
            localRepoPath: skill.local_repo_path,
            aiConfig,
          });

          // Attach numeric score
          const scored: SkillSafetyReport = {
            ...report,
            score: computeSafetyScore(report),
          };

          summary.bySkillId[skill.id] = scored.level;

          if (scored.level === "safe") {
            summary.safe += 1;
          } else if (scored.level === "warn") {
            summary.warn += 1;
          } else if (scored.level === "high-risk") {
            summary.highRisk += 1;
          } else {
            summary.blocked += 1;
          }

          // Persist to DB and update in-memory store
          try {
            await window.api.skill.saveSafetyReport(skill.id, scored);
            set((state) => ({
              skills: state.skills.map((s) =>
                s.id === skill.id ? { ...s, safetyReport: scored } : s,
              ),
            }));
            scheduleAllSaveSync("skill:safety-report");
          } catch (err) {
            console.warn(
              `Failed to persist safety report for skill "${skill.name}":`,
              err,
            );
          }
        }

        return summary;
      },

      saveSafetyReport: async (skillId, report) => {
        const scored: SkillSafetyReport = {
          ...report,
          score: report.score ?? computeSafetyScore(report),
        };
        await window.api.skill.saveSafetyReport(skillId, scored);
        set((state) => ({
          skills: state.skills.map((s) =>
            s.id === skillId ? { ...s, safetyReport: scored } : s,
          ),
        }));
        scheduleAllSaveSync("skill:save-safety-report");
      },

      installToPlatform: async (platform, name, mcpConfig) => {
        try {
          await window.api.skill.installToPlatform(platform, name, mcpConfig);
        } catch (error) {
          console.error(`Failed to install to ${platform}:`, error);
          throw error;
        }
      },

      uninstallFromPlatform: async (platform, name) => {
        try {
          await window.api.skill.uninstallFromPlatform(platform, name);
        } catch (error) {
          console.error(`Failed to uninstall from ${platform}:`, error);
          throw error;
        }
      },

      getPlatformStatus: async (name) => {
        try {
          return await window.api.skill.getPlatformStatus(name);
        } catch (error) {
          console.error(`Failed to get platform status for ${name}:`, error);
          return { claude: false, cursor: false };
        }
      },

      toggleFavorite: async (id) => {
        const skill = get().skills.find((s) => s.id === id);
        if (!skill) return;

        try {
          const updatedSkill = await window.api.skill.update(id, {
            is_favorite: !skill.is_favorite,
          });
          if (updatedSkill) {
            set((state) => ({
              skills: state.skills.map((s) => (s.id === id ? updatedSkill : s)),
            }));
          }
        } catch (error) {
          console.error("Failed to toggle favorite:", error);
        }
      },

      setViewMode: (mode) => {
        set({ viewMode: mode });
      },

      setGalleryColumns: (mode) => {
        set({ galleryColumns: mode });
      },

      setSearchQuery: (query) => {
        set({ searchQuery: query });
      },

      setFilterType: (filter) => {
        set({ filterType: filter });
      },

      toggleFilterTag: (tag) => {
        const { filterTags } = get();
        if (filterTags.includes(tag)) {
          set({ filterTags: filterTags.filter((t) => t !== tag) });
        } else {
          set({ filterTags: [...filterTags, tag] });
        }
      },

      clearFilterTags: () => {
        set({ filterTags: [] });
      },

      getFilteredSkills: () => {
        const {
          deployedSkillNames,
          filterTags,
          filterType,
          searchQuery,
          skills,
          storeView,
        } = get();

        return filterVisibleSkills({
          deployedSkillNames,
          filterTags,
          filterType,
          searchQuery,
          skills,
          storeView,
        });
      },

      // ─── Skill Store Actions / 技能商店操作 ───

      setStoreView: (view) => {
        set({
          storeView: view,
          selectedRegistrySlug: null,
          selectedSkillId: null,
        });
      },

      selectProject: (projectId) => {
        set({ selectedProjectId: projectId });
      },

      scanProjectSkills: async (project) => {
        const uniquePaths = getProjectScanPaths(project);

        set((state) => ({
          projectScanState: {
            ...state.projectScanState,
            [project.id]: {
              ...(state.projectScanState[project.id] || {
                scannedSkills: [],
              }),
              isScanning: true,
              error: null,
            },
          },
        }));

        try {
          const scannedSkills =
            await window.api.skill.scanLocalPreview(uniquePaths);
          const nextState: ProjectSkillScanState = {
            scannedSkills,
            isScanning: false,
            scannedAt: Date.now(),
            error: null,
          };
          set((state) => ({
            projectScanState: {
              ...state.projectScanState,
              [project.id]: nextState,
            },
          }));
          return scannedSkills;
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          set((state) => ({
            projectScanState: {
              ...state.projectScanState,
              [project.id]: {
                scannedSkills:
                  state.projectScanState[project.id]?.scannedSkills || [],
                isScanning: false,
                scannedAt: state.projectScanState[project.id]?.scannedAt,
                error: errorMessage,
              },
            },
          }));
          throw error instanceof Error ? error : new Error(errorMessage);
        }
      },

      setProjectScanState: (projectId, state) => {
        set((current) => ({
          projectScanState: {
            ...current.projectScanState,
            [projectId]: state,
          },
        }));
      },

      scanAgentPlatformSkills: async (platformId) => {
        set((state) => ({
          agentScanState: {
            ...state.agentScanState,
            [platformId]: {
              ...(state.agentScanState[platformId] || { result: null }),
              isScanning: true,
              error: null,
            },
          },
        }));

        try {
          const result = await window.api.skill.scanPlatformSkills(platformId);
          const nextState: AgentSkillScanState = {
            result,
            isScanning: false,
            scannedAt: Date.now(),
            error: null,
          };
          set((state) => ({
            agentScanState: {
              ...state.agentScanState,
              [platformId]: nextState,
            },
          }));
          return result;
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          set((state) => ({
            agentScanState: {
              ...state.agentScanState,
              [platformId]: {
                result: state.agentScanState[platformId]?.result ?? null,
                isScanning: false,
                scannedAt: state.agentScanState[platformId]?.scannedAt,
                error: errorMessage,
              },
            },
          }));
          throw error instanceof Error ? error : new Error(errorMessage);
        }
      },

      setAgentScanState: (platformId, state) => {
        set((current) => ({
          agentScanState: {
            ...current.agentScanState,
            [platformId]: state,
          },
        }));
      },

      getVisibleProjectScannedSkills: (projectId, options) => {
        const scannedSkills =
          get().projectScanState[projectId]?.scannedSkills || [];
        return filterVisibleScannedSkills(
          scannedSkills,
          options?.searchQuery || "",
        );
      },

      loadRegistry: async () => {
        set({ isLoadingRegistry: true });
        try {
          const registry = await loadBuiltinSkillRegistry();
          set({ registrySkills: registry, isLoadingRegistry: false });
        } catch (error) {
          const message = getErrorMessage(error);
          set({ isLoadingRegistry: false, error: message });
          throw error instanceof Error ? error : new Error(message);
        }
      },

      computeRegistrySkillHash: computeSkillContentHash,

      getRegistrySkillUpdateStatus: async (regSkill) => {
        const remoteDirectoryFingerprint =
          await resolveRemoteRegistryDirectoryFingerprint(regSkill);
        const effectiveRegSkill = {
          ...regSkill,
          directory_fingerprint: remoteDirectoryFingerprint,
        };
        const remoteContent =
          await resolveRegistrySkillContent(effectiveRegSkill);

        const check = await getRegistrySkillUpdateStatus(
          findInstalledRegistrySkill(get().skills, effectiveRegSkill),
          effectiveRegSkill,
          remoteContent,
        );
        await refreshRegistrySkillBaselineIfNeeded(check, get().updateSkill);
        return check;
      },

      getInstalledSkillSourceUpdateStatus: async (skillId) => {
        let installedSkill = get().skills.find((skill) => skill.id === skillId);
        if (!installedSkill) {
          return null;
        }

        if (installedSkill.local_repo_path) {
          installedSkill =
            (await get().syncSkillFromRepo(installedSkill.id)) ?? installedSkill;
        }

        const regSkill = findInstalledSkillSourceCandidate(
          get(),
          installedSkill,
        );
        if (!regSkill) {
          return null;
        }

        const remoteDirectoryFingerprint =
          await resolveRemoteRegistryDirectoryFingerprint(regSkill);
        const effectiveRegSkill = {
          ...regSkill,
          directory_fingerprint: remoteDirectoryFingerprint,
        };
        const remoteContent =
          await resolveRegistrySkillContent(effectiveRegSkill);
        const check = await getRegistrySkillUpdateStatus(
          installedSkill,
          effectiveRegSkill,
          remoteContent,
        );
        await refreshRegistrySkillBaselineIfNeeded(check, get().updateSkill);
        return check;
      },

      updateRegistrySkill: async (sourceId, options) => {
        const regSkill = findRegistrySkillCandidateByKey(get(), sourceId);
        if (!regSkill) return null;

        const check = await get().getRegistrySkillUpdateStatus(regSkill);
        if (!check.installedSkill) {
          return { status: "not-installed", check };
        }
        if (check.status === "up-to-date") {
          const refreshedSkill = await refreshRegistrySkillBaselineIfNeeded(
            check,
            get().updateSkill,
          );
          return { status: "up-to-date", skill: refreshedSkill, check };
        }
        if (
          (check.status === "conflict" || check.status === "local-modified") &&
          !options?.overwriteLocalChanges
        ) {
          return { status: check.status, check };
        }

        const updatedSkill = await applyRegistrySkillUpdateToInstalledSkill(
          check.installedSkill,
          regSkill,
          check,
          {
            notePrefix: "Store update",
            markAsBuiltin: true,
            updateSkill: get().updateSkill,
          },
        );
        if (!updatedSkill) {
          return null;
        }
        set((state) => ({
          skills: state.skills.map((skill) =>
            skill.id === updatedSkill.id ? normalizeSkill(updatedSkill) : skill,
          ),
        }));

        return { status: "updated", skill: updatedSkill, check };
      },

      updateInstalledSkillFromSource: async (skillId, options) => {
        const check = await get().getInstalledSkillSourceUpdateStatus(skillId);
        if (!check) {
          return null;
        }
        if (!check.installedSkill) {
          return { status: "not-installed", check };
        }
        if (check.status === "up-to-date") {
          const refreshedSkill = await refreshRegistrySkillBaselineIfNeeded(
            check,
            get().updateSkill,
          );
          return { status: "up-to-date", skill: refreshedSkill, check };
        }
        if (
          (check.status === "conflict" || check.status === "local-modified") &&
          !options?.overwriteLocalChanges
        ) {
          return { status: check.status, check };
        }

        const updatedSkill = await applyRegistrySkillUpdateToInstalledSkill(
          check.installedSkill,
          check.registrySkill,
          check,
          {
            notePrefix: "Source update",
            markAsBuiltin: false,
            updateSkill: get().updateSkill,
          },
        );
        if (!updatedSkill) {
          return null;
        }
        set((state) => ({
          skills: state.skills.map((skill) =>
            skill.id === updatedSkill.id ? normalizeSkill(updatedSkill) : skill,
          ),
        }));

        return { status: "updated", skill: updatedSkill, check };
      },

      installRegistrySkill: async (regSkill) => {
        try {
          let effectiveContent = regSkill.content;
          try {
            effectiveContent = await resolveRegistrySkillContent(regSkill);
          } catch (fetchError) {
            console.warn(
              `Failed to resolve latest SKILL.md for "${regSkill.slug}", falling back to cached registry content:`,
              fetchError,
            );
          }

          if (!hasMeaningfulSkillBody(effectiveContent)) {
            throw new Error(
              `Unable to fetch the full SKILL.md for "${regSkill.name}". The registry only has summary metadata right now, so installation was blocked to avoid creating an incomplete skill.`,
            );
          }

          const installedHash = await computeSkillContentHash(effectiveContent);
          const installedAt = Date.now();
          const newSkill = await window.api.skill.create({
            name: regSkill.install_name || regSkill.slug,
            description: regSkill.description,
            instructions: effectiveContent,
            content: effectiveContent,
            protocol_type: "skill",
            version: regSkill.version,
            author: regSkill.author,
            source_url: regSkill.source_url,
            source_id: regSkill.source_id,
            source_label: regSkill.source_label,
            source_branch: regSkill.source_branch,
            source_directory: regSkill.source_directory,
            canonical_skill_path: regSkill.canonical_skill_path,
            tags: [],
            original_tags: regSkill.tags,
            is_favorite: false,
            icon_url: regSkill.icon_url,
            icon_emoji: regSkill.icon_emoji,
            category: regSkill.category,
            is_builtin: true,
            registry_slug: regSkill.slug,
            directory_fingerprint: regSkill.directory_fingerprint,
            content_url: regSkill.content_url,
            installed_content_hash: installedHash,
            installed_version: regSkill.version,
            installed_at: installedAt,
            updated_from_store_at: installedAt,
            prerequisites: regSkill.prerequisites,
            compatibility: regSkill.compatibility,
          });
          if (newSkill) {
            try {
              if (isLocalRegistrySkill(regSkill)) {
                await syncLocalRegistrySkillRepo(newSkill.id, regSkill);
              } else {
                await syncRemoteRegistrySkillRepo(
                  newSkill.id,
                  regSkill,
                  effectiveContent,
                );
              }
            } catch (repoError) {
              console.warn(
                `Failed to create local repo for registry skill "${regSkill.slug}":`,
                repoError,
              );
              if (shouldCloneRegistrySkillPackage(regSkill)) {
                await window.api.skill
                  .delete(newSkill.id)
                  .catch((deleteError) => {
                    console.warn(
                      `Failed to roll back incomplete registry skill "${regSkill.slug}":`,
                      deleteError,
                    );
                  });
                throw repoError;
              }
            }
            await get().loadSkills();
            return newSkill;
          }
          return null;
        } catch (error: unknown) {
          throw new Error(getErrorMessage(error) || "Failed to install skill");
        }
      },

      installFromRegistry: async (sourceId) => {
        const { installRegistrySkill } = get();
        const regSkill = findRegistrySkillCandidateByKey(get(), sourceId);
        if (!regSkill) return null;
        return installRegistrySkill(regSkill);
      },

      uninstallRegistrySkill: async (sourceId) => {
        const { skills, loadSkills } = get();
        const regSkill = findRegistrySkillCandidateByKey(get(), sourceId);
        const skill = regSkill
          ? findInstalledRegistrySkill(skills, regSkill)
          : skills.find((s) => s.source_id === sourceId);
        if (!skill) return false;

        try {
          const success = await window.api.skill.delete(skill.id);
          if (success) {
            await loadSkills();
            return true;
          }
          return false;
        } catch (error) {
          console.error("Failed to uninstall registry skill:", error);
          return false;
        }
      },

      setStoreCategory: (category) => {
        set({ storeCategory: category });
      },

      setStoreSearchQuery: (query) => {
        set({ storeSearchQuery: query });
      },

      selectRegistrySkill: (sourceId) => {
        set({ selectedRegistrySlug: sourceId });
      },

      selectStoreSource: (id) => {
        set({ selectedStoreSourceId: id });
      },

      upsertRegistrySkills: (incomingSkills) => {
        set((state) => {
          const merged = [...state.registrySkills];
          const indexBySourceId = new Map(
            merged.map((skill, index) => [skill.source_id, index]),
          );

          for (const incoming of incomingSkills) {
            const index = indexBySourceId.get(incoming.source_id);
            if (index !== undefined) {
              merged[index] = { ...merged[index], ...incoming };
            } else {
              indexBySourceId.set(incoming.source_id, merged.length);
              merged.push(incoming);
            }
          }

          return { registrySkills: merged };
        });
      },

      addCustomStoreSource: (name, url, type = "marketplace-json", options) => {
        const trimmedName = name.trim();
        const normalizedGitSource =
          type === "git-repo"
            ? normalizeGitStoreSourceInput(
                url.trim(),
                options?.branch,
                options?.directory,
              )
            : null;
        const trimmedUrl = validateStoreSourceInput(url.trim(), type);
        if (!trimmedName || !trimmedUrl) return;

        const newId = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        set((state) => ({
          customStoreSources: [
            {
              id: newId,
              name: trimmedName,
              type,
              url: normalizedGitSource?.url ?? trimmedUrl,
              branch: normalizedGitSource?.branch,
              directory: normalizedGitSource?.directory,
              enabled: true,
              order: state.customStoreSources.length,
              createdAt: Date.now(),
            },
            ...state.customStoreSources,
          ],
          selectedStoreSourceId: newId,
        }));
      },

      removeCustomStoreSource: (id) => {
        set((state) => {
          const nextSources = state.customStoreSources.filter(
            (source) => source.id !== id,
          );
          const nextSelectedStoreSourceId =
            state.selectedStoreSourceId === id
              ? "official"
              : state.selectedStoreSourceId;
          const nextRemoteStoreEntries = { ...state.remoteStoreEntries };
          delete nextRemoteStoreEntries[id];

          return {
            customStoreSources: nextSources,
            selectedStoreSourceId: nextSelectedStoreSourceId,
            remoteStoreEntries: nextRemoteStoreEntries,
          };
        });
      },

      toggleCustomStoreSource: (id) => {
        set((state) => ({
          customStoreSources: state.customStoreSources.map((source) =>
            source.id === id ? { ...source, enabled: !source.enabled } : source,
          ),
        }));
      },

      setRemoteStoreEntry: (sourceId, entry) => {
        set((state) => ({
          remoteStoreEntries: {
            ...state.remoteStoreEntries,
            [sourceId]: entry,
          },
        }));
      },

      getInstalledSlugs: () => {
        return get()
          .skills.filter((s) => s.source_id)
          .map((s) => s.source_id!);
      },

      getRecommendedSkills: () => {
        const { skills, registrySkills } = get();
        return registrySkills.filter(
          (registrySkill) => !findInstalledRegistrySkill(skills, registrySkill),
        );
      },

      getFilteredRegistrySkills: () => {
        const { registrySkills, skills, storeCategory, storeSearchQuery } =
          get();
        let filtered = registrySkills;

        // Category filter
        if (storeCategory !== "all") {
          filtered = filtered.filter((s) => s.category === storeCategory);
        }

        // Search filter
        if (storeSearchQuery.trim()) {
          const q = storeSearchQuery.toLowerCase();
          filtered = filtered.filter(
            (s) =>
              s.name.toLowerCase().includes(q) ||
              s.description.toLowerCase().includes(q) ||
              s.tags.some((tag) => tag.toLowerCase().includes(q)),
          );
        }

        const installed = filtered.filter((registrySkill) =>
          findInstalledRegistrySkill(skills, registrySkill),
        );
        const recommended = filtered.filter(
          (registrySkill) => !findInstalledRegistrySkill(skills, registrySkill),
        );

        return { installed, recommended };
      },

      // ─── Translation / 翻译 ───
      translationCache: {} as Record<string, TranslationCacheEntry>,

      translateContent: async (content, cacheKey, targetLang, options) => {
        const sourceFingerprint =
          options?.sourceFingerprint ?? computeSkillContentFingerprint(content);

        if (!options?.forceRefresh) {
          const cached = getTranslationStateFromCache(
            get().translationCache,
            cacheKey,
            sourceFingerprint,
          );
          if (cached.value) {
            return cached.value;
          }
        }

        // Get AI config from settings store
        const settingsState = useSettingsStore.getState();
        const { chatCompletion } = await loadSkillTranslationAI();
        const config = resolveScenarioAIConfig({
          aiModels: settingsState.aiModels,
          scenarioModelDefaults: settingsState.scenarioModelDefaults,
          scenario: "translation",
          type: "chat",
          aiProvider: settingsState.aiProvider,
          aiApiProtocol: settingsState.aiApiProtocol,
          aiApiKey: settingsState.aiApiKey,
          aiApiUrl: settingsState.aiApiUrl,
          aiModel: settingsState.aiModel,
        });

        if (!config?.apiKey || !config.apiUrl || !config.model) {
          throw new Error("AI_NOT_CONFIGURED");
        }

        try {
          const translationMode = settingsState.translationMode || "immersive";

          const systemPrompt =
            translationMode === "immersive"
              ? `You are a professional translator working on complete SKILL.md documents.

Return a valid SKILL.md document in ${targetLang}.

Rules:
1. The input may begin with YAML frontmatter between --- delimiters. Preserve the delimiters, key order, and valid YAML syntax.
2. In frontmatter, do NOT insert <t>...</t> lines. Keep YAML keys unchanged. Translate only human-readable text values such as description when appropriate. Leave identifiers, slug-like names, versions, URLs, file paths, and code-like values unchanged.
3. After the frontmatter, translate the markdown body in immersive mode: for each heading, paragraph, or list block, output the original block first, then output the translated block wrapped in <t>...</t>.
4. Do NOT translate fenced code blocks, inline code, command names, file paths, URLs, or YAML keys.
5. Preserve markdown structure. Output only the final SKILL.md document with no commentary.

Example input:
---
name: write
description: Help users write better.
---

## Overview
This skill helps you write tests.

Example output:
---
name: write
description: 帮助用户更好地写作。
---

## Overview
<t>## 概述</t>
This skill helps you write tests.
<t>此技能帮助你编写测试。</t>`
              : `You are a professional translator working on complete SKILL.md documents.

Return a valid translated SKILL.md document in ${targetLang}.

Rules:
1. Preserve YAML frontmatter delimiters, key order, and valid YAML syntax.
2. Keep YAML keys unchanged. Translate human-readable text values such as description when appropriate, but leave identifiers, slug-like names, versions, URLs, file paths, and code-like values unchanged.
3. Translate the markdown body fully while preserving markdown structure.
4. Do NOT translate fenced code blocks, inline code, command names, file paths, URLs, or YAML keys.
5. Output only the translated SKILL.md document with no commentary.`;

          const result = await chatCompletion(
            config,
            [
              { role: "system", content: systemPrompt },
              { role: "user", content },
            ],
            { temperature: 0.3, maxTokens: 8192 },
          );

          const translated = result.content;
          if (translated) {
            set((state) => {
              const updated = {
                ...state.translationCache,
                [cacheKey]: {
                  value: translated,
                  timestamp: Date.now(),
                  sourceFingerprint,
                },
              };
              return { translationCache: pruneTranslationCache(updated) };
            });
            return translated;
          }
          return null;
        } catch (error) {
          console.error("Translation failed:", error);
          throw error;
        }
      },

      getTranslationState: (cacheKey, sourceFingerprint) => {
        return getTranslationStateFromCache(
          get().translationCache,
          cacheKey,
          sourceFingerprint,
        );
      },

      getTranslation: (cacheKey) => {
        return getTranslationStateFromCache(get().translationCache, cacheKey)
          .value;
      },

      clearTranslation: (cacheKey) => {
        set((state) => {
          if (!state.translationCache[cacheKey]) {
            return state;
          }
          const nextCache = { ...state.translationCache };
          delete nextCache[cacheKey];
          return { translationCache: nextCache };
        });
      },
    }),
    {
      name: "skill-store",
      partialize: (state) => {
        // Only persist remote store entries that have at least one skill.
        // This prevents caching empty/failed results across sessions.
        const filteredEntries = normalizeRemoteStoreEntries(
          state.remoteStoreEntries,
          state.customStoreSources,
        );
        return {
          viewMode: state.viewMode,
          galleryColumns: state.galleryColumns,
          filterType: state.filterType,
          storeView: state.storeView,
          selectedProjectId: state.selectedProjectId,
          projectScanState: sanitizePersistedProjectScanState(
            state.projectScanState,
          ),
          agentScanState: sanitizePersistedAgentScanState(state.agentScanState),
          customStoreSources: state.customStoreSources,
          selectedStoreSourceId: state.selectedStoreSourceId,
          remoteStoreEntries: filteredEntries,
          translationCache: pruneTranslationCache(state.translationCache),
        };
      },
      merge: (persistedState, currentState) => {
        if (!isObjectRecord(persistedState)) {
          return currentState;
        }

        const persistedCustomStoreSources = Array.isArray(
          persistedState.customStoreSources,
        )
          ? (persistedState.customStoreSources as SkillStoreSource[])
          : currentState.customStoreSources;

        const persistedProjectScanState = isObjectRecord(
          persistedState.projectScanState,
        )
          ? (persistedState.projectScanState as Record<
              string,
              ProjectSkillScanState
            >)
          : currentState.projectScanState;
        const persistedAgentScanState = isObjectRecord(
          persistedState.agentScanState,
        )
          ? (persistedState.agentScanState as Record<string, AgentSkillScanState>)
          : currentState.agentScanState;
        const persistedTranslationCache = isObjectRecord(
          persistedState.translationCache,
        )
          ? (persistedState.translationCache as Record<
              string,
              TranslationCacheEntry
            >)
          : currentState.translationCache;

        return {
          ...currentState,
          ...persistedState,
          customStoreSources: persistedCustomStoreSources,
          projectScanState: sanitizePersistedProjectScanState(
            persistedProjectScanState,
          ),
          agentScanState: sanitizePersistedAgentScanState(
            persistedAgentScanState,
          ),
          remoteStoreEntries: normalizeRemoteStoreEntries(
            persistedState.remoteStoreEntries,
            persistedCustomStoreSources,
          ),
          translationCache: pruneTranslationCache(persistedTranslationCache),
        };
      },
    },
  ),
);
