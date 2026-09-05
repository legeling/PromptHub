import React, {
  useCallback,
  useEffect,
  useMemo,
  lazy,
  Suspense,
  useId,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  CuboidIcon,
  TrashIcon,
  StarIcon,
  SendIcon,
  Clock3Icon,
  TagsIcon,
  InboxIcon,
  EyeIcon,
} from "lucide-react";
import { SkillRenderBoundary } from "./SkillRenderBoundary";
import { useSkillStore, type SkillFilterType } from "../../stores/skill.store";
import {
  DEFAULT_SKILL_LIST_PAGE_SIZE,
  SKILL_LIST_PAGE_SIZE_OPTIONS,
  useSettingsStore,
} from "../../stores/settings.store";
import { SkillQuickInstall } from "./SkillQuickInstall";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import type { SelectOption } from "../ui/Select";
import { Spinner } from "../ui/Spinner";
import { useToast } from "../ui/Toast";
import type { Skill, ScannedSkill } from "@prompthub/shared/types";
import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
import { updateSkillTags, type SkillBatchTagMode } from "./batch-utils";
import { filterVisibleSkills } from "../../services/skill-filter";
import { buildSkillTagCandidates } from "../../services/skill-stats";
import { buildMySkillSourceBadges } from "../../services/skill-source-badges";
import { getRemoteStoreSkills } from "../../services/remote-store-entry";
import { getSkillsWithStoreUpdates } from "../../services/skill-library-update-status";
import { getRuntimeCapabilities } from "../../runtime";
import { filterDeployablePlatforms } from "../../services/platform-visibility";
import { SkillManagerLibraryHeader } from "./SkillManagerLibraryHeader";
import { SkillManagerLibraryContent } from "./SkillManagerLibraryContent";
import { SkillViewTransition } from "./SkillViewTransition";
import {
  SkillDeleteConfirmDialog,
  type SkillDeleteConfirmation,
} from "./SkillDeleteConfirmDialog";
import {
  ALL_SKILL_SOURCE_FILTER,
  EMPTY_DELETE_DISTRIBUTION_SUMMARY,
  LOCAL_SKILL_SCAN_TIMEOUT_MS,
  SKILL_GALLERY_COLUMNS,
  getSkillGalleryGridStyle,
  getVisiblePageNumbers,
  hasFileItems,
  mergeDeleteDistributionSummaries,
  normalizeDroppedSkillPath,
  normalizePlatformStatusMap,
  shouldRenderSelectedSkillDetail,
  summarizeInstallDetails,
  withTimeout,
  type DeleteDistributionSummary,
} from "./skill-manager-utils";

const SkillFullDetailPage = lazy(() =>
  import("./SkillFullDetailPage").then((m) => ({
    default: m.SkillFullDetailPage,
  })),
);
const SkillStore = lazy(() =>
  import("./SkillStore").then((m) => ({ default: m.SkillStore })),
);
const SkillProjectsView = lazy(() =>
  import("./SkillProjectsView").then((m) => ({ default: m.SkillProjectsView })),
);
const SkillAgentsView = lazy(() =>
  import("./SkillAgentsView").then((m) => ({ default: m.SkillAgentsView })),
);
const SkillScanPreview = lazy(() =>
  import("./SkillScanPreview").then((m) => ({ default: m.SkillScanPreview })),
);
const SkillBatchDeployDialog = lazy(() =>
  import("./SkillBatchDeployDialog").then((m) => ({
    default: m.SkillBatchDeployDialog,
  })),
);
const SkillBatchTagDialog = lazy(() =>
  import("./SkillBatchTagDialog").then((m) => ({
    default: m.SkillBatchTagDialog,
  })),
);

function getPrimarySkillSourceBadge(
  skill: Skill,
  t: ReturnType<typeof useTranslation>["t"],
) {
  return buildMySkillSourceBadges(skill, t).find(
    (badge) => !badge.key.startsWith("source-branch-"),
  );
}

