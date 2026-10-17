import { BrowserWindow, ipcMain, app, shell } from "electron";
import type { UpdateInfo as ElectronUpdateInfo } from "electron-updater";
import { autoUpdater, CancellationToken } from "electron-updater";
import fs from "fs";
import path from "path";
import https from "https";
import { createUpgradeDataSnapshot } from "./services/upgrade-backup";
import { getHttpRequestAgent } from "./services/network-proxy";
import { compareVersions, isPrereleaseVersion } from "../utils/version";
import desktopPackage from "../../package.json";
import {
  UPDATE_MIRRORS,
  normalizeUpdateMirrorSource,
  type UpdateMirrorSource,
} from "@prompthub/shared/constants/update-mirrors";

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

export type MacInstallSource = "direct" | "homebrew" | "unknown";

type UpdateChannel = "stable" | "preview";
export type UpdateSource = "automatic" | "official" | "mirror";

export function resolveDesktopVersion(
  isPackaged = app.isPackaged,
  runtimeVersion = app.getVersion(),
  packageVersion = desktopPackage.version,
): string {
  if (isPackaged || !packageVersion?.trim()) {
    return runtimeVersion;
  }
  return packageVersion.trim();
}

interface UpdateRequestOptions {
  mirror?: UpdateMirrorSource;
  useMirror?: boolean;
  source?: UpdateSource;
  channel?: UpdateChannel;
}

interface NormalizedUpdateOptions {
  mirror?: UpdateMirrorSource;
  source: UpdateSource;
  channel: UpdateChannel;
}

const OFFICIAL_REPO = {
  provider: "github" as const,
  owner: "legeling",
  repo: "PromptHub",
  releaseType: "release" as const,
};

function normalizeUpdateOptions(
  input?: boolean | UpdateRequestOptions,
): NormalizedUpdateOptions {
  if (typeof input === "boolean") {
    return { source: input ? "mirror" : "official", channel: "stable" };
  }

  const source =
    input?.source === "automatic" ||
    input?.source === "official" ||
    input?.source === "mirror"
      ? input.source
      : input?.useMirror === true
        ? "mirror"
        : input && "useMirror" in input
          ? "official"
          : "automatic";

  return {
    source,
    mirror: normalizeUpdateMirrorSource(input?.mirror),
    channel: input?.channel === "preview" ? "preview" : "stable",
  };
}

function getFeedSuffix(channel: UpdateChannel, releaseTag?: string): string {
  if (channel === "preview" && releaseTag) {
    return `download/${releaseTag}`;
  }
  return "latest/download";
}

function getMirrorSources(
  channel: UpdateChannel,
  releaseTag?: string,
  selection: UpdateMirrorSource = "automatic",
): string[] {
  const suffix = getFeedSuffix(channel, releaseTag);
  return UPDATE_MIRRORS.filter(
    (mirror) => selection === "automatic" || mirror.id === selection,
  ).map((mirror) => `${mirror.prefix}/legeling/PromptHub/releases/${suffix}`);
}

function getOfficialFeedUrl(
  channel: UpdateChannel,
  releaseTag?: string,
): string {
  return `https://github.com/${OFFICIAL_REPO.owner}/${OFFICIAL_REPO.repo}/releases/${getFeedSuffix(channel, releaseTag)}`;
}

function getOfficialFeedConfig(channel: UpdateChannel, releaseTag?: string) {
  if (channel === "preview") {
    return {
      provider: "generic" as const,
      channel: getGenericChannelName(),
      url: getOfficialFeedUrl(channel, releaseTag),
    };
  }
  return OFFICIAL_REPO;
}

function applyMirrorDownloadSettings(useMirror: boolean) {
  const updater = autoUpdater as unknown as {
    useMultipleRangeRequest?: boolean;
  };
  updater.useMultipleRangeRequest = !useMirror;
}

interface FeedContext {
  mirror?: UpdateMirrorSource;
  channel: UpdateChannel;
  releaseTag?: string;
  releaseNotes?: string;
}

let lastFeedContext: FeedContext = { channel: "stable" };

interface GithubReleaseMetadata {
  tagName: string;
  body?: string;
}

