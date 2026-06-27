import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase } from '@prompthub/db';
import { DEFAULT_SETTINGS } from '@prompthub/shared';
import { issueSolvedCaptcha } from '../test-helpers/auth-captcha';

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

interface WebDavMockSet {
  testWebDavConnection?: ReturnType<typeof vi.fn>;
  pushWebDavFile?: ReturnType<typeof vi.fn>;
  pullWebDavFile?: ReturnType<typeof vi.fn>;
  mkcolWebDavDirectory?: ReturnType<typeof vi.fn>;
}

function getMockCall(mockFn: ReturnType<typeof vi.fn>, index: number): unknown[] {
  return ((mockFn.mock.calls as unknown[][])[index] ?? []);
}

function ensureTestMediaDir(dataDir: string, userId: string, kind: 'images' | 'videos'): string {
  const dirPath = path.join(dataDir, 'data', 'assets', userId, kind);
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function isSafeWebDavRemotePathMock(value: string): boolean {
  const trimmed = value.trim().replace(/^\/+|\/+$/g, '');
  if (trimmed.includes('\\') || /[\u0000-\u001F\u007F]/u.test(trimmed)) {
    return false;
  }
  return !trimmed.split('/').some((segment) => segment === '.' || segment === '..');
}

function isHttpsWebDavEndpointMock(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function mediaManifestEntry(base64Data: string, uploadedAt: string) {
  return {
    hash: createHash('sha256').update(base64Data).digest('hex'),
    size: Buffer.from(base64Data, 'base64').length,
    uploadedAt,
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function createTestApp(dataDir: string, webDavMocks?: WebDavMockSet) {
  process.env.PORT = '3991';
  process.env.HOST = '127.0.0.1';
  process.env.JWT_SECRET = 'test-secret-for-web-sync-flow-1234567890';
  process.env.JWT_ACCESS_TTL = '900';
  process.env.JWT_REFRESH_TTL = '604800';
  process.env.DATA_ROOT = dataDir;
  process.env.ALLOW_REGISTRATION = 'true';
  process.env.LOG_LEVEL = 'debug';

  vi.doMock('../services/webdav.server.js', () => ({
    testWebDavConnection: webDavMocks?.testWebDavConnection ?? vi.fn(async () => ({ ok: true, status: 207 })),
    pushWebDavFile: webDavMocks?.pushWebDavFile ?? vi.fn(async () => ({ ok: true, status: 201 })),
    pullWebDavFile: webDavMocks?.pullWebDavFile ?? vi.fn(async () => ({ ok: true, status: 200, body: '{}' })),
    mkcolWebDavDirectory: webDavMocks?.mkcolWebDavDirectory ?? vi.fn(async () => ({ ok: true, status: 201 })),
    isHttpsWebDavEndpoint: isHttpsWebDavEndpointMock,
    isSafeWebDavRemotePath: isSafeWebDavRemotePathMock,
  }));

  const [{ createApp }] = await Promise.all([import('../app')]);
  return createApp();
}

async function registerUser(app: Awaited<ReturnType<typeof createTestApp>>, username: string, password: string) {
  const captcha = await issueSolvedCaptcha(app);
  const response = await app.request(
    new Request('http://local/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, ...captcha }),
    }),
  );

  const payload = await response.json() as {
    data: {
      user: { id: string; username: string; role: 'admin' | 'user' };
      accessToken: string;
    };
  };

  return { response, payload };
}

function authHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function createFolder(
  app: Awaited<ReturnType<typeof createTestApp>>,
  token: string,
  body: Record<string, unknown>,
) {
  return app.request(
    new Request('http://local/api/folders', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(body),
    }),
  );
}

async function createPrompt(
  app: Awaited<ReturnType<typeof createTestApp>>,
  token: string,
  body: Record<string, unknown>,
) {
  return app.request(
    new Request('http://local/api/prompts', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(body),
    }),
  );
}

async function createSkill(
  app: Awaited<ReturnType<typeof createTestApp>>,
  token: string,
  body: Record<string, unknown>,
) {
  return app.request(
    new Request('http://local/api/skills', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(body),
    }),
  );
}

function buildRemotePayload() {
  return {
    version: 'web-backup-v2',
    exportedAt: '2026-04-13T12:00:00.000Z',
    prompts: [
      {
        id: 'remote-prompt-1',
        title: 'Remote Prompt',
        userPrompt: 'Pulled body',
        variables: [],
        tags: ['remote'],
        folderId: 'remote-folder-child',
        images: ['remote-image.png'],
        videos: ['remote-video.mp4'],
        isFavorite: false,
        isPinned: false,
        version: 2,
        currentVersion: 2,
        usageCount: 0,
        createdAt: '2026-04-10T00:00:00.000Z',
        updatedAt: '2026-04-11T00:00:00.000Z',
      },
    ],
    promptVersions: [
      {
        id: 'remote-prompt-version-1',
        promptId: 'remote-prompt-1',
        version: 1,
        userPrompt: 'Pulled body',
        variables: [],
        createdAt: '2026-04-10T00:00:00.000Z',
      },
    ],
    folders: [
      {
        id: 'remote-folder-root',
        name: 'Remote Root',
        order: 0,
        createdAt: '2026-04-10T00:00:00.000Z',
        updatedAt: '2026-04-10T00:00:00.000Z',
      },
      {
        id: 'remote-folder-child',
        name: 'Remote Child',
        parentId: 'remote-folder-root',
        order: 1,
        createdAt: '2026-04-10T00:00:00.000Z',
        updatedAt: '2026-04-10T00:00:00.000Z',
      },
    ],
    rules: [
      {
        id: 'project:remote-site',
        platformId: 'workspace',
        platformName: 'Remote Site',
        platformIcon: 'FolderRoot',
        platformDescription: 'Remote rules',
        name: 'AGENTS.md',
        description: 'Remote project rules',
        path: '/remote/AGENTS.md',
        targetPath: '/remote/AGENTS.md',
        projectRootPath: '/remote',
        syncStatus: 'synced',
        content: '# Remote rules',
        versions: [],
      },
    ],
    skills: [
      {
        id: 'remote-skill-1',
        name: 'remote-skill',
        content: 'echo remote',
        instructions: 'echo remote',
        protocol_type: 'skill',
        is_favorite: false,
        created_at: 1712700000000,
        updated_at: 1712786400000,
      },
    ],
    skillVersions: [
      {
        id: 'remote-skill-version-1',
        skillId: 'remote-skill-1',
        version: 1,
        content: 'echo remote',
        createdAt: '2026-04-10T00:00:00.000Z',
      },
    ],
    skillFiles: {
      'remote-skill-1': [
        {
          relativePath: 'SKILL.md',
          content: 'echo remote',
        },
        {
          relativePath: 'templates/review.md',
          content: '# Remote review checklist',
        },
      ],
    },
    settings: {
      theme: 'dark',
      language: 'en',
      autoSave: false,
      customPlatformRootPaths: {
        claude: '/tmp/remote-root',
      },
      sync: {
        enabled: false,
        provider: 'manual',
        autoSync: false,
      },
    },
  };
}

