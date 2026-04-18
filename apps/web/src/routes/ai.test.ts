import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase } from '@prompthub/db';

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

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

interface MockRemoteBufferedResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: Buffer;
  finalUrl: string;
}

interface MockRemoteStreamResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: ReadableStream<Uint8Array> | null;
  finalUrl: string;
}

async function createTestApp(
  dataDir: string,
  options?: {
    mockRemoteBufferedResult?: MockRemoteBufferedResponse | Error;
    mockRemoteStreamResult?: MockRemoteStreamResponse | Error;
  },
) {
  process.env.PORT = '3998';
  process.env.HOST = '127.0.0.1';
  process.env.JWT_SECRET = 'test-secret-for-web-ai-flow-1234567890';
  process.env.JWT_ACCESS_TTL = '900';
  process.env.JWT_REFRESH_TTL = '604800';
  process.env.DATA_ROOT = dataDir;
  process.env.ALLOW_REGISTRATION = 'true';
  process.env.LOG_LEVEL = 'debug';

  vi.doMock('../utils/remote-http.js', () => ({
    requestRemoteBuffered: vi.fn(async () => {
      const result = options?.mockRemoteBufferedResult;
      if (result instanceof Error) {
        throw result;
      }
      if (!result) {
        throw new Error('Missing mockRemoteBufferedResult');
      }
      return result;
    }),
    requestRemoteStream: vi.fn(async () => {
      const result = options?.mockRemoteStreamResult;
      if (result instanceof Error) {
        throw result;
      }
      if (!result) {
        throw new Error('Missing mockRemoteStreamResult');
      }
      return result;
    }),
  }));

  const [{ createApp }] = await Promise.all([import('../app')]);
  return createApp();
}

