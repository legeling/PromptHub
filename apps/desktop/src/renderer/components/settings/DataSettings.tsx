import { useState, useEffect, useMemo } from "react";
import type { DragEvent, ReactNode } from "react";
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
  ChevronDownIcon,
  ChevronUpIcon,
  InboxIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  downloadSelectiveExport,
  pickSupportedBackupFile,
} from "../../services/database-backup";
import {
  deleteUpgradeBackup,
  listUpgradeBackups,
  restoreUpgradeBackup,
} from "../../services/upgrade-backup";
import { clearDatabase } from "../../services/database";
import {
  runFullExportBackup,
  runS3ConnectionCheck,
  runS3Download,
  runS3Upload,
  runSelfHostedConnectionCheck,
  runSelfHostedPull,
  runSelfHostedPush,
  runWebDAVConnectionCheck,
  runWebDAVDownload,
  runWebDAVUpload,
} from "../../services/backup-orchestrator";
import { useSettingsStore } from "../../stores/settings.store";
import { usePromptStore } from "../../stores/prompt.store";
import { useToast } from "../ui/Toast";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { DataRecoveryDialog } from "../ui/DataRecoveryDialog";
import { Select } from "../ui/Select";
import { Checkbox } from "../ui";
import {
  SettingItem,
  ToggleSwitch,
  PasswordInput,
} from "./shared";
import { isWebRuntime } from "../../runtime";
import type { RecoveryCandidate, UpgradeBackupEntry } from "@prompthub/shared/types";
import { useBackupImportController } from "../../hooks/useBackupImportController";
import { BackupImportConfirmDialog } from "./BackupImportConfirmDialog";

const MANUAL_RECOVERY_PATHS_STORAGE_KEY = "prompthub-manual-recovery-paths";
const DEFAULT_VISIBLE_UPGRADE_BACKUPS = 3;
const EXPANDED_UPGRADE_BACKUP_MAX_HEIGHT = 420;
const WEBDAV_SYNC_ON_SAVE_AVAILABLE = true;

type DataPathChangeAction = "migrate" | "switch" | "overwrite";
type DataSettingsSubsection =
  | "local"
  | "recovery"
  | "selfHosted"
  | "webdav"
  | "s3"
  | "backup";
type ExportScopeKey =
  | "prompts"
  | "folders"
  | "images"
  | "videos"
  | "aiConfig"
  | "settings"
  | "versions"
  | "rules"
  | "skills";
export type DataSettingsSubsectionId = DataSettingsSubsection;

interface DataPathChangePreview {
  success: boolean;
  error?: string;
  targetPath?: string;
  exists?: boolean;
  hasPromptHubData?: boolean;
  isCurrentPath?: boolean;
  markers?: Array<{ name: string }>;
  targetSummary?: {
    promptCount: number;
    folderCount: number;
    skillCount: number;
    available: boolean;
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

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

interface BackupImportControllerLike {
  requestFileSelection: () => void;
  beginImportFromFile: (file: File) => Promise<void>;
}

function DataSettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="px-1 text-[15px] font-semibold tracking-tight text-foreground/80">
        {title}
      </h3>
      <div className="app-settings-card overflow-hidden">{children}</div>
    </section>
  );
}

function getSyncPanelContentClassName(disabled: boolean): string {
  return disabled ? "space-y-3 pt-2 border-t border-border opacity-60" : "space-y-3 pt-2 border-t border-border";
}

function getSyncProviderOptionLabel(
  provider: "manual" | "webdav" | "self-hosted" | "s3",
  translate: (key: string, fallback: string) => string,
): string {
  switch (provider) {
    case "webdav":
      return translate("settings.webdavSyncMenu", "WebDAV");
    case "self-hosted":
      return translate("settings.selfHostedSyncMenu", "Self-Hosted PromptHub");
    case "s3":
      return translate("settings.s3SyncMenu", "S3 Compatible Storage");
    default:
      return translate("settings.syncProviderManual", "Manual only");
  }
}

/**
 * DataSettings — Data management tab
 * Handles: data path, WebDAV sync, backup/restore, clear data
 * 数据管理标签页：数据路径、WebDAV 同步、备份/恢复、清除数据
 */
interface DataSettingsProps {
  activeSubsection?: DataSettingsSubsectionId;
  backupImportController?: BackupImportControllerLike;
}

