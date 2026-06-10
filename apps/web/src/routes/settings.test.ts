import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase } from '@prompthub/db';
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

async function createTestApp(dataDir: string) {
  process.env.PORT = '3993';
  process.env.HOST = '127.0.0.1';
  process.env.JWT_SECRET = 'test-secret-for-web-settings-flow-1234567890';
  process.env.JWT_ACCESS_TTL = '900';
  process.env.JWT_REFRESH_TTL = '604800';
  process.env.DATA_ROOT = dataDir;
  process.env.ALLOW_REGISTRATION = 'true';
  process.env.LOG_LEVEL = 'debug';

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
  const response = await app.request(
    new Request('http://local/api/folders', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(body),
    }),
  );

  const payload = await response.json() as {
    data?: {
      id: string;
    };
  };

  return { response, payload };
}

describe('web settings routes', () => {
  const TEST_TIMEOUT = 20000;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    closeDatabase();
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('returns default settings and rejects unauthenticated access', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-settings-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload } = await registerUser(app, 'settingsowner', 'debugpass001');

      const response = await app.request(
        new Request('http://local/api/settings', {
          headers: { Authorization: `Bearer ${payload.data.accessToken}` },
        }),
      );

      expect(response.status).toBe(200);
      const body = await response.json() as {
        data: {
          theme: string;
          language: string;
          autoSave: boolean;
          updateChannel: string;
          customPlatformRootPaths: Record<string, string>;
          customSkillPlatformPaths: Record<string, string>;
          skillPlatformOrder: string[];
          skillProjects: unknown[];
          backgroundImageOpacity: number;
          backgroundImageBlur: number;
          sync: { enabled: boolean; provider: string; autoSync: boolean };
          device: {
            syncCadence: string;
            storeAutoSync: boolean;
            storeSyncCadence: string;
          };
        };
      };

      expect(body.data).toEqual(expect.objectContaining({
        theme: 'system',
        language: 'zh',
        autoSave: true,
        updateChannel: 'stable',
        customPlatformRootPaths: {},
        customSkillPlatformPaths: {},
        skillPlatformOrder: [],
        skillProjects: [],
        backgroundImageOpacity: 0.22,
        backgroundImageBlur: 14,
        sync: {
          enabled: false,
          provider: 'manual',
          autoSync: false,
        },
        device: {
          syncCadence: 'manual',
          storeAutoSync: true,
          storeSyncCadence: '1d',
        },
      }));

      const unauthenticated = await app.request(new Request('http://local/api/settings'));
      expect(unauthenticated.status).toBe(401);
      const unauthenticatedBody = await unauthenticated.json() as { error: { code: string; message: string } };
      expect(unauthenticatedBody.error.code).toBe('UNAUTHORIZED');
      expect(unauthenticatedBody.error.message).toBe('Missing or invalid Authorization header');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('persists partial updates, nested sync config, and isolates settings per user', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-settings-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: ownerPayload } = await registerUser(app, 'settingsowner2', 'debugpass001');
      const { payload: otherPayload } = await registerUser(app, 'settingsviewer2', 'debugpass001');
      const ownerToken = ownerPayload.data.accessToken;

      const partialUpdate = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(ownerToken),
          body: JSON.stringify({
            theme: 'dark',
            autoSave: false,
            customPlatformRootPaths: {
              claude: '/tmp/custom-claude-root',
            },
          }),
        }),
      );

      expect(partialUpdate.status).toBe(200);

      const syncUpdate = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(ownerToken),
          body: JSON.stringify({
            sync: {
              enabled: true,
              provider: 'webdav',
              endpoint: 'https://dav.example.com/remote.php/dav/files/demo',
              username: 'alice',
              password: 'secret',
              remotePath: '/prompthub/backups',
              autoSync: true,
              lastSyncAt: '2026-04-13T10:00:00.000Z',
            },
            device: {
              syncCadence: '15m',
              storeAutoSync: true,
              storeSyncCadence: '1h',
            },
          }),
        }),
      );

      expect(syncUpdate.status).toBe(200);

      const ownerSettingsResponse = await app.request(
        new Request('http://local/api/settings', {
          headers: { Authorization: `Bearer ${ownerToken}` },
        }),
      );
      expect(ownerSettingsResponse.status).toBe(200);
      const ownerSettings = await ownerSettingsResponse.json() as {
        data: {
          theme: string;
          language: string;
          autoSave: boolean;
          customPlatformRootPaths: Record<string, string>;
          sync: {
            enabled: boolean;
            provider: string;
            endpoint?: string;
            username?: string;
            password?: string;
            remotePath?: string;
            autoSync?: boolean;
            lastSyncAt?: string;
          };
          device: {
            syncCadence?: string;
            storeAutoSync?: boolean;
            storeSyncCadence?: string;
          };
        };
      };

      expect(ownerSettings.data.theme).toBe('dark');
      expect(ownerSettings.data.language).toBe('zh');
      expect(ownerSettings.data.autoSave).toBe(false);
      expect(ownerSettings.data.customPlatformRootPaths).toEqual({
        claude: '/tmp/custom-claude-root',
      });
      expect(ownerSettings.data.sync).toEqual({
        enabled: true,
        provider: 'webdav',
        endpoint: 'https://dav.example.com/remote.php/dav/files/demo',
        username: 'alice',
        password: 'secret',
        remotePath: '/prompthub/backups',
        autoSync: true,
        lastSyncAt: '2026-04-13T10:00:00.000Z',
      });
      expect(ownerSettings.data.device).toEqual({
        syncCadence: '15m',
        storeAutoSync: true,
        storeSyncCadence: '1h',
      });

      const otherSettingsResponse = await app.request(
        new Request('http://local/api/settings', {
          headers: { Authorization: `Bearer ${otherPayload.data.accessToken}` },
        }),
      );

      expect(otherSettingsResponse.status).toBe(200);
      const otherSettings = await otherSettingsResponse.json() as {
        data: {
          theme: string;
          language: string;
          autoSave: boolean;
          updateChannel: string;
          customPlatformRootPaths: Record<string, string>;
          customSkillPlatformPaths: Record<string, string>;
          skillPlatformOrder: string[];
          skillProjects: unknown[];
          backgroundImageOpacity: number;
          backgroundImageBlur: number;
          sync: { enabled: boolean; provider: string; autoSync: boolean };
          device: {
            syncCadence: string;
            storeAutoSync: boolean;
            storeSyncCadence: string;
          };
        };
      };

      expect(otherSettings.data).toEqual(expect.objectContaining({
        theme: 'system',
        language: 'zh',
        autoSave: true,
        updateChannel: 'stable',
        customPlatformRootPaths: {},
        customSkillPlatformPaths: {},
        skillPlatformOrder: [],
        skillProjects: [],
        backgroundImageOpacity: 0.22,
        backgroundImageBlur: 14,
        sync: {
          enabled: false,
          provider: 'manual',
          autoSync: false,
        },
        device: {
          syncCadence: 'manual',
          storeAutoSync: true,
          storeSyncCadence: '1d',
        },
      }));
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('preserves nested sync and device settings during partial nested updates', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-settings-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload } = await registerUser(app, 'settingsnestedpatch', 'debugpass001');
      const token = payload.data.accessToken;

      const initialUpdate = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            sync: {
              enabled: true,
              provider: 'webdav',
              endpoint: 'https://dav.example.com/remote.php/dav/files/demo',
              username: 'alice',
              password: 'secret',
              remotePath: '/prompthub/backups',
              autoSync: true,
              lastSyncAt: '2026-04-13T10:00:00.000Z',
            },
            device: {
              syncCadence: '15m',
              storeAutoSync: true,
              storeSyncCadence: '1h',
            },
          }),
        }),
      );
      expect(initialUpdate.status).toBe(200);

      const partialNestedUpdate = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            sync: {
              lastSyncAt: '2026-04-14T10:00:00.000Z',
            },
            device: {
              storeAutoSync: false,
            },
          }),
        }),
      );
      expect(partialNestedUpdate.status).toBe(200);

      const settingsResponse = await app.request(
        new Request('http://local/api/settings', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(settingsResponse.status).toBe(200);
      const settingsBody = await settingsResponse.json() as {
        data: {
          sync: {
            enabled?: boolean;
            provider?: string;
            endpoint?: string;
            username?: string;
            password?: string;
            remotePath?: string;
            autoSync?: boolean;
            lastSyncAt?: string;
          };
          device: {
            syncCadence?: string;
            storeAutoSync?: boolean;
            storeSyncCadence?: string;
          };
        };
      };

      expect(settingsBody.data.sync).toEqual({
        enabled: true,
        provider: 'webdav',
        endpoint: 'https://dav.example.com/remote.php/dav/files/demo',
        username: 'alice',
        password: 'secret',
        remotePath: '/prompthub/backups',
        autoSync: true,
        lastSyncAt: '2026-04-14T10:00:00.000Z',
      });
      expect(settingsBody.data.device).toEqual({
        syncCadence: '15m',
        storeAutoSync: false,
        storeSyncCadence: '1h',
      });
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('validates malformed settings updates', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-settings-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload } = await registerUser(app, 'settingsvalidate', 'debugpass001');
      const token = payload.data.accessToken;

      const invalidLanguage = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({ language: 'it' }),
        }),
      );

      expect(invalidLanguage.status).toBe(422);
      const invalidLanguageBody = await invalidLanguage.json() as { error: { code: string; message: string } };
      expect(invalidLanguageBody.error.code).toBe('VALIDATION_ERROR');
      expect(invalidLanguageBody.error.message).toContain('language');

      const invalidSyncEndpoint = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            sync: {
              enabled: true,
              provider: 'webdav',
              endpoint: 'not-a-url',
            },
          }),
        }),
      );

      expect(invalidSyncEndpoint.status).toBe(422);
      const invalidSyncEndpointBody = await invalidSyncEndpoint.json() as { error: { code: string; message: string } };
      expect(invalidSyncEndpointBody.error.code).toBe('VALIDATION_ERROR');
      expect(invalidSyncEndpointBody.error.message).toContain('sync.endpoint');

      const insecureSyncEndpoint = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            sync: {
              enabled: true,
              provider: 'webdav',
              endpoint: 'http://dav.example.com/remote.php/dav/files/settings',
            },
          }),
        }),
      );

      expect(insecureSyncEndpoint.status).toBe(422);
      const insecureSyncEndpointBody = await insecureSyncEndpoint.json() as { error: { code: string; message: string } };
      expect(insecureSyncEndpointBody.error.code).toBe('VALIDATION_ERROR');
      expect(insecureSyncEndpointBody.error.message).toContain('sync.endpoint');
      expect(insecureSyncEndpointBody.error.message).toContain('WebDAV endpoint must use HTTPS');

      const invalidRemotePath = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            sync: {
              enabled: true,
              provider: 'webdav',
              endpoint: 'https://dav.example.com/remote.php/dav/files/settings',
              remotePath: 'bad\\path',
            },
          }),
        }),
      );

      expect(invalidRemotePath.status).toBe(422);
      const invalidRemotePathBody = await invalidRemotePath.json() as { error: { code: string; message: string } };
      expect(invalidRemotePathBody.error.code).toBe('VALIDATION_ERROR');
      expect(invalidRemotePathBody.error.message).toContain('sync.remotePath');
      expect(invalidRemotePathBody.error.message).toContain('Invalid WebDAV remote path');

      const oversizedSyncConfig = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
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
          }),
        }),
      );

      expect(oversizedSyncConfig.status).toBe(422);
      const oversizedSyncConfigBody = await oversizedSyncConfig.json() as { error: { code: string; message: string } };
      expect(oversizedSyncConfigBody.error.code).toBe('VALIDATION_ERROR');
      expect(oversizedSyncConfigBody.error.message).toContain('sync.endpoint');
      expect(oversizedSyncConfigBody.error.message).toContain('sync.username');
      expect(oversizedSyncConfigBody.error.message).toContain('sync.password');
      expect(oversizedSyncConfigBody.error.message).toContain('sync.remotePath');
      expect(oversizedSyncConfigBody.error.message).toContain('sync.lastSyncAt');

      const tooManyTags = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            promptTagCatalog: Array.from({ length: 201 }, (_, index) => `tag-${index}`),
          }),
        }),
      );
      expect(tooManyTags.status).toBe(422);
      const tooManyTagsBody = await tooManyTags.json() as { error: { code: string; message: string } };
      expect(tooManyTagsBody.error.code).toBe('VALIDATION_ERROR');
      expect(tooManyTagsBody.error.message).toContain('promptTagCatalog');

      const overlongTag = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            promptTagCatalog: ['a'.repeat(101)],
          }),
        }),
      );
      expect(overlongTag.status).toBe(422);
      const overlongTagBody = await overlongTag.json() as { error: { code: string; message: string } };
      expect(overlongTagBody.error.code).toBe('VALIDATION_ERROR');
      expect(overlongTagBody.error.message).toContain('promptTagCatalog');

      const blankTag = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            promptTagCatalog: ['   '],
          }),
        }),
      );
      expect(blankTag.status).toBe(422);
      const blankTagBody = await blankTag.json() as { error: { code: string; message: string } };
      expect(blankTagBody.error.code).toBe('VALIDATION_ERROR');
      expect(blankTagBody.error.message).toContain('promptTagCatalog');

      const malformedLivePreferences = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            backgroundImageFileName: '../wallpaper.png',
            backgroundImageBlur: 51,
            lastManualBackupAt: 'not-an-iso-date',
            lastManualBackupVersion: 'v'.repeat(121),
          }),
        }),
      );

      expect(malformedLivePreferences.status).toBe(422);
      const malformedLivePreferencesBody = await malformedLivePreferences.json() as {
        error: { code: string; message: string };
      };
      expect(malformedLivePreferencesBody.error.code).toBe('VALIDATION_ERROR');
      expect(malformedLivePreferencesBody.error.message).toContain('backgroundImageFileName');
      expect(malformedLivePreferencesBody.error.message).toContain('backgroundImageBlur');
      expect(malformedLivePreferencesBody.error.message).toContain('lastManualBackupAt');
      expect(malformedLivePreferencesBody.error.message).toContain('lastManualBackupVersion');

      const settingsResponse = await app.request(
        new Request('http://local/api/settings', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(settingsResponse.status).toBe(200);
      const settingsBody = await settingsResponse.json() as {
        data: {
          promptTagCatalog: string[];
          backgroundImageFileName?: string;
          backgroundImageBlur?: number;
          lastManualBackupAt?: string;
          lastManualBackupVersion?: string;
        };
      };
      expect(settingsBody.data.promptTagCatalog).toEqual([]);
      expect(settingsBody.data.backgroundImageFileName).toBeUndefined();
      expect(settingsBody.data.backgroundImageBlur).toBe(14);
      expect(settingsBody.data.lastManualBackupAt).toBeUndefined();
      expect(settingsBody.data.lastManualBackupVersion).toBeUndefined();
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects malformed custom agent settings without persisting them', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-settings-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload } = await registerUser(app, 'settingsagents', 'debugpass001');
      const token = payload.data.accessToken;
      const validAgent = {
        id: 'custom-agent-1',
        name: 'Custom Agent 1',
        rootPath: '/tmp/custom-agent-1',
      };

      const tooManyAgents = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            customAgents: Array.from({ length: 33 }, (_, index) => ({
              id: `custom-agent-${index}`,
              name: `Custom Agent ${index}`,
              rootPath: `/tmp/custom-agent-${index}`,
            })),
          }),
        }),
      );
      expect(tooManyAgents.status).toBe(422);
      const tooManyAgentsBody = await tooManyAgents.json() as { error: { code: string; message: string } };
      expect(tooManyAgentsBody.error.code).toBe('VALIDATION_ERROR');
      expect(tooManyAgentsBody.error.message).toContain('customAgents');

      const blankName = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            customAgents: [{ ...validAgent, name: '   ' }],
          }),
        }),
      );
      expect(blankName.status).toBe(422);

      const blankRootPath = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            customAgents: [{ ...validAgent, rootPath: '   ' }],
          }),
        }),
      );
      expect(blankRootPath.status).toBe(422);

      const tooManyConfigPaths = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            customAgents: [{
              ...validAgent,
              configRelativePaths: Array.from({ length: 17 }, (_, index) => `config-${index}.json`),
            }],
          }),
        }),
      );
      expect(tooManyConfigPaths.status).toBe(422);
      const tooManyConfigPathsBody = await tooManyConfigPaths.json() as { error: { code: string; message: string } };
      expect(tooManyConfigPathsBody.error.code).toBe('VALIDATION_ERROR');
      expect(tooManyConfigPathsBody.error.message).toContain('customAgents');

      const settingsResponse = await app.request(
        new Request('http://local/api/settings', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(settingsResponse.status).toBe(200);
      const settingsBody = await settingsResponse.json() as { data: { customAgents: unknown[] } };
      expect(settingsBody.data.customAgents).toEqual([]);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects malformed skill project settings without persisting them', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-settings-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload } = await registerUser(app, 'settingsprojects', 'debugpass001');
      const token = payload.data.accessToken;
      const validProject = {
        id: 'project-1',
        name: 'Project 1',
        rootPath: '/tmp/project-1',
        scanPaths: ['/tmp/project-1/.agents/skills'],
        deployTargets: ['/tmp/project-1/.agents/skills'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const tooManyProjects = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            skillProjects: Array.from({ length: 33 }, (_, index) => ({
              ...validProject,
              id: `project-${index}`,
              name: `Project ${index}`,
              rootPath: `/tmp/project-${index}`,
            })),
          }),
        }),
      );
      expect(tooManyProjects.status).toBe(422);
      const tooManyProjectsBody = await tooManyProjects.json() as { error: { code: string; message: string } };
      expect(tooManyProjectsBody.error.code).toBe('VALIDATION_ERROR');
      expect(tooManyProjectsBody.error.message).toContain('skillProjects');

      const blankName = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            skillProjects: [{ ...validProject, name: '   ' }],
          }),
        }),
      );
      expect(blankName.status).toBe(422);

      const blankRootPath = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            skillProjects: [{ ...validProject, rootPath: '   ' }],
          }),
        }),
      );
      expect(blankRootPath.status).toBe(422);

      const tooManyScanPaths = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            skillProjects: [{
              ...validProject,
              scanPaths: Array.from({ length: 33 }, (_, index) => `/tmp/project-1/scan-${index}`),
            }],
          }),
        }),
      );
      expect(tooManyScanPaths.status).toBe(422);

      const tooManyDeployTargets = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            skillProjects: [{
              ...validProject,
              deployTargets: Array.from({ length: 33 }, (_, index) => `/tmp/project-1/deploy-${index}`),
            }],
          }),
        }),
      );
      expect(tooManyDeployTargets.status).toBe(422);

      const settingsResponse = await app.request(
        new Request('http://local/api/settings', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(settingsResponse.status).toBe(200);
      const settingsBody = await settingsResponse.json() as { data: { skillProjects: unknown[] } };
      expect(settingsBody.data.skillProjects).toEqual([]);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects malformed platform settings without persisting them', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-settings-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload } = await registerUser(app, 'settingsplatforms', 'debugpass001');
      const token = payload.data.accessToken;

      const tooManyPlatformPaths = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            customPlatformRootPaths: Object.fromEntries(
              Array.from({ length: 65 }, (_, index) => [`platform-${index}`, `/tmp/platform-${index}`]),
            ),
          }),
        }),
      );
      expect(tooManyPlatformPaths.status).toBe(422);
      const tooManyPlatformPathsBody = await tooManyPlatformPaths.json() as {
        error: { code: string; message: string };
      };
      expect(tooManyPlatformPathsBody.error.code).toBe('VALIDATION_ERROR');
      expect(tooManyPlatformPathsBody.error.message).toContain('customPlatformRootPaths');

      const blankPlatformPath = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            customPlatformRootPaths: {
              claude: '   ',
            },
          }),
        }),
      );
      expect(blankPlatformPath.status).toBe(422);

      const blankOverrideRootPath = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            builtinAgentOverrides: {
              claude: {
                rootPath: '   ',
              },
            },
          }),
        }),
      );
      expect(blankOverrideRootPath.status).toBe(422);

      const tooManyOverrideConfigPaths = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            builtinAgentOverrides: {
              claude: {
                rootPath: '/tmp/claude',
                configRelativePaths: Array.from({ length: 17 }, (_, index) => `config-${index}.json`),
              },
            },
          }),
        }),
      );
      expect(tooManyOverrideConfigPaths.status).toBe(422);

      const blankDisabledPlatformId = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            disabledPlatformIds: ['claude', '   '],
          }),
        }),
      );
      expect(blankDisabledPlatformId.status).toBe(422);

      const tooManyPlatformIds = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            skillPlatformOrder: Array.from({ length: 65 }, (_, index) => `platform-${index}`),
          }),
        }),
      );
      expect(tooManyPlatformIds.status).toBe(422);

      const settingsResponse = await app.request(
        new Request('http://local/api/settings', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(settingsResponse.status).toBe(200);
      const settingsBody = await settingsResponse.json() as {
        data: {
          builtinAgentOverrides: Record<string, unknown>;
          customPlatformRootPaths: Record<string, string>;
          disabledPlatformIds: string[];
          skillPlatformOrder: string[];
        };
      };
      expect(settingsBody.data.builtinAgentOverrides).toEqual({});
      expect(settingsBody.data.customPlatformRootPaths).toEqual({});
      expect(settingsBody.data.disabledPlatformIds).toEqual([]);
      expect(settingsBody.data.skillPlatformOrder).toEqual([]);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects security state in normal settings updates', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-settings-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload } = await registerUser(app, 'settingssecurity', 'debugpass001');
      const token = payload.data.accessToken;

      const response = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            theme: 'dark',
            security: {
              masterPasswordConfigured: true,
              unlocked: true,
            },
          }),
        }),
      );

      expect(response.status).toBe(422);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('security');

      const settingsResponse = await app.request(
        new Request('http://local/api/settings', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(settingsResponse.status).toBe(200);
      const settingsBody = await settingsResponse.json() as {
        data: {
          theme: string;
          security?: {
            masterPasswordConfigured: boolean;
            unlocked: boolean;
          };
        };
      };

      expect(settingsBody.data.theme).toBe('system');
      expect(settingsBody.data.security).toBeUndefined();
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('persists supported live preference fields beyond the minimal web form', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-settings-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload } = await registerUser(app, 'settingsfull', 'debugpass001');
      const token = payload.data.accessToken;

      const response = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            tagFilterMode: 'single',
            promptTagCatalog: ['work', 'personal'],
            backgroundImageFileName: 'wallpaper.png',
            backgroundImageOpacity: 0.4,
            backgroundImageBlur: 8,
            customAgents: [{
              id: 'valid-agent',
              name: 'Valid Agent',
              rootPath: '/tmp/valid-agent',
              skillsRelativePath: 'skills',
              configRelativePaths: ['config.json'],
            }],
            skillProjects: [{
              id: 'valid-project',
              name: 'Valid Project',
              rootPath: '/tmp/valid-project',
              scanPaths: ['/tmp/valid-project/.agents/skills'],
              deployTargets: ['/tmp/valid-project/.agents/skills'],
              createdAt: 1780999200000,
              updatedAt: 1780999200000,
            }],
            builtinAgentOverrides: {
              claude: {
                rootPath: '/tmp/claude-override',
                skillsRelativePath: 'skills',
                configRelativePaths: ['config.json'],
              },
            },
            customPlatformRootPaths: {
              codex: '/tmp/codex-root',
            },
            customAgentRootPaths: ['/tmp/custom-agent-root'],
            disabledPlatformIds: ['cursor'],
            customSkillPlatformPaths: {
              cherry: '/tmp/cherry-skills',
            },
            skillPlatformOrder: ['codex', 'claude'],
            updateChannel: 'preview',
            launchAtStartup: true,
            minimizeOnLaunch: true,
          }),
        }),
      );

      expect(response.status).toBe(200);

      const settingsResponse = await app.request(
        new Request('http://local/api/settings', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(settingsResponse.status).toBe(200);
      const settingsBody = await settingsResponse.json() as {
        data: {
          tagFilterMode?: string;
          promptTagCatalog?: string[];
          backgroundImageFileName?: string;
          backgroundImageOpacity?: number;
          backgroundImageBlur?: number;
          customAgents?: Array<{
            id: string;
            name: string;
            rootPath: string;
            skillsRelativePath?: string;
            configRelativePaths?: string[];
          }>;
          skillProjects?: Array<{
            id: string;
            name: string;
            rootPath: string;
            scanPaths: string[];
            deployTargets?: string[];
            createdAt: number;
            updatedAt: number;
          }>;
          builtinAgentOverrides?: Record<string, {
            rootPath?: string;
            skillsRelativePath?: string;
            configRelativePaths?: string[];
          }>;
          customPlatformRootPaths?: Record<string, string>;
          customAgentRootPaths?: string[];
          disabledPlatformIds?: string[];
          customSkillPlatformPaths?: Record<string, string>;
          skillPlatformOrder?: string[];
          updateChannel?: string;
          launchAtStartup?: boolean;
          minimizeOnLaunch?: boolean;
        };
      };

      expect(settingsBody.data).toEqual(expect.objectContaining({
        tagFilterMode: 'single',
        promptTagCatalog: ['work', 'personal'],
        backgroundImageFileName: 'wallpaper.png',
        backgroundImageOpacity: 0.4,
        backgroundImageBlur: 8,
        customAgents: [{
          id: 'valid-agent',
          name: 'Valid Agent',
          rootPath: '/tmp/valid-agent',
          skillsRelativePath: 'skills',
          configRelativePaths: ['config.json'],
        }],
        skillProjects: [{
          id: 'valid-project',
          name: 'Valid Project',
          rootPath: '/tmp/valid-project',
          scanPaths: ['/tmp/valid-project/.agents/skills'],
          deployTargets: ['/tmp/valid-project/.agents/skills'],
          createdAt: 1780999200000,
          updatedAt: 1780999200000,
        }],
        builtinAgentOverrides: {
          claude: {
            rootPath: '/tmp/claude-override',
            skillsRelativePath: 'skills',
            configRelativePaths: ['config.json'],
          },
        },
        customPlatformRootPaths: {
          codex: '/tmp/codex-root',
        },
        customAgentRootPaths: ['/tmp/custom-agent-root'],
        disabledPlatformIds: ['cursor'],
        customSkillPlatformPaths: {
          cherry: '/tmp/cherry-skills',
        },
        skillPlatformOrder: ['codex', 'claude'],
        updateChannel: 'preview',
        launchAtStartup: true,
        minimizeOnLaunch: true,
      }));
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('clears defaultFolderId when settings update sends null', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-settings-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload } = await registerUser(app, 'settingsclearfolder', 'debugpass001');
      const token = payload.data.accessToken;

      const folder = await createFolder(app, token, { name: 'Default Folder' });
      expect(folder.response.status).toBe(201);

      const setDefault = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({ defaultFolderId: folder.payload.data!.id }),
        }),
      );
      expect(setDefault.status).toBe(200);

      const clearDefault = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({ defaultFolderId: null }),
        }),
      );
      expect(clearDefault.status).toBe(200);

      const settingsResponse = await app.request(
        new Request('http://local/api/settings', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(settingsResponse.status).toBe(200);
      const settingsBody = await settingsResponse.json() as {
        data: {
          defaultFolderId?: string;
        };
      };

      expect(settingsBody.data.defaultFolderId).toBeUndefined();
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);
});
