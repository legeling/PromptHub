import { ipcMain } from "electron";

import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import { AI_REQUEST_TIMEOUT_MS } from "@prompthub/shared/constants/ai";
import type {
  AITransportRequest,
  AITransportResponse,
} from "@prompthub/shared/types";
import { fetchWithNetworkProxy } from "../services/network-proxy";

const MAX_MULTIPART_FILES = 4;
const MAX_MULTIPART_FILE_BYTES = 20 * 1024 * 1024;
const MAX_MULTIPART_BASE64_LENGTH = Math.ceil(MAX_MULTIPART_FILE_BYTES / 3) * 4;
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const ALLOWED_MULTIPART_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function normalizeHeaders(
  headers?: Record<string, string>,
  omitContentType = false,
): HeadersInit | undefined {
  if (!headers) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([key, value]) =>
        value != null &&
        (!omitContentType || key.toLowerCase() !== "content-type"),
    ),
  );
}

function decodeMultipartFile(base64: string): Buffer {
  if (
    !base64 ||
    base64.length > MAX_MULTIPART_BASE64_LENGTH ||
    !BASE64_PATTERN.test(base64)
  ) {
    throw new Error("Invalid multipart image payload");
  }
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0 || bytes.length > MAX_MULTIPART_FILE_BYTES) {
    throw new Error("Invalid multipart image payload size");
  }
  return bytes;
}

function buildMultipartBody(request: AITransportRequest): FormData | undefined {
  if (!request.multipart) return undefined;
  if (request.body !== undefined) {
    throw new Error(
      "AI request body and multipart body are mutually exclusive",
    );
  }
  const fields = Object.entries(request.multipart.fields);
  if (fields.length > 16) throw new Error("Too many multipart fields");
  if (
    request.multipart.files.length === 0 ||
    request.multipart.files.length > MAX_MULTIPART_FILES
  ) {
    throw new Error("Multipart image count must be between 1 and 4");
  }

  const form = new FormData();
  for (const [name, value] of fields) {
    if (!name || name.length > 64 || value.length > 200_000) {
      throw new Error("Invalid multipart field");
    }
    form.append(name, value);
  }
  for (const file of request.multipart.files) {
    if (
      !file.fieldName ||
      file.fieldName.length > 64 ||
      !file.fileName ||
      file.fileName.length > 255 ||
      file.fileName !== file.fileName.split(/[\\/]/u).pop() ||
      !ALLOWED_MULTIPART_IMAGE_TYPES.has(file.mimeType)
    ) {
      throw new Error("Invalid multipart image metadata");
    }
    const bytes = decodeMultipartFile(file.base64);
    const blobBytes = Uint8Array.from(bytes);
    form.append(
      file.fieldName,
      new Blob([blobBytes], { type: file.mimeType }),
      file.fileName,
    );
  }
  return form;
}

function headersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function toErrorResponse(error: unknown): AITransportResponse {
  return {
    ok: false,
    status: 0,
    statusText: "",
    body: "",
    headers: {},
    error: error instanceof Error ? error.message : "Unknown error",
  };
}

async function requestToResponse(
  response: Response,
): Promise<AITransportResponse> {
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body: await response.text(),
    headers: headersToObject(response.headers),
  };
}

async function performRequest<T>(
  request: AITransportRequest,
  consume: (response: Response) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeoutMs =
    typeof request.timeoutMs === "number" && request.timeoutMs > 0
      ? request.timeoutMs
      : AI_REQUEST_TIMEOUT_MS;
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Request timeout after ${timeoutMs}ms`));
  }, timeoutMs);

  try {
    const multipartBody = buildMultipartBody(request);
    const response = await fetchWithNetworkProxy(request.url, {
      method: request.method,
      headers: normalizeHeaders(request.headers, Boolean(multipartBody)),
      body: multipartBody ?? request.body,
      signal: controller.signal,
    });
    return await consume(response);
  } finally {
    clearTimeout(timeoutId);
  }
}

export function registerAIIPC(): void {
  ipcMain.handle(
    IPC_CHANNELS.AI_HTTP_REQUEST,
    async (
      _event,
      request: AITransportRequest,
    ): Promise<AITransportResponse> => {
      try {
        return await performRequest(request, requestToResponse);
      } catch (error) {
        return toErrorResponse(error);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_HTTP_STREAM,
    async (
      event,
      request: AITransportRequest,
    ): Promise<AITransportResponse> => {
      try {
        return await performRequest(request, async (response) => {
          if (!response.ok || !response.body) {
            return await requestToResponse(response);
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                break;
              }

              const chunk = decoder.decode(value, { stream: true });
              if (chunk) {
                event.sender.send(IPC_CHANNELS.AI_HTTP_STREAM_CHUNK, {
                  requestId: request.requestId,
                  chunk,
                });
              }
            }

            const tail = decoder.decode();
            if (tail) {
              event.sender.send(IPC_CHANNELS.AI_HTTP_STREAM_CHUNK, {
                requestId: request.requestId,
                chunk: tail,
              });
            }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown stream error";
            event.sender.send(IPC_CHANNELS.AI_HTTP_STREAM_ERROR, {
              requestId: request.requestId,
              error: message,
            });
            return toErrorResponse(error);
          } finally {
            reader.releaseLock();
          }

          return {
            ok: true,
            status: response.status,
            statusText: response.statusText,
            body: "",
            headers: headersToObject(response.headers),
          };
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown stream error";
        event.sender.send(IPC_CHANNELS.AI_HTTP_STREAM_ERROR, {
          requestId: request.requestId,
          error: message,
        });
        return toErrorResponse(error);
      }
    },
  );
}
