import type { PromptVersion } from "@prompthub/shared/types";
import { serializeSkillSnapshotTransport, parseSkillSnapshotTransport } from "@prompthub/shared/utils/skill-file-snapshot";

import { getAllFolders, getAllPrompts } from "./database";
import { exportDatabase, restoreFromBackup } from "./database-backup";
import type { DatabaseBackup } from "./database-backup-format";
import {
  getCanonicalSettingsStateSnapshot,
  restoreAiConfigSnapshot,
  restoreSettingsStateSnapshot,
  SENSITIVE_SETTINGS_FIELDS,
} from "./settings-snapshot";
import {
  assertSafeAssetName,
  computeFullHash,
  computeSemanticHash,
  CURRENT_MANIFEST_VERSION,
  deriveImmutableObjectPath,
  LEGACY_MANIFEST_VERSION,
  mediaEntriesMatch,
  parseManifestText,
  validateManifestReferences,
} from "./sync-backup-publication";
import type {
  BackupManifest,
  BackupObjectReference,
  LocalMediaObjects,
} from "./sync-backup-publication";

export {
  CURRENT_MANIFEST_VERSION,
  LEGACY_MANIFEST_VERSION,
} from "./sync-backup-publication";
export type {
  BackupManifest,
  BackupObjectReference,
} from "./sync-backup-publication";

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
    skillsUploaded?: number;
    skillVersionsUploaded?: number;
    skillFilesUploaded?: number;
    skillsDownloaded?: number;
    skipped?: number;
  };
}

export interface BackupData extends Omit<DatabaseBackup, "version"> {
  version: string | number;
}

export interface SyncBackupOptions {
  includeImages?: boolean;
  encryptionPassword?: string;
  incrementalSync?: boolean;
  beforeRestore?: () => Promise<void>;
  rollbackRestore?: () => Promise<void>;
}

class GuardedRestoreError extends Error {
  constructor(
    message: string,
    readonly localChanged: boolean,
  ) {
    super(message);
    this.name = "GuardedRestoreError";
  }
}

async function runGuardedRestore<T>(
  options: SyncBackupOptions | undefined,
  restore: () => Promise<T>,
): Promise<T> {
  await options?.beforeRestore?.();

  try {
    return await restore();
  } catch (error) {
    const restoreMessage =
      error instanceof Error ? error.message : "Unknown restore error";
    if (!options?.rollbackRestore) {
      throw new GuardedRestoreError(restoreMessage, true);
    }

    try {
      await options.rollbackRestore();
    } catch (rollbackError) {
      const rollbackMessage =
        rollbackError instanceof Error
          ? rollbackError.message
          : "Unknown rollback error";
      throw new GuardedRestoreError(
        `Restore failed (${restoreMessage}) and rollback failed (${rollbackMessage})`,
        true,
      );
    }

    throw new GuardedRestoreError(restoreMessage, false);
  }
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

function countSkillFiles(backup: DatabaseBackup): number {
  return Object.values(backup.skillFiles ?? {}).reduce(
    (count, files) => count + files.length,
    0,
  );
}

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

/** v4 compatibility digest; v5 object identities use the full SHA-256 above. */
export async function computeHash(data: string): Promise<string> {
  return (await computeFullHash(data)).substring(0, 16);
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
    promptRelations: fullBackup.promptRelations,
    outputFormatItems: fullBackup.outputFormatItems,
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
    agentManagement: fullBackup.agentManagement,
  };
}

function buildIncrementalCoreData(fullBackup: DatabaseBackup): BackupData {
  return {
    version: "4.0",
    exportedAt: new Date().toISOString(),
    prompts: fullBackup.prompts || [],
    folders: fullBackup.folders || [],
    versions: fullBackup.versions || [],
    promptRelations: fullBackup.promptRelations,
    outputFormatItems: fullBackup.outputFormatItems,
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
    agentManagement: fullBackup.agentManagement,
  };
}

