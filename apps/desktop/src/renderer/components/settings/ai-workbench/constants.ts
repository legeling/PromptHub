import type { AIModelRoute } from "../../../stores/settings.store";

import type {
  ModelFormState,
  ProviderOption,
  ScenarioDefinition,
} from "./types";

export const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    id: "custom",
    name: "自定义",
    defaultUrl: "",
    recommendedProtocol: "openai",
    allowsCustomProtocol: true,
    iconCategory: "Custom",
  },
  {
    id: "openai",
    name: "OpenAI",
    defaultUrl: "https://api.openai.com",
    recommendedProtocol: "openai",
    allowsCustomProtocol: false,
    iconCategory: "GPT",
  },
  {
    id: "openai-responses",
    name: "OpenAI-Response",
    defaultUrl: "https://api.openai.com",
    recommendedProtocol: "openai",
    allowsCustomProtocol: false,
    iconCategory: "GPT",
  },
  {
    id: "google",
    name: "Gemini",
    defaultUrl: "https://generativelanguage.googleapis.com",
    recommendedProtocol: "gemini",
    allowsCustomProtocol: false,
    iconCategory: "Gemini",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    defaultUrl: "https://api.anthropic.com",
    recommendedProtocol: "anthropic",
    allowsCustomProtocol: false,
    iconCategory: "Claude",
  },
  {
    id: "azure-openai",
    name: "Azure OpenAI",
    defaultUrl: "",
    recommendedProtocol: "openai",
    allowsCustomProtocol: true,
    iconCategory: "Azure OpenAI",
  },
  {
    id: "new-api",
    name: "New API",
    defaultUrl: "",
    recommendedProtocol: "openai",
    allowsCustomProtocol: true,
    iconCategory: "New API",
  },
  {
    id: "ollama",
    name: "Ollama",
    defaultUrl: "http://localhost:11434/v1",
    recommendedProtocol: "openai",
    allowsCustomProtocol: false,
    iconCategory: "Llama",
  },
  {
    id: "xai",
    name: "xAI",
    defaultUrl: "https://api.x.ai",
    recommendedProtocol: "openai",
    allowsCustomProtocol: false,
    iconCategory: "Grok",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    defaultUrl: "https://api.deepseek.com",
    recommendedProtocol: "openai",
    allowsCustomProtocol: false,
    iconCategory: "DeepSeek",
  },
  {
    id: "moonshot",
    name: "Moonshot",
    defaultUrl: "https://api.moonshot.cn",
    recommendedProtocol: "openai",
    allowsCustomProtocol: false,
    iconCategory: "Moonshot",
  },
  {
    id: "zhipu",
    name: "智谱 AI",
    defaultUrl: "https://open.bigmodel.cn/api/paas",
    recommendedProtocol: "openai",
    allowsCustomProtocol: false,
    iconCategory: "GLM",
  },
  {
    id: "qwen",
    name: "通义千问",
    defaultUrl: "https://dashscope.aliyuncs.com/compatible-mode",
    recommendedProtocol: "openai",
    allowsCustomProtocol: false,
    iconCategory: "Qwen",
  },
  {
    id: "atlascloud",
    name: "Atlas Cloud",
    defaultUrl: "https://api.atlascloud.ai/v1",
    recommendedProtocol: "openai",
    allowsCustomProtocol: false,
    iconCategory: "Atlas Cloud",
  },
  {
    id: "doubao",
    name: "豆包",
    defaultUrl: "https://ark.cn-beijing.volces.com/api",
    recommendedProtocol: "openai",
    allowsCustomProtocol: false,
    iconCategory: "Doubao",
  },
];

export const MODEL_ROUTE_DEFINITIONS: ScenarioDefinition[] = [
  {
    key: "mainText",
    labelKey: "settings.aiWorkbenchRouteMainText",
    descKey: "settings.aiWorkbenchRouteMainTextDesc",
    type: "chat",
    badgeKey: "settings.aiWorkbenchBadgeMainText",
  },
  {
    key: "fastText",
    labelKey: "settings.aiWorkbenchRouteFastText",
    descKey: "settings.aiWorkbenchRouteFastTextDesc",
    type: "chat",
    badgeKey: "settings.aiWorkbenchBadgeFastText",
  },
  {
    key: "visionText",
    labelKey: "settings.aiWorkbenchRouteVisionText",
    descKey: "settings.aiWorkbenchRouteVisionTextDesc",
    type: "chat",
    badgeKey: "settings.aiWorkbenchBadgeVisionText",
    requiredCapability: "vision",
  },
  {
    key: "imageGeneration",
    labelKey: "settings.aiWorkbenchRouteImageGeneration",
    descKey: "settings.aiWorkbenchRouteImageGenerationDesc",
    type: "image",
    badgeKey: "settings.aiWorkbenchBadgeImageGeneration",
  },
] satisfies Array<{
  key: AIModelRoute;
  labelKey: string;
  descKey: string;
  type: ModelFormState["type"];
  badgeKey: string;
  requiredCapability?: keyof ModelFormState["capabilities"];
}>;

export const DEFAULT_CHAT_PARAMS: ModelFormState["chatParams"] = {
  temperature: 0.7,
  maxTokens: 2048,
  topP: 1,
  topK: "",
  frequencyPenalty: 0,
  presencePenalty: 0,
  stream: false,
  enableThinking: false,
  customParamsText: "",
};

export const DEFAULT_IMAGE_PARAMS: ModelFormState["imageParams"] = {
  size: "1024x1024",
  quality: "standard",
  style: "vivid",
  n: 1,
};

export const DEFAULT_MODEL_CAPABILITIES: ModelFormState["capabilities"] = {
  chat: true,
  vision: false,
  imageGeneration: false,
  reasoning: false,
  toolUse: false,
  webSearch: false,
  embedding: false,
  rerank: false,
};

export const EMPTY_FORM: ModelFormState = {
  type: "chat",
  name: "",
  providerId: undefined,
  provider: "openai",
  apiProtocol: "openai",
  apiKey: "",
  apiUrl: "https://api.openai.com",
  model: "",
  capabilities: DEFAULT_MODEL_CAPABILITIES,
  chatParams: DEFAULT_CHAT_PARAMS,
  imageParams: DEFAULT_IMAGE_PARAMS,
};
