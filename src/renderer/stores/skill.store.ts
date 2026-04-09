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
  SkillChatParams,
  ScanLocalResult,
  SkillSafetyLevel,
} from "../../shared/types";
import {
  BUILTIN_SKILL_REGISTRY,
  SKILL_CATEGORIES,
} from "../../shared/constants/skill-registry";
import { chatCompletion } from "../services/ai";
import { resolveScenarioModel } from "../services/ai-defaults";
import { filterVisibleSkills } from "../services/skill-filter";
import { normalizeSkill, normalizeSkills } from "../services/skill-normalize";
import {
  validateStoreSourceInput,
  type CustomStoreSourceType,
} from "../services/skill-store-source";
import { useSettingsStore } from "./settings.store";

export type SkillFilterType =
  | "all"
  | "favorites"
  | "installed"
  | "deployed"
  | "pending";
export type SkillViewMode = "gallery" | "list";
export type SkillStoreView = "my-skills" | "distribution" | "store";
// Translation cache constraints
// 翻译缓存限制
const TRANSLATION_CACHE_MAX_SIZE = 200;
const TRANSLATION_CACHE_EVICT_COUNT = 50;
const TRANSLATION_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
const REMOTE_CONTENT_CONCURRENCY = 6;
const REMOTE_REPO_SYNC_CONCURRENCY = 6;

interface ParsedGitHubSkillLocation {
  owner: string;
  repo: string;
  branch: string;
  directoryPath: string;
}

interface TranslationCacheEntry {
  value: string;
  timestamp: number;
}

