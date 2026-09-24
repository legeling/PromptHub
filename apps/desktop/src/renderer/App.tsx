import { migrateLegacyIndexedDbToMainProcess } from "./services/migrations/indexeddb";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { usePromptStore } from "./stores/prompt.store";
import { useFolderStore } from "./stores/folder.store";
import { useSettingsStore } from "./stores/settings.store";
import { useUIStore } from "./stores/ui.store";
import {
  getRenderedBackgroundImageBlur,
  getRenderedBackgroundImageOpacity,
  loadSettingsFromMainProcess,
} from "./stores/settings.store";
import type { ImportedPromptData } from "./components/prompt/ImportPromptModal";
import {
  runS3AutoSync,
  runSelfHostedAutoSync as executeSelfHostedAutoSync,
  runWebDAVAutoSync,
} from "./services/backup-orchestrator";
import {
  hasValidS3Config,
  hasValidSelfHostedConfig,
  hasValidWebDAVConfig,
  shouldRunBackgroundUpdateCheck,
  shouldRunPeriodicS3Sync,
  shouldRunPeriodicSelfHostedSync,
  shouldRunPeriodicWebDAVSync,
  shouldRunStartupS3Sync,
  shouldRunStartupSelfHostedSync,
  shouldRunStartupWebDAVSync,
} from "./services/app-background";
import { registerPeriodicAutoSyncController } from "./services/periodic-auto-sync";
import {
  recordAutoSyncHistory,
  type AutoSyncProviderKind,
  type AutoSyncReason,
} from "./services/sync-history";
import { useToast } from "./components/ui/Toast";
import i18n from "./i18n";
import { useTranslation } from "react-i18next";
import type { UpdateStatus } from "./components/UpdateDialog";
import { Spinner } from "./components/ui/Spinner";
import { isWebRuntime } from "./runtime";
import { useBackupImportController } from "./hooks/useBackupImportController";
import { waitForPersistHydration } from "./utils/persist-hydration";
import { createLocalDataRefreshController } from "./services/local-data-refresh";
import { migrateRendererPersistence } from "./services/renderer-persistence";

// Lazy load heavy components for better initial load performance
// 懒加载大型组件以提升初始加载性能
const SettingsPage = lazy(() =>
  import("./components/settings/SettingsPage").then((m) => ({
    default: m.SettingsPage,
  })),
);
const AppWorkspaceShell = lazy(() =>
  import("./components/app/AppWorkspaceShell").then((m) => ({
    default: m.AppWorkspaceShell,
  })),
);
const UpdateDialog = lazy(() =>
  import("./components/UpdateDialog").then((m) => ({
    default: m.UpdateDialog,
  })),
);
const EditPromptModal = lazy(() =>
  import("./components/prompt/EditPromptModal").then((m) => ({
    default: m.EditPromptModal,
  })),
);
const CloseDialog = lazy(() =>
  import("./components/ui/CloseDialog").then((m) => ({
    default: m.CloseDialog,
  })),
);
const BackupImportConfirmDialog = lazy(() =>
  import("./components/settings/BackupImportConfirmDialog").then((m) => ({
    default: m.BackupImportConfirmDialog,
  })),
);
// Page type
// 页面类型
type PageType = "home" | "settings";

