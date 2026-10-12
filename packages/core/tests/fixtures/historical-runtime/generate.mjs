import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, '../../../../..');
const sources = [
  { label: 'v0.5.9', commit: '1e933ae29726361982c5ce7b49bc4f4c6da326ba' },
  { label: 'beta.1', commit: '494d57d7da654b8380e4b81f8f51fc5c72e6b7f7' },
  { label: 'beta.2', commit: 'b7854508c3c69eb99cc2d1b6207db02ce5a25ddc' },
];
const commandTimeoutMs = 60_000;
const outputLimitBytes = 32 * 1024 * 1024;
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-historical-runtime-')));
const commands = [];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function run(command, args, options = {}) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, { cwd: repository, timeout: commandTimeoutMs, maxBuffer: outputLimitBytes, ...options });
  commands.push({ command, args, pid: result.pid, startedAt, endedAt: new Date().toISOString(), exitCode: result.status, signal: result.signal });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr.toString().slice(-16_384));
  return result.stdout;
}

function exportSource(source) {
  const destination = path.join(root, source.label);
  fs.mkdirSync(destination);
  const archive = run('git', ['archive', source.commit, 'packages/core', 'packages/db', 'packages/shared']);
  run('tar', ['-xf', '-', '-C', destination], { input: archive });
  fs.mkdirSync(path.join(destination, 'node_modules', '@prompthub'), { recursive: true });
  for (const name of ['core', 'db', 'shared']) {
    const packageRoot = path.join(destination, 'packages', name);
    fs.symlinkSync(packageRoot, path.join(destination, 'node_modules', '@prompthub', name), 'dir');
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    for (const dependency of Object.keys(manifest.dependencies || {})) linkDependency(destination, name, dependency);
  }
  linkDependency(destination, 'cli', 'tsx');
  const harness = path.join(destination, 'harness');
  fs.mkdirSync(harness);
  for (const filename of ['source-runner.mjs', 'audit-loader.mjs']) fs.copyFileSync(path.join(directory, filename), path.join(harness, filename));
  fs.writeFileSync(path.join(harness, 'register-audit.mjs'), "import { register } from 'node:module'; register(new URL('./audit-loader.mjs', import.meta.url));\n");
  return destination;
}

function linkDependency(destination, owner, dependency) {
  if (dependency.startsWith('@prompthub/')) return;
  const target = path.join(destination, 'node_modules', dependency);
  if (fs.existsSync(target)) return;
  const candidates = [path.join(repository, owner === 'cli' ? 'apps' : 'packages', owner, 'node_modules', dependency), path.join(repository, 'node_modules', dependency)];
  const installed = candidates.find((candidate) => fs.existsSync(candidate));
  assert.ok(installed, `Missing installed historical dependency: ${dependency}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.symlinkSync(fs.realpathSync(installed), target, 'dir');
}

function inventory(directoryPath, prefix = '') {
  return fs.readdirSync(directoryPath, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directoryPath, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    assert.equal(entry.isSymbolicLink(), false, `Profile symlink: ${relative}`);
    if (entry.isDirectory()) return inventory(absolute, relative);
    assert.ok(entry.isFile(), `Non-file profile entry: ${relative}`);
    const bytes = fs.readFileSync(absolute);
    return [{ path: relative, bytes: bytes.length, sha256: digest(bytes) }];
  }).sort((left, right) => left.path.localeCompare(right.path));
}

function dependencyOf(file) {
  let current = path.dirname(file);
  while (current !== path.dirname(current)) {
    const manifest = path.join(current, 'package.json');
    if (fs.existsSync(manifest)) {
      const data = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      if (data.name && data.version) return { name: data.name, version: data.version, directory: current, loadedEntry: file };
    }
    current = path.dirname(current);
  }
  throw new Error(`Loaded dependency lacks package provenance: ${file}`);
}

function loadedProvenance(destination, log) {
  const files = [...new Set(fs.readFileSync(log, 'utf8').trim().split('\n'))];
  const sourceFiles = files.filter((file) => file.startsWith('packages/')).sort().map((file) => ({ path: file, sha256: digest(fs.readFileSync(path.join(destination, file))) }));
  const thirdParty = files.filter((file) => file.startsWith('external:')).map((file) => dependencyOf(file.slice('external:'.length)));
  return { loadedSourceFiles: sourceFiles, thirdPartyPackages: [...new Map(thirdParty.map((dependency) => [dependency.directory, dependency])).values()] };
}

function inspectDatabase(databasePath) {
  const require = createRequire(path.join(repository, 'packages/db/package.json'));
  const driver = require('node-sqlite3-wasm');
  const database = new driver.Database(databasePath, { readOnly: true });
  const query = (sql) => {
    const statement = database.prepare(sql);
    try { return statement.all(); } finally { statement.finalize(); }
  };
  try {
    assert.deepEqual(query('PRAGMA quick_check'), [{ quick_check: 'ok' }]);
    assert.deepEqual(query('PRAGMA foreign_key_check'), []);
    const schema = query('SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name');
    const tables = Object.fromEntries(schema.filter((row) => row.type === 'table').map((row) => {
      const identifier = `"${row.name.replaceAll('"', '""')}"`;
      const rows = query(`SELECT * FROM ${identifier}`);
      rows.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
      return [row.name, rows];
    }));
    const foreignKeys = Object.fromEntries(schema.filter((row) => row.type === 'table').map((row) => [row.name, query(`PRAGMA foreign_key_list("${row.name.replaceAll('"', '""')}")`)]));
    return { schema, tables, foreignKeys, userVersion: query('PRAGMA user_version') };
  } finally { database.close(); }
}

