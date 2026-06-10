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
  process.env.PORT = '3997';
  process.env.HOST = '127.0.0.1';
  process.env.JWT_SECRET = 'test-secret-for-web-rule-routes-1234567890';
  process.env.JWT_ACCESS_TTL = '900';
  process.env.JWT_REFRESH_TTL = '604800';
  process.env.DATA_ROOT = dataDir;
  process.env.ALLOW_REGISTRATION = 'true';
  process.env.LOG_LEVEL = 'debug';

  const [{ createApp }] = await Promise.all([import('../app')]);
  return createApp();
}

async function registerUser(app: Awaited<ReturnType<typeof createTestApp>>) {
  const captcha = await issueSolvedCaptcha(app);
  const response = await app.request(
    new Request('http://local/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ruleowner', password: 'debugpass001', ...captcha }),
    }),
  );
  const payload = (await response.json()) as {
    data: { accessToken: string };
  };
  return payload.data.accessToken;
}

describe('web rule routes', () => {
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

  it('creates and removes project rules for the authenticated user', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-rule-routes-test-'));

    try {
      const app = await createTestApp(dataDir);
      const token = await registerUser(app);

      const createResponse = await app.request(
        new Request('http://local/api/rules/projects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name: 'Docs Site', rootPath: '/workspace/docs' }),
        }),
      );

      expect(createResponse.status).toBe(201);
      const createPayload = (await createResponse.json()) as {
        data: { id: string; platformName: string; projectRootPath: string | null };
      };
      expect(createPayload.data.id).toMatch(/^project:/);
      expect(createPayload.data.platformName).toBe('Docs Site');
      expect(createPayload.data.projectRootPath).toBe('/workspace/docs');

      const listResponse = await app.request(
        new Request('http://local/api/rules', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      const listPayload = (await listResponse.json()) as {
        data: Array<{ id: string }>;
      };
      expect(listPayload.data.some((item) => item.id === createPayload.data.id)).toBe(true);

      const deleteResponse = await app.request(
        new Request(
          `http://local/api/rules/projects/${encodeURIComponent(createPayload.data.id.slice('project:'.length))}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          },
        ),
      );

      expect(deleteResponse.status).toBe(200);

      const afterDeleteResponse = await app.request(
        new Request('http://local/api/rules', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      const afterDeletePayload = (await afterDeleteResponse.json()) as {
        data: Array<{ id: string }>;
      };
      expect(afterDeletePayload.data.some((item) => item.id === createPayload.data.id)).toBe(false);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, 20000);

  it('rejects unsafe project rule ids before writing workspace files', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-rule-routes-test-'));

    try {
      const app = await createTestApp(dataDir);
      const token = await registerUser(app);

      const createResponse = await app.request(
        new Request('http://local/api/rules/projects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            id: '../escape',
            name: 'Unsafe Docs',
            rootPath: '/workspace/unsafe-docs',
          }),
        }),
      );

      expect(createResponse.status).toBe(422);
      const createPayload = (await createResponse.json()) as {
        error: { code: string; message: string };
      };
      expect(createPayload.error.code).toBe('VALIDATION_ERROR');
      expect(createPayload.error.message).toBe('id: project id contains unsafe characters');

      const listResponse = await app.request(
        new Request('http://local/api/rules', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      const listPayload = (await listResponse.json()) as {
        data: Array<{ id: string }>;
      };
      expect(listPayload.data).toEqual([]);
      expect(fs.existsSync(path.join(dataDir, 'data', 'rules', 'projects', 'escape'))).toBe(false);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, 20000);

  it('rejects unsafe project rule names and root paths before writing workspace files', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-rule-routes-test-'));

    try {
      const app = await createTestApp(dataDir);
      const token = await registerUser(app);

      const unsafeNameResponse = await app.request(
        new Request('http://local/api/rules/projects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            id: 'unsafe-name',
            name: 'Docs\u0000Site',
            rootPath: '/workspace/docs',
          }),
        }),
      );

      expect(unsafeNameResponse.status).toBe(422);
      const unsafeNamePayload = (await unsafeNameResponse.json()) as {
        error: { code: string; message: string };
      };
      expect(unsafeNamePayload.error.code).toBe('VALIDATION_ERROR');
      expect(unsafeNamePayload.error.message).toContain('name');
      expect(unsafeNamePayload.error.message).toContain('control characters');

      const unsafePathResponse = await app.request(
        new Request('http://local/api/rules/projects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            id: 'unsafe-root',
            name: 'Unsafe Root',
            rootPath: '/workspace/docs\nnested',
          }),
        }),
      );

      expect(unsafePathResponse.status).toBe(422);
      const unsafePathPayload = (await unsafePathResponse.json()) as {
        error: { code: string; message: string };
      };
      expect(unsafePathPayload.error.code).toBe('VALIDATION_ERROR');
      expect(unsafePathPayload.error.message).toContain('rootPath');
      expect(unsafePathPayload.error.message).toContain('control characters');

      const overlongPathResponse = await app.request(
        new Request('http://local/api/rules/projects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            id: 'overlong-root',
            name: 'Overlong Root',
            rootPath: `/workspace/${'x'.repeat(1025)}`,
          }),
        }),
      );

      expect(overlongPathResponse.status).toBe(422);
      const overlongPathPayload = (await overlongPathResponse.json()) as {
        error: { code: string; message: string };
      };
      expect(overlongPathPayload.error.code).toBe('VALIDATION_ERROR');
      expect(overlongPathPayload.error.message).toContain('rootPath');
      expect(overlongPathPayload.error.message).toContain('1024');

      const listResponse = await app.request(
        new Request('http://local/api/rules', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      const listPayload = (await listResponse.json()) as {
        data: Array<{ id: string }>;
      };
      expect(listPayload.data).toEqual([]);
      expect(fs.existsSync(path.join(dataDir, 'data', 'rules', 'projects'))).toBe(false);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, 20000);

  it('rejects unsafe project rule ids on delete before touching workspace files', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-rule-routes-test-'));

    try {
      const app = await createTestApp(dataDir);
      const token = await registerUser(app);

      const deleteResponse = await app.request(
        new Request('http://local/api/rules/projects/..%2Fescape', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }),
      );

      expect(deleteResponse.status).toBe(422);
      const deletePayload = (await deleteResponse.json()) as {
        error: { code: string; message: string };
      };
      expect(deletePayload.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'project id contains unsafe characters',
      });

      const listResponse = await app.request(
        new Request('http://local/api/rules', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      const listPayload = (await listResponse.json()) as {
        data: Array<{ id: string }>;
      };
      expect(listPayload.data).toEqual([]);
      expect(fs.existsSync(path.join(dataDir, 'data', 'rules', 'projects', 'escape'))).toBe(false);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, 20000);

  it('returns validation errors for unsafe imported rule records', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-rule-routes-test-'));

    try {
      const app = await createTestApp(dataDir);
      const token = await registerUser(app);

      const importResponse = await app.request(
        new Request('http://local/api/rules/import-records', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            records: [
              {
                id: 'project:../escape',
                platformId: 'workspace',
                platformName: 'Unsafe Import',
                platformIcon: 'FolderRoot',
                platformDescription: 'Unsafe imported project rule',
                name: '../AGENTS.md',
                description: 'Should be rejected',
                path: '/workspace/unsafe/AGENTS.md',
                targetPath: '/workspace/unsafe/AGENTS.md',
                projectRootPath: '/workspace/unsafe',
                syncStatus: 'synced',
                content: '# Unsafe',
                versions: [],
              },
            ],
          }),
        }),
      );

      expect(importResponse.status).toBe(422);
      const importPayload = (await importResponse.json()) as {
        error: { code: string; message: string };
      };
      expect(importPayload.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Sync snapshot is invalid: unsafe rule path segment for rule project:../escape name',
      });

      const listResponse = await app.request(
        new Request('http://local/api/rules', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      const listPayload = (await listResponse.json()) as {
        data: Array<{ id: string }>;
      };
      expect(listPayload.data).toEqual([]);
      expect(fs.existsSync(path.join(dataDir, 'data', 'rules', 'escape'))).toBe(false);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, 20000);

  it('rejects oversized rule writes and imports before mutating workspace files', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-rule-routes-test-'));

    try {
      const app = await createTestApp(dataDir);
      const token = await registerUser(app);

      const createResponse = await app.request(
        new Request('http://local/api/rules/projects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ id: 'docs', name: 'Docs Site', rootPath: '/workspace/docs' }),
        }),
      );
      expect(createResponse.status).toBe(201);
      const createPayload = (await createResponse.json()) as {
        data: { id: string };
      };

      const initialSaveResponse = await app.request(
        new Request(`http://local/api/rules/${encodeURIComponent(createPayload.data.id)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: '# Docs Site\n\nKeep this content.' }),
        }),
      );
      expect(initialSaveResponse.status).toBe(200);

      const saveResponse = await app.request(
        new Request(`http://local/api/rules/${encodeURIComponent(createPayload.data.id)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: 'A'.repeat(200001) }),
        }),
      );
      expect(saveResponse.status).toBe(422);
      const savePayload = (await saveResponse.json()) as {
        error: { code: string; message: string };
      };
      expect(savePayload.error.code).toBe('VALIDATION_ERROR');
      expect(savePayload.error.message).toContain('content');

      const readResponse = await app.request(
        new Request(`http://local/api/rules/${encodeURIComponent(createPayload.data.id)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(readResponse.status).toBe(200);
      const readPayload = (await readResponse.json()) as {
        data: { content: string };
      };
      expect(readPayload.data.content).toBe('# Docs Site\n\nKeep this content.');
      expect(readPayload.data.content).not.toBe('A'.repeat(200001));

      const rewriteResponse = await app.request(
        new Request('http://local/api/rules/rewrite', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            instruction: 'B'.repeat(2001),
            currentContent: 'Current',
            fileName: 'AGENTS.md',
            platformName: 'Docs',
          }),
        }),
      );
      expect(rewriteResponse.status).toBe(422);
      const rewritePayload = (await rewriteResponse.json()) as {
        error: { code: string; message: string };
      };
      expect(rewritePayload.error.code).toBe('VALIDATION_ERROR');
      expect(rewritePayload.error.message).toContain('instruction');

      const importResponse = await app.request(
        new Request('http://local/api/rules/import-records', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            records: Array.from({ length: 1001 }, (_, index) => ({
              id: `project:bulk-${index}`,
              platformId: 'workspace',
              platformName: `Bulk ${index}`,
              name: 'AGENTS.md',
              path: `/workspace/bulk-${index}/AGENTS.md`,
              targetPath: `/workspace/bulk-${index}/AGENTS.md`,
              projectRootPath: `/workspace/bulk-${index}`,
              syncStatus: 'synced',
              content: '# Bulk',
              versions: [],
            })),
          }),
        }),
      );
      expect(importResponse.status).toBe(422);
      const importPayload = (await importResponse.json()) as {
        error: { code: string; message: string };
      };
      expect(importPayload.error.code).toBe('VALIDATION_ERROR');
      expect(importPayload.error.message).toContain('records');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, 20000);
});
