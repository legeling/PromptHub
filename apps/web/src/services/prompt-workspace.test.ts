import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase, FolderDB, PromptDB } from '@prompthub/db';

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

function configureTestEnv(dataDir: string): void {
  process.env.PORT = '3990';
  process.env.HOST = '127.0.0.1';
  process.env.JWT_SECRET = 'test-secret-for-web-workspace-flow-1234567890';
  process.env.JWT_ACCESS_TTL = '900';
  process.env.JWT_REFRESH_TTL = '604800';
  process.env.DATA_ROOT = dataDir;
  process.env.ALLOW_REGISTRATION = 'true';
  process.env.LOG_LEVEL = 'debug';
}

async function loadWorkspaceContext() {
  const [{ getServerDatabase }, workspaceModule] = await Promise.all([
    import('../database'),
    import('./prompt-workspace'),
  ]);

  const db = getServerDatabase();
  return {
    db,
    folderDb: new FolderDB(db),
    promptDb: new PromptDB(db),
    workspaceModule,
  };
}

async function createOwnerUser() {
  const [{ AuthService }] = await Promise.all([import('./auth.service')]);
  const authService = new AuthService();
  return authService.register('workspaceadmin', 'debugpass001');
}

interface RegisterPayload {
  data: {
    user: {
      id: string;
      username: string;
      role: 'admin' | 'user';
    };
    accessToken: string;
    refreshToken: string;
  };
}

function authHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

