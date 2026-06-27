import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { closeDatabase } from '@prompthub/db';
import { DEFAULT_SETTINGS } from '@prompthub/shared';
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
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

async function createTestApp(dataDir: string) {
  process.env.PORT = '3992';
  process.env.HOST = '127.0.0.1';
  process.env.JWT_SECRET = 'test-secret-for-web-import-export-flow-1234567890';
  process.env.JWT_ACCESS_TTL = '900';
  process.env.JWT_REFRESH_TTL = '604800';
  process.env.DATA_ROOT = dataDir;
  process.env.ALLOW_REGISTRATION = 'true';
  process.env.LOG_LEVEL = 'debug';

  const [{ createApp }] = await Promise.all([import('../app')]);
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

function streamedOversizedMultipartImportRequest(token: string): Request {
  const boundary = '----prompthub-import-stream-boundary';
  const encoder = new TextEncoder();
  const header = encoder.encode(
    `--${boundary}\r\n`
    + 'Content-Disposition: form-data; name="file"; filename="backup.zip"\r\n'
    + 'Content-Type: application/zip\r\n\r\n',
  );
  const footer = encoder.encode(`\r\n--${boundary}--\r\n`);
  const oversizedChunk = new Uint8Array(50 * 1024 * 1024 + 1);

  return new Request('http://local/api/import', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(header);
        controller.enqueue(oversizedChunk);
        controller.enqueue(footer);
        controller.close();
      },
    }),
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
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

