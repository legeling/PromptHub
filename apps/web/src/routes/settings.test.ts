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
          customSkillPlatformPaths: Record<string, string>;
          skillPlatformOrder: string[];
          sync: { enabled: boolean; provider: string; autoSync: boolean };
          device: {
            syncCadence: string;
            storeAutoSync: boolean;
            storeSyncCadence: string;
          };
        };
      };

      expect(body.data).toEqual({
        theme: 'system',
        language: 'zh',
        autoSave: true,
        customSkillPlatformPaths: {},
        skillPlatformOrder: [],
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
      });

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
            customSkillPlatformPaths: {
              claude: '/tmp/custom-claude-skills',
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
          customSkillPlatformPaths: Record<string, string>;
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
      expect(ownerSettings.data.customSkillPlatformPaths).toEqual({
        claude: '/tmp/custom-claude-skills',
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
          customSkillPlatformPaths: Record<string, string>;
          skillPlatformOrder: string[];
          sync: { enabled: boolean; provider: string; autoSync: boolean };
          device: {
            syncCadence: string;
            storeAutoSync: boolean;
            storeSyncCadence: string;
          };
        };
      };

      expect(otherSettings.data).toEqual({
        theme: 'system',
        language: 'zh',
        autoSave: true,
        customSkillPlatformPaths: {},
        skillPlatformOrder: [],
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
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);
});
