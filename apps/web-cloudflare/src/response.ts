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

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface ReadJsonOptions {
  maxBytes?: number;
}

async function readRequestBodyWithinLimit(
  c: Context,
  maxBytes: number,
): Promise<string> {
  const body = c.req.raw.body;
  if (!body) {
    return "";
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      const chunk = result.value;
      if (!chunk) {
        continue;
      }
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel("Request body exceeds the size limit");
        } catch {
          // Preserve the deterministic size-limit response even if cancellation fails.
        }
        throw new HttpError(
          413,
          ErrorCode.BAD_REQUEST,
          "Request body exceeds the size limit",
        );
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  const bodyBytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes);
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

export function failure(
  c: Context,
  status: number,
  code: ErrorCode,
  message: string,
): Response {
  return c.json({ error: { code, message } }, status as ContentfulStatusCode);
}

export async function readJson<T = unknown>(
  c: Context,
  options?: ReadJsonOptions,
): Promise<T> {
  try {
    if (options?.maxBytes !== undefined) {
      const contentLength = c.req.header("content-length");
      if (contentLength !== undefined) {
        const normalizedLength = contentLength.trim();
        const parsedLength = Number(normalizedLength);
        if (
          !/^\d+$/u.test(normalizedLength) ||
          !Number.isSafeInteger(parsedLength)
        ) {
          throw new HttpError(
            400,
            ErrorCode.BAD_REQUEST,
            "Invalid Content-Length header",
          );
        }
        if (parsedLength > options.maxBytes) {
          throw new HttpError(
            413,
            ErrorCode.BAD_REQUEST,
            "Request body exceeds the size limit",
          );
        }
      }
      return JSON.parse(
        await readRequestBodyWithinLimit(c, options.maxBytes),
      ) as T;
    }
    return (await c.req.json()) as T;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(
      400,
      ErrorCode.BAD_REQUEST,
      "Request body must be valid JSON",
    );
  }
}
