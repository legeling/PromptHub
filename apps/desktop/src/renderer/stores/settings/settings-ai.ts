import type { Settings } from "@prompthub/shared/types";
import type { AIProtocol } from "@prompthub/shared/types";
import type {
  AIModelCapabilities,
  AIModelConfig,
  AIModelRoute,
  AIModelType,
  AIProviderConfig,
  AIUsageScenario,
  ModelRouteDefaults,
  ScenarioModelDefaults,
  SettingsState,
} from "./settings-types";

export const AI_SCENARIO_MODEL_ROUTE: Record<AIUsageScenario, AIModelRoute> = {
  quickAdd: "fastText",
  translation: "fastText",
  promptTest: "mainText",
  imageReverse: "visionText",
  imageTest: "imageGeneration",
};

export function normalizeAIProtocol(
  value: unknown,
  provider?: string,
  apiUrl?: string,
): AIProtocol {
  if (value === "openai" || value === "gemini" || value === "anthropic") {
    return value;
  }

  const providerLower = (provider || "").trim().toLowerCase();
  const normalizedUrl = (apiUrl || "").trim().toLowerCase();
  if (
    providerLower === "anthropic" ||
    normalizedUrl.includes("api.anthropic.com")
  ) {
    return "anthropic";
  }
  if (
    providerLower === "google" ||
    providerLower === "gemini" ||
    normalizedUrl.includes("generativelanguage.googleapis.com")
  ) {
    return "gemini";
  }
  return "openai";
}

function normalizeAIModelType(value: unknown): AIModelType {
  return value === "image" || value === "video" ? value : "chat";
}

export function normalizeAIModelCapabilities(
  value: unknown,
  type: AIModelType,
): AIModelCapabilities {
  if (type === "video" || !value || typeof value !== "object" || Array.isArray(value)) {
    return {
      chat: type === "chat",
      vision: false,
      imageGeneration: type === "image",
      reasoning: false,
      toolUse: false,
      webSearch: false,
      embedding: false,
      rerank: false,
    };
  }

  const capabilities = value as Partial<
    Record<keyof AIModelCapabilities, unknown>
  >;
  return {
    chat: type === "chat" || capabilities.chat === true,
    vision: type === "chat" && capabilities.vision === true,
    imageGeneration: type === "image" || capabilities.imageGeneration === true,
    reasoning: capabilities.reasoning === true,
    toolUse: capabilities.toolUse === true,
    webSearch: capabilities.webSearch === true,
    embedding: capabilities.embedding === true,
    rerank: capabilities.rerank === true,
  };
}

export function normalizePersistedAIModels(value: unknown): AIModelConfig[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((model): model is Partial<AIModelConfig> =>
      Boolean(
        model &&
        typeof model === "object" &&
        !Array.isArray(model) &&
        typeof model.id === "string" &&
        model.id.trim() &&
        typeof model.provider === "string" &&
        model.provider.trim() &&
        typeof model.apiUrl === "string" &&
        model.apiUrl.trim() &&
        typeof model.model === "string" &&
        model.model.trim(),
      ),
    )
    .map((model) => {
      const type = normalizeAIModelType(model.type);
      const provider = model.provider!.trim();
      const apiUrl = model.apiUrl!.trim();
      return {
        ...model,
        id: model.id!.trim(),
        type,
        providerId:
          typeof model.providerId === "string" && model.providerId.trim()
            ? model.providerId.trim()
            : undefined,
        provider,
        apiProtocol: normalizeAIProtocol(model.apiProtocol, provider, apiUrl),
        apiKey: typeof model.apiKey === "string" ? model.apiKey : "",
        apiUrl,
        model: model.model!.trim(),
        capabilities: normalizeAIModelCapabilities(model.capabilities, type),
      };
    });
}

export function normalizePersistedAIProviders(
  value: unknown,
): AIProviderConfig[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((provider): provider is Partial<AIProviderConfig> =>
      Boolean(
        provider &&
        typeof provider === "object" &&
        !Array.isArray(provider) &&
        typeof provider.id === "string" &&
        provider.id.trim() &&
        typeof provider.provider === "string" &&
        provider.provider.trim() &&
        typeof provider.apiUrl === "string" &&
        provider.apiUrl.trim(),
      ),
    )
    .map((provider) => {
      const providerId = provider.provider!.trim();
      const apiUrl = provider.apiUrl!.trim();
      return {
        ...provider,
        id: provider.id!.trim(),
        name:
          typeof provider.name === "string"
            ? provider.name.trim() || undefined
            : undefined,
        provider: providerId,
        apiProtocol: normalizeAIProtocol(
          provider.apiProtocol,
          providerId,
          apiUrl,
        ),
        apiKey: typeof provider.apiKey === "string" ? provider.apiKey : "",
        apiUrl,
      };
    });
}

