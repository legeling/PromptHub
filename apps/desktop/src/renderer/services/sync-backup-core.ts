import type { PromptVersion } from "@prompthub/shared/types";

import { getAllFolders, getAllPrompts } from "./database";
import { exportDatabase, restoreFromBackup } from "./database-backup";
import type { DatabaseBackup } from "./database-backup-format";
import {
  getSettingsStateSnapshot,
  restoreAiConfigSnapshot,
  restoreSettingsStateSnapshot,
  SENSITIVE_SETTINGS_FIELDS,
} from "./settings-snapshot";

export interface SyncResult {
  success: boolean;
  message: string;
  timestamp?: string;
  localChanged?: boolean;
  details?: {
    promptsUploaded?: number;
    promptsDownloaded?: number;
    imagesUploaded?: number;
    imagesDownloaded?: number;
    videosUploaded?: number;
    videosDownloaded?: number;
    skillsDownloaded?: number;
    skipped?: number;
  };
}

export interface BackupManifest {
  version: string;
  createdAt: string;
  updatedAt: string;
  dataHash: string;
  images: {
    [fileName: string]: {
      hash: string;
      size: number;
      uploadedAt: string;
    };
  };
  videos: {
    [fileName: string]: {
      hash: string;
      size: number;
      uploadedAt: string;
    };
  };
  encrypted?: boolean;
}

export interface BackupData extends Omit<DatabaseBackup, "version"> {
  version: string | number;
}

export interface SyncBackupOptions {
  includeImages?: boolean;
  encryptionPassword?: string;
  incrementalSync?: boolean;
}

export interface RemoteUploadResult {
  success: boolean;
  error?: string;
}

export interface RemoteDownloadResult {
  success: boolean;
  data?: string;
  notFound?: boolean;
  error?: string;
}

export interface RemoteStatResult {
  exists: boolean;
  lastModified?: string;
}

export interface RemoteSyncAdapter {
  paths: {
    legacy: string;
    manifest: string;
    data: string;
    image(fileName: string): string;
    video(fileName: string): string;
  };
  prepareLegacyUpload?(): Promise<void>;
  prepareIncrementalUpload?(includeMedia: boolean): Promise<void>;
  uploadText(path: string, content: string): Promise<RemoteUploadResult>;
  downloadText(path: string): Promise<RemoteDownloadResult>;
  stat?(path: string): Promise<RemoteStatResult>;
}

export const BACKUP_DIR = "prompthub-backup";
export const MANIFEST_FILENAME = "manifest.json";
export const DATA_FILENAME = "data.json";
export const IMAGES_DIR = "images";
export const VIDEOS_DIR = "videos";
export const LEGACY_BACKUP_FILENAME = "prompthub-backup.json";

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function encryptData(
  data: string,
  password: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"],
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    dataBuffer,
  );

  const combined = new Uint8Array(
    salt.length + iv.length + encrypted.byteLength,
  );
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);

  return uint8ArrayToBase64(combined);
}

export async function decryptData(
  encryptedBase64: string,
  password: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const combined = base64ToUint8Array(encryptedBase64);

  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const encrypted = combined.slice(28);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"],
  );

  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    encrypted,
  );

  return decoder.decode(decrypted);
}

export async function computeHash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, 16);
}

function isIncrementalSyncEnabled(options?: SyncBackupOptions): boolean {
  return options?.incrementalSync !== false;
}

function createFailureMessage(
  english: string,
  chinese: string,
  error?: string,
): string {
  return error
    ? `${english}: ${error} / ${chinese}: ${error}`
    : `${english} / ${chinese}`;
}

function toVersionNumber(version: string | number): number {
  return typeof version === "string" ? parseInt(version, 10) || 1 : version;
}

function getBackupVersions(
  data: Partial<BackupData> & { promptVersions?: PromptVersion[] },
): PromptVersion[] {
  if (Array.isArray(data.versions) && data.versions.length > 0) {
    return data.versions;
  }

  return Array.isArray(data.promptVersions) ? data.promptVersions : [];
}

