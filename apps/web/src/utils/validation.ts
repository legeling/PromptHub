import type { Context } from 'hono';
import { z } from 'zod';
import { error, ErrorCode } from './response.js';

const DEFAULT_JSON_BODY_MAX_BYTES = 1024 * 1024;

interface RequestBodyLimitOptions {
  maxBytes?: number;
  maxBytesMessage?: string;
}

export async function readRequestBytesBody(
  c: Context,
  options: RequestBodyLimitOptions = {},
): Promise<
  | { success: true; bytes: Uint8Array }
  | { success: false; response: Response }
> {
  const maxBytes = options.maxBytes ?? DEFAULT_JSON_BODY_MAX_BYTES;
  const maxBytesMessage = options.maxBytesMessage ?? 'Request body exceeds size limit';
  const contentLength = c.req.header('content-length');

  if (contentLength) {
    const byteLength = Number(contentLength);
    if (!Number.isFinite(byteLength) || byteLength < 0) {
      return {
        success: false,
        response: error(c, 400, ErrorCode.BAD_REQUEST, 'Invalid Content-Length header'),
      };
    }

    if (byteLength > maxBytes) {
      return {
        success: false,
        response: error(c, 400, ErrorCode.BAD_REQUEST, maxBytesMessage),
      };
    }
  }

  const body = c.req.raw.body;
  if (!body) {
    return { success: true, bytes: new Uint8Array() };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    const chunk = value instanceof Uint8Array
      ? value
      : new Uint8Array(value as ArrayBuffer);
    receivedBytes += chunk.byteLength;
    if (receivedBytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return {
        success: false,
        response: error(c, 400, ErrorCode.BAD_REQUEST, maxBytesMessage),
      };
    }

    chunks.push(chunk);
  }

  return {
    success: true,
    bytes: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), receivedBytes),
  };
}

export async function readRequestTextBody(
  c: Context,
  options: RequestBodyLimitOptions = {},
): Promise<
  | { success: true; text: string }
  | { success: false; response: Response }
> {
  const body = await readRequestBytesBody(c, options);
  if (!body.success) {
    return body;
  }

  return {
    success: true,
    text: new TextDecoder().decode(body.bytes),
  };
}

export async function parseJsonBody<T extends z.ZodTypeAny>(
  c: Context,
  schema: T,
  options: RequestBodyLimitOptions = {},
): Promise<
  | { success: true; data: z.infer<T> }
  | { success: false; response: Response }
> {
  const rawBody = await readRequestTextBody(c, options);
  if (!rawBody.success) {
    return rawBody;
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody.text);
  } catch {
    return {
      success: false,
      response: error(c, 400, ErrorCode.BAD_REQUEST, 'Invalid JSON request body'),
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join('; ');

    return {
      success: false,
      response: error(c, 422, ErrorCode.VALIDATION_ERROR, message),
    };
  }

  return {
    success: true,
    data: parsed.data,
  };
}
