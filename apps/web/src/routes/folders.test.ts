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
  const captcha = await issueSolvedCaptcha(app);
  const response = await app.request(
    new Request('http://local/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, ...captcha }),
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
      isPrivate?: boolean;
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

  it('keeps legacy isPrivate input coherent with folder visibility', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-folder-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: adminPayload } = await registerUser(app, 'folderlegacyadmin', 'debugpass001');
      const { payload: normalPayload } = await registerUser(app, 'folderlegacyuser', 'debugpass001');

      const forbiddenLegacySharedCreate = await createFolder(app, normalPayload.data.accessToken, {
        name: 'Legacy Shared User Folder',
        isPrivate: false,
      });
      expect(forbiddenLegacySharedCreate.response.status).toBe(403);
      expect(forbiddenLegacySharedCreate.payload.error?.code).toBe('FORBIDDEN');

      const legacySharedCreate = await createFolder(app, adminPayload.data.accessToken, {
        name: 'Legacy Shared Folder',
        isPrivate: false,
      });
      expect(legacySharedCreate.response.status).toBe(201);
      expect(legacySharedCreate.payload.data).toEqual(expect.objectContaining({
        visibility: 'shared',
        isPrivate: false,
      }));

      const explicitVisibilityWins = await createFolder(app, adminPayload.data.accessToken, {
        name: 'Explicit Private Folder',
        visibility: 'private',
        isPrivate: false,
      });
      expect(explicitVisibilityWins.response.status).toBe(201);
      expect(explicitVisibilityWins.payload.data).toEqual(expect.objectContaining({
        visibility: 'private',
        isPrivate: true,
      }));

      const privateFolder = await createFolder(app, adminPayload.data.accessToken, {
        name: 'Legacy Update Folder',
      });
      expect(privateFolder.response.status).toBe(201);

      const legacySharedUpdate = await app.request(
        new Request(`http://local/api/folders/${privateFolder.payload.data!.id}`, {
          method: 'PUT',
          headers: authHeaders(adminPayload.data.accessToken),
          body: JSON.stringify({ isPrivate: false }),
        }),
      );
      expect(legacySharedUpdate.status).toBe(200);
      const legacySharedUpdatePayload = await legacySharedUpdate.json() as {
        data: { visibility?: 'private' | 'shared'; isPrivate?: boolean };
      };
      expect(legacySharedUpdatePayload.data).toEqual(expect.objectContaining({
        visibility: 'shared',
        isPrivate: false,
      }));

      const normalPrivateFolder = await createFolder(app, normalPayload.data.accessToken, {
        name: 'Normal Legacy Update Folder',
      });
      expect(normalPrivateFolder.response.status).toBe(201);

      const forbiddenLegacySharedUpdate = await app.request(
        new Request(`http://local/api/folders/${normalPrivateFolder.payload.data!.id}`, {
          method: 'PUT',
          headers: authHeaders(normalPayload.data.accessToken),
          body: JSON.stringify({ isPrivate: false }),
        }),
      );
      expect(forbiddenLegacySharedUpdate.status).toBe(403);
      const forbiddenUpdatePayload = await forbiddenLegacySharedUpdate.json() as {
        error: { code: string };
      };
      expect(forbiddenUpdatePayload.error.code).toBe('FORBIDDEN');
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

  it('rejects duplicate folder ids during reorder without changing the existing order', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-folder-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'folderdedupe', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const privateA = await createFolder(app, token, { name: 'Duplicate A' });
      expect(privateA.response.status).toBe(201);
      const privateB = await createFolder(app, token, { name: 'Duplicate B' });
      expect(privateB.response.status).toBe(201);

      const duplicateReorder = await app.request(
        new Request('http://local/api/folders/reorder', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            ids: [privateA.payload.data!.id, privateA.payload.data!.id, privateB.payload.data!.id],
          }),
        }),
      );

      expect(duplicateReorder.status).toBe(422);
      const duplicatePayload = await duplicateReorder.json() as { error: { code: string; message: string } };
      expect(duplicatePayload.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Folder reorder ids must be unique',
      });

      const listResponse = await app.request(
        new Request('http://local/api/folders?scope=private', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(listResponse.status).toBe(200);
      const listPayload = await listResponse.json() as { data: Array<{ id: string }> };
      const orderedIds = listPayload.data.map((folder) => folder.id);
      expect(orderedIds.indexOf(privateA.payload.data!.id)).toBeLessThan(
        orderedIds.indexOf(privateB.payload.data!.id),
      );
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects oversized folder reorder payloads before loading folder rows', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-folder-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'folderreorderlimit', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const tooManyIdsResponse = await app.request(
        new Request('http://local/api/folders/reorder', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            ids: Array.from({ length: 501 }, (_, index) => `folder-${index}`),
          }),
        }),
      );
      expect(tooManyIdsResponse.status).toBe(422);
      const tooManyIdsPayload = await tooManyIdsResponse.json() as { error: { code: string; message: string } };
      expect(tooManyIdsPayload.error.code).toBe('VALIDATION_ERROR');
      expect(tooManyIdsPayload.error.message).toContain('ids');
      expect(tooManyIdsPayload.error.message).toContain('at most 500');

      const overlongIdResponse = await app.request(
        new Request('http://local/api/folders/reorder', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            ids: ['f'.repeat(201)],
          }),
        }),
      );
      expect(overlongIdResponse.status).toBe(422);
      const overlongIdPayload = await overlongIdResponse.json() as { error: { code: string; message: string } };
      expect(overlongIdPayload.error.code).toBe('VALIDATION_ERROR');
      expect(overlongIdPayload.error.message).toContain('ids.0');
      expect(overlongIdPayload.error.message).toContain('at most 200');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects visibility-only updates that would mismatch parent and child folders', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-folder-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: adminPayload } = await registerUser(app, 'folderadmin3', 'debugpass001');
      const token = adminPayload.data.accessToken;

      const sharedParent = await createFolder(app, token, {
        name: 'Shared Visibility Parent',
        visibility: 'shared',
      });
      expect(sharedParent.response.status).toBe(201);

      const sharedChild = await createFolder(app, token, {
        name: 'Shared Visibility Child',
        parentId: sharedParent.payload.data!.id,
        visibility: 'shared',
      });
      expect(sharedChild.response.status).toBe(201);

      const childToPrivate = await app.request(
        new Request(`http://local/api/folders/${sharedChild.payload.data!.id}`, {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({ visibility: 'private' }),
        }),
      );
      expect(childToPrivate.status).toBe(422);
      const childToPrivatePayload = await childToPrivate.json() as { error: { code: string; message: string } };
      expect(childToPrivatePayload.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Parent folder visibility must match child visibility',
      });

      const privateParent = await createFolder(app, token, { name: 'Private Visibility Parent' });
      expect(privateParent.response.status).toBe(201);

      const privateChild = await createFolder(app, token, {
        name: 'Private Visibility Child',
        parentId: privateParent.payload.data!.id,
      });
      expect(privateChild.response.status).toBe(201);

      const parentToShared = await app.request(
        new Request(`http://local/api/folders/${privateParent.payload.data!.id}`, {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({ visibility: 'shared' }),
        }),
      );
      expect(parentToShared.status).toBe(422);
      const parentToSharedPayload = await parentToShared.json() as { error: { code: string; message: string } };
      expect(parentToSharedPayload.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Child folder visibility must match parent visibility',
      });
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects folder parent updates that would create cycles', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-folder-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'foldercycle', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const parent = await createFolder(app, token, { name: 'Cycle Parent' });
      expect(parent.response.status).toBe(201);

      const child = await createFolder(app, token, {
        name: 'Cycle Child',
        parentId: parent.payload.data!.id,
      });
      expect(child.response.status).toBe(201);

      const selfParentResponse = await app.request(
        new Request(`http://local/api/folders/${parent.payload.data!.id}`, {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({ parentId: parent.payload.data!.id }),
        }),
      );
      expect(selfParentResponse.status).toBe(422);
      const selfParentPayload = await selfParentResponse.json() as { error: { code: string; message: string } };
      expect(selfParentPayload.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Folder cannot be moved under itself or its descendants',
      });

      const descendantParentResponse = await app.request(
        new Request(`http://local/api/folders/${parent.payload.data!.id}`, {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({ parentId: child.payload.data!.id }),
        }),
      );
      expect(descendantParentResponse.status).toBe(422);
      const descendantParentPayload = await descendantParentResponse.json() as { error: { code: string; message: string } };
      expect(descendantParentPayload.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Folder cannot be moved under itself or its descendants',
      });

      const listResponse = await app.request(
        new Request('http://local/api/folders?scope=private', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(listResponse.status).toBe(200);
      const listPayload = await listResponse.json() as { data: Array<{ id: string; parentId?: string }> };
      const parentAfter = listPayload.data.find((folder) => folder.id === parent.payload.data!.id);
      const childAfter = listPayload.data.find((folder) => folder.id === child.payload.data!.id);
      expect(parentAfter?.parentId).toBeFalsy();
      expect(childAfter?.parentId).toBe(parent.payload.data!.id);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('allows moving a nested folder back to the root', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-folder-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'folderroot', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const parent = await createFolder(app, token, { name: 'Root Move Parent' });
      expect(parent.response.status).toBe(201);

      const child = await createFolder(app, token, {
        name: 'Root Move Child',
        parentId: parent.payload.data!.id,
      });
      expect(child.response.status).toBe(201);

      const response = await app.request(
        new Request(`http://local/api/folders/${child.payload.data!.id}`, {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({ parentId: null }),
        }),
      );
      expect(response.status).toBe(200);
      const payload = await response.json() as { data: { id: string; parentId?: string } };
      expect(payload.data.parentId).toBeFalsy();

      const listResponse = await app.request(
        new Request('http://local/api/folders?scope=private', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(listResponse.status).toBe(200);
      const listPayload = await listResponse.json() as { data: Array<{ id: string; parentId?: string }> };
      const childAfter = listPayload.data.find((folder) => folder.id === child.payload.data!.id);
      expect(childAfter?.parentId).toBeFalsy();
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
