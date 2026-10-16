import crypto from "crypto";
import { getDatabase } from "@prompthub/db";
import { getUserDataPath } from "./runtime-paths";
import { CoreSettingsStore } from "./settings-store";
import type { AIProtocol } from "@prompthub/shared/types";

export type CoreAIModelType = "chat" | "image";
export type CoreAIModelRoute =
  | "mainText"
  | "fastText"
  | "visionText"
  | "imageGeneration";

export interface CoreAIModelCapabilities {
  chat?: boolean;
  vision?: boolean;
  imageGeneration?: boolean;
  reasoning?: boolean;
  toolUse?: boolean;
  webSearch?: boolean;
  embedding?: boolean;
  rerank?: boolean;
}

export interface CoreAIProviderConfig {
  id: string;
  name?: string;
  provider: string;
  apiProtocol: AIProtocol;
  apiKey: string;
  apiUrl: string;
  lastVerifiedAt?: string;
}

export interface CoreAIModelConfig {
  id: string;
  type: CoreAIModelType;
  name?: string;
  providerId?: string;
  provider: string;
  apiProtocol: AIProtocol;
  apiKey: string;
  apiUrl: string;
  model: string;
  isDefault?: boolean;
  lastVerifiedAt?: string;
  capabilities?: CoreAIModelCapabilities;
}

export interface CoreAIConfigFile {
  kind: "prompthub-ai-config";
  version: 1;
  updatedAt: string;
  providers: CoreAIProviderConfig[];
  models: CoreAIModelConfig[];
  modelRouteDefaults: Partial<Record<CoreAIModelRoute, string>>;
}

export interface AddAIProviderInput {
  name?: string;
  provider: string;
  apiProtocol?: AIProtocol;
  apiKey: string;
  apiUrl: string;
}

export interface AddAIModelInput {
  provider: string;
  providerId?: string;
  type?: CoreAIModelType;
  name?: string;
  model: string;
  capabilities?: CoreAIModelCapabilities;
  apiProtocol?: AIProtocol;
  apiKey?: string;
  apiUrl?: string;
}

export class AIConfigError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AIConfigError";
    this.code = code;
  }
}

const MODEL_ROUTES: CoreAIModelRoute[] = [
  "mainText",
  "fastText",
  "visionText",
  "imageGeneration",
];

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function normalizeProtocol(
  protocol: AIProtocol | undefined,
  provider: string,
  apiUrl: string,
): AIProtocol {
  if (
    protocol === "openai" ||
    protocol === "gemini" ||
    protocol === "anthropic"
  ) {
    return protocol;
  }

  const providerLower = provider.toLowerCase();
  const urlLower = apiUrl.toLowerCase();
  if (
    providerLower.includes("anthropic") ||
    providerLower.includes("claude") ||
    urlLower.includes("api.anthropic.com")
  ) {
    return "anthropic";
  }
  if (
    providerLower.includes("gemini") ||
    providerLower.includes("google") ||
    urlLower.includes("generativelanguage.googleapis.com")
  ) {
    return "gemini";
  }
  return "openai";
}

function normalizeCapabilities(
  capabilities: CoreAIModelCapabilities | undefined,
  type: CoreAIModelType,
): CoreAIModelCapabilities {
  if (type === "image") {
    return {
      ...capabilities,
      chat: false,
      imageGeneration: true,
    };
  }

  return {
    ...capabilities,
    chat: true,
    imageGeneration: capabilities?.imageGeneration === true,
  };
}

function normalizeProviderConfig(
  provider: CoreAIProviderConfig,
): CoreAIProviderConfig {
  const providerName = assertNonEmpty(provider.provider, "provider");
  const apiUrl = assertNonEmpty(provider.apiUrl, "apiUrl");
  return {
    id: assertNonEmpty(provider.id, "provider id"),
    name: provider.name?.trim() || undefined,
    provider: providerName,
    apiProtocol: normalizeProtocol(provider.apiProtocol, providerName, apiUrl),
    apiKey: typeof provider.apiKey === "string" ? provider.apiKey.trim() : "",
    apiUrl: apiUrl.trim(),
    lastVerifiedAt: provider.lastVerifiedAt,
  };
}

