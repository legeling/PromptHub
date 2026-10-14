import {
  applyEdits,
  modify,
  parse as parseJsonc,
  type ParseError,
} from "jsonc-parser";

import { sanitizeEndpoint } from "./agent-model-config-io";

export type JsonRecord = Record<string, unknown>;
export type OpenCodeAuthOwnership = "api" | "oauth" | "wellknown" | "missing";

export interface OpenCodeActiveProjection {
  providerId: string | null;
  packageName: string | null;
  endpoint: string | null;
  model: string | null;
  secondaryModel: string | null;
  authOwnership: OpenCodeAuthOwnership;
  credentialStatus: "platform-managed" | "missing";
  authorizationHeaderConflict: boolean;
  v2ProviderConfig: boolean;
}

export interface OpenCodeDirectProjection {
  providerId: string;
  packageName: "@ai-sdk/openai-compatible" | "@ai-sdk/openai";
  endpoint: string;
  name: string;
  model: string;
  secondaryModel: string | null;
}

const formatting = { insertSpaces: true, tabSize: 2, eol: "\n" };

export function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordAt(value: unknown, key: string): JsonRecord | undefined {
  return isJsonRecord(value) && isJsonRecord(value[key])
    ? (value[key] as JsonRecord)
    : undefined;
}

function textAt(value: unknown, key: string): string | null {
  if (!isJsonRecord(value) || typeof value[key] !== "string") return null;
  return (value[key] as string).trim() || null;
}

export function parseOpenCodeConfig(raw: string): JsonRecord {
  const errors: ParseError[] = [];
  const parsed = parseJsonc(raw, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length > 0 || !isJsonRecord(parsed)) {
    throw new Error("AGENT_OPENCODE_PROVIDER_CONFIG_INVALID");
  }
  return parsed;
}

export function parseOpenCodeAuth(raw: string): JsonRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AGENT_OPENCODE_PROVIDER_AUTH_INVALID");
  }
  if (!isJsonRecord(parsed)) {
    throw new Error("AGENT_OPENCODE_PROVIDER_AUTH_INVALID");
  }
  return parsed;
}

function splitModel(value: string | null): {
  providerId: string | null;
  model: string | null;
} {
  if (!value) return { providerId: null, model: null };
  const slash = value.indexOf("/");
  if (slash <= 0 || slash === value.length - 1) {
    return { providerId: null, model: value };
  }
  return {
    providerId: value.slice(0, slash),
    model: value.slice(slash + 1),
  };
}

function stripProvider(value: string | null, providerId: string | null) {
  if (!value || !providerId) return value;
  const prefix = `${providerId}/`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function authOwnership(
  auth: JsonRecord,
  providerId: string | null,
): OpenCodeAuthOwnership {
  if (!providerId) return "missing";
  const entry = auth[providerId];
  if (!isJsonRecord(entry)) return "missing";
  const type = textAt(entry, "type");
  return type === "api" || type === "oauth" || type === "wellknown"
    ? type
    : "missing";
}

function hasAuthorizationHeader(value: unknown): boolean {
  if (!isJsonRecord(value)) return false;
  return Object.keys(value).some(
    (key) => key.toLowerCase() === "authorization",
  );
}

function providerAuthorizationHeaderConflict(
  provider: JsonRecord | undefined,
): boolean {
  if (!provider) return false;
  if (
    hasAuthorizationHeader(recordAt(provider, "headers")) ||
    hasAuthorizationHeader(recordAt(recordAt(provider, "options"), "headers"))
  ) {
    return true;
  }
  const models = recordAt(provider, "models");
  return Boolean(
    models &&
    Object.values(models).some(
      (model) =>
        hasAuthorizationHeader(recordAt(model, "headers")) ||
        hasAuthorizationHeader(recordAt(recordAt(model, "options"), "headers")),
    ),
  );
}

export function projectOpenCodeState(
  config: JsonRecord,
  auth: JsonRecord,
): OpenCodeActiveProjection {
  const primary = splitModel(textAt(config, "model"));
  const providerId = primary.providerId;
  const provider = providerId
    ? recordAt(recordAt(config, "provider"), providerId)
    : undefined;
  const options = recordAt(provider, "options");
  const ownership = authOwnership(auth, providerId);
  return {
    providerId,
    packageName: textAt(provider, "npm"),
    endpoint: sanitizeEndpoint(
      textAt(options, "baseURL") ?? textAt(options, "baseUrl"),
    ),
    model: primary.model,
    secondaryModel: stripProvider(textAt(config, "small_model"), providerId),
    authOwnership: ownership,
    credentialStatus: ownership === "missing" ? "missing" : "platform-managed",
    authorizationHeaderConflict: providerAuthorizationHeaderConflict(provider),
    v2ProviderConfig: isJsonRecord(config.providers),
  };
}

function edit(raw: string, segments: (string | number)[], value: unknown) {
  return applyEdits(
    raw,
    modify(raw, segments, value, { formattingOptions: formatting }),
  );
}

export function renderOpenCodeSelection(
  original: string | null,
  providerId: string,
  model: string,
  secondaryModel: string | null,
  inheritedSecondary = false,
): string {
  let next = edit(original ?? "{}\n", ["model"], `${providerId}/${model}`);
  next = edit(
    next,
    ["small_model"],
    secondaryModel
      ? `${providerId}/${secondaryModel}`
      : inheritedSecondary
        ? ""
        : undefined,
  );
  return next.endsWith("\n") ? next : `${next}\n`;
}

function existingModel(
  config: JsonRecord,
  providerId: string,
  modelId: string,
): JsonRecord {
  const models = recordAt(
    recordAt(recordAt(config, "provider"), providerId),
    "models",
  );
  const model = models?.[modelId];
  return isJsonRecord(model) ? model : {};
}

export function renderOpenCodeConfig(
  original: string | null,
  config: JsonRecord,
  desired: OpenCodeDirectProjection,
  inheritedSecondary = false,
): string {
  let next = original ?? "{}\n";
  const providerPath = ["provider", desired.providerId];
  next = edit(next, [...providerPath, "name"], desired.name);
  next = edit(next, [...providerPath, "npm"], desired.packageName);
  next = edit(next, [...providerPath, "options", "baseURL"], desired.endpoint);
  const options = recordAt(
    recordAt(recordAt(config, "provider"), desired.providerId),
    "options",
  );
  if (options && Object.hasOwn(options, "baseUrl")) {
    next = edit(next, [...providerPath, "options", "baseUrl"], undefined);
  }
  if (options && Object.hasOwn(options, "apiKey")) {
    next = edit(next, [...providerPath, "options", "apiKey"], undefined);
  }
  const modelIds = [desired.model, desired.secondaryModel].filter(
    (value): value is string => Boolean(value),
  );
  for (const modelId of modelIds) {
    next = edit(next, [...providerPath, "models", modelId], {
      ...existingModel(config, desired.providerId, modelId),
      name:
        textAt(existingModel(config, desired.providerId, modelId), "name") ??
        modelId,
    });
  }
  next = renderOpenCodeSelection(
    next,
    desired.providerId,
    desired.model,
    desired.secondaryModel,
    inheritedSecondary,
  );
  parseOpenCodeConfig(next);
  return next.endsWith("\n") ? next : `${next}\n`;
}

export function renderOpenCodeAuth(
  auth: JsonRecord,
  providerId: string,
  secret: string,
): string {
  return `${JSON.stringify(
    {
      ...auth,
      [providerId]: { type: "api", key: secret },
    },
    null,
    2,
  )}\n`;
}
