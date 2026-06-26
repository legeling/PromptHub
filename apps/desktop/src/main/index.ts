import {
  app,
  BrowserWindow,
  shell,
  ipcMain,
  dialog,
  Notification,
  Tray,
  Menu,
  nativeImage,
  session,
  protocol,
} from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import path from "path";
import fs from "fs";
import type { RecoveryCandidate, RecoveryScanOptions } from "@prompthub/shared/types";
import Database from "./database/sqlite";
import { initDatabase, closeDatabase } from "./database";
import {
  isDatabaseEmpty,
  detectRecoverableDatabases,
  detectRecoverableDatabaseFiles,
  performDatabaseRecovery,
} from "./database";
import { registerAllIPC } from "./ipc";
import { getMinimizeOnLaunchSetting } from "./settings/settings-readers";
import { createMenu } from "./menu";
import {
  registerShortcuts,
  registerShortcutsIPC,
  toggleWindowForShowApp,
} from "./shortcuts";
import { initUpdater, registerUpdaterIPC } from "./updater";
import { registerS3IPC } from "./s3";
import { registerWebDAVIPC } from "./webdav";
import {
  applyE2ESeed,
  configureE2ETestProfile,
  isE2EEnabled,
  registerE2EIPC,
  shouldUseDevServer,
} from "./testing/e2e";
import {
  copyDataPathItem,
  getHistoricalDefaultUserDataPath,
  inspectDataPath,
  isLinkSafeDataPathRoot,
  readConfiguredDataPath,
  resolveInitialUserDataPath,
  writeConfiguredDataPath,
} from "./data-path";
import {
  configureRuntimePaths,
  getDataDir,
  getDatabasePath,
  getImagesDir,
  getRulesDir,
  getVideosDir,
  getSkillsDir,
  getWorkspaceDir,
  getPromptsWorkspaceDir,
  getConfigDir,
} from "./runtime-paths";
import { PromptDB } from "./database/prompt";
import { FolderDB } from "./database/folder";
import { bootstrapPromptWorkspace, writeRestoreMarker } from "./services/prompt-workspace";
import { bootstrapRuleWorkspace } from "./services/rules-workspace";
import { migrateLegacyDataLayout, detectResidualLegacyEntries } from "./services/data-layout-migration";
import { createUpgradeDataSnapshot, listUpgradeBackups } from "./services/upgrade-backup";
import { runUpgradeBackupStartupTasks } from "./services/upgrade-backup-startup";
import {
  buildDirectoryRecoveryCandidate,
  buildResidualLegacyRecoveryCandidate,
  buildStandaloneDbBackupCandidate,
  buildUpgradeBackupRecoveryCandidate,
  listStandaloneDatabaseBackupFiles,
  previewRecoveryCandidate,
} from "./services/recovery-candidates";
import { getRecoveryCandidatePaths } from "./services/recovery-paths";
import { logStartupEvent, scrubPath } from "./startup-log";
import { openDirectoryPath } from "./shell-open-path";
import { shouldOpenStartupDevTools } from "./devtools-policy";
import { handleExternalWindowOpen } from "./external-links";
import { resolveLocalMediaProtocolPath } from "./local-media-protocol";

// Disable GPU acceleration (optional; may be needed on some systems)
// 禁用 GPU 加速（可选，某些系统上可能需要）
// app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let minimizeToTray = false;
// Database instance (module-level for access in createWindow)
// 数据库实例（模块级变量，供 createWindow 访问）
let appDb: Database.Database | null = null;
let isQuitting = false;
// Close action: 'ask' = ask every time, 'minimize' = minimize to tray, 'exit' = exit directly
// 关闭行为: 'ask' = 每次询问, 'minimize' = 最小化到托盘, 'exit' = 直接退出
let closeAction: "ask" | "minimize" | "exit" = "ask";
// Whether we are waiting for the user to choose a close behavior
// 是否正在等待用户选择关闭行为
let pendingCloseAction = false;
let isDebugMode = false;

export function __setMainWindowForTests(windowRef: BrowserWindow | null) {
  mainWindow = windowRef;
}

export function sendToMainWindow(channel: string, ...args: unknown[]) {
  if (
    mainWindow &&
    !mainWindow.isDestroyed() &&
    !mainWindow.webContents.isDestroyed() &&
    mainWindow.webContents.mainFrame &&
    !mainWindow.webContents.mainFrame.isDestroyed()
  ) {
    try {
      mainWindow.webContents.send(channel, ...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("Render frame was disposed") ||
        message.includes("WebFrameMain could be accessed")
      ) {
        return;
      }
      throw error;
    }
  }
}

export function emitWindowVisibility(isVisible: boolean) {
  sendToMainWindow("window:visibility-changed", isVisible);
}

