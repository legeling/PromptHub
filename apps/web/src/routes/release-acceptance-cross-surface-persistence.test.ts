import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DatabaseAdapter } from '@prompthub/db';
import { TEST_DATABASE_TEMPLATE_ENV } from '../test-helpers/database-template';

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PROCESS_TIMEOUT_MS = 10_000;
const WORKFLOW_TIMEOUT_MS = 30_000;
const OUTPUT_BYTES = 1_048_576;
const RESPONSE_MARKER = 'ACCEPTANCE_RESPONSE=';
const RESPONSE_SCHEMA = z.object({ status: z.number(), body: z.unknown(), bytes: z.string(), contentType: z.string() });
const ID_SCHEMA = z.object({ data: z.object({ id: z.string() }) });
const ACCOUNT_SCHEMA = z.object({ data: z.object({ accessToken: z.string(), user: z.object({ id: z.string() }) }) });
let root = '';

// Every request starts the production app in a new process; neither a cached
// Hono instance nor the global test database template can satisfy the reads.
const REQUEST_PROGRAM = `
  import fs from 'node:fs';
  import { createApp } from './src/app.ts';
  import { closeDatabase } from '@prompthub/db';
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  try {
    const response = await createApp().request(input.url, {
      method: input.method,
      headers: { 'Content-Type': 'application/json', ...input.headers },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || '';
    process.stdout.write('${RESPONSE_MARKER}' + JSON.stringify({
      status: response.status, contentType, bytes: bytes.toString('base64'),
      body: contentType.includes('application/json') ? JSON.parse(bytes.toString()) : null,
    }) + '\\n');
  } finally { closeDatabase(); }
`;

function request(url: string, token?: string, method = 'GET', body?: unknown): z.infer<typeof RESPONSE_SCHEMA> {
  const env: NodeJS.ProcessEnv = {
    ...process.env, DATA_ROOT: root, LOG_LEVEL: 'error', AUTH_CAPTCHA_ENABLED: 'false',
    ALLOW_REGISTRATION: 'true', JWT_SECRET: 'isolated-cross-surface-test-secret-only',
  };
  delete env[TEST_DATABASE_TEMPLATE_ENV];
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', REQUEST_PROGRAM], {
    cwd: WEB_ROOT, env, encoding: 'utf8', timeout: PROCESS_TIMEOUT_MS, maxBuffer: OUTPUT_BYTES,
    input: JSON.stringify({ url, method, body, headers: token ? { Authorization: `Bearer ${token}` } : {} }),
  });
  if (result.error) throw result.error;
  expect(result.status, result.stderr).toBe(0);
  const line = result.stdout.split('\n').find((item) => item.startsWith(RESPONSE_MARKER));
  if (!line) throw new Error(`Web process returned no response: ${result.stdout}`);
  return RESPONSE_SCHEMA.parse(JSON.parse(line.slice(RESPONSE_MARKER.length)));
}

function register(username: string): z.infer<typeof ACCOUNT_SCHEMA>['data'] {
  const response = request('/api/auth/register', undefined, 'POST', { username, password: 'fixture-password-001' });
  expect(response.status).toBe(201);
  return ACCOUNT_SCHEMA.parse(response.body).data;
}

function assertStoredPrompt(id: string, title: string, content: string, folderId: string): void {
  const db = new DatabaseAdapter(path.join(root, 'data', 'prompthub.db'), { readOnly: true });
  try {
    expect(db.prepare('SELECT title, user_prompt, folder_id FROM prompts WHERE id = ?').get(id)).toEqual({
      title, user_prompt: content, folder_id: folderId,
    });
  } finally { db.close(); }
}

