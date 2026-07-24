import type { TFunction } from "i18next";

import type {
  AIModelConfig,
  ChatModelParams,
  ImageModelParams,
} from "../../../stores/settings.store";

import {
  DEFAULT_CHAT_PARAMS,
  DEFAULT_IMAGE_PARAMS,
  DEFAULT_MODEL_CAPABILITIES,
  PROVIDER_OPTIONS,
} from "./constants";
import type { ModelFormState, ModelOption, ProviderOption } from "./types";

const MODEL_CATEGORY_CONFIG: Array<{
  category: string;
  idKeywords?: string[];
  ownerKeywords?: string[];
}> = [
  {
    category: "GPT",
    idKeywords: ["gpt", "o1", "o3", "o4"],
    ownerKeywords: ["openai"],
  },
  { category: "Claude", idKeywords: ["claude"], ownerKeywords: ["anthropic"] },
  {
    category: "Gemini",
    idKeywords: ["gemini"],
    ownerKeywords: ["google", "vertexai", "google-deepmind"],
  },
  {
    category: "DeepSeek",
    idKeywords: ["deepseek"],
    ownerKeywords: ["deepseek"],
  },
  {
    category: "Qwen",
    idKeywords: ["qwen", "qwq"],
    ownerKeywords: ["qwen", "aliyun", "dashscope"],
  },
  {
    category: "StepFun",
    idKeywords: ["stepfun", "step-"],
    ownerKeywords: ["stepfun", "step"],
  },
  {
    category: "MiniMax",
    idKeywords: ["minimax", "abab"],
    ownerKeywords: ["minimax"],
  },
  {
    category: "Doubao",
    idKeywords: ["doubao"],
    ownerKeywords: ["doubao", "volcengine"],
  },
  { category: "GLM", idKeywords: ["glm", "zhipu"], ownerKeywords: ["zhipu"] },
  {
    category: "Moonshot",
    idKeywords: ["moonshot", "kimi"],
    ownerKeywords: ["moonshot"],
  },
  {
    category: "Baichuan",
    idKeywords: ["baichuan"],
    ownerKeywords: ["baichuan"],
  },
  {
    category: "Grok",
    idKeywords: ["grok", "x-ai", "xai"],
    ownerKeywords: ["x-ai", "xai"],
  },
  {
    category: "Command",
    idKeywords: ["command-r", "command-a", "cohere"],
    ownerKeywords: ["cohere"],
  },
  {
    category: "Llama",
    idKeywords: ["llama", "meta-llama"],
    ownerKeywords: ["meta", "meta-llama"],
  },
  { category: "Gemma", idKeywords: ["gemma"], ownerKeywords: ["google"] },
  {
    category: "Mistral",
    idKeywords: ["mistral", "mixtral"],
    ownerKeywords: ["mistral"],
  },
  {
    category: "Yi",
    idKeywords: ["yi-"],
    ownerKeywords: ["01-ai", "zeroone", "zero-one"],
  },
  {
    category: "ERNIE",
    idKeywords: ["ernie", "wenxin"],
    ownerKeywords: ["baidu", "wenxin"],
  },
  {
    category: "Spark",
    idKeywords: ["spark", "xunfei"],
    ownerKeywords: ["xunfei", "iflytek"],
  },
  { category: "Hunyuan", idKeywords: ["hunyuan"], ownerKeywords: ["tencent"] },
  {
    category: "InternLM",
    idKeywords: ["internlm"],
    ownerKeywords: ["internlm", "shanghai-ai-lab"],
  },
  { category: "Phi", idKeywords: ["phi-"], ownerKeywords: ["microsoft"] },
  { category: "Nova", idKeywords: ["nova-"], ownerKeywords: ["amazon"] },
  { category: "Jamba", idKeywords: ["jamba"], ownerKeywords: ["ai21"] },
  { category: "Sonar", idKeywords: ["sonar"], ownerKeywords: ["perplexity"] },
];