function buildLegacyBackupData(
  fullBackup: DatabaseBackup,
  includeMedia: boolean,
): BackupData {
  return {
    version: "3.1",
    exportedAt: new Date().toISOString(),
    prompts: fullBackup.prompts || [],
    folders: fullBackup.folders || [],
    versions: fullBackup.versions || [],
    images: includeMedia ? fullBackup.images : undefined,
    videos: includeMedia ? fullBackup.videos : undefined,
    aiConfig: fullBackup.aiConfig,
    settings: fullBackup.settings,
    settingsUpdatedAt: fullBackup.settingsUpdatedAt,
    rules: fullBackup.rules,
    skills: fullBackup.skills,
    skillVersions: fullBackup.skillVersions,
    skillFiles: fullBackup.skillFiles,
    mcpLibrary: fullBackup.mcpLibrary,
    pluginLibrary: fullBackup.pluginLibrary,
    pluginPackages: fullBackup.pluginPackages,
    storeSources: fullBackup.storeSources,
    agentAssetFiles: fullBackup.agentAssetFiles,
  };
}

function buildIncrementalCoreData(fullBackup: DatabaseBackup): BackupData {
  return {
    version: "4.0",
    exportedAt: new Date().toISOString(),
    prompts: fullBackup.prompts || [],
    folders: fullBackup.folders || [],
    versions: fullBackup.versions || [],
    aiConfig: fullBackup.aiConfig,
    settings: fullBackup.settings,
    settingsUpdatedAt: fullBackup.settingsUpdatedAt,
    rules: fullBackup.rules,
    skills: fullBackup.skills,
    skillVersions: fullBackup.skillVersions,
    skillFiles: fullBackup.skillFiles,
    mcpLibrary: fullBackup.mcpLibrary,
    pluginLibrary: fullBackup.pluginLibrary,
    pluginPackages: fullBackup.pluginPackages,
    storeSources: fullBackup.storeSources,
    agentAssetFiles: fullBackup.agentAssetFiles,
  };
}

async function serializeLegacyBackup(
  backupData: BackupData,
  encryptionPassword?: string,
): Promise<string> {
  if (!encryptionPassword) {
    return JSON.stringify(backupData, null, 2);
  }

  const dataToEncrypt: BackupData = {
    version: backupData.version,
    exportedAt: backupData.exportedAt,
    prompts: backupData.prompts,
    folders: backupData.folders,
    versions: backupData.versions,
    aiConfig: backupData.aiConfig,
    settings: backupData.settings,
    settingsUpdatedAt: backupData.settingsUpdatedAt,
    rules: backupData.rules,
    skills: backupData.skills,
    skillVersions: backupData.skillVersions,
    skillFiles: backupData.skillFiles,
    mcpLibrary: backupData.mcpLibrary,
    pluginLibrary: backupData.pluginLibrary,
    pluginPackages: backupData.pluginPackages,
    storeSources: backupData.storeSources,
    agentAssetFiles: backupData.agentAssetFiles,
  };

  return JSON.stringify({
    encrypted: true,
    data: await encryptData(JSON.stringify(dataToEncrypt), encryptionPassword),
    images: backupData.images,
    videos: backupData.videos,
  });
}

async function serializeIncrementalCoreData(
  coreData: BackupData,
  encryptionPassword?: string,
): Promise<string> {
  const json = JSON.stringify(coreData);
  if (!encryptionPassword) {
    return json;
  }

  return JSON.stringify({
    encrypted: true,
    data: await encryptData(json, encryptionPassword),
  });
}

function parseManifestText(rawData: string): BackupManifest {
  let cleanData = rawData;

  if (cleanData.charCodeAt(0) === 0xfeff) {
    cleanData = cleanData.slice(1);
  }

  const firstBrace = cleanData.indexOf("{");
  const lastBrace = cleanData.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleanData = cleanData.substring(firstBrace, lastBrace + 1);
  }

  cleanData = cleanData.trim();
  if (cleanData.startsWith("<")) {
    throw new Error(
      "Server returned HTML instead of JSON, please check remote sync server status / 服务器返回了 HTML 而非 JSON，请检查远程同步服务状态",
    );
  }

  try {
    return JSON.parse(cleanData) as BackupManifest;
  } catch {
    const preview = rawData.substring(0, 50);
    throw new Error(
      `Invalid manifest file format / manifest 文件格式错误 (${preview}...)`,
    );
  }
}

