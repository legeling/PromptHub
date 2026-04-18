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
  process.env.PORT = '3995';
  process.env.HOST = '127.0.0.1';
  process.env.JWT_SECRET = 'test-secret-for-web-folder-flow-1234567890';
  process.env.JWT_ACCESS_TTL = '900';
  process.env.JWT_REFRESH_TTL = '604800';
  process.env.DATA_ROOT = dataDir;
  process.env.ALLOW_REGISTRATION = 'true';
  process.env.LOG_LEVEL = 'debug';

  const [{ createApp }] = await Promise.all([
    import('../app'),
  ]);

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

async function createFolder(
  app: Awaited<ReturnType<typeof createTestApp>>,
  token: string,
  body: Record<string, unknown>,
) {
  const response = await app.request(
    new Request('http://local/api/folders', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(body),
    }),
  );

  const payload = await response.json() as {
    data?: {
      id: string;
      name: string;
      visibility?: 'private' | 'shared';
      ownerUserId?: string | null;
      parentId?: string;
      order: number;
    };
    error?: { code: string; message: string };
  };

  return { response, payload };
}

describe('web folder routes', () => {
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

  it('creates, lists, updates, and deletes a private folder', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-folder-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'folderowner', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const created = await createFolder(app, token, { name: 'My Folder' });
      expect(created.response.status).toBe(201);
      expect(created.payload.data?.visibility).toBe('private');
      expect(created.payload.data?.ownerUserId).toBe(registerPayload.data.user.id);

      const folderId = created.payload.data!.id;

      const listResponse = await app.request(
        new Request('http://local/api/folders?scope=private', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(listResponse.status).toBe(200);
      const listPayload = await listResponse.json() as { data: Array<{ id: string; name: string }> };
      expect(listPayload.data.some((folder) => folder.id === folderId)).toBe(true);

      const updateResponse = await app.request(
        new Request(`http://local/api/folders/${folderId}`, {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({ name: 'Renamed Folder' }),
        }),
      );
      expect(updateResponse.status).toBe(200);
      const updatePayload = await updateResponse.json() as { data: { name: string } };
      expect(updatePayload.data.name).toBe('Renamed Folder');

      const deleteResponse = await app.request(
        new Request(`http://local/api/folders/${folderId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(deleteResponse.status).toBe(200);

      const afterDeleteList = await app.request(
        new Request('http://local/api/folders?scope=private', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      const afterDeletePayload = await afterDeleteList.json() as { data: Array<{ id: string }> };
      expect(afterDeletePayload.data.some((folder) => folder.id === folderId)).toBe(false);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('allows reading shared folders but blocks non-admin modifications', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-folder-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: adminPayload } = await registerUser(app, 'folderadmin', 'debugpass001');
      const { payload: normalPayload } = await registerUser(app, 'folderuser', 'debugpass001');

      const sharedCreated = await createFolder(app, adminPayload.data.accessToken, {
        name: 'Shared Folder',
        visibility: 'shared',
      });
      expect(sharedCreated.response.status).toBe(201);
      const folderId = sharedCreated.payload.data!.id;

      const sharedList = await app.request(
        new Request('http://local/api/folders?scope=shared', {
          headers: { Authorization: `Bearer ${normalPayload.data.accessToken}` },
        }),
      );
      expect(sharedList.status).toBe(200);
      const sharedListPayload = await sharedList.json() as { data: Array<{ id: string }> };
      expect(sharedListPayload.data.some((folder) => folder.id === folderId)).toBe(true);

      const forbiddenUpdate = await app.request(
        new Request(`http://local/api/folders/${folderId}`, {
          method: 'PUT',
          headers: authHeaders(normalPayload.data.accessToken),
          body: JSON.stringify({ name: 'Hijack' }),
        }),
      );
      expect(forbiddenUpdate.status).toBe(403);

      const forbiddenDelete = await app.request(
        new Request(`http://local/api/folders/${folderId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${normalPayload.data.accessToken}` },
        }),
      );
      expect(forbiddenDelete.status).toBe(403);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('blocks normal users from creating shared folders and hides private folders from other users', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-folder-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: adminPayload } = await registerUser(app, 'folderowner2', 'debugpass001');
      const { payload: normalPayload } = await registerUser(app, 'folderviewer2', 'debugpass001');

      const forbiddenSharedCreate = await createFolder(app, normalPayload.data.accessToken, {
        name: 'Forbidden Shared Folder',
        visibility: 'shared',
      });
      expect(forbiddenSharedCreate.response.status).toBe(403);
      expect(forbiddenSharedCreate.payload.error?.code).toBe('FORBIDDEN');

      const privateCreated = await createFolder(app, adminPayload.data.accessToken, {
        name: 'Private Folder',
      });
      expect(privateCreated.response.status).toBe(201);

      const listAsOther = await app.request(
        new Request('http://local/api/folders?scope=private', {
          headers: { Authorization: `Bearer ${normalPayload.data.accessToken}` },
        }),
      );
      expect(listAsOther.status).toBe(200);
      const listAsOtherPayload = await listAsOther.json() as { data: Array<{ id: string }> };
      expect(listAsOtherPayload.data.some((folder) => folder.id === privateCreated.payload.data!.id)).toBe(false);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('enforces parent visibility matching and reorder validation', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-folder-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: adminPayload } = await registerUser(app, 'folderadmin2', 'debugpass001');
      const token = adminPayload.data.accessToken;

      const sharedParent = await createFolder(app, token, {
        name: 'Shared Parent',
        visibility: 'shared',
      });
      expect(sharedParent.response.status).toBe(201);

      const mismatchedChild = await createFolder(app, token, {
        name: 'Private Child',
        parentId: sharedParent.payload.data!.id,
        visibility: 'private',
      });
      expect(mismatchedChild.response.status).toBe(422);
      expect(mismatchedChild.payload.error?.code).toBe('VALIDATION_ERROR');

      const sharedChild = await createFolder(app, token, {
        name: 'Shared Child',
        parentId: sharedParent.payload.data!.id,
        visibility: 'shared',
      });
      expect(sharedChild.response.status).toBe(201);

      const privateA = await createFolder(app, token, { name: 'Private A' });
      const privateB = await createFolder(app, token, { name: 'Private B' });

      const mixedReorder = await app.request(
        new Request('http://local/api/folders/reorder', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({ ids: [privateA.payload.data!.id, sharedParent.payload.data!.id] }),
        }),
      );
      expect(mixedReorder.status).toBe(422);

      const validReorder = await app.request(
        new Request('http://local/api/folders/reorder', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({ ids: [privateB.payload.data!.id, privateA.payload.data!.id] }),
        }),
      );
      expect(validReorder.status).toBe(200);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects unauthenticated folder creation', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-folder-test-'));

    try {
      const app = await createTestApp(dataDir);

      const response = await app.request(
        new Request('http://local/api/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'No Auth Folder' }),
        }),
      );

      expect(response.status).toBe(401);
      const payload = await response.json() as { error: { code: string; message: string } };
      expect(payload.error.code).toBe('UNAUTHORIZED');
      expect(payload.error.message).toBe('Missing or invalid Authorization header');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);
});