export function SkillManager() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const deleteCopyInstallationsInputId = useId();
  const deleteCopyInstallationsLabelId = useId();
  const deleteCopyInstallationsHelpId = useId();
  const skills = useSkillStore((state) => state.skills);
  const loadSkills = useSkillStore((state) => state.loadSkills);
  const deleteSkill = useSkillStore((state) => state.deleteSkill);
  const toggleFavorite = useSkillStore((state) => state.toggleFavorite);
  const updateSkill = useSkillStore((state) => state.updateSkill);
  const selectedSkillId = useSkillStore((state) => state.selectedSkillId);
  const selectSkill = useSkillStore((state) => state.selectSkill);
  const filterType = useSkillStore((state) => state.filterType);
  const searchQuery = useSkillStore((state) => state.searchQuery);
  const viewMode = useSkillStore((state) => state.viewMode);
  const galleryColumns = useSkillStore((state) => state.galleryColumns);
  const setViewMode = useSkillStore((state) => state.setViewMode);
  const setGalleryColumns = useSkillStore((state) => state.setGalleryColumns);
  const storeView = useSkillStore((state) => state.storeView);
  const setStoreView = useSkillStore((state) => state.setStoreView);
  const setFilterType = useSkillStore((state) => state.setFilterType);
  const deployedSkillNames = useSkillStore((state) => state.deployedSkillNames);
  const loadDeployedStatus = useSkillStore((state) => state.loadDeployedStatus);
  const skillFilterTags = useSkillStore((state) => state.filterTags);
  const toggleSkillFilterTag = useSkillStore((state) => state.toggleFilterTag);
  const clearSkillFilterTags = useSkillStore((state) => state.clearFilterTags);
  const pendingPluginChildDeploySkillIds = useSkillStore(
    (state) => state.pendingPluginChildDeploySkillIds ?? [],
  );
  const consumePluginChildSkillDeployRequest = useSkillStore(
    (state) => state.consumePluginChildSkillDeployRequest,
  );
  const storedSkillListPageSize = useSettingsStore(
    (state) => state.skillListPageSize,
  );
  const setSkillListPageSize = useSettingsStore(
    (state) => state.setSkillListPageSize,
  );
  const skillTagFilterIncludeFrontmatter = useSettingsStore(
    (state) => state.skillTagFilterIncludeFrontmatter,
  );
  const disabledPlatformIds =
    useSettingsStore((state) => state.disabledPlatformIds) ?? [];
  const pageSize = SKILL_LIST_PAGE_SIZE_OPTIONS.includes(
    storedSkillListPageSize as (typeof SKILL_LIST_PAGE_SIZE_OPTIONS)[number],
  )
    ? storedSkillListPageSize
    : DEFAULT_SKILL_LIST_PAGE_SIZE;
  const runtimeCapabilities = getRuntimeCapabilities();
  const [supportedPlatforms, setSupportedPlatforms] = useState<SkillPlatform[]>(
    [],
  );
  const [detectedPlatforms, setDetectedPlatforms] = useState<string[]>([]);
  const [skillPlatformStatuses, setSkillPlatformStatuses] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const galleryColumnOptions = useMemo<SelectOption[]>(
    () =>
      SKILL_GALLERY_COLUMNS.map((columns) => ({
        value: columns,
        label:
          columns === "auto"
            ? t("skill.galleryColumnsAuto", "Auto")
            : t("skill.galleryColumnsCount", {
                count: Number(columns),
                defaultValue: "{{count}} columns",
              }),
      })),
    [t],
  );
  const skillGalleryGridStyle = useMemo(
    () => getSkillGalleryGridStyle(galleryColumns ?? "auto"),
    [galleryColumns],
  );
  const availableSkillPlatforms = useMemo(
    () =>
      filterDeployablePlatforms(
        supportedPlatforms,
        detectedPlatforms,
        disabledPlatformIds,
      ),
    [detectedPlatforms, disabledPlatformIds, supportedPlatforms],
  );
  const distributedPlatformsBySkillId = useMemo(() => {
    const next = new Map<string, Array<Pick<SkillPlatform, "id" | "name">>>();

    for (const skill of skills) {
      const status = skillPlatformStatuses[skill.id] ?? {};
      next.set(
        skill.id,
        availableSkillPlatforms
          .filter((platform) => status[platform.id])
          .map((platform) => ({ id: platform.id, name: platform.name })),
      );
    }

    return next;
  }, [availableSkillPlatforms, skillPlatformStatuses, skills]);
  const webSkillLibraryMode =
    !runtimeCapabilities.skillDistribution && !runtimeCapabilities.skillStore;
  const legacyDistributionView = storeView === "distribution";
  const effectiveStoreView =
    webSkillLibraryMode || legacyDistributionView ? "my-skills" : storeView;
  const effectiveFilterType =
    webSkillLibraryMode &&
    (legacyDistributionView ||
      filterType === "installed" ||
      filterType === "deployed" ||
      filterType === "pending")
      ? "all"
      : legacyDistributionView
        ? "deployed"
        : filterType;
  const isDistributionView = false;
  const skillDistributionCounts = useMemo(() => {
    let deployed = 0;
    let favorite = 0;

    for (const skill of skills) {
      if (skill.is_favorite) {
        favorite += 1;
      }
      if (
        deployedSkillNames.has(skill.id) ||
        deployedSkillNames.has(skill.name)
      ) {
        deployed += 1;
      }
    }

    return {
      all: skills.length,
      deployed,
      favorite,
      pending: Math.max(skills.length - deployed, 0),
    };
  }, [deployedSkillNames, skills]);
  const mySkillFilterOptions = useMemo(
    () =>
      [
        {
          icon: <CuboidIcon className="h-3.5 w-3.5" />,
          label: t("skill.allSkills", "All Skills"),
          count: skillDistributionCounts.all,
          value: "all",
        },
        {
          icon: <StarIcon className="h-3.5 w-3.5" />,
          label: t("skill.favorites", "Favorites"),
          count: skillDistributionCounts.favorite,
          value: "favorites",
        },
        {
          icon: <SendIcon className="h-3.5 w-3.5" />,
          label: t("skill.deployed", "Distributed"),
          count: skillDistributionCounts.deployed,
          value: "deployed",
        },
        {
          icon: <Clock3Icon className="h-3.5 w-3.5" />,
          label: t("skill.pendingDeployment", "Pending"),
          count: skillDistributionCounts.pending,
          value: "pending",
        },
      ] satisfies Array<{
        icon: React.ReactNode;
        label: string;
        count: number;
        value: SkillFilterType;
      }>,
    [skillDistributionCounts, t],
  );
  const handleMySkillFilterChange = (nextFilter: SkillFilterType) => {
    setStoreView("my-skills");
    setFilterType(nextFilter);
    selectSkill(null);
  };

  const handleToggleSkillTag = (tag: string) => {
    setStoreView("my-skills");
    toggleSkillFilterTag(tag);
    selectSkill(null);
  };

  const handleClearSkillTags = () => {
    setStoreView("my-skills");
    clearSkillFilterTags();
    selectSkill(null);
  };

  // Candidate tags for the My-Skills tag filter control (user tags, sorted).
  // Reuses the exact user-tag derivation the sidebar tag panel shows
  // (`buildSkillStats(...).uniqueUserTags`), so both entry points expose the
  // same candidate set and stay consistent without a second collection path.
  // 候选标签：默认与侧栏标签面板共用的 user-tag 推导一致；开启
  // `skillTagFilterIncludeFrontmatter` 后并集 SKILL.md frontmatter (original_tags)
  // 标签，使本地创建技能因迁移回填 original_tags 的标签也能被筛选。
  const skillTagOptions = useMemo(
    () => buildSkillTagCandidates(skills, skillTagFilterIncludeFrontmatter),
    [skillTagFilterIncludeFrontmatter, skills],
  );

  const [sourceFilterKey, setSourceFilterKey] = useState(
    ALL_SKILL_SOURCE_FILTER,
  );

  // Get filtered skills - filter directly in useMemo instead of using store function
  // 直接在 useMemo 中过滤，而不是使用 store 函数（避免函数引用作为依赖）
  const baseFilteredSkills = useMemo(() => {
    return filterVisibleSkills({
      deployedSkillNames,
      filterTags: skillFilterTags,
      filterType: effectiveFilterType,
      searchQuery,
      skills,
      storeView: effectiveStoreView,
    });
  }, [
    deployedSkillNames,
    effectiveFilterType,
    effectiveStoreView,
    skillFilterTags,
    searchQuery,
    skills,
  ]);

  const sourceFilterEntries = useMemo(() => {
    const entries = new Map<string, { label: string; count: number }>();

    for (const skill of baseFilteredSkills) {
      const badge = getPrimarySkillSourceBadge(skill, t);
      if (!badge) {
        continue;
      }

      const current = entries.get(badge.key);
      entries.set(badge.key, {
        label: String(badge.label),
        count: (current?.count ?? 0) + 1,
      });
    }

    return Array.from(entries.entries())
      .map(([value, entry]) => ({ value, ...entry }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [baseFilteredSkills, t]);

  const hasActiveSourceFilter = sourceFilterKey !== ALL_SKILL_SOURCE_FILTER;
  const activeSourceFilterKey = sourceFilterEntries.some(
    (entry) => entry.value === sourceFilterKey,
  )
    ? sourceFilterKey
    : ALL_SKILL_SOURCE_FILTER;

  const sourceFilterOptions = useMemo<SelectOption[]>(
    () => [
      {
        value: ALL_SKILL_SOURCE_FILTER,
        label: (
          <span className="flex w-full items-center justify-between gap-2">
            <span>{t("skill.allSources", "All Sources")}</span>
            <span className="text-xs text-muted-foreground">
              {baseFilteredSkills.length}
            </span>
          </span>
        ),
        labelText: t("skill.allSources", "All Sources"),
      },
      ...sourceFilterEntries.map((entry) => ({
        value: entry.value,
        label: (
          <span className="flex w-full items-center justify-between gap-2">
            <span className="truncate">{entry.label}</span>
            <span className="text-xs text-muted-foreground">{entry.count}</span>
          </span>
        ),
        labelText: entry.label,
      })),
    ],
    [baseFilteredSkills.length, sourceFilterEntries, t],
  );

  const filteredSkills = useMemo(() => {
    if (activeSourceFilterKey === ALL_SKILL_SOURCE_FILTER) {
      return baseFilteredSkills;
    }

    return baseFilteredSkills.filter(
      (skill) =>
        getPrimarySkillSourceBadge(skill, t)?.key === activeSourceFilterKey,
    );
  }, [activeSourceFilterKey, baseFilteredSkills, t]);

  // Quick install state
  // 快速安装状态
  const [quickInstallSkill, setQuickInstallSkill] = useState<Skill | null>(
    null,
  );

  // Scan preview state
  // 扫描预览状态
  const [showScanPreview, setShowScanPreview] = useState(false);
  const [showBatchDeployDialog, setShowBatchDeployDialog] = useState(false);
  const [showBatchTagDialog, setShowBatchTagDialog] = useState(false);
  const [scannedSkills, setScannedSkills] = useState<ScannedSkill[]>([]);
  const [, setIsScanning] = useState(false);
  const [isRefreshingLibrary, setIsRefreshingLibrary] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(
    new Set(),
  );
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    skill: Skill;
  } | null>(null);
  const remoteStoreEntries = useSkillStore(
    (state) => state.remoteStoreEntries,
  );
  const registrySkills = useSkillStore((state) => state.registrySkills);
  const loadRegistry = useSkillStore((state) => state.loadRegistry);

  const scanLocalPreview = useSkillStore((state) => state.scanLocalPreview);
  const importScannedSkills = useSkillStore(
    (state) => state.importScannedSkills,
  );
  const skillsWithStoreUpdates = useMemo(() => {
    return getSkillsWithStoreUpdates(skills, [
      ...(registrySkills ?? []),
      ...Object.values(remoteStoreEntries).flatMap((entry) =>
        getRemoteStoreSkills(entry),
      ),
    ]);
  }, [registrySkills, remoteStoreEntries, skills]);

  // Delete confirmation dialog state
  // 删除确认对话框状态
  const [deleteConfirm, setDeleteConfirm] = useState<SkillDeleteConfirmation>({
    isOpen: false,
    skillIds: [],
    skillNames: [],
    removeCopyInstallations: false,
    distributionSummary: EMPTY_DELETE_DISTRIBUTION_SUMMARY,
  });

  const handleDropImport = useCallback(
    async (files: FileList | File[]) => {
      const droppedPaths = Array.from(files)
        .map((file) => window.electron?.getPathForFile?.(file) || "")
        .map(normalizeDroppedSkillPath)
        .filter((value) => value.length > 0);

      const uniquePaths = Array.from(new Set(droppedPaths));
      if (uniquePaths.length === 0) {
        showToast(
          t(
            "skill.dropImportUnsupported",
            "Only local folders or a file named SKILL.md can be imported as skills.",
          ),
          "error",
        );
        return;
      }

      setIsScanning(true);
      try {
        const result = await withTimeout(
          scanLocalPreview(uniquePaths),
          LOCAL_SKILL_SCAN_TIMEOUT_MS,
          () =>
            new Error(
              t(
                "skill.scanLocalTimeout",
                "Local skill scan timed out. Check whether an agent folder is inaccessible, then try again.",
              ),
            ),
        );
        setScannedSkills(result);
        setShowScanPreview(true);
        showToast(
          t("skill.scanLocalComplete", {
            count: result.length,
            defaultValue: `Scanned ${result.length} local skill(s)`,
          }),
          "success",
        );

        if (result.length === 0) {
          showToast(
            t(
              "skill.dropImportEmpty",
              "No importable SKILL.md files were found in the dropped items.",
            ),
            "error",
          );
        }
      } catch (error) {
        console.error("Failed to import dropped skills:", error);
        showToast(
          t("skill.dropImportFailed", "Failed to scan dropped skill files"),
          "error",
        );
      } finally {
        setIsScanning(false);
      }
    },
    [scanLocalPreview, showToast, t],
  );

  // Re-scan handler passed down to the preview modal
  // 传给预览弹窗的重新扫描回调
  const handleRescan = async (customPaths: string[]) => {
    if (!runtimeCapabilities.skillLocalScan) {
      return false;
    }

    try {
      const result = await withTimeout(
        scanLocalPreview(customPaths),
        LOCAL_SKILL_SCAN_TIMEOUT_MS,
        () =>
          new Error(
            t(
              "skill.scanLocalTimeout",
              "Local skill scan timed out. Check whether an agent folder is inaccessible, then try again.",
            ),
          ),
      );
      setScannedSkills(result);
      showToast(
        t("skill.scanLocalComplete", {
          count: result.length,
          defaultValue: `Scanned ${result.length} local skill(s)`,
        }),
        "success",
      );
      return true;
    } catch (err) {
      console.error("Failed to rescan local skills:", err);
      showToast(
        err instanceof Error
          ? err.message
          : t("skill.scanLocalFailed", "Failed to scan local skills"),
        "error",
      );
      return false;
    }
  };

  const handleImportScanned = async (
    skillsToImport: ScannedSkill[],
    userTagsByPath?: Record<string, string[]>,
    importMode: "copy" | "symlink" = "copy",
  ) => {
    const result = await importScannedSkills(
      skillsToImport,
      userTagsByPath,
      importMode,
    );
    // Refresh deployed status after import
    if (runtimeCapabilities.skillDistribution) {
      await loadDeployedStatus({ force: true });
    }
    return result.importedCount;
  };

  const totalPages = Math.max(1, Math.ceil(filteredSkills.length / pageSize));
  const visibleSkills = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredSkills.slice(startIndex, startIndex + pageSize);
  }, [currentPage, filteredSkills, pageSize]);
  const selectedSkills = useMemo(
    () => skills.filter((skill) => selectedSkillIds.has(skill.id)),
    [skills, selectedSkillIds],
  );
  const allVisibleSelected = useMemo(
    () =>
      visibleSkills.length > 0 &&
      visibleSkills.every((skill) => selectedSkillIds.has(skill.id)),
    [selectedSkillIds, visibleSkills],
  );

  useEffect(() => {
    if (pendingPluginChildDeploySkillIds.length === 0) {
      return;
    }

    if (!runtimeCapabilities.skillDistribution) {
      consumePluginChildSkillDeployRequest();
      return;
    }

    if (skills.length === 0) {
      return;
    }

    const skillIds = new Set(skills.map((skill) => skill.id));
    const validIds = pendingPluginChildDeploySkillIds.filter((id) =>
      skillIds.has(id),
    );
    consumePluginChildSkillDeployRequest();

    if (validIds.length === 0) {
      return;
    }

    setStoreView("my-skills");
    setFilterType("all");
    selectSkill(validIds[0] ?? null);
    setSelectedSkillIds(new Set(validIds));
    setIsSelectionMode(true);
    setShowBatchDeployDialog(true);
  }, [
    consumePluginChildSkillDeployRequest,
    pendingPluginChildDeploySkillIds,
    runtimeCapabilities.skillDistribution,
    selectSkill,
    setFilterType,
    setStoreView,
    skills,
  ]);

  useEffect(() => {
    let disposed = false;
    let idleId: number | undefined;
    let timeoutId: number | undefined;
    const browserWindow = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions,
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    void loadRegistry().catch(() => undefined);
    void loadSkills({ preferCache: true }).then(() => {
      if (disposed) return;

      if (!runtimeCapabilities.skillDistribution) {
        return;
      }

      const run = () => {
        if (!disposed) {
          void loadDeployedStatus();
        }
      };

      if (typeof browserWindow.requestIdleCallback === "function") {
        idleId = browserWindow.requestIdleCallback(run, { timeout: 800 });
      } else {
        timeoutId = window.setTimeout(run, 80);
      }
    });

    return () => {
      disposed = true;
      if (
        idleId !== undefined &&
        typeof browserWindow.cancelIdleCallback === "function"
      ) {
        browserWindow.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    loadRegistry,
    loadSkills,
    loadDeployedStatus,
    runtimeCapabilities.skillDistribution,
  ]);

  useEffect(() => {
    if (!runtimeCapabilities.skillPlatformIntegration) {
      setSupportedPlatforms([]);
      setDetectedPlatforms([]);
      return;
    }

    let disposed = false;
    void Promise.all([
      window.api.skill.getSupportedPlatforms(),
      window.api.skill.detectPlatforms(),
    ])
      .then(([platforms, detected]) => {
        if (disposed) {
          return;
        }
        setSupportedPlatforms((current) =>
          platforms.length === 0 && current.length === 0 ? current : platforms,
        );
        setDetectedPlatforms((current) =>
          detected.length === 0 && current.length === 0 ? current : detected,
        );
      })
      .catch((error) => {
        if (disposed) {
          return;
        }
        console.error("Failed to load skill platforms:", error);
        setSupportedPlatforms([]);
        setDetectedPlatforms([]);
      });

    return () => {
      disposed = true;
    };
  }, [runtimeCapabilities.skillPlatformIntegration]);

  useEffect(() => {
    if (
      !runtimeCapabilities.skillPlatformIntegration ||
      skills.length === 0 ||
      availableSkillPlatforms.length === 0
    ) {
      setSkillPlatformStatuses((current) =>
        Object.keys(current).length === 0 ? current : {},
      );
      return;
    }

    let disposed = false;
    void window.api.skill
      .getMdInstallStatusBatch(
        Array.from(new Set(skills.map((skill) => skill.id))),
      )
      .then((statusBySkillId) => {
        if (disposed) {
          return;
        }
        setSkillPlatformStatuses(
          Object.fromEntries(
            Object.entries(statusBySkillId as Record<string, unknown>).map(
              ([skillId, status]) => [
                skillId,
                normalizePlatformStatusMap(status),
              ],
            ),
          ),
        );
      })
      .catch((error) => {
        if (disposed) {
          return;
        }
        console.error("Failed to load skill install status:", error);
        setSkillPlatformStatuses({});
      });

    return () => {
      disposed = true;
    };
  }, [
    availableSkillPlatforms.length,
    runtimeCapabilities.skillPlatformIntegration,
    skills,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    effectiveFilterType,
    effectiveStoreView,
    pageSize,
    searchQuery,
    sourceFilterKey,
    skillFilterTags,
  ]);

  useEffect(() => {
    if (
      sourceFilterKey !== ALL_SKILL_SOURCE_FILTER &&
      activeSourceFilterKey === ALL_SKILL_SOURCE_FILTER
    ) {
      setSourceFilterKey(ALL_SKILL_SOURCE_FILTER);
    }
  }, [activeSourceFilterKey, sourceFilterKey]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (storeView === "store") {
      setIsSelectionMode((prev) => (prev ? false : prev));
      setSelectedSkillIds((prev) => (prev.size === 0 ? prev : new Set()));
    }
  }, [storeView]);

  // Store view: show the skill store page
  // 商店视图：显示技能商店页面
  if (runtimeCapabilities.skillStore && effectiveStoreView === "store") {
    return (
      <SkillViewTransition viewKey="store">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          }
        >
          <SkillStore />
        </Suspense>
      </SkillViewTransition>
    );
  }

  if (runtimeCapabilities.skillLocalScan && effectiveStoreView === "projects") {
    return (
      <SkillViewTransition viewKey="projects">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          }
        >
          <SkillProjectsView />
        </Suspense>
      </SkillViewTransition>
    );
  }

  if (runtimeCapabilities.skillLocalScan && effectiveStoreView === "agents") {
    return (
      <SkillViewTransition viewKey="agents">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          }
        >
          <SkillAgentsView />
        </Suspense>
      </SkillViewTransition>
    );
  }

  // If a skill is selected, show full detail page (same behavior for both gallery and list views)
  // 如果选中了技能，显示全宽详情页（画廊和列表视图使用相同交互）
  const shouldShowSelectedSkillDetail = shouldRenderSelectedSkillDetail(
    selectedSkillId,
    isSelectionMode,
    storeView,
    webSkillLibraryMode,
  );
  if (selectedSkillId && shouldShowSelectedSkillDetail) {
    return (
      <SkillViewTransition viewKey={`detail-${selectedSkillId}`}>
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          }
        >
          <SkillRenderBoundary
            resetKey={selectedSkillId}
            title={t(
              "skill.detailRenderError",
              "This skill cannot be opened right now",
            )}
            description={t(
              "skill.detailRenderErrorHint",
              "This render error was contained so the page stays usable. You can go back to the list or retry loading the detail view now.",
            )}
            primaryActionLabel={t("common.back", "Back")}
            onPrimaryAction={() => selectSkill(null)}
            secondaryActionLabel={t("common.retry", "Retry")}
            onSecondaryAction={() => {
              void loadSkills().then(() => loadDeployedStatus({ force: true }));
            }}
          >
            <SkillFullDetailPage />
          </SkillRenderBoundary>
        </Suspense>
      </SkillViewTransition>
    );
  }

  const toggleSelectionMode = () => {
    setIsSelectionMode((prev) => !prev);
    setSelectedSkillIds((prev) => (prev.size === 0 ? prev : new Set()));
  };

  const toggleSkillSelection = (skillId: string) => {
    setSelectedSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) {
        next.delete(skillId);
      } else {
        next.add(skillId);
      }
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedSkillIds(new Set());
      return;
    }
    setSelectedSkillIds(
      (prev) => new Set([...prev, ...visibleSkills.map((skill) => skill.id)]),
    );
  };

  const handleBatchFavorite = async () => {
    const shouldFavorite = selectedSkills.some((skill) => !skill.is_favorite);
    for (const skill of selectedSkills) {
      if (skill.is_favorite !== shouldFavorite) {
        await toggleFavorite(skill.id);
      }
    }
    setSelectedSkillIds(new Set());
  };

  const handleBatchDelete = async () => {
    if (selectedSkills.length === 0) return;
    await openDeleteConfirm(
      selectedSkills.map((s) => s.id),
      selectedSkills.map((s) => s.name),
    );
  };

  const handleBatchDeploy = () => {
    if (selectedSkills.length === 0) return;
    setShowBatchDeployDialog(true);
  };

  const handleBatchTags = () => {
    if (selectedSkills.length === 0) return;
    setShowBatchTagDialog(true);
  };

  const handleContextMenu = (event: React.MouseEvent, skill: Skill) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, skill });
  };

  const handleAddTagToSkill = async (skill: Skill, rawTag: string) => {
    const normalizedTag = rawTag.trim();
    if (!normalizedTag) {
      return;
    }

    const existingTags = skill.tags || [];
    if (existingTags.includes(normalizedTag)) {
      return;
    }

    try {
      await updateSkill(skill.id, {
        tags: [...existingTags, normalizedTag],
      });
      showToast(
        t("skill.tagAssigned", {
          tag: normalizedTag,
          name: skill.name,
          defaultValue: `已为 ${skill.name} 添加标签 ${normalizedTag}`,
        }),
        "success",
      );
    } catch (error) {
      console.error("Failed to assign skill tag:", error);
      showToast(t("toast.updateFailed", "Update failed"), "error");
    }
  };

  const openSingleSkillTagDialog = (skill: Skill) => {
    setSelectedSkillIds(new Set([skill.id]));
    setShowBatchTagDialog(true);
  };

  const openDeleteConfirm = async (
    skillIds: string[],
    skillNames: string[],
  ) => {
    const fallbackSummary: DeleteDistributionSummary = {
      hasDistribution: skillIds.some((id) => deployedSkillNames.has(id)),
      hasCopy: skillIds.some((id) => deployedSkillNames.has(id)),
      hasSymlink: false,
    };

    setDeleteConfirm({
      isOpen: true,
      skillIds,
      skillNames,
      removeCopyInstallations: false,
      distributionSummary: fallbackSummary,
    });

    try {
      const summaries = await Promise.all(
        skillIds.map(async (skillId) =>
          summarizeInstallDetails(
            await window.api.skill.getMdInstallStatusDetails(skillId),
          ),
        ),
      );
      setDeleteConfirm((current) => {
        if (
          !current.isOpen ||
          current.skillIds.join("\n") !== skillIds.join("\n")
        ) {
          return current;
        }
        return {
          ...current,
          distributionSummary: mergeDeleteDistributionSummaries(summaries),
        };
      });
    } catch (error) {
      console.warn(
        "Failed to inspect skill distribution before delete:",
        error,
      );
    }
  };

  const handleBatchTagSubmit = async (tag: string, mode: SkillBatchTagMode) => {
    const results = await Promise.allSettled(
      selectedSkills.map(async (skill) => {
        const nextTags = updateSkillTags(skill.tags, tag, mode);
        const previousTags = skill.tags || [];

        if (JSON.stringify(nextTags) === JSON.stringify(previousTags)) {
          return { updated: false, name: skill.name };
        }

        await updateSkill(skill.id, { tags: nextTags });
        return { updated: true, name: skill.name };
      }),
    );

    const updatedCount = results.filter(
      (result) => result.status === "fulfilled" && result.value.updated,
    ).length;
    const failedCount = results.filter(
      (result) => result.status === "rejected",
    ).length;

    showToast(
      failedCount > 0
        ? t("skill.batchTagPartialFailure", {
            updated: updatedCount,
            failed: failedCount,
            defaultValue: `标签批量更新完成，成功 ${updatedCount} 个，失败 ${failedCount} 个`,
          })
        : mode === "add"
          ? t("skill.batchTagAddSuccess", {
              count: updatedCount,
              defaultValue: `已为 ${updatedCount} 个 skill 添加标签`,
            })
          : t("skill.batchTagRemoveSuccess", {
              count: updatedCount,
              defaultValue: `已从 ${updatedCount} 个 skill 移除标签`,
            }),
      failedCount > 0 ? "error" : "success",
    );
    setSelectedSkillIds(new Set());
  };

  const confirmDelete = async () => {
    for (const id of deleteConfirm.skillIds) {
      await deleteSkill(id, {
        removeCopyInstallations: deleteConfirm.removeCopyInstallations,
      });
    }
    setDeleteConfirm({
      isOpen: false,
      skillIds: [],
      skillNames: [],
      removeCopyInstallations: false,
      distributionSummary: EMPTY_DELETE_DISTRIBUTION_SUMMARY,
    });
    setSelectedSkillIds(new Set());
    setIsSelectionMode(false);
  };

  const headerTitle = isDistributionView
    ? t("nav.distribution", "Distribution")
    : effectiveFilterType === "favorites"
      ? t("nav.favorites", "Favorites")
      : effectiveFilterType === "installed"
        ? t("skill.imported", "Imported")
        : effectiveFilterType === "deployed"
          ? t("skill.deployed", "Distributed")
          : effectiveFilterType === "pending"
            ? t("skill.pendingDeployment", "Pending")
            : t("nav.mySkills", "My Skills");

  const emptyStateTitle = isDistributionView
    ? t("skill.noSkills", "No skills yet")
    : effectiveFilterType === "favorites"
      ? t("skill.noFavorites", "No favorite skills")
      : effectiveFilterType === "installed"
        ? t("skill.noImportedSkills", "No imported skills yet")
        : effectiveFilterType === "deployed"
          ? t("skill.noDeployedSkills", "No distributed skills yet")
          : effectiveFilterType === "pending"
            ? t("skill.noPendingSkills", "No pending skills")
            : t("skill.noSkills", "No skills yet");

  const emptyStateHint = webSkillLibraryMode
    ? t(
        "skill.webLibraryHint",
        "Create or import your own skills here. Platform distribution and skill marketplaces are desktop-only.",
      )
    : isDistributionView
      ? t(
          "skill.noDistributionSkillsHint",
          "Import skills first, then install, sync, or uninstall them to Claude, Cursor, and other platforms here.",
        )
      : effectiveFilterType === "favorites"
        ? t(
            "skill.noFavoritesHint",
            "Click the star on skill cards to add favorites",
          )
        : effectiveFilterType === "installed"
          ? t(
              "skill.noImportedSkillsHint",
              "After importing from Skill Store, local scan, GitHub, or manual creation, they will appear here.",
            )
          : effectiveFilterType === "deployed"
            ? t(
                "skill.noDeployedSkillsHint",
                "After distributing skills to Claude, Cursor, or other platforms, they will show up here.",
              )
            : effectiveFilterType === "pending"
              ? t(
                  "skill.noPendingSkillsHint",
                  "Skills not yet distributed to any platform will appear here.",
                )
              : t(
                  "skill.noSkillsHint",
                  "Import skills from Skill Store, scan local environments, or create one manually to get started",
                );

  const headerSubtitle = webSkillLibraryMode
    ? t(
        "skill.webLibrarySubtitle",
        "Manage your personal skill library in the self-hosted web workspace.",
      )
    : isDistributionView
      ? t(
          "skill.distributionHint",
          "Manage install, sync, and uninstall across connected platforms.",
        )
      : t(
          "skill.workspaceHint",
          "Manage all imported skills in one place, regardless of where they came from.",
        );
  const distributionStatsLabel = isDistributionView
    ? t("skill.distributionStats", {
        deployed: deployedSkillNames.size,
        total: skills.length,
        defaultValue: `${deployedSkillNames.size} deployed / ${skills.length} total`,
      })
    : null;
  const handleRefreshLibrary = async () => {
    if (isRefreshingLibrary) return;
    setIsRefreshingLibrary(true);
    try {
      await loadSkills();
      if (runtimeCapabilities.skillDistribution) {
        await loadDeployedStatus({ force: true });
      }
      showToast(
        t("skill.refreshLibraryComplete", "Skill library refreshed"),
        "success",
      );
    } catch (error) {
      console.error("Failed to refresh skill library:", error);
      showToast(
        t("skill.refreshLibraryFailed", "Failed to refresh skill library"),
        "error",
      );
    } finally {
      setIsRefreshingLibrary(false);
    }
  };
  const goToPage = (page: number) => {
    setCurrentPage(Math.min(Math.max(page, 1), totalPages));
  };
  const visiblePageNumbers = getVisiblePageNumbers(currentPage, totalPages);
  const contextMenuItems: ContextMenuItem[] = (() => {
    if (!contextMenu) {
      return [];
    }

    const { skill } = contextMenu;
    return [
      {
        label: t("skill.viewDetail", "View Details"),
        icon: <EyeIcon className="w-4 h-4" />,
        onClick: () => selectSkill(skill.id),
      },
      {
        label: skill.is_favorite
          ? t("skill.removeFavorite", "Remove Favorite")
          : t("skill.addFavorite", "Add Favorite"),
        icon: (
          <StarIcon
            className={`w-4 h-4 ${
              skill.is_favorite ? "fill-amber-400 text-amber-400" : ""
            }`}
          />
        ),
        onClick: () => void toggleFavorite(skill.id),
      },
      {
        label: t("skill.batchTags", "Batch Tags"),
        icon: <TagsIcon className="w-4 h-4" />,
        onClick: () => openSingleSkillTagDialog(skill),
      },
      ...(runtimeCapabilities.skillPlatformIntegration
        ? [
            {
              label: t("skill.quickInstall", "Quick Install"),
              icon: <SendIcon className="w-4 h-4" />,
              onClick: () => setQuickInstallSkill(skill),
            } satisfies ContextMenuItem,
          ]
        : []),
      {
        label: t("common.delete", "Delete"),
        icon: <TrashIcon className="w-4 h-4" />,
        variant: "destructive",
        onClick: () => void openDeleteConfirm([skill.id], [skill.name]),
      },
    ];
  })();

  return (
    <SkillViewTransition
      viewKey="my-skills"
      className="relative flex flex-1 flex-row overflow-hidden app-wallpaper-section"
      onDragEnter={(event) => {
        if (!hasFileItems(event.dataTransfer)) {
          return;
        }

        event.preventDefault();
        setIsDropTargetActive(true);
      }}
      onDragOver={(event) => {
        if (!hasFileItems(event.dataTransfer)) {
          return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        if (!isDropTargetActive) {
          setIsDropTargetActive(true);
        }
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return;
        }

        setIsDropTargetActive(false);
      }}
      onDrop={(event) => {
        if (!hasFileItems(event.dataTransfer)) {
          return;
        }

        event.preventDefault();
        setIsDropTargetActive(false);
        void handleDropImport(event.dataTransfer.files);
      }}
    >
      <div className="flex-1 flex flex-col min-w-0">
        <SkillManagerLibraryHeader
          activeSourceFilterKey={activeSourceFilterKey}
          allVisibleSelected={allVisibleSelected}
          canDistribute={runtimeCapabilities.skillDistribution}
          currentPage={currentPage}
          distributionStatsLabel={distributionStatsLabel}
          effectiveFilterType={effectiveFilterType}
          effectiveStoreView={effectiveStoreView}
          filteredCount={filteredSkills.length}
          galleryColumnOptions={galleryColumnOptions}
          galleryColumns={galleryColumns ?? "auto"}
          hasActiveSourceFilter={hasActiveSourceFilter}
          headerSubtitle={headerSubtitle}
          headerTitle={headerTitle}
          isDistributionView={isDistributionView}
          isRefreshingLibrary={isRefreshingLibrary}
          isSelectionMode={isSelectionMode}
          mySkillFilterOptions={mySkillFilterOptions}
          onBatchDelete={() => void handleBatchDelete()}
          onBatchDeploy={handleBatchDeploy}
          onBatchFavorite={() => void handleBatchFavorite()}
          onBatchTags={handleBatchTags}
          onClearSkillTags={handleClearSkillTags}
          onToggleSkillTag={handleToggleSkillTag}
          skillActiveTags={skillFilterTags}
          skillTagOptions={skillTagOptions}
          onFilterChange={handleMySkillFilterChange}
          onGalleryColumnsChange={setGalleryColumns}
          onRefresh={() => void handleRefreshLibrary()}
          onSelectAllVisible={handleSelectAllVisible}
          onSourceFilterChange={setSourceFilterKey}
          onToggleSelectionMode={toggleSelectionMode}
          onViewModeChange={setViewMode}
          pageSize={pageSize}
          selectedCount={selectedSkillIds.size}
          selectedSkillsAreFavorites={selectedSkills.every(
            (skill) => skill.is_favorite,
          )}
          sourceFilterOptions={sourceFilterOptions}
          t={t}
          totalPages={totalPages}
          totalSkillCount={skills.length}
          viewMode={viewMode}
          webSkillLibraryMode={webSkillLibraryMode}
        />

        <SkillManagerLibraryContent
          currentPage={currentPage}
          distributedPlatformsBySkillId={distributedPlatformsBySkillId}
          emptyStateHint={emptyStateHint}
          emptyStateTitle={emptyStateTitle}
          filteredSkills={filteredSkills}
          isSelectionMode={isSelectionMode}
          onAddTag={(skill, tag) => void handleAddTagToSkill(skill, tag)}
          onContextMenu={handleContextMenu}
          onOpen={selectSkill}
          onPageChange={goToPage}
          onPageSizeChange={(size) => {
            setSkillListPageSize?.(size);
            setCurrentPage(1);
          }}
          onQuickInstall={setQuickInstallSkill}
          onRequestDelete={(ids, names) => void openDeleteConfirm(ids, names)}
          onToggleFavorite={toggleFavorite}
          onToggleSelection={toggleSkillSelection}
          pageSize={pageSize}
          selectedSkillIds={selectedSkillIds}
          skillGalleryGridStyle={skillGalleryGridStyle}
          skillsWithStoreUpdates={skillsWithStoreUpdates}
          t={t}
          totalPages={totalPages}
          viewMode={viewMode}
          visiblePageNumbers={visiblePageNumbers}
          visibleSkills={visibleSkills}
        />
      </div>

      {/* Quick Install Modal */}
      {/* 快速安装弹窗 */}
      {runtimeCapabilities.skillPlatformIntegration && quickInstallSkill && (
        <SkillQuickInstall
          skill={quickInstallSkill}
          onClose={() => setQuickInstallSkill(null)}
        />
      )}

      {/* Scan Preview Modal */}
      {/* 扫描预览弹窗 */}
      {runtimeCapabilities.skillLocalScan && showScanPreview && (
        <Suspense fallback={null}>
          <SkillScanPreview
            scannedSkills={scannedSkills}
            installedPaths={
              new Set(
                skills.flatMap((s) =>
                  [s.local_repo_path, s.source_url].filter(
                    (v): v is string => typeof v === "string" && v.length > 0,
                  ),
                ),
              )
            }
            onImport={handleImportScanned}
            onRescan={handleRescan}
            onClose={() => setShowScanPreview(false)}
          />
        </Suspense>
      )}

      {runtimeCapabilities.skillDistribution && showBatchDeployDialog && (
        <Suspense fallback={null}>
          <SkillBatchDeployDialog
            skills={selectedSkills}
            onClose={() => setShowBatchDeployDialog(false)}
            onComplete={async () => {
              if (runtimeCapabilities.skillDistribution) {
                await loadDeployedStatus({ force: true });
              }
            }}
          />
        </Suspense>
      )}

      {showBatchTagDialog && (
        <Suspense fallback={null}>
          <SkillBatchTagDialog
            skills={selectedSkills}
            onClose={() => setShowBatchTagDialog(false)}
            onSubmit={handleBatchTagSubmit}
          />
        </Suspense>
      )}
      <SkillDeleteConfirmDialog
        confirmation={deleteConfirm}
        copyHelpId={deleteCopyInstallationsHelpId}
        copyInputId={deleteCopyInstallationsInputId}
        copyLabelId={deleteCopyInstallationsLabelId}
        onClose={() =>
          setDeleteConfirm({
            isOpen: false,
            skillIds: [],
            skillNames: [],
            removeCopyInstallations: false,
            distributionSummary: EMPTY_DELETE_DISTRIBUTION_SUMMARY,
          })
        }
        onConfirm={() => void confirmDelete()}
        onRemoveCopyInstallationsChange={(checked) =>
          setDeleteConfirm((current) => ({
            ...current,
            removeCopyInstallations: checked,
          }))
        }
        t={t}
      />
      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      ) : null}

      {isDropTargetActive ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="mx-6 w-full max-w-2xl rounded-3xl border border-primary/30 bg-background/95 px-8 py-10 shadow-2xl">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/25">
                <InboxIcon className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <div className="text-lg font-semibold text-foreground">
                  {t("skill.dropImportTitle", "Drop skills to import")}
                </div>
                <div className="text-sm leading-6 text-muted-foreground">
                  {t(
                    "skill.dropImportDesc",
                    "Drop a skill folder or a file named SKILL.md here to open the existing scan preview and import flow.",
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </SkillViewTransition>
  );
}
