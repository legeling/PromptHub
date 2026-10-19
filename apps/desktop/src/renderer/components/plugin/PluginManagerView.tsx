import { observedDistributionPresence } from "@prompthub/shared/utils/resource-observation";
import { ResourceDistributionNotice } from "../resources/ResourceDistributionNotice";
import { ResourceLibraryControls } from "../resources/ResourceLibraryControls";
import { ResourceLibraryPagination } from "../resources/ResourceLibraryPagination";
import { isResourceGalleryColumns } from "@prompthub/shared/constants/resource-library";
import {
  BotIcon,
  CheckSquareIcon,
  FolderOpenIcon,
  GlobeIcon,
  InboxIcon,
  ListChecksIcon,
  Loader2Icon,
  PackageIcon,
  PackagePlusIcon,
  RefreshCwIcon,
  SendIcon,
  Settings2Icon,
  StarIcon,
  StoreIcon,
  TagsIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import { Spinner } from "../ui/Spinner";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ContextMenu } from "../ui/ContextMenu";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import { PluginAgentTargetPicker } from "./PluginAgentTargetPicker";
import { PluginFullDetailPage } from "./PluginFullDetailPage";
import { SkillRenderBoundary } from "../skill/SkillRenderBoundary";
import { SkillStoreSourceEditModal } from "../skill/SkillStoreSourceEditModal";
import { SkillStoreSourceForm } from "../skill/SkillStoreSourceForm";
import { AgentPluginView } from "./PluginAgentViews";
import {
  PluginBatchTagDialog,
  PluginCard,
  PluginListRow,
} from "./PluginLibraryViews";
import {
  PluginSourcePreviewModal,
  PluginStoreCatalog,
  PluginStoreDetailModal,
} from "./PluginStoreViews";
import { hasFileItems } from "./plugin-manager-utils";
import { PluginImportDialogs } from "./PluginImportDialogs";
import type { PluginManagerViewModel } from "./usePluginManagerController";

interface PluginManagerViewProps {
  model: PluginManagerViewModel;
}

