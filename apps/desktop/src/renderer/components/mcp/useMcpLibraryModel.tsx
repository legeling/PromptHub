import { useMemo, type ReactNode } from "react";
import { Clock3Icon, SendIcon, ServerIcon, StarIcon } from "lucide-react";
import { MCP_OFFICIAL_MARKET_SOURCE_ID } from "@prompthub/shared/constants/mcp-market";
import type { McpServerConfig } from "@prompthub/shared/types/mcp";
import type { SelectOption } from "../ui/Select";
import type { McpLibraryFilterOption } from "./McpLibraryWorkspace";
import type { McpManagerBindings } from "./useMcpManagerBindings";
import type { McpManagerState } from "./useMcpManagerState";
import type { McpManagerTargets } from "./useMcpManagerTargets";
import { isServerOnPreset } from "./mcp-form-utils";
import {
  ALL_MCP_SOURCE_FILTER,
  getMcpGalleryGridStyle,
  getMcpSourceKey,
  getMcpSourceLabel,
  matchesMcpSearch,
  MCP_GALLERY_COLUMNS,
  type McpLibraryFilter,
} from "./mcp-manager-utils";

interface McpLibraryModelOptions {
  bindings: McpManagerBindings;
  state: McpManagerState;
  targets: McpManagerTargets;
}

function useMcpServerDetails(options: McpLibraryModelOptions) {
  const { mcpStore } = options.bindings;
  const { detailServerId } = options.state;
  const { visibleTargetPresets, visibleTargetStatus } = options.targets;
  const servers = useMemo(
    () => mcpStore.library?.servers ?? [],
    [mcpStore.library],
  );
  const detailServer = useMemo(
    () => servers.find((server) => server.id === detailServerId) ?? null,
    [detailServerId, servers],
  );
  const selectedServerTargetCount = useMemo(
    () =>
      detailServer
        ? visibleTargetPresets.filter((preset) =>
            isServerOnPreset(visibleTargetStatus, preset.id, detailServer.name),
          ).length
        : 0,
    [detailServer, visibleTargetPresets, visibleTargetStatus],
  );
  const selectedServerHealth = useMemo(
    () =>
      detailServer
        ? mcpStore.healthChecks.find(
            (item) => item.serverId === detailServer.id,
          )
        : undefined,
    [detailServer, mcpStore.healthChecks],
  );
  const selectedServerTargetSyncChecks = useMemo(
    () =>
      detailServer
        ? mcpStore.targetSyncChecks.filter(
            (item) => item.serverId === detailServer.id,
          )
        : [],
    [detailServer, mcpStore.targetSyncChecks],
  );
  return {
    servers,
    detailServer,
    selectedServerTargetCount,
    selectedServerHealth,
    selectedServerTargetSyncChecks,
  };
}

function useMcpMarketModel(options: McpLibraryModelOptions) {
  const { mcpStore } = options.bindings;
  const { pendingDeleteCustomSourceId } = options.state;
  const normalizedMarketSearchQuery = mcpStore.marketSearchQuery
    .trim()
    .toLowerCase();
  const selectedMarketEntry =
    mcpStore.remoteMarketEntries[
      `${mcpStore.selectedMarketSourceId}:${normalizedMarketSearchQuery}`
    ];
  const selectedMarketSourceIsRemote =
    mcpStore.selectedMarketSourceId !== MCP_OFFICIAL_MARKET_SOURCE_ID &&
    mcpStore.selectedMarketSourceId !== "new-custom";
  const shouldShowMarketLoading =
    mcpStore.loadingMarketSourceId === mcpStore.selectedMarketSourceId ||
    (mcpStore.selectedTab === "market" &&
      selectedMarketSourceIsRemote &&
      !selectedMarketEntry &&
      !mcpStore.marketError);
  const selectedCustomSource = useMemo(
    () =>
      mcpStore.customStoreSources.find(
        (source) => source.id === mcpStore.selectedMarketSourceId,
      ) ?? null,
    [mcpStore.customStoreSources, mcpStore.selectedMarketSourceId],
  );
  const pendingDeleteCustomSource = useMemo(
    () =>
      mcpStore.customStoreSources.find(
        (source) => source.id === pendingDeleteCustomSourceId,
      ) ?? null,
    [mcpStore.customStoreSources, pendingDeleteCustomSourceId],
  );
  return {
    selectedMarketEntry,
    selectedCustomSource,
    pendingDeleteCustomSource,
    shouldShowMarketLoading,
  };
}

function useMcpGalleryModel(options: McpLibraryModelOptions) {
  const { t } = options.bindings;
  const { galleryColumns } = options.state;
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
  return { galleryColumnOptions, mcpGalleryGridStyle };
}

function countMcpLibraryServers(
  servers: McpServerConfig[],
  distributionById: Map<string, number>,
) {
  let distributed = 0;
  let favorites = 0;
  for (const server of servers) {
    if (server.isFavorite) favorites += 1;
    if ((distributionById.get(server.id) ?? 0) > 0) distributed += 1;
  }
  return {
    all: servers.length,
    favorites,
    distributed,
    pending: Math.max(servers.length - distributed, 0),
  };
}

