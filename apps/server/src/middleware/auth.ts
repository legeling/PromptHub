import type { MiddlewareHandler } from 'hono';
import { jwtVerify } from 'jose';
import { config } from '../config.js';
import { ErrorCode } from '../utils/response.js';

export interface AuthPayload {
  userId: string;
}

export function getAuthUser(c: { get: (key: string) => unknown }): AuthPayload {
  const userId = c.get('userId') as string | undefined;
  if (!userId) {
    throw Object.assign(new Error('Not authenticated'), { status: 401 });
  }
  return { userId };
}

export function auth(): MiddlewareHandler {
  const secret = new TextEncoder().encode(config.jwt.secret);

  return async (c, next) => {
    const header = c.req.header('Authorization');
    if (!header?.startsWith('Bearer ')) {
      return c.json(
        { error: { code: ErrorCode.UNAUTHORIZED, message: 'Missing or invalid Authorization header' } },
        401,
      );
    }

    const token = header.slice(7);

    try {
      const { payload } = await jwtVerify(token, secret);

      if (typeof payload.sub !== 'string') {
        return c.json(
          { error: { code: ErrorCode.UNAUTHORIZED, message: 'Invalid token payload' } },
          401,
        );
      }

      c.set('userId', payload.sub);

      await next();
    } catch {
      return c.json(
        { error: { code: ErrorCode.UNAUTHORIZED, message: 'Token expired or invalid' } },
        401,
      );
    }
  };
}
