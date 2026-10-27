import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, vi } from 'vitest';
import type { getPlatformProxy, unstable_startWorker } from 'wrangler';
import type { Env } from './types';

const RUNTIME_TIMEOUT_MS = 60_000;
let root = '';
let proxy: Awaited<ReturnType<typeof getPlatformProxy<Env>>> | undefined;
type LocalWorker = Awaited<ReturnType<typeof unstable_startWorker>>;
let worker: LocalWorker | undefined;

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

export function env(): Env {
  if (!proxy) throw new Error('Worker bindings are not running');
  return proxy.env;
}

export async function openBindings(): Promise<void> {
  const { getPlatformProxy: createProxy } = await import('wrangler');
  proxy = await createProxy<Env>({
    configPath: path.join(root, 'wrangler.json'), envFiles: [], remoteBindings: false,
    // startWorker appends v3; getPlatformProxy expects the final persistence root.
    persist: { path: path.join(root, 'state', 'v3') },
  });
}

export async function openWorker(): Promise<void> {
  const { unstable_startWorker: startWorker } = await import('wrangler');
  worker = await startWorker({
    config: path.join(root, 'wrangler.json'), envFiles: [], sendMetrics: false,
    build: { bundle: true },
    dev: {
      remote: false, persist: path.join(root, 'state'), watch: false, inspector: false,
      server: { hostname: '127.0.0.1', port: 0 }, logLevel: 'error',
      registry: path.join(root, 'registry'), generateTypes: false, enableContainers: false,
    },
  });
  await worker.ready;
  expect(path.resolve(worker.config.projectRoot)).toBe(path.resolve(root));
  console.info('Acceptance Worker URL:', String(await worker.url));
}

export function request(url: string, token?: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}): ReturnType<LocalWorker['fetch']> {
  if (!worker) throw new Error('Local Worker is not running');
  return worker.fetch(`http://local${url}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export async function data(url: string, token?: string, method = 'GET', body?: unknown, status = 200): Promise<unknown> {
  const response = await request(url, token, method, body);
  const json: unknown = await response.json();
  expect(response.status, JSON.stringify(json)).toBe(status);
  return object(json).data;
}

export async function register(username: string): Promise<{ token: string; userId: string }> {
  const result = object(await data('/api/auth/register', undefined, 'POST', { username, password: 'fixture-password-001' }, 201));
  return { token: string(result.accessToken), userId: string(object(result.user).id) };
}

async function initialize(): Promise<void> {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-cross-worker-'));
  // Wrangler queues log writes after dispose; remove its owned directory at
  // worker-process exit so those writes cannot recreate a cleaned fixture.
  const ownedRoot = root;
  process.once('exit', () => fs.rmSync(ownedRoot, { recursive: true, force: true }));
  vi.stubEnv('WRANGLER_SEND_METRICS', 'false');
  vi.stubEnv('WRANGLER_LOG_PATH', path.join(root, 'wrangler.log'));
  fs.writeFileSync(path.join(root, 'wrangler.json'), JSON.stringify({
    name: 'cross-surface-acceptance', compatibility_date: '2026-05-26', send_metrics: false,
    main: fileURLToPath(new URL('./worker.ts', import.meta.url)),
    d1_databases: [{ binding: 'DB', database_name: 'acceptance', database_id: '00000000-0000-0000-0000-000000000001' }],
    r2_buckets: [{ binding: 'MEDIA', bucket_name: 'acceptance-media' }],
    vars: { JWT_SECRET: 'isolated-worker-acceptance-fixture-secret-only', ALLOW_REGISTRATION: 'true', AUTH_CAPTCHA_ENABLED: 'false' },
  }));
  await openBindings();
  // This checked-in migration has no semicolons inside SQL literals.
  const statements = fs.readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8').split(';').map((sql) => sql.trim()).filter(Boolean);
  await env().DB.batch(statements.map((sql) => env().DB.prepare(sql)));
  await proxy?.dispose();
  proxy = undefined;
  await openWorker();
}

async function dispose(): Promise<void> {
  try {
    const results = await Promise.allSettled([
      Promise.resolve().then(() => worker?.dispose()),
      Promise.resolve().then(() => proxy?.dispose()),
    ]);
    const errors = results.flatMap((result) => result.status === 'rejected' ? [result.reason] : []);
    if (errors.length > 0) throw new AggregateError(errors, 'Failed to dispose acceptance Worker resources');
  }
  finally {
    proxy = undefined;
    worker = undefined;
    vi.unstubAllEnvs();
  }
  // Exercise Wrangler itself: no queued disk logger may outlive disposal and
  // race the owned fixture cleanup when the test worker exits.
  expect(fs.existsSync(path.join(root, 'wrangler.log'))).toBe(false);
}

export function useRuntime(): void {
  beforeAll(initialize, RUNTIME_TIMEOUT_MS);
  afterAll(dispose, RUNTIME_TIMEOUT_MS);
}

export async function stopWorker(): Promise<void> {
  await worker?.dispose();
  worker = undefined;
}

export async function stopBindings(): Promise<void> {
  await proxy?.dispose();
  proxy = undefined;
}

export async function restartWorker(): Promise<void> {
  await stopWorker();
  await openWorker();
}

export async function withBindings<T>(operation: (bindings: Env) => Promise<T>): Promise<T> {
  await stopWorker();
  await openBindings();
  try { return await operation(env()); }
  finally { await stopBindings(); await openWorker(); }
}