// Register privileged schemes (must be called before app is ready)
// 注册特权协议（必须在 app ready 之前调用）
protocol.registerSchemesAsPrivileged([
  {
    scheme: "local-image",
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
  {
    scheme: "local-video",
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

const isE2E = isE2EEnabled();
configureE2ETestProfile();
if (!isE2E) {
  const appDataPath = app.getPath("appData");
  const resolvedUserDataPath = resolveInitialUserDataPath({
    appDataPath,
    defaultUserDataPath: getHistoricalDefaultUserDataPath(
      appDataPath,
      process.platform,
    ),
    exePath: process.execPath,
    isPackaged: app.isPackaged,
    platform: process.platform,
  });
  app.setPath("userData", resolvedUserDataPath);
}
configureRuntimePaths({
  appDataPath: app.getPath("appData"),
  userDataPath: app.getPath("userData"),
  productName: "PromptHub",
  exePath: process.execPath,
  isPackaged: app.isPackaged,
  platform: process.platform,
});
const isDev = shouldUseDevServer(app.isPackaged);

// Single instance lock (prevent multiple instances)
// 单实例锁定（防止多开）
const gotTheLock = isE2E ? true : app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Quit immediately if we fail to acquire the lock (another instance is running)
  // 如果获取不到锁，说明已有实例在运行，直接退出
  app.quit();
} else {
  // When a second instance launches, focus existing window (or recreate if missing)
  // 当第二个实例启动时，聚焦到已有窗口（若窗口已销毁则重建）
  app.on("second-instance", async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    } else {
      await createWindow();
    }
  });
}

async function createWindow() {
  // Ensure single window
  // 确保应用只有一个主窗口
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  const isMac = process.platform === "darwin";
  const isWin = process.platform === "win32";
  const windowIconPath = isWin
    ? isDev
      ? path.join(__dirname, "../../resources/icon.ico")
      : path.join(process.resourcesPath, "icon.ico")
    : undefined;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    // Use frameless window on Windows, native title bar on macOS
    // Windows 使用无边框窗口，macOS 使用原生标题栏
    frame: isWin ? false : true,
    titleBarStyle: isMac ? "hiddenInset" : "default",
    trafficLightPosition: isMac ? { x: 14, y: 22 } : undefined,
    // Dark background for Windows title bar
    // Windows 深色标题栏
    backgroundColor: "#1a1d23",
    icon: windowIconPath,
    // Don't show immediately - wait for ready-to-show to check minimizeOnLaunch setting
    // 不立即显示 - 等待 ready-to-show 事件检查 minimizeOnLaunch 设置
    show: false,
  });

  // Handle window ready-to-show: check if we should minimize on launch
  mainWindow.once("ready-to-show", () => {
    // OS-level signals that the app was auto-launched hidden:
    //   - Windows: the registered Run entry passes `--hidden`
    //   - macOS:   `wasOpenedAsHidden` reflects the `openAsHidden` flag
    const launchArgs = Array.isArray(process.argv) ? process.argv : [];
    const hasHiddenArg = launchArgs.includes("--hidden");
    let openedAsHiddenByOs = false;
    try {
      openedAsHiddenByOs =
        app.getLoginItemSettings().wasOpenedAsHidden === true;
    } catch (error) {
      // Electron may throw on systems without an accessible login-items
      // service (some Linux distros, locked-down corporate macOS). Falling
      // back to false is the right behavior here, but we log so the
      // failure is not completely invisible in support logs.
      console.warn(
        "Failed to read login item settings; assuming not opened-as-hidden:",
        error instanceof Error ? error.message : error,
      );
      openedAsHiddenByOs = false;
    }
    const osRequestedHidden = hasHiddenArg || openedAsHiddenByOs;

    // Fall back to the persisted setting only if the OS didn't already
    // tell us to start hidden. This also covers users who haven't yet had
    // the renderer sync their preference to the main DB.
    const shouldMinimize =
      osRequestedHidden ||
      (appDb ? getMinimizeOnLaunchSetting(appDb) : false);

    if (!appDb && !osRequestedHidden) {
      // No database available and OS didn't request hidden — show normally.
      mainWindow?.show();
      emitWindowVisibility(true);
      return;
    }

    if (shouldMinimize) {
      // Minimize to tray on launch — ensure tray exists so the user can
      // bring the window back.
      createTray();
      emitWindowVisibility(false);
      // Don't show window, just keep it hidden
    } else {
      // Show window normally
      mainWindow?.show();
      emitWindowVisibility(true);
    }
  });

  mainWindow.on("show", () => emitWindowVisibility(true));
  mainWindow.on("hide", () => emitWindowVisibility(false));
  mainWindow.on("minimize", () => emitWindowVisibility(false));
  mainWindow.on("restore", () => emitWindowVisibility(true));

  // Notify renderer when OS fullscreen state changes
  // 当操作系统全屏状态变化时通知渲染进程
  mainWindow.on("enter-full-screen", () => {
    sendToMainWindow("window:fullscreen-changed", true);
  });
  mainWindow.on("leave-full-screen", () => {
    sendToMainWindow("window:fullscreen-changed", false);
  });

  // Load renderer page
  // 加载页面
  if (isDev) {
    // Dev mode: try to load Vite dev server
    // 开发模式：尝试连接 Vite 开发服务器
    const devServerUrl =
      process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
    console.log("Loading dev server:", devServerUrl);
    try {
      await mainWindow.loadURL(devServerUrl);
      if (shouldOpenStartupDevTools({ isDev, isE2E })) {
        mainWindow.webContents.openDevTools();
      }
    } catch (error) {
      console.error("Failed to load dev server:", error);
    }
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
    // Handle DevTools shortcuts in production
    // 生产环境处理开发者工具快捷键
    mainWindow.webContents.on("before-input-event", (event, input) => {
      // Check for DevTools shortcuts: F12, Ctrl+Shift+I, Cmd+Option+I
      // 检查是否为开发者工具快捷键
      const isDevToolsShortcut =
        input.key === "F12" ||
        (input.control && input.shift && input.key.toLowerCase() === "i") ||
        (input.meta && input.alt && input.key.toLowerCase() === "i");

      if (isDevToolsShortcut) {
        if (isDebugMode) {
          // Debug mode enabled: actively open/close DevTools
          // 调试模式已启用：主动打开/关闭开发者工具
          mainWindow?.webContents.toggleDevTools();
        }
        // Always prevent default to have full control
        // 始终阻止默认行为以完全控制
        event.preventDefault();
      }
    });
  }

  // Open external links in system browser
  // 处理外部链接
  mainWindow.webContents.setWindowOpenHandler(handleExternalWindowOpen);

  // Close behavior: decide based on settings whether to minimize to tray or close
  // 关闭行为：根据设置决定是最小化到托盘还是关闭
  mainWindow.on("close", (event) => {
    // If quitting, allow close to proceed
    // 如果正在退出应用，直接关闭
    if (isQuitting) return;

    const isWin = process.platform === "win32";

    // Windows-specific close behavior
    // Windows 平台特殊处理
    if (isWin) {
      if (closeAction === "ask" && !pendingCloseAction) {
        // Ask user which action to take
        // 询问用户
        event.preventDefault();
        pendingCloseAction = true;
        if (!mainWindow.webContents.isDestroyed()) {
          mainWindow.webContents.send("window:showCloseDialog");
        }
        return false;
      } else if (closeAction === "minimize") {
        // Minimize to tray
        // 最小化到托盘
        event.preventDefault();
        mainWindow?.hide();
        return false;
      }
      // Close directly when closeAction === 'exit'
      // closeAction === 'exit' 时直接关闭
    } else {
      // macOS/Linux: use minimizeToTray behavior
      // macOS/Linux: 使用原有的 minimizeToTray 逻辑
      if (minimizeToTray) {
        event.preventDefault();
        mainWindow?.hide();
        return false;
      }
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Register window control IPC
// 注册窗口控制 IPC
ipcMain.on("window:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.on("window:maximize", () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on("window:close", () => {
  mainWindow?.close();
});

// Fullscreen control
// 全屏控制
ipcMain.on("window:enterFullscreen", () => {
  mainWindow?.setFullScreen(true);
});

ipcMain.on("window:exitFullscreen", () => {
  mainWindow?.setFullScreen(false);
});

ipcMain.handle("window:isFullscreen", () => {
  return mainWindow?.isFullScreen() ?? false;
});

ipcMain.handle("window:isVisible", () => {
  return mainWindow?.isVisible() ?? false;
});

ipcMain.on("window:toggleVisibility", () => {
  if (mainWindow) {
    toggleWindowForShowApp(mainWindow);
  }
});

ipcMain.on("window:toggleFullscreen", () => {
  if (mainWindow) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  }
});

// Configure auto launch on login
ipcMain.on(
  "app:setAutoLaunch",
  (_event, enabled: boolean, minimizeOnLaunch?: boolean) => {
    if (typeof enabled !== "boolean") {
      console.error("app:setAutoLaunch requires enabled to be a boolean");
      return;
    }
    const startHidden = enabled && minimizeOnLaunch === true;
    // Pass `--hidden` as a launch arg so Windows (and any other platform where
    // `openAsHidden` is not honored by the OS) can still detect that the app
    // should start minimized (#115).
    try {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        openAsHidden: startHidden,
        args: startHidden ? ["--hidden"] : [],
      });
    } catch (error) {
      // Never crash the main process from a settings toggle — this IPC is
      // fire-and-forget from the renderer, so a structured error response
      // is not available here. Log for support visibility.
      console.error(
        "app:setAutoLaunch failed to apply login item settings:",
        error instanceof Error ? error.message : error,
      );
    }
  },
);