function normalizeModelRoute(value: unknown): AIModelRoute | null {
  return value === "mainText" ||
    value === "fastText" ||
    value === "visionText" ||
    value === "imageGeneration"
    ? value
    : null;
}

function normalizeAIUsageScenario(value: unknown): AIUsageScenario | null {
  return value === "quickAdd" ||
    value === "imageReverse" ||
    value === "promptTest" ||
    value === "imageTest" ||
    value === "translation"
    ? value
    : null;
}

export function normalizeScenarioModelDefaults(
  value: unknown,
): ScenarioModelDefaults {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.entries(value).reduce<ScenarioModelDefaults>(
    (acc, [scenario, modelId]) => {
      const normalizedScenario = normalizeAIUsageScenario(scenario);
      const normalizedModelId =
        typeof modelId === "string" ? modelId.trim() : "";
      if (normalizedScenario && normalizedModelId) {
        acc[normalizedScenario] = normalizedModelId;
      }
      return acc;
    },
    {},
  );
}

export function normalizeModelRouteDefaults(
  value: unknown,
): ModelRouteDefaults {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.entries(value).reduce<ModelRouteDefaults>(
    (acc, [route, modelId]) => {
      const normalizedRoute = normalizeModelRoute(route);
      const normalizedModelId =
        typeof modelId === "string" ? modelId.trim() : "";
      if (normalizedRoute && normalizedModelId) {
        acc[normalizedRoute] = normalizedModelId;
      }
      return acc;
    },
    {},
  );
}

function deriveModelRouteDefaultsFromScenarios(
  scenarioDefaults: ScenarioModelDefaults,
): ModelRouteDefaults {
  const next: ModelRouteDefaults = {};
  if (scenarioDefaults.promptTest) next.mainText = scenarioDefaults.promptTest;
  if (scenarioDefaults.imageTest)
    next.imageGeneration = scenarioDefaults.imageTest;
  if (scenarioDefaults.imageReverse)
    next.visionText = scenarioDefaults.imageReverse;
  if (scenarioDefaults.quickAdd) next.fastText = scenarioDefaults.quickAdd;
  else if (scenarioDefaults.translation)
    next.fastText = scenarioDefaults.translation;
  return next;
}

export function normalizeAIModelDefaults(
  next: Pick<SettingsState, "scenarioModelDefaults" | "modelRouteDefaults">,
): void {
  next.scenarioModelDefaults = normalizeScenarioModelDefaults(
    next.scenarioModelDefaults,
  );
  next.modelRouteDefaults = normalizeModelRouteDefaults(
    next.modelRouteDefaults,
  );
  if (Object.keys(next.modelRouteDefaults).length === 0) {
    next.modelRouteDefaults = deriveModelRouteDefaultsFromScenarios(
      next.scenarioModelDefaults,
    );
  }
}

export function findMatchingAIProvider(
  providers: AIProviderConfig[],
  config: Pick<
    AIModelConfig,
    "provider" | "apiProtocol" | "apiKey" | "apiUrl"
  > & { providerId?: string },
): AIProviderConfig | undefined {
  if (config.providerId?.trim()) {
    return providers.find((provider) => provider.id === config.providerId);
  }
  return providers.find(
    (provider) =>
      provider.id === config.provider ||
      (provider.provider === config.provider &&
        provider.apiProtocol === config.apiProtocol &&
        provider.apiUrl === config.apiUrl &&
        provider.apiKey === config.apiKey),
  );
}

export function attachProviderIdsToAIModels(
  providers: AIProviderConfig[],
  models: AIModelConfig[],
): AIModelConfig[] {
  return models.map((model) => {
    const provider = findMatchingAIProvider(providers, model);
    return provider && model.providerId !== provider.id
      ? { ...model, providerId: provider.id }
      : model;
  });
}

export function buildAISettingsSyncPayload(
  state: SettingsState,
): Partial<Settings> {
  return {
    aiProvider: state.aiProvider,
    aiApiProtocol: state.aiApiProtocol,
    aiApiKey: state.aiApiKey,
    aiApiUrl: state.aiApiUrl,
    aiModel: state.aiModel,
    aiProviders: state.aiProviders,
    aiModels: state.aiModels,
    modelRouteDefaults: state.modelRouteDefaults,
  } as Partial<Settings>;
}