export interface ScannedImportResult {
  importedCount: number;
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stripSkillFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
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
        if (parts.length >= 5 && parts[2] === "tree") {
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
        if (parts.length >= 5) {
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

function shouldSyncRemoteRepoFile(relativePath: string): boolean {
  const ext = relativePath.includes(".")
    ? relativePath.slice(relativePath.lastIndexOf(".")).toLowerCase()
    : "";
  return (
    ext === "" ||
    [
      ".md",
      ".mdx",
      ".txt",
      ".json",
      ".yaml",
      ".yml",
      ".toml",
      ".ini",
      ".cfg",
      ".js",
      ".mjs",
      ".cjs",
      ".ts",
      ".tsx",
      ".jsx",
      ".py",
      ".rb",
      ".go",
      ".rs",
      ".java",
      ".kt",
      ".swift",
      ".sh",
      ".bash",
      ".zsh",
      ".ps1",
      ".html",
      ".css",
      ".svg",
      ".xml",
      ".sql",
      ".r",
      ".lua",
      ".php",
      ".c",
      ".cpp",
      ".h",
      ".hpp",
      ".cs",
      ".lock",
      ".gitignore",
    ].includes(ext)
  );
}

async function syncRemoteGitHubSkillRepo(
  skillId: string,
  sourceUrl?: string,
  contentUrl?: string,
): Promise<void> {
  const location = parseGitHubSkillLocation(sourceUrl, contentUrl);
  if (!location || !location.directoryPath) {
    return;
  }

  const treeRaw = await window.api.skill.fetchRemoteContent(
    `https://api.github.com/repos/${location.owner}/${location.repo}/git/trees/${location.branch}?recursive=1`,
  );
  const treeData = parseJson<{
    tree?: Array<{ path?: string; type?: string }>;
  }>(treeRaw || "{}", {});
  const directoryPrefix = `${location.directoryPath}/`;
  const files = Array.isArray(treeData.tree)
    ? treeData.tree.filter(
        (entry): entry is { path: string; type: string } =>
          isGitHubTreeEntry(entry) &&
          entry.type === "blob" &&
          entry.path.startsWith(directoryPrefix),
      )
    : [];

  await runWithConcurrency(
    files,
    REMOTE_REPO_SYNC_CONCURRENCY,
    async (file) => {
      const relativePath = file.path.slice(directoryPrefix.length);
      if (!relativePath || !shouldSyncRemoteRepoFile(relativePath)) {
        return;
      }
      const rawUrl = `https://raw.githubusercontent.com/${location.owner}/${location.repo}/${location.branch}/${file.path}`;
      const content = await window.api.skill.fetchRemoteContent(rawUrl);
      await window.api.skill.writeLocalFile(skillId, relativePath, content);
    },
  );
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

  // Search & Filter
  searchQuery: string;
  filterType: SkillFilterType;

  // Skill Store (registry)
  // 技能商店（注册表）
  storeView: SkillStoreView;
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
      error?: string | null;
      skills: RegistrySkill[];
    }
  >;

  // Actions
  loadSkills: () => Promise<void>;
  selectSkill: (id: string | null) => void;
  createSkill: (data: CreateSkillParams) => Promise<Skill | null>;
  updateSkill: (id: string, data: UpdateSkillParams) => Promise<Skill | null>;
  syncSkillFromRepo: (id: string) => Promise<Skill | null>;
  deleteSkill: (id: string) => Promise<boolean>;
  toggleFavorite: (id: string) => Promise<void>;
  scanLocalSkills: () => Promise<ScanLocalResult>;
  scanLocalPreview: (customPaths?: string[]) => Promise<ScannedSkill[]>;
  importScannedSkills: (
    skills: ScannedSkill[],
    userTagsByPath?: Record<string, string[]>,
  ) => Promise<ScannedImportResult>;
  scanInstalledSkillSafety: (
    skillIds?: string[],
  ) => Promise<SkillSafetyBatchSummary>;
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
  loadRegistry: () => void;
  installRegistrySkill: (skill: RegistrySkill) => Promise<Skill | null>;
  installFromRegistry: (slug: string) => Promise<Skill | null>;
  uninstallRegistrySkill: (slug: string) => Promise<boolean>;
  setStoreCategory: (category: SkillCategory | "all") => void;
  setStoreSearchQuery: (query: string) => void;
  selectRegistrySkill: (slug: string | null) => void;
  selectStoreSource: (id: string) => void;
  upsertRegistrySkills: (skills: RegistrySkill[]) => void;
  addCustomStoreSource: (
    name: string,
    url: string,
    type?: CustomStoreSourceType,
  ) => void;
  removeCustomStoreSource: (id: string) => void;
  toggleCustomStoreSource: (id: string) => void;
  setRemoteStoreEntry: (
    sourceId: string,
    entry: { loadedAt: number; error?: string | null; skills: RegistrySkill[] },
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
  loadDeployedStatus: () => Promise<void>;

  // Translation cache (with TTL + size limit)
  // 翻译缓存（带 TTL + 大小限制）
  translationCache: Record<string, TranslationCacheEntry>;
  translateContent: (
    content: string,
    cacheKey: string,
    targetLang: string,
    options?: { forceRefresh?: boolean },
  ) => Promise<string | null>;
  getTranslation: (cacheKey: string) => string | null;
  clearTranslation: (cacheKey: string) => void;
}

export const useSkillStore = create<SkillState>()(
  persist(
    (set, get) => ({
      skills: [],
      selectedSkillId: null,
      isLoading: false,
      error: null,
      viewMode: "gallery" as SkillViewMode,
      searchQuery: "",
      filterType: "all",
      filterTags: [] as string[],

      // Deployed tracking
      deployedSkillNames: new Set<string>(),

      // Skill Store state
      storeView: "my-skills" as SkillStoreView,
      registrySkills: [] as RegistrySkill[],
      isLoadingRegistry: false,
      storeCategory: "all" as SkillCategory | "all",
      storeSearchQuery: "",
      selectedRegistrySlug: null,
      customStoreSources: [] as SkillStoreSource[],
      selectedStoreSourceId: "official",
      remoteStoreEntries: {},

      loadSkills: async () => {
        set({ isLoading: true, error: null });
        try {
          const skills = normalizeSkills(await window.api.skill.getAll());
          set({ skills, isLoading: false });
        } catch (error) {
          console.error("Failed to load skills:", error);
          set({ error: String(error), isLoading: false });
        }
      },

      loadDeployedStatus: async () => {
        const { skills } = get();
        const deployed = new Set<string>();
        try {
          const skillNames = skills.map((s) => s.name);
          const results =
            await window.api.skill.getMdInstallStatusBatch(skillNames);
          for (const [name, status] of Object.entries(results)) {
            if (Object.values(status).some(Boolean)) {
              deployed.add(name);
            }
          }
        } catch (error) {
          console.warn("Failed to load deployed status:", error);
        }
        set({ deployedSkillNames: deployed });
      },

      selectSkill: (id) => {
        set({ selectedSkillId: id });
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

      deleteSkill: async (id) => {
        try {
          const success = await window.api.skill.delete(id);
          if (success) {
            set((state) => ({
              skills: state.skills.filter((s) => s.id !== id),
              selectedSkillId:
                state.selectedSkillId === id ? null : state.selectedSkillId,
            }));
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
          const scannedSkills =
            await window.api.skill.scanLocalPreview(customPaths);
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
      ) => {
        set({ isLoading: true, error: null });
        try {
          let importCount = 0;
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
                local_repo_path: scanned.localPath,
              });

              // Copy skill files from original location into local repo
              // localPath is the parent directory of SKILL.md (skill folder path)
              if (scanned.localPath) {
                try {
                  const repoPath = await window.api.skill.saveToRepo(
                    scanned.name,
                    scanned.localPath,
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
          const skills = await window.api.skill.getAll();
          set({ skills, isLoading: false });
          return { importedCount: importCount, skipped, failed };
        } catch (error) {
          console.error("Failed to import scanned skills:", error);
          set({ error: String(error), isLoading: false });
          return {
            importedCount: 0,
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

      scanInstalledSkillSafety: async (skillIds) => {
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
          });
          summary.bySkillId[skill.id] = report.level;

          if (report.level === "safe") {
            summary.safe += 1;
          } else if (report.level === "warn") {
            summary.warn += 1;
          } else if (report.level === "high-risk") {
            summary.highRisk += 1;
          } else {
            summary.blocked += 1;
          }
        }

        return summary;
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
        set({ storeView: view, selectedRegistrySlug: null });
      },

      loadRegistry: () => {
        set({ isLoadingRegistry: true });
        // Load built-in registry with embedded content
        // 加载内置注册表（使用嵌入内容）
        const registry = [...BUILTIN_SKILL_REGISTRY];
        set({ registrySkills: registry, isLoadingRegistry: false });

        // If any skills have content_url, fetch real content in the background
        // 如果有技能有 content_url，在后台获取真实内容
        const withUrls = registry.filter((s) => s.content_url);
        if (withUrls.length > 0) {
          (async () => {
            const updated = [...registry];
            let hasUpdates = false;

            await runWithConcurrency(
              updated,
              REMOTE_CONTENT_CONCURRENCY,
              async (skill, index) => {
                if (!skill.content_url) return;
                try {
                  const realContent = await window.api.skill.fetchRemoteContent(
                    skill.content_url,
                  );
                  if (realContent && realContent.trim().length > 0) {
                    updated[index] = { ...skill, content: realContent };
                    hasUpdates = true;
                  }
                } catch {
                  // Silently fall back to embedded content
                }
              },
            );

            if (hasUpdates) {
              set({ registrySkills: [...updated] });
            }
          })();
        }
      },

      installRegistrySkill: async (regSkill) => {
        try {
          let effectiveContent = regSkill.content;
          if (regSkill.content_url) {
            try {
              const freshContent = await window.api.skill.fetchRemoteContent(
                regSkill.content_url,
              );
              if (freshContent.trim()) {
                effectiveContent = freshContent;
              }
            } catch (fetchError) {
              console.warn(
                `Failed to fetch fresh SKILL.md for "${regSkill.slug}", falling back to cached registry content:`,
                fetchError,
              );
            }
          }

          if (!hasMeaningfulSkillBody(effectiveContent)) {
            throw new Error(
              `Unable to fetch the full SKILL.md for "${regSkill.name}". The registry only has summary metadata right now, so installation was blocked to avoid creating an incomplete skill.`,
            );
          }

          const newSkill = await window.api.skill.create({
            name: regSkill.install_name || regSkill.slug,
            description: regSkill.description,
            instructions: effectiveContent,
            content: effectiveContent,
            protocol_type: "skill",
            version: regSkill.version,
            author: regSkill.author,
            source_url: regSkill.source_url,
            tags: [],
            original_tags: regSkill.tags,
            is_favorite: false,
            icon_url: regSkill.icon_url,
            icon_emoji: regSkill.icon_emoji,
            category: regSkill.category,
            is_builtin: true,
            registry_slug: regSkill.slug,
            content_url: regSkill.content_url,
            prerequisites: regSkill.prerequisites,
            compatibility: regSkill.compatibility,
          });
          if (newSkill) {
            try {
              await window.api.skill.writeLocalFile(
                newSkill.id,
                "SKILL.md",
                effectiveContent,
              );
              await syncRemoteGitHubSkillRepo(
                newSkill.id,
                regSkill.source_url,
                regSkill.content_url,
              );
            } catch (repoError) {
              console.warn(
                `Failed to create local repo for registry skill "${regSkill.slug}":`,
                repoError,
              );
            }
            await get().loadSkills();
            return newSkill;
          }
          return null;
        } catch (error: unknown) {
          throw new Error(getErrorMessage(error) || "Failed to install skill");
        }
      },

      installFromRegistry: async (slug) => {
        const { registrySkills, installRegistrySkill } = get();
        const regSkill = registrySkills.find((s) => s.slug === slug);
        if (!regSkill) return null;
        return installRegistrySkill(regSkill);
      },

      uninstallRegistrySkill: async (slug) => {
        const { skills, loadSkills } = get();
        const skill = skills.find((s) => s.registry_slug === slug);
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

      selectRegistrySkill: (slug) => {
        set({ selectedRegistrySlug: slug });
      },

      selectStoreSource: (id) => {
        set({ selectedStoreSourceId: id });
      },

      upsertRegistrySkills: (incomingSkills) => {
        set((state) => {
          const merged = [...state.registrySkills];
          const indexBySlug = new Map(
            merged.map((skill, index) => [skill.slug, index]),
          );

          for (const incoming of incomingSkills) {
            const index = indexBySlug.get(incoming.slug);
            if (index !== undefined) {
              merged[index] = { ...merged[index], ...incoming };
            } else {
              indexBySlug.set(incoming.slug, merged.length);
              merged.push(incoming);
            }
          }

          return { registrySkills: merged };
        });
      },

      addCustomStoreSource: (name, url, type = "marketplace-json") => {
        const trimmedName = name.trim();
        const trimmedUrl = validateStoreSourceInput(url.trim(), type);
        if (!trimmedName || !trimmedUrl) return;

        const newId = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        set((state) => ({
          customStoreSources: [
            {
              id: newId,
              name: trimmedName,
              type,
              url: trimmedUrl,
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
          .skills.filter((s) => s.registry_slug)
          .map((s) => s.registry_slug!);
      },

      getRecommendedSkills: () => {
        const installedSlugs = get().getInstalledSlugs();
        return get().registrySkills.filter(
          (s) => !installedSlugs.includes(s.slug),
        );
      },

      getFilteredRegistrySkills: () => {
        const { registrySkills, skills, storeCategory, storeSearchQuery } =
          get();
        const installedSlugs = skills
          .filter((s) => s.registry_slug)
          .map((s) => s.registry_slug!);

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

        const installed = filtered.filter((s) =>
          installedSlugs.includes(s.slug),
        );
        const recommended = filtered.filter(
          (s) => !installedSlugs.includes(s.slug),
        );

        return { installed, recommended };
      },

      // ─── Translation / 翻译 ───
      translationCache: {} as Record<string, TranslationCacheEntry>,

      translateContent: async (content, cacheKey, targetLang, options) => {
        // Check cache first (with TTL validation)
        // 先检查缓存（带 TTL 校验）
        const cached = get().translationCache[cacheKey];
        if (
          !options?.forceRefresh &&
          cached &&
          Date.now() - cached.timestamp < TRANSLATION_CACHE_TTL
        ) {
          return cached.value;
        }

        // Get AI config from settings store
        const settingsState = useSettingsStore.getState();
        const defaultModel = resolveScenarioModel(
          settingsState.aiModels,
          settingsState.scenarioModelDefaults,
          "translation",
          "chat",
        );

        const config = defaultModel
          ? {
              provider: defaultModel.provider,
              apiKey: defaultModel.apiKey,
              apiUrl: defaultModel.apiUrl,
              model: defaultModel.model,
              chatParams: defaultModel.chatParams as
                | SkillChatParams
                | undefined,
            }
          : {
              provider: settingsState.aiProvider,
              apiKey: settingsState.aiApiKey,
              apiUrl: settingsState.aiApiUrl,
              model: settingsState.aiModel,
            };

        if (!config.apiKey || !config.apiUrl || !config.model) {
          throw new Error("AI_NOT_CONFIGURED");
        }

        try {
          const translationMode = settingsState.translationMode || "immersive";

          const systemPrompt =
            translationMode === "immersive"
              ? `You are a professional immersive translator. Your task is to produce a bilingual interleaved document.

Rules:
1. Process the input paragraph by paragraph (split by blank lines or headings).
2. For EACH paragraph/heading/list-block, output the ORIGINAL text first, then on the very next line output the translated version wrapped in an HTML tag: <t>translated text</t>
3. Preserve ALL markdown formatting, code blocks, and technical terms in both versions.
4. Do NOT translate code blocks — just keep them as-is without a <t>...</t> line.
5. Do NOT add any extra commentary, just the interleaved output.
6. Target language: ${targetLang}

Example input:
## Overview
This skill helps you write tests.

Example output:
## Overview
<t>## 概述</t>
This skill helps you write tests.
<t>此技能帮助你编写测试。</t>`
              : `You are a professional translator. Translate the following technical documentation to ${targetLang}. Preserve all markdown formatting, code blocks, and technical terms. Only output the translated text, nothing else.`;

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
                [cacheKey]: { value: translated, timestamp: Date.now() },
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

      getTranslation: (cacheKey) => {
        const entry = get().translationCache[cacheKey];
        if (!entry) return null;
        // Return null if expired / 过期则返回 null
        if (Date.now() - entry.timestamp >= TRANSLATION_CACHE_TTL) return null;
        return entry.value;
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
      partialize: (state) => ({
        viewMode: state.viewMode,
        filterType: state.filterType,
        storeView: state.storeView,
        customStoreSources: state.customStoreSources,
        selectedStoreSourceId: state.selectedStoreSourceId,
        remoteStoreEntries: state.remoteStoreEntries,
      }),
    },
  ),
);