describe('web prompt workspace storage', () => {
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

  it(
    'exports prompts, folders, versions, and ownership metadata into workspace files',
    async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-workspace-test-'));

    try {
      configureTestEnv(dataDir);
      const { db, folderDb, promptDb, workspaceModule } = await loadWorkspaceContext();
      const owner = await createOwnerUser();

      const folder = folderDb.create({
        name: 'Team Writing',
        visibility: 'shared',
        isPrivate: false,
      });
      db.prepare('UPDATE folders SET owner_user_id = ?, visibility = ? WHERE id = ?').run(
        owner.user.id,
        'shared',
        folder.id,
      );

      const prompt = promptDb.create({
        title: 'Launch Copy',
        userPrompt: 'Draft a launch message for {{audience}}.',
        systemPrompt: 'You write crisp product copy.',
        folderId: folder.id,
        variables: [{ name: 'audience', type: 'text', required: true }],
        tags: ['launch', 'marketing'],
        promptType: 'text',
      });
      db.prepare(
        'UPDATE prompts SET owner_user_id = ?, visibility = ?, usage_count = ?, last_ai_response = ? WHERE id = ?',
      ).run(owner.user.id, 'shared', 9, 'Latest AI answer', prompt.id);
      promptDb.update(prompt.id, {
        userPrompt: 'Draft a launch message for {{audience}} with urgency.',
      });

      const result = workspaceModule.syncPromptWorkspaceFromDatabase(db, promptDb, folderDb);

      expect(result.promptCount).toBe(1);
      expect(result.folderCount).toBe(1);
      expect(result.versionCount).toBe(2);

      const promptsDir = path.join(dataDir, 'data', 'prompts');

      // Per-folder _folder.json must exist (no global folders.json)
      const folderMetaFile = path.join(promptsDir, 'team-writing', '_folder.json');
      expect(fs.existsSync(folderMetaFile)).toBe(true);

      const folderMeta = JSON.parse(fs.readFileSync(folderMetaFile, 'utf8')) as {
        id: string;
        ownerUserId?: string | null;
        visibility?: 'private' | 'shared';
      };
      expect(folderMeta.id).toBe(folder.id);
      expect(folderMeta.ownerUserId).toBe(owner.user.id);
      expect(folderMeta.visibility).toBe('shared');

      // Prompt file: <slug>.md (not <slug>__<id>/prompt.md)
      const promptFile = path.join(promptsDir, 'team-writing', 'launch-copy.md');
      expect(fs.existsSync(promptFile)).toBe(true);

      const rawPromptFile = fs.readFileSync(promptFile, 'utf8');
      expect(rawPromptFile).toContain(`ownerUserId: ${JSON.stringify(owner.user.id)}`);
      expect(rawPromptFile).toContain('visibility: "shared"');
      expect(rawPromptFile).toContain('usageCount: 9');
      expect(rawPromptFile).toContain('lastAiResponse: "Latest AI answer"');
      expect(rawPromptFile).toContain('<!-- PROMPTHUB:SYSTEM -->');
      expect(rawPromptFile).toContain('You write crisp product copy.');
      expect(rawPromptFile).toContain(
        'Draft a launch message for {{audience}} with urgency.',
      );

      // Version files: .versions/<promptId>/NNNN.md (not inside folder sub-tree)
      const versionFile = path.join(promptsDir, '.versions', prompt.id, '0002.md');
      expect(fs.existsSync(versionFile)).toBe(true);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
    },
    20000,
  );

  it(
    'imports workspace files into an empty database and preserves ownership metadata',
    async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-workspace-test-'));

    try {
      configureTestEnv(dataDir);
      const { db, folderDb, promptDb, workspaceModule } = await loadWorkspaceContext();
      const owner = await createOwnerUser();

      const promptsDir = path.join(dataDir, 'data', 'prompts');

      // Per-folder _folder.json (replaces global folders.json)
      const opsFolderDir = path.join(promptsDir, 'ops');
      fs.mkdirSync(opsFolderDir, { recursive: true });
      fs.writeFileSync(
        path.join(opsFolderDir, '_folder.json'),
        JSON.stringify(
          {
            id: 'folder_ops',
            name: 'Ops',
            sortOrder: 0,
            isPrivate: false,
            ownerUserId: owner.user.id,
            visibility: 'shared',
            createdAt: '2026-04-13T00:00:00.000Z',
            updatedAt: '2026-04-13T00:00:00.000Z',
          },
          null,
          2,
        ),
        'utf8',
      );

      // Prompt file: <slug>.md
      fs.writeFileSync(
        path.join(opsFolderDir, 'deploy-check.md'),
        `---
id: "prompt_1"
ownerUserId: ${JSON.stringify(owner.user.id)}
visibility: "shared"
title: "Deploy Check"
folderId: "folder_ops"
promptType: "text"
variables: [{"name":"service","type":"text","required":true}]
tags: ["ops","deploy"]
isFavorite: false
isPinned: false
usageCount: 11
lastAiResponse: "healthy"
createdAt: "2026-04-13T00:00:00.000Z"
updatedAt: "2026-04-13T00:00:00.000Z"
---
<!-- PROMPTHUB:SYSTEM -->
You verify production deployment safety.

<!-- PROMPTHUB:USER -->
Check deployment health for {{service}}.
`,
        'utf8',
      );

      // Version file: .versions/<promptId>/NNNN.md
      const versionsDir = path.join(promptsDir, '.versions', 'prompt_1');
      fs.mkdirSync(versionsDir, { recursive: true });
      fs.writeFileSync(
        path.join(versionsDir, '0001.md'),
        `---
id: "version_1"
promptId: "prompt_1"
version: 1
variables: [{"name":"service","type":"text","required":true}]
createdAt: "2026-04-13T00:00:00.000Z"
---
<!-- PROMPTHUB:SYSTEM -->
You verify production deployment safety.

<!-- PROMPTHUB:USER -->
Check deployment health for {{service}}.
`,
        'utf8',
      );

      const imported = workspaceModule.importPromptWorkspaceIntoDatabase(
        db,
        promptDb,
        folderDb,
      );

      expect(imported.promptCount).toBe(1);
      expect(imported.folderCount).toBe(1);
      expect(imported.versionCount).toBe(1);

      const folderRow = db
        .prepare('SELECT owner_user_id, visibility FROM folders WHERE id = ?')
        .get('folder_ops') as
        | { owner_user_id: string | null; visibility: 'private' | 'shared' }
        | undefined;
      expect(folderRow?.owner_user_id).toBe(owner.user.id);
      expect(folderRow?.visibility).toBe('shared');

      const prompt = promptDb.getById('prompt_1');
      expect(prompt?.folderId).toBe('folder_ops');
      expect(prompt?.systemPrompt).toBe('You verify production deployment safety.');
      expect(prompt?.usageCount).toBe(11);
      expect(prompt?.lastAiResponse).toBe('healthy');
      expect(prompt?.variables).toEqual([
        { name: 'service', type: 'text', required: true },
      ]);

      const promptRow = db
        .prepare('SELECT owner_user_id, visibility FROM prompts WHERE id = ?')
        .get('prompt_1') as
        | { owner_user_id: string | null; visibility: 'private' | 'shared' }
        | undefined;
      expect(promptRow?.owner_user_id).toBe(owner.user.id);
      expect(promptRow?.visibility).toBe('shared');

      const versions = promptDb.getVersions('prompt_1');
      expect(versions).toHaveLength(1);
      expect(versions[0]?.id).toBe('version_1');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
    },
    20000,
  );

  it(
    'writes workspace files after authenticated prompt and folder mutations',
    async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-workspace-test-'));

    try {
      configureTestEnv(dataDir);
      const [{ createApp }] = await Promise.all([import('../app')]);
      const app = createApp();

      const registerResponse = await app.request(
        new Request('http://local/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'workspaceadmin', password: 'debugpass001' }),
        }),
      );
      expect(registerResponse.status).toBe(201);
      const registerPayload = (await registerResponse.json()) as RegisterPayload;
      const token = registerPayload.data.accessToken;

      const folderResponse = await app.request(
        new Request('http://local/api/folders', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({ name: 'Personal Vault' }),
        }),
      );
      expect(folderResponse.status).toBe(201);
      const folderPayload = (await folderResponse.json()) as {
        data: { id: string; name: string };
      };

      const promptResponse = await app.request(
        new Request('http://local/api/prompts', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            title: 'Daily Summary',
            userPrompt: 'Summarize today in three bullets.',
            folderId: folderPayload.data.id,
          }),
        }),
      );
      expect(promptResponse.status).toBe(201);
      const promptPayload = (await promptResponse.json()) as {
        data: { id: string };
      };

      const foldersFile = path.join(dataDir, 'data', 'prompts', 'personal-vault', '_folder.json');
      expect(fs.existsSync(foldersFile)).toBe(true);

      const promptFile = path.join(
        dataDir,
        'data',
        'prompts',
        'personal-vault',
        'daily-summary.md',
      );
      expect(fs.existsSync(promptFile)).toBe(true);

      const rawPrompt = fs.readFileSync(promptFile, 'utf8');
      expect(rawPrompt).toContain('title: "Daily Summary"');
      expect(rawPrompt).toContain('ownerUserId: "');
      expect(rawPrompt).toContain('visibility: "private"');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
    },
    20000,
  );

  it(
    'claims ownerless private workspace data for the first admin after bootstrap import',
    async () => {
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-workspace-test-'));

      try {
        configureTestEnv(dataDir);

        const promptsDir = path.join(dataDir, 'data', 'prompts');
        const recoveredDir = path.join(promptsDir, 'recovered');
        fs.mkdirSync(recoveredDir, { recursive: true });
        fs.writeFileSync(
          path.join(recoveredDir, 'draft.md'),
          `---
id: "prompt_recovered"
ownerUserId: "missing-user"
visibility: "private"
title: "Recovered Draft"
promptType: "text"
isFavorite: false
isPinned: false
createdAt: "2026-04-13T00:00:00.000Z"
updatedAt: "2026-04-13T00:00:00.000Z"
---
<!-- PROMPTHUB:SYSTEM -->

<!-- PROMPTHUB:USER -->
Recovered body
`,
          'utf8',
        );

        const [{ createApp }] = await Promise.all([import('../app')]);
        const app = createApp();

        const registerResponse = await app.request(
          new Request('http://local/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'firstadmin', password: 'debugpass001' }),
          }),
        );
        expect(registerResponse.status).toBe(201);
        const registerPayload = (await registerResponse.json()) as RegisterPayload;

        const listResponse = await app.request(
          new Request('http://local/api/prompts?scope=private', {
            headers: { Authorization: `Bearer ${registerPayload.data.accessToken}` },
          }),
        );
        expect(listResponse.status).toBe(200);

        const listPayload = (await listResponse.json()) as {
          data: Array<{ id: string; title: string }>;
        };
        expect(listPayload.data).toHaveLength(1);
        expect(listPayload.data[0]?.id).toBe('prompt_recovered');
        expect(listPayload.data[0]?.title).toBe('Recovered Draft');
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    20000,
  );
});
