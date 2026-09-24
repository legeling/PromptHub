import type { AIProtocol } from "@prompthub/shared/types";
import { AI_REQUEST_TIMEOUT_MS } from "@prompthub/shared/constants/ai";
import {
  buildChatEndpointFromBase,
  buildHeadersForProtocol,
  buildModelsEndpointFromBase,
  getBaseUrl,
  resolveAIProtocol,
  resolveProtocolBase,
} from "@prompthub/shared/utils/ai-protocol";
import type { FetchModelsResult, ModelInfo } from "./ai-types";
import { requestAIEndpoint } from "./ai-request";

interface AnthropicModelsPayload {
  data?: Array<{ id?: string; display_name?: string; created_at?: string }>;
}

interface OpenAIModelsPayload {
  data?: Array<{ id?: string; owned_by?: string; created?: number }>;
}

interface GeminiModelsPayload {
  models?: Array<{ name?: string; displayName?: string; description?: string }>;
}

interface ArrayModelPayloadItem {
  id?: string;
  model?: string;
  name?: string;
}

export function getApiEndpointPreview(
  apiUrl: string,
  protocol: AIProtocol = "openai",
): string {
  if (!apiUrl) return "";
  return buildChatEndpointFromBase(resolveProtocolBase(apiUrl, protocol));
}

export function getImageApiEndpointPreview(apiUrl: string): string {
  if (!apiUrl) return "";
  if (apiUrl.trim().endsWith("#")) return apiUrl.trim().slice(0, -1);

  const baseUrl = getBaseUrl(apiUrl);
  if (baseUrl.includes("generativelanguage.googleapis.com")) {
    const geminiBaseUrl = baseUrl.replace(/\/openai$/, "");
    return geminiBaseUrl.match(/\/v\d+(?:beta)?$/)
      ? `${geminiBaseUrl}/models`
      : `${geminiBaseUrl}/v1beta/models`;
  }

  const endpoint = apiUrl.replace(/\/$/, "");
  if (endpoint.includes("/images/generations")) return endpoint;
  if (endpoint.endsWith("/chat/completions")) {
    return endpoint.replace(/\/chat\/completions$/, "/images/generations");
  }
  return endpoint.match(/\/v\d+$/)
    ? `${endpoint}/images/generations`
    : `${endpoint}/v1/images/generations`;
}

export async function fetchAvailableModels(
  apiUrl: string,
  apiKey: string,
  apiProtocol: AIProtocol = "openai",
): Promise<FetchModelsResult> {
  if (!apiKey || !apiUrl) {
    return {
      success: false,
      models: [],
      error: "Please fill in API Key and API URL first",
    };
  }

  try {
    const endpoint = buildModelsEndpointFromBase(
      resolveProtocolBase(apiUrl, apiProtocol),
    );
    const resolvedProtocol = resolveAIProtocol({
      apiProtocol,
      provider: "",
      apiUrl,
    });
    const response = await requestAIEndpoint({
      method: "GET",
      url: endpoint,
      headers: buildHeadersForProtocol(resolvedProtocol, apiKey, {
        accept: "application/json",
        useNativeGeminiAuth: resolvedProtocol === "gemini",
      }),
      timeoutMs: AI_REQUEST_TIMEOUT_MS,
    });

    if (!response.ok) {
      const errorText = response.error ?? (await response.text());
      const reason =
        response.status === 401 || response.status === 403
          ? "auth"
          : response.status === 0 && /timeout/i.test(errorText)
            ? "network"
            : response.status === 404 ||
                response.status === 405 ||
                response.status === 501
              ? "unsupported"
              : "http";
      return {
        success: false,
        models: [],
        error:
          response.status === 0
            ? errorText.substring(0, 120)
            : `获取模型列表失败: ${response.status} - ${errorText.substring(0, 100)}`,
        reason,
        endpoint,
        status: response.status,
      };
    }

    const data = await response.json<
      | AnthropicModelsPayload
      | OpenAIModelsPayload
      | GeminiModelsPayload
      | ArrayModelPayloadItem[]
    >();

    if (
      apiProtocol === "anthropic" &&
      "data" in data &&
      Array.isArray(data.data)
    ) {
      const models = (data.data as NonNullable<AnthropicModelsPayload["data"]>)
        .flatMap((model): ModelInfo[] =>
          typeof model.id === "string"
            ? [
                {
                  id: model.id,
                  name: model.display_name || model.id,
                  owned_by: "Anthropic",
                  created: model.created_at
                    ? Date.parse(model.created_at)
                    : undefined,
                },
              ]
            : [],
        )
        .sort((left: ModelInfo, right: ModelInfo) =>
          left.id.localeCompare(right.id),
        );
      return { success: true, models };
    }

    if ("data" in data && Array.isArray(data.data)) {
      const models = (data.data as NonNullable<OpenAIModelsPayload["data"]>)
        .flatMap((model): ModelInfo[] =>
          typeof model.id === "string" && model.id.length > 0
            ? [
                {
                  id: model.id,
                  name: model.id,
                  owned_by: model.owned_by,
                  created: model.created,
                },
              ]
            : [],
        )
        .sort((left: ModelInfo, right: ModelInfo) =>
          left.id.localeCompare(right.id),
        );
      return { success: true, models };
    }

    if ("models" in data && Array.isArray(data.models)) {
      const models = data.models
        .flatMap((model): ModelInfo[] => {
          if (typeof model.name !== "string" || model.name.length === 0) {
            return [];
          }
          const id = model.name.replace(/^models\//, "");
          return [
            {
              id,
              name: model.displayName ? `${model.displayName} (${id})` : id,
              owned_by: "Google",
            },
          ];
        })
        .sort((left: ModelInfo, right: ModelInfo) =>
          left.id.localeCompare(right.id),
        );
      return { success: true, models };
    }

    if (Array.isArray(data)) {
      return {
        success: true,
        models: data
          .filter((model) => model.id || model.model)
          .map((model) => ({
            id: model.id || model.model || "",
            name: model.name || model.id || model.model,
          })),
      };
    }

    return {
      success: false,
      models: [],
      error: "无法解析模型列表响应",
      reason: "unsupported",
      endpoint,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取模型列表失败";
    return {
      success: false,
      models: [],
      error: message,
      reason:
        message.toLowerCase().includes("failed to fetch") ||
        message.toLowerCase().includes("network")
          ? "network"
          : "http",
    };
  }
}
