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
  RefreshCwIcon,
  TrashIcon,
  StarIcon,
  SendIcon,
  Clock3Icon,
  LayoutGridIcon,
  ListIcon,
  CheckSquareIcon,
  SquareIcon,
  XIcon,
  TagsIcon,
  InboxIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
} from "lucide-react";
import { SkillGalleryCard } from "./SkillGalleryCard";
import { SkillRenderBoundary } from "./SkillRenderBoundary";
import {
  useSkillStore,
  type SkillGalleryColumnMode,
  type SkillFilterType,
} from "../../stores/skill.store";
import {
  DEFAULT_SKILL_LIST_PAGE_SIZE,
  SKILL_LIST_PAGE_SIZE_OPTIONS,
  useSettingsStore,
} from "../../stores/settings.store";
import { SkillQuickInstall } from "./SkillQuickInstall";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import { Select, type SelectOption } from "../ui/Select";
import { Spinner } from "../ui/Spinner";
import { useToast } from "../ui/Toast";
import type {
  Skill,
  ScannedSkill,
  SkillPlatformInstallStatusMap,
} from "@prompthub/shared/types";
import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
import { updateSkillTags, type SkillBatchTagMode } from "./batch-utils";
import { filterVisibleSkills } from "../../services/skill-filter";
import { buildMySkillSourceBadges } from "../../services/skill-source-badges";
import { getRemoteStoreSkills } from "../../services/remote-store-entry";
import { hasRegistrySkillVersionChanged } from "../../services/skill-store-update";
import { getRuntimeCapabilities } from "../../runtime";
import { useSkillStoreRemoteSync } from "./store-remote-sync";
import { filterDetectedPlatforms } from "../../services/platform-visibility";

const MAX_STAGGERED_CARDS = 10;
const CARD_STAGGER_MS = 50;
const SKILL_GALLERY_AUTO_MIN_WIDTH_PX = 280;
const SKILL_GALLERY_MANUAL_MIN_WIDTH_PX = 240;
const SKILL_GALLERY_COLUMNS: SkillGalleryColumnMode[] = [
  "auto",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
];
const LOCAL_SKILL_SCAN_TIMEOUT_MS = 30_000;
const ALL_SKILL_SOURCE_FILTER = "all";
const SKILL_VIEW_TRANSITION_CLASS =
  "h-full min-h-0 animate-in fade-in slide-in-from-right-3 duration-smooth";

interface SkillViewTransitionProps extends React.HTMLAttributes<HTMLDivElement> {
  viewKey: string;
}

