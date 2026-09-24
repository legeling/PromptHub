import type { SafetyScanAIConfig } from "@prompthub/shared/types";
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

export async function chatCompletion(
  config: SafetyScanAIConfig,
  messages: AIChatMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: { type: "text" | "json_object" };
  },
): Promise<AIChatResult> {
  if (!config.apiKey) {
    throw new Error("AI API Key is not configured");
  }
  if (!config.apiUrl) {
    throw new Error("AI API URL is not configured");
  }
  if (!config.model) {
    throw new Error("AI model is not configured");
  }

  const protocol = resolveAIProtocol(config);
  const endpoint = buildChatEndpointFromBase(
    resolveProtocolBase(config.apiUrl, protocol),
  );
  const headers = buildHeadersForProtocol(protocol, config.apiKey, {
    accept: "application/json",
  });

  const isGemini = protocol === "gemini";
  const isAnthropic = protocol === "anthropic";
  const model = isGemini ? config.model.replace(/^models\//, "") : config.model;

  const body: Record<string, unknown> = isAnthropic
    ? {
        model,
        max_tokens: options?.maxTokens ?? 4096,
        messages: messages
          .filter((message) => message.role !== "system")
          .map((message) => ({
            role: message.role === "assistant" ? "assistant" : "user",
            content: message.content,
          })),
        stream: false,
      }
    : {
        model,
        messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 4096,
        stream: false,
      };

  if (!isAnthropic && options?.responseFormat) {
    body.response_format = options.responseFormat;
  }
  if (isAnthropic) {
    const systemMessage = messages.find((message) => message.role === "system");
    if (systemMessage?.content) {
      body.system = systemMessage.content;
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      let errorMessage = `AI API request failed (${response.status})`;
      try {
        const errorJson = JSON.parse(errorText) as Record<string, unknown>;
        const inner = errorJson.error as Record<string, unknown> | undefined;
        errorMessage =
          (inner?.message as string) ??
          (errorJson.message as string) ??
          errorMessage;
      } catch {
        // Use default error message
      }
      throw new Error(errorMessage);
    }

    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      content?: Array<{ type?: string; text?: string }>;
    };

    const content = isAnthropic
      ? (json.content || [])
          .filter(
            (item) => item?.type === "text" && typeof item.text === "string",
          )
          .map((item) => item.text)
          .join("")
      : json.choices?.[0]?.message?.content;

    if (typeof content !== "string") {
      throw new Error("AI API returned an unexpected response format");
    }

    return { content };
  } finally {
    clearTimeout(timeout);
  }
}
