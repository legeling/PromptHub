import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseBackup } from '../../../src/renderer/services/database-backup-format';
import { installWindowMocks } from '../../helpers/window';

const { exportDatabaseMock, restoreFromBackupMock, getSettingsStateMock } =
  vi.hoisted(() => ({
    exportDatabaseMock: vi.fn(),
    restoreFromBackupMock: vi.fn(),
    getSettingsStateMock: vi.fn(),
  }));

vi.mock('../../../src/renderer/services/database-backup', () => ({
  exportDatabase: exportDatabaseMock,
  restoreFromBackup: restoreFromBackupMock,
}));

vi.mock('../../../src/renderer/stores/settings.store', () => ({
  useSettingsStore: {
    getState: getSettingsStateMock,
  },
}));

import {
  pullFromSelfHostedWeb,
  pushToSelfHostedWeb,
} from '../../../src/renderer/services/self-hosted-sync';

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function captchaResponse(): Response {
  return jsonResponse({
    data: {
      captchaId: '550e8400-e29b-41d4-a716-446655440000',
      prompt: '3 + 4 = ?',
    },
  });
}

function createBaseBackup(): DatabaseBackup {
  return {
    version: 1,
    exportedAt: '2026-07-11T00:00:00.000Z',
    prompts: [],
    folders: [],
    versions: [],
  };
}

