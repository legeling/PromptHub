import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Prompt } from '@prompthub/shared';
import { writeFileAtomicSync } from './atomic-file-sync.js';
import { decodeMediaBase64 } from './media-base64.js';
import { normalizeMediaFileName } from './media-filename.js';
import { ensureMediaDir, type MediaKind } from './media-workspace.js';

export interface SyncMediaManifestEntry {
  hash: string;
  size: number;
  uploadedAt: string;
}

export type SyncMediaFiles = Record<string, string>;
export type SyncMediaManifest = Record<string, SyncMediaManifestEntry>;

export interface SyncMediaBundle {
  images?: SyncMediaFiles;
  videos?: SyncMediaFiles;
  imageManifest: SyncMediaManifest;
  videoManifest: SyncMediaManifest;
}

export function normalizeSyncMediaFileName(fileName: string): string {
  try {
    return normalizeMediaFileName(fileName, 'Invalid media filename');
  } catch {
    throw new Error(`Invalid media filename: ${fileName}`);
  }
}

function collectReferencedMedia(
  prompts: Pick<Prompt, 'images' | 'videos'>[],
  kind: MediaKind,
): string[] {
  const fileNames = new Set<string>();
  const key = kind === 'images' ? 'images' : 'videos';

  for (const prompt of prompts) {
    for (const fileName of prompt[key] ?? []) {
      fileNames.add(normalizeSyncMediaFileName(fileName));
    }
  }

  return Array.from(fileNames).sort((left, right) => left.localeCompare(right));
}

function buildKindBundle(
  userId: string,
  prompts: Pick<Prompt, 'images' | 'videos'>[],
  kind: MediaKind,
  uploadedAt: string,
): { files?: SyncMediaFiles; manifest: SyncMediaManifest } {
  const dirPath = ensureMediaDir(userId, kind);
  const fileNames = collectReferencedMedia(prompts, kind);
  const files: SyncMediaFiles = {};
  const manifest: SyncMediaManifest = {};
  const label = kind === 'images' ? 'image' : 'video';

  for (const fileName of fileNames) {
    const filePath = path.join(dirPath, fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Referenced ${label} file is missing: ${fileName}`);
    }

    const content = fs.readFileSync(filePath);
    const base64Data = content.toString('base64');

    files[fileName] = base64Data;
    manifest[fileName] = {
      hash: createHash('sha256').update(base64Data).digest('hex'),
      size: content.length,
      uploadedAt,
    };
  }

  return {
    files: Object.keys(files).length > 0 ? files : undefined,
    manifest,
  };
}

export function buildSyncMediaBundle(
  userId: string,
  prompts: Pick<Prompt, 'images' | 'videos'>[],
  uploadedAt: string,
): SyncMediaBundle {
  const images = buildKindBundle(userId, prompts, 'images', uploadedAt);
  const videos = buildKindBundle(userId, prompts, 'videos', uploadedAt);

  return {
    images: images.files,
    videos: videos.files,
    imageManifest: images.manifest,
    videoManifest: videos.manifest,
  };
}

export function getMediaBase64Map(
  userId: string,
  prompts: Pick<Prompt, 'images' | 'videos'>[],
): { images?: SyncMediaFiles; videos?: SyncMediaFiles } {
  const images = buildKindBundle(userId, prompts, 'images', new Date().toISOString()).files;
  const videos = buildKindBundle(userId, prompts, 'videos', new Date().toISOString()).files;

  return {
    images,
    videos,
  };
}

type NormalizedSyncMediaEntry = [fileName: string, content: Buffer];
interface SyncMediaWriteEntry {
  kind: MediaKind;
  fileName: string;
  content: Buffer;
}

interface SyncMediaRollbackEntry {
  filePath: string;
  previousContent: Buffer | null;
}

function normalizeSyncMediaEntries(files: SyncMediaFiles | undefined): NormalizedSyncMediaEntry[] {
  if (!files) {
    return [];
  }

  return Object.entries(files).map(([fileName, base64Data]) => {
    const safeName = normalizeSyncMediaFileName(fileName);
    return [safeName, decodeMediaBase64(base64Data, { label: safeName })];
  });
}

function toSyncMediaWriteEntries(
  kind: MediaKind,
  entries: NormalizedSyncMediaEntry[],
): SyncMediaWriteEntry[] {
  return entries.map(([fileName, content]) => ({
    kind,
    fileName,
    content,
  }));
}

function rollbackSyncMediaWrites(writtenEntries: SyncMediaRollbackEntry[]): void {
  for (const entry of [...writtenEntries].reverse()) {
    if (entry.previousContent) {
      writeFileAtomicSync(entry.filePath, entry.previousContent);
      continue;
    }

    fs.rmSync(entry.filePath, { force: true });
  }
}

function writeSyncMediaEntries(
  userId: string,
  entries: SyncMediaWriteEntry[],
): SyncMediaRollbackEntry[] {
  if (entries.length === 0) {
    return [];
  }

  const writtenEntries: SyncMediaRollbackEntry[] = [];
  try {
    for (const entry of entries) {
      const dirPath = ensureMediaDir(userId, entry.kind);
      const filePath = path.join(dirPath, entry.fileName);
      const previousContent = fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
      writeFileAtomicSync(filePath, entry.content);
      writtenEntries.push({ filePath, previousContent });
    }
    return writtenEntries;
  } catch (writeError) {
    rollbackSyncMediaWrites(writtenEntries);
    throw writeError;
  }
}

export function writePulledSyncMedia(
  userId: string,
  media: { images?: SyncMediaFiles; videos?: SyncMediaFiles },
): () => void {
  const images = normalizeSyncMediaEntries(media.images);
  const videos = normalizeSyncMediaEntries(media.videos);

  const writtenEntries = writeSyncMediaEntries(userId, [
    ...toSyncMediaWriteEntries('images', images),
    ...toSyncMediaWriteEntries('videos', videos),
  ]);

  return () => rollbackSyncMediaWrites(writtenEntries);
}

export function validatePulledSyncMedia(media: { images?: SyncMediaFiles; videos?: SyncMediaFiles }): void {
  normalizeSyncMediaEntries(media.images);
  normalizeSyncMediaEntries(media.videos);
}
