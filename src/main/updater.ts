import { BrowserWindow, ipcMain, app, shell } from 'electron';
import type { UpdateInfo as ElectronUpdateInfo } from 'electron-updater';
import { autoUpdater } from 'electron-updater';
import fs from 'fs';
import path from 'path';

// Simplified update info type (for IPC transmission)
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

// GitHub 加速镜像源列表（用于中国大陆等网络受限地区）
// GitHub accelerator mirror sources (for regions with network restrictions like China)
// 验证日期 / Verified on: 2024-12-24
// 验证方式: curl -sI --connect-timeout 5 "{url}/latest.yml" | head -1
// 以下镜像均已通过 HTTP 状态码验证可访问（200 或 302）
// All mirrors below have been verified accessible via HTTP status code (200 or 302)
const MIRROR_SOURCES = [
  'https://ghfast.top/https://github.com/legeling/PromptHub/releases/latest/download',           // ✅ HTTP 302
  'https://gh-proxy.com/https://github.com/legeling/PromptHub/releases/latest/download',         // ✅ HTTP 302
  'https://hub.gitmirror.com/https://github.com/legeling/PromptHub/releases/latest/download',    // ✅ HTTP 200
  'https://cors.isteed.cc/github.com/legeling/PromptHub/releases/latest/download',               // ✅ HTTP 200
];

const OFFICIAL_REPO = {
  provider: 'github' as const,
  owner: 'legeling',
  repo: 'PromptHub',
  releaseType: 'release' as const
};

function applyMirrorDownloadSettings(useMirror: boolean) {
  const updater = autoUpdater as unknown as { useMultipleRangeRequest?: boolean };
  updater.useMultipleRangeRequest = !useMirror;
}

