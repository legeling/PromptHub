import { BrowserWindow, ipcMain, app } from 'electron';
import type { UpdateInfo as ElectronUpdateInfo } from 'electron-updater';
import { autoUpdater } from 'electron-updater';

// 简化的更新信息类型（用于 IPC 传输）
interface SimpleUpdateInfo {
  version: string;
  releaseNotes?: string;
  releaseDate?: string;
}

interface ProgressInfo {
  percent: number;
  bytesPerSecond: number;
  total: number;
  transferred: number;
}

// 将 GitHub Release 返回的 HTML 说明转换为适合展示的纯文本
function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>(?=\s*)/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|table|thead|tbody|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\u2022 ')
    .replace(/<(p|div|h[1-6]|ul|ol|table|thead|tbody|tr)[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 从 electron-updater 的 UpdateInfo 转换为简化格式
function toSimpleInfo(info: ElectronUpdateInfo): SimpleUpdateInfo {
  let releaseNotes = '';
  if (typeof info.releaseNotes === 'string') {
    releaseNotes = htmlToPlainText(info.releaseNotes);
  } else if (Array.isArray(info.releaseNotes)) {
    releaseNotes = info.releaseNotes
      .map((n) => (n.note ? htmlToPlainText(n.note) : ''))
      .filter(Boolean)
      .join('\n\n');
  }

  if (releaseNotes.length > 1000) {
    releaseNotes = releaseNotes.slice(0, 1000) + '...';
  }

  return {
    version: info.version,
    releaseNotes,
    releaseDate: info.releaseDate,
  };
}

let mainWindow: BrowserWindow | null = null;

export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  info?: SimpleUpdateInfo;
  progress?: ProgressInfo;
  error?: string;
}

export function initUpdater(win: BrowserWindow) {
  mainWindow = win;

  // 禁用自动下载，让用户选择
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // 检查更新出错
  autoUpdater.on('error', (error) => {
    console.error('Update error:', error);
    let message = (error && (error as Error).message) || String(error);
    if (message.includes('ZIP file not provided')) {
      message =
        '自动更新需要 ZIP 安装包，但当前版本的 Release 中没有对应的 ZIP 文件。请前往 GitHub Releases 页面手动下载安装，或等待下一个版本修复自动更新。';
    }
    sendStatusToWindow({
      status: 'error',
      error: message,
    });
  });

  // 检查更新中
  autoUpdater.on('checking-for-update', () => {
    console.info('Checking for update...');
    sendStatusToWindow({ status: 'checking' });
  });

  // 有可用更新
  autoUpdater.on('update-available', (info) => {
    console.info('Update available:', info.version);
    sendStatusToWindow({
      status: 'available',
      info: toSimpleInfo(info),
    });
  });

  // 没有可用更新
  autoUpdater.on('update-not-available', (info) => {
    console.info('Update not available, current version is latest');
    sendStatusToWindow({
      status: 'not-available',
      info: toSimpleInfo(info),
    });
  });

  // 下载进度
  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    console.info(`Download progress: ${progress.percent.toFixed(2)}%`);
    sendStatusToWindow({
      status: 'downloading',
      progress,
    });
  });

  // 下载完成
  autoUpdater.on('update-downloaded', (info) => {
    console.info('Update downloaded:', info.version);
    sendStatusToWindow({
      status: 'downloaded',
      info: toSimpleInfo(info),
    });
  });
}

function sendStatusToWindow(status: UpdateStatus) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status', status);
  }
}

// 注册 IPC 处理程序
export function registerUpdaterIPC() {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  // 获取当前版本 - 总是可用
  ipcMain.handle('updater:version', () => {
    return app.getVersion();
  });

  // 检查更新
  ipcMain.handle('updater:check', async () => {
    if (isDev) {
      return { success: false, error: 'Update check disabled in development mode' };
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      return { success: true, result };
    } catch (error) {
      const errMsg = (error as Error).message || String(error);
      return { success: false, error: `检查更新失败: ${errMsg}\n\n请手动下载：https://github.com/legeling/PromptHub/releases` };
    }
  });

  // 开始下载更新
  ipcMain.handle('updater:download', async () => {
    if (isDev) {
      return { success: false, error: 'Download disabled in development mode' };
    }
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      const errMsg = (error as Error).message || String(error);
      return { success: false, error: `下载更新失败: ${errMsg}\n\n请手动下载：https://github.com/legeling/PromptHub/releases` };
    }
  });

  // 安装更新并重启
  ipcMain.handle('updater:install', async () => {
    if (!isDev) {
      autoUpdater.quitAndInstall(false, true);
    }
  });
}