const PROVIDER_CATEGORY_MAP: Record<string, string> = {
  atlas: "Atlas Cloud",
  atlascloud: "Atlas Cloud",
  "atlas-cloud": "Atlas Cloud",
  openai: "GPT",
  "openai-responses": "GPT",
  "azure-openai": "GPT",
  anthropic: "Claude",
  google: "Gemini",
  deepseek: "DeepSeek",
  qwen: "Qwen",
  stepfun: "StepFun",
  minimax: "MiniMax",
  doubao: "Doubao",
  zhipu: "GLM",
  moonshot: "Moonshot",
  baichuan: "Baichuan",
  xai: "Grok",
  "x-ai": "Grok",
  cohere: "Command",
  llama: "Llama",
  meta: "Llama",
  gemma: "Gemma",
  mistral: "Mistral",
  yi: "Yi",
  ernie: "ERNIE",
  spark: "Spark",
  hunyuan: "Hunyuan",
  internlm: "InternLM",
  microsoft: "Phi",
  amazon: "Nova",
  ai21: "Jamba",
  perplexity: "Sonar",
  ollama: "Llama",
};

export function cloneDefaultChatParams(): ModelFormState["chatParams"] {
  return { ...DEFAULT_CHAT_PARAMS };
}

export function cloneDefaultImageParams(): ModelFormState["imageParams"] {
  return { ...DEFAULT_IMAGE_PARAMS };
}

export function cloneDefaultCapabilities(): ModelFormState["capabilities"] {
  return { ...DEFAULT_MODEL_CAPABILITIES };
}

function formatCustomParams(
  customParams?: Record<string, string | number | boolean>,
): string {
  if (!customParams || Object.keys(customParams).length === 0) {
    return "";
  }
  return JSON.stringify(customParams, null, 2);
}

function parseCustomParams(
  text: string,
):
  | { success: true; value: Record<string, string | number | boolean> }
  | { success: false } {
  if (!text.trim()) {
    return { success: true, value: {} };
  }

  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { success: false };
    }

    const result: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean"
      ) {
        return { success: false };
      }
      result[key] = value;
    }

    return { success: true, value: result };
  } catch {
    return { success: false };
  }
}

export function buildChatParams(form: ModelFormState): ChatModelParams | null {
  const customParams = parseCustomParams(form.chatParams.customParamsText);
  if (!customParams.success) {
    return null;
  }

  return {
    temperature: form.chatParams.temperature,
    maxTokens: form.chatParams.maxTokens,
    topP: form.chatParams.topP,
    topK: form.chatParams.topK.trim()
      ? Number(form.chatParams.topK)
      : undefined,
    frequencyPenalty: form.chatParams.frequencyPenalty,
    presencePenalty: form.chatParams.presencePenalty,
    stream: form.chatParams.stream,
    enableThinking: form.chatParams.enableThinking,
    customParams:
      Object.keys(customParams.value).length > 0
        ? customParams.value
        : undefined,
  };
}

export function buildImageParams(form: ModelFormState): ImageModelParams {
  return {
    size: form.imageParams.size,
    quality: form.imageParams.quality,
    style: form.imageParams.style,
    n: form.imageParams.n,
  };
}

export function getProviderInfo(
  providerId: string,
): ProviderOption | undefined {
  return PROVIDER_OPTIONS.find((item) => item.id === providerId);
}

export function getProviderLabel(providerId: string): string {
  const provider = getProviderInfo(providerId);
  return provider?.labelDefault || provider?.name || providerId || "Unknown";
}

export function getProviderDisplayName(
  provider: ProviderOption,
  t: TFunction,
): string {
  return provider.labelKey
    ? t(provider.labelKey, {
        defaultValue: provider.labelDefault || provider.name,
      })
    : provider.name;
}

export function getProviderDisplayLabel(
  providerId: string,
  t: TFunction,
): string {
  const provider = getProviderInfo(providerId);
  return provider
    ? getProviderDisplayName(provider, t)
    : providerId ||
        t("settings.aiWorkbenchUnknownProvider", {
          defaultValue: "Unknown provider",
        });
}

export function getEndpointDisplayName(input: {
  name?: string;
  provider: string;
}): string {
  return input.name?.trim() || getProviderLabel(input.provider);
}

