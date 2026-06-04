import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  DeviceManagementSettings,
  MarketplaceReferenceEntry,
  MarketplaceRegistryDocument,
  MarketplaceSkillEntry,
  RegistrySkill,
  Settings,
  SkillCategory,
  SkillStoreSource,
} from "@prompthub/shared/types";

import { BUILTIN_SKILL_REGISTRY } from "@prompthub/shared/constants/skill-registry";
import { isGitHubHost, parseGitRepo } from "@prompthub/shared/utils/git-repo";
import { buildSkillSourceId } from "@prompthub/shared/utils/skill-identity";
import {
  loadGitHubSkillRepo,
  parseFrontmatter,
  toTitleCase,
} from "../../services/github-skill-store";
import {
  parseSkillsShDetail,
  filterSkillsShLeaderboardEntries,
  parseSkillsShLeaderboard,
  parseSkillsShTotalCount,
  SKILLS_SH_BASE_URL,
  getSkillsShIndexUrl,
  normalizeSkillsShFilterKey,
  type SkillsShLeaderboardEntry,
} from "../../services/skills-sh-store";
import {
  CLAWHUB_BASE_URL,
  CLAWHUB_BROWSE_SORT,
  loadClawHubSkillsPage,
} from "../../services/clawhub-store";
import { isLikelyLocalSource } from "../../services/skill-store-source";
import { useSkillStore } from "../../stores/skill.store";

const MAX_REMOTE_STORE_DEPTH = 3;
const PRECONFIGURED_STORE_PAGE_SIZE = 24;
const SKILLS_SH_CONCURRENCY = 4;

export const BUILTIN_REMOTE_STORES: Record<
  string,
  {
    id: string;
    type: "git-repo" | "skills-sh" | "clawhub";
    url: string;
    branch?: string;
    directory?: string;
  }
> = {
  "claude-code": {
    id: "claude-code",
    type: "git-repo",
    url: "https://github.com/anthropics/skills",
  },
  "openai-codex": {
    id: "openai-codex",
    type: "git-repo",
    url: "https://github.com/openai/skills",
    branch: "main",
    directory: "skills/.curated",
  },
  community: {
    id: "community",
    type: "skills-sh",
    url: SKILLS_SH_BASE_URL,
  },
  clawhub: {
    id: "clawhub",
    type: "clawhub",
    url: CLAWHUB_BASE_URL,
  },
};

interface UseSkillStoreRemoteSyncOptions {
  eagerRemoteSources?: "selected" | "all";
  selectedStoreSourceId?: string;
  storeSearchQuery?: string;
}

interface StoreLoadResult {
  currentCursor?: string | null;
  matchedCount?: number;
  nextCursor?: string | null;
  pageCount?: number;
  pageIndex?: number;
  pageSize?: number;
  query?: string;
  skills: RegistrySkill[];
  totalCount?: number;
}

interface SkillsShIndexCache {
  entries: SkillsShLeaderboardEntry[];
  totalCount?: number;
}

type StorePageDirection = "next" | "previous";

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

