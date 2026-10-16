// BC01 now runs the registered Core regression through normal startup and reads.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('../../../../', import.meta.url));
const result = spawnSync('pnpm', ['--filter', '@prompthub/core', 'test', 'tests/plugin-metadata-migration.test.ts'], { cwd, stdio: 'inherit', timeout: 120_000 });
if (result.error) console.error(result.error);
process.exitCode = result.status ?? 1;
