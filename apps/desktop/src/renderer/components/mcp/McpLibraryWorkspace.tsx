import { ResourceLibraryControls } from "../resources/ResourceLibraryControls";
import { ResourceLibraryPagination } from "../resources/ResourceLibraryPagination";
import { isResourceGalleryColumns } from "@prompthub/shared/constants/resource-library";
import type { CSSProperties, ReactNode } from "react";
import {
  CheckSquareIcon,
  InboxIcon,
  RefreshCwIcon,
  SendIcon,
  ServerIcon,
  SquareIcon,
  StarIcon,
  TagsIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import type { TFunction } from "i18next";
import type { McpTargetPreset } from "@prompthub/core";
import type {
  McpHealthCheckResult,
  McpServerConfig,
  McpTargetStatusEntry,
} from "@prompthub/shared/types/mcp";
import { Select, type SelectOption } from "../ui/Select";
import { McpServerList, type McpServerViewMode } from "./McpServerList";
import {
  hasFileItems,
  McpViewTransition,
  type McpGalleryColumnMode,
  type McpLibraryFilter,
} from "./mcp-manager-utils";

export interface McpLibraryFilterOption {
  count: number;
  icon: ReactNode;
  label: string;
  value: McpLibraryFilter;
}

interface McpLibraryWorkspaceProps {
  activeSourceFilterKey: string;
  allVisibleSelected: boolean;
  currentPage: number;
  error: string | null;
  filteredServers: McpServerConfig[];
  galleryColumns: McpGalleryColumnMode;
  galleryColumnOptions: SelectOption[];
  galleryGridStyle: CSSProperties;
  hasActiveSourceFilter: boolean;
  healthChecks: McpHealthCheckResult[];
  isDropTargetActive: boolean;
  isRefreshingLibrary: boolean;
  isSelectionMode: boolean;
  libraryFilter: McpLibraryFilter;
  mcpFilterOptions: McpLibraryFilterOption[];
  pageSize: number;
  selectedServerId: string | null;
  selectedServerIds: Set<string>;
  selectedServersAllFavorite: boolean;
  servers: McpServerConfig[];
  sourceFilterOptions: SelectOption[];
  t: TFunction;
  targetPresets: McpTargetPreset[];
  targetStatus: McpTargetStatusEntry[];
  totalPages: number;
  viewMode: McpServerViewMode;
  visiblePageNumbers: number[];
  visibleServers: McpServerConfig[];
  onBatchDelete: () => void;
  onBatchDeploy: () => void;
  onBatchFavorite: () => Promise<void>;
  onBatchTags: () => void;
  onChangeGalleryColumns: (columns: McpGalleryColumnMode) => void;
  onChangePageSize: (pageSize: number) => void;
  onChangeSourceFilter: (sourceFilterKey: string) => void;
  onChangeViewMode: (viewMode: McpServerViewMode) => void;
  onDeleteServer: (server: McpServerConfig) => void;
  onDropImport: (files: FileList) => Promise<void>;
  onGoToPage: (page: number) => void;
  onLibraryFilterChange: (filter: McpLibraryFilter) => void;
  onQuickDeploy: (server: McpServerConfig) => void;
  onRefresh: () => Promise<void>;
  onSelectAllVisible: () => void;
  onSelectServer: (serverId: string) => void;
  onSetDropTargetActive: (active: boolean) => void;
  onToggleFavorite: (server: McpServerConfig) => Promise<void>;
  onToggleSelection: (serverId: string) => void;
  onToggleSelectionMode: () => void;
}

function McpLibraryResults({
  galleryGridStyle,
  healthChecks,
  isSelectionMode,
  selectedServerId,
  selectedServerIds,
  targetPresets,
  targetStatus,
  viewMode,
  visibleServers,
  onDeleteServer,
  onQuickDeploy,
  onSelectServer,
  onToggleFavorite,
  onToggleSelection,
}: Pick<
  McpLibraryWorkspaceProps,
  | "galleryGridStyle"
  | "healthChecks"
  | "isSelectionMode"
  | "selectedServerId"
  | "selectedServerIds"
  | "targetPresets"
  | "targetStatus"
  | "viewMode"
  | "visibleServers"
  | "onDeleteServer"
  | "onQuickDeploy"
  | "onSelectServer"
  | "onToggleFavorite"
  | "onToggleSelection"
>) {
  const list = (
    <McpServerList
      servers={visibleServers}
      selectedServerId={selectedServerId}
      healthChecks={healthChecks}
      targetPresets={targetPresets}
      targetStatus={targetStatus}
      gridStyle={galleryGridStyle}
      viewMode={viewMode}
      selectionMode={isSelectionMode}
      selectedServerIds={selectedServerIds}
      onSelect={onSelectServer}
      onToggleSelection={onToggleSelection}
      onToggleFavorite={onToggleFavorite}
      onQuickDeploy={onQuickDeploy}
      onDelete={onDeleteServer}
    />
  );

  if (viewMode === "list") {
    return list;
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-hide">
      <div className="p-6">{list}</div>
    </div>
  );
}

function McpLibraryPagination({
  currentPage,
  filteredServers,
  pageSize,
  t,
  totalPages,
  visiblePageNumbers,
  onChangePageSize,
  onGoToPage,
}: Pick<
  McpLibraryWorkspaceProps,
  | "currentPage"
  | "filteredServers"
  | "pageSize"
  | "t"
  | "totalPages"
  | "visiblePageNumbers"
  | "onChangePageSize"
  | "onGoToPage"
>) {
  return (
    <ResourceLibraryPagination
      total={filteredServers.length}
      currentPage={currentPage}
      pageSize={pageSize}
      onPageChange={onGoToPage}
      onPageSizeChange={onChangePageSize}
    />
  );
}

function McpBatchToolbar({
  allVisibleSelected,
  selectedServerIds,
  selectedServersAllFavorite,
  t,
  onBatchDelete,
  onBatchDeploy,
  onBatchFavorite,
  onBatchTags,
  onSelectAllVisible,
}: Pick<
  McpLibraryWorkspaceProps,
  | "allVisibleSelected"
  | "selectedServerIds"
  | "selectedServersAllFavorite"
  | "t"
  | "onBatchDelete"
  | "onBatchDeploy"
  | "onBatchFavorite"
  | "onBatchTags"
  | "onSelectAllVisible"
>) {
  const hasSelection = selectedServerIds.size > 0;
  const selectAllLabel = allVisibleSelected
    ? t("common.clear", "Clear")
    : t("common.selectAll", "Select All");
  const favoriteLabel = selectedServersAllFavorite
    ? t("mcp.removeFavorite", "Remove Favorite")
    : t("mcp.addFavorite", "Add Favorite");

  return (
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
        onClick={onSelectAllVisible}
        className="inline-flex items-center gap-2 rounded-xl border border-border app-wallpaper-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/25 hover:bg-accent"
        title={selectAllLabel}
        aria-label={selectAllLabel}
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
        {selectAllLabel}
      </button>
      <button
        type="button"
        onClick={() => void onBatchFavorite()}
        disabled={!hasSelection}
        className="inline-flex items-center gap-2 rounded-xl border border-border app-wallpaper-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/25 hover:bg-accent disabled:opacity-50"
        title={favoriteLabel}
        aria-label={favoriteLabel}
      >
        <StarIcon aria-hidden="true" className="w-4 h-4 text-amber-500" />
        {favoriteLabel}
      </button>
      <button
        type="button"
        onClick={onBatchTags}
        disabled={!hasSelection}
        className="inline-flex items-center gap-2 rounded-xl border border-border app-wallpaper-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/25 hover:bg-accent disabled:opacity-50"
        title={t("mcp.batchTags", "Batch Tags")}
        aria-label={t("mcp.batchTags", "Batch Tags")}
      >
        <TagsIcon aria-hidden="true" className="w-4 h-4 text-primary" />
        {t("mcp.batchTags", "Batch Tags")}
      </button>
      <button
        type="button"
        onClick={onBatchDeploy}
        disabled={!hasSelection}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
        title={t("mcp.batchDeploy", "Batch Deploy")}
        aria-label={t("mcp.batchDeploy", "Batch Deploy")}
      >
        <SendIcon aria-hidden="true" className="w-4 h-4" />
        {t("mcp.batchDeploy", "Batch Deploy")}
      </button>
      <button
        type="button"
        onClick={onBatchDelete}
        disabled={!hasSelection}
        className="inline-flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/15 disabled:opacity-50"
        title={t("common.delete", "Delete")}
        aria-label={t("common.delete", "Delete")}
      >
        <TrashIcon aria-hidden="true" className="w-4 h-4" />
        {t("common.delete", "Delete")}
      </button>
    </div>
  );
}

function McpLibraryHeader(props: McpLibraryWorkspaceProps) {
  const {
    activeSourceFilterKey,
    filteredServers,
    galleryColumns,
    galleryColumnOptions,
    hasActiveSourceFilter,
    isRefreshingLibrary,
    isSelectionMode,
    libraryFilter,
    mcpFilterOptions,
    servers,
    sourceFilterOptions,
    t,
    totalPages,
    viewMode,
    onChangeGalleryColumns,
    onChangeSourceFilter,
    onChangeViewMode,
    onLibraryFilterChange,
    onRefresh,
    onToggleSelectionMode,
  } = props;
  const start = (props.currentPage - 1) * props.pageSize + 1;
  const end = Math.min(
    props.currentPage * props.pageSize,
    filteredServers.length,
  );

  return (
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
                    start,
                    end,
                    total: filteredServers.length,
                    defaultValue: `${start}-${end} / ${filteredServers.length}`,
                  })}
                </span>
              ) : filteredServers.length !== servers.length ? (
                <span className="text-[11px] text-muted-foreground">
                  {filteredServers.length} / {servers.length}
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t("mcp.myMcpSubtitle", "Manage MCP servers saved in PromptHub")}
            </p>
          </div>
          <div className="flex items-center gap-2 self-start lg:self-center lg:justify-end">
            <button
              type="button"
              onClick={onToggleSelectionMode}
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
            <ResourceLibraryControls
              columnsLabel={t("mcp.galleryColumnsLabel")}
              viewMode={viewMode}
              onViewModeChange={onChangeViewMode}
              columns={galleryColumns}
              columnOptions={galleryColumnOptions}
              onColumnsChange={(value) => {
                if (isResourceGalleryColumns(value))
                  onChangeGalleryColumns(value);
              }}
            />
            <div className="h-4 w-px bg-border" />
            <button
              type="button"
              onClick={() => void onRefresh()}
              disabled={isRefreshingLibrary}
              className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors disabled:opacity-60"
              aria-label={t("common.refresh", "Refresh")}
              title={t("common.refresh", "Refresh")}
            >
              <RefreshCwIcon
                aria-hidden="true"
                className={`w-4 h-4 ${isRefreshingLibrary ? "animate-spin" : ""}`}
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
                onClick={() => onLibraryFilterChange(option.value)}
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
            onChange={onChangeSourceFilter}
            options={sourceFilterOptions}
            className="min-w-[13rem] flex-1 sm:flex-none"
            triggerClassName={`h-9 w-full rounded-xl border px-3 text-sm font-medium shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 flex items-center justify-between gap-2 ${
              hasActiveSourceFilter
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border app-wallpaper-surface text-muted-foreground hover:border-primary/25 hover:bg-accent hover:text-foreground"
            }`}
          />
        </div>
        {isSelectionMode ? <McpBatchToolbar {...props} /> : null}
        {props.error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {props.error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function McpLibraryWorkspace(props: McpLibraryWorkspaceProps) {
  const { isDropTargetActive, onDropImport, onSetDropTargetActive } = props;

  return (
    <McpViewTransition
      viewKey="my-mcp"
      className="relative flex flex-1 flex-row overflow-hidden app-wallpaper-section"
      onDragEnter={(event) => {
        if (hasFileItems(event.dataTransfer)) {
          event.preventDefault();
          onSetDropTargetActive(true);
        }
      }}
      onDragOver={(event) => {
        if (hasFileItems(event.dataTransfer)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          if (!isDropTargetActive) onSetDropTargetActive(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onSetDropTargetActive(false);
        }
      }}
      onDrop={(event) => {
        if (hasFileItems(event.dataTransfer)) {
          event.preventDefault();
          onSetDropTargetActive(false);
          void onDropImport(event.dataTransfer.files);
        }
      }}
    >
      <div className="flex-1 flex flex-col min-w-0">
        <McpLibraryHeader {...props} />
        <div className="flex-1 min-h-0 overflow-hidden">
          <McpLibraryResults {...props} />
        </div>
        <McpLibraryPagination {...props} />
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
                  {props.t("mcp.dropImportTitle", "Drop MCP sources to import")}
                </div>
                <div className="text-sm leading-6 text-muted-foreground">
                  {props.t(
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
}
