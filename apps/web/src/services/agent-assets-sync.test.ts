import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);
const pluginInventory = {
  skills: 1,
  mcpServers: 0,
  apps: 0,
  commands: 0,
  hooks: 0,
  agents: 0,
  assets: 0,
  docs: 0,
  lspServers: 0,
  scripts: 0,
};

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function configureTestEnv(dataDir: string): void {
  process.env.PORT = '3996';
  process.env.HOST = '127.0.0.1';
  process.env.JWT_SECRET = 'test-secret-for-web-agent-assets-1234567890';
  process.env.JWT_ACCESS_TTL = '900';
  process.env.JWT_REFRESH_TTL = '604800';
  process.env.DATA_ROOT = dataDir;
  process.env.ALLOW_REGISTRATION = 'true';
  process.env.LOG_LEVEL = 'debug';
}

describe('agent-assets-sync', () => {
  let dataDir = '';

  afterEach(() => {
    vi.resetModules();
    restoreEnv();
    if (dataDir) {
      fs.rmSync(dataDir, { recursive: true, force: true });
      dataDir = '';
    }
  });

  it('stores current My MCP, My Plugins, plugin packages, and store sources per user', async () => {
    dataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'prompthub-web-agent-assets-'),
    );
    configureTestEnv(dataDir);
    vi.resetModules();
    const { readAgentAssetsSnapshot, writeAgentAssetsSnapshotFromPayload } =
      await import('./agent-assets-sync.js');

    writeAgentAssetsSnapshotFromPayload('user@example.com', {
      mcpLibrary: {
        kind: 'prompthub-mcp-library',
        version: 1,
        updatedAt: '2026-06-21T00:00:00.000Z',
        servers: [
          {
            id: 'mcp-1',
            name: 'local-mcp',
            displayName: 'Local MCP',
            transport: 'stdio',
            command: 'node',
            enabled: true,
            source: { type: 'manual' },
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        bindings: [],
      },
      pluginLibrary: {
        kind: 'prompthub-plugin-library',
        version: 1,
        updatedAt: '2026-06-21T00:00:00.000Z',
        plugins: [
          {
            id: 'plugin-1',
            name: 'writer-kit',
            displayName: 'Writer Kit',
            trustLevel: 'custom',
            inventory: pluginInventory,
            classification: 'bundle',
            source: { kind: 'local' },
            installedAt: 1,
            updatedAt: 1,
          },
        ],
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

    expect(readAgentAssetsSnapshot('user@example.com')).toMatchObject({
      mcpLibrary: {
        servers: [{ id: 'mcp-1', name: 'local-mcp' }],
      },
      pluginLibrary: {
        plugins: [{ id: 'plugin-1', name: 'writer-kit' }],
      },
      pluginPackages: [
        {
          pluginId: 'plugin-1',
          files: [{ relativePath: 'skill.json' }],
        },
      ],
      agentAssetFiles: {
        plugins: [{ relativePath: 'writer-kit/package/skill.json' }],
      },
      storeSources: {
        plugins: {
          selectedSourceId: 'plugin-source-1',
        },
      },
    });
    expect(readAgentAssetsSnapshot('other-user')).toEqual({});
  });
});