export function PluginManagerView({ model }: PluginManagerViewProps) {
  const {
    t,
    contentScrollRef,
    installingId,
    previewingId,
    detailMarketEntry,
    setDetailMarketEntry,
    setDetailLibraryPlugin,
    isBatchMode,
    selectedMarketEntryIds,
    selectedLibraryPluginIds,
    batchDeleteConfirmOpen,
    setBatchDeleteConfirmOpen,
    batchMarketRemoveConfirmOpen,
    setBatchMarketRemoveConfirmOpen,
    batchMarketUpdateConfirmOpen,
    setBatchMarketUpdateConfirmOpen,
    batchTagDialogOpen,
    setBatchTagDialogOpen,
    isBatchInstalling,
    isBatchUpdating,
    isBatchRemovingMarket,
    deleteTarget,
    setDeleteTarget,
    removeDistributedOnDelete,
    setRemoveDistributedOnDelete,
    removeDistributedOnBatchDelete,
    setRemoveDistributedOnBatchDelete,
    agentTargetPicker,
    setAgentTargetPicker,
    initialAgentPluginTargetId,
    isLoading,
    setInitialAgentPluginTargetId,
    importingTargetPluginId,
    isDropTargetActive,
    setIsDropTargetActive,
    isImportingChildMcp,
    isScanningChildSkills,
    isDeleting,
    removingLibraryPluginId,
    editingCustomSourceId,
    setEditingCustomSourceId,
    setPendingDeleteCustomSourceId,
    sourceType,
    setSourceType,
    sourceName,
    setSourceName,
    sourceUrl,
    setSourceUrl,
    sourceBranch,
    setSourceBranch,
    sourceDirectory,
    setSourceDirectory,
    marketPreviews,
    sourceUpdateChecks,
    customStoreSources,
    targetMatrix,
    selectedTab,
    selectedMarketSourceId,
    libraryViewMode,
    libraryGalleryColumns,
    error,
    load,
    setSelectedTab,
    setSelectedMarketSourceId,
    setLibraryViewMode,
    setLibraryGalleryColumns,
    toggleCustomStoreSource,
    setPluginPageSize,
    pageSize,
    contextMenu,
    setContextMenu,
    selectedCustomSource,
    pendingDeleteCustomSource,
    customSourceTypeOptions,
    handleAddCustomSource,
    handleUpdateCustomSource,
    handleConfirmDeleteCustomSource,
    installedPlugins,
    libraryFilter,
    setLibraryFilter,
    librarySourceFilter,
    setLibrarySourceFilter,
    libraryGalleryColumnOptions,
    libraryGalleryGridStyle,
    selectedLibraryDetailPlugin,
    installedIds,
    libraryFilterOptions,
    hasActiveLibrarySourceFilter,
    activeLibrarySourceFilter,
    librarySourceOptions,
    filteredLibraryPlugins,
    libraryTotalPages,
    visiblePlugins,
    libraryVisiblePageNumbers,
    currentLibraryPage,
    setCurrentLibraryPage,
    visibleMarketEntries,
    installedMarketEntries,
    availableMarketEntries,
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
    currentViewTitle,
    currentViewHint,
    currentViewCountLabel,
    shouldShowInitialLoading,
    tabs,
    handleInstall,
    handleDropImport,
    handleImportTargetPlugin,
    handleOpenMarketDetail,
    handleToggleMarketSelection,
    handleToggleLibrarySelection,
    handleLibraryContextMenu,
    goToLibraryPage,
    handleToggleBatchMode,
    handleSelectVisibleEntries,
    handleClearBatchSelection,
    handleBatchInstall,
    handleBatchUpdateMarketPlugins,
    handleBatchRemoveMarketPlugins,
    handleBatchDelete,
    handleCopyCodexLink,
    handleOpenLibraryAgentTargets,
    handleOpenBatchLibraryAgentTargets,
    handleOpenBatchTagDialog,
    handleBatchFavorite,
    handleBatchTagSubmit,
    handleDistributePlugin,
    handleRemovePluginDistribution,
    handleOpenLibraryFolder,
    handleToggleFavorite,
    handleImportChildSkills,
    handleImportChildMcp,
    handleDelete,
    childSkillImportModal,
    contextMenuItems,
  } = model;

  if (selectedTab === "library" && selectedLibraryDetailPlugin) {
    return (
      <>
        <SkillRenderBoundary
          resetKey={selectedLibraryDetailPlugin.id}
          title={t(
            "plugin.detailRenderError",
            "This plugin cannot be opened right now",
          )}
          description={t(
            "plugin.detailRenderErrorHint",
            "This render error was contained so the page stays usable. You can go back to the list or retry loading the detail view now.",
          )}
          primaryActionLabel={t("common.back", "Back")}
          onPrimaryAction={() => setDetailLibraryPlugin(null)}
          secondaryActionLabel={t("common.retry", "Retry")}
          onSecondaryAction={() => {
            void load({ force: true });
          }}
        >
          <PluginFullDetailPage
            isImportingChildMcp={isImportingChildMcp}
            isImportingChildSkills={isScanningChildSkills}
            plugin={selectedLibraryDetailPlugin}
            targetMatrix={targetMatrix}
            onBack={() => setDetailLibraryPlugin(null)}
            onDelete={(plugin) => setDeleteTarget(plugin)}
            onDistribute={(targetIds, mode) =>
              handleDistributePlugin(
                selectedLibraryDetailPlugin,
                targetIds,
                mode,
              )
            }
            onRemoveDistribution={(target) =>
              handleRemovePluginDistribution(
                selectedLibraryDetailPlugin,
                target,
              )
            }
            onToggleFavorite={(plugin) => void handleToggleFavorite(plugin)}
            onImportChildMcp={(plugin) => void handleImportChildMcp(plugin)}
            onImportChildSkills={(plugin) =>
              void handleImportChildSkills(plugin)
            }
            onOpenStore={() => {
              setDetailLibraryPlugin(null);
              setSelectedTab("market");
            }}
          />
        </SkillRenderBoundary>
        <ConfirmDialog
          isOpen={Boolean(deleteTarget)}
          onClose={() => {
            if (!isDeleting) {
              setDeleteTarget(null);
              setRemoveDistributedOnDelete(false);
            }
          }}
          onConfirm={handleDelete}
          title={t("plugin.deleteConfirmTitle", "Delete plugin")}
          message={
            <div className="space-y-3 text-left">
              <p className="text-center">
                {t("plugin.deleteConfirmMessage", {
                  defaultValue: "Delete {{name}} from My Plugins?",
                  name: deleteTarget?.displayName ?? "",
                })}
              </p>
              {deleteTargetDistributedTargetCount > 0 ? (
                <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-left">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-border text-primary"
                    checked={removeDistributedOnDelete}
                    onChange={(event) =>
                      setRemoveDistributedOnDelete(event.currentTarget.checked)
                    }
                  />
                  <span>
                    <span className="block text-sm font-medium text-foreground">
                      {t("plugin.deleteDistributedTargetsLabel", {
                        defaultValue:
                          "Also remove distributed Agent Plugin packages ({{count}})",
                        count: deleteTargetDistributedTargetCount,
                      })}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t("plugin.deleteDistributedTargetsHelp", {
                        defaultValue:
                          "Only Agent Plugin package copies/symlinks are removed. Imported child assets stay untouched.",
                      })}
                    </span>
                  </span>
                </label>
              ) : null}
            </div>
          }
          confirmText={t("common.delete", "Delete")}
          cancelText={t("common.cancel", "Cancel")}
          variant="destructive"
          isLoading={isDeleting}
        />
        <PluginAgentTargetPicker
          isOpen={Boolean(agentTargetPicker)}
          onClose={() => setAgentTargetPicker(null)}
          onDistribute={handleDistributePlugin}
          plugin={agentTargetPicker?.plugins[0] ?? null}
          plugins={agentTargetPicker?.plugins ?? []}
          targetMatrix={targetMatrix}
          initialTargetIds={agentTargetPicker?.targetIds ?? []}
        />
        {childSkillImportModal}
      </>
    );
  }

  if (selectedTab === "targets") {
    return (
      <>
        <AgentPluginView
          initialSelectedTargetId={initialAgentPluginTargetId}
          targets={targetMatrix}
          installedPlugins={installedPlugins}
          isLoading={isLoading}
          importingTargetPluginId={importingTargetPluginId}
          removingLibraryPluginId={removingLibraryPluginId}
          onRefresh={() => void load({ force: true })}
          onDistributeLibraryPlugin={(plugin, target) =>
            setAgentTargetPicker({ plugins: [plugin], targetIds: [target.id] })
          }
          onRemoveLibraryPlugin={(plugin, target) =>
            void handleRemovePluginDistribution(plugin, target)
          }
          onImportTargetPlugin={(target, plugin) =>
            void handleImportTargetPlugin(target, plugin)
          }
          onOpenLibraryPlugin={(plugin) => {
            setDetailLibraryPlugin(plugin);
            setSelectedTab("library");
          }}
          onOpenStore={() => {
            setInitialAgentPluginTargetId(null);
            setSelectedTab("market");
          }}
        />
        <PluginAgentTargetPicker
          isOpen={Boolean(agentTargetPicker)}
          onClose={() => setAgentTargetPicker(null)}
          onDistribute={handleDistributePlugin}
          plugin={agentTargetPicker?.plugins[0] ?? null}
          plugins={agentTargetPicker?.plugins ?? []}
          targetMatrix={targetMatrix}
          initialTargetIds={agentTargetPicker?.targetIds ?? []}
        />
        {childSkillImportModal}
      </>
    );
  }

  return (
    <div
      data-testid="plugin-manager-shell"
      className="relative flex h-full min-h-0 flex-col overflow-hidden app-wallpaper-section"
      onDragEnter={(event) => {
        if (selectedTab !== "library" || !hasFileItems(event.dataTransfer)) {
          return;
        }

        event.preventDefault();
        setIsDropTargetActive(true);
      }}
      onDragOver={(event) => {
        if (selectedTab !== "library" || !hasFileItems(event.dataTransfer)) {
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
        if (selectedTab !== "library" || !hasFileItems(event.dataTransfer)) {
          return;
        }

        event.preventDefault();
        setIsDropTargetActive(false);
        void handleDropImport(event.dataTransfer.files);
      }}
    >
      <header className="shrink-0 border-b border-border app-wallpaper-panel-strong px-4 py-4 z-10 sm:px-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  {selectedTab === "library" ? (
                    <PackageIcon className="h-5 w-5 text-primary" />
                  ) : (
                    <StoreIcon className="h-5 w-5 text-primary" />
                  )}
                  <h1 className="text-lg font-semibold text-foreground">
                    {currentViewTitle}
                  </h1>
                </div>
                <span className="inline-flex items-center rounded-full border border-white/5 bg-accent/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  {currentViewCountLabel}
                </span>
                {selectedTab === "library" &&
                filteredLibraryPlugins.length > 0 &&
                libraryTotalPages > 1 ? (
                  <span className="text-[11px] text-muted-foreground">
                    {t("plugin.paginationSummary", {
                      start: (currentLibraryPage - 1) * pageSize + 1,
                      end: Math.min(
                        currentLibraryPage * pageSize,
                        filteredLibraryPlugins.length,
                      ),
                      total: filteredLibraryPlugins.length,
                      defaultValue: `${(currentLibraryPage - 1) * pageSize + 1}-${Math.min(
                        currentLibraryPage * pageSize,
                        filteredLibraryPlugins.length,
                      )} / ${filteredLibraryPlugins.length}`,
                    })}
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {currentViewHint}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2 self-start lg:self-center lg:justify-end">
              {selectedTab === "market" ? (
                <button
                  type="button"
                  onClick={handleToggleBatchMode}
                  aria-pressed={isBatchMode}
                  aria-label={t("plugin.batchManage", "Batch manage plugins")}
                  title={t("plugin.batchManage", "Batch manage plugins")}
                  className={`rounded-lg p-2 transition-colors ${
                    isBatchMode
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <ListChecksIcon aria-hidden="true" className="h-4 w-4" />
                </button>
              ) : null}
              {selectedTab === "library" ? (
                <ResourceLibraryControls
                  columnsLabel={t("plugin.galleryColumnsLabel")}
                  viewMode={libraryViewMode}
                  onViewModeChange={setLibraryViewMode}
                  columns={libraryGalleryColumns ?? "auto"}
                  columnOptions={libraryGalleryColumnOptions}
                  onColumnsChange={(value) => {
                    if (isResourceGalleryColumns(value))
                      setLibraryGalleryColumns(value);
                  }}
                />
              ) : null}
              <button
                type="button"
                onClick={() => void load({ force: true })}
                disabled={isLoading}
                aria-label={t("common.refresh", "Refresh")}
                title={t("common.refresh", "Refresh")}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                <RefreshCwIcon
                  aria-hidden="true"
                  className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </div>

          {selectedTab === "library" ? (
            <div
              data-testid="plugin-library-filter-bar"
              className="flex flex-wrap items-center gap-2"
            >
              {libraryFilterOptions.map((option) => {
                const isActive = libraryFilter === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setLibraryFilter(option.value)}
                    aria-label={option.label}
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
                ariaLabel={t("plugin.sourceFilterLabel", "Plugin source")}
                value={activeLibrarySourceFilter}
                onChange={(value) => setLibrarySourceFilter(value)}
                options={librarySourceOptions}
                className="min-w-[13rem] flex-1 sm:flex-none"
                triggerClassName={`h-9 w-full rounded-xl border px-3 text-sm font-medium shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 flex items-center justify-between gap-2 ${
                  hasActiveLibrarySourceFilter
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border app-wallpaper-surface text-muted-foreground hover:border-primary/25 hover:bg-accent hover:text-foreground"
                }`}
              />
            </div>
          ) : null}
        </div>
      </header>

      {selectedTab === "library" && (
        <ResourceDistributionNotice
          unknown={model.libraryFilterCounts.unknown}
          error={model.distributionError}
          onRefresh={() => void model.refreshDistributionStatus()}
        />
      )}
      <main
        ref={contentScrollRef}
        className="min-h-0 flex-1 overflow-y-auto p-6"
      >
        {error ? (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        ) : null}

        {shouldShowInitialLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : selectedTab === "library" ? (
          <div className="space-y-4">
            {visiblePlugins.length > 0 ? (
              libraryViewMode === "list" ? (
                <div
                  data-testid="plugin-library-list"
                  className="flex flex-col gap-3"
                >
                  {visiblePlugins.map((plugin) => (
                    <PluginListRow
                      key={plugin.id}
                      batchMode={isBatchMode}
                      isSelected={selectedLibraryPluginIds.has(plugin.id)}
                      plugin={plugin}
                      sourceUpdateStatus={sourceUpdateChecks[plugin.id]?.status}
                      distributionKnown={
                        observedDistributionPresence(
                          model.distributionSnapshot[plugin.id],
                        ) !== "unknown"
                      }
                      targetMatrix={targetMatrix}
                      onDelete={setDeleteTarget}
                      onContextMenu={handleLibraryContextMenu}
                      onOpenAgentTargets={handleOpenLibraryAgentTargets}
                      onOpenDetail={setDetailLibraryPlugin}
                      onOpenFolder={handleOpenLibraryFolder}
                      onToggleFavorite={(plugin) =>
                        void handleToggleFavorite(plugin)
                      }
                      onToggleSelection={handleToggleLibrarySelection}
                    />
                  ))}
                </div>
              ) : (
                <div
                  data-testid="plugin-library-grid"
                  className="grid gap-6"
                  style={libraryGalleryGridStyle}
                >
                  {visiblePlugins.map((plugin) => (
                    <PluginCard
                      key={plugin.id}
                      batchMode={isBatchMode}
                      isSelected={selectedLibraryPluginIds.has(plugin.id)}
                      plugin={plugin}
                      sourceUpdateStatus={sourceUpdateChecks[plugin.id]?.status}
                      distributionKnown={
                        observedDistributionPresence(
                          model.distributionSnapshot[plugin.id],
                        ) !== "unknown"
                      }
                      targetMatrix={targetMatrix}
                      onDelete={setDeleteTarget}
                      onContextMenu={handleLibraryContextMenu}
                      onOpenAgentTargets={handleOpenLibraryAgentTargets}
                      onOpenDetail={setDetailLibraryPlugin}
                      onOpenFolder={handleOpenLibraryFolder}
                      onToggleFavorite={(plugin) =>
                        void handleToggleFavorite(plugin)
                      }
                      onToggleSelection={handleToggleLibrarySelection}
                    />
                  ))}
                </div>
              )
            ) : (
              <div className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-6 text-center">
                <PackageIcon className="h-10 w-10 text-muted-foreground/50" />
                <h2 className="mt-3 text-base font-semibold text-foreground">
                  {t("plugin.emptyLibraryTitle", "No plugins installed")}
                </h2>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  {t(
                    "plugin.emptyLibraryDesc",
                    "Install complete plugin bundles from the store, then decide which child assets go to each agent.",
                  )}
                </p>
              </div>
            )}
          </div>
        ) : selectedTab === "market" &&
          selectedMarketSourceId === "new-custom" ? (
          <SkillStoreSourceForm
            directoryPlaceholder={t("plugin.marketplaceFilePlaceholder")}
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
        ) : selectedTab === "market" ? (
          <div className="space-y-8">
            {selectedCustomSource ? (
              <div className="flex justify-end">
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
            {visibleMarketEntries.length > 0 ? (
              <PluginStoreCatalog
                availableEntries={availableMarketEntries}
                batchMode={isBatchMode}
                installedEntries={installedMarketEntries}
                marketPreviews={marketPreviews}
                onOpenDetail={handleOpenMarketDetail}
                onToggleSelection={handleToggleMarketSelection}
                scrollRef={contentScrollRef}
                selectedEntryIds={selectedMarketEntryIds}
              />
            ) : (
              <div className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-6 text-center">
                <StoreIcon className="h-10 w-10 text-muted-foreground/50" />
                <h2 className="mt-3 text-base font-semibold text-foreground">
                  {t("plugin.emptyMarketTitle", "No store entries")}
                </h2>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  {t(
                    "plugin.emptyMarketDesc",
                    "Check the network connection or refresh the plugin store sources.",
                  )}
                </p>
              </div>
            )}
          </div>
        ) : null}
      </main>

      {selectedTab === "library" && (
        <ResourceLibraryPagination
          total={filteredLibraryPlugins.length}
          currentPage={currentLibraryPage}
          pageSize={pageSize}
          onPageChange={goToLibraryPage}
          onPageSizeChange={(size) => {
            setPluginPageSize(size);
            setCurrentLibraryPage(1);
          }}
        />
      )}

      {isBatchMode && (
        <div className="shrink-0 border-t border-border app-wallpaper-panel-strong px-6 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full border border-border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground">
              {t("skill.selectedCount", "{{count}} selected", {
                count: selectedCount,
              })}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSelectVisibleEntries}
                disabled={
                  selectedTab === "library"
                    ? visibleLibraryPluginIds.length === 0
                    : visibleMarketEntryIds.length === 0
                }
                className={`rounded-lg p-2 transition-colors disabled:opacity-40 ${
                  selectedTab === "library"
                    ? areVisibleLibraryPluginsSelected
                      ? "bg-primary/10 text-primary hover:bg-primary/15"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    : areVisibleMarketEntriesSelected
                      ? "bg-primary/10 text-primary hover:bg-primary/15"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
                aria-label={t(
                  "plugin.selectVisiblePlugins",
                  "Select visible plugins",
                )}
                title={t(
                  "plugin.selectVisiblePlugins",
                  "Select visible plugins",
                )}
              >
                <CheckSquareIcon aria-hidden="true" className="h-4 w-4" />
              </button>

              {selectedTab === "market" ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleBatchInstall()}
                    disabled={
                      isBatchInstalling || selectedInstallEntries.length === 0
                    }
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                    aria-label={t(
                      "plugin.batchInstallSelected",
                      "Install selected",
                    )}
                    title={t("plugin.batchInstallSelected", "Install selected")}
                  >
                    {isBatchInstalling ? (
                      <Loader2Icon
                        aria-hidden="true"
                        className="h-4 w-4 animate-spin"
                      />
                    ) : (
                      <PackagePlusIcon aria-hidden="true" className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchMarketUpdateConfirmOpen(true)}
                    disabled={
                      isBatchUpdating ||
                      selectedInstalledMarketPlugins.length === 0
                    }
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                    aria-label={t(
                      "plugin.batchUpdateSelected",
                      "Update selected",
                    )}
                    title={t("plugin.batchUpdateSelected", "Update selected")}
                  >
                    {isBatchUpdating ? (
                      <Loader2Icon
                        aria-hidden="true"
                        className="h-4 w-4 animate-spin"
                      />
                    ) : (
                      <RefreshCwIcon aria-hidden="true" className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchMarketRemoveConfirmOpen(true)}
                    disabled={
                      isBatchRemovingMarket ||
                      selectedInstalledMarketPlugins.length === 0
                    }
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                    aria-label={t(
                      "plugin.batchRemoveSelected",
                      "Remove selected",
                    )}
                    title={t("plugin.batchRemoveSelected", "Remove selected")}
                  >
                    {isBatchRemovingMarket ? (
                      <Loader2Icon
                        aria-hidden="true"
                        className="h-4 w-4 animate-spin"
                      />
                    ) : (
                      <TrashIcon aria-hidden="true" className="h-4 w-4" />
                    )}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void handleBatchFavorite()}
                    disabled={selectedLibraryPlugins.length === 0}
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                    aria-label={
                      selectedLibraryPluginsAllFavorite
                        ? t("plugin.removeFavorite", "Remove Favorite")
                        : t("plugin.addFavorite", "Add Favorite")
                    }
                    title={
                      selectedLibraryPluginsAllFavorite
                        ? t("plugin.removeFavorite", "Remove Favorite")
                        : t("plugin.addFavorite", "Add Favorite")
                    }
                  >
                    <StarIcon aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenBatchTagDialog}
                    disabled={selectedLibraryPlugins.length === 0}
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                    aria-label={t("plugin.batchTags", "Batch Tags")}
                    title={t("plugin.batchTags", "Batch Tags")}
                  >
                    <TagsIcon aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenBatchLibraryAgentTargets}
                    disabled={selectedLibraryPlugins.length === 0}
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                    aria-label={t(
                      "plugin.batchDistributeSelected",
                      "Distribute selected",
                    )}
                    title={t(
                      "plugin.batchDistributeSelected",
                      "Distribute selected",
                    )}
                  >
                    <SendIcon aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchDeleteConfirmOpen(true)}
                    disabled={isDeleting || selectedLibraryPlugins.length === 0}
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                    aria-label={t(
                      "plugin.batchDeleteSelected",
                      "Delete selected plugins",
                    )}
                    title={t(
                      "plugin.batchDeleteSelected",
                      "Delete selected plugins",
                    )}
                  >
                    <TrashIcon aria-hidden="true" className="h-4 w-4" />
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={handleClearBatchSelection}
                disabled={selectedCount === 0}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                aria-label={t("common.deselectAll", "Deselect All")}
                title={t("common.deselectAll", "Deselect All")}
              >
                <XIcon aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => {
          if (!isDeleting) {
            setDeleteTarget(null);
            setRemoveDistributedOnDelete(false);
          }
        }}
        onConfirm={handleDelete}
        title={t("plugin.deleteConfirmTitle", "Delete plugin")}
        message={
          <div className="space-y-3 text-left">
            <p className="text-center">
              {t("plugin.deleteConfirmMessage", {
                defaultValue: "Delete {{name}} from My Plugins?",
                name: deleteTarget?.displayName ?? "",
              })}
            </p>
            {deleteTargetDistributedTargetCount > 0 ? (
              <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-left">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-border text-primary"
                  checked={removeDistributedOnDelete}
                  onChange={(event) =>
                    setRemoveDistributedOnDelete(event.currentTarget.checked)
                  }
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">
                    {t("plugin.deleteDistributedTargetsLabel", {
                      defaultValue:
                        "Also remove distributed Agent Plugin packages ({{count}})",
                      count: deleteTargetDistributedTargetCount,
                    })}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {t("plugin.deleteDistributedTargetsHelp", {
                      defaultValue:
                        "Only Agent Plugin package copies/symlinks are removed. Imported child assets stay untouched.",
                    })}
                  </span>
                </span>
              </label>
            ) : null}
          </div>
        }
        confirmText={t("common.delete", "Delete")}
        cancelText={t("common.cancel", "Cancel")}
        variant="destructive"
        isLoading={isDeleting}
      />
      <ConfirmDialog
        isOpen={batchMarketUpdateConfirmOpen}
        onClose={() => {
          if (!isBatchUpdating) {
            setBatchMarketUpdateConfirmOpen(false);
          }
        }}
        onConfirm={() => void handleBatchUpdateMarketPlugins()}
        title={t(
          "plugin.batchStoreUpdateTitle",
          "Update selected store Plugins",
        )}
        message={t("plugin.batchStoreUpdateMessage", {
          defaultValue:
            "Check and update {{count}} selected installed Plugins from their sources?",
          count: selectedInstalledMarketPlugins.length,
        })}
        confirmText={t("plugin.batchUpdateSelected", "Update selected")}
        cancelText={t("common.cancel", "Cancel")}
        isLoading={isBatchUpdating}
      />
      <ConfirmDialog
        isOpen={batchMarketRemoveConfirmOpen}
        onClose={() => {
          if (!isBatchRemovingMarket) {
            setBatchMarketRemoveConfirmOpen(false);
          }
        }}
        onConfirm={() => void handleBatchRemoveMarketPlugins()}
        title={t(
          "plugin.batchStoreRemoveTitle",
          "Remove selected store Plugins",
        )}
        message={t("plugin.batchStoreRemoveMessage", {
          defaultValue:
            "Remove {{count}} selected installed Plugins from My Plugins?",
          count: selectedInstalledMarketPlugins.length,
        })}
        confirmText={t("plugin.batchRemoveSelected", "Remove selected")}
        cancelText={t("common.cancel", "Cancel")}
        variant="destructive"
        isLoading={isBatchRemovingMarket}
      />
      <ConfirmDialog
        isOpen={batchDeleteConfirmOpen}
        onClose={() => {
          if (!isDeleting) {
            setBatchDeleteConfirmOpen(false);
            setRemoveDistributedOnBatchDelete(false);
          }
        }}
        onConfirm={() => void handleBatchDelete()}
        title={t("plugin.batchDeleteTitle", "Delete selected plugins")}
        message={
          <div className="space-y-3 text-left">
            <p className="text-center">
              {t("plugin.batchDeleteMessage", {
                defaultValue:
                  "Delete {{count}} selected Plugins from My Plugins?",
                count: selectedLibraryPlugins.length,
              })}
            </p>
            {selectedLibraryDistributedTargetCount > 0 ? (
              <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-left">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-border text-primary"
                  checked={removeDistributedOnBatchDelete}
                  onChange={(event) =>
                    setRemoveDistributedOnBatchDelete(
                      event.currentTarget.checked,
                    )
                  }
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">
                    {t("plugin.deleteDistributedTargetsLabel", {
                      defaultValue:
                        "Also remove distributed Agent Plugin packages ({{count}})",
                      count: selectedLibraryDistributedTargetCount,
                    })}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {t("plugin.deleteDistributedTargetsHelp", {
                      defaultValue:
                        "Only Agent Plugin package copies/symlinks are removed. Imported child assets stay untouched.",
                    })}
                  </span>
                </span>
              </label>
            ) : null}
          </div>
        }
        confirmText={t("plugin.batchDeleteSelected", "Delete selected plugins")}
        cancelText={t("common.cancel", "Cancel")}
        variant="destructive"
        isLoading={isDeleting}
      />
      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
      <SkillStoreSourceEditModal
        directoryPlaceholder={t("plugin.marketplaceFilePlaceholder")}
        isOpen={editingCustomSourceId !== null}
        onClose={() => setEditingCustomSourceId(null)}
        onDelete={setPendingDeleteCustomSourceId}
        onSave={handleUpdateCustomSource}
        onToggleEnabled={toggleCustomStoreSource}
        onRefresh={() => void load({ force: true })}
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
      <PluginStoreDetailModal
        entry={detailMarketEntry}
        installed={
          detailMarketEntry ? installedIds.has(detailMarketEntry.id) : false
        }
        installing={
          detailMarketEntry ? installingId === detailMarketEntry.id : false
        }
        preview={
          detailMarketEntry ? marketPreviews[detailMarketEntry.id] : undefined
        }
        previewing={
          detailMarketEntry ? previewingId === detailMarketEntry.id : false
        }
        onClose={() => setDetailMarketEntry(null)}
        onCopyCodexLink={handleCopyCodexLink}
        onInstall={handleInstall}
      />
      <PluginImportDialogs model={model} />
      <PluginAgentTargetPicker
        isOpen={Boolean(agentTargetPicker)}
        onClose={() => setAgentTargetPicker(null)}
        onDistribute={handleDistributePlugin}
        plugin={agentTargetPicker?.plugins[0] ?? null}
        plugins={agentTargetPicker?.plugins ?? []}
        targetMatrix={targetMatrix}
        initialTargetIds={agentTargetPicker?.targetIds ?? []}
      />
      {batchTagDialogOpen ? (
        <PluginBatchTagDialog
          onClose={() => setBatchTagDialogOpen(false)}
          onSubmit={handleBatchTagSubmit}
          plugins={selectedLibraryPlugins}
        />
      ) : null}
      {childSkillImportModal}
      {isDropTargetActive ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="mx-6 w-full max-w-2xl rounded-3xl border border-primary/30 bg-background/95 px-8 py-10 shadow-2xl">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/25">
                <InboxIcon aria-hidden="true" className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <div className="text-lg font-semibold text-foreground">
                  {t("plugin.dropImportTitle", "Drop Plugins to import")}
                </div>
                <div className="text-sm leading-6 text-muted-foreground">
                  {t(
                    "plugin.dropImportDesc",
                    "Drop a local Plugin package folder here to import it into My Plugins.",
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
