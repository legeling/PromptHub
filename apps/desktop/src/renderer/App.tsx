import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { Sidebar, TopBar, MainContent, TitleBar } from "./components/layout";
import { usePromptStore } from "./stores/prompt.store";
import { useFolderStore } from "./stores/folder.store";
import { useSettingsStore } from "./stores/settings.store";
import { initDatabase, migrateLegacyIndexedDbToMainProcess } from "./services/database";
import { ImportedPromptData } from "./components/prompt/ImportPromptModal";
import { autoSync } from "./services/webdav";
import {
  pullFromSelfHostedWeb,
  pushToSelfHostedWeb,
} from "./services/self-hosted-sync";
import {
  hasValidSelfHostedConfig,
  hasValidWebDAVConfig,
  shouldRunBackgroundUpdateCheck,
  shouldRunPeriodicSelfHostedSync,
  shouldRunPeriodicWebDAVSync,
  shouldRunStartupSelfHostedSync,
  shouldRunStartupWebDAVSync,
} from "./services/app-background";
import { useToast } from "./components/ui/Toast";
import { DndContext, DragEndEvent, pointerWithin } from "@dnd-kit/core";
import i18n from "./i18n";
import { UpdateDialog, UpdateStatus } from "./components/UpdateDialog";
import { CloseDialog } from "./components/ui/CloseDialog";
import { DataRecoveryDialog } from "./components/ui/DataRecoveryDialog";
import { isWebRuntime } from "./runtime";

// Lazy load heavy components for better initial load performance
// 懒加载大型组件以提升初始加载性能
const SettingsPage = lazy(() =>
  import("./components/settings/SettingsPage").then((m) => ({
    default: m.SettingsPage,
  })),
);
const EditPromptModal = lazy(() =>
  import("./components/prompt/EditPromptModal").then((m) => ({
    default: m.EditPromptModal,
  })),
);

// Page type
// 页面类型
type PageType = "home" | "settings";

