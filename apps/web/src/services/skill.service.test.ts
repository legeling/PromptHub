import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase } from '@prompthub/db';
import { ErrorCode } from '../utils/response';

const { requestRemoteBufferedMock } = vi.hoisted(() => ({
  requestRemoteBufferedMock: vi.fn(),
}));

vi.mock('../utils/remote-http.js', () => ({
  requestRemoteBuffered: requestRemoteBufferedMock,
}));

const ENV_KEYS = [
  'PORT',
  'HOST',
  'JWT_SECRET',
  'DATA_ROOT',
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

describe('SkillService', () => {
  beforeEach(() => {
    vi.resetModules();
    requestRemoteBufferedMock.mockReset();
    process.env.PORT = '3997';
    process.env.HOST = '127.0.0.1';
    process.env.JWT_SECRET = 'test-secret-for-web-skill-service-1234567890';
    process.env.DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-skill-service-test-'));
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

  it('rejects non-HTTPS remote skill URLs before calling the transport', async () => {
    const { SkillService, SkillServiceError } = await import('./skill.service');
    const service = new SkillService();

    await expect(
      service.fetchRemote(
        { userId: 'skill-service-user', role: 'user' },
        { url: 'http://example.com/insecure-skill.md' },
      ),
    ).rejects.toMatchObject({
      status: 422,
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Remote skill URL must use HTTPS',
    } satisfies Partial<InstanceType<typeof SkillServiceError>>);

    expect(requestRemoteBufferedMock).not.toHaveBeenCalled();
  });

  it('defaults normal user remote skill imports to private visibility', async () => {
    const [{ SkillService }, { getServerDatabase }] = await Promise.all([
      import('./skill.service'),
      import('../database'),
    ]);
    const service = new SkillService();
    const db = getServerDatabase();
    const userActor = { userId: 'skill-service-remote-user', role: 'user' as const };
    const now = Date.now();
    db.prepare(
      `INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(userActor.userId, 'skill-service-remote-user', 'test-password-hash', userActor.role, now, now);
    requestRemoteBufferedMock.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/markdown' },
      body: Buffer.from('---\nname: Direct Remote Helper\n---\n\nUse privately.', 'utf-8'),
      finalUrl: 'https://example.com/skills/direct-remote-helper.md',
    });

    const result = await service.fetchRemote(userActor, {
      url: 'https://example.com/skills/direct-remote-helper.md',
      importToLibrary: true,
    });

    expect(result.importedSkill).toEqual(expect.objectContaining({
      name: 'direct-remote-helper',
      ownerUserId: userActor.userId,
      visibility: 'private',
    }));
  });

  it('validates skill URL metadata protocols for direct service writes', async () => {
    const [{ SkillService, SkillServiceError }, { getServerDatabase }] = await Promise.all([
      import('./skill.service'),
      import('../database'),
    ]);
    const service = new SkillService();
    const db = getServerDatabase();
    const userActor = { userId: 'skill-service-url-user', role: 'user' as const };
    const now = Date.now();
    db.prepare(
      `INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(userActor.userId, 'skill-service-url-user', 'test-password-hash', userActor.role, now, now);

    let caughtError: unknown;
    try {
      service.create(userActor, {
        name: 'unsafe-service-url-skill',
        content: 'echo unsafe',
        protocol_type: 'skill',
        visibility: 'private',
        source_url: 'javascript:alert(1)',
        is_favorite: false,
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(SkillServiceError);
    expect(caughtError).toMatchObject({
      status: 422,
      code: ErrorCode.VALIDATION_ERROR,
      message: 'source_url must use HTTP(S)',
    });

    const safeIcon = service.create(userActor, {
      name: 'safe-service-icon-skill',
      content: 'echo safe',
      protocol_type: 'skill',
      visibility: 'private',
      icon_url: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      is_favorite: false,
    });

    expect(safeIcon).toEqual(expect.objectContaining({
      name: 'safe-service-icon-skill',
      icon_url: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    }));
  });

  it('lists visible skills without per-skill detail queries', async () => {
    const [{ SkillService }, { getServerDatabase }] = await Promise.all([
      import('./skill.service'),
      import('../database'),
    ]);
    const service = new SkillService();
    const db = getServerDatabase();
    const adminActor = { userId: 'skill-service-admin', role: 'admin' as const };
    const userActor = { userId: 'skill-service-user', role: 'user' as const };
    const otherActor = { userId: 'other-user', role: 'user' as const };
    const now = Date.now();

    db.prepare(
      `INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(adminActor.userId, 'skill-service-admin', 'test-password-hash', adminActor.role, now, now);
    db.prepare(
      `INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(userActor.userId, 'skill-service-user', 'test-password-hash', userActor.role, now, now);
    db.prepare(
      `INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(otherActor.userId, 'other-user', 'test-password-hash', otherActor.role, now, now);

    const privateSkill = service.create(userActor, {
      name: 'private-list-skill',
      content: 'private content',
      protocol_type: 'skill',
      visibility: 'private',
      tags: ['local'],
      is_favorite: false,
    });
    const sharedSkill = service.create(adminActor, {
      name: 'shared-list-skill',
      content: 'shared content',
      protocol_type: 'skill',
      visibility: 'shared',
      tags: ['team'],
      prerequisites: ['Node.js 20'],
      compatibility: ['Codex CLI'],
      is_favorite: false,
    });
    service.create(otherActor, {
      name: 'other-private-list-skill',
      content: 'hidden content',
      protocol_type: 'skill',
      visibility: 'private',
      is_favorite: false,
    });

    const prepareSpy = vi.spyOn(db, 'prepare');
    const listed = service.list(userActor, 'all');

    expect(listed.map((skill) => skill.id)).toEqual([sharedSkill.id, privateSkill.id]);
    expect(listed[0]).toEqual(expect.objectContaining({
      id: sharedSkill.id,
      ownerUserId: adminActor.userId,
      visibility: 'shared',
      content: 'shared content',
      instructions: 'shared content',
      tags: ['team'],
      prerequisites: ['Node.js 20'],
      compatibility: ['Codex CLI'],
    }));
    expect(listed[1]).toEqual(expect.objectContaining({
      id: privateSkill.id,
      ownerUserId: userActor.userId,
      visibility: 'private',
      tags: ['local'],
    }));
    expect(prepareSpy).toHaveBeenCalledTimes(1);
  });
});
