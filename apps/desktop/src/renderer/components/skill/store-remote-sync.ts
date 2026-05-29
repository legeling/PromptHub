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
import {
  buildSkillSourceId,
} from "@prompthub/shared/utils/skill-identity";
import { loadGitHubSkillRepo, parseFrontmatter, toTitleCase } from "../../services/github-skill-store";
import {
  parseSkillsShDetail,
  parseSkillsShLeaderboard,
  SKILLS_SH_BASE_URL,
} from "../../services/skills-sh-store";
import { isLikelyLocalSource } from "../../services/skill-store-source";
import { useSkillStore } from "../../stores/skill.store";

const MAX_REMOTE_STORE_DEPTH = 3;
const MAX_SKILLS_SH_SKILLS = 24;
const SKILLS_SH_CONCURRENCY = 4;

export const BUILTIN_REMOTE_STORES: Record<
  string,
  {
    id: string;
    type: "git-repo" | "skills-sh";
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
};

interface UseSkillStoreRemoteSyncOptions {
  eagerRemoteSources?: "selected" | "all";
  selectedStoreSourceId?: string;
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
  if (/(design|figma|css|ui|frontend|canvas|brand)/.test(text))
    return "design";
  if (/(deploy|vercel|docker|cloudflare|netlify)/.test(text))
    return "deploy";
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

export function useSkillStoreRemoteSync(
  options: UseSkillStoreRemoteSyncOptions = {},
) {
  const { t } = useTranslation();
  const eagerRemoteSources = options.eagerRemoteSources ?? "all";
  const selectedStoreSourceId = options.selectedStoreSourceId;
  const loadRegistry = useSkillStore((state) => state.loadRegistry);
  const registrySkills = useSkillStore((state) => state.registrySkills) ?? [];
  const customStoreSources = useSkillStore((state) => state.customStoreSources) ?? [];
  const remoteStoreEntries = useSkillStore((state) => state.remoteStoreEntries) ?? {};
  const setRemoteStoreEntry = useSkillStore((state) => state.setRemoteStoreEntry);
  const scanLocalPreview = useSkillStore((state) => state.scanLocalPreview);

  const [loadingSourceId, setLoadingSourceId] = useState<string | null>(null);
  const remoteStoreEntriesRef = useRef(remoteStoreEntries);
  const inflightStoreLoadsRef = useRef(new Map<string, Promise<void>>());
  const loadRegistryRef = useRef(loadRegistry);
  const loadStoreSourceRef = useRef<
    (sourceId: string, forceRefresh?: boolean) => Promise<void>
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
    loadRegistryRef.current = loadRegistry;
  }, [loadRegistry]);

  useEffect(() => {
    if (typeof loadRegistry === "function") {
      void loadRegistry();
    }
  }, [loadRegistry]);

  const loadGitHubRepoSkills = useCallback(
    async (source: Pick<SkillStoreSource, "url" | "branch" | "directory">): Promise<RegistrySkill[]> => {
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
      if (!resolvedUrl || visited.has(resolvedUrl) || depth > MAX_REMOTE_STORE_DEPTH) {
        return [];
      }
      visited.add(resolvedUrl);

      const raw = await window.api.skill.fetchRemoteContent(resolvedUrl).catch(() => null);
      if (!raw) return [];

      const data = parseJson<MarketplaceRegistryDocument>(raw, {});
      const builtinBySlug = new Map(
        registrySkills.map((skill) => [skill.slug, skill]),
      );
      const directSkills = Array.isArray(data.skills) ? data.skills : [];

      const mappedSkills = await Promise.all(
        directSkills.map(async (item: MarketplaceSkillEntry) => {
          const slug =
            item.slug || item.id || slugify(item.name || item.title || "remote-skill");
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
              item.category || builtin?.category || inferCategory(slug, description),
            icon_url: item.icon_url || item.iconUrl || builtin?.icon_url,
            icon_emoji: item.icon_emoji || item.iconEmoji || builtin?.icon_emoji,
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
        nestedStoreRefs.map((entry) => loadMarketplaceStore(entry, visited, depth + 1)),
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

  const loadSkillsShStore = useCallback(async (): Promise<RegistrySkill[]> => {
    const leaderboardHtml = await window.api.skill.fetchRemoteContent(SKILLS_SH_BASE_URL);
    const entries = parseSkillsShLeaderboard(leaderboardHtml, {
      limit: MAX_SKILLS_SH_SKILLS,
    });

    const skillsFromDetails = await runWithConcurrency(
      entries,
      SKILLS_SH_CONCURRENCY,
      async (entry) => {
        try {
          const detailHtml = await window.api.skill.fetchRemoteContent(entry.detailUrl);
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
        BUILTIN_REMOTE_STORES[sourceId] ??
        customStoreSources.find((item) => item.id === sourceId);

      if (!source) return;
      if ("enabled" in source && !source.enabled) return;

      const loadKey = `${sourceId}:${forceRefresh ? "force" : "cached"}`;
      const inflightLoad = inflightStoreLoadsRef.current.get(loadKey);
      if (inflightLoad) {
        await inflightLoad;
        return;
      }

      const cachedEntry = remoteStoreEntriesRef.current[sourceId];
      const hasCachedSkills = cachedEntry && cachedEntry.skills.length > 0;
      const hasCachedFailure = Boolean(cachedEntry?.error);
      if (!forceRefresh && hasCachedFailure) return;
      if (!forceRefresh && hasCachedSkills) return;

      const loadPromise = (async () => {
        setLoadingSourceId(sourceId);
        try {
          let skillsForSource: RegistrySkill[] = [];
          if (source.type === "git-repo") {
            skillsForSource = isLikelyLocalSource(source.url)
              ? await loadLocalDirectoryStore(source.url)
              : await loadGitHubRepoSkills(source);
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
          setLoadingSourceId((current) => (current === sourceId ? null : current));
        }
      })();

      inflightStoreLoadsRef.current.set(loadKey, loadPromise);
      await loadPromise;
    },
    [
      customStoreSources,
      loadGitHubRepoSkills,
      loadLocalDirectoryStore,
      loadMarketplaceStore,
      loadSkillsShStore,
      setRemoteStoreEntry,
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
      const settings = (await window.api?.settings?.get?.()) as Settings | undefined;
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
    loadingSourceId,
    loadStoreSource,
    remoteStoreEntries,
  };
}
