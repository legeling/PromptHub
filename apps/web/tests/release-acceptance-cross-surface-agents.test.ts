import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { SKILL_PLATFORMS } from '@prompthub/shared/constants/platforms';
import { readEncryptedConfigBackup } from '@prompthub/core';
import { createAgentConfigEncryption } from '../src/services/agent-config-encryption';
import { TEST_DATABASE_TEMPLATE_ENV } from '../src/test-helpers/database-template';
import { account, array, data, findFiles, object, request, start, string, TEST_ENCRYPTION_KEY } from './release-acceptance-cross-surface-runtime';

const WORKFLOW_TIMEOUT_MS = 60_000;
const CHILD_TIMEOUT_MS = 15_000;
const OUTPUT_BYTES = 1_048_576;
const WEB_ROOT = fileURLToPath(new URL('../', import.meta.url));
let root = '';
let runtime: Awaited<ReturnType<typeof start>> | undefined;
beforeEach(() => { root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-cross-web-agents-'))); });
afterEach(async () => {
  try { await runtime?.close(); } finally { runtime = undefined; fs.rmSync(root, { recursive: true, force: true }); }
});

async function configure(url: string, token: string): Promise<void> {
  const builtinAgentOverrides = Object.fromEntries(SKILL_PLATFORMS.map((platform) => {
    const rootPath = path.join(root, 'agents', platform.id);
    fs.mkdirSync(rootPath, { recursive: true });
    return [platform.id, { rootPath, configRelativePaths: ['config.toml'] }];
  }));
  await data(`${url}/api/settings`, token, 'PUT', { builtinAgentOverrides, customAgents: [] });
  expect(await data(`${url}/api/settings`, token)).toMatchObject({ builtinAgentOverrides });
}

function seedSession(): string {
  const program = `
    import { AgentSessionIndexDB, closeDatabase } from '@prompthub/db';
    import { getServerDatabase } from './src/database.ts';
    const index = new AgentSessionIndexDB(getServerDatabase());
    try {
      const source = index.registerSource({platformId:'codex',rootPath:process.env.ACCEPTANCE_AGENT_ROOT,adapterId:'codex-test',adapterVersion:'1'});
      index.commitScan({sourceId:source.id,mode:'full',adapterVersion:'1',scannedAt:100,status:'ok',records:[{
        externalId:'indexed-fixture',title:'Indexed fixture session',sourcePath:process.env.ACCEPTANCE_AGENT_ROOT+'/session.jsonl',
        sourceStatus:'present',redactedPreview:'token=[REDACTED] safe fixture',createdAt:10,updatedAt:20,messageCount:2
      }]});
      console.log('SESSION_ID='+index.listSessions({sourceId:source.id,limit:10,offset:0}).items[0].id);
    } finally {closeDatabase();}
  `;
  const env: NodeJS.ProcessEnv = { ...process.env, DATA_ROOT: root, JWT_SECRET: 'isolated-cross-surface-http-secret-only', ACCEPTANCE_AGENT_ROOT: path.join(root, 'agents', 'codex') };
  delete env[TEST_DATABASE_TEMPLATE_ENV];
  const output = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', program], { cwd: WEB_ROOT, env, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, maxBuffer: OUTPUT_BYTES });
  const line = output.split('\n').find((value) => value.startsWith('SESSION_ID='));
  if (!line) throw new Error('Session writer returned no identity');
  return line.slice('SESSION_ID='.length);
}

it('writes real Agent config with an encrypted backup and preserves file bytes after stale and unauthorized writes', async () => {
  runtime = await start(root);
  const owner = await account(runtime.url, 'config-admin');
  const other = await account(runtime.url, 'config-user');
  await configure(runtime.url, owner.token);
  const file = path.join(root, 'agents', 'codex', 'config.toml');
  const original = 'model = "old-model"\napi_key = "synthetic-test-credential"\n';
  fs.writeFileSync(file, original);
  const url = `${runtime.url}/api/agents/codex/config-files`;
  expect(array(await data(url, owner.token))).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'config.toml' })]));
  const read = object(await data(`${url}/read`, owner.token, 'POST', { relativePath: 'config.toml' }));
  expect(read.redacted).toBe(true);
  expect(string(read.content)).not.toContain('synthetic-test-credential');
  const changed = string(read.content).replace('old-model', 'new-model');
  await data(url, owner.token, 'PUT', { relativePath: 'config.toml', content: changed, expectedRevision: read.revision });
  expect(fs.readFileSync(file, 'utf8')).toBe(original.replace('old-model', 'new-model'));
  const backupRoot = path.join(root, 'backups', 'agent-config');
  const backups = findFiles(backupRoot);
  expect(backups).toHaveLength(1);
  expect(fs.readFileSync(backups[0], 'utf8')).not.toContain('synthetic-test-credential');
  expect(await readEncryptedConfigBackup({ backupRoot, backupRef: backups[0], encryption: createAgentConfigEncryption(TEST_ENCRYPTION_KEY) })).toBe(original);
  expect((await request(url, owner.token, 'PUT', { relativePath: 'config.toml', content: changed.replace('new-model', 'stale-model'), expectedRevision: read.revision })).status).toBe(409);
  expect((await request(url, other.token, 'PUT', { relativePath: 'config.toml', content: 'model="unauthorized"' })).status).toBe(403);
  expect(fs.readFileSync(file, 'utf8')).toBe(original.replace('old-model', 'new-model'));
  expect(findFiles(backupRoot)).toEqual(backups);
  await runtime.close();
  runtime = await start(root);
  expect(await data(`${runtime.url}/api/agents/codex/config-files/read`, owner.token, 'POST', { relativePath: 'config.toml' })).toMatchObject({ content: changed });
  expect((await request(`${runtime.url}/api/agents/codex/config-files/read`, owner.token, 'POST', { relativePath: '../outside.toml' })).status).toBe(400);
}, WORKFLOW_TIMEOUT_MS);

