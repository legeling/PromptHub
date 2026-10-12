import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { account, data, object, request, start, string } from './release-acceptance-cross-surface-runtime';

const WORKFLOW_TIMEOUT_MS = 60_000;
let root = '';
let runtime: Awaited<ReturnType<typeof start>> | undefined;
beforeEach(() => { root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-cross-web-http-'))); });
afterEach(async () => {
  try { await runtime?.close(); } finally { runtime = undefined; fs.rmSync(root, { recursive: true, force: true }); }
});

it('starts the actual Web HTTP entry, persists authenticated data, then stops and restarts on an isolated dynamic port', async () => {
  runtime = await start(root);
  const health = await request(`${runtime.url}/health`);
  expect(health.status).toBe(200);
  expect(await health.json()).toMatchObject({ status: 'ok' });
  const owner = await account(runtime.url, 'http-owner');
  const created = object(await data(`${runtime.url}/api/prompts`, owner.token, 'POST', { title: 'HTTP persistence', userPrompt: 'Binary media and Unicode 🦌' }, 201));
  const id = string(created.id);
  expect(fs.existsSync(path.join(root, 'data', 'prompthub.db'))).toBe(true);
  const stoppedUrl = runtime.url;
  await runtime.close();
  await expect(request(`${stoppedUrl}/health`)).rejects.toThrow();
  runtime = await start(root);
  const login = object(await data(`${runtime.url}/api/auth/login`, undefined, 'POST', { username: 'http-owner', password: 'fixture-password-001' }));
  expect(await data(`${runtime.url}/api/prompts/${id}`, string(login.accessToken))).toMatchObject({ id, title: 'HTTP persistence', userPrompt: 'Binary media and Unicode 🦌' });
  expect((await request(`${runtime.url}/api/prompts/${id}`)).status).toBe(401);
}, WORKFLOW_TIMEOUT_MS);

it('rejects unsupported multipart video uploads without changing existing bytes, tenant state or reopened lists', async () => {
  runtime = await start(root);
  const owner = await account(runtime.url, 'video-owner');
  const other = await account(runtime.url, 'video-other');
  const bytes = Buffer.from([0, 255, 128, 10, 42]);
  const filename = string(await data(`${runtime.url}/api/media/videos/base64`, owner.token, 'POST', { fileName: 'existing.mp4', base64Data: bytes.toString('base64') }, 201));
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'video/mp4' }), 'new.mp4');
  const response = await fetch(`${runtime.url}/api/media/videos`, { method: 'POST', headers: { Authorization: `Bearer ${owner.token}` }, body: form });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: { code: 'BAD_REQUEST', message: 'Use /api/media/videos/base64 or /api/media/videos/download' } });
  expect(await data(`${runtime.url}/api/media/videos`, owner.token)).toEqual([filename]);
  expect(await data(`${runtime.url}/api/media/videos`, other.token)).toEqual([]);
  expect(fs.readFileSync(path.join(root, 'data', 'assets', owner.userId, 'videos', filename))).toEqual(bytes);
  await runtime.close();
  runtime = await start(root);
  expect(await data(`${runtime.url}/api/media/videos`, owner.token)).toEqual([filename]);
  const read = await request(`${runtime.url}/api/media/videos/${filename}`, owner.token);
  expect(read.status).toBe(200);
  expect(Buffer.from(await read.arrayBuffer())).toEqual(bytes);
}, WORKFLOW_TIMEOUT_MS);
