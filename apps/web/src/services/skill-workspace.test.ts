import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase, SkillDB } from '@prompthub/db';
import type { SkillVersion } from '@prompthub/shared';
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

function configureTestEnv(dataDir: string): void {
  process.env.PORT = '3995';
  process.env.HOST = '127.0.0.1';
  process.env.JWT_SECRET = 'test-secret-for-web-skill-workspace-flow-1234567890';
  process.env.JWT_ACCESS_TTL = '900';
  process.env.JWT_REFRESH_TTL = '604800';
  process.env.DATA_ROOT = dataDir;
  process.env.ALLOW_REGISTRATION = 'true';
  process.env.LOG_LEVEL = 'debug';
}

async function loadWorkspaceContext() {
  const [{ getServerDatabase }, workspaceModule] = await Promise.all([
    import('../database'),
    import('./skill-workspace'),
  ]);

  const db = getServerDatabase();
  return {
    db,
    skillDb: new SkillDB(db),
    workspaceModule,
  };
}

async function createOwnerUser() {
  const [{ AuthService }] = await Promise.all([import('./auth.service')]);
  const authService = new AuthService();
  return authService.register('skillworkspaceadmin', 'debugpass001');
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

describe('web skill workspace storage', () => {
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
    'exports skills, versions, and ownership metadata into workspace files',
    async () => {
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-skill-workspace-test-'));

      try {
        configureTestEnv(dataDir);
        const { db, skillDb, workspaceModule } = await loadWorkspaceContext();
        const owner = await createOwnerUser();

        const skill = skillDb.create({
          name: 'Deploy Review',
          description: 'Check deployment plans before release.',
          content: 'Review the deployment plan and list risks.',
          protocol_type: 'skill',
          version: '1.0.0',
          author: 'Ops Team',
          tags: ['ops', 'release'],
          visibility: 'shared',
          is_favorite: true,
        });
        db.prepare(
          'UPDATE skills SET owner_user_id = ?, visibility = ? WHERE id = ?',
        ).run(owner.user.id, 'shared', skill.id);

        const firstVersion = skillDb.createVersion(skill.id, 'Initial skill snapshot');
        expect(firstVersion).not.toBeNull();

        const updated = skillDb.update(skill.id, {
          content: 'Review the deployment plan, list risks, and verify rollback steps.',
        });
        expect(updated?.content).toContain('rollback steps');

        const result = workspaceModule.syncSkillWorkspaceFromDatabase(db, skillDb);

        expect(result.skillCount).toBe(1);
        expect(result.versionCount).toBe(1);

        const skillDir = path.join(
          dataDir,
          'data',
          'skills',
          `deploy-review__${skill.id}`,
        );
        const metadataFile = path.join(skillDir, 'skill.json');
        const skillFile = path.join(skillDir, 'SKILL.md');
        const versionFile = path.join(skillDir, 'versions', '0001.json');
        const extraFile = path.join(skillDir, 'templates', 'checklist.md');

        fs.mkdirSync(path.join(skillDir, 'templates'), { recursive: true });
        fs.writeFileSync(extraFile, '# Existing checklist', 'utf8');

        workspaceModule.syncSkillWorkspaceFromDatabase(db, skillDb);

        expect(fs.existsSync(metadataFile)).toBe(true);
        expect(fs.existsSync(skillFile)).toBe(true);
        expect(fs.existsSync(versionFile)).toBe(true);
        expect(fs.existsSync(extraFile)).toBe(true);
        expect(fs.readFileSync(extraFile, 'utf8')).toBe('# Existing checklist');

        const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8')) as {
          id: string;
          ownerUserId: string | null;
          visibility: 'private' | 'shared';
          tags: string[];
          is_favorite: boolean;
        };
        expect(metadata.id).toBe(skill.id);
        expect(metadata.ownerUserId).toBe(owner.user.id);
        expect(metadata.visibility).toBe('shared');
        expect(metadata.tags).toEqual(['ops', 'release']);
        expect(metadata.is_favorite).toBe(true);

        const rawSkill = fs.readFileSync(skillFile, 'utf8');
        expect(rawSkill).toContain('rollback steps');

        const version = JSON.parse(fs.readFileSync(versionFile, 'utf8')) as SkillVersion;
        expect(version.skillId).toBe(skill.id);
        expect(version.version).toBe(1);
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    20000,
  );

  it(
    'imports workspace files into an empty database and preserves ownership metadata',
    async () => {
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-skill-workspace-test-'));

      try {
        configureTestEnv(dataDir);
        const { db, skillDb, workspaceModule } = await loadWorkspaceContext();
        const owner = await createOwnerUser();

        const skillDir = path.join(
          dataDir,
          'data',
          'skills',
          'incident-review__skill_1',
        );
        fs.mkdirSync(path.join(skillDir, 'versions'), { recursive: true });

        fs.writeFileSync(
          path.join(skillDir, 'skill.json'),
          JSON.stringify(
            {
              id: 'skill_1',
              ownerUserId: owner.user.id,
              visibility: 'shared',
              name: 'Incident Review',
              description: 'Review production incidents.',
              protocol_type: 'skill',
              version: '2.1.0',
              author: 'SRE',
              tags: ['incident', 'ops'],
              original_tags: ['incident', 'ops'],
              is_favorite: false,
              currentVersion: 1,
              versionTrackingEnabled: true,
              category: 'general',
              is_builtin: false,
              created_at: Date.parse('2026-04-13T00:00:00.000Z'),
              updated_at: Date.parse('2026-04-13T00:00:00.000Z'),
            },
            null,
            2,
          ),
          'utf8',
        );
        fs.writeFileSync(
          path.join(skillDir, 'SKILL.md'),
          'Review incidents, summarize impact, and propose follow-up actions.',
          'utf8',
        );
        fs.writeFileSync(
          path.join(skillDir, 'versions', '0001.json'),
          JSON.stringify(
            {
              id: 'skill_version_1',
              skillId: 'skill_1',
              version: 1,
              content: 'Review incidents and summarize impact.',
              note: 'Initial snapshot',
              createdAt: '2026-04-13T00:00:00.000Z',
            },
            null,
            2,
          ),
          'utf8',
        );

        const imported = workspaceModule.importSkillWorkspaceIntoDatabase(db, skillDb);

        expect(imported.skillCount).toBe(1);
        expect(imported.versionCount).toBe(1);

        const skill = skillDb.getById('skill_1');
        expect(skill?.name).toBe('Incident Review');
        expect(skill?.content).toBe(
          'Review incidents, summarize impact, and propose follow-up actions.',
        );
        expect(skill?.tags).toEqual(['incident', 'ops']);

        const skillRow = db
          .prepare('SELECT owner_user_id, visibility FROM skills WHERE id = ?')
          .get('skill_1') as
          | { owner_user_id: string | null; visibility: 'private' | 'shared' }
          | undefined;
        expect(skillRow?.owner_user_id).toBe(owner.user.id);
        expect(skillRow?.visibility).toBe('shared');

        const versions = skillDb.getVersions('skill_1');
        expect(versions).toHaveLength(1);
        expect(versions[0]?.id).toBe('skill_version_1');
        expect(versions[0]?.content).toBe('Review incidents and summarize impact.');
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    20000,
  );

  it(
    'writes workspace files after authenticated skill mutations',
    async () => {
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-skill-workspace-test-'));

      try {
        configureTestEnv(dataDir);
        const [{ createApp }] = await Promise.all([import('../app')]);
        const app = createApp();

        const registerResponse = await app.request(
          new Request('http://local/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: 'skillworkspaceadmin',
              password: 'debugpass001',
              ...(await issueSolvedCaptcha(app)),
            }),
          }),
        );
        expect(registerResponse.status).toBe(201);
        const registerPayload = (await registerResponse.json()) as RegisterPayload;
        const token = registerPayload.data.accessToken;

        const createResponse = await app.request(
          new Request('http://local/api/skills', {
            method: 'POST',
            headers: authHeaders(token),
            body: JSON.stringify({
              name: 'Daily Ops Review',
              description: 'Private daily review flow',
              content: 'Start with service health, then list risks.',
              visibility: 'private',
            }),
          }),
        );
        expect(createResponse.status).toBe(201);
        const createPayload = (await createResponse.json()) as {
          data: { id: string };
        };

        const skillId = createPayload.data.id;

        const versionResponse = await app.request(
          new Request(`http://local/api/skills/${skillId}/versions`, {
            method: 'POST',
            headers: authHeaders(token),
            body: JSON.stringify({ note: 'Initial web snapshot' }),
          }),
        );
        expect(versionResponse.status).toBe(201);

        const updateResponse = await app.request(
          new Request(`http://local/api/skills/${skillId}`, {
            method: 'PUT',
            headers: authHeaders(token),
            body: JSON.stringify({
              content: 'Start with service health, verify capacity, then list risks.',
            }),
          }),
        );
        expect(updateResponse.status).toBe(200);

        const skillDir = path.join(
          dataDir,
          'data',
          'skills',
          `daily-ops-review__${skillId}`,
        );
        const metadataFile = path.join(skillDir, 'skill.json');
        const skillFile = path.join(skillDir, 'SKILL.md');
        const versionsDir = path.join(skillDir, 'versions');

        expect(fs.existsSync(metadataFile)).toBe(true);
        expect(fs.existsSync(skillFile)).toBe(true);
        expect(fs.existsSync(versionsDir)).toBe(true);

        const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8')) as {
          ownerUserId: string | null;
          visibility: 'private' | 'shared';
        };
        expect(metadata.ownerUserId).toBe(registerPayload.data.user.id);
        expect(metadata.visibility).toBe('private');

        const rawSkill = fs.readFileSync(skillFile, 'utf8');
        expect(rawSkill).toContain('verify capacity');

        const versionFiles = fs.readdirSync(versionsDir).filter((file) => file.endsWith('.json'));
        expect(versionFiles).toEqual(['0001.json']);
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    20000,
  );

  it(
    'rejects unsafe restored workspace file paths before writing files',
    async () => {
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-skill-workspace-test-'));

      try {
        configureTestEnv(dataDir);
        const { db, skillDb, workspaceModule } = await loadWorkspaceContext();
        const skill = skillDb.create({
          name: 'Unsafe Restore',
          content: 'Restore should not write unsafe files.',
          protocol_type: 'skill',
          is_favorite: false,
        });

        const invalidFiles = [
          { relativePath: '..', content: 'escape' },
          { relativePath: 'versions', content: 'reserved directory file' },
          { relativePath: 'bad\u0000name.md', content: 'control char' },
        ];
        workspaceModule.syncSkillWorkspaceFromDatabase(db, skillDb);

        const skillDir = path.join(
          dataDir,
          'data',
          'skills',
          `unsafe-restore__${skill.id}`,
        );
        const existingFile = path.join(skillDir, 'templates', 'keep.md');
        fs.mkdirSync(path.dirname(existingFile), { recursive: true });
        fs.writeFileSync(existingFile, '# Keep this file', 'utf8');

        for (const file of invalidFiles) {
          expect(() =>
            workspaceModule.syncSkillWorkspaceFromDatabase(db, skillDb, {
              [skill.id]: [file],
            }),
          ).toThrow(/Invalid skill file path|Reserved skill file path/u);
          expect(fs.readFileSync(existingFile, 'utf8')).toBe('# Keep this file');
        }

        expect(fs.existsSync(path.join(dataDir, 'data', 'skills', 'bad\u0000name.md'))).toBe(false);
        expect(fs.existsSync(path.join(skillDir, 'versions'))).toBe(false);
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    20000,
  );

  it(
    'rejects over-long workspace paths before clearing existing files',
    async () => {
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-skill-workspace-test-'));

      try {
        configureTestEnv(dataDir);
        const { db, skillDb, workspaceModule } = await loadWorkspaceContext();
        const stableSkill = skillDb.create({
          name: 'Stable Skill',
          content: 'This skill should remain on disk after failed sync.',
          protocol_type: 'skill',
          is_favorite: false,
        });

        workspaceModule.syncSkillWorkspaceFromDatabase(db, skillDb);

        const stableSkillFile = path.join(
          dataDir,
          'data',
          'skills',
          `stable-skill__${stableSkill.id}`,
          'SKILL.md',
        );
        expect(fs.existsSync(stableSkillFile)).toBe(true);

        skillDb.insertSkillDirect({
          id: 'overlong-skill',
          name: 'Skill '.repeat(70),
          content: 'This skill cannot be represented safely on disk.',
          instructions: 'This skill cannot be represented safely on disk.',
          protocol_type: 'skill',
          is_favorite: false,
          created_at: Date.parse('2026-04-22T00:00:00.000Z'),
          updated_at: Date.parse('2026-04-22T00:00:00.000Z'),
        });

        expect(() =>
          workspaceModule.syncSkillWorkspaceFromDatabase(db, skillDb),
        ).toThrow('skill workspace path segment is too long');
        expect(fs.readFileSync(stableSkillFile, 'utf8')).toContain(
          'This skill should remain on disk after failed sync.',
        );
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    20000,
  );

  it(
    'preserves the existing workspace when SKILL.md export is interrupted',
    async () => {
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-skill-workspace-test-'));

      try {
        configureTestEnv(dataDir);
        const { db, skillDb, workspaceModule } = await loadWorkspaceContext();

        const skill = skillDb.create({
          name: 'Stable Skill',
          content: 'This skill should survive an interrupted export.',
          protocol_type: 'skill',
          is_favorite: false,
        });

        workspaceModule.syncSkillWorkspaceFromDatabase(db, skillDb);

        const skillDir = path.join(
          dataDir,
          'data',
          'skills',
          `stable-skill__${skill.id}`,
        );
        const skillFile = path.join(skillDir, 'SKILL.md');
        const sidecarFile = path.join(skillDir, 'templates', 'keep.md');
        fs.mkdirSync(path.dirname(sidecarFile), { recursive: true });
        fs.writeFileSync(sidecarFile, '# Keep this sidecar', 'utf8');

        const stableSkillContent = fs.readFileSync(skillFile, 'utf8');
        const stableSidecarContent = fs.readFileSync(sidecarFile, 'utf8');

        skillDb.update(skill.id, {
          content: 'This newer skill should not replace the stable file.',
        });

        const originalWriteFileSync = fs.writeFileSync.bind(fs);
        vi.spyOn(fs, 'writeFileSync').mockImplementation((file, data, options) => {
          if (
            typeof file === 'string' &&
            file.endsWith(`${path.sep}SKILL.md`) &&
            String(data).includes('newer skill')
          ) {
            throw new Error('simulated skill workspace write failure');
          }
          return originalWriteFileSync(file, data, options);
        });

        expect(() =>
          workspaceModule.syncSkillWorkspaceFromDatabase(db, skillDb),
        ).toThrow('simulated skill workspace write failure');

        expect(fs.existsSync(skillFile)).toBe(true);
        expect(fs.readFileSync(skillFile, 'utf8')).toBe(stableSkillContent);
        expect(fs.existsSync(sidecarFile)).toBe(true);
        expect(fs.readFileSync(sidecarFile, 'utf8')).toBe(stableSidecarContent);
      } finally {
        vi.restoreAllMocks();
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    20000,
  );

  it(
    'ignores interrupted export scratch directories during workspace import',
    async () => {
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-skill-workspace-test-'));

      try {
        configureTestEnv(dataDir);
        const { db, skillDb, workspaceModule } = await loadWorkspaceContext();
        const owner = await createOwnerUser();

        const scratchDir = path.join(
          dataDir,
          'data',
          'skills',
          '.skills-staging-leftover',
        );
        fs.mkdirSync(scratchDir, { recursive: true });
        fs.writeFileSync(
          path.join(scratchDir, 'skill.json'),
          JSON.stringify(
            {
              id: 'skill_scratch',
              ownerUserId: owner.user.id,
              visibility: 'shared',
              name: 'Scratch Skill',
              description: 'Partial scratch skill.',
              protocol_type: 'skill',
              tags: [],
              original_tags: [],
              is_favorite: false,
              currentVersion: 0,
              versionTrackingEnabled: true,
              category: 'general',
              is_builtin: false,
              created_at: Date.parse('2026-04-13T00:00:00.000Z'),
              updated_at: Date.parse('2026-04-13T00:00:00.000Z'),
            },
            null,
            2,
          ),
          'utf8',
        );
        fs.writeFileSync(
          path.join(scratchDir, 'SKILL.md'),
          'Scratch content must not import.',
          'utf8',
        );

        const imported = workspaceModule.importSkillWorkspaceIntoDatabase(db, skillDb);

        expect(imported).toEqual({ skillCount: 0, versionCount: 0 });
        expect(skillDb.getById('skill_scratch')).toBeNull();
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    20000,
  );

  it(
    'claims ownerless private skill workspace data for the first admin after bootstrap import',
    async () => {
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-skill-workspace-test-'));

      try {
        configureTestEnv(dataDir);

        const skillDir = path.join(
          dataDir,
          'data',
          'skills',
          'recovered-skill__skill_recovered',
        );
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(
          path.join(skillDir, 'skill.json'),
          JSON.stringify(
            {
              id: 'skill_recovered',
              ownerUserId: 'missing-user',
              visibility: 'private',
              name: 'Recovered Skill',
              description: 'Recovered from workspace bootstrap.',
              protocol_type: 'skill',
              version: '1.0.0',
              tags: ['recovered'],
              original_tags: ['recovered'],
              is_favorite: false,
              currentVersion: 0,
              versionTrackingEnabled: true,
              category: 'general',
              is_builtin: false,
              created_at: Date.parse('2026-04-13T00:00:00.000Z'),
              updated_at: Date.parse('2026-04-13T00:00:00.000Z'),
            },
            null,
            2,
          ),
          'utf8',
        );
        fs.writeFileSync(
          path.join(skillDir, 'SKILL.md'),
          'Recovered skill content.',
          'utf8',
        );

        const [{ createApp }] = await Promise.all([import('../app')]);
        const app = createApp();

        const registerResponse = await app.request(
          new Request('http://local/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: 'firstadmin',
              password: 'debugpass001',
              ...(await issueSolvedCaptcha(app)),
            }),
          }),
        );
        expect(registerResponse.status).toBe(201);
        const registerPayload = (await registerResponse.json()) as RegisterPayload;

        const listResponse = await app.request(
          new Request('http://local/api/skills?scope=private', {
            headers: { Authorization: `Bearer ${registerPayload.data.accessToken}` },
          }),
        );
        expect(listResponse.status).toBe(200);
        const listPayload = (await listResponse.json()) as {
          data: Array<{ id: string; name: string }>;
        };
        expect(listPayload.data).toHaveLength(1);
        expect(listPayload.data[0]?.id).toBe('skill_recovered');
        expect(listPayload.data[0]?.name).toBe('Recovered Skill');
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    20000,
  );
});
