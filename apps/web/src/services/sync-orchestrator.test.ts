import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebBackupPayload } from './backup.service.js';

vi.mock('./webdav.server.js', () => ({
  mkcolWebDavDirectory: vi.fn(),
  pullWebDavFile: vi.fn(),
  pushWebDavFile: vi.fn(),
  testWebDavConnection: vi.fn(),
}));

vi.mock('./sync-media.js', async () => {
  const actual = await vi.importActual<typeof import('./sync-media.js')>('./sync-media.js');
  return {
    ...actual,
    buildSyncMediaBundle: vi.fn(() => ({
      images: { 'cover.png': 'aW1hZ2UtZGF0YQ==' },
      videos: { 'clip.mp4': 'dmlkZW8tZGF0YQ==' },
      imageManifest: {
        'cover.png': { hash: 'img-hash', size: 10, uploadedAt: '2026-05-10T00:00:00.000Z' },
      },
      videoManifest: {
        'clip.mp4': { hash: 'vid-hash', size: 20, uploadedAt: '2026-05-10T00:00:00.000Z' },
      },
    })),
  };
});

import {
  LEGACY_REMOTE_BACKUP_COMPAT_FILE,
  LEGACY_REMOTE_BACKUP_FILE,
  REMOTE_BACKUP_DATA_FILE,
  REMOTE_IMAGES_DIR,
  REMOTE_MANIFEST_FILE,
  REMOTE_VIDEOS_DIR,
  pullWebDavSnapshot,
  pushWebDavSnapshot,
} from './sync-orchestrator.js';

import {
  mkcolWebDavDirectory,
  pullWebDavFile,
  pushWebDavFile,
  testWebDavConnection,
} from './webdav.server.js';

