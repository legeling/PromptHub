import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import { TEST_DATABASE_TEMPLATE_ENV } from '../src/test-helpers/database-template';

const WEB_ROOT = fileURLToPath(new URL('../', import.meta.url));
const PROCESS_TIMEOUT_MS = 20_000;
const OUTPUT_BYTES = 1_048_576;
export const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('hex');

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function object(value: unknown): Record<string, unknown> {
  if (isObject(value)) return value;
  throw new Error('Expected a JSON object');
}
export function string(value: unknown): string {
  if (typeof value === 'string') return value;
  throw new Error('Expected a string');
}
export function array(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  throw new Error('Expected a JSON array');
}

async function availablePort(): Promise<number> {
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const address = reservation.address();
  await new Promise<void>((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));
  if (!address || typeof address === 'string') throw new Error('Missing port reservation');
  return address.port;
}

function environment(root: string, port: number): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env, DATA_ROOT: root, PORT: String(port), HOST: '127.0.0.1',
    LOG_LEVEL: 'error', ALLOW_REGISTRATION: 'true', AUTH_CAPTCHA_ENABLED: 'false',
    JWT_SECRET: 'isolated-cross-surface-http-secret-only', AGENT_SECRET_KEY: TEST_ENCRYPTION_KEY,
  };
  delete env[TEST_DATABASE_TEMPLATE_ENV];
  return env;
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = once(child, 'close');
  child.kill('SIGTERM');
  const deadline = setTimeout(() => child.kill('SIGKILL'), PROCESS_TIMEOUT_MS);
  try { await closed; } finally { clearTimeout(deadline); }
}

export async function start(root: string): Promise<{ url: string; close(): Promise<void> }> {
  const port = await availablePort();
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: WEB_ROOT, env: environment(root, port), stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await new Promise<void>((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error(`HTTP startup deadline: ${output}`)), PROCESS_TIMEOUT_MS);
      const finish = (error?: Error): void => { clearTimeout(timer); error ? reject(error) : resolve(); };
      const read = (chunk: Buffer): void => {
        output += chunk.toString();
        if (output.length > OUTPUT_BYTES) {
          output = output.slice(-OUTPUT_BYTES);
          child.kill('SIGTERM');
          finish(new Error('HTTP process output exceeded fixture bound'));
        }
        if (output.includes(`PromptHub server listening on http://127.0.0.1:${port}`)) finish();
      };
      child.stdout?.on('data', read);
      child.stderr?.on('data', read);
      child.once('error', finish);
      child.once('exit', (code) => finish(new Error(`HTTP entry exited ${code}: ${output}`)));
    });
    console.info('Acceptance Web process:', JSON.stringify({ pid: child.pid, port, root }));
    return { url: `http://127.0.0.1:${port}`, close: () => stop(child) };
  } catch (cause) { await stop(child); throw cause; }
}

export async function request(url: string, token?: string, method = 'GET', body?: unknown): Promise<Response> {
  return fetch(url, { method, signal: AbortSignal.timeout(PROCESS_TIMEOUT_MS),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export async function data(url: string, token?: string, method = 'GET', body?: unknown, status = 200): Promise<unknown> {
  const response = await request(url, token, method, body);
  const json: unknown = await response.json();
  expect(response.status, JSON.stringify(json)).toBe(status);
  return object(json).data;
}

export async function account(url: string, username: string): Promise<{ token: string; userId: string }> {
  const result = object(await data(`${url}/api/auth/register`, undefined, 'POST', { username, password: 'fixture-password-001' }, 201));
  return { token: string(result.accessToken), userId: string(object(result.user).id) };
}

export function findFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(root, entry.name);
    return entry.isDirectory() ? findFiles(name) : [name];
  });
}