function createMcpFilterOptions(
  counts: ReturnType<typeof countMcpLibraryServers>,
  t: McpManagerBindings["t"],
) {
  return [
    {
      icon: <ServerIcon className="h-3.5 w-3.5" />,
      label: t("mcp.allServers", "All MCP"),
      count: counts.all,
      value: "all",
    },
    {
      icon: <StarIcon className="h-3.5 w-3.5" />,
      label: t("mcp.favorites", "Favorites"),
      count: counts.favorites,
      value: "favorites",
    },
    {
      icon: <SendIcon className="h-3.5 w-3.5" />,
      label: t("mcp.distributed", "Distributed"),
      count: counts.distributed,
      value: "distributed",
    },
    {
      icon: <Clock3Icon className="h-3.5 w-3.5" />,
      label: t("mcp.pendingDistribution", "Pending"),
      count: counts.pending,
      value: "pending",
    },
  ] satisfies Array<{
    count: number;
    icon: ReactNode;
    label: string;
    value: McpLibraryFilter;
  }>;
}

function useMcpDistributionModel(
  servers: McpServerConfig[],
  targets: McpManagerTargets,
  t: McpManagerBindings["t"],
) {
  const serverDistributionById = useMemo(() => {
    const next = new Map<string, number>();
    for (const server of servers) {
      const count = targets.visibleTargetPresets.filter((preset) =>
        isServerOnPreset(targets.visibleTargetStatus, preset.id, server.name),
      ).length;
      next.set(server.id, count);
    }
    return next;
  }, [servers, targets.visibleTargetPresets, targets.visibleTargetStatus]);
  const libraryCounts = useMemo(
    () => countMcpLibraryServers(servers, serverDistributionById),
    [serverDistributionById, servers],
  );
  const mcpFilterOptions = useMemo<McpLibraryFilterOption[]>(
    () => createMcpFilterOptions(libraryCounts, t),
    [libraryCounts, t],
  );
  return { serverDistributionById, mcpFilterOptions };
}

function filterMcpServers(options: {
  filterTags: string[];
  libraryFilter: McpLibraryFilter;
  normalizedSearchQuery: string;
  servers: McpServerConfig[];
  serverDistributionById: Map<string, number>;
}) {
  return options.servers.filter((server) => {
    const distributed = options.serverDistributionById.get(server.id) ?? 0;
    if (options.libraryFilter === "favorites" && !server.isFavorite)
      return false;
    if (options.libraryFilter === "distributed" && distributed === 0)
      return false;
    if (options.libraryFilter === "pending" && distributed > 0) return false;
    const matchesTag =
      options.filterTags.length === 0 ||
      options.filterTags.some((tag) => (server.tags ?? []).includes(tag));
    return (
      matchesTag && matchesMcpSearch(server, options.normalizedSearchQuery)
    );
  });
}

