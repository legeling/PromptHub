import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

const ENV_KEYS = ['JWT_SECRET', 'TRUST_PROXY_HEADERS'] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

async function createTestApp(options?: { trustProxyHeaders?: boolean }) {
  vi.resetModules();
  process.env.JWT_SECRET = 'test-secret-for-web-security-headers-1234567890';
  process.env.TRUST_PROXY_HEADERS = options?.trustProxyHeaders ? 'true' : 'false';
  const { securityHeaders } = await import('./security-headers.js');

  const app = new Hono();
  app.use('*', securityHeaders());
  app.get('/secure', (c) => c.json({ ok: true }));
  app.get('/health', (c) => c.json({ ok: true }));
  return app;
}

describe('securityHeaders', () => {
  afterEach(() => {
    vi.resetModules();
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('applies baseline hardening headers to responses', async () => {
    const app = await createTestApp();

    const response = await app.request('http://local/health');

    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin');
  });

  it('adds HSTS only for secure requests', async () => {
    const app = await createTestApp();

    const response = await app.request('https://local/secure');

    expect(response.headers.get('strict-transport-security')).toContain('max-age=31536000');
  });

  it('trusts forwarded proto for HSTS only when proxy headers are trusted', async () => {
    const untrustedApp = await createTestApp({ trustProxyHeaders: false });
    const untrustedResponse = await untrustedApp.request(
      new Request('http://local/secure', {
        headers: { 'x-forwarded-proto': 'https' },
      }),
    );
    expect(untrustedResponse.headers.get('strict-transport-security')).toBeNull();

    const trustedApp = await createTestApp({ trustProxyHeaders: true });
    const trustedResponse = await trustedApp.request(
      new Request('http://local/secure', {
        headers: { 'x-forwarded-proto': 'https, http' },
      }),
    );
    expect(trustedResponse.headers.get('strict-transport-security')).toContain('max-age=31536000');
  });
});
