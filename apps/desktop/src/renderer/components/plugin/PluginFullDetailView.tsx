import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  CheckIcon,
  CodeIcon,
  FolderOpenIcon,
  HistoryIcon,
  InfoIcon,
  Loader2Icon,
  RefreshCwIcon,
  SaveIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  ShieldIcon,
  StarIcon,
  TrashIcon,
} from "lucide-react";
import { PlatformIcon } from "../ui/PlatformIcon";
import { UnsavedChangesDialog } from "../ui/UnsavedChangesDialog";
import { Modal, Textarea } from "../ui";
import { getSkillSafetyLevelLabel } from "../skill/safety-i18n";
import { PluginVersionHistoryModal } from "./PluginVersionHistoryModal";
import { AgentPluginDetailActions } from "./AgentPluginDetailActions";
import {
  DetailTabButton,
  PluginDetailAvatar,
  getPluginTargetPlatformId,
} from "./plugin-detail-utils";
import {
  PluginFilesPanel,
  PluginOverview,
  PluginSourcePanel,
} from "./PluginDetailContent";
import {
  PluginPackageHealthPanel,
  PluginSafetyAssessmentPanel,
  SourceUpdateDiffRow,
  formatPluginInventorySummary,
} from "./PluginDetailDiagnostics";
import type { PluginFullDetailViewModel } from "./usePluginFullDetailController";