// Compare version numbers, return 1 (a > b), -1 (a < b), 0 (a == b)
// 比较版本号，返回 1 (a > b), -1 (a < b), 0 (a == b)
export function compareVersions(a: string, b: string): number {
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

// Read changelog for specified version range from CHANGELOG.md
// 从 CHANGELOG.md 读取指定版本区间的更新日志
export function getChangelogForVersionRange(newVersion: string, currentVersion: string): string {
  try {
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    let changelogPath: string;

    if (isDev) {
      changelogPath = path.join(__dirname, '../../CHANGELOG.md');
    } else {
      // Check if resourcesPath exists (may be undefined in test environment)
      // 检查 resourcesPath 是否存在（在测试环境中可能为 undefined）
      if (!process.resourcesPath) {
        return '';
      }
      // After packaging, CHANGELOG.md is in resources directory
      // 打包后，CHANGELOG.md 在 resources 目录
      changelogPath = path.join(process.resourcesPath, 'CHANGELOG.md');
      // If not exists, try app.asar.unpacked
      // 如果不存在，尝试 app.asar.unpacked
      if (!fs.existsSync(changelogPath)) {
        changelogPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'CHANGELOG.md');
      }
      // Still not exists, try app directory
      // 还不存在，尝试 app 目录
      if (!fs.existsSync(changelogPath)) {
        changelogPath = path.join(app.getAppPath(), 'CHANGELOG.md');
      }
    }

    if (!fs.existsSync(changelogPath)) {
      console.warn('[Updater] CHANGELOG.md not found at:', changelogPath);
      console.warn('[Updater] isDev:', isDev);
      console.warn('[Updater] __dirname:', __dirname);
      console.warn('[Updater] resourcesPath:', process.resourcesPath);
      console.warn('[Updater] appPath:', app.getAppPath());
      return '';
    }

    console.log('[Updater] Reading CHANGELOG from:', changelogPath);

    const content = fs.readFileSync(changelogPath, 'utf-8');

    // Parse CHANGELOG, extract all updates within version range
    // Format: ## [0.2.9] - 2025-12-18
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

    // Find versions to include (greater than currentVersion and less than or equal to newVersion)
    // 找到需要包含的版本（大于 currentVersion 且小于等于 newVersion）
    const relevantSections: string[] = [];

    for (let i = 0; i < versions.length; i++) {
      const ver = versions[i].version;
      // Version is in (currentVersion, newVersion] range
      // 版本在 (currentVersion, newVersion] 区间内
      if (compareVersions(ver, currentVersion) > 0 && compareVersions(ver, newVersion) <= 0) {
        const startIndex = versions[i].startIndex;
        const endIndex = versions[i + 1]?.startIndex || content.length;
        let section = content.slice(startIndex, endIndex).trim();

        // Remove separator lines
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

// Convert from electron-updater's UpdateInfo to simplified format
// 从 electron-updater 的 UpdateInfo 转换为简化格式
function toSimpleInfo(info: ElectronUpdateInfo): SimpleUpdateInfo {
  const currentVersion = app.getVersion();

  // Prefer reading version range changelog from CHANGELOG.md
  // 优先从 CHANGELOG.md 读取版本区间的更新日志
  let releaseNotes = getChangelogForVersionRange(info.version, currentVersion);

  // If CHANGELOG has no content, fallback to GitHub Release notes
  // 如果 CHANGELOG 没有内容，回退到 GitHub Release 的说明
  if (!releaseNotes) {
    let githubNotes = '';
    if (typeof info.releaseNotes === 'string') {
      githubNotes = info.releaseNotes;
    } else if (Array.isArray(info.releaseNotes)) {
      githubNotes = info.releaseNotes
        .map((n) => (n.note ? n.note : ''))
        .filter(Boolean)
        .join('\n\n');
    }

    // Check if GitHub notes is the full CHANGELOG (contains multiple version headers)
    // 检查 GitHub notes 是否是完整的 CHANGELOG（包含多个版本标题）
    const versionHeaders = githubNotes.match(/^## \[\d+\.\d+\.\d+/gm) || [];

    if (versionHeaders.length > 3) {
      // Likely full CHANGELOG, try to extract version range
      // 可能是完整的 CHANGELOG，尝试提取版本区间
      console.log('[Updater] GitHub notes appears to be full CHANGELOG, extracting version range...');
      releaseNotes = extractVersionRange(githubNotes, info.version, currentVersion);
    } else {
      releaseNotes = githubNotes;
    }
  }

  return {
    version: info.version,
    releaseNotes,
    releaseDate: info.releaseDate,
  };
}

// Extract version range from CHANGELOG content (for fallback)
// 从 CHANGELOG 内容中提取版本区间（用于 fallback）
function extractVersionRange(content: string, newVersion: string, currentVersion: string): string {
  const versionRegex = /^## \[(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)\]/gm;
  const versions: { version: string; startIndex: number }[] = [];

  let match;
  while ((match = versionRegex.exec(content)) !== null) {
    versions.push({
      version: match[1],
      startIndex: match.index,
    });
  }

  const relevantSections: string[] = [];

  for (let i = 0; i < versions.length; i++) {
    const ver = versions[i].version;
    if (compareVersions(ver, currentVersion) > 0 && compareVersions(ver, newVersion) <= 0) {
      const startIndex = versions[i].startIndex;
      const endIndex = versions[i + 1]?.startIndex || content.length;
      let section = content.slice(startIndex, endIndex).trim();
      section = section.replace(/^---\s*$/gm, '').trim();
      relevantSections.push(section);
    }
  }

  if (relevantSections.length === 0) {
    // If no relevant sections, just return the first version's content
    // 如果没有相关版本，返回第一个版本的内容
    if (versions.length > 0) {
      const startIndex = versions[0].startIndex;
      const endIndex = versions[1]?.startIndex || content.length;
      return content.slice(startIndex, endIndex).trim().replace(/^---\s*$/gm, '').trim();
    }
    return content;
  }

  return relevantSections.join('\n\n---\n\n');
}

let mainWindow: BrowserWindow | null = null;
let lastPercent = 0; // Track last progress to prevent regression
// 跟踪上次进度，防止进度回退

const isMac = process.platform === 'darwin';

export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  info?: SimpleUpdateInfo;
  progress?: ProgressInfo;
  error?: string;
}

export function initUpdater(win: BrowserWindow) {
  mainWindow = win;

  // Disable auto download, let user choose
  // 禁用自动下载，让用户选择
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // electron-updater channel configuration:
  // electron-updater channel 配置：
  // - Windows x64: uses default 'latest.yml'
  // - Windows ARM64: uses 'arm64' channel -> 'latest-arm64.yml'
  // - macOS: uses default 'latest-mac.yml'
  // - Linux: uses default 'latest-linux.yml'
  //
  // This ensures backward compatibility with older versions that don't set channel.
  // 这确保了与旧版本的向后兼容性（旧版本不设置 channel）。
  if (process.platform === 'win32' && process.arch === 'arm64') {
    autoUpdater.channel = 'arm64';
    console.log(`[Updater] Windows ARM64 detected, using channel: arm64`);
  } else {
    console.log(`[Updater] Platform: ${process.platform}, Arch: ${process.arch}, using default channel`);
  }


  // Update check error
  // 检查更新出错
  autoUpdater.on('error', (error) => {
    console.error('Update error:', error);
    let message = (error && (error as Error).message) || String(error);
    // Handle 404 error for missing yml files
    // 处理找不到 yml 文件的 404 错误
    if (message.includes('404') || message.includes('Cannot find')) {
      message =
        'Update check failed: Cannot find update manifest file in the latest release.\n' +
        '更新检查失败：无法在最新版本中找到更新配置文件。\n' +
        '请前往 GitHub Releases 页面手动下载安装。';
    } else if (message.includes('ZIP file not provided')) {
      message =
        'Auto update requires ZIP installer, but current Release does not have corresponding ZIP file. Please go to GitHub Releases page to download manually, or wait for next version to fix auto update.';
      // 自动更新需要 ZIP 安装包，但当前版本的 Release 中没有对应的 ZIP 文件。请前往 GitHub Releases 页面手动下载安装，或等待下一个版本修复自动更新。
    }
    if (message.toLowerCase().includes('sha512') && message.toLowerCase().includes('mismatch')) {
      console.log('[Updater] SHA512 mismatch, temp directory:', app.getPath('temp'));
      message =
        'SHA512 校验失败\n\n' +
        '这通常是由于 CDN 缓存不一致或网络问题导致的。\n' +
        '文件可能已下载完成，您可以点击下方按钮打开文件夹手动尝试安装。';
    }
    sendStatusToWindow({
      status: 'error',
      error: message,
    });
  });

  // Checking for update
  // 检查更新中
  autoUpdater.on('checking-for-update', () => {
    console.info('Checking for update...');
    sendStatusToWindow({ status: 'checking' });
  });

  // Update available
  // 有可用更新
  autoUpdater.on('update-available', (info) => {
    console.info('Update available:', info.version);
    sendStatusToWindow({
      status: 'available',
      info: toSimpleInfo(info),
    });
  });

  // No update available
  // 没有可用更新
  autoUpdater.on('update-not-available', (info) => {
    console.info('Update not available, current version is latest');
    sendStatusToWindow({
      status: 'not-available',
      info: toSimpleInfo(info),
    });
  });

  // Download progress
  // 下载进度
  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    // Prevent progress regression (electron-updater resets progress when downloading multiple files)
    // 防止进度回退（electron-updater 下载多个文件时会重置进度）
    if (progress.percent < lastPercent && lastPercent < 99) {
      // Keep last progress when regression occurs
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

  // Download completed
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

// Register IPC handlers
// 注册 IPC 处理程序
export function registerUpdaterIPC() {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  // Get current version - always available
  // 获取当前版本 - 总是可用
  ipcMain.handle('updater:version', () => {
    return app.getVersion();
  });

  // 检查更新
  // Check for updates - respect user's mirror preference
  ipcMain.handle('updater:check', async (_event, useMirror?: boolean) => {
    if (isDev) {
      return { success: false, error: 'Update check disabled in development mode' };
    }

    applyMirrorDownloadSettings(Boolean(useMirror));

    // If mirror is enabled, use mirror sources directly
    // 如果启用了镜像，直接使用镜像源（不先尝试官方）
    if (useMirror) {
      for (const mirrorUrl of MIRROR_SOURCES) {
        try {
          console.log(`[Updater] Using mirror for check: ${mirrorUrl}`);
          autoUpdater.setFeedURL({
            provider: 'generic',
            url: mirrorUrl
          });
          const result = await autoUpdater.checkForUpdates();
          console.log(`[Updater] Mirror check succeeded: ${mirrorUrl}`);
          return { success: true, result };
        } catch (mirrorError) {
          console.warn(`[Updater] Mirror check failed: ${mirrorUrl}`);
        }
      }
      // All mirrors failed
      return { success: false, error: 'All mirror sources failed. Please try disabling mirror acceleration.' };
    }

    // Mirror disabled, use official source
    // 未启用镜像，使用官方源
    try {
      console.log('[Updater] Using official source for check');
      autoUpdater.setFeedURL(OFFICIAL_REPO);
      const result = await autoUpdater.checkForUpdates();
      return { success: true, result };
    } catch (officialError) {
      const errMsg = (officialError as Error).message || String(officialError);
      return { success: false, error: `Update check failed: ${errMsg}` };
    }
  });

  // Start downloading update
  // 开始下载更新 - respect user's mirror preference
  ipcMain.handle('updater:download', async (_event, useMirror?: boolean) => {
    if (isDev) {
      return { success: false, error: 'Download disabled in development mode' };
    }

    applyMirrorDownloadSettings(Boolean(useMirror));
    lastPercent = 0;

    // If mirror is enabled, use mirror sources directly
    // 如果启用了镜像，直接使用镜像源
    if (useMirror) {
      for (const mirrorUrl of MIRROR_SOURCES) {
        try {
          console.log(`[Updater] Using mirror for download: ${mirrorUrl}`);
          autoUpdater.setFeedURL({
            provider: 'generic',
            url: mirrorUrl
          });
          await autoUpdater.downloadUpdate();
          return { success: true };
        } catch (mirrorError) {
          console.warn(`[Updater] Mirror download failed: ${mirrorUrl}`);
          lastPercent = 0; // Reset progress for next attempt
        }
      }
      // All mirrors failed
      return { success: false, error: 'All mirror sources failed. Please try disabling mirror acceleration.' };
    }

    // Mirror disabled, use official source
    // 未启用镜像，使用官方源
    try {
      console.log('[Updater] Using official source for download');
      autoUpdater.setFeedURL(OFFICIAL_REPO);
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (officialError) {
      const errMsg = (officialError as Error).message || String(officialError);
      return { success: false, error: `Download update failed: ${errMsg}` };
    }
  });

  // Install update and restart
  // 安装更新并重启
  ipcMain.handle('updater:install', async () => {
    if (!isDev) {
      if (isMac) {
        // macOS: open download directory for manual installation
        // because auto install will fail without code signing
        // macOS: 打开下载目录让用户手动安装
        // 因为没有代码签名，自动安装会失败
        const downloadDir = app.getPath('downloads');
        shell.openPath(downloadDir);
        return { success: true, manual: true };
      } else {
        // Windows/Linux: auto install
        // Windows/Linux: 自动安装
        autoUpdater.quitAndInstall(false, true);
        return { success: true, manual: false };
      }
    }
  });

  // Get platform info
  // 获取平台信息
  ipcMain.handle('updater:platform', () => {
    return process.platform;
  });

  // Open GitHub Releases page
  // 打开 GitHub Releases 页面
  ipcMain.handle('updater:openReleases', () => {
    shell.openExternal('https://github.com/legeling/PromptHub/releases');
  });

  ipcMain.handle('updater:openDownloadedUpdate', () => {
    const installerPath = (autoUpdater as unknown as { installerPath?: string }).installerPath;
    if (installerPath) {
      shell.showItemInFolder(installerPath);
      return { success: true, path: installerPath };
    }

    const downloadDir = app.getPath('downloads');
    shell.openPath(downloadDir);
    return { success: false, path: downloadDir };
  });
}
