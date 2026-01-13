import { app, BrowserWindow, shell, ipcMain, dialog, Notification, Tray, Menu, nativeImage, session, protocol } from 'electron';
import path from 'path';
import fs from 'fs';
import { initDatabase } from './database';
import { registerAllIPC } from './ipc';
import { createMenu } from './menu';
import { registerShortcuts, registerShortcutsIPC } from './shortcuts';
import { initUpdater, registerUpdaterIPC } from './updater';
import { registerWebDAVIPC } from './webdav';

// Disable GPU acceleration (optional; may be needed on some systems)
// 禁用 GPU 加速（可选，某些系统上可能需要）
// app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let minimizeToTray = false;
let isQuitting = false;
// Close action: 'ask' = ask every time, 'minimize' = minimize to tray, 'exit' = exit directly
// 关闭行为: 'ask' = 每次询问, 'minimize' = 最小化到托盘, 'exit' = 直接退出
let closeAction: 'ask' | 'minimize' | 'exit' = 'ask';
// Whether we are waiting for the user to choose a close behavior
// 是否正在等待用户选择关闭行为
let pendingCloseAction = false;
let isDebugMode = false;

// Register privileged schemes (must be called before app is ready)
// 注册特权协议（必须在 app ready 之前调用）
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-image',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true
    }
  },
  {
    scheme: 'local-video',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true
    }
  }
]);

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Single instance lock (prevent multiple instances)
// 单实例锁定（防止多开）
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Quit immediately if we fail to acquire the lock (another instance is running)
  // 如果获取不到锁，说明已有实例在运行，直接退出
  app.quit();
} else {
  // When a second instance launches, focus existing window (or recreate if missing)
  // 当第二个实例启动时，聚焦到已有窗口（若窗口已销毁则重建）
  app.on('second-instance', async () => {
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

  const isMac = process.platform === 'darwin';
  const isWin = process.platform === 'win32';

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    // Use frameless window on Windows, native title bar on macOS
    // Windows 使用无边框窗口，macOS 使用原生标题栏
    frame: isWin ? false : true,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,
    // Dark background for Windows title bar
    // Windows 深色标题栏
    backgroundColor: '#1a1d23',
    show: true,
  });

  // Load renderer page
  // 加载页面
  if (isDev) {
    // Dev mode: try to load Vite dev server
    // 开发模式：尝试连接 Vite 开发服务器
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    console.log('Loading dev server:', devServerUrl);
    try {
      await mainWindow.loadURL(devServerUrl);
      mainWindow.webContents.openDevTools();
    } catch (error) {
      console.error('Failed to load dev server:', error);
    }
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    // Disable DevTools shortcuts in production
    // 生产环境禁止打开开发者工具
    mainWindow.webContents.on('before-input-event', (event, input) => {
      // If debug mode is enabled, allow shortcuts
      if (isDebugMode) return;

      // Block F12, Ctrl+Shift+I, Cmd+Option+I
      // 禁止 F12、Ctrl+Shift+I、Cmd+Option+I
      if (
        input.key === 'F12' ||
        (input.control && input.shift && input.key.toLowerCase() === 'i') ||
        (input.meta && input.alt && input.key.toLowerCase() === 'i')
      ) {
        event.preventDefault();
      }
    });
  }

  // Open external links in system browser
  // 处理外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Close behavior: decide based on settings whether to minimize to tray or close
  // 关闭行为：根据设置决定是最小化到托盘还是关闭
  mainWindow.on('close', (event) => {
    // If quitting, allow close to proceed
    // 如果正在退出应用，直接关闭
    if (isQuitting) return;
    
    const isWin = process.platform === 'win32';
    
    // Windows-specific close behavior
    // Windows 平台特殊处理
    if (isWin) {
      if (closeAction === 'ask' && !pendingCloseAction) {
        // Ask user which action to take
        // 询问用户
        event.preventDefault();
        pendingCloseAction = true;
        mainWindow?.webContents.send('window:showCloseDialog');
        return false;
      } else if (closeAction === 'minimize') {
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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Register window control IPC
// 注册窗口控制 IPC
ipcMain.on('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on('window:close', () => {
  mainWindow?.close();
});

// Fullscreen control
// 全屏控制
ipcMain.on('window:enterFullscreen', () => {
  mainWindow?.setFullScreen(true);
});

ipcMain.on('window:exitFullscreen', () => {
  mainWindow?.setFullScreen(false);
});

ipcMain.handle('window:isFullscreen', () => {
  return mainWindow?.isFullScreen() ?? false;
});

// Configure auto launch on login
// 设置开机自启动
ipcMain.on('app:setAutoLaunch', (_event, enabled: boolean) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: false,
  });
});

// Configure minimize-to-tray behavior
// 设置最小化到托盘
ipcMain.on('app:setMinimizeToTray', (_event, enabled: boolean) => {
  minimizeToTray = enabled;
  if (enabled) {
    createTray();
  } else {
    destroyTray();
  }
});

// Set close action (Windows)
// 设置关闭行为 (Windows)
ipcMain.on('app:setCloseAction', (_event, action: 'ask' | 'minimize' | 'exit') => {
  closeAction = action;
  // Ensure tray exists when minimizing to tray
  // 如果设置为最小化到托盘，确保托盘已创建
  if (action === 'minimize' && process.platform === 'win32') {
    createTray();
  }
});

// Set debug mode
// 设置调试模式
ipcMain.on('app:setDebugMode', (_event, enabled: boolean) => {
  isDebugMode = enabled;
});

// Toggle DevTools
// 切换开发者工具
ipcMain.on('window:toggleDevTools', () => {
  mainWindow?.webContents.toggleDevTools();
});

// Handle close dialog result
// 处理关闭对话框结果
ipcMain.on('window:closeDialogResult', (_event, data: { action: 'minimize' | 'exit'; remember: boolean }) => {
  pendingCloseAction = false;
  
  if (data.remember) {
    closeAction = data.action;
  }
  
  if (data.action === 'minimize') {
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
});

// User cancelled close dialog (do nothing; allow it to show again next time)
// 用户关闭/取消了关闭对话框（不做任何动作，只允许下次再次弹出）
ipcMain.on('window:closeDialogCancel', () => {
  pendingCloseAction = false;
});

// Create macOS template tray icon
// 创建 macOS 模板图标
function createMacTrayIcon(): Electron.NativeImage {
  // Use app icon as tray icon
  // 使用应用图标作为托盘图标
  let iconPath: string;
  if (isDev) {
    iconPath = path.join(__dirname, '../../resources/icon.iconset/icon_16x16@2x.png');
  } else {
    iconPath = path.join(process.resourcesPath, 'icon.iconset/icon_16x16@2x.png');
  }

  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    console.error('Failed to load tray icon from:', iconPath);
    // Try fallback path
    // 尝试备用路径
    const altPath = isDev
      ? path.join(__dirname, '../../resources/icon.iconset/icon_32x32.png')
      : path.join(process.resourcesPath, 'icon.iconset/icon_32x32.png');
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

  const isMac = process.platform === 'darwin';

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
        iconPath = path.join(__dirname, '../../resources/icon.ico');
      } else {
        iconPath = path.join(process.resourcesPath, 'icon.ico');
      }
      console.log('Loading tray icon from:', iconPath);
      icon = nativeImage.createFromPath(iconPath);
      if (icon.isEmpty()) {
        console.error('Tray icon is empty, trying alternative path');
        // Try fallback path
        // 尝试备用路径
        const altPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'icon.ico');
        icon = nativeImage.createFromPath(altPath);
      }
      if (!icon.isEmpty()) {
        icon = icon.resize({ width: 16, height: 16 });
      }
    }

    tray = new Tray(icon);
  } catch (e) {
    console.error('Failed to load tray icon:', e);
    // Fallback to app icon when tray icon fails to load
    // 如果加载图标失败，使用应用图标
    let iconPath: string;
    if (isDev) {
      iconPath = path.join(__dirname, '../../resources/icon.iconset/icon_16x16@2x.png');
    } else {
      iconPath = path.join(process.resourcesPath, 'icon.iconset/icon_16x16@2x.png');
    }
    const fallbackIcon = nativeImage.createFromPath(iconPath);
    tray = new Tray(fallbackIcon.resize({ width: 18, height: 18 }));
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('PromptHub');
  tray.setContextMenu(contextMenu);

  // Show window when tray icon is clicked
  // 点击托盘图标显示窗口
  tray.on('click', () => {
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
ipcMain.handle('dialog:selectFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: '选择数据目录',
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// Get current data directory
// 获取当前数据目录
ipcMain.handle('data:getPath', () => {
  return app.getPath('userData');
});

// Migrate data to a new directory
// 迁移数据到新目录
ipcMain.handle('data:migrate', async (_event, newPath: string) => {
  const currentPath = app.getPath('userData');
  
  try {
    // Create target directory if missing
    // 检查新目录是否存在，不存在则创建
    if (!fs.existsSync(newPath)) {
      fs.mkdirSync(newPath, { recursive: true });
    }
    
    // Items to migrate
    // 需要迁移的文件和目录
    const itemsToMigrate = [
      'prompthub.db',      // Database file
      // 数据库文件
      'images',            // Images directory
      // 图片目录
    ];
    
    let migratedCount = 0;
    
    for (const item of itemsToMigrate) {
      const sourcePath = path.join(currentPath, item);
      const destPath = path.join(newPath, item);
      
      if (fs.existsSync(sourcePath)) {
        // Check whether destination exists
        // 检查目标是否已存在
        if (fs.existsSync(destPath)) {
          // If directory, copy recursively
          // 如果是目录，递归复制
          if (fs.statSync(sourcePath).isDirectory()) {
            copyDirRecursive(sourcePath, destPath);
          } else {
            fs.copyFileSync(sourcePath, destPath);
          }
        } else {
          // Destination does not exist; copy directly
          if (fs.statSync(sourcePath).isDirectory()) {
            copyDirRecursive(sourcePath, destPath);
          } else {
            fs.copyFileSync(sourcePath, destPath);
          }
        }
        migratedCount++;
      }
    }
    
    return { 
      success: true, 
      message: `Successfully migrated ${migratedCount} items`,
      // 成功迁移 {migratedCount} 个项目
      newPath,
      needsRestart: true,
    };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      // 未知错误
    };
  }
});

// Copy directory recursively
// 递归复制目录
function copyDirRecursive(src: string, dest: string) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Open a folder in the system file manager
// 在文件管理器中打开文件夹
ipcMain.handle('shell:openPath', async (_event, folderPath: string) => {
  // Expand special path tokens
  // 处理特殊路径
  let realPath = folderPath;
  if (folderPath.startsWith('~')) {
    realPath = folderPath.replace('~', app.getPath('home'));
  } else if (folderPath.includes('%APPDATA%')) {
    realPath = folderPath.replace('%APPDATA%', app.getPath('appData'));
  }

  try {
    await shell.openPath(realPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// Show system notification
// 发送系统通知
ipcMain.handle('notification:show', async (_event, options: { title: string; body: string }) => {
  if (Notification.isSupported()) {
    // Resolve icon path
    // 获取图标路径
    let iconPath: string;
    if (isDev) {
      iconPath = path.join(__dirname, '../../resources/icon.png');
    } else {
      iconPath = path.join(process.resourcesPath, 'icon.png');
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
});

// App startup
// 应用启动
app.whenReady().then(async () => {
  // Register local-image protocol
  // 注册 local-image 协议
  session.defaultSession.protocol.registerFileProtocol('local-image', (request, callback) => {
    let url = request.url.replace('local-image://', '');
    // Strip leading slashes to avoid absolute path interpretation
    // 移除开头的斜杠（防止路径被解析为绝对路径）
    url = url.replace(/^\/+/, '');
    // Strip trailing slashes
    // 移除结尾的斜杠
    url = url.replace(/\/+$/, '');

    try {
      const decodedUrl = decodeURIComponent(url);
      const baseDir = path.join(app.getPath('userData'), 'images');
      const normalized = path.normalize(decodedUrl).replace(/^([\\/])+/g, '');
      const imagePath = path.join(baseDir, normalized);

      // Prevent path traversal
      // 防止路径穿越
      if (!imagePath.startsWith(baseDir + path.sep) && imagePath !== baseDir) {
        console.warn('Blocked local-image path traversal:', decodedUrl);
        return callback({ path: '' });
      }

    callback({ path: imagePath });
    } catch (error) {
      console.error('Failed to register protocol', error);
      callback({ path: '' });
    }
  });

  // Register local-video protocol
  // 注册 local-video 协议
  session.defaultSession.protocol.registerFileProtocol('local-video', (request, callback) => {
    let url = request.url.replace('local-video://', '');
    // Strip leading slashes to avoid absolute path interpretation
    // 移除开头的斜杠（防止路径被解析为绝对路径）
    url = url.replace(/^\/+/, '');
    // Strip trailing slashes
    // 移除结尾的斜杠
    url = url.replace(/\/+$/, '');

    try {
      const decodedUrl = decodeURIComponent(url);
      const baseDir = path.join(app.getPath('userData'), 'videos');
      const normalized = path.normalize(decodedUrl).replace(/^([\/\\])+/g, '');
      const videoPath = path.join(baseDir, normalized);

      // Prevent path traversal
      // 防止路径穿越
      if (!videoPath.startsWith(baseDir + path.sep) && videoPath !== baseDir) {
        console.warn('Blocked local-video path traversal:', decodedUrl);
        return callback({ path: '' });
      }

      callback({ path: videoPath });
    } catch (error) {
      console.error('Failed to register local-video protocol', error);
      callback({ path: '' });
    }
  });

  // Initialize database
  // 初始化数据库
  const db = initDatabase();
  registerAllIPC(db);

  // Create application menu
  // 创建菜单
  createMenu();

  // Register global shortcuts
  // 注册快捷键
  registerShortcuts();

  // Register updater IPC
  // 注册更新器 IPC
  registerUpdaterIPC();

  // Register WebDAV IPC (bypass CORS)
  // 注册 WebDAV IPC（绕过 CORS）
  registerWebDAVIPC();

  // Register shortcuts IPC
  // 注册快捷键 IPC
  registerShortcutsIPC();

  // Create main window
  // 创建窗口
  await createWindow();

  // Init updater (production only)
  // 初始化更新器（仅在生产环境）
  if (!isDev && mainWindow) {
    initUpdater(mainWindow);
  }

  // macOS: show window when clicking Dock icon
  // macOS: 点击 dock 图标时显示窗口
  app.on('activate', async () => {
    await createWindow();
  });
});

// Quit when all windows are closed (Windows & Linux)
// 所有窗口关闭时退出（Windows & Linux）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Cleanup before quitting
// 应用退出前清理
app.on('before-quit', () => {
  isQuitting = true;
});

// Export main window reference (used by other modules)
// 导出主窗口引用（供其他模块使用）
export function getMainWindow() {
  return mainWindow;
}