function mediaManifestEntry(base64Data: string, uploadedAt = '2026-05-10T00:00:00.000Z') {
  return {
    hash: createHash('sha256').update(base64Data).digest('hex'),
    size: Buffer.from(base64Data, 'base64').length,
    uploadedAt,
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('sync-orchestrator', () => {
  const config = {
    enabled: true,
    provider: 'webdav' as const,
    endpoint: 'https://dav.example.com/backup',
    username: 'alice',
    password: 'secret',
  };
  const payload: WebBackupPayload = {
    version: 'web-backup-v2',
    exportedAt: '2026-05-10T00:00:00.000Z',
    prompts: [
      {
        id: 'prompt-1',
        title: 'Prompt',
        userPrompt: 'Body',
        variables: [],
        tags: [],
        images: ['cover.png'],
        videos: ['clip.mp4'],
        isFavorite: false,
        isPinned: false,
        version: 1,
        currentVersion: 1,
        usageCount: 0,
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T00:00:00.000Z',
      },
    ],
    promptVersions: [],
    versions: [],
    folders: [],
    rules: [],
    skills: [],
    skillVersions: [],
    settings: { theme: 'dark', language: 'en', autoSave: true },
    settingsUpdatedAt: '2026-05-10T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pushes snapshot, manifest, and media to WebDAV', async () => {
    vi.mocked(testWebDavConnection).mockResolvedValue({ ok: true, status: 207 });
    vi.mocked(mkcolWebDavDirectory).mockResolvedValue(true);
    vi.mocked(pushWebDavFile).mockResolvedValue({ ok: true, status: 201 });

    const result = await pushWebDavSnapshot('user-1', config, payload);

    expect(testWebDavConnection).toHaveBeenCalledWith(config);
    expect(mkcolWebDavDirectory).toHaveBeenCalledWith(config, 'prompthub-backup');
    expect(mkcolWebDavDirectory).toHaveBeenCalledWith(config, REMOTE_IMAGES_DIR);
    expect(mkcolWebDavDirectory).toHaveBeenCalledWith(config, REMOTE_VIDEOS_DIR);
    expect(pushWebDavFile).toHaveBeenCalledWith(config, REMOTE_BACKUP_DATA_FILE, JSON.stringify(payload));
    expect(pushWebDavFile).toHaveBeenCalledWith(
      config,
      `${REMOTE_IMAGES_DIR}/cover.png.base64`,
      'aW1hZ2UtZGF0YQ==',
    );
    expect(pushWebDavFile).toHaveBeenCalledWith(
      config,
      `${REMOTE_VIDEOS_DIR}/clip.mp4.base64`,
      'dmlkZW8tZGF0YQ==',
    );
    expect(pushWebDavFile).toHaveBeenCalledWith(
      config,
      REMOTE_MANIFEST_FILE,
      expect.stringContaining('"dataHash":"'),
    );
    expect(result.remoteFile).toBe(REMOTE_BACKUP_DATA_FILE);
  });

  it('throws when manifest upload fails', async () => {
    vi.mocked(testWebDavConnection).mockResolvedValue({ ok: true, status: 207 });
    vi.mocked(mkcolWebDavDirectory).mockResolvedValue(true);
    vi.mocked(pushWebDavFile)
      .mockResolvedValueOnce({ ok: true, status: 201 })
      .mockResolvedValueOnce({ ok: true, status: 201 })
      .mockResolvedValueOnce({ ok: true, status: 201 })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(pushWebDavSnapshot('user-1', config, payload)).rejects.toThrow(
      'WebDAV manifest upload failed with HTTP 500',
    );
  });

  it('does not upload data.json when media upload fails', async () => {
    vi.mocked(testWebDavConnection).mockResolvedValue({ ok: true, status: 207 });
    vi.mocked(mkcolWebDavDirectory).mockResolvedValue(true);
    vi.mocked(pushWebDavFile).mockImplementation(async (_settings, fileName) => ({
      ok: !String(fileName).includes('/images/'),
      status: String(fileName).includes('/images/') ? 500 : 201,
    }));

    await expect(pushWebDavSnapshot('user-1', config, payload)).rejects.toThrow(
      'WebDAV image upload failed for cover.png with HTTP 500',
    );

    expect(pushWebDavFile).not.toHaveBeenCalledWith(
      config,
      REMOTE_BACKUP_DATA_FILE,
      expect.any(String),
    );
    expect(pushWebDavFile).not.toHaveBeenCalledWith(
      config,
      REMOTE_MANIFEST_FILE,
      expect.any(String),
    );
  });

  it('throws when connection check fails', async () => {
    vi.mocked(testWebDavConnection).mockResolvedValue({ ok: false, status: 401 });

    await expect(pushWebDavSnapshot('user-1', config, payload)).rejects.toThrow(
      'WebDAV connection failed with HTTP 401',
    );
  });

  it('pulls from primary file first and downloads media from manifest', async () => {
    const dataJson = '{"version":"web-backup-v2"}';
    const imageBase64 = 'aW1hZ2UtZGF0YQ==';
    const videoBase64 = 'dmlkZW8tZGF0YQ==';

    vi.mocked(pullWebDavFile)
      .mockResolvedValueOnce({ ok: true, status: 200, body: dataJson })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: JSON.stringify({
          version: '4.0',
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
          dataHash: sha256(dataJson),
          encrypted: false,
          images: { 'cover.png': mediaManifestEntry(imageBase64) },
          videos: { 'clip.mp4': mediaManifestEntry(videoBase64) },
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, body: imageBase64 })
      .mockResolvedValueOnce({ ok: true, status: 200, body: videoBase64 });

    const result = await pullWebDavSnapshot(config);

    expect(pullWebDavFile).toHaveBeenCalledWith(config, REMOTE_BACKUP_DATA_FILE);
    expect(result.remoteFile).toBe(REMOTE_BACKUP_DATA_FILE);
    expect(result.body).toContain('web-backup-v2');
    expect(result.images).toEqual({ 'cover.png': 'aW1hZ2UtZGF0YQ==' });
    expect(result.videos).toEqual({ 'clip.mp4': 'dmlkZW8tZGF0YQ==' });
  });

  it('throws when primary data does not match the manifest data hash', async () => {
    vi.mocked(pullWebDavFile)
      .mockResolvedValueOnce({ ok: true, status: 200, body: '{"version":"tampered"}' })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: JSON.stringify({
          version: '4.0',
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
          dataHash: sha256('{"version":"expected"}'),
          encrypted: false,
          images: {},
          videos: {},
        }),
      });

    await expect(pullWebDavSnapshot(config)).rejects.toThrow(
      'WebDAV data download failed: data hash mismatch',
    );
  });

  it('throws when downloaded media does not match the manifest hash', async () => {
    const dataJson = '{"version":"web-backup-v2"}';
    const expectedBase64 = Buffer.from('expected-image').toString('base64');
    const tamperedBase64 = Buffer.from('tampered-image').toString('base64');

    vi.mocked(pullWebDavFile)
      .mockResolvedValueOnce({ ok: true, status: 200, body: dataJson })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: JSON.stringify({
          version: '4.0',
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
          dataHash: sha256(dataJson),
          encrypted: false,
          images: { 'cover.png': mediaManifestEntry(expectedBase64) },
          videos: {},
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, body: tamperedBase64 });

    await expect(pullWebDavSnapshot(config)).rejects.toThrow(
      'WebDAV image download failed for cover.png: hash mismatch',
    );
  });

  it('rejects unsafe media names in pulled WebDAV manifests before downloading files', async () => {
    const dataJson = '{"version":"web-backup-v2"}';
    const imageBase64 = Buffer.from('unsafe-image').toString('base64');

    vi.mocked(pullWebDavFile)
      .mockResolvedValueOnce({ ok: true, status: 200, body: dataJson })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: JSON.stringify({
          version: '4.0',
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
          dataHash: sha256(dataJson),
          encrypted: false,
          images: { '../escape.png': mediaManifestEntry(imageBase64) },
          videos: {},
        }),
      });

    await expect(pullWebDavSnapshot(config)).rejects.toThrow(
      'Invalid media filename: ../escape.png',
    );
    expect(pullWebDavFile).toHaveBeenCalledTimes(2);
  });

  it('falls back to legacy file when primary is missing', async () => {
    vi.mocked(pullWebDavFile)
      .mockResolvedValueOnce({ ok: false, status: 404, body: '' })
      .mockResolvedValueOnce({ ok: true, status: 200, body: '{"legacy":true}' });

    const result = await pullWebDavSnapshot(config);

    expect(pullWebDavFile).toHaveBeenNthCalledWith(1, config, REMOTE_BACKUP_DATA_FILE);
    expect(pullWebDavFile).toHaveBeenNthCalledWith(2, config, LEGACY_REMOTE_BACKUP_FILE);
    expect(result.remoteFile).toBe(LEGACY_REMOTE_BACKUP_FILE);
  });

  it('falls back to web compat legacy file after desktop legacy miss', async () => {
    vi.mocked(pullWebDavFile)
      .mockResolvedValueOnce({ ok: false, status: 404, body: '' })
      .mockResolvedValueOnce({ ok: false, status: 404, body: '' })
      .mockResolvedValueOnce({ ok: true, status: 200, body: '{"legacy":"web"}' });

    const result = await pullWebDavSnapshot(config);

    expect(pullWebDavFile).toHaveBeenNthCalledWith(2, config, LEGACY_REMOTE_BACKUP_FILE);
    expect(pullWebDavFile).toHaveBeenNthCalledWith(3, config, LEGACY_REMOTE_BACKUP_COMPAT_FILE);
    expect(result.remoteFile).toBe(LEGACY_REMOTE_BACKUP_COMPAT_FILE);
  });

  it('does not hide non-404 primary download errors as missing backup', async () => {
    vi.mocked(pullWebDavFile).mockReset();
    vi.mocked(pullWebDavFile).mockResolvedValueOnce({ ok: false, status: 401, body: '' });

    await expect(pullWebDavSnapshot(config)).rejects.toThrow('WebDAV download failed with HTTP 401');
  });
});