async function serializeLegacyBackup(
  backupData: BackupData,
  encryptionPassword?: string,
): Promise<string> {
  if (!encryptionPassword) {
    return serializeSkillSnapshotTransport(backupData, 2);
  }

  const dataToEncrypt: BackupData = {
    version: backupData.version,
    exportedAt: backupData.exportedAt,
    prompts: backupData.prompts,
    folders: backupData.folders,
    versions: backupData.versions,
    promptRelations: backupData.promptRelations,
    outputFormatItems: backupData.outputFormatItems,
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
    agentManagement: backupData.agentManagement,
  };

  return JSON.stringify({
    encrypted: true,
    data: await encryptData(serializeSkillSnapshotTransport(dataToEncrypt), encryptionPassword),
    images: backupData.images,
    videos: backupData.videos,
  });
}

async function serializeIncrementalCoreData(
  coreData: BackupData,
  encryptionPassword?: string,
): Promise<string> {
  const json = serializeSkillSnapshotTransport(coreData);
  if (!encryptionPassword) {
    return json;
  }

  return JSON.stringify({
    encrypted: true,
    data: await encryptData(json, encryptionPassword),
  });
}

async function parseLegacyBackupPayload(
  rawData: string,
  options?: SyncBackupOptions,
): Promise<{
  data: BackupData & { promptVersions?: PromptVersion[] };
  images?: Record<string, string>;
  videos?: Record<string, string>;
}> {
  const parsed = parseSkillSnapshotTransport(rawData) as BackupData & {
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
        data: parseSkillSnapshotTransport(decrypted) as BackupData & {
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
    return parseSkillSnapshotTransport(rawData) as BackupData & {
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
    return parseSkillSnapshotTransport(decrypted) as BackupData & {
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
    const success = await window.electron?.saveImageBase64?.(fileName, base64);
    if (!success) {
      throw new Error(`Failed to restore image ${fileName}`);
    }
    restoredCount++;
  }

  return restoredCount;
}

type VerifiedMedia = Record<string, string>;

async function downloadAndVerifyMedia(
  entries:
    | Record<
        string,
        { hash: string; size: number; uploadedAt: string; path?: string }
      >
    | undefined,
  resolvePath: (fileName: string) => string,
  downloadText: (path: string) => Promise<RemoteDownloadResult>,
  label: string,
  immutable = false,
): Promise<VerifiedMedia> {
  const verified: VerifiedMedia = {};

  for (const fileName of Object.keys(entries || {})) {
    assertSafeAssetName(fileName);
    const expected = entries?.[fileName];
    const basePath = resolvePath(fileName);
    let path = basePath;
    if (immutable) {
      if (
        !expected?.path ||
        expected.path !== deriveImmutableObjectPath(basePath, expected.hash)
      ) {
        throw new Error(`Unsafe remote path: ${expected?.path || ""}`);
      }
      path = expected.path;
    }
    const result = await downloadText(path);
    if (!result.success && !result.notFound) {
      throw new Error(
        `Failed to download ${label} ${fileName}: ${result.error || "unknown error"}`,
      );
    }
    if (result.notFound || result.data === undefined) {
      throw new Error(`Missing ${label} payload: ${fileName}`);
    }

    const actualHash = await (immutable
      ? computeFullHash(result.data)
      : computeHash(result.data));
    if (actualHash !== expected?.hash) {
      throw new Error(`media hash mismatch: ${label} ${fileName}`);
    }
    if (result.data.length !== expected?.size) {
      throw new Error(`media size mismatch: ${label} ${fileName}`);
    }

    verified[fileName] = result.data;
  }

  return verified;
}

async function restoreVerifiedMedia(
  entries: VerifiedMedia,
  restoreFile: (
    fileName: string,
    base64: string,
  ) => Promise<boolean | undefined>,
  label: string,
): Promise<number> {
  let restoredCount = 0;

  for (const [fileName, base64] of Object.entries(entries)) {
    if (!(await restoreFile(fileName, base64))) {
      throw new Error(`Failed to restore ${label} ${fileName}`);
    }
    restoredCount++;
  }

  return restoredCount;
}

async function restoreSharedSnapshots(data: BackupData): Promise<void> {
  if (data.aiConfig) {
    await restoreAiConfigSnapshot(data.aiConfig);
  }

  if (data.settings) {
    await restoreSettingsStateSnapshot(data.settings, {
      preserveLocalFields: SENSITIVE_SETTINGS_FIELDS,
    });
  }
}

function maxTimestamp(current: Date, value: unknown): Date {
  const candidate =
    typeof value === "number"
      ? new Date(value)
      : typeof value === "string"
        ? new Date(value)
        : null;
  if (!candidate || Number.isNaN(candidate.getTime())) {
    return current;
  }
  return candidate > current ? candidate : current;
}

function getBackupTimestampCandidates(backup: DatabaseBackup): unknown[] {
  const candidates: unknown[] = [
    ...backup.prompts.map((prompt) => prompt.updatedAt),
    ...backup.folders.map((folder) => folder.updatedAt),
    ...backup.versions.map((version) => version.createdAt),
    ...(backup.promptRelations ?? []).map((relation) => relation.updatedAt),
    ...(backup.outputFormatItems ?? []).map((item) => item.updatedAt),
    ...(backup.skills ?? []).map((skill) => skill.updated_at),
    ...(backup.skillVersions ?? []).map((version) => version.createdAt),
    backup.mcpLibrary?.updatedAt,
    backup.pluginLibrary?.updatedAt,
    backup.settingsUpdatedAt,
  ];

  for (const rule of backup.rules ?? []) {
    candidates.push(...rule.versions.map((version) => version.savedAt));
  }

  return candidates;
}

async function getLocalLatestTimestamp(): Promise<Date> {
  const [localPrompts, localFolders, backup] = await Promise.all([
    getAllPrompts(),
    getAllFolders(),
    exportDatabase({ skipVideoContent: true, limitMedia: true }),
  ]);
  let localLatestTime = new Date(0);

  for (const prompt of localPrompts) {
    localLatestTime = maxTimestamp(localLatestTime, prompt.updatedAt);
  }

  for (const folder of localFolders) {
    localLatestTime = maxTimestamp(localLatestTime, folder.updatedAt);
  }

  for (const value of getBackupTimestampCandidates(backup)) {
    localLatestTime = maxTimestamp(localLatestTime, value);
  }

  const settingsSnapshot = await getCanonicalSettingsStateSnapshot();
  if (settingsSnapshot?.settingsUpdatedAt) {
    localLatestTime = maxTimestamp(
      localLatestTime,
      settingsSnapshot.settingsUpdatedAt,
    );
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

    const imagesRestored = await runGuardedRestore(options, async () => {
      await restoreFromBackup({
        version: toVersionNumber(data.version),
        exportedAt: data.exportedAt,
        prompts: data.prompts,
        folders: data.folders,
        versions: getBackupVersions(data),
        promptRelations: data.promptRelations,
        outputFormatItems: data.outputFormatItems,
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
        agentManagement: data.agentManagement,
      });

      const restored =
        images && Object.keys(images).length > 0
          ? await restoreImages(images)
          : 0;
      await restoreSharedSnapshots(data);
      return restored;
    });

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
      localChanged:
        error instanceof GuardedRestoreError ? error.localChanged : false,
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
    const skillsCount = fullBackup.skills?.length || 0;
    const skillVersionsCount = fullBackup.skillVersions?.length || 0;
    const skillFilesCount = countSkillFiles(fullBackup);

    return {
      success: true,
      message: `Upload successful (${promptsCount} prompts, ${versionsCount} versions, ${skillsCount} skills, ${skillVersionsCount} skill versions, ${skillFilesCount} skill files, ${imagesCount} images, ${videosCount} videos) / 上传成功 (${promptsCount} 条 Prompt, ${versionsCount} 个 Prompt 版本, ${skillsCount} 个 Skill, ${skillVersionsCount} 个 Skill 版本, ${skillFilesCount} 个 Skill 文件, ${imagesCount} 张图片, ${videosCount} 个视频)`,
      timestamp: new Date().toISOString(),
      localChanged: false,
      details: {
        promptsUploaded: promptsCount,
        skillsUploaded: skillsCount,
        skillVersionsUploaded: skillVersionsCount,
        skillFilesUploaded: skillFilesCount,
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

async function readRemoteManifest(
  adapter: RemoteSyncAdapter,
): Promise<BackupManifest | null> {
  const result = await adapter.downloadText(adapter.paths.manifest);
  if (result.notFound) {
    return null;
  }
  if (!result.success || result.data === undefined) {
    throw new Error(
      createFailureMessage(
        "Failed to read remote manifest",
        "读取远程 manifest 失败",
        result.error,
      ),
    );
  }

  const manifest = parseManifestText(result.data);
  validateManifestReferences(adapter.paths, manifest);
  return manifest;
}

interface RemoteIncrementalSnapshot {
  coreData: BackupData & { promptVersions?: PromptVersion[] };
  semanticHash: string;
}

async function readRemoteIncrementalSnapshot(
  adapter: RemoteSyncAdapter,
  manifest: BackupManifest,
  options?: SyncBackupOptions,
): Promise<RemoteIncrementalSnapshot> {
  const dataPath =
    manifest.version === CURRENT_MANIFEST_VERSION
      ? manifest.data?.path
      : adapter.paths.data;
  const result = await adapter.downloadText(dataPath || adapter.paths.data);
  if (!result.success && !result.notFound) {
    throw new Error(
      createFailureMessage(
        "Failed to download data file",
        "下载数据文件失败",
        result.error,
      ),
    );
  }
  if (result.notFound || result.data === undefined) {
    throw new Error("Missing data file / 远程数据文件缺失");
  }

  const expectedHash =
    manifest.version === CURRENT_MANIFEST_VERSION
      ? manifest.data?.hash
      : manifest.dataHash;
  const actualHash = await (manifest.version === CURRENT_MANIFEST_VERSION
    ? computeFullHash(result.data)
    : computeHash(result.data));
  if (!expectedHash || actualHash !== expectedHash) {
    throw new Error("Incremental data hash mismatch");
  }
  if (
    manifest.version === CURRENT_MANIFEST_VERSION &&
    manifest.data &&
    result.data.length !== manifest.data.size
  ) {
    throw new Error("Incremental data size mismatch");
  }

  const coreData = await parseIncrementalCorePayload(
    result.data,
    manifest,
    options,
  );
  const semanticHash = await computeSemanticHash(coreData);
  if (
    manifest.version === CURRENT_MANIFEST_VERSION &&
    !manifest.encrypted &&
    semanticHash !== manifest.semanticHash
  ) {
    throw new Error("Incremental semantic hash mismatch");
  }
  return { coreData, semanticHash };
}

async function collectLocalImages(
  fullBackup: DatabaseBackup,
): Promise<LocalMediaObjects> {
  const media: LocalMediaObjects = {};
  for (const [fileName, content] of Object.entries(fullBackup.images || {})) {
    assertSafeAssetName(fileName);
    if (typeof content !== "string") {
      throw new Error(`Invalid image payload: ${fileName}`);
    }
    media[fileName] = {
      content,
      hash: await computeFullHash(content),
      size: content.length,
    };
  }
  return media;
}

async function collectLocalVideos(
  fullBackup: DatabaseBackup,
): Promise<LocalMediaObjects> {
  const media: LocalMediaObjects = {};
  const videoFiles = new Set<string>();
  for (const prompt of fullBackup.prompts || []) {
    for (const fileName of prompt.videos || []) {
      assertSafeAssetName(fileName);
      videoFiles.add(fileName);
    }
  }

  for (const fileName of videoFiles) {
    const content = await window.electron?.readVideoBase64?.(fileName);
    if (!content) {
      throw new Error(`Missing local video payload: ${fileName}`);
    }
    media[fileName] = {
      content,
      hash: await computeFullHash(content),
      size: content.length,
    };
  }
  return media;
}

async function publishMediaObjects(
  adapter: RemoteSyncAdapter,
  local: LocalMediaObjects,
  remote: BackupManifest["images"] | undefined,
  resolvePath: (fileName: string) => string,
  label: string,
  allowReuse: boolean,
): Promise<{
  entries: BackupManifest["images"];
  uploaded: number;
  skipped: number;
}> {
  const entries: BackupManifest["images"] = {};
  let uploaded = 0;
  let skipped = 0;

  for (const [fileName, media] of Object.entries(local)) {
    const existing = remote?.[fileName];
    if (
      allowReuse &&
      existing?.path &&
      existing.hash === media.hash &&
      Number(existing.size) === media.size &&
      existing.path ===
        deriveImmutableObjectPath(resolvePath(fileName), media.hash)
    ) {
      entries[fileName] = existing;
      skipped++;
      continue;
    }

    const path = deriveImmutableObjectPath(resolvePath(fileName), media.hash);
    const uploadResult = await adapter.uploadText(path, media.content);
    if (!uploadResult.success) {
      throw new Error(
        createFailureMessage(
          `Failed to upload ${label} file`,
          `上传${label}文件失败`,
          uploadResult.error,
        ),
      );
    }
    entries[fileName] = {
      path,
      hash: media.hash,
      size: media.size,
      uploadedAt: new Date().toISOString(),
    };
    uploaded++;
  }

  return { entries, uploaded, skipped };
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
    const semanticHash = await computeSemanticHash(coreData);
    const dataString = await serializeIncrementalCoreData(
      coreData,
      options?.encryptionPassword,
    );
    const dataHash = await computeFullHash(dataString);

    const localImages = includeMedia
      ? await collectLocalImages(fullBackup)
      : {};
    const localVideos = includeMedia
      ? await collectLocalVideos(fullBackup)
      : {};
    const remoteManifest = await readRemoteManifest(adapter);
    const remoteSnapshot = remoteManifest
      ? await readRemoteIncrementalSnapshot(adapter, remoteManifest, options)
      : null;
    if (remoteManifest?.version === CURRENT_MANIFEST_VERSION) {
      await downloadAndVerifyMedia(
        remoteManifest.images,
        adapter.paths.image,
        adapter.downloadText,
        "remote media image",
        true,
      );
      await downloadAndVerifyMedia(
        remoteManifest.videos,
        adapter.paths.video,
        adapter.downloadText,
        "remote media video",
        true,
      );
    }
    const encrypted = Boolean(options?.encryptionPassword);
    const sameEncryption = remoteManifest?.encrypted === encrypted;
    const mediaUnchanged =
      !includeMedia ||
      (remoteManifest !== null &&
        mediaEntriesMatch(
          localImages,
          remoteManifest.images,
          remoteManifest.version === LEGACY_MANIFEST_VERSION,
        ) &&
        mediaEntriesMatch(
          localVideos,
          remoteManifest.videos,
          remoteManifest.version === LEGACY_MANIFEST_VERSION,
        ));
    const semanticUnchanged =
      sameEncryption &&
      remoteSnapshot !== null &&
      remoteSnapshot.semanticHash === semanticHash;

    if (remoteManifest && semanticUnchanged && mediaUnchanged) {
      return createNoopSyncResult(
        1 + Object.keys(localImages).length + Object.keys(localVideos).length,
      );
    }

    let skippedCount = 0;
    let dataReference: BackupObjectReference;
    const reusableData =
      remoteManifest?.version === CURRENT_MANIFEST_VERSION && semanticUnchanged
        ? remoteManifest.data
        : undefined;
    if (reusableData) {
      dataReference = reusableData;
      skippedCount++;
    } else {
      const dataPath = deriveImmutableObjectPath(adapter.paths.data, dataHash);
      const uploadResult = await adapter.uploadText(dataPath, dataString);
      if (!uploadResult.success) {
        throw new Error(
          createFailureMessage(
            "Failed to upload data file",
            "上传数据文件失败",
            uploadResult.error,
          ),
        );
      }
      dataReference = {
        path: dataPath,
        hash: dataHash,
        size: dataString.length,
        uploadedAt: new Date().toISOString(),
      };
    }

    const imageResult = includeMedia
      ? await publishMediaObjects(
          adapter,
          localImages,
          remoteManifest?.images,
          adapter.paths.image,
          "image",
          remoteManifest?.version === CURRENT_MANIFEST_VERSION,
        )
      : {
          entries:
            remoteManifest?.version === CURRENT_MANIFEST_VERSION
              ? remoteManifest.images
              : {},
          uploaded: 0,
          skipped: 0,
        };
    const videoResult = includeMedia
      ? await publishMediaObjects(
          adapter,
          localVideos,
          remoteManifest?.videos,
          adapter.paths.video,
          "video",
          remoteManifest?.version === CURRENT_MANIFEST_VERSION,
        )
      : {
          entries:
            remoteManifest?.version === CURRENT_MANIFEST_VERSION
              ? remoteManifest.videos
              : {},
          uploaded: 0,
          skipped: 0,
        };
    skippedCount += imageResult.skipped + videoResult.skipped;

    const newManifest: BackupManifest = {
      version: CURRENT_MANIFEST_VERSION,
      createdAt: remoteManifest?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dataHash: dataReference.hash,
      data: dataReference,
      semanticHash: encrypted ? undefined : semanticHash,
      images: imageResult.entries,
      videos: videoResult.entries,
      encrypted,
    };

    const manifestUploadResult = await adapter.uploadText(
      adapter.paths.manifest,
      JSON.stringify(newManifest, null, 2),
    );
    if (!manifestUploadResult.success) {
      throw new Error(
        createFailureMessage(
          "Failed to upload manifest",
          "上传 manifest 失败",
          manifestUploadResult.error,
        ),
      );
    }

    const imagesUploaded = imageResult.uploaded;
    const videosUploaded = videoResult.uploaded;
    const totalImages = Object.keys(imageResult.entries).length;
    const totalVideos = Object.keys(videoResult.entries).length;
    const skillsCount = fullBackup.skills?.length || 0;
    const skillVersionsCount = fullBackup.skillVersions?.length || 0;
    const skillFilesCount = countSkillFiles(fullBackup);

    return {
      success: true,
      message: `Incremental upload completed (${fullBackup.prompts.length} prompts, ${fullBackup.versions?.length || 0} versions, ${skillsCount} skills, ${skillVersionsCount} skill versions, ${skillFilesCount} skill files, ${imagesUploaded}/${totalImages} images updated, ${videosUploaded}/${totalVideos} videos updated, ${skippedCount} files skipped) / 增量上传完成 (${fullBackup.prompts.length} 条 Prompt, ${fullBackup.versions?.length || 0} 个 Prompt 版本, ${skillsCount} 个 Skill, ${skillVersionsCount} 个 Skill 版本, ${skillFilesCount} 个 Skill 文件, ${imagesUploaded}/${totalImages} 张图片更新, ${videosUploaded}/${totalVideos} 个视频更新, ${skippedCount} 个文件跳过)`,
      timestamp: new Date().toISOString(),
      localChanged: false,
      details: {
        promptsUploaded: fullBackup.prompts.length,
        skillsUploaded: skillsCount,
        skillVersionsUploaded: skillVersionsCount,
        skillFilesUploaded: skillFilesCount,
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
      if (manifestResult.notFound) {
        return fallbackToLegacy();
      }
      if (!manifestResult.success || manifestResult.data === undefined) {
        return {
          success: false,
          message: createFailureMessage(
            "Failed to read remote manifest",
            "读取远程 manifest 失败",
            manifestResult.error,
          ),
        };
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

    try {
      validateManifestReferences(adapter.paths, manifest);
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Invalid manifest",
      };
    }

    const dataPath =
      manifest.version === CURRENT_MANIFEST_VERSION
        ? manifest.data?.path
        : adapter.paths.data;
    const dataResult = await adapter.downloadText(
      dataPath || adapter.paths.data,
    );
    if (!dataResult.success && !dataResult.notFound) {
      return {
        success: false,
        message: createFailureMessage(
          "Failed to download data file",
          "下载数据文件失败",
          dataResult.error,
        ),
      };
    }
    if (dataResult.notFound || dataResult.data === undefined) {
      return {
        success: false,
        message: createFailureMessage(
          "Failed to download data file",
          "下载数据文件失败",
          dataResult.error,
        ),
      };
    }

    const actualDataHash = await (manifest.version === CURRENT_MANIFEST_VERSION
      ? computeFullHash(dataResult.data)
      : computeHash(dataResult.data));
    const expectedDataHash =
      manifest.version === CURRENT_MANIFEST_VERSION
        ? manifest.data?.hash
        : manifest.dataHash;
    if (actualDataHash !== expectedDataHash) {
      throw new Error("Incremental data hash mismatch");
    }
    if (
      manifest.version === CURRENT_MANIFEST_VERSION &&
      manifest.data &&
      dataResult.data.length !== manifest.data.size
    ) {
      throw new Error("Incremental data size mismatch");
    }

    const coreData = await parseIncrementalCorePayload(
      dataResult.data,
      manifest,
      options,
    );
    if (
      manifest.version === CURRENT_MANIFEST_VERSION &&
      !manifest.encrypted &&
      (await computeSemanticHash(coreData)) !== manifest.semanticHash
    ) {
      throw new Error("Incremental semantic hash mismatch");
    }

    const verifiedImages = await downloadAndVerifyMedia(
      manifest.images,
      adapter.paths.image,
      adapter.downloadText,
      "media image",
      manifest.version === CURRENT_MANIFEST_VERSION,
    );
    const verifiedVideos = await downloadAndVerifyMedia(
      manifest.videos,
      adapter.paths.video,
      adapter.downloadText,
      "media video",
      manifest.version === CURRENT_MANIFEST_VERSION,
    );

    const { imagesDownloaded, videosDownloaded } = await runGuardedRestore(
      options,
      async () => {
        await restoreFromBackup({
          version: toVersionNumber(coreData.version),
          exportedAt: coreData.exportedAt,
          prompts: coreData.prompts,
          folders: coreData.folders,
          versions: getBackupVersions(coreData),
          promptRelations: coreData.promptRelations,
          outputFormatItems: coreData.outputFormatItems,
          rules: coreData.rules,
          skills: coreData.skills,
          skillVersions: coreData.skillVersions,
          skillFiles: coreData.skillFiles,
          mcpLibrary: coreData.mcpLibrary,
          pluginLibrary: coreData.pluginLibrary,
          pluginPackages: coreData.pluginPackages,
          storeSources: coreData.storeSources,
          agentAssetFiles: coreData.agentAssetFiles,
          agentManagement: coreData.agentManagement,
        });

        const restoredImages = await restoreVerifiedMedia(
          verifiedImages,
          async (fileName, base64) =>
            window.electron?.saveImageBase64?.(fileName, base64),
          "image",
        );
        const restoredVideos = await restoreVerifiedMedia(
          verifiedVideos,
          async (fileName, base64) =>
            window.electron?.saveVideoBase64?.(fileName, base64),
          "video",
        );
        await restoreSharedSnapshots(coreData);
        return {
          imagesDownloaded: restoredImages,
          videosDownloaded: restoredVideos,
        };
      },
    );

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
      localChanged:
        error instanceof GuardedRestoreError ? error.localChanged : false,
    };
  }
}

export async function downloadSyncBackup(
  adapter: RemoteSyncAdapter,
  options?: SyncBackupOptions,
): Promise<SyncResult> {
  if (isIncrementalSyncEnabled(options)) {
    const manifestResult = await adapter.downloadText(adapter.paths.manifest);
    if (manifestResult.success && manifestResult.data !== undefined) {
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
    if (!manifestResult.notFound) {
      return {
        success: false,
        message: createFailureMessage(
          "Failed to read remote manifest",
          "读取远程 manifest 失败",
          manifestResult.error,
        ),
      };
    }
  }

  return downloadLegacySyncBackup(adapter, options);
}

export async function getRemoteSyncBackupTimestamp(
  adapter: RemoteSyncAdapter,
  options?: SyncBackupOptions,
): Promise<{ exists: boolean; lastModified?: string }> {
  for (const path of getTimestampCandidates(adapter, options)) {
    if (adapter.stat) {
      const statResult = await adapter.stat(path);
      if (statResult.exists) {
        return statResult;
      }
    }

    const downloadResult = await adapter.downloadText(path);
    if (downloadResult.notFound) {
      continue;
    }
    if (!downloadResult.success || downloadResult.data === undefined) {
      throw new Error(
        createFailureMessage(
          "Failed to read remote backup",
          "读取远程备份失败",
          downloadResult.error,
        ),
      );
    }

    if (path === adapter.paths.manifest) {
      const manifest = parseManifestText(downloadResult.data);
        validateManifestReferences(adapter.paths, manifest);
      return {
        exists: true,
        lastModified: manifest.updatedAt,
      };
    }

    const { data } = await parseLegacyBackupPayload(
      downloadResult.data,
      options,
    );
    return {
      exists: true,
      lastModified: data.exportedAt,
    };
  }

  return { exists: false };
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
