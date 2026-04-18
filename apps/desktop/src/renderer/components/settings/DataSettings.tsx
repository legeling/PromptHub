import { useState, useEffect } from "react";
import {
  FolderIcon,
  CloudIcon,
  UploadIcon,
  DownloadIcon,
  RefreshCwIcon,
  ExternalLinkIcon,
  TrashIcon,
  Loader2Icon,
  ServerCogIcon,
  SearchIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  downloadBackup,
  downloadCompressedBackup,
  downloadSelectiveExport,
  previewImportFile,
  restoreFromFile,
} from "../../services/database-backup";
import {
  createUpgradeBackup,
  deleteUpgradeBackup,
  listUpgradeBackups,
  restoreUpgradeBackup,
} from "../../services/upgrade-backup";
import { hasAnySkipped } from "../../services/database-backup-format";
import { recordManualBackup } from "../../services/backup-status";
import { clearDatabase } from "../../services/database";
import {
  testConnection,
  uploadToWebDAV,
  downloadFromWebDAV,
} from "../../services/webdav";
import {
  pullFromSelfHostedWeb,
  pushToSelfHostedWeb,
  testSelfHostedConnection,
} from "../../services/self-hosted-sync";
import { useSettingsStore } from "../../stores/settings.store";
import { usePromptStore } from "../../stores/prompt.store";
import { useToast } from "../ui/Toast";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { DataRecoveryDialog } from "../ui/DataRecoveryDialog";
import { Select } from "../ui/Select";
import { Checkbox } from "../ui";
import {
  SettingSection,
  SettingItem,
  ToggleSwitch,
  PasswordInput,
} from "./shared";
import { isWebRuntime } from "../../runtime";
import type { RecoveryCandidate, UpgradeBackupEntry } from "@prompthub/shared/types";
import type { ImportPreviewSummary } from "../../services/database-backup";

const MANUAL_RECOVERY_PATHS_STORAGE_KEY = "prompthub-manual-recovery-paths";

function loadManualRecoveryPaths(): string[] {
  try {
    const raw = localStorage.getItem(MANUAL_RECOVERY_PATHS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    );
  } catch {
    return [];
  }
}

