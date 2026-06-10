import type { MiddlewareHandler } from 'hono';
import { isSecureRequest } from '../utils/secure-request.js';

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
].join('; ');

export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    await next();

    c.header('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    c.header('Cross-Origin-Opener-Policy', 'same-origin');
    c.header('Cross-Origin-Resource-Policy', 'same-origin');
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');

    if (isSecureRequest(c)) {
      c.header(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
    }
  };
}