ipcMain.handle(IPC_CHANNELS.APP_RELAUNCH, () => {
  scheduleAppRelaunch();
  return { success: true };
});

ipcMain.handle(IPC_CHANNELS.APP_GET_CACHE_SIZE, async () => {
  const size = await session.defaultSession.getCacheSize();
  return { size };
});

ipcMain.handle(IPC_CHANNELS.APP_CLEAR_CACHE, async () => {
  await session.defaultSession.clearCache();
  return { success: true };
});

// Configure minimize-to-tray behavior
// 设置最小化到托盘
ipcMain.on("app:setMinimizeToTray", (_event, enabled: boolean) => {
  minimizeToTray = enabled;
  if (enabled) {
    createTray();
  } else {
    destroyTray();
  }
});

ipcMain.handle(IPC_CHANNELS.APP_GET_RUNTIME_PATHS, async () => ({
  userDataPath: app.getPath("userData"),
  dataDir: getDataDir(),
  databasePath: getDatabasePath(),
  promptsDir: getPromptsWorkspaceDir(),
  rulesDir: getRulesDir(),
  skillsDir: getSkillsDir(),
  backupsDir: path.join(app.getPath("userData"), "backups"),
  logsDir: path.join(app.getPath("userData"), "logs"),
}));

// Set close action (Windows)
// 设置关闭行为 (Windows)
ipcMain.on(
  "app:setCloseAction",
  (_event, action: "ask" | "minimize" | "exit") => {
    if (action !== "ask" && action !== "minimize" && action !== "exit") {
      console.error(
        "app:setCloseAction requires action to be 'ask', 'minimize', or 'exit'",
      );
      return;
    }
    closeAction = action;
    // Ensure tray exists when minimizing to tray
    // 如果设置为最小化到托盘，确保托盘已创建
    if (action === "minimize" && process.platform === "win32") {
      createTray();
    }
  },
);

// Set debug mode
// 设置调试模式
ipcMain.on("app:setDebugMode", (_event, enabled: boolean) => {
  isDebugMode = enabled;
});

// Toggle DevTools
// 切换开发者工具
ipcMain.on("window:toggleDevTools", () => {
  mainWindow?.webContents.toggleDevTools();
});

// Handle close dialog result
// 处理关闭对话框结果
ipcMain.on(
  "window:closeDialogResult",
  (_event, data: { action: "minimize" | "exit"; remember: boolean }) => {
    if (!data || typeof data !== "object") {
      console.error("window:closeDialogResult requires a non-null data object");
      pendingCloseAction = false;
      return;
    }
    if (data.action !== "minimize" && data.action !== "exit") {
      console.error(
        "window:closeDialogResult requires action to be 'minimize' or 'exit'",
      );
      pendingCloseAction = false;
      return;
    }
    pendingCloseAction = false;

    if (data.remember) {
      closeAction = data.action;
    }

    if (data.action === "minimize") {
      mainWindow?.hide();
      // Ensure tray exists
      // 确保托盘已创建
      createTray();
    } else {
      // Quit app
      // 退出应用
      isQuitting = true;
      mainWindow?.close();
    }
  },
);

// User cancelled close dialog (do nothing; allow it to show again next time)
// 用户关闭/取消了关闭对话框（不做任何动作，只允许下次再次弹出）
ipcMain.on("window:closeDialogCancel", () => {
  pendingCloseAction = false;
});

// Create macOS template tray icon
// 创建 macOS 模板图标
function createMacTrayIcon(): Electron.NativeImage {
  // Use app icon as tray icon
  // 使用应用图标作为托盘图标
  let iconPath: string;
  if (isDev) {
    iconPath = path.join(
      __dirname,
      "../../resources/icon.iconset/icon_16x16@2x.png",
    );
  } else {
    iconPath = path.join(
      process.resourcesPath,
      "icon.iconset/icon_16x16@2x.png",
    );
  }

  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    console.error("Failed to load tray icon from:", iconPath);
    // Try fallback path
    // 尝试备用路径
    const altPath = isDev
      ? path.join(__dirname, "../../resources/icon.iconset/icon_32x32.png")
      : path.join(process.resourcesPath, "icon.iconset/icon_32x32.png");
    const altIcon = nativeImage.createFromPath(altPath);
    altIcon.setTemplateImage(true);
    return altIcon.resize({ width: 18, height: 18 });
  }

  icon.setTemplateImage(true);
  return icon.resize({ width: 18, height: 18 });
}