function normalizeModelConfig(model: CoreAIModelConfig): CoreAIModelConfig {
  const modelName = assertNonEmpty(model.model, "model");
  const provider = assertNonEmpty(model.provider, "model provider");
  const apiUrl = assertNonEmpty(model.apiUrl, "model apiUrl");
  const type = model.type === "image" ? "image" : "chat";

  return {
    id: assertNonEmpty(model.id, "model id"),
    type,
    name: model.name?.trim() || undefined,
    providerId: model.providerId?.trim() || undefined,
    provider,
    apiProtocol: normalizeProtocol(model.apiProtocol, provider, apiUrl),
    apiKey: typeof model.apiKey === "string" ? model.apiKey.trim() : "",
    apiUrl: apiUrl.trim(),
    model: modelName,
    isDefault: model.isDefault === true,
    lastVerifiedAt: model.lastVerifiedAt,
    capabilities: normalizeCapabilities(model.capabilities, type),
  };
}

function normalizeRoutes(
  routes: Partial<Record<CoreAIModelRoute, string>> | undefined,
): Partial<Record<CoreAIModelRoute, string>> {
  const next: Partial<Record<CoreAIModelRoute, string>> = {};
  if (!routes || typeof routes !== "object") {
    return next;
  }

  for (const route of MODEL_ROUTES) {
    const modelId = routes[route];
    if (typeof modelId === "string" && modelId.trim()) {
      next[route] = modelId.trim();
    }
  }

  return next;
}

function assertNonEmpty(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new AIConfigError("USAGE_ERROR", `${name} 不能为空`);
  }
  return normalized;
}

export function parseCoreAIConfig(raw: string): CoreAIConfigFile {
  const parsed = JSON.parse(raw) as Partial<CoreAIConfigFile>;
  if (parsed.kind !== "prompthub-ai-config" || parsed.version !== 1) {
    throw new AIConfigError("INVALID_CONFIG", "AI 配置文件格式不受支持");
  }

  return {
    kind: "prompthub-ai-config",
    version: 1,
    updatedAt:
      typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowIso(),
    providers: Array.isArray(parsed.providers)
      ? parsed.providers.map((provider) =>
          normalizeProviderConfig(provider as CoreAIProviderConfig),
        )
      : [],
    models: Array.isArray(parsed.models)
      ? parsed.models.map((model) =>
          normalizeModelConfig(model as CoreAIModelConfig),
        )
      : [],
    modelRouteDefaults: normalizeRoutes(parsed.modelRouteDefaults),
  };
}

export class CoreAIConfigService {
  private settings(): CoreSettingsStore {
    return new CoreSettingsStore({
      database: getDatabase(),
      rootPath: getUserDataPath(),
    });
  }

  read(): CoreAIConfigFile {
    const settings = this.settings().read();
    return parseCoreAIConfig(
      JSON.stringify({
        kind: "prompthub-ai-config",
        version: 1,
        updatedAt: settings.settingsUpdatedAt ?? new Date(0).toISOString(),
        providers: settings.aiProviders,
        models: settings.aiModels,
        modelRouteDefaults: settings.modelRouteDefaults ?? {},
      }),
    );
  }

  write(config: CoreAIConfigFile): CoreAIConfigFile {
    const next = {
      ...config,
      providers: config.providers.map(normalizeProviderConfig),
      models: config.models.map(normalizeModelConfig),
      modelRouteDefaults: normalizeRoutes(config.modelRouteDefaults),
      updatedAt: nowIso(),
    };
    this.settings().patchSettings({
      aiProviders: next.providers,
      aiModels: next.models,
      modelRouteDefaults: next.modelRouteDefaults,
      settingsUpdatedAt: next.updatedAt,
    });
    return next;
  }

  replace(config: {
    providers?: CoreAIProviderConfig[];
    models?: CoreAIModelConfig[];
    modelRouteDefaults?: Partial<Record<CoreAIModelRoute, string>>;
  }): CoreAIConfigFile {
    return this.write({
      kind: "prompthub-ai-config",
      version: 1,
      updatedAt: nowIso(),
      providers: config.providers ?? [],
      models: config.models ?? [],
      modelRouteDefaults: config.modelRouteDefaults ?? {},
    });
  }

  addProvider(input: AddAIProviderInput): CoreAIProviderConfig {
    const config = this.read();
    const provider = assertNonEmpty(input.provider, "--provider");
    const apiKey = assertNonEmpty(input.apiKey, "--api-key");
    const apiUrl = assertNonEmpty(input.apiUrl, "--api-url");
    const nextProvider: CoreAIProviderConfig = {
      id: createId("provider"),
      name: input.name?.trim() || undefined,
      provider,
      apiProtocol: normalizeProtocol(input.apiProtocol, provider, apiUrl),
      apiKey,
      apiUrl,
    };

    this.write({
      ...config,
      providers: [...config.providers, nextProvider],
    });
    return nextProvider;
  }

