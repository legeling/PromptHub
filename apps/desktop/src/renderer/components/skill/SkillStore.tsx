import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  SearchIcon,
  Loader2Icon,
  LayoutGridIcon,
  CodeIcon,
  SparklesIcon,
  BarChartIcon,
  ShieldIcon,
  RocketIcon,
  PaletteIcon,
  WandIcon,
  BriefcaseIcon,
  FileSpreadsheetIcon,
  BoxesIcon,
  GlobeIcon,
  FolderIcon,
  DatabaseIcon,
  RefreshCwIcon,
} from "lucide-react";
import { SkillStoreDetail } from "./SkillStoreDetail";
import { SkillStoreCard } from "./SkillStoreCard";
import { SkillStoreCustomSources } from "./SkillStoreCustomSources";
import { SkillStoreSourceForm } from "./SkillStoreSourceForm";
import { useSkillStore } from "../../stores/skill.store";
import { useSettingsStore } from "../../stores/settings.store";
import { isLikelyLocalSource } from "../../services/skill-store-source";
import {
  parseSkillsShDetail,
  parseSkillsShLeaderboard,
  SKILLS_SH_BASE_URL,
} from "../../services/skills-sh-store";
import { useToast } from "../ui/Toast";
import type {
  DeviceManagementSettings,
  GitHubRepoMetadata,
  GitHubTreeEntry,
  GitHubTreeResponse,
  MarketplaceReferenceEntry,
  MarketplaceRegistryDocument,
  MarketplaceSkillEntry,
  RegistrySkill,
  Settings,
  SkillCategory,
  SkillStoreSource,
} from "@prompthub/shared/types";
import { SKILL_CATEGORIES } from "@prompthub/shared/constants/skill-registry";
import { getSafetyScanAIConfig } from "./detail-utils";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  all: <LayoutGridIcon className="w-3.5 h-3.5" />,
  office: <FileSpreadsheetIcon className="w-3.5 h-3.5" />,
  dev: <CodeIcon className="w-3.5 h-3.5" />,
  ai: <SparklesIcon className="w-3.5 h-3.5" />,
  data: <BarChartIcon className="w-3.5 h-3.5" />,
  management: <BriefcaseIcon className="w-3.5 h-3.5" />,
  deploy: <RocketIcon className="w-3.5 h-3.5" />,
  design: <PaletteIcon className="w-3.5 h-3.5" />,
  security: <ShieldIcon className="w-3.5 h-3.5" />,
  meta: <WandIcon className="w-3.5 h-3.5" />,
};

const CUSTOM_SOURCE_TYPE_OPTIONS: Array<{
  value: Extract<
    SkillStoreSource["type"],
    "marketplace-json" | "git-repo" | "local-dir"
  >;
  icon: React.ReactNode;
}> = [
  {
    value: "marketplace-json",
    icon: <DatabaseIcon className="w-4 h-4" />,
  },
  {
    value: "git-repo",
    icon: <GlobeIcon className="w-4 h-4" />,
  },
  {
    value: "local-dir",
    icon: <FolderIcon className="w-4 h-4" />,
  },
];

const MAX_REMOTE_STORE_DEPTH = 3;
const MAX_SKILLS_SH_SKILLS = 24;
const SKILLS_SH_CONCURRENCY = 4;

function stripQuotes(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function parseFrontmatter(content: string) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return { name: "", description: "", tags: [] as string[] };
  }

  const block = match[1];
  const tagsLine = block.match(/^tags:\s*\[(.+)\]$/m)?.[1] ?? "";

  return {
    name: stripQuotes(block.match(/^name:\s*(.+)$/m)?.[1] ?? ""),
    description: stripQuotes(block.match(/^description:\s*(.+)$/m)?.[1] ?? ""),
    tags: tagsLine
      .split(",")
      .map((tag) => stripQuotes(tag))
      .filter(Boolean),
  };
}

function toTitleCase(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferCategory(slug: string, description: string): SkillCategory {
  const text = `${slug} ${description}`.toLowerCase();
  if (/(pdf|doc|ppt|sheet|spreadsheet|word|xlsx|docx)/.test(text))
    return "office";
  if (/(github|git|web|playwright|mcp|code|cli|dev|pr)/.test(text))
    return "dev";
  if (/(design|figma|css|ui|frontend|canvas|brand)/.test(text)) return "design";
  if (/(deploy|vercel|docker|cloudflare|netlify)/.test(text)) return "deploy";
  if (/(secure|security|audit|auth|secret)/.test(text)) return "security";
  if (/(analy|data|sql|chart|research)/.test(text)) return "data";
  if (/(manage|project|notion|linear)/.test(text)) return "management";
  if (/(ai|generate|translation|speech|image|video|art)/.test(text))
    return "ai";
  return "general";
}

function resolveUrl(baseUrl: string, value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function parseGithubRepo(url: string) {
  const normalized = url
    .trim()
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "");
  const match = normalized.match(/github\.com\/([^/]+)\/([^/]+)/i);
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2],
    repositoryUrl: `https://github.com/${match[1]}/${match[2]}`,
  };
}