function SkillViewTransition({
  viewKey,
  className = "",
  children,
  ...props
}: SkillViewTransitionProps) {
  return (
    <div
      key={viewKey}
      data-testid="skill-view-transition"
      data-skill-view={viewKey}
      className={`${SKILL_VIEW_TRANSITION_CLASS} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  createTimeoutError: () => Error,
): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(createTimeoutError());
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  });
}

function getSkillGalleryGridStyle(
  columns: SkillGalleryColumnMode,
): React.CSSProperties {
  if (columns === "auto") {
    return {
      gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${SKILL_GALLERY_AUTO_MIN_WIDTH_PX}px), 1fr))`,
    };
  }

  const columnCount = Number(columns);
  const totalGapRem = columnCount - 1;

  return {
    gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, max(${SKILL_GALLERY_MANUAL_MIN_WIDTH_PX}px, calc((100% - ${totalGapRem}rem) / ${columnCount}))), 1fr))`,
  };
}

// Lazy load list view for better performance
// 懒加载列表视图以提升性能
const SkillListView = lazy(() =>
  import("./SkillListView").then((m) => ({ default: m.SkillListView })),
);
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

interface DeleteDistributionSummary {
  hasDistribution: boolean;
  hasCopy: boolean;
  hasSymlink: boolean;
}

const EMPTY_DELETE_DISTRIBUTION_SUMMARY: DeleteDistributionSummary = {
  hasDistribution: false,
  hasCopy: false,
  hasSymlink: false,
};

function normalizeDroppedSkillPath(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, "/").trim();
  if (!normalizedPath) {
    return "";
  }

  const lowerPath = normalizedPath.toLowerCase();
  if (lowerPath.endsWith("/skill.md")) {
    const slashIndex = normalizedPath.lastIndexOf("/");
    return slashIndex > 0
      ? normalizedPath.slice(0, slashIndex)
      : normalizedPath;
  }

  if (lowerPath.endsWith(".md")) {
    return "";
  }

  return normalizedPath;
}

function hasFileItems(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.items).some((item) => item.kind === "file");
}

function summarizeInstallDetails(
  details: SkillPlatformInstallStatusMap,
): DeleteDistributionSummary {
  const installed = Object.values(details).filter((status) => status.installed);
  return {
    hasDistribution: installed.length > 0,
    hasCopy: installed.some((status) => status.mode === "copy" || !status.mode),
    hasSymlink: installed.some((status) => status.mode === "symlink"),
  };
}

function normalizePlatformStatusMap(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, boolean] => {
      const [, installed] = entry;
      return typeof installed === "boolean";
    }),
  );
}

function mergeDeleteDistributionSummaries(
  summaries: DeleteDistributionSummary[],
): DeleteDistributionSummary {
  return summaries.reduce(
    (merged, summary) => ({
      hasDistribution: merged.hasDistribution || summary.hasDistribution,
      hasCopy: merged.hasCopy || summary.hasCopy,
      hasSymlink: merged.hasSymlink || summary.hasSymlink,
    }),
    EMPTY_DELETE_DISTRIBUTION_SUMMARY,
  );
}

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
      filterDetectedPlatforms(
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
  const { remoteStoreEntries } = useSkillStoreRemoteSync({
    eagerRemoteSources: "all",
  });

  const scanLocalPreview = useSkillStore((state) => state.scanLocalPreview);
  const importScannedSkills = useSkillStore(
    (state) => state.importScannedSkills,
  );
  const skillsWithStoreUpdates = useMemo(() => {
    const registrySkillBySlug = new Map(
      Object.values(remoteStoreEntries)
        .flatMap((entry) => getRemoteStoreSkills(entry))
        .map((skill) => [skill.slug, skill]),
    );

    return new Set(
      skills
        .filter((skill) => {
          if (!skill.registry_slug) {
            return false;
          }

          const registrySkill = registrySkillBySlug.get(skill.registry_slug);
          if (!registrySkill) {
            return false;
          }

          if (skill.installed_content_hash) {
            return hasRegistrySkillVersionChanged(skill, registrySkill);
          }

          return hasRegistrySkillVersionChanged(skill, registrySkill);
        })
        .map((skill) => skill.id),
    );
  }, [remoteStoreEntries, skills]);

  // Delete confirmation dialog state
  // 删除确认对话框状态
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    skillIds: string[];
    skillNames: string[];
    removeCopyInstallations: boolean;
    distributionSummary: DeleteDistributionSummary;
  }>({
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
  ) => {
    const result = await importScannedSkills(skillsToImport, userTagsByPath);
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
  }, [loadSkills, loadDeployedStatus, runtimeCapabilities.skillDistribution]);

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
  if (selectedSkillId && !isSelectionMode) {
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
  const goToPage = (page: number) => {
    setCurrentPage(Math.min(Math.max(page, 1), totalPages));
  };
  const visiblePageNumbers = (() => {
    const windowSize = Math.min(5, totalPages);
    if (totalPages <= windowSize) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }
    if (currentPage <= 3) {
      return Array.from({ length: windowSize }, (_, index) => index + 1);
    }
    if (currentPage >= totalPages - 2) {
      return Array.from(
        { length: windowSize },
        (_, index) => totalPages - windowSize + index + 1,
      );
    }
    return Array.from(
      { length: windowSize },
      (_, index) => currentPage - 2 + index,
    );
  })();
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
        {/* Header */}
        <div className="border-b border-border app-wallpaper-panel-strong px-4 py-4 z-10 sm:px-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <CuboidIcon className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold">{headerTitle}</h2>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-white/5 bg-accent/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    {isDistributionView
                      ? distributionStatsLabel
                      : `${filteredSkills.length}${effectiveFilterType !== "all" ? ` / ${skills.length}` : ""}`}
                  </span>
                  {filteredSkills.length > 0 && totalPages > 1 && (
                    <span className="text-[11px] text-muted-foreground">
                      {t("skill.paginationSummary", {
                        start: (currentPage - 1) * pageSize + 1,
                        end: Math.min(
                          currentPage * pageSize,
                          filteredSkills.length,
                        ),
                        total: filteredSkills.length,
                        defaultValue: `${(currentPage - 1) * pageSize + 1}-${Math.min(
                          currentPage * pageSize,
                          filteredSkills.length,
                        )} / ${filteredSkills.length}`,
                      })}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {headerSubtitle}
                </p>
              </div>

              <div className="flex items-center gap-2 self-start lg:self-center lg:justify-end">
                <button
                  type="button"
                  onClick={toggleSelectionMode}
                  aria-pressed={isSelectionMode}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                    isSelectionMode
                      ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                      : "border-border app-wallpaper-surface text-foreground hover:border-primary/25 hover:bg-accent"
                  }`}
                  title={t("skill.batchManage", "Batch Manage")}
                  aria-label={t("skill.batchManage", "Batch Manage")}
                >
                  {isSelectionMode ? (
                    <XIcon aria-hidden="true" className="w-4 h-4" />
                  ) : (
                    <CheckSquareIcon aria-hidden="true" className="w-4 h-4" />
                  )}
                  {t("skill.batchManage", "Batch Manage")}
                </button>
                <div className="flex items-center bg-muted rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode("gallery")}
                    aria-label={t("skill.galleryView", "Gallery View")}
                    className={`p-2 rounded-md transition-colors ${
                      viewMode === "gallery"
                        ? "app-wallpaper-surface text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title={t("skill.galleryView", "Gallery View")}
                  >
                    <LayoutGridIcon aria-hidden="true" className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    aria-label={t("skill.listView", "List View")}
                    className={`p-2 rounded-md transition-colors ${
                      viewMode === "list"
                        ? "app-wallpaper-surface text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title={t("skill.listView", "List View")}
                  >
                    <ListIcon aria-hidden="true" className="w-4 h-4" />
                  </button>
                </div>
                {viewMode === "gallery" && (
                  <Select
                    ariaLabel={t(
                      "skill.galleryColumnsLabel",
                      "Skill card columns",
                    )}
                    value={galleryColumns ?? "auto"}
                    onChange={(value) =>
                      setGalleryColumns(value as SkillGalleryColumnMode)
                    }
                    options={galleryColumnOptions}
                    className="w-[118px]"
                    triggerClassName="h-10 w-full rounded-lg border border-border app-wallpaper-surface px-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary/30 flex items-center justify-between gap-2"
                  />
                )}
                <div className="h-4 w-px bg-border" />
                <button
                  type="button"
                  onClick={async () => {
                    if (isRefreshingLibrary) {
                      return;
                    }
                    setIsRefreshingLibrary(true);
                    try {
                      await loadSkills();
                      if (runtimeCapabilities.skillDistribution) {
                        await loadDeployedStatus({ force: true });
                      }
                      showToast(
                        t(
                          "skill.refreshLibraryComplete",
                          "Skill library refreshed",
                        ),
                        "success",
                      );
                    } catch (error) {
                      console.error("Failed to refresh skill library:", error);
                      showToast(
                        t(
                          "skill.refreshLibraryFailed",
                          "Failed to refresh skill library",
                        ),
                        "error",
                      );
                    } finally {
                      setIsRefreshingLibrary(false);
                    }
                  }}
                  disabled={isRefreshingLibrary}
                  className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors"
                  aria-label={`${t("settings.refresh")} - ${t(
                    "skill.refreshLibraryHint",
                    "Reload the PromptHub Skill library and platform distribution status.",
                  )}`}
                  title={`${t("settings.refresh")} - ${t(
                    "skill.refreshLibraryHint",
                    "Reload the PromptHub Skill library and platform distribution status.",
                  )}`}
                >
                  <RefreshCwIcon
                    aria-hidden="true"
                    className={`w-4 h-4 ${isRefreshingLibrary ? "animate-spin" : ""}`}
                  />
                </button>
              </div>
            </div>

            {effectiveStoreView === "my-skills" && !webSkillLibraryMode ? (
              <div className="flex flex-wrap items-center gap-2">
                {mySkillFilterOptions.map((option) => {
                  const isActive = effectiveFilterType === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleMySkillFilterChange(option.value)}
                      aria-pressed={isActive}
                      className={`inline-flex h-9 min-w-[8rem] items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors ${
                        isActive
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-border app-wallpaper-surface text-muted-foreground hover:border-primary/25 hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      {option.icon}
                      <span>{option.label}</span>
                      <span
                        className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] ${
                          isActive
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {option.count}
                      </span>
                    </button>
                  );
                })}
                <Select
                  ariaLabel={t("skill.sourceFilterLabel", "Skill source")}
                  value={activeSourceFilterKey}
                  onChange={(value) => setSourceFilterKey(value)}
                  options={sourceFilterOptions}
                  className="min-w-[13rem] flex-1 sm:flex-none"
                  triggerClassName={`h-9 w-full rounded-xl border px-3 text-sm font-medium shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 flex items-center justify-between gap-2 ${
                    hasActiveSourceFilter
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border app-wallpaper-surface text-muted-foreground hover:border-primary/25 hover:bg-accent hover:text-foreground"
                  }`}
                />
              </div>
            ) : null}

            {isSelectionMode ? (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/15 bg-primary/[0.06] p-2">
                <div className="px-3 py-2">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-primary/80">
                    {t("skill.selectionMode", "Batch Mode")}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-foreground">
                    {t("skill.selectedCount", {
                      count: selectedSkillIds.size,
                      defaultValue: `${selectedSkillIds.size} selected`,
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSelectAllVisible}
                  className="inline-flex items-center gap-2 rounded-xl border border-border app-wallpaper-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/25 hover:bg-accent"
                  title={
                    allVisibleSelected
                      ? t("common.clear", "Clear")
                      : t("common.selectAll", "Select All")
                  }
                  aria-label={
                    allVisibleSelected
                      ? t("common.clear", "Clear")
                      : t("common.selectAll", "Select All")
                  }
                >
                  {allVisibleSelected ? (
                    <CheckSquareIcon
                      aria-hidden="true"
                      className="w-4 h-4 text-primary"
                    />
                  ) : (
                    <SquareIcon
                      aria-hidden="true"
                      className="w-4 h-4 text-muted-foreground"
                    />
                  )}
                  {allVisibleSelected
                    ? t("common.clear", "Clear")
                    : t("common.selectAll", "Select All")}
                </button>
                <button
                  type="button"
                  onClick={handleBatchFavorite}
                  disabled={selectedSkillIds.size === 0}
                  className="inline-flex items-center gap-2 rounded-xl border border-border app-wallpaper-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/25 hover:bg-accent disabled:opacity-50"
                  aria-label={
                    selectedSkills.every((skill) => skill.is_favorite)
                      ? t("skill.removeFavorite", "Remove Favorite")
                      : t("skill.addFavorite", "Add Favorite")
                  }
                  title={
                    selectedSkills.every((skill) => skill.is_favorite)
                      ? t("skill.removeFavorite", "Remove Favorite")
                      : t("skill.addFavorite", "Add Favorite")
                  }
                >
                  <StarIcon
                    aria-hidden="true"
                    className="w-4 h-4 text-amber-500"
                  />
                  {selectedSkills.every((skill) => skill.is_favorite)
                    ? t("skill.removeFavorite", "Remove Favorite")
                    : t("skill.addFavorite", "Add Favorite")}
                </button>
                <button
                  type="button"
                  onClick={handleBatchTags}
                  disabled={selectedSkillIds.size === 0}
                  className="inline-flex items-center gap-2 rounded-xl border border-border app-wallpaper-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/25 hover:bg-accent disabled:opacity-50"
                  title={t("skill.batchTags", "Batch Tags")}
                  aria-label={t("skill.batchTags", "Batch Tags")}
                >
                  <TagsIcon
                    aria-hidden="true"
                    className="w-4 h-4 text-primary"
                  />
                  {t("skill.batchTags", "Batch Tags")}
                </button>
                {runtimeCapabilities.skillDistribution && (
                  <button
                    type="button"
                    onClick={handleBatchDeploy}
                    disabled={selectedSkillIds.size === 0}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                    title={t("skill.batchDeploy", "Batch Deploy")}
                    aria-label={t("skill.batchDeploy", "Batch Deploy")}
                  >
                    <SendIcon aria-hidden="true" className="w-4 h-4" />
                    {t("skill.batchDeploy", "Batch Deploy")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleBatchDelete}
                  disabled={selectedSkillIds.size === 0}
                  className="inline-flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/15 disabled:opacity-50"
                  title={t("common.delete", "Delete")}
                  aria-label={t("common.delete", "Delete")}
                >
                  <TrashIcon aria-hidden="true" className="w-4 h-4" />
                  {t("common.delete", "Delete")}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Content */}
        <div
          className={
            viewMode === "list"
              ? "flex-1 overflow-hidden scrollbar-hide"
              : "flex-1 overflow-y-auto scrollbar-hide"
          }
        >
          {viewMode === "list" ? (
            /* List View */
            /* 列表视图 */
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full">
                  <Spinner />
                </div>
              }
            >
              <SkillListView
                skills={visibleSkills}
                skillsWithStoreUpdates={skillsWithStoreUpdates}
                onContextMenu={handleContextMenu}
                onDropTag={(skill, tag) => void handleAddTagToSkill(skill, tag)}
                onQuickInstall={setQuickInstallSkill}
                onRequestDelete={(id, name) =>
                  void openDeleteConfirm([id], [name])
                }
                selectionMode={isSelectionMode}
                selectedSkillIds={selectedSkillIds}
                onToggleSelection={toggleSkillSelection}
              />
            </Suspense>
          ) : (
            /* Gallery View */
            /* 画廊视图 */
            <div className="p-6">
              {filteredSkills.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground animate-in fade-in zoom-in-95 duration-slow py-20">
                  <div className="p-8 bg-accent/30 rounded-full mb-6 relative">
                    <CuboidIcon className="w-20 h-20 opacity-20" />
                    <div className="absolute inset-0 border-4 border-primary/10 rounded-full animate-pulse" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    {emptyStateTitle}
                  </h3>
                  <p className="text-sm opacity-70 mb-8 max-w-sm text-center">
                    {emptyStateHint}
                  </p>
                </div>
              ) : (
                <div className="grid gap-4" style={skillGalleryGridStyle}>
                  {visibleSkills.map((skill, index) => {
                    const isSelected = selectedSkillIds.has(skill.id);

                    return (
                      <SkillGalleryCard
                        key={skill.id}
                        animationDelayMs={
                          Math.min(index, MAX_STAGGERED_CARDS) * CARD_STAGGER_MS
                        }
                        distributedPlatforms={
                          distributedPlatformsBySkillId.get(skill.id) ?? []
                        }
                        hasStoreUpdate={skillsWithStoreUpdates.has(skill.id)}
                        isSelected={isSelected}
                        isSelectionMode={isSelectionMode}
                        onDelete={(selectedSkill) =>
                          void openDeleteConfirm(
                            [selectedSkill.id],
                            [selectedSkill.name],
                          )
                        }
                        onContextMenu={handleContextMenu}
                        onDropTag={(selectedSkill, tag) =>
                          void handleAddTagToSkill(selectedSkill, tag)
                        }
                        onOpen={selectSkill}
                        onQuickInstall={setQuickInstallSkill}
                        onToggleFavorite={toggleFavorite}
                        onToggleSelection={toggleSkillSelection}
                        skill={skill}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        {filteredSkills.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border app-wallpaper-panel-strong px-4 py-3">
            <div className="text-sm text-muted-foreground">
              {t("skill.paginationSummary", {
                start: (currentPage - 1) * pageSize + 1,
                end: Math.min(currentPage * pageSize, filteredSkills.length),
                total: filteredSkills.length,
                defaultValue: `${(currentPage - 1) * pageSize + 1}-${Math.min(
                  currentPage * pageSize,
                  filteredSkills.length,
                )} / ${filteredSkills.length}`,
              })}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  {t("prompt.pageSize", "每页")}
                </span>
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setSkillListPageSize?.(Number(event.target.value));
                    setCurrentPage(1);
                  }}
                  className="rounded-md border border-border bg-muted px-2 py-1 text-sm text-foreground"
                >
                  {SKILL_LIST_PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  aria-label={t("common.previous", "Previous")}
                  className="rounded-md p-1.5 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  title={t("common.previous", "Previous")}
                >
                  <ChevronLeftIcon aria-hidden="true" className="h-4 w-4" />
                </button>
                {visiblePageNumbers.map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => goToPage(page)}
                    aria-current={currentPage === page ? "page" : undefined}
                    className={`h-8 w-8 rounded-md text-sm transition-colors ${
                      currentPage === page
                        ? "bg-primary text-white"
                        : "hover:bg-accent"
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  aria-label={t("common.next", "Next")}
                  className="rounded-md p-1.5 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  title={t("common.next", "Next")}
                >
                  <ChevronRightIcon aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ) : null}
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
      {/* Delete confirmation dialog */}
      {/* 删除确认对话框 */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() =>
          setDeleteConfirm({
            isOpen: false,
            skillIds: [],
            skillNames: [],
            removeCopyInstallations: false,
            distributionSummary: EMPTY_DELETE_DISTRIBUTION_SUMMARY,
          })
        }
        onConfirm={confirmDelete}
        variant="destructive"
        title={t("skill.confirmDeleteTitle", "Confirm Delete")}
        message={
          <div className="space-y-2">
            <p>
              {deleteConfirm.skillNames.length === 1
                ? t("skill.confirmDeleteSingle", {
                    name: deleteConfirm.skillNames[0],
                    defaultValue: `Are you sure you want to delete skill "${deleteConfirm.skillNames[0]}"?`,
                  })
                : t("skill.confirmDeleteMultiple", {
                    count: deleteConfirm.skillNames.length,
                    defaultValue: `Are you sure you want to delete ${deleteConfirm.skillNames.length} selected skills?`,
                  })}
            </p>
            <p className="text-xs text-muted-foreground/80">
              {deleteConfirm.distributionSummary.hasDistribution
                ? t(
                    "skill.deleteDistributedHint",
                    "This removes the skill from PromptHub. Source files are preserved. Distributed symlinks will be removed because they point back to PromptHub.",
                  )
                : t(
                    "skill.deleteSourceOnlyHint",
                    "Only removes this skill from the PromptHub library. Source files are preserved.",
                  )}
            </p>
            {deleteConfirm.distributionSummary.hasSymlink ? (
              <p className="text-xs text-destructive">
                {t(
                  "skill.deleteSymlinkInstallationsHint",
                  "Symlink distributions will be deleted directly.",
                )}
              </p>
            ) : null}
            {deleteConfirm.distributionSummary.hasCopy ? (
              <label
                htmlFor={deleteCopyInstallationsInputId}
                className="flex items-start gap-2 rounded-xl border border-border bg-accent/30 p-3 text-xs"
              >
                <input
                  id={deleteCopyInstallationsInputId}
                  type="checkbox"
                  aria-labelledby={deleteCopyInstallationsLabelId}
                  aria-describedby={deleteCopyInstallationsHelpId}
                  className="mt-0.5 h-4 w-4 accent-primary"
                  checked={deleteConfirm.removeCopyInstallations}
                  onChange={(event) =>
                    setDeleteConfirm((current) => ({
                      ...current,
                      removeCopyInstallations: event.currentTarget.checked,
                    }))
                  }
                />
                <span>
                  <span
                    id={deleteCopyInstallationsLabelId}
                    className="block font-medium text-foreground"
                  >
                    {t(
                      "skill.deleteCopyInstallationsLabel",
                      "Also delete copied distributions",
                    )}
                  </span>
                  <span
                    id={deleteCopyInstallationsHelpId}
                    className="mt-1 block text-muted-foreground"
                  >
                    {t(
                      "skill.deleteCopyInstallationsHelp",
                      "Leave unchecked to keep copied Agent or project folders as detached copies.",
                    )}
                  </span>
                </span>
              </label>
            ) : null}
          </div>
        }
        confirmText={t("common.delete", "Delete")}
        cancelText={t("common.cancel", "Cancel")}
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
