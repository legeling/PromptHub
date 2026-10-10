import { requestConfirmation } from "../../ui/confirmation";
import { useDataSettingsControllerContext } from "./useDataSettingsController";
import {
  DataSettingsSection,
  getSyncPanelContentClassName,
} from "./DataSettingsSection";
import { FolderIcon, TrashIcon, Loader2Icon } from "lucide-react";
import { PasswordInput } from "../shared";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { DataRecoveryDialog } from "../../ui/DataRecoveryDialog";
import { BackupImportConfirmDialog } from "../BackupImportConfirmDialog";

export function DataSettingsDialogs() {
  const {
    backupImportController,
    t,
    settings,
    currentPromptCount,
    upgradeBackupActionId,
    restoreCandidate,
    setRestoreCandidate,
    deleteCandidate,
    setDeleteCandidate,
    manualRecoveryCandidates,
    showRecoveryBrowser,
    setShowRecoveryBrowser,
    pendingDataPathChange,
    setPendingDataPathChange,
    dataPathActionLoading,
    localBackupImportController,
    showClearConfirm,
    setShowClearConfirm,
    clearPwd,
    setClearPwd,
    clearLoading,
    handleConfirmRestoreUpgradeBackup,
    handleConfirmDeleteUpgradeBackup,
    handleConfirmClear,
    applyDataPathChange,
  } = useDataSettingsControllerContext();

  return (
    <>
      {pendingDataPathChange ? (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-2xl w-full max-w-lg p-6 shadow-2xl border border-border">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center shrink-0">
                <FolderIcon className="w-5 h-5 text-yellow-500" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold">
                  {t(
                    "settings.existingDataPathTitle",
                    "Target directory already contains PromptHub data",
                  )}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {t(
                    "settings.existingDataPathDesc",
                    "If this directory was copied from another computer, switch to it. Overwrite will replace the data in this directory with data from the current computer.",
                  )}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 mb-4">
              <p className="text-xs font-mono break-all">
                {pendingDataPathChange.targetPath}
              </p>
              {pendingDataPathChange.markers?.length ? (
                <p className="text-xs text-muted-foreground">
                  {t("settings.detectedDataMarkers", "Detected data")}:{" "}
                  {pendingDataPathChange.markers
                    .map((marker) => marker.name)
                    .join(", ")}
                </p>
              ) : null}
              {pendingDataPathChange.targetSummary?.available ? (
                <p className="text-xs text-muted-foreground">
                  {t(
                    "settings.targetDataSummary",
                    "{{prompts}} prompts, {{folders}} folders, {{skills}} skills",
                    {
                      prompts: pendingDataPathChange.targetSummary.promptCount,
                      folders: pendingDataPathChange.targetSummary.folderCount,
                      skills: pendingDataPathChange.targetSummary.skillCount,
                    },
                  )}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => setPendingDataPathChange(null)}
                disabled={dataPathActionLoading}
                className="h-10 px-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                type="button"
                onClick={() =>
                  void applyDataPathChange(
                    pendingDataPathChange.targetPath || "",
                    "switch",
                  )
                }
                disabled={dataPathActionLoading}
                className="h-10 px-4 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {t(
                  "settings.switchToExistingDataPath",
                  "Switch to this directory",
                )}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const confirmed = (await requestConfirmation({
                    message: t(
                      "settings.confirmOverwriteDataPath",
                      "Overwrite the data in this directory with the current computer's data? A backup of the target directory will be created first.",
                    ),
                    variant: "destructive",
                    confirmText: t("settings.overwriteAndMigrateDataPath"),
                  }));
                  if (confirmed) {
                    void applyDataPathChange(
                      pendingDataPathChange.targetPath || "",
                      "overwrite",
                    );
                  }
                }}
                disabled={dataPathActionLoading}
                className="h-10 px-4 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {t(
                  "settings.overwriteAndMigrateDataPath",
                  "Overwrite and migrate",
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Clear data confirm modal / 清除数据确认弹窗 */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-2xl w-[400px] p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <TrashIcon className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-red-500">
                  {t("settings.dangerOperation") || "危险操作"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("settings.clearDesc")}
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                {t("settings.enterMasterPassword") || "请输入主密码确认"}
              </label>
              <PasswordInput
                value={clearPwd}
                onChange={setClearPwd}
                ariaLabel={
                  t("settings.masterPasswordPlaceholder") || "输入主密码"
                }
                placeholder={
                  t("settings.masterPasswordPlaceholder") || "输入主密码"
                }
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowClearConfirm(false);
                  setClearPwd("");
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                disabled={clearLoading}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleConfirmClear}
                disabled={clearLoading || !clearPwd}
                className="flex-1 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {clearLoading ? (
                  <Loader2Icon
                    className="w-4 h-4 animate-spin mx-auto"
                    aria-hidden="true"
                  />
                ) : (
                  t("settings.confirmClear") || "确认清除"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={restoreCandidate !== null}
        onClose={() => {
          if (!upgradeBackupActionId) {
            setRestoreCandidate(null);
          }
        }}
        onConfirm={() => {
          void handleConfirmRestoreUpgradeBackup();
        }}
        title={t(
          "settings.upgradeBackupRestoreTitle",
          "Restore upgrade backup",
        )}
        message={
          restoreCandidate
            ? t(
                "settings.upgradeBackupRestoreConfirm",
                "Restore the automatic snapshot from {{from}}{{to}} created at {{createdAt}}? PromptHub will first save your current state as another backup, then restart.",
                {
                  from: restoreCandidate.manifest.fromVersion,
                  to: restoreCandidate.manifest.toVersion
                    ? ` -> ${restoreCandidate.manifest.toVersion}`
                    : "",
                  createdAt: new Date(
                    restoreCandidate.manifest.createdAt,
                  ).toLocaleString(),
                },
              )
            : ""
        }
        confirmText={t(
          "settings.upgradeBackupRestoreAction",
          "Restore this snapshot",
        )}
        cancelText={t("common.cancel", "Cancel")}
        variant="destructive"
      />

      <ConfirmDialog
        isOpen={deleteCandidate !== null}
        onClose={() => {
          if (!upgradeBackupActionId) {
            setDeleteCandidate(null);
          }
        }}
        onConfirm={() => {
          void handleConfirmDeleteUpgradeBackup();
        }}
        title={t("settings.upgradeBackupDeleteTitle", "Delete upgrade backup")}
        message={
          deleteCandidate
            ? t(
                "settings.upgradeBackupDeleteConfirm",
                "Delete the automatic snapshot {{backupId}}? This history entry cannot be recovered.",
                {
                  backupId: deleteCandidate.backupId,
                },
              )
            : ""
        }
        confirmText={t("common.delete", "Delete")}
        cancelText={t("common.cancel", "Cancel")}
        variant="destructive"
      />

      <DataRecoveryDialog
        isOpen={showRecoveryBrowser}
        onClose={() => setShowRecoveryBrowser(false)}
        databases={manualRecoveryCandidates}
        persistDismiss={false}
        allowWindowClose={true}
        allowStartFresh={false}
        currentPromptCount={currentPromptCount}
      />

      {backupImportController ? null : (
        <BackupImportConfirmDialog
          importPreview={localBackupImportController.importPreview}
          confirmingImport={localBackupImportController.confirmingImport}
          onClose={localBackupImportController.closeImportPreview}
          onConfirm={() => {
            void localBackupImportController.confirmImport();
          }}
        />
      )}
    </>
  );
}
