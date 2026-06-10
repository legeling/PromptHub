import { createHash } from 'node:crypto';
import type { SyncSettings } from '@prompthub/shared';
import type { WebBackupPayload } from './backup.service.js';
import { decodeMediaBase64 } from './media-base64.js';
import {
  buildSyncMediaBundle,
  normalizeSyncMediaFileName,
  type SyncMediaFiles,
  type SyncMediaManifest,
} from './sync-media.js';
import {
  mkcolWebDavDirectory,
  pullWebDavFile,
  pushWebDavFile,
  testWebDavConnection,
} from './webdav.server.js';

export const REMOTE_BACKUP_DIR = 'prompthub-backup';
export const REMOTE_BACKUP_DATA_FILE = 'prompthub-backup/data.json';
export const REMOTE_MANIFEST_FILE = 'prompthub-backup/manifest.json';
export const REMOTE_IMAGES_DIR = 'prompthub-backup/images';
export const REMOTE_VIDEOS_DIR = 'prompthub-backup/videos';
export const LEGACY_REMOTE_BACKUP_FILE = 'prompthub-backup.json';
export const LEGACY_REMOTE_BACKUP_COMPAT_FILE = 'prompthub-web-backup.json';

export interface WebDavRemoteManifest {
  version: string;
  createdAt: string;
  updatedAt: string;
  dataHash: string;
  encrypted: boolean;
  images: SyncMediaManifest;
  videos: SyncMediaManifest;
}

export interface WebDavPushResult {
  syncedAt: string;
  remoteFile: string;
}

export interface WebDavPullResult {
  syncedAt: string;
  remoteFile: string;
  body: string;
  images?: SyncMediaFiles;
  videos?: SyncMediaFiles;
}

const LEGACY_REMOTE_BACKUP_FILES = [
  LEGACY_REMOTE_BACKUP_FILE,
  LEGACY_REMOTE_BACKUP_COMPAT_FILE,
] as const;

function isMissingRemoteFile(status: number): boolean {
  return status === 404;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseMediaManifestEntries(
  value: unknown,
  fieldName: 'images' | 'videos',
): SyncMediaManifest {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    throw new Error(`WebDAV manifest is invalid: ${fieldName} must be an object`);
  }

  const entries: SyncMediaManifest = {};
  for (const [fileName, entry] of Object.entries(value)) {
    const safeFileName = normalizeSyncMediaFileName(fileName);
    if (!isRecord(entry)) {
      throw new Error(`WebDAV manifest is invalid: ${fieldName}.${safeFileName} must be an object`);
    }

    if (
      typeof entry.hash !== 'string' ||
      typeof entry.size !== 'number' ||
      typeof entry.uploadedAt !== 'string'
    ) {
      throw new Error(`WebDAV manifest is invalid: ${fieldName}.${safeFileName} is missing required fields`);
    }

    entries[safeFileName] = {
      hash: entry.hash,
      size: entry.size,
      uploadedAt: entry.uploadedAt,
    };
  }

  return entries;
}

function parseRemoteManifest(body: string): WebDavRemoteManifest {
  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(body);
  } catch {
    throw new Error('WebDAV manifest is not valid JSON');
  }

  if (!isRecord(rawManifest)) {
    throw new Error('WebDAV manifest is invalid: expected an object');
  }

  if (
    typeof rawManifest.version !== 'string' ||
    typeof rawManifest.createdAt !== 'string' ||
    typeof rawManifest.dataHash !== 'string'
  ) {
    throw new Error('WebDAV manifest is invalid: missing required fields');
  }

  return {
    version: rawManifest.version,
    createdAt: rawManifest.createdAt,
    updatedAt:
      typeof rawManifest.updatedAt === 'string'
        ? rawManifest.updatedAt
        : rawManifest.createdAt,
    dataHash: rawManifest.dataHash,
    encrypted: rawManifest.encrypted === true,
    images: parseMediaManifestEntries(rawManifest.images, 'images'),
    videos: parseMediaManifestEntries(rawManifest.videos, 'videos'),
  };
}

async function ensureWebDavDirectory(
  settings: SyncSettings & { endpoint: string },
  remoteDir: string,
): Promise<void> {
  const created = await mkcolWebDavDirectory(settings, remoteDir);
  if (!created) {
    throw new Error(`WebDAV directory creation failed for ${remoteDir}`);
  }
}

async function pushWebDavMediaFiles(
  settings: SyncSettings & { endpoint: string },
  remoteDir: string,
  files: SyncMediaFiles | undefined,
  kind: 'image' | 'video',
): Promise<void> {
  if (!files || Object.keys(files).length === 0) {
    return;
  }

  await ensureWebDavDirectory(settings, remoteDir);
  for (const [fileName, base64Data] of Object.entries(files)) {
    const safeFileName = normalizeSyncMediaFileName(fileName);
    const pushed = await pushWebDavFile(settings, `${remoteDir}/${safeFileName}.base64`, base64Data);
    if (!pushed.ok) {
      throw new Error(`WebDAV ${kind} upload failed for ${fileName} with HTTP ${pushed.status}`);
    }
  }
}

function verifyDownloadedMedia(
  fileName: string,
  base64Data: string,
  manifest: SyncMediaManifest[string],
  kind: 'image' | 'video',
): string {
  const payload = base64Data.trim();
  const content = decodeMediaBase64(payload, { label: fileName });
  if (content.length !== manifest.size) {
    throw new Error(`WebDAV ${kind} download failed for ${fileName}: size mismatch`);
  }

  const hash = createHash('sha256').update(payload).digest('hex');
  if (hash !== manifest.hash) {
    throw new Error(`WebDAV ${kind} download failed for ${fileName}: hash mismatch`);
  }

  return payload;
}