async function uploadMedia(
  app: Awaited<ReturnType<typeof createTestApp>>,
  token: string,
  kind: 'images' | 'videos',
  fileName: string,
  content: string,
) {
  const response = await app.request(
    new Request(`http://local/api/media/${kind}/base64`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        fileName,
        base64Data: Buffer.from(content, 'utf8').toString('base64'),
      }),
    }),
  );

  const payload = await response.json() as { data: string };
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
    rules?: Array<Record<string, unknown>>;
    skills: Array<Record<string, unknown>>;
    skillVersions: Array<Record<string, unknown>>;
    skillFiles?: Record<string, Array<{ relativePath: string; content: string }>>;
    images?: Record<string, string>;
    videos?: Record<string, string>;
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
      const uploadedImage = await uploadMedia(app, token, 'images', 'export-image.png', 'image-content');
      expect(uploadedImage.response.status).toBe(201);
      const uploadedVideo = await uploadMedia(app, token, 'videos', 'export-video.mp4', 'video-content');
      expect(uploadedVideo.response.status).toBe(201);

      const prompt = await createPrompt(app, token, {
        title: 'Export Prompt',
        userPrompt: 'Export body',
        folderId: rootFolder.payload.data!.id,
        tags: ['exported'],
        images: [uploadedImage.payload.data],
        videos: [uploadedVideo.payload.data],
      });
      expect(prompt.response.status).toBe(201);

      const skill = await createSkill(app, token, {
        name: 'export-skill',
        content: 'echo export',
      });
      expect(skill.response.status).toBe(201);
      fs.mkdirSync(path.join(dataDir, 'data', 'skills', `export-skill__${skill.payload.data!.id}`, 'templates'), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(dataDir, 'data', 'skills', `export-skill__${skill.payload.data!.id}`, 'templates', 'guide.md'),
        '# Export guide',
        'utf8',
      );

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
      expect(payload.skillFiles).toEqual(
        expect.objectContaining({
          [skill.payload.data!.id]: expect.arrayContaining([
            expect.objectContaining({ relativePath: 'SKILL.md', content: 'echo export' }),
            expect.objectContaining({ relativePath: 'templates/guide.md', content: '# Export guide' }),
          ]),
        }),
      );
      expect(payload.rules).toEqual([]);
      expect(payload.images).toEqual({
        [uploadedImage.payload.data]: Buffer.from('image-content', 'utf8').toString('base64'),
      });
      expect(payload.videos).toEqual({
        [uploadedVideo.payload.data]: Buffer.from('video-content', 'utf8').toString('base64'),
      });
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
            tagFilterMode: 'single',
            promptTagCatalog: ['sync', 'roundtrip'],
            defaultFolderId: rootFolder.payload.data!.id,
            backgroundImageFileName: 'roundtrip-wallpaper.png',
            backgroundImageOpacity: 0.4,
            backgroundImageBlur: 8,
            builtinAgentOverrides: {
              claude: {
                rootPath: '/tmp/exported-agent-root',
                skillsRelativePath: 'skills',
                configRelativePaths: ['config.json'],
              },
            },
            customPlatformRootPaths: { claude: '/tmp/exported-root' },
            customAgents: [{
              id: 'exported-agent',
              name: 'Exported Agent',
              rootPath: '/tmp/exported-agent',
              skillsRelativePath: 'skills',
              configRelativePaths: ['config.json'],
            }],
            customAgentRootPaths: ['/tmp/exported-custom-agent-root'],
            disabledPlatformIds: ['cursor'],
            customSkillPlatformPaths: { cherry: '/tmp/exported-cherry-skills' },
            skillPlatformOrder: ['codex', 'claude'],
            skillProjects: [{
              id: 'exported-project',
              name: 'Exported Project',
              rootPath: '/tmp/exported-project',
              scanPaths: ['/tmp/exported-project/.agents/skills'],
              deployTargets: ['/tmp/exported-project/.agents/skills'],
              createdAt: 1780999200000,
              updatedAt: 1780999200000,
            }],
            lastManualBackupAt: '2026-04-13T13:00:00.000Z',
            lastManualBackupVersion: '0.5.8',
            updateChannel: 'preview',
            launchAtStartup: true,
            minimizeOnLaunch: true,
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
          }),
        }),
      );
      expect(settingsUpdate.status).toBe(200);

      const { payload: backupPayload } = await exportPayload(app, token);
      backupPayload.settings.security = {
        masterPasswordConfigured: true,
        unlocked: false,
      };
      backupPayload.rules = [
        {
          id: 'project:projects-rule',
          platformId: 'workspace',
          platformName: 'Projects Rule',
          platformIcon: 'FolderRoot',
          platformDescription: 'Rule imported from desktop',
          name: 'AGENTS.md',
          description: 'Project rule file',
          path: '/workspace/AGENTS.md',
          targetPath: '/workspace/AGENTS.md',
          projectRootPath: '/workspace',
          syncStatus: 'synced',
          content: '# Projects rules',
          versions: [],
        },
      ];

      await createFolder(app, token, { name: 'Replacement Folder' });
      await createPrompt(app, token, { title: 'Replacement Prompt', userPrompt: 'Discard me' });
      await createSkill(app, token, { name: 'replacement-skill', content: 'echo discard' });

      const noisySettings = await app.request(
        new Request('http://local/api/settings', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            theme: 'light',
            language: 'de',
            autoSave: true,
            tagFilterMode: 'multi',
            promptTagCatalog: ['discard'],
            backgroundImageFileName: 'discard-wallpaper.png',
            backgroundImageOpacity: 0.8,
            backgroundImageBlur: 2,
            builtinAgentOverrides: {
              claude: {
                rootPath: '/tmp/discard-agent-root',
                skillsRelativePath: 'discard-skills',
                configRelativePaths: ['discard.json'],
              },
            },
            customAgents: [{
              id: 'discard-agent',
              name: 'Discard Agent',
              rootPath: '/tmp/discard-agent',
              skillsRelativePath: 'discard-skills',
              configRelativePaths: ['discard.json'],
            }],
            customAgentRootPaths: ['/tmp/discard-custom-agent-root'],
            disabledPlatformIds: ['windsurf'],
            customSkillPlatformPaths: { cherry: '/tmp/discard-cherry-skills' },
            skillPlatformOrder: ['claude', 'codex'],
            skillProjects: [{
              id: 'discard-project',
              name: 'Discard Project',
              rootPath: '/tmp/discard-project',
              scanPaths: ['/tmp/discard-project/.agents/skills'],
              deployTargets: ['/tmp/discard-project/.agents/skills'],
              createdAt: 1780999300000,
              updatedAt: 1780999300000,
            }],
            lastManualBackupAt: '2026-04-13T14:00:00.000Z',
            lastManualBackupVersion: 'discard-version',
            updateChannel: 'stable',
            launchAtStartup: false,
            minimizeOnLaunch: false,
          }),
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
          rulesImported: number;
          skillsImported: number;
          pluginsImported: number;
          mcpServersImported: number;
          settingsUpdated: boolean;
        };
      };
      expect(importBody.data).toEqual({
        promptsImported: 1,
        foldersImported: 2,
        rulesImported: 1,
        skillsImported: 1,
        pluginsImported: 0,
        mcpServersImported: 0,
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
      expect(restoredPayload.rules).toEqual([
        expect.objectContaining({
          id: 'project:projects-rule',
          content: '# Projects rules',
        }),
      ]);

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
        tagFilterMode: 'single',
        promptTagCatalog: ['sync', 'roundtrip'],
        backgroundImageFileName: 'roundtrip-wallpaper.png',
        backgroundImageOpacity: 0.4,
        backgroundImageBlur: 8,
        builtinAgentOverrides: {
          claude: {
            rootPath: '/tmp/exported-agent-root',
            skillsRelativePath: 'skills',
            configRelativePaths: ['config.json'],
          },
        },
        customPlatformRootPaths: { claude: '/tmp/exported-root' },
        customAgents: [{
          id: 'exported-agent',
          name: 'Exported Agent',
          rootPath: '/tmp/exported-agent',
          skillsRelativePath: 'skills',
          configRelativePaths: ['config.json'],
        }],
        customAgentRootPaths: ['/tmp/exported-custom-agent-root'],
        disabledPlatformIds: ['cursor'],
        customSkillPlatformPaths: { cherry: '/tmp/exported-cherry-skills' },
        skillPlatformOrder: ['codex', 'claude'],
        skillProjects: [{
          id: 'exported-project',
          name: 'Exported Project',
          rootPath: '/tmp/exported-project',
          scanPaths: ['/tmp/exported-project/.agents/skills'],
          deployTargets: ['/tmp/exported-project/.agents/skills'],
          createdAt: 1780999200000,
          updatedAt: 1780999200000,
        }],
        lastManualBackupAt: '2026-04-13T13:00:00.000Z',
        lastManualBackupVersion: '0.5.8',
        updateChannel: 'preview',
        launchAtStartup: true,
        minimizeOnLaunch: true,
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

  it('imports PromptHub backup/export envelopes and restores embedded media payloads', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-import-export-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'envelopeimporter', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const envelopePayload = {
        kind: 'prompthub-backup',
        exportedAt: '2026-04-20T00:00:00.000Z',
        payload: {
          version: 1,
          exportedAt: '2026-04-20T00:00:00.000Z',
          prompts: [
            {
              id: 'prompt-envelope-1',
              title: 'Envelope Prompt',
              userPrompt: 'Envelope body',
              variables: [],
              tags: [],
              folderId: 'folder-envelope-1',
              images: ['image-envelope.png'],
              videos: ['video-envelope.mp4'],
              isFavorite: false,
              isPinned: false,
              version: 1,
              currentVersion: 1,
              usageCount: 0,
              createdAt: '2026-04-20T00:00:00.000Z',
              updatedAt: '2026-04-20T00:00:00.000Z',
            },
          ],
          folders: [
            {
              id: 'folder-envelope-1',
              name: 'Envelope Folder',
              order: 0,
              createdAt: '2026-04-20T00:00:00.000Z',
              updatedAt: '2026-04-20T00:00:00.000Z',
            },
          ],
          versions: [
            {
              id: 'prompt-envelope-v1',
              promptId: 'prompt-envelope-1',
              version: 1,
              userPrompt: 'Envelope body',
              variables: [],
              createdAt: '2026-04-20T00:00:00.000Z',
            },
          ],
          images: {
            'image-envelope.png': Buffer.from('envelope-image', 'utf8').toString('base64'),
          },
          videos: {
            'video-envelope.mp4': Buffer.from('envelope-video', 'utf8').toString('base64'),
          },
          skills: [],
          skillVersions: [],
          settings: {
            state: {
              themeMode: 'dark',
              language: 'fr',
              autoSave: false,
              customPlatformRootPaths: {
                claude: '/tmp/envelope-root',
              },
            },
          },
          settingsUpdatedAt: '2026-04-20T00:00:00.000Z',
        },
      };

      const importResponse = await app.request(
        new Request('http://local/api/import', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify(envelopePayload),
        }),
      );

      expect(importResponse.status).toBe(201);

      const { payload: exportedPayload } = await exportPayload(app, token);
      expect(exportedPayload.prompts).toEqual([
        expect.objectContaining({
          title: 'Envelope Prompt',
          images: ['image-envelope.png'],
          videos: ['video-envelope.mp4'],
        }),
      ]);
      expect(exportedPayload.settings).toEqual(
        expect.objectContaining({
          theme: 'dark',
          language: 'fr',
          autoSave: false,
          customPlatformRootPaths: {
            claude: '/tmp/envelope-root',
          },
        }),
      );
      expect(exportedPayload.images).toEqual({
        'image-envelope.png': Buffer.from('envelope-image', 'utf8').toString('base64'),
      });
      expect(exportedPayload.videos).toEqual({
        'video-envelope.mp4': Buffer.from('envelope-video', 'utf8').toString('base64'),
      });
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('fills missing settings with shared defaults during import', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-import-default-settings-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'defaultsettingsimporter', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const importResponse = await app.request(
        new Request('http://local/api/import', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            version: 'web-backup-v2',
            exportedAt: '2026-04-21T00:00:00.000Z',
            prompts: [],
            promptVersions: [],
            folders: [],
            skills: [],
            skillVersions: [],
          }),
        }),
      );

      expect(importResponse.status).toBe(201);

      const { payload: exportedPayload } = await exportPayload(app, token);
      expect(exportedPayload.settings).toEqual(
        expect.objectContaining({
          theme: DEFAULT_SETTINGS.theme,
          language: DEFAULT_SETTINGS.language,
          autoSave: DEFAULT_SETTINGS.autoSave,
        }),
      );
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects imported WebDAV settings with insecure endpoints', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-import-settings-boundary-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'insecuresettingsimporter', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const importResponse = await app.request(
        new Request('http://local/api/import', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            version: 'web-backup-v2',
            exportedAt: '2026-04-21T00:00:00.000Z',
            prompts: [],
            promptVersions: [],
            folders: [],
            skills: [],
            skillVersions: [],
            settings: {
              ...DEFAULT_SETTINGS,
              sync: {
                enabled: true,
                provider: 'webdav',
                endpoint: 'http://dav.example.com/remote.php/dav/files/import',
              },
            },
          }),
        }),
      );

      expect(importResponse.status).toBe(422);
      const importBody = await importResponse.json() as { error: { code: string; message: string } };
      expect(importBody.error.code).toBe('VALIDATION_ERROR');
      expect(importBody.error.message).toContain('settings.sync.endpoint');
      expect(importBody.error.message).toContain('WebDAV endpoint must use HTTPS');

      const { payload: exportedPayload } = await exportPayload(app, token);
      const exportedSettings = exportedPayload.settings as { sync?: { endpoint?: string } };
      expect(exportedSettings.sync?.endpoint).toBeUndefined();
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects imported WebDAV settings with oversized fields', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-import-settings-size-boundary-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'oversizedsettingsimporter', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const importResponse = await app.request(
        new Request('http://local/api/import', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            version: 'web-backup-v2',
            exportedAt: '2026-04-21T00:00:00.000Z',
            prompts: [],
            promptVersions: [],
            folders: [],
            skills: [],
            skillVersions: [],
            settings: {
              ...DEFAULT_SETTINGS,
              sync: {
                enabled: true,
                provider: 'webdav',
                endpoint: `https://dav.example.com/${'a'.repeat(2050)}`,
                username: 'u'.repeat(513),
                password: 'p'.repeat(513),
                remotePath: `/${'backup/'.repeat(180)}`,
                autoSync: true,
                lastSyncAt: 'not-an-iso-date',
              },
            },
          }),
        }),
      );

      expect(importResponse.status).toBe(422);
      const importBody = await importResponse.json() as { error: { code: string; message: string } };
      expect(importBody.error.code).toBe('VALIDATION_ERROR');
      expect(importBody.error.message).toContain('settings.sync.endpoint');
      expect(importBody.error.message).toContain('settings.sync.username');
      expect(importBody.error.message).toContain('settings.sync.password');
      expect(importBody.error.message).toContain('settings.sync.remotePath');
      expect(importBody.error.message).toContain('settings.sync.lastSyncAt');

      const { payload: exportedPayload } = await exportPayload(app, token);
      const exportedSettings = exportedPayload.settings as { sync?: { endpoint?: string } };
      expect(exportedSettings.sync?.endpoint).toBeUndefined();
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects imported settings with malformed persisted preference fields', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-import-preference-boundary-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'malformedsettingsimporter', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const importResponse = await app.request(
        new Request('http://local/api/import', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            version: 'web-backup-v2',
            exportedAt: '2026-04-21T00:00:00.000Z',
            prompts: [],
            promptVersions: [],
            folders: [],
            skills: [],
            skillVersions: [],
            settings: {
              ...DEFAULT_SETTINGS,
              backgroundImageFileName: '../wallpaper.png',
              lastManualBackupAt: 'not-an-iso-date',
              lastManualBackupVersion: 'v'.repeat(121),
            },
          }),
        }),
      );

      expect(importResponse.status).toBe(422);
      const importBody = await importResponse.json() as { error: { code: string; message: string } };
      expect(importBody.error.code).toBe('VALIDATION_ERROR');
      expect(importBody.error.message).toContain('settings.backgroundImageFileName');
      expect(importBody.error.message).toContain('settings.lastManualBackupAt');
      expect(importBody.error.message).toContain('settings.lastManualBackupVersion');

      const { payload: exportedPayload } = await exportPayload(app, token);
      const exportedSettings = exportedPayload.settings as {
        backgroundImageFileName?: string;
        lastManualBackupAt?: string;
        lastManualBackupVersion?: string;
      };
      expect(exportedSettings.backgroundImageFileName).toBeUndefined();
      expect(exportedSettings.lastManualBackupAt).toBeUndefined();
      expect(exportedSettings.lastManualBackupVersion).toBeUndefined();
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

  it('rejects import requests with oversized content-length before parsing payloads', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-import-size-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'oversizedimporter', 'debugpass001');

      const response = await app.request(
        new Request('http://local/api/import', {
          method: 'POST',
          headers: {
            ...authHeaders(registerPayload.data.accessToken),
            'Content-Length': String(51 * 1024 * 1024),
          },
          body: JSON.stringify({
            version: 'web-backup-v2',
            exportedAt: '2026-04-24T00:00:00.000Z',
            prompts: [],
            promptVersions: [],
            folders: [],
            skills: [],
            skillVersions: [],
          }),
        }),
      );

      expect(response.status).toBe(400);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error).toEqual({
        code: 'BAD_REQUEST',
        message: 'Import request body exceeds size limit',
      });

      const { payload: exportedPayload } = await exportPayload(app, registerPayload.data.accessToken);
      expect(exportedPayload.prompts).toEqual([]);
      expect(exportedPayload.folders).toEqual([]);
      expect(exportedPayload.skills).toEqual([]);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects streamed multipart imports that exceed the import body limit', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-import-stream-size-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'streamedmultipartimporter', 'debugpass001');

      const response = await app.request(
        streamedOversizedMultipartImportRequest(registerPayload.data.accessToken),
      );

      expect(response.status).toBe(400);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error).toEqual({
        code: 'BAD_REQUEST',
        message: 'Import request body exceeds size limit',
      });

      const { payload: exportedPayload } = await exportPayload(app, registerPayload.data.accessToken);
      expect(exportedPayload.prompts).toEqual([]);
      expect(exportedPayload.folders).toEqual([]);
      expect(exportedPayload.skills).toEqual([]);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects unsafe imported skill file paths before importing records', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-import-export-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'unsafe-skill-file-importer', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const invalidPaths = ['../escape.md', 'versions', 'bad\u0000name.md'];
      for (const relativePath of invalidPaths) {
        const response = await app.request(
          new Request('http://local/api/import', {
            method: 'POST',
            headers: authHeaders(token),
            body: JSON.stringify({
              version: 'web-backup-v2',
              exportedAt: '2026-04-22T00:00:00.000Z',
              prompts: [
                {
                  id: `unsafe-skill-file-prompt-${relativePath}`,
                  title: 'Should Not Import',
                  userPrompt: 'This prompt must not survive a rejected import',
                  variables: [],
                  tags: [],
                  images: [],
                  videos: [],
                  isFavorite: false,
                  isPinned: false,
                  version: 1,
                  currentVersion: 1,
                  usageCount: 0,
                  createdAt: '2026-04-22T00:00:00.000Z',
                  updatedAt: '2026-04-22T00:00:00.000Z',
                },
              ],
              promptVersions: [],
              folders: [],
              skills: [
                {
                  id: `unsafe-skill-file-skill-${relativePath}`,
                  name: `unsafe-skill-file-skill-${relativePath}`,
                  content: 'echo unsafe',
                  instructions: 'echo unsafe',
                  protocol_type: 'skill',
                  is_favorite: false,
                  created_at: 1776816000000,
                  updated_at: 1776816000000,
                },
              ],
              skillVersions: [],
              skillFiles: {
                [`unsafe-skill-file-skill-${relativePath}`]: [
                  {
                    relativePath,
                    content: 'escape',
                  },
                ],
              },
            }),
          }),
        );

        expect(response.status).toBe(422);
        const body = await response.json() as { error: { code: string; message: string } };
        expect(body.error.code).toBe('VALIDATION_ERROR');
        expect(body.error.message).toContain(`skillFiles.unsafe-skill-file-skill-${relativePath}.0.relativePath`);
        expect(body.error.message).toContain('Invalid skill file path');
      }

      const { payload: exportedPayload } = await exportPayload(app, token);
      expect(exportedPayload.prompts).toEqual([]);
      expect(exportedPayload.skills).toEqual([]);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects imported skills with unsafe URL metadata before importing records', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-import-export-skill-url-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'unsafe-skill-url-importer', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const response = await app.request(
        new Request('http://local/api/import', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            version: 'web-backup-v2',
            exportedAt: '2026-04-22T00:00:00.000Z',
            prompts: [],
            promptVersions: [],
            folders: [],
            skills: [
              {
                id: 'unsafe-url-skill',
                name: 'unsafe-url-skill',
                content: 'echo unsafe',
                instructions: 'echo unsafe',
                protocol_type: 'skill',
                is_favorite: false,
                source_url: 'javascript:alert(1)',
                icon_url: 'file:///tmp/icon.svg',
                created_at: 1776816000000,
                updated_at: 1776816000000,
              },
            ],
            skillVersions: [],
            settings: DEFAULT_SETTINGS,
          }),
        }),
      );

      expect(response.status).toBe(422);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('skills.0.source_url');
      expect(body.error.message).toContain('skills.0.icon_url');

      const { payload: exportedPayload } = await exportPayload(app, token);
      expect(exportedPayload.skills).toEqual([]);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rolls back database records when import fails during later writes', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-import-export-test-'));

    try {
      vi.resetModules();
      vi.doMock('../services/rule-workspace.js', async () => {
        const actual = await vi.importActual<typeof import('../services/rule-workspace.js')>('../services/rule-workspace.js');
        return {
          ...actual,
          importRuleBackupRecords: vi.fn(() => {
            throw new Error('Simulated rule import failure');
          }),
        };
      });

      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'atomic-importer', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const response = await app.request(
        new Request('http://local/api/import', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            version: 'web-backup-v2',
            exportedAt: '2026-04-23T00:00:00.000Z',
            prompts: [
              {
                id: 'atomic-prompt',
                title: 'Atomic Prompt',
                userPrompt: 'This prompt must roll back',
                variables: [],
                tags: [],
                images: ['atomic-image.png'],
                videos: [],
                isFavorite: false,
                isPinned: false,
                version: 1,
                currentVersion: 1,
                usageCount: 0,
                folderId: 'atomic-folder',
                createdAt: '2026-04-23T00:00:00.000Z',
                updatedAt: '2026-04-23T00:00:00.000Z',
              },
            ],
            promptVersions: [],
            folders: [
              {
                id: 'atomic-folder',
                name: 'Atomic Folder',
                order: 0,
                createdAt: '2026-04-23T00:00:00.000Z',
                updatedAt: '2026-04-23T00:00:00.000Z',
              },
            ],
            rules: [
              {
                id: 'project:atomic-rule',
                platformId: 'workspace',
                platformName: 'Atomic Rule',
                platformIcon: 'FolderRoot',
                platformDescription: 'Rule import failure trigger',
                name: 'AGENTS.md',
                description: 'Atomic rule',
                path: '/atomic/AGENTS.md',
                targetPath: '/atomic/AGENTS.md',
                projectRootPath: '/atomic',
                syncStatus: 'synced',
                content: '# Atomic',
                versions: [],
              },
            ],
            skills: [],
            skillVersions: [],
            images: {
              'atomic-image.png': Buffer.from('atomic-image').toString('base64'),
            },
          }),
        }),
      );

      expect(response.status).toBe(400);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error.message).toContain('Simulated rule import failure');

      const { payload: exportedPayload } = await exportPayload(app, token);
      expect(exportedPayload.prompts).toEqual([]);
      expect(exportedPayload.folders).toEqual([]);
      expect(exportedPayload.rules).toEqual([]);
      expect(fs.existsSync(path.join(dataDir, 'data', 'assets', registerPayload.data.user.id, 'images', 'atomic-image.png'))).toBe(false);
    } finally {
      vi.doUnmock('../services/rule-workspace.js');
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects imported folder parent cycles before importing records', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-import-export-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'cyclic-folder-importer', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const response = await app.request(
        new Request('http://local/api/import', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            version: 'web-backup-v2',
            exportedAt: '2026-04-22T00:00:00.000Z',
            prompts: [
              {
                id: 'cyclic-folder-prompt',
                title: 'Should Not Import',
                userPrompt: 'This prompt must not survive a rejected import',
                variables: [],
                tags: [],
                images: [],
                videos: [],
                isFavorite: false,
                isPinned: false,
                version: 1,
                currentVersion: 1,
                usageCount: 0,
                createdAt: '2026-04-22T00:00:00.000Z',
                updatedAt: '2026-04-22T00:00:00.000Z',
              },
            ],
            promptVersions: [],
            folders: [
              {
                id: 'folder-a',
                name: 'Folder A',
                parentId: 'folder-b',
                order: 0,
                createdAt: '2026-04-22T00:00:00.000Z',
                updatedAt: '2026-04-22T00:00:00.000Z',
              },
              {
                id: 'folder-b',
                name: 'Folder B',
                parentId: 'folder-a',
                order: 1,
                createdAt: '2026-04-22T00:00:00.000Z',
                updatedAt: '2026-04-22T00:00:00.000Z',
              },
            ],
            skills: [],
            skillVersions: [],
          }),
        }),
      );

      expect(response.status).toBe(422);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('folders');
      expect(body.error.message).toContain('cycle');

      const { payload: exportedPayload } = await exportPayload(app, token);
      expect(exportedPayload.prompts).toEqual([]);
      expect(exportedPayload.folders).toEqual([]);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('imports large reversed folder hierarchies with intact parent links', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-import-export-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'large-folder-importer', 'debugpass001');
      const token = registerPayload.data.accessToken;
      const folderCount = 40;
      const folders = Array.from({ length: folderCount }, (_, index) => ({
        id: `large-folder-${index}`,
        name: `Large Folder ${index}`,
        parentId: index === 0 ? null : `large-folder-${index - 1}`,
        order: index,
        createdAt: '2026-04-22T00:00:00.000Z',
        updatedAt: '2026-04-22T00:00:00.000Z',
      })).reverse();

      const response = await app.request(
        new Request('http://local/api/import', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            version: 'web-backup-v2',
            exportedAt: '2026-04-22T00:00:00.000Z',
            prompts: [],
            promptVersions: [],
            folders,
            skills: [],
            skillVersions: [],
          }),
        }),
      );

      expect(response.status).toBe(201);
      const { payload: exportedPayload } = await exportPayload(app, token);
      expect(exportedPayload.folders).toHaveLength(folderCount);

      for (let index = 1; index < folderCount; index += 1) {
        const folder = exportedPayload.folders.find((entry) => entry.id === `large-folder-${index}`);
        expect(folder?.parentId).toBe(`large-folder-${index - 1}`);
      }
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects folder hierarchies that exceed prompt workspace path limits before importing records', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-import-export-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'deep-folder-importer', 'debugpass001');
      const token = registerPayload.data.accessToken;
      const folderCount = 180;
      const folders = Array.from({ length: folderCount }, (_, index) => ({
        id: `deep-folder-${index}`,
        name: `Deep Folder ${index}`,
        parentId: index === 0 ? null : `deep-folder-${index - 1}`,
        order: index,
        createdAt: '2026-04-22T00:00:00.000Z',
        updatedAt: '2026-04-22T00:00:00.000Z',
      })).reverse();

      const response = await app.request(
        new Request('http://local/api/import', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            version: 'web-backup-v2',
            exportedAt: '2026-04-22T00:00:00.000Z',
            prompts: [
              {
                id: 'deep-folder-prompt',
                title: 'Should Not Import',
                userPrompt: 'This prompt must not survive a rejected import',
                variables: [],
                tags: [],
                images: [],
                videos: [],
                isFavorite: false,
                isPinned: false,
                version: 1,
                currentVersion: 1,
                usageCount: 0,
                folderId: `deep-folder-${folderCount - 1}`,
                createdAt: '2026-04-22T00:00:00.000Z',
                updatedAt: '2026-04-22T00:00:00.000Z',
              },
            ],
            promptVersions: [],
            folders,
            skills: [],
            skillVersions: [],
          }),
        }),
      );

      expect(response.status).toBe(422);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('prompt workspace path is too long');

      const { payload: exportedPayload } = await exportPayload(app, token);
      expect(exportedPayload.prompts).toEqual([]);
      expect(exportedPayload.folders).toEqual([]);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects skill workspace paths that exceed filesystem limits before importing records', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-import-export-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'deep-skill-importer', 'debugpass001');
      const token = registerPayload.data.accessToken;
      const longSkillName = 'Skill '.repeat(70);

      const response = await app.request(
        new Request('http://local/api/import', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            version: 'web-backup-v2',
            exportedAt: '2026-04-22T00:00:00.000Z',
            prompts: [
              {
                id: 'long-skill-prompt',
                title: 'Should Not Import',
                userPrompt: 'This prompt must not survive a rejected import',
                variables: [],
                tags: [],
                images: [],
                videos: [],
                isFavorite: false,
                isPinned: false,
                version: 1,
                currentVersion: 1,
                usageCount: 0,
                createdAt: '2026-04-22T00:00:00.000Z',
                updatedAt: '2026-04-22T00:00:00.000Z',
              },
            ],
            promptVersions: [],
            folders: [],
            skills: [
              {
                id: 'long-skill-name',
                name: longSkillName,
                content: 'echo too long',
                instructions: 'echo too long',
                protocol_type: 'skill',
                is_favorite: false,
                created_at: 1776816000000,
                updated_at: 1776816000000,
              },
            ],
            skillVersions: [],
          }),
        }),
      );

      expect(response.status).toBe(422);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('skill workspace path segment is too long');

      const { payload: exportedPayload } = await exportPayload(app, token);
      expect(exportedPayload.prompts).toEqual([]);
      expect(exportedPayload.skills).toEqual([]);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects unsafe imported rule paths before writing media or records', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-import-export-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'unsafe-rule-importer', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const response = await app.request(
        new Request('http://local/api/import', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            version: 'web-backup-v2',
            exportedAt: '2026-04-22T00:00:00.000Z',
            prompts: [
              {
                id: 'unsafe-rule-prompt',
                title: 'Should Not Import',
                userPrompt: 'This prompt must not survive a rejected import',
                variables: [],
                tags: [],
                images: ['unsafe-rule-image.png'],
                videos: [],
                isFavorite: false,
                isPinned: false,
                version: 1,
                currentVersion: 1,
                usageCount: 0,
                createdAt: '2026-04-22T00:00:00.000Z',
                updatedAt: '2026-04-22T00:00:00.000Z',
              },
            ],
            promptVersions: [],
            folders: [],
            rules: [
              {
                id: 'project:../escape',
                platformId: 'workspace',
                platformName: 'Unsafe Rule',
                platformIcon: 'FolderRoot',
                platformDescription: 'Unsafe imported rule',
                name: '../AGENTS.md',
                description: 'Should be rejected',
                path: '/unsafe/AGENTS.md',
                targetPath: '/unsafe/AGENTS.md',
                projectRootPath: '/unsafe',
                syncStatus: 'synced',
                content: '# Unsafe',
                versions: [],
              },
            ],
            skills: [],
            skillVersions: [],
            images: {
              'unsafe-rule-image.png': Buffer.from('unsafe-rule-image').toString('base64'),
            },
          }),
        }),
      );

      expect(response.status).toBe(422);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('rule path segment');
      expect(fs.existsSync(path.join(dataDir, 'data', 'assets', registerPayload.data.user.id, 'images', 'unsafe-rule-image.png'))).toBe(false);

      const { payload: exportedPayload } = await exportPayload(app, token);
      expect(exportedPayload.prompts).toEqual([]);
      expect(exportedPayload.rules).toEqual([]);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('ignores unknown snapshot fields but rejects unknown enum values without importing records', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-import-forward-compat-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'forwardcompatimporter', 'debugpass001');
      const token = registerPayload.data.accessToken;

      const acceptedResponse = await app.request(
        new Request('http://local/api/import', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            version: 'desktop-backup-v1',
            exportedAt: '2026-04-23T00:00:00.000Z',
            futureRootField: { ignored: true },
            prompts: [
              {
                id: 'unknown-field-prompt',
                title: 'Unknown Field Prompt',
                userPrompt: 'Known fields should still import',
                variables: [],
                tags: [],
                images: [],
                videos: [],
                isFavorite: false,
                isPinned: false,
                version: 1,
                currentVersion: 1,
                usageCount: 0,
                createdAt: '2026-04-23T00:00:00.000Z',
                updatedAt: '2026-04-23T00:00:00.000Z',
                futurePromptField: 'ignored',
              },
            ],
            promptVersions: [],
            folders: [],
            skills: [],
            skillVersions: [],
          }),
        }),
      );

      expect(acceptedResponse.status).toBe(201);

      const rejectedResponse = await app.request(
        new Request('http://local/api/import', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            version: 'desktop-backup-v1',
            exportedAt: '2026-04-23T01:00:00.000Z',
            prompts: [
              {
                id: 'unknown-enum-prompt',
                title: 'Unknown Enum Prompt',
                promptType: 'audio',
                userPrompt: 'This prompt must not import',
                variables: [],
                tags: [],
                images: [],
                videos: [],
                isFavorite: false,
                isPinned: false,
                version: 1,
                currentVersion: 1,
                usageCount: 0,
                createdAt: '2026-04-23T01:00:00.000Z',
                updatedAt: '2026-04-23T01:00:00.000Z',
              },
            ],
            promptVersions: [],
            folders: [],
            skills: [],
            skillVersions: [],
          }),
        }),
      );

      expect(rejectedResponse.status).toBe(422);
      const rejectedBody = await rejectedResponse.json() as { error: { code: string; message: string } };
      expect(rejectedBody.error.code).toBe('VALIDATION_ERROR');
      expect(rejectedBody.error.message).toContain('prompts.0.promptType');

      const { payload: exportedPayload } = await exportPayload(app, token);
      expect(exportedPayload.prompts).toEqual([
        expect.objectContaining({
          id: 'unknown-field-prompt',
          title: 'Unknown Field Prompt',
        }),
      ]);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects unsupported desktop ZIP backup versions before writing media or records', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-import-zip-version-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'zipversionimporter', 'debugpass001');
      const token = registerPayload.data.accessToken;
      const zipBody = zipSync({
        'import-with-prompthub.json': strToU8(JSON.stringify({
          kind: 'prompthub-backup',
          exportedAt: '2026-04-23T02:00:00.000Z',
          payload: {
            version: 'desktop-backup-v2',
            exportedAt: '2026-04-23T02:00:00.000Z',
            prompts: [
              {
                id: 'future-version-prompt',
                title: 'Future Version Prompt',
                userPrompt: 'This prompt must not import',
                variables: [],
                tags: [],
                images: ['future-version-image.png'],
                videos: [],
                isFavorite: false,
                isPinned: false,
                version: 1,
                currentVersion: 1,
                usageCount: 0,
                createdAt: '2026-04-23T02:00:00.000Z',
                updatedAt: '2026-04-23T02:00:00.000Z',
              },
            ],
            promptVersions: [],
            folders: [],
            skills: [],
            skillVersions: [],
            images: {
              'future-version-image.png': Buffer.from('future-version-image').toString('base64'),
            },
          },
        })),
      });
      const zipPayload = new ArrayBuffer(zipBody.byteLength);
      new Uint8Array(zipPayload).set(zipBody);

      const response = await app.request(
        new Request('http://local/api/import', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/zip',
          },
          body: zipPayload,
        }),
      );

      expect(response.status).toBe(422);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('unsupported backup version desktop-backup-v2');
      expect(fs.existsSync(path.join(dataDir, 'data', 'assets', registerPayload.data.user.id, 'images', 'future-version-image.png'))).toBe(false);

      const { payload: exportedPayload } = await exportPayload(app, token);
      expect(exportedPayload.prompts).toEqual([]);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);
});
