import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { lookup } from 'node:dns/promises';

import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../../..');
const npmRegistryHost = 'registry.npmjs.org';

function isCiEnvironment(): boolean {
  return process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
}

async function canResolveNpmRegistry(timeoutMs = 1500): Promise<boolean> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    await Promise.race([
      lookup(npmRegistryHost),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('DNS lookup timed out')), timeoutMs);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function isRegistryNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return [error.message, String('stdout' in error ? error.stdout : ''), String('stderr' in error ? error.stderr : '')]
    .join('\n')
    .includes(npmRegistryHost);
}

function copyFileIntoTemp(tempRoot: string, relativePath: string): void {
  const sourcePath = path.join(repoRoot, relativePath);
  const targetPath = path.join(tempRoot, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function copyDirectoryIntoTemp(tempRoot: string, relativePath: string): void {
  const sourcePath = path.join(repoRoot, relativePath);
  const targetPath = path.join(tempRoot, relativePath);
  fs.rmSync(targetPath, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.cpSync(sourcePath, targetPath, { recursive: true });
}

function runPnpm(args: string[], cwd: string): void {
  execFileSync('pnpm', args, {
    cwd,
    stdio: 'pipe',
    env: {
      ...process.env,
      COREPACK_ENABLE_AUTO_PIN: '0',
      npm_config_fetch_retries: '0',
      npm_config_fetch_retry_maxtimeout: '1000',
      npm_config_fetch_retry_mintimeout: '1000',
    },
  });
}

describe('web Docker runtime dependencies', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('resolves node-sqlite3-wasm after runner-style production install', async () => {
    const isCi = isCiEnvironment();
    if (!isCi && !(await canResolveNpmRegistry())) {
      console.warn(
        `Skipping Docker runtime dependency install check because ${npmRegistryHost} is not resolvable in this local environment.`,
      );
      return;
    }

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-runner-'));
    tempDirs.push(tempRoot);
    const runtimeEntryPath = path.join(tempRoot, 'apps/web/dist/server/index.js');

    copyFileIntoTemp(tempRoot, 'package.json');
    copyFileIntoTemp(tempRoot, 'pnpm-lock.yaml');
    copyFileIntoTemp(tempRoot, 'pnpm-workspace.yaml');
    copyFileIntoTemp(tempRoot, 'apps/web/package.json');
    copyFileIntoTemp(tempRoot, 'packages/shared/package.json');
    copyFileIntoTemp(tempRoot, 'packages/db/package.json');

    try {
      runPnpm(['install', '--prod', '--frozen-lockfile', '--ignore-scripts'], tempRoot);
    } catch (error) {
      if (!isCi && isRegistryNetworkFailure(error)) {
        console.warn(
          `Skipping Docker runtime dependency install check because pnpm cannot reach ${npmRegistryHost} in this local environment.`,
        );
        return;
      }
      throw error;
    }

    copyDirectoryIntoTemp(tempRoot, 'packages/shared/types');
    copyDirectoryIntoTemp(tempRoot, 'packages/shared/constants');
    copyDirectoryIntoTemp(tempRoot, 'packages/db/src');
    fs.mkdirSync(path.dirname(runtimeEntryPath), { recursive: true });
    fs.writeFileSync(runtimeEntryPath, '', 'utf8');

    expect(fs.existsSync(path.join(tempRoot, 'packages/db/src/index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tempRoot, 'packages/shared/types/index.ts'))).toBe(true);

    const resolvedSqlite = execFileSync(
      process.execPath,
      [
        '-e',
        [
          'import { createRequire } from "node:module";',
          'import { pathToFileURL } from "node:url";',
          `const require = createRequire(pathToFileURL(${JSON.stringify(runtimeEntryPath)}));`,
          'process.stdout.write(require.resolve("node-sqlite3-wasm"));',
        ].join(' '),
      ],
      { cwd: tempRoot, encoding: 'utf8' },
    ).trim();

    const resolvedDb = execFileSync(
      process.execPath,
      [
        '-e',
        [
          'import { createRequire } from "node:module";',
          'import { pathToFileURL } from "node:url";',
          `const require = createRequire(pathToFileURL(${JSON.stringify(runtimeEntryPath)}));`,
          'process.stdout.write(require.resolve("@prompthub/db"));',
        ].join(' '),
      ],
      { cwd: tempRoot, encoding: 'utf8' },
    ).trim();

    expect(resolvedSqlite).toContain(path.join('node_modules', 'node-sqlite3-wasm'));
    expect(resolvedDb).toContain(path.join('packages', 'db', 'src', 'index.ts'));
  }, 120000);
});
