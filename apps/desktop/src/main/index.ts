import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Tray,
  Menu,
  nativeImage,
  session,
  protocol,
  safeStorage,
} from "electron";
import {
  applyStorageRootChange,
  getStorageDiagnostic,
  recoverJournaledStorageRestore,
  recoverPendingStorageRootChangeSync,
} from "@prompthub/core";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import path from "path";
import fs from "fs";
import type {
  AppCommand,
  RecoveryCandidate,
  RecoveryScanOptions,
} from "@prompthub/shared/types";
import Database from "./database/sqlite";
import { initDatabase, closeDatabase } from "./database";
import {
  isDatabaseEmpty,
  detectRecoverableDatabases,
  detectRecoverableDatabaseFiles,
} from "./database";
import { registerAllIPC } from "./ipc";
import { getMinimizeOnLaunchSetting } from "./settings/settings-readers";
import { readLanguageSetting } from "./settings/language-setting";
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
import { configureE2ESecretStorage } from "./testing/e2e-secret-storage";
import {
  getHistoricalDefaultUserDataPath,
  getStorageOperationControlDirectory,
  readConfiguredDataPath,
  resolveInitialUserDataPath,
  writeConfiguredDataPath,
} from "./data-path";
import {
  configureRuntimePaths,
  getImagesDir,
  getGeneratedImagesDir,
  getGenerationsDir,
  getRulesDir,
  getVideosDir,
  getSkillsDir,
  getWorkspaceDir,
  getPromptsWorkspaceDir,
  getCacheDir,
  getDataDir,
  getDatabasePath,
  getUserDataPath,
} from "./runtime-paths";
import { registerAppRuntimeIPC } from "./ipc/app-runtime.ipc";
import { PromptDB } from "./database/prompt";
import { FolderDB } from "./database/folder";
import {
  bootstrapPromptWorkspace,
  writeRestoreMarker,
} from "./services/prompt-workspace";
import { bootstrapRuleWorkspace } from "./services/rules-workspace";
import {
  migrateLegacyDataLayout,
  detectResidualLegacyEntries,
} from "./services/data-layout-migration";
import { listUpgradeBackups } from "./services/upgrade-backup";
import { runUpgradeBackupStartupTasks } from "./services/upgrade-backup-startup";
import { runManagedBackupRetentionAtStartup } from "./services/managed-backup-retention";
import * as packagedStartupSmokeProfile from "./testing/release-smoke-profile";
import { performJournaledDatabaseRecovery } from "./services/journaled-database-recovery";
import { registerPortableSnapshotIPC } from "./services/portable-snapshot-ipc";
import {
  inspectStorageDatabase,
  verifyDataRootDatabase,
  verifyRestoredStorageRoot,
} from "./services/storage-database-inspection";
import {
  buildCurrentCanonicalRecoveryCandidates,
  compareRecoveryCandidates,
  buildDirectoryRecoveryCandidate,
  buildResidualLegacyRecoveryCandidate,
  buildStandaloneDbBackupCandidate,
  buildUpgradeBackupRecoveryCandidate,
  findRecoveryCandidateByPath,
  listStandaloneDatabaseBackupFiles,
  previewRecoveryCandidate,
} from "./services/recovery-candidates";
import { getRecoveryCandidatePaths } from "./services/recovery-paths";
import { logStartupEvent, scrubPath } from "./startup-log";
import { shouldOpenStartupDevTools } from "./devtools-policy";
import { handleExternalWindowOpen } from "./external-links";
import { resolveLocalMediaProtocolPath } from "./local-media-protocol";
import { applyNetworkProxySettings } from "./services/network-proxy";
import { createTrayController } from "./tray-controller";
import { dispatchTrayAppCommand } from "./tray-command-dispatcher";
import { handleLegacyDesktopCliInvocation } from "./legacy-cli-invocation";
import { getTrayMenuLabels } from "./tray-menu";
import type { AgentProviderRuntime } from "./services/agent-provider-runtime";
import { handleAgentProviderTraySelection } from "./services/agent-provider-tray-handler";
import { agentUsageService } from "./services/agent-usage-runtime";
import { startAgentDeepLinkRouting } from "./agent-deep-link-router";
import { ensureCanonicalStorageAuthorityOnStartup } from "./services/canonical-storage-startup";
import { createMcpResourceSecretStore } from "./services/mcp-resource-secret-store";
import { performSelectedCanonicalRecovery } from "./services/canonical-storage-recovery";
import { registerDataPathChangeIPC } from "./services/data-path-change-ipc";
import { registerWindowControlIPC } from "./ipc/window-control.ipc";
import { registerNativeShellIPC } from "./ipc/native-shell.ipc";
import { readRendererSettingsWithAIRecovery } from "./services/renderer-ai-config-recovery";
import { reconcileManagedSkillSymlinksOnStartup } from "./services/skill-platform-symlink-startup";
import { upgradeSkillPlatformDataOnStartup } from "./services/skill-platform-data-upgrade";
let mainWindow: BrowserWindow | null = null;
let minimizeToTray = false;
// Database instance (module-level for access in createWindow)
// 数据库实例（模块级变量，供 createWindow 访问）
let appDb: Database.Database | null = null;
let agentProviderRuntime: AgentProviderRuntime | null = null;
let isQuitting = false;
// Close action: 'ask' = ask every time, 'minimize' = minimize to tray, 'exit' = exit directly
// 关闭行为: 'ask' = 每次询问, 'minimize' = 最小化到托盘, 'exit' = 直接退出
let closeAction: "ask" | "minimize" | "exit" = "ask";
// Whether we are waiting for the user to choose a close behavior
// 是否正在等待用户选择关闭行为
let pendingCloseAction = false;
let isDebugMode = false;

