import type { MiddlewareHandler } from 'hono';

export function logger(): MiddlewareHandler {
  return async (c, next) => {
    const start = Date.now();
    const { method, path } = c.req;

    await next();

    const ms = Date.now() - start;
    const status = c.res.status;
    const level = status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO';

    console.log(`[${level}] ${method} ${path} → ${status} (${ms}ms)`);
  };
}