export function DataSettings({
  activeSubsection = "local",
  backupImportController,
}: DataSettingsProps) {
  const { t } = useTranslation();
  const translateLabel = (key: string, fallback: string): string => t(key, fallback);
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
  const [showAllUpgradeBackups, setShowAllUpgradeBackups] = useState(false);
  const [restoreCandidate, setRestoreCandidate] = useState<UpgradeBackupEntry | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<UpgradeBackupEntry | null>(null);
  const [manualRecoveryPaths, setManualRecoveryPaths] = useState<string[]>([]);
  const [manualPathInputValue, setManualPathInputValue] = useState("");
  const [scanningRecoverySources, setScanningRecoverySources] = useState(false);
  const [manualRecoveryCandidates, setManualRecoveryCandidates] = useState<
    RecoveryCandidate[]
  >([]);
  const [showRecoveryBrowser, setShowRecoveryBrowser] = useState(false);
  const [pendingDataPathChange, setPendingDataPathChange] =
    useState<DataPathChangePreview | null>(null);
  const [runtimePaths, setRuntimePaths] = useState<null | {
    userDataPath: string;
    dataDir: string;
    databasePath: string;
    promptsDir: string;
    rulesDir: string;
    skillsDir: string;
    backupsDir: string;
    logsDir: string;
  }>(null);
  const [dataPathActionLoading, setDataPathActionLoading] = useState(false);
  const [cacheSize, setCacheSize] = useState<number | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [isBackupDropTargetActive, setIsBackupDropTargetActive] = useState(false);
  const localBackupImportController = useBackupImportController();
  const effectiveBackupImportController =
    backupImportController ?? localBackupImportController;

  useEffect(() => {
    void window.electron?.getCacheSize?.().then((res) => setCacheSize(res.size));
  }, []);

  useEffect(() => {
    if (webRuntime) {
      return;
    }

    void window.electron?.getRuntimePaths?.().then((paths) => {
      if (paths) {
        setRuntimePaths(paths);
      }
    });
  }, [webRuntime]);

  const restartApp = async () => {
    if (window.electron?.relaunchApp) {
      await window.electron.relaunchApp();
      return;
    }
    window.location.reload();
  };

  // WebDAV operation state
  // WebDAV 操作状态
  const [webdavTesting, setWebdavTesting] = useState(false);
  const [webdavUploading, setWebdavUploading] = useState(false);
  const [webdavDownloading, setWebdavDownloading] = useState(false);
  const [s3Testing, setS3Testing] = useState(false);
  const [s3Uploading, setS3Uploading] = useState(false);
  const [s3Downloading, setS3Downloading] = useState(false);
  const [selfHostedTesting, setSelfHostedTesting] = useState(false);
  const [selfHostedUploading, setSelfHostedUploading] = useState(false);
  const [selfHostedDownloading, setSelfHostedDownloading] = useState(false);

  const selfHostedConfigComplete =
    settings.selfHostedSyncUrl.trim().length > 0 &&
    settings.selfHostedSyncUsername.trim().length > 0 &&
    settings.selfHostedSyncPassword.trim().length > 0;
  const webdavConfigComplete =
    settings.webdavUrl.trim().length > 0 &&
    settings.webdavUsername.trim().length > 0 &&
    settings.webdavPassword.trim().length > 0;
  const s3ConfigComplete =
    settings.s3Endpoint.trim().length > 0 &&
    settings.s3Region.trim().length > 0 &&
    settings.s3Bucket.trim().length > 0 &&
    settings.s3AccessKeyId.trim().length > 0 &&
    settings.s3SecretAccessKey.trim().length > 0;
  const s3ControlsDisabled = !settings.s3StorageEnabled;
  const selfHostedIsSyncSource = settings.syncProvider === "self-hosted";
  const webdavIsSyncSource = settings.syncProvider === "webdav";
  const s3IsSyncSource = settings.syncProvider === "s3";
  const syncProviderOptions = [
    {
      value: "manual",
      label: getSyncProviderOptionLabel("manual", translateLabel),
    },
    ...(settings.selfHostedSyncEnabled
      ? [
          {
            value: "self-hosted",
            label: getSyncProviderOptionLabel("self-hosted", translateLabel),
          },
        ]
      : []),
    ...(settings.webdavEnabled
      ? [
          {
            value: "webdav",
            label: getSyncProviderOptionLabel("webdav", translateLabel),
          },
        ]
      : []),
    ...(settings.s3StorageEnabled
      ? [
          {
            value: "s3",
            label: getSyncProviderOptionLabel("s3", translateLabel),
          },
        ]
      : []),
  ];

  // Export/backup options
  // 数据导出/备份选项
  const [exportScope, setExportScope] = useState({
    prompts: true,
    folders: true,
    images: true,
    videos: true,
    aiConfig: true,
    settings: true,
    versions: false,
    rules: true,
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

  const visibleUpgradeBackups = showAllUpgradeBackups
    ? upgradeBackups
    : upgradeBackups.slice(0, DEFAULT_VISIBLE_UPGRADE_BACKUPS);
  const hiddenUpgradeBackupsCount = Math.max(
    0,
    upgradeBackups.length - DEFAULT_VISIBLE_UPGRADE_BACKUPS,
  );
  const normalizedDataPath = currentDataPath.replace(/[\\/]+$/, "");

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

  const handleFullBackup = async () => {
    try {
      await runFullExportBackup({
        currentVersion,
        recordManualBackup: true,
      });
      showToast(t("toast.exportSuccess"), "success");
    } catch (error) {
      console.error("Backup failed:", error);
      showToast(t("toast.exportFailed"), "error");
    }
  };

  const handleImportBackup = () => {
    effectiveBackupImportController.requestFileSelection();
  };

  const backupDropDescription = useMemo(
    () =>
      t(
        "settings.backupDropRestoreDesc",
        "Drag a PromptHub backup archive here to review and restore it quickly.",
      ),
    [t],
  );

  const handleBackupDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsBackupDropTargetActive(false);

    const file = pickSupportedBackupFile(event.dataTransfer.files);
    if (!file) {
      showToast(
        t(
          "settings.backupDropUnsupported",
          "Please drop a PromptHub backup file (.json, .phub.gz, .gz, or .zip).",
        ),
        "error",
      );
      return;
    }

    await effectiveBackupImportController.beginImportFromFile(file);
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

  const finishDataPathChange = async (
    result: {
      success: boolean;
      newPath?: string;
      needsRestart?: boolean;
      backupPath?: string;
      error?: string;
    } | undefined,
    action: DataPathChangeAction,
    fallbackPath: string,
  ) => {
    if (!result?.success) {
      showToast(
        t("toast.dataPathChangeFailed", "Data migration failed") +
          ": " +
          (result?.error || ""),
        "error",
      );
      return;
    }

    const resolvedPath = result.newPath || fallbackPath;
    setDataPath(resolvedPath);
    setPendingDataPathChange(null);
    await refreshDataPathStatus();

    const messageKey =
      action === "switch"
        ? "settings.dataPathSwitchSuccess"
        : action === "overwrite"
          ? "settings.dataPathOverwriteSuccess"
          : "toast.dataPathChanged";
    const fallbackMessage =
      action === "switch"
        ? "Data directory switched"
        : action === "overwrite"
          ? "Data migrated and target backup created"
          : "Data path changed";
    const requiresRestart = result.needsRestart !== false;
    showToast(
      requiresRestart
        ? t(messageKey, fallbackMessage) +
            " " +
            t("settings.restartRequired", "Please restart app")
        : t(messageKey, fallbackMessage),
      "success",
    );

    if (!requiresRestart) {
      return;
    }

    setTimeout(() => {
      if (
        window.confirm(
          t(
            "settings.restartNow",
            "Data migration completed. Restart app now?",
          ),
        )
      ) {
        void restartApp();
      }
    }, 1000);
  };

  const applyDataPathChange = async (
    targetPath: string,
    action: DataPathChangeAction,
  ) => {
    setDataPathActionLoading(true);
    try {
      const result = window.electron?.applyDataPathChange
        ? await window.electron.applyDataPathChange(targetPath, action)
        : await window.electron?.migrateData?.(targetPath);
      await finishDataPathChange(result, action, targetPath);
    } finally {
      setDataPathActionLoading(false);
    }
  };

  const handleChangeDataPath = async () => {
    const newPath = await window.electron?.selectFolder?.();
    if (!newPath) {
      return;
    }

    if (!window.electron?.previewDataPathChange) {
      const confirmed = window.confirm(
        t(
          "settings.confirmDataMigration",
          "Are you sure you want to migrate data to the new directory?\n\nRestart is required after migration.",
        ),
      );
      if (confirmed) {
        await applyDataPathChange(newPath, "migrate");
      }
      return;
    }

    const preview = await window.electron.previewDataPathChange(newPath);
    if (!preview?.success) {
      showToast(
        `${t("toast.dataPathChangeFailed", "Data migration failed")}: ${preview?.error || ""}`,
        "error",
      );
      return;
    }

    if (preview.isCurrentPath) {
      await finishDataPathChange(
        {
          success: true,
          newPath: preview.targetPath || newPath,
          needsRestart: false,
        },
        "switch",
        newPath,
      );
      return;
    }

    if (preview.hasPromptHubData) {
      setPendingDataPathChange(preview);
      return;
    }

    const confirmed = window.confirm(
      t(
        "settings.confirmDataMigration",
        "Are you sure you want to migrate data to the new directory?\n\nRestart is required after migration.",
      ),
    );
    if (confirmed) {
      await applyDataPathChange(preview.targetPath || newPath, "migrate");
    }
  };

  const exportScopeItems: Array<{ key: ExportScopeKey; label: string }> = [
    {
      key: "prompts",
      label: t("settings.exportPrompts", "Prompts"),
    },
    {
      key: "folders",
      label: t("settings.exportFolders", "Folders"),
    },
    {
      key: "images",
      label: t("settings.exportImages", "Media"),
    },
    {
      key: "aiConfig",
      label: t("settings.exportAiConfig", "AI Config"),
    },
    {
      key: "settings",
      label: t("settings.exportSettings", "Settings"),
    },
    {
      key: "versions",
      label: t("settings.exportVersions", "Version History"),
    },
    {
      key: "rules",
      label: t("settings.exportRules", "Rules"),
    },
    {
      key: "skills",
      label: t("settings.exportSkills", "Skills"),
    },
  ];

  return (
    <>
      <div
        className={
          webRuntime
            ? "space-y-6"
            : "data-settings-shell min-w-0 space-y-6"
        }
      >
        {!webRuntime && activeSubsection === "local" ? (
          <DataSettingsSection title={t("settings.dataPath")}>
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
                  onClick={() => void handleChangeDataPath()}
                  disabled={dataPathActionLoading}
                  className="h-8 px-3 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors"
                >
                  {dataPathActionLoading
                    ? t("common.loading", "Loading...")
                    : t("settings.change")}
                </button>
              </div>
            </div>
          </DataSettingsSection>
        ) : null}

        {!webRuntime && activeSubsection === "recovery" ? (
          <DataSettingsSection title={t("settings.recoveryScanner", "历史数据急救")}>
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
          </DataSettingsSection>
        ) : null}

        {!webRuntime && activeSubsection === "selfHosted" ? (
          <DataSettingsSection title={t("settings.selfHostedSyncMenu", "Self-Hosted PromptHub")}>
            <div className="p-4 space-y-4">
              <div className="rounded-xl border border-border bg-muted/30 px-3 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">
                      {t("settings.syncProviderTitle", "Current sync source")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t(
                        "settings.syncProviderDesc",
                        "You can enable multiple backup targets, but automatic sync uses only one source at a time to avoid conflicts.",
                      )}
                    </p>
                  </div>
                  <div className="min-w-[220px]">
                    <Select
                      value={settings.syncProvider}
                      onChange={(value) =>
                        settings.setSyncProvider(
                          value as "manual" | "webdav" | "self-hosted" | "s3",
                        )
                      }
                      options={syncProviderOptions}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <ServerCogIcon className="w-5 h-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {t("settings.selfHostedSyncMenu", "Self-Hosted PromptHub")}
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

              <div className={getSyncPanelContentClassName(!settings.selfHostedSyncEnabled)}>
                <fieldset disabled={!settings.selfHostedSyncEnabled} className="space-y-3 min-w-0">
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
                      disabled={!settings.selfHostedSyncEnabled}
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
                          const summary = await runSelfHostedConnectionCheck({
                            url: settings.selfHostedSyncUrl,
                            username: settings.selfHostedSyncUsername,
                            password: settings.selfHostedSyncPassword,
                          });
                          showToast(
                            t(
                              "toast.selfHostedSyncConnectionSuccess",
                              "Connection successful. Remote workspace currently stores {{prompts}} prompts, {{folders}} folders, {{rules}} rules, and {{skills}} skills.",
                              {
                                prompts: summary.prompts,
                                folders: summary.folders,
                                rules: summary.rules,
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
                        disabled={selfHostedTesting || !selfHostedConfigComplete}
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
                          const summary = await runSelfHostedPush({
                            url: settings.selfHostedSyncUrl,
                            username: settings.selfHostedSyncUsername,
                            password: settings.selfHostedSyncPassword,
                          });
                          showToast(
                            t(
                              "toast.selfHostedSyncPushSuccess",
                              "Uploaded {{prompts}} prompts, {{folders}} folders, {{rules}} rules, and {{skills}} skills to PromptHub Web.",
                              {
                                prompts: summary.prompts,
                                folders: summary.folders,
                                rules: summary.rules,
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
                        disabled={selfHostedUploading || !selfHostedConfigComplete}
                        className="h-8 px-4 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      <UploadIcon className="w-4 h-4" />
                      {t("settings.backupToRemote", "Back up to remote")}
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
                          const summary = await runSelfHostedPull({
                            config: {
                              url: settings.selfHostedSyncUrl,
                              username: settings.selfHostedSyncUsername,
                              password: settings.selfHostedSyncPassword,
                            },
                          });
                          showToast(
                            t(
                              "toast.selfHostedSyncPullSuccess",
                              "Restored {{prompts}} prompts, {{folders}} folders, {{rules}} rules, and {{skills}} skills from PromptHub Web.",
                              {
                                prompts: summary.prompts,
                                folders: summary.folders,
                                rules: summary.rules,
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
                        disabled={selfHostedDownloading || !selfHostedConfigComplete}
                        className="h-8 px-4 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      <DownloadIcon className="w-4 h-4" />
                      {t("settings.updateFromRemote", "Update from remote")}
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <div className="flex-1 mr-4">
                      <p className="text-sm font-medium">
                        {t("settings.selfHostedAutoRun", "Automatic Sync")}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {selfHostedIsSyncSource
                          ? t(
                              "settings.selfHostedAutoRunDesc",
                              "Keep desktop and your self-hosted PromptHub workspace aligned on a background schedule.",
                            )
                          : t(
                              "settings.syncSourceInactiveDesc",
                              "This target stays available for manual backup and restore, but automatic sync only runs for the current sync source.",
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
                </fieldset>
              </div>
            </div>
          </DataSettingsSection>
        ) : null}

        {!webRuntime && activeSubsection === "webdav" ? (
        <DataSettingsSection title={t("settings.webdavSyncMenu", "WebDAV")}>
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <CloudIcon className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {t("settings.webdavSyncMenu", "WebDAV")}
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
            <div className={getSyncPanelContentClassName(!settings.webdavEnabled)}>
              <fieldset disabled={!settings.webdavEnabled} className="space-y-3 min-w-0">
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
                      disabled={!settings.webdavEnabled}
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
                        const result = await runWebDAVConnectionCheck({
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
                    disabled={webdavTesting || !webdavConfigComplete}
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
                        const result = await runWebDAVUpload({
                          config: {
                            url: settings.webdavUrl,
                            username: settings.webdavUsername,
                            password: settings.webdavPassword,
                          },
                          options: {
                            includeImages: settings.webdavIncludeImages,
                            incrementalSync: settings.webdavIncrementalSync,
                            encryptionPassword:
                              settings.webdavEncryptionEnabled &&
                              settings.webdavEncryptionPassword
                                ? settings.webdavEncryptionPassword
                                : undefined,
                          },
                        });
                        showToast(
                          result.success ? result.message : result.message,
                          result.success ? "success" : "error",
                        );
                      } finally {
                        setWebdavUploading(false);
                      }
                    }}
                    disabled={webdavUploading || !webdavConfigComplete}
                    className="h-8 px-4 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <UploadIcon className="w-4 h-4" />
                    {t("settings.backupToRemote", "Back up to remote")}
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
                        const result = await runWebDAVDownload({
                          config: {
                            url: settings.webdavUrl,
                            username: settings.webdavUsername,
                            password: settings.webdavPassword,
                          },
                          options: {
                            incrementalSync: settings.webdavIncrementalSync,
                            encryptionPassword:
                              settings.webdavEncryptionEnabled &&
                              settings.webdavEncryptionPassword
                                ? settings.webdavEncryptionPassword
                                : undefined,
                          },
                        });
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
                    disabled={webdavDownloading || !webdavConfigComplete}
                    className="h-8 px-4 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <DownloadIcon className="w-4 h-4" />
                    {t("settings.updateFromRemote", "Update from remote")}
                  </button>
                </div>

                {/* 自动运行（定时同步） */}
                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <div className="flex-1 mr-4">
                      <p className="text-sm font-medium">
                        {t("settings.webdavAutoRun", "自动运行")}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {webdavIsSyncSource
                          ? t("settings.webdavAutoRunDesc")
                          : t(
                              "settings.syncSourceInactiveDesc",
                              "This target stays available for manual backup and restore, but automatic sync only runs for the current sync source.",
                            )}
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
                      {WEBDAV_SYNC_ON_SAVE_AVAILABLE
                        ? t("settings.webdavSyncOnSaveDesc")
                        : t("settings.webdavSyncOnSaveUnavailableDesc")}
                    </p>
                  </div>
                    <ToggleSwitch
                      checked={settings.webdavSyncOnSave}
                      onChange={settings.setWebdavSyncOnSave}
                      disabled={
                        !settings.webdavEnabled || !WEBDAV_SYNC_ON_SAVE_AVAILABLE
                      }
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
                      disabled={!settings.webdavEnabled}
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
                      disabled={!settings.webdavEnabled}
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
                      disabled={!settings.webdavEnabled}
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
                      disabled={!settings.webdavEnabled}
                      className="h-9"
                    />
                  </div>
                )}
              </fieldset>
            </div>
          </div>
        </DataSettingsSection>
        ) : null}

        {!webRuntime && activeSubsection === "s3" ? (
        <DataSettingsSection title={t("settings.s3SyncMenu", "S3 Compatible Storage")}>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  {t("settings.s3SyncMenu", "S3 Compatible Storage")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t(
                    "settings.s3StorageDesc",
                    "Configure an S3-compatible object storage backup target such as AWS S3, Cloudflare R2, OSS, or COS.",
                  )}
                </p>
              </div>
              <ToggleSwitch
                checked={settings.s3StorageEnabled}
                onChange={settings.setS3StorageEnabled}
              />
            </div>

            <div className={getSyncPanelContentClassName(s3ControlsDisabled)}>
              <fieldset disabled={s3ControlsDisabled} className="space-y-3 min-w-0">
                <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {t("settings.s3Endpoint", "API endpoint")}
                </label>
                <input
                  type="url"
                  placeholder="https://s3.example.com"
                  value={settings.s3Endpoint}
                  onChange={(e) => settings.setS3Endpoint(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {t("settings.s3Region", "Region")}
                </label>
                <input
                  type="text"
                  placeholder="us-east-1"
                  value={settings.s3Region}
                  onChange={(e) => settings.setS3Region(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {t("settings.s3Bucket", "Bucket")}
                </label>
                <input
                  type="text"
                  placeholder="prompthub-backups"
                  value={settings.s3Bucket}
                  onChange={(e) => settings.setS3Bucket(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {t("settings.s3AccessKeyId", "Access Key ID")}
                </label>
                <input
                  type="text"
                  placeholder={t("settings.s3AccessKeyId", "Access Key ID")}
                  value={settings.s3AccessKeyId}
                  onChange={(e) => settings.setS3AccessKeyId(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {t("settings.s3SecretAccessKey", "Secret Access Key")}
                </label>
                <PasswordInput
                  placeholder={t("settings.s3SecretAccessKey", "Secret Access Key")}
                  value={settings.s3SecretAccessKey}
                  onChange={settings.setS3SecretAccessKey}
                  disabled={!settings.s3StorageEnabled}
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {t("settings.s3BackupPrefix", "Backup directory (optional)")}
                </label>
                <input
                  type="text"
                  placeholder="/prompthub"
                  value={settings.s3BackupPrefix}
                  onChange={(e) => settings.setS3BackupPrefix(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
                />
              </div>
              </fieldset>
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              <button
                onClick={async () => {
                  if (!s3ConfigComplete) {
                    return;
                  }

                  setS3Testing(true);
                  try {
                    const result = await runS3ConnectionCheck({
                      endpoint: settings.s3Endpoint,
                      region: settings.s3Region,
                      bucket: settings.s3Bucket,
                      accessKeyId: settings.s3AccessKeyId,
                      secretAccessKey: settings.s3SecretAccessKey,
                      backupPrefix: settings.s3BackupPrefix,
                    });
                    showToast(result.message, result.success ? "success" : "error");
                  } finally {
                    setS3Testing(false);
                  }
                }}
                disabled={s3Testing || !s3ConfigComplete || !settings.s3StorageEnabled}
                className="h-8 px-4 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <RefreshCwIcon className={`w-4 h-4 ${s3Testing ? "animate-spin" : ""}`} />
                {t("settings.testConnection")}
              </button>
              <button
                onClick={async () => {
                  if (!s3ConfigComplete) {
                    return;
                  }

                  setS3Uploading(true);
                  try {
                    const result = await runS3Upload({
                      config: {
                        endpoint: settings.s3Endpoint,
                        region: settings.s3Region,
                        bucket: settings.s3Bucket,
                        accessKeyId: settings.s3AccessKeyId,
                        secretAccessKey: settings.s3SecretAccessKey,
                        backupPrefix: settings.s3BackupPrefix,
                      },
                      options: {
                        includeImages: settings.s3IncludeImages,
                        incrementalSync: settings.s3IncrementalSync,
                        encryptionPassword:
                          settings.s3EncryptionEnabled && settings.s3EncryptionPassword
                            ? settings.s3EncryptionPassword
                            : undefined,
                      },
                    });
                    showToast(result.message, result.success ? "success" : "error");
                  } finally {
                    setS3Uploading(false);
                  }
                }}
                disabled={s3Uploading || !s3ConfigComplete || !settings.s3StorageEnabled}
                className="h-8 px-4 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <UploadIcon className="w-4 h-4" />
                {t("settings.backupToRemote", "Back up to remote")}
              </button>
              <button
                onClick={async () => {
                  if (!s3ConfigComplete) {
                    return;
                  }

                  setS3Downloading(true);
                  try {
                    const result = await runS3Download({
                      config: {
                        endpoint: settings.s3Endpoint,
                        region: settings.s3Region,
                        bucket: settings.s3Bucket,
                        accessKeyId: settings.s3AccessKeyId,
                        secretAccessKey: settings.s3SecretAccessKey,
                        backupPrefix: settings.s3BackupPrefix,
                      },
                      options: {
                        incrementalSync: settings.s3IncrementalSync,
                        encryptionPassword:
                          settings.s3EncryptionEnabled && settings.s3EncryptionPassword
                            ? settings.s3EncryptionPassword
                            : undefined,
                      },
                    });
                    if (result.success) {
                      showToast(result.message, "success");
                      setTimeout(() => window.location.reload(), 1000);
                    } else {
                      showToast(result.message, "error");
                    }
                  } finally {
                    setS3Downloading(false);
                  }
                }}
                disabled={s3Downloading || !s3ConfigComplete || !settings.s3StorageEnabled}
                className="h-8 px-4 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <DownloadIcon className="w-4 h-4" />
                {t("settings.updateFromRemote", "Update from remote")}
              </button>
            </div>

            <div className={getSyncPanelContentClassName(s3ControlsDisabled)}>
              <fieldset disabled={s3ControlsDisabled} className="space-y-3 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t("settings.webdavAutoRun", "Automatic sync")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s3IsSyncSource
                        ? t("settings.webdavAutoRunDesc")
                        : t(
                            "settings.syncSourceInactiveDesc",
                            "This target stays available for manual backup and restore, but automatic sync only runs for the current sync source.",
                          )}
                    </p>
                  </div>
                <div className="min-w-[140px]">
                  <Select
                    value={String(settings.s3AutoSyncInterval)}
                    onChange={(val) => settings.setS3AutoSyncInterval(Number(val))}
                    disabled={!settings.s3StorageEnabled}
                    options={[
                      { value: "0", label: t("common.off", "Off") },
                      { value: "5", label: t("settings.every5min", "Every 5 minutes") },
                      { value: "15", label: t("settings.every15min", "Every 15 minutes") },
                      { value: "30", label: t("settings.every30min", "Every 30 minutes") },
                      { value: "60", label: t("settings.every60min", "Every 60 minutes") },
                    ]}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
                <div className="flex-1 mr-4">
                  <p className="text-sm font-medium">
                    {t("settings.webdavSyncOnStartup", "Run Once on Startup")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("settings.webdavSyncOnStartupDesc")}
                  </p>
                </div>
                <div className="min-w-[180px]">
                  <Select
                    value={String(
                      settings.s3SyncOnStartup
                        ? settings.s3SyncOnStartupDelay
                        : -1,
                    )}
                    onChange={(val) => {
                      const num = Number(val);
                      if (num === -1) {
                        settings.setS3SyncOnStartup(false);
                      } else {
                        settings.setS3SyncOnStartup(true);
                        settings.setS3SyncOnStartupDelay(num);
                      }
                    }}
                    disabled={!settings.s3StorageEnabled}
                    options={[
                      { value: "-1", label: t("common.off", "Off") },
                      { value: "0", label: t("settings.startupImmediate", "Run immediately on startup") },
                      { value: "5", label: t("settings.startupDelay5s", "Run 5 seconds after startup") },
                      { value: "10", label: t("settings.startupDelay10s", "Run 10 seconds after startup") },
                      { value: "30", label: t("settings.startupDelay30s", "Run 30 seconds after startup") },
                    ]}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
                <div className="flex-1 mr-4">
                  <p className="text-sm font-medium">
                    {t("settings.webdavSyncOnSave", "Sync on Save (Experimental)")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("settings.webdavSyncOnSaveDesc")}
                  </p>
                </div>
                <ToggleSwitch
                  checked={settings.s3SyncOnSave}
                  onChange={settings.setS3SyncOnSave}
                  disabled={!settings.s3StorageEnabled}
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
                <div className="flex-1 mr-4">
                  <p className="text-sm font-medium">
                    {t("settings.webdavIncludeImages", "Include Images")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("settings.webdavIncludeImagesDesc")}
                  </p>
                </div>
                <ToggleSwitch
                  checked={settings.s3IncludeImages}
                  onChange={settings.setS3IncludeImages}
                  disabled={!settings.s3StorageEnabled}
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
                <div className="flex-1 mr-4">
                  <p className="text-sm font-medium">
                    {t("settings.webdavIncrementalSync", "Incremental Sync")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("settings.webdavIncrementalSyncDesc")}
                  </p>
                </div>
                <ToggleSwitch
                  checked={settings.s3IncrementalSync}
                  onChange={settings.setS3IncrementalSync}
                  disabled={!settings.s3StorageEnabled}
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
                <div className="flex-1 mr-4">
                  <p className="text-sm font-medium">
                    {t("settings.webdavEncryption", "Encrypt Backup (Experimental)")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 text-amber-500">
                    {t("settings.webdavEncryptionDesc")}
                  </p>
                </div>
                  <ToggleSwitch
                    checked={settings.s3EncryptionEnabled}
                    onChange={settings.setS3EncryptionEnabled}
                    disabled={!settings.s3StorageEnabled}
                  />
                </div>

                {settings.s3EncryptionEnabled ? (
                  <div className="pt-2">
                    <PasswordInput
                      placeholder={t(
                        "settings.webdavEncryptionPasswordPlaceholder",
                        "Enter encryption password (optional, leave empty to skip)",
                      )}
                      value={settings.s3EncryptionPassword}
                      onChange={settings.setS3EncryptionPassword}
                      disabled={!settings.s3StorageEnabled}
                      className="h-9"
                    />
                  </div>
                ) : null}
              </fieldset>
            </div>
          </div>
        </DataSettingsSection>
        ) : null}

        {webRuntime || activeSubsection === "backup" ? (
        <DataSettingsSection title={t("settings.backup")}>
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
              {exportScopeItems.map((item) => {
                const checked = exportScope[item.key];
                return (
                  <div
                    key={item.key}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors cursor-pointer select-none ${
                      checked
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/60 hover:bg-muted/40"
                    }`}
                    onClick={() =>
                      setExportScope((prev) => {
                        if (item.key === "images") {
                          return {
                            ...prev,
                            images: !checked,
                            videos: !checked,
                          };
                        }

                        return {
                          ...prev,
                          [item.key]: !checked,
                        };
                      })
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
                    "用于迁移/跨设备恢复：包含 prompts、图片、AI 配置、系统设置、规则与 Skill",
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleFullBackup()}
                  className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
                  title={t("settings.fullBackupExport", "全量备份")}
                >
                  {t("settings.fullBackupExport", "全量备份")}
                </button>
                <button
                  onClick={handleImportBackup}
                  title={t("settings.import", "导入数据")}
                  className="h-9 px-4 rounded-lg bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors"
                >
                  {t("settings.import", "导入数据")}
                </button>
              </div>
            </div>

            <div
              onDragOver={(event) => {
                event.preventDefault();
                if (
                  Array.from(event.dataTransfer.items).some(
                    (item) => item.kind === "file",
                  )
                ) {
                  setIsBackupDropTargetActive(true);
                }
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                if (
                  Array.from(event.dataTransfer.items).some(
                    (item) => item.kind === "file",
                  )
                ) {
                  setIsBackupDropTargetActive(true);
                }
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setIsBackupDropTargetActive(false);
                }
              }}
              onDrop={(event) => {
                void handleBackupDrop(event);
              }}
              className={`rounded-xl border border-dashed px-4 py-5 transition-colors ${
                isBackupDropTargetActive
                  ? "border-primary bg-primary/8"
                  : "border-border bg-muted/15"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    isBackupDropTargetActive
                      ? "bg-primary text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <InboxIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="text-sm font-medium text-foreground">
                    {t("settings.backupDropRestore", "拖拽恢复备份")}
                  </div>
                  <div className="text-xs leading-5 text-muted-foreground">
                    {backupDropDescription}
                  </div>
                  <div className="text-[11px] text-muted-foreground/80">
                    {t(
                      "settings.backupDropRestoreFormats",
                      "Supported: .json, .phub.gz, .gz, .zip",
                    )}
                  </div>
                </div>
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
                  className="h-8 shrink-0 whitespace-nowrap px-3 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCwIcon
                    className={`w-4 h-4 shrink-0 ${loadingUpgradeBackups ? "animate-spin" : ""}`}
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
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2.5">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-foreground">
                        {t(
                          "settings.upgradeBackupsSummary",
                          "{{count}} rollback snapshot(s)",
                          { count: upgradeBackups.length },
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {showAllUpgradeBackups
                          ? t(
                              "settings.upgradeBackupsSummaryExpanded",
                              "Showing full history in a scrollable list",
                            )
                          : hiddenUpgradeBackupsCount > 0
                            ? t(
                                "settings.upgradeBackupsSummaryCollapsed",
                                "Latest {{count}} shown by default",
                                {
                                  count: DEFAULT_VISIBLE_UPGRADE_BACKUPS,
                                },
                              )
                            : t(
                                "settings.upgradeBackupsSummaryCompact",
                                "All snapshots fit in the compact list",
                              )}
                      </span>
                    </div>

                    {hiddenUpgradeBackupsCount > 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setShowAllUpgradeBackups((current) => !current)
                        }
                        className="h-8 px-3 rounded-lg bg-background text-sm hover:bg-accent transition-colors inline-flex items-center gap-2"
                      >
                        {showAllUpgradeBackups ? (
                          <ChevronUpIcon className="w-4 h-4" />
                        ) : (
                          <ChevronDownIcon className="w-4 h-4" />
                        )}
                        {showAllUpgradeBackups
                          ? t("common.collapse", "Collapse")
                          : t(
                              "settings.upgradeBackupsShowAll",
                              "Show all {{count}}",
                              { count: upgradeBackups.length },
                            )}
                      </button>
                    ) : null}
                  </div>

                  <div
                    className="space-y-2 overflow-y-auto pr-1"
                    style={{
                      maxHeight:
                        showAllUpgradeBackups &&
                        upgradeBackups.length > DEFAULT_VISIBLE_UPGRADE_BACKUPS
                          ? `${EXPANDED_UPGRADE_BACKUP_MAX_HEIGHT}px`
                          : undefined,
                    }}
                  >
                  {visibleUpgradeBackups.map((backup) => {
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
                </div>
              )}
            </div>
          ) : null}

        </DataSettingsSection>
        ) : null}

        {!webRuntime && activeSubsection === "local" ? (
          <DataSettingsSection title={t("settings.dbInfo", "数据目录")}>
            <div className="divide-y divide-border">
              {normalizedDataPath ? (
                <>
                  {[
                    {
                      label: t("settings.applicationData", "应用数据"),
                      path: runtimePaths?.userDataPath ?? normalizedDataPath,
                      actionLabel: t("settings.openFolder"),
                    },
                    {
                      label: t("settings.databaseFile", "主数据库"),
                      path: runtimePaths?.databasePath ?? `${normalizedDataPath}/data/prompthub.db`,
                      actionLabel: t("settings.openFolder"),
                    },
                    {
                      label: t("settings.promptsData", "Prompt 文件"),
                      path: runtimePaths?.promptsDir ?? `${normalizedDataPath}/data/prompts`,
                      actionLabel: t("settings.openFolder"),
                    },
                    {
                      label: t("settings.applicationLogs", "应用日志"),
                      path: runtimePaths?.logsDir ?? `${normalizedDataPath}/logs`,
                      actionLabel: t("settings.openLogs", "打开日志"),
                    },
                    {
                      label: t("settings.rulesData", "规则文件"),
                      path: runtimePaths?.rulesDir ?? `${normalizedDataPath}/data/rules`,
                      actionLabel: t("settings.openFolder"),
                    },
                    {
                      label: t("settings.skillsData", "Skills 目录"),
                      path: runtimePaths?.skillsDir ?? `${normalizedDataPath}/data/skills`,
                      actionLabel: t("settings.openFolder"),
                    },
                    {
                      label: t("settings.backupsData", "备份目录"),
                      path: runtimePaths?.backupsDir ?? `${normalizedDataPath}/backups`,
                      actionLabel: t("settings.openFolder"),
                    },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-4 px-5 py-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{item.label}</p>
                        <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
                          {item.path}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void window.electron?.openPath?.(item.path)}
                        className="h-8 shrink-0 rounded-lg border border-border bg-muted px-3 text-sm text-foreground transition-colors hover:bg-muted/80"
                      >
                        {item.actionLabel}
                      </button>
                    </div>
                  ))}

                  {/* Cache row */}
                  <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {t("settings.cacheData", "应用缓存")}
                        {cacheSize !== null && (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            ({formatBytes(cacheSize)})
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("settings.cacheDataDesc", "Electron 渲染进程缓存，不影响数据")}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={clearingCache}
                      onClick={() => {
                        setClearingCache(true);
                        void window.electron?.clearCache?.().then(async () => {
                          const res = await window.electron?.getCacheSize?.();
                          setCacheSize(res?.size ?? 0);
                          setClearingCache(false);
                          showToast(t("settings.cacheClearedToast", "缓存已清除"), "success");
                        });
                      }}
                      className="h-8 shrink-0 rounded-lg border border-border bg-muted px-3 text-sm text-foreground transition-colors hover:bg-muted/80 disabled:opacity-50"
                    >
                      {clearingCache ? t("common.loading", "Loading...") : t("settings.clearCache", "清除缓存")}
                    </button>
                  </div>
                </>
              ) : (
                <div className="px-5 py-4">
                  <p className="text-sm italic text-muted-foreground">
                    {t("common.loading", "Loading...")}
                  </p>
                </div>
              )}
            </div>
          </DataSettingsSection>
        ) : null}

        {!webRuntime && activeSubsection === "backup" ? (
        <DataSettingsSection title={t("settings.dangerOperation", "Danger")}>
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
        </DataSettingsSection>
        ) : null}
      </div>

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
                onClick={() => setPendingDataPathChange(null)}
                disabled={dataPathActionLoading}
                className="h-10 px-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                onClick={() =>
                  void applyDataPathChange(
                    pendingDataPathChange.targetPath || "",
                    "switch",
                  )
                }
                disabled={dataPathActionLoading}
                className="h-10 px-4 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {t("settings.switchToExistingDataPath", "Switch to this directory")}
              </button>
              <button
                onClick={() => {
                  const confirmed = window.confirm(
                    t(
                      "settings.confirmOverwriteDataPath",
                      "Overwrite the data in this directory with the current computer's data? A backup of the target directory will be created first.",
                    ),
                  );
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
                {t("settings.overwriteAndMigrateDataPath", "Overwrite and migrate")}
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
