import { observedDistributionPresence } from "@prompthub/shared/utils/resource-observation";
import {
  countResources,
  filterResources,
  paginateResources,
} from "@prompthub/shared/utils/resource-library";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BotIcon,
  Clock3Icon,
  PackageIcon,
  SendIcon,
  StarIcon,
  StoreIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  PluginLibraryEntry,
  PluginMarketEntry,
} from "@prompthub/shared/types/plugin";
import { usePluginStore } from "../../stores/plugin.store";
import type { PluginLibraryGalleryColumnMode } from "../../stores/plugin.store";
import { useSkillStore } from "../../stores/skill.store";
import type { SelectOption } from "../ui/Select";
import { matchesPluginSearch } from "./PluginAgentViews";
import {
  PLUGIN_LIBRARY_GALLERY_COLUMNS,
  TAB_ICON_CLASS_NAME,
  type PluginLibraryFilter,
  type PluginTab,
  getMarketSourceLabel,
  getPluginDisplayTags,
  getPluginEntryId,
  getPluginLibraryFilterLabel,
  getPluginLibraryGalleryGridStyle,
  getPluginLibrarySourceKey,
  getPluginLibrarySourceLabel,
} from "./plugin-manager-utils";

interface PluginCatalogModelOptions {
  deleteTarget: PluginLibraryEntry | null;
  detailLibraryPlugin: PluginLibraryEntry | null;
  isLoading: boolean;
  library: ReturnType<typeof usePluginStore.getState>["library"];
  libraryGalleryColumns: PluginLibraryGalleryColumnMode;
  libraryTagFilters: string[];
  marketEntries: PluginMarketEntry[];
  marketPreviews: ReturnType<typeof usePluginStore.getState>["marketPreviews"];
  pageSize: number;
  searchQuery: string;
  selectedLibraryPluginIds: Set<string>;
  selectedMarketEntryIds: Set<string>;
  selectedMarketSource:
    | ReturnType<typeof usePluginStore.getState>["marketSources"][number]
    | null;
  selectedMarketSourceId: string;
  selectedTab: PluginTab;
  skills: ReturnType<typeof useSkillStore.getState>["skills"];
  t: ReturnType<typeof useTranslation>["t"];
  targetMatrix: ReturnType<typeof usePluginStore.getState>["targetMatrix"];
}

