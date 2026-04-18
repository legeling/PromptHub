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
  process.env.PORT = '3992';
  process.env.HOST = '127.0.0.1';
  process.env.JWT_SECRET = 'test-secret-for-web-device-flow-1234567890';
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
      accessToken: string;
    };
  };

  return payload.data.accessToken;
}

function authHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

describe('web devices routes', () => {
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

  it('registers desktop heartbeats and lists connected devices', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-devices-test-'));

    try {
      const app = await createTestApp(dataDir);
      const token = await registerUser(app, 'deviceowner', 'debugpass001');

      const heartbeatResponse = await app.request(
        new Request('http://local/api/devices/heartbeat', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            id: 'desktop-001',
            type: 'desktop',
            name: 'PromptHub Desktop',
            platform: 'macOS',
            appVersion: '0.5.2',
            clientVersion: '0.5.2',
            userAgent: 'PromptHubDesktop/0.5.2',
          }),
        }),
      );

      expect(heartbeatResponse.status).toBe(200);
      const heartbeatPayload = await heartbeatResponse.json() as {
        data: {
          id: string;
          type: string;
          name: string;
          platform: string;
          appVersion?: string;
          firstSeenAt: string;
          lastSeenAt: string;
        };
      };

      expect(heartbeatPayload.data).toEqual(
        expect.objectContaining({
          id: 'desktop-001',
          type: 'desktop',
          name: 'PromptHub Desktop',
          platform: 'macOS',
          appVersion: '0.5.2',
        }),
      );
      expect(heartbeatPayload.data.firstSeenAt).toBeTruthy();
      expect(heartbeatPayload.data.lastSeenAt).toBeTruthy();

      const listResponse = await app.request(
        new Request('http://local/api/devices', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );

      expect(listResponse.status).toBe(200);
      const listPayload = await listResponse.json() as {
        data: Array<{
          id: string;
          type: string;
          name: string;
          platform: string;
          appVersion?: string;
        }>;
      };

      expect(listPayload.data).toEqual([
        expect.objectContaining({
          id: 'desktop-001',
          type: 'desktop',
          name: 'PromptHub Desktop',
          platform: 'macOS',
          appVersion: '0.5.2',
        }),
      ]);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);
});
