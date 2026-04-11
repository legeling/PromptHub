import type { Context } from 'hono';

export interface Pagination {
  total: number;
  limit: number;
  offset: number;
}

export interface ApiError {
  code: string;
  message: string;
}

export function success<T>(c: Context, data: T, status: 200 | 201 = 200): Response {
  return c.json({ data }, status);
}

export function paginated<T>(
  c: Context,
  data: T,
  pagination: Pagination,
): Response {
  return c.json({ data, pagination }, 200);
}

export function error(
  c: Context,
  status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500,
  code: string,
  message: string,
): Response {
  return c.json({ error: { code, message } }, status);
}

export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
