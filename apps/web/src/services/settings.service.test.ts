import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
  const [{ getServerDatabase }] = await Promise.all([import('../database')]);
  const db = getServerDatabase();
  const now = Date.now();
  const user = {
    id: `settings-user-${username}`,
    username,
    role: 'admin' as const,
  };

  db.prepare(
    `INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(user.id, user.username, 'test-password-hash', user.role, now, now);

  return { user };
}

describe('web settings workspace storage', () => {
  const TEST_TIMEOUT = 20000;
  let dataDir = '';

  beforeAll(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-settings-service-test-'));
    configureTestEnv(dataDir);
    vi.resetModules();
  });

  afterAll(() => {
    closeDatabase();
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes default settings into a per-user workspace file on first read', async () => {
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
  }, TEST_TIMEOUT);

  it('persists updated settings into both sqlite and workspace json', async () => {
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
  }, TEST_TIMEOUT);

  it('removes cleared nullable settings from sqlite and workspace json', async () => {
    const owner = await createUser('settings-owner-clear');
    const [{ SettingsService }, { getServerDatabase }] = await Promise.all([
      import('./settings.service'),
      import('../database'),
    ]);

    const service = new SettingsService();
    service.set(owner.user.id, {
      defaultFolderId: 'folder-to-clear',
    });

    service.set(owner.user.id, {
      defaultFolderId: null,
    });

    const settings = service.get(owner.user.id);
    expect(settings.defaultFolderId).toBeUndefined();

    const db = getServerDatabase();
    const row = db
      .prepare('SELECT value FROM user_settings WHERE user_id = ? AND key = ?')
      .get(owner.user.id, 'defaultFolderId');
    expect(row).toBeNull();

    const settingsFile = path.join(
      dataDir,
      'config',
      'settings',
      `${owner.user.id}.json`,
    );
    const saved = JSON.parse(fs.readFileSync(settingsFile, 'utf8')) as {
      defaultFolderId?: string;
    };
    expect(saved.defaultFolderId).toBeUndefined();
  }, TEST_TIMEOUT);

  it('hydrates sqlite from the workspace settings file when database rows are missing', async () => {
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
  }, TEST_TIMEOUT);

  it('uses the workspace file as the merge base when the first write happens before any read', async () => {
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
  }, TEST_TIMEOUT);

  it('preserves the existing workspace file when a settings mirror write is interrupted', async () => {
    const owner = await createUser('settings-owner-atomic');
    const [{ SettingsService }] = await Promise.all([import('./settings.service')]);
    const settingsDir = path.join(dataDir, 'config', 'settings');
    const settingsFile = path.join(settingsDir, `${owner.user.id}.json`);
    const existingSettings = {
      theme: 'light',
      language: 'en',
      autoSave: true,
    };
    const existingContent = `${JSON.stringify(existingSettings, null, 2)}\n`;
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(settingsFile, existingContent, 'utf8');

    const service = new SettingsService();
    const originalWriteFileSync = fs.writeFileSync.bind(fs);
    let interrupted = false;
    vi.spyOn(fs, 'writeFileSync').mockImplementation((file, data, options) => {
      const filePath = String(file);
      if (!interrupted && filePath.startsWith(settingsDir)) {
        interrupted = true;
        originalWriteFileSync(file, '[', options as BufferEncoding);
        throw new Error('simulated interrupted settings mirror write');
      }

      return originalWriteFileSync(file, data, options as BufferEncoding);
    });

    expect(() =>
      service.set(owner.user.id, {
        theme: 'dark',
      }),
    ).toThrow('simulated interrupted settings mirror write');

    expect(fs.readFileSync(settingsFile, 'utf8')).toBe(existingContent);
  }, TEST_TIMEOUT);
});
