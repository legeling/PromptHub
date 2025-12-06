import { app, BrowserWindow, shell, ipcMain, dialog, Notification, Tray, Menu, nativeImage, session, protocol } from 'electron';
import path from 'path';
import { initDatabase } from './database';
import { registerAllIPC } from './ipc';
import { createMenu } from './menu';
import { registerShortcuts } from './shortcuts';
import { initUpdater, registerUpdaterIPC } from './updater';

// 禁用 GPU 加速（可选，某些系统上可能需要）
// app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let minimizeToTray = false;
let isQuitting = false;

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
  }
]);

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

async function createWindow() {
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
    // Windows 使用无边框窗口，macOS 使用原生标题栏
    frame: isWin ? false : true,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,
    // Windows 深色标题栏
    backgroundColor: '#1a1d23',
    show: true,
  });

  // 加载页面
  if (isDev) {
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
    // 生产环境禁止打开开发者工具
    mainWindow.webContents.on('before-input-event', (event, input) => {
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

  // 处理外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 关闭行为：根据设置决定是最小化到托盘还是关闭
  mainWindow.on('close', (event) => {
    if (minimizeToTray && !isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

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

// 设置开机自启动
ipcMain.on('app:setAutoLaunch', (_event, enabled: boolean) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: false,
  });
});

// 设置最小化到托盘
ipcMain.on('app:setMinimizeToTray', (_event, enabled: boolean) => {
  minimizeToTray = enabled;
  if (enabled) {
    createTray();
  } else {
    destroyTray();
  }
});

// 创建 macOS 模板图标
function createMacTrayIcon(): Electron.NativeImage {
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

// 创建系统托盘
function createTray() {
  if (tray) return;

  const isMac = process.platform === 'darwin';

  try {
    let icon: Electron.NativeImage;

    if (isMac) {
      // macOS: 使用 P 字母模板图标
      icon = createMacTrayIcon();
    } else {
      // Windows/Linux: 使用应用图标
      let iconPath: string;
      if (isDev) {
        iconPath = path.join(__dirname, '../../resources/icon.ico');
      } else {
        iconPath = path.join(process.resourcesPath, 'icon.ico');
      }
      icon = nativeImage.createFromPath(iconPath);
      icon = icon.resize({ width: 16, height: 16 });
    }

    tray = new Tray(icon);
  } catch (e) {
    console.error('Failed to load tray icon:', e);
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

// 销毁托盘
function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

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

// 在文件管理器中打开文件夹
ipcMain.handle('shell:openPath', async (_event, folderPath: string) => {
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

// 发送系统通知
ipcMain.handle('notification:show', async (_event, options: { title: string; body: string }) => {
  if (Notification.isSupported()) {
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

// 应用启动
app.whenReady().then(async () => {
  // 注册 local-image 协议
  session.defaultSession.protocol.registerFileProtocol('local-image', (request, callback) => {
    let url = request.url.replace('local-image://', '');
    // 移除开头的斜杠（防止路径被解析为绝对路径）
    url = url.replace(/^\/+/, '');
    // 移除结尾的斜杠
    url = url.replace(/\/+$/, '');

    try {
      const decodedUrl = decodeURIComponent(url);
      const imagePath = path.join(app.getPath('userData'), 'images', decodedUrl);
      callback({ path: imagePath });
    } catch (error) {
      console.error('Failed to register protocol', error);
    }
  });

  // 初始化数据库
  const db = initDatabase();
  registerAllIPC(db);

  // 创建菜单
  createMenu();

  // 注册快捷键
  registerShortcuts();

  // 注册更新器 IPC
  registerUpdaterIPC();

  // 创建窗口
  await createWindow();

  // 初始化更新器（仅在生产环境）
  if (!isDev && mainWindow) {
    initUpdater(mainWindow);
  }

  // macOS: 点击 dock 图标时显示窗口
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    } else if (mainWindow) {
      // 窗口存在但被隐藏时，显示窗口
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

// 所有窗口关闭时退出（Windows & Linux）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用退出前清理
app.on('before-quit', () => {
  isQuitting = true;
});

// 导出主窗口引用（供其他模块使用）
export function getMainWindow() {
  return mainWindow;
}
