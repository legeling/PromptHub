import { BrowserWindow, ipcMain, app, shell } from 'electron';
import type { UpdateInfo as ElectronUpdateInfo } from 'electron-updater';
import { autoUpdater } from 'electron-updater';
import fs from 'fs';
import path from 'path';

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

// 比较版本号，返回 1 (a > b), -1 (a < b), 0 (a == b)
function compareVersions(a: string, b: string): number {
  const partsA = a.replace(/^v/, '').split('.').map(Number);
  const partsB = b.replace(/^v/, '').split('.').map(Number);
  
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

// 从 CHANGELOG.md 读取指定版本区间的更新日志
function getChangelogForVersionRange(newVersion: string, currentVersion: string): string {
  try {
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    let changelogPath: string;
    
    if (isDev) {
      changelogPath = path.join(__dirname, '../../CHANGELOG.md');
    } else {
      // 打包后，CHANGELOG.md 在 resources 目录
      changelogPath = path.join(process.resourcesPath, 'CHANGELOG.md');
      // 如果不存在，尝试 app.asar.unpacked
      if (!fs.existsSync(changelogPath)) {
        changelogPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'CHANGELOG.md');
      }
      // 还不存在，尝试 app 目录
      if (!fs.existsSync(changelogPath)) {
        changelogPath = path.join(app.getAppPath(), 'CHANGELOG.md');
      }
    }
    
    if (!fs.existsSync(changelogPath)) {
      console.warn('CHANGELOG.md not found at:', changelogPath);
      return '';
    }
    
    const content = fs.readFileSync(changelogPath, 'utf-8');
    
    // 解析 CHANGELOG，提取版本区间内的所有更新
    // 格式: ## [0.2.9] - 2025-12-18
    const versionRegex = /^## \[(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)\]/gm;
    const versions: { version: string; startIndex: number }[] = [];
    
    let match;
    while ((match = versionRegex.exec(content)) !== null) {
      versions.push({
        version: match[1],
        startIndex: match.index,
      });
    }
    
    // 找到需要包含的版本（大于 currentVersion 且小于等于 newVersion）
    const relevantSections: string[] = [];
    
    for (let i = 0; i < versions.length; i++) {
      const ver = versions[i].version;
      // 版本在 (currentVersion, newVersion] 区间内
      if (compareVersions(ver, currentVersion) > 0 && compareVersions(ver, newVersion) <= 0) {
        const startIndex = versions[i].startIndex;
        const endIndex = versions[i + 1]?.startIndex || content.length;
        let section = content.slice(startIndex, endIndex).trim();
        
        // 移除分隔线
        section = section.replace(/^---\s*$/gm, '').trim();
        
        relevantSections.push(section);
      }
    }
    
    if (relevantSections.length === 0) {
      return '';
    }
    
    return relevantSections.join('\n\n---\n\n');
  } catch (error) {
    console.error('Failed to read CHANGELOG.md:', error);
    return '';
  }
}

// 从 electron-updater 的 UpdateInfo 转换为简化格式
function toSimpleInfo(info: ElectronUpdateInfo): SimpleUpdateInfo {
  const currentVersion = app.getVersion();
  
  // 优先从 CHANGELOG.md 读取版本区间的更新日志
  let releaseNotes = getChangelogForVersionRange(info.version, currentVersion);
  
  // 如果 CHANGELOG 没有内容，回退到 GitHub Release 的说明
  if (!releaseNotes) {
    if (typeof info.releaseNotes === 'string') {
      releaseNotes = info.releaseNotes;
    } else if (Array.isArray(info.releaseNotes)) {
      releaseNotes = info.releaseNotes
        .map((n) => (n.note ? n.note : ''))
        .filter(Boolean)
        .join('\n\n');
    }
  }

  return {
    version: info.version,
    releaseNotes,
    releaseDate: info.releaseDate,
  };
}

let mainWindow: BrowserWindow | null = null;
let lastPercent = 0; // 跟踪上次进度，防止进度回退

const isMac = process.platform === 'darwin';

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
    // 防止进度回退（electron-updater 下载多个文件时会重置进度）
    if (progress.percent < lastPercent && lastPercent < 99) {
      // 进度回退时，保持上次进度
      console.info(`Download progress (ignored regression): ${progress.percent.toFixed(2)}% -> keeping ${lastPercent.toFixed(2)}%`);
      return;
    }
    lastPercent = progress.percent;
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
      lastPercent = 0; // 重置进度跟踪
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
      if (isMac) {
        // macOS: 打开下载目录让用户手动安装
        // 因为没有代码签名，自动安装会失败
        const downloadDir = app.getPath('downloads');
        shell.openPath(downloadDir);
        return { success: true, manual: true };
      } else {
        // Windows/Linux: 自动安装
        autoUpdater.quitAndInstall(false, true);
        return { success: true, manual: false };
      }
    }
  });

  // 获取平台信息
  ipcMain.handle('updater:platform', () => {
    return process.platform;
  });

  // 打开 GitHub Releases 页面
  ipcMain.handle('updater:openReleases', () => {
    shell.openExternal('https://github.com/legeling/PromptHub/releases');
  });
}
