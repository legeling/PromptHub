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
  process.env.PORT = '3996';
  process.env.HOST = '127.0.0.1';
  process.env.JWT_SECRET = 'test-secret-for-web-prompt-flow-1234567890';
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
      refreshToken: string;
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

async function createPrompt(
  app: Awaited<ReturnType<typeof createTestApp>>,
  token: string,
  body: Record<string, unknown>,
) {
  const response = await app.request(
    new Request('http://local/api/prompts', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(body),
    }),
  );

  const payload = await response.json() as {
    data?: {
      id: string;
      title: string;
      visibility?: 'private' | 'shared';
      ownerUserId?: string | null;
      userPrompt: string;
      currentVersion: number;
      isFavorite: boolean;
      isPinned: boolean;
    };
    error?: { code: string; message: string };
  };

  return { response, payload };
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
    };
    error?: { code: string; message: string };
  };

  return { response, payload };
}

describe('web prompt routes', () => {
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

  it('creates, updates, lists, filters, and deletes a private prompt', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-prompt-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'promptowner', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const { response: createResponse, payload: createPayload } = await createPrompt(app, token, {
        title: 'My Prompt',
        userPrompt: 'Say hello',
        tags: ['greeting'],
      });

      expect(createResponse.status).toBe(201);
      expect(createPayload.data?.title).toBe('My Prompt');
      expect(createPayload.data?.visibility).toBe('private');

      const promptId = createPayload.data!.id;

      const updateResponse = await app.request(
        new Request(`http://local/api/prompts/${promptId}`, {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            isFavorite: true,
            isPinned: true,
            userPrompt: 'Say hello loudly',
          }),
        }),
      );

      expect(updateResponse.status).toBe(200);
      const updatePayload = await updateResponse.json() as {
        data: { isFavorite: boolean; isPinned: boolean; userPrompt: string; currentVersion: number };
      };
      expect(updatePayload.data.isFavorite).toBe(true);
      expect(updatePayload.data.isPinned).toBe(true);
      expect(updatePayload.data.userPrompt).toBe('Say hello loudly');
      expect(updatePayload.data.currentVersion).toBeGreaterThan(1);

      const listResponse = await app.request(
        new Request('http://local/api/prompts?scope=private&isFavorite=true', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(listResponse.status).toBe(200);
      const listPayload = await listResponse.json() as {
        data: Array<{ id: string; title: string; isFavorite: boolean }>;
      };
      expect(listPayload.data).toHaveLength(1);
      expect(listPayload.data[0]?.id).toBe(promptId);

      const getResponse = await app.request(
        new Request(`http://local/api/prompts/${promptId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(getResponse.status).toBe(200);

      const deleteResponse = await app.request(
        new Request(`http://local/api/prompts/${promptId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(deleteResponse.status).toBe(200);

      const missingResponse = await app.request(
        new Request(`http://local/api/prompts/${promptId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(missingResponse.status).toBe(404);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('returns filtered prompt totals independently from page size', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-prompt-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'promptpager', 'debugpass001');
      const token = registerPayload.data.accessToken;

      for (const title of ['Page Prompt 1', 'Page Prompt 2', 'Page Prompt 3']) {
        const created = await createPrompt(app, token, {
          title,
          userPrompt: `${title} body`,
          tags: ['paged'],
        });
        expect(created.response.status).toBe(201);
      }

      const response = await app.request(
        new Request('http://local/api/prompts?scope=private&tags=paged&limit=2&offset=0', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );

      expect(response.status).toBe(200);
      const payload = await response.json() as {
        data: Array<{ id: string; title: string }>;
        pagination: { total: number; limit: number; offset: number };
      };
      expect(payload.data).toHaveLength(2);
      expect(payload.pagination).toEqual({
        total: 3,
        limit: 2,
        offset: 0,
      });
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('filters prompts by literal repeated tag query values containing commas', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-prompt-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'prompttagliteral', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const literalTagPrompt = await createPrompt(app, token, {
        title: 'Literal Tag Prompt',
        userPrompt: 'Use a comma tag',
        tags: ['legal,review'],
      });
      expect(literalTagPrompt.response.status).toBe(201);

      const splitTagPrompt = await createPrompt(app, token, {
        title: 'Split Tag Prompt',
        userPrompt: 'Use split tags',
        tags: ['legal', 'review'],
      });
      expect(splitTagPrompt.response.status).toBe(201);

      const response = await app.request(
        new Request('http://local/api/prompts?scope=private&tag=legal%2Creview', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );

      expect(response.status).toBe(200);
      const payload = await response.json() as {
        data: Array<{ id: string; title: string; tags: string[] }>;
      };
      expect(payload.data).toEqual([
        expect.objectContaining({
          id: literalTagPrompt.payload.data!.id,
          title: 'Literal Tag Prompt',
          tags: ['legal,review'],
        }),
      ]);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects oversized prompt list query filters', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-prompt-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'promptqueryguard', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const oversizedKeywordResponse = await app.request(
        new Request(`http://local/api/prompts?keyword=${'a'.repeat(501)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(oversizedKeywordResponse.status).toBe(422);
      const oversizedKeywordPayload = await oversizedKeywordResponse.json() as {
        error: { code: string; message: string };
      };
      expect(oversizedKeywordPayload.error.code).toBe('VALIDATION_ERROR');
      expect(oversizedKeywordPayload.error.message).toContain('keyword');

      const tooManyTags = Array.from({ length: 51 }, (_, index) => `tag-${index}`).join(',');
      const tooManyTagsResponse = await app.request(
        new Request(`http://local/api/prompts?tags=${tooManyTags}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(tooManyTagsResponse.status).toBe(422);
      const tooManyTagsPayload = await tooManyTagsResponse.json() as {
        error: { code: string; message: string };
      };
      expect(tooManyTagsPayload.error.code).toBe('VALIDATION_ERROR');
      expect(tooManyTagsPayload.error.message).toContain('tags must contain at most 50 entries');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('enforces shared/private visibility rules across admin and normal users', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-prompt-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: adminPayload } = await registerUser(app, 'adminuser', 'debugpass001');
      const { payload: normalPayload } = await registerUser(app, 'normaluser', 'debugpass001');

      const forbiddenSharedCreate = await createPrompt(app, normalPayload.data.accessToken, {
        visibility: 'shared',
        title: 'Forbidden shared',
        userPrompt: 'Nope',
      });
      expect(forbiddenSharedCreate.response.status).toBe(403);
      expect(forbiddenSharedCreate.payload.error?.code).toBe('FORBIDDEN');

      const sharedCreated = await createPrompt(app, adminPayload.data.accessToken, {
        visibility: 'shared',
        title: 'Shared prompt',
        userPrompt: 'Visible to everyone',
      });
      expect(sharedCreated.response.status).toBe(201);
      const sharedPromptId = sharedCreated.payload.data!.id;

      const sharedRead = await app.request(
        new Request(`http://local/api/prompts/${sharedPromptId}`, {
          headers: { Authorization: `Bearer ${normalPayload.data.accessToken}` },
        }),
      );
      expect(sharedRead.status).toBe(200);

      const sharedUpdate = await app.request(
        new Request(`http://local/api/prompts/${sharedPromptId}`, {
          method: 'PUT',
          headers: authHeaders(normalPayload.data.accessToken),
          body: JSON.stringify({ title: 'Should fail' }),
        }),
      );
      expect(sharedUpdate.status).toBe(403);

      const privateCreated = await createPrompt(app, adminPayload.data.accessToken, {
        title: 'Private prompt',
        userPrompt: 'Only mine',
      });
      const privatePromptId = privateCreated.payload.data!.id;

      const privateReadByOther = await app.request(
        new Request(`http://local/api/prompts/${privatePromptId}`, {
          headers: { Authorization: `Bearer ${normalPayload.data.accessToken}` },
        }),
      );
      expect(privateReadByOther.status).toBe(404);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('duplicates prompts as a private copy owned by the caller', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-prompt-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'copyuser', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const created = await createPrompt(app, token, {
        title: 'Original prompt',
        userPrompt: 'Base text',
      });

      const copyResponse = await app.request(
        new Request(`http://local/api/prompts/${created.payload.data!.id}/copy`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }),
      );

      expect(copyResponse.status).toBe(201);
      const copyPayload = await copyResponse.json() as {
        data: { id: string; title: string; visibility?: 'private' | 'shared'; ownerUserId?: string | null };
      };
      expect(copyPayload.data.id).not.toBe(created.payload.data!.id);
      expect(copyPayload.data.title).toBe('Original prompt (Copy)');
      expect(copyPayload.data.visibility).toBe('private');
      expect(copyPayload.data.ownerUserId).toBe(registerPayload.data.user.id);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects prompt folder references outside the prompt visibility and owner boundary', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-prompt-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: adminPayload } = await registerUser(app, 'promptfolderadmin', 'debugpass001');
      const { payload: normalPayload } = await registerUser(app, 'promptfolderuser', 'debugpass001');
      const adminToken = adminPayload.data.accessToken;
      const normalToken = normalPayload.data.accessToken;

      const adminPrivateFolder = await createFolder(app, adminToken, {
        name: 'Admin Private Folder',
      });
      expect(adminPrivateFolder.response.status).toBe(201);

      const sharedFolder = await createFolder(app, adminToken, {
        name: 'Shared Folder',
        visibility: 'shared',
      });
      expect(sharedFolder.response.status).toBe(201);

      const crossOwnerCreate = await createPrompt(app, normalToken, {
        title: 'Cross owner prompt',
        userPrompt: 'Should not link to another private folder',
        folderId: adminPrivateFolder.payload.data!.id,
      });
      expect(crossOwnerCreate.response.status).toBe(404);
      expect(crossOwnerCreate.payload.error).toEqual({
        code: 'NOT_FOUND',
        message: 'Folder not found',
      });

      const privateInSharedCreate = await createPrompt(app, normalToken, {
        title: 'Private prompt in shared folder',
        userPrompt: 'Should fail validation',
        folderId: sharedFolder.payload.data!.id,
      });
      expect(privateInSharedCreate.response.status).toBe(422);
      expect(privateInSharedCreate.payload.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Prompt folder visibility must match prompt visibility',
      });

      const sharedInPrivateCreate = await createPrompt(app, adminToken, {
        visibility: 'shared',
        title: 'Shared prompt in private folder',
        userPrompt: 'Should fail validation',
        folderId: adminPrivateFolder.payload.data!.id,
      });
      expect(sharedInPrivateCreate.response.status).toBe(422);
      expect(sharedInPrivateCreate.payload.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Prompt folder visibility must match prompt visibility',
      });

      const ownPrivateFolder = await createFolder(app, normalToken, {
        name: 'Own Private Folder',
      });
      const created = await createPrompt(app, normalToken, {
        title: 'Owned prompt',
        userPrompt: 'Initial',
        folderId: ownPrivateFolder.payload.data!.id,
      });
      expect(created.response.status).toBe(201);

      const crossOwnerUpdate = await app.request(
        new Request(`http://local/api/prompts/${created.payload.data!.id}`, {
          method: 'PUT',
          headers: authHeaders(normalToken),
          body: JSON.stringify({
            folderId: adminPrivateFolder.payload.data!.id,
          }),
        }),
      );
      expect(crossOwnerUpdate.status).toBe(404);
      const crossOwnerUpdatePayload = await crossOwnerUpdate.json() as { error: { code: string; message: string } };
      expect(crossOwnerUpdatePayload.error).toEqual({
        code: 'NOT_FOUND',
        message: 'Folder not found',
      });
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('clears prompt folder assignment when updating folderId to null', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-prompt-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'promptrootmove', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const folder = await createFolder(app, token, {
        name: 'Prompt Move Folder',
      });
      expect(folder.response.status).toBe(201);

      const prompt = await createPrompt(app, token, {
        title: 'Prompt in folder',
        userPrompt: 'Move me back to root',
        folderId: folder.payload.data!.id,
      });
      expect(prompt.response.status).toBe(201);

      const updateResponse = await app.request(
        new Request(`http://local/api/prompts/${prompt.payload.data!.id}`, {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({ folderId: null }),
        }),
      );
      expect(updateResponse.status).toBe(200);
      const updatePayload = await updateResponse.json() as {
        data: { id: string; folderId?: string | null };
      };
      expect(updatePayload.data.folderId).toBeFalsy();

      const getResponse = await app.request(
        new Request(`http://local/api/prompts/${prompt.payload.data!.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(getResponse.status).toBe(200);
      const getPayload = await getResponse.json() as {
        data: { id: string; folderId?: string | null };
      };
      expect(getPayload.data.folderId).toBeFalsy();
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('clears invalid folder references when copying shared prompts into a private library', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-prompt-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: adminPayload } = await registerUser(app, 'promptcopyadmin', 'debugpass001');
      const { payload: normalPayload } = await registerUser(app, 'promptcopyuser', 'debugpass001');

      const sharedFolder = await createFolder(app, adminPayload.data.accessToken, {
        name: 'Shared Copy Source',
        visibility: 'shared',
      });
      expect(sharedFolder.response.status).toBe(201);

      const sharedPrompt = await createPrompt(app, adminPayload.data.accessToken, {
        visibility: 'shared',
        title: 'Shared foldered prompt',
        userPrompt: 'Copy me',
        folderId: sharedFolder.payload.data!.id,
      });
      expect(sharedPrompt.response.status).toBe(201);

      const copyResponse = await app.request(
        new Request(`http://local/api/prompts/${sharedPrompt.payload.data!.id}/copy`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${normalPayload.data.accessToken}` },
        }),
      );

      expect(copyResponse.status).toBe(201);
      const copyPayload = await copyResponse.json() as {
        data: {
          id: string;
          title: string;
          visibility?: 'private' | 'shared';
          ownerUserId?: string | null;
          folderId?: string | null;
        };
      };
      expect(copyPayload.data.title).toBe('Shared foldered prompt (Copy)');
      expect(copyPayload.data.visibility).toBe('private');
      expect(copyPayload.data.ownerUserId).toBe(normalPayload.data.user.id);
      expect(copyPayload.data.folderId).toBeFalsy();
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects unsafe media references before storing prompt metadata', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-prompt-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'promptmediaguard', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const unsafeImageCreate = await createPrompt(app, token, {
        title: 'Unsafe image prompt',
        userPrompt: 'Should reject unsafe media names',
        images: ['../escape.png'],
      });
      expect(unsafeImageCreate.response.status).toBe(422);
      expect(unsafeImageCreate.payload.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Invalid image filename: ../escape.png',
      });

      const unsafeVideoCreate = await createPrompt(app, token, {
        title: 'Unsafe video prompt',
        userPrompt: 'Should reject unsafe media names',
        videos: ['folder\\escape.mp4'],
      });
      expect(unsafeVideoCreate.response.status).toBe(422);
      expect(unsafeVideoCreate.payload.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Invalid video filename: folder\\escape.mp4',
      });

      const created = await createPrompt(app, token, {
        title: 'Safe media prompt',
        userPrompt: 'This can be updated',
        images: ['safe.png'],
        videos: ['safe.mp4'],
      });
      expect(created.response.status).toBe(201);

      const unsafeUpdateResponse = await app.request(
        new Request(`http://local/api/prompts/${created.payload.data!.id}`, {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            images: ['bad\u0000name.png'],
          }),
        }),
      );
      expect(unsafeUpdateResponse.status).toBe(422);
      const unsafeUpdatePayload = await unsafeUpdateResponse.json() as { error: { code: string; message: string } };
      expect(unsafeUpdatePayload.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Invalid image filename: bad\u0000name.png',
      });

      const getResponse = await app.request(
        new Request(`http://local/api/prompts/${created.payload.data!.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(getResponse.status).toBe(200);
      const getPayload = await getResponse.json() as { data: { images?: string[]; videos?: string[] } };
      expect(getPayload.data.images).toEqual(['safe.png']);
      expect(getPayload.data.videos).toEqual(['safe.mp4']);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects oversized prompt metadata arrays without persisting them', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-prompt-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'promptmetadatareject', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const tooManyTags = await createPrompt(app, token, {
        title: 'Too many tags',
        userPrompt: 'Should reject excessive prompt tags',
        tags: Array.from({ length: 101 }, (_, index) => `tag-${index}`),
      });
      expect(tooManyTags.response.status).toBe(422);
      expect(tooManyTags.payload.error?.code).toBe('VALIDATION_ERROR');
      expect(tooManyTags.payload.error?.message).toContain('tags');

      const overlongTag = await createPrompt(app, token, {
        title: 'Overlong tag',
        userPrompt: 'Should reject excessive tag length',
        tags: ['a'.repeat(101)],
      });
      expect(overlongTag.response.status).toBe(422);

      const tooManyVariables = await createPrompt(app, token, {
        title: 'Too many variables',
        userPrompt: 'Should reject excessive variables',
        variables: Array.from({ length: 51 }, (_, index) => ({
          name: `variable_${index}`,
          type: 'text',
          required: false,
        })),
      });
      expect(tooManyVariables.response.status).toBe(422);

      const tooManyVariableOptions = await createPrompt(app, token, {
        title: 'Too many options',
        userPrompt: 'Should reject excessive select options',
        variables: [{
          name: 'choice',
          type: 'select',
          required: false,
          options: Array.from({ length: 101 }, (_, index) => `option-${index}`),
        }],
      });
      expect(tooManyVariableOptions.response.status).toBe(422);

      const tooManyImages = await createPrompt(app, token, {
        title: 'Too many images',
        userPrompt: 'Should reject excessive media references',
        images: Array.from({ length: 101 }, (_, index) => `image-${index}.png`),
      });
      expect(tooManyImages.response.status).toBe(422);

      const listResponse = await app.request(
        new Request('http://local/api/prompts?scope=private', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(listResponse.status).toBe(200);
      const listPayload = await listResponse.json() as { data: Array<{ title: string }> };
      expect(listPayload.data).toEqual([]);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('persists valid bounded prompt metadata arrays', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-prompt-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'promptmetadatavalid', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const created = await createPrompt(app, token, {
        title: 'Bounded metadata prompt',
        userPrompt: 'Use {{tone}} and {{audience}}',
        tags: ['writing', 'review'],
        variables: [
          {
            name: 'tone',
            type: 'select',
            label: 'Tone',
            defaultValue: 'direct',
            options: ['direct', 'friendly'],
            required: true,
          },
          {
            name: 'audience',
            type: 'text',
            required: false,
          },
        ],
        images: ['reference.png'],
        videos: ['demo.mp4'],
      });
      expect(created.response.status).toBe(201);

      const getResponse = await app.request(
        new Request(`http://local/api/prompts/${created.payload.data!.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(getResponse.status).toBe(200);
      const getPayload = await getResponse.json() as {
        data: {
          tags: string[];
          variables: Array<{
            name: string;
            type: string;
            label?: string;
            defaultValue?: string;
            options?: string[];
            required: boolean;
          }>;
          images?: string[];
          videos?: string[];
        };
      };
      expect(getPayload.data.tags).toEqual(['writing', 'review']);
      expect(getPayload.data.variables).toEqual([
        {
          name: 'tone',
          type: 'select',
          label: 'Tone',
          defaultValue: 'direct',
          options: ['direct', 'friendly'],
          required: true,
        },
        {
          name: 'audience',
          type: 'text',
          required: false,
        },
      ]);
      expect(getPayload.data.images).toEqual(['reference.png']);
      expect(getPayload.data.videos).toEqual(['demo.mp4']);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('scopes tag listing, rename, and delete to prompts visible to the actor', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-prompt-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: adminPayload } = await registerUser(app, 'tagadmin', 'debugpass001');
      const { payload: ownerPayload } = await registerUser(app, 'tagowner', 'debugpass001');
      const { payload: otherPayload } = await registerUser(app, 'tagother', 'debugpass001');
      const adminToken = adminPayload.data.accessToken;
      const ownerToken = ownerPayload.data.accessToken;
      const otherToken = otherPayload.data.accessToken;

      const ownerPrompt = await createPrompt(app, ownerToken, {
        title: 'Owner prompt',
        userPrompt: 'Owner body',
        tags: ['rename-me', 'delete-me', 'owner-only'],
      });
      expect(ownerPrompt.response.status).toBe(201);

      const otherPrompt = await createPrompt(app, otherToken, {
        title: 'Other prompt',
        userPrompt: 'Other body',
        tags: ['rename-me', 'delete-me', 'other-secret'],
      });
      expect(otherPrompt.response.status).toBe(201);

      const sharedPrompt = await createPrompt(app, adminToken, {
        visibility: 'shared',
        title: 'Shared prompt',
        userPrompt: 'Shared body',
        tags: ['shared-tag'],
      });
      expect(sharedPrompt.response.status).toBe(201);

      const tagsResponse = await app.request(
        new Request('http://local/api/prompts/meta/tags', {
          headers: { Authorization: `Bearer ${ownerToken}` },
        }),
      );
      expect(tagsResponse.status).toBe(200);
      const tagsPayload = await tagsResponse.json() as { data: string[] };
      expect(tagsPayload.data).toEqual(['delete-me', 'owner-only', 'rename-me', 'shared-tag']);
      expect(tagsPayload.data).not.toContain('other-secret');

      const renameResponse = await app.request(
        new Request('http://local/api/prompts/meta/tags/rename', {
          method: 'POST',
          headers: authHeaders(ownerToken),
          body: JSON.stringify({ oldTag: 'rename-me', newTag: 'renamed-owner' }),
        }),
      );
      expect(renameResponse.status).toBe(200);

      const deleteResponse = await app.request(
        new Request('http://local/api/prompts/meta/tags/delete', {
          method: 'POST',
          headers: authHeaders(ownerToken),
          body: JSON.stringify({ tag: 'delete-me' }),
        }),
      );
      expect(deleteResponse.status).toBe(200);

      const ownerAfterResponse = await app.request(
        new Request(`http://local/api/prompts/${ownerPrompt.payload.data!.id}`, {
          headers: { Authorization: `Bearer ${ownerToken}` },
        }),
      );
      const ownerAfterPayload = await ownerAfterResponse.json() as { data: { tags: string[] } };
      expect(ownerAfterPayload.data.tags).toEqual(['renamed-owner', 'owner-only']);

      const otherAfterResponse = await app.request(
        new Request(`http://local/api/prompts/${otherPrompt.payload.data!.id}`, {
          headers: { Authorization: `Bearer ${otherToken}` },
        }),
      );
      const otherAfterPayload = await otherAfterResponse.json() as { data: { tags: string[] } };
      expect(otherAfterPayload.data.tags).toEqual(['rename-me', 'delete-me', 'other-secret']);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects oversized prompt tag mutations without changing prompt metadata', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-prompt-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'tagboundary', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const prompt = await createPrompt(app, token, {
        title: 'Tag boundary prompt',
        userPrompt: 'Keep tags bounded',
        tags: ['rename-me', 'delete-me'],
      });
      expect(prompt.response.status).toBe(201);

      const oversizedRename = await app.request(
        new Request('http://local/api/prompts/meta/tags/rename', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            oldTag: 'rename-me',
            newTag: 'r'.repeat(101),
          }),
        }),
      );
      expect(oversizedRename.status).toBe(422);
      const oversizedRenamePayload = await oversizedRename.json() as {
        error: { code: string; message: string };
      };
      expect(oversizedRenamePayload.error.code).toBe('VALIDATION_ERROR');
      expect(oversizedRenamePayload.error.message).toContain('newTag');

      const oversizedDelete = await app.request(
        new Request('http://local/api/prompts/meta/tags/delete', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            tag: 'd'.repeat(101),
          }),
        }),
      );
      expect(oversizedDelete.status).toBe(422);
      const oversizedDeletePayload = await oversizedDelete.json() as {
        error: { code: string; message: string };
      };
      expect(oversizedDeletePayload.error.code).toBe('VALIDATION_ERROR');
      expect(oversizedDeletePayload.error.message).toContain('tag');

      const getResponse = await app.request(
        new Request(`http://local/api/prompts/${prompt.payload.data!.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(getResponse.status).toBe(200);
      const getPayload = await getResponse.json() as { data: { tags: string[] } };
      expect(getPayload.data.tags).toEqual(['rename-me', 'delete-me']);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('restores prompt folders, prompts, and versions through desktop-compatible direct endpoints', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-prompt-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'restoreuser', 'debugpass001');
      const token = registerPayload.data.accessToken;
      const now = new Date('2026-01-02T03:04:05.000Z').toISOString();

      const folderResponse = await app.request(
        new Request('http://local/api/folders/direct-insert', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            id: 'folder_restore',
            name: 'Restored Folder',
            order: 0,
            isPrivate: true,
            createdAt: now,
            updatedAt: now,
          }),
        }),
      );
      expect(folderResponse.status).toBe(201);

      const promptResponse = await app.request(
        new Request('http://local/api/prompts/direct-insert', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            id: 'prompt_restore',
            visibility: 'private',
            title: 'Restored Prompt',
            description: null,
            promptType: 'text',
            systemPrompt: null,
            systemPromptEn: null,
            userPrompt: 'Restored body',
            userPromptEn: null,
            variables: [],
            tags: ['restore'],
            folderId: 'folder_restore',
            images: [],
            videos: [],
            isFavorite: true,
            isPinned: false,
            version: 2,
            currentVersion: 2,
            usageCount: 7,
            source: null,
            notes: null,
            lastAiResponse: null,
            createdAt: now,
            updatedAt: now,
          }),
        }),
      );
      expect(promptResponse.status).toBe(201);

      const versionResponse = await app.request(
        new Request('http://local/api/prompts/versions/direct-insert', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            id: 'version_restore',
            promptId: 'prompt_restore',
            version: 2,
            systemPrompt: null,
            systemPromptEn: null,
            userPrompt: 'Restored body',
            userPromptEn: null,
            variables: [],
            note: 'backup restore',
            aiResponse: null,
            createdAt: now,
          }),
        }),
      );
      expect(versionResponse.status).toBe(201);

      const getPromptResponse = await app.request(
        new Request('http://local/api/prompts/prompt_restore', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(getPromptResponse.status).toBe(200);
      const getPromptPayload = await getPromptResponse.json() as {
        data: { id: string; title: string; folderId?: string; usageCount: number };
      };
      expect(getPromptPayload.data).toMatchObject({
        id: 'prompt_restore',
        title: 'Restored Prompt',
        folderId: 'folder_restore',
        usageCount: 7,
      });

      const versionsResponse = await app.request(
        new Request('http://local/api/prompts/prompt_restore/versions', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(versionsResponse.status).toBe(200);
      const versionsPayload = await versionsResponse.json() as {
        data: Array<{ id: string; note?: string | null }>;
      };
      expect(versionsPayload.data.some((version) => version.id === 'version_restore')).toBe(true);

      const deleteVersionResponse = await app.request(
        new Request('http://local/api/prompts/versions/version_restore', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(deleteVersionResponse.status).toBe(200);

      const afterDeleteVersionsResponse = await app.request(
        new Request('http://local/api/prompts/prompt_restore/versions', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      const afterDeleteVersionsPayload = await afterDeleteVersionsResponse.json() as {
        data: Array<{ id: string }>;
      };
      expect(
        afterDeleteVersionsPayload.data.some((version) => version.id === 'version_restore'),
      ).toBe(false);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('supports prompt version listing, diff, and rollback', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-prompt-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'versionuser', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const created = await createPrompt(app, token, {
        title: 'Versioned prompt',
        userPrompt: 'Version one',
      });
      const promptId = created.payload.data!.id;

      const updateResponse = await app.request(
        new Request(`http://local/api/prompts/${promptId}`, {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({ userPrompt: 'Version two' }),
        }),
      );
      expect(updateResponse.status).toBe(200);

      const versionsResponse = await app.request(
        new Request(`http://local/api/prompts/${promptId}/versions`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(versionsResponse.status).toBe(200);
      const versionsPayload = await versionsResponse.json() as {
        data: Array<{ version: number; userPrompt: string }>;
      };
      expect(versionsPayload.data.length).toBeGreaterThanOrEqual(2);

      const diffResponse = await app.request(
        new Request(`http://local/api/prompts/${promptId}/versions/diff?from=1&to=2`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(diffResponse.status).toBe(200);
      const diffPayload = await diffResponse.json() as {
        data: { fields: Array<{ field: string; from: string; to: string }> };
      };
      expect(diffPayload.data.fields.some((field) => field.field === 'userPrompt')).toBe(true);

      const rollbackResponse = await app.request(
        new Request(`http://local/api/prompts/${promptId}/versions/1/rollback`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(rollbackResponse.status).toBe(200);
      const rollbackPayload = await rollbackResponse.json() as {
        data: { userPrompt: string };
      };
      expect(rollbackPayload.data.userPrompt).toBe('Version one');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('does not delete a version through a different prompt id route', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-prompt-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'versionrouteuser', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const firstPrompt = await createPrompt(app, token, {
        title: 'First prompt',
        userPrompt: 'First v1',
      });
      const secondPrompt = await createPrompt(app, token, {
        title: 'Second prompt',
        userPrompt: 'Second v1',
      });

      const firstPromptId = firstPrompt.payload.data!.id;
      const secondPromptId = secondPrompt.payload.data!.id;

      const updateSecondResponse = await app.request(
        new Request(`http://local/api/prompts/${secondPromptId}`, {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({ userPrompt: 'Second v2' }),
        }),
      );
      expect(updateSecondResponse.status).toBe(200);

      const secondVersionsResponse = await app.request(
        new Request(`http://local/api/prompts/${secondPromptId}/versions`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(secondVersionsResponse.status).toBe(200);
      const secondVersionsPayload = await secondVersionsResponse.json() as {
        data: Array<{ id: string; version: number }>;
      };
      const secondVersionTwo = secondVersionsPayload.data.find((version) => version.version === 2);
      expect(secondVersionTwo).toBeTruthy();

      const wrongRouteDeleteResponse = await app.request(
        new Request(`http://local/api/prompts/${firstPromptId}/versions/${secondVersionTwo!.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(wrongRouteDeleteResponse.status).toBe(404);

      const secondVersionsAfterResponse = await app.request(
        new Request(`http://local/api/prompts/${secondPromptId}/versions`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(secondVersionsAfterResponse.status).toBe(200);
      const secondVersionsAfterPayload = await secondVersionsAfterResponse.json() as {
        data: Array<{ id: string }>;
      };
      expect(secondVersionsAfterPayload.data.some((version) => version.id === secondVersionTwo!.id)).toBe(true);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);
});