// Create system tray
// 创建系统托盘
function createTray() {
  if (tray) return;

  const isMac = process.platform === "darwin";

  try {
    let icon: Electron.NativeImage;

    if (isMac) {
      // macOS: use template icon
      // macOS: 使用 P 字母模板图标
      icon = createMacTrayIcon();
    } else {
      // Windows/Linux: use app icon
      // Windows/Linux: 使用应用图标
      let iconPath: string;
      if (isDev) {
        iconPath = path.join(__dirname, "../../resources/icon.ico");
      } else {
        iconPath = path.join(process.resourcesPath, "icon.ico");
      }
      console.log("Loading tray icon from:", iconPath);
      icon = nativeImage.createFromPath(iconPath);
      if (icon.isEmpty()) {
        console.error("Tray icon is empty, trying alternative path");
        // Try fallback path
        // 尝试备用路径
        const altPath = path.join(
          process.resourcesPath,
          "app.asar.unpacked",
          "resources",
          "icon.ico",
        );
        icon = nativeImage.createFromPath(altPath);
      }
      if (!icon.isEmpty()) {
        icon = icon.resize({ width: 16, height: 16 });
      }
    }

    tray = new Tray(icon);
  } catch (e) {
    console.error("Failed to load tray icon:", e);
    // Fallback to app icon when tray icon fails to load
    // 如果加载图标失败，使用应用图标
    let iconPath: string;
    if (isDev) {
      iconPath = path.join(
        __dirname,
        "../../resources/icon.iconset/icon_16x16@2x.png",
      );
    } else {
      iconPath = path.join(
        process.resourcesPath,
        "icon.iconset/icon_16x16@2x.png",
      );
    }
    const fallbackIcon = nativeImage.createFromPath(iconPath);
    tray = new Tray(fallbackIcon.resize({ width: 18, height: 18 }));
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "显示窗口",
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("PromptHub");
  tray.setContextMenu(contextMenu);

  // Show window when tray icon is clicked
  // 点击托盘图标显示窗口
  tray.on("click", () => {
    if (mainWindow?.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
}

// Destroy tray
// 销毁托盘
function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

// Select folder dialog
// 选择文件夹对话框
ipcMain.handle("dialog:selectFolder", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openDirectory"],
    title: "选择数据目录",
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle("dialog:selectMcpConfigFile", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openFile"],
    title: "选择 MCP 配置文件",
    filters: [
      { name: "MCP Config", extensions: ["json", "toml"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle("dialog:selectMcpSourceFolder", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openDirectory"],
    title: "选择 MCP 源码目录",
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// Get current data directory
// 获取当前数据目录
ipcMain.handle("data:getPath", () => {
  return app.getPath("userData");
});

ipcMain.handle("data:getStatus", () => {
  const currentPath = app.getPath("userData");
  const configuredPath = readConfiguredDataPath(app.getPath("appData"));
  const resolvedCurrentPath = path.resolve(currentPath);
  const resolvedConfiguredPath = configuredPath
    ? path.resolve(configuredPath)
    : null;

  return {
    configuredPath,
    currentPath,
    needsRestart:
      !!resolvedConfiguredPath && resolvedConfiguredPath !== resolvedCurrentPath,
  };
});

// Data recovery: check for recoverable databases at known locations
// 数据恢复：在已知位置检查可恢复的数据库
let cachedRecoveryResult: RecoveryCandidate[] | null = null;
let transientRecoveryResult: RecoveryCandidate[] | null = null;
const RECOVERY_DISMISS_MARKER = ".recovery-dismissed";
// Process-lifetime guard: we only allow performRecovery to trigger a relaunch
// ONCE per app session. Historically a combination of auto-recovery in the
// renderer + `app.relaunch() + app.quit()` here produced an instant restart
// loop when the recovered data was still interpreted as empty on the next
// boot (e.g. after an NSIS upgrade overwrote userData, or the copy silently
// targeted a path that was cleared by bootstrapPromptWorkspace). Limiting to
// one attempt per process ensures the worst case is a single pointless
// restart, not an infinite loop.
let recoveryAttemptedThisSession = false;

ipcMain.handle("data:checkRecovery", async (_event, options?: RecoveryScanOptions) => {
  if (isE2E) {
    cachedRecoveryResult = [];
    return [];
  }

  const extraPaths = Array.isArray(options?.extraPaths)
    ? options.extraPaths.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      )
    : [];
  const ignoreDismissMarker = options?.ignoreDismissMarker === true;
  const hasManualOverrides = ignoreDismissMarker || extraPaths.length > 0;

  if (!hasManualOverrides && cachedRecoveryResult !== null) {
    return cachedRecoveryResult;
  }

  const currentPath = app.getPath("userData");
  const dismissMarkerPath = path.join(currentPath, RECOVERY_DISMISS_MARKER);
  if (!ignoreDismissMarker && fs.existsSync(dismissMarkerPath)) {
    cachedRecoveryResult = [];
    transientRecoveryResult = null;
    return [];
  }

  const results: RecoveryCandidate[] = [];
  const residualCandidate = buildResidualLegacyRecoveryCandidate(currentPath);
  if (residualCandidate) {
    results.push(residualCandidate);
  }

  const isDbEmpty = !!appDb && isDatabaseEmpty(appDb);
  // When the user explicitly requests a scan (ignoreDismissMarker: true) from
  // the Settings page, always scan all candidate paths regardless of DB state.
  // Without this, users whose DB has any data can never surface recovery candidates.
  const shouldScanCandidates = isDbEmpty || ignoreDismissMarker;
  const candidatePaths = getRecoveryCandidatePaths({
    currentPath,
    appDataPath: app.getPath("appData"),
    homePath: app.getPath("home"),
    exePath: process.execPath,
    isPackaged: app.isPackaged,
    platform: process.platform,
  });
  const mergedCandidatePaths = Array.from(
    new Set([...candidatePaths, ...extraPaths].map((value) => path.resolve(value))),
  );
  if (shouldScanCandidates) {
    results.push(
      ...detectRecoverableDatabases(currentPath, mergedCandidatePaths).map((candidate) =>
        buildDirectoryRecoveryCandidate(candidate),
      ),
    );
    try {
      const upgradeBackups = await listUpgradeBackups(currentPath);
      if (upgradeBackups.length > 0) {
        const detectedUpgradeCandidates = detectRecoverableDatabases(
          currentPath,
          upgradeBackups.map((backup) => backup.backupPath),
        );
        const detectedByPath = new Map(
          detectedUpgradeCandidates.map((candidate) => [
            path.resolve(candidate.sourcePath).toLowerCase(),
            candidate,
          ]),
        );
        for (const backup of upgradeBackups) {
          const matched = detectedByPath.get(
            path.resolve(backup.backupPath).toLowerCase(),
          );
          if (!matched) {
            continue;
          }
          results.push(buildUpgradeBackupRecoveryCandidate(matched, backup));
        }
      }
    } catch (error) {
      console.warn("[Recovery] failed to inspect upgrade backup candidates:", error);
    }

    results.push(
      ...detectRecoverableDatabaseFiles(
        currentPath,
        listStandaloneDatabaseBackupFiles(currentPath),
      ).map((candidate) => buildStandaloneDbBackupCandidate(candidate)),
    );
  }

  const dedupedResults = results
    .filter((candidate, index, array) => {
      return (
        array.findIndex(
          (other) =>
            path.resolve(other.sourcePath).toLowerCase() ===
            path.resolve(candidate.sourcePath).toLowerCase(),
        ) === index
      );
    })
    .sort((a, b) => {
      const timeA = a.lastModified ? new Date(a.lastModified).getTime() : 0;
      const timeB = b.lastModified ? new Date(b.lastModified).getTime() : 0;
      if (timeA !== timeB) {
        return timeB - timeA;
      }
      if (a.promptCount !== b.promptCount) {
        return b.promptCount - a.promptCount;
      }
      return b.folderCount + b.skillCount - (a.folderCount + a.skillCount);
    });

  logStartupEvent({
    event: "recovery:candidates_detected",
    currentPath: scrubPath(currentPath),
    candidatePathCount: mergedCandidatePaths.length,
    resultCount: dedupedResults.length,
    results: dedupedResults.map((r) => ({
      sourceType: r.sourceType,
      sourcePath: scrubPath(r.sourcePath),
      displayPath: scrubPath(r.displayPath),
      promptCount: r.promptCount,
      folderCount: r.folderCount,
      skillCount: r.skillCount,
      lastModified: r.lastModified,
    })),
  });
  if (!hasManualOverrides) {
    cachedRecoveryResult = dedupedResults;
    transientRecoveryResult = null;
  } else {
    transientRecoveryResult = dedupedResults;
  }
  return dedupedResults;
});

ipcMain.handle("data:previewRecovery", async (_event, sourcePath: string) => {
  if (typeof sourcePath !== "string" || sourcePath.trim().length === 0) {
    return {
      sourcePath: "",
      previewAvailable: false,
      description: "sourcePath is required",
      items: [],
      truncated: false,
    };
  }

  const candidates = transientRecoveryResult ?? cachedRecoveryResult ?? [];
  const matched = candidates.find(
    (candidate) =>
      path.resolve(candidate.sourcePath).toLowerCase() ===
      path.resolve(sourcePath).toLowerCase(),
  );
  if (!matched) {
    return {
      sourcePath,
      previewAvailable: false,
      description: "Recovery candidate not found",
      items: [],
      truncated: false,
    };
  }

  return previewRecoveryCandidate(matched);
});

ipcMain.handle("data:performRecovery", async (_event, sourcePath: string) => {
  if (typeof sourcePath !== "string" || sourcePath.trim().length === 0) {
    return { success: false, error: "sourcePath is required" };
  }

  // Session-level guard: refuse a second attempt in the same process. If the
  // first attempt "succeeded" but the DB is still empty on next boot, the
  // renderer would normally call us again; we must break the loop here rather
  // than relaunch infinitely.
  if (recoveryAttemptedThisSession) {
    console.warn(
      "[Recovery] performRecovery called more than once in this session; refusing to relaunch again.",
    );
    logStartupEvent({
      event: "recovery:refused_duplicate_attempt",
      sourcePath: scrubPath(sourcePath),
    });
    return {
      success: false,
      error:
        "Recovery already attempted in this session. Please restart the app manually and try again if data is still missing.",
    };
  }
  recoveryAttemptedThisSession = true;
  logStartupEvent({
    event: "recovery:started",
    sourcePath: scrubPath(sourcePath),
    currentPath: scrubPath(app.getPath("userData")),
  });

  const currentPath = app.getPath("userData");

  // Special case: sourcePath === currentPath means a partial data-layout
  // migration left residual legacy entries in the current userData root.
  // Re-run the migration in place rather than trying to copy the DB over itself.
  //
  // 特殊情况：sourcePath === currentPath 表示当前目录本身有迁移残留。
  // 直接原地重跑迁移，而不是把 DB 复制到自身。
  if (path.resolve(sourcePath) === path.resolve(currentPath)) {
    try {
      closeDatabase();
      const migResult = await migrateLegacyDataLayout(currentPath, app.getVersion());
      const residualAfterRetry = detectResidualLegacyEntries(currentPath);
      logStartupEvent({
        event: "recovery:residual_migration_retry",
        status: migResult.status,
        movedEntries: migResult.movedEntries,
        failedEntries: migResult.failedEntries,
        residualEntriesAfterRetry: residualAfterRetry,
      });

      if (
        migResult.status === "partial-failure" ||
        residualAfterRetry.length > 0
      ) {
        recoveryAttemptedThisSession = false;
        cachedRecoveryResult = null;
        return {
          success: false,
          error:
            "Residual legacy data could not be fully migrated automatically. " +
            `Remaining entries: ${residualAfterRetry.join(", ") || migResult.failedEntries.join(", ")}`,
        };
      }

      cachedRecoveryResult = null;
      transientRecoveryResult = null;
      try {
        fs.writeFileSync(
          path.join(currentPath, RECOVERY_DISMISS_MARKER),
          new Date().toISOString(),
          "utf8",
        );
      } catch (dismissMarkerError) {
        console.warn(
          "[Recovery] failed to write dismiss marker after residual recovery (continuing):",
          dismissMarkerError,
        );
      }
      closeDatabase();
      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 500);
      return { success: true };
    } catch (retryErr) {
      const msg = retryErr instanceof Error ? retryErr.message : String(retryErr);
      logStartupEvent({ event: "recovery:residual_migration_retry_failed", error: msg });
      return { success: false, error: msg };
    }
  }

  // Close current database before overwriting
  closeDatabase();

  const result = performDatabaseRecovery(sourcePath, currentPath);

  if (result.success) {
    // Clear cache so next check sees the recovered data
    cachedRecoveryResult = null;
    transientRecoveryResult = null;
    // Write (not delete) the dismiss marker so the auto-recovery dialog does
    // NOT reappear on the next boot after a successful recovery. The user
    // already chose to restore; showing the dialog again would be confusing.
    // They can still manually trigger a scan from Settings → Data if needed.
    // 写入（而非删除）dismiss 标记，防止恢复成功重启后对话框再次弹出。
    // 用户可以在「设置 → 数据」中手动触发扫描。
    try {
      fs.writeFileSync(
        path.join(currentPath, RECOVERY_DISMISS_MARKER),
        new Date().toISOString(),
        "utf8",
      );
    } catch (dismissMarkerError) {
      console.warn(
        "[Recovery] failed to write dismiss marker after recovery (continuing):",
        dismissMarkerError,
      );
    }

    // v0.5.3 review-follow-up: write a restore marker so the next boot's
    // bootstrapPromptWorkspace skips Phase 1 (WS → DB). Without this, prompt
    // files that still carry pre-deletion state would "revive" records the
    // restored DB no longer contains.
    // v0.5.3 review 反馈修复：写入恢复标记，下次启动 bootstrap 跳过 Phase 1，
    // 防止工作区旧文件"复活"已删除记录。
    try {
      writeRestoreMarker(currentPath);
    } catch (markerError) {
      console.warn(
        "[Recovery] writeRestoreMarker failed (continuing):",
        markerError,
      );
    }

    logStartupEvent({
      event: "recovery:succeeded_scheduling_relaunch",
      sourcePath: scrubPath(sourcePath),
    });

    // Schedule a relaunch so the app starts fresh with the recovered database.
    // A short delay gives the renderer time to show a success message.
    scheduleAppRelaunch(1500);

    return {
      success: true,
      needsRestart: true,
    };
  }

  // If recovery failed, re-open the original database and allow another
  // attempt (the user might select a different candidate).
  recoveryAttemptedThisSession = false;
  logStartupEvent({
    event: "recovery:failed",
    sourcePath: scrubPath(sourcePath),
    error: result.error,
  });
  const db = initDatabase();
  appDb = db;

  return result;
});

ipcMain.handle("data:dismissRecovery", () => {
  cachedRecoveryResult = [];
  transientRecoveryResult = null;
  try {
    fs.writeFileSync(
      path.join(app.getPath("userData"), RECOVERY_DISMISS_MARKER),
      new Date().toISOString(),
      "utf8",
    );
  } catch (error) {
    console.warn("[Recovery] failed to persist dismiss marker:", error);
  }
  return { success: true };
});

interface ExportZipScope {
  prompts: boolean;
  versions: boolean;
  images: boolean;
  videos?: boolean;
  skills: boolean;
  rules?: boolean;
  config: boolean;
  aiConfigJson?: string;
  settingsJson?: string;
  exportJson?: string;
}

ipcMain.handle(
  "data:exportZip",
  async (
    _event,
    params: { scope: ExportZipScope },
  ): Promise<{ canceled: boolean; filePath?: string; error?: string }> => {
    try {
      const { zipSync, strToU8 } = await import("fflate");
      const dateStr = new Date().toISOString().split("T")[0];
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: "导出数据",
        defaultPath: `prompthub-export-${dateStr}.zip`,
        filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
      });
      if (canceled || !filePath) return { canceled: true };

      const zipFiles: Record<string, [Uint8Array, { level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 }]> = {};

      function collectDirFiles(srcDir: string, zipPrefix: string): void {
        if (!fs.existsSync(srcDir)) return;
        const entries = fs.readdirSync(srcDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(srcDir, entry.name);
          const zipPath = `${zipPrefix}${entry.name}`;
          if (entry.isDirectory()) {
            collectDirFiles(fullPath, `${zipPath}/`);
          } else if (entry.isFile()) {
            zipFiles[zipPath] = [fs.readFileSync(fullPath), { level: 1 }];
          }
        }
      }

      const { scope } = params;
      if (scope.prompts) {
        collectDirFiles(getPromptsWorkspaceDir(), "prompts/");
      }
      if (scope.versions) {
        const versionsDir = path.join(getWorkspaceDir(), ".versions");
        collectDirFiles(versionsDir, "versions/");
      }
      if (scope.skills) {
        collectDirFiles(getSkillsDir(), "skills/");
      }
      if (scope.rules) {
        collectDirFiles(getRulesDir(), "rules/");
      }
      if (scope.images) {
        collectDirFiles(getImagesDir(), "images/");
      }
      if (scope.videos) {
        collectDirFiles(getVideosDir(), "videos/");
      }
      if (scope.config) {
        collectDirFiles(getConfigDir(), "config/");
      }
      if (scope.aiConfigJson) {
        zipFiles["ai-config.json"] = [strToU8(scope.aiConfigJson), { level: 1 }];
      }
      if (scope.settingsJson) {
        zipFiles["settings.json"] = [strToU8(scope.settingsJson), { level: 1 }];
      }
      if (scope.exportJson) {
        zipFiles["import-with-prompthub.json"] = [strToU8(scope.exportJson), { level: 1 }];
      }

      const zipped = zipSync(zipFiles);
      fs.writeFileSync(filePath, zipped);
      return { canceled: false, filePath };
    } catch (error) {
      return {
        canceled: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
);

/**
 * Build the list of candidate paths where a previous database might reside.
 * On Windows this includes %APPDATA%/PromptHub (the Electron default).
 */
type DataPathChangeAction = "migrate" | "switch" | "overwrite";

interface DataPathSummary {
  promptCount: number;
  folderCount: number;
  skillCount: number;
  available: boolean;
  error?: string;
}

const DATA_PATH_MIGRATION_ITEMS = [
  "prompthub.db",
  "data",
  "config",
  "backups",
  "logs",
  "workspace",
  "IndexedDB",
  "Local Storage",
  "Session Storage",
  "images",
  "videos",
  "skills",
  "shortcuts.json",
  "shortcut-mode.json",
];

function getObjectNumberValue(source: unknown, key: string): number {
  if (!source || typeof source !== "object") {
    return 0;
  }

  const value = Reflect.get(source, key);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function databaseTableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare("SELECT 1 AS exists_flag FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);
  return getObjectNumberValue(row, "exists_flag") === 1;
}

function countDatabaseTable(db: Database.Database, tableName: string): number {
  if (!databaseTableExists(db, tableName)) {
    return 0;
  }

  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get();
  return getObjectNumberValue(row, "count");
}

function summarizeDatabase(db: Database.Database): DataPathSummary {
  return {
    promptCount: countDatabaseTable(db, "prompts"),
    folderCount: countDatabaseTable(db, "folders"),
    skillCount: countDatabaseTable(db, "skills"),
    available: true,
  };
}

function summarizeDataPath(targetPath: string): DataPathSummary {
  const resolvedTargetPath = path.resolve(targetPath);
  const currentPath = path.resolve(app.getPath("userData"));

  try {
    if (appDb && resolvedTargetPath === currentPath) {
      return summarizeDatabase(appDb);
    }

    const dbPath = path.join(resolvedTargetPath, "prompthub.db");
    if (!fs.existsSync(dbPath)) {
      return {
        promptCount: 0,
        folderCount: 0,
        skillCount: 0,
        available: false,
      };
    }

    const db = new Database(dbPath, { readOnly: true });
    try {
      return summarizeDatabase(db);
    } finally {
      db.close();
    }
  } catch (error) {
    return {
      promptCount: 0,
      folderCount: 0,
      skillCount: 0,
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function isSensitiveDataPathTarget(resolvedNewPath: string): string | null {
  const sensitiveRoots = [
    "/etc",
    "/usr",
    "/bin",
    "/sbin",
    "/var",
    "/tmp",
    "/System",
    "/Library",
    "C:\\Windows",
    "C:\\Program Files",
  ];

  return (
    sensitiveRoots.find((root) =>
      resolvedNewPath.toLowerCase().startsWith(root.toLowerCase()),
    ) ?? null
  );
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const resolvedParent = path.resolve(parentPath);
  const resolvedChild = path.resolve(childPath);
  return (
    resolvedChild !== resolvedParent &&
    resolvedChild.startsWith(`${resolvedParent}${path.sep}`)
  );
}

function scheduleAppRelaunch(delayMs = 0): void {
  const relaunch = () => {
    app.relaunch();
    app.quit();
  };

  if (delayMs > 0) {
    setTimeout(relaunch, delayMs);
    return;
  }

  relaunch();
}

async function applyDataPathChange(
  newPath: string,
  action: DataPathChangeAction,
): Promise<{
  success: boolean;
  message?: string;
  newPath?: string;
  needsRestart?: boolean;
  backupPath?: string;
  error?: string;
}> {
  if (typeof newPath !== "string" || newPath.trim().length === 0) {
    return {
      success: false,
      error: "data path change requires a non-empty newPath string",
    };
  }
  if (action !== "migrate" && action !== "switch" && action !== "overwrite") {
    return {
      success: false,
      error: `Unsupported data path change action: ${action}`,
    };
  }

  const currentPath = app.getPath("userData");
  const resolvedTargetPath = path.resolve(newPath);
  if (path.resolve(currentPath) === resolvedTargetPath) {
    return {
      success: true,
      message: "Data directory is already current",
      newPath: resolvedTargetPath,
      needsRestart: false,
    };
  }

  const sensitiveRoot = isSensitiveDataPathTarget(resolvedTargetPath);
  if (sensitiveRoot) {
    return {
      success: false,
      error: `Cannot use system directory as data directory: ${resolvedTargetPath}`,
    };
  }

  if (fs.existsSync(resolvedTargetPath) && !isLinkSafeDataPathRoot(resolvedTargetPath)) {
    return {
      success: false,
      error: `Cannot use symbolic link as data directory: ${resolvedTargetPath}`,
    };
  }

  if (action !== "switch" && isPathInside(currentPath, resolvedTargetPath)) {
    return {
      success: false,
      error: "Cannot migrate data into a child directory of the current data directory",
    };
  }

  const targetInspection = inspectDataPath(resolvedTargetPath);
  if (action === "switch") {
    if (!targetInspection.exists) {
      return {
        success: false,
        error: `Cannot switch to a directory that does not exist: ${resolvedTargetPath}`,
      };
    }

    writeConfiguredDataPath(app.getPath("appData"), resolvedTargetPath);
    return {
      success: true,
      message: "Data directory switched",
      newPath: resolvedTargetPath,
      needsRestart: true,
    };
  }

  if (action === "migrate" && targetInspection.hasPromptHubData) {
    return {
      success: false,
      error:
        "Target directory already contains PromptHub data. Switch to it or choose overwrite instead.",
    };
  }

  let backupPath: string | undefined;
  try {
    if (action === "overwrite" && targetInspection.exists && targetInspection.hasPromptHubData) {
      const snapshot = await createUpgradeDataSnapshot(resolvedTargetPath, {
        fromVersion: `${app.getVersion()}-pre-data-path-overwrite`,
        toVersion: app.getVersion(),
      });
      backupPath = snapshot.backupPath;
    }

    if (!fs.existsSync(resolvedTargetPath)) {
      fs.mkdirSync(resolvedTargetPath, { recursive: true });
    }

    let migratedCount = 0;
    for (const item of DATA_PATH_MIGRATION_ITEMS) {
      // Preserve the target snapshot created just before destructive overwrite.
      if (action === "overwrite" && item === "backups" && backupPath) {
        continue;
      }

      const sourcePath = path.join(currentPath, item);
      const destPath = path.join(resolvedTargetPath, item);
      if (!fs.existsSync(sourcePath)) {
        continue;
      }

      if (copyDataPathItem(sourcePath, destPath, action === "overwrite")) {
        migratedCount++;
      }
    }

    writeConfiguredDataPath(app.getPath("appData"), resolvedTargetPath);

    return {
      success: true,
      message: `Successfully migrated ${migratedCount} items`,
      newPath: resolvedTargetPath,
      needsRestart: true,
      backupPath,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

ipcMain.handle("data:previewDataPathChange", async (_event, newPath: string) => {
  if (typeof newPath !== "string" || newPath.trim().length === 0) {
    return {
      success: false,
      error: "data:previewDataPathChange requires a non-empty newPath string",
    };
  }

  const currentPath = app.getPath("userData");
  const resolvedTargetPath = path.resolve(newPath);
  if (fs.existsSync(resolvedTargetPath) && !isLinkSafeDataPathRoot(resolvedTargetPath)) {
    return {
      success: false,
      error: `Cannot use symbolic link as data directory: ${resolvedTargetPath}`,
    };
  }

  const inspection = inspectDataPath(resolvedTargetPath);
  const isCurrentPath = path.resolve(currentPath) === resolvedTargetPath;

  return {
    success: true,
    targetPath: resolvedTargetPath,
    currentPath,
    exists: inspection.exists,
    hasPromptHubData: inspection.hasPromptHubData,
    isCurrentPath,
    markers: inspection.markers,
    currentSummary: summarizeDataPath(currentPath),
    targetSummary: summarizeDataPath(resolvedTargetPath),
    recommendedAction: isCurrentPath
      ? "switch"
      : inspection.hasPromptHubData
        ? "switch"
        : "migrate",
  };
});

ipcMain.handle(
  "data:applyDataPathChange",
  async (
    _event,
    params: { newPath?: unknown; action?: unknown },
  ) => {
    const newPath = typeof params?.newPath === "string" ? params.newPath : "";
    const action =
      params?.action === "switch" ||
      params?.action === "overwrite" ||
      params?.action === "migrate"
        ? params.action
        : "migrate";
    return applyDataPathChange(newPath, action);
  },
);

// Migrate data to a new directory
// 迁移数据到新目录
ipcMain.handle("data:migrate", async (_event, newPath: string) => {
  return applyDataPathChange(newPath, "migrate");
});

// Open a folder in the system file manager
// 在文件管理器中打开文件夹
ipcMain.handle("shell:openPath", async (_event, folderPath: string) => {
  const homePath = app.getPath("home");
  return openDirectoryPath(folderPath, {
    appDataPath: app.getPath("appData"),
    homePath,
    localAppDataPath:
      process.env.LOCALAPPDATA || path.join(homePath, "AppData", "Local"),
    lstatSync: fs.lstatSync,
    openPath: (targetPath) => shell.openPath(targetPath),
    showItemInFolder: (targetPath) => shell.showItemInFolder(targetPath),
    statSync: fs.statSync,
  });
});

// Show system notification
// 发送系统通知
ipcMain.handle(
  "notification:show",
  async (_event, options: { title: string; body: string }) => {
    if (!options || typeof options !== "object") {
      throw new Error("notification:show requires a non-null options object");
    }
    if (typeof options.title !== "string" || typeof options.body !== "string") {
      throw new Error(
        "notification:show requires title and body to be strings",
      );
    }
    if (Notification.isSupported()) {
      // Resolve icon path
      // 获取图标路径
      let iconPath: string;
      if (isDev) {
        iconPath = path.join(__dirname, "../../resources/icon.png");
      } else {
        iconPath = path.join(process.resourcesPath, "icon.png");
      }

      const notification = new Notification({
        title: options.title,
        body: options.body,
        icon: iconPath,
      });
      notification.show();
      return true;
    }
    return false;
  },
);

// App startup
// 应用启动
app.whenReady().then(async () => {
  try {
    // A second packaged instance on Windows may still reach whenReady() before quit
    // if we only call app.quit() after failing the single-instance lock.
    // Guard bootstrap here so the loser instance never continues into createWindow/loadFile.
    // Windows 上第二个实例在拿不到单实例锁后，仍可能先进入 whenReady() 再退出。
    // 这里再次拦截，确保失败实例不会继续执行 createWindow/loadFile。
    if (!gotTheLock && !isE2E) {
      app.quit();
      return;
    }

    // Register updater IPC as early as possible so renderer calls do not depend on
    // later startup work (DB bootstrap, workspace sync, window creation) completing.
    registerUpdaterIPC();

    // Register local-image protocol
    // 注册 local-image 协议
    session.defaultSession.protocol.registerFileProtocol(
      "local-image",
      (request, callback) => {
        const imagePath = resolveLocalMediaProtocolPath(
          request.url,
          "local-image",
          getImagesDir(),
        );
        if (imagePath) {
          callback({ path: imagePath });
          return;
        }
        console.warn("Blocked local-image protocol path:", request.url);
        callback({ path: "" });
      },
    );

    // Register local-video protocol
    // 注册 local-video 协议
    session.defaultSession.protocol.registerFileProtocol(
      "local-video",
      (request, callback) => {
        const videoPath = resolveLocalMediaProtocolPath(
          request.url,
          "local-video",
          getVideosDir(),
        );
        if (videoPath) {
          callback({ path: videoPath });
          return;
        }
        console.warn("Blocked local-video protocol path:", request.url);
        callback({ path: "" });
      },
    );

    try {
      const backupStartup = await runUpgradeBackupStartupTasks(
        app.getPath("userData"),
        app.getVersion(),
      );
      logStartupEvent({
        event: "startup:upgrade_backup",
        status: backupStartup.status,
        previousVersion: backupStartup.previousVersion,
        currentVersion: backupStartup.currentVersion,
        migratedLegacyBackups: backupStartup.migration.migrated,
        skippedLegacyBackups: backupStartup.migration.skipped,
        snapshotBackupId: backupStartup.snapshot?.backupId ?? null,
        snapshotPath: scrubPath(backupStartup.snapshot?.backupPath ?? null),
        snapshotFromVersion: backupStartup.snapshot?.manifest.fromVersion ?? null,
        snapshotToVersion: backupStartup.snapshot?.manifest.toVersion ?? null,
        snapshotError: backupStartup.snapshotError,
      });

      const layoutMigration = await migrateLegacyDataLayout(
        app.getPath("userData"),
        app.getVersion(),
      );
      logStartupEvent({
        event: "startup:data_layout_migration",
        status: layoutMigration.status,
        backupId: layoutMigration.backupId,
        movedEntries: layoutMigration.movedEntries,
        failedEntries: layoutMigration.failedEntries,
        markerPath: scrubPath(layoutMigration.markerPath),
      });

      // Warn about residual legacy entries that could not be moved.
      // These entries will be shown in DataRecoveryDialog so users are not
      // silently left with inaccessible data.
      //
      // 若有旧版条目因迁移失败而残留在根目录，记录警告。
      // DataRecoveryDialog 会读取此条目向用户展示，避免数据静默不可访问。
      if (layoutMigration.failedEntries.length > 0) {
        const residual = detectResidualLegacyEntries(app.getPath("userData"));
        if (residual.length > 0) {
          logStartupEvent({
            event: "startup:data_layout_migration_partial",
            residualEntries: residual,
            message:
              "Some legacy data directories could not be moved. " +
              "DataRecoveryDialog will surface these so the user can resolve them. " +
              "Source directories are preserved — no data was lost.",
          });
        }
      }
    } catch (error) {
      console.warn("[startup] upgrade backup bootstrap failed, continuing:", error);
      logStartupEvent({
        event: "startup:upgrade_backup_failed_to_bootstrap",
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Initialize database
    // 初始化数据库
    const db = initDatabase();
    applyE2ESeed(db);
    // v0.5.3: Log startup diagnostics (userData path, DB emptiness) before
    // any recovery logic runs. Persisted to <userData>/logs/startup.log so
    // users can share it when diagnosing Windows upgrade issues.
    // v0.5.3: 在恢复逻辑运行前记录启动诊断信息（userData 路径、DB 是否为空）。
    // 持久化到 <userData>/logs/startup.log，便于用户反馈 Windows 升级问题时分享。
    try {
      logStartupEvent({
        event: "startup:db_initialized",
        userDataPath: scrubPath(app.getPath("userData")),
        appDataPath: scrubPath(app.getPath("appData")),
        dbEmpty: isDatabaseEmpty(db),
      });
    } catch {
      // ignore
    }
    // v0.5.3: Wrap bootstrapPromptWorkspace in try/catch to prevent startup crash
    // if workspace directory operations fail (e.g., permission issues on Windows
    // upgrades). A workspace bootstrap failure should not block the app — users
    // can still access their data via the DB; workspace files can resync later.
    // v0.5.3: 用 try/catch 包裹 bootstrapPromptWorkspace，避免工作区目录操作失败
    // （如 Windows 升级后权限问题）阻塞整个启动流程。工作区引导失败不应阻塞应用，
    // 用户仍可通过数据库访问数据，工作区文件可稍后重新同步。
    try {
      await bootstrapRuleWorkspace();
    } catch (error) {
      console.error(
        "[startup] bootstrapRuleWorkspace failed, continuing without rules workspace bootstrap:",
        error,
      );
      logStartupEvent({
        event: "startup:bootstrap_rules_workspace_failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const bootstrapResult = bootstrapPromptWorkspace(
        new PromptDB(db),
        new FolderDB(db),
      );
      // v0.5.3: Always log bootstrap outcome so users who see an empty UI
      // after upgrade can share a diagnosable log. "empty" quadrant in
      // particular indicates both DB and workspace were empty — the user
      // likely needs to use DataRecoveryDialog manually.
      // v0.5.3: 总是记录引导结果，以便升级后看到空界面的用户能提供可分析日志。
      // 特别是 "empty" 象限意味着 DB 和工作区都空，用户可能需要手动使用
      // DataRecoveryDialog 恢复数据。
      logStartupEvent({
        event:
          bootstrapResult.quadrant === "empty"
            ? "startup:bootstrap_workspace_empty"
            : "startup:bootstrap_workspace_ok",
        quadrant: bootstrapResult.quadrant,
        imported: bootstrapResult.imported,
        exported: bootstrapResult.exported,
        promptCount: bootstrapResult.promptCount,
        folderCount: bootstrapResult.folderCount,
        versionCount: bootstrapResult.versionCount,
        ...(bootstrapResult.restoreMarkerUsed
          ? { restoreMarkerUsed: true }
          : {}),
      });
      if (bootstrapResult.quadrant === "empty") {
        console.warn(
          "[startup] Both database and workspace are empty. " +
            "If this is an upgrade, the user should use DataRecoveryDialog " +
            "to restore data from a previous install location.",
        );
      }
    } catch (error) {
      console.error(
        "[startup] bootstrapPromptWorkspace failed, continuing without workspace sync:",
        error,
      );
      logStartupEvent({
        event: "startup:bootstrap_workspace_failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
    appDb = db; // Save to module-level variable for createWindow access
    registerAllIPC(db, (nextDb) => {
      appDb = nextDb;
    });

    // Create application menu
    // 创建菜单
    createMenu();

    // Register global shortcuts
    // 注册快捷键
    registerShortcuts();

    // Register WebDAV IPC (bypass CORS)
    // 注册 WebDAV IPC（绕过 CORS）
    registerWebDAVIPC();
    registerS3IPC();
    registerE2EIPC();

    // Register shortcuts IPC
    // 注册快捷键 IPC
    registerShortcutsIPC();

    // Create main window
    // 创建窗口
    await createWindow();

    // Init updater (production only)
    // 初始化更新器（仅在生产环境）
    if (!isDev && !isE2E && mainWindow) {
      initUpdater(mainWindow);
    }

    // macOS: show window when clicking Dock icon
    // macOS: 点击 dock 图标时显示窗口
    app.on("activate", async () => {
      await createWindow();
    });
  } catch (error) {
    console.error("Failed to initialize app:", error);
    dialog.showErrorBox(
      "Startup Error / 启动错误",
      `An error occurred during application startup:\n\n${error instanceof Error ? error.message : String(error)}\n\nStack:\n${error instanceof Error ? error.stack : ""}`,
    );
    app.quit();
  }
});

// Quit when all windows are closed (Windows & Linux)
// 所有窗口关闭时退出（Windows & Linux）
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Cleanup before quitting
// 应用退出前清理
app.on("before-quit", () => {
  isQuitting = true;
  closeDatabase();
});

// Export main window reference (used by other modules)
// 导出主窗口引用（供其他模块使用）
export function getMainWindow() {
  return mainWindow;
}
