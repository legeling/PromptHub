import { randomUUID } from 'node:crypto';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import { z } from 'zod';
import { getAuthUser } from '../middleware/auth.js';
import { writeFileAtomic } from '../services/atomic-file.js';
import { decodeMediaBase64, MAX_MEDIA_BYTES } from '../services/media-base64.js';
import { normalizeMediaFileName } from '../services/media-filename.js';
import { ensureMediaDir, type MediaKind } from '../services/media-workspace.js';
import { error, ErrorCode, success } from '../utils/response.js';
import { requestRemoteBuffered } from '../utils/remote-http.js';
import { parseJsonBody } from '../utils/validation.js';

const media = new Hono();

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv']);
const MAX_MEDIA_UPLOAD_REQUEST_BYTES = MAX_MEDIA_BYTES + 1024 * 1024;

const remoteDownloadSchema = z.object({
  url: z.string().trim().url('url must be valid'),
});

const base64UploadSchema = z.object({
  fileName: z.string().trim().min(1, 'fileName is required'),
  base64Data: z.string().trim().min(1, 'base64Data is required'),
});

const deleteAllSchema = z.object({
  confirm: z.literal(true),
});

function getAllowedExtensions(kind: MediaKind): Set<string> {
  return kind === 'images' ? IMAGE_EXTENSIONS : VIDEO_EXTENSIONS;
}

function normalizeFileName(fileName: string): string {
  return normalizeMediaFileName(fileName);
}

function isInvalidMediaFileNameError(routeError: unknown): routeError is Error {
  return routeError instanceof Error && routeError.message.startsWith('Invalid filename:');
}

function invalidMediaFileNameResponse(c: Parameters<typeof error>[0], routeError: Error): Response {
  return error(c, 400, ErrorCode.BAD_REQUEST, routeError.message);
}

function assertHttpsRemoteMediaUrl(url: string): void {
  if (new URL(url).protocol !== 'https:') {
    throw new Error('Remote media URL must use HTTPS');
  }
}

function rejectOversizedMediaUploadRequest(c: Parameters<typeof error>[0]): Response | null {
  const contentLength = c.req.header('content-length');
  if (!contentLength) {
    return null;
  }

  const byteLength = Number(contentLength);
  if (!Number.isFinite(byteLength) || byteLength < 0) {
    return error(c, 400, ErrorCode.BAD_REQUEST, 'Invalid Content-Length header');
  }

  if (byteLength > MAX_MEDIA_UPLOAD_REQUEST_BYTES) {
    return error(c, 400, ErrorCode.BAD_REQUEST, 'Media upload request body exceeds size limit');
  }

  return null;
}

function extensionFromContentType(contentType: string | undefined): string | undefined {
  const mimeMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'video/x-msvideo': '.avi',
    'video/x-matroska': '.mkv',
  };

  return contentType
    ? mimeMap[contentType.split(';')[0].trim().toLowerCase()]
    : undefined;
}

function inferExtension(kind: MediaKind, fileName: string, contentType: string | undefined): string {
  const fileExtension = path.extname(fileName).toLowerCase();
  const allowedExtensions = getAllowedExtensions(kind);
  if (allowedExtensions.has(fileExtension)) {
    return fileExtension;
  }

  const mapped = extensionFromContentType(contentType);
  if (mapped && allowedExtensions.has(mapped)) {
    return mapped;
  }

  return kind === 'images' ? '.png' : '.mp4';
}

function inferRemoteExtension(kind: MediaKind, fileName: string, contentType: string | undefined): string {
  const fileExtension = path.extname(fileName).toLowerCase();
  const allowedExtensions = getAllowedExtensions(kind);
  if (allowedExtensions.has(fileExtension)) {
    return fileExtension;
  }

  const mapped = extensionFromContentType(contentType);
  if (mapped && allowedExtensions.has(mapped)) {
    return mapped;
  }

  throw new Error('Unsupported remote media type');
}

function toBlobPart(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  const bytes = new Uint8Array(arrayBuffer);
  bytes.set(buffer);
  return bytes;
}

async function resolveMediaPath(userId: string, kind: MediaKind, fileName: string): Promise<{ fileName: string; filePath: string }> {
  const dirPath = await ensureMediaDir(userId, kind);
  const safeName = normalizeFileName(fileName);
  return {
    fileName: safeName,
    filePath: path.join(dirPath, safeName),
  };
}

