import type { AIUsageScenario } from "../../../stores/settings.store";

import type { ModelFormState, ProviderOption, ScenarioDefinition } from "./types";

export const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    id: "openai",
    name: "OpenAI",
    defaultUrl: "https://api.openai.com",
    group: "International / 国际",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    defaultUrl: "https://api.anthropic.com",
    group: "International / 国际",
  },
  {
    id: "google",
    name: "Google",
    defaultUrl: "https://generativelanguage.googleapis.com",
    group: "International / 国际",
  },
  {
    id: "xai",
    name: "xAI",
    defaultUrl: "https://api.x.ai",
    group: "International / 国际",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    defaultUrl: "https://api.deepseek.com",
    group: "Domestic / 国内",
  },
  {
    id: "moonshot",
    name: "Moonshot",
    defaultUrl: "https://api.moonshot.cn",
    group: "Domestic / 国内",
  },
  {
    id: "zhipu",
    name: "智谱 AI",
    defaultUrl: "https://open.bigmodel.cn/api/paas",
    group: "Domestic / 国内",
  },
  {
    id: "qwen",
    name: "通义千问",
    defaultUrl: "https://dashscope.aliyuncs.com/compatible-mode",
    group: "Domestic / 国内",
  },
  {
    id: "doubao",
    name: "豆包",
    defaultUrl: "https://ark.cn-beijing.volces.com/api",
    group: "Domestic / 国内",
  },
  {
    id: "custom",
    name: "自定义 (OpenAI 兼容)",
    defaultUrl: "",
    group: "Other / 其他",
  },
];

export const SCENARIO_DEFINITIONS: ScenarioDefinition[] = [
  {
    key: "quickAdd",
    labelKey: "settings.aiWorkbenchScenarioQuickAdd",
    descKey: "settings.aiWorkbenchScenarioQuickAddDesc",
    type: "chat",
    badgeKey: "settings.aiWorkbenchBadgeQuickAdd",
  },
  {
    key: "promptTest",
    labelKey: "settings.aiWorkbenchScenarioPromptTest",
    descKey: "settings.aiWorkbenchScenarioPromptTestDesc",
    type: "chat",
    badgeKey: "settings.aiWorkbenchBadgePromptTest",
  },
  {
    key: "imageTest",
    labelKey: "settings.aiWorkbenchScenarioImageTest",
    descKey: "settings.aiWorkbenchScenarioImageTestDesc",
    type: "image",
    badgeKey: "settings.aiWorkbenchBadgeImageTest",
  },
  {
    key: "translation",
    labelKey: "settings.aiWorkbenchScenarioTranslation",
    descKey: "settings.aiWorkbenchScenarioTranslationDesc",
    type: "chat",
    badgeKey: "settings.aiWorkbenchBadgeTranslation",
  },
] satisfies Array<{
  key: AIUsageScenario;
  labelKey: string;
  descKey: string;
  type: ModelFormState["type"];
  badgeKey: string;
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

export const EMPTY_FORM: ModelFormState = {
  type: "chat",
  name: "",
  provider: "openai",
  apiKey: "",
  apiUrl: "https://api.openai.com",
  model: "",
  chatParams: DEFAULT_CHAT_PARAMS,
  imageParams: DEFAULT_IMAGE_PARAMS,
};