function parseLatestPreviewRelease(body: string): GithubReleaseMetadata | null {
  const releases = JSON.parse(body) as Array<{
    body?: string;
    draft?: boolean;
    prerelease?: boolean;
    tag_name?: string;
  }>;
  const latestPreview = releases.find(
    (release) =>
      release.prerelease === true &&
      release.draft !== true &&
      typeof release.tag_name === "string" &&
      release.tag_name.length > 0,
  );

  if (!latestPreview?.tag_name) {
    return null;
  }

  return {
    tagName: latestPreview.tag_name,
    body:
      typeof latestPreview.body === "string" && latestPreview.body.trim()
        ? latestPreview.body.trim()
        : undefined,
  };
}

async function fetchLatestPreviewRelease(): Promise<GithubReleaseMetadata | null> {
  return await new Promise<GithubReleaseMetadata | null>((resolve, reject) => {
    const request = https.get(
      {
        hostname: "api.github.com",
        path: `/repos/${OFFICIAL_REPO.owner}/${OFFICIAL_REPO.repo}/releases?per_page=20`,
        agent: getHttpRequestAgent("https://api.github.com"),
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "PromptHub-Updater",
        },
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");

        response.on("data", (chunk: string) => {
          body += chunk;
        });

        response.on("end", () => {
          if (response.statusCode !== 200) {
            reject(
              new Error(
                `Preview release lookup failed with HTTP ${response.statusCode || 0}`,
              ),
            );
            return;
          }

          try {
            resolve(parseLatestPreviewRelease(body));
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      },
    );

    request.on("error", (error) => reject(error));
    request.setTimeout(15000, () => {
      request.destroy(new Error("Preview release lookup timed out"));
    });
  });
}

async function resolveFeedContext(
  channel: UpdateChannel,
): Promise<FeedContext> {
  if (channel !== "preview") {
    return { channel };
  }

  // Preview channel is intentionally prerelease-only. Stable releases are not
  // fallback candidates; users return to stable updates by switching channels.
  const release = await fetchLatestPreviewRelease();
  if (!release) {
    throw new Error(
      "Update check failed: No published prerelease preview release is currently available.",
    );
  }

  return {
    channel,
    releaseTag: release.tagName,
    releaseNotes: release.body,
  };
}

function applyUpdaterPreferences(channel: UpdateChannel): void {
  autoUpdater.allowPrerelease = channel === "preview";
  autoUpdater.allowDowngrade = false;
}

function isRemoteVersionNewer(
  remoteVersion: string,
  currentVersion: string,
): boolean {
  return compareVersions(remoteVersion, currentVersion) > 0;
}

function getGenericChannelName(): string | undefined {
  if (process.platform === "win32" && process.arch === "arm64") {
    return "latest-arm64";
  }

  return undefined;
}

function filterDowngradeStatus(info: ElectronUpdateInfo): boolean {
  const currentVersion = app.getVersion();
  const isNewer = isRemoteVersionNewer(info.version, currentVersion);

  if (!isNewer) {
    console.info(
      `[Updater] Ignoring downgrade/non-upgrade candidate ${info.version} for current ${currentVersion}`,
    );
  }

  return isNewer;
}

function applyFeedContext(
  useMirror: boolean,
  context: FeedContext,
  mirrorUrl?: string,
): void {
  if (useMirror) {
    autoUpdater.setFeedURL({
      provider: "generic",
      channel: getGenericChannelName(),
      url:
        mirrorUrl || getMirrorSources(context.channel, context.releaseTag)[0],
    });
    return;
  }

  autoUpdater.setFeedURL(
    getOfficialFeedConfig(context.channel, context.releaseTag),
  );
}

interface FeedCandidate {
  useMirror: boolean;
  url?: string;
}

function getFeedCandidates(
  source: UpdateSource,
  context: FeedContext,
): FeedCandidate[] {
  const official = { useMirror: false };
  const mirrors = getMirrorSources(
    context.channel,
    context.releaseTag,
    context.mirror,
  ).map((url) => ({ useMirror: true, url }));

  if (source === "official") return [official];
  if (source === "mirror") return mirrors;
  return [official, ...mirrors];
}

function applyFeedCandidate(candidate: FeedCandidate, context: FeedContext) {
  applyMirrorDownloadSettings(candidate.useMirror);
  applyFeedContext(candidate.useMirror, context, candidate.url);
}

function toCheckResult(result: unknown): {
  success: boolean;
  result?: unknown;
  updateAvailable?: boolean;
} {
  const isUpdateAvailable = Boolean(
    result &&
    typeof result === "object" &&
    "isUpdateAvailable" in result &&
    (result as { isUpdateAvailable?: boolean }).isUpdateAvailable,
  );

  return {
    success: true,
    result,
    updateAvailable: isUpdateAvailable,
  };
}

export { compareVersions };

// Read changelog for specified version range from CHANGELOG.md
// 从 CHANGELOG.md 读取指定版本区间的更新日志
export function getChangelogForVersionRange(
  newVersion: string,
  currentVersion: string,
): string {
  try {
    const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
    let changelogPath: string;

    if (isDev) {
      changelogPath = path.join(__dirname, "../../../../CHANGELOG.md");
    } else {
      // Check if resourcesPath exists (may be undefined in test environment)
      // 检查 resourcesPath 是否存在（在测试环境中可能为 undefined）
      if (!process.resourcesPath) {
        return "";
      }
      // After packaging, CHANGELOG.md is in resources directory
      // 打包后，CHANGELOG.md 在 resources 目录
      changelogPath = path.join(process.resourcesPath, "CHANGELOG.md");
      // If not exists, try app.asar.unpacked
      // 如果不存在，尝试 app.asar.unpacked
      if (!fs.existsSync(changelogPath)) {
        changelogPath = path.join(
          process.resourcesPath,
          "app.asar.unpacked",
          "CHANGELOG.md",
        );
      }
      // Still not exists, try app directory
      // 还不存在，尝试 app 目录
      if (!fs.existsSync(changelogPath)) {
        changelogPath = path.join(app.getAppPath(), "CHANGELOG.md");
      }
    }

    if (!fs.existsSync(changelogPath)) {
      console.warn("[Updater] CHANGELOG.md not found at:", changelogPath);
      console.warn("[Updater] isDev:", isDev);
      console.warn("[Updater] __dirname:", __dirname);
      console.warn("[Updater] resourcesPath:", process.resourcesPath);
      console.warn("[Updater] appPath:", app.getAppPath());
      return "";
    }

    console.log("[Updater] Reading CHANGELOG from:", changelogPath);

    const content = fs.readFileSync(changelogPath, "utf-8");

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
      if (
        compareVersions(ver, currentVersion) > 0 &&
        compareVersions(ver, newVersion) <= 0
      ) {
        const startIndex = versions[i].startIndex;
        const endIndex = versions[i + 1]?.startIndex || content.length;
        let section = content.slice(startIndex, endIndex).trim();

        // Remove separator lines
        // 移除分隔线
        section = section.replace(/^---\s*$/gm, "").trim();

        relevantSections.push(section);
      }
    }

    if (relevantSections.length === 0) {
      return "";
    }

    return relevantSections.join("\n\n---\n\n");
  } catch (error) {
    console.error("Failed to read CHANGELOG.md:", error);
    return "";
  }
}

// Convert from electron-updater's UpdateInfo to simplified format
// 从 electron-updater 的 UpdateInfo 转换为简化格式
function getExactReleaseNotes(
  info: ElectronUpdateInfo,
  context: FeedContext,
): string {
  if (
    !context.releaseTag ||
    !context.releaseNotes ||
    compareVersions(context.releaseTag, info.version) !== 0
  ) {
    return "";
  }

  return context.releaseNotes;
}

function toSimpleInfo(
  info: ElectronUpdateInfo,
  context: FeedContext = lastFeedContext,
): SimpleUpdateInfo {
  const currentVersion = app.getVersion();

  // Preview lookup already returns the exact published GitHub Release body.
  // Reuse it so badges, images, emoji, and release-specific notices are not
  // replaced by the packaged full changelog. Other lanes keep the bounded
  // local changelog and manifest fallback below without another API request.
  let releaseNotes = getExactReleaseNotes(info, context);

  if (!releaseNotes) {
    releaseNotes = getChangelogForVersionRange(info.version, currentVersion);
  }

  // If CHANGELOG has no content, fallback to GitHub Release notes
  // 如果 CHANGELOG 没有内容，回退到 GitHub Release 的说明
  if (!releaseNotes) {
    let githubNotes = "";
    if (typeof info.releaseNotes === "string") {
      githubNotes = info.releaseNotes;
    } else if (Array.isArray(info.releaseNotes)) {
      githubNotes = info.releaseNotes
        .map((n) => (n.note ? n.note : ""))
        .filter(Boolean)
        .join("\n\n");
    }

    // Check if GitHub notes is the full CHANGELOG (contains multiple version headers)
    // 检查 GitHub notes 是否是完整的 CHANGELOG（包含多个版本标题）
    const versionHeaders = githubNotes.match(/^## \[\d+\.\d+\.\d+/gm) || [];

    if (versionHeaders.length > 3) {
      // Likely full CHANGELOG, try to extract version range
      // 可能是完整的 CHANGELOG，尝试提取版本区间
      console.log(
        "[Updater] GitHub notes appears to be full CHANGELOG, extracting version range...",
      );
      releaseNotes = extractVersionRange(
        githubNotes,
        info.version,
        currentVersion,
      );
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
function extractVersionRange(
  content: string,
  newVersion: string,
  currentVersion: string,
): string {
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
    if (
      compareVersions(ver, currentVersion) > 0 &&
      compareVersions(ver, newVersion) <= 0
    ) {
      const startIndex = versions[i].startIndex;
      const endIndex = versions[i + 1]?.startIndex || content.length;
      let section = content.slice(startIndex, endIndex).trim();
      section = section.replace(/^---\s*$/gm, "").trim();
      relevantSections.push(section);
    }
  }

  if (relevantSections.length === 0) {
    // If no relevant sections, just return the first version's content
    // 如果没有相关版本，返回第一个版本的内容
    if (versions.length > 0) {
      const startIndex = versions[0].startIndex;
      const endIndex = versions[1]?.startIndex || content.length;
      return content
        .slice(startIndex, endIndex)
        .trim()
        .replace(/^---\s*$/gm, "")
        .trim();
    }
    return content;
  }

  return relevantSections.join("\n\n---\n\n");
}

let mainWindow: BrowserWindow | null = null;
let lastPercent = 0; // Track last progress to prevent regression
let suppressedUpdaterStatusCount = 0;
let suppressedUpdaterErrorCount = 0;
let latestDownloadRequestId = 0;
let downloadedUpdateVersion: string | undefined;
let activeDownload:
  | {
      token: CancellationToken;
      promise: Promise<DownloadResult>;
    }
  | undefined;

interface DownloadResult {
  success: boolean;
  cancelled?: boolean;
  error?: string;
}

const EMPTY_DOWNLOAD_PROGRESS: ProgressInfo = {
  percent: 0,
  bytesPerSecond: 0,
  transferred: 0,
  total: 0,
};

function isDownloadCancelled(token: CancellationToken): boolean {
  return token.cancelled;
}

async function downloadFromSource(
  source: UpdateSource,
  context: FeedContext,
  token: CancellationToken,
): Promise<DownloadResult> {
  let lastError: unknown;

  for (const candidate of getFeedCandidates(source, context)) {
    if (isDownloadCancelled(token)) {
      return { success: false, cancelled: true };
    }

    lastPercent = 0;
    sendStatusToWindow({
      status: "downloading",
      progress: EMPTY_DOWNLOAD_PROGRESS,
    });
    suppressedUpdaterStatusCount += 1;
    suppressedUpdaterErrorCount += 1;
    try {
      applyFeedCandidate(candidate, context);
      await autoUpdater.checkForUpdates();
      await autoUpdater.downloadUpdate(token);
      return { success: true };
    } catch (error) {
      if (isDownloadCancelled(token)) {
        return { success: false, cancelled: true };
      }
      lastError = error;
      console.warn(
        `[Updater] ${candidate.useMirror ? "Mirror" : "Official"} download attempt failed${candidate.url ? `: ${candidate.url}` : ""}`,
      );
    } finally {
      suppressedUpdaterStatusCount -= 1;
      suppressedUpdaterErrorCount -= 1;
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : String(lastError);
  return {
    success: false,
    error:
      source === "official"
        ? `Download update failed: ${message}`
        : `All configured update sources failed: ${message}`,
  };
}

async function restartDownload(
  source: UpdateSource,
  context: FeedContext,
  requestId: number,
): Promise<DownloadResult> {
  const previousDownload = activeDownload;
  if (previousDownload) {
    previousDownload.token.cancel();
    await previousDownload.promise.catch(() => undefined);
  }

  if (requestId !== latestDownloadRequestId) {
    return { success: false, cancelled: true };
  }

  const token = new CancellationToken();
  const promise = downloadFromSource(source, context, token);
  activeDownload = { token, promise };

  try {
    return await promise;
  } finally {
    if (activeDownload?.token === token) {
      activeDownload = undefined;
    }
    token.dispose();
  }
}
// 跟踪上次进度，防止进度回退

function isMacPlatform(): boolean {
  return process.platform === "darwin";
}

function normalizeRealPath(inputPath: string): string {
  try {
    return fs.realpathSync(inputPath);
  } catch {
    return inputPath;
  }
}

export function detectMacInstallSource(
  executablePath: string = process.execPath,
): MacInstallSource {
  if (!isMacPlatform()) {
    return "unknown";
  }

  const resolvedPath = normalizeRealPath(executablePath);
  const normalizedPath = resolvedPath.replace(/\\/g, "/");

  if (
    normalizedPath.includes("/Caskroom/") ||
    normalizedPath.startsWith("/opt/homebrew/Caskroom/") ||
    normalizedPath.startsWith("/usr/local/Caskroom/")
  ) {
    return "homebrew";
  }

  return "direct";
}

function getMacInstallSource(): MacInstallSource {
  return detectMacInstallSource(process.execPath);
}

function getHomebrewUpgradeMessage(): string {
  return (
    "This PromptHub build appears to be installed via Homebrew. " +
    "Please upgrade it with 'brew upgrade --cask prompthub' instead of using the in-app DMG updater."
  );
}

async function openPathOrError(targetPath: string): Promise<string | null> {
  const error = await shell.openPath(targetPath);
  return typeof error === "string" && error.trim().length > 0 ? error : null;
}

export interface UpdateStatus {
  status:
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error";
  info?: SimpleUpdateInfo;
  progress?: ProgressInfo;
  error?: string;
}

let nativeUpdateStatusConsumer: (status: UpdateStatus) => void = () =>
  undefined;

export function initUpdater(
  win: BrowserWindow,
  onStatus: (status: UpdateStatus) => void = () => undefined,
) {
  mainWindow = win;
  nativeUpdateStatusConsumer = onStatus;
  downloadedUpdateVersion = undefined;

  // Disable auto download, let user choose
  // 禁用自动下载，让用户选择
  autoUpdater.autoDownload = false;
  // Disable auto-install on quit across all platforms.
  //
  // Historical context: v0.5.2 enabled this on Windows (`!isMac`), but when
  // combined with the auto-recovery code path in renderer (which called
  // `app.relaunch()+quit()` after copying a recovered database), a pending
  // electron-updater install was triggered on every quit. That install
  // silently re-applied the same NSIS package — and because the package
  // itself could lead the app back into an empty-database state, the loop
  // repeated indefinitely.
  //
  // Requiring an explicit user click to install is worth the minor UX cost.
  // See AGENTS.md §12 and the v0.5.3 regression analysis.
  autoUpdater.autoInstallOnAppQuit = false;

  applyUpdaterPreferences(
    isPrereleaseVersion(app.getVersion()) ? "preview" : "stable",
  );
  console.log(
    `[Updater] Platform: ${process.platform}, Arch: ${process.arch}, currentVersion: ${app.getVersion()}`,
  );

  // Update check error
  // 检查更新出错
  autoUpdater.on("error", (error) => {
    if (suppressedUpdaterErrorCount > 0) {
      console.warn("[Updater] Suppressed recoverable source error");
      return;
    }
    console.error("Update error:", error);
    let message = (error && (error as Error).message) || String(error);
    // Handle 404 error for missing yml files
    // 处理找不到 yml 文件的 404 错误
    if (message.includes("404") || message.includes("Cannot find")) {
      message =
        "Update check failed: Cannot find update manifest file in the latest release.\n" +
        "更新检查失败：无法在最新版本中找到更新配置文件。\n" +
        "请前往 GitHub Releases 页面手动下载安装。";
    } else if (message.includes("ZIP file not provided")) {
      message =
        "Auto update requires ZIP installer, but current Release does not have corresponding ZIP file. Please go to GitHub Releases page to download manually, or wait for next version to fix auto update.";
      // 自动更新需要 ZIP 安装包，但当前版本的 Release 中没有对应的 ZIP 文件。请前往 GitHub Releases 页面手动下载安装，或等待下一个版本修复自动更新。
    }
    if (
      message.toLowerCase().includes("sha512") &&
      message.toLowerCase().includes("mismatch")
    ) {
      console.log(
        "[Updater] SHA512 mismatch, temp directory:",
        app.getPath("temp"),
      );
      message =
        "SHA512 校验失败\n\n" +
        "这通常是由于 CDN 缓存不一致或网络问题导致的。\n" +
        "文件可能已下载完成，您可以点击下方按钮打开文件夹手动尝试安装。";
    }
    sendStatusToWindow({
      status: "error",
      error: message,
    });
  });

  // Checking for update
  // 检查更新中
  autoUpdater.on("checking-for-update", () => {
    if (suppressedUpdaterStatusCount > 0) return;
    console.info("Checking for update...");
    sendStatusToWindow({ status: "checking" });
  });

  // Update available
  // 有可用更新
  autoUpdater.on("update-available", (info) => {
    if (suppressedUpdaterStatusCount > 0) return;
    if (!filterDowngradeStatus(info)) {
      sendStatusToWindow({
        status: "not-available",
        info: toSimpleInfo(info),
      });
      return;
    }

    console.info("Update available:", info.version);
    sendStatusToWindow({
      status: "available",
      info: toSimpleInfo(info),
    });
  });

  // No update available
  // 没有可用更新
  autoUpdater.on("update-not-available", (info) => {
    if (suppressedUpdaterStatusCount > 0) return;
    console.info("Update not available, current version is latest");
    sendStatusToWindow({
      status: "not-available",
      info: toSimpleInfo(info),
    });
  });

  // Download progress
  // 下载进度
  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    // Prevent progress regression (electron-updater resets progress when downloading multiple files)
    // 防止进度回退（electron-updater 下载多个文件时会重置进度）
    if (progress.percent < lastPercent && lastPercent < 99) {
      // Keep last progress when regression occurs
      // 进度回退时，保持上次进度
      console.info(
        `Download progress (ignored regression): ${progress.percent.toFixed(2)}% -> keeping ${lastPercent.toFixed(2)}%`,
      );
      return;
    }
    lastPercent = progress.percent;
    console.info(`Download progress: ${progress.percent.toFixed(2)}%`);
    sendStatusToWindow({
      status: "downloading",
      progress,
    });
  });

  // Download completed
  // 下载完成
  autoUpdater.on("update-downloaded", (info) => {
    console.info("Update downloaded:", info.version);
    downloadedUpdateVersion = info.version;
    sendStatusToWindow({
      status: "downloaded",
      info: toSimpleInfo(info),
    });
  });
}

function sendStatusToWindow(status: UpdateStatus) {
  try {
    nativeUpdateStatusConsumer(status);
  } catch {
    console.error("Failed to publish updater status to native consumers");
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("updater:status", status);
  }
}

// Register IPC handlers
// 注册 IPC 处理程序
const UPDATER_IPC_CHANNELS = [
  "updater:version",
  "updater:installSource",
  "updater:check",
  "updater:download",
  "updater:install",
  "updater:platform",
  "updater:openReleases",
  "updater:openDownloadedUpdate",
] as const;

export function registerUpdaterIPC() {
  const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

  if (typeof ipcMain.removeHandler === "function") {
    for (const channel of UPDATER_IPC_CHANNELS) {
      ipcMain.removeHandler(channel);
    }
  }

  // Get current version - always available
  // 获取当前版本 - 总是可用
  ipcMain.handle("updater:version", () => {
    return resolveDesktopVersion();
  });

  ipcMain.handle("updater:installSource", () => {
    return isMacPlatform() ? getMacInstallSource() : "unknown";
  });

  // 检查更新
  // Check for updates - respect user's mirror preference
  ipcMain.handle(
    "updater:check",
    async (_event, request?: boolean | UpdateRequestOptions) => {
      if (isDev) {
        return {
          success: false,
          error: "Update check disabled in development mode",
        };
      }

      const { source, channel, mirror } = normalizeUpdateOptions(request);
      applyUpdaterPreferences(channel);
      let context: FeedContext;

      try {
        context = { ...(await resolveFeedContext(channel)), mirror };
        lastFeedContext = context;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      let lastError: unknown;
      for (const candidate of getFeedCandidates(source, context)) {
        suppressedUpdaterErrorCount += 1;
        try {
          applyFeedCandidate(candidate, context);
          const result = await autoUpdater.checkForUpdates();
          return toCheckResult(result);
        } catch (error) {
          lastError = error;
          console.warn(
            `[Updater] ${candidate.useMirror ? "Mirror" : "Official"} check failed${candidate.url ? `: ${candidate.url}` : ""}`,
          );
        } finally {
          suppressedUpdaterErrorCount -= 1;
        }
      }

      const message =
        lastError instanceof Error ? lastError.message : String(lastError);
      return { success: false, error: `Update check failed: ${message}` };
    },
  );

  // Start downloading update
  // 开始下载更新 - respect user's mirror preference
  ipcMain.handle(
    "updater:download",
    async (_event, request?: boolean | UpdateRequestOptions) => {
      if (isDev) {
        return {
          success: false,
          error: "Download disabled in development mode",
        };
      }

      const { source, channel, mirror } = normalizeUpdateOptions(request);
      applyUpdaterPreferences(channel);
      let context: FeedContext;

      try {
        context =
          lastFeedContext.channel === channel
            ? lastFeedContext
            : await resolveFeedContext(channel);
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      context = { ...context, mirror };
      lastFeedContext = context;

      if (isMacPlatform() && getMacInstallSource() === "homebrew") {
        return {
          success: false,
          error: getHomebrewUpgradeMessage(),
          installSource: "homebrew",
        };
      }

      // Refresh update metadata for the selected source before downloading.
      // This is required when a running download switches from official to a
      // mirror (or back), because electron-updater caches the previous provider.
      const requestId = ++latestDownloadRequestId;
      return await restartDownload(source, context, requestId);
    },
  );

  // Install update and restart
  // 安装更新并重启
  ipcMain.handle("updater:install", async () => {
    if (isDev) {
      return { success: false, error: "Install disabled in development mode" };
    }

    if (isMacPlatform() && getMacInstallSource() === "homebrew") {
      return {
        success: false,
        manual: true,
        installSource: "homebrew",
        error: getHomebrewUpgradeMessage(),
      };
    }

    try {
      const backup = await createUpgradeDataSnapshot(app.getPath("userData"), {
        fromVersion: app.getVersion(),
        toVersion: downloadedUpdateVersion,
      });

      // Direct installations restart through electron-updater after the snapshot.
      autoUpdater.quitAndInstall(false, true);
      return {
        success: true,
        manual: false,
        backupPath: backup.backupPath,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[Updater] Failed to create upgrade backup:", error);
      return {
        success: false,
        error: `Automatic upgrade backup failed: ${message}`,
      };
    }
  });

  // Get platform info
  // 获取平台信息
  ipcMain.handle("updater:platform", () => {
    return process.platform;
  });

  // Open GitHub Releases page
  // 打开 GitHub Releases 页面
  ipcMain.handle("updater:openReleases", () => {
    shell.openExternal("https://github.com/legeling/PromptHub/releases");
  });

  ipcMain.handle("updater:openDownloadedUpdate", async () => {
    // Reveal the package only when electron-updater exposes a durable path.
    const installerPath = (autoUpdater as unknown as { installerPath?: string })
      .installerPath;
    if (installerPath && fs.existsSync(installerPath)) {
      shell.showItemInFolder(installerPath);
      return { success: true, path: installerPath };
    }

    const downloadDir = app.getPath("downloads");
    const openError = await openPathOrError(downloadDir);
    const baseError = installerPath
      ? "Downloaded update file is missing"
      : "No downloaded update file is available";
    return {
      success: false,
      path: downloadDir,
      error: openError
        ? `${baseError}; failed to open Downloads folder: ${openError}`
        : baseError,
    };
  });
}