function buildDeepFolderPayload(folderCount: number) {
  const folders = Array.from({ length: folderCount }, (_, index) => ({
    id: `deep-folder-${index}`,
    name: `Deep Folder ${index}`,
    parentId: index === 0 ? undefined : `deep-folder-${index - 1}`,
    order: index,
    createdAt: '2026-04-22T00:00:00.000Z',
    updatedAt: '2026-04-22T00:00:00.000Z',
  })).reverse();

  return {
    version: 'web-backup-v2',
    exportedAt: '2026-04-22T00:00:00.000Z',
    prompts: [
      {
        id: 'deep-folder-prompt',
        title: 'Should Not Import',
        userPrompt: 'This prompt must not survive a rejected import',
        variables: [],
        tags: [],
        images: ['deep-image.png'],
        videos: [],
        isFavorite: false,
        isPinned: false,
        version: 1,
        currentVersion: 1,
        usageCount: 0,
        folderId: `deep-folder-${folderCount - 1}`,
        createdAt: '2026-04-22T00:00:00.000Z',
        updatedAt: '2026-04-22T00:00:00.000Z',
      },
    ],
    promptVersions: [],
    folders,
    rules: [],
    skills: [],
    skillVersions: [],
    images: {
      'deep-image.png': Buffer.from('deep-image-binary').toString('base64'),
    },
    videos: {},
    settings: DEFAULT_SETTINGS,
  };
}

function buildDeepSkillPayload() {
  return {
    version: 'web-backup-v2',
    exportedAt: '2026-04-22T00:00:00.000Z',
    prompts: [
      {
        id: 'deep-skill-prompt',
        title: 'Should Not Import',
        userPrompt: 'This prompt must not survive a rejected import',
        variables: [],
        tags: [],
        images: ['deep-skill-image.png'],
        videos: [],
        isFavorite: false,
        isPinned: false,
        version: 1,
        currentVersion: 1,
        usageCount: 0,
        createdAt: '2026-04-22T00:00:00.000Z',
        updatedAt: '2026-04-22T00:00:00.000Z',
      },
    ],
    promptVersions: [],
    folders: [],
    rules: [],
    skills: [
      {
        id: 'deep-skill',
        name: 'Skill '.repeat(70),
        content: 'echo too long',
        instructions: 'echo too long',
        protocol_type: 'skill',
        is_favorite: false,
        created_at: 1776816000000,
        updated_at: 1776816000000,
      },
    ],
    skillVersions: [],
    images: {
      'deep-skill-image.png': Buffer.from('deep-skill-image-binary').toString('base64'),
    },
    videos: {},
    settings: DEFAULT_SETTINGS,
  };
}

function buildUnsafeRulePayload() {
  return {
    version: 'web-backup-v2',
    exportedAt: '2026-04-22T00:00:00.000Z',
    prompts: [
      {
        id: 'unsafe-rule-prompt',
        title: 'Should Not Import',
        userPrompt: 'This prompt must not survive a rejected import',
        variables: [],
        tags: [],
        images: ['unsafe-rule-image.png'],
        videos: [],
        isFavorite: false,
        isPinned: false,
        version: 1,
        currentVersion: 1,
        usageCount: 0,
        createdAt: '2026-04-22T00:00:00.000Z',
        updatedAt: '2026-04-22T00:00:00.000Z',
      },
    ],
    promptVersions: [],
    folders: [],
    rules: [
      {
        id: 'project:../escape',
        platformId: 'workspace',
        platformName: 'Unsafe Rule',
        platformIcon: 'FolderRoot',
        platformDescription: 'Unsafe imported rule',
        name: '../AGENTS.md',
        description: 'Should be rejected',
        path: '/unsafe/AGENTS.md',
        targetPath: '/unsafe/AGENTS.md',
        projectRootPath: '/unsafe',
        syncStatus: 'synced',
        content: '# Unsafe',
        versions: [],
      },
    ],
    skills: [],
    skillVersions: [],
    images: {
      'unsafe-rule-image.png': Buffer.from('unsafe-rule-image-binary').toString('base64'),
    },
    videos: {},
    settings: DEFAULT_SETTINGS,
  };
}

