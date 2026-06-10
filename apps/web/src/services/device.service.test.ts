import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
  'PORT',
  'HOST',
  'JWT_SECRET',
  'DATA_ROOT',
  'ALLOW_REGISTRATION',
  'LOG_LEVEL',
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

describe('DeviceService', () => {
  let dataDir: string;

  beforeEach(() => {
    vi.resetModules();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-device-service-test-'));
    process.env.PORT = '3992';
    process.env.HOST = '127.0.0.1';
    process.env.JWT_SECRET = 'test-secret-for-web-device-service-1234567890';
    process.env.DATA_ROOT = dataDir;
    process.env.ALLOW_REGISTRATION = 'true';
    process.env.LOG_LEVEL = 'debug';
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

  it('preserves the existing registry when a heartbeat write is interrupted', async () => {
    const devicesDir = path.join(dataDir, 'config', 'devices');
    const devicesFile = path.join(devicesDir, 'device-user.json');
    const existingRegistry = [
      {
        id: 'desktop-existing',
        type: 'desktop',
        name: 'Existing Desktop',
        platform: 'macOS',
        firstSeenAt: '2026-01-01T00:00:00.000Z',
        lastSeenAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const existingContent = `${JSON.stringify(existingRegistry, null, 2)}\n`;
    fs.mkdirSync(devicesDir, { recursive: true });
    fs.writeFileSync(devicesFile, existingContent, 'utf8');

    const { DeviceService } = await import('./device.service');
    const service = new DeviceService();
    const originalWriteFileSync = fs.writeFileSync.bind(fs);
    let interrupted = false;
    vi.spyOn(fs, 'writeFileSync').mockImplementation((file, data, options) => {
      const filePath = String(file);
      if (!interrupted && filePath.startsWith(devicesDir)) {
        interrupted = true;
        originalWriteFileSync(file, '[', options as BufferEncoding);
        throw new Error('simulated interrupted device registry write');
      }

      return originalWriteFileSync(file, data, options as BufferEncoding);
    });

    expect(() =>
      service.heartbeat('device-user', {
        id: 'browser-new',
        type: 'browser',
        name: 'PromptHub Web',
        platform: 'Browser',
      }),
    ).toThrow('simulated interrupted device registry write');

    expect(fs.readFileSync(devicesFile, 'utf8')).toBe(existingContent);
    expect(service.list('device-user')).toEqual(existingRegistry);
  });
});