function persistManualRecoveryPaths(paths: string[]): void {
  try {
    localStorage.setItem(
      MANUAL_RECOVERY_PATHS_STORAGE_KEY,
      JSON.stringify(paths),
    );
  } catch {
    // ignore localStorage persistence failures
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "Unknown error";
}

/**
 * DataSettings — Data management tab
 * Handles: data path, WebDAV sync, backup/restore, clear data
 * 数据管理标签页：数据路径、WebDAV 同步、备份/恢复、清除数据
 */
export function DataSettings() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const webRuntime = isWebRuntime();
  const settings = useSettingsStore();
  const currentPromptCount = usePromptStore((state) => state.prompts.length);
  const persistedDataPath = settings.dataPath;
  const setDataPath = settings.setDataPath;
  const [currentDataPath, setCurrentDataPath] = useState("");
  const [pendingDataPath, setPendingDataPath] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState("");
  const [upgradeBackups, setUpgradeBackups] = useState<UpgradeBackupEntry[]>([]);
  const [loadingUpgradeBackups, setLoadingUpgradeBackups] = useState(false);
  const [upgradeBackupActionId, setUpgradeBackupActionId] = useState<string | null>(null);
  const [restoreCandidate, setRestoreCandidate] = useState<UpgradeBackupEntry | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<UpgradeBackupEntry | null>(null);
  const [importPreview, setImportPreview] = useState<{
    file: File;
    summary: ImportPreviewSummary;
  } | null>(null);
  const [confirmingImport, setConfirmingImport] = useState(false);
  const [manualRecoveryPaths, setManualRecoveryPaths] = useState<string[]>([]);
  const [manualPathInputValue, setManualPathInputValue] = useState("");
  const [scanningRecoverySources, setScanningRecoverySources] = useState(false);
  const [manualRecoveryCandidates, setManualRecoveryCandidates] = useState<
    RecoveryCandidate[]
  >([]);
  const [showRecoveryBrowser, setShowRecoveryBrowser] = useState(false);

  // WebDAV operation state
  // WebDAV 操作状态
  const [webdavTesting, setWebdavTesting] = useState(false);
  const [webdavUploading, setWebdavUploading] = useState(false);
  const [webdavDownloading, setWebdavDownloading] = useState(false);
  const [selfHostedTesting, setSelfHostedTesting] = useState(false);
  const [selfHostedUploading, setSelfHostedUploading] = useState(false);
  const [selfHostedDownloading, setSelfHostedDownloading] = useState(false);

  // Export/backup options
  // 数据导出/备份选项
  const [exportScope, setExportScope] = useState({
    prompts: true,
    folders: true,
    images: true,
    aiConfig: true,
    settings: true,
    versions: false,
    skills: true,
  });

  // Clear data confirm modal
  // 清除数据确认弹窗
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearPwd, setClearPwd] = useState("");
  const [clearLoading, setClearLoading] = useState(false);
  // Security status for clear-data flow (independent from SecuritySettings)
  // 清除数据流程需要的安全状态（独立于 SecuritySettings）
  const [securityConfigured, setSecurityConfigured] = useState(false);

  const refreshDataPathStatus = async () => {
    const status = await window.electron?.getDataPathStatus?.();
    if (status?.currentPath) {
      setCurrentDataPath(status.currentPath);
      setPendingDataPath(
        status.needsRestart ? status.configuredPath || null : null,
      );
      if (status.configuredPath && status.configuredPath !== persistedDataPath) {
        setDataPath(status.configuredPath);
      }
      return;
    }

    const resolvedPath = await window.electron?.getDataPath?.();
    if (!resolvedPath) {
      return;
    }
    setCurrentDataPath(resolvedPath);
    setPendingDataPath(null);
    if (resolvedPath !== persistedDataPath) {
      setDataPath(resolvedPath);
    }
  };

  const refreshUpgradeBackups = async () => {
    if (webRuntime) {
      return;
    }

    setLoadingUpgradeBackups(true);
    try {
      setUpgradeBackups(await listUpgradeBackups());
    } catch (error) {
      console.error("Failed to load upgrade backups:", error);
      showToast(
        `${t("settings.upgradeBackupLoadFailed", "Failed to load upgrade backups")}: ${getErrorMessage(error)}`,
        "error",
      );
    } finally {
      setLoadingUpgradeBackups(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  useEffect(() => {
    window.api?.security?.status().then((status) => {
      setSecurityConfigured(status.configured);
    });
    window.electron?.updater?.getVersion?.().then((version) => {
      if (typeof version === "string") {
        setCurrentVersion(version);
      }
    });
  }, []);

  useEffect(() => {
    if (webRuntime) {
      return;
    }
    setManualRecoveryPaths(loadManualRecoveryPaths());
  }, [webRuntime]);

  useEffect(() => {
    let mounted = true;
    void refreshDataPathStatus().catch((error) => {
      if (mounted) {
        console.error("Failed to load data path status:", error);
      }
    });

    return () => {
      mounted = false;
    };
  }, [persistedDataPath, setDataPath]);

  useEffect(() => {
    void refreshUpgradeBackups();
  }, [webRuntime]);

  const handleSelectiveExport = async () => {
    try {
      await downloadSelectiveExport(exportScope);
      showToast(t("toast.exportSuccess"), "success");
    } catch (error) {
      console.error("Selective export failed:", error);
      showToast(t("toast.exportFailed"), "error");
    }
  };

  const handleFullBackup = async (compressed: boolean) => {
    try {
      if (compressed) {
        await downloadCompressedBackup();
      } else {
        await downloadBackup();
      }
      if (currentVersion) {
        await recordManualBackup(currentVersion);
      }
      showToast(t("toast.exportSuccess"), "success");
    } catch (error) {
      console.error("Backup failed:", error);
      showToast(t("toast.exportFailed"), "error");
    }
  };

  const handleImportBackup = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.phub,.gz,.zip";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          const preview = await previewImportFile(file);
          setImportPreview({ file, summary: preview.summary });
        } catch (error) {
          console.error("Import failed:", error);
          showToast(
            `${t("toast.importFailed")}: ${getErrorMessage(error)}`,
            "error",
          );
        }
      }
    };
    input.click();
  };

  const formatSkippedDetails = (skipped: ImportPreviewSummary["skipped"]): string => {
    return [
      skipped.prompts > 0 ? `prompts: ${skipped.prompts}` : null,
      skipped.folders > 0 ? `folders: ${skipped.folders}` : null,
      skipped.versions > 0 ? `versions: ${skipped.versions}` : null,
      skipped.skills > 0 ? `skills: ${skipped.skills}` : null,
      skipped.skillVersions > 0 ? `skill versions: ${skipped.skillVersions}` : null,
      skipped.skillFiles > 0 ? `skill files: ${skipped.skillFiles}` : null,
    ]
      .filter((part): part is string => part !== null)
      .join(", ");
  };

  const handleConfirmImportBackup = async () => {
    if (!importPreview) {
      return;
    }

    setConfirmingImport(true);
    try {
      if (!webRuntime) {
        await createUpgradeBackup({
          fromVersion: currentVersion || undefined,
          toVersion: currentVersion || undefined,
        });
        await refreshUpgradeBackups();
      }

      const skipped = await restoreFromFile(importPreview.file);
      if (hasAnySkipped(skipped)) {
        showToast(
          t("toast.importPartialSuccess", {
            details: formatSkippedDetails(skipped),
          }),
          "success",
        );
      } else {
        showToast(t("toast.importSuccess"), "success");
      }

      setImportPreview(null);
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error("Import failed:", error);
      showToast(
        `${t("toast.importFailed")}: ${getErrorMessage(error)}`,
        "error",
      );
    } finally {
      setConfirmingImport(false);
    }
  };

  const handleClearData = async () => {
    // If master password is configured, require verification first
    // 如果已设置主密码，需要先验证
    if (securityConfigured) {
      setShowClearConfirm(true);
      return;
    }
    // If master password is not configured, prompt to set it first
    // 未设置主密码时，提示需要先设置
    showToast(
      t("settings.clearNeedPassword") ||
        "Clearing data is a high-risk operation, please set a master password in security settings first",
      "error",
    );
  };

  const handleConfirmRestoreUpgradeBackup = async () => {
    if (!restoreCandidate) {
      return;
    }

    setUpgradeBackupActionId(restoreCandidate.backupId);
    try {
      const result = await restoreUpgradeBackup(restoreCandidate.backupId);
      if (!result.success) {
        showToast(
          `${t("settings.upgradeBackupRestoreFailed", "Failed to restore upgrade backup")}: ${result.error || t("common.unknownError", "Unknown error")}`,
          "error",
        );
        return;
      }

      showToast(
        t(
          "settings.upgradeBackupRestoreScheduled",
          "Upgrade backup restored. PromptHub will restart automatically.",
        ),
        "success",
      );
      setRestoreCandidate(null);
    } catch (error) {
      console.error("Failed to restore upgrade backup:", error);
      showToast(
        `${t("settings.upgradeBackupRestoreFailed", "Failed to restore upgrade backup")}: ${getErrorMessage(error)}`,
        "error",
      );
    } finally {
      setUpgradeBackupActionId(null);
    }
  };

  const handleConfirmDeleteUpgradeBackup = async () => {
    if (!deleteCandidate) {
      return;
    }

    setUpgradeBackupActionId(deleteCandidate.backupId);
    try {
      await deleteUpgradeBackup(deleteCandidate.backupId);
      setDeleteCandidate(null);
      await refreshUpgradeBackups();
      showToast(
        t("settings.upgradeBackupDeleteSuccess", "Upgrade backup deleted"),
        "success",
      );
    } catch (error) {
      console.error("Failed to delete upgrade backup:", error);
      showToast(
        `${t("settings.upgradeBackupDeleteFailed", "Failed to delete upgrade backup")}: ${getErrorMessage(error)}`,
        "error",
      );
    } finally {
      setUpgradeBackupActionId(null);
    }
  };

  const handleConfirmClear = async () => {
    if (!clearPwd) {
      showToast(
        t("settings.enterPassword") || "Please enter master password",
        "error",
      );
      return;
    }

    setClearLoading(true);
    try {
      // Verify password
      // 验证密码
      const result = await window.api.security.unlock(clearPwd);
      if (!result.success) {
        showToast(t("settings.wrongPassword") || "Wrong password", "error");
        setClearLoading(false);
        return;
      }

      // Password verified; proceed to clear
      // 密码正确，执行清除
      await clearDatabase();
      showToast(t("toast.clearSuccess"), "success");
      setShowClearConfirm(false);
      setClearPwd("");
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error("Clear failed:", error);
      showToast(t("toast.clearFailed"), "error");
    } finally {
      setClearLoading(false);
    }
  };

  const updateManualRecoveryPaths = (paths: string[]) => {
    setManualRecoveryPaths(paths);
    persistManualRecoveryPaths(paths);
  };

  const handleAddManualRecoveryPath = async () => {
    const selected = await window.electron?.selectFolder?.();
    if (!selected) {
      return;
    }

    const normalized = selected.trim();
    if (!normalized) {
      return;
    }

    if (manualRecoveryPaths.includes(normalized)) {
      showToast(
        t(
          "settings.manualRecoveryPathExists",
          "This scan directory has already been added.",
        ),
        "error",
      );
      return;
    }

    updateManualRecoveryPaths([...manualRecoveryPaths, normalized]);
  };

  const handleAddManualRecoveryPathFromInput = () => {
    const normalized = manualPathInputValue.trim();
    if (!normalized) {
      return;
    }
    if (manualRecoveryPaths.includes(normalized)) {
      showToast(
        t(
          "settings.manualRecoveryPathExists",
          "This scan directory has already been added.",
        ),
        "error",
      );
      return;
    }
    updateManualRecoveryPaths([...manualRecoveryPaths, normalized]);
    setManualPathInputValue("");
  };

  const handleRemoveManualRecoveryPath = (targetPath: string) => {
    updateManualRecoveryPaths(
      manualRecoveryPaths.filter((entry) => entry !== targetPath),
    );
  };

  const handleScanRecoverySources = async () => {
    setScanningRecoverySources(true);
    try {
      const candidates =
        (await window.electron?.checkRecovery?.({
          extraPaths: manualRecoveryPaths,
          ignoreDismissMarker: true,
        })) ?? [];

      setManualRecoveryCandidates(candidates);
      if (candidates.length === 0) {
        showToast(
          t(
            "settings.recoveryScanEmpty",
            "No recoverable history was found in the scanned locations.",
          ),
          "error",
        );
        return;
      }

      setShowRecoveryBrowser(true);
    } catch (error) {
      console.error("Failed to scan recovery sources:", error);
      showToast(
        `${t("settings.recoveryScanFailed", "Failed to scan recovery sources")}: ${getErrorMessage(error)}`,
        "error",
      );
    } finally {
      setScanningRecoverySources(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        {!webRuntime ? (
          <SettingSection title={t("settings.dataPath")}>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <FolderIcon className="w-5 h-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{t("settings.dataPath")}</p>
                  <button
                    onClick={() =>
                      currentDataPath && window.electron?.openPath?.(currentDataPath)
                    }
                    className="text-xs text-primary font-mono mt-0.5 hover:underline flex items-center gap-1 cursor-pointer"
                    title={t("settings.openFolder")}
                  >
                    {currentDataPath || t("common.loading", "Loading...")}
                    <ExternalLinkIcon className="w-3 h-3" />
                  </button>
                  {pendingDataPath && pendingDataPath !== currentDataPath ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(
                        "settings.pendingDataPath",
                        "Will switch to this directory after restart:",
                      )}{" "}
                      <span className="font-mono">{pendingDataPath}</span>
                    </p>
                  ) : null}
                </div>
                <button
                  onClick={async () => {
                    const newPath = await window.electron?.selectFolder?.();
                    if (newPath) {
                      const confirmed = window.confirm(
                        t(
                          "settings.confirmDataMigration",
                          "Are you sure you want to migrate data to the new directory?\n\nRestart is required after migration.",
                        ),
                      );
                      if (!confirmed) return;

                      const result =
                        await window.electron?.migrateData?.(newPath);
                      if (result?.success) {
                        const resolvedPath = result.newPath || newPath;
                        setDataPath(resolvedPath);
                        await refreshDataPathStatus();
                        showToast(
                          t("toast.dataPathChanged") +
                            " " +
                            t("settings.restartRequired", "Please restart app"),
                          "success",
                        );
                        setTimeout(() => {
                          if (
                            window.confirm(
                              t(
                                "settings.restartNow",
                                "Data migration completed. Restart app now?",
                              ),
                            )
                          ) {
                            window.location.reload();
                          }
                        }, 1000);
                      } else {
                        showToast(
                          t(
                            "toast.dataPathChangeFailed",
                            "Data migration failed",
                          ) +
                            ": " +
                            (result?.error || ""),
                          "error",
                        );
                      }
                    }
                  }}
                  className="h-8 px-3 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors"
                >
                  {t("settings.change")}
                </button>
              </div>
            </div>
          </SettingSection>
        ) : null}

        {!webRuntime ? (
          <SettingSection title={t("settings.recoveryScanner", "历史数据急救")}>
            <div className="p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">
                    {t("settings.recoveryScannerTitle", "历史数据急救")}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {t(
                      "settings.recoveryScannerDesc",
                      "从旧版本目录、手动指定目录或历史备份中查找可恢复的数据，预览后选择恢复源。",
                    )}
                  </div>
                </div>
                <button
                  onClick={() => void handleScanRecoverySources()}
                  disabled={scanningRecoverySources}
                  className="h-8 px-3 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <SearchIcon
                    className={`w-4 h-4 ${scanningRecoverySources ? "animate-pulse" : ""}`}
                  />
                  {t("settings.recoveryScanAction", "Scan now")}
                </button>
              </div>

              <div className="rounded-lg border border-border bg-card/50 p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">
                      {t("settings.recoveryExtraPaths", "Extra scan directories")}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {t(
                        "settings.recoveryExtraPathsDesc",
                        "Add old install folders or copied data directories to include them in recovery scans.",
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => void handleAddManualRecoveryPath()}
                    className="h-8 px-3 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors flex items-center gap-2"
                  >
                    <PlusIcon className="w-4 h-4" />
                    {t("settings.recoveryAddScanDir", "Add folder")}
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualPathInputValue}
                    onChange={(e) => setManualPathInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleAddManualRecoveryPathFromInput();
                      }
                    }}
                    placeholder={t(
                      "settings.recoveryManualPathPlaceholder",
                      "Paste or type a path…",
                    )}
                    className="flex-1 h-8 px-3 rounded-lg border border-border bg-background text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    onClick={handleAddManualRecoveryPathFromInput}
                    disabled={!manualPathInputValue.trim()}
                    className="h-8 px-3 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors flex items-center gap-2 disabled:opacity-40"
                  >
                    <PlusIcon className="w-4 h-4" />
                    {t("settings.recoveryAddPathBtn", "Add")}
                  </button>
                </div>

                {manualRecoveryPaths.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                    {t(
                      "settings.recoveryExtraPathsEmpty",
                      "No extra scan directories added yet.",
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {manualRecoveryPaths.map((entry) => (
                      <div
                        key={entry}
                        className="rounded-lg border border-border bg-background px-3 py-2 flex items-center justify-between gap-3"
                      >
                        <button
                          type="button"
                          onClick={() => window.electron?.openPath?.(entry)}
                          className="text-left min-w-0 text-xs text-primary font-mono hover:underline break-all"
                        >
                          {entry}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveManualRecoveryPath(entry)}
                          className="h-7 w-7 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
                          title={t("common.delete", "Delete")}
                        >
                          <XIcon className="w-4 h-4 mx-auto" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </SettingSection>
        ) : null}

        {!webRuntime ? (
          <SettingSection title={t("settings.selfHostedWeb")}>
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3">
                <ServerCogIcon className="w-5 h-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {t("settings.selfHostedWeb")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t(
                      "settings.selfHostedSyncDesc",
                      "Use your deployed PromptHub Web as an authenticated backup target and restore source for desktop data without WebDAV.",
                    )}
                  </p>
                </div>
                <ToggleSwitch
                  checked={settings.selfHostedSyncEnabled}
                  onChange={settings.setSelfHostedSyncEnabled}
                />
              </div>

              {settings.selfHostedSyncEnabled ? (
                <div className="space-y-3 pt-2 border-t border-border">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {t(
                        "settings.selfHostedSyncServer",
                        "Self-Hosted PromptHub URL",
                      )}
                    </label>
                    <input
                      type="text"
                      placeholder="https://backup.example.com"
                      value={settings.selfHostedSyncUrl}
                      onChange={(e) =>
                        settings.setSelfHostedSyncUrl(e.target.value)
                      }
                      className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {t("settings.webdavUsername")}
                    </label>
                    <input
                      type="text"
                      placeholder={t("settings.webdavUsername")}
                      value={settings.selfHostedSyncUsername}
                      onChange={(e) =>
                        settings.setSelfHostedSyncUsername(e.target.value)
                      }
                      className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {t("settings.webdavPassword")}
                    </label>
                    <PasswordInput
                      placeholder={t("settings.webdavPassword")}
                      value={settings.selfHostedSyncPassword}
                      onChange={settings.setSelfHostedSyncPassword}
                      className="h-9"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      onClick={async () => {
                        if (
                          !settings.selfHostedSyncUrl ||
                          !settings.selfHostedSyncUsername ||
                          !settings.selfHostedSyncPassword
                        ) {
                          return;
                        }
                        setSelfHostedTesting(true);
                        try {
                          const summary = await testSelfHostedConnection({
                            url: settings.selfHostedSyncUrl,
                            username: settings.selfHostedSyncUsername,
                            password: settings.selfHostedSyncPassword,
                          });
                          showToast(
                            t(
                              "toast.selfHostedSyncConnectionSuccess",
                              "Connection successful. Remote workspace currently stores {{prompts}} prompts, {{folders}} folders, and {{skills}} skills.",
                              {
                                prompts: summary.prompts,
                                folders: summary.folders,
                                skills: summary.skills,
                              },
                            ),
                            "success",
                          );
                        } catch (error) {
                          showToast(getErrorMessage(error), "error");
                        } finally {
                          setSelfHostedTesting(false);
                        }
                      }}
                      disabled={selfHostedTesting}
                      className="h-8 px-4 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      <RefreshCwIcon
                        className={`w-4 h-4 ${selfHostedTesting ? "animate-spin" : ""}`}
                      />
                      {t("settings.testConnection")}
                    </button>
                    <button
                      onClick={async () => {
                        if (
                          !settings.selfHostedSyncUrl ||
                          !settings.selfHostedSyncUsername ||
                          !settings.selfHostedSyncPassword
                        ) {
                          return;
                        }
                        setSelfHostedUploading(true);
                        try {
                          const summary = await pushToSelfHostedWeb({
                            url: settings.selfHostedSyncUrl,
                            username: settings.selfHostedSyncUsername,
                            password: settings.selfHostedSyncPassword,
                          });
                          showToast(
                            t(
                              "toast.selfHostedSyncPushSuccess",
                              "Uploaded {{prompts}} prompts, {{folders}} folders, and {{skills}} skills to PromptHub Web.",
                              {
                                prompts: summary.prompts,
                                folders: summary.folders,
                                skills: summary.skills,
                              },
                            ),
                            "success",
                          );
                        } catch (error) {
                          showToast(getErrorMessage(error), "error");
                        } finally {
                          setSelfHostedUploading(false);
                        }
                      }}
                      disabled={selfHostedUploading}
                      className="h-8 px-4 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      <UploadIcon className="w-4 h-4" />
                      {t("settings.upload")}
                    </button>
                    <button
                      onClick={async () => {
                        if (
                          !settings.selfHostedSyncUrl ||
                          !settings.selfHostedSyncUsername ||
                          !settings.selfHostedSyncPassword
                        ) {
                          return;
                        }
                        setSelfHostedDownloading(true);
                        try {
                          const summary = await pullFromSelfHostedWeb({
                            url: settings.selfHostedSyncUrl,
                            username: settings.selfHostedSyncUsername,
                            password: settings.selfHostedSyncPassword,
                          });
                          showToast(
                            t(
                              "toast.selfHostedSyncPullSuccess",
                              "Restored {{prompts}} prompts, {{folders}} folders, and {{skills}} skills from PromptHub Web.",
                              {
                                prompts: summary.prompts,
                                folders: summary.folders,
                                skills: summary.skills,
                              },
                            ),
                            "success",
                          );
                          setTimeout(() => window.location.reload(), 1000);
                        } catch (error) {
                          showToast(getErrorMessage(error), "error");
                        } finally {
                          setSelfHostedDownloading(false);
                        }
                      }}
                      disabled={selfHostedDownloading}
                      className="h-8 px-4 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      <DownloadIcon className="w-4 h-4" />
                      {t("settings.download")}
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <div className="flex-1 mr-4">
                      <p className="text-sm font-medium">
                        {t("settings.selfHostedAutoRun", "Automatic Sync")}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t(
                          "settings.selfHostedAutoRunDesc",
                          "Keep desktop and your self-hosted PromptHub workspace aligned on a background schedule.",
                        )}
                      </p>
                    </div>
                    <div className="min-w-[140px]">
                      <Select
                        value={String(settings.selfHostedAutoSyncInterval)}
                        onChange={(val) =>
                          settings.setSelfHostedAutoSyncInterval(Number(val))
                        }
                        options={[
                          { value: "0", label: t("common.off", "Off") },
                          {
                            value: "5",
                            label: t("settings.every5min", "Every 5 minutes"),
                          },
                          {
                            value: "15",
                            label: t("settings.every15min", "Every 15 minutes"),
                          },
                          {
                            value: "30",
                            label: t("settings.every30min", "Every 30 minutes"),
                          },
                          {
                            value: "60",
                            label: t("settings.every60min", "Every 60 minutes"),
                          },
                        ]}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <div className="flex-1 mr-4">
                      <p className="text-sm font-medium">
                        {t(
                          "settings.selfHostedSyncOnStartup",
                          "Run Once on Startup",
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t(
                          "settings.selfHostedSyncOnStartupDesc",
                          "Automatically pull from your self-hosted PromptHub workspace after desktop startup. Changes take effect on next launch.",
                        )}
                      </p>
                    </div>
                    <div className="min-w-[180px]">
                      <Select
                        value={String(
                          settings.selfHostedSyncOnStartup
                            ? settings.selfHostedSyncOnStartupDelay
                            : -1,
                        )}
                        onChange={(val) => {
                          const num = Number(val);
                          if (num === -1) {
                            settings.setSelfHostedSyncOnStartup(false);
                          } else {
                            settings.setSelfHostedSyncOnStartup(true);
                            settings.setSelfHostedSyncOnStartupDelay(num);
                          }
                        }}
                        options={[
                          { value: "-1", label: t("common.off", "Off") },
                          {
                            value: "0",
                            label: t(
                              "settings.startupImmediate",
                              "Run immediately on startup",
                            ),
                          },
                          {
                            value: "5",
                            label: t(
                              "settings.startupDelay5s",
                              "Run 5 seconds after startup",
                            ),
                          },
                          {
                            value: "10",
                            label: t(
                              "settings.startupDelay10s",
                              "Run 10 seconds after startup",
                            ),
                          },
                          {
                            value: "30",
                            label: t(
                              "settings.startupDelay30s",
                              "Run 30 seconds after startup",
                            ),
                          },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </SettingSection>
        ) : null}

        {!webRuntime ? (
        <SettingSection title={t("settings.webdav")}>
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <CloudIcon className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {t("settings.webdavEnabled")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("settings.webdavEnabledDesc")}
                </p>
              </div>
              <ToggleSwitch
                checked={settings.webdavEnabled}
                onChange={settings.setWebdavEnabled}
              />
            </div>
            {settings.webdavEnabled && (
              <div className="space-y-3 pt-2 border-t border-border">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {t("settings.webdavUrl")}
                  </label>
                  <input
                    type="text"
                    placeholder="https://dav.example.com/path"
                    value={settings.webdavUrl}
                    onChange={(e) => settings.setWebdavUrl(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {t("settings.webdavUsername")}
                  </label>
                  <input
                    type="text"
                    placeholder={t("settings.webdavUsername")}
                    value={settings.webdavUsername}
                    onChange={(e) => settings.setWebdavUsername(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {t("settings.webdavPassword")}
                  </label>
                  <PasswordInput
                    placeholder={t("settings.webdavPassword")}
                    value={settings.webdavPassword}
                    onChange={settings.setWebdavPassword}
                    className="h-9"
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    onClick={async () => {
                      if (
                        !settings.webdavUrl ||
                        !settings.webdavUsername ||
                        !settings.webdavPassword
                      ) {
                        return;
                      }
                      setWebdavTesting(true);
                      try {
                        const result = await testConnection({
                          url: settings.webdavUrl,
                          username: settings.webdavUsername,
                          password: settings.webdavPassword,
                        });
                        showToast(
                          result.success
                            ? t("toast.connectionSuccess")
                            : t("toast.connectionFailed"),
                          result.success ? "success" : "error",
                        );
                      } finally {
                        setWebdavTesting(false);
                      }
                    }}
                    disabled={webdavTesting}
                    className="h-8 px-4 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCwIcon
                      className={`w-4 h-4 ${webdavTesting ? "animate-spin" : ""}`}
                    />
                    {t("settings.testConnection")}
                  </button>
                  <button
                    onClick={async () => {
                      if (
                        !settings.webdavUrl ||
                        !settings.webdavUsername ||
                        !settings.webdavPassword
                      ) {
                        return;
                      }
                      setWebdavUploading(true);
                      try {
                        const result = await uploadToWebDAV(
                          {
                            url: settings.webdavUrl,
                            username: settings.webdavUsername,
                            password: settings.webdavPassword,
                          },
                          {
                            includeImages: settings.webdavIncludeImages,
                            incrementalSync: settings.webdavIncrementalSync,
                            encryptionPassword:
                              settings.webdavEncryptionEnabled &&
                              settings.webdavEncryptionPassword
                                ? settings.webdavEncryptionPassword
                                : undefined,
                          },
                        );
                        showToast(
                          result.success ? result.message : result.message,
                          result.success ? "success" : "error",
                        );
                      } finally {
                        setWebdavUploading(false);
                      }
                    }}
                    disabled={webdavUploading}
                    className="h-8 px-4 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <UploadIcon className="w-4 h-4" />
                    {t("settings.upload")}
                  </button>
                  <button
                    onClick={async () => {
                      if (
                        !settings.webdavUrl ||
                        !settings.webdavUsername ||
                        !settings.webdavPassword
                      ) {
                        return;
                      }
                      setWebdavDownloading(true);
                      try {
                        const result = await downloadFromWebDAV(
                          {
                            url: settings.webdavUrl,
                            username: settings.webdavUsername,
                            password: settings.webdavPassword,
                          },
                          {
                            incrementalSync: settings.webdavIncrementalSync,
                            encryptionPassword:
                              settings.webdavEncryptionEnabled &&
                              settings.webdavEncryptionPassword
                                ? settings.webdavEncryptionPassword
                                : undefined,
                          },
                        );
                        if (result.success) {
                          showToast(result.message, "success");
                          setTimeout(() => window.location.reload(), 1000);
                        } else {
                          showToast(result.message, "error");
                        }
                      } finally {
                        setWebdavDownloading(false);
                      }
                    }}
                    disabled={webdavDownloading}
                    className="h-8 px-4 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <DownloadIcon className="w-4 h-4" />
                    {t("settings.download")}
                  </button>
                </div>

                {/* 自动运行（定时同步） */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t("settings.webdavAutoRun", "自动运行")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("settings.webdavAutoRunDesc")}
                    </p>
                  </div>
                  <div className="min-w-[140px]">
                    <Select
                      value={String(settings.webdavAutoSyncInterval)}
                      onChange={(val) =>
                        settings.setWebdavAutoSyncInterval(Number(val))
                      }
                      options={[
                        { value: "0", label: t("common.off", "关闭") },
                        {
                          value: "5",
                          label: t("settings.every5min", "每 5 分钟"),
                        },
                        {
                          value: "15",
                          label: t("settings.every15min", "每 15 分钟"),
                        },
                        {
                          value: "30",
                          label: t("settings.every30min", "每 30 分钟"),
                        },
                        {
                          value: "60",
                          label: t("settings.every60min", "每 60 分钟"),
                        },
                      ]}
                    />
                  </div>
                </div>

                {/* 启动后自动运行一次 */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t("settings.webdavSyncOnStartup", "启动后自动运行一次")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("settings.webdavSyncOnStartupDesc")}
                    </p>
                  </div>
                  <div className="min-w-[180px]">
                    <Select
                      value={String(
                        settings.webdavSyncOnStartup
                          ? settings.webdavSyncOnStartupDelay
                          : -1,
                      )}
                      onChange={(val) => {
                        const num = Number(val);
                        if (num === -1) {
                          settings.setWebdavSyncOnStartup(false);
                        } else {
                          settings.setWebdavSyncOnStartup(true);
                          settings.setWebdavSyncOnStartupDelay(num);
                        }
                      }}
                      options={[
                        { value: "-1", label: t("common.off", "关闭") },
                        {
                          value: "0",
                          label: t(
                            "settings.startupImmediate",
                            "启动后立即运行",
                          ),
                        },
                        {
                          value: "5",
                          label: t(
                            "settings.startupDelay5s",
                            "启动后第 5 秒运行一次",
                          ),
                        },
                        {
                          value: "10",
                          label: t(
                            "settings.startupDelay10s",
                            "启动后第 10 秒运行一次",
                          ),
                        },
                        {
                          value: "30",
                          label: t(
                            "settings.startupDelay30s",
                            "启动后第 30 秒运行一次",
                          ),
                        },
                      ]}
                    />
                  </div>
                </div>

                {/* 保存时同步（实验性质） */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t("settings.webdavSyncOnSave", "保存时同步（实验性质）")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("settings.webdavSyncOnSaveDesc")}
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={settings.webdavSyncOnSave}
                    onChange={settings.setWebdavSyncOnSave}
                  />
                </div>

                {/* 包含图片 */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t("settings.webdavIncludeImages", "包含图片")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("settings.webdavIncludeImagesDesc")}
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={settings.webdavIncludeImages}
                    onChange={settings.setWebdavIncludeImages}
                  />
                </div>

                {/* 增量同步 */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t("settings.webdavIncrementalSync", "增量同步")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("settings.webdavIncrementalSyncDesc")}
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={settings.webdavIncrementalSync}
                    onChange={settings.setWebdavIncrementalSync}
                  />
                </div>

                {/* 加密备份（实验性） */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t("settings.webdavEncryption", "加密备份（实验性）")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 text-amber-500">
                      {t("settings.webdavEncryptionDesc")}
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={settings.webdavEncryptionEnabled}
                    onChange={settings.setWebdavEncryptionEnabled}
                  />
                </div>

                {/* 加密密码输入框 */}
                {settings.webdavEncryptionEnabled && (
                  <div className="pt-2">
                    <PasswordInput
                      placeholder={t(
                        "settings.webdavEncryptionPasswordPlaceholder",
                        "输入加密密码（可选）",
                      )}
                      value={settings.webdavEncryptionPassword}
                      onChange={settings.setWebdavEncryptionPassword}
                      className="h-9"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </SettingSection>
        ) : null}

        <SettingSection title={t("settings.backup")}>
          {/* 选择性导出（只导出） */}
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">
                  {t("settings.selectiveExport", "选择性导出")}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {t(
                    "settings.selectiveExportDesc",
                    "按需导出指定数据（仅导出，不提供导入）",
                  )}
                </div>
              </div>
              <button
                onClick={handleSelectiveExport}
                className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                {t("settings.export", "导出")}
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {(
                [
                  {
                    key: "prompts",
                    label: t("settings.exportPrompts", "Prompts"),
                  },
                  {
                    key: "folders",
                    label: t("settings.exportFolders", "文件夹"),
                  },
                  {
                    key: "images",
                    label: t("settings.exportImages", "图片"),
                  },
                  {
                    key: "aiConfig",
                    label: t("settings.exportAiConfig", "AI 配置"),
                  },
                  {
                    key: "settings",
                    label: t("settings.exportSettings", "系统设置"),
                  },
                  {
                    key: "versions",
                    label: t("settings.exportVersions", "版本历史"),
                  },
                  {
                    key: "skills",
                    label: t("settings.exportSkills", "Skills"),
                  },
                ] as const
              ).map((item) => {
                const checked = (exportScope as any)[item.key] as boolean;
                return (
                  <div
                    key={item.key}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors cursor-pointer select-none ${
                      checked
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/60 hover:bg-muted/40"
                    }`}
                    onClick={() =>
                      setExportScope((prev) => ({
                        ...prev,
                        [item.key]: !checked,
                      }))
                    }
                  >
                    <div className="pointer-events-none">
                      <Checkbox checked={checked} onChange={() => {}} />
                    </div>
                    <span className="text-sm">{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 全量备份/恢复 */}
          <div className="p-4 space-y-3 border-t border-border">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">
                  {t("settings.fullBackup", "全量备份 / 恢复")}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {t(
                    "settings.fullBackupDesc",
                    "用于迁移/跨设备恢复：包含 prompts、图片、AI 配置、系统设置",
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleFullBackup(true)}
                  className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
                  title={t("settings.backupCompressed", "压缩备份")}
                >
                  {t("settings.backupCompressed", "压缩备份")}
                </button>
                <button
                  onClick={handleImportBackup}
                  className="h-9 px-4 rounded-lg bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors"
                >
                  {t("settings.restore", "恢复")}
                </button>
              </div>
            </div>
          </div>

          {!webRuntime ? (
            <div className="p-4 space-y-3 border-t border-border">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">
                    {t("settings.upgradeBackups", "升级备份")}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {t(
                      "settings.upgradeBackupsDesc",
                      "升级前自动创建的本地回滚点。恢复某个快照时，会先把当前状态保存为新快照，再回滚并自动重启。",
                    )}
                  </div>
                </div>
                <button
                  onClick={() => void refreshUpgradeBackups()}
                  disabled={loadingUpgradeBackups}
                  className="h-8 px-3 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCwIcon
                    className={`w-4 h-4 ${loadingUpgradeBackups ? "animate-spin" : ""}`}
                  />
                  {t("common.refresh", "Refresh")}
                </button>
              </div>

              {upgradeBackups.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                  {loadingUpgradeBackups
                    ? t("settings.upgradeBackupsLoading", "Loading upgrade backups...")
                    : t("settings.upgradeBackupsEmpty", "No automatic upgrade backups found yet.")}
                </div>
              ) : (
                <div className="space-y-2">
                  {upgradeBackups.map((backup) => {
                    const busy = upgradeBackupActionId === backup.backupId;
                    return (
                      <div
                        key={backup.backupId}
                        className="rounded-xl border border-border bg-card/60 p-3 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">
                              {backup.manifest.fromVersion}
                              {backup.manifest.toVersion
                                ? ` -> ${backup.manifest.toVersion}`
                                : ""}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 break-all">
                              {backup.backupId}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground shrink-0">
                            {formatBytes(backup.sizeBytes)}
                          </div>
                        </div>

                        <div className="text-xs text-muted-foreground space-y-1">
                          <div>
                            {t("settings.upgradeBackupCreatedAt", "快照时间")}：{new Date(backup.manifest.createdAt).toLocaleString()}
                          </div>
                          <div>
                            {t("settings.upgradeBackupItems", "包含项目")}：{backup.manifest.copiedItems
                              .filter((item) =>
                                ["prompthub.db", "data", "config", "skills", "workspace"].some(
                                  (k) => item.includes(k),
                                ),
                              )
                              .join("、") || backup.manifest.copiedItems.join("、")}
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            onClick={() => setDeleteCandidate(backup)}
                            disabled={busy}
                            className="h-8 px-3 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors disabled:opacity-50"
                          >
                            {t("common.delete", "Delete")}
                          </button>
                          <button
                            onClick={() => setRestoreCandidate(backup)}
                            disabled={busy}
                            className="h-8 px-3 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                          >
                            {busy ? (
                              <Loader2Icon className="w-4 h-4 animate-spin" />
                            ) : null}
                            {t("settings.upgradeBackupRestoreAction", "回滚到此快照")}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {!webRuntime ? (
            <SettingItem
              label={t("settings.clear")}
              description={t("settings.clearDesc")}
            >
              <button
                onClick={handleClearData}
                className="h-9 px-4 rounded-lg bg-destructive text-white text-sm font-medium hover:bg-destructive/90 transition-colors"
              >
                {t("settings.clear")}
              </button>
            </SettingItem>
          ) : null}
        </SettingSection>

        <SettingSection title={t("settings.dbInfo", "本地数据路径")}>
          <div className="p-4 text-sm text-muted-foreground space-y-1">
            {currentDataPath ? (
              [
                "prompthub.db",
                "data/",
                "config/",
                "skills/",
                "backups/",
                "logs/",
              ].map((sub) => (
                <p key={sub} className="font-mono text-xs break-all">
                  {currentDataPath.replace(/\/$/, "")}/{sub}
                </p>
              ))
            ) : (
              <p className="italic">{t("common.loading", "Loading...")}</p>
            )}
          </div>
        </SettingSection>
      </div>

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
                placeholder={
                  t("settings.masterPasswordPlaceholder") || "输入主密码"
                }
              />
            </div>

            <div className="flex gap-2">
              <button
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
                onClick={handleConfirmClear}
                disabled={clearLoading || !clearPwd}
                className="flex-1 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {clearLoading ? (
                  <Loader2Icon className="w-4 h-4 animate-spin mx-auto" />
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
        title={t("settings.upgradeBackupRestoreTitle", "Restore upgrade backup")}
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
        confirmText={t("settings.upgradeBackupRestoreAction", "Restore this snapshot")}
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

      <ConfirmDialog
        isOpen={importPreview !== null}
        onClose={() => {
          if (!confirmingImport) {
            setImportPreview(null);
          }
        }}
        onConfirm={() => {
          void handleConfirmImportBackup();
        }}
        title={t("settings.importPreviewTitle", "Review import summary")}
        message={
          importPreview ? (
            <div className="space-y-2 text-left">
              <p>
                {t("settings.importPreviewFile", "File")}: {importPreview.file.name}
              </p>
              <p>
                {t("settings.importPreviewExportedAt", "Exported at")}: {new Date(
                  importPreview.summary.exportedAt,
                ).toLocaleString()}
              </p>
              <p>
                {t("settings.importPreviewCounts", "Will import")}: {importPreview.summary.counts.prompts} prompts, {importPreview.summary.counts.folders} folders, {importPreview.summary.counts.versions} versions, {importPreview.summary.counts.skills} skills
              </p>
              <p>
                {t(
                  "settings.importPreviewBackupNotice",
                  "PromptHub will automatically create a local safety backup of your current state before importing.",
                )}
              </p>
              {hasAnySkipped(importPreview.summary.skipped) ? (
                <p>
                  {t("settings.importPreviewSkipped", "Invalid records that will be skipped")}: {formatSkippedDetails(importPreview.summary.skipped)}
                </p>
              ) : null}
            </div>
          ) : (
            ""
          )
        }
        confirmText={t("settings.importConfirmAction", "Back up current data and import")}
        cancelText={t("common.cancel", "Cancel")}
        variant="destructive"
        isLoading={confirmingImport}
      />

      <DataRecoveryDialog
        isOpen={showRecoveryBrowser}
        onClose={() => setShowRecoveryBrowser(false)}
        databases={manualRecoveryCandidates}
        persistDismiss={false}
        allowWindowClose={true}
        currentPromptCount={currentPromptCount}
      />
    </>
  );
}