describe('web sync routes', () => {
  const TEST_TIMEOUT = 20000;

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock('../services/webdav.server.js');
  });

  afterEach(() => {
    closeDatabase();
    vi.doUnmock('../services/webdav.server.js');
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('serves manifest, data, config, and status routes with real backup data integrity', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-sync-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'syncowner', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const folderResponse = await createFolder(app, token, { name: 'Sync Folder' });
      const folder = await folderResponse.json() as { data: { id: string } };

      const promptResponse = await createPrompt(app, token, {
        title: 'Sync Prompt',
        userPrompt: 'Sync body',
        folderId: folder.data.id,
      });
      expect(promptResponse.status).toBe(201);

      const skillResponse = await createSkill(app, token, { name: 'sync-skill', content: 'echo sync' });
      expect(skillResponse.status).toBe(201);

      const invalidConfig = await app.request(
        new Request('http://local/api/sync/config', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({ enabled: true, provider: 'webdav', endpoint: 'bad-url' }),
        }),
      );
      expect(invalidConfig.status).toBe(422);

      const insecureEndpointConfig = await app.request(
        new Request('http://local/api/sync/config', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            enabled: true,
            provider: 'webdav',
            endpoint: 'http://dav.example.com/remote.php/dav/files/sync',
          }),
        }),
      );
      expect(insecureEndpointConfig.status).toBe(422);
      const insecureEndpointBody = await insecureEndpointConfig.json() as { error: { message: string } };
      expect(insecureEndpointBody.error.message).toContain('endpoint');
      expect(insecureEndpointBody.error.message).toContain('WebDAV endpoint must use HTTPS');

      const queryEndpointConfig = await app.request(
        new Request('http://local/api/sync/config', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            enabled: true,
            provider: 'webdav',
            endpoint: 'https://dav.example.com/remote.php/dav/files/sync?token=abc',
          }),
        }),
      );
      expect(queryEndpointConfig.status).toBe(422);
      const queryEndpointBody = await queryEndpointConfig.json() as { error: { message: string } };
      expect(queryEndpointBody.error.message).toContain('endpoint');
      expect(queryEndpointBody.error.message).toContain('cannot include query or fragment');

      const invalidRemotePathConfig = await app.request(
        new Request('http://local/api/sync/config', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            enabled: true,
            provider: 'webdav',
            endpoint: 'https://dav.example.com/remote.php/dav/files/sync',
            remotePath: '../escape',
          }),
        }),
      );
      expect(invalidRemotePathConfig.status).toBe(422);
      const invalidRemotePathBody = await invalidRemotePathConfig.json() as { error: { message: string } };
      expect(invalidRemotePathBody.error.message).toContain('remotePath');
      expect(invalidRemotePathBody.error.message).toContain('Invalid WebDAV remote path');

      const manifestResponse = await app.request(
        new Request('http://local/api/sync/manifest', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(manifestResponse.status).toBe(200);
      const manifestBody = await manifestResponse.json() as {
        data: {
          version: string;
          counts: {
            prompts: number;
            folders: number;
            skills: number;
            plugins: number;
            mcpServers: number;
          };
          actor: { userId: string; role: 'admin' | 'user' };
        };
      };
      expect(manifestBody.data.version).toBe('web-backup-v2');
      expect(manifestBody.data.counts).toEqual({
        prompts: 1,
        folders: 1,
        skills: 1,
        plugins: 0,
        mcpServers: 0,
      });
      expect(manifestBody.data.actor).toEqual({
        userId: registerPayload.data.user.id,
        role: registerPayload.data.user.role,
      });

      const dataResponse = await app.request(
        new Request('http://local/api/sync/data', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(dataResponse.status).toBe(200);
      const dataBody = await dataResponse.json() as {
        data: {
          version: string;
          prompts: Array<{ title: string }>;
          folders: Array<{ name: string }>;
          skills: Array<{ name: string }>;
        };
      };
      expect(dataBody.data.version).toBe('web-backup-v2');
      expect(dataBody.data.prompts).toEqual([expect.objectContaining({ title: 'Sync Prompt' })]);
      expect((dataBody.data as { rules?: Array<{ content: string }> }).rules).toEqual([]);

      const configUpdate = await app.request(
        new Request('http://local/api/sync/config', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            enabled: true,
            provider: 'webdav',
            endpoint: 'https://dav.example.com/remote.php/dav/files/sync',
            username: 'sync-user',
            password: 'sync-pass',
            remotePath: '/web-backups',
            autoSync: true,
          }),
        }),
      );
      expect(configUpdate.status).toBe(200);

      const configResponse = await app.request(
        new Request('http://local/api/sync/config', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(configResponse.status).toBe(200);
      const configBody = await configResponse.json() as {
        data: {
          enabled: boolean;
          provider: string;
          endpoint?: string;
          username?: string;
          password?: string;
          remotePath?: string;
          autoSync?: boolean;
        };
      };
      expect(configBody.data).toEqual({
        enabled: true,
        provider: 'webdav',
        endpoint: 'https://dav.example.com/remote.php/dav/files/sync',
        username: 'sync-user',
        password: 'sync-pass',
        remotePath: '/web-backups',
        autoSync: true,
      });

      const statusResponse = await app.request(
        new Request('http://local/api/sync/status', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(statusResponse.status).toBe(200);
      const statusBody = await statusResponse.json() as {
        data: {
          enabled: boolean;
          provider: string;
          summary: {
            prompts: number;
            folders: number;
            skills: number;
            plugins: number;
            mcpServers: number;
          };
          config: { endpoint?: string; autoSync?: boolean };
          capabilities: { pull: boolean; push: boolean; autoSync: boolean };
        };
      };
      expect(statusBody.data.enabled).toBe(true);
      expect(statusBody.data.provider).toBe('webdav');
      expect(statusBody.data.summary).toEqual({
        prompts: 1,
        folders: 1,
        skills: 1,
        plugins: 0,
        mcpServers: 0,
      });
      expect(statusBody.data.config.endpoint).toBe('https://dav.example.com/remote.php/dav/files/sync');
      expect(statusBody.data.capabilities).toEqual({ pull: true, push: true, autoSync: true });

      await createFolder(app, token, { name: 'Noisy Sync Folder' });
      await createPrompt(app, token, { title: 'Noisy Sync Prompt', userPrompt: 'discard' });
      await createSkill(app, token, { name: 'noisy-sync-skill', content: 'discard' });

      const importResponse = await app.request(
        new Request('http://local/api/sync/data', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({ payload: dataBody.data }),
        }),
      );
      expect(importResponse.status).toBe(200);
      const importBody = await importResponse.json() as {
        data: {
          ok: boolean;
              promptsImported: number;
              foldersImported: number;
              rulesImported: number;
              skillsImported: number;
              settingsUpdated: boolean;
            };
      };
      expect(importBody.data.ok).toBe(true);
        expect(importBody.data.promptsImported).toBe(1);
        expect(importBody.data.foldersImported).toBe(1);
        expect(importBody.data.rulesImported).toBe(0);
        expect(importBody.data.skillsImported).toBe(1);
      expect(importBody.data.settingsUpdated).toBe(false);

      const dataAfterImportResponse = await app.request(
        new Request('http://local/api/sync/data', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      const dataAfterImport = await dataAfterImportResponse.json() as {
        data: {
          prompts: Array<{ title: string }>;
          folders: Array<{ name: string }>;
          skills: Array<{ name: string }>;
          rules?: Array<{ id: string; content: string }>;
          settings: { sync?: { lastSyncAt?: string } };
        };
      };
      expect(dataAfterImport.data.prompts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: 'Sync Prompt' }),
          expect.objectContaining({ title: 'Noisy Sync Prompt' }),
        ]),
      );
      expect(dataAfterImport.data.folders).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Sync Folder' }),
          expect.objectContaining({ name: 'Noisy Sync Folder' }),
        ]),
      );
      expect(dataAfterImport.data.skills).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'sync-skill' }),
          expect.objectContaining({ name: 'noisy-sync-skill' }),
        ]),
      );
      expect(dataAfterImport.data.rules).toEqual([]);
      expect(dataAfterImport.data.settings.sync?.lastSyncAt).toBeTruthy();
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects oversized sync data content-length before importing records', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-sync-size-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'syncoversize', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const promptResponse = await createPrompt(app, token, {
        title: 'Keep Existing Sync Prompt',
        userPrompt: 'This prompt must remain after a rejected oversized sync import',
      });
      expect(promptResponse.status).toBe(201);

      const emptySnapshot = {
        version: 'web-backup-v2',
        exportedAt: '2026-06-09T00:00:00.000Z',
        prompts: [],
        promptVersions: [],
        folders: [],
        rules: [],
        skills: [],
        skillVersions: [],
        settings: DEFAULT_SETTINGS,
      };

      const oversizedResponse = await app.request(
        new Request('http://local/api/sync/data', {
          method: 'PUT',
          headers: {
            ...authHeaders(token),
            'Content-Length': String(51 * 1024 * 1024),
          },
          body: JSON.stringify({ payload: emptySnapshot }),
        }),
      );

      expect(oversizedResponse.status).toBe(400);
      const oversizedBody = await oversizedResponse.json() as { error: { code: string; message: string } };
      expect(oversizedBody.error).toEqual({
        code: 'BAD_REQUEST',
        message: 'Sync data request body exceeds size limit',
      });

      const invalidLengthResponse = await app.request(
        new Request('http://local/api/sync/data', {
          method: 'PUT',
          headers: {
            ...authHeaders(token),
            'Content-Length': '-1',
          },
          body: JSON.stringify({ payload: emptySnapshot }),
        }),
      );
      expect(invalidLengthResponse.status).toBe(400);
      const invalidLengthBody = await invalidLengthResponse.json() as { error: { code: string; message: string } };
      expect(invalidLengthBody.error).toEqual({
        code: 'BAD_REQUEST',
        message: 'Invalid Content-Length header',
      });

      const dataResponse = await app.request(
        new Request('http://local/api/sync/data', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      const dataBody = await dataResponse.json() as { data: { prompts: Array<{ title: string }> } };
      expect(dataBody.data.prompts).toEqual([
        expect.objectContaining({ title: 'Keep Existing Sync Prompt' }),
      ]);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects oversized sync config fields without persisting them', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-sync-config-boundary-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'syncconfigboundary', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const oversizedConfigResponse = await app.request(
        new Request('http://local/api/sync/config', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            enabled: true,
            provider: 'webdav',
            endpoint: `https://dav.example.com/${'a'.repeat(2050)}`,
            username: 'u'.repeat(513),
            password: 'p'.repeat(513),
            remotePath: `/${'backup/'.repeat(180)}`,
            autoSync: true,
          }),
        }),
      );

      expect(oversizedConfigResponse.status).toBe(422);
      const oversizedConfigBody = await oversizedConfigResponse.json() as { error: { code: string; message: string } };
      expect(oversizedConfigBody.error.code).toBe('VALIDATION_ERROR');
      expect(oversizedConfigBody.error.message).toContain('endpoint');
      expect(oversizedConfigBody.error.message).toContain('username');
      expect(oversizedConfigBody.error.message).toContain('password');
      expect(oversizedConfigBody.error.message).toContain('remotePath');

      const configResponse = await app.request(
        new Request('http://local/api/sync/config', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(configResponse.status).toBe(200);
      const configBody = await configResponse.json() as {
        data: {
          provider: string;
          endpoint?: string;
          username?: string;
          password?: string;
          remotePath?: string;
        };
      };
      expect(configBody.data.provider).toBe('manual');
      expect(configBody.data.endpoint).toBeUndefined();
      expect(configBody.data.username).toBeUndefined();
      expect(configBody.data.password).toBeUndefined();
      expect(configBody.data.remotePath).toBeUndefined();
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('keeps newer remote items while merging incoming desktop payload additions', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-sync-merge-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'mergeowner', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const folderResponse = await createFolder(app, token, { name: 'Remote Folder' });
      const folderBody = await folderResponse.json() as { data: { id: string } };
      const remoteFolderId = folderBody.data.id;

      const promptResponse = await createPrompt(app, token, {
        title: 'Remote Newer Prompt',
        userPrompt: 'remote newer',
        folderId: remoteFolderId,
      });
      expect(promptResponse.status).toBe(201);
      const promptBody = await promptResponse.json() as { data: { id: string } };

      const skillResponse = await createSkill(app, token, {
        name: 'remote-newer-skill',
        content: 'echo remote newer',
      });
      expect(skillResponse.status).toBe(201);
      const skillBody = await skillResponse.json() as { data: { id: string } };

      const importResponse = await app.request(
        new Request('http://local/api/sync/data', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            payload: {
              version: 'desktop-backup-v1',
              exportedAt: '2026-04-16T02:00:00.000Z',
              prompts: [
                {
                  id: promptBody.data.id,
                  title: 'Remote Older Prompt',
                  userPrompt: 'desktop older',
                  variables: [],
                  tags: ['desktop'],
                  folderId: remoteFolderId,
                  isFavorite: false,
                  isPinned: false,
                  version: 1,
                  currentVersion: 1,
                  usageCount: 0,
                  createdAt: '2026-04-16T01:00:00.000Z',
                  updatedAt: '2026-04-16T01:00:00.000Z',
                },
                {
                  id: 'desktop-added-prompt',
                  title: 'Desktop Added Prompt',
                  userPrompt: 'desktop new',
                  variables: [],
                  tags: ['desktop'],
                  folderId: remoteFolderId,
                  isFavorite: false,
                  isPinned: false,
                  version: 1,
                  currentVersion: 1,
                  usageCount: 0,
                  createdAt: '2026-04-16T02:00:00.000Z',
                  updatedAt: '2026-04-16T02:00:00.000Z',
                },
              ],
              promptVersions: [],
              folders: [
                {
                  id: remoteFolderId,
                  name: 'Remote Folder Older Copy',
                  order: 0,
                  createdAt: '2026-04-16T01:00:00.000Z',
                  updatedAt: '2026-04-16T01:00:00.000Z',
                },
              ],
              skills: [
                {
                  id: skillBody.data.id,
                  name: 'remote-newer-skill',
                  content: 'echo desktop older',
                  instructions: 'echo desktop older',
                  protocol_type: 'skill',
                  is_favorite: false,
                  created_at: 1,
                  updated_at: 1,
                },
                {
                  id: 'desktop-added-skill',
                  name: 'desktop-added-skill',
                  content: 'echo desktop new',
                  instructions: 'echo desktop new',
                  protocol_type: 'skill',
                  is_favorite: false,
                  created_at: 2,
                  updated_at: 2,
                },
              ],
              skillVersions: [],
              settings: {
                theme: 'dark',
                language: 'en',
                autoSave: true,
                customPlatformRootPaths: {},
                customSkillPlatformPaths: {},
                sync: {
                  enabled: false,
                  provider: 'manual',
                  autoSync: false,
                },
              },
              settingsUpdatedAt: '2026-04-16T02:00:00.000Z',
            },
          }),
        }),
      );
      expect(importResponse.status).toBe(200);

      const dataResponse = await app.request(
        new Request('http://local/api/sync/data', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(dataResponse.status).toBe(200);
      const dataBody = await dataResponse.json() as {
        data: {
          prompts: Array<{ id: string; title: string; userPrompt: string }>;
          folders: Array<{ id: string; name: string }>;
          skills: Array<{ id: string; name: string; content?: string }>;
        };
      };

      expect(dataBody.data.prompts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: promptBody.data.id,
            title: 'Remote Newer Prompt',
            userPrompt: 'remote newer',
          }),
          expect.objectContaining({
            id: 'desktop-added-prompt',
            title: 'Desktop Added Prompt',
          }),
        ]),
      );
      expect(dataBody.data.folders).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: remoteFolderId,
            name: 'Remote Folder',
          }),
        ]),
      );
      expect(dataBody.data.skills).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: skillBody.data.id,
            name: 'remote-newer-skill',
            content: 'echo remote newer',
          }),
          expect.objectContaining({
            id: 'desktop-added-skill',
            name: 'desktop-added-skill',
          }),
        ]),
      );
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('writes media files when importing sync data directly', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-sync-direct-media-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'mediasync', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const importResponse = await app.request(
        new Request('http://local/api/sync/data', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            payload: {
              ...buildRemotePayload(),
              images: {
                'remote-image.png': Buffer.from('direct-image-binary').toString('base64'),
              },
              videos: {
                'remote-video.mp4': Buffer.from('direct-video-binary').toString('base64'),
              },
            },
          }),
        }),
      );

      expect(importResponse.status).toBe(200);
      expect(fs.existsSync(path.join(ensureTestMediaDir(dataDir, registerPayload.data.user.id, 'images'), 'remote-image.png'))).toBe(true);
      expect(fs.existsSync(path.join(ensureTestMediaDir(dataDir, registerPayload.data.user.id, 'videos'), 'remote-video.mp4'))).toBe(true);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('does not leave media files when direct sync import fails during later writes', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-sync-direct-media-rollback-'));

    try {
      vi.doMock('../services/rule-workspace.js', async () => {
        const actual = await vi.importActual<typeof import('../services/rule-workspace.js')>('../services/rule-workspace.js');
        return {
          ...actual,
          importRuleBackupRecords: vi.fn(() => {
            throw new Error('Simulated sync rule import failure');
          }),
        };
      });

      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'mediarollbacksync', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const importResponse = await app.request(
        new Request('http://local/api/sync/data', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            payload: {
              ...buildRemotePayload(),
              images: {
                'remote-image.png': Buffer.from('rollback-image-binary').toString('base64'),
              },
            },
          }),
        }),
      );

      expect(importResponse.status).toBe(422);
      const importBody = await importResponse.json() as { error: { message: string } };
      expect(importBody.error.message).toContain('Simulated sync rule import failure');
      expect(fs.existsSync(path.join(ensureTestMediaDir(dataDir, registerPayload.data.user.id, 'images'), 'remote-image.png'))).toBe(false);

      const dataResponse = await app.request(
        new Request('http://local/api/sync/data', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(dataResponse.status).toBe(200);
      const dataBody = await dataResponse.json() as {
        data: {
          prompts: unknown[];
          folders: unknown[];
          rules?: unknown[];
        };
      };
      expect(dataBody.data.prompts).toEqual([]);
      expect(dataBody.data.folders).toEqual([]);
      expect(dataBody.data.rules).toEqual([]);
    } finally {
      vi.doUnmock('../services/rule-workspace.js');
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rolls back direct sync import records when pulled media writing fails', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-sync-media-write-rollback-'));

    try {
      vi.doMock('../services/sync-media.js', async () => {
        const actual = await vi.importActual<typeof import('../services/sync-media.js')>('../services/sync-media.js');
        return {
          ...actual,
          writePulledSyncMedia: vi.fn(() => {
            throw new Error('Simulated pulled media write failure');
          }),
        };
      });

      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'mediawriterollbacksync', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const importResponse = await app.request(
        new Request('http://local/api/sync/data', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            payload: {
              ...buildRemotePayload(),
              images: {
                'remote-image.png': Buffer.from('write-failure-image').toString('base64'),
              },
            },
          }),
        }),
      );

      expect(importResponse.status).toBe(422);
      const importBody = await importResponse.json() as { error: { message: string } };
      expect(importBody.error.message).toContain('Simulated pulled media write failure');

      const dataResponse = await app.request(
        new Request('http://local/api/sync/data', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(dataResponse.status).toBe(200);
      const dataBody = await dataResponse.json() as {
        data: {
          prompts: unknown[];
          folders: unknown[];
          rules?: unknown[];
          skills: unknown[];
        };
      };
      expect(dataBody.data.prompts).toEqual([]);
      expect(dataBody.data.folders).toEqual([]);
      expect(dataBody.data.rules).toEqual([]);
      expect(dataBody.data.skills).toEqual([]);
    } finally {
      vi.doUnmock('../services/sync-media.js');
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects sync imports that exceed prompt workspace path limits before writing media or records', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-sync-deep-folders-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'deepsync', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const importResponse = await app.request(
        new Request('http://local/api/sync/data', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            payload: buildDeepFolderPayload(180),
          }),
        }),
      );

      expect(importResponse.status).toBe(422);
      const importBody = await importResponse.json() as { error: { code: string; message: string } };
      expect(importBody.error.code).toBe('VALIDATION_ERROR');
      expect(importBody.error.message).toContain('prompt workspace path is too long');
      expect(fs.existsSync(path.join(ensureTestMediaDir(dataDir, registerPayload.data.user.id, 'images'), 'deep-image.png'))).toBe(false);

      const dataResponse = await app.request(
        new Request('http://local/api/sync/data', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(dataResponse.status).toBe(200);
      const dataBody = await dataResponse.json() as {
        data: {
          prompts: unknown[];
          folders: unknown[];
        };
      };
      expect(dataBody.data.prompts).toEqual([]);
      expect(dataBody.data.folders).toEqual([]);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects sync imports that exceed skill workspace path limits before writing media or records', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-sync-deep-skills-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'deepskillsync', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const importResponse = await app.request(
        new Request('http://local/api/sync/data', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            payload: buildDeepSkillPayload(),
          }),
        }),
      );

      expect(importResponse.status).toBe(422);
      const importBody = await importResponse.json() as { error: { code: string; message: string } };
      expect(importBody.error.code).toBe('VALIDATION_ERROR');
      expect(importBody.error.message).toContain('skill workspace path segment is too long');
      expect(fs.existsSync(path.join(ensureTestMediaDir(dataDir, registerPayload.data.user.id, 'images'), 'deep-skill-image.png'))).toBe(false);

      const dataResponse = await app.request(
        new Request('http://local/api/sync/data', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(dataResponse.status).toBe(200);
      const dataBody = await dataResponse.json() as {
        data: {
          prompts: unknown[];
          skills: unknown[];
        };
      };
      expect(dataBody.data.prompts).toEqual([]);
      expect(dataBody.data.skills).toEqual([]);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects sync imports with unsafe rule paths before writing media or records', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-sync-unsafe-rules-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'unsaferulesync', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const importResponse = await app.request(
        new Request('http://local/api/sync/data', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            payload: buildUnsafeRulePayload(),
          }),
        }),
      );

      expect(importResponse.status).toBe(422);
      const importBody = await importResponse.json() as { error: { code: string; message: string } };
      expect(importBody.error.code).toBe('VALIDATION_ERROR');
      expect(importBody.error.message).toContain('rule path segment');
      expect(fs.existsSync(path.join(ensureTestMediaDir(dataDir, registerPayload.data.user.id, 'images'), 'unsafe-rule-image.png'))).toBe(false);

      const dataResponse = await app.request(
        new Request('http://local/api/sync/data', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(dataResponse.status).toBe(200);
      const dataBody = await dataResponse.json() as {
        data: {
          prompts: unknown[];
          rules?: unknown[];
        };
      };
      expect(dataBody.data.prompts).toEqual([]);
      expect(dataBody.data.rules).toEqual([]);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('accepts PromptHub envelopes on sync data import and normalizes desktop settings snapshots', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-sync-envelope-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'envelopesync', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const importResponse = await app.request(
        new Request('http://local/api/sync/data', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            payload: {
              kind: 'prompthub-export',
              exportedAt: '2099-01-01T00:00:00.000Z',
              payload: {
                ...buildRemotePayload(),
                version: 1,
                settings: {
                  state: {
                    themeMode: 'dark',
                    language: 'fr',
                    autoSave: false,
                    customPlatformRootPaths: {
                      claude: '/tmp/envelope-sync-root',
                    },
                  },
                },
                settingsUpdatedAt: '2099-01-01T00:00:00.000Z',
                images: {
                  'remote-image.png': Buffer.from('envelope-sync-image').toString('base64'),
                },
                videos: {
                  'remote-video.mp4': Buffer.from('envelope-sync-video').toString('base64'),
                },
              },
            },
          }),
        }),
      );

      expect(importResponse.status).toBe(200);
      const importBody = await importResponse.json() as {
        data: {
          ok: boolean;
          promptsImported: number;
          foldersImported: number;
          skillsImported: number;
          settingsUpdated: boolean;
        };
      };
      expect(importBody.data.ok).toBe(true);
      expect(importBody.data.promptsImported).toBe(1);
      expect(importBody.data.foldersImported).toBe(2);
      expect(importBody.data.skillsImported).toBe(1);
      expect(importBody.data.settingsUpdated).toBe(true);

      const dataResponse = await app.request(
        new Request('http://local/api/sync/data', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(dataResponse.status).toBe(200);

      const dataBody = await dataResponse.json() as {
        data: {
          prompts: Array<{ title: string; images?: string[]; videos?: string[] }>;
          settings: {
            theme: string;
            language: string;
            autoSave: boolean;
            customPlatformRootPaths?: Record<string, string>;
          };
        };
      };

      expect(dataBody.data.prompts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: 'Remote Prompt',
            images: ['remote-image.png'],
            videos: ['remote-video.mp4'],
          }),
        ]),
      );
      expect(dataBody.data.settings).toEqual(
        expect.objectContaining({
          theme: 'dark',
          language: 'fr',
          autoSave: false,
          customPlatformRootPaths: {
            claude: '/tmp/envelope-sync-root',
          },
        }),
      );
      expect(fs.existsSync(path.join(ensureTestMediaDir(dataDir, registerPayload.data.user.id, 'images'), 'remote-image.png'))).toBe(true);
      expect(fs.existsSync(path.join(ensureTestMediaDir(dataDir, registerPayload.data.user.id, 'videos'), 'remote-video.mp4'))).toBe(true);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('fills missing settings with shared defaults during sync import', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-sync-default-settings-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'syncdefaultowner', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const importResponse = await app.request(
        new Request('http://local/api/sync/data', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            payload: {
              version: 'web-backup-v2',
              exportedAt: '2026-04-21T00:00:00.000Z',
              prompts: [],
              promptVersions: [],
              folders: [],
              skills: [],
              skillVersions: [],
            },
          }),
        }),
      );

      expect(importResponse.status).toBe(200);

      const dataResponse = await app.request(
        new Request('http://local/api/sync/data', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(dataResponse.status).toBe(200);

      const dataBody = await dataResponse.json() as {
        data: {
          settings: {
            theme: string;
            language: string;
            autoSave: boolean;
          };
        };
      };

      expect(dataBody.data.settings).toEqual(
        expect.objectContaining({
          theme: DEFAULT_SETTINGS.theme,
          language: DEFAULT_SETTINGS.language,
          autoSave: DEFAULT_SETTINGS.autoSave,
        }),
      );
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects sync imports with insecure WebDAV settings endpoints', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-sync-settings-boundary-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'syncinsecuresettings', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const importResponse = await app.request(
        new Request('http://local/api/sync/data', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            payload: {
              version: 'web-backup-v2',
              exportedAt: '2026-04-21T00:00:00.000Z',
              prompts: [],
              promptVersions: [],
              folders: [],
              skills: [],
              skillVersions: [],
              settings: {
                ...DEFAULT_SETTINGS,
                sync: {
                  enabled: true,
                  provider: 'webdav',
                  endpoint: 'http://dav.example.com/remote.php/dav/files/sync-import',
                },
              },
            },
          }),
        }),
      );

      expect(importResponse.status).toBe(422);
      const importBody = await importResponse.json() as { error: { code: string; message: string } };
      expect(importBody.error.code).toBe('VALIDATION_ERROR');
      expect(importBody.error.message).toContain('settings.sync.endpoint');
      expect(importBody.error.message).toContain('WebDAV endpoint must use HTTPS');

      const dataResponse = await app.request(
        new Request('http://local/api/sync/data', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(dataResponse.status).toBe(200);
      const dataBody = await dataResponse.json() as { data: { settings: { sync?: { endpoint?: string } } } };
      expect(dataBody.data.settings.sync?.endpoint).toBeUndefined();
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects sync imports with oversized WebDAV settings fields', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-sync-settings-size-boundary-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'syncoversizedsettings', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const importResponse = await app.request(
        new Request('http://local/api/sync/data', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            payload: {
              version: 'web-backup-v2',
              exportedAt: '2026-04-21T00:00:00.000Z',
              prompts: [],
              promptVersions: [],
              folders: [],
              skills: [],
              skillVersions: [],
              settings: {
                ...DEFAULT_SETTINGS,
                sync: {
                  enabled: true,
                  provider: 'webdav',
                  endpoint: `https://dav.example.com/${'a'.repeat(2050)}`,
                  username: 'u'.repeat(513),
                  password: 'p'.repeat(513),
                  remotePath: `/${'backup/'.repeat(180)}`,
                  autoSync: true,
                  lastSyncAt: 'not-an-iso-date',
                },
              },
            },
          }),
        }),
      );

      expect(importResponse.status).toBe(422);
      const importBody = await importResponse.json() as { error: { code: string; message: string } };
      expect(importBody.error.code).toBe('VALIDATION_ERROR');
      expect(importBody.error.message).toContain('settings.sync.endpoint');
      expect(importBody.error.message).toContain('settings.sync.username');
      expect(importBody.error.message).toContain('settings.sync.password');
      expect(importBody.error.message).toContain('settings.sync.remotePath');
      expect(importBody.error.message).toContain('settings.sync.lastSyncAt');

      const dataResponse = await app.request(
        new Request('http://local/api/sync/data', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(dataResponse.status).toBe(200);
      const dataBody = await dataResponse.json() as { data: { settings: { sync?: { endpoint?: string } } } };
      expect(dataBody.data.settings.sync?.endpoint).toBeUndefined();
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects sync imports with malformed persisted settings preference fields', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-sync-preference-boundary-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'syncmalformedsettings', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const importResponse = await app.request(
        new Request('http://local/api/sync/data', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            payload: {
              version: 'web-backup-v2',
              exportedAt: '2026-04-21T00:00:00.000Z',
              prompts: [],
              promptVersions: [],
              folders: [],
              skills: [],
              skillVersions: [],
              settings: {
                ...DEFAULT_SETTINGS,
                backgroundImageFileName: '../wallpaper.png',
                lastManualBackupAt: 'not-an-iso-date',
                lastManualBackupVersion: 'v'.repeat(121),
              },
            },
          }),
        }),
      );

      expect(importResponse.status).toBe(422);
      const importBody = await importResponse.json() as { error: { code: string; message: string } };
      expect(importBody.error.code).toBe('VALIDATION_ERROR');
      expect(importBody.error.message).toContain('settings.backgroundImageFileName');
      expect(importBody.error.message).toContain('settings.lastManualBackupAt');
      expect(importBody.error.message).toContain('settings.lastManualBackupVersion');

      const dataResponse = await app.request(
        new Request('http://local/api/sync/data', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(dataResponse.status).toBe(200);
      const dataBody = await dataResponse.json() as {
        data: {
          settings: {
            backgroundImageFileName?: string;
            lastManualBackupAt?: string;
            lastManualBackupVersion?: string;
          };
        };
      };
      expect(dataBody.data.settings.backgroundImageFileName).toBeUndefined();
      expect(dataBody.data.settings.lastManualBackupAt).toBeUndefined();
      expect(dataBody.data.settings.lastManualBackupVersion).toBeUndefined();
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('pushes backup data to WebDAV using only mocked server functions', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-sync-test-'));
    const testWebDavConnection = vi.fn(async () => ({ ok: true, status: 207 }));
    const pushWebDavFile = vi.fn(async () => ({ ok: true, status: 201 }));

    try {
      const app = await createTestApp(dataDir, { testWebDavConnection, pushWebDavFile });
      const { payload: registerPayload } = await registerUser(app, 'pushowner', 'debugpass001');
      const token = registerPayload.data.accessToken;
      const userId = registerPayload.data.user.id;

      fs.writeFileSync(
        path.join(ensureTestMediaDir(dataDir, userId, 'images'), 'push-image.png'),
        Buffer.from('push-image-binary'),
      );
      fs.writeFileSync(
        path.join(ensureTestMediaDir(dataDir, userId, 'videos'), 'push-video.mp4'),
        Buffer.from('push-video-binary'),
      );

      await createFolder(app, token, { name: 'Push Folder' });
      await createPrompt(app, token, {
        title: 'Push Prompt',
        userPrompt: 'Push body',
        images: ['push-image.png'],
        videos: ['push-video.mp4'],
      });

      const configResponse = await app.request(
        new Request('http://local/api/sync/config', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            enabled: true,
            provider: 'webdav',
            endpoint: 'https://dav.example.com/remote.php/dav/files/push',
            username: 'push-user',
            password: 'push-pass',
            remotePath: '/prod',
            autoSync: true,
          }),
        }),
      );
      expect(configResponse.status).toBe(200);

      const pushResponse = await app.request(
        new Request('http://local/api/sync/push', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(pushResponse.status).toBe(200);
      const pushBody = await pushResponse.json() as {
        data: {
          ok: boolean;
          provider: string;
          syncedAt: string;
          remoteFile: string;
          promptsExported: number;
          foldersExported: number;
          rulesExported: number;
          skillsExported: number;
          summary: {
            prompts: number;
            folders: number;
            rules: number;
            skills: number;
            plugins: number;
            mcpServers: number;
          };
        };
      };

      expect(pushBody.data.ok).toBe(true);
      expect(pushBody.data.provider).toBe('webdav');
      expect(pushBody.data.remoteFile).toBe('prompthub-backup/data.json');
      expect(pushBody.data.syncedAt).toBeTruthy();
      expect(pushBody.data.promptsExported).toBe(1);
      expect(pushBody.data.foldersExported).toBe(1);
      expect(pushBody.data.rulesExported).toBe(0);
      expect(pushBody.data.skillsExported).toBe(0);
      expect(pushBody.data.summary).toEqual({
        prompts: 1,
        folders: 1,
        rules: 0,
        skills: 0,
        plugins: 0,
        mcpServers: 0,
      });
      expect(testWebDavConnection).toHaveBeenCalledTimes(1);
      expect(pushWebDavFile).toHaveBeenCalledTimes(4); // image + video + data.json + manifest.json
      expect(getMockCall(pushWebDavFile, 0)[1]).toBe('prompthub-backup/images/push-image.png.base64');
      expect(getMockCall(pushWebDavFile, 1)[1]).toBe('prompthub-backup/videos/push-video.mp4.base64');
      const pushCall = getMockCall(pushWebDavFile, 2);
      expect(pushCall).toBeTruthy();
      expect(pushCall[1]).toBe('prompthub-backup/data.json');

      const pushedPayload = JSON.parse(String(pushCall[2])) as {
        prompts: Array<{ title: string }>;
        folders: Array<{ name: string }>;
      };
      expect(pushedPayload.prompts).toEqual([expect.objectContaining({ title: 'Push Prompt' })]);
      expect(pushedPayload.folders).toEqual([expect.objectContaining({ name: 'Push Folder' })]);
      expect(getMockCall(pushWebDavFile, 3)[1]).toBe('prompthub-backup/manifest.json');

      const statusResponse = await app.request(
        new Request('http://local/api/sync/status', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      const statusBody = await statusResponse.json() as { data: { lastSyncAt: string } };
      expect(statusBody.data.lastSyncAt).toBe(pushBody.data.syncedAt);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('pulls backup data from WebDAV and replaces local visible data', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-sync-test-'));
    const remotePayload = buildRemotePayload();
    const remotePayloadJson = JSON.stringify(remotePayload);
    const remoteImageBase64 = Buffer.from('remote-image-binary').toString('base64');
    const remoteVideoBase64 = Buffer.from('remote-video-binary').toString('base64');
    const pullWebDavFile = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, body: remotePayloadJson })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: JSON.stringify({
          version: '4.0',
          createdAt: remotePayload.exportedAt,
          updatedAt: remotePayload.exportedAt,
          dataHash: sha256(remotePayloadJson),
          encrypted: false,
          images: {
            'remote-image.png': mediaManifestEntry(remoteImageBase64, remotePayload.exportedAt),
          },
          videos: {
            'remote-video.mp4': mediaManifestEntry(remoteVideoBase64, remotePayload.exportedAt),
          },
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, body: remoteImageBase64 })
      .mockResolvedValueOnce({ ok: true, status: 200, body: remoteVideoBase64 });

    try {
      const app = await createTestApp(dataDir, { pullWebDavFile });
      const { payload: registerPayload } = await registerUser(app, 'pullowner', 'debugpass001');
      const token = registerPayload.data.accessToken;

      await createFolder(app, token, { name: 'Stale Folder' });
      await createPrompt(app, token, { title: 'Stale Prompt', userPrompt: 'stale' });
      await createSkill(app, token, { name: 'stale-skill', content: 'stale' });

      const configResponse = await app.request(
        new Request('http://local/api/sync/config', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            enabled: true,
            provider: 'webdav',
            endpoint: 'https://dav.example.com/remote.php/dav/files/pull',
            username: 'pull-user',
            password: 'pull-pass',
            remotePath: '/restore',
            autoSync: false,
          }),
        }),
      );
      expect(configResponse.status).toBe(200);

      const pullResponse = await app.request(
        new Request('http://local/api/sync/pull', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(pullResponse.status).toBe(200);
      const pullBody = await pullResponse.json() as {
        data: {
          ok: boolean;
              promptsImported: number;
              foldersImported: number;
              rulesImported: number;
              skillsImported: number;
              provider: string;
          remoteFile: string;
          syncedAt: string;
          summary: {
            prompts: number;
            folders: number;
            rules: number;
            skills: number;
            plugins: number;
            mcpServers: number;
          };
        };
      };
      expect(pullBody.data.ok).toBe(true);
      expect(pullBody.data.promptsImported).toBe(1);
      expect(pullBody.data.foldersImported).toBe(2);
      expect(pullBody.data.rulesImported).toBe(1);
      expect(pullBody.data.skillsImported).toBe(1);
      expect(pullBody.data.summary).toEqual({
        prompts: 1,
        folders: 2,
        rules: 1,
        skills: 1,
        plugins: 0,
        mcpServers: 0,
      });
      expect(pullBody.data.provider).toBe('webdav');
      expect(pullBody.data.remoteFile).toBe('prompthub-backup/data.json');
      expect(pullWebDavFile).toHaveBeenCalledTimes(4);
      const pullCall = getMockCall(pullWebDavFile, 0);
      expect(pullCall).toBeTruthy();
      expect(pullCall[1]).toBe('prompthub-backup/data.json');
      expect(getMockCall(pullWebDavFile, 1)[1]).toBe('prompthub-backup/manifest.json');
      expect(getMockCall(pullWebDavFile, 2)[1]).toBe('prompthub-backup/images/remote-image.png.base64');
      expect(getMockCall(pullWebDavFile, 3)[1]).toBe('prompthub-backup/videos/remote-video.mp4.base64');

      const dataResponse = await app.request(
        new Request('http://local/api/sync/data', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(dataResponse.status).toBe(200);
      const dataBody = await dataResponse.json() as {
        data: {
          prompts: Array<{ title: string; folderId?: string; images?: string[]; videos?: string[] }>;
          folders: Array<{ id: string; name: string; parentId?: string }>;
          skills: Array<{ name: string }>;
          skillFiles?: Record<string, Array<{ relativePath: string; content: string }>>;
          rules?: Array<{ id: string; content: string }>;
          settings: {
            theme: string;
            language: string;
            autoSave: boolean;
            customPlatformRootPaths: Record<string, string>;
            sync?: { endpoint?: string; lastSyncAt?: string };
          };
        };
      };

      expect(dataBody.data.prompts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: 'Remote Prompt' }),
          expect.objectContaining({ title: 'Stale Prompt' }),
        ]),
      );
      expect(dataBody.data.skills).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'remote-skill' }),
          expect.objectContaining({ name: 'stale-skill' }),
        ]),
      );
      expect(dataBody.data.skillFiles).toEqual(
        expect.objectContaining({
          'remote-skill-1': expect.arrayContaining([
            expect.objectContaining({ relativePath: 'SKILL.md', content: 'echo remote' }),
            expect.objectContaining({ relativePath: 'templates/review.md', content: '# Remote review checklist' }),
          ]),
        }),
      );
      expect(dataBody.data.rules).toEqual([
        expect.objectContaining({
          id: 'project:remote-site',
          content: '# Remote rules',
        }),
      ]);

      const rootFolder = dataBody.data.folders.find((entry) => entry.name === 'Remote Root');
      const childFolder = dataBody.data.folders.find((entry) => entry.name === 'Remote Child');
      const remotePrompt = dataBody.data.prompts.find((entry) => entry.title === 'Remote Prompt');
      expect(rootFolder).toBeTruthy();
      expect(childFolder?.parentId).toBe(rootFolder?.id);
      expect(remotePrompt?.folderId).toBe(childFolder?.id);
      expect(remotePrompt).toEqual(
        expect.objectContaining({
          title: 'Remote Prompt',
          images: ['remote-image.png'],
          videos: ['remote-video.mp4'],
        }),
      );

      expect(dataBody.data.settings.theme).toBe('dark');
      expect(dataBody.data.settings.language).toBe('en');
      expect(dataBody.data.settings.autoSave).toBe(false);
      expect(dataBody.data.settings.customPlatformRootPaths).toEqual({ claude: '/tmp/remote-root' });
      expect(dataBody.data.settings.sync?.endpoint).toBe('https://dav.example.com/remote.php/dav/files/pull');
      expect(dataBody.data.settings.sync?.lastSyncAt).toBe(pullBody.data.syncedAt);
      expect(fs.existsSync(path.join(ensureTestMediaDir(dataDir, registerPayload.data.user.id, 'images'), 'remote-image.png'))).toBe(true);
      expect(fs.existsSync(path.join(ensureTestMediaDir(dataDir, registerPayload.data.user.id, 'videos'), 'remote-video.mp4'))).toBe(true);
      expect(
        fs.readFileSync(
          path.join(
            dataDir,
            'data',
            'skills',
            'remote-skill__remote-skill-1',
            'templates',
            'review.md',
          ),
          'utf8',
        ),
      ).toBe('# Remote review checklist');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('surfaces WebDAV auth failures on pull instead of masking them as missing backups', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-sync-auth-'));
    const pullWebDavFile = vi.fn().mockResolvedValueOnce({ ok: false, status: 401, body: '' });

    try {
      const app = await createTestApp(dataDir, { pullWebDavFile });
      const { payload: registerPayload } = await registerUser(app, 'pullauth', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const configResponse = await app.request(
        new Request('http://local/api/sync/config', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            enabled: true,
            provider: 'webdav',
            endpoint: 'https://dav.example.com/remote.php/dav/files/pull',
            username: 'pull-user',
            password: 'pull-pass',
            remotePath: '/restore',
            autoSync: false,
          }),
        }),
      );
      expect(configResponse.status).toBe(200);

      const pullResponse = await app.request(
        new Request('http://local/api/sync/pull', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }),
      );

      expect(pullResponse.status).toBe(422);
      const errorBody = await pullResponse.json() as { error: { message: string } };
      expect(errorBody.error.message).toContain('WebDAV download failed with HTTP 401');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('falls back to desktop legacy WebDAV backup filename on pull', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-sync-legacy-'));
    const pullWebDavFile = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404, body: '' })
      .mockResolvedValueOnce({ ok: true, status: 200, body: JSON.stringify(buildRemotePayload()) });

    try {
      const app = await createTestApp(dataDir, { pullWebDavFile });
      const { payload: registerPayload } = await registerUser(app, 'pulllegacy', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const configResponse = await app.request(
        new Request('http://local/api/sync/config', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            enabled: true,
            provider: 'webdav',
            endpoint: 'https://dav.example.com/remote.php/dav/files/pull',
            username: 'pull-user',
            password: 'pull-pass',
            remotePath: '/restore',
            autoSync: false,
          }),
        }),
      );
      expect(configResponse.status).toBe(200);

      const pullResponse = await app.request(
        new Request('http://local/api/sync/pull', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }),
      );

      expect(pullResponse.status).toBe(200);
      expect(getMockCall(pullWebDavFile, 0)[1]).toBe('prompthub-backup/data.json');
      expect(getMockCall(pullWebDavFile, 1)[1]).toBe('prompthub-backup.json');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('accepts extended sync providers in config and reflects provider in status', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-sync-providers-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'providerowner', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const selfHostedConfigResponse = await app.request(
        new Request('http://local/api/sync/config', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            enabled: true,
            provider: 'self-hosted',
            endpoint: 'http://sync.example.com/workspace',
            autoSync: true,
          }),
        }),
      );
      expect(selfHostedConfigResponse.status).toBe(200);

      const selfHostedStatusResponse = await app.request(
        new Request('http://local/api/sync/status', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(selfHostedStatusResponse.status).toBe(200);
      const selfHostedStatusBody = await selfHostedStatusResponse.json() as {
        data: {
          provider: string;
          message: string;
          capabilities: { autoSync: boolean };
        };
      };
      expect(selfHostedStatusBody.data.provider).toBe('self-hosted');
      expect(selfHostedStatusBody.data.message).toContain('Self-hosted sync');
      expect(selfHostedStatusBody.data.capabilities.autoSync).toBe(false);

      const inheritedWebDavEndpointResponse = await app.request(
        new Request('http://local/api/sync/config', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            enabled: true,
            provider: 'webdav',
          }),
        }),
      );
      expect(inheritedWebDavEndpointResponse.status).toBe(422);
      const inheritedWebDavEndpointBody = await inheritedWebDavEndpointResponse.json() as { error: { message: string } };
      expect(inheritedWebDavEndpointBody.error.message).toContain('endpoint');
      expect(inheritedWebDavEndpointBody.error.message).toContain('WebDAV endpoint must use HTTPS');

      const s3ConfigResponse = await app.request(
        new Request('http://local/api/sync/config', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            enabled: true,
            provider: 's3',
            endpoint: 'https://s3.example.com/bucket',
            autoSync: true,
          }),
        }),
      );
      expect(s3ConfigResponse.status).toBe(200);

      const s3StatusResponse = await app.request(
        new Request('http://local/api/sync/status', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(s3StatusResponse.status).toBe(200);
      const s3StatusBody = await s3StatusResponse.json() as {
        data: {
          provider: string;
          message: string;
          capabilities: { autoSync: boolean };
        };
      };
      expect(s3StatusBody.data.provider).toBe('s3');
      expect(s3StatusBody.data.message).toContain('S3 sync');
      expect(s3StatusBody.data.capabilities.autoSync).toBe(false);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);
});
