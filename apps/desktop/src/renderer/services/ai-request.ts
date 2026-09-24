import type {
  AITransportMultipartBody,
  AITransportResponse,
} from "@prompthub/shared/types";
import { AI_REQUEST_TIMEOUT_MS } from "@prompthub/shared/constants/ai";

export interface ResponseLike {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  text: () => Promise<string>;
  json: <T = unknown>() => Promise<T>;
  error?: string;
}

export function getAITransport() {
  if (typeof window === "undefined") return null;
  return window.api?.ai ?? null;
}

export function createResponseLike(
  response: AITransportResponse,
): ResponseLike {
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    text: async () => response.body,
    json: async <T = unknown>() => JSON.parse(response.body) as T,
    error: response.error,
  };
}

export function createFetchResponseLike(
  response: Response,
  body: string,
): ResponseLike {
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    text: async () => body,
    json: async <T = unknown>() => JSON.parse(body) as T,
  };
}

export async function requestAIEndpoint(request: {
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: string;
  multipart?: AITransportMultipartBody;
  timeoutMs?: number;
}): Promise<ResponseLike> {
  const timeoutMs = request.timeoutMs ?? AI_REQUEST_TIMEOUT_MS;
  const normalizedRequest = { ...request, timeoutMs };
  const transport = getAITransport();
  if (transport) {
    return createResponseLike(await transport.request(normalizedRequest));
  }

  if (request.body !== undefined && request.multipart) {
    throw new Error(
      "AI request body and multipart body are mutually exclusive",
    );
  }
  const form = request.multipart ? new FormData() : undefined;
  if (form && request.multipart) {
    for (const [name, value] of Object.entries(request.multipart.fields)) {
      form.append(name, value);
    }
    for (const file of request.multipart.files) {
      const binary = atob(file.base64);
      const bytes = Uint8Array.from(binary, (character) =>
        character.charCodeAt(0),
      );
      form.append(
        file.fieldName,
        new Blob([bytes], { type: file.mimeType }),
        file.fileName,
      );
    }
  }
  const headers = form
    ? Object.fromEntries(
        Object.entries(request.headers).filter(
          ([name]) => name.toLowerCase() !== "content-type",
        ),
      )
    : request.headers;
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(new Error(`Request timeout after ${timeoutMs}ms`)),
    timeoutMs,
  );
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers,
      body: form ?? request.body,
      signal: controller.signal,
    });
    return createFetchResponseLike(response, await response.text());
  } finally {
    clearTimeout(timeoutId);
  }
}

function getResponseHeader(
  headers: Record<string, string>,
  name: string,
): string {
  const lowerName = name.toLowerCase();
  const match = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === lowerName,
  );
  return match?.[1] ?? "";
}

function isHtmlErrorPayload(
  text: string,
  headers: Record<string, string>,
): boolean {
  const contentType = getResponseHeader(headers, "content-type").toLowerCase();
  const trimmed = text.trimStart().toLowerCase();
  return (
    contentType.includes("text/html") ||
    trimmed.startsWith("<!doctype html") ||
    trimmed.startsWith("<html")
  );
}

function extractHtmlTitle(text: string): string | null {
  const match = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.replace(/\s+/g, " ").trim() || null;
}

function parseStructuredErrorMessage(text: string): string | null {
  try {
    const errorJson = JSON.parse(text);
    const message =
      errorJson.error?.message ||
      errorJson.error?.status ||
      errorJson.error?.type ||
      errorJson.message ||
      errorJson.detail ||
      (typeof errorJson.error === "string" ? errorJson.error : null);

    if (!message) return null;
    if (errorJson.error?.code) {
      return `${message} (code: ${errorJson.error.code})`;
    }
    if (errorJson.error?.type && errorJson.error.type !== message) {
      return `[${errorJson.error.type}] ${message}`;
    }
    return message;
  } catch {
    return null;
  }
}

export async function getFormattedErrorMessageFromResponse(
  response: ResponseLike,
  options: {
    operation?: string;
    fallback?: string;
    maxTextLength?: number;
  } = {},
): Promise<string> {
  const errorText = response.error ?? (await response.text());
  const operation = options.operation ?? "API request";
  const fallback = options.fallback ?? `API 请求失败 (${response.status})`;

  if (response.status === 504) {
    return `${operation} gateway timed out (${response.status}). The provider or proxy did not finish before its own timeout.`;
  }

  const structuredMessage = parseStructuredErrorMessage(errorText);
  if (structuredMessage) return structuredMessage;

  if (errorText && isHtmlErrorPayload(errorText, response.headers)) {
    const title = extractHtmlTitle(errorText);
    return title ? `${fallback}: ${title}` : fallback;
  }

  return errorText
    ? errorText.slice(0, options.maxTextLength ?? 200)
    : fallback;
}

export function getErrorMessageFromResponse(
  response: ResponseLike,
): Promise<string> {
  return getFormattedErrorMessageFromResponse(response);
}

export function isGptImageModel(model: string): boolean {
  return model.trim().toLowerCase().startsWith("gpt-image-");
}