function getMcpSourceFilterEntries(
  servers: McpServerConfig[],
  t: McpManagerBindings["t"],
) {
  const entries = new Map<string, { count: number; label: string }>();
  for (const server of servers) {
    const key = getMcpSourceKey(server, t);
    const current = entries.get(key);
    entries.set(key, {
      label: getMcpSourceLabel(server, t),
      count: (current?.count ?? 0) + 1,
    });
  }
  return Array.from(entries.entries())
    .map(([value, entry]) => ({ value, ...entry }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function createMcpSourceFilterOptions(
  serverCount: number,
  entries: ReturnType<typeof getMcpSourceFilterEntries>,
  t: McpManagerBindings["t"],
) {
  const allSourcesLabel = t("mcp.allSources", "All Sources");
  return [
    {
      value: ALL_MCP_SOURCE_FILTER,
      label: (
        <McpSourceOptionLabel label={allSourcesLabel} count={serverCount} />
      ),
      labelText: allSourcesLabel,
    },
    ...entries.map((entry) => ({
      value: entry.value,
      label: <McpSourceOptionLabel label={entry.label} count={entry.count} />,
      labelText: entry.label,
    })),
  ];
}

function McpSourceOptionLabel({
  count,
  label,
}: {
  count: number;
  label: string;
}) {
  return (
    <span className="flex w-full items-center justify-between gap-2">
      <span className="truncate">{label}</span>
      <span className="text-xs text-muted-foreground">{count}</span>
    </span>
  );
}

function useMcpBaseServerFilterModel(
  servers: McpServerConfig[],
  distributionById: Map<string, number>,
  options: McpLibraryModelOptions,
) {
  const { mcpStore, t } = options.bindings;
  const { libraryFilter, sourceFilterKey } = options.state;
  const normalizedSearchQuery = mcpStore.searchQuery.trim().toLowerCase();
  const baseFilteredServers = useMemo(
    () =>
      filterMcpServers({
        filterTags: mcpStore.filterTags,
        libraryFilter,
        normalizedSearchQuery,
        servers,
        serverDistributionById: distributionById,
      }),
    [
      distributionById,
      libraryFilter,
      mcpStore.filterTags,
      normalizedSearchQuery,
      servers,
    ],
  );
  const sourceFilterEntries = useMemo(
    () => getMcpSourceFilterEntries(baseFilteredServers, t),
    [baseFilteredServers, t],
  );
  return { baseFilteredServers, normalizedSearchQuery, sourceFilterEntries };
}

function useMcpSourceFilterModel(
  base: ReturnType<typeof useMcpBaseServerFilterModel>,
  sourceFilterKey: string,
  t: McpManagerBindings["t"],
) {
  const activeSourceFilterKey = base.sourceFilterEntries.some(
    (entry) => entry.value === sourceFilterKey,
  )
    ? sourceFilterKey
    : ALL_MCP_SOURCE_FILTER;
  const sourceFilterOptions = useMemo<SelectOption[]>(
    () =>
      createMcpSourceFilterOptions(
        base.baseFilteredServers.length,
        base.sourceFilterEntries,
        t,
      ),
    [base.baseFilteredServers.length, base.sourceFilterEntries, t],
  );
  const filteredServers = useMemo(
    () =>
      activeSourceFilterKey === ALL_MCP_SOURCE_FILTER
        ? base.baseFilteredServers
        : base.baseFilteredServers.filter(
            (server) => getMcpSourceKey(server, t) === activeSourceFilterKey,
          ),
    [activeSourceFilterKey, base.baseFilteredServers, t],
  );
  return {
    activeSourceFilterKey,
    filteredServers,
    hasActiveSourceFilter: sourceFilterKey !== ALL_MCP_SOURCE_FILTER,
    sourceFilterOptions,
  };
}

function useMcpServerFilterModel(
  servers: McpServerConfig[],
  distributionById: Map<string, number>,
  options: McpLibraryModelOptions,
) {
  const base = useMcpBaseServerFilterModel(servers, distributionById, options);
  const source = useMcpSourceFilterModel(
    base,
    options.state.sourceFilterKey,
    options.bindings.t,
  );
  return { ...base, ...source };
}

function getMcpVisiblePageNumbers(currentPage: number, totalPages: number) {
  const windowSize = Math.min(5, totalPages);
  if (totalPages <= windowSize || currentPage <= 3) {
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
}

function useMcpPaginationModel(
  filteredServers: McpServerConfig[],
  state: McpManagerState,
) {
  const totalPages = Math.max(
    1,
    Math.ceil(filteredServers.length / state.pageSize),
  );
  const visibleServers = useMemo(() => {
    const startIndex = (state.currentPage - 1) * state.pageSize;
    return filteredServers.slice(startIndex, startIndex + state.pageSize);
  }, [filteredServers, state.currentPage, state.pageSize]);
  const visiblePageNumbers = useMemo(
    () => getMcpVisiblePageNumbers(state.currentPage, totalPages),
    [state.currentPage, totalPages],
  );
  return { totalPages, visibleServers, visiblePageNumbers };
}

function useMcpSelectionModel(
  servers: McpServerConfig[],
  visibleServers: McpServerConfig[],
  state: McpManagerState,
) {
  const selectedServers = useMemo(
    () => servers.filter((server) => state.selectedServerIds.has(server.id)),
    [servers, state.selectedServerIds],
  );
  const quickDeployServer = useMemo(
    () =>
      state.quickDeployServerId
        ? (servers.find((server) => server.id === state.quickDeployServerId) ??
          null)
        : null,
    [servers, state.quickDeployServerId],
  );
  const deployDialogServers = state.showBatchDeployDialog
    ? selectedServers
    : quickDeployServer
      ? [quickDeployServer]
      : [];
  const allVisibleSelected =
    visibleServers.length > 0 &&
    visibleServers.every((server) => state.selectedServerIds.has(server.id));
  const selectedServersAllFavorite =
    selectedServers.length > 0 &&
    selectedServers.every((server) => server.isFavorite);
  return {
    allVisibleSelected,
    deployDialogServers,
    selectedServers,
    selectedServersAllFavorite,
  };
}

export function useMcpLibraryModel(options: McpLibraryModelOptions) {
  const details = useMcpServerDetails(options);
  const market = useMcpMarketModel(options);
  const gallery = useMcpGalleryModel(options);
  const distribution = useMcpDistributionModel(
    details.servers,
    options.targets,
    options.bindings.t,
  );
  const filters = useMcpServerFilterModel(
    details.servers,
    distribution.serverDistributionById,
    options,
  );
  const pagination = useMcpPaginationModel(
    filters.filteredServers,
    options.state,
  );
  const selection = useMcpSelectionModel(
    details.servers,
    pagination.visibleServers,
    options.state,
  );
  const installedNames = useMemo(
    () => new Set(details.servers.map((server) => server.name)),
    [details.servers],
  );
  return {
    ...details,
    ...market,
    ...gallery,
    ...distribution,
    ...filters,
    ...pagination,
    ...selection,
    installedNames,
  };
}

export type McpLibraryModel = ReturnType<typeof useMcpLibraryModel>;