async function applyStoredNetworkProxySettings(
  db: Database.Database,
): Promise<void> {
  const canonical = await readRendererSettingsWithAIRecovery({
    activeRoot: getUserDataPath(),
    encryption: safeStorage,
  });
  if (canonical.migrationComplete) {
    await applyNetworkProxySettings(canonical.settings.networkProxy);
    return;
  }
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get("networkProxy") as { value: string } | undefined;
  let value: unknown;
  if (row) {
    try {
      value = JSON.parse(row.value);
    } catch {
      value = undefined;
    }
  }
  await applyNetworkProxySettings(value);
}

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
  if (isQuitting) return;
  sendToMainWindow("window:visibility-changed", isVisible);
  trayController.refresh();
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
    scheme: "local-generation-image",
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
const isLegacyCliInvocation = process.argv.includes("--cli");
const packagedStartupSmoke =
  packagedStartupSmokeProfile.resolvePackagedStartupSmokeSetup({
    env: process.env,
    isPackaged: app.isPackaged,
    platform: process.platform,
    onExit: () => setImmediate(() => app.quit()),
    logMigration: (status) =>
      logStartupEvent({
        event: "startup:renderer_persistence_migration",
        status,
      }),
  });
if (packagedStartupSmoke.appDataPath) {
  fs.mkdirSync(packagedStartupSmoke.appDataPath, { recursive: true });
  const stats = fs.lstatSync(packagedStartupSmoke.appDataPath);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(
      "Packaged startup smoke AppData must be a regular directory",
    );
  }
  app.setPath("appData", packagedStartupSmoke.appDataPath);
}
configureE2ETestProfile();
if (!isE2E) {
  const appDataPath = app.getPath("appData");
  const rootRecovery = recoverPendingStorageRootChangeSync({
    controlDirectory: getStorageOperationControlDirectory(appDataPath),
    publishBootPointer: (rootPath) =>
      writeConfiguredDataPath(appDataPath, rootPath),
    verifyDatabase: verifyDataRootDatabase,
  });
  if (rootRecovery.status === "recovery-required") {
    throw new Error(
      `PromptHub storage root recovery is required: ${rootRecovery.reason ?? "unknown error"}`,
    );
  }
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

const dispatchFromTray = (command: AppCommand) =>
  void dispatchTrayAppCommand({
    command,
    createWindow,
    getWindow: () => mainWindow,
    onWindowShown: () => emitWindowVisibility(true),
    sendCommand: (pendingCommand) =>
      sendToMainWindow(IPC_CHANNELS.APP_COMMAND, pendingCommand),
  });
const trayController = createTrayController({
  agentManagementEnabled: true,
  buildMenu: (template) => Menu.buildFromTemplate(template),
  createFromPath: (filePath) => nativeImage.createFromPath(filePath),
  createTray: (icon) => new Tray(icon),
  dirname: __dirname,
  getLocale: () => app.getLocale(),
  getResourcesPath: () => process.resourcesPath,
  getStoredLanguage: () => (appDb ? readLanguageSetting(appDb) : null),
  getWindowVisibility: () => mainWindow?.isVisible() ?? false,
  isDev,
  loadAgentProviderGroups: () =>
    agentProviderRuntime?.trayService.listGroups() ?? Promise.resolve([]),
  loadAgentUsage: (agentId, options) =>
    agentUsageService.getUsage(agentId, options),
  onAgentProviderProfile: (agentId, profileId) => {
    const runtime = agentProviderRuntime;
    if (!runtime) return;
    const locale =
      (appDb ? readLanguageSetting(appDb) : null) ?? app.getLocale();
    void handleAgentProviderTraySelection({
      input: { agentId, profileId },
      labels: getTrayMenuLabels(locale),
      openAgents: () => dispatchFromTray({ type: "agent:manage" }),
      reloadAgentProviders: () => trayController.reloadAgentProviders(),
      service: runtime.trayService,
      showMessageBox: (options) =>
        mainWindow && !mainWindow.isDestroyed()
          ? dialog.showMessageBox(mainWindow, options)
          : dialog.showMessageBox(options),
    });
  },
  onCommand: dispatchFromTray,
  onQuit: () => {
    isQuitting = true;
    app.quit();
  },
  onToggleWindow: () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      toggleWindowForShowApp(mainWindow, emitWindowVisibility);
    } else {
      void createWindow();
    }
  },
  platform: process.platform,
});

