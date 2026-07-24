import type { LucideIcon } from "lucide-react";
import type { AIProtocol } from "@prompthub/shared/types";

import type {
  AIModelCapabilities,
  AIModelConfig,
  AIModelRoute,
} from "../../../stores/settings.store";

export type ProviderOption = {
  id: string;
  name: string;
  labelKey?: string;
  labelDefault?: string;
  defaultUrl: string;
  recommendedProtocol: AIProtocol;
  allowsCustomProtocol: boolean;
  iconCategory: string;
};

export type ModelType = "chat" | "image";

export type ModelFormState = {
  type: ModelType;
  name: string;
  providerId?: string;
  provider: string;
  apiProtocol: AIProtocol;
  apiKey: string;
  apiUrl: string;
  model: string;
  capabilities: Required<AIModelCapabilities>;
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
  providerConfigId?: string;
  name?: string;
  provider: string;
  apiProtocol: AIProtocol;
  apiKey: string;
  apiUrl: string;
  models: AIModelConfig[];
};

export type EndpointDraft = {
  key: string;
  providerConfigId?: string;
  name: string;
  provider: string;
  apiProtocol: AIProtocol;
  apiKey: string;
  apiUrl: string;
};

export type ScenarioDefinition = {
  key: AIModelRoute;
  labelKey: string;
  descKey: string;
  type: ModelType;
  badgeKey: string;
  requiredCapability?: keyof AIModelCapabilities;
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
