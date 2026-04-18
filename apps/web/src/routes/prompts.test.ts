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
});
