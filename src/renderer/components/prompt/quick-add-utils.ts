import type { AIConfig } from "../../services/ai";
import {
  isConfiguredModel,
  resolveScenarioModel,
  toAIConfig,
} from "../../services/ai-defaults";
import type {
  AIModelConfig,
  ScenarioModelDefaults,
} from "../../stores/settings.store";

interface ResolveQuickAddAnalysisConfigOptions {
  aiModels: AIModelConfig[];
  scenarioModelDefaults: ScenarioModelDefaults;
  aiProvider: string;
  aiApiKey: string;
  aiApiUrl: string;
  aiModel: string;
}

export function resolveQuickAddAnalysisConfig({
  aiModels,
  scenarioModelDefaults,
  aiProvider,
  aiApiKey,
  aiApiUrl,
  aiModel,
}: ResolveQuickAddAnalysisConfigOptions): AIConfig | null {
  const selectedModel = resolveScenarioModel(
    aiModels,
    scenarioModelDefaults,
    "quickAdd",
    "chat",
  );

  if (isConfiguredModel(selectedModel)) {
    return toAIConfig(selectedModel);
  }

  if (
    aiProvider.trim() &&
    aiApiKey.trim() &&
    aiApiUrl.trim() &&
    aiModel.trim()
  ) {
    return {
      provider: aiProvider,
      apiKey: aiApiKey,
      apiUrl: aiApiUrl,
      model: aiModel,
      type: "chat",
    };
  }

  return null;
}

export function getQuickAddFallbackTitle(
  promptText: string,
  emptyFallback = "New Prompt",
): string {
  const firstLine = promptText
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine?.slice(0, 30) || emptyFallback;
}
