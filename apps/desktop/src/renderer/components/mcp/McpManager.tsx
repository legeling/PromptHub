import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import {
  CheckSquareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Clock3Icon,
  DatabaseIcon,
  FolderIcon,
  GlobeIcon,
  InboxIcon,
  LayoutGridIcon,
  ListIcon,
  RefreshCwIcon,
  SendIcon,
  ServerIcon,
  Settings2Icon,
  SquareIcon,
  StarIcon,
  TagsIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { McpTargetPreset } from "@prompthub/core";
import type {
  McpApplyTarget,
  McpServerConfig,
  McpServerDraft,
  McpTargetStatusEntry,
} from "@prompthub/shared/types/mcp";
import { MCP_OFFICIAL_MARKET_SOURCE_ID } from "@prompthub/shared/constants/mcp-market";
import { useMcpStore } from "../../stores/mcp.store";
import { useSettingsStore } from "../../stores/settings.store";
import { Spinner } from "../ui/Spinner";
import { Select, type SelectOption } from "../ui/Select";
import { useToast } from "../ui/Toast";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { McpAgentsView } from "./McpAgentsView";
import { McpBatchDeployDialog } from "./McpBatchDeployDialog";
import { McpBatchTagDialog } from "./McpBatchTagDialog";
import { McpCreateModal } from "./McpCreateModal";
import { McpFullDetailPage } from "./McpFullDetailPage";
import { McpLibraryDeployDialog } from "./McpLibraryDeployDialog";
import { McpMarketView } from "./McpMarketView";
import { McpPlatformPanel } from "./McpPlatformPanel";
import { McpServerList, type McpServerViewMode } from "./McpServerList";
import { SkillStoreSourceEditModal } from "../skill/SkillStoreSourceEditModal";
import { SkillStoreSourceForm } from "../skill/SkillStoreSourceForm";
import { updateMcpTags, type McpBatchTagMode } from "./batch-utils";
import { isServerOnPreset } from "./mcp-form-utils";
import type { CustomStoreSourceType } from "../../services/custom-store-source";
import {
  deriveProjectMcpTargetPresets,
  filterVisibleMcpTargetPresets,
  mergeMcpTargetPresets,
} from "../../services/mcp-target-presets";

const OPEN_CREATE_MCP_MODAL_EVENT = "open-create-mcp-modal";
const MCP_VIEW_TRANSITION_CLASS =
  "h-full min-h-0 animate-in fade-in slide-in-from-right-3 duration-smooth";
const ALL_MCP_SOURCE_FILTER = "all";
const MCP_GALLERY_COLUMNS = ["auto", "2", "3", "4", "5", "6"] as const;
const MCP_GALLERY_AUTO_MIN_WIDTH_PX = 280;
const MCP_GALLERY_MANUAL_MIN_WIDTH_PX = 240;
const MCP_LIST_PAGE_SIZE_OPTIONS = [12, 24, 48] as const;
const DEFAULT_MCP_LIST_PAGE_SIZE = 12;

type McpLibraryFilter = "all" | "favorites" | "distributed" | "pending";
type McpGalleryColumnMode = (typeof MCP_GALLERY_COLUMNS)[number];

interface PendingAgentRemoval {
  preset: McpTargetPreset;
  serverName: string;
}

interface McpViewTransitionProps extends HTMLAttributes<HTMLDivElement> {
  viewKey: string;
}

function McpViewTransition({
  viewKey,
  className = "",
  children,
  ...props
}: McpViewTransitionProps) {
  return (
    <div
      key={viewKey}
      data-testid="mcp-view-transition"
      data-mcp-view={viewKey}
      className={`${MCP_VIEW_TRANSITION_CLASS} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

function getMcpGalleryGridStyle(columns: McpGalleryColumnMode): CSSProperties {
  if (columns === "auto") {
    return {
      gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${MCP_GALLERY_AUTO_MIN_WIDTH_PX}px), 1fr))`,
    };
  }

  const columnCount = Number(columns);
  const totalGapRem = columnCount - 1;
  return {
    gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, max(${MCP_GALLERY_MANUAL_MIN_WIDTH_PX}px, calc((100% - ${totalGapRem}rem) / ${columnCount}))), 1fr))`,
  };
}

function hasFileItems(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) {
    return false;
  }

  if (
    Array.from(dataTransfer.items ?? []).some((item) => item.kind === "file")
  ) {
    return true;
  }

  return (
    Array.from(dataTransfer.types ?? []).includes("Files") ||
    (dataTransfer.files?.length ?? 0) > 0
  );
}

function getMcpSourceLabel(
  server: McpServerConfig,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (server.source.type === "market") {
    return server.source.label || t("mcp.sourceMarket", "MCP Store");
  }
  if (server.source.type === "import") {
    return server.source.label || t("mcp.sourceImport", "Imported");
  }
  return server.source.label || t("mcp.sourceManual", "Manual");
}

function getMcpSourceKey(
  server: McpServerConfig,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  return `${server.source.type}:${server.source.id || getMcpSourceLabel(server, t)}`;
}

function matchesMcpSearch(server: McpServerConfig, query: string): boolean {
  if (!query) {
    return true;
  }

  return [
    server.name,
    server.displayName,
    server.description ?? "",
    server.transport,
    server.command ?? "",
    server.cwd ?? "",
    server.url ?? "",
    server.source.label ?? "",
    server.source.id ?? "",
    server.source.url ?? "",
    ...(server.args ?? []),
    ...(server.tags ?? []),
    ...Object.keys(server.env ?? {}),
    ...Object.values(server.env ?? {}),
    ...Object.keys(server.headers ?? {}),
    ...Object.values(server.headers ?? {}),
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function findAgentMcpServer(
  targetStatus: McpTargetStatusEntry[],
  presetId: string,
  serverName: string,
): McpServerConfig | null {
  return (
    targetStatus
      .find((entry) => entry.presetId === presetId)
      ?.servers?.find((server) => server.name === serverName) ?? null
  );
}

function buildAgentMcpImportDraft(
  server: McpServerConfig,
  preset: McpTargetPreset,
): McpServerDraft {
  return {
    name: server.name,
    displayName: server.displayName || server.name,
    description: server.description,
    transport: server.transport,
    command: server.command,
    args: server.args,
    cwd: server.cwd,
    env: server.env,
    url: server.url,
    headers: server.headers,
    enabled: server.enabled,
    tags: server.tags,
    source: {
      type: "import",
      id: preset.id,
      label: preset.label,
    },
  };
}

/**
 * MCP module orchestrator. Library tab shows the Skill-style list/detail
 * layout with the platform integration panel; Agent tab shows the platform
 * overview; Store tab shows MCP server catalogs.
 * MCP 模块编排组件。Library 为 Skill 风格列表/详情布局（含平台集成
 * 面板）；Agent 为平台总览；Store 为 MCP 服务目录。
 */
export function McpManager() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const disabledPlatformIds = useSettingsStore(
    (state) => state.disabledPlatformIds,
  );
  const skillProjects = useSettingsStore((state) => state.skillProjects);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [detailServerId, setDetailServerId] = useState<string | null>(null);
  const [pendingAgentRemoval, setPendingAgentRemoval] =
    useState<PendingAgentRemoval | null>(null);
  const [isRemovingAgentEntry, setIsRemovingAgentEntry] = useState(false);
  const [libraryFilter, setLibraryFilter] = useState<McpLibraryFilter>("all");
  const [sourceFilterKey, setSourceFilterKey] = useState(ALL_MCP_SOURCE_FILTER);
  const [galleryColumns, setGalleryColumns] =
    useState<McpGalleryColumnMode>("4");
  const [viewMode, setViewMode] = useState<McpServerViewMode>("gallery");
  const [pageSize, setPageSize] = useState(DEFAULT_MCP_LIST_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState(1);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showBatchDeployDialog, setShowBatchDeployDialog] = useState(false);
  const [showBatchTagDialog, setShowBatchTagDialog] = useState(false);
  const [quickDeployServerId, setQuickDeployServerId] = useState<string | null>(
    null,
  );
  const [agentDeployPreset, setAgentDeployPreset] =
    useState<McpTargetPreset | null>(null);
  const [selectedServerIds, setSelectedServerIds] = useState<Set<string>>(
    new Set(),
  );
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    serverIds: string[];
    serverNames: string[];
  }>({
    isOpen: false,
    serverIds: [],
    serverNames: [],
  });
  const [isDeletingServers, setIsDeletingServers] = useState(false);
  const [isRefreshingLibrary, setIsRefreshingLibrary] = useState(false);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const [editingCustomSourceId, setEditingCustomSourceId] = useState<
    string | null
  >(null);
  const [pendingDeleteCustomSourceId, setPendingDeleteCustomSourceId] =
    useState<string | null>(null);
  const [sourceType, setSourceType] =
    useState<CustomStoreSourceType>("marketplace-json");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceBranch, setSourceBranch] = useState("");
  const [sourceDirectory, setSourceDirectory] = useState("");
  const {
    library,
    marketTemplates,
    marketSources,
    customStoreSources,
    remoteMarketEntries,
    loadingMarketSourceId,
    loadingMoreMarketSourceId,
    marketError,
    healthChecks,
    targetPresets,
    targetStatus,
    selectedTab,
    selectedMarketSourceId,
    filterTags: mcpFilterTags,
    searchQuery,
    pendingPluginChildDeployServerIds,
    isLoading,
    error,
    load,
    loadMarketSource,
    loadMoreMarketSource,
    selectServer,
    setSelectedTab,
    createServer,
    createFromSource,
    updateServer,
    deleteServer,
    installTemplate,
    importEnv,
    checkServer,
    applyTarget,
    removeTarget,
    removeTargetNames,
    setSearchQuery,
    addCustomStoreSource,
    updateCustomStoreSource,
    removeCustomStoreSource,
    toggleCustomStoreSource,
    consumePluginChildMcpDeployRequest,
  } = useMcpStore();

  const projectTargetPresets = useMemo(
    () => deriveProjectMcpTargetPresets(skillProjects),
    [skillProjects],
  );
  const visibleAgentTargetPresets = useMemo(
    () =>
      filterVisibleMcpTargetPresets(
        targetPresets.filter((preset) => preset.scope !== "workspace"),
        disabledPlatformIds,
      ),
    [targetPresets, disabledPlatformIds],
  );
  const visibleProjectTargetPresets = useMemo(
    () =>
      filterVisibleMcpTargetPresets(projectTargetPresets, disabledPlatformIds),
    [projectTargetPresets, disabledPlatformIds],
  );
  const visibleTargetPresets = useMemo(
    () =>
      mergeMcpTargetPresets(
        visibleAgentTargetPresets,
        visibleProjectTargetPresets,
      ),
    [visibleAgentTargetPresets, visibleProjectTargetPresets],
  );
  const visibleTargetPresetIds = useMemo(
    () => new Set(visibleTargetPresets.map((preset) => preset.id)),
    [visibleTargetPresets],
  );
  const [visibleTargetStatus, setVisibleTargetStatus] = useState<
    McpTargetStatusEntry[]
  >([]);
  const refreshVisibleTargetStatus = useCallback(async () => {
    if (visibleTargetPresets.length === 0) {
      setVisibleTargetStatus([]);
      return;
    }

    const status = await window.api.mcp.getTargetStatus(visibleTargetPresets);
    const visibleIds = new Set(visibleTargetPresets.map((preset) => preset.id));
    setVisibleTargetStatus(
      status.filter((entry) => visibleIds.has(entry.presetId)),
    );
  }, [visibleTargetPresets]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void refreshVisibleTargetStatus();
  }, [refreshVisibleTargetStatus, targetStatus]);

  useEffect(() => {
    if (
      agentDeployPreset &&
      !visibleTargetPresetIds.has(agentDeployPreset.id)
    ) {
      setAgentDeployPreset(null);
    }
  }, [agentDeployPreset, visibleTargetPresetIds]);

  useEffect(() => {
    if (selectedTab !== "market" || marketSources.length === 0) {
      return;
    }
    void loadMarketSource(selectedMarketSourceId);
  }, [
    loadMarketSource,
    marketSources.length,
    searchQuery,
    selectedMarketSourceId,
    selectedTab,
  ]);

  useEffect(() => {
    const openCreateModal = () => {
      selectServer(null);
      setDetailServerId(null);
      setSelectedTab("library");
      setIsCreateModalOpen(true);
    };

    document.addEventListener(OPEN_CREATE_MCP_MODAL_EVENT, openCreateModal);
    return () => {
      document.removeEventListener(
        OPEN_CREATE_MCP_MODAL_EVENT,
        openCreateModal,
      );
    };
  }, [selectServer, setSelectedTab]);

  const servers = useMemo(() => library?.servers ?? [], [library?.servers]);
  const detailServer = useMemo(
    () => servers.find((server) => server.id === detailServerId) ?? null,
    [detailServerId, servers],
  );
  const selectedServerTargetCount = useMemo(
    () =>
      detailServer
        ? visibleAgentTargetPresets.filter((preset) =>
            isServerOnPreset(visibleTargetStatus, preset.id, detailServer.name),
          ).length
        : 0,
    [detailServer, visibleAgentTargetPresets, visibleTargetStatus],
  );
  const selectedServerHealth = useMemo(
    () =>
      detailServer
        ? healthChecks.find((item) => item.serverId === detailServer.id)
        : undefined,
    [detailServer, healthChecks],
  );
  const installedNames = useMemo(
    () => new Set(servers.map((server) => server.name)),
    [servers],
  );
  const handleAddCustomSource = () => {
    if (!sourceName.trim() || !sourceUrl.trim()) {
      showToast(
        t("skill.storeSourceRequired", "Store name and URL are required"),
        "error",
      );
      return;
    }
    try {
      addCustomStoreSource(sourceName, sourceUrl, sourceType, {
        branch: sourceBranch,
        directory: sourceDirectory,
      });
      setSourceName("");
      setSourceUrl("");
      setSourceBranch("");
      setSourceDirectory("");
    } catch (sourceError) {
      reportError(sourceError);
    }
  };
  const handleUpdateCustomSource = (payload: {
    branch?: string;
    directory?: string;
    id: string;
    name: string;
    type: CustomStoreSourceType;
    url: string;
  }) => {
    try {
      updateCustomStoreSource(payload);
      setEditingCustomSourceId(null);
      void loadMarketSource(payload.id, true);
    } catch (sourceError) {
      reportError(sourceError);
    }
  };
  const handleConfirmDeleteCustomSource = () => {
    if (!pendingDeleteCustomSource) return;
    removeCustomStoreSource(pendingDeleteCustomSource.id);
    setPendingDeleteCustomSourceId(null);
    setEditingCustomSourceId(null);
  };
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const selectedMarketEntry =
    remoteMarketEntries[
      `${selectedMarketSourceId}:${searchQuery.trim().toLowerCase()}`
    ];
  const selectedMarketSourceIsRemote =
    selectedMarketSourceId !== MCP_OFFICIAL_MARKET_SOURCE_ID &&
    selectedMarketSourceId !== "new-custom";
  const shouldShowMarketLoading =
    loadingMarketSourceId === selectedMarketSourceId ||
    (selectedTab === "market" &&
      selectedMarketSourceIsRemote &&
      !selectedMarketEntry &&
      !marketError);
  const selectedCustomSource = useMemo(
    () =>
      customStoreSources.find(
        (source) => source.id === selectedMarketSourceId,
      ) ?? null,
    [customStoreSources, selectedMarketSourceId],
  );
  const pendingDeleteCustomSource = useMemo(
    () =>
      customStoreSources.find(
        (source) => source.id === pendingDeleteCustomSourceId,
      ) ?? null,
    [customStoreSources, pendingDeleteCustomSourceId],
  );
  const customSourceTypeOptions = useMemo(
    () => [
      {
        value: "marketplace-json" as const,
        icon: <DatabaseIcon className="h-4 w-4" />,
      },
      {
        value: "git-repo" as const,
        icon: <GlobeIcon className="h-4 w-4" />,
      },
    ],
    [],
  );
  const galleryColumnOptions = useMemo<SelectOption[]>(
    () =>
      MCP_GALLERY_COLUMNS.map((columns) => ({
        value: columns,
        label:
          columns === "auto"
            ? t("mcp.galleryColumnsAuto", "Auto")
            : t("mcp.galleryColumnsCount", {
                count: Number(columns),
                defaultValue: "{{count}} columns",
              }),
      })),
    [t],
  );
  const mcpGalleryGridStyle = useMemo(
    () => getMcpGalleryGridStyle(galleryColumns),
    [galleryColumns],
  );
  const serverDistributionById = useMemo(() => {
    const next = new Map<string, number>();
    for (const server of servers) {
      next.set(
        server.id,
        visibleAgentTargetPresets.filter((preset) =>
          isServerOnPreset(visibleTargetStatus, preset.id, server.name),
        ).length,
      );
    }
    return next;
  }, [servers, visibleAgentTargetPresets, visibleTargetStatus]);
  const libraryCounts = useMemo(() => {
    let distributed = 0;
    let favorites = 0;
    for (const server of servers) {
      if (server.isFavorite) {
        favorites += 1;
      }
      if ((serverDistributionById.get(server.id) ?? 0) > 0) {
        distributed += 1;
      }
    }
    return {
      all: servers.length,
      favorites,
      distributed,
      pending: Math.max(servers.length - distributed, 0),
    };
  }, [serverDistributionById, servers]);
  const mcpFilterOptions = useMemo(
    () =>
      [
        {
          icon: <ServerIcon className="h-3.5 w-3.5" />,
          label: t("mcp.allServers", "All MCP"),
          count: libraryCounts.all,
          value: "all",
        },
        {
          icon: <StarIcon className="h-3.5 w-3.5" />,
          label: t("mcp.favorites", "Favorites"),
          count: libraryCounts.favorites,
          value: "favorites",
        },
        {
          icon: <SendIcon className="h-3.5 w-3.5" />,
          label: t("mcp.distributed", "Distributed"),
          count: libraryCounts.distributed,
          value: "distributed",
        },
        {
          icon: <Clock3Icon className="h-3.5 w-3.5" />,
          label: t("mcp.pendingDistribution", "Pending"),
          count: libraryCounts.pending,
          value: "pending",
        },
      ] satisfies Array<{
        icon: ReactNode;
        label: string;
        count: number;
        value: McpLibraryFilter;
      }>,
    [libraryCounts, t],
  );
  const baseFilteredServers = useMemo(() => {
    return servers.filter((server) => {
      const distributedCount = serverDistributionById.get(server.id) ?? 0;
      if (libraryFilter === "favorites" && !server.isFavorite) {
        return false;
      }
      if (libraryFilter === "distributed" && distributedCount === 0) {
        return false;
      }
      if (libraryFilter === "pending" && distributedCount > 0) {
        return false;
      }
      if (
        mcpFilterTags.length > 0 &&
        !mcpFilterTags.some((tag) => (server.tags ?? []).includes(tag))
      ) {
        return false;
      }
      return matchesMcpSearch(server, normalizedSearchQuery);
    });
  }, [
    libraryFilter,
    mcpFilterTags,
    normalizedSearchQuery,
    serverDistributionById,
    servers,
  ]);
  const sourceFilterEntries = useMemo(() => {
    const entries = new Map<string, { label: string; count: number }>();

    for (const server of baseFilteredServers) {
      const key = getMcpSourceKey(server, t);
      const label = getMcpSourceLabel(server, t);
      const current = entries.get(key);
      entries.set(key, {
        label,
        count: (current?.count ?? 0) + 1,
      });
    }

    return Array.from(entries.entries())
      .map(([value, entry]) => ({ value, ...entry }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [baseFilteredServers, t]);
  const hasActiveSourceFilter = sourceFilterKey !== ALL_MCP_SOURCE_FILTER;
  const activeSourceFilterKey = sourceFilterEntries.some(
    (entry) => entry.value === sourceFilterKey,
  )
    ? sourceFilterKey
    : ALL_MCP_SOURCE_FILTER;
  const sourceFilterOptions = useMemo<SelectOption[]>(
    () => [
      {
        value: ALL_MCP_SOURCE_FILTER,
        label: (
          <span className="flex w-full items-center justify-between gap-2">
            <span>{t("mcp.allSources", "All Sources")}</span>
            <span className="text-xs text-muted-foreground">
              {baseFilteredServers.length}
            </span>
          </span>
        ),
        labelText: t("mcp.allSources", "All Sources"),
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
    [baseFilteredServers.length, sourceFilterEntries, t],
  );
  const filteredServers = useMemo(() => {
    if (activeSourceFilterKey === ALL_MCP_SOURCE_FILTER) {
      return baseFilteredServers;
    }
    return baseFilteredServers.filter(
      (server) => getMcpSourceKey(server, t) === activeSourceFilterKey,
    );
  }, [activeSourceFilterKey, baseFilteredServers, t]);
  const totalPages = Math.max(1, Math.ceil(filteredServers.length / pageSize));
  const visibleServers = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredServers.slice(startIndex, startIndex + pageSize);
  }, [currentPage, filteredServers, pageSize]);
  const selectedServers = useMemo(
    () => servers.filter((server) => selectedServerIds.has(server.id)),
    [selectedServerIds, servers],
  );
  const quickDeployServer = useMemo(
    () =>
      quickDeployServerId
        ? (servers.find((server) => server.id === quickDeployServerId) ?? null)
        : null,
    [quickDeployServerId, servers],
  );
  const deployDialogServers = showBatchDeployDialog
    ? selectedServers
    : quickDeployServer
      ? [quickDeployServer]
      : [];
  const allVisibleSelected = useMemo(
    () =>
      visibleServers.length > 0 &&
      visibleServers.every((server) => selectedServerIds.has(server.id)),
    [selectedServerIds, visibleServers],
  );
  const selectedServersAllFavorite =
    selectedServers.length > 0 &&
    selectedServers.every((server) => server.isFavorite);

  useEffect(() => {
    if (pendingPluginChildDeployServerIds.length === 0) {
      return;
    }

    if (servers.length === 0) {
      return;
    }

    const serverIds = new Set(servers.map((server) => server.id));
    const validIds = pendingPluginChildDeployServerIds.filter((id) =>
      serverIds.has(id),
    );
    consumePluginChildMcpDeployRequest();

    if (validIds.length === 0) {
      return;
    }

    setSelectedTab("library");
    selectServer(validIds[0] ?? null);
    setDetailServerId(null);
    setSelectedServerIds(new Set(validIds));
    setIsSelectionMode(true);
    setQuickDeployServerId(null);
    setShowBatchDeployDialog(true);
  }, [
    consumePluginChildMcpDeployRequest,
    pendingPluginChildDeployServerIds,
    selectServer,
    servers,
    setSelectedTab,
  ]);

  useEffect(() => {
    if (
      detailServerId &&
      !filteredServers.some((server) => server.id === detailServerId)
    ) {
      setDetailServerId(null);
    }
  }, [detailServerId, filteredServers]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    activeSourceFilterKey,
    libraryFilter,
    mcpFilterTags,
    normalizedSearchQuery,
    pageSize,
  ]);

  useEffect(() => {
    if (
      sourceFilterKey !== ALL_MCP_SOURCE_FILTER &&
      !sourceFilterEntries.some((entry) => entry.value === sourceFilterKey)
    ) {
      setSourceFilterKey(ALL_MCP_SOURCE_FILTER);
    }
  }, [sourceFilterEntries, sourceFilterKey]);

  const reportError = (error: unknown) => {
    showToast(error instanceof Error ? error.message : String(error), "error");
  };

  const openServerDetail = (server: McpServerConfig) => {
    setLibraryFilter("all");
    setSourceFilterKey(ALL_MCP_SOURCE_FILTER);
    setSearchQuery("");
    selectServer(server.id);
    setDetailServerId(server.id);
    setSelectedTab("library");
  };

  const isTargetConflictError = (applyError: unknown): boolean => {
    const message =
      applyError instanceof Error ? applyError.message : String(applyError);
    return (
      message.includes("TARGET_CONFLICT") || message.includes("同名 MCP 服务")
    );
  };

  const confirmTargetOverwrite = (applyError: unknown): boolean => {
    const message =
      applyError instanceof Error ? applyError.message : String(applyError);
    return window.confirm(
      t("mcp.confirmTargetOverwrite", {
        message,
        defaultValue: `${message}\n\nOverwrite the existing target MCP entry?`,
      }),
    );
  };

  const applyTargetsWithConflictConfirmation = async (
    targets: McpApplyTarget[],
  ) => {
    for (const target of targets) {
      try {
        await applyTarget(target);
      } catch (applyError) {
        if (
          !isTargetConflictError(applyError) ||
          !confirmTargetOverwrite(applyError)
        ) {
          throw applyError;
        }
        await applyTarget({ ...target, force: true });
      }
    }
  };

  const handleLibraryFilterChange = (nextFilter: McpLibraryFilter) => {
    setLibraryFilter(nextFilter);
    setDetailServerId(null);
    selectServer(null);
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode((current) => !current);
    setSelectedServerIds((current) =>
      current.size === 0 ? current : new Set(),
    );
  };

  const toggleServerSelection = (serverId: string) => {
    setSelectedServerIds((current) => {
      const next = new Set(current);
      if (next.has(serverId)) {
        next.delete(serverId);
      } else {
        next.add(serverId);
      }
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedServerIds(new Set());
      return;
    }
    setSelectedServerIds(
      (current) =>
        new Set([...current, ...visibleServers.map((server) => server.id)]),
    );
  };

  const handleToggleFavorite = async (server: McpServerConfig) => {
    try {
      await updateServer(server.id, { isFavorite: !server.isFavorite });
    } catch (favoriteError) {
      reportError(favoriteError);
    }
  };

  const handleBatchFavorite = async () => {
    const shouldFavorite = selectedServers.some((server) => !server.isFavorite);
    try {
      for (const server of selectedServers) {
        if (server.isFavorite !== shouldFavorite) {
          await updateServer(server.id, { isFavorite: shouldFavorite });
        }
      }
      setSelectedServerIds(new Set());
    } catch (favoriteError) {
      reportError(favoriteError);
    }
  };

  const handleBatchTags = () => {
    if (selectedServers.length === 0) {
      return;
    }
    setShowBatchTagDialog(true);
  };

  const handleBatchDeploy = () => {
    if (selectedServers.length === 0) {
      return;
    }
    setQuickDeployServerId(null);
    setShowBatchDeployDialog(true);
  };

  const handleQuickDeploy = (server: McpServerConfig) => {
    setShowBatchDeployDialog(false);
    setQuickDeployServerId(server.id);
  };

  const closeDeployDialog = () => {
    setShowBatchDeployDialog(false);
    setQuickDeployServerId(null);
  };

  const handleOpenAgentDeployDialog = (preset: McpTargetPreset) => {
    setAgentDeployPreset(preset);
  };

  const handleAgentDeployFromLibrary = async (serverIds: string[]) => {
    if (!agentDeployPreset) {
      return;
    }
    await applyPresetsToServers([agentDeployPreset], serverIds);
    setAgentDeployPreset(null);
  };

  const handleBatchTagSubmit = async (tag: string, mode: McpBatchTagMode) => {
    const results = await Promise.allSettled(
      selectedServers.map(async (server) => {
        const nextTags = updateMcpTags(server.tags, tag, mode);
        const previousTags = server.tags || [];

        if (JSON.stringify(nextTags) === JSON.stringify(previousTags)) {
          return { updated: false };
        }

        await updateServer(server.id, { tags: nextTags });
        return { updated: true };
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
        ? t("mcp.batchTagPartialFailure", {
            updated: updatedCount,
            failed: failedCount,
            defaultValue: `MCP tag update finished: ${updatedCount} updated, ${failedCount} failed`,
          })
        : mode === "add"
          ? t("mcp.batchTagAddSuccess", {
              count: updatedCount,
              defaultValue: `Added tag to ${updatedCount} MCP server(s)`,
            })
          : t("mcp.batchTagRemoveSuccess", {
              count: updatedCount,
              defaultValue: `Removed tag from ${updatedCount} MCP server(s)`,
            }),
      failedCount > 0 ? "error" : "success",
    );
    setSelectedServerIds(new Set());
  };

  const openDeleteConfirm = (
    serverIds: string[],
    serverNames: string[],
  ): void => {
    setDeleteConfirm({
      isOpen: true,
      serverIds,
      serverNames,
    });
  };

  const closeDeleteConfirm = () => {
    if (isDeletingServers) {
      return;
    }
    setDeleteConfirm({
      isOpen: false,
      serverIds: [],
      serverNames: [],
    });
  };

  const handleBatchDelete = () => {
    if (selectedServers.length === 0) {
      return;
    }
    openDeleteConfirm(
      selectedServers.map((server) => server.id),
      selectedServers.map((server) => server.displayName || server.name),
    );
  };

  const confirmDelete = async () => {
    if (deleteConfirm.serverIds.length === 0 || isDeletingServers) {
      return;
    }
    setIsDeletingServers(true);
    try {
      for (const serverId of deleteConfirm.serverIds) {
        await deleteServer(serverId);
      }
      if (detailServerId && deleteConfirm.serverIds.includes(detailServerId)) {
        setDetailServerId(null);
        selectServer(null);
      }
      setSelectedServerIds(new Set());
      setIsSelectionMode(false);
      setDeleteConfirm({
        isOpen: false,
        serverIds: [],
        serverNames: [],
      });
      showToast(t("mcp.deleted", "MCP deleted"), "success");
    } catch (deleteError) {
      reportError(deleteError);
    } finally {
      setIsDeletingServers(false);
    }
  };

  const handleRefreshLibrary = async () => {
    if (isRefreshingLibrary) {
      return;
    }
    setIsRefreshingLibrary(true);
    try {
      await load();
      showToast(
        t("mcp.refreshLibraryComplete", "MCP library refreshed"),
        "success",
      );
    } catch (refreshError) {
      reportError(refreshError);
    } finally {
      setIsRefreshingLibrary(false);
    }
  };

  const applyPresetsToServers = async (
    presets: McpTargetPreset[],
    serverIds: string[],
  ) => {
    const allowedPresets = presets.filter((preset) =>
      visibleTargetPresetIds.has(preset.id),
    );
    if (allowedPresets.length === 0) {
      throw new Error(
        t(
          "mcp.noVisibleAgentTargets",
          "No enabled MCP targets are available. Enable the platform in Settings first.",
        ),
      );
    }
    await applyTargetsWithConflictConfirmation(
      allowedPresets.map((preset) => ({
        target: preset.target,
        scope: preset.scope,
        path: preset.path,
        serverIds,
      })),
    );
    await refreshVisibleTargetStatus();
    showToast(t("mcp.applied", "MCP applied"), "success");
  };

  const handleSave = async (serverId: string | null, draft: McpServerDraft) => {
    try {
      if (serverId) {
        await updateServer(serverId, draft);
      } else {
        await createServer(draft);
      }
      const isNotesOnlySave =
        Object.keys(draft).length === 1 &&
        Object.prototype.hasOwnProperty.call(draft, "notes");
      showToast(
        isNotesOnlySave
          ? t("mcp.userNotesSaved", "Notes saved")
          : t("mcp.saved", "MCP saved"),
        "success",
      );
    } catch (saveError) {
      reportError(saveError);
    }
  };

  const handleCreate = async (
    _serverId: string | null,
    draft: McpServerDraft,
  ) => {
    try {
      await createServer(draft);
      setSelectedTab("library");
      setIsCreateModalOpen(false);
      showToast(t("mcp.saved", "MCP saved"), "success");
    } catch (createError) {
      reportError(createError);
    }
  };

  const handleCreateFromSource = async (
    request: Parameters<typeof createFromSource>[0],
  ) => {
    const result = await createFromSource(request);
    setSelectedTab("library");
    showToast(
      t("mcp.sourceImported", {
        count: result.imported.length,
        defaultValue: `${result.imported.length} MCP source(s) added`,
      }),
      "success",
    );
    if (result.warnings.length > 0) {
      showToast(result.warnings.join(" "), "warning");
    }
    return result;
  };

  const handleDropImport = useCallback(
    async (files: FileList | File[]) => {
      const droppedPaths = Array.from(files)
        .map((file) => window.electron?.getPathForFile?.(file) || "")
        .map((filePath) => filePath.trim())
        .filter((filePath) => filePath.length > 0);
      const uniquePaths = Array.from(new Set(droppedPaths));

      if (uniquePaths.length === 0) {
        showToast(
          t(
            "mcp.dropImportUnsupported",
            "Drop an MCP config file or local source folder from your filesystem.",
          ),
          "error",
        );
        return;
      }

      try {
        let importedCount = 0;
        const warnings: string[] = [];

        for (const filePath of uniquePaths) {
          const result = await createFromSource({
            input: filePath,
            kind: "path",
          });
          importedCount += result.imported.length;
          warnings.push(...result.warnings);
        }

        setSelectedTab("library");
        showToast(
          t("mcp.sourceImported", {
            count: importedCount,
            defaultValue: `${importedCount} MCP source(s) added`,
          }),
          "success",
        );
        if (warnings.length > 0) {
          showToast(warnings.join(" "), "warning");
        }
      } catch (dropError) {
        showToast(
          dropError instanceof Error ? dropError.message : String(dropError),
          "error",
        );
      }
    },
    [createFromSource, setSelectedTab, showToast, t],
  );

  const handleDelete = async (serverId: string) => {
    const server = servers.find((item) => item.id === serverId);
    openDeleteConfirm(
      [serverId],
      [server?.displayName || server?.name || serverId],
    );
  };

  const handleImportAgentMcp = async (
    preset: McpTargetPreset,
    serverName: string,
  ) => {
    try {
      const agentServer = findAgentMcpServer(
        visibleTargetStatus,
        preset.id,
        serverName,
      );
      if (!agentServer) {
        throw new Error(
          t(
            "mcp.agentEntryUnavailable",
            "Agent MCP entry details are unavailable. Refresh Agent MCP and try again.",
          ),
        );
      }

      const importedServer = await createServer(
        buildAgentMcpImportDraft(agentServer, preset),
      );
      openServerDetail(importedServer);
      showToast(t("mcp.imported", "MCP imported"), "success");
    } catch (importError) {
      reportError(importError);
    }
  };

  const handleOpenAgentConfig = async (preset: McpTargetPreset) => {
    try {
      const result = await window.electron?.openPath?.(preset.path);
      if (result && !result.success) {
        throw new Error(result.error || "Failed to open MCP config");
      }
      showToast(
        preset.scope === "workspace"
          ? t("mcp.projectConfigOpened", "Project config opened")
          : t("mcp.agentConfigOpened", "Agent config opened"),
        "success",
      );
    } catch (openError) {
      reportError(openError);
    }
  };

  const handleRemoveAgentMcp = async (
    preset: McpTargetPreset,
    serverName: string,
  ) => {
    setPendingAgentRemoval({ preset, serverName });
  };

  const confirmRemoveAgentMcp = async () => {
    if (!pendingAgentRemoval || isRemovingAgentEntry) {
      return;
    }

    const { preset, serverName } = pendingAgentRemoval;
    setIsRemovingAgentEntry(true);
    try {
      await removeTargetNames({
        target: preset.target,
        scope: preset.scope,
        path: preset.path,
        serverNames: [serverName],
      });
      await refreshVisibleTargetStatus();
      setPendingAgentRemoval(null);
      showToast(t("mcp.removed", "MCP removed"), "success");
    } catch (removeError) {
      reportError(removeError);
    } finally {
      setIsRemovingAgentEntry(false);
    }
  };

  const handleCheckServer = async (serverId: string) => {
    try {
      const result = await checkServer(serverId);
      const toastType =
        result.status === "ok"
          ? "success"
          : result.status === "warning"
            ? "warning"
            : "error";
      showToast(
        result.status === "ok"
          ? t("mcp.healthCheckedOk", "MCP static check passed")
          : result.status === "warning"
            ? t("mcp.healthCheckedWarning", "MCP static check found warnings")
            : t("mcp.healthCheckedError", "MCP static check found errors"),
        toastType,
      );
      return result;
    } catch (healthError) {
      reportError(healthError);
      throw healthError;
    }
  };

  const handleImportEnv = async (
    serverId: string,
    envFilePath: string,
    selectedKeys?: string[],
  ) => {
    try {
      const result = await importEnv(serverId, envFilePath, selectedKeys);
      showToast(
        t("mcp.envImported", {
          count: result.importedKeys.length,
          defaultValue: "{{count}} env value(s) imported",
        }),
        "success",
      );
      return result;
    } catch (envError) {
      reportError(envError);
      throw envError;
    }
  };

  const handleApplyPresets = async (
    presets: McpTargetPreset[],
    serverIds: string[],
  ) => {
    try {
      await applyPresetsToServers(presets, serverIds);
    } catch (applyError) {
      reportError(applyError);
    }
  };

  const handleBatchApplyPresets = async (
    presets: McpTargetPreset[],
    serverIds: string[],
  ) => {
    await applyPresetsToServers(presets, serverIds);
    setSelectedServerIds(new Set());
    setIsSelectionMode(false);
  };

  const handleQuickApplyPresets = async (
    presets: McpTargetPreset[],
    serverIds: string[],
  ) => {
    await applyPresetsToServers(presets, serverIds);
  };

  const handleRemovePreset = async (
    preset: McpTargetPreset,
    serverIds: string[],
  ) => {
    try {
      await removeTarget({
        target: preset.target,
        scope: preset.scope,
        path: preset.path,
        serverIds,
      });
      await refreshVisibleTargetStatus();
      showToast(t("mcp.removed", "MCP removed"), "success");
    } catch (removeError) {
      reportError(removeError);
    }
  };

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

  if (isLoading && !library) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const renderedView =
    selectedTab === "library" && detailServer ? (
      <McpViewTransition viewKey={`detail-${detailServer.id}`}>
        <McpFullDetailPage
          server={detailServer}
          healthCheck={selectedServerHealth}
          distributedTargetCount={selectedServerTargetCount}
          platformPanel={
            <McpPlatformPanel
              server={detailServer}
              targetPresets={visibleAgentTargetPresets}
              targetStatus={visibleTargetStatus}
              onApply={(presets) =>
                handleApplyPresets(presets, [detailServer.id])
              }
              onRemove={(preset) =>
                handleRemovePreset(preset, [detailServer.id])
              }
            />
          }
          onBack={() => {
            setDetailServerId(null);
            selectServer(null);
          }}
          onSave={handleSave}
          onCheckServer={handleCheckServer}
          onImportEnv={handleImportEnv}
          onDelete={handleDelete}
        />
      </McpViewTransition>
    ) : selectedTab === "market" ? (
      <McpViewTransition viewKey="store">
        {selectedMarketSourceId === "new-custom" ? (
          <div className="h-full overflow-y-auto app-wallpaper-section p-6">
            <SkillStoreSourceForm
              branch={sourceBranch}
              directory={sourceDirectory}
              handleAddSource={handleAddCustomSource}
              setBranch={setSourceBranch}
              setDirectory={setSourceDirectory}
              setSourceName={setSourceName}
              setSourceType={setSourceType}
              setSourceUrl={setSourceUrl}
              sourceName={sourceName}
              sourceType={sourceType}
              sourceUrl={sourceUrl}
              t={t}
              typeOptions={customSourceTypeOptions}
            />
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            {selectedCustomSource ? (
              <div className="shrink-0 border-b border-border app-wallpaper-panel-strong px-6 py-2 text-right">
                <button
                  type="button"
                  onClick={() =>
                    setEditingCustomSourceId(selectedCustomSource.id)
                  }
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-accent/50 px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                >
                  <Settings2Icon aria-hidden="true" className="h-4 w-4" />
                  {t("common.edit", "Edit")}
                </button>
              </div>
            ) : null}
            <McpMarketView
              templates={marketTemplates}
              remoteTemplates={selectedMarketEntry?.templates ?? []}
              sources={marketSources}
              selectedSourceId={selectedMarketSourceId}
              searchQuery={searchQuery}
              isLoading={shouldShowMarketLoading}
              isLoadingMore={
                loadingMoreMarketSourceId === selectedMarketSourceId
              }
              hasMore={Boolean(selectedMarketEntry?.nextCursor)}
              error={selectedMarketEntry?.error ?? marketError}
              totalCount={selectedMarketEntry?.totalCount}
              totalCountIsLowerBound={
                selectedMarketEntry?.totalCountIsLowerBound
              }
              installedNames={installedNames}
              onLoadMore={() => loadMoreMarketSource(selectedMarketSourceId)}
              onRefresh={() => loadMarketSource(selectedMarketSourceId, true)}
              onSearchChange={setSearchQuery}
              onInstall={async (templateId) => {
                try {
                  await installTemplate(templateId);
                  showToast(t("mcp.installed", "MCP installed"), "success");
                } catch (installError) {
                  reportError(installError);
                }
              }}
            />
          </div>
        )}
      </McpViewTransition>
    ) : selectedTab === "targets" ? (
      <McpViewTransition viewKey="agents">
        <McpAgentsView
          servers={servers}
          targetPresets={visibleAgentTargetPresets}
          targetStatus={visibleTargetStatus}
          onAddMcp={handleOpenAgentDeployDialog}
          onImportExternal={handleImportAgentMcp}
          onOpenManaged={openServerDetail}
          onOpenAgentConfig={handleOpenAgentConfig}
          onRemoveAgentEntry={handleRemoveAgentMcp}
          onRefresh={async () => {
            await load();
            await refreshVisibleTargetStatus();
          }}
        />
      </McpViewTransition>
    ) : selectedTab === "projects" ? (
      <McpViewTransition viewKey="projects">
        <McpAgentsView
          servers={servers}
          targetPresets={visibleProjectTargetPresets}
          targetStatus={visibleTargetStatus}
          title={t("mcp.projectMcp", "Project MCP")}
          sidebarHint={t(
            "mcp.projectMcpSidebarHint",
            "Manage project-level MCP configs for registered projects.",
          )}
          noTargetsLabel={t("mcp.noProjectTargets", "No project targets")}
          selectTargetLabel={t(
            "mcp.selectProjectTarget",
            "Select a project target",
          )}
          targetIconVariant="project"
          openConfigLabel={t("mcp.openProjectConfig", "Open project config")}
          removeEntryLabel={t("mcp.removeFromProject", "Remove from Project")}
          onAddMcp={handleOpenAgentDeployDialog}
          onImportExternal={handleImportAgentMcp}
          onOpenManaged={openServerDetail}
          onOpenAgentConfig={handleOpenAgentConfig}
          onRemoveAgentEntry={handleRemoveAgentMcp}
          onRefresh={async () => {
            await load();
            await refreshVisibleTargetStatus();
          }}
        />
      </McpViewTransition>
    ) : (
      <McpViewTransition
        viewKey="my-mcp"
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
          if (
            event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
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
          <div className="border-b border-border app-wallpaper-panel-strong px-4 py-4 z-10 sm:px-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <ServerIcon className="w-5 h-5 text-primary" />
                      <h2 className="text-lg font-semibold">
                        {t("mcp.myMcp", "My MCP")}
                      </h2>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-white/5 bg-accent/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                      {filteredServers.length}
                    </span>
                    {filteredServers.length > 0 && totalPages > 1 ? (
                      <span className="text-[11px] text-muted-foreground">
                        {t("mcp.paginationSummary", {
                          start: (currentPage - 1) * pageSize + 1,
                          end: Math.min(
                            currentPage * pageSize,
                            filteredServers.length,
                          ),
                          total: filteredServers.length,
                          defaultValue: `${(currentPage - 1) * pageSize + 1}-${Math.min(
                            currentPage * pageSize,
                            filteredServers.length,
                          )} / ${filteredServers.length}`,
                        })}
                      </span>
                    ) : filteredServers.length !== servers.length ? (
                      <span className="text-[11px] text-muted-foreground">
                        {filteredServers.length} / {servers.length}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {t(
                      "mcp.myMcpSubtitle",
                      "Manage MCP servers saved in PromptHub",
                    )}
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
                    title={t("mcp.batchManage", "Batch Manage")}
                    aria-label={t("mcp.batchManage", "Batch Manage")}
                  >
                    {isSelectionMode ? (
                      <XIcon aria-hidden="true" className="w-4 h-4" />
                    ) : (
                      <CheckSquareIcon aria-hidden="true" className="w-4 h-4" />
                    )}
                    {t("mcp.batchManage", "Batch Manage")}
                  </button>
                  <div className="flex items-center bg-muted rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => setViewMode("gallery")}
                      aria-label={t("mcp.galleryView", "Gallery View")}
                      className={`p-2 rounded-md transition-colors ${
                        viewMode === "gallery"
                          ? "app-wallpaper-surface text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      title={t("mcp.galleryView", "Gallery View")}
                    >
                      <LayoutGridIcon aria-hidden="true" className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("list")}
                      aria-label={t("mcp.listView", "List View")}
                      className={`p-2 rounded-md transition-colors ${
                        viewMode === "list"
                          ? "app-wallpaper-surface text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      title={t("mcp.listView", "List View")}
                    >
                      <ListIcon aria-hidden="true" className="w-4 h-4" />
                    </button>
                  </div>
                  {viewMode === "gallery" ? (
                    <Select
                      ariaLabel={t(
                        "mcp.galleryColumnsLabel",
                        "MCP card columns",
                      )}
                      value={galleryColumns}
                      onChange={(value) =>
                        setGalleryColumns(value as McpGalleryColumnMode)
                      }
                      options={galleryColumnOptions}
                      className="w-[118px]"
                      triggerClassName="h-10 w-full rounded-lg border border-border app-wallpaper-surface px-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary/30 flex items-center justify-between gap-2"
                    />
                  ) : null}
                  <div className="h-4 w-px bg-border" />
                  <button
                    type="button"
                    onClick={() => void handleRefreshLibrary()}
                    disabled={isRefreshingLibrary}
                    className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors disabled:opacity-60"
                    aria-label={t("common.refresh", "Refresh")}
                    title={t("common.refresh", "Refresh")}
                  >
                    <RefreshCwIcon
                      aria-hidden="true"
                      className={`w-4 h-4 ${
                        isRefreshingLibrary ? "animate-spin" : ""
                      }`}
                    />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {mcpFilterOptions.map((option) => {
                  const isActive = libraryFilter === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleLibraryFilterChange(option.value)}
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
                  ariaLabel={t("mcp.sourceFilterLabel", "MCP source")}
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
              {isSelectionMode ? (
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/15 bg-primary/[0.06] p-2">
                  <div className="px-3 py-2">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-primary/80">
                      {t("mcp.selectionMode", "Batch Mode")}
                    </div>
                    <div className="mt-0.5 text-sm font-semibold text-foreground">
                      {t("mcp.selectedCount", {
                        count: selectedServerIds.size,
                        defaultValue: `${selectedServerIds.size} selected`,
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
                    onClick={() => void handleBatchFavorite()}
                    disabled={selectedServerIds.size === 0}
                    className="inline-flex items-center gap-2 rounded-xl border border-border app-wallpaper-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/25 hover:bg-accent disabled:opacity-50"
                    title={
                      selectedServersAllFavorite
                        ? t("mcp.removeFavorite", "Remove Favorite")
                        : t("mcp.addFavorite", "Add Favorite")
                    }
                    aria-label={
                      selectedServersAllFavorite
                        ? t("mcp.removeFavorite", "Remove Favorite")
                        : t("mcp.addFavorite", "Add Favorite")
                    }
                  >
                    <StarIcon
                      aria-hidden="true"
                      className="w-4 h-4 text-amber-500"
                    />
                    {selectedServersAllFavorite
                      ? t("mcp.removeFavorite", "Remove Favorite")
                      : t("mcp.addFavorite", "Add Favorite")}
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchTags}
                    disabled={selectedServerIds.size === 0}
                    className="inline-flex items-center gap-2 rounded-xl border border-border app-wallpaper-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/25 hover:bg-accent disabled:opacity-50"
                    title={t("mcp.batchTags", "Batch Tags")}
                    aria-label={t("mcp.batchTags", "Batch Tags")}
                  >
                    <TagsIcon
                      aria-hidden="true"
                      className="w-4 h-4 text-primary"
                    />
                    {t("mcp.batchTags", "Batch Tags")}
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchDeploy}
                    disabled={selectedServerIds.size === 0}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                    title={t("mcp.batchDeploy", "Batch Deploy")}
                    aria-label={t("mcp.batchDeploy", "Batch Deploy")}
                  >
                    <SendIcon aria-hidden="true" className="w-4 h-4" />
                    {t("mcp.batchDeploy", "Batch Deploy")}
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchDelete}
                    disabled={selectedServerIds.size === 0}
                    className="inline-flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/15 disabled:opacity-50"
                    title={t("common.delete", "Delete")}
                    aria-label={t("common.delete", "Delete")}
                  >
                    <TrashIcon aria-hidden="true" className="w-4 h-4" />
                    {t("common.delete", "Delete")}
                  </button>
                </div>
              ) : null}
              {error ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            {viewMode === "list" ? (
              <McpServerList
                servers={visibleServers}
                selectedServerId={detailServerId}
                healthChecks={healthChecks}
                targetPresets={visibleAgentTargetPresets}
                targetStatus={visibleTargetStatus}
                gridStyle={mcpGalleryGridStyle}
                viewMode={viewMode}
                selectionMode={isSelectionMode}
                selectedServerIds={selectedServerIds}
                onSelect={(serverId) => {
                  selectServer(serverId);
                  setDetailServerId(serverId);
                }}
                onToggleSelection={toggleServerSelection}
                onToggleFavorite={handleToggleFavorite}
                onQuickDeploy={handleQuickDeploy}
                onDelete={(server) =>
                  openDeleteConfirm(
                    [server.id],
                    [server.displayName || server.name],
                  )
                }
              />
            ) : (
              <div className="h-full overflow-y-auto scrollbar-hide">
                <div className="p-6">
                  <McpServerList
                    servers={visibleServers}
                    selectedServerId={detailServerId}
                    healthChecks={healthChecks}
                    targetPresets={visibleAgentTargetPresets}
                    targetStatus={visibleTargetStatus}
                    gridStyle={mcpGalleryGridStyle}
                    viewMode={viewMode}
                    selectionMode={isSelectionMode}
                    selectedServerIds={selectedServerIds}
                    onSelect={(serverId) => {
                      selectServer(serverId);
                      setDetailServerId(serverId);
                    }}
                    onToggleSelection={toggleServerSelection}
                    onToggleFavorite={handleToggleFavorite}
                    onQuickDeploy={handleQuickDeploy}
                    onDelete={(server) =>
                      openDeleteConfirm(
                        [server.id],
                        [server.displayName || server.name],
                      )
                    }
                  />
                </div>
              </div>
            )}
          </div>
          {filteredServers.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border app-wallpaper-panel-strong px-4 py-3">
              <div className="text-sm text-muted-foreground">
                {t("mcp.paginationSummary", {
                  start: (currentPage - 1) * pageSize + 1,
                  end: Math.min(currentPage * pageSize, filteredServers.length),
                  total: filteredServers.length,
                  defaultValue: `${(currentPage - 1) * pageSize + 1}-${Math.min(
                    currentPage * pageSize,
                    filteredServers.length,
                  )} / ${filteredServers.length}`,
                })}
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">
                    {t("prompt.pageSize", "Page size")}
                  </span>
                  <select
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      setCurrentPage(1);
                    }}
                    className="rounded-md border border-border bg-muted px-2 py-1 text-sm text-foreground"
                  >
                    {MCP_LIST_PAGE_SIZE_OPTIONS.map((size) => (
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
        {isDropTargetActive ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <div className="mx-6 w-full max-w-2xl rounded-3xl border border-primary/30 bg-background/95 px-8 py-10 shadow-2xl">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/25">
                  <InboxIcon className="h-8 w-8" aria-hidden="true" />
                </div>
                <div className="space-y-2">
                  <div className="text-lg font-semibold text-foreground">
                    {t("mcp.dropImportTitle", "Drop MCP sources to import")}
                  </div>
                  <div className="text-sm leading-6 text-muted-foreground">
                    {t(
                      "mcp.dropImportDesc",
                      "Drop an MCP config file or local source folder here to add it to My MCP.",
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </McpViewTransition>
    );

  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
        {renderedView}

        {isCreateModalOpen ? (
          <McpCreateModal
            onClose={() => setIsCreateModalOpen(false)}
            onManualSave={(draft) => handleCreate(null, draft)}
            onCreateFromSource={handleCreateFromSource}
          />
        ) : null}

        {showBatchTagDialog ? (
          <McpBatchTagDialog
            servers={selectedServers}
            onClose={() => setShowBatchTagDialog(false)}
            onSubmit={handleBatchTagSubmit}
          />
        ) : null}

        {deployDialogServers.length > 0 ? (
          <McpBatchDeployDialog
            servers={deployDialogServers}
            targetPresets={visibleAgentTargetPresets}
            targetStatus={visibleTargetStatus}
            onClose={closeDeployDialog}
            onApply={
              showBatchDeployDialog
                ? handleBatchApplyPresets
                : handleQuickApplyPresets
            }
          />
        ) : null}

        {agentDeployPreset ? (
          <McpLibraryDeployDialog
            preset={agentDeployPreset}
            servers={servers}
            targetStatus={visibleTargetStatus}
            onClose={() => setAgentDeployPreset(null)}
            onApply={handleAgentDeployFromLibrary}
          />
        ) : null}
      </div>

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={closeDeleteConfirm}
        onConfirm={() => void confirmDelete()}
        title={t("mcp.deleteConfirmTitle", "Delete MCP")}
        message={t("mcp.deleteConfirmMessage", {
          count: deleteConfirm.serverIds.length,
          names: deleteConfirm.serverNames.join(", "),
          defaultValue:
            deleteConfirm.serverIds.length === 1
              ? `Delete ${deleteConfirm.serverNames[0] || "this MCP"}?`
              : `Delete ${deleteConfirm.serverIds.length} MCP servers?`,
        })}
        confirmText={t("common.delete", "Delete")}
        cancelText={t("common.cancel", "Cancel")}
        variant="destructive"
        isLoading={isDeletingServers}
      />

      <SkillStoreSourceEditModal
        isOpen={editingCustomSourceId !== null}
        onClose={() => setEditingCustomSourceId(null)}
        onDelete={setPendingDeleteCustomSourceId}
        onSave={handleUpdateCustomSource}
        onToggleEnabled={toggleCustomStoreSource}
        onRefresh={(sourceId) => void loadMarketSource(sourceId, true)}
        refreshingSourceId={loadingMarketSourceId}
        source={
          customStoreSources.find(
            (source) => source.id === editingCustomSourceId,
          ) ?? null
        }
        typeOptions={customSourceTypeOptions}
      />

      <ConfirmDialog
        isOpen={Boolean(pendingDeleteCustomSource)}
        onClose={() => setPendingDeleteCustomSourceId(null)}
        onConfirm={handleConfirmDeleteCustomSource}
        title={t("skill.deleteStoreSourceTitle", "Delete custom store")}
        message={t("skill.deleteStoreSourceMessage", {
          name: pendingDeleteCustomSource?.name ?? "",
          defaultValue:
            'Delete custom store "{{name}}"? Installed items will stay in your library, but this source and its cached store entries will be removed.',
        })}
        confirmText={t("common.delete", "Delete")}
        cancelText={t("common.cancel", "Cancel")}
        variant="destructive"
      />

      <ConfirmDialog
        isOpen={Boolean(pendingAgentRemoval)}
        onClose={() => {
          if (!isRemovingAgentEntry) {
            setPendingAgentRemoval(null);
          }
        }}
        onConfirm={() => void confirmRemoveAgentMcp()}
        title={t("mcp.uninstallFromAgent", "Uninstall from Agent")}
        message={t(
          "mcp.uninstallFromAgentConfirm",
          "Remove this MCP entry from the selected agent config?",
        )}
        confirmText={t("common.uninstall", "Uninstall")}
        cancelText={t("common.cancel", "Cancel")}
        variant="destructive"
        isLoading={isRemovingAgentEntry}
      />
    </>
  );
}

export default McpManager;