function registerDatabaseBoundIpc(database: Database.Database): void {
  appDb = database;
  registerAllIPC(
    database,
    (nextDb) => {
      appDb = nextDb;
    },
    (runtime) => {
      agentProviderRuntime = runtime;
      void trayController.reloadAgentProviders();
    },
    packagedStartupSmoke.controller.onRendererPersistenceMigration,
  );
}

const gotTheLock =
  isE2E || isLegacyCliInvocation ? true : app.requestSingleInstanceLock();
const agentDeepLinkRouter = startAgentDeepLinkRouting(
  app,
  gotTheLock && !isLegacyCliInvocation,
  isE2E,
);

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", async (_event, argv) => {
    agentDeepLinkRouter.acceptArgv(argv);
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
      emitWindowVisibility(true);
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
    emitWindowVisibility(true);
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
      osRequestedHidden || (appDb ? getMinimizeOnLaunchSetting(appDb) : false);

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
      process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173";
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

registerWindowControlIPC({
  emitVisibility: emitWindowVisibility,
  getWindow: () => mainWindow,
  onCloseAction: (action) => {
    closeAction = action;
    if (action === "minimize" && process.platform === "win32") createTray();
  },
  onCloseDialogCancel: () => {
    pendingCloseAction = false;
  },
  onCloseDialogResult: ({ action, remember }) => {
    pendingCloseAction = false;
    if (remember) closeAction = action;
    if (action === "minimize") {
      mainWindow?.hide();
      createTray();
    } else {
      isQuitting = true;
      mainWindow?.close();
    }
  },
  onDebugMode: (enabled) => {
    isDebugMode = enabled;
  },
  onMinimizeToTray: (enabled) => {
    minimizeToTray = enabled;
    if (enabled) createTray();
    else destroyTray();
  },
  scheduleRelaunch: () => scheduleAppRelaunch(),
});