function generate(source) {
  const destination = exportSource(source);
  const profile = path.join(destination, 'profile');
  const log = path.join(destination, 'loaded-modules.log');
  fs.mkdirSync(profile);
  const env = { ...process.env, HISTORICAL_SOURCE_ROOT: destination, HISTORICAL_LOAD_LOG: log, HOME: path.join(destination, 'isolated-home'), XDG_CONFIG_HOME: path.join(destination, 'isolated-home/.config') };
  fs.mkdirSync(env.HOME);
  const outcomes = {};
  for (const action of ['seed', 'reopen']) {
    const output = path.join(destination, `${action}.json`);
    run(process.execPath, ['--import', 'tsx', '--import', './harness/register-audit.mjs', './harness/source-runner.mjs', destination, profile, source.label, action, output], { cwd: destination, env });
    outcomes[action] = JSON.parse(fs.readFileSync(output, 'utf8'));
  }
  assert.deepEqual(outcomes.reopen.result, outcomes.seed.result, `${source.label}: old runtime reopen changed business data`);
  const database = inspectDatabase(outcomes.reopen.databasePath);
  const filename = `${source.label}.tar.gz`;
  const archive = run('tar', ['-czf', '-', '-C', destination, 'profile']);
  const manifest = {
    formatVersion: 1, source, sourceKind: 'fresh historical CLI/Core default initialization', generatedAt: new Date().toISOString(),
    runtime: { nodeVersion: process.version, sourceRoot: destination, profileRoot: profile, initializer: 'packages/core/src/database.ts:initDatabase', pathConfiguration: 'configureRuntimePaths({ userDataPath, appDataPath })' },
    ...loadedProvenance(destination, log),
    database: { relativePath: path.posix.join('profile', path.relative(profile, outcomes.reopen.databasePath)), ...database },
    inventory: inventory(profile, 'profile'), archive: { filename, bytes: archive.length, sha256: digest(archive) },
    observations: { seeded: outcomes.seed.result, reopened: outcomes.reopen.result },
    unsupported: source.label === 'v0.5.9' ? ['Agent provider profiles were not present in this source runtime.', 'Desktop ordinary Settings IPC and canonical startup were not executed.'] : ['MCP bundle history is not covered by the default database-catalog runtime; canonical Desktop startup is a separate fixture batch.', 'Desktop ordinary Settings IPC and canonical startup were not executed.'],
    commands: commands.filter((command) => command.args.some((arg) => String(arg).includes(destination) || arg === source.commit)),
  };
  fs.writeFileSync(path.join(directory, filename), archive);
  fs.writeFileSync(path.join(directory, `${source.label}.json`), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ source: source.label, archiveBytes: archive.length, profileFiles: manifest.inventory.length, loadedSourceFiles: manifest.loadedSourceFiles.length }));
}

try {
  const requested = process.argv.slice(2);
  const selected = requested.length ? sources.filter((source) => requested.includes(source.label)) : sources;
  assert.equal(selected.length, requested.length || sources.length, 'Unknown source label');
  for (const source of selected) generate(source);
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
