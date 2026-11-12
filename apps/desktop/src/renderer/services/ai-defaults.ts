import type {
  AIModelRoute,
  AIModelCapabilities,
  AIModelConfig,
  AIUsageScenario,
  ModelRouteDefaults,
  ScenarioModelDefaults,
} from "../stores/settings.store";
import { AI_SCENARIO_MODEL_ROUTE } from "../stores/settings.store";
import type { AIConfig } from "./ai";

export function getModelsByType(
  aiModels: AIModelConfig[],
  type: "chat" | "image",
): AIModelConfig[] {
  return aiModels.filter((model) => {
    if (type === "image") {
      return (
        (model.type ?? "chat") === "image" ||
        model.capabilities?.imageGeneration === true
      );
    }
    return (
      (model.type ?? "chat") === "chat" || model.capabilities?.chat === true
    );
  });
}

export function hasModelCapability(
  model: AIModelConfig,
  capability: keyof AIModelCapabilities,
): boolean {
  if (capability === "chat") {
    return (
      (model.type ?? "chat") === "chat" || model.capabilities?.chat === true
    );
  }

  if (capability === "imageGeneration") {
    return (
      (model.type ?? "chat") === "image" ||
      model.capabilities?.imageGeneration === true
    );
  }

  if (capability === "vision") {
    return (
      hasModelCapability(model, "chat") && model.capabilities?.vision === true
    );
  }

  if (capability === "embedding" || capability === "rerank") {
    return model.capabilities?.[capability] === true;
  }

  return (
    hasModelCapability(model, "chat") &&
    model.capabilities?.[capability] === true
  );
}

export function getModelsByTypeAndCapability(
  aiModels: AIModelConfig[],
  type: "chat" | "image",
  requiredCapability?: keyof AIModelCapabilities,
): AIModelConfig[] {
  const typedModels = getModelsByType(aiModels, type);
  if (!requiredCapability) {
    return typedModels;
  }
  return typedModels.filter((model) =>
    hasModelCapability(model, requiredCapability),
  );
}

export function resolveScenarioModel(
  aiModels: AIModelConfig[],
  scenarioModelDefaults: ScenarioModelDefaults | undefined,
  scenario: AIUsageScenario,
  type: "chat" | "image",
  requiredCapability?: keyof AIModelCapabilities,
  modelRouteDefaults?: ModelRouteDefaults,
): AIModelConfig | null {
  const typedModels = getModelsByTypeAndCapability(
    aiModels,
    type,
    requiredCapability,
  );
  const route = AI_SCENARIO_MODEL_ROUTE[scenario];
  const scenarioModelId =
    modelRouteDefaults?.[route] ?? scenarioModelDefaults?.[scenario];

  if (scenarioModelId) {
    const explicitModel = typedModels.find(
      (model) => model.id === scenarioModelId,
    );
    if (explicitModel) {
      return explicitModel;
    }
  }

  return typedModels.find((model) => model.isDefault) ?? typedModels[0] ?? null;
}

export function resolveRouteModel(
  aiModels: AIModelConfig[],
  modelRouteDefaults: ModelRouteDefaults | undefined,
  route: AIModelRoute,
): AIModelConfig | null {
  const type = route === "imageGeneration" ? "image" : "chat";
  const requiredCapability = route === "visionText" ? "vision" : undefined;
  const typedModels = getModelsByTypeAndCapability(
    aiModels,
    type,
    requiredCapability,
  );
  const routeModelId = modelRouteDefaults?.[route];

  if (routeModelId) {
    const explicitModel = typedModels.find(
      (model) => model.id === routeModelId,
    );
    if (explicitModel) {
      return explicitModel;
    }
  }

  return typedModels.find((model) => model.isDefault) ?? typedModels[0] ?? null;
}

export function toAIConfig(
  model: AIModelConfig,
  requestType: "chat" | "image",
): AIConfig {
  return {
    id: model.id,
    provider: model.provider,
    apiProtocol: model.apiProtocol,
    apiKey: model.apiKey,
    apiUrl: model.apiUrl,
    model: model.model,
    type: requestType,
    chatParams: model.chatParams,
    imageParams: model.imageParams,
  };
}

export function isConfiguredModel(
  model: AIModelConfig | null | undefined,
): model is AIModelConfig {
  return Boolean(
    model &&
    model.provider?.trim() &&
    model.apiKey?.trim() &&
    model.apiUrl?.trim() &&
    model.model?.trim(),
  );
}

interface ResolveScenarioAIConfigOptions {
  aiModels: AIModelConfig[];
  scenarioModelDefaults: ScenarioModelDefaults | undefined;
  modelRouteDefaults?: ModelRouteDefaults;
  scenario: AIUsageScenario;
  type: "chat" | "image";
  requiredCapability?: keyof AIModelCapabilities;
  allowLegacyFallback?: boolean;
  aiProvider: string;
  aiApiProtocol: AIConfig["apiProtocol"];
  aiApiKey: string;
  aiApiUrl: string;
  aiModel: string;
}

export function resolveScenarioAIConfig({
  aiModels,
  scenarioModelDefaults,
  modelRouteDefaults,
  scenario,
  type,
  requiredCapability,
  allowLegacyFallback = true,
  aiProvider,
  aiApiProtocol,
  aiApiKey,
  aiApiUrl,
  aiModel,
}: ResolveScenarioAIConfigOptions): AIConfig | null {
  const selectedModel = resolveScenarioModel(
    aiModels,
    scenarioModelDefaults,
    scenario,
    type,
    requiredCapability,
    modelRouteDefaults,
  );

  if (isConfiguredModel(selectedModel)) {
    return toAIConfig(selectedModel, type);
  }

  if (
    allowLegacyFallback &&
    type === "chat" &&
    aiProvider.trim() &&
    aiApiKey.trim() &&
    aiApiUrl.trim() &&
    aiModel.trim()
  ) {
    return {
      provider: aiProvider,
      apiProtocol: aiApiProtocol,
      apiKey: aiApiKey,
      apiUrl: aiApiUrl,
      model: aiModel,
      type,
    };
  }

  return null;
}