function dedupeRegistrySkills(skills: RegistrySkill[]) {
  const bySlug = new Map<string, RegistrySkill>();
  // Also deduplicate by normalized name to stay consistent with the
  // backend SkillDB which uses LOWER(name) as the uniqueness key.
  const seenNames = new Set<string>();
  for (const skill of skills) {
    if (bySlug.has(skill.slug)) continue;
    const normalizedName = (skill.install_name || skill.slug).toLowerCase();
    if (seenNames.has(normalizedName)) continue;
    bySlug.set(skill.slug, skill);
    seenNames.add(normalizedName);
  }
  return Array.from(bySlug.values());
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isGitHubRateLimitError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("github api rate limit reached");
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function cadenceToMs(
  cadence: DeviceManagementSettings["storeSyncCadence"],
): number | null {
  switch (cadence) {
    case "1h":
      return 60 * 60 * 1000;
    case "1d":
      return 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R | null>,
): Promise<R[]> {
  const results: Array<R | null> = new Array(items.length).fill(null);
  let nextIndex = 0;

  const runWorker = async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => runWorker()),
  );

  return results.filter(isDefined);
}

function isGitHubTreeEntry(
  entry: GitHubTreeEntry | null | undefined,
): entry is GitHubTreeEntry & { path: string; type: string } {
  return Boolean(
    entry && typeof entry.path === "string" && typeof entry.type === "string",
  );
}

function resolveMarketplaceReference(
  entry: string | MarketplaceReferenceEntry,
): string | undefined {
  if (typeof entry === "string") return entry;
  return entry.url || entry.index || entry.manifest;
}

