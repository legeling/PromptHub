import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase } from '@prompthub/db';
import { issueSolvedCaptcha } from '../test-helpers/auth-captcha';

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
    interruptMediaWrite?: boolean;
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

  if (options?.interruptMediaWrite) {
    vi.doMock('node:fs/promises', async () => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
      let interrupted = false;
      return {
        ...actual,
        writeFile: vi.fn(async (file: Parameters<typeof actual.writeFile>[0], data: Parameters<typeof actual.writeFile>[1], writeOptions?: Parameters<typeof actual.writeFile>[2]) => {
          const filePath = String(file);
          if (!interrupted && filePath.includes(`${path.sep}data${path.sep}assets${path.sep}`)) {
            interrupted = true;
            await actual.writeFile(file, Buffer.from('partial-media'), writeOptions);
            throw new Error('simulated interrupted media write');
          }

          return actual.writeFile(file, data, writeOptions);
        }),
      };
    });
  }

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
    vi.doUnmock('node:fs/promises');
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

      const nullByteResponse = await app.request(
        new Request('http://local/api/media/images/base64', {
          method: 'POST',
          headers: authHeaders(payload.data.accessToken),
          body: JSON.stringify({
            fileName: 'bad\u0000name.png',
            base64Data: Buffer.from('hello', 'utf-8').toString('base64'),
          }),
        }),
      );
      expect(nullByteResponse.status).toBe(400);
      const nullBytePayload = (await nullByteResponse.json()) as { error: { code: string; message: string } };
      expect(nullBytePayload.error).toEqual({
        code: 'BAD_REQUEST',
        message: 'Invalid filename: unsupported control character detected',
      });

      const backslashResponse = await app.request(
        new Request('http://local/api/media/images/base64', {
          method: 'POST',
          headers: authHeaders(payload.data.accessToken),
          body: JSON.stringify({
            fileName: 'folder\\escape.png',
            base64Data: Buffer.from('hello', 'utf-8').toString('base64'),
          }),
        }),
      );
      expect(backslashResponse.status).toBe(400);
      const backslashPayload = (await backslashResponse.json()) as { error: { code: string; message: string } };
      expect(backslashPayload.error).toEqual({
        code: 'BAD_REQUEST',
        message: 'Invalid filename: path separator detected',
      });

      const streamSeparatorResponse = await app.request(
        new Request('http://local/api/media/images/base64', {
          method: 'POST',
          headers: authHeaders(payload.data.accessToken),
          body: JSON.stringify({
            fileName: 'avatar:stream.png',
            base64Data: Buffer.from('hello', 'utf-8').toString('base64'),
          }),
        }),
      );
      expect(streamSeparatorResponse.status).toBe(400);
      const streamSeparatorPayload = (await streamSeparatorResponse.json()) as { error: { code: string; message: string } };
      expect(streamSeparatorPayload.error).toEqual({
        code: 'BAD_REQUEST',
        message: 'Invalid filename: stream separator detected',
      });

      const currentDirectoryResponse = await app.request(
        new Request('http://local/api/media/images/base64', {
          method: 'POST',
          headers: authHeaders(payload.data.accessToken),
          body: JSON.stringify({
            fileName: '.',
            base64Data: Buffer.from('hello', 'utf-8').toString('base64'),
          }),
        }),
      );
      expect(currentDirectoryResponse.status).toBe(400);
      const currentDirectoryPayload = (await currentDirectoryResponse.json()) as { error: { code: string; message: string } };
      expect(currentDirectoryPayload.error).toEqual({
        code: 'BAD_REQUEST',
        message: 'Invalid filename: file name is required',
      });

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

  it('rejects invalid base64 uploads without creating media files', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-media-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload } = await registerUser(app, 'mediabase64guard', 'debugpass001');

      const invalidResponse = await app.request(
        new Request('http://local/api/media/images/base64', {
          method: 'POST',
          headers: authHeaders(payload.data.accessToken),
          body: JSON.stringify({
            fileName: 'broken.png',
            base64Data: 'not valid base64!',
          }),
        }),
      );

      expect(invalidResponse.status).toBe(400);
      const invalidPayload = (await invalidResponse.json()) as { error: { code: string; message: string } };
      expect(invalidPayload.error).toEqual({
        code: 'BAD_REQUEST',
        message: 'Invalid base64 media payload',
      });

      const listResponse = await app.request(
        new Request('http://local/api/media/images', {
          headers: authHeaders(payload.data.accessToken),
        }),
      );
      const listPayload = (await listResponse.json()) as { data: string[] };
      expect(listPayload.data).toEqual([]);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects declared oversized base64 uploads before parsing JSON', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-media-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload } = await registerUser(app, 'mediabase64length', 'debugpass001');

      const response = await app.request(
        new Request('http://local/api/media/images/base64', {
          method: 'POST',
          headers: {
            ...authHeaders(payload.data.accessToken),
            'Content-Length': String(30 * 1024 * 1024),
          },
          body: '{',
        }),
      );

      expect(response.status).toBe(400);
      const responsePayload = (await response.json()) as { error: { code: string; message: string } };
      expect(responsePayload.error).toEqual({
        code: 'BAD_REQUEST',
        message: 'Media upload request body exceeds size limit',
      });
      expect(
        fs.existsSync(
          path.join(
            dataDir,
            'data',
            'assets',
            payload.data.user.id,
            'images',
          ),
        ),
      ).toBe(false);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects path traversal reads and deletes as bad requests', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-media-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload } = await registerUser(app, 'mediareadguards', 'debugpass001');
      const headers = { Authorization: `Bearer ${payload.data.accessToken}` };
      const traversalTargets = [
        ['GET', 'http://local/api/media/images/..%2Fescape.png'],
        ['GET', 'http://local/api/media/images/..%2Fescape.png/exists'],
        ['GET', 'http://local/api/media/images/..%2Fescape.png/size'],
        ['GET', 'http://local/api/media/images/..%2Fescape.png/base64'],
        ['DELETE', 'http://local/api/media/images/..%2Fescape.png'],
      ] as const;
      const nullByteTargets = [
        ['GET', 'http://local/api/media/images/bad%00name.png'],
        ['GET', 'http://local/api/media/images/bad%00name.png/exists'],
        ['GET', 'http://local/api/media/images/bad%00name.png/size'],
        ['GET', 'http://local/api/media/images/bad%00name.png/base64'],
        ['DELETE', 'http://local/api/media/images/bad%00name.png'],
      ] as const;
      const backslashTargets = [
        ['GET', 'http://local/api/media/images/folder%5Cescape.png'],
        ['GET', 'http://local/api/media/images/folder%5Cescape.png/exists'],
        ['GET', 'http://local/api/media/images/folder%5Cescape.png/size'],
        ['GET', 'http://local/api/media/images/folder%5Cescape.png/base64'],
        ['DELETE', 'http://local/api/media/images/folder%5Cescape.png'],
      ] as const;
      const streamSeparatorTargets = [
        ['GET', 'http://local/api/media/images/avatar%3Astream.png'],
        ['GET', 'http://local/api/media/images/avatar%3Astream.png/exists'],
        ['GET', 'http://local/api/media/images/avatar%3Astream.png/size'],
        ['GET', 'http://local/api/media/images/avatar%3Astream.png/base64'],
        ['DELETE', 'http://local/api/media/images/avatar%3Astream.png'],
      ] as const;
      const longFileName = `${'a'.repeat(241)}.png`;

      for (const [method, url] of traversalTargets) {
        const response = await app.request(new Request(url, { method, headers }));
        expect(response.status).toBe(400);
        const payloadBody = (await response.json()) as { error: { code: string; message: string } };
        expect(payloadBody.error).toEqual({
          code: 'BAD_REQUEST',
          message: 'Invalid filename: path traversal detected',
        });
      }

      for (const [method, url] of nullByteTargets) {
        const response = await app.request(new Request(url, { method, headers }));
        expect(response.status).toBe(400);
        const payloadBody = (await response.json()) as { error: { code: string; message: string } };
        expect(payloadBody.error).toEqual({
          code: 'BAD_REQUEST',
          message: 'Invalid filename: unsupported control character detected',
        });
      }

      for (const [method, url] of backslashTargets) {
        const response = await app.request(new Request(url, { method, headers }));
        expect(response.status).toBe(400);
        const payloadBody = (await response.json()) as { error: { code: string; message: string } };
        expect(payloadBody.error).toEqual({
          code: 'BAD_REQUEST',
          message: 'Invalid filename: path separator detected',
        });
      }

      for (const [method, url] of streamSeparatorTargets) {
        const response = await app.request(new Request(url, { method, headers }));
        expect(response.status).toBe(400);
        const payloadBody = (await response.json()) as { error: { code: string; message: string } };
        expect(payloadBody.error).toEqual({
          code: 'BAD_REQUEST',
          message: 'Invalid filename: stream separator detected',
        });
      }

      const longNameResponse = await app.request(
        new Request(`http://local/api/media/images/${longFileName}`, { headers }),
      );
      expect(longNameResponse.status).toBe(400);
      const longNamePayload = (await longNameResponse.json()) as { error: { code: string; message: string } };
      expect(longNamePayload.error).toEqual({
        code: 'BAD_REQUEST',
        message: 'Invalid filename: file name is too long',
      });
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('clears deletable media files while skipping entries that cannot be removed', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-media-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload } = await registerUser(app, 'mediaclearpartial', 'debugpass001');
      const imagesDir = path.join(
        dataDir,
        'data',
        'assets',
        payload.data.user.id,
        'images',
      );
      fs.mkdirSync(imagesDir, { recursive: true });
      fs.writeFileSync(path.join(imagesDir, 'safe.png'), 'safe');
      fs.mkdirSync(path.join(imagesDir, 'nested.png'));
      fs.writeFileSync(path.join(imagesDir, 'nested.png', 'keep.txt'), 'keep');

      const deleteAllResponse = await app.request(
        new Request('http://local/api/media/images?confirm=true', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${payload.data.accessToken}` },
        }),
      );

      expect(deleteAllResponse.status).toBe(200);
      const deleteAllPayload = (await deleteAllResponse.json()) as { data: { ok: boolean; deletedCount: number } };
      expect(deleteAllPayload.data).toEqual({ ok: true, deletedCount: 1 });
      expect(fs.existsSync(path.join(imagesDir, 'safe.png'))).toBe(false);
      expect(fs.existsSync(path.join(imagesDir, 'nested.png'))).toBe(true);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('does not expose directory entries that use allowed media extensions', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-media-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload } = await registerUser(app, 'mediadirectoryentry', 'debugpass001');
      const imagesDir = path.join(
        dataDir,
        'data',
        'assets',
        payload.data.user.id,
        'images',
      );
      fs.mkdirSync(imagesDir, { recursive: true });
      fs.writeFileSync(path.join(imagesDir, 'safe.png'), 'safe');
      fs.mkdirSync(path.join(imagesDir, 'nested.png'));
      fs.writeFileSync(path.join(imagesDir, 'nested.png', 'keep.txt'), 'keep');

      const headers = { Authorization: `Bearer ${payload.data.accessToken}` };
      const listResponse = await app.request(
        new Request('http://local/api/media/images', { headers }),
      );
      expect(listResponse.status).toBe(200);
      const listPayload = (await listResponse.json()) as { data: string[] };
      expect(listPayload.data).toEqual(['safe.png']);

      const existsResponse = await app.request(
        new Request('http://local/api/media/images/nested.png/exists', { headers }),
      );
      expect(existsResponse.status).toBe(200);
      expect(await existsResponse.json()).toEqual({ data: false });

      const sizeResponse = await app.request(
        new Request('http://local/api/media/images/nested.png/size', { headers }),
      );
      expect(sizeResponse.status).toBe(404);

      const readResponse = await app.request(
        new Request('http://local/api/media/images/nested.png', { headers }),
      );
      expect(readResponse.status).toBe(404);

      const deleteResponse = await app.request(
        new Request('http://local/api/media/images/nested.png', {
          method: 'DELETE',
          headers,
        }),
      );
      expect(deleteResponse.status).toBe(404);
      expect(fs.existsSync(path.join(imagesDir, 'nested.png', 'keep.txt'))).toBe(true);
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

  it('points video upload callers to every supported media creation route', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-media-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload } = await registerUser(app, 'mediavideohint', 'debugpass001');

      const response = await app.request(
        new Request('http://local/api/media/videos', {
          method: 'POST',
          headers: authHeaders(payload.data.accessToken),
          body: JSON.stringify({}),
        }),
      );

      expect(response.status).toBe(400);
      const responsePayload = (await response.json()) as { error: { code: string; message: string } };
      expect(responsePayload.error).toEqual({
        code: 'BAD_REQUEST',
        message: 'Use /api/media/videos/base64 or /api/media/videos/download',
      });
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
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

  it('rejects remote media downloads with unsupported content types', async () => {
    const failureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-media-test-'));

    try {
      const failureApp = await createTestApp(failureDir, {
        mockRemoteBufferedResult: {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'text/html; charset=utf-8' },
          body: Buffer.from('<html>not media</html>', 'utf-8'),
          finalUrl: 'https://example.com/assets/not-media',
        },
      });
      const { payload } = await registerUser(failureApp, 'mediaunsupportedtype', 'debugpass001');

      const failedDownloadResponse = await failureApp.request(
        new Request('http://local/api/media/images/download', {
          method: 'POST',
          headers: authHeaders(payload.data.accessToken),
          body: JSON.stringify({ url: 'https://example.com/assets/not-media' }),
        }),
      );
      expect(failedDownloadResponse.status).toBe(400);
      const failedDownloadPayload = (await failedDownloadResponse.json()) as { error: { code: string; message: string } };
      expect(failedDownloadPayload.error).toEqual({
        code: 'BAD_REQUEST',
        message: 'Unsupported remote media type',
      });

      const listResponse = await failureApp.request(
        new Request('http://local/api/media/images', {
          headers: { Authorization: `Bearer ${payload.data.accessToken}` },
        }),
      );
      expect(await listResponse.json()).toEqual({ data: [] });
    } finally {
      fs.rmSync(failureDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects non-HTTPS remote media downloads before contacting upstream hosts', async () => {
    const failureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-media-test-'));

    try {
      const failureApp = await createTestApp(failureDir, {
        mockRemoteBufferedResult: new Error('HTTP upstream should not be requested'),
      });
      const { payload } = await registerUser(failureApp, 'mediahttpblock', 'debugpass001');

      const failedDownloadResponse = await failureApp.request(
        new Request('http://local/api/media/images/download', {
          method: 'POST',
          headers: authHeaders(payload.data.accessToken),
          body: JSON.stringify({ url: 'http://example.com/demo.png' }),
        }),
      );
      expect(failedDownloadResponse.status).toBe(400);
      const failedDownloadPayload = (await failedDownloadResponse.json()) as { error: { code: string; message: string } };
      expect(failedDownloadPayload.error).toEqual({
        code: 'BAD_REQUEST',
        message: 'Remote media URL must use HTTPS',
      });
    } finally {
      fs.rmSync(failureDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('returns a blocked-internal-network error for LAN image URLs', async () => {
    const failureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-media-test-'));

    try {
      const failureApp = await createTestApp(failureDir, {
        mockRemoteBufferedResult: new Error('Access to internal network addresses is not allowed'),
      });
      const { payload } = await registerUser(failureApp, 'medianetworkblock', 'debugpass001');

      const failedDownloadResponse = await failureApp.request(
        new Request('http://local/api/media/images/download', {
          method: 'POST',
          headers: authHeaders(payload.data.accessToken),
          body: JSON.stringify({ url: 'https://192.168.1.20/demo.png' }),
        }),
      );
      expect(failedDownloadResponse.status).toBe(400);
      const failedDownloadPayload = (await failedDownloadResponse.json()) as { error: { code: string; message: string } };
      expect(failedDownloadPayload.error).toEqual({
        code: 'BAD_REQUEST',
        message: 'Access to internal network addresses is not allowed',
      });
    } finally {
      fs.rmSync(failureDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('does not leave partial media files when base64 writes are interrupted', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-media-test-'));

    try {
      const app = await createTestApp(dataDir, {
        interruptMediaWrite: true,
      });
      const { payload } = await registerUser(app, 'mediapartialwrite', 'debugpass001');

      const uploadResponse = await app.request(
        new Request('http://local/api/media/images/base64', {
          method: 'POST',
          headers: authHeaders(payload.data.accessToken),
          body: JSON.stringify({
            fileName: 'partial.png',
            base64Data: Buffer.from('complete image bytes', 'utf-8').toString('base64'),
          }),
        }),
      );

      expect(uploadResponse.status).toBe(400);
      const uploadPayload = (await uploadResponse.json()) as { error: { code: string; message: string } };
      expect(uploadPayload.error).toEqual({
        code: 'BAD_REQUEST',
        message: 'simulated interrupted media write',
      });

      const listResponse = await app.request(
        new Request('http://local/api/media/images', {
          headers: { Authorization: `Bearer ${payload.data.accessToken}` },
        }),
      );
      expect(listResponse.status).toBe(200);
      const listPayload = (await listResponse.json()) as { data: string[] };
      expect(listPayload.data).toEqual([]);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);
});
