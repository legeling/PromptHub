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
  'DATA_DIR',
  'ALLOW_REGISTRATION',
  'LOG_LEVEL',
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

async function createTestApp(dataDir: string) {
  process.env.PORT = '3992';
  process.env.HOST = '127.0.0.1';
  process.env.JWT_SECRET = 'test-secret-for-web-import-export-flow-1234567890';
  process.env.JWT_ACCESS_TTL = '900';
  process.env.JWT_REFRESH_TTL = '604800';
  process.env.DATA_DIR = dataDir;
  process.env.ALLOW_REGISTRATION = 'true';
  process.env.LOG_LEVEL = 'debug';

  const [{ createApp }] = await Promise.all([import('../app')]);
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
    data?: { id: string; name: string; parentId?: string };
  };

  return { response, payload };
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
    data?: { id: string; title: string; currentVersion: number; folderId?: string | null };
  };

  return { response, payload };
}

async function createSkill(
  app: Awaited<ReturnType<typeof createTestApp>>,
  token: string,
  body: Record<string, unknown>,
) {
  const response = await app.request(
    new Request('http://local/api/skills', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(body),
    }),
  );

  const payload = await response.json() as {
    data?: { id: string; name: string; content?: string; instructions?: string };
  };

  return { response, payload };
}

async function exportPayload(app: Awaited<ReturnType<typeof createTestApp>>, token: string) {
  const response = await app.request(
    new Request('http://local/api/export', {
      headers: { Authorization: `Bearer ${token}` },
    }),
  );

  const payload = JSON.parse(await response.text()) as {
    version: string;
    exportedAt: string;
    prompts: Array<Record<string, unknown>>;
    promptVersions: Array<Record<string, unknown>>;
    versions: Array<Record<string, unknown>>;
    folders: Array<Record<string, unknown>>;
    skills: Array<Record<string, unknown>>;
    skillVersions: Array<Record<string, unknown>>;
    settings: Record<string, unknown>;
  };

  return { response, payload };
}