async function listMediaFiles(userId: string, kind: MediaKind): Promise<string[]> {
  const dirPath = await ensureMediaDir(userId, kind);
  const allowedExtensions = getAllowedExtensions(kind);
  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) =>
      allowedExtensions.has(path.extname(fileName).toLowerCase()),
    )
    .sort((left, right) => left.localeCompare(right));
}

async function readExistingFile(userId: string, kind: MediaKind, fileName: string): Promise<Buffer | null> {
  try {
    const { filePath } = await resolveMediaPath(userId, kind, fileName);
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return null;
    }
    return await readFile(filePath);
  } catch (routeError) {
    if ((routeError as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw routeError;
  }
}

async function getFileSize(userId: string, kind: MediaKind, fileName: string): Promise<number | null> {
  try {
    const { filePath } = await resolveMediaPath(userId, kind, fileName);
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return null;
    }
    return fileStat.size;
  } catch (routeError) {
    if ((routeError as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw routeError;
  }
}

async function deleteMediaFile(userId: string, kind: MediaKind, fileName: string): Promise<boolean> {
  try {
    const { filePath } = await resolveMediaPath(userId, kind, fileName);
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return false;
    }
    await rm(filePath);
    return true;
  } catch (routeError) {
    if ((routeError as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw routeError;
  }
}

async function saveBase64File(userId: string, kind: MediaKind, payload: z.infer<typeof base64UploadSchema>): Promise<string> {
  normalizeFileName(payload.fileName);

  const contentBuffer = decodeMediaBase64(payload.base64Data);

  const extension = inferExtension(kind, payload.fileName, undefined);
  const fileName = `${randomUUID()}${extension}`;
  const { filePath } = await resolveMediaPath(userId, kind, fileName);
  await writeFileAtomic(filePath, contentBuffer);
  return fileName;
}

async function downloadRemoteFile(userId: string, kind: MediaKind, url: string): Promise<string> {
  assertHttpsRemoteMediaUrl(url);
  const response = await requestRemoteBuffered({
    url,
    method: 'GET',
    allowedProtocols: ['https:'],
    maxBytes: MAX_MEDIA_BYTES,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Failed to download media: HTTP ${response.status}`);
  }

  const extension = inferRemoteExtension(
    kind,
    new URL(response.finalUrl).pathname,
    response.headers['content-type'],
  );
  const fileName = `${randomUUID()}${extension}`;
  const { filePath } = await resolveMediaPath(userId, kind, fileName);
  await writeFileAtomic(filePath, response.body);
  return fileName;
}

async function clearMedia(userId: string, kind: MediaKind): Promise<number> {
  const fileNames = await listMediaFiles(userId, kind);
  let deletedCount = 0;

  for (const fileName of fileNames) {
    try {
      if (await deleteMediaFile(userId, kind, fileName)) {
        deletedCount += 1;
      }
    } catch (routeError) {
      console.warn(`Skipped ${kind} entry during clear: ${fileName}`, routeError);
    }
  }

  return deletedCount;
}

function registerMediaRoutes(kind: MediaKind): void {
  const basePath = `/${kind}`;

  media.get(basePath, async (c) => {
    const actor = getAuthUser(c);
    return success(c, await listMediaFiles(actor.userId, kind));
  });

  media.get(`${basePath}/:filename`, async (c) => {
    const actor = getAuthUser(c);
    const fileName = c.req.param('filename');
    let content: Buffer | null;
    try {
      content = await readExistingFile(actor.userId, kind, fileName);
    } catch (routeError) {
      if (isInvalidMediaFileNameError(routeError)) {
        return invalidMediaFileNameResponse(c, routeError);
      }
      throw routeError;
    }

    if (!content) {
      return error(c, 404, ErrorCode.NOT_FOUND, 'File not found');
    }

    const contentType = kind === 'images'
      ? {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
        }[path.extname(fileName).toLowerCase()] ?? 'application/octet-stream'
      : {
          '.mp4': 'video/mp4',
          '.webm': 'video/webm',
          '.mov': 'video/quicktime',
          '.avi': 'video/x-msvideo',
          '.mkv': 'video/x-matroska',
        }[path.extname(fileName).toLowerCase()] ?? 'application/octet-stream';

    return new Response(new Blob([toBlobPart(content)], { type: contentType }), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(content.length),
      },
    });
  });

  media.delete(`${basePath}/:filename`, async (c) => {
    const actor = getAuthUser(c);
    let deleted: boolean;
    try {
      deleted = await deleteMediaFile(actor.userId, kind, c.req.param('filename'));
    } catch (routeError) {
      if (isInvalidMediaFileNameError(routeError)) {
        return invalidMediaFileNameResponse(c, routeError);
      }
      throw routeError;
    }
    if (!deleted) {
      return error(c, 404, ErrorCode.NOT_FOUND, 'File not found');
    }
    return success(c, { ok: true });
  });

  media.get(`${basePath}/:filename/exists`, async (c) => {
    const actor = getAuthUser(c);
    let exists: boolean;
    try {
      exists = (await readExistingFile(actor.userId, kind, c.req.param('filename'))) !== null;
    } catch (routeError) {
      if (isInvalidMediaFileNameError(routeError)) {
        return invalidMediaFileNameResponse(c, routeError);
      }
      throw routeError;
    }
    return success(c, exists);
  });

  media.get(`${basePath}/:filename/size`, async (c) => {
    const actor = getAuthUser(c);
    let size: number | null;
    try {
      size = await getFileSize(actor.userId, kind, c.req.param('filename'));
    } catch (routeError) {
      if (isInvalidMediaFileNameError(routeError)) {
        return invalidMediaFileNameResponse(c, routeError);
      }
      throw routeError;
    }
    if (size === null) {
      return error(c, 404, ErrorCode.NOT_FOUND, 'File not found');
    }
    return success(c, size);
  });

  media.get(`${basePath}/:filename/base64`, async (c) => {
    const actor = getAuthUser(c);
    let content: Buffer | null;
    try {
      content = await readExistingFile(actor.userId, kind, c.req.param('filename'));
    } catch (routeError) {
      if (isInvalidMediaFileNameError(routeError)) {
        return invalidMediaFileNameResponse(c, routeError);
      }
      throw routeError;
    }
    if (!content) {
      return error(c, 404, ErrorCode.NOT_FOUND, 'File not found');
    }
    return success(c, content.toString('base64'));
  });

  media.post(`${basePath}/download`, async (c) => {
    const parsed = await parseJsonBody(c, remoteDownloadSchema);
    if (!parsed.success) {
      return parsed.response;
    }

    try {
      const actor = getAuthUser(c);
      const fileName = await downloadRemoteFile(actor.userId, kind, parsed.data.url);
      return success(c, fileName, 201);
    } catch (routeError) {
      return error(
        c,
        400,
        ErrorCode.BAD_REQUEST,
        routeError instanceof Error ? routeError.message : 'Failed to download media',
      );
    }
  });

  media.post(`${basePath}/base64`, async (c) => {
    const oversizedResponse = rejectOversizedMediaUploadRequest(c);
    if (oversizedResponse) {
      return oversizedResponse;
    }

    const parsed = await parseJsonBody(c, base64UploadSchema, {
      maxBytes: MAX_MEDIA_UPLOAD_REQUEST_BYTES,
      maxBytesMessage: 'Media upload request body exceeds size limit',
    });
    if (!parsed.success) {
      return parsed.response;
    }

    try {
      const actor = getAuthUser(c);
      const fileName = await saveBase64File(actor.userId, kind, parsed.data);
      return success(c, fileName, 201);
    } catch (routeError) {
      return error(
        c,
        400,
        ErrorCode.BAD_REQUEST,
        routeError instanceof Error ? routeError.message : 'Failed to save media',
      );
    }
  });

  media.delete(basePath, async (c) => {
    const parsed = deleteAllSchema.safeParse({ confirm: c.req.query('confirm') === 'true' });
    if (!parsed.success) {
      return error(c, 422, ErrorCode.VALIDATION_ERROR, 'confirm=true is required');
    }

    const actor = getAuthUser(c);
    const deletedCount = await clearMedia(actor.userId, kind);
    return success(c, { ok: true, deletedCount });
  });
}

registerMediaRoutes('images');
registerMediaRoutes('videos');

media.post('/images', async (c) => error(c, 400, ErrorCode.BAD_REQUEST, 'Use /api/media/images/base64 or /api/media/images/download'));
media.post('/videos', async (c) => error(c, 400, ErrorCode.BAD_REQUEST, 'Use /api/media/videos/base64 or /api/media/videos/download'));

export default media;
