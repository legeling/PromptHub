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

async function createTestApp(
  dataDir: string,
  options?: {
    mockRemoteBufferedResult?: MockRemoteBufferedResponse | Error;
  },
) {
  process.env.PORT = '3999';
  process.env.HOST = '127.0.0.1';
  process.env.JWT_SECRET = 'test-secret-for-web-media-flow-1234567890';
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
      user: {
        id: string;
      };
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

describe('web media routes', () => {
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

  it('uploads image base64 content and supports the full read/delete lifecycle', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-media-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload } = await registerUser(app, 'mediauser', 'debugpass001');

      const uploadResponse = await app.request(
        new Request('http://local/api/media/images/base64', {
          method: 'POST',
          headers: authHeaders(payload.data.accessToken),
          body: JSON.stringify({
            fileName: 'sample.png',
            base64Data: Buffer.from('hello', 'utf-8').toString('base64'),
          }),
        }),
      );

      expect(uploadResponse.status).toBe(201);
      const uploadPayload = (await uploadResponse.json()) as { data: string };
      const fileName = uploadPayload.data;
      expect(fileName).toMatch(/\.png$/);
      expect(
        fs.existsSync(
          path.join(
            dataDir,
            'data',
            'assets',
            payload.data.user.id,
            'images',
            fileName,
          ),
        ),
      ).toBe(true);

      const listResponse = await app.request(
        new Request('http://local/api/media/images', {
          headers: { Authorization: `Bearer ${payload.data.accessToken}` },
        }),
      );
      expect(listResponse.status).toBe(200);
      const listPayload = (await listResponse.json()) as { data: string[] };
      expect(listPayload.data).toContain(fileName);

      const base64Response = await app.request(
        new Request(`http://local/api/media/images/${fileName}/base64`, {
          headers: { Authorization: `Bearer ${payload.data.accessToken}` },
        }),
      );
      expect(base64Response.status).toBe(200);
      const base64Payload = (await base64Response.json()) as { data: string };
      expect(Buffer.from(base64Payload.data, 'base64').toString('utf-8')).toBe('hello');

      const existsResponse = await app.request(
        new Request(`http://local/api/media/images/${fileName}/exists`, {
          headers: { Authorization: `Bearer ${payload.data.accessToken}` },
        }),
      );
      expect(existsResponse.status).toBe(200);
      expect((await existsResponse.json()) as { data: boolean }).toEqual({ data: true });

      const sizeResponse = await app.request(
        new Request(`http://local/api/media/images/${fileName}/size`, {
          headers: { Authorization: `Bearer ${payload.data.accessToken}` },
        }),
      );
      expect(sizeResponse.status).toBe(200);
      expect((await sizeResponse.json()) as { data: number }).toEqual({ data: 5 });

      const binaryResponse = await app.request(
        new Request(`http://local/api/media/images/${fileName}`, {
          headers: { Authorization: `Bearer ${payload.data.accessToken}` },
        }),
      );
      expect(binaryResponse.status).toBe(200);
      expect(binaryResponse.headers.get('content-type')).toBe('image/png');
      expect(binaryResponse.headers.get('content-length')).toBe('5');
      expect(Buffer.from(await binaryResponse.arrayBuffer()).toString('utf-8')).toBe('hello');

      const deleteResponse = await app.request(
        new Request(`http://local/api/media/images/${fileName}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${payload.data.accessToken}` },
        }),
      );
      expect(deleteResponse.status).toBe(200);

      const missingExistsResponse = await app.request(
        new Request(`http://local/api/media/images/${fileName}/exists`, {
          headers: { Authorization: `Bearer ${payload.data.accessToken}` },
        }),
      );
      expect((await missingExistsResponse.json()) as { data: boolean }).toEqual({ data: false });

      const missingReadResponse = await app.request(
        new Request(`http://local/api/media/images/${fileName}`, {
          headers: { Authorization: `Bearer ${payload.data.accessToken}` },
        }),
      );
      expect(missingReadResponse.status).toBe(404);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects path traversal uploads and requires confirm=true for delete-all', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-media-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload } = await registerUser(app, 'mediaguards', 'debugpass001');

      const traversalResponse = await app.request(
        new Request('http://local/api/media/images/base64', {
          method: 'POST',
          headers: authHeaders(payload.data.accessToken),
          body: JSON.stringify({
            fileName: '../escape.png',
            base64Data: Buffer.from('hello', 'utf-8').toString('base64'),
          }),
        }),
      );
      expect(traversalResponse.status).toBe(400);
      const traversalPayload = (await traversalResponse.json()) as { error: { code: string; message: string } };
      expect(traversalPayload.error.code).toBe('BAD_REQUEST');
      expect(traversalPayload.error.message).toContain('Invalid filename: path traversal detected');

      await app.request(
        new Request('http://local/api/media/images/base64', {
          method: 'POST',
          headers: authHeaders(payload.data.accessToken),
          body: JSON.stringify({
            fileName: 'first.png',
            base64Data: Buffer.from('one', 'utf-8').toString('base64'),
          }),
        }),
      );
      await app.request(
        new Request('http://local/api/media/images/base64', {
          method: 'POST',
          headers: authHeaders(payload.data.accessToken),
          body: JSON.stringify({
            fileName: 'second.png',
            base64Data: Buffer.from('two', 'utf-8').toString('base64'),
          }),
        }),
      );

      const missingConfirmResponse = await app.request(
        new Request('http://local/api/media/images', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${payload.data.accessToken}` },
        }),
      );
      expect(missingConfirmResponse.status).toBe(422);
      const missingConfirmPayload = (await missingConfirmResponse.json()) as { error: { code: string; message: string } };
      expect(missingConfirmPayload.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'confirm=true is required',
      });

      const deleteAllResponse = await app.request(
        new Request('http://local/api/media/images?confirm=true', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${payload.data.accessToken}` },
        }),
      );
      expect(deleteAllResponse.status).toBe(200);
      const deleteAllPayload = (await deleteAllResponse.json()) as { data: { ok: boolean; deletedCount: number } };
      expect(deleteAllPayload.data.ok).toBe(true);
      expect(deleteAllPayload.data.deletedCount).toBe(2);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('downloads remote media and infers extensions from upstream content types', async () => {
    const successDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-media-test-'));

    try {
      const successApp = await createTestApp(successDir, {
        mockRemoteBufferedResult: {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'image/jpeg' },
          body: Buffer.from('jpeg-bytes', 'utf-8'),
          finalUrl: 'https://example.com/assets/hero',
        },
      });
      const { payload: successPayload } = await registerUser(successApp, 'mediadownload', 'debugpass001');

      const downloadResponse = await successApp.request(
        new Request('http://local/api/media/images/download', {
          method: 'POST',
          headers: authHeaders(successPayload.data.accessToken),
          body: JSON.stringify({ url: 'https://example.com/assets/hero' }),
        }),
      );
      expect(downloadResponse.status).toBe(201);
      const downloadPayload = (await downloadResponse.json()) as { data: string };
      expect(downloadPayload.data).toMatch(/\.jpg$/);

      const downloadedBinary = await successApp.request(
        new Request(`http://local/api/media/images/${downloadPayload.data}`, {
          headers: { Authorization: `Bearer ${successPayload.data.accessToken}` },
        }),
      );
      expect(Buffer.from(await downloadedBinary.arrayBuffer()).toString('utf-8')).toBe('jpeg-bytes');
    } finally {
      fs.rmSync(successDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('wraps upstream download failures as bad requests', async () => {
    const failureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-media-test-'));

    try {
      const failureApp = await createTestApp(failureDir, {
        mockRemoteBufferedResult: {
          status: 502,
          statusText: 'Bad Gateway',
          headers: { 'content-type': 'text/plain' },
          body: Buffer.from('upstream failed', 'utf-8'),
          finalUrl: 'https://example.com/assets/broken',
        },
      });
      const { payload: failurePayload } = await registerUser(failureApp, 'mediafail', 'debugpass001');

      const failedDownloadResponse = await failureApp.request(
        new Request('http://local/api/media/images/download', {
          method: 'POST',
          headers: authHeaders(failurePayload.data.accessToken),
          body: JSON.stringify({ url: 'https://example.com/assets/broken' }),
        }),
      );
      expect(failedDownloadResponse.status).toBe(400);
      const failedDownloadPayload = (await failedDownloadResponse.json()) as { error: { code: string; message: string } };
      expect(failedDownloadPayload.error).toEqual({
        code: 'BAD_REQUEST',
        message: 'Failed to download media: HTTP 502',
      });
    } finally {
      fs.rmSync(failureDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);
});
