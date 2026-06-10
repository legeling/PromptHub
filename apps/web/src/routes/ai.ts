import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import type { AITransportRequest, AITransportResponse } from '@prompthub/shared';
import { error, ErrorCode, success } from '../utils/response.js';
import { parseJsonBody } from '../utils/validation.js';
import { requestRemoteBuffered, requestRemoteStream } from '../utils/remote-http.js';

const ai = new Hono();
const MAX_AI_PROXY_REQUEST_BYTES = 10 * 1024 * 1024;
const MAX_AI_PROXY_BODY_CHARS = 8 * 1024 * 1024;
const MAX_AI_PROXY_URL_LENGTH = 2048;
const MAX_AI_PROXY_REQUEST_ID_LENGTH = 120;
const MAX_AI_PROXY_HEADERS = 64;
const MAX_AI_PROXY_HEADER_NAME_LENGTH = 128;
const MAX_AI_PROXY_HEADER_VALUE_LENGTH = 8192;

const BLOCKED_STREAM_RESPONSE_HEADERS = new Set([
  'connection',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'set-cookie',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function isHttpsAiProxyUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

const headerNamePattern = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u;

const requestHeadersSchema = z.record(z.string()).superRefine((headers, ctx) => {
  const entries = Object.entries(headers);
  if (entries.length > MAX_AI_PROXY_HEADERS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `headers must contain at most ${MAX_AI_PROXY_HEADERS} entries`,
    });
  }

  for (const [key, value] of entries) {
    if (
      key.length === 0 ||
      key.length > MAX_AI_PROXY_HEADER_NAME_LENGTH ||
      !headerNamePattern.test(key)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `header name must be a valid token up to ${MAX_AI_PROXY_HEADER_NAME_LENGTH} characters`,
      });
    }

    if (value.length > MAX_AI_PROXY_HEADER_VALUE_LENGTH || /[\u0000\r\n]/u.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `header value must be at most ${MAX_AI_PROXY_HEADER_VALUE_LENGTH} characters without line breaks`,
      });
    }
  }
});

const requestSchema = z.object({
  requestId: z
    .string()
    .trim()
    .min(1)
    .max(MAX_AI_PROXY_REQUEST_ID_LENGTH, `requestId must be at most ${MAX_AI_PROXY_REQUEST_ID_LENGTH} characters`)
    .optional(),
  method: z.enum(['GET', 'POST']),
  url: z
    .string()
    .trim()
    .url('url must be valid')
    .max(MAX_AI_PROXY_URL_LENGTH, `url must be at most ${MAX_AI_PROXY_URL_LENGTH} characters`)
    .refine(isHttpsAiProxyUrl, 'AI proxy URL must use HTTPS'),
  headers: requestHeadersSchema.optional(),
  body: z
    .string()
    .max(MAX_AI_PROXY_BODY_CHARS, `body must be at most ${MAX_AI_PROXY_BODY_CHARS} characters`)
    .optional(),
});

function rejectOversizedAiProxyRequest(c: Context): Response | null {
  const contentLength = c.req.header('content-length');
  if (!contentLength) {
    return null;
  }

  const byteLength = Number(contentLength);
  if (!Number.isFinite(byteLength) || byteLength < 0) {
    return error(c, 400, ErrorCode.BAD_REQUEST, 'Invalid Content-Length header');
  }

  if (byteLength > MAX_AI_PROXY_REQUEST_BYTES) {
    return error(c, 400, ErrorCode.BAD_REQUEST, 'AI proxy request body exceeds size limit');
  }

  return null;
}

async function parseAiRequestBody(c: Context): ReturnType<typeof parseJsonBody<typeof requestSchema>> {
  const oversizedResponse = rejectOversizedAiProxyRequest(c);
  if (oversizedResponse) {
    return {
      success: false,
      response: oversizedResponse,
    };
  }

  return parseJsonBody(c, requestSchema, {
    maxBytes: MAX_AI_PROXY_REQUEST_BYTES,
    maxBytesMessage: 'AI proxy request body exceeds size limit',
  });
}

function toTransportResponse(response: {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}): AITransportResponse {
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    statusText: response.statusText,
    body: response.body,
    headers: response.headers,
  };
}

function toErrorResponse(): AITransportResponse {
  return {
    ok: false,
    status: 0,
    statusText: '',
    body: '',
    headers: {},
    error: 'AI proxy request failed',
  };
}

async function streamToText(body: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!body) {
    return '';
  }

  return new Response(body).text();
}

async function executeBufferedRequest(request: AITransportRequest): Promise<AITransportResponse> {
  try {
    const response = await requestRemoteBuffered({
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: request.body,
      allowedProtocols: ['https:'],
    });

    return toTransportResponse({
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      body: response.body.toString('utf-8'),
    });
  } catch {
    return toErrorResponse();
  }
}

ai.post('/request', async (c) => {
  const parsed = await parseAiRequestBody(c);
  if (!parsed.success) {
    return parsed.response;
  }

  const response = await executeBufferedRequest(parsed.data);
  return success(c, response);
});

ai.post('/stream', async (c) => {
  const parsed = await parseAiRequestBody(c);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const response = await requestRemoteStream({
      url: parsed.data.url,
      method: parsed.data.method,
      headers: parsed.data.headers,
      body: parsed.data.body,
      allowedProtocols: ['https:'],
    });

    if (response.status < 200 || response.status >= 300 || !response.body) {
      return success(c, toTransportResponse({
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        body: await streamToText(response.body),
      }));
    }

    const headers = new Headers();
    headers.set('Content-Type', response.headers['content-type'] ?? 'text/event-stream; charset=utf-8');
    headers.set('Cache-Control', 'no-cache');
    headers.set('Connection', 'keep-alive');
    headers.set('X-PromptHub-Request-Id', parsed.data.requestId ?? '');

    for (const [key, value] of Object.entries(response.headers)) {
      const normalizedKey = key.toLowerCase();
      if (BLOCKED_STREAM_RESPONSE_HEADERS.has(normalizedKey)) {
        continue;
      }
      if (!headers.has(key) && value) {
        headers.set(key, value);
      }
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (routeError) {
    return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Internal server error');
  }
});

export default ai;
