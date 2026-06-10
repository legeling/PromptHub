import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase } from '@prompthub/db';
import type { RuleBackupRecord } from '@prompthub/shared';

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
  process.env.JWT_SECRET = 'test-secret-for-web-rule-workspace-1234567890';
  process.env.JWT_ACCESS_TTL = '900';
  process.env.JWT_REFRESH_TTL = '604800';
  process.env.DATA_ROOT = dataDir;
  process.env.ALLOW_REGISTRATION = 'true';
  process.env.LOG_LEVEL = 'debug';
}

describe('web rule workspace storage', () => {
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

  it('round-trips per-user rule backup records through the workspace filesystem', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-rule-workspace-test-'));

    try {
      configureTestEnv(dataDir);
      const workspaceModule = await import('./rule-workspace.js');

      workspaceModule.importRuleBackupRecords('user-a', [
        {
          id: 'project:docs-site',
          platformId: 'workspace',
          platformName: 'Docs Site',
          platformIcon: 'FolderRoot',
          platformDescription: 'Project rules',
          name: 'AGENTS.md',
          description: 'Project rules file',
          path: '/repo/AGENTS.md',
          targetPath: '/repo/AGENTS.md',
          projectRootPath: '/repo',
          syncStatus: 'synced',
          content: '# Docs rules',
          versions: [
            {
              id: 'rule-v1',
              savedAt: '2026-05-09T00:00:00.000Z',
              source: 'create',
              content: '# Docs rules',
            },
          ],
        },
      ]);

      const exported = workspaceModule.exportRuleBackupRecords('user-a');
      expect(exported).toEqual([
        expect.objectContaining({
          id: 'project:docs-site',
          content: '# Docs rules',
          versions: [
            expect.objectContaining({
              id: 'rule-v1',
              content: '# Docs rules',
            }),
          ],
        }),
      ]);

      expect(workspaceModule.exportRuleBackupRecords('user-b')).toEqual([]);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('rejects unsafe rule workspace path segments before writing files', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-rule-workspace-test-'));

    try {
      configureTestEnv(dataDir);
      const workspaceModule = await import('./rule-workspace.js');

      expect(() =>
        workspaceModule.importRuleBackupRecords('user-a', [
          {
            id: 'project:../escape',
            platformId: 'workspace',
            platformName: 'Unsafe Rule',
            platformIcon: 'FolderRoot',
            platformDescription: 'Unsafe project rule',
            name: '../AGENTS.md',
            description: 'Should be rejected',
            path: '/repo/AGENTS.md',
            targetPath: '/repo/AGENTS.md',
            projectRootPath: '/repo',
            syncStatus: 'synced',
            content: '# Unsafe',
            versions: [],
          },
        ]),
      ).toThrow('unsafe rule path segment');

      expect(workspaceModule.exportRuleBackupRecords('user-a')).toEqual([]);
      expect(fs.existsSync(path.join(dataDir, 'data', 'rules', 'escape'))).toBe(false);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('preserves existing rule versions when imported version writes are interrupted', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-rule-workspace-test-'));

    try {
      configureTestEnv(dataDir);
      const workspaceModule = await import('./rule-workspace.js');

      const baseRecord = {
        id: 'project:docs-site',
        platformId: 'workspace',
        platformName: 'Docs Site',
        platformIcon: 'FolderRoot',
        platformDescription: 'Project rules',
        name: 'AGENTS.md',
        description: 'Project rules file',
        path: '/repo/AGENTS.md',
        targetPath: '/repo/AGENTS.md',
        projectRootPath: '/repo',
        syncStatus: 'synced' as const,
        content: '# Docs rules',
      } satisfies Omit<RuleBackupRecord, 'versions'>;

      workspaceModule.importRuleBackupRecords('user-a', [
        {
          ...baseRecord,
          versions: [
            {
              id: 'rule-v1',
              savedAt: '2026-05-09T00:00:00.000Z',
              source: 'create' as const,
              content: '# Docs rules v1',
            },
            {
              id: 'rule-v2',
              savedAt: '2026-05-10T00:00:00.000Z',
              source: 'manual-save' as const,
              content: '# Docs rules v2',
            },
          ],
        },
      ]);

      const beforeVersions = workspaceModule.exportRuleBackupRecords('user-a')[0]?.versions;
      expect(beforeVersions?.map((version) => version.id)).toEqual(['rule-v2', 'rule-v1']);

      const originalWriteFileSync = fs.writeFileSync.bind(fs);
      vi.spyOn(fs, 'writeFileSync').mockImplementation((file, data, options) => {
        if (
          typeof file === 'string' &&
          file.endsWith(`${path.sep}0002.md`) &&
          String(data).includes('new imported v2')
        ) {
          throw new Error('simulated rule version write failure');
        }
        return originalWriteFileSync(file, data, options);
      });

      expect(() =>
        workspaceModule.importRuleBackupRecords('user-a', [
          {
            ...baseRecord,
            content: '# New imported docs rules',
            versions: [
              {
                id: 'rule-new-v1',
                savedAt: '2026-05-11T00:00:00.000Z',
                source: 'manual-save' as const,
                content: '# new imported v1',
              },
              {
                id: 'rule-new-v2',
                savedAt: '2026-05-12T00:00:00.000Z',
                source: 'manual-save' as const,
                content: '# new imported v2',
              },
            ],
          },
        ]),
      ).toThrow('simulated rule version write failure');

      const afterVersions = workspaceModule.exportRuleBackupRecords('user-a')[0]?.versions;
      const afterRecord = workspaceModule.exportRuleBackupRecords('user-a')[0];
      expect(afterRecord?.content).toBe('# Docs rules');
      expect(afterRecord?.syncStatus).toBe('synced');
      expect(afterVersions?.map((version) => version.id)).toEqual(['rule-v2', 'rule-v1']);
      expect(afterVersions?.map((version) => version.content)).toEqual([
        '# Docs rules v2',
        '# Docs rules v1',
      ]);
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
