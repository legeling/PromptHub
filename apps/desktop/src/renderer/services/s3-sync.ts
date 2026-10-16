import { runDesktopCausalSync } from "./causal-sync";
import type { RemoteWriteCondition } from "@prompthub/shared/types/remote-sync";
import {
  BACKUP_DIR,
  DATA_FILENAME,
  downloadSyncBackup,
  getRemoteSyncBackupTimestamp,
  IMAGES_DIR,
  incrementalDownloadSyncBackup,
  incrementalUploadSyncBackup,
  LEGACY_BACKUP_FILENAME,
  MANIFEST_FILENAME,
  type RemoteDownloadResult,
  type RemoteSyncAdapter,
  type RemoteUploadResult,
  type SyncBackupOptions,
  type SyncResult,
  uploadSyncBackup,
  VIDEOS_DIR,
} from "./sync-backup-core";

export interface S3SyncConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  backupPrefix?: string;
}

export interface S3SyncOptions extends SyncBackupOptions {}

function normalizePrefix(prefix?: string): string {
  const trimmed = prefix?.trim() || "";
  return trimmed.replace(/^\/+/, "").replace(/\/+$/, "");
}

function buildObjectKey(config: S3SyncConfig, relativePath: string): string {
  const prefix = normalizePrefix(config.backupPrefix);
  const normalizedRelativePath = relativePath.replace(/^\/+/, "");
  return prefix ? `${prefix}/${normalizedRelativePath}` : normalizedRelativePath;
}

function buildManifestKey(config: S3SyncConfig): string {
  return buildObjectKey(config, `${BACKUP_DIR}/${MANIFEST_FILENAME}`);
}

function buildDataKey(config: S3SyncConfig): string {
  return buildObjectKey(config, `${BACKUP_DIR}/${DATA_FILENAME}`);
}

function buildLegacyBackupKey(config: S3SyncConfig): string {
  return buildObjectKey(config, LEGACY_BACKUP_FILENAME);
}

function buildImageKey(config: S3SyncConfig, fileName: string): string {
  return buildObjectKey(
    config,
    `${BACKUP_DIR}/${IMAGES_DIR}/${encodeURIComponent(fileName)}.base64`,
  );
}

function buildVideoKey(config: S3SyncConfig, fileName: string): string {
  return buildObjectKey(
    config,
    `${BACKUP_DIR}/${VIDEOS_DIR}/${encodeURIComponent(fileName)}.base64`,
  );
}

function toMainConfig(config: S3SyncConfig) {
  return {
    endpoint: config.endpoint,
    region: config.region,
    bucket: config.bucket,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  };
}

async function uploadFile(
  key: string,
  config: S3SyncConfig,
  content: string,
  condition?: RemoteWriteCondition,
): Promise<RemoteUploadResult> {
  try {
    const result = await window.electron?.s3?.upload?.(key, toMainConfig(config), content, condition);
    return result ?? { success: false, error: "S3 transport unavailable" };
  } catch (error) {
    console.error("S3 upload failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function downloadFile(
  key: string,
  config: S3SyncConfig,
): Promise<RemoteDownloadResult> {
  try {
    const result = await window.electron?.s3?.download?.(key, toMainConfig(config));
    if (!result) {
      return { success: false, error: "S3 transport unavailable" };
    }
    return result;
  } catch (error) {
    console.error("S3 download failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function statFile(
  key: string,
  config: S3SyncConfig,
): Promise<{ exists: boolean; lastModified?: string }> {
  try {
    const result = await window.electron?.s3?.stat?.(key, toMainConfig(config));
    if (!result?.success) {
      return { exists: false };
    }

    return {
      exists: true,
      lastModified: result.lastModified,
    };
  } catch {
    return { exists: false };
  }
}

function createS3Adapter(config: S3SyncConfig): RemoteSyncAdapter {
  return {
    paths: {
      legacy: buildLegacyBackupKey(config),
      manifest: buildManifestKey(config),
      data: buildDataKey(config),
      image: (fileName: string) => buildImageKey(config, fileName),
      video: (fileName: string) => buildVideoKey(config, fileName),
    },
    uploadText: (path, content, condition) => uploadFile(path, config, content, condition),
    downloadText: (path) => downloadFile(path, config),
    deleteText: async (path) => {
      const result = await window.electron?.s3?.delete(path, toMainConfig(config));
      return result ?? { success: false, error: "S3 transport unavailable" };
    },
    stat: (path) => statFile(path, config),
  };
}

export async function testConnection(
  config: S3SyncConfig,
): Promise<SyncResult> {
  try {
    const result = await window.electron?.s3?.testConnection?.(toMainConfig(config));
    if (!result) {
      return {
        success: false,
        message: "S3 transport unavailable / S3 通道不可用",
      };
    }

    return {
      success: result.success,
      message: result.message,
    };
  } catch (error) {
    return {
      success: false,
      message: `Connection failed: ${error instanceof Error ? error.message : "Unknown error"} / 连接失败: ${error instanceof Error ? error.message : "未知错误"}`,
    };
  }
}

export async function uploadToS3(
  config: S3SyncConfig,
  options?: S3SyncOptions,
): Promise<SyncResult> {
  return uploadSyncBackup(createS3Adapter(config), options);
}

export async function incrementalUpload(
  config: S3SyncConfig,
  options?: S3SyncOptions,
): Promise<SyncResult> {
  return incrementalUploadSyncBackup(createS3Adapter(config), options);
}

export async function downloadFromS3(
  config: S3SyncConfig,
  options?: S3SyncOptions,
): Promise<SyncResult> {
  return downloadSyncBackup(createS3Adapter(config), options);
}

export async function incrementalDownload(
  config: S3SyncConfig,
  options?: S3SyncOptions,
): Promise<SyncResult> {
  const adapter = createS3Adapter(config);
  return incrementalDownloadSyncBackup(
    adapter,
    options,
    () => downloadSyncBackup(adapter, { ...options, incrementalSync: false }),
  );
}

export async function getRemoteBackupTimestamp(
  config: S3SyncConfig,
): Promise<{ exists: boolean; lastModified?: string }> {
  return getRemoteSyncBackupTimestamp(createS3Adapter(config));
}

export async function autoSync(
  _config: S3SyncConfig,
  _options?: S3SyncOptions,
): Promise<SyncResult> {
  return runDesktopCausalSync("s3");
}
