import { ipcMain } from "electron";

import { IPC_CHANNELS } from "../../shared/constants/ipc-channels";
import type {
  AITransportRequest,
  AITransportResponse,
} from "../../shared/types";

function normalizeHeaders(headers?: Record<string, string>): HeadersInit | undefined {
  if (!headers) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(headers).filter(([, value]) => value != null),
  );
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

async function requestToResponse(response: Response): Promise<AITransportResponse> {
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body: await response.text(),
    headers: headersToObject(response.headers),
  };
}

async function performRequest(request: AITransportRequest): Promise<Response> {
  return fetch(request.url, {
    method: request.method,
    headers: normalizeHeaders(request.headers),
    body: request.body,
  });
}

export function registerAIIPC(): void {
  ipcMain.handle(
    IPC_CHANNELS.AI_HTTP_REQUEST,
    async (_event, request: AITransportRequest): Promise<AITransportResponse> => {
      try {
        const response = await performRequest(request);
        return await requestToResponse(response);
      } catch (error) {
        return toErrorResponse(error);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_HTTP_STREAM,
    async (event, request: AITransportRequest): Promise<AITransportResponse> => {
      try {
        const response = await performRequest(request);
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
