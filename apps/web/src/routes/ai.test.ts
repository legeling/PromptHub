import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase } from '@prompthub/db';
import { issueSolvedCaptcha } from '../test-helpers/auth-captcha';

const { requestRemoteBufferedMock, requestRemoteStreamMock } = vi.hoisted(() => ({
  requestRemoteBufferedMock: vi.fn(),
  requestRemoteStreamMock: vi.fn(),
}));

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
    requestRemoteBuffered: requestRemoteBufferedMock.mockImplementation(async () => {
      const result = options?.mockRemoteBufferedResult;
      if (result instanceof Error) {
        throw result;
      }
      if (!result) {
        throw new Error('Missing mockRemoteBufferedResult');
      }
      return result;
    }),
    requestRemoteStream: requestRemoteStreamMock.mockImplementation(async () => {
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
  const captcha = await issueSolvedCaptcha(app);
  const response = await app.request(
    new Request('http://local/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, ...captcha }),
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
    requestRemoteBufferedMock.mockReset();
    requestRemoteStreamMock.mockReset();
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

  it('rejects non-HTTPS AI proxy URLs before contacting upstream hosts', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-ai-test-'));

    try {
      const app = await createTestApp(dataDir, {
        mockRemoteBufferedResult: new Error('buffered transport should not be called'),
        mockRemoteStreamResult: new Error('stream transport should not be called'),
      });
      const { payload } = await registerUser(app, 'aihttpsonly', 'debugpass001');

      const bufferedResponse = await app.request(
        new Request('http://local/api/ai/request', {
          method: 'POST',
          headers: authHeaders(payload.data.accessToken),
          body: JSON.stringify({
            method: 'POST',
            url: 'http://api.example.com/v1/chat/completions',
            headers: { Authorization: 'Bearer secret' },
            body: '{"prompt":"hi"}',
          }),
        }),
      );
      expect(bufferedResponse.status).toBe(422);
      const bufferedPayload = (await bufferedResponse.json()) as { error: { code: string; message: string } };
      expect(bufferedPayload.error.code).toBe('VALIDATION_ERROR');
      expect(bufferedPayload.error.message).toContain('AI proxy URL must use HTTPS');

      const streamResponse = await app.request(
        new Request('http://local/api/ai/stream', {
          method: 'POST',
          headers: authHeaders(payload.data.accessToken),
          body: JSON.stringify({
            method: 'POST',
            url: 'http://api.example.com/v1/chat/completions',
            headers: { Authorization: 'Bearer secret' },
            body: '{"prompt":"hi"}',
          }),
        }),
      );
      expect(streamResponse.status).toBe(422);
      const streamPayload = (await streamResponse.json()) as { error: { code: string; message: string } };
      expect(streamPayload.error).toEqual(bufferedPayload.error);

      expect(requestRemoteBufferedMock).not.toHaveBeenCalled();
      expect(requestRemoteStreamMock).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects oversized AI proxy request envelopes and fields before contacting upstream hosts', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-ai-boundary-test-'));

    try {
      const app = await createTestApp(dataDir, {
        mockRemoteBufferedResult: new Error('buffered transport should not be called'),
        mockRemoteStreamResult: new Error('stream transport should not be called'),
      });
      const { payload } = await registerUser(app, 'aiboundary', 'debugpass001');

      const oversizedEnvelopeResponse = await app.request(
        new Request('http://local/api/ai/request', {
          method: 'POST',
          headers: {
            ...authHeaders(payload.data.accessToken),
            'Content-Length': String(11 * 1024 * 1024),
          },
          body: '{',
        }),
      );
      expect(oversizedEnvelopeResponse.status).toBe(400);
      const oversizedEnvelopePayload = (await oversizedEnvelopeResponse.json()) as { error: { code: string; message: string } };
      expect(oversizedEnvelopePayload.error).toEqual({
        code: 'BAD_REQUEST',
        message: 'AI proxy request body exceeds size limit',
      });

      const oversizedFieldsResponse = await app.request(
        new Request('http://local/api/ai/stream', {
          method: 'POST',
          headers: authHeaders(payload.data.accessToken),
          body: JSON.stringify({
            requestId: 'r'.repeat(121),
            method: 'POST',
            url: `https://api.example.com/${'u'.repeat(2050)}`,
            headers: Object.fromEntries(
              Array.from({ length: 65 }, (_, index) => [`X-Test-${index}`, 'value']),
            ),
            body: 'x'.repeat(8 * 1024 * 1024 + 1),
          }),
        }),
      );
      expect(oversizedFieldsResponse.status).toBe(422);
      const oversizedFieldsPayload = (await oversizedFieldsResponse.json()) as { error: { code: string; message: string } };
      expect(oversizedFieldsPayload.error.code).toBe('VALIDATION_ERROR');
      expect(oversizedFieldsPayload.error.message).toContain('requestId');
      expect(oversizedFieldsPayload.error.message).toContain('url');
      expect(oversizedFieldsPayload.error.message).toContain('headers');
      expect(oversizedFieldsPayload.error.message).toContain('body');

      const oversizedHeaderResponse = await app.request(
        new Request('http://local/api/ai/request', {
          method: 'POST',
          headers: authHeaders(payload.data.accessToken),
          body: JSON.stringify({
            method: 'POST',
            url: 'https://api.example.com/v1/chat/completions',
            headers: {
              ['X'.repeat(129)]: 'ok',
              'X-Large': 'v'.repeat(8193),
            },
          }),
        }),
      );
      expect(oversizedHeaderResponse.status).toBe(422);
      const oversizedHeaderPayload = (await oversizedHeaderResponse.json()) as { error: { code: string; message: string } };
      expect(oversizedHeaderPayload.error.message).toContain('header name');
      expect(oversizedHeaderPayload.error.message).toContain('header value');

      expect(requestRemoteBufferedMock).not.toHaveBeenCalled();
      expect(requestRemoteStreamMock).not.toHaveBeenCalled();
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
            'set-cookie': 'prompthub_access=upstream; Path=/',
            'transfer-encoding': 'chunked',
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
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(response.headers.get('transfer-encoding')).toBeNull();
      expect(await response.text()).toBe('data: hello\n\n');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('returns non-2xx stream responses without replaying the upstream request', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-ai-test-'));

    try {
      const app = await createTestApp(dataDir, {
        mockRemoteBufferedResult: new Error('buffered transport should not replay failed stream requests'),
        mockRemoteStreamResult: {
          status: 502,
          statusText: 'Bad Gateway',
          headers: { 'content-type': 'application/json', 'x-upstream': 'stream-error' },
          body: createStreamBody('{"error":"upstream failed"}'),
          finalUrl: 'https://example.com/ai',
        },
      });
      const { payload } = await registerUser(app, 'aifallback', 'debugpass001');

      const response = await app.request(
        new Request('http://local/api/ai/stream', {
          method: 'POST',
          headers: authHeaders(payload.data.accessToken),
          body: JSON.stringify({
            method: 'POST',
            url: 'https://example.com/ai',
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
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        body: '{"error":"upstream failed"}',
        headers: {
          'content-type': 'application/json',
          'x-upstream': 'stream-error',
        },
      });
      expect(requestRemoteStreamMock).toHaveBeenCalledTimes(1);
      expect(requestRemoteBufferedMock).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('does not expose streaming transport error details to clients', async () => {
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
        message: 'Internal server error',
      });
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('does not expose buffered transport error details to clients', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-ai-test-'));

    try {
      const app = await createTestApp(dataDir, {
        mockRemoteBufferedResult: new Error('connect ECONNREFUSED 10.0.0.5:443'),
        mockRemoteStreamResult: {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'text/event-stream' },
          body: createStreamBody('data: unused\n\n'),
          finalUrl: 'https://example.com/ai',
        },
      });
      const { payload } = await registerUser(app, 'aibufferederror', 'debugpass001');

      const response = await app.request(
        new Request('http://local/api/ai/request', {
          method: 'POST',
          headers: authHeaders(payload.data.accessToken),
          body: JSON.stringify({
            method: 'POST',
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
          error?: string;
        };
      };
      expect(responsePayload.data).toEqual({
        ok: false,
        status: 0,
        statusText: '',
        body: '',
        headers: {},
        error: 'AI proxy request failed',
      });
      expect(responsePayload.data.error).not.toContain('10.0.0.5');
      expect(responsePayload.data.error).not.toContain('ECONNREFUSED');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);
});
