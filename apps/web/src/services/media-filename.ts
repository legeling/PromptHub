import path from 'node:path';

const MAX_MEDIA_FILE_NAME_BYTES = 240;

export function normalizeMediaFileName(fileName: string, messagePrefix = 'Invalid filename'): string {
  const safeName = path.basename(fileName);
  if (!fileName || fileName === '.') {
    throw new Error(`${messagePrefix}: file name is required`);
  }
  if (safeName !== fileName || fileName.includes('..')) {
    throw new Error(`${messagePrefix}: path traversal detected`);
  }
  if (fileName.includes('/') || fileName.includes('\\')) {
    throw new Error(`${messagePrefix}: path separator detected`);
  }
  if (fileName.includes(':')) {
    throw new Error(`${messagePrefix}: stream separator detected`);
  }
  if (/[\u0000-\u001F\u007F]/u.test(fileName)) {
    throw new Error(`${messagePrefix}: unsupported control character detected`);
  }
  if (Buffer.byteLength(fileName, 'utf8') > MAX_MEDIA_FILE_NAME_BYTES) {
    throw new Error(`${messagePrefix}: file name is too long`);
  }
  return safeName;
}