describe('web import/export routes', () => {
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

  it('exports the expected payload shape and enforces auth', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-import-export-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'exportowner', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const rootFolder = await createFolder(app, token, { name: 'Export Root' });
      const prompt = await createPrompt(app, token, {
        title: 'Export Prompt',
        userPrompt: 'Export body',
        folderId: rootFolder.payload.data!.id,
        tags: ['exported'],
      });
      expect(prompt.response.status).toBe(201);

      const skill = await createSkill(app, token, {
        name: 'export-skill',
        content: 'echo export',
      });
      expect(skill.response.status).toBe(201);

      const { response, payload } = await exportPayload(app, token);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(response.headers.get('content-disposition')).toContain('prompthub-web-export-');
      expect(payload.version).toBe('web-backup-v2');
      expect(payload.exportedAt).toMatch(ISO_TIMESTAMP);
      expect(payload.prompts).toEqual([
        expect.objectContaining({
          title: 'Export Prompt',
          folderId: rootFolder.payload.data!.id,
        }),
      ]);
      expect(payload.promptVersions.length).toBeGreaterThanOrEqual(1);
      expect(payload.versions.length).toBe(payload.promptVersions.length);
      expect(payload.folders).toEqual([
        expect.objectContaining({
          id: rootFolder.payload.data!.id,
          name: 'Export Root',
        }),
      ]);
      expect(payload.skills).toEqual([
        expect.objectContaining({
          id: skill.payload.data!.id,
          name: 'export-skill',
        }),
      ]);
      expect(payload.settings).toEqual(expect.objectContaining({
        theme: 'system',
        language: 'zh',
        autoSave: true,
        sync: {
          enabled: false,
          provider: 'manual',
          autoSync: false,
        },
      }));

      const unauthenticatedExport = await app.request(new Request('http://local/api/export'));
      expect(unauthenticatedExport.status).toBe(401);

      const unauthenticatedImport = await app.request(
        new Request('http://local/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      );
      expect(unauthenticatedImport.status).toBe(401);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('round-trips data, merges visible records, restores settings, and preserves nested folders', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-import-export-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'roundtripowner', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const rootFolder = await createFolder(app, token, { name: 'Projects' });
      const childFolder = await createFolder(app, token, {
        name: 'Nested',
        parentId: rootFolder.payload.data!.id,
      });
      const prompt = await createPrompt(app, token, {
        title: 'Round-trip Prompt',
        userPrompt: 'Version one',
        folderId: childFolder.payload.data!.id,
        tags: ['sync', 'roundtrip'],
      });
      const promptId = prompt.payload.data!.id;

      const promptUpdate = await app.request(
        new Request(`http://local/api/prompts/${promptId}`, {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({ userPrompt: 'Version two', isFavorite: true }),
        }),
      );
      expect(promptUpdate.status).toBe(200);

      const skill = await createSkill(app, token, {
        name: 'roundtrip-skill',
        content: 'echo version one',
      });
      const skillId = skill.payload.data!.id;

      const skillUpdate = await app.request(
        new Request(`http://local/api/skills/${skillId}`, {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({ content: 'echo version two' }),
        }),
      );
      expect(skillUpdate.status).toBe(200);

      const createSkillVersion = await app.request(
        new Request(`http://local/api/skills/${skillId}/versions`, {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({ note: 'snapshot-1' }),
        }),
      );
      expect(createSkillVersion.status).toBe(201);

      const settingsUpdate = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            theme: 'dark',
            language: 'fr',
            autoSave: false,
            defaultFolderId: rootFolder.payload.data!.id,
            customSkillPlatformPaths: { claude: '/tmp/exported-skills' },
            sync: {
              enabled: true,
              provider: 'webdav',
              endpoint: 'https://dav.example.com/remote.php/dav/files/roundtrip',
              username: 'roundtrip-user',
              password: 'roundtrip-pass',
              remotePath: '/exports',
              autoSync: true,
              lastSyncAt: '2026-04-13T12:00:00.000Z',
            },
            security: {
              masterPasswordConfigured: true,
              unlocked: false,
            },
          }),
        }),
      );
      expect(settingsUpdate.status).toBe(200);

      const { payload: backupPayload } = await exportPayload(app, token);

      await createFolder(app, token, { name: 'Replacement Folder' });
      await createPrompt(app, token, { title: 'Replacement Prompt', userPrompt: 'Discard me' });
      await createSkill(app, token, { name: 'replacement-skill', content: 'echo discard' });

      const noisySettings = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({ theme: 'light', language: 'de', autoSave: true }),
        }),
      );
      expect(noisySettings.status).toBe(200);

      const importResponse = await app.request(
        new Request('http://local/api/import', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify(backupPayload),
        }),
      );

      expect(importResponse.status).toBe(201);
      const importBody = await importResponse.json() as {
        data: {
          promptsImported: number;
          foldersImported: number;
          skillsImported: number;
          settingsUpdated: boolean;
        };
      };
      expect(importBody.data).toEqual({
        promptsImported: 1,
        foldersImported: 2,
        skillsImported: 1,
        settingsUpdated: true,
      });

      const { payload: restoredPayload } = await exportPayload(app, token);

      expect(restoredPayload.prompts).toHaveLength(2);
      expect(restoredPayload.prompts).toEqual(expect.arrayContaining([
        expect.objectContaining({
          title: 'Round-trip Prompt',
          userPrompt: 'Version two',
          isFavorite: true,
        }),
        expect.objectContaining({
          title: 'Replacement Prompt',
          userPrompt: 'Discard me',
        }),
      ]));
      expect(restoredPayload.promptVersions.length).toBe(backupPayload.promptVersions.length + 1);

      expect(restoredPayload.skills).toHaveLength(2);
      expect(restoredPayload.skills).toEqual(expect.arrayContaining([
        expect.objectContaining({
          name: 'roundtrip-skill',
          content: 'echo version two',
        }),
        expect.objectContaining({
          name: 'replacement-skill',
          content: 'echo discard',
        }),
      ]));
      expect(restoredPayload.skillVersions).toHaveLength(1);

      const restoredRootFolder = restoredPayload.folders.find((folder) => folder.name === 'Projects');
      const restoredChildFolder = restoredPayload.folders.find((folder) => folder.name === 'Nested');
      const replacementFolder = restoredPayload.folders.find((folder) => folder.name === 'Replacement Folder');
      const roundTripPrompt = restoredPayload.prompts.find((prompt) => prompt.title === 'Round-trip Prompt');
      expect(restoredPayload.folders).toHaveLength(3);
      expect(restoredRootFolder).toBeTruthy();
      expect(restoredChildFolder).toBeTruthy();
      expect(replacementFolder).toBeTruthy();
      expect(restoredChildFolder?.parentId).toBe(restoredRootFolder?.id);
      expect(roundTripPrompt?.folderId).toBe(restoredChildFolder?.id);

      expect(restoredPayload.settings).toEqual(expect.objectContaining({
        theme: 'dark',
        language: 'fr',
        autoSave: false,
        customSkillPlatformPaths: { claude: '/tmp/exported-skills' },
        security: {
          masterPasswordConfigured: true,
          unlocked: false,
        },
        sync: {
          enabled: true,
          provider: 'webdav',
          endpoint: 'https://dav.example.com/remote.php/dav/files/roundtrip',
          username: 'roundtrip-user',
          password: 'roundtrip-pass',
          remotePath: '/exports',
          autoSync: true,
          lastSyncAt: '2026-04-13T12:00:00.000Z',
        },
      }));
      expect(restoredPayload.settings.defaultFolderId).toBe(restoredRootFolder?.id);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('imports legacy versions payloads and normalizes numeric timestamps back to ISO strings', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-import-export-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'legacyimporter', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const folder = await createFolder(app, token, { name: 'Legacy Folder' });
      const prompt = await createPrompt(app, token, {
        title: 'Legacy Prompt',
        userPrompt: 'Legacy body',
        folderId: folder.payload.data!.id,
      });
      expect(prompt.response.status).toBe(201);

      const promptUpdate = await app.request(
        new Request(`http://local/api/prompts/${prompt.payload.data!.id}`, {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({ userPrompt: 'Legacy body v2' }),
        }),
      );
      expect(promptUpdate.status).toBe(200);

      const skill = await createSkill(app, token, { name: 'legacy-skill', content: 'echo legacy' });
      expect(skill.response.status).toBe(201);

      const createSkillVersion = await app.request(
        new Request(`http://local/api/skills/${skill.payload.data!.id}/versions`, {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({ note: 'legacy-snapshot' }),
        }),
      );
      expect(createSkillVersion.status).toBe(201);

      const { payload: exportedPayload } = await exportPayload(app, token);

      const legacyPayload = structuredClone(exportedPayload);
      legacyPayload.promptVersions = [];
      legacyPayload.prompts = legacyPayload.prompts.map((entry) => ({
        ...entry,
        createdAt: typeof entry.createdAt === 'string' ? Date.parse(entry.createdAt) : entry.createdAt,
        updatedAt: typeof entry.updatedAt === 'string' ? Date.parse(entry.updatedAt) : entry.updatedAt,
      }));
      legacyPayload.versions = legacyPayload.versions.map((entry) => ({
        ...entry,
        createdAt: typeof entry.createdAt === 'string' ? Date.parse(entry.createdAt) : entry.createdAt,
      }));
      legacyPayload.folders = legacyPayload.folders.map((entry) => ({
        ...entry,
        createdAt: typeof entry.createdAt === 'string' ? Date.parse(entry.createdAt) : entry.createdAt,
        updatedAt: typeof entry.updatedAt === 'string' ? Date.parse(entry.updatedAt) : entry.updatedAt,
      }));
      legacyPayload.skillVersions = legacyPayload.skillVersions.map((entry) => ({
        ...entry,
        createdAt: typeof entry.createdAt === 'string' ? Date.parse(entry.createdAt) : entry.createdAt,
      }));

      const importResponse = await app.request(
        new Request('http://local/api/import', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify(legacyPayload),
        }),
      );

      expect(importResponse.status).toBe(201);

      const { payload: reExportedPayload } = await exportPayload(app, token);
      expect(reExportedPayload.promptVersions.length).toBe(exportedPayload.versions.length);
      expect(reExportedPayload.prompts[0]?.createdAt).toMatch(ISO_TIMESTAMP);
      expect(reExportedPayload.prompts[0]?.updatedAt).toMatch(ISO_TIMESTAMP);
      expect(reExportedPayload.promptVersions[0]?.createdAt).toMatch(ISO_TIMESTAMP);
      expect(reExportedPayload.folders[0]?.createdAt).toMatch(ISO_TIMESTAMP);
      expect(reExportedPayload.folders[0]?.updatedAt).toMatch(ISO_TIMESTAMP);
      expect(reExportedPayload.skillVersions[0]?.createdAt).toMatch(ISO_TIMESTAMP);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects invalid import payloads', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-import-export-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'invalidimporter', 'debugpass001');

      const response = await app.request(
        new Request('http://local/api/import', {
          method: 'POST',
          headers: authHeaders(registerPayload.data.accessToken),
          body: JSON.stringify({
            version: 'web-backup-v2',
            exportedAt: '2026-04-13T00:00:00.000Z',
            prompts: [],
            promptVersions: [],
            folders: [],
            skills: [],
            skillVersions: [],
            settings: {
              theme: 'blue',
              language: 'zh',
              autoSave: true,
            },
          }),
        }),
      );

      expect(response.status).toBe(422);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('settings.theme');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);
});