export function getEndpointDisplayLabel(
  input: {
    name?: string;
    provider: string;
  },
  t: TFunction,
): string {
  return input.name?.trim() || getProviderDisplayLabel(input.provider, t);
}

export function getProviderIconCategory(providerId: string): string {
  const provider = getProviderInfo(providerId);
  if (provider) {
    return provider.iconCategory;
  }
  return PROVIDER_CATEGORY_MAP[providerId.toLowerCase()] ?? "Other";
}

export function getModelCategory(model: {
  id?: string;
  model?: string;
  owned_by?: string;
  provider?: string;
}): string {
  const provider = model.provider?.toLowerCase() || "";
  if (provider && provider !== "custom" && PROVIDER_CATEGORY_MAP[provider]) {
    return PROVIDER_CATEGORY_MAP[provider];
  }

  const id = (model.model || model.id || "").toLowerCase();
  const owner = model.owned_by?.toLowerCase() || "";

  for (const item of MODEL_CATEGORY_CONFIG) {
    if (item.idKeywords?.some((keyword) => id.includes(keyword))) {
      return item.category;
    }
  }

  for (const item of MODEL_CATEGORY_CONFIG) {
    if (item.ownerKeywords?.some((keyword) => owner.includes(keyword))) {
      return item.category;
    }
  }

  if (id.includes("embedding") || id.includes("text-embedding"))
    return "Embedding";
  if (id.includes("rerank")) return "Rerank";
  if (id.includes("whisper") || id.includes("tts")) return "Audio";
  if (id.includes("dall-e") || id.includes("stable-diffusion")) return "Image";
  return "Other";
}

export function getEndpointCategory(
  provider: string,
  models: AIModelConfig[],
): string {
  const providerCategory = PROVIDER_CATEGORY_MAP[provider.toLowerCase()];
  if (providerCategory) {
    return providerCategory;
  }
  return models[0] ? getModelCategory(models[0]) : "Other";
}

export function getEndpointHost(apiUrl: string, fallback: string): string {
  try {
    return new URL(apiUrl).host;
  } catch {
    return apiUrl || fallback;
  }
}

export function getModelDisplayName(
  model: AIModelConfig | null | undefined,
  fallback: string,
): string {
  if (!model) {
    return fallback;
  }
  return model.name?.trim() || model.model;
}

export function buildEndpointGroupKey(model: AIModelConfig): string {
  if (model.providerId?.trim()) {
    return `provider:${model.providerId.trim()}`;
  }
  return buildEndpointKey(model);
}

export function buildEndpointKey(input: {
  id?: string;
  providerId?: string;
  provider: string;
  apiProtocol: string;
  apiUrl: string;
}): string {
  const providerId = input.providerId?.trim() || input.id?.trim();
  if (providerId) {
    return `provider:${providerId}`;
  }
  return `${input.provider}::${input.apiProtocol}::${input.apiUrl}`;
}

export function buildModelOptions(models: AIModelConfig[]): ModelOption[] {
  return models.map((model) => ({
    value: model.id,
    label: model.name?.trim() || model.model,
  }));
}