async function registerUser(app: Awaited<ReturnType<typeof createTestApp>>, username: string, password: string) {
  const response = await app.request(
    new Request('http://local/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
  );

  const payload = (await response.json()) as {
    data: {
      accessToken: string;
    };
  };

  return { response, payload };
}

function authHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

function createStreamBody(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

describe('web ai routes', () => {
  const TEST_TIMEOUT = 20000;

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    closeDatabase();
    vi.doUnmock('../utils/remote-http.js');
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('validates request payloads and buffers successful AI proxy requests', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-ai-test-'));

    try {
      const app = await createTestApp(dataDir, {
        mockRemoteBufferedResult: {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json', 'x-upstream': 'buffered' },
          body: Buffer.from('{"reply":"hello"}', 'utf-8'),
          finalUrl: 'https://example.com/ai',
        },
        mockRemoteStreamResult: {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'text/event-stream' },
          body: createStreamBody('data: hello\n\n'),
          finalUrl: 'https://example.com/ai',
        },
      });
      const { payload } = await registerUser(app, 'aiuser', 'debugpass001');

      const invalidResponse = await app.request(
        new Request('http://local/api/ai/request', {
          method: 'POST',
          headers: authHeaders(payload.data.accessToken),
          body: JSON.stringify({ method: 'POST', url: 'not-a-url' }),
        }),
      );
      expect(invalidResponse.status).toBe(422);
      const invalidPayload = (await invalidResponse.json()) as { error: { code: string; message: string } };
      expect(invalidPayload.error.code).toBe('VALIDATION_ERROR');
      expect(invalidPayload.error.message).toContain('url: url must be valid');

      const response = await app.request(
        new Request('http://local/api/ai/request', {
          method: 'POST',
          headers: authHeaders(payload.data.accessToken),
          body: JSON.stringify({
            requestId: 'req-buffered',
            method: 'POST',
            url: 'https://example.com/ai',
            headers: { 'X-Test': '1' },
            body: '{"prompt":"hi"}',
          }),
        }),
      );

      expect(response.status).toBe(200);
      const responsePayload = (await response.json()) as {
        data: {
          ok: boolean;
          status: number;
          statusText: string;
          body: string;
          headers: Record<string, string>;
        };
      };

      expect(responsePayload.data).toEqual({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: '{"reply":"hello"}',
        headers: {
          'content-type': 'application/json',
          'x-upstream': 'buffered',
        },
      });
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('streams successful AI responses and preserves safe headers', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-ai-test-'));

    try {
      const app = await createTestApp(dataDir, {
        mockRemoteBufferedResult: {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          body: Buffer.from('{"unused":true}', 'utf-8'),
          finalUrl: 'https://example.com/ai',
        },
        mockRemoteStreamResult: {
          status: 200,
          statusText: 'OK',
          headers: {
            'content-type': 'text/event-stream; charset=utf-8',
            'x-upstream': 'streamed',
            'content-length': '999',
            connection: 'close',
          },
          body: createStreamBody('data: hello\n\n'),
          finalUrl: 'https://example.com/ai',
        },
      });
      const { payload } = await registerUser(app, 'aistream', 'debugpass001');

      const response = await app.request(
        new Request('http://local/api/ai/stream', {
          method: 'POST',
          headers: authHeaders(payload.data.accessToken),
          body: JSON.stringify({
            requestId: 'req-stream',
            method: 'POST',
            url: 'https://example.com/ai',
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
      expect(response.headers.get('cache-control')).toBe('no-cache');
      expect(response.headers.get('connection')).toBe('keep-alive');
      expect(response.headers.get('x-prompthub-request-id')).toBe('req-stream');
      expect(response.headers.get('x-upstream')).toBe('streamed');
      expect(response.headers.get('content-length')).toBeNull();
      expect(await response.text()).toBe('data: hello\n\n');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('falls back to buffered responses when stream transport is non-2xx or bodyless', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-ai-test-'));

    try {
      const app = await createTestApp(dataDir, {
        mockRemoteBufferedResult: {
          status: 202,
          statusText: 'Accepted',
          headers: { 'content-type': 'application/json', 'x-fallback': 'buffered' },
          body: Buffer.from('{"fallback":true}', 'utf-8'),
          finalUrl: 'https://example.com/ai',
        },
        mockRemoteStreamResult: {
          status: 502,
          statusText: 'Bad Gateway',
          headers: { 'content-type': 'text/plain' },
          body: null,
          finalUrl: 'https://example.com/ai',
        },
      });
      const { payload } = await registerUser(app, 'aifallback', 'debugpass001');

      const response = await app.request(
        new Request('http://local/api/ai/stream', {
          method: 'POST',
          headers: authHeaders(payload.data.accessToken),
          body: JSON.stringify({
            method: 'GET',
            url: 'https://example.com/ai',
          }),
        }),
      );

      expect(response.status).toBe(200);
      const responsePayload = (await response.json()) as {
        data: {
          ok: boolean;
          status: number;
          statusText: string;
          body: string;
          headers: Record<string, string>;
        };
      };

      expect(responsePayload.data).toEqual({
        ok: true,
        status: 202,
        statusText: 'Accepted',
        body: '{"fallback":true}',
        headers: {
          'content-type': 'application/json',
          'x-fallback': 'buffered',
        },
      });
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('returns internal errors when the streaming transport throws', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-ai-test-'));

    try {
      const app = await createTestApp(dataDir, {
        mockRemoteBufferedResult: {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          body: Buffer.from('{"unused":true}', 'utf-8'),
          finalUrl: 'https://example.com/ai',
        },
        mockRemoteStreamResult: new Error('stream exploded'),
      });
      const { payload } = await registerUser(app, 'aierror', 'debugpass001');

      const response = await app.request(
        new Request('http://local/api/ai/stream', {
          method: 'POST',
          headers: authHeaders(payload.data.accessToken),
          body: JSON.stringify({
            method: 'POST',
            url: 'https://example.com/ai',
          }),
        }),
      );

      expect(response.status).toBe(500);
      const responsePayload = (await response.json()) as { error: { code: string; message: string } };
      expect(responsePayload.error).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'stream exploded',
      });
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);
});