function createAuthenticatedFetch(
  syncResponse: unknown,
  onPut?: (payload: unknown) => void,
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/api/auth/captcha')) return captchaResponse();
    if (url.endsWith('/api/auth/login')) {
      return jsonResponse({ data: { accessToken: 'access-token' } });
    }
    if (url.endsWith('/api/devices/heartbeat')) {
      return jsonResponse({ data: { ok: true } });
    }
    if (url.endsWith('/api/media/images')) return jsonResponse({ data: [] });
    if (url.endsWith('/api/media/videos')) return jsonResponse({ data: [] });
    if (url.endsWith('/api/sync/data')) {
      if (init?.method === 'PUT') {
        onPut?.(JSON.parse(String(init.body)).payload);
        return jsonResponse({
          data: {
            ok: true,
            promptsImported: 0,
            foldersImported: 0,
            rulesImported: 0,
            skillsImported: 1,
          },
        });
      }
      return jsonResponse({ data: syncResponse });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

describe('self-hosted Skill sync reliability', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    window.localStorage.clear();
    installWindowMocks({
      electron: { updater: { getVersion: vi.fn().mockResolvedValue('0.5.9') } },
    });
    getSettingsStateMock.mockReturnValue({
      themeMode: 'light',
      language: 'zh',
      autoSave: true,
    });
  });

  it('removes machine-local Skill paths from the Web sync payload', async () => {
    const backup = createBaseBackup();
    backup.skills = [
      {
        id: 'local-skill',
        name: 'dev-review',
        protocol_type: 'skill',
        is_favorite: false,
        source_url: '/Users/demo/skills/dev-review',
        local_repo_path: '/Users/demo/skills/dev-review',
        directory_fingerprint: 'dev-review-package',
        content_url: '/Users/demo/skills/dev-review/SKILL.md',
        icon_url: '/Users/demo/skills/dev-review/icon.png',
        content: '# Dev review',
        instructions: '# Dev review',
        created_at: 1,
        updated_at: 1,
      },
      {
        id: 'remote-skill',
        name: 'remote-review',
        protocol_type: 'skill',
        is_favorite: false,
        source_id: 'registry:remote-review',
        source_url: 'https://example.com/skills/remote-review',
        content_url: 'https://example.com/skills/remote-review/SKILL.md',
        icon_url: 'data:image/png;base64,AAAA',
        content: '# Remote review',
        instructions: '# Remote review',
        created_at: 1,
        updated_at: 1,
      },
      {
        id: 'unsafe-icon-skill',
        name: 'unsafe-icon-skill',
        protocol_type: 'skill',
        is_favorite: false,
        icon_url: 'data:image/svg+xml,<svg></svg>',
        content: '# Unsafe icon metadata',
        created_at: 1,
        updated_at: 1,
      },
    ];
    backup.skillFiles = {
      'local-skill': [{ relativePath: 'SKILL.md', content: '# Dev review' }],
    };
    exportDatabaseMock.mockResolvedValue(backup);
    const payloads: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      createAuthenticatedFetch(undefined, (payload) => payloads.push(payload)),
    );

    await pushToSelfHostedWeb({
      url: 'https://backup.example.com',
      username: 'owner',
      password: 'secret',
    });

    expect(payloads).toHaveLength(1);
    expect(
      (payloads[0] as { skills: Array<Record<string, unknown>> }).skills[0],
    ).toEqual(
      expect.not.objectContaining({
        source_url: expect.anything(),
        local_repo_path: expect.anything(),
        content_url: expect.anything(),
        icon_url: expect.anything(),
      }),
    );
    expect(
      (payloads[0] as { skills: Array<Record<string, unknown>> }).skills[0],
    ).toEqual(
      expect.objectContaining({
        name: 'dev-review',
        content: '# Dev review',
      }),
    );
    const remoteSkill = (
      payloads[0] as { skills: Array<Record<string, unknown>> }
    ).skills.find((skill) => skill.name === 'remote-review');
    expect(remoteSkill).toEqual(
      expect.objectContaining({
        source_url: 'https://example.com/skills/remote-review',
        content_url: 'https://example.com/skills/remote-review/SKILL.md',
        icon_url: 'data:image/png;base64,AAAA',
      }),
    );
    const unsafeIconSkill = (
      payloads[0] as { skills: Array<Record<string, unknown>> }
    ).skills.find((skill) => skill.name === 'unsafe-icon-skill');
    expect(unsafeIconSkill).not.toHaveProperty('icon_url');
  });

  it('merges local and remote copies by portable identity and remaps files', async () => {
    const localBackup = createBaseBackup();
    localBackup.skills = [
      {
        id: 'desktop-id',
        name: 'dev-review',
        protocol_type: 'skill',
        is_favorite: false,
        source_url: '/Users/demo/skills/dev-review',
        local_repo_path: '/Users/demo/skills/dev-review',
        directory_fingerprint: 'dev-review-package',
        content: '# Local copy',
        instructions: '# Local copy',
        created_at: 1,
        updated_at: 100,
      },
    ];
    localBackup.skillFiles = {
      'desktop-id': [{ relativePath: 'SKILL.md', content: '# Local copy' }],
    };
    localBackup.skillVersions = [
      {
        id: 'desktop-version',
        skillId: 'desktop-id',
        version: 1,
        content: '# Local copy',
        createdAt: '2026-07-11T00:00:00.000Z',
      },
    ];
    exportDatabaseMock.mockResolvedValue(localBackup);
    const remotePayload = {
      version: 'web-backup-v2',
      exportedAt: '2026-07-11T00:01:00.000Z',
      prompts: [],
      promptVersions: [],
      folders: [],
      rules: [],
      skills: [
        {
          id: 'web-id',
          name: 'dev-review',
          protocol_type: 'skill' as const,
          is_favorite: false,
          source_url: 'https://example.com/skills/dev-review',
          directory_fingerprint: 'dev-review-package',
          content: '# Remote copy',
          instructions: '# Remote copy',
          created_at: 1,
          updated_at: 200,
        },
      ],
      skillVersions: [
        {
          id: 'web-version',
          skillId: 'web-id',
          version: 1,
          content: '# Remote copy',
          createdAt: '2026-07-11T00:01:00.000Z',
        },
      ],
      skillFiles: {
        'web-id': [{ relativePath: 'SKILL.md', content: '# Remote copy' }],
      },
      settings: {
        theme: 'light' as const,
        language: 'en' as const,
        autoSave: true,
        builtinAgentOverrides: {},
        customPlatformRootPaths: {},
        customSkillPlatformPaths: {},
        disabledPlatformIds: [],
        sync: { enabled: false, provider: 'manual' as const, autoSync: false },
      },
    };
    vi.stubGlobal('fetch', createAuthenticatedFetch(remotePayload));

    await pullFromSelfHostedWeb({
      url: 'https://backup.example.com',
      username: 'owner',
      password: 'secret',
    });

    const restored = restoreFromBackupMock.mock.calls[0][0] as DatabaseBackup;
    expect(restored.skills).toHaveLength(1);
    expect(restored.skills?.[0]).toEqual(
      expect.objectContaining({ id: 'web-id', content: '# Remote copy' }),
    );
    expect(restored.skillFiles).toEqual({
      'web-id': [{ relativePath: 'SKILL.md', content: '# Remote copy' }],
    });
    expect(restored.skillVersions).toEqual([
      expect.objectContaining({ skillId: 'web-id', version: 1 }),
    ]);
  });
});
