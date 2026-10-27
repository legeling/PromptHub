import {
  applyEdits,
  modify,
  findNodeAtLocation,
  parseTree,
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
  v2ProviderConfig?: boolean;
  secret?: string;
}

const NATIVE_PACKAGES: Record<string, string> = {
  "@ai-sdk/openai-compatible": "@opencode/ai/providers/openai-compatible",
  "@ai-sdk/openai": "@opencode/ai/providers/openai",
};

function canonicalPackage(value: string | null): string | null {
  if (!value) return null;
  const native = Object.entries(NATIVE_PACKAGES).find(
    ([, name]) => name === value,
  );
  return (
    native?.[0] ??
    (value.startsWith("aisdk:") ? value.slice("aisdk:".length) : value)
  );
}

export function openCodeProvider(
  config: JsonRecord,
  providerId: string,
): JsonRecord | undefined {
  return (
    recordAt(recordAt(config, "providers"), providerId) ??
    recordAt(recordAt(config, "provider"), providerId)
  );
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
    ? openCodeProvider(config, providerId)
    : undefined;
  const native = Boolean(
    providerId && recordAt(recordAt(config, "providers"), providerId),
  );
  const options = recordAt(provider, native ? "settings" : "options");
  const ownership = textAt(options, "apiKey")
    ? "api"
    : authOwnership(auth, providerId);
  return {
    providerId,
    packageName: canonicalPackage(textAt(provider, native ? "package" : "npm")),
    endpoint: sanitizeEndpoint(
      textAt(options, "baseURL") ?? textAt(options, "baseUrl"),
    ),
    model: primary.model,
    secondaryModel: stripProvider(
      textAt(recordAt(recordAt(config, "agents"), "title"), "model") ??
        textAt(config, "small_model"),
      providerId,
    ),
    authOwnership: ownership,
    credentialStatus: ownership === "missing" ? "missing" : "platform-managed",
    authorizationHeaderConflict: providerAuthorizationHeaderConflict(provider),
    v2ProviderConfig: isJsonRecord(config.providers),
  };
}

function edit(raw: string, segments: (string | number)[], value: unknown) {
  if (value === undefined && !findNodeAtLocation(parseTree(raw), segments))
    return raw;
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
  native = false,
): string {
  let next = edit(original ?? "{}\n", ["model"], `${providerId}/${model}`);
  next = edit(
    next,
    native ? ["agents", "title", "model"] : ["small_model"],
    secondaryModel
      ? `${providerId}/${secondaryModel}`
      : inheritedSecondary
        ? ""
        : undefined,
  );
  if (native) next = edit(next, ["small_model"], undefined);
  return next.endsWith("\n") ? next : `${next}\n`;
}

function existingModel(
  config: JsonRecord,
  providerId: string,
  modelId: string,
  native: boolean,
): JsonRecord {
  const models = recordAt(
    recordAt(recordAt(config, native ? "providers" : "provider"), providerId),
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
  const native = desired.v2ProviderConfig === true;
  const providerPath = [native ? "providers" : "provider", desired.providerId];
  const optionsKey = native ? "settings" : "options";
  next = edit(next, [...providerPath, "name"], desired.name);
  next = edit(
    next,
    [...providerPath, native ? "package" : "npm"],
    native ? NATIVE_PACKAGES[desired.packageName] : desired.packageName,
  );
  next = edit(next, [...providerPath, optionsKey, "baseURL"], desired.endpoint);
  const options = recordAt(
    recordAt(
      recordAt(config, native ? "providers" : "provider"),
      desired.providerId,
    ),
    optionsKey,
  );
  if (options && Object.hasOwn(options, "baseUrl")) {
    next = edit(next, [...providerPath, optionsKey, "baseUrl"], undefined);
  }
  if (native || (options && Object.hasOwn(options, "apiKey"))) {
    next = edit(
      next,
      [...providerPath, optionsKey, "apiKey"],
      native ? desired.secret : undefined,
    );
  }
  const modelIds = [desired.model, desired.secondaryModel].filter(
    (value): value is string => Boolean(value),
  );
  for (const modelId of modelIds) {
    next = edit(next, [...providerPath, "models", modelId], {
      ...existingModel(config, desired.providerId, modelId, native),
      name:
        textAt(
          existingModel(config, desired.providerId, modelId, native),
          "name",
        ) ?? modelId,
    });
  }
  next = renderOpenCodeSelection(
    next,
    desired.providerId,
    desired.model,
    desired.secondaryModel,
    inheritedSecondary,
    native,
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