function dedupeRegistrySkills(skills: RegistrySkill[]) {
  const bySourceId = new Map<string, RegistrySkill>();
  for (const skill of skills) {
    if (bySourceId.has(skill.source_id)) continue;
    bySourceId.set(skill.source_id, skill);
  }
  return Array.from(bySourceId.values());
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
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

function shouldForceRefreshSource(
  loadedAt: number | undefined,
  intervalMs: number | null,
): boolean {
  if (!loadedAt || loadedAt <= 0) {
    return true;
  }
  if (intervalMs === null) {
    return false;
  }
  return Date.now() - loadedAt >= intervalMs;
}

function resolveMarketplaceReference(
  entry: string | MarketplaceReferenceEntry,
): string | undefined {
  if (typeof entry === "string") return entry;
  return entry.url || entry.index || entry.manifest;
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

function toStoreLoadResult(skills: RegistrySkill[]): StoreLoadResult {
  return { skills };
}

function getOffsetFromCursor(cursor?: string | null): number {
  return Math.max(0, Number.parseInt(cursor ?? "0", 10) || 0);
}

function getPreviousOffsetCursor(
  cursor: string | null | undefined,
  pageSize: number,
): string | null {
  const previousOffset = Math.max(0, getOffsetFromCursor(cursor) - pageSize);
  return previousOffset > 0 ? String(previousOffset) : null;
}

export function useSkillStoreRemoteSync(
  options: UseSkillStoreRemoteSyncOptions = {},
) {
  const { t } = useTranslation();
  const eagerRemoteSources = options.eagerRemoteSources ?? "all";
  const selectedStoreSourceId = options.selectedStoreSourceId;
  const storeSearchQuery = options.storeSearchQuery ?? "";
  const storeCategory = useSkillStore((state) => state.storeCategory) ?? "all";
  const loadRegistry = useSkillStore((state) => state.loadRegistry);
  const registrySkills = useSkillStore((state) => state.registrySkills) ?? [];
  const customStoreSources =
    useSkillStore((state) => state.customStoreSources) ?? [];
  const remoteStoreEntries =
    useSkillStore((state) => state.remoteStoreEntries) ?? {};
  const setRemoteStoreEntry = useSkillStore(
    (state) => state.setRemoteStoreEntry,
  );
  const scanLocalPreview = useSkillStore((state) => state.scanLocalPreview);

  const [loadingSourceId, setLoadingSourceId] = useState<string | null>(null);
  const [loadingMoreSourceId, setLoadingMoreSourceId] = useState<
    string | null
  >(null);
  const remoteStoreEntriesRef = useRef(remoteStoreEntries);
  const storeCategoryRef = useRef(storeCategory);
  const storeSearchQueryRef = useRef(storeSearchQuery);
  const inflightStoreLoadsRef = useRef(new Map<string, Promise<void>>());
  const loadRegistryRef = useRef(loadRegistry);
  const skillsShIndexCacheRef = useRef(new Map<string, SkillsShIndexCache>());
  const skillsShDetailCacheRef = useRef(
    new Map<string, RegistrySkill | null>(),
  );
  const loadStoreSourceRef = useRef<
    (
      sourceId: string,
      forceRefresh?: boolean,
      pageDirection?: StorePageDirection,
    ) => Promise<void>
  >(async () => undefined);

  const customStoreSourcesSyncKey = useMemo(
    () =>
      customStoreSources
        .map((source) =>
          [source.id, source.type, source.url, source.enabled ? "1" : "0"].join(
            ":",
          ),
        )
        .join("|"),
    [customStoreSources],
  );

  useEffect(() => {
    remoteStoreEntriesRef.current = remoteStoreEntries;
  }, [remoteStoreEntries]);

  useEffect(() => {
    storeCategoryRef.current = storeCategory;
  }, [storeCategory]);

  useEffect(() => {
    storeSearchQueryRef.current = storeSearchQuery;
  }, [storeSearchQuery]);

  useEffect(() => {
    loadRegistryRef.current = loadRegistry;
  }, [loadRegistry]);

  useEffect(() => {
    if (typeof loadRegistry === "function") {
      void loadRegistry();
    }
  }, [loadRegistry]);

  const loadGitHubRepoSkills = useCallback(
    async (
      source: Pick<SkillStoreSource, "url" | "branch" | "directory">,
    ): Promise<RegistrySkill[]> => {
      try {
        const repoUrl = source.url;
        const parsedRepo = parseGitRepo(repoUrl);
        if (!parsedRepo) {
          throw new Error("Invalid git repository URL");
        }

        if (!isGitHubHost(parsedRepo.host) || parsedRepo.protocol === "ssh") {
          return await window.api.skill.scanRemoteGithub(
            repoUrl,
            registrySkills,
            source.branch,
            source.directory,
          );
        }

        return await loadGitHubSkillRepo(repoUrl, {
          branch: source.branch,
          directory: source.directory,
          fetchRemoteContent: (url) => window.api.skill.fetchRemoteContent(url),
          registrySkills,
          rateLimitMessage: t(
            "skill.remoteStoreRateLimitHint",
            "GitHub API rate limit reached. Try again in a few minutes, or switch to another network and retry.",
          ),
          networkMessage: t(
            "skill.remoteStoreNetworkHint",
            "Failed to reach GitHub. Check your network connection or switch to another network and retry.",
          ),
          invalidRepoMessage: t(
            "skill.remoteStoreInvalidRepoHint",
            "Repository not found or URL is invalid. Check the GitHub repository address and try again.",
          ),
        });
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message === "Invalid GitHub repository URL" ||
            error.message === "Invalid git repository URL")
        ) {
          throw new Error(
            t(
              "skill.invalidGitRepo",
              "Please enter a Git repository URL, or use a local directory path instead",
            ),
          );
        }
        throw error;
      }
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
          const packageUrl =
            resolveUrl(
              resolvedUrl,
              item.package_url ||
                item.packageUrl ||
                item.zip_url ||
                item.zipUrl ||
                item.download_url ||
                item.downloadUrl,
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
          const sourceId = buildSkillSourceId({
            sourceType: "marketplace-json",
            sourceUrl,
            skillPath: contentUrl || slug,
          });

          return {
            slug,
            name:
              item.name ||
              item.title ||
              parsed.name ||
              builtin?.name ||
              toTitleCase(slug),
            install_name: item.install_name || item.installName,
            source_id: sourceId,
            source_label: resolvedUrl,
            canonical_skill_path: contentUrl || slug,
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
            package_url: packageUrl,
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
        source_id: buildSkillSourceId({
          sourceType: "local-dir",
          sourceUrl: skill.localPath || dirPath,
          skillPath: skill.filePath,
        }),
        source_label: dirPath,
        canonical_skill_path: skill.filePath,
        directory_fingerprint: skill.directory_fingerprint,
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
      return dedupeRegistrySkills(mapped);
    },
    [scanLocalPreview],
  );

  const loadSkillsShIndex = useCallback(async (
    filterKey: string,
  ): Promise<SkillsShIndexCache> => {
    const normalizedFilterKey = normalizeSkillsShFilterKey(filterKey);
    const cached = skillsShIndexCacheRef.current.get(normalizedFilterKey);
    if (cached) {
      return cached;
    }

    const leaderboardHtml =
      await window.api.skill.fetchRemoteContent(
        getSkillsShIndexUrl(normalizedFilterKey),
      );
    const nextCache = {
      entries: parseSkillsShLeaderboard(leaderboardHtml, {
        limit: Number.MAX_SAFE_INTEGER,
      }),
      totalCount: parseSkillsShTotalCount(leaderboardHtml),
    };
    skillsShIndexCacheRef.current.set(normalizedFilterKey, nextCache);
    return nextCache;
  }, []);

  const loadSkillsShDetail = useCallback(
    async (entry: SkillsShLeaderboardEntry): Promise<RegistrySkill | null> => {
      if (skillsShDetailCacheRef.current.has(entry.detailUrl)) {
        return skillsShDetailCacheRef.current.get(entry.detailUrl) ?? null;
      }

      try {
        const detailHtml = await window.api.skill.fetchRemoteContent(
          entry.detailUrl,
        );
        const parsed = parseSkillsShDetail(detailHtml, entry);
        skillsShDetailCacheRef.current.set(entry.detailUrl, parsed);
        return parsed;
      } catch {
        skillsShDetailCacheRef.current.set(entry.detailUrl, null);
        return null;
      }
    },
    [],
  );

  const loadSkillsShStore = useCallback(
    async (
      cursor?: string | null,
      searchQuery = "",
      filterKey = "all",
    ): Promise<StoreLoadResult> => {
      const normalizedFilterKey = normalizeSkillsShFilterKey(filterKey);
      const index = await loadSkillsShIndex(normalizedFilterKey);
      const filteredEntries = filterSkillsShLeaderboardEntries(
        index.entries,
        searchQuery,
      );
      const offset = getOffsetFromCursor(cursor);
      const pageEntries = filteredEntries.slice(
        offset,
        offset + PRECONFIGURED_STORE_PAGE_SIZE,
      );

      const skillsFromDetails = await runWithConcurrency(
        pageEntries,
        SKILLS_SH_CONCURRENCY,
        async (entry) => {
          return loadSkillsShDetail(entry);
        },
      );

      const nextOffset = offset + PRECONFIGURED_STORE_PAGE_SIZE;
      const normalizedSearchQuery = searchQuery.trim();
      const pageIndex = Math.floor(offset / PRECONFIGURED_STORE_PAGE_SIZE);
      const indexedResultCount =
        normalizedFilterKey === "all"
          ? (index.totalCount ?? filteredEntries.length)
          : filteredEntries.length;
      const resultCount = normalizedSearchQuery
        ? filteredEntries.length
        : indexedResultCount;
      return {
        currentCursor: offset > 0 ? String(offset) : null,
        matchedCount: normalizedSearchQuery ? filteredEntries.length : undefined,
        pageCount: Math.max(
          1,
          Math.ceil(resultCount / PRECONFIGURED_STORE_PAGE_SIZE),
        ),
        pageIndex,
        skills: dedupeRegistrySkills(skillsFromDetails),
        totalCount:
          normalizedFilterKey === "all"
            ? index.totalCount
            : filteredEntries.length,
        nextCursor:
          nextOffset < filteredEntries.length ? String(nextOffset) : null,
        pageSize: PRECONFIGURED_STORE_PAGE_SIZE,
        query: `${normalizedFilterKey}:${normalizedSearchQuery}`,
      };
    },
    [loadSkillsShDetail, loadSkillsShIndex],
  );

  const loadClawHubStore = useCallback(
    async (
      cursor?: string | null,
      searchQuery = "",
    ): Promise<StoreLoadResult> => {
      const normalizedSearchQuery = searchQuery.trim();
      const page = await loadClawHubSkillsPage({
        cursor: normalizedSearchQuery ? null : cursor,
        fetchRemoteContent: (url) => window.api.skill.fetchRemoteContent(url),
        limit: PRECONFIGURED_STORE_PAGE_SIZE,
        searchQuery: normalizedSearchQuery,
      });
      return {
        currentCursor: normalizedSearchQuery ? null : (cursor ?? null),
        skills: dedupeRegistrySkills(page.skills),
        nextCursor: normalizedSearchQuery ? null : (page.nextCursor ?? null),
        pageSize: PRECONFIGURED_STORE_PAGE_SIZE,
        matchedCount: normalizedSearchQuery ? page.skills.length : undefined,
        query: normalizedSearchQuery || CLAWHUB_BROWSE_SORT,
      };
    },
    [],
  );

  const loadStoreSource = useCallback(
    async (
      sourceId: string,
      forceRefresh = false,
      pageDirection?: StorePageDirection,
    ) => {
      if (typeof setRemoteStoreEntry !== "function") {
        return;
      }
      if (sourceId === "official" || sourceId === "new-custom") {
        return;
      }

      const source =
        BUILTIN_REMOTE_STORES[sourceId] ??
        customStoreSources.find((item) => item.id === sourceId);

      if (!source) return;
      if ("enabled" in source && !source.enabled) return;

      if (forceRefresh && source.type === "skills-sh") {
        skillsShIndexCacheRef.current.clear();
        skillsShDetailCacheRef.current.clear();
      }

      const cachedEntry = remoteStoreEntriesRef.current[sourceId];
      const pageCursor =
        pageDirection === "next"
          ? cachedEntry?.nextCursor
          : pageDirection === "previous"
            ? source.type === "clawhub"
              ? cachedEntry?.cursorHistory?.[
                  Math.max(0, (cachedEntry.cursorHistory.length ?? 1) - 2)
                ] ?? null
              : getPreviousOffsetCursor(
                  cachedEntry?.currentCursor,
                  PRECONFIGURED_STORE_PAGE_SIZE,
                )
            : null;
      if (pageDirection && pageCursor === undefined) {
        return;
      }
      if (pageDirection === "next" && !cachedEntry?.nextCursor) {
        return;
      }
      if (
        pageDirection === "previous" &&
        !cachedEntry?.currentCursor &&
        !pageCursor
      ) {
        return;
      }

      const normalizedSearchQuery = storeSearchQuery.trim();
      const skillsShFilterKey = normalizeSkillsShFilterKey(
        source.type === "skills-sh" ? String(storeCategory) : "all",
      );
      const expectedSkillsShQuery =
        source.type === "skills-sh"
          ? `${skillsShFilterKey}:${normalizedSearchQuery}`
          : normalizedSearchQuery;
      const expectedClawHubQuery =
        source.type === "clawhub"
          ? normalizedSearchQuery || CLAWHUB_BROWSE_SORT
          : "";
      const loadQueryKey =
        source.type === "skills-sh"
          ? expectedSkillsShQuery
          : source.type === "clawhub"
            ? expectedClawHubQuery
            : normalizedSearchQuery;

      const loadKey = `${sourceId}:${loadQueryKey}:${
        pageDirection
          ? `${pageDirection}:${pageCursor ?? "first"}`
          : forceRefresh
            ? "force"
            : "cached"
      }`;
      const inflightLoad = inflightStoreLoadsRef.current.get(loadKey);
      if (inflightLoad) {
        await inflightLoad;
        return;
      }

      const hasCachedSkills = cachedEntry && cachedEntry.skills.length > 0;
      const hasCachedFailure = Boolean(cachedEntry?.error);
      const hasStalePaginatedCache =
        (source.type === "skills-sh" &&
          (cachedEntry?.pageSize !== PRECONFIGURED_STORE_PAGE_SIZE ||
            cachedEntry.query !== expectedSkillsShQuery ||
            typeof cachedEntry.totalCount !== "number")) ||
        (source.type === "clawhub" &&
          cachedEntry !== undefined &&
          (cachedEntry.pageSize !== PRECONFIGURED_STORE_PAGE_SIZE ||
            cachedEntry.query !== expectedClawHubQuery));
      if (!forceRefresh && !pageDirection && hasCachedFailure) return;
      if (
        !forceRefresh &&
        !pageDirection &&
        hasCachedSkills &&
        !hasStalePaginatedCache
      ) {
        return;
      }

      const loadPromise = (async () => {
        const isContinuationLoad = pageDirection === "next";
        if (isContinuationLoad) {
          setLoadingMoreSourceId(sourceId);
        } else {
          setLoadingSourceId(sourceId);
        }
        try {
          let result: StoreLoadResult = { skills: [] };
          if (source.type === "git-repo") {
            result = toStoreLoadResult(
              isLikelyLocalSource(source.url)
                ? await loadLocalDirectoryStore(source.url)
                : await loadGitHubRepoSkills(source),
            );
          } else if (source.type === "skills-sh") {
            result = await loadSkillsShStore(
              pageCursor,
              storeSearchQuery,
              skillsShFilterKey,
            );
          } else if (source.type === "clawhub") {
            result = await loadClawHubStore(pageCursor, storeSearchQuery);
          } else if (source.type === "marketplace-json") {
            result = toStoreLoadResult(await loadMarketplaceStore(source.url));
          } else if (source.type === "local-dir") {
            result = toStoreLoadResult(
              await loadLocalDirectoryStore(source.url),
            );
          }

          const nextCursorHistory =
            source.type === "clawhub"
              ? pageDirection === "previous"
                ? (cachedEntry?.cursorHistory ?? [null]).slice(0, -1)
                : pageDirection === "next"
                  ? [
                      ...(cachedEntry?.cursorHistory ?? [null]),
                      pageCursor ?? null,
                    ]
                  : [null]
              : undefined;
          const shouldAppendPage =
            pageDirection === "next" &&
            (source.type === "skills-sh" || source.type === "clawhub");
          const nextSkills = shouldAppendPage
            ? dedupeRegistrySkills([
                ...(cachedEntry?.skills ?? []),
                ...result.skills,
              ])
            : dedupeRegistrySkills(result.skills);
          const latestSearchQuery = storeSearchQueryRef.current.trim();
          const latestStoreCategory = storeCategoryRef.current;
          const latestExpectedQuery =
            source.type === "skills-sh"
              ? `${normalizeSkillsShFilterKey(String(latestStoreCategory))}:${latestSearchQuery}`
              : source.type === "clawhub"
                ? latestSearchQuery || CLAWHUB_BROWSE_SORT
                : result.query;
          if (
            (source.type === "skills-sh" || source.type === "clawhub") &&
            result.query !== latestExpectedQuery
          ) {
            return;
          }
          setRemoteStoreEntry(sourceId, {
            loadedAt: Date.now(),
            currentCursor: result.currentCursor ?? null,
            cursorHistory: nextCursorHistory,
            error: null,
            nextCursor: result.nextCursor ?? null,
            pageCount: result.pageCount,
            pageIndex:
              result.pageIndex ??
              (source.type === "clawhub" && nextCursorHistory
                ? Math.max(0, nextCursorHistory.length - 1)
                : undefined),
            pageSize: result.pageSize,
            matchedCount: result.matchedCount,
            query: result.query,
            skills: nextSkills,
            totalCount: result.totalCount ?? cachedEntry?.totalCount,
          });
        } catch (error) {
          console.error(`Failed to load remote store ${sourceId}:`, error);
          setRemoteStoreEntry(sourceId, {
            loadedAt: cachedEntry?.loadedAt || 0,
            error:
              error instanceof Error
                ? error.message
                : t(
                    "skill.remoteStoreLoadFailed",
                    "Failed to load remote store",
                  ),
            nextCursor: cachedEntry?.nextCursor ?? null,
            currentCursor: cachedEntry?.currentCursor ?? null,
            cursorHistory: cachedEntry?.cursorHistory,
            pageCount: cachedEntry?.pageCount,
            pageIndex: cachedEntry?.pageIndex,
            pageSize: cachedEntry?.pageSize,
            matchedCount: cachedEntry?.matchedCount,
            query: cachedEntry?.query,
            skills: cachedEntry?.skills || [],
            totalCount: cachedEntry?.totalCount,
          });
        } finally {
          inflightStoreLoadsRef.current.delete(loadKey);
          if (isContinuationLoad) {
            setLoadingMoreSourceId((current) =>
              current === sourceId ? null : current,
            );
          } else {
            setLoadingSourceId((current) =>
              current === sourceId ? null : current,
            );
          }
        }
      })();

      inflightStoreLoadsRef.current.set(loadKey, loadPromise);
      await loadPromise;
    },
    [
      customStoreSources,
      loadGitHubRepoSkills,
      loadClawHubStore,
      loadLocalDirectoryStore,
      loadMarketplaceStore,
      loadSkillsShStore,
      setRemoteStoreEntry,
      storeSearchQuery,
      storeCategory,
      t,
    ],
  );

  useEffect(() => {
    loadStoreSourceRef.current = loadStoreSource;
  }, [loadStoreSource]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let disposed = false;
    let intervalId: number | undefined;

    const enabledCustomSourceIds = customStoreSources
      .filter((source) => source.enabled)
      .map((source) => source.id);
    const remoteSourceIds = [
      "claude-code",
      "openai-codex",
      "community",
      "clawhub",
      ...enabledCustomSourceIds,
    ];

    const initialSourceIds =
      eagerRemoteSources === "selected" && selectedStoreSourceId
        ? [selectedStoreSourceId]
        : remoteSourceIds;

    const refreshStoreSources = async (
      forceRefresh: boolean,
      intervalMs: number | null,
    ) => {
      if (typeof loadRegistryRef.current === "function") {
        await loadRegistryRef.current();
      }

      await Promise.allSettled(
        remoteSourceIds.map((sourceId) => {
          const cachedEntry = remoteStoreEntriesRef.current[sourceId];
          const nextForceRefresh =
            forceRefresh &&
            shouldForceRefreshSource(cachedEntry?.loadedAt, intervalMs);
          return loadStoreSourceRef.current(sourceId, nextForceRefresh);
        }),
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
      const intervalMs = cadenceToMs(deviceSettings?.storeSyncCadence ?? "1d");

      if (eagerRemoteSources === "all" && autoSyncEnabled) {
        await Promise.allSettled(
          initialSourceIds.map((sourceId) =>
            loadStoreSourceRef.current(sourceId, false),
          ),
        );
      }

      if (!autoSyncEnabled || !intervalMs) {
        return;
      }

      intervalId = window.setInterval(() => {
        void refreshStoreSources(true, intervalMs);
      }, intervalMs);
    };

    void configure();

    return () => {
      disposed = true;
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [
    customStoreSources,
    customStoreSourcesSyncKey,
    eagerRemoteSources,
    selectedStoreSourceId,
  ]);

  return {
    loadingMoreSourceId,
    loadingSourceId,
    loadNextStorePage: (sourceId: string) =>
      loadStoreSource(sourceId, false, "next"),
    loadStoreSource,
    remoteStoreEntries,
  };
}
