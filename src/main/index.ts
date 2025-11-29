import { app, BrowserWindow, shell, ipcMain } from 'electron';
import path from 'path';
// TODO: 暂时禁用数据库（需要解决 better-sqlite3 与 Electron 39 的兼容问题）
// import { initDatabase } from './database';
// import { registerAllIPC } from './ipc';
import { createMenu } from './menu';
import { registerShortcuts } from './shortcuts';

// 禁用 GPU 加速（可选，某些系统上可能需要）
// app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;

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
  }

  // 处理外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
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

// 应用启动
app.whenReady().then(async () => {
  // TODO: 暂时禁用数据库
  // const db = initDatabase();
  // registerAllIPC(db);

  // 创建菜单
  createMenu();

  // 注册快捷键
  registerShortcuts();

  // 创建窗口
  await createWindow();

  // macOS: 点击 dock 图标时重新创建窗口
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

// 所有窗口关闭时退出（Windows & Linux）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 导出主窗口引用（供其他模块使用）
export function getMainWindow() {
  return mainWindow;
}
