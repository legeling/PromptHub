import type { ComponentProps } from "react";
import { McpAgentWorkspaces } from "./McpAgentWorkspaces";
import { McpDetailWorkspace } from "./McpDetailWorkspace";
import { McpLibraryWorkspace } from "./McpLibraryWorkspace";
import { McpStoreWorkspace } from "./McpStoreWorkspace";
import type { McpManagerViewModel } from "./useMcpManagerController";

interface McpManagerRouteProps {
  model: McpManagerViewModel;
}

function McpDetailRoute({ model }: McpManagerRouteProps) {
  if (!model.detailServer) return null;
  return (
    <McpDetailWorkspace
      server={model.detailServer}
      healthCheck={model.selectedServerHealth}
      distributedTargetCount={model.selectedServerTargetCount}
      targetSyncChecks={model.selectedServerTargetSyncChecks}
      targetPresets={model.visibleTargetPresets}
      targetStatus={model.visibleTargetStatus}
      onApply={(presets) =>
        model.handleApplyPresets(presets, [model.detailServer!.id])
      }
      onRemove={(preset) =>
        model.handleRemovePreset(preset, [model.detailServer!.id])
      }
      onBack={() => {
        model.setDetailServerId(null);
        model.selectServer(null);
      }}
      onSave={model.handleSave}
      onCheckServer={model.handleCheckServer}
      onCheckTargetSync={model.handleCheckTargetSync}
      onSyncTargets={model.handleSyncTargets}
      onImportEnv={model.handleImportEnv}
      onDelete={model.handleDelete}
    />
  );
}

function getMcpStoreDataProps(model: McpManagerViewModel) {
  return {
    templates: model.marketTemplates,
    remoteTemplates: model.selectedMarketEntry?.templates ?? [],
    sources: model.marketSources,
    selectedSourceId: model.selectedMarketSourceId,
    selectedCustomSource: model.selectedCustomSource,
    searchQuery: model.marketSearchQuery,
    scrollPosition: model.marketScrollPosition,
    isLoading: model.shouldShowMarketLoading,
    isLoadingMore:
      model.loadingMoreMarketSourceId === model.selectedMarketSourceId,
    hasMore: Boolean(model.selectedMarketEntry?.nextCursor),
    error: model.selectedMarketEntry?.error ?? model.marketError,
    totalCount: model.selectedMarketEntry?.totalCount,
    totalCountIsLowerBound: model.selectedMarketEntry?.totalCountIsLowerBound,
    installedServers: model.servers,
    sourceBranch: model.sourceBranch,
    sourceDirectory: model.sourceDirectory,
    sourceName: model.sourceName,
    sourceType: model.sourceType,
    sourceUrl: model.sourceUrl,
    t: model.t,
  } satisfies Partial<ComponentProps<typeof McpStoreWorkspace>>;
}

function getMcpStoreActionProps(model: McpManagerViewModel) {
  return {
    onAddCustomSource: model.handleAddCustomSource,
    onChangeSourceBranch: model.setSourceBranch,
    onChangeSourceDirectory: model.setSourceDirectory,
    onChangeSourceName: model.setSourceName,
    onChangeSourceType: model.setSourceType,
    onChangeSourceUrl: model.setSourceUrl,
    onEditCustomSource: model.setEditingCustomSourceId,
    onLoadMore: () => model.loadMoreMarketSource(model.selectedMarketSourceId),
    onRefresh: () => model.loadMarketSource(model.selectedMarketSourceId, true),
    onSearchChange: model.setMarketSearchQuery,
    onInstall: model.handleInstallTemplate,
    onCheckUpdate: model.checkMarketUpdate,
    onUpdate: model.applyMarketUpdate,
  } satisfies Partial<ComponentProps<typeof McpStoreWorkspace>>;
}

function McpStoreRoute({ model }: McpManagerRouteProps) {
  return (
    <McpStoreWorkspace
      {...getMcpStoreDataProps(model)}
      {...getMcpStoreActionProps(model)}
    />
  );
}

