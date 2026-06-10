import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase } from '@prompthub/db';

const ENV_KEYS = [
  'PORT',
  'HOST',
  'JWT_SECRET',
  'DATA_ROOT',
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

describe('FolderService', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.PORT = '3998';
    process.env.HOST = '127.0.0.1';
    process.env.JWT_SECRET = 'test-secret-for-web-folder-service-1234567890';
    process.env.DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-folder-service-test-'));
  });

  afterEach(() => {
    closeDatabase();
    if (process.env.DATA_ROOT) {
      fs.rmSync(process.env.DATA_ROOT, { recursive: true, force: true });
    }
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('lists visible folders without per-folder detail queries', async () => {
    const [{ FolderService }, { getServerDatabase }] = await Promise.all([
      import('./folder.service'),
      import('../database'),
    ]);
    const service = new FolderService();
    const db = getServerDatabase();
    const adminActor = { userId: 'folder-service-admin', role: 'admin' as const };
    const userActor = { userId: 'folder-service-user', role: 'user' as const };
    const otherActor = { userId: 'other-folder-user', role: 'user' as const };
    const now = Date.now();

    db.prepare(
      `INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(adminActor.userId, 'folder-service-admin', 'test-password-hash', adminActor.role, now, now);
    db.prepare(
      `INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(userActor.userId, 'folder-service-user', 'test-password-hash', userActor.role, now, now);
    db.prepare(
      `INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(otherActor.userId, 'other-folder-user', 'test-password-hash', otherActor.role, now, now);

    const privateFolder = service.create(userActor, {
      name: 'Private Folder',
      icon: 'folder',
      visibility: 'private',
    });
    const sharedFolder = service.create(adminActor, {
      name: 'Shared Folder',
      icon: 'shared',
      visibility: 'shared',
    });
    service.create(otherActor, {
      name: 'Hidden Folder',
      visibility: 'private',
    });

    const prepareSpy = vi.spyOn(db, 'prepare');
    const listed = service.list(userActor, 'all');

    expect(listed.map((folder) => folder.id)).toEqual([privateFolder.id, sharedFolder.id]);
    expect(listed[0]).toEqual(expect.objectContaining({
      id: privateFolder.id,
      ownerUserId: userActor.userId,
      visibility: 'private',
      name: 'Private Folder',
      icon: 'folder',
      order: 0,
      isPrivate: true,
    }));
    expect(listed[1]).toEqual(expect.objectContaining({
      id: sharedFolder.id,
      ownerUserId: adminActor.userId,
      visibility: 'shared',
      name: 'Shared Folder',
      icon: 'shared',
      order: 1,
    }));
    expect(prepareSpy).toHaveBeenCalledTimes(1);
  });
});