function App() {
  const fetchPrompts = usePromptStore((state) => state.fetchPrompts);
  const fetchFolders = useFolderStore((state) => state.fetchFolders);
  const folders = useFolderStore((state) => state.folders);
  const updatePrompt = usePromptStore((state) => state.updatePrompt);
  const movePrompts = usePromptStore((state) => state.movePrompts);
  const selectedIds = usePromptStore((state) => state.selectedIds);
  const applyTheme = useSettingsStore((state) => state.applyTheme);
  const debugMode = useSettingsStore((state) => state.debugMode);
  const shortcutModes = useSettingsStore((state) => state.shortcutModes);
  const [currentPage, setCurrentPage] = useState<PageType>("home");
  const [isLoading, setIsLoading] = useState(true);
  const { showToast } = useToast();

  const clipboardImportEnabled = useSettingsStore(
    (state) => state.clipboardImportEnabled,
  );
  const [importData, setImportData] = useState<ImportedPromptData | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const lastClipboardChecksumRef = useRef<string>("");
  const isUpdateCheckInFlightRef = useRef(false);
  const isWebDAVSyncInFlightRef = useRef(false);
  const pendingStartupSyncRef = useRef(false);
  const isSelfHostedSyncInFlightRef = useRef(false);
  const pendingSelfHostedStartupSyncRef = useRef(false);
  const isWindowVisibleRef = useRef(true);

  // OS-level fullscreen state (synced from main process events)
  // OS 级全屏状态（通过主进程事件同步）
  const [isOsFullscreen, setIsOsFullscreen] = useState(false);

  // Update state
  // 更新状态
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [initialUpdateStatus, setInitialUpdateStatus] =
    useState<UpdateStatus | null>(null);

  // Close dialog state (Windows)
  // 关闭对话框状态（Windows）
  const [showCloseDialog, setShowCloseDialog] = useState(false);

  // Data recovery state
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [recoverableDatabases, setRecoverableDatabases] = useState<
    Array<{
      sourcePath: string;
      promptCount: number;
      folderCount: number;
      skillCount: number;
      dbSizeBytes: number;
    }>
  >([]);

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

  useEffect(() => {
    if (isWebRuntime()) {
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
    // 监听更新状态
    const handleStatus = (status: UpdateStatus) => {
      // If update available, save status for TopBar indicator (don't auto-show dialog)
      if (status.status === "available") {
        setUpdateAvailable(status);
        setInitialUpdateStatus(status);
        // Do not auto-show dialog; only show after user clicks TopBar indicator
        // 不再自动弹窗，用户点击顶部栏提示后才显示
        // setShowUpdateDialog(true);
      }
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
      const p = window.electron?.updater?.check();
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
    // 监听手动检查触发（始终强制刷新检查状态）
    const handleOpenUpdate = () => {
      setInitialUpdateStatus(null);
      setUpdateAvailable(null); // Clear cached status
      setShowUpdateDialog(true);
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
  }, []);

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
      showToast(
        count > 1
          ? `已将 ${count} 个 Prompt 移动到「${folder?.name || "文件夹"}」`
          : `已移动到「${folder?.name || "文件夹"}」`,
        "success",
      );
    }
  };

  // Sync debug mode
  useEffect(() => {
    window.electron?.setDebugMode?.(debugMode);
  }, [debugMode]);

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
    let intervalId: NodeJS.Timeout | null = null;
    let selfHostedStartupSyncTimer: NodeJS.Timeout | null = null;
    let selfHostedIntervalId: NodeJS.Timeout | null = null;
    let disposed = false;

    interface PersistController {
      hasHydrated?: () => boolean;
      onFinishHydration?: (callback: () => void) => () => void;
    }

    const waitForSettingsHydration = async (): Promise<void> => {
      const persistController = (
        useSettingsStore as typeof useSettingsStore & {
          persist?: PersistController;
        }
      ).persist;

      if (!persistController || persistController.hasHydrated?.()) {
        return;
      }

      await new Promise<void>((resolve) => {
        let finished = false;
        let unsubscribe: (() => void) | undefined;

        const finish = () => {
          if (finished) {
            return;
          }
          finished = true;
          unsubscribe?.();
          clearTimeout(timeoutId);
          resolve();
        };

        unsubscribe = persistController.onFinishHydration?.(finish);
        const timeoutId = setTimeout(finish, 500);
      });
    };

    const runAutoSync = async (
      reason: "startup" | "startup-resume" | "interval",
    ) => {
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
        return;
      }

      pendingStartupSyncRef.current = false;
      isWebDAVSyncInFlightRef.current = true;

      try {
        const result = await autoSync(
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

        if (!result.success) {
          console.log(`⚠️ ${reason} sync failed:`, result.message);
          return;
        }

        console.log(`✅ ${reason} sync completed:`, result.message);
        if (result.localChanged) {
          await Promise.all([fetchPrompts(), fetchFolders()]);
        }
      } catch (syncError) {
        console.error(`⚠️ ${reason} sync error:`, syncError);
      } finally {
        isWebDAVSyncInFlightRef.current = false;
      }
    };

    const handleBackgroundTaskResume = () => {
      if (
        pendingStartupSyncRef.current &&
        isWindowVisibleRef.current &&
        navigator.onLine !== false
      ) {
        void runAutoSync("startup-resume");
      }

      if (
        pendingSelfHostedStartupSyncRef.current &&
        isWindowVisibleRef.current &&
        navigator.onLine !== false
      ) {
        void runSelfHostedAutoSync("startup-resume");
      }
    };

    const runSelfHostedAutoSync = async (
      reason: "startup" | "startup-resume" | "interval",
    ) => {
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
        return;
      }

      pendingSelfHostedStartupSyncRef.current = false;
      isSelfHostedSyncInFlightRef.current = true;

      try {
        const summary =
          reason === "interval"
            ? await pushToSelfHostedWeb({
                url: settings.selfHostedSyncUrl,
                username: settings.selfHostedSyncUsername,
                password: settings.selfHostedSyncPassword,
              })
            : await pullFromSelfHostedWeb({
                url: settings.selfHostedSyncUrl,
                username: settings.selfHostedSyncUsername,
                password: settings.selfHostedSyncPassword,
              }, {
                mode: "replace",
              });

        console.log(
          `✅ self-hosted ${reason === "interval" ? "push" : "pull"} sync completed: ${summary.prompts} prompts, ${summary.folders} folders, ${summary.skills} skills`,
        );
        if (reason !== "interval") {
          await Promise.all([fetchPrompts(), fetchFolders()]);
        }
      } catch (syncError) {
        console.error(`⚠️ self-hosted ${reason} sync error:`, syncError);
      } finally {
        isSelfHostedSyncInFlightRef.current = false;
      }
    };

    const init = async (retryCount = 0) => {
      // Set max loading time to avoid waiting forever
      // 设置最大加载时间，防止无限等待
      const maxLoadingTime = setTimeout(() => {
        console.warn("⚠️ Loading timeout, showing UI anyway");
        setIsLoading(false);
      }, 5000);

      try {
        await initDatabase();
        if (!isWebRuntime()) {
          const migration = await migrateLegacyIndexedDbToMainProcess();
          if (migration.migrated) {
            console.log(
              `Migrated legacy IndexedDB data to SQLite (${migration.promptCount} prompts, ${migration.folderCount} folders, ${migration.versionCount} versions)`,
            );
          }
        }
        await fetchPrompts();
        await fetchFolders();
        console.log("✅ App initialized");

        // IMPORTANT: We MUST NOT auto-execute performRecovery here. Historically
        // this code auto-picked the best candidate and called performRecovery
        // directly, which triggered an unconditional relaunch+quit inside the
        // main process. On Windows upgrades, combined with electron-updater's
        // `autoInstallOnAppQuit=true` and empty workspace scenarios, this
        // produced an instant restart loop with no user-visible data.
        //
        // The DataRecoveryDialog below is the only legitimate path to invoke
        // recovery — the user must explicitly confirm, so a loop is impossible.
        // See: https://github.com/legeling/PromptHub v0.5.2 regression.
        if (!isWebRuntime()) {
          try {
            const recoverable = await window.electron?.checkRecovery?.();
            if (recoverable && recoverable.length > 0) {
              setRecoverableDatabases(recoverable);
              setShowRecoveryDialog(true);
            }
          } catch (recoveryErr) {
            console.warn("Recovery check failed:", recoveryErr);
          }
        }
      } catch (error) {
        console.error("❌ Init failed:", error);
        // Retry once for timeout errors
        // 如果是超时错误，尝试重试一次
        if (
          retryCount < 1 &&
          error instanceof Error &&
          error.message.includes("timeout")
        ) {
          console.log("🔄 Retrying database initialization...");
          await new Promise((resolve) => setTimeout(resolve, 500));
          clearTimeout(maxLoadingTime);
          return init(retryCount + 1);
        }
      } finally {
        clearTimeout(maxLoadingTime);
        setIsLoading(false);
      }

      // Sync after startup (run after data is loaded; do not block UI)
      // 启动后同步（在数据加载完成后执行，不阻塞 UI）
      const settings = useSettingsStore.getState();
      if (settings.webdavSyncOnStartup && hasValidWebDAVConfig(settings)) {
        const delay = (settings.webdavSyncOnStartupDelay ?? 10) * 1000;
        console.log(`🔄 Will sync with WebDAV in ${delay / 1000}s...`);
        startupSyncTimer = setTimeout(() => {
          if (!isWindowVisibleRef.current || navigator.onLine === false) {
            pendingStartupSyncRef.current = true;
            return;
          }
          void runAutoSync("startup");
        }, delay);
      }

      if (
        settings.selfHostedSyncOnStartup &&
        hasValidSelfHostedConfig(settings)
      ) {
        const delay = (settings.selfHostedSyncOnStartupDelay ?? 10) * 1000;
        console.log(
          `🔄 Will sync with self-hosted PromptHub in ${delay / 1000}s...`,
        );
        selfHostedStartupSyncTimer = setTimeout(() => {
          if (!isWindowVisibleRef.current || navigator.onLine === false) {
            pendingSelfHostedStartupSyncRef.current = true;
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

      await init();
      if (disposed) {
        return;
      }

      // Periodic auto sync
      // 定时自动同步
      const settings = useSettingsStore.getState();
      if (
        settings.webdavAutoSyncInterval > 0 &&
        hasValidWebDAVConfig(settings)
      ) {
        const intervalMs = settings.webdavAutoSyncInterval * 60 * 1000;
        console.log(
          `🔄 Auto sync interval: ${settings.webdavAutoSyncInterval} minutes`,
        );
        intervalId = setInterval(() => {
          void runAutoSync("interval");
        }, intervalMs);
      }

      if (
        settings.selfHostedAutoSyncInterval > 0 &&
        hasValidSelfHostedConfig(settings)
      ) {
        const intervalMs = settings.selfHostedAutoSyncInterval * 60 * 1000;
        console.log(
          `🔄 Self-hosted auto sync interval: ${settings.selfHostedAutoSyncInterval} minutes`,
        );
        selfHostedIntervalId = setInterval(() => {
          void runSelfHostedAutoSync("interval");
        }, intervalMs);
      }

      document.addEventListener("visibilitychange", handleBackgroundTaskResume);
      window.api?.on?.("window:visibility-changed", handleBackgroundTaskResume);
      window.addEventListener("focus", handleBackgroundTaskResume);
      window.addEventListener("online", handleBackgroundTaskResume);
    })();

    return () => {
      disposed = true;
      if (startupSyncTimer) clearTimeout(startupSyncTimer);
      if (intervalId) clearInterval(intervalId);
      if (selfHostedStartupSyncTimer) clearTimeout(selfHostedStartupSyncTimer);
      if (selfHostedIntervalId) clearInterval(selfHostedIntervalId);
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
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <div className="text-muted-foreground text-sm">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <DndContext onDragEnd={handleDragEnd} collisionDetection={pointerWithin}>
      <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
        {/* Windows title bar */}
        {/* Windows 标题栏 */}
        {!isWebRuntime() && <TitleBar />}

        <div className="flex flex-1 overflow-y-hidden overflow-x-visible">
          {/* Sidebar */}
          {/* 侧边栏 */}
          <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />

          {/* Main content */}
          {/* 主内容区 */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Top bar */}
            {/* 顶部栏 */}
            <TopBar
              onOpenSettings={() => setCurrentPage("settings")}
              updateAvailable={updateAvailable}
              onShowUpdateDialog={() => setShowUpdateDialog(true)}
            />

            {/* Page content */}
            {/* 页面内容 */}
            {currentPage === "home" ? (
              <MainContent />
            ) : (
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                }
              >
                <SettingsPage onBack={() => setCurrentPage("home")} />
              </Suspense>
            )}
          </div>
        </div>

        <UpdateDialog
          isOpen={showUpdateDialog}
          onClose={() => setShowUpdateDialog(false)}
          initialStatus={initialUpdateStatus}
        />

        {/* Windows close dialog */}
        {/* Windows 关闭对话框 */}
        <CloseDialog
          isOpen={showCloseDialog}
          onClose={() => setShowCloseDialog(false)}
        />

        {/* Data recovery dialog */}
        <DataRecoveryDialog
          isOpen={showRecoveryDialog}
          onClose={() => setShowRecoveryDialog(false)}
          databases={recoverableDatabases}
        />

        {/* Use EditPromptModal for importing, passing clipboard data as initialData */}
        {showImportModal && (
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
        )}
      </div>
    </DndContext>
  );
}

export default App;
