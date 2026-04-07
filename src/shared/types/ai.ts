export interface AITransportRequest {
  requestId?: string;
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface AITransportResponse {
  ok: boolean;
  status: number;
  statusText: string;
  body: string;
  headers: Record<string, string>;
  error?: string;
}

export interface AITransportStreamChunk {
  requestId: string;
  chunk: string;
}

export interface AITransportStreamError {
  requestId: string;
  error: string;
}
