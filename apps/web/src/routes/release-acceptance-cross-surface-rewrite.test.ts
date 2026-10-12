import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { Hono } from 'hono';
import { AI_REQUEST_TIMEOUT_MS } from '@prompthub/shared/constants/ai';
import type { RemoteRequestOptions } from '../utils/remote-http';

const remote = vi.hoisted(() => vi.fn());
vi.mock('../utils/remote-http.js', () => ({ requestRemoteBuffered: remote, requestRemoteStream: vi.fn() }));
const TEST_TIMEOUT_MS = 20_000;
const generated = '# Rewritten rules\n\nUse concise, testable instructions.';
let root = '';
let app: Hono;
let token = '';
let ruleUrl = '';
let storedRule: unknown;
let storedVersions: unknown;
let storedFiles: Record<string, string>;
let closeDatabase: () => void;

const payload = {
  instruction: 'Make the rules concise', currentContent: '# Original rules',
  fileName: 'AGENTS.md', platformName: 'Acceptance',
  aiConfig: { apiKey: 'fixture-key', apiUrl: 'https://fixture.invalid/v1', model: 'fixture-model', provider: 'openai', apiProtocol: 'openai' },
};

async function request(url: string, method = 'GET', body?: unknown): Promise<Response> {
  return app.request(url, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function respond(content: string, status = 200): void {
  remote.mockResolvedValue({ status, statusText: status === 200 ? 'OK' : 'Bad Gateway', headers: {},
    body: Buffer.from(JSON.stringify(status === 200 ? { choices: [{ message: { content } }] } : { error: { message: 'Private provider error' } })),
    finalUrl: 'https://fixture.invalid/v1/chat/completions',
  });
}

function ruleFiles(): Record<string, string> {
  const directory = path.join(root, 'data', 'rules');
  return Object.fromEntries(fs.readdirSync(directory, { recursive: true }).flatMap((name) => {
    const filename = path.join(directory, String(name));
    return fs.statSync(filename).isFile() ? [[String(name), fs.readFileSync(filename, 'utf8')]] : [];
  }));
}

async function assertRuleUnchanged(): Promise<void> {
  const current: unknown = await (await request(ruleUrl)).json();
  expect(current).toEqual(storedRule);
  const versions = z.object({ data: z.object({ versions: z.array(z.unknown()) }) }).parse(current).data.versions;
  expect(versions).toEqual(storedVersions);
  expect(ruleFiles()).toEqual(storedFiles);
}

beforeEach(async () => {
  vi.resetModules();
  remote.mockReset();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-cross-rewrite-'));
  vi.stubEnv('DATA_ROOT', root);
  vi.stubEnv('AUTH_CAPTCHA_ENABLED', 'false');
  vi.stubEnv('ALLOW_REGISTRATION', 'true');
  vi.stubEnv('JWT_SECRET', 'isolated-rewrite-fixture-secret-only');
  vi.stubEnv('LOG_LEVEL', 'error');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected direct network request'); }));
  ({ closeDatabase } = await import('@prompthub/db'));
  const { createApp } = await import('../app');
  app = createApp();
  const registered = await request('/api/auth/register', 'POST', { username: 'rewrite-owner', password: 'fixture-password-001' });
  expect(registered.status).toBe(201);
  token = z.object({ data: z.object({ accessToken: z.string() }) }).parse(await registered.json()).data.accessToken;
  const created = await request('/api/rules/projects', 'POST', { id: 'rewrite', name: 'Rewrite', rootPath: path.join(root, 'external') });
  expect(created.status).toBe(201);
  ruleUrl = '/api/rules/project%3Arewrite';
  expect((await request(ruleUrl, 'PUT', { content: payload.currentContent })).status).toBe(200);
  storedRule = await (await request(ruleUrl)).json();
  storedVersions = z.object({ data: z.object({ versions: z.array(z.unknown()) }) }).parse(storedRule).data.versions;
  expect(storedVersions).toEqual([expect.objectContaining({ content: payload.currentContent })]);
  storedFiles = ruleFiles();
  expect(Object.keys(storedFiles).some((name) => name.includes('.versions'))).toBe(true);
}, TEST_TIMEOUT_MS);

afterEach(() => {
  closeDatabase?.();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

describe.each(['/api/rules/rewrite', '/api/rules/project%3Arewrite/rewrite'])('Web Rules draft at %s', (url) => {
  it('uses the actual Web transport to reject private destinations without writing a draft', async () => {
    const actual = await vi.importActual<typeof import('../utils/remote-http')>('../utils/remote-http');
    remote.mockImplementation(actual.requestRemoteBuffered);
    const response = await request(url, 'POST', { ...payload, aiConfig: { ...payload.aiConfig, apiUrl: 'https://127.0.0.1/v1' } });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    expect(remote).toHaveBeenCalledTimes(1);
    await assertRuleUnchanged();
  });

  it.each(['gemini', 'anthropic'])('returns the %s provider draft using its protocol contract', async (protocol) => {
    respond(generated);
    if (protocol === 'anthropic') remote.mockResolvedValue({ status: 200, statusText: 'OK', headers: {}, body: Buffer.from(JSON.stringify({ content: [{ type: 'text', text: generated }] })) });
    const response = await request(url, 'POST', { ...payload, aiConfig: { ...payload.aiConfig, apiProtocol: protocol, provider: protocol } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { content: generated } });
    await assertRuleUnchanged();
  });

  it('returns actual provider content through Core rewrite and never saves the draft (D03)', async () => {
    respond(generated);
    const response = await request(url, 'POST', payload);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { content: generated, summary: 'AI rewrite generated a new draft.' } });
    expect(remote).toHaveBeenCalledTimes(1);
    const sent: RemoteRequestOptions = remote.mock.calls[0][0];
    expect(sent).toMatchObject({ url: 'https://fixture.invalid/v1/chat/completions', method: 'POST', allowedProtocols: ['https:'], timeoutMs: AI_REQUEST_TIMEOUT_MS });
    expect(JSON.parse(sent.body || '')).toMatchObject({ model: 'fixture-model', messages: [
      { role: 'system', content: expect.stringContaining('Rules engineer') },
      { role: 'user', content: expect.stringContaining(payload.instruction) },
    ] });
    await assertRuleUnchanged();
  });

  it('rejects missing AI configuration before transport and preserves current content and versions', async () => {
    const { aiConfig: _config, ...unconfigured } = payload;
    const response = await request(url, 'POST', unconfigured);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(remote).not.toHaveBeenCalled();
    await assertRuleUnchanged();
  });

  it.each(['http', 'empty', 'network'])('rejects %s failure without false draft success or persistence', async (failure) => {
    if (failure === 'network') remote.mockRejectedValue(new Error('Private transport failure'));
    else respond(failure === 'empty' ? '  ' : generated, failure === 'http' ? 502 : 200);
    const response = await request(url, 'POST', payload);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    await assertRuleUnchanged();
  });
});
