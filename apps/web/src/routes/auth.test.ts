import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase } from '@prompthub/db';
import { resetRateLimits } from '../services/auth-rate-limit';
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
  'TRUST_PROXY_HEADERS',
  'AUTH_CAPTCHA_ENABLED',
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function getSetCookieHeaders(response: Response): string[] {
  const getSetCookie = Reflect.get(response.headers, 'getSetCookie');
  if (typeof getSetCookie === 'function') {
    const values = getSetCookie.call(response.headers) as unknown;
    return Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string') : [];
  }

  const singleHeader = response.headers.get('set-cookie');
  return singleHeader ? [singleHeader] : [];
}

async function createTestApp(
  dataDir: string,
  options?: {
    allowRegistration?: boolean;
    authCaptchaEnabled?: boolean;
    trustProxyHeaders?: boolean;
  },
) {
  process.env.PORT = '3997';
  process.env.HOST = '127.0.0.1';
  process.env.JWT_SECRET = 'test-secret-for-web-auth-flow-1234567890';
  process.env.JWT_ACCESS_TTL = '900';
  process.env.JWT_REFRESH_TTL = '604800';
  process.env.DATA_ROOT = dataDir;
  process.env.ALLOW_REGISTRATION = options?.allowRegistration === false ? 'false' : 'true';
  process.env.LOG_LEVEL = 'debug';
  process.env.TRUST_PROXY_HEADERS = options?.trustProxyHeaders ? 'true' : 'false';
  process.env.AUTH_CAPTCHA_ENABLED = options?.authCaptchaEnabled === false ? 'false' : 'true';

  const [{ createApp }] = await Promise.all([
    import('../app'),
  ]);

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

  const payload = await response.json() as {
    data: {
      user: { id: string; username: string; role: 'admin' | 'user' };
      accessToken: string;
      refreshToken: string;
    };
  };

  return { response, payload };
}

async function loginUser(app: Awaited<ReturnType<typeof createTestApp>>, username: string, password: string) {
  const captcha = await issueSolvedCaptcha(app);
  const response = await app.request(
    new Request('http://local/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, ...captcha }),
    }),
  );

  const payload = await response.json() as {
    data: {
      user: { id: string; username: string; role: 'admin' | 'user' };
      accessToken: string;
      refreshToken: string;
    };
  };

  return { response, payload };
}

function streamedJsonRequest(url: string, body: string, headers: HeadersInit = {}): Request {
  return new Request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    }),
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