function McpAgentRoute({ model }: McpManagerRouteProps) {
  const mode = model.selectedTab === "projects" ? "projects" : "agents";
  return (
    <McpAgentWorkspaces
      mode={mode}
      servers={model.servers}
      targetPresets={model.visibleAgentTargetPresets}
      projectTargetPresets={model.visibleProjectTargetPresets}
      targetStatus={model.visibleTargetStatus}
      t={model.t}
      onAddMcp={model.handleOpenAgentDeployDialog}
      onImportExternal={model.handleImportAgentMcp}
      onOpenManaged={model.openServerDetail}
      onOpenAgentConfig={model.handleOpenAgentConfig}
      onRemoveAgentEntry={model.handleRemoveAgentMcp}
      onRefresh={async () => {
        await model.load();
        await model.refreshVisibleTargetStatus();
      }}
    />
  );
}

function getMcpLibraryDataProps(model: McpManagerViewModel) {
  return {
    activeSourceFilterKey: model.activeSourceFilterKey,
    allVisibleSelected: model.allVisibleSelected,
    currentPage: model.currentPage,
    error: model.error,
    filteredServers: model.filteredServers,
    galleryColumns: model.galleryColumns,
    galleryColumnOptions: model.galleryColumnOptions,
    galleryGridStyle: model.mcpGalleryGridStyle,
    hasActiveSourceFilter: model.hasActiveSourceFilter,
    healthChecks: model.healthChecks,
    isDropTargetActive: model.isDropTargetActive,
    isRefreshingLibrary: model.isRefreshingLibrary,
    isSelectionMode: model.isSelectionMode,
    libraryFilter: model.libraryFilter,
    mcpFilterOptions: model.mcpFilterOptions,
    pageSize: model.pageSize,
    selectedServerId: model.detailServerId,
    selectedServerIds: model.selectedServerIds,
    selectedServersAllFavorite: model.selectedServersAllFavorite,
    servers: model.servers,
    sourceFilterOptions: model.sourceFilterOptions,
    t: model.t,
    targetPresets: model.visibleTargetPresets,
    targetStatus: model.visibleTargetStatus,
    totalPages: model.totalPages,
    viewMode: model.viewMode,
    visiblePageNumbers: model.visiblePageNumbers,
    visibleServers: model.visibleServers,
  } satisfies Partial<ComponentProps<typeof McpLibraryWorkspace>>;
}

function getMcpLibraryActionProps(model: McpManagerViewModel) {
  return {
    onBatchDelete: model.handleBatchDelete,
    onBatchDeploy: model.handleBatchDeploy,
    onBatchFavorite: model.handleBatchFavorite,
    onBatchTags: model.handleBatchTags,
    onChangeGalleryColumns: model.setGalleryColumns,
    onChangePageSize: model.handleChangePageSize,
    onChangeSourceFilter: model.setSourceFilterKey,
    onChangeViewMode: model.setViewMode,
    onDeleteServer: (server) =>
      model.openDeleteConfirm([server.id], [server.displayName || server.name]),
    onDropImport: model.handleDropImport,
    onGoToPage: model.goToPage,
    onLibraryFilterChange: model.handleLibraryFilterChange,
    onQuickDeploy: model.handleQuickDeploy,
    onRefresh: model.handleRefreshLibrary,
    onSelectAllVisible: model.handleSelectAllVisible,
    onSelectServer: model.handleSelectServer,
    onSetDropTargetActive: model.setIsDropTargetActive,
    onToggleFavorite: model.handleToggleFavorite,
    onToggleSelection: model.toggleServerSelection,
    onToggleSelectionMode: model.toggleSelectionMode,
  } satisfies Partial<ComponentProps<typeof McpLibraryWorkspace>>;
}

function McpLibraryRoute({ model }: McpManagerRouteProps) {
  return (
    <McpLibraryWorkspace
      {...getMcpLibraryDataProps(model)}
      {...getMcpLibraryActionProps(model)}
    />
  );
}

export function McpManagerViewRouter({ model }: McpManagerRouteProps) {
  if (model.selectedTab === "library" && model.detailServer)
    return <McpDetailRoute model={model} />;
  if (model.selectedTab === "market") return <McpStoreRoute model={model} />;
  if (model.selectedTab === "targets" || model.selectedTab === "projects")
    return <McpAgentRoute model={model} />;
  return <McpLibraryRoute model={model} />;
}