export function usePluginCatalogModel({
  deleteTarget,
  detailLibraryPlugin,
  isLoading,
  library,
  libraryGalleryColumns,
  libraryTagFilters,
  marketEntries,
  marketPreviews,
  pageSize,
  searchQuery,
  selectedLibraryPluginIds,
  selectedMarketEntryIds,
  selectedMarketSource,
  selectedMarketSourceId,
  selectedTab,
  skills,
  t,
  targetMatrix,
}: PluginCatalogModelOptions) {
  const distributionSnapshot = usePluginStore(
    (store) => store.distributionSnapshot,
  );
  const summarizePlugin = useMemo(
    () =>
      (
        plugin: PluginLibraryEntry,
      ): import("@prompthub/shared/utils/resource-library").ResourceSummary => ({
        id: plugin.id,
        favorite: plugin.isFavorite,
        tags: getPluginDisplayTags(plugin),
        search: [],
        presence: observedDistributionPresence(distributionSnapshot[plugin.id]),
      }),
    [distributionSnapshot],
  );
  const [currentLibraryPage, setCurrentLibraryPage] = useState(1);
  const installedPlugins = useMemo(
    () => library?.plugins ?? [],
    [library?.plugins],
  );
  const installedSkillPaths = useMemo(
    () =>
      new Set(
        skills.flatMap((skill) =>
          [skill.local_repo_path, skill.source_url].filter(
            (value): value is string =>
              typeof value === "string" && value.length > 0,
          ),
        ),
      ),
    [skills],
  );
  const [libraryFilter, setLibraryFilter] =
    useState<PluginLibraryFilter>("all");
  const [librarySourceFilter, setLibrarySourceFilter] = useState("all");
  const libraryGalleryColumnOptions = useMemo<SelectOption[]>(
    () =>
      PLUGIN_LIBRARY_GALLERY_COLUMNS.map((columns) => ({
        value: columns,
        label:
          columns === "auto"
            ? t("plugin.galleryColumnsAuto", "Auto")
            : t("plugin.galleryColumnsCount", {
                count: Number(columns),
                defaultValue: "{{count}} columns",
              }),
      })),
    [t],
  );
  const libraryGalleryGridStyle = useMemo(
    () => getPluginLibraryGalleryGridStyle(libraryGalleryColumns ?? "auto"),
    [libraryGalleryColumns],
  );
  const selectedLibraryDetailPlugin = useMemo(() => {
    if (!detailLibraryPlugin) {
      return null;
    }
    return (
      installedPlugins.find((plugin) => plugin.id === detailLibraryPlugin.id) ??
      detailLibraryPlugin
    );
  }, [detailLibraryPlugin, installedPlugins]);
  const installedIds = useMemo(
    () => new Set(installedPlugins.map((plugin) => plugin.id)),
    [installedPlugins],
  );
  const installedPluginById = useMemo(
    () => new Map(installedPlugins.map((plugin) => [plugin.id, plugin])),
    [installedPlugins],
  );
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const baseVisiblePlugins = useMemo(
    () =>
      filterResources(installedPlugins, summarizePlugin, {
        filter: libraryFilter,
      }).filter((plugin) => matchesPluginSearch(plugin, normalizedSearchQuery)),
    [installedPlugins, libraryFilter, normalizedSearchQuery, summarizePlugin],
  );
  const libraryFilterCounts = useMemo(
    () => countResources(installedPlugins, summarizePlugin),
    [installedPlugins, summarizePlugin],
  );
  const libraryFilterOptions = useMemo(
    () =>
      [
        {
          icon: <PackageIcon className="h-3.5 w-3.5" />,
          value: "all",
          label: getPluginLibraryFilterLabel("all", t),
          count: libraryFilterCounts.all,
        },
        {
          icon: <StarIcon className="h-3.5 w-3.5" />,
          value: "favorites",
          label: getPluginLibraryFilterLabel("favorites", t),
          count: libraryFilterCounts.favorites,
        },
        {
          icon: <SendIcon className="h-3.5 w-3.5" />,
          value: "distributed",
          label: getPluginLibraryFilterLabel("distributed", t),
          count: libraryFilterCounts.distributed,
        },
        {
          icon: <Clock3Icon className="h-3.5 w-3.5" />,
          value: "pending",
          label: getPluginLibraryFilterLabel("pending", t),
          count: libraryFilterCounts.pending,
        },
      ] satisfies Array<{
        icon: ReactNode;
        value: PluginLibraryFilter;
        label: string;
        count: number;
      }>,
    [libraryFilterCounts, t],
  );
  const librarySourceEntries = useMemo(() => {
    const entries = new Map<string, { label: string; count: number }>();

    for (const plugin of baseVisiblePlugins) {
      const key = getPluginLibrarySourceKey(plugin);
      const current = entries.get(key);
      entries.set(key, {
        label: getPluginLibrarySourceLabel(plugin, t),
        count: (current?.count ?? 0) + 1,
      });
    }

    return Array.from(entries.entries())
      .map(([value, entry]) => ({ value, ...entry }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [baseVisiblePlugins, t]);
  const hasActiveLibrarySourceFilter = librarySourceFilter !== "all";
  const activeLibrarySourceFilter = librarySourceEntries.some(
    (entry) => entry.value === librarySourceFilter,
  )
    ? librarySourceFilter
    : "all";
  const librarySourceOptions = useMemo<SelectOption[]>(
    () => [
      {
        value: "all",
        label: (
          <span className="flex w-full items-center justify-between gap-2">
            <span>{t("plugin.allSources", "All sources")}</span>
            <span className="text-xs text-muted-foreground">
              {baseVisiblePlugins.length}
            </span>
          </span>
        ),
        labelText: t("plugin.allSources", "All sources"),
      },
      ...librarySourceEntries.map((entry) => ({
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
    [baseVisiblePlugins.length, librarySourceEntries, t],
  );
  const filteredLibraryPlugins = useMemo(() => {
    return baseVisiblePlugins.filter((plugin) => {
      const matchesSource =
        activeLibrarySourceFilter === "all" ||
        getPluginLibrarySourceKey(plugin) === activeLibrarySourceFilter;
      const matchesTag =
        libraryTagFilters.length === 0 ||
        libraryTagFilters.some((tag) =>
          getPluginDisplayTags(plugin).includes(tag),
        );
      return matchesSource && matchesTag;
    });
  }, [activeLibrarySourceFilter, baseVisiblePlugins, libraryTagFilters]);
  const libraryPage = useMemo(
    () =>
      paginateResources(filteredLibraryPlugins, currentLibraryPage, pageSize),
    [filteredLibraryPlugins, currentLibraryPage, pageSize],
  );
  const libraryTotalPages = libraryPage.totalPages;
  const visiblePlugins = libraryPage.items;
  const libraryVisiblePageNumbers = libraryPage.pageNumbers;
  useEffect(() => {
    setCurrentLibraryPage(1);
  }, [
    activeLibrarySourceFilter,
    libraryTagFilters,
    libraryFilter,
    normalizedSearchQuery,
    pageSize,
  ]);

  useEffect(() => {
    setCurrentLibraryPage((page) => Math.min(page, libraryTotalPages));
  }, [libraryTotalPages]);
  const sourceFilteredMarketEntries = useMemo(
    () =>
      marketEntries.filter(
        (entry) =>
          selectedMarketSourceId === "all" ||
          entry.marketplaceId === selectedMarketSourceId,
      ),
    [marketEntries, selectedMarketSourceId],
  );
  const visibleMarketEntries = useMemo(
    () =>
      sourceFilteredMarketEntries.filter((entry) =>
        matchesPluginSearch(entry, normalizedSearchQuery),
      ),
    [normalizedSearchQuery, sourceFilteredMarketEntries],
  );
  const marketPreviewPrefetchEntries = useMemo(
    () =>
      visibleMarketEntries.filter(
        (entry) =>
          !marketPreviews[entry.id] && (!entry.description || !entry.iconUrl),
      ),
    [marketPreviews, visibleMarketEntries],
  );
  const installedMarketEntries = useMemo(
    () => visibleMarketEntries.filter((entry) => installedIds.has(entry.id)),
    [installedIds, visibleMarketEntries],
  );
  const availableMarketEntries = useMemo(
    () => visibleMarketEntries.filter((entry) => !installedIds.has(entry.id)),
    [installedIds, visibleMarketEntries],
  );
  const enabledTargetCount = useMemo(
    () => targetMatrix.filter((target) => target.enabled).length,
    [targetMatrix],
  );
  const selectedMarketEntries = useMemo(
    () =>
      visibleMarketEntries.filter((entry) =>
        selectedMarketEntryIds.has(getPluginEntryId(entry)),
      ),
    [selectedMarketEntryIds, visibleMarketEntries],
  );
  const selectedInstallEntries = useMemo(
    () => selectedMarketEntries.filter((entry) => !installedIds.has(entry.id)),
    [installedIds, selectedMarketEntries],
  );
  const selectedInstalledMarketPlugins = useMemo(
    () =>
      selectedMarketEntries
        .map((entry) => installedPluginById.get(entry.id))
        .filter((plugin): plugin is PluginLibraryEntry => Boolean(plugin)),
    [installedPluginById, selectedMarketEntries],
  );
  const selectedLibraryPlugins = useMemo(
    () =>
      installedPlugins.filter((plugin) =>
        selectedLibraryPluginIds.has(getPluginEntryId(plugin)),
      ),
    [installedPlugins, selectedLibraryPluginIds],
  );
  const selectedLibraryPluginsAllFavorite =
    selectedLibraryPlugins.length > 0 &&
    selectedLibraryPlugins.every((plugin) => plugin.isFavorite === true);
  const selectedLibraryDistributedTargetCount = useMemo(
    () =>
      selectedLibraryPlugins.reduce(
        (sum, plugin) => sum + (plugin.distributedTargetIds?.length ?? 0),
        0,
      ),
    [selectedLibraryPlugins],
  );
  const deleteTargetDistributedTargetCount =
    deleteTarget?.distributedTargetIds?.length ?? 0;
  const visibleMarketEntryIds = useMemo(
    () => visibleMarketEntries.map(getPluginEntryId),
    [visibleMarketEntries],
  );
  const visibleLibraryPluginIds = useMemo(
    () => visiblePlugins.map(getPluginEntryId),
    [visiblePlugins],
  );
  const areVisibleMarketEntriesSelected =
    visibleMarketEntryIds.length > 0 &&
    visibleMarketEntryIds.every((id) => selectedMarketEntryIds.has(id));
  const areVisibleLibraryPluginsSelected =
    visibleLibraryPluginIds.length > 0 &&
    visibleLibraryPluginIds.every((id) => selectedLibraryPluginIds.has(id));
  const selectedCount =
    selectedTab === "library"
      ? selectedLibraryPluginIds.size
      : selectedMarketEntryIds.size;
  const currentMarketTitle =
    selectedMarketSourceId === "all"
      ? t("plugin.pluginStore", "Plugins Store")
      : selectedMarketSourceId === "new-custom"
        ? t("skill.addStoreSource", "Add Store")
        : selectedMarketSource
          ? getMarketSourceLabel(
              selectedMarketSource.id,
              selectedMarketSource.displayName,
              t,
            )
          : t("plugin.pluginStore", "Plugins Store");
  const currentMarketCount =
    selectedMarketSourceId === "all" || normalizedSearchQuery
      ? visibleMarketEntries.length
      : sourceFilteredMarketEntries.length;
  const currentViewTitle =
    selectedTab === "library"
      ? t("plugin.myPlugins", "My Plugins")
      : currentMarketTitle;
  const currentViewHint =
    selectedTab === "library"
      ? t(
          "plugin.myPluginsHint",
          "Installed Plugin bundles stay in PromptHub until you distribute their child assets.",
        )
      : t(
          "plugin.pluginStoreHint",
          "Browse Plugin bundles, open details to inspect inventory, then install or batch install selected entries.",
        );
  const currentViewCountLabel =
    selectedTab === "library"
      ? t("plugin.statsInstalled", {
          defaultValue: "{{count}} installed",
          count: filteredLibraryPlugins.length,
        })
      : t("plugin.loadedStoreEntries", {
          defaultValue: "Loaded {{count}}",
          count: currentMarketCount,
        });
  const shouldShowInitialLoading =
    isLoading &&
    !library &&
    !(selectedTab === "market" && visibleMarketEntries.length > 0);

  const tabs: Array<{
    id: PluginTab;
    label: string;
    count: number;
    icon: ReactNode;
  }> = [
    {
      id: "library",
      label: t("plugin.myPlugins", "My Plugins"),
      count: installedPlugins.length,
      icon: <PackageIcon className={TAB_ICON_CLASS_NAME} />,
    },
    {
      id: "market",
      label: t("plugin.pluginStore", "Plugins Store"),
      count: marketEntries.length,
      icon: <StoreIcon className={TAB_ICON_CLASS_NAME} />,
    },
    {
      id: "targets",
      label: t("plugin.pluginTargets", "Agent Plugin"),
      count: targetMatrix.length,
      icon: <BotIcon className={TAB_ICON_CLASS_NAME} />,
    },
  ];

  return {
    installedPlugins,
    installedSkillPaths,
    libraryFilter,
    setLibraryFilter,
    librarySourceFilter,
    setLibrarySourceFilter,
    libraryGalleryColumnOptions,
    libraryGalleryGridStyle,
    selectedLibraryDetailPlugin,
    installedIds,
    installedPluginById,
    normalizedSearchQuery,
    baseVisiblePlugins,
    libraryFilterCounts,
    libraryFilterOptions,
    librarySourceEntries,
    hasActiveLibrarySourceFilter,
    activeLibrarySourceFilter,
    librarySourceOptions,
    filteredLibraryPlugins,
    libraryTotalPages,
    visiblePlugins,
    libraryVisiblePageNumbers,
    currentLibraryPage,
    setCurrentLibraryPage,
    sourceFilteredMarketEntries,
    visibleMarketEntries,
    marketPreviewPrefetchEntries,
    installedMarketEntries,
    availableMarketEntries,
    enabledTargetCount,
    selectedMarketEntries,
    selectedInstallEntries,
    selectedInstalledMarketPlugins,
    selectedLibraryPlugins,
    selectedLibraryPluginsAllFavorite,
    selectedLibraryDistributedTargetCount,
    deleteTargetDistributedTargetCount,
    visibleMarketEntryIds,
    visibleLibraryPluginIds,
    areVisibleMarketEntriesSelected,
    areVisibleLibraryPluginsSelected,
    selectedCount,
    currentMarketTitle,
    currentMarketCount,
    currentViewTitle,
    currentViewHint,
    currentViewCountLabel,
    shouldShowInitialLoading,
    tabs,
  };
}