export function inferModelAttributes(
  modelId: string,
): Pick<ModelFormState, "type" | "capabilities"> {
  const normalized = modelId.toLowerCase();
  const isImageModel = [
    "gpt-image",
    "dall-e",
    "imagen",
    "nano-banana",
    "nanobanana",
    "nanobanano",
    "flux",
    "stable-diffusion",
    "sd3",
    "recraft",
    "ideogram",
  ].some((keyword) => normalized.includes(keyword));

  if (isImageModel) {
    return {
      type: "image",
      capabilities: {
        ...cloneDefaultCapabilities(),
        chat: false,
        vision: false,
        imageGeneration: true,
      },
    };
  }

  const isEmbeddingModel = [
    "embedding",
    "text-embedding",
    "bge-m3",
    "gte-",
    "e5-",
    "jina-embeddings",
  ].some((keyword) => normalized.includes(keyword));

  if (isEmbeddingModel) {
    return {
      type: "chat",
      capabilities: {
        ...cloneDefaultCapabilities(),
        chat: false,
        vision: false,
        imageGeneration: false,
        embedding: true,
      },
    };
  }

  const isRerankModel = [
    "rerank",
    "reranker",
    "jina-reranker",
    "bge-reranker",
  ].some((keyword) => normalized.includes(keyword));

  if (isRerankModel) {
    return {
      type: "chat",
      capabilities: {
        ...cloneDefaultCapabilities(),
        chat: false,
        vision: false,
        imageGeneration: false,
        rerank: true,
      },
    };
  }

  const hasVision = [
    "vision",
    "vl",
    "gpt-4o",
    "gpt-5",
    "o3",
    "o4",
    "claude-3",
    "claude-4",
    "gemini",
    "qwen-vl",
    "glm-4v",
  ].some((keyword) => normalized.includes(keyword));
  const hasReasoning = [
    "reasoning",
    "o1",
    "o3",
    "o4",
    "deepseek-r1",
    "qwen3",
    "qwq",
    "grok-3",
    "grok-4",
  ].some((keyword) => normalized.includes(keyword));
  const hasWebSearch = ["search", "sonar", "perplexity", "grok"].some(
    (keyword) => normalized.includes(keyword),
  );

  return {
    type: "chat",
    capabilities: {
      ...cloneDefaultCapabilities(),
      chat: true,
      vision: hasVision,
      imageGeneration: false,
      reasoning: hasReasoning,
      webSearch: hasWebSearch,
    },
  };
}

export function applyModelIdToForm(
  form: ModelFormState,
  modelId: string,
): ModelFormState {
  const inferred = inferModelAttributes(modelId);
  return {
    ...form,
    model: modelId,
    type: inferred.type,
    capabilities: inferred.capabilities,
  };
}

export function createFormFromModel(model: AIModelConfig): ModelFormState {
  const chatParams = model.chatParams;
  const imageParams = model.imageParams;

  return {
    type: model.type ?? "chat",
    name: model.name || "",
    providerId: model.providerId,
    provider: model.provider,
    apiProtocol: model.apiProtocol,
    apiKey: model.apiKey,
    apiUrl: model.apiUrl,
    model: model.model,
    capabilities: {
      chat: model.capabilities?.chat ?? (model.type ?? "chat") === "chat",
      vision: model.capabilities?.vision === true,
      imageGeneration:
        model.capabilities?.imageGeneration === true ||
        (model.type ?? "chat") === "image",
      reasoning: model.capabilities?.reasoning === true,
      toolUse: model.capabilities?.toolUse === true,
      webSearch: model.capabilities?.webSearch === true,
      embedding: model.capabilities?.embedding === true,
      rerank: model.capabilities?.rerank === true,
    },
    chatParams: {
      temperature: chatParams?.temperature ?? DEFAULT_CHAT_PARAMS.temperature,
      maxTokens: chatParams?.maxTokens ?? DEFAULT_CHAT_PARAMS.maxTokens,
      topP: chatParams?.topP ?? DEFAULT_CHAT_PARAMS.topP,
      topK: chatParams?.topK != null ? String(chatParams.topK) : "",
      frequencyPenalty:
        chatParams?.frequencyPenalty ?? DEFAULT_CHAT_PARAMS.frequencyPenalty,
      presencePenalty:
        chatParams?.presencePenalty ?? DEFAULT_CHAT_PARAMS.presencePenalty,
      stream: chatParams?.stream ?? DEFAULT_CHAT_PARAMS.stream,
      enableThinking:
        chatParams?.enableThinking ?? DEFAULT_CHAT_PARAMS.enableThinking,
      customParamsText: formatCustomParams(chatParams?.customParams),
    },
    imageParams: {
      size: imageParams?.size ?? DEFAULT_IMAGE_PARAMS.size,
      quality: imageParams?.quality ?? DEFAULT_IMAGE_PARAMS.quality,
      style: imageParams?.style ?? DEFAULT_IMAGE_PARAMS.style,
      n: imageParams?.n ?? DEFAULT_IMAGE_PARAMS.n,
    },
  };
}
