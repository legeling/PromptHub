import { describe, expect, it } from 'vitest';

import { buildSyncSummary, parseSyncSnapshot } from './sync-snapshot.js';

describe('sync-snapshot agent assets', () => {
  it('preserves current My MCP, My Plugins, plugin packages, and store sources', () => {
    const snapshot = parseSyncSnapshot({
      version: 'web-backup-v2',
      exportedAt: '2026-06-21T00:00:00.000Z',
      prompts: [],
      folders: [],
      skills: [],
      skillVersions: [],
      mcpLibrary: {
        kind: 'prompthub-mcp-library',
        version: 1,
        updatedAt: '2026-06-21T00:00:00.000Z',
        servers: [{ id: 'mcp-1', name: 'Local MCP' }],
        bindings: [],
      },
      pluginLibrary: {
        kind: 'prompthub-plugin-library',
        version: 1,
        updatedAt: '2026-06-21T00:00:00.000Z',
        plugins: [{ id: 'plugin-1', name: 'writer-kit' }],
      },
      pluginPackages: [
        {
          pluginId: 'plugin-1',
          files: [
            {
              relativePath: 'skill.json',
              contentBase64: 'e30=',
              size: 2,
            },
            {
              relativePath: 'versions/manifest.json',
              contentBase64: 'e30=',
              size: 2,
            },
          ],
        },
      ],
      agentAssetFiles: {
        mcp: [
          {
            relativePath: 'library.json',
            contentBase64: 'e30=',
            size: 2,
          },
        ],
        plugins: [
          {
            relativePath: 'writer-kit/package/skill.json',
            contentBase64: 'e30=',
            size: 2,
          },
        ],
      },
      storeSources: {
        skills: {
          customStoreSources: [
            {
              id: 'skill-source-1',
              name: 'Skill Store',
              type: 'git-repo',
              url: 'https://github.com/example/skills',
            },
          ],
          selectedSourceId: 'skill-source-1',
        },
        mcp: {
          customStoreSources: [
            {
              id: 'mcp-source-1',
              name: 'MCP Store',
              type: 'marketplace-json',
              url: 'https://example.com/mcp.json',
            },
          ],
          selectedSourceId: 'mcp-source-1',
        },
        plugins: {
          customStoreSources: [
            {
              id: 'plugin-source-1',
              name: 'Plugin Store',
              type: 'local-dir',
              url: '/Users/test/plugins',
            },
          ],
          selectedSourceId: 'plugin-source-1',
        },
      },
    });

    expect(snapshot.mcpLibrary?.servers).toHaveLength(1);
    expect(snapshot.pluginLibrary?.plugins).toHaveLength(1);
    expect(
      snapshot.pluginPackages?.[0]?.files.map((file) => file.relativePath),
    ).toEqual(['skill.json', 'versions/manifest.json']);
    expect(snapshot.agentAssetFiles?.plugins?.[0]?.relativePath).toBe(
      'writer-kit/package/skill.json',
    );
    expect(snapshot.storeSources?.plugins?.selectedSourceId).toBe(
      'plugin-source-1',
    );
    expect(buildSyncSummary(snapshot)).toMatchObject({
      mcpServers: 1,
      plugins: 1,
    });
  });

  it('still rejects reserved skill snapshot paths', () => {
    expect(() =>
      parseSyncSnapshot({
        version: 'web-backup-v2',
        exportedAt: '2026-06-21T00:00:00.000Z',
        prompts: [],
        folders: [],
        skills: [],
        skillVersions: [],
        skillFiles: {
          'skill-1': [
            {
              relativePath: 'skill.json',
              content: '{}',
            },
          ],
        },
      }),
    ).toThrow(/skillFiles\.skill-1\.0\.relativePath/);
  });
});
