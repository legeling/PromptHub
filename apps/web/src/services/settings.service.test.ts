import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function configureTestEnv(dataDir: string): void {
  process.env.PORT = '3994';
  process.env.HOST = '127.0.0.1';
  process.env.JWT_SECRET = 'test-secret-for-web-settings-service-1234567890';
  process.env.JWT_ACCESS_TTL = '900';
  process.env.JWT_REFRESH_TTL = '604800';
  process.env.DATA_ROOT = dataDir;
  process.env.ALLOW_REGISTRATION = 'true';
  process.env.LOG_LEVEL = 'debug';
}

async function createUser(username: string) {
  const [{ AuthService }] = await Promise.all([import('./auth.service')]);
  const authService = new AuthService();
  return authService.register(username, 'debugpass001');
}

describe('web settings workspace storage', () => {
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

  it('writes default settings into a per-user workspace file on first read', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-settings-service-test-'));

    try {
      configureTestEnv(dataDir);
      const owner = await createUser('settings-owner-1');
      const [{ SettingsService }] = await Promise.all([import('./settings.service')]);

      const service = new SettingsService();
      const settings = service.get(owner.user.id);

      expect(settings.theme).toBe('system');
      expect(settings.language).toBe('zh');

      const settingsFile = path.join(
        dataDir,
        'config',
        'settings',
        `${owner.user.id}.json`,
      );
      expect(fs.existsSync(settingsFile)).toBe(true);

      const saved = JSON.parse(fs.readFileSync(settingsFile, 'utf8')) as {
        theme: string;
        language: string;
        autoSave: boolean;
      };
      expect(saved).toMatchObject({
        theme: 'system',
        language: 'zh',
        autoSave: true,
      });
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('persists updated settings into both sqlite and workspace json', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-settings-service-test-'));

    try {
      configureTestEnv(dataDir);
      const owner = await createUser('settings-owner-2');
      const [{ SettingsService }] = await Promise.all([import('./settings.service')]);

      const service = new SettingsService();
      service.set(owner.user.id, {
        theme: 'dark',
        language: 'en',
        sync: {
          enabled: true,
          provider: 'webdav',
          endpoint: 'https://dav.example.com/backups',
          username: 'alice',
          password: 'secret',
          autoSync: true,
        },
      });

      const settings = service.get(owner.user.id);
      expect(settings.theme).toBe('dark');
      expect(settings.language).toBe('en');
      expect(settings.sync).toMatchObject({
        enabled: true,
        provider: 'webdav',
        endpoint: 'https://dav.example.com/backups',
        username: 'alice',
        password: 'secret',
        autoSync: true,
      });

      const settingsFile = path.join(
        dataDir,
        'config',
        'settings',
        `${owner.user.id}.json`,
      );
      const saved = JSON.parse(fs.readFileSync(settingsFile, 'utf8')) as {
        theme: string;
        language: string;
        sync: { provider: string; endpoint?: string };
      };
      expect(saved.theme).toBe('dark');
      expect(saved.language).toBe('en');
      expect(saved.sync).toMatchObject({
        provider: 'webdav',
        endpoint: 'https://dav.example.com/backups',
      });
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('hydrates sqlite from the workspace settings file when database rows are missing', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-settings-service-test-'));

    try {
      configureTestEnv(dataDir);
      const owner = await createUser('settings-owner-3');
      const [{ SettingsService }, { getServerDatabase }] = await Promise.all([
        import('./settings.service'),
        import('../database'),
      ]);

      const settingsDir = path.join(dataDir, 'config', 'settings');
      fs.mkdirSync(settingsDir, { recursive: true });
      fs.writeFileSync(
        path.join(settingsDir, `${owner.user.id}.json`),
        JSON.stringify(
          {
            theme: 'light',
            language: 'ja',
            autoSave: false,
            sync: {
              enabled: false,
              provider: 'manual',
              autoSync: false,
            },
          },
          null,
          2,
        ),
        'utf8',
      );

      const db = getServerDatabase();
      db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(owner.user.id);

      const service = new SettingsService();
      const settings = service.get(owner.user.id);

      expect(settings).toMatchObject({
        theme: 'light',
        language: 'ja',
        autoSave: false,
      });
      expect(service.has(owner.user.id)).toBe(true);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('uses the workspace file as the merge base when the first write happens before any read', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-settings-service-test-'));

    try {
      configureTestEnv(dataDir);
      const owner = await createUser('settings-owner-4');
      const [{ SettingsService }, { getServerDatabase }] = await Promise.all([
        import('./settings.service'),
        import('../database'),
      ]);

      const settingsDir = path.join(dataDir, 'config', 'settings');
      fs.mkdirSync(settingsDir, { recursive: true });
      fs.writeFileSync(
        path.join(settingsDir, `${owner.user.id}.json`),
        JSON.stringify(
          {
            theme: 'dark',
            language: 'fr',
            autoSave: true,
            sync: {
              enabled: false,
              provider: 'manual',
              autoSync: false,
            },
          },
          null,
          2,
        ),
        'utf8',
      );

      const db = getServerDatabase();
      db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(owner.user.id);

      const service = new SettingsService();
      service.set(owner.user.id, {
        autoSave: false,
      });

      const settings = service.get(owner.user.id);
      expect(settings).toMatchObject({
        theme: 'dark',
        language: 'fr',
        autoSave: false,
      });
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
