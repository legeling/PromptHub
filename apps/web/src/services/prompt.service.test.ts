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

  describe('folder visibility inference (upstream #219)', () => {
    async function setup() {
      const [{ PromptService }, { getServerDatabase }, { FolderDB }] = await Promise.all([
        import('./prompt.service'),
        import('../database'),
        import('@prompthub/db'),
      ]);
      const db = getServerDatabase();
      const service = new PromptService();
      const now = Date.now();
      const insertUser = (userId: string, role: 'admin' | 'user') =>
        db.prepare(
          `INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(userId, userId, 'test-password-hash', role, now, now);
      insertUser('vis-admin', 'admin');
      insertUser('vis-member', 'user');
      const adminActor = { userId: 'vis-admin', role: 'admin' as const };
      const memberActor = { userId: 'vis-member', role: 'user' as const };
      // Same persistence shape as the web folder service: FolderDB stores the
      // base row and the server layer writes the visibility column explicitly.
      const sharedFolderId = new FolderDB(db).create({
        name: 'shared-category',
      }).id;
      db.prepare('UPDATE folders SET visibility = ? WHERE id = ?').run(
        'shared',
        sharedFolderId,
      );
      return { db, service, adminActor, memberActor, sharedFolderId };
    }

    it("derives 'shared' from the target folder on create when visibility is omitted", async () => {
      const { service, adminActor, sharedFolderId } = await setup();

      const prompt = service.create(adminActor, {
        title: 'assigned-to-shared',
        userPrompt: 'body',
        folderId: sharedFolderId,
      });

      expect(prompt.visibility).toBe('shared');
    });

    it("keeps the 'private' default on create when no folder is provided", async () => {
      const { service, adminActor } = await setup();

      const prompt = service.create(adminActor, {
        title: 'no-folder',
        userPrompt: 'body',
      });

      expect(prompt.visibility).toBe('private');
    });

    it('still rejects an explicit create visibility that mismatches the folder', async () => {
      const { service, adminActor, sharedFolderId } = await setup();

      expect(() =>
        service.create(adminActor, {
          title: 'explicit-mismatch',
          userPrompt: 'body',
          folderId: sharedFolderId,
          visibility: 'private',
        }),
      ).toThrow(/visibility must match/i);
    });

    it('keeps the original 422 when folder inference would exceed a non-admin create boundary', async () => {
      const { service, memberActor, sharedFolderId } = await setup();

      expect(() =>
        service.create(memberActor, {
          title: 'member-into-shared',
          userPrompt: 'body',
          folderId: sharedFolderId,
        }),
      ).toThrow(/visibility must match/i);
    });

    it("moves a private prompt into a shared folder on update when visibility is omitted", async () => {
      const { service, adminActor, sharedFolderId } = await setup();
      const prompt = service.create(adminActor, {
        title: 'move-to-shared',
        userPrompt: 'body',
      });
      expect(prompt.visibility).toBe('private');

      const updated = service.update(adminActor, prompt.id, {
        folderId: sharedFolderId,
      });

      expect(updated.folderId).toBe(sharedFolderId);
      expect(updated.visibility).toBe('shared');
    });

    it('persists the derived shared visibility in the stored row', async () => {
      const { db, service, adminActor, sharedFolderId } = await setup();
      const prompt = service.create(adminActor, {
        title: 'move-durable',
        userPrompt: 'body',
      });

      service.update(adminActor, prompt.id, { folderId: sharedFolderId });

      const stored = db
        .prepare('SELECT visibility FROM prompts WHERE id = ?')
        .get(prompt.id) as { visibility: string };
      expect(stored.visibility).toBe('shared');
    });

    it('does not touch visibility when an update keeps the folder unchanged', async () => {
      const { service, adminActor } = await setup();
      const prompt = service.create(adminActor, {
        title: 'title-only',
        userPrompt: 'body',
      });

      const updated = service.update(adminActor, prompt.id, {
        title: 'renamed',
      });

      expect(updated.title).toBe('renamed');
      expect(updated.visibility).toBe('private');
    });

    it('still rejects an explicit update visibility that mismatches the new folder', async () => {
      const { service, adminActor, sharedFolderId } = await setup();
      const prompt = service.create(adminActor, {
        title: 'explicit-update',
        userPrompt: 'body',
      });

      expect(() =>
        service.update(adminActor, prompt.id, {
          folderId: sharedFolderId,
          visibility: 'private',
        }),
      ).toThrow(/visibility must match/i);
    });

    it('keeps the original 422 when update inference would exceed a non-admin boundary', async () => {
      const { service, memberActor, sharedFolderId } = await setup();
      const prompt = service.create(memberActor, {
        title: 'member-private',
        userPrompt: 'body',
      });
      expect(prompt.visibility).toBe('private');

      expect(() =>
        service.update(memberActor, prompt.id, { folderId: sharedFolderId }),
      ).toThrow(/visibility must match/i);
    });
  });
});