registerAppRuntimeIPC();

function createTray() {
  trayController.create();
}

function destroyTray() {
  trayController.destroy();
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
      !!resolvedConfiguredPath &&
      resolvedConfiguredPath !== resolvedCurrentPath,
    storage: getStorageDiagnostic(currentPath, {
      controlDirectory: getStorageOperationControlDirectory(
        app.getPath("appData"),
      ),
      inspectDatabase: (databasePath) =>
        inspectStorageDatabase(databasePath, appDb, getDatabasePath()),
    }),
  };
});

let cachedRecoveryResult: RecoveryCandidate[] | null = null;
let transientRecoveryResult: RecoveryCandidate[] | null = null;
let canonicalRecoveryRequired = false;
let canonicalRecoveryReason: string | null = null;
const RECOVERY_DISMISS_MARKER = ".recovery-dismissed";
let recoveryAttemptedThisSession = false;

ipcMain.handle(
  "data:checkRecovery",
  async (_event, options?: RecoveryScanOptions) => {
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
    if (
      !canonicalRecoveryRequired &&
      !ignoreDismissMarker &&
      fs.existsSync(dismissMarkerPath)
    ) {
      cachedRecoveryResult = [];
      transientRecoveryResult = null;
      return [];
    }
    const results: RecoveryCandidate[] = [];
    if (canonicalRecoveryRequired) {
      results.push(
        ...buildCurrentCanonicalRecoveryCandidates(
          currentPath,
          getDatabasePath(),
        ),
      );
    }
    const residualCandidate = buildResidualLegacyRecoveryCandidate(currentPath);
    if (residualCandidate) {
      results.push(residualCandidate);
    }
    const isDbEmpty = !!appDb && isDatabaseEmpty(appDb);
    // A Settings scan checks all candidate paths regardless of DB state.
    // Without this, users whose DB has any data can never surface recovery candidates.
    const shouldScanCandidates =
      canonicalRecoveryRequired || isDbEmpty || ignoreDismissMarker;
    const candidatePaths = getRecoveryCandidatePaths({
      currentPath,
      appDataPath: app.getPath("appData"),
      homePath: app.getPath("home"),
      exePath: process.execPath,
      isPackaged: app.isPackaged,
      platform: process.platform,
    });
    const mergedCandidatePaths = Array.from(
      new Set(
        [...candidatePaths, ...extraPaths].map((value) => path.resolve(value)),
      ),
    );
    if (shouldScanCandidates) {
      results.push(
        ...detectRecoverableDatabases(currentPath, mergedCandidatePaths).map(
          (candidate) => buildDirectoryRecoveryCandidate(candidate),
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
        console.warn(
          "[Recovery] failed to inspect upgrade backup candidates:",
          error,
        );
      }

      results.push(
        ...detectRecoverableDatabaseFiles(
          currentPath,
          Array.from(
            new Set([
              ...listStandaloneDatabaseBackupFiles(currentPath),
              ...extraPaths.map((value) => path.resolve(value)),
            ]),
          ),
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
      .sort(compareRecoveryCandidates);

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
  },
);

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
  const selectedCandidate = findRecoveryCandidateByPath(
    transientRecoveryResult ?? cachedRecoveryResult ?? [],
    sourcePath,
  );
  if (
    selectedCandidate?.sourceType === "current-file-workspace" ||
    selectedCandidate?.sourceType === "current-canonical-db"
  ) {
    return performSelectedCanonicalRecovery(selectedCandidate.sourceType, {
      activeRoot: currentPath,
      sourceDatabasePath: getDatabasePath(),
      sourcePath,
      encryption: safeStorage,
      recoveryReason: canonicalRecoveryReason,
      scheduleRelaunch: scheduleAppRelaunch,
      onSuccess: () => {
        canonicalRecoveryRequired = false;
        canonicalRecoveryReason = null;
        cachedRecoveryResult = null;
        transientRecoveryResult = null;
      },
      onFailure: () => {
        recoveryAttemptedThisSession = false;
        registerDatabaseBoundIpc(initDatabase());
      },
    });
  }
  if (path.resolve(sourcePath) === path.resolve(currentPath)) {
    try {
      closeDatabase();
      const migResult = await migrateLegacyDataLayout(
        currentPath,
        app.getVersion(),
      );
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
        registerDatabaseBoundIpc(initDatabase());
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
      recoveryAttemptedThisSession = false;
      registerDatabaseBoundIpc(initDatabase());
      const msg =
        retryErr instanceof Error ? retryErr.message : String(retryErr);
      logStartupEvent({
        event: "recovery:residual_migration_retry_failed",
        error: msg,
      });
      return { success: false, error: msg };
    }
  }

  closeDatabase();

  const result = await performJournaledDatabaseRecovery(
    sourcePath,
    currentPath,
  );

  if (result.success) {
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

  recoveryAttemptedThisSession = false;
  logStartupEvent({
    event: "recovery:failed",
    sourcePath: scrubPath(sourcePath),
    error: result.error,
  });
  registerDatabaseBoundIpc(initDatabase());

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

registerPortableSnapshotIPC(isE2E ? () => undefined : scheduleAppRelaunch);

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

/**
 * Build the list of candidate paths where a previous database might reside.
 * On Windows this includes %APPDATA%/PromptHub (the Electron default).
 */
registerDataPathChangeIPC({
  closeDatabase: () => {
    closeDatabase();
    appDb = null;
  },
  getDatabase: () => appDb,
  reopenDatabase: () => {
    appDb = initDatabase();
  },
  scheduleRelaunch: scheduleAppRelaunch,
});

registerNativeShellIPC(isDev);

// App startup
// 应用启动
app.whenReady().then(async () => {
  try {
    if (
      handleLegacyDesktopCliInvocation({
        argv: process.argv,
        exit: (code) => app.exit(code),
        writeError: (message) => process.stderr.write(message),
      })
    ) {
      return;
    }

    // A second packaged instance on Windows may still reach whenReady() before quit
    // if we only call app.quit() after failing the single-instance lock.
    // Guard bootstrap here so the loser instance never continues into createWindow/loadFile.
    // Windows 上第二个实例在拿不到单实例锁后，仍可能先进入 whenReady() 再退出。
    // 这里再次拦截，确保失败实例不会继续执行 createWindow/loadFile。
    if (!gotTheLock && !isE2E) {
      app.quit();
      return;
    }

    configureE2ESecretStorage(safeStorage);

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

    session.defaultSession.protocol.registerFileProtocol(
      "local-generation-image",
      (request, callback) => {
        const imagePath = resolveLocalMediaProtocolPath(
          request.url,
          "local-generation-image",
          getGeneratedImagesDir(),
        );
        if (imagePath) {
          callback({ path: imagePath });
          return;
        }
        console.warn("Blocked local generation image path:", request.url);
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
      const restoreRecovery = await recoverJournaledStorageRestore({
        activeRoot: app.getPath("userData"),
        verifyActive: verifyRestoredStorageRoot,
      });
      if (restoreRecovery.status === "recovery-required") {
        throw new Error(
          `Storage restore recovery is required: ${restoreRecovery.reason ?? "unknown error"}`,
        );
      }
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
        snapshotFromVersion:
          backupStartup.snapshot?.manifest.fromVersion ?? null,
        snapshotToVersion: backupStartup.snapshot?.manifest.toVersion ?? null,
        snapshotError: backupStartup.snapshotError,
      });
      if (backupStartup.status === "snapshot-failed") {
        throw new Error(
          `Upgrade safety snapshot failed: ${backupStartup.snapshotError || "unknown error"}`,
        );
      }
      const layoutMigration = await migrateLegacyDataLayout(
        app.getPath("userData"),
        app.getVersion(),
        { safetySnapshot: backupStartup.snapshot },
      );
      logStartupEvent({
        event: "startup:data_layout_migration",
        status: layoutMigration.status,
        backupId: layoutMigration.backupId,
        movedEntries: layoutMigration.movedEntries,
        failedEntries: layoutMigration.failedEntries,
        markerPath: scrubPath(layoutMigration.markerPath),
      });
      await runManagedBackupRetentionAtStartup(
        app.getPath("userData"),
        logStartupEvent,
        Boolean(backupStartup.snapshot || layoutMigration.backupId),
      );
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
      console.error("[startup] upgrade backup bootstrap failed:", error);
      logStartupEvent({
        event: "startup:upgrade_backup_failed_to_bootstrap",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    canonicalRecoveryRequired = false;
    canonicalRecoveryReason = null;
    try {
      const activeRoot = getUserDataPath();
      const authorityStartup = await ensureCanonicalStorageAuthorityOnStartup({
        activeRoot,
        sourceDatabasePath: getDatabasePath(),
        prepareSourceDatabase: () => {
          const sourceDatabase = initDatabase();
          try {
            applyE2ESeed(sourceDatabase);
          } finally {
            closeDatabase();
          }
        },
        persistExtractedMcpSecrets: (secrets) =>
          createMcpResourceSecretStore({
            filePath: path.join(
              activeRoot,
              "secrets",
              "mcp-resource-secrets.json",
            ),
            encryption: safeStorage,
          }).writeMany(secrets),
      });
      canonicalRecoveryRequired =
        authorityStartup.status === "recovery-required";
      canonicalRecoveryReason =
        authorityStartup.status === "recovery-required"
          ? authorityStartup.reason
          : null;
      logStartupEvent({
        event: "startup:canonical_storage_authority",
        ...authorityStartup,
        recoveryArtifactPath:
          "recoveryArtifactPath" in authorityStartup
            ? scrubPath(authorityStartup.recoveryArtifactPath)
            : undefined,
      });
    } catch (error) {
      console.error("[startup] canonical storage publication failed:", error);
      logStartupEvent({
        event: "startup:canonical_storage_authority_failed",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    // Initialize database
    // 初始化数据库
    const db = initDatabase();
    applyE2ESeed(db);
    const migratedSkillLinks = upgradeSkillPlatformDataOnStartup(db);
    logStartupEvent({
      event: "startup:skill_platform_data_upgrade",
      migratedSkillLinks,
    });
    await reconcileManagedSkillSymlinksOnStartup(db);
    try {
      await applyStoredNetworkProxySettings(db);
      logStartupEvent({
        event: "startup:network_proxy_applied",
        status: "ok",
      });
    } catch (error) {
      console.warn(
        "[startup] applyStoredNetworkProxySettings failed, continuing:",
        error,
      );
      logStartupEvent({
        event: "startup:network_proxy_failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
    // Legacy workspace bootstrap remains isolated from startup. Canonical mode
    // is read-only here because file authority and SQLite reconciliation have
    // already completed before the database was opened.
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
      if (canonicalRecoveryRequired) {
        console.warn(
          "[startup] Canonical Prompt graph requires recovery; workspace synchronization was skipped.",
        );
        logStartupEvent({
          event: "startup:bootstrap_workspace_recovery_required",
          reason: canonicalRecoveryReason ?? "invalid-canonical-storage",
        });
      } else {
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
    registerDatabaseBoundIpc(db);

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

    await createWindow();
    logStartupEvent({ event: "startup:window_ready" });
    packagedStartupSmoke.controller.onWindowReady();
    if (packagedStartupSmoke.controller.enabled) {
      return;
    }
    agentDeepLinkRouter.connect(dispatchFromTray);
    agentDeepLinkRouter.acceptArgv(process.argv);
    // Init updater (production only)
    // 初始化更新器（仅在生产环境）
    if (!isDev && !isE2E && mainWindow) {
      initUpdater(mainWindow, (status) => {
        trayController.setUpdateStatus(status.status, status.info?.version);
      });
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