  deleteProvider(id: string): CoreAIConfigFile {
    const config = this.read();
    const nextProviders = config.providers.filter(
      (provider) => provider.id !== id,
    );
    if (nextProviders.length === config.providers.length) {
      throw new AIConfigError("NOT_FOUND", `AI provider 不存在: ${id}`);
    }
    return this.write({
      ...config,
      providers: nextProviders,
    });
  }

  addModel(input: AddAIModelInput): CoreAIModelConfig {
    const config = this.read();
    const model = assertNonEmpty(input.model, "--model");
    const type = input.type ?? "chat";
    const providerConfig = config.providers.find(
      (provider) =>
        provider.id === input.provider ||
        provider.id === input.providerId ||
        provider.provider === input.provider,
    );

    const provider =
      providerConfig?.provider ?? assertNonEmpty(input.provider, "--provider");
    const apiKey =
      providerConfig?.apiKey ?? assertNonEmpty(input.apiKey, "--api-key");
    const apiUrl =
      providerConfig?.apiUrl ?? assertNonEmpty(input.apiUrl, "--api-url");
    const apiProtocol = normalizeProtocol(
      input.apiProtocol ?? providerConfig?.apiProtocol,
      provider,
      apiUrl,
    );
    const nextModel: CoreAIModelConfig = {
      id: createId("model"),
      type,
      name: input.name?.trim() || undefined,
      providerId: providerConfig?.id ?? (input.providerId?.trim() || undefined),
      provider,
      apiProtocol,
      apiKey,
      apiUrl,
      model,
      isDefault:
        config.models.filter((item) => item.type === type).length === 0,
      capabilities: normalizeCapabilities(input.capabilities, type),
    };

    this.write({
      ...config,
      models: [...config.models, nextModel],
    });
    return nextModel;
  }

  deleteModel(id: string): CoreAIConfigFile {
    const config = this.read();
    const nextModels = config.models.filter((model) => model.id !== id);
    if (nextModels.length === config.models.length) {
      throw new AIConfigError("NOT_FOUND", `AI model 不存在: ${id}`);
    }

    const modelRouteDefaults = { ...config.modelRouteDefaults };
    for (const route of MODEL_ROUTES) {
      if (modelRouteDefaults[route] === id) {
        delete modelRouteDefaults[route];
      }
    }

    return this.write({
      ...config,
      models: nextModels,
      modelRouteDefaults,
    });
  }

  setRoute(route: CoreAIModelRoute, modelId: string): CoreAIConfigFile {
    const config = this.read();
    const model = config.models.find((item) => item.id === modelId);
    if (!model) {
      throw new AIConfigError("NOT_FOUND", `AI model 不存在: ${modelId}`);
    }
    this.assertRouteCompatible(route, model);
    return this.write({
      ...config,
      modelRouteDefaults: {
        ...config.modelRouteDefaults,
        [route]: modelId,
      },
    });
  }

  clearRoute(route: CoreAIModelRoute): CoreAIConfigFile {
    const config = this.read();
    const modelRouteDefaults = { ...config.modelRouteDefaults };
    delete modelRouteDefaults[route];
    return this.write({
      ...config,
      modelRouteDefaults,
    });
  }

  routeSummary(): Record<CoreAIModelRoute, Record<string, unknown>> {
    const config = this.read();
    const summary = {} as Record<CoreAIModelRoute, Record<string, unknown>>;
    for (const route of MODEL_ROUTES) {
      const modelId = config.modelRouteDefaults[route];
      const model = modelId
        ? config.models.find((item) => item.id === modelId)
        : undefined;
      summary[route] = {
        route,
        configured: Boolean(model),
        modelId: model?.id ?? modelId ?? null,
        model: model?.model ?? null,
        provider: model?.provider ?? null,
      };
    }
    return summary;
  }

  private assertRouteCompatible(
    route: CoreAIModelRoute,
    model: CoreAIModelConfig,
  ): void {
    if (route === "imageGeneration") {
      if (
        model.type !== "image" &&
        model.capabilities?.imageGeneration !== true
      ) {
        throw new AIConfigError(
          "ROUTE_CAPABILITY_MISMATCH",
          "imageGeneration 路由需要 image generation 模型",
        );
      }
      return;
    }

    if (model.type !== "chat" || model.capabilities?.chat === false) {
      throw new AIConfigError(
        "ROUTE_CAPABILITY_MISMATCH",
        `${route} 路由需要 chat 模型`,
      );
    }

    if (route === "visionText" && model.capabilities?.vision !== true) {
      throw new AIConfigError(
        "ROUTE_CAPABILITY_MISMATCH",
        "visionText 路由需要启用 vision 能力的 chat 模型",
      );
    }
  }
}

export const coreAIConfigService = new CoreAIConfigService();