async function parseLegacyBackupPayload(
  rawData: string,
  options?: SyncBackupOptions,
): Promise<{
  data: BackupData & { promptVersions?: PromptVersion[] };
  images?: Record<string, string>;
  videos?: Record<string, string>;
}> {
  const parsed = JSON.parse(rawData) as BackupData & {
    encrypted?: boolean;
    data?: string;
    images?: Record<string, string>;
    videos?: Record<string, string>;
    promptVersions?: PromptVersion[];
  };

  if (parsed.encrypted && parsed.data) {
    if (!options?.encryptionPassword) {
      throw new Error(
        "Data is encrypted, please provide decryption password / 数据已加密，请提供解密密码",
      );
    }

    try {
      const decrypted = await decryptData(
        parsed.data,
        options.encryptionPassword,
      );
      return {
        data: JSON.parse(decrypted) as BackupData & {
          promptVersions?: PromptVersion[];
        },
        images: parsed.images,
        videos: parsed.videos,
      };
    } catch {
      throw new Error(
        "Decryption failed, password may be incorrect / 解密失败，密码可能不正确",
      );
    }
  }

  return {
    data: parsed,
    images: parsed.images,
    videos: parsed.videos,
  };
}

async function parseIncrementalCorePayload(
  rawData: string,
  manifest: BackupManifest,
  options?: SyncBackupOptions,
): Promise<BackupData & { promptVersions?: PromptVersion[] }> {
  if (!manifest.encrypted) {
    return JSON.parse(rawData) as BackupData & {
      promptVersions?: PromptVersion[];
    };
  }

  if (!options?.encryptionPassword) {
    throw new Error(
      "Data is encrypted, please provide decryption password / 数据已加密，请提供解密密码",
    );
  }

  try {
    const parsed = JSON.parse(rawData) as { data?: string };
    const decrypted = await decryptData(
      parsed.data || "",
      options.encryptionPassword,
    );
    return JSON.parse(decrypted) as BackupData & {
      promptVersions?: PromptVersion[];
    };
  } catch {
    throw new Error(
      "Decryption failed, password may be incorrect / 解密失败，密码可能不正确",
    );
  }
}

async function restoreImages(images: Record<string, string>): Promise<number> {
  let restoredCount = 0;

  for (const [fileName, base64] of Object.entries(images)) {
    try {
      const success = await window.electron?.saveImageBase64?.(
        fileName,
        base64,
      );
      if (success) {
        restoredCount++;
      }
    } catch (error) {
      console.warn(`Failed to restore image ${fileName}:`, error);
    }
  }

  return restoredCount;
}

async function downloadAndRestoreMedia(
  entries:
    | Record<string, { hash: string; size: number; uploadedAt: string }>
    | undefined,
  resolvePath: (fileName: string) => string,
  downloadText: (path: string) => Promise<RemoteDownloadResult>,
  restoreFile: (
    fileName: string,
    base64: string,
  ) => Promise<boolean | undefined>,
  label: string,
): Promise<number> {
  let restoredCount = 0;

  for (const fileName of Object.keys(entries || {})) {
    try {
      const result = await downloadText(resolvePath(fileName));
      if (!result.success || !result.data) {
        continue;
      }

      const success = await restoreFile(fileName, result.data);
      if (success) {
        restoredCount++;
      }
    } catch (error) {
      console.warn(`Failed to restore ${label} ${fileName}:`, error);
    }
  }

  return restoredCount;
}

async function restoreSharedSnapshots(data: BackupData): Promise<void> {
  if (data.aiConfig) {
    restoreAiConfigSnapshot(data.aiConfig);
  }

  if (data.settings) {
    restoreSettingsStateSnapshot(data.settings, {
      preserveLocalFields: SENSITIVE_SETTINGS_FIELDS,
    });
  }
}

