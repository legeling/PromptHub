import type { LucideIcon } from "lucide-react";

import type {
  AIModelConfig,
  AIUsageScenario,
} from "../../../stores/settings.store";

export type ProviderOption = {
  id: string;
  name: string;
  defaultUrl: string;
  group: string;
};

export type ModelType = "chat" | "image";

export type ModelFormState = {
  type: ModelType;
  name: string;
  provider: string;
  apiKey: string;
  apiUrl: string;
  model: string;
  chatParams: {
    temperature: number;
    maxTokens: number;
    topP: number;
    topK: string;
    frequencyPenalty: number;
    presencePenalty: number;
    stream: boolean;
    enableThinking: boolean;
    customParamsText: string;
  };
  imageParams: {
    size: string;
    quality: "standard" | "hd";
    style: "vivid" | "natural";
    n: number;
  };
};

export type EndpointStatus = {
  tone: "ready" | "warning" | "error";
  label: string;
  detail: string;
};

export type EndpointGroup = {
  key: string;
  provider: string;
  apiUrl: string;
  models: AIModelConfig[];
};

export type EndpointDraft = {
  key: string;
  provider: string;
  apiKey: string;
  apiUrl: string;
};

export type ScenarioDefinition = {
  key: AIUsageScenario;
  labelKey: string;
  descKey: string;
  type: ModelType;
  badgeKey: string;
};

export type ModelOption = {
  value: string;
  label: string;
};

export type StatusCardData = {
  title: string;
  value: string;
  detail: string;
  tone: "ready" | "warning";
  icon: LucideIcon;
};
