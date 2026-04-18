import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase } from '@prompthub/db';

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
}

function getMockCall(mockFn: ReturnType<typeof vi.fn>, index: number): unknown[] {
  return ((mockFn.mock.calls as unknown[][])[index] ?? []);
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

  vi.doUnmock('../services/webdav.server.js');
  if (webDavMocks) {
    vi.doMock('../services/webdav.server.js', () => ({
      testWebDavConnection: webDavMocks.testWebDavConnection ?? vi.fn(async () => ({ ok: true, status: 207 })),
      pushWebDavFile: webDavMocks.pushWebDavFile ?? vi.fn(async () => ({ ok: true, status: 201 })),
      pullWebDavFile: webDavMocks.pullWebDavFile ?? vi.fn(async () => ({ ok: true, status: 200, body: '{}' })),
    }));
  }

  const [{ createApp }] = await Promise.all([import('../app')]);
  return createApp();
}

async function registerUser(app: Awaited<ReturnType<typeof createTestApp>>, username: string, password: string) {
  const response = await app.request(
    new Request('http://local/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
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
    settings: {
      theme: 'dark',
      language: 'en',
      autoSave: false,
      customSkillPlatformPaths: {
        claude: '/tmp/remote-skills',
      },
      sync: {
        enabled: false,
        provider: 'manual',
        autoSync: false,
      },
    },
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

      const manifestResponse = await app.request(
        new Request('http://local/api/sync/manifest', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(manifestResponse.status).toBe(200);
      const manifestBody = await manifestResponse.json() as {
        data: {
          version: string;
          counts: { prompts: number; folders: number; skills: number };
          actor: { userId: string; role: 'admin' | 'user' };
        };
      };
      expect(manifestBody.data.version).toBe('web-backup-v2');
      expect(manifestBody.data.counts).toEqual({ prompts: 1, folders: 1, skills: 1 });
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
          summary: { prompts: number; folders: number; skills: number };
          config: { endpoint?: string; autoSync?: boolean };
          capabilities: { pull: boolean; push: boolean; autoSync: boolean };
        };
      };
      expect(statusBody.data.enabled).toBe(true);
      expect(statusBody.data.provider).toBe('webdav');
      expect(statusBody.data.summary).toEqual({ prompts: 1, folders: 1, skills: 1 });
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
          skillsImported: number;
          settingsUpdated: boolean;
        };
      };
      expect(importBody.data.ok).toBe(true);
      expect(importBody.data.promptsImported).toBe(1);
      expect(importBody.data.foldersImported).toBe(1);
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
      expect(dataAfterImport.data.settings.sync?.lastSyncAt).toBeTruthy();
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

  it('pushes backup data to WebDAV using only mocked server functions', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-sync-test-'));
    const testWebDavConnection = vi.fn(async () => ({ ok: true, status: 207 }));
    const pushWebDavFile = vi.fn(async () => ({ ok: true, status: 201 }));

    try {
      const app = await createTestApp(dataDir, { testWebDavConnection, pushWebDavFile });
      const { payload: registerPayload } = await registerUser(app, 'pushowner', 'debugpass001');
      const token = registerPayload.data.accessToken;

      await createFolder(app, token, { name: 'Push Folder' });
      await createPrompt(app, token, { title: 'Push Prompt', userPrompt: 'Push body' });

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
        };
      };

      expect(pushBody.data.ok).toBe(true);
      expect(pushBody.data.provider).toBe('webdav');
      expect(pushBody.data.remoteFile).toBe('prompthub-web-backup.json');
      expect(pushBody.data.syncedAt).toBeTruthy();
      expect(testWebDavConnection).toHaveBeenCalledTimes(1);
      expect(pushWebDavFile).toHaveBeenCalledTimes(1);
      const pushCall = getMockCall(pushWebDavFile, 0);
      expect(pushCall).toBeTruthy();
      expect(pushCall[1]).toBe('prompthub-web-backup.json');

      const pushedPayload = JSON.parse(String(pushCall[2])) as {
        prompts: Array<{ title: string }>;
        folders: Array<{ name: string }>;
      };
      expect(pushedPayload.prompts).toEqual([expect.objectContaining({ title: 'Push Prompt' })]);
      expect(pushedPayload.folders).toEqual([expect.objectContaining({ name: 'Push Folder' })]);

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
    const pullWebDavFile = vi.fn(async () => ({
      ok: true,
      status: 200,
      body: JSON.stringify(remotePayload),
    }));

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
          skillsImported: number;
          provider: string;
          remoteFile: string;
          syncedAt: string;
        };
      };
      expect(pullBody.data.ok).toBe(true);
      expect(pullBody.data.promptsImported).toBe(1);
      expect(pullBody.data.foldersImported).toBe(2);
      expect(pullBody.data.skillsImported).toBe(1);
      expect(pullBody.data.provider).toBe('webdav');
      expect(pullBody.data.remoteFile).toBe('prompthub-web-backup.json');
      expect(pullWebDavFile).toHaveBeenCalledTimes(1);
      const pullCall = getMockCall(pullWebDavFile, 0);
      expect(pullCall).toBeTruthy();
      expect(pullCall[1]).toBe('prompthub-web-backup.json');

      const dataResponse = await app.request(
        new Request('http://local/api/sync/data', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(dataResponse.status).toBe(200);
      const dataBody = await dataResponse.json() as {
        data: {
          prompts: Array<{ title: string; folderId?: string }>;
          folders: Array<{ id: string; name: string; parentId?: string }>;
          skills: Array<{ name: string }>;
          settings: {
            theme: string;
            language: string;
            autoSave: boolean;
            customSkillPlatformPaths: Record<string, string>;
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

      const rootFolder = dataBody.data.folders.find((entry) => entry.name === 'Remote Root');
      const childFolder = dataBody.data.folders.find((entry) => entry.name === 'Remote Child');
      const remotePrompt = dataBody.data.prompts.find((entry) => entry.title === 'Remote Prompt');
      expect(rootFolder).toBeTruthy();
      expect(childFolder?.parentId).toBe(rootFolder?.id);
      expect(remotePrompt?.folderId).toBe(childFolder?.id);

      expect(dataBody.data.settings.theme).toBe('dark');
      expect(dataBody.data.settings.language).toBe('en');
      expect(dataBody.data.settings.autoSave).toBe(false);
      expect(dataBody.data.settings.customSkillPlatformPaths).toEqual({ claude: '/tmp/remote-skills' });
      expect(dataBody.data.settings.sync?.endpoint).toBe('https://dav.example.com/remote.php/dav/files/pull');
      expect(dataBody.data.settings.sync?.lastSyncAt).toBe(pullBody.data.syncedAt);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);
});
