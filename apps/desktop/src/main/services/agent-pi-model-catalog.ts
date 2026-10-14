import type {
  AgentModelCatalogEntry,
  AgentModelCatalogProvider,
  AgentPiProviderApi,
} from "@prompthub/shared/types";
import { sanitizeEndpoint } from "./agent-model-config-io";
import {
  piRecord,
  piString,
  readPiModelSources,
  resolvePiCredential,
  type PiConfigRecord,
  type PiModelCatalogOptions,
  type PiModelSources,
} from "./agent-pi-model-sources";

const MAX_MODEL_ID_LENGTH = 512;
const MAX_PROVIDER_ID_LENGTH = 128;
// Pi 0.83 provider-composer.modelFromJson defaults; only routing inherits the base model.
const PI_CUSTOM_MODEL_DEFAULT_METADATA = {
  reasoning: false,
  input: ["text"],
  contextWindow: 128000,
  maxTokens: 16384,
};

function modelId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id &&
    id.length <= MAX_MODEL_ID_LENGTH &&
    !/[\u0000-\u001f\u007f]/.test(id)
    ? id
    : null;
}
function providerApi(value: string | null): AgentPiProviderApi | null {
  return value === "openai-completions" ||
    value === "openai-responses" ||
    value === "anthropic-messages" ||
    value === "google-generative-ai"
    ? value
    : null;
}
function metadata(
  value: PiConfigRecord,
): Omit<AgentModelCatalogEntry, "id" | "source"> {
  const result: Omit<AgentModelCatalogEntry, "id" | "source"> = {};
  const name = piString(value, "name");
  if (name) result.name = name;
  if (typeof value.reasoning === "boolean") result.reasoning = value.reasoning;
  if (Array.isArray(value.input))
    result.input = value.input.filter(
      (item): item is string => typeof item === "string",
    );
  for (const key of ["contextWindow", "maxTokens"] satisfies (
    | "contextWindow"
    | "maxTokens"
  )[]) {
    const number = value[key];
    if (
      typeof number === "number" &&
      Number.isSafeInteger(number) &&
      number > 0
    )
      result[key] = number;
  }
  if (piRecord(value.thinkingLevelMap)) {
    const map: NonNullable<AgentModelCatalogEntry["thinkingLevelMap"]> = {};
    for (const level of [
      "off",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ] satisfies (keyof typeof map)[]) {
      const mapped = value.thinkingLevelMap[level];
      if (typeof mapped === "string") map[level] = mapped;
      else if (mapped === null) map[level] = null;
    }
    result.thinkingLevelMap = map;
  }
  return result;
}
function catalogModel(
  value: unknown,
  source: AgentModelCatalogEntry["source"],
  provider: PiConfigRecord,
  defaults?: AgentModelCatalogEntry,
): AgentModelCatalogEntry | null {
  if (!piRecord(value)) return null;
  const id = modelId(value.id);
  if (!id) return null;
  const api =
    piString(value, "api") ?? piString(provider, "api") ?? defaults?.api;
  const endpoint =
    sanitizeEndpoint(
      piString(value, "baseUrl") ?? piString(provider, "baseUrl"),
    ) ?? defaults?.endpoint;
  const attributes =
    source === "custom"
      ? { ...PI_CUSTOM_MODEL_DEFAULT_METADATA, name: id }
      : {};
  return {
    ...attributes,
    ...metadata(value),
    id,
    source,
    ...(api ? { api } : {}),
    ...(endpoint ? { endpoint } : {}),
  };
}
function resolvedModels(
  base: AgentModelCatalogEntry[],
  custom: PiConfigRecord,
): AgentModelCatalogEntry[] {
  const endpoint = sanitizeEndpoint(piString(custom, "baseUrl"));
  const models = new Map(
    base.map((model) => [model.id, endpoint ? { ...model, endpoint } : model]),
  );
  for (const value of Array.isArray(custom.models) ? custom.models : []) {
    const id = piRecord(value) ? modelId(value.id) : null;
    const defaults = id
      ? (models.get(id) ?? models.values().next().value)
      : undefined;
    const model = catalogModel(value, "custom", custom, defaults);
    if (model) models.set(model.id, model);
  }
  const overrides = piRecord(custom.modelOverrides)
    ? custom.modelOverrides
    : {};
  return [...models.values()].map((model) => {
    const override = overrides[model.id];
    if (!piRecord(override)) return model;
    const next = metadata(override);
    return {
      ...model,
      ...next,
      ...(next.thinkingLevelMap
        ? {
            thinkingLevelMap: {
              ...model.thinkingLevelMap,
              ...next.thinkingLevelMap,
            },
          }
        : {}),
    };
  });
}
function buildProvider(
  id: string,
  builtIn: PiConfigRecord | null,
  custom: PiConfigRecord | null,
  sources: PiModelSources,
  environment: Readonly<Record<string, string | undefined>>,
): AgentModelCatalogProvider {
  const base = (Array.isArray(builtIn?.models) ? builtIn.models : [])
    .map((model) => catalogModel(model, "built-in", builtIn ?? {}))
    .filter((model): model is AgentModelCatalogEntry => model !== null);
  const models = custom ? resolvedModels(base, custom) : base;
  const credential = resolvePiCredential(id, sources, environment);
  const apis = new Set(models.map((model) => model.api));
  const oauthReady =
    credential.platformManaged &&
    Boolean(
      piString(sources.auth[id], "access") ||
      piString(sources.auth[id], "refresh"),
    );
  return {
    id,
    models,
    source: custom ? "custom" : "built-in",
    api:
      apis.size === 1
        ? providerApi(models[0]?.api ?? null)
        : providerApi(piString(custom, "api") ?? piString(builtIn, "api")),
    endpoint:
      sanitizeEndpoint(
        piString(custom, "baseUrl") ?? piString(builtIn, "baseUrl"),
      ) ??
      models[0]?.endpoint ??
      null,
    credentialReady: Boolean(credential.key) || oauthReady,
    credentialSource: credential.source,
  };
}
export function buildPiModelCatalog(
  sources: PiModelSources,
  environment: Readonly<Record<string, string | undefined>>,
): AgentModelCatalogProvider[] {
  const custom = piRecord(sources.custom.providers)
    ? sources.custom.providers
    : {};
  const providers: AgentModelCatalogProvider[] = [];
  for (const id of new Set([
    ...Object.keys(sources.builtIn),
    ...Object.keys(custom),
  ])) {
    if (
      !id.trim() ||
      id.length > MAX_PROVIDER_ID_LENGTH ||
      /[\u0000-\u001f\u007f]/.test(id)
    )
      continue;
    const base = sources.builtIn[id];
    const override = custom[id];
    if (!piRecord(base) && !piRecord(override)) continue;
    providers.push(
      buildProvider(
        id,
        piRecord(base) ? base : null,
        piRecord(override) ? override : null,
        sources,
        environment,
      ),
    );
  }
  return providers;
}
export async function inspectPiModelCatalog(
  rootPath: string,
  options: PiModelCatalogOptions = {},
): Promise<AgentModelCatalogProvider[]> {
  return buildPiModelCatalog(
    await readPiModelSources(rootPath, options),
    options.environment ?? process.env,
  );
}
