import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export enum ErrorCode {
  BAD_REQUEST = "BAD_REQUEST",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  NOT_FOUND = "NOT_FOUND",
  CONFLICT = "CONFLICT",
  NOT_IMPLEMENTED = "NOT_IMPLEMENTED",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

export function success<T>(c: Context, data: T, status = 200): Response {
  return c.json({ data }, status as ContentfulStatusCode);
}

export function paginated<T>(
  c: Context,
  data: T,
  pagination: { total: number; limit: number; offset: number },
): Response {
  return c.json({ data, pagination }, 200);
}

export function failure(c: Context, status: number, code: ErrorCode, message: string): Response {
  return c.json({ error: { code, message } }, status as ContentfulStatusCode);
}

export async function readJson<T = unknown>(c: Context): Promise<T> {
  try {
    return (await c.req.json()) as T;
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}