it('persists Provider profiles, mappings and encrypted secrets through HTTP and restarts without exposing credentials', async () => {
  runtime = await start(root);
  const owner = await account(runtime.url, 'provider-admin');
  const other = await account(runtime.url, 'provider-user');
  await configure(runtime.url, owner.token);
  const collection = `${runtime.url}/api/agents/codex/provider-profiles`;
  const created = object(await data(collection, owner.token, 'POST', {
    profile: { platformId: 'codex', name: 'Fixture provider', providerKind: 'openai', protocol: 'openai', endpoint: 'https://fixture.invalid/v1', config: {}, source: 'manual' },
    modelMappings: [{ routeKey: 'chat', modelId: 'fixture-model', parameters: {} }], secret: 'synthetic-provider-secret',
  }));
  const id = string(created.id);
  expect(JSON.stringify(created)).not.toContain('synthetic-provider-secret');
  expect(created).toMatchObject({ name: 'Fixture provider', modelMappings: [expect.objectContaining({ modelId: 'fixture-model' })] });
  const secrets = path.join(root, 'config', 'agent-secrets.json');
  expect(fs.readFileSync(secrets, 'utf8')).not.toContain('synthetic-provider-secret');
  expect((await request(collection, other.token)).status).toBe(403);
  const exported = await data(`${collection}/${id}/export`, owner.token);
  expect(exported).toMatchObject({ requiresSecret: true, profile: { name: 'Fixture provider' } });
  expect(JSON.stringify(exported)).not.toContain('synthetic-provider-secret');
  await runtime.close();
  runtime = await start(root);
  const reopened = `${runtime.url}/api/agents/codex/provider-profiles`;
  expect(await data(reopened, owner.token)).toEqual([created]);
  const updated = object(await data(`${reopened}/${id}`, owner.token, 'PUT', { id, expectedUpdatedAt: created.updatedAt, profile: { name: 'Updated provider' }, secretAction: 'preserve' }));
  expect(updated).toMatchObject({ id, name: 'Updated provider' });
  const secretBytes = fs.readFileSync(secrets);
  const stale = await request(`${reopened}/${id}`, owner.token, 'PUT', { id, expectedUpdatedAt: created.updatedAt, profile: { name: 'Stale provider' }, secretAction: 'preserve' });
  expect.soft(stale.status).toBe(409);
  expect(object(await stale.json()).error).toHaveProperty('code');
  expect(await data(reopened, owner.token)).toEqual([updated]);
  expect(fs.readFileSync(secrets)).toEqual(secretBytes);
  await runtime.close();
  runtime = await start(root);
  const preserved = `${runtime.url}/api/agents/codex/provider-profiles`;
  expect(await data(preserved, owner.token)).toEqual([updated]);
  expect(fs.readFileSync(secrets)).toEqual(secretBytes);
  await data(`${preserved}/${id}`, owner.token, 'DELETE');
  await runtime.close();
  runtime = await start(root);
  expect(await data(`${runtime.url}/api/agents/codex/provider-profiles`, owner.token)).toEqual([]);
}, WORKFLOW_TIMEOUT_MS);

it('reads actual persisted session indexes through admin HTTP without reading native transcripts', async () => {
  runtime = await start(root);
  const owner = await account(runtime.url, 'session-admin');
  const other = await account(runtime.url, 'session-user');
  await configure(runtime.url, owner.token);
  await runtime.close();
  const sessionId = seedSession();
  runtime = await start(root);
  const url = `${runtime.url}/api/agents/codex/sessions`;
  expect(await data(`${url}?limit=1&offset=0&search=fixture`, owner.token)).toMatchObject({ total: 1, sessions: [{ id: sessionId, title: 'Indexed fixture session', sourcePath: null, resume: null }] });
  expect(await data(`${url}/${sessionId}`, owner.token)).toMatchObject({ sessionId, truncated: true, entries: [{ text: 'token=[REDACTED] safe fixture' }] });
  expect((await request(url, other.token)).status).toBe(403);
  expect((await request(`${url}?limit=0`, owner.token)).status).toBe(400);
  expect((await request(`${runtime.url}/api/agents/qwen/sessions/${sessionId}`, owner.token)).status).toBe(404);
  expect(fs.existsSync(path.join(root, 'agents', 'codex', 'session.jsonl'))).toBe(false);
  await runtime.close();
  runtime = await start(root);
  expect(await data(`${runtime.url}/api/agents/codex/sessions/${sessionId}`, owner.token)).toMatchObject({ entries: [{ text: 'token=[REDACTED] safe fixture' }] });
}, WORKFLOW_TIMEOUT_MS);
