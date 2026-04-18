import fs from 'node:fs';
import { getMediaDir as runtimeGetMediaDir, type MediaKind } from '../runtime-paths.js';

export type { MediaKind };

export function getMediaDir(userId: string, kind: MediaKind): string {
  return runtimeGetMediaDir(userId, kind);
}

export function ensureMediaDir(userId: string, kind: MediaKind): string {
  const dirPath = getMediaDir(userId, kind);
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}
