import type {
  AIProtocol,
  AITransportRequest,
  AITransportResponse,
  SafetyScanAIConfig,
} from "@prompthub/shared/types";
import { AI_REQUEST_TIMEOUT_MS } from "@prompthub/shared/constants/ai";
import {
  buildChatEndpointFromBase,
  buildHeadersForProtocol,
  resolveAIProtocol,
  resolveProtocolBase,
} from "@prompthub/shared/utils/ai-protocol";

export interface AIChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIChatResult {
  content: string;
}

type ChatOptions = {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: "text" | "json_object" };
};

async function requestWithFetch(request: AITransportRequest): Promise<AITransportResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: await response.text(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildChatBody(
  config: SafetyScanAIConfig,
  messages: AIChatMessage[],
  protocol: AIProtocol,
  options?: ChatOptions,
): Record<string, unknown> {
  const model = protocol === "gemini" ? config.model.replace(/^models\//, "") : config.model;
  if (protocol === "anthropic") {
    const systemMessage = messages.find((message) => message.role === "system");
    return {
      model,
      max_tokens: options?.maxTokens ?? 4096,
      messages: messages.filter((message) => message.role !== "system").map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      })),
      stream: false,
      ...(systemMessage?.content ? { system: systemMessage.content } : {}),
    };
  }
  return {
    model, messages,
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.maxTokens ?? 4096,
    stream: false,
    ...(options?.responseFormat ? { response_format: options.responseFormat } : {}),
  };
}

function readChatResult(response: AITransportResponse, protocol: AIProtocol): AIChatResult {
  if (!response.ok) {
    let message = response.error || `AI API request failed (${response.status})`;
    try {
      // Provider JSON is an external protocol response; only message strings are exposed.
      const json: unknown = JSON.parse(response.body);
      if (json && typeof json === "object") {
        const inner = "error" in json ? json.error : undefined;
        if (inner && typeof inner === "object" && "message" in inner && typeof inner.message === "string") {
          message = inner.message;
        } else if ("message" in json && typeof json.message === "string") {
          message = json.message;
        }
      }
    } catch {
      // Non-JSON provider failures use the HTTP status message.
    }
    throw new Error(message);
  }
  // The provider response has protocol-specific fields, checked before use below.
  const json = JSON.parse(response.body) as {
    choices?: { message?: { content?: string } }[];
    content?: Array<{ type?: string; text?: string }>;
  };
  const content = protocol === "anthropic"
    ? (json.content || []).filter((item) => item?.type === "text" && typeof item.text === "string").map((item) => item.text).join("")
    : json.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("AI API returned an unexpected response format");
  }
  return { content };
}

export async function chatCompletion(
  config: SafetyScanAIConfig,
  messages: AIChatMessage[],
  options?: ChatOptions,
  transport: (request: AITransportRequest) => Promise<AITransportResponse> = requestWithFetch,
): Promise<AIChatResult> {
  if (!config.apiKey) throw new Error("AI API Key is not configured");
  if (!config.apiUrl) throw new Error("AI API URL is not configured");
  if (!config.model) throw new Error("AI model is not configured");

  const protocol = resolveAIProtocol(config);
  const response = await transport({
    method: "POST",
    url: buildChatEndpointFromBase(resolveProtocolBase(config.apiUrl, protocol)),
    headers: buildHeadersForProtocol(protocol, config.apiKey, { accept: "application/json" }),
    body: JSON.stringify(buildChatBody(config, messages, protocol, options)),
    timeoutMs: AI_REQUEST_TIMEOUT_MS,
  });
  return readChatResult(response, protocol);
}
