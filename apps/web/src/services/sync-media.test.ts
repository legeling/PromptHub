import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
  'PORT',
  'HOST',
  'JWT_SECRET',
  'JWT_ACCESS_TTL',
  'JWT_REFRESH_TTL',
  'DATA_ROOT',
  'ALLOW_REGISTRATION',
  'LOG_LEVEL',
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function configureTestEnv(dataDir: string): void {
  process.env.PORT = '3998';
  process.env.HOST = '127.0.0.1';
  process.env.JWT_SECRET = 'test-secret-for-web-sync-media-1234567890';
  process.env.JWT_ACCESS_TTL = '900';
  process.env.JWT_REFRESH_TTL = '604800';
  process.env.DATA_ROOT = dataDir;
  process.env.ALLOW_REGISTRATION = 'true';
  process.env.LOG_LEVEL = 'debug';
}

describe('sync media filename normalization', () => {
  let dataDir = '';

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-sync-media-test-'));
    configureTestEnv(dataDir);
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dataDir, { recursive: true, force: true });
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('rejects traversal, path separators, and control characters', async () => {
    const { normalizeSyncMediaFileName } = await import('./sync-media');

    expect(normalizeSyncMediaFileName('safe.png')).toBe('safe.png');
    expect(() => normalizeSyncMediaFileName('')).toThrow(
      'Invalid media filename: ',
    );
    expect(() => normalizeSyncMediaFileName('.')).toThrow(
      'Invalid media filename: .',
    );
    expect(() => normalizeSyncMediaFileName('../escape.png')).toThrow(
      'Invalid media filename: ../escape.png',
    );
    expect(() => normalizeSyncMediaFileName('folder\\escape.png')).toThrow(
      'Invalid media filename: folder\\escape.png',
    );
    expect(() => normalizeSyncMediaFileName('avatar:stream.png')).toThrow(
      'Invalid media filename: avatar:stream.png',
    );
    expect(() => normalizeSyncMediaFileName('bad\u0000name.png')).toThrow(
      'Invalid media filename: bad\u0000name.png',
    );
  });

  it('does not write pulled media files with unsafe names', async () => {
    const { writePulledSyncMedia } = await import('./sync-media');

    expect(() =>
      writePulledSyncMedia('sync-user', {
        images: {
          'safe.png': Buffer.from('safe').toString('base64'),
          'folder\\escape.png': Buffer.from('bad').toString('base64'),
        },
      }),
    ).toThrow('Invalid media filename: folder\\escape.png');

    const imagesDir = path.join(dataDir, 'data', 'assets', 'sync-user', 'images');
    expect(fs.existsSync(path.join(imagesDir, 'safe.png'))).toBe(false);
    expect(fs.existsSync(path.join(imagesDir, 'folder\\escape.png'))).toBe(false);
  });

  it('validates all pulled media names before writing any media kind', async () => {
    const { writePulledSyncMedia } = await import('./sync-media');

    expect(() =>
      writePulledSyncMedia('sync-user', {
        images: {
          'safe.png': Buffer.from('safe').toString('base64'),
        },
        videos: {
          '../escape.mp4': Buffer.from('bad').toString('base64'),
        },
      }),
    ).toThrow('Invalid media filename: ../escape.mp4');

    const assetsDir = path.join(dataDir, 'data', 'assets', 'sync-user');
    expect(fs.existsSync(path.join(assetsDir, 'images', 'safe.png'))).toBe(false);
    expect(fs.existsSync(path.join(assetsDir, 'videos', 'escape.mp4'))).toBe(false);
  });

  it('validates pulled media base64 payloads before writing any media file', async () => {
    const { writePulledSyncMedia } = await import('./sync-media');

    expect(() =>
      writePulledSyncMedia('sync-user', {
        images: {
          'safe.png': Buffer.from('safe').toString('base64'),
        },
        videos: {
          'broken.mp4': 'not valid base64!',
        },
      }),
    ).toThrow('Invalid base64 media payload: broken.mp4');

    const assetsDir = path.join(dataDir, 'data', 'assets', 'sync-user');
    expect(fs.existsSync(path.join(assetsDir, 'images', 'safe.png'))).toBe(false);
    expect(fs.existsSync(path.join(assetsDir, 'videos', 'broken.mp4'))).toBe(false);
  });

  it('does not leave partial files when pulled media writes are interrupted', async () => {
    const { writePulledSyncMedia } = await import('./sync-media');
    const imagesDir = path.join(dataDir, 'data', 'assets', 'sync-user', 'images');
    const imagePath = path.join(imagesDir, 'remote-image.png');
    const originalWriteFileSync = fs.writeFileSync.bind(fs);
    let interrupted = false;
    vi.spyOn(fs, 'writeFileSync').mockImplementation((file, data, options) => {
      const filePath = String(file);
      if (!interrupted && filePath.startsWith(imagesDir)) {
        interrupted = true;
        originalWriteFileSync(file, Buffer.from('partial-sync-media'), options as BufferEncoding);
        throw new Error('simulated interrupted sync media write');
      }

      return originalWriteFileSync(file, data, options as BufferEncoding);
    });

    expect(() =>
      writePulledSyncMedia('sync-user', {
        images: {
          'remote-image.png': Buffer.from('complete-sync-image').toString('base64'),
        },
      }),
    ).toThrow('simulated interrupted sync media write');

    expect(fs.existsSync(imagePath)).toBe(false);
  });
});