describe('release acceptance: Web process persistence', () => {
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-cross-web-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('imports and scans owned rule versions, then deletes one version without changing content or external files', () => {
    const owner = register('rule-owner');
    const other = register('rule-other');
    const external = path.join(root, 'external-project');
    fs.mkdirSync(external);
    const targetPath = path.join(external, 'AGENTS.md');
    fs.writeFileSync(targetPath, 'External file must stay unchanged');
    const versions = [
      { id: 'version-one', savedAt: '2026-01-01T00:00:00.000Z', source: 'manual-save', content: 'First rules' },
      { id: 'version-two', savedAt: '2026-01-02T00:00:00.000Z', source: 'manual-save', content: 'Current rules' },
    ];
    const record = {
      id: 'project:acceptance', platformId: 'workspace', platformName: 'Acceptance',
      platformIcon: 'FolderRoot', platformDescription: 'Imported project', name: 'AGENTS.md',
      description: 'Owned rule', path: targetPath, targetPath, projectRootPath: external,
      syncStatus: 'target-missing', content: 'Current rules', versions,
    };
    const imported = request('/api/rules/import-records', owner.accessToken, 'POST', { records: [record] });
    expect(imported.status, JSON.stringify(imported.body)).toBe(200);
    const scan = request('/api/rules/scan', owner.accessToken, 'POST');
    expect(scan.status).toBe(200);
    expect(scan.body).toMatchObject({ data: [{ id: record.id, exists: true, projectRootPath: external }] });
    expect(request('/api/rules/scan', other.accessToken, 'POST').body).toEqual({ data: [] });
    const url = `/api/rules/${encodeURIComponent(record.id)}`;
    expect(request(url, owner.accessToken).body).toMatchObject({ data: { content: record.content, versions: [...versions].reverse() } });
    const deleted = request(`${url}/versions/version-one`, owner.accessToken, 'DELETE');
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ data: [versions[1]] });
    const reopened = request(url, owner.accessToken);
    expect(reopened.body).toMatchObject({ data: { content: record.content, versions: [versions[1]] } });
    const managedPath = z.object({ data: z.object({ managedPath: z.string() }) }).parse(reopened.body).data.managedPath;
    expect(managedPath.startsWith(path.join(root, 'data', 'rule-files') + path.sep)).toBe(true);
    expect(fs.readFileSync(managedPath, 'utf8')).toBe(record.content);
    expect(fs.readFileSync(targetPath, 'utf8')).toBe('External file must stay unchanged');
    const database = new DatabaseAdapter(path.join(root, 'data', 'prompthub.db'), { readOnly: true });
    try {
      expect(database.get('SELECT owner_user_id, id, description FROM rules WHERE owner_user_id = ? AND id = ?', owner.user.id, record.id)).toEqual({owner_user_id:owner.user.id,id:record.id,description:record.description});
      expect(database.all('SELECT id FROM rule_versions WHERE owner_user_id = ? AND rule_id = ?', owner.user.id,record.id)).toEqual([{id:'version-two'}]);
    } finally { database.close(); }
    expect(fs.existsSync(path.join(root,'data','rules'))).toBe(false);
  }, WORKFLOW_TIMEOUT_MS);

  it('clears only confirmed video files for the authenticated owner and persists the empty result', () => {
    const owner = register('clear-owner');
    const other = register('clear-other');
    const payload = { fileName: 'fixture.mp4', base64Data: Buffer.from('owned video').toString('base64') };
    const first = request('/api/media/videos/base64', owner.accessToken, 'POST', payload);
    const second = request('/api/media/videos/base64', owner.accessToken, 'POST', payload);
    const separate = request('/api/media/videos/base64', other.accessToken, 'POST', payload);
    for (const uploaded of [first, second, separate]) expect(uploaded.status).toBe(201);
    const filename = z.object({ data: z.string() }).parse(separate.body).data;
    const directory = path.join(root, 'data', 'assets', owner.user.id, 'videos');
    const before = fs.readdirSync(directory).sort();
    expect(before).toHaveLength(2);
    expect(request('/api/media/videos', owner.accessToken, 'DELETE').status).toBe(422);
    expect(fs.readdirSync(directory).sort()).toEqual(before);
    const cleared = request('/api/media/videos?confirm=true', owner.accessToken, 'DELETE');
    expect(cleared.status).toBe(200);
    expect(cleared.body).toEqual({ data: { ok: true, deletedCount: 2 } });
    expect(fs.readdirSync(directory)).toEqual([]);
    expect(request('/api/media/videos', owner.accessToken).body).toEqual({ data: [] });
    expect(request('/api/media/videos', other.accessToken).body).toEqual({ data: [filename] });
    expect(fs.readFileSync(path.join(root, 'data', 'assets', other.user.id, 'videos', filename), 'utf8')).toBe('owned video');
    expect(request('/api/media/videos?confirm=true', owner.accessToken, 'DELETE').body).toEqual({ data: { ok: true, deletedCount: 0 } });
  }, WORKFLOW_TIMEOUT_MS);

  it('reopens private prompt relationships and preserves disk state after another user attempts a write', () => {
    const owner = register('owner');
    const other = register('other');
    const folder = request('/api/folders', owner.accessToken, 'POST', { name: '目录 📁' });
    expect(folder.status).toBe(201);
    const folderId = ID_SCHEMA.parse(folder.body).data.id;
    const content = '中文 🦌\n<script>literal</script>';
    const created = request('/api/prompts', owner.accessToken, 'POST', { title: 'Original', userPrompt: content, folderId });
    expect(created.status).toBe(201);
    const id = ID_SCHEMA.parse(created.body).data.id;
    const denied = request(`/api/prompts/${id}`, other.accessToken, 'PUT', { title: 'Unauthorized change' });
    expect(denied.status).toBe(404);
    expect(denied.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    assertStoredPrompt(id, 'Original', content, folderId);
    const login = request('/api/auth/login', undefined, 'POST', { username: 'owner', password: 'fixture-password-001' });
    expect(login.status).toBe(200);
    const token = ACCOUNT_SCHEMA.parse(login.body).data.accessToken;
    const reopened = request(`/api/prompts/${id}`, token);
    expect(reopened.status).toBe(200);
    expect(reopened.body).toMatchObject({ data: { id, userPrompt: content, folderId, title: 'Original' } });
    expect(request(`/api/prompts/${id}`, token, 'PUT', { title: 'Updated after restart' }).status).toBe(200);
    assertStoredPrompt(id, 'Updated after restart', content, folderId);
    expect(request(`/api/prompts/${id}`, token).body).toMatchObject({ data: { title: 'Updated after restart' } });
  }, WORKFLOW_TIMEOUT_MS);

  it('round-trips video bytes across processes, rejects traversal without partial files, and persists deletion', () => {
    const owner = register('video-owner');
    const token = owner.accessToken;
    const bytes = Buffer.from([0, 0, 0, 16, 102, 116, 121, 112, 109, 112, 52, 50, 0, 255, 128, 10]);
    const uploaded = request('/api/media/videos/base64', token, 'POST', { fileName: 'fixture.mp4', base64Data: bytes.toString('base64') });
    expect(uploaded.status).toBe(201);
    const filename = z.object({ data: z.string() }).parse(uploaded.body).data;
    const directory = path.join(root, 'data', 'assets', owner.user.id, 'videos');
    expect(fs.readdirSync(directory)).toEqual([filename]);
    expect(fs.readFileSync(path.join(directory, filename))).toEqual(bytes);
    const rejected = request('/api/media/videos/base64', token, 'POST', { fileName: '../escape.mp4', base64Data: bytes.toString('base64') });
    expect(rejected.status).toBe(400);
    expect(rejected.body).toMatchObject({ error: { code: 'BAD_REQUEST' } });
    expect(fs.readdirSync(directory)).toEqual([filename]);
    expect(fs.existsSync(path.join(directory, '..', 'escape.mp4'))).toBe(false);
    const download = request(`/api/media/videos/${filename}`, token);
    expect(download.status).toBe(200);
    expect(download.contentType).toBe('video/mp4');
    expect(Buffer.from(download.bytes, 'base64')).toEqual(bytes);
    expect(request('/api/media/videos', token).body).toEqual({ data: [filename] });
    expect(request(`/api/media/videos/${filename}/size`, token).body).toEqual({ data: bytes.length });
    expect(request(`/api/media/videos/${filename}/exists`, token).body).toEqual({ data: true });
    expect(request(`/api/media/videos/${filename}/base64`, token).body).toEqual({ data: bytes.toString('base64') });
    expect(request(`/api/media/videos/${filename}`, token, 'DELETE').status).toBe(200);
    expect(fs.readdirSync(directory)).toEqual([]);
    expect(request(`/api/media/videos/${filename}`, token).status).toBe(404);
    expect(request('/api/media/videos', token).body).toEqual({ data: [] });
  }, WORKFLOW_TIMEOUT_MS);
});
