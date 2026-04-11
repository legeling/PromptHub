import type { Context } from 'hono';
import { ErrorCode } from '../utils/response.js';

export function errorHandler(err: Error, c: Context): Response {
  const status = 'status' in err && typeof err.status === 'number' ? err.status : 500;

  if (process.env.NODE_ENV !== 'production') {
    console.error(`[ERROR] ${c.req.method} ${c.req.path}:`, err);
  } else {
    console.error(`[ERROR] ${c.req.method} ${c.req.path}: ${err.message}`);
  }

  const message =
    status === 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message;

  return c.json(
    {
      error: {
        code: status === 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST,
        message,
      },
    },
    status as 400 | 500,
  );
}