describe('web auth routes', () => {
  const TEST_TIMEOUT = 20000;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    closeDatabase();
    resetRateLimits();
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('reports bootstrap status before and after the first user is created', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-auth-test-'));

    try {
      const app = await createTestApp(dataDir, { allowRegistration: false });

      const beforeResponse = await app.request('http://local/api/auth/bootstrap');
      expect(beforeResponse.status).toBe(200);
      const beforePayload = await beforeResponse.json() as {
        data: {
          captchaEnabled: boolean;
          initialized: boolean;
          registrationAllowed: boolean;
        };
      };

      expect(beforePayload.data.initialized).toBe(false);
      expect(beforePayload.data.registrationAllowed).toBe(true);
      expect(beforePayload.data.captchaEnabled).toBe(true);

      await registerUser(app, 'bootstrapadmin', 'debugpass001');

      const afterResponse = await app.request('http://local/api/auth/bootstrap');
      expect(afterResponse.status).toBe(200);
      const afterPayload = await afterResponse.json() as {
        data: {
          initialized: boolean;
          registrationAllowed: boolean;
        };
      };

      expect(afterPayload.data.initialized).toBe(true);
      expect(afterPayload.data.registrationAllowed).toBe(false);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('keeps public auth endpoints outside the protected API middleware', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-auth-test-'));

    try {
      const app = await createTestApp(dataDir);
      const headers = { Authorization: 'Bearer malformed-token' };

      const bootstrapResponse = await app.request(
        new Request('http://local/api/auth/bootstrap', { headers }),
      );
      expect(bootstrapResponse.status).toBe(200);
      const bootstrapPayload = await bootstrapResponse.json() as {
        data: { initialized: boolean; registrationAllowed: boolean };
      };
      expect(bootstrapPayload.data.initialized).toBe(false);

      const captchaResponse = await app.request(
        new Request('http://local/api/auth/captcha', { headers }),
      );
      expect(captchaResponse.status).toBe(200);
      const captchaPayload = await captchaResponse.json() as {
        data: { captchaId: string; imageData: string };
      };
      expect(captchaPayload.data.captchaId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(captchaPayload.data.imageData).toMatch(/^data:image\/svg\+xml;base64,/);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('registers the first user as admin and allows login afterward', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-auth-test-'));

    try {
      const app = await createTestApp(dataDir);

      const registerResponse = await app.request(
        new Request('http://local/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'firstadmin',
            password: 'debugpass001',
            ...(await issueSolvedCaptcha(app)),
          }),
        }),
      );

      expect(registerResponse.status).toBe(201);
      const registerPayload = await registerResponse.json() as {
        data: {
          user: { role: 'admin' | 'user'; username: string };
          accessToken: string;
          refreshToken: string;
        };
      };

      expect(registerPayload.data.user.username).toBe('firstadmin');
      expect(registerPayload.data.user.role).toBe('admin');
      expect(registerPayload.data.accessToken.length).toBeGreaterThan(0);
      expect(registerPayload.data.refreshToken.length).toBeGreaterThan(0);

      const loginResponse = await app.request(
        new Request('http://local/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'firstadmin',
            password: 'debugpass001',
            ...(await issueSolvedCaptcha(app)),
          }),
        }),
      );

      expect(loginResponse.status).toBe(200);
      const loginPayload = await loginResponse.json() as {
        data: {
          user: { role: 'admin' | 'user'; username: string };
          accessToken: string;
          refreshToken: string;
        };
      };

      expect(loginPayload.data.user.username).toBe('firstadmin');
      expect(loginPayload.data.user.role).toBe('admin');
      expect(loginPayload.data.accessToken.length).toBeGreaterThan(0);
      expect(loginPayload.data.refreshToken.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('returns conflict when registering a duplicate username', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-auth-test-'));

    try {
      const app = await createTestApp(dataDir);

      await app.request(
        new Request('http://local/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'duplicateuser',
            password: 'debugpass001',
            ...(await issueSolvedCaptcha(app)),
          }),
        }),
      );

      const duplicateResponse = await app.request(
        new Request('http://local/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'duplicateuser',
            password: 'debugpass001',
            ...(await issueSolvedCaptcha(app)),
          }),
        }),
      );

      expect(duplicateResponse.status).toBe(409);
      const duplicatePayload = await duplicateResponse.json() as {
        error: { code: string; message: string };
      };

      expect(duplicatePayload.error.code).toBe('CONFLICT');
      expect(duplicatePayload.error.message).toContain('Username already exists');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('returns validation error for usernames shorter than three characters', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-auth-test-'));

    try {
      const app = await createTestApp(dataDir);

      const response = await app.request(
        new Request('http://local/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'ab',
            password: 'debugpass001',
            ...(await issueSolvedCaptcha(app)),
          }),
        }),
      );

      expect(response.status).toBe(422);
      const payload = await response.json() as {
        error: { code: string; message: string };
      };

      expect(payload.error.code).toBe('VALIDATION_ERROR');
      expect(payload.error.message).toContain('username: username must be at least 3 characters');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects login with a wrong password', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-auth-test-'));

    try {
      const app = await createTestApp(dataDir);
      await registerUser(app, 'wrongpassuser', 'debugpass001');

      const response = await app.request(
        new Request('http://local/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'wrongpassuser',
            password: 'wrongpass999',
            ...(await issueSolvedCaptcha(app)),
          }),
        }),
      );

      expect(response.status).toBe(401);
      const payload = await response.json() as { error: { code: string; message: string } };
      expect(payload.error.code).toBe('UNAUTHORIZED');
      expect(payload.error.message).toBe('Invalid username or password');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rate limits repeated failed logins to slow brute-force attempts', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-auth-test-'));

    try {
      const app = await createTestApp(dataDir);
      await registerUser(app, 'ratelimituser', 'debugpass001');

      for (let index = 0; index < 5; index++) {
        const captcha = await issueSolvedCaptcha(app, {
          headers: { 'x-real-ip': '203.0.113.10' },
        });
        const response = await app.request(
          new Request('http://local/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-real-ip': '203.0.113.10' },
            body: JSON.stringify({ username: 'ratelimituser', password: 'wrongpass999', ...captcha }),
          }),
        );

        expect(response.status).toBe(401);
      }

      const captcha = await issueSolvedCaptcha(app, {
        headers: { 'x-real-ip': '203.0.113.10' },
      });
      const blockedResponse = await app.request(
        new Request('http://local/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-real-ip': '203.0.113.10' },
          body: JSON.stringify({ username: 'ratelimituser', password: 'wrongpass999', ...captcha }),
        }),
      );

      expect(blockedResponse.status).toBe(429);
      expect(Number(blockedResponse.headers.get('Retry-After'))).toBeGreaterThan(0);
      const payload = await blockedResponse.json() as { error: { code: string; message: string } };
      expect(payload.error.code).toBe('RATE_LIMITED');
      expect(payload.error.message).toContain('Too many login attempts');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('does not let spoofed forwarded headers bypass login rate limits', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-auth-test-'));

    try {
      const app = await createTestApp(dataDir);
      await registerUser(app, 'spooflimituser', 'debugpass001');

      for (let index = 0; index < 5; index++) {
        const headers = { 'x-forwarded-for': `198.51.100.${index + 1}` };
        const captcha = await issueSolvedCaptcha(app, { headers });
        const response = await app.request(
          new Request('http://local/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({ username: 'spooflimituser', password: 'wrongpass999', ...captcha }),
          }),
        );

        expect(response.status).toBe(401);
      }

      const blockedHeaders = { 'x-forwarded-for': '198.51.100.250' };
      const captcha = await issueSolvedCaptcha(app, { headers: blockedHeaders });
      const blockedResponse = await app.request(
        new Request('http://local/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...blockedHeaders },
          body: JSON.stringify({ username: 'spooflimituser', password: 'wrongpass999', ...captcha }),
        }),
      );

      expect(blockedResponse.status).toBe(429);
      const payload = await blockedResponse.json() as { error: { code: string; message: string } };
      expect(payload.error.code).toBe('RATE_LIMITED');
      expect(payload.error.message).toContain('Too many login attempts');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('uses forwarded headers for auth rate limits only when trusted proxy mode is enabled', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-auth-test-'));

    try {
      const app = await createTestApp(dataDir, { trustProxyHeaders: true });
      await registerUser(app, 'trustedproxyuser', 'debugpass001');

      for (let index = 0; index < 5; index++) {
        const headers = { 'x-forwarded-for': '198.51.100.10, 10.0.0.1' };
        const captcha = await issueSolvedCaptcha(app, { headers });
        const response = await app.request(
          new Request('http://local/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({ username: 'trustedproxyuser', password: 'wrongpass999', ...captcha }),
          }),
        );

        expect(response.status).toBe(401);
      }

      const sameClientCaptcha = await issueSolvedCaptcha(app, {
        headers: { 'x-forwarded-for': '198.51.100.10, 10.0.0.1' },
      });
      const sameClientResponse = await app.request(
        new Request('http://local/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.10, 10.0.0.1' },
          body: JSON.stringify({ username: 'trustedproxyuser', password: 'wrongpass999', ...sameClientCaptcha }),
        }),
      );
      expect(sameClientResponse.status).toBe(429);

      const differentClientCaptcha = await issueSolvedCaptcha(app, {
        headers: { 'x-forwarded-for': '198.51.100.11, 10.0.0.1' },
      });
      const differentClientResponse = await app.request(
        new Request('http://local/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.11, 10.0.0.1' },
          body: JSON.stringify({ username: 'trustedproxyuser', password: 'wrongpass999', ...differentClientCaptcha }),
        }),
      );
      expect(differentClientResponse.status).toBe(401);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('marks auth responses as no-store', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-auth-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { response } = await registerUser(app, 'nostoreuser', 'debugpass001');

      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('pragma')).toBe('no-cache');
      const cookies = getSetCookieHeaders(response).join('\n');
      expect(cookies).toContain('prompthub_access=');
      expect(cookies).toContain('prompthub_refresh=');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('marks auth cookies as secure for trusted proxy HTTPS requests', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-auth-proxy-cookie-test-'));

    try {
      const app = await createTestApp(dataDir, { trustProxyHeaders: true });
      const proxyHeaders = { 'x-forwarded-proto': 'https, http' };
      const captcha = await issueSolvedCaptcha(app, { headers: proxyHeaders });
      const response = await app.request(
        new Request('http://local/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...proxyHeaders },
          body: JSON.stringify({ username: 'secureproxycookie', password: 'debugpass001', ...captcha }),
        }),
      );

      expect(response.status).toBe(201);
      const cookies = getSetCookieHeaders(response);
      expect(cookies).toHaveLength(2);
      expect(cookies.every((cookie) => /;\s*Secure(?:;|$)/i.test(cookie))).toBe(true);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects login when captcha is missing', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-auth-test-'));

    try {
      const app = await createTestApp(dataDir);
      await registerUser(app, 'captchalessuser', 'debugpass001');

      const response = await app.request(
        new Request('http://local/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'captchalessuser', password: 'debugpass001' }),
        }),
      );

      expect(response.status).toBe(422);
      const payload = await response.json() as { error: { code: string; message: string } };
      expect(payload.error.code).toBe('VALIDATION_ERROR');
      expect(payload.error.message).toContain('captchaId');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('allows setup and login without captcha when captcha is disabled', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-auth-test-'));

    try {
      const app = await createTestApp(dataDir, { authCaptchaEnabled: false });

      const bootstrapResponse = await app.request('http://local/api/auth/bootstrap');
      expect(bootstrapResponse.status).toBe(200);
      const bootstrapPayload = await bootstrapResponse.json() as {
        data: {
          captchaEnabled: boolean;
          initialized: boolean;
          registrationAllowed: boolean;
        };
      };
      expect(bootstrapPayload.data).toMatchObject({
        captchaEnabled: false,
        initialized: false,
        registrationAllowed: true,
      });

      const registerResponse = await app.request(
        new Request('http://local/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'nocaptchaadmin',
            password: 'debugpass001',
          }),
        }),
      );
      expect(registerResponse.status).toBe(201);

      const loginResponse = await app.request(
        new Request('http://local/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'nocaptchaadmin',
            password: 'debugpass001',
          }),
        }),
      );
      expect(loginResponse.status).toBe(200);
      const loginPayload = await loginResponse.json() as {
        data: { user: { username: string } };
      };
      expect(loginPayload.data.user.username).toBe('nocaptchaadmin');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects reused captcha challenges', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-auth-test-'));

    try {
      const app = await createTestApp(dataDir);
      await registerUser(app, 'singleuseuser', 'debugpass001');
      const captcha = await issueSolvedCaptcha(app);

      const firstResponse = await app.request(
        new Request('http://local/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'singleuseuser',
            password: 'wrongpass999',
            ...captcha,
          }),
        }),
      );
      expect(firstResponse.status).toBe(401);

      const secondResponse = await app.request(
        new Request('http://local/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'singleuseuser',
            password: 'debugpass001',
            ...captcha,
          }),
        }),
      );

      expect(secondResponse.status).toBe(422);
      const payload = await secondResponse.json() as { error: { code: string; message: string } };
      expect(payload.error.code).toBe('VALIDATION_ERROR');
      expect(payload.error.message).toBe('Captcha challenge is missing or expired');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('accepts access tokens from HttpOnly cookies for authenticated routes', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-auth-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { response } = await registerUser(app, 'cookieuser01', 'debugpass001');
      const cookieHeader = getSetCookieHeaders(response)
        .map((value) => value.split(';', 1)[0])
        .join('; ');

      const meResponse = await app.request(
        new Request('http://local/api/auth/me', {
          headers: { Cookie: cookieHeader },
        }),
      );

      expect(meResponse.status).toBe(200);
      const payload = await meResponse.json() as {
        data: { username: string };
      };
      expect(payload.data.username).toBe('cookieuser01');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('returns current user for GET /me with a valid access token', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-auth-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'meuser001', 'debugpass001');

      const response = await app.request(
        new Request('http://local/api/auth/me', {
          headers: { Authorization: `Bearer ${registerPayload.data.accessToken}` },
        }),
      );

      expect(response.status).toBe(200);
      const payload = await response.json() as {
        data: { id: string; username: string; role: 'admin' | 'user' };
      };
      expect(payload.data.username).toBe('meuser001');
      expect(payload.data.role).toBe('admin');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rotates refresh tokens and rejects a consumed refresh token', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-auth-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'refreshuser', 'debugpass001');

      const refreshResponse = await app.request(
        new Request('http://local/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: registerPayload.data.refreshToken }),
        }),
      );

      expect(refreshResponse.status).toBe(200);
      const refreshPayload = await refreshResponse.json() as {
        data: { accessToken: string; refreshToken: string };
      };
      expect(refreshPayload.data.accessToken.length).toBeGreaterThan(0);
      expect(refreshPayload.data.refreshToken).not.toBe(registerPayload.data.refreshToken);

      const reusedResponse = await app.request(
        new Request('http://local/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: registerPayload.data.refreshToken }),
        }),
      );

      expect(reusedResponse.status).toBe(401);
      const reusedPayload = await reusedResponse.json() as { error: { code: string } };
      expect(reusedPayload.error.code).toBe('UNAUTHORIZED');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects oversized optional auth bodies before refreshing tokens', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-auth-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'refreshoversize', 'debugpass001');

      const oversizedResponse = await app.request(
        new Request('http://local/api/auth/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': String(1024 * 1024 + 1),
          },
          body: JSON.stringify({ refreshToken: registerPayload.data.refreshToken }),
        }),
      );

      expect(oversizedResponse.status).toBe(400);
      const oversizedPayload = await oversizedResponse.json() as { error: { code: string; message: string } };
      expect(oversizedPayload.error).toEqual({
        code: 'BAD_REQUEST',
        message: 'Auth request body exceeds size limit',
      });

      const invalidLengthResponse = await app.request(
        new Request('http://local/api/auth/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': 'not-a-number',
          },
          body: JSON.stringify({ refreshToken: registerPayload.data.refreshToken }),
        }),
      );
      expect(invalidLengthResponse.status).toBe(400);
      const invalidLengthPayload = await invalidLengthResponse.json() as { error: { code: string; message: string } };
      expect(invalidLengthPayload.error).toEqual({
        code: 'BAD_REQUEST',
        message: 'Invalid Content-Length header',
      });

      const streamedOversizedResponse = await app.request(
        streamedJsonRequest(
          'http://local/api/auth/refresh',
          JSON.stringify({
            refreshToken: registerPayload.data.refreshToken,
            padding: 'x'.repeat(1024 * 1024 + 1),
          }),
        ),
      );
      expect(streamedOversizedResponse.status).toBe(400);
      const streamedOversizedPayload = await streamedOversizedResponse.json() as {
        error: { code: string; message: string };
      };
      expect(streamedOversizedPayload.error).toEqual({
        code: 'BAD_REQUEST',
        message: 'Auth request body exceeds size limit',
      });

      const refreshResponse = await app.request(
        new Request('http://local/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: registerPayload.data.refreshToken }),
        }),
      );
      expect(refreshResponse.status).toBe(200);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects oversized auth JSON bodies before parsing credentials', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-auth-test-'));

    try {
      const app = await createTestApp(dataDir);
      const oversizedRegisterResponse = await app.request(
        new Request('http://local/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': String(1024 * 1024 + 1),
          },
          body: '{',
        }),
      );

      expect(oversizedRegisterResponse.status).toBe(400);
      const oversizedRegisterPayload = await oversizedRegisterResponse.json() as {
        error: { code: string; message: string };
      };
      expect(oversizedRegisterPayload.error).toEqual({
        code: 'BAD_REQUEST',
        message: 'Auth request body exceeds size limit',
      });

      const streamedOversizedRegisterResponse = await app.request(
        streamedJsonRequest(
          'http://local/api/auth/register',
          JSON.stringify({
            username: 'streamedoversize',
            password: 'debugpass001',
            captchaId: '00000000-0000-0000-0000-000000000000',
            captchaAnswer: 'abcd',
            padding: 'x'.repeat(1024 * 1024 + 1),
          }),
        ),
      );
      expect(streamedOversizedRegisterResponse.status).toBe(400);
      const streamedOversizedRegisterPayload = await streamedOversizedRegisterResponse.json() as {
        error: { code: string; message: string };
      };
      expect(streamedOversizedRegisterPayload.error).toEqual({
        code: 'BAD_REQUEST',
        message: 'Auth request body exceeds size limit',
      });

      const { payload: registerPayload } = await registerUser(app, 'authbodysize', 'debugpass001');
      const oversizedPasswordResponse = await app.request(
        new Request('http://local/api/auth/password', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${registerPayload.data.accessToken}`,
            'Content-Length': String(1024 * 1024 + 1),
          },
          body: '{',
        }),
      );

      expect(oversizedPasswordResponse.status).toBe(400);
      const oversizedPasswordPayload = await oversizedPasswordResponse.json() as {
        error: { code: string; message: string };
      };
      expect(oversizedPasswordPayload.error).toEqual({
        code: 'BAD_REQUEST',
        message: 'Auth request body exceeds size limit',
      });

      const loginResponse = await loginUser(app, 'authbodysize', 'debugpass001');
      expect(loginResponse.response.status).toBe(200);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('rejects GET /me without an authorization header', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-auth-test-'));

    try {
      const app = await createTestApp(dataDir);

      const response = await app.request(new Request('http://local/api/auth/me'));

      expect(response.status).toBe(401);
      const payload = await response.json() as { error: { code: string; message: string } };
      expect(payload.error.code).toBe('UNAUTHORIZED');
      expect(payload.error.message).toBe('Missing or invalid Authorization header');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('blocks additional registrations when registration is disabled after bootstrap', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-auth-test-'));

    try {
      const bootstrapApp = await createTestApp(dataDir);
      const { response: bootstrapResponse } = await registerUser(bootstrapApp, 'bootstrapadmin', 'debugpass001');
      expect(bootstrapResponse.status).toBe(201);

      closeDatabase();
      vi.resetModules();

      const lockedApp = await createTestApp(dataDir, { allowRegistration: false });
      const response = await lockedApp.request(
        new Request('http://local/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'blockeduser',
            password: 'debugpass001',
            ...(await issueSolvedCaptcha(lockedApp)),
          }),
        }),
      );

      expect(response.status).toBe(403);
      const payload = await response.json() as { error: { code: string; message: string } };
      expect(payload.error.code).toBe('FORBIDDEN');
      expect(payload.error.message).toBe('Registration is disabled');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('logout invalidates the refresh token', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-auth-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'logoutuser', 'debugpass001');

      const logoutResponse = await app.request(
        new Request('http://local/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${registerPayload.data.accessToken}`,
          },
          body: JSON.stringify({ refreshToken: registerPayload.data.refreshToken }),
        }),
      );

      expect(logoutResponse.status).toBe(200);

      const refreshAfterLogout = await app.request(
        new Request('http://local/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: registerPayload.data.refreshToken }),
        }),
      );

      expect(refreshAfterLogout.status).toBe(401);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);

  it('changes password and rejects the old password afterward', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-auth-test-'));

    try {
      const app = await createTestApp(dataDir);
      const { payload: registerPayload } = await registerUser(app, 'passworduser', 'debugpass001');

      const changeResponse = await app.request(
        new Request('http://local/api/auth/password', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${registerPayload.data.accessToken}`,
          },
          body: JSON.stringify({ currentPassword: 'debugpass001', newPassword: 'debugpass002' }),
        }),
      );

      expect(changeResponse.status).toBe(200);

      const oldLogin = await app.request(
        new Request('http://local/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'passworduser',
            password: 'debugpass001',
            ...(await issueSolvedCaptcha(app)),
          }),
        }),
      );
      expect(oldLogin.status).toBe(401);

      const { response: newLogin } = await loginUser(app, 'passworduser', 'debugpass002');
      expect(newLogin.status).toBe(200);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);
});