function App() {
  const { t } = useTranslation();
  const fetchPrompts = usePromptStore((state) => state.fetchPrompts);
  const fetchFolders = useFolderStore((state) => state.fetchFolders);
  const folders = useFolderStore((state) => state.folders);
  const updatePrompt = usePromptStore((state) => state.updatePrompt);
  const movePrompts = usePromptStore((state) => state.movePrompts);
  const selectedIds = usePromptStore((state) => state.selectedIds);
  const applyTheme = useSettingsStore((state) => state.applyTheme);
  const inferUpdateChannel = useSettingsStore(
    (state) => state.inferUpdateChannel,
  );
  const backgroundImageFileName = useSettingsStore(
    (state) => state.backgroundImageFileName,
  );
  const backgroundImageEnabled = useSettingsStore(
    (state) => state.backgroundImageEnabled,
  );
  const backgroundImageOpacity = useSettingsStore(
    (state) => state.backgroundImageOpacity,
  );
  const backgroundImageBlur = useSettingsStore(
    (state) => state.backgroundImageBlur,
  );
  const debugMode = useSettingsStore((state) => state.debugMode);
  const shortcutModes = useSettingsStore((state) => state.shortcutModes);
  const pendingSettingsSection = useUIStore(
    (state) => state.pendingSettingsSection,
  );
  const [currentPage, setCurrentPage] = useState<PageType>("home");
  const [isLoading, setIsLoading] = useState(true);
  const [startupError, setStartupError] = useState<Error | null>(null);
  const { showToast } = useToast();
  const backupImportController = useBackupImportController();

  const clipboardImportEnabled = useSettingsStore(
    (state) => state.clipboardImportEnabled,
  );
  const [importData, setImportData] = useState<ImportedPromptData | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const lastClipboardChecksumRef = useRef<string>("");
  const isUpdateCheckInFlightRef = useRef(false);
  const isWebDAVSyncInFlightRef = useRef(false);
  const pendingStartupSyncRef = useRef(false);
  const isS3SyncInFlightRef = useRef(false);
  const pendingS3StartupSyncRef = useRef(false);
  const isSelfHostedSyncInFlightRef = useRef(false);
  const pendingSelfHostedStartupSyncRef = useRef(false);
  const isWindowVisibleRef = useRef(true);

  // OS-level fullscreen state (synced from main process events)
  // OS 级全屏状态（通过主进程事件同步）
  const [isOsFullscreen, setIsOsFullscreen] = useState(false);

  useEffect(() => {
    if (pendingSettingsSection) {
      setCurrentPage("settings");
    }
  }, [pendingSettingsSection]);

  // Update state
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [initialUpdateStatus, setInitialUpdateStatus] =
    useState<UpdateStatus | null>(null);
  const lastUpdateStatusRef = useRef<UpdateStatus | null>(null);

  // Open the update dialog, seeding the last known status so both the TopBar
  // button and the custom `open-update-dialog` event start the dialog from
  // the same baseline. Without this, TopBar opened with a stale
  // `initialUpdateStatus` from a previous session and the dialog briefly
  // showed the wrong state before re-checking (review feedback on #122).
  const openUpdateDialog = useCallback(() => {
    setInitialUpdateStatus(lastUpdateStatusRef.current);
    setShowUpdateDialog(true);
  }, []);

  // Close dialog state (Windows)
  // 关闭对话框状态（Windows）
  const [showCloseDialog, setShowCloseDialog] = useState(false);

  // Update status (used for TopBar indicator)
  // 更新状态（用于顶部栏显示更新提示）
  const [updateAvailable, setUpdateAvailable] = useState<UpdateStatus | null>(
    null,
  );

  // Local shortcuts state
  // 局部快捷键状态
  const [localShortcuts, setLocalShortcuts] = useState<Record<string, string>>(
    {},
  );
  const normalizedBackgroundImageFileName = backgroundImageFileName?.trim();
  const hasBackgroundImage =
    !isWebRuntime() &&
    backgroundImageEnabled &&
    typeof normalizedBackgroundImageFileName === "string";
  const renderedBackgroundBlur =
    getRenderedBackgroundImageBlur(backgroundImageBlur);
  const renderedBackgroundImageOpacity = getRenderedBackgroundImageOpacity(
    backgroundImageOpacity,
  );
  const webRuntime = isWebRuntime();

  useEffect(() => {
    if (webRuntime) {
      return;
    }

    // Initial load local shortcuts
    // 初始化加载局部快捷键
    window.electron?.getShortcuts?.().then((shortcuts) => {
      if (shortcuts) setLocalShortcuts(shortcuts);
    });

    // Listen for updates
    // 监听更新
    const offShortcutsUpdated = window.electron?.onShortcutsUpdated?.(
      (shortcuts) => {
        setLocalShortcuts(shortcuts);
      },
    );

    return () => {
      if (typeof offShortcutsUpdated === "function") {
        offShortcutsUpdated();
      }
    };
  }, []);

  // Clipboard detection logic
  useEffect(() => {
    if (!clipboardImportEnabled) return;

    const checkClipboard = async () => {
      // Small delay to ensure clipboard is ready after focus
      await new Promise((resolve) => setTimeout(resolve, 150));

      try {
        const text = await navigator.clipboard.readText();
        if (!text || text.length < 20) return;

        const checksum = `${text.length}-${text.substring(0, 10)}`;
        if (checksum === lastClipboardChecksumRef.current) return;

        // Verify if it was copied by us in this session
        const selfSignature = sessionStorage.getItem(
          "lastCopiedPromptSignature",
        );
        if (selfSignature === checksum) {
          return;
        }

        if (text.trim().startsWith("{")) {
          try {
            const data = JSON.parse(text);
            // Validation: Must have a title/name and at least one prompt field
            if (
              (data.name || data.title) &&
              (data.userPrompt || data.systemPrompt)
            ) {
              setImportData(data);
              setShowImportModal(true);
              lastClipboardChecksumRef.current = checksum;
            }
          } catch (e) {
            // Not a valid JSON or not a prompt JSON
          }
        }
      } catch (err) {
        // May fail if permission is denied or window not focused
      }
    };

    window.addEventListener("focus", checkClipboard);
    return () => window.removeEventListener("focus", checkClipboard);
  }, [clipboardImportEnabled]);

  // Global Escape key: exit OS fullscreen regardless of which component entered it
  // 全局 Escape 键：无论哪个组件进入了 OS 全屏，都可以退出
  useEffect(() => {
    if (!isOsFullscreen) return;
    const handleEscapeFullscreen = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        window.electron?.exitFullscreen?.();
      }
    };
    window.addEventListener("keydown", handleEscapeFullscreen);
    return () => window.removeEventListener("keydown", handleEscapeFullscreen);
  }, [isOsFullscreen]);

  // Handle local shortcuts
  // 处理局部快捷键
  useEffect(() => {
    // Check individual shortcut modes inside the handler
    // 在处理器内部检查单独的快捷键模式

    const handleKeyDown = (e: KeyboardEvent) => {
      const parts = [];
      const isMac = navigator.userAgent.toLowerCase().includes("mac");

      if (isMac ? e.metaKey : e.ctrlKey) parts.push("CommandOrControl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");

      let key = e.key;
      // Ignore modifier keys events
      if (["Control", "Alt", "Shift", "Meta"].includes(key)) return;

      if (key === " ") key = "Space";
      parts.push(key.toUpperCase());

      const pressed = parts.join("+");

      // Check matching
      for (const [action, accelerator] of Object.entries(localShortcuts)) {
        if (accelerator === pressed) {
          // Check mode for this specific action
          // 检查此特定操作的模式
          const mode = (shortcutModes && shortcutModes[action]) || "local"; // Default to local

          if (mode === "local") {
            e.preventDefault();
            // Trigger action based on type
            switch (action) {
              case "showApp":
                window.electron?.toggleVisibility?.();
                break;
              case "newPrompt":
                window.dispatchEvent(new CustomEvent("shortcut:newPrompt"));
                break;
              case "search":
                window.dispatchEvent(new CustomEvent("shortcut:search"));
                break;
              case "settings":
                setCurrentPage("settings");
                break;
            }
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcutModes, localShortcuts]);

  useEffect(() => {
    if (isWebRuntime()) {
      return;
    }

    // Listen for OS fullscreen state changes from main process
    // 监听主进程发送的 OS 全屏状态变化事件
    const handleFullscreenChanged = (isFullscreen: boolean) => {
      setIsOsFullscreen(isFullscreen);
    };
    window.api?.on?.("window:fullscreen-changed", handleFullscreenChanged);

    const handleWindowVisibilityChanged = (isVisible: boolean) => {
      isWindowVisibleRef.current = isVisible;
    };
    window.api?.on?.(
      "window:visibility-changed",
      handleWindowVisibilityChanged,
    );
    window.electron?.isVisible?.().then((isVisible) => {
      if (typeof isVisible === "boolean") {
        isWindowVisibleRef.current = isVisible;
      }
    });

    // Listen for update status
    const handleStatus = (status: UpdateStatus) => {
      const previousStatus = lastUpdateStatusRef.current;
      const shouldIgnoreTransientChecking =
        status.status === "checking" &&
        (previousStatus?.status === "available" ||
          previousStatus?.status === "downloaded");

      if (shouldIgnoreTransientChecking) {
        return;
      }

      lastUpdateStatusRef.current = status;

      if (status.status === "available" || status.status === "downloaded") {
        setUpdateAvailable(status);
      } else if (status.status === "not-available") {
        setUpdateAvailable(null);
      }

      // While the dialog is open, it owns its status via its own onStatus
      // listener. Re-pushing the status into `initialUpdateStatus` here
      // created a feedback loop — the dialog's useEffect depends on
      // `initialStatus`, so every push would trigger another check, which
      // then produced the next status update, and so on. This was the
      // root cause of the flickering reported in #117/#118.
    };

    const offUpdaterStatus = window.electron?.updater?.onStatus(handleStatus);

    // Listen for close dialog trigger (Windows)
    // 监听关闭对话框触发（Windows）
    const handleShowCloseDialog = () => setShowCloseDialog(true);
    const offShowCloseDialog = window.electron?.onShowCloseDialog?.(
      handleShowCloseDialog,
    );

    // Listen for global shortcut triggers
    // 监听全局快捷键触发
    const handleShortcutTriggered = (action: string) => {
      switch (action) {
        case "newPrompt":
          // Dispatch custom event to trigger new prompt modal
          // 触发自定义事件以打开“新建 Prompt”弹窗
          window.dispatchEvent(new CustomEvent("shortcut:newPrompt"));
          break;
        case "search":
          // Focus search input
          // 聚焦搜索输入框
          window.dispatchEvent(new CustomEvent("shortcut:search"));
          break;
        case "settings":
          setCurrentPage("settings");
          break;
        // showApp is handled in main process
        // showApp 由主进程处理
      }
    };
    const offShortcutTriggered = window.electron?.onShortcutTriggered?.(
      handleShortcutTriggered,
    );

    // Check for updates on startup and periodically
    // 启动时和周期性检查更新
    const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour
    let updateCheckTimer: NodeJS.Timeout | null = null;
    let startupUpdateCheckTimer: NodeJS.Timeout | null = null;

    const checkForUpdates = () => {
      const settings = useSettingsStore.getState();
      const isVisible = isWindowVisibleRef.current;
      const isOnline = navigator.onLine !== false;
      if (
        !shouldRunBackgroundUpdateCheck(settings.autoCheckUpdate, {
          isVisible,
          isOnline,
          isRunning: isUpdateCheckInFlightRef.current,
        })
      ) {
        return;
      }

      isUpdateCheckInFlightRef.current = true;
      const p = window.electron?.updater?.check({
        source: settings.useUpdateMirror ? "mirror" : "automatic",
        channel: settings.updateChannel,
      });
      if (p && typeof (p as Promise<unknown>).finally === "function") {
        (p as Promise<unknown>).finally(() => {
          isUpdateCheckInFlightRef.current = false;
        });
      } else {
        isUpdateCheckInFlightRef.current = false;
      }
    };

    // Initial check after 3 seconds
    // 启动后 3 秒进行首次检查
    startupUpdateCheckTimer = setTimeout(checkForUpdates, 3000);

    // Periodic check every hour
    // 每小时周期性检查
    updateCheckTimer = setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL);

    // Listen for manual check trigger - always force a fresh check
    const handleOpenUpdate = () => {
      openUpdateDialog();
    };
    window.addEventListener("open-update-dialog", handleOpenUpdate);

    return () => {
      // Cleanup Electron/IPC listeners to prevent leaks on unmount/remount
      // 清理 Electron/IPC 监听，避免卸载/重挂载导致重复触发
      window.api?.off?.("window:fullscreen-changed", handleFullscreenChanged);
      window.api?.off?.(
        "window:visibility-changed",
        handleWindowVisibilityChanged,
      );
      if (typeof offUpdaterStatus === "function") {
        offUpdaterStatus();
      } else {
        // Backward compatible fallback (may remove all updater listeners)
        // 兼容旧实现兜底（可能移除所有 updater 监听）
        window.electron?.updater?.offStatus?.();
      }
      if (typeof offShowCloseDialog === "function") {
        offShowCloseDialog();
      }
      if (typeof offShortcutTriggered === "function") {
        offShortcutTriggered();
      }

      if (updateCheckTimer) {
        clearInterval(updateCheckTimer);
      }
      if (startupUpdateCheckTimer) {
        clearTimeout(startupUpdateCheckTimer);
      }
      window.removeEventListener("open-update-dialog", handleOpenUpdate);
    };
    // `openUpdateDialog` is wrapped in useCallback with an empty dep array,
    // so it is stable for the lifetime of this component. `handleOpenUpdate`
    // calls it via closure, so listing `openUpdateDialog` (instead of the
    // previous `showUpdateDialog`, which was no longer read inside the
    // effect) avoids the unnecessary listener/timer churn flagged in the
    // review.
  }, [openUpdateDialog]);

  // Handle dragging a prompt into a folder
  // 处理 Prompt 拖拽到文件夹
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;

    // Check if a prompt is dragged into a folder
    // 检查是否是 Prompt 拖拽到文件夹
    const activeData = active.data.current;
    const overData = over.data.current;

    if (
      activeData?.type === "prompt" &&
      (overData?.type === "folder" || overData?.type === "folder-nest")
    ) {
      const promptId = activeData.prompt.id;
      const folderId = overData.folderId;
      const folder = folders.find((f) => f.id === folderId);

      // Determine prompts to move
      // 确定要移动的 prompts
      let promptsToMove = [promptId];

      // If the dragged prompt is part of the current selection, move all selected prompts
      // 如果拖拽的 Prompt 是当前选中项的一部分，则移动所有选中的 Prompts
      if (selectedIds.includes(promptId)) {
        promptsToMove = selectedIds;
      }

      // Update prompts folder
      // 更新 Prompts 的文件夹
      await movePrompts(promptsToMove, folderId);

      const count = promptsToMove.length;
      const folderName = folder?.name || i18n.t("folder.uncategorized");
      showToast(
        count > 1
          ? i18n.t("toast.movedPromptsToFolder", {
              count,
              folder: folderName,
            })
          : i18n.t("toast.movedPromptToFolder", { folder: folderName }),
        "success",
      );
    }
  };

  // Sync debug mode
  useEffect(() => {
    window.electron?.setDebugMode?.(debugMode);
  }, [debugMode]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const syncSystemTheme = () => {
      const settings = useSettingsStore.getState();
      if (settings.themeMode !== "system") {
        return;
      }

      const prefersDark = mediaQuery.matches;
      document.documentElement.classList.toggle("dark", prefersDark);

      if (settings.isDarkMode !== prefersDark) {
        useSettingsStore.setState({ isDarkMode: prefersDark });
      }
    };

    syncSystemTheme();
    mediaQuery.addEventListener("change", syncSystemTheme);
    return () => mediaQuery.removeEventListener("change", syncSystemTheme);
  }, []);

  // Mirror motion preference to <html data-motion>. CSS in globals.css
  // reads this attribute to scale motion durations or disable them
  // entirely. Initial value comes from the persisted settings store, so
  // the UI never flashes the wrong motion mode.
  // 把动画偏好同步到 <html data-motion>。globals.css 通过该属性决定
  // 整体动画时长缩放或彻底关闭，初值来自持久化的 settings store，避免
  // 启动时闪现错误状态。
  useEffect(() => {
    const apply = (preference: "off" | "reduced" | "standard"): void => {
      document.documentElement.dataset.motion = preference;
    };
    apply(useSettingsStore.getState().motionPreference);
    return useSettingsStore.subscribe((state, prev) => {
      if (state.motionPreference !== prev.motionPreference) {
        apply(state.motionPreference);
      }
    });
  }, []);

  useEffect(() => {
    // Apply persisted theme settings
    // 应用保存的主题设置
    applyTheme();

    // Sync language setting: use settings store as the source of truth (zh/zh-TW/en/ja/es/de/fr)
    // i18n reads from the persisted store on init, but we also apply it here as a fallback
    // 同步语言设置：以 settings store 为准（支持 zh/zh-TW/en/ja/es/de/fr）
    // i18n 初始化时会尝试从同一个 persist store 读取语言，但这里再兜底一次，避免初始化顺序导致的覆盖问题
    const languageSettings = useSettingsStore.getState();
    if (
      languageSettings.language &&
      i18n.language !== languageSettings.language
    ) {
      languageSettings.setLanguage(languageSettings.language);
    }

    // Initialize database, then load data
    // 初始化数据库，然后加载数据
    let startupSyncTimer: NodeJS.Timeout | null = null;
    let s3StartupSyncTimer: NodeJS.Timeout | null = null;
    let selfHostedStartupSyncTimer: NodeJS.Timeout | null = null;
    let disposePeriodicAutoSync: (() => void) | null = null;
    let disposed = false;

    const waitForSettingsHydration = async (): Promise<void> => {
      const persistController = (
        useSettingsStore as typeof useSettingsStore & {
          persist?: Parameters<typeof waitForPersistHydration>[0];
        }
      ).persist;

      await waitForPersistHydration(persistController);
    };

    const logWhenDebugEnabled = (...args: Parameters<typeof console.log>) => {
      if (useSettingsStore.getState().debugMode) {
        console.log(...args);
      }
    };

    const recordAutoSyncSkip = (
      provider: AutoSyncProviderKind,
      reason: AutoSyncReason,
      message: string,
    ) => {
      void recordAutoSyncHistory({
        provider,
        reason,
        status: "skipped",
        message,
      });
    };

    const getSkipMessage = (state: {
      isVisible: boolean;
      isOnline: boolean;
      isRunning: boolean;
    }) => {
      if (!state.isOnline) {
        return "Skipped because the device is offline.";
      }
      if (!state.isVisible) {
        return "Skipped because the app window is not active.";
      }
      if (state.isRunning) {
        return "Skipped because another sync is already running.";
      }
      return "Skipped because the selected provider or configuration is not ready.";
    };

    const runAutoSync = async (
      reason: "startup" | "startup-resume" | "interval",
    ) => {
      const startedAt = new Date().toISOString();
      const settings = useSettingsStore.getState();
      const state = {
        isVisible: isWindowVisibleRef.current,
        isOnline: navigator.onLine !== false,
        isRunning: isWebDAVSyncInFlightRef.current,
      };

      const canRun =
        reason === "interval"
          ? shouldRunPeriodicWebDAVSync(settings, state)
          : shouldRunStartupWebDAVSync(settings, state);

      if (!canRun) {
        if (
          reason !== "interval" &&
          settings.webdavSyncOnStartup &&
          hasValidWebDAVConfig(settings)
        ) {
          pendingStartupSyncRef.current = true;
        }
        recordAutoSyncSkip("webdav", reason, getSkipMessage(state));
        return;
      }

      pendingStartupSyncRef.current = false;
      isWebDAVSyncInFlightRef.current = true;

      try {
        const result = await runWebDAVAutoSync({
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

        if (!result.success) {
          console.error(`⚠️ ${reason} sync failed:`, result.message);
          await recordAutoSyncHistory({
            provider: "webdav",
            reason,
            status: "failed",
            startedAt,
            message: result.message,
            localChanged: result.localChanged,
          });
          return;
        }

        await recordAutoSyncHistory({
          provider: "webdav",
          reason,
          status: "success",
          startedAt,
          message: result.message,
          localChanged: result.localChanged,
        });
        logWhenDebugEnabled(`✅ ${reason} sync completed:`, result.message);
        if (result.localChanged) {
          await Promise.all([fetchPrompts(), fetchFolders()]);
        }
      } catch (syncError) {
        console.error(`⚠️ ${reason} sync error:`, syncError);
        await recordAutoSyncHistory({
          provider: "webdav",
          reason,
          status: "failed",
          startedAt,
          message:
            syncError instanceof Error ? syncError.message : String(syncError),
        });
      } finally {
        isWebDAVSyncInFlightRef.current = false;
      }
    };

    const localDataRefresh = createLocalDataRefreshController({
      fetchPrompts,
      fetchFolders,
      isVisible: () =>
        isWindowVisibleRef.current && document.visibilityState !== "hidden",
    });

    const handleBackgroundTaskResume = (nextVisibility?: unknown) => {
      if (typeof nextVisibility === "boolean") {
        isWindowVisibleRef.current = nextVisibility;
      }
      void localDataRefresh.refresh().catch((error) => {
        console.error("Failed to refresh local data after resume:", error);
      });
      if (
        pendingStartupSyncRef.current &&
        isWindowVisibleRef.current &&
        navigator.onLine !== false
      ) {
        void runAutoSync("startup-resume");
      }

      if (
        pendingS3StartupSyncRef.current &&
        isWindowVisibleRef.current &&
        navigator.onLine !== false &&
        useSettingsStore.getState().syncProvider === "s3"
      ) {
        void runS3AutoSyncTask("startup-resume");
      }

      if (
        pendingSelfHostedStartupSyncRef.current &&
        isWindowVisibleRef.current &&
        navigator.onLine !== false
      ) {
        void runSelfHostedAutoSync("startup-resume");
      }
    };

    const runS3AutoSyncTask = async (
      reason: "startup" | "startup-resume" | "interval",
    ) => {
      const startedAt = new Date().toISOString();
      const settings = useSettingsStore.getState();
      const state = {
        isVisible: isWindowVisibleRef.current,
        isOnline: navigator.onLine !== false,
        isRunning: isS3SyncInFlightRef.current,
      };

      const canRun =
        reason === "interval"
          ? shouldRunPeriodicS3Sync(settings, state)
          : shouldRunStartupS3Sync(settings, state);

      if (!canRun) {
        if (
          reason !== "interval" &&
          settings.s3SyncOnStartup &&
          hasValidS3Config(settings)
        ) {
          pendingS3StartupSyncRef.current = true;
        }
        recordAutoSyncSkip("s3", reason, getSkipMessage(state));
        return;
      }

      pendingS3StartupSyncRef.current = false;
      isS3SyncInFlightRef.current = true;

      try {
        const result = await runS3AutoSync({
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

        if (!result.success) {
          console.error(`⚠️ S3 ${reason} sync failed:`, result.message);
          await recordAutoSyncHistory({
            provider: "s3",
            reason,
            status: "failed",
            startedAt,
            message: result.message,
            localChanged: result.localChanged,
          });
          return;
        }

        await recordAutoSyncHistory({
          provider: "s3",
          reason,
          status: "success",
          startedAt,
          message: result.message,
          localChanged: result.localChanged,
        });
        logWhenDebugEnabled(`✅ S3 ${reason} sync completed:`, result.message);
        if (result.localChanged) {
          await Promise.all([fetchPrompts(), fetchFolders()]);
        }
      } catch (syncError) {
        console.error(`⚠️ S3 ${reason} sync error:`, syncError);
        await recordAutoSyncHistory({
          provider: "s3",
          reason,
          status: "failed",
          startedAt,
          message:
            syncError instanceof Error ? syncError.message : String(syncError),
        });
      } finally {
        isS3SyncInFlightRef.current = false;
      }
    };

    const runSelfHostedAutoSync = async (
      reason: "startup" | "startup-resume" | "interval",
    ) => {
      const startedAt = new Date().toISOString();
      const settings = useSettingsStore.getState();
      const state = {
        isVisible: isWindowVisibleRef.current,
        isOnline: navigator.onLine !== false,
        isRunning: isSelfHostedSyncInFlightRef.current,
      };

      const canRun =
        reason === "interval"
          ? shouldRunPeriodicSelfHostedSync(settings, state)
          : shouldRunStartupSelfHostedSync(settings, state);

      if (!canRun) {
        if (
          reason !== "interval" &&
          settings.selfHostedSyncOnStartup &&
          hasValidSelfHostedConfig(settings)
        ) {
          pendingSelfHostedStartupSyncRef.current = true;
        }
        recordAutoSyncSkip("self-hosted", reason, getSkipMessage(state));
        return;
      }

      pendingSelfHostedStartupSyncRef.current = false;
      isSelfHostedSyncInFlightRef.current = true;

      try {
        const result = await executeSelfHostedAutoSync(reason, {
          url: settings.selfHostedSyncUrl,
          username: settings.selfHostedSyncUsername,
          password: settings.selfHostedSyncPassword,
        });

        if (!result.success) {
          const status = result.skipped ? "skipped" : "failed";
          console.error(
            `⚠️ self-hosted ${reason} backup ${status}:`,
            result.message,
          );
          await recordAutoSyncHistory({
            provider: "self-hosted",
            reason,
            status,
            startedAt,
            message: result.message,
            localChanged: result.localChanged,
          });
          return;
        }

        await recordAutoSyncHistory({
          provider: "self-hosted",
          reason,
          status: "success",
          startedAt,
          message: result.message,
          localChanged: result.localChanged,
        });
        logWhenDebugEnabled(`✅ ${result.message}`);
      } catch (backupError) {
        console.error(`⚠️ self-hosted ${reason} backup error:`, backupError);
        await recordAutoSyncHistory({
          provider: "self-hosted",
          reason,
          status: "failed",
          startedAt,
          message:
            backupError instanceof Error
              ? backupError.message
              : String(backupError),
        });
      } finally {
        isSelfHostedSyncInFlightRef.current = false;
      }
    };

    const init = async () => {
      if (!isWebRuntime()) await migrateLegacyIndexedDbToMainProcess();
      await fetchPrompts();
      await fetchFolders();
      setIsLoading(false);

      // Sync after startup (run after data is loaded; do not block UI)
      // 启动后同步（在数据加载完成后执行，不阻塞 UI）
      const settings = useSettingsStore.getState();
      if (
        settings.syncProvider === "webdav" &&
        settings.webdavSyncOnStartup &&
        hasValidWebDAVConfig(settings)
      ) {
        const delay = (settings.webdavSyncOnStartupDelay ?? 10) * 1000;
        logWhenDebugEnabled(`🔄 Will sync with WebDAV in ${delay / 1000}s...`);
        startupSyncTimer = setTimeout(() => {
          if (!isWindowVisibleRef.current || navigator.onLine === false) {
            pendingStartupSyncRef.current = true;
            recordAutoSyncSkip(
              "webdav",
              "startup",
              getSkipMessage({
                isVisible: isWindowVisibleRef.current,
                isOnline: navigator.onLine !== false,
                isRunning: isWebDAVSyncInFlightRef.current,
              }),
            );
            return;
          }
          void runAutoSync("startup");
        }, delay);
      }

      if (
        settings.syncProvider === "s3" &&
        settings.s3SyncOnStartup &&
        hasValidS3Config(settings)
      ) {
        const delay = (settings.s3SyncOnStartupDelay ?? 10) * 1000;
        logWhenDebugEnabled(`🔄 Will sync with S3 in ${delay / 1000}s...`);
        s3StartupSyncTimer = setTimeout(() => {
          if (!isWindowVisibleRef.current || navigator.onLine === false) {
            pendingS3StartupSyncRef.current = true;
            recordAutoSyncSkip(
              "s3",
              "startup",
              getSkipMessage({
                isVisible: isWindowVisibleRef.current,
                isOnline: navigator.onLine !== false,
                isRunning: isS3SyncInFlightRef.current,
              }),
            );
            return;
          }
          void runS3AutoSyncTask("startup");
        }, delay);
      }

      if (
        settings.selfHostedSyncOnStartup &&
        hasValidSelfHostedConfig(settings)
      ) {
        const delay = (settings.selfHostedSyncOnStartupDelay ?? 10) * 1000;
        logWhenDebugEnabled(
          `🔄 Will back up to self-hosted PromptHub in ${delay / 1000}s...`,
        );
        selfHostedStartupSyncTimer = setTimeout(() => {
          if (!isWindowVisibleRef.current || navigator.onLine === false) {
            pendingSelfHostedStartupSyncRef.current = true;
            recordAutoSyncSkip(
              "self-hosted",
              "startup",
              getSkipMessage({
                isVisible: isWindowVisibleRef.current,
                isOnline: navigator.onLine !== false,
                isRunning: isSelfHostedSyncInFlightRef.current,
              }),
            );
            return;
          }
          void runSelfHostedAutoSync("startup");
        }, delay);
      }
    };
    void (async () => {
      await waitForSettingsHydration();
      if (disposed) {
        return;
      }

      const installedVersion = await window.electron?.updater?.getVersion?.();
      if (disposed) {
        return;
      }
      if (installedVersion) {
        inferUpdateChannel(installedVersion);
      }

      await migrateRendererPersistence();
      if (disposed) {
        return;
      }

      await loadSettingsFromMainProcess();
      if (disposed) {
        return;
      }

      const initialVisibility = await window.electron?.isVisible?.();
      if (disposed) {
        return;
      }
      if (typeof initialVisibility === "boolean") {
        isWindowVisibleRef.current = initialVisibility;
      }

      document.addEventListener("visibilitychange", handleBackgroundTaskResume);
      window.api?.on?.("window:visibility-changed", handleBackgroundTaskResume);
      window.addEventListener("focus", handleBackgroundTaskResume);
      window.addEventListener("online", handleBackgroundTaskResume);

      await init();
      if (disposed) {
        return;
      }

      disposePeriodicAutoSync = registerPeriodicAutoSyncController({
        getSettings: useSettingsStore.getState,
        subscribe: useSettingsStore.subscribe,
        runWebDAV: () => {
          void runAutoSync("interval");
        },
        runS3: () => {
          void runS3AutoSyncTask("interval");
        },
        runSelfHosted: () => {
          void runSelfHostedAutoSync("interval");
        },
        log: (message) => logWhenDebugEnabled(`🔄 ${message}`),
      }).dispose;
    })().catch((error: unknown) => {
      console.error("Application startup failed:", error);
      if (!disposed)
        setStartupError(
          error instanceof Error ? error : new Error(String(error)),
        );
    });

    return () => {
      disposed = true;
      if (startupSyncTimer) clearTimeout(startupSyncTimer);
      if (s3StartupSyncTimer) clearTimeout(s3StartupSyncTimer);
      if (selfHostedStartupSyncTimer) clearTimeout(selfHostedStartupSyncTimer);
      disposePeriodicAutoSync?.();
      document.removeEventListener(
        "visibilitychange",
        handleBackgroundTaskResume,
      );
      window.api?.off?.(
        "window:visibility-changed",
        handleBackgroundTaskResume,
      );
      window.removeEventListener("focus", handleBackgroundTaskResume);
      window.removeEventListener("online", handleBackgroundTaskResume);
    };
  }, [applyTheme, inferUpdateChannel]);

  if (startupError) {
    return (
      <main
        role="alert"
        className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-foreground"
      >
        <h1 className="text-xl font-semibold">
          {t("common.storageInitializationFailed")}
        </h1>
        <p>{t("common.storageInitializationFailedDescription")}</p>
        <button
          className="rounded bg-primary px-4 py-2 text-primary-foreground"
          onClick={() => window.location.reload()}
        >
          {t("common.reloadPromptHub")}
        </button>
      </main>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <div className="text-muted-foreground text-sm">
            {t("common.loading")}
          </div>
        </div>
      </div>
    );
  }

  const settingsContent = (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <SettingsPage
        onBack={() => setCurrentPage("home")}
        backupImportController={backupImportController}
      />
    </Suspense>
  );

  const overlayContent = (
    <>
      {showUpdateDialog ? (
        <Suspense fallback={null}>
          <UpdateDialog
            isOpen={showUpdateDialog}
            onClose={() => setShowUpdateDialog(false)}
            initialStatus={initialUpdateStatus}
          />
        </Suspense>
      ) : null}

      {/* Windows close dialog */}
      {/* Windows 关闭对话框 */}
      {showCloseDialog ? (
        <Suspense fallback={null}>
          <CloseDialog
            isOpen={showCloseDialog}
            onClose={() => setShowCloseDialog(false)}
          />
        </Suspense>
      ) : null}

      {backupImportController.importPreview ? (
        <Suspense fallback={null}>
          <BackupImportConfirmDialog
            importPreview={backupImportController.importPreview}
            confirmingImport={backupImportController.confirmingImport}
            onClose={backupImportController.closeImportPreview}
            onConfirm={() => {
              void backupImportController.confirmImport();
            }}
          />
        </Suspense>
      ) : null}

      {/* Use EditPromptModal for importing, passing clipboard data as initialData */}
      {showImportModal ? (
        <Suspense fallback={null}>
          <EditPromptModal
            isOpen={showImportModal}
            onClose={() => {
              setShowImportModal(false);
              setImportData(null);
            }}
            initialData={
              importData
                ? {
                    title: importData.name || importData.title,
                    description: importData.description,
                    promptType: importData.promptType,
                    userPrompt: importData.userPrompt,
                    systemPrompt: importData.systemPrompt,
                    userPromptEn: importData.userPromptEn,
                    systemPromptEn: importData.systemPromptEn,
                    tags: importData.tags,
                    source: importData.source || "clipboard",
                  }
                : undefined
            }
          />
        </Suspense>
      ) : null}
    </>
  );

  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-background">
          <Spinner size="lg" />
        </div>
      }
    >
      <AppWorkspaceShell
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        onDragEnd={handleDragEnd}
        onOpenUpdater={openUpdateDialog}
        updateAvailable={updateAvailable}
        webRuntime={webRuntime}
        backgroundImageFileName={
          hasBackgroundImage ? normalizedBackgroundImageFileName : undefined
        }
        backgroundImageOpacity={renderedBackgroundImageOpacity}
        backgroundImageBlur={renderedBackgroundBlur}
        settingsContent={settingsContent}
        overlayContent={overlayContent}
      />
    </Suspense>
  );
}

export default App;