export function SkillStore() {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language?.startsWith("zh");

  const loadRegistry = useSkillStore((state) => state.loadRegistry);
  const storeCategory = useSkillStore((state) => state.storeCategory) ?? "all";
  const setStoreCategory = useSkillStore((state) => state.setStoreCategory);
  const storeSearchQuery =
    useSkillStore((state) => state.storeSearchQuery) ?? "";
  const setStoreSearchQuery = useSkillStore(
    (state) => state.setStoreSearchQuery,
  );
  const installRegistrySkill = useSkillStore(
    (state) => state.installRegistrySkill,
  );
  const scanLocalPreview = useSkillStore((state) => state.scanLocalPreview);
  const skills = useSkillStore((state) => state.skills);
  const selectRegistrySkill = useSkillStore(
    (state) => state.selectRegistrySkill,
  );
  const selectedRegistrySlug = useSkillStore(
    (state) => state.selectedRegistrySlug,
  );
  const registrySkills = useSkillStore((state) => state.registrySkills) ?? [];
  const selectedStoreSourceId = useSkillStore(
    (state) => state.selectedStoreSourceId,
  ) ?? "official";
  const selectStoreSource = useSkillStore((state) => state.selectStoreSource);
  const customStoreSources =
    useSkillStore((state) => state.customStoreSources) ?? [];
  const addCustomStoreSource = useSkillStore(
    (state) => state.addCustomStoreSource,
  );
  const removeCustomStoreSource = useSkillStore(
    (state) => state.removeCustomStoreSource,
  );
  const toggleCustomStoreSource = useSkillStore(
    (state) => state.toggleCustomStoreSource,
  );
  const remoteStoreEntries =
    useSkillStore((state) => state.remoteStoreEntries) ?? {};
  const setRemoteStoreEntry = useSkillStore(
    (state) => state.setRemoteStoreEntry,
  );

  const [installingSlug, setInstallingSlug] = useState<string | null>(null);
  const [sourceType, setSourceType] =
    useState<
      Extract<
        SkillStoreSource["type"],
        "marketplace-json" | "git-repo" | "local-dir"
      >
    >("marketplace-json");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [loadingSourceId, setLoadingSourceId] = useState<string | null>(null);
  const remoteStoreEntriesRef = useRef(remoteStoreEntries);
  const inflightStoreLoadsRef = useRef(new Map<string, Promise<void>>());
  const { showToast } = useToast();
  const autoScanBeforeInstall = useSettingsStore(
    (state) => state.autoScanStoreSkillsBeforeInstall,
  );
  const aiModels = useSettingsStore((state) => state.aiModels);

  useEffect(() => {
    remoteStoreEntriesRef.current = remoteStoreEntries;
  }, [remoteStoreEntries]);

  useEffect(() => {
    if (typeof loadRegistry === "function") {
      void loadRegistry();
    }
  }, [loadRegistry]);

  const installedSlugs = useMemo(() => {
    return skills
      .filter((skill) => skill.registry_slug)
      .map((skill) => skill.registry_slug!);
  }, [skills]);

  // Locally-imported skills won't have registry_slug but may share a name
  // with a registry skill.  Build a lowercase name set so the UI can
  // correctly mark them as "installed" even without a slug match.
  const installedNamesLower = useMemo(() => {
    return new Set(skills.map((skill) => skill.name.toLowerCase()));
  }, [skills]);

  const selectedCustomSource = useMemo(
    () =>
      customStoreSources.find(
        (source) => source.id === selectedStoreSourceId,
      ) || null,
    [customStoreSources, selectedStoreSourceId],
  );

  const selectedRemoteEntry = remoteStoreEntries[selectedStoreSourceId];
  const isSelectedSourceRemote =
    selectedStoreSourceId === "claude-code" ||
    selectedStoreSourceId === "community" ||
    Boolean(selectedCustomSource);

  const loadGitHubSkillRepo = useCallback(
    async (repoUrl: string): Promise<RegistrySkill[]> => {
      const parsedRepo = parseGithubRepo(repoUrl);
      if (!parsedRepo) {
        throw new Error(
          t(
            "skill.invalidGitRepo",
            "Please enter a GitHub repository URL, or use a local directory path instead",
          ),
        );
      }

      let repoMetaRaw: string;
      try {
        repoMetaRaw = await window.api.skill.fetchRemoteContent(
          `https://api.github.com/repos/${parsedRepo.owner}/${parsedRepo.repo}`,
        );
      } catch (error) {
        if (isGitHubRateLimitError(error)) {
          throw new Error(
            t(
              "skill.remoteStoreRateLimitHint",
              "GitHub API rate limit reached. Try again in a few minutes, or add a GitHub token in settings.",
            ),
          );
        }
        throw error;
      }
      const repoMeta = parseJson<GitHubRepoMetadata>(repoMetaRaw || "{}", {});
      const defaultBranch = repoMeta.default_branch || "main";

      let treeRaw: string;
      try {
        treeRaw = await window.api.skill.fetchRemoteContent(
          `https://api.github.com/repos/${parsedRepo.owner}/${parsedRepo.repo}/git/trees/${defaultBranch}?recursive=1`,
        );
      } catch (error) {
        if (isGitHubRateLimitError(error)) {
          throw new Error(
            t(
              "skill.remoteStoreRateLimitHint",
              "GitHub API rate limit reached. Try again in a few minutes, or add a GitHub token in settings.",
            ),
          );
        }
        throw error;
      }
      const treeData = parseJson<GitHubTreeResponse>(treeRaw || "{}", {});
      const skillFiles = Array.isArray(treeData.tree)
        ? treeData.tree.filter(
            (item): item is GitHubTreeEntry & { path: string; type: string } =>
              isGitHubTreeEntry(item) &&
              item.type === "blob" &&
              item.path.endsWith("/SKILL.md"),
          )
        : [];

      const builtinBySlug = new Map(
        registrySkills.map((skill) => [skill.slug, skill]),
      );

      const remoteSkills = await Promise.all(
        skillFiles.map(async (item) => {
          const path = item.path;
          const slug = path.split("/").slice(-2, -1)[0];
          const rawUrl = `https://raw.githubusercontent.com/${parsedRepo.owner}/${parsedRepo.repo}/${defaultBranch}/${path}`;
          const sourceRepoUrl = `${parsedRepo.repositoryUrl}/tree/${defaultBranch}/${path.replace(/\/SKILL\.md$/, "")}`;
          let content: string;
          try {
            content = await window.api.skill.fetchRemoteContent(rawUrl);
          } catch {
            return null;
          }
          if (!content) return null;

          const builtin = builtinBySlug.get(slug);
          const parsed = parseFrontmatter(content);
          const description =
            parsed.description ||
            builtin?.description ||
            `${toTitleCase(slug)} skill`;

          return {
            slug,
            name: builtin?.name || parsed.name || toTitleCase(slug),
            description,
            category: builtin?.category || inferCategory(slug, description),
            icon_url: builtin?.icon_url,
            icon_emoji: builtin?.icon_emoji,
            author:
              builtin?.author ||
              repoMeta?.owner?.login ||
              (parsedRepo.owner === "anthropics"
                ? "Anthropic"
                : parsedRepo.owner),
            source_url: sourceRepoUrl,
            tags: builtin?.tags?.length
              ? builtin.tags
              : parsed.tags.length
                ? parsed.tags
                : slug.split(/[-_]/).filter(Boolean),
            version: builtin?.version || "1.0.0",
            content,
            content_url: rawUrl,
            prerequisites: builtin?.prerequisites,
            compatibility: builtin?.compatibility || ["claude", "cursor"],
          } satisfies RegistrySkill;
        }),
      );

      return dedupeRegistrySkills(remoteSkills.filter(isDefined));
    },
    [registrySkills, t],
  );

  const loadMarketplaceStore = useCallback(
    async (
      url: string,
      visited = new Set<string>(),
      depth = 0,
    ): Promise<RegistrySkill[]> => {
      const resolvedUrl = resolveUrl(url, url);
      if (
        !resolvedUrl ||
        visited.has(resolvedUrl) ||
        depth > MAX_REMOTE_STORE_DEPTH
      ) {
        return [];
      }
      visited.add(resolvedUrl);

      const raw = await window.api.skill
        .fetchRemoteContent(resolvedUrl)
        .catch(() => null);
      if (!raw) return [];

      const data = parseJson<MarketplaceRegistryDocument>(raw, {});
      const builtinBySlug = new Map(
        registrySkills.map((skill) => [skill.slug, skill]),
      );
      const directSkills = Array.isArray(data.skills) ? data.skills : [];

      const mappedSkills = await Promise.all(
        directSkills.map(async (item: MarketplaceSkillEntry) => {
          const slug =
            item.slug ||
            item.id ||
            slugify(item.name || item.title || "remote-skill");
          if (!slug) return null;

          const builtin = builtinBySlug.get(slug);
          const contentUrl =
            resolveUrl(
              resolvedUrl,
              item.content_url ||
                item.contentUrl ||
                item.skill_url ||
                item.skillUrl ||
                item.raw_url ||
                item.rawUrl,
            ) || undefined;
          const sourceUrl =
            resolveUrl(
              resolvedUrl,
              item.source_url ||
                item.sourceUrl ||
                item.repo_url ||
                item.repoUrl ||
                item.repository ||
                item.repo,
            ) ||
            contentUrl ||
            resolvedUrl;

          let content = typeof item.content === "string" ? item.content : "";
          if (!content && contentUrl) {
            try {
              content = await window.api.skill.fetchRemoteContent(contentUrl);
            } catch {
              content = "";
            }
          }

          const parsed = content
            ? parseFrontmatter(content)
            : { name: "", description: "", tags: [] as string[] };
          const description =
            item.description ||
            parsed.description ||
            builtin?.description ||
            `${toTitleCase(slug)} skill`;

          return {
            slug,
            name:
              item.name ||
              item.title ||
              parsed.name ||
              builtin?.name ||
              toTitleCase(slug),
            install_name: item.install_name || item.installName,
            description,
            category:
              item.category ||
              builtin?.category ||
              inferCategory(slug, description),
            icon_url: item.icon_url || item.iconUrl || builtin?.icon_url,
            icon_emoji:
              item.icon_emoji || item.iconEmoji || builtin?.icon_emoji,
            author: item.author || builtin?.author || "Community",
            source_url: sourceUrl,
            store_url: item.store_url || item.storeUrl,
            tags:
              Array.isArray(item.tags) && item.tags.length > 0
                ? item.tags
                : parsed.tags.length > 0
                  ? parsed.tags
                  : builtin?.tags || slug.split(/[-_]/).filter(Boolean),
            version: String(item.version || builtin?.version || "1.0.0"),
            content:
              content || `# ${item.name || parsed.name || toTitleCase(slug)}`,
            content_url: contentUrl,
            prerequisites: Array.isArray(item.prerequisites)
              ? item.prerequisites
              : builtin?.prerequisites,
            compatibility: Array.isArray(item.compatibility)
              ? item.compatibility
              : builtin?.compatibility || ["claude", "cursor"],
            weekly_installs: item.weekly_installs || item.weeklyInstalls,
            github_stars: item.github_stars || item.githubStars,
            installed_on: item.installed_on || item.installedOn,
            security_audits: item.security_audits || item.securityAudits,
          } satisfies RegistrySkill;
        }),
      );

      const nestedStoreRefs = [
        ...(Array.isArray(data.marketplaces) ? data.marketplaces : []),
        ...(Array.isArray(data.sources) ? data.sources : []),
        ...(Array.isArray(data.registries) ? data.registries : []),
      ]
        .map((entry) => resolveMarketplaceReference(entry))
        .filter(Boolean)
        .map((entry: string) => resolveUrl(resolvedUrl, entry))
        .filter((entry: string | null): entry is string => Boolean(entry));

      const nestedSkills = await Promise.all(
        nestedStoreRefs.map((entry) =>
          loadMarketplaceStore(entry, visited, depth + 1),
        ),
      );

      return dedupeRegistrySkills([
        ...mappedSkills.filter(isDefined),
        ...nestedSkills.flat(),
      ]);
    },
    [registrySkills],
  );

  const loadLocalDirectoryStore = useCallback(
    async (dirPath: string): Promise<RegistrySkill[]> => {
      const scannedSkills = await scanLocalPreview([dirPath]);
      const mapped = scannedSkills.map((skill) => ({
        slug: slugify(skill.name),
        name: skill.name,
        description: skill.description || `${skill.name} skill`,
        category: inferCategory(skill.name, skill.description || ""),
        author: skill.author || "Local",
        source_url: skill.localPath || dirPath,
        tags: skill.tags?.length
          ? skill.tags
          : slugify(skill.name).split("-").filter(Boolean),
        version: skill.version || "1.0.0",
        content: skill.instructions,
        content_url: skill.filePath,
        compatibility: skill.platforms,
      }));
      // Deduplicate by slug, consistent with other store loaders
      return dedupeRegistrySkills(mapped);
    },
    [scanLocalPreview],
  );

  const loadSkillsShStore = useCallback(async (): Promise<RegistrySkill[]> => {
    const leaderboardHtml =
      await window.api.skill.fetchRemoteContent(SKILLS_SH_BASE_URL);
    const entries = parseSkillsShLeaderboard(leaderboardHtml, {
      limit: MAX_SKILLS_SH_SKILLS,
    });

    const skillsFromDetails = await runWithConcurrency(
      entries,
      SKILLS_SH_CONCURRENCY,
      async (entry) => {
        try {
          const detailHtml = await window.api.skill.fetchRemoteContent(
            entry.detailUrl,
          );
          return parseSkillsShDetail(detailHtml, entry);
        } catch {
          return null;
        }
      },
    );

    return dedupeRegistrySkills(skillsFromDetails);
  }, []);

  const loadStoreSource = useCallback(
    async (sourceId: string, forceRefresh = false) => {
      if (typeof setRemoteStoreEntry !== "function") {
        return;
      }

      if (sourceId === "official" || sourceId === "new-custom") {
        return;
      }

      const source =
        sourceId === "claude-code"
          ? {
              id: "claude-code",
              type: "git-repo" as const,
              url: "https://github.com/anthropics/skills",
            }
          : sourceId === "community"
            ? {
                id: "community",
                type: "skills-sh" as const,
                url: SKILLS_SH_BASE_URL,
              }
            : customStoreSources.find((item) => item.id === sourceId);

      if (!source) return;
      if ("enabled" in source && !source.enabled) return;

      const loadKey = `${sourceId}:${forceRefresh ? "force" : "cached"}`;
      const inflightLoad = inflightStoreLoadsRef.current.get(loadKey);
      if (inflightLoad) {
        await inflightLoad;
        return;
      }

      const cachedEntry = remoteStoreEntriesRef.current[sourceId];
      // Cache is permanent — only bypass when user explicitly requests a refresh.
      // A cached entry with skills is always considered fresh.
      const hasCachedSkills = cachedEntry && cachedEntry.skills.length > 0;
      const hasCachedFailure = Boolean(cachedEntry?.error);
      // Failed loads should not auto-retry on every rerender.
      // They may be retried via manual refresh or scheduled force refresh.
      if (!forceRefresh && hasCachedFailure) return;
      if (!forceRefresh && hasCachedSkills) return;

      const loadPromise = (async () => {
        setLoadingSourceId(sourceId);
        try {
          let skillsForSource: RegistrySkill[] = [];
          if (source.type === "git-repo") {
            skillsForSource = isLikelyLocalSource(source.url)
              ? await loadLocalDirectoryStore(source.url)
              : await loadGitHubSkillRepo(source.url);
          } else if (source.type === "skills-sh") {
            skillsForSource = await loadSkillsShStore();
          } else if (source.type === "marketplace-json") {
            skillsForSource = await loadMarketplaceStore(source.url);
          } else if (source.type === "local-dir") {
            skillsForSource = await loadLocalDirectoryStore(source.url);
          }

          setRemoteStoreEntry(sourceId, {
            loadedAt: Date.now(),
            error: null,
            skills: skillsForSource,
          });
        } catch (error) {
          console.error(`Failed to load remote store ${sourceId}:`, error);
          // Do NOT update loadedAt on failure — keeps cache stale so next visit retries automatically.
          // Preserve previously-cached skills (if any) so the UI isn't wiped.
          setRemoteStoreEntry(sourceId, {
            loadedAt: cachedEntry?.loadedAt || 0,
            error:
              error instanceof Error
                ? error.message
                : t("skill.remoteStoreLoadFailed", "Failed to load remote store"),
            skills: cachedEntry?.skills || [],
          });
        } finally {
          inflightStoreLoadsRef.current.delete(loadKey);
          setLoadingSourceId((current) =>
            current === sourceId ? null : current,
          );
        }
      })();

      inflightStoreLoadsRef.current.set(loadKey, loadPromise);
      await loadPromise;
    },
    [
      customStoreSources,
      loadGitHubSkillRepo,
      loadLocalDirectoryStore,
      loadMarketplaceStore,
      loadSkillsShStore,
      setRemoteStoreEntry,
      t,
    ],
  );

  useEffect(() => {
    if (!isSelectedSourceRemote) return;
    void loadStoreSource(selectedStoreSourceId);
  }, [isSelectedSourceRemote, loadStoreSource, selectedStoreSourceId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let disposed = false;
    let intervalId: number | undefined;

    const refreshStoreSources = async (forceRefresh: boolean) => {
      if (typeof loadRegistry === "function") {
        await loadRegistry();
      }

      const enabledCustomSourceIds = customStoreSources
        .filter((source) => source.enabled)
        .map((source) => source.id);
      const remoteSourceIds = ["claude-code", "community", ...enabledCustomSourceIds];

      await Promise.allSettled(
        remoteSourceIds.map((sourceId) =>
          loadStoreSource(sourceId, forceRefresh),
        ),
      );
    };

    const configure = async () => {
      const settings = (await window.api?.settings?.get?.()) as
        | Settings
        | undefined;
      if (disposed) {
        return;
      }

      const deviceSettings = settings?.device;
      const autoSyncEnabled = deviceSettings?.storeAutoSync ?? true;
      const intervalMs = cadenceToMs(
        deviceSettings?.storeSyncCadence ?? "1d",
      );

      if (!autoSyncEnabled) {
        return;
      }

      await refreshStoreSources(true);

      if (!intervalMs) {
        return;
      }

      intervalId = window.setInterval(() => {
        void refreshStoreSources(true);
      }, intervalMs);
    };

    void configure();

    return () => {
      disposed = true;
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [customStoreSources, loadRegistry, loadStoreSource]);

  const sourceRegistrySkills = useMemo(() => {
    let baseSkills: RegistrySkill[] = [];
    if (selectedStoreSourceId === "official") {
      baseSkills = registrySkills;
    } else {
      baseSkills = selectedRemoteEntry?.skills || [];
    }

    if (storeCategory !== "all") {
      baseSkills = baseSkills.filter(
        (skill) => skill.category === storeCategory,
      );
    }

    if (storeSearchQuery.trim()) {
      const query = storeSearchQuery.toLowerCase();
      baseSkills = baseSkills.filter(
        (skill) =>
          skill.name.toLowerCase().includes(query) ||
          skill.description.toLowerCase().includes(query) ||
          skill.tags.some((tag) => tag.toLowerCase().includes(query)),
      );
    }

    return baseSkills;
  }, [
    registrySkills,
    selectedRemoteEntry?.skills,
    selectedStoreSourceId,
    storeCategory,
    storeSearchQuery,
  ]);

  const selectedDetailSkill = useMemo(() => {
    if (!selectedRegistrySlug) return null;
    return (
      sourceRegistrySkills.find(
        (skill) => skill.slug === selectedRegistrySlug,
      ) || null
    );
  }, [selectedRegistrySlug, sourceRegistrySkills]);

  const isSkillInstalled = useCallback(
    (regSkill: RegistrySkill): boolean => {
      if (installedSlugs.includes(regSkill.slug)) return true;
      // Fall back to name-based matching for locally-imported skills
      // that have no registry_slug
      const installName = (
        regSkill.install_name || regSkill.slug
      ).toLowerCase();
      return installedNamesLower.has(installName);
    },
    [installedSlugs, installedNamesLower],
  );

  const installed = useMemo(
    () => sourceRegistrySkills.filter(isSkillInstalled),
    [isSkillInstalled, sourceRegistrySkills],
  );

  const recommended = useMemo(
    () => sourceRegistrySkills.filter((skill) => !isSkillInstalled(skill)),
    [isSkillInstalled, sourceRegistrySkills],
  );

  const handleQuickInstall = async (
    skill: RegistrySkill,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    setInstallingSlug(skill.slug);
    try {
      if (autoScanBeforeInstall) {
        const report = await window.api.skill.scanSafety({
          name: skill.name,
          content: skill.content,
          sourceUrl: skill.source_url,
          contentUrl: skill.content_url,
          securityAudits: skill.security_audits,
          aiConfig: getSafetyScanAIConfig(aiModels),
        });
        if (report.level === "blocked" || report.level === "high-risk") {
          showToast(
            t(
              "skill.safetyScanBlockedInstall",
              "This skill was flagged as high risk. Review the safety report before adding it.",
            ),
            "error",
          );
          return;
        }
      }
      const result = await installRegistrySkill(skill);
      if (result) {
        showToast(`${t("skill.addedToLibrary")}: ${skill.name}`, "success");
      }
    } catch (error: unknown) {
      showToast(getErrorMessage(error) || t("skill.updateFailed"), "error");
    } finally {
      setTimeout(() => setInstallingSlug(null), 500);
    }
  };

  const handleAddSource = async () => {
    if (!sourceName.trim() || !sourceUrl.trim()) {
      showToast(t("skill.storeSourceRequired"), "error");
      return;
    }

    try {
      addCustomStoreSource(sourceName, sourceUrl, sourceType);
      const createdId = useSkillStore.getState().selectedStoreSourceId;
      setSourceName("");
      setSourceUrl("");
      setSourceType("marketplace-json");
      showToast(t("skill.storeSourceAdded"), "success");
      if (createdId) {
        void loadStoreSource(createdId, true);
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error &&
        error.message === "STORE_SOURCE_HTTPS_REQUIRED"
          ? t("skill.storeSourceHttpsRequired", "Store URL must use HTTPS")
          : t("skill.storeSourceInvalidUrl", "Invalid store URL format");
      showToast(message, "error");
    }
  };

  const categories: { key: SkillCategory | "all"; label: string }[] = [
    { key: "all", label: t("common.showAll", "All") },
    ...Object.entries(SKILL_CATEGORIES).map(([key, value]) => ({
      key: key as SkillCategory,
      label: isZh ? value.label : value.labelEn,
    })),
  ];

  const sourceMeta = useMemo(() => {
    if (selectedStoreSourceId === "community") {
      return {
        title: t("skill.communityStore", "Community Store"),
        hint: t(
          "skill.communityStoreHint",
          "This area will aggregate third-party community skill sources. The entry is ready for connecting a community registry next.",
        ),
        count: sourceRegistrySkills.length,
        showCatalog: true,
        canRefresh: true,
      };
    }

    if (selectedStoreSourceId === "claude-code") {
      return {
        title: t("skill.claudeCodeStore", "Claude Code Store"),
        hint: t(
          "skill.claudeCodeStoreHint",
          "Built-in Claude Code source with first-class support for the official skills repo and common marketplace.json indexes.",
        ),
        count: sourceRegistrySkills.length,
        showCatalog: true,
        canRefresh: true,
      };
    }

    if (selectedStoreSourceId === "new-custom") {
      return {
        title: t("skill.addStoreSource", "Add Store"),
        hint: t(
          "skill.customStoresHint",
          "Add your own store endpoints here. A later step can connect remote manifests or registries.",
        ),
        count: customStoreSources.length,
        showCatalog: false,
        canRefresh: false,
      };
    }

    if (selectedCustomSource) {
      return {
        title: selectedCustomSource.name,
        hint: selectedCustomSource.url,
        count: sourceRegistrySkills.length,
        showCatalog: true,
        canRefresh: true,
      };
    }

    return {
      title: t("skill.officialStore", "Official Store"),
      hint: t(
        "skill.storeHint",
        "Discover and import skills from official, community, and custom stores.",
      ),
      count: sourceRegistrySkills.length,
      showCatalog: true,
      canRefresh: false,
    };
  }, [
    customStoreSources.length,
    selectedCustomSource,
    selectedStoreSourceId,
    sourceRegistrySkills.length,
    t,
  ]);

  const currentRemoteError = selectedRemoteEntry?.error || null;
  const shouldShowInitialLoading =
    isSelectedSourceRemote &&
    loadingSourceId === selectedStoreSourceId &&
    (!selectedRemoteEntry || selectedRemoteEntry.skills.length === 0);
  const isRefreshingCachedSource =
    isSelectedSourceRemote &&
    loadingSourceId === selectedStoreSourceId &&
    Boolean(selectedRemoteEntry?.skills.length);

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="px-6 py-4 border-b border-border shrink-0 bg-background/50 backdrop-blur-sm z-10 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-lg font-semibold">{sourceMeta.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {sourceMeta.hint}
            </p>
          </div>
          <span className="text-[11px] font-medium text-muted-foreground bg-accent/50 px-2 py-0.5 rounded-full border border-white/5">
            {sourceMeta.count} {t("skill.skillsCount", "skills")}
          </span>
          {isRefreshingCachedSource && (
            <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border inline-flex items-center gap-1">
              <Loader2Icon className="w-3 h-3 animate-spin" />
              {t("common.refreshing", "Refreshing")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {sourceMeta.canRefresh && (
            <button
              onClick={() => void loadStoreSource(selectedStoreSourceId, true)}
              disabled={loadingSourceId === selectedStoreSourceId}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
              title={t("common.refresh", "Refresh")}
            >
              <RefreshCwIcon
                className={`w-4 h-4 ${loadingSourceId === selectedStoreSourceId ? "animate-spin" : ""}`}
              />
            </button>
          )}
          {sourceMeta.showCatalog && (
            <div className="relative w-64">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={storeSearchQuery}
                onChange={(e) => setStoreSearchQuery(e.target.value)}
                placeholder={t("skill.searchStore", "Search skills...")}
                className="w-full pl-9 pr-3 py-2 text-sm bg-accent/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
              />
            </div>
          )}
        </div>
      </div>

      <div className="px-6 py-3 border-b border-border bg-background/30 space-y-3">
        {sourceMeta.showCatalog && (
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
            {categories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setStoreCategory(cat.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  storeCategory === cat.key
                    ? "bg-primary text-white shadow-sm"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                }`}
              >
                {CATEGORY_ICONS[cat.key]}
                {cat.label}
              </button>
            ))}
          </div>
        )}

        {selectedStoreSourceId === "new-custom" && (
          <SkillStoreSourceForm
            handleAddSource={handleAddSource}
            setSourceName={setSourceName}
            setSourceType={setSourceType}
            setSourceUrl={setSourceUrl}
            sourceName={sourceName}
            sourceType={sourceType}
            sourceUrl={sourceUrl}
            t={t}
            typeOptions={CUSTOM_SOURCE_TYPE_OPTIONS}
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide p-6 space-y-8">
        {shouldShowInitialLoading && (
          <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground inline-flex items-center gap-2">
            <Loader2Icon className="w-4 h-4 animate-spin" />
            {selectedStoreSourceId === "claude-code"
              ? t(
                  "skill.loadingRemoteStore",
                  "Loading Claude Code skills from the remote source...",
                )
              : selectedStoreSourceId === "community"
                ? t(
                    "skill.loadingCommunityStore",
                    "Loading skills.sh community skill list...",
                  )
                : t(
                    "skill.loadingCustomStore",
                    "Loading custom store content...",
                  )}
          </div>
        )}

        {currentRemoteError && !shouldShowInitialLoading && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive space-y-2">
            <div>
              <span className="font-medium">
                {t(
                  "skill.remoteStoreLoadFailed",
                  "Failed to load remote store",
                )}
                :{" "}
              </span>
              {currentRemoteError}
            </div>
            <button
              onClick={() => void loadStoreSource(selectedStoreSourceId, true)}
              disabled={loadingSourceId === selectedStoreSourceId}
              className="text-xs px-3 py-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive font-medium transition-colors disabled:opacity-40"
            >
              {t("skill.remoteStoreRetry", "Retry")}
            </button>
          </div>
        )}

        {sourceMeta.showCatalog && (
          <>
            {installed.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                    {t("skill.importedSection", "Imported")}
                  </h3>
                  <span className="text-[10px] bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full font-bold">
                    {installed.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {installed.map((skill, index) => (
                    <SkillStoreCard
                      key={skill.slug}
                      skill={skill}
                      isInstalled={true}
                      index={index}
                      onClick={() => selectRegistrySkill(skill.slug)}
                    />
                  ))}
                </div>
              </section>
            )}

            {recommended.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                    {t("skill.availableSection", "Available")}
                  </h3>
                  <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                    {recommended.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {recommended.map((skill, index) => (
                    <SkillStoreCard
                      key={skill.slug}
                      skill={skill}
                      isInstalled={false}
                      index={index}
                      installingSlug={installingSlug}
                      onQuickInstall={handleQuickInstall}
                      onClick={() => selectRegistrySkill(skill.slug)}
                    />
                  ))}
                </div>
              </section>
            )}

            {installed.length === 0 &&
              recommended.length === 0 &&
              !shouldShowInitialLoading && (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <SearchIcon className="w-12 h-12 opacity-20 mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    {t("skill.noResults", "No skills found")}
                  </h3>
                  <p className="text-sm opacity-70">
                    {t(
                      "skill.tryDifferentSearch",
                      "Try a different search or category",
                    )}
                  </p>
                </div>
              )}
          </>
        )}

        {selectedStoreSourceId === "claude-code" && (
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-foreground">
              <GlobeIcon className="w-5 h-5 text-primary" />
              <h3 className="text-base font-semibold">
                {t("skill.claudeCodeStore", "Claude Code Store")}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground leading-7">
              {t(
                "skill.claudeCodeStoreDetail",
                "This built-in source is meant for the Claude Code ecosystem. It is designed to work first with the official skills repository and marketplace.json indexes, and can later become a browsable remote store.",
              )}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-sm font-medium text-foreground mb-1">
                  {t("skill.supportedFormat", "Supported Formats")}
                </div>
                <div className="text-xs text-muted-foreground leading-6">
                  {t(
                    "skill.formatDirectoryRepo",
                    "`SKILL.md` directory-style repository",
                  )}
                  <br />
                  {t(
                    "skill.formatIndexStore",
                    "`marketplace.json` index-style store",
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-sm font-medium text-foreground mb-1">
                  {t("skill.exampleSources", "Built-in Reference Sources")}
                </div>
                <div className="text-xs text-muted-foreground leading-6 break-all">
                  https://github.com/anthropics/skills
                  <br />
                  https://raw.githubusercontent.com/docker/claude-code-plugin-manager/main/marketplace.json
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedStoreSourceId === "community" && (
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 mb-3 text-foreground">
              <BoxesIcon className="w-5 h-5 text-primary" />
              <h3 className="text-base font-semibold">
                {t("skill.communityStore", "Community Store")}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground leading-6">
              {t(
                "skill.communityStoreHint",
                "This area will aggregate third-party community skill sources. The entry is ready for connecting a community registry next.",
              )}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-sm font-medium text-foreground mb-1">
                  {t("skill.supportedFormat", "Supported Formats")}
                </div>
                <div className="text-xs text-muted-foreground leading-6">
                  {t(
                    "skill.formatCommunityLeaderboard",
                    "skills.sh community leaderboard",
                  )}
                  <br />
                  {t(
                    "skill.formatSkillDetailPage",
                    "skills.sh skill detail page",
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-sm font-medium text-foreground mb-1">
                  {t("skill.exampleSources", "Built-in Reference Sources")}
                </div>
                <div className="text-xs text-muted-foreground leading-6 break-all">
                  https://skills.sh/
                </div>
              </div>
            </div>
          </div>
        )}

        {(selectedStoreSourceId === "new-custom" || selectedCustomSource) && (
          <section className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                {selectedCustomSource
                  ? selectedCustomSource.name
                  : t("skill.customStores", "My Stores")}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedCustomSource
                  ? selectedCustomSource.url
                  : t(
                      "skill.customStoresHint",
                      "Add your own store endpoints here. A later step can connect remote manifests or registries.",
                    )}
              </p>
            </div>

            <SkillStoreCustomSources
              customStoreSources={customStoreSources}
              loadStoreSource={loadStoreSource}
              loadingSourceId={loadingSourceId}
              remoteStoreEntries={remoteStoreEntries}
              removeCustomStoreSource={removeCustomStoreSource}
              selectStoreSource={selectStoreSource}
              selectedCustomSource={selectedCustomSource}
              selectedStoreSourceId={selectedStoreSourceId}
              t={t}
              toggleCustomStoreSource={toggleCustomStoreSource}
            />
          </section>
        )}
      </div>

      {selectedDetailSkill && (
        <SkillStoreDetail
          skill={selectedDetailSkill}
          isInstalled={isSkillInstalled(selectedDetailSkill)}
          onClose={() => selectRegistrySkill(null)}
        />
      )}
    </div>
  );
}