async function getLocalLatestTimestamp(): Promise<Date> {
  const [localPrompts, localFolders] = await Promise.all([
    getAllPrompts(),
    getAllFolders(),
  ]);
  let localLatestTime = new Date(0);

  for (const prompt of localPrompts) {
    const updatedAt = new Date(prompt.updatedAt);
    if (updatedAt > localLatestTime) {
      localLatestTime = updatedAt;
    }
  }

  for (const folder of localFolders) {
    const updatedAt = new Date(folder.updatedAt);
    if (updatedAt > localLatestTime) {
      localLatestTime = updatedAt;
    }
  }

  const settingsSnapshot = getSettingsStateSnapshot();
  if (settingsSnapshot?.settingsUpdatedAt) {
    const settingsUpdatedAt = new Date(settingsSnapshot.settingsUpdatedAt);
    if (settingsUpdatedAt > localLatestTime) {
      localLatestTime = settingsUpdatedAt;
    }
  }

  return localLatestTime;
}

function createNoopSyncResult(skipped = 0): SyncResult {
  return {
    success: true,
    message: "Already up to date, no sync needed / 数据已是最新，无需同步",
    timestamp: new Date().toISOString(),
    localChanged: false,
    details: {
      promptsUploaded: 0,
      imagesUploaded: 0,
      videosUploaded: 0,
      skipped,
    },
  };
}

function getTimestampCandidates(
  adapter: RemoteSyncAdapter,
  options?: SyncBackupOptions,
): string[] {
  return isIncrementalSyncEnabled(options)
    ? [adapter.paths.manifest, adapter.paths.legacy]
    : [adapter.paths.legacy];
}