function verifyDownloadedData(body: string, manifest: WebDavRemoteManifest): void {
  const hash = createHash('sha256').update(body).digest('hex');
  if (hash !== manifest.dataHash) {
    throw new Error('WebDAV data download failed: data hash mismatch');
  }
}

async function downloadWebDavMediaFiles(
  settings: SyncSettings & { endpoint: string },
  remoteDir: string,
  files: SyncMediaManifest,
  kind: 'image' | 'video',
): Promise<SyncMediaFiles | undefined> {
  const fileNames = Object.keys(files);
  if (fileNames.length === 0) {
    return undefined;
  }

  const mediaFiles: SyncMediaFiles = {};
  for (const fileName of fileNames.sort((left, right) => left.localeCompare(right))) {
    const safeFileName = normalizeSyncMediaFileName(fileName);
    const pulled = await pullWebDavFile(settings, `${remoteDir}/${safeFileName}.base64`);
    if (!pulled.ok) {
      throw new Error(`WebDAV ${kind} download failed for ${fileName} with HTTP ${pulled.status}`);
    }
    mediaFiles[fileName] = verifyDownloadedMedia(safeFileName, pulled.body, files[fileName], kind);
  }

  return mediaFiles;
}

export async function pushWebDavSnapshot(
  userId: string,
  settings: SyncSettings & { endpoint: string },
  payload: WebBackupPayload,
): Promise<WebDavPushResult> {
  const connection = await testWebDavConnection(settings);
  if (!connection.ok) {
    throw new Error(`WebDAV connection failed with HTTP ${connection.status}`);
  }

  await ensureWebDavDirectory(settings, REMOTE_BACKUP_DIR);

  const syncedAt = new Date().toISOString();
  const payloadString = JSON.stringify(payload);
  const dataHash = createHash('sha256').update(payloadString).digest('hex');
  const mediaBundle = buildSyncMediaBundle(userId, payload.prompts, syncedAt);

  await pushWebDavMediaFiles(settings, REMOTE_IMAGES_DIR, mediaBundle.images, 'image');
  await pushWebDavMediaFiles(settings, REMOTE_VIDEOS_DIR, mediaBundle.videos, 'video');

  const pushed = await pushWebDavFile(settings, REMOTE_BACKUP_DATA_FILE, payloadString);
  if (!pushed.ok) {
    throw new Error(`WebDAV upload failed with HTTP ${pushed.status}`);
  }

  const manifest: WebDavRemoteManifest = {
    version: '4.0',
    createdAt: payload.exportedAt,
    updatedAt: syncedAt,
    dataHash,
    encrypted: false,
    images: mediaBundle.imageManifest,
    videos: mediaBundle.videoManifest,
  };
  const manifestPushed = await pushWebDavFile(settings, REMOTE_MANIFEST_FILE, JSON.stringify(manifest));
  if (!manifestPushed.ok) {
    throw new Error(`WebDAV manifest upload failed with HTTP ${manifestPushed.status}`);
  }

  return {
    syncedAt,
    remoteFile: REMOTE_BACKUP_DATA_FILE,
  };
}

export async function pullWebDavSnapshot(
  settings: SyncSettings & { endpoint: string },
): Promise<WebDavPullResult> {
  const pulledPrimary = await pullWebDavFile(settings, REMOTE_BACKUP_DATA_FILE);
  if (pulledPrimary.ok) {
    const manifestResponse = await pullWebDavFile(settings, REMOTE_MANIFEST_FILE);
    if (!manifestResponse.ok) {
      if (isMissingRemoteFile(manifestResponse.status)) {
        throw new Error('WebDAV manifest download failed: manifest.json not found for incremental backup');
      }

      throw new Error(`WebDAV manifest download failed with HTTP ${manifestResponse.status}`);
    }

    let images: SyncMediaFiles | undefined;
    let videos: SyncMediaFiles | undefined;
    const manifest = parseRemoteManifest(manifestResponse.body);
    verifyDownloadedData(pulledPrimary.body, manifest);
    images = await downloadWebDavMediaFiles(settings, REMOTE_IMAGES_DIR, manifest.images, 'image');
    videos = await downloadWebDavMediaFiles(settings, REMOTE_VIDEOS_DIR, manifest.videos, 'video');

    return {
      syncedAt: new Date().toISOString(),
      remoteFile: REMOTE_BACKUP_DATA_FILE,
      body: pulledPrimary.body,
      images,
      videos,
    };
  }

  if (!isMissingRemoteFile(pulledPrimary.status)) {
    throw new Error(`WebDAV download failed with HTTP ${pulledPrimary.status}`);
  }

  for (const legacyFile of LEGACY_REMOTE_BACKUP_FILES) {
    const pulledLegacy = await pullWebDavFile(settings, legacyFile);
    if (pulledLegacy.ok) {
      return {
        syncedAt: new Date().toISOString(),
        remoteFile: legacyFile,
        body: pulledLegacy.body,
      };
    }

    if (!isMissingRemoteFile(pulledLegacy.status)) {
      throw new Error(`WebDAV download failed with HTTP ${pulledLegacy.status}`);
    }
  }

  throw new Error(
    `WebDAV download failed: no backup found at ${REMOTE_BACKUP_DATA_FILE}, ${LEGACY_REMOTE_BACKUP_FILE}, or ${LEGACY_REMOTE_BACKUP_COMPAT_FILE}`,
  );
}