export function PluginFullDetailView({
  model,
}: {
  model: PluginFullDetailViewModel;
}) {
  const {
    t,
    agentActions,
    agentContext,
    isImportingChildMcp,
    isImportingChildSkills,
    plugin,
    targetMatrix,
    onBack,
    onDelete,
    onDistribute,
    onRemoveDistribution,
    onToggleFavorite,
    onImportChildMcp,
    onImportChildSkills,
    isAgentDetail,
    activeTab,
    setActiveTab,
    fileEditorHasUnsavedChanges,
    setFileEditorHasUnsavedChanges,
    isUnsavedDialogOpen,
    setIsUnsavedDialogOpen,
    pendingUnsavedAction,
    setPendingUnsavedAction,
    localPackagePath,
    sourceUpdateCheck,
    isCheckingUpdate,
    isUpdatingFromSource,
    isCheckingPackage,
    isScanningSafety,
    showBackToTop,
    contentScrollRef,
    draftUserNotes,
    setDraftUserNotes,
    isEditingUserNotes,
    setIsEditingUserNotes,
    isSavingUserNotes,
    isVersionHistoryOpen,
    setIsVersionHistoryOpen,
    isSnapshotModalOpen,
    setIsSnapshotModalOpen,
    isSafetyReportModalOpen,
    setIsSafetyReportModalOpen,
    isPackageCheckModalOpen,
    setIsPackageCheckModalOpen,
    pendingSourceUpdateMode,
    setPendingSourceUpdateMode,
    snapshotNote,
    setSnapshotNote,
    isCreatingSnapshot,
    translatedDescription,
    showTranslatedDescription,
    isTranslatingDescription,
    descriptionSourceText,
    requestLeaveFileEditing,
    sourceUpdateLabel,
    sourceUpdateTone,
    canUpdateFromSource,
    canOverwriteSourceUpdate,
    safetyTone,
    safetyPillLabel,
    packageHealthCheck,
    packageHealthLabel,
    packageHealthTone,
    reviewSourceUpdate,
    confirmPendingSourceUpdate,
    openSafetyAssessment,
    openPackageCheck,
    copyPluginTitle,
    translatePluginDescription,
    openSnapshotModal,
    handleCreateSnapshot,
    saveUserNotes,
    cancelUserNotes,
    handleContentScroll,
    scrollToTop,
    runPackageCheck,
    runSafetyAssessment,
  } = model;

  return (
    <div
      data-testid="plugin-full-detail-page"
      className="relative flex h-full min-h-0 flex-col overflow-hidden app-wallpaper-section"
    >
      <header className="shrink-0 border-b border-border app-wallpaper-panel-strong px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <button
              type="button"
              onClick={() => requestLeaveFileEditing(onBack)}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={t("common.back", "Back")}
              title={t("common.back", "Back")}
            >
              <ArrowLeftIcon aria-hidden="true" className="h-5 w-5" />
            </button>
            <PluginDetailAvatar plugin={plugin} />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold text-foreground">
                <button
                  type="button"
                  onClick={() => void copyPluginTitle()}
                  className="block max-w-full cursor-default truncate rounded-md text-left transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  title={t("plugin.copyTitle", {
                    defaultValue: "Copy title: {{name}}",
                    name: plugin.displayName,
                  })}
                  aria-label={t("plugin.copyTitle", {
                    defaultValue: "Copy title: {{name}}",
                    name: plugin.displayName,
                  })}
                >
                  {plugin.displayName}
                </button>
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-600 dark:text-emerald-300">
                  {isAgentDetail
                    ? t("plugin.inAgentPluginTarget", "Installed in Agent")
                    : t("plugin.installed", "Installed")}
                </span>
                {plugin.version ? (
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
                    v{plugin.version}
                  </span>
                ) : null}
                {agentContext ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 font-medium text-muted-foreground">
                    <span aria-hidden="true">
                      <PlatformIcon
                        platformId={getPluginTargetPlatformId(
                          agentContext.platformId,
                        )}
                        size={14}
                      />
                    </span>
                    {agentContext.platformName}
                  </span>
                ) : null}
                {plugin.category ? (
                  <span className="rounded-full bg-muted px-2.5 py-1 font-medium">
                    {plugin.category}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isAgentDetail && agentContext ? (
              <AgentPluginDetailActions
                isImporting={agentActions?.isImporting}
                isManaged={agentContext.isManaged}
                onImport={agentActions?.onImport}
                onOpenFolder={agentActions?.onOpenFolder}
                onOpenManagedPlugin={agentActions?.onOpenManagedPlugin}
                t={t}
              />
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void reviewSourceUpdate(false)}
                  disabled={isCheckingUpdate || isUpdatingFromSource}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-all disabled:opacity-50 ${sourceUpdateTone}`}
                  aria-label={sourceUpdateLabel}
                  title={sourceUpdateLabel}
                >
                  {isCheckingUpdate || isUpdatingFromSource ? (
                    <Loader2Icon
                      aria-hidden="true"
                      className="h-4 w-4 animate-spin"
                    />
                  ) : canUpdateFromSource ? (
                    <RefreshCwIcon aria-hidden="true" className="h-4 w-4" />
                  ) : sourceUpdateCheck?.status === "conflict" ||
                    sourceUpdateCheck?.status === "local-modified" ? (
                    <AlertTriangleIcon aria-hidden="true" className="h-4 w-4" />
                  ) : (
                    <CheckCircleIcon aria-hidden="true" className="h-4 w-4" />
                  )}
                  {isUpdatingFromSource
                    ? t("plugin.updatingFromSource", "Updating")
                    : sourceUpdateLabel}
                </button>
                {canOverwriteSourceUpdate ? (
                  <button
                    type="button"
                    onClick={() => void reviewSourceUpdate(true)}
                    disabled={isUpdatingFromSource}
                    className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600 transition-all hover:bg-red-500/15 disabled:opacity-50 dark:text-red-300"
                    aria-label={t(
                      "plugin.overwriteFromSource",
                      "Overwrite from source",
                    )}
                    title={t(
                      "plugin.overwriteFromSource",
                      "Overwrite from source",
                    )}
                  >
                    {isUpdatingFromSource ? (
                      <Loader2Icon
                        aria-hidden="true"
                        className="h-4 w-4 animate-spin"
                      />
                    ) : (
                      <AlertTriangleIcon
                        aria-hidden="true"
                        className="h-4 w-4"
                      />
                    )}
                    {t("plugin.overwriteFromSource", "Overwrite from source")}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={openSnapshotModal}
                  disabled={isCreatingSnapshot}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:opacity-50"
                  aria-label={t("plugin.createSnapshot", "Create Snapshot")}
                  title={t("plugin.createSnapshot", "Create Snapshot")}
                >
                  {isCreatingSnapshot ? (
                    <Loader2Icon
                      aria-hidden="true"
                      className="h-4 w-4 animate-spin"
                    />
                  ) : (
                    <SaveIcon aria-hidden="true" className="h-4 w-4" />
                  )}
                  {t("plugin.snapshot", "Snapshot")}
                </button>
                <button
                  type="button"
                  onClick={() => void onToggleFavorite?.(plugin)}
                  className={`rounded-full p-2.5 transition-all active:scale-press-in ${
                    plugin.isFavorite
                      ? "text-amber-500 hover:text-amber-600"
                      : "text-muted-foreground hover:bg-amber-500/10 hover:text-amber-500"
                  }`}
                  aria-label={
                    plugin.isFavorite
                      ? t("plugin.removeFromFavorites", {
                          defaultValue: "Remove {{name}} from favorites",
                          name: plugin.displayName,
                        })
                      : t("plugin.addToFavorites", {
                          defaultValue: "Add {{name}} to favorites",
                          name: plugin.displayName,
                        })
                  }
                  title={
                    plugin.isFavorite
                      ? t("plugin.removeFavorite", "Remove Favorite")
                      : t("plugin.addFavorite", "Add Favorite")
                  }
                >
                  <StarIcon
                    aria-hidden="true"
                    className={`h-4 w-4 ${plugin.isFavorite ? "fill-current" : ""}`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setIsVersionHistoryOpen(true)}
                  className="rounded-full p-2.5 text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary active:scale-press-in"
                  aria-label={t("plugin.versionHistory", "Version History")}
                  title={t("plugin.versionHistory", "Version History")}
                >
                  <HistoryIcon aria-hidden="true" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(plugin)}
                  className="rounded-full p-2.5 text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive active:scale-press-in"
                  aria-label={t("plugin.deletePlugin", "Delete Plugin")}
                  title={t("plugin.deletePlugin", "Delete Plugin")}
                >
                  <TrashIcon aria-hidden="true" className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex shrink-0 items-center gap-6 border-b border-border bg-accent/20 px-6">
        <DetailTabButton
          active={activeTab === "overview"}
          icon={<InfoIcon aria-hidden="true" className="h-4 w-4" />}
          onClick={() =>
            requestLeaveFileEditing(() => setActiveTab("overview"))
          }
        >
          {t("common.preview", "Preview")}
        </DetailTabButton>
        <DetailTabButton
          active={activeTab === "source"}
          icon={<CodeIcon aria-hidden="true" className="h-4 w-4" />}
          onClick={() => requestLeaveFileEditing(() => setActiveTab("source"))}
        >
          {t("common.content", "Source / Content")}
        </DetailTabButton>
        <DetailTabButton
          active={activeTab === "files"}
          icon={<FolderOpenIcon aria-hidden="true" className="h-4 w-4" />}
          onClick={() => setActiveTab("files")}
        >
          {t("skill.files", "Files")}
        </DetailTabButton>
        {!isAgentDetail ? (
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={openPackageCheck}
              disabled={isCheckingPackage || !localPackagePath}
              title={t("plugin.packageCheckTitle", "Package Check")}
              className={`my-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${packageHealthTone}`}
            >
              {isCheckingPackage ? (
                <Loader2Icon
                  aria-hidden="true"
                  className="h-3.5 w-3.5 animate-spin"
                />
              ) : packageHealthCheck?.status === "ok" ? (
                <CheckIcon aria-hidden="true" className="h-3.5 w-3.5" />
              ) : (
                <AlertTriangleIcon aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {packageHealthLabel}
            </button>
            <button
              type="button"
              onClick={openSafetyAssessment}
              disabled={isScanningSafety}
              title={
                plugin.safetyReport
                  ? t("plugin.safetyAssessment", "Safety Assessment")
                  : t("plugin.safetyNoReport", "Not assessed")
              }
              className={`my-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${safetyTone}`}
            >
              {isScanningSafety ? (
                <ShieldAlertIcon
                  aria-hidden="true"
                  className="h-3.5 w-3.5 animate-pulse"
                />
              ) : plugin.safetyReport?.level === "safe" ? (
                <ShieldCheckIcon aria-hidden="true" className="h-3.5 w-3.5" />
              ) : plugin.safetyReport ? (
                <ShieldAlertIcon aria-hidden="true" className="h-3.5 w-3.5" />
              ) : (
                <ShieldIcon aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {safetyPillLabel}
            </button>
          </div>
        ) : null}
      </div>

      <main
        ref={contentScrollRef}
        onScroll={handleContentScroll}
        className={`flex min-h-0 flex-1 flex-col ${
          activeTab === "files" ? "overflow-hidden" : "overflow-y-auto p-6"
        }`}
      >
        {activeTab === "overview" ? (
          <PluginOverview
            agentActions={agentActions}
            agentContext={agentContext}
            descriptionText={
              showTranslatedDescription && translatedDescription
                ? translatedDescription
                : descriptionSourceText
            }
            draftUserNotes={draftUserNotes}
            hasTranslatedDescription={Boolean(translatedDescription)}
            isEditingUserNotes={isEditingUserNotes}
            isImportingChildMcp={isImportingChildMcp}
            isImportingChildSkills={isImportingChildSkills}
            isSavingUserNotes={isSavingUserNotes}
            isShowingTranslatedDescription={showTranslatedDescription}
            isTranslatingDescription={isTranslatingDescription}
            localPackagePath={localPackagePath}
            onCancelUserNotes={cancelUserNotes}
            onDistribute={onDistribute}
            onRemoveDistribution={onRemoveDistribution}
            onImportChildMcp={onImportChildMcp}
            onImportChildSkills={onImportChildSkills}
            onSaveUserNotes={saveUserNotes}
            onStartEditUserNotes={() => setIsEditingUserNotes(true)}
            onTranslateDescription={translatePluginDescription}
            onUserNotesChange={setDraftUserNotes}
            plugin={plugin}
            targetMatrix={targetMatrix}
          />
        ) : activeTab === "source" ? (
          <PluginSourcePanel
            localPackagePath={localPackagePath}
            plugin={plugin}
          />
        ) : (
          <PluginFilesPanel
            localPackagePath={localPackagePath}
            onUnsavedChange={setFileEditorHasUnsavedChanges}
            plugin={plugin}
            readOnly={isAgentDetail}
          />
        )}
      </main>
      {showBackToTop && activeTab !== "files" ? (
        <button
          type="button"
          onClick={scrollToTop}
          className="absolute bottom-6 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-border app-wallpaper-surface px-4 py-2 text-sm font-medium text-foreground shadow-lg transition-all duration-base hover:-translate-x-1/2 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-accent hover:text-primary hover:shadow-xl"
        >
          <ArrowUpIcon className="h-4 w-4" aria-hidden="true" />
          {t("common.backToTop", "Back to Top")}
        </button>
      ) : null}
      <UnsavedChangesDialog
        isOpen={isUnsavedDialogOpen}
        onClose={() => {
          setIsUnsavedDialogOpen(false);
          setPendingUnsavedAction(null);
        }}
        onSave={() => {
          setIsUnsavedDialogOpen(false);
          setPendingUnsavedAction(null);
        }}
        onDiscard={() => {
          setIsUnsavedDialogOpen(false);
          pendingUnsavedAction?.();
          setPendingUnsavedAction(null);
        }}
      />
      <PluginVersionHistoryModal
        isOpen={isVersionHistoryOpen}
        onClose={() => setIsVersionHistoryOpen(false)}
        plugin={plugin}
      />
      <Modal
        isOpen={Boolean(pendingSourceUpdateMode && sourceUpdateCheck?.preview)}
        onClose={() => {
          if (!isUpdatingFromSource) setPendingSourceUpdateMode(null);
        }}
        title={t("plugin.confirmSourceUpdateTitle", "Review Plugin update")}
        subtitle={t(
          "plugin.confirmSourceUpdateSubtitle",
          "Review the source changes before updating this Plugin.",
        )}
        size="xl"
        closeOnBackdrop={!isUpdatingFromSource}
        closeOnEscape={!isUpdatingFromSource}
      >
        {sourceUpdateCheck?.preview ? (
          <div className="space-y-5">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-800 dark:text-amber-200">
              {pendingSourceUpdateMode === "overwrite"
                ? t(
                    "plugin.confirmSourceOverwriteMessage",
                    "Local changes were detected. Updating will overwrite the local Plugin package with the source version.",
                  )
                : t(
                    "plugin.confirmSourceUpdateMessage",
                    "Updating will replace the installed Plugin metadata and package with the source version.",
                  )}
            </div>
            <div className="space-y-3">
              <SourceUpdateDiffRow
                current={plugin.version ? `v${plugin.version}` : undefined}
                currentLabel={t("common.current", "Current")}
                label={t("plugin.version", "Version")}
                next={
                  sourceUpdateCheck.preview.version
                    ? `v${sourceUpdateCheck.preview.version}`
                    : undefined
                }
                sourceLabel={t("plugin.source", "Source")}
              />
              <SourceUpdateDiffRow
                current={plugin.description}
                currentLabel={t("common.current", "Current")}
                label={t("plugin.description", "Description")}
                next={sourceUpdateCheck.preview.description}
                sourceLabel={t("plugin.source", "Source")}
              />
              <SourceUpdateDiffRow
                current={formatPluginInventorySummary(plugin.inventory)}
                currentLabel={t("common.current", "Current")}
                label={t("plugin.inventoryTitle", "Inventory")}
                next={formatPluginInventorySummary(
                  sourceUpdateCheck.preview.inventory,
                )}
                sourceLabel={t("plugin.source", "Source")}
              />
              <SourceUpdateDiffRow
                current={sourceUpdateCheck.installedManifestHash}
                currentLabel={t("common.current", "Current")}
                label={t("plugin.manifestHash", "Manifest hash")}
                next={sourceUpdateCheck.remoteManifestHash}
                sourceLabel={t("plugin.source", "Source")}
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setPendingSourceUpdateMode(null)}
                disabled={isUpdatingFromSource}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                type="button"
                onClick={() => void confirmPendingSourceUpdate()}
                disabled={isUpdatingFromSource}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
              >
                {isUpdatingFromSource ? (
                  <Loader2Icon
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin"
                  />
                ) : (
                  <RefreshCwIcon aria-hidden="true" className="h-4 w-4" />
                )}
                {pendingSourceUpdateMode === "overwrite"
                  ? t("plugin.overwriteFromSource", "Overwrite from source")
                  : t("plugin.updateFromSource", "Update from source")}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
      <Modal
        isOpen={isSafetyReportModalOpen}
        onClose={() => setIsSafetyReportModalOpen(false)}
        title={t("plugin.safetyAssessment", "Safety Assessment")}
        size="xl"
      >
        <PluginSafetyAssessmentPanel
          isScanning={isScanningSafety}
          onRunSafetyAssessment={async () => { await runSafetyAssessment(); }}
          report={plugin.safetyReport}
        />
      </Modal>
      <Modal
        isOpen={isPackageCheckModalOpen}
        onClose={() => setIsPackageCheckModalOpen(false)}
        title={t("plugin.packageCheckTitle", "Package Check")}
        size="xl"
      >
        <PluginPackageHealthPanel
          check={packageHealthCheck}
          isChecking={isCheckingPackage}
          localPackagePath={localPackagePath}
          onRunCheck={runPackageCheck}
        />
      </Modal>
      <Modal
        isOpen={isSnapshotModalOpen}
        onClose={() => {
          if (!isCreatingSnapshot) setIsSnapshotModalOpen(false);
        }}
        title={t("plugin.createSnapshot", "Create Snapshot")}
        size="md"
      >
        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">
              {t("plugin.snapshotNote", "Snapshot note")}
            </span>
            <Textarea
              value={snapshotNote}
              onChange={(event) => setSnapshotNote(event.target.value)}
              disabled={isCreatingSnapshot}
              rows={4}
              aria-label={t("plugin.snapshotNote", "Snapshot note")}
              placeholder={t(
                "plugin.snapshotNotePlaceholder",
                "Describe what changed in this Plugin package.",
              )}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsSnapshotModalOpen(false)}
              disabled={isCreatingSnapshot}
              className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("common.cancel", "Cancel")}
            </button>
            <button
              type="button"
              onClick={() => void handleCreateSnapshot()}
              disabled={isCreatingSnapshot}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              {isCreatingSnapshot ? (
                <Loader2Icon
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin"
                />
              ) : (
                <SaveIcon aria-hidden="true" className="h-4 w-4" />
              )}
              {t("plugin.createSnapshot", "Create Snapshot")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