async function downloadLegacySyncBackup(
  adapter: RemoteSyncAdapter,
  options?: SyncBackupOptions,
): Promise<SyncResult> {
  try {
    const result = await adapter.downloadText(adapter.paths.legacy);
    if (result.notFound) {
      return {
        success: false,
        message: "No remote backup found / 远程没有备份文件",
      };
    }

    if (!result.success || !result.data) {
      return {
        success: false,
        message: createFailureMessage(
          "Download failed",
          "下载失败",
          result.error,
        ),
      };
    }

    const { data, images, videos } = await parseLegacyBackupPayload(
      result.data,
      options,
    );

    await restoreFromBackup({
      version: toVersionNumber(data.version),
      exportedAt: data.exportedAt,
      prompts: data.prompts,
      folders: data.folders,
      versions: getBackupVersions(data),
      videos: videos || {},
      rules: data.rules,
      skills: data.skills,
      skillVersions: data.skillVersions,
      skillFiles: data.skillFiles,
      mcpLibrary: data.mcpLibrary,
      pluginLibrary: data.pluginLibrary,
      pluginPackages: data.pluginPackages,
      storeSources: data.storeSources,
      agentAssetFiles: data.agentAssetFiles,
    });

    const imagesRestored =
      images && Object.keys(images).length > 0
        ? await restoreImages(images)
        : 0;

    await restoreSharedSnapshots(data);

    const videosDownloaded = Object.keys(videos || {}).length;
    return {
      success: true,
      message: `Download successful (${data.prompts.length} prompts, ${imagesRestored} images, ${videosDownloaded} videos${data.aiConfig ? ", AI config synced" : ""}${data.settings ? ", settings synced" : ""}) / 下载成功 (${data.prompts.length} 条 Prompt, ${imagesRestored} 张图片, ${videosDownloaded} 个视频${data.aiConfig ? ", AI配置已同步" : ""}${data.settings ? ", 设置已同步" : ""})`,
      timestamp: data.exportedAt,
      localChanged: true,
      details: {
        promptsDownloaded: data.prompts.length,
        imagesDownloaded: imagesRestored,
        videosDownloaded,
        skillsDownloaded: data.skills?.length || 0,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Download failed: ${error instanceof Error ? error.message : "Unknown error"} / 下载失败: ${error instanceof Error ? error.message : "未知错误"}`,
    };
  }
}

export async function uploadSyncBackup(
  adapter: RemoteSyncAdapter,
  options?: SyncBackupOptions,
): Promise<SyncResult> {
  if (isIncrementalSyncEnabled(options)) {
    return incrementalUploadSyncBackup(adapter, options);
  }

  try {
    await adapter.prepareLegacyUpload?.();

    const includeMedia = options?.includeImages ?? true;
    const fullBackup = await exportDatabase();
    const backupData = buildLegacyBackupData(fullBackup, includeMedia);
    const bodyString = await serializeLegacyBackup(
      backupData,
      options?.encryptionPassword,
    );

    const uploadResult = await adapter.uploadText(
      adapter.paths.legacy,
      bodyString,
    );
    if (!uploadResult.success) {
      return {
        success: false,
        message: createFailureMessage(
          "Upload failed",
          "上传失败",
          uploadResult.error,
        ),
      };
    }

    const imagesCount = Object.keys(backupData.images || {}).length;
    const videosCount = Object.keys(backupData.videos || {}).length;
    const promptsCount = fullBackup.prompts.length;
    const versionsCount = fullBackup.versions?.length || 0;

    return {
      success: true,
      message: `Upload successful (${promptsCount} prompts, ${versionsCount} versions, ${imagesCount} images, ${videosCount} videos) / 上传成功 (${promptsCount} 条 Prompt, ${versionsCount} 个版本, ${imagesCount} 张图片, ${videosCount} 个视频)`,
      timestamp: new Date().toISOString(),
      localChanged: false,
      details: {
        promptsUploaded: promptsCount,
        imagesUploaded: imagesCount,
        videosUploaded: videosCount,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Upload failed: ${error instanceof Error ? error.message : "Unknown error"} / 上传失败: ${error instanceof Error ? error.message : "未知错误"}`,
    };
  }
}

export async function incrementalUploadSyncBackup(
  adapter: RemoteSyncAdapter,
  options?: SyncBackupOptions,
): Promise<SyncResult> {
  try {
    const includeMedia = options?.includeImages !== false;
    await adapter.prepareIncrementalUpload?.(includeMedia);

    const fullBackup = await exportDatabase({
      skipVideoContent: true,
      limitMedia: true,
    });
    const coreData = buildIncrementalCoreData(fullBackup);
    const dataString = await serializeIncrementalCoreData(
      coreData,
      options?.encryptionPassword,
    );
    const dataHash = await computeHash(dataString);

    let remoteManifest: BackupManifest | null = null;
    const manifestResult = await adapter.downloadText(adapter.paths.manifest);
    if (manifestResult.success && manifestResult.data) {
      try {
        remoteManifest = parseManifestText(manifestResult.data);
      } catch {
        remoteManifest = null;
      }
    }

    let uploadedCount = 0;
    let skippedCount = 0;
    let imagesUploaded = 0;
    let videosUploaded = 0;

    if (!remoteManifest || remoteManifest.dataHash !== dataHash) {
      const uploadResult = await adapter.uploadText(
        adapter.paths.data,
        dataString,
      );
      if (!uploadResult.success) {
        return {
          success: false,
          message: createFailureMessage(
            "Failed to upload data file",
            "上传数据文件失败",
            uploadResult.error,
          ),
        };
      }
      uploadedCount++;
    } else {
      skippedCount++;
    }

    const newImageManifest: BackupManifest["images"] = {};
    if (includeMedia && fullBackup.images) {
      for (const [fileName, base64] of Object.entries(fullBackup.images)) {
        const imageHash = await computeHash(base64);
        const remoteImage = remoteManifest?.images?.[fileName];
        if (!remoteImage || remoteImage.hash !== imageHash) {
          const uploadResult = await adapter.uploadText(
            adapter.paths.image(fileName),
            base64,
          );
          if (uploadResult.success) {
            imagesUploaded++;
          }
        } else {
          skippedCount++;
        }

        newImageManifest[fileName] = {
          hash: imageHash,
          size: base64.length,
          uploadedAt: new Date().toISOString(),
        };
      }
    }

    const newVideoManifest: BackupManifest["videos"] = {};
    if (includeMedia) {
      const videoFiles = new Set<string>();
      (fullBackup.prompts || []).forEach((prompt) =>
        prompt.videos?.forEach((video) => videoFiles.add(video)),
      );

      for (const fileName of videoFiles) {
        try {
          const base64 = await window.electron?.readVideoBase64?.(fileName);
          if (!base64) {
            continue;
          }

          const videoHash = await computeHash(base64);
          const remoteVideo = remoteManifest?.videos?.[fileName];
          if (!remoteVideo || remoteVideo.hash !== videoHash) {
            const uploadResult = await adapter.uploadText(
              adapter.paths.video(fileName),
              base64,
            );
            if (uploadResult.success) {
              videosUploaded++;
            }
          } else {
            skippedCount++;
          }

          newVideoManifest[fileName] = {
            hash: videoHash,
            size: base64.length,
            uploadedAt: new Date().toISOString(),
          };
        } catch (error) {
          console.error(`[Sync] Failed to process video ${fileName}:`, error);
        }
      }
    }

    if (uploadedCount === 0 && imagesUploaded === 0 && videosUploaded === 0) {
      return createNoopSyncResult(skippedCount);
    }

    const newManifest: BackupManifest = {
      version: "4.0",
      createdAt: remoteManifest?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dataHash,
      images: newImageManifest,
      videos: newVideoManifest,
      encrypted: !!options?.encryptionPassword,
    };

    const manifestUploadResult = await adapter.uploadText(
      adapter.paths.manifest,
      JSON.stringify(newManifest, null, 2),
    );
    if (!manifestUploadResult.success) {
      return {
        success: false,
        message: createFailureMessage(
          "Failed to upload manifest",
          "上传 manifest 失败",
          manifestUploadResult.error,
        ),
      };
    }

    const totalImages = Object.keys(newImageManifest).length;
    const totalVideos = Object.keys(newVideoManifest).length;

    return {
      success: true,
      message: `Incremental upload completed (${fullBackup.prompts.length} prompts, ${fullBackup.versions?.length || 0} versions, ${imagesUploaded}/${totalImages} images updated, ${videosUploaded}/${totalVideos} videos updated, ${skippedCount} files skipped) / 增量上传完成 (${fullBackup.prompts.length} 条 Prompt, ${fullBackup.versions?.length || 0} 个版本, ${imagesUploaded}/${totalImages} 张图片更新, ${videosUploaded}/${totalVideos} 个视频更新, ${skippedCount} 个文件跳过)`,
      timestamp: new Date().toISOString(),
      localChanged: false,
      details: {
        promptsUploaded: fullBackup.prompts.length,
        imagesUploaded,
        videosUploaded,
        skipped: skippedCount,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Incremental upload failed: ${error instanceof Error ? error.message : "Unknown error"} / 增量上传失败: ${error instanceof Error ? error.message : "未知错误"}`,
    };
  }
}

export async function incrementalDownloadSyncBackup(
  adapter: RemoteSyncAdapter,
  options: SyncBackupOptions | undefined,
  fallbackToLegacy: () => Promise<SyncResult>,
  preloadedManifestText?: string,
): Promise<SyncResult> {
  try {
    let manifestText = preloadedManifestText;
    if (!manifestText) {
      const manifestResult = await adapter.downloadText(adapter.paths.manifest);
      if (!manifestResult.success || !manifestResult.data) {
        return fallbackToLegacy();
      }
      manifestText = manifestResult.data;
    }

    let manifest: BackupManifest;
    try {
      manifest = parseManifestText(manifestText);
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Invalid manifest file format / manifest 文件格式错误",
      };
    }

    const dataResult = await adapter.downloadText(adapter.paths.data);
    if (!dataResult.success || !dataResult.data) {
      return {
        success: false,
        message: createFailureMessage(
          "Failed to download data file",
          "下载数据文件失败",
          dataResult.error,
        ),
      };
    }

    const coreData = await parseIncrementalCorePayload(
      dataResult.data,
      manifest,
      options,
    );

    await restoreFromBackup({
      version: toVersionNumber(coreData.version),
      exportedAt: coreData.exportedAt,
      prompts: coreData.prompts,
      folders: coreData.folders,
      versions: getBackupVersions(coreData),
      rules: coreData.rules,
      skills: coreData.skills,
      skillVersions: coreData.skillVersions,
      skillFiles: coreData.skillFiles,
      mcpLibrary: coreData.mcpLibrary,
      pluginLibrary: coreData.pluginLibrary,
      pluginPackages: coreData.pluginPackages,
      storeSources: coreData.storeSources,
      agentAssetFiles: coreData.agentAssetFiles,
    });

    const imagesDownloaded = await downloadAndRestoreMedia(
      manifest.images,
      adapter.paths.image,
      adapter.downloadText,
      async (fileName, base64) =>
        window.electron?.saveImageBase64?.(fileName, base64),
      "image",
    );
    const videosDownloaded = await downloadAndRestoreMedia(
      manifest.videos,
      adapter.paths.video,
      adapter.downloadText,
      async (fileName, base64) =>
        window.electron?.saveVideoBase64?.(fileName, base64),
      "video",
    );

    await restoreSharedSnapshots(coreData);

    return {
      success: true,
      message: `Incremental download completed (${coreData.prompts.length} prompts, ${imagesDownloaded} images, ${videosDownloaded} videos) / 增量下载完成 (${coreData.prompts.length} 条 Prompt, ${imagesDownloaded} 张图片, ${videosDownloaded} 个视频)`,
      timestamp: coreData.exportedAt,
      localChanged: true,
      details: {
        promptsDownloaded: coreData.prompts.length,
        imagesDownloaded,
        videosDownloaded,
        skillsDownloaded: coreData.skills?.length || 0,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Incremental download failed: ${error instanceof Error ? error.message : "Unknown error"} / 增量下载失败: ${error instanceof Error ? error.message : "未知错误"}`,
    };
  }
}

export async function downloadSyncBackup(
  adapter: RemoteSyncAdapter,
  options?: SyncBackupOptions,
): Promise<SyncResult> {
  if (isIncrementalSyncEnabled(options)) {
    const manifestResult = await adapter.downloadText(adapter.paths.manifest);
    if (manifestResult.success && manifestResult.data) {
      return incrementalDownloadSyncBackup(
        adapter,
        options,
        () =>
          downloadLegacySyncBackup(adapter, {
            ...options,
            incrementalSync: false,
          }),
        manifestResult.data,
      );
    }
  }

  return downloadLegacySyncBackup(adapter, options);
}

export async function getRemoteSyncBackupTimestamp(
  adapter: RemoteSyncAdapter,
  options?: SyncBackupOptions,
): Promise<{ exists: boolean; lastModified?: string }> {
  try {
    for (const path of getTimestampCandidates(adapter, options)) {
      if (adapter.stat) {
        const statResult = await adapter.stat(path);
        if (statResult.exists) {
          return statResult;
        }
        continue;
      }

      const downloadResult = await adapter.downloadText(path);
      if (!downloadResult.success || !downloadResult.data) {
        continue;
      }

      if (path === adapter.paths.manifest) {
        try {
          const manifest = parseManifestText(downloadResult.data);
          return {
            exists: true,
            lastModified: manifest.updatedAt,
          };
        } catch {
          continue;
        }
      }

      try {
        const { data } = await parseLegacyBackupPayload(
          downloadResult.data,
          options,
        );
        return {
          exists: true,
          lastModified: data.exportedAt,
        };
      } catch {
        continue;
      }
    }

    return { exists: false };
  } catch {
    return { exists: false };
  }
}

export async function autoSyncBackup(
  adapter: RemoteSyncAdapter,
  options?: SyncBackupOptions,
): Promise<SyncResult> {
  try {
    const localLatestTime = await getLocalLatestTimestamp();
    const remoteTimestamp = await getRemoteSyncBackupTimestamp(
      adapter,
      options,
    );

    if (!remoteTimestamp.exists) {
      return uploadSyncBackup(adapter, options);
    }

    const remoteTime = new Date(remoteTimestamp.lastModified || 0);
    if (remoteTime > localLatestTime) {
      return downloadSyncBackup(adapter, options);
    }

    if (localLatestTime > remoteTime) {
      return uploadSyncBackup(adapter, options);
    }

    return createNoopSyncResult();
  } catch (error) {
    return {
      success: false,
      message: `Sync failed: ${error instanceof Error ? error.message : "Unknown error"} / 同步失败: ${error instanceof Error ? error.message : "未知错误"}`,
    };
  }
}
