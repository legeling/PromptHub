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

describe('PromptService', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.PORT = '3999';
    process.env.HOST = '127.0.0.1';
    process.env.JWT_SECRET = 'test-secret-for-web-prompt-service-1234567890';
    process.env.DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-prompt-service-test-'));
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

  it('lists visible prompts without per-prompt detail queries', async () => {
    const [{ PromptService }, { getServerDatabase }] = await Promise.all([
      import('./prompt.service'),
      import('../database'),
    ]);
    const service = new PromptService();
    const db = getServerDatabase();
    const adminActor = { userId: 'prompt-service-admin', role: 'admin' as const };
    const userActor = { userId: 'prompt-service-user', role: 'user' as const };
    const otherActor = { userId: 'other-prompt-user', role: 'user' as const };
    const now = Date.now();

    db.prepare(
      `INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(adminActor.userId, 'prompt-service-admin', 'test-password-hash', adminActor.role, now, now);
    db.prepare(
      `INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(userActor.userId, 'prompt-service-user', 'test-password-hash', userActor.role, now, now);
    db.prepare(
      `INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(otherActor.userId, 'other-prompt-user', 'test-password-hash', otherActor.role, now, now);

    const privatePrompt = service.create(userActor, {
      title: 'Private Prompt',
      userPrompt: 'Say hello privately',
      tags: ['local'],
      variables: [{ name: 'name', type: 'text', label: 'User name', required: true }],
      visibility: 'private',
    });
    const sharedPrompt = service.create(adminActor, {
      title: 'Shared Prompt',
      description: 'Shared prompt description',
      systemPrompt: 'Be concise',
      userPrompt: 'Say hello to everyone',
      tags: ['team'],
      images: ['shared.png'],
      videos: ['shared.mp4'],
      visibility: 'shared',
    });
    service.create(otherActor, {
      title: 'Hidden Prompt',
      userPrompt: 'Do not show',
      visibility: 'private',
    });

    const prepareSpy = vi.spyOn(db, 'prepare');
    const listed = service.list(userActor, { scope: 'all' });

    expect(listed.total).toBe(2);
    expect(listed.items.map((prompt) => prompt.id)).toEqual([sharedPrompt.id, privatePrompt.id]);
    expect(listed.items[0]).toEqual(expect.objectContaining({
      id: sharedPrompt.id,
      ownerUserId: adminActor.userId,
      visibility: 'shared',
      title: 'Shared Prompt',
      description: 'Shared prompt description',
      systemPrompt: 'Be concise',
      userPrompt: 'Say hello to everyone',
      tags: ['team'],
      images: ['shared.png'],
      videos: ['shared.mp4'],
    }));
    expect(listed.items[1]).toEqual(expect.objectContaining({
      id: privatePrompt.id,
      ownerUserId: userActor.userId,
      visibility: 'private',
      title: 'Private Prompt',
      tags: ['local'],
      variables: [{ name: 'name', type: 'text', label: 'User name', required: true }],
    }));
    expect(prepareSpy).toHaveBeenCalledTimes(1);
  });

  it('applies prompt list pagination in SQL while preserving filtered totals', async () => {
    const [{ PromptService }, { getServerDatabase }] = await Promise.all([
      import('./prompt.service'),
      import('../database'),
    ]);
    const service = new PromptService();
    const db = getServerDatabase();
    const userActor = { userId: 'prompt-pagination-user', role: 'user' as const };
    const now = Date.now();

    db.prepare(
      `INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(userActor.userId, 'prompt-pagination-user', 'test-password-hash', userActor.role, now, now);

    for (let index = 0; index < 5; index += 1) {
      service.create(userActor, {
        title: `Paged Prompt ${index}`,
        userPrompt: `Page me ${index}`,
        tags: ['paged'],
        visibility: 'private',
      });
    }

    const prepareSpy = vi.spyOn(db, 'prepare');
    const listed = service.list(userActor, {
      scope: 'private',
      tags: ['paged'],
      limit: 2,
      offset: 1,
    });
    const preparedSql = prepareSpy.mock.calls.map(([sql]) => sql);

    expect(listed.total).toBe(5);
    expect(listed.items).toHaveLength(2);
    expect(listed.items.map((prompt) => prompt.title)).toEqual(['Paged Prompt 3', 'Paged Prompt 2']);
    expect(preparedSql.some((sql) => /COUNT\(\*\)/i.test(sql))).toBe(true);
    expect(preparedSql.some((sql) => /LIMIT \? OFFSET \?/i.test(sql))).toBe(true);
    expect(prepareSpy).toHaveBeenCalledTimes(2);
  });
});
