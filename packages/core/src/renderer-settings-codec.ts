import {
  APP_SETTING_KEYS,
  PROVIDER_SETTING_KEYS,
  SYNC_SETTING_KEYS,
  FLAT_SECRET_FIELDS,
  DEVICE_RENDERER_SETTING_KEYS,
} from "./renderer-persistence-policy";
import { requireSafeId } from "./renderer-persistence-validation";

const PUBLIC_SETTING_KEYS = new Set([
  ...APP_SETTING_KEYS,
  ...PROVIDER_SETTING_KEYS,
  ...SYNC_SETTING_KEYS,
]);
export const RENDERER_SETTING_KEYS = [
  ...new Set([
    ...PUBLIC_SETTING_KEYS,
    ...FLAT_SECRET_FIELDS,
    "aiProviders",
    "aiModels",
    "networkProxy",
    "sync",
  ]),
];

export interface EncodedRendererSettings {
  settings: Record<string, unknown>;
  secrets: Record<string, string>;
}

export function portableRendererSettings(input: Record<string, unknown>): Record<string, unknown> {
  const { settings } = encodeRendererSettings(input);
  for (const key of DEVICE_RENDERER_SETTING_KEYS) delete settings[key];
  for (const key of ["aiProviders", "aiModels"]) {
    if (!Array.isArray(settings[key])) throw new Error("Invalid AI settings collection");
    settings[key] = settings[key].map((entry: unknown) => {
      const { apiKeyRef: _apiKeyRef, ...value } = record(entry, "AI entry");
      return value;
    });
  }
  return settings;
}

export function mergePortableRendererSettings(
  current: Record<string, unknown>, incoming: Record<string, unknown>,
): Record<string, unknown> {
  const portable = portableRendererSettings(incoming);
  const result = { ...current };
  for (const key of RENDERER_SETTING_KEYS)
    if (!DEVICE_RENDERER_SETTING_KEYS.has(key)) delete result[key];
  Object.assign(result, portable);
  for (const key of ["aiProviders", "aiModels"]) {
    const local = new Map((Array.isArray(current[key]) ? current[key] : []).map((entry: unknown) => {
      const value = record(entry, "local AI entry");
      return [value.id, value.apiKey];
    }));
    const entries = result[key];
    if (!Array.isArray(entries)) throw new Error("Invalid portable AI collection");
    result[key] = entries.map((entry: unknown) => {
      const value = record(entry, "portable AI entry"), apiKey = local.get(value.id);
      return typeof apiKey === "string" && apiKey ? { ...value, apiKey } : value;
    });
  }
  return result;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`Invalid ${label}`);
  return value as Record<string, unknown>; // The object shape is validated before its fields are read.
}

function captureSecret(
  value: unknown,
  ref: string,
  secrets: Record<string, string>,
): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (
    typeof value !== "string" ||
    /[\u0000-\u001f]/.test(value)
  )
    throw new Error("Invalid settings secret");
  if (!value.trim()) return false;
  secrets[ref] = value.trim();
  return true;
}

function encodeModels(
  value: unknown,
  kind: "provider" | "model",
  secrets: Record<string, string>,
): Record<string, unknown>[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`Invalid AI ${kind} collection`);
  const ids = new Set<string>();
  return value.map((entry) => {
    const result = { ...record(entry, `AI ${kind}`) };
    const id = requireSafeId(result.id, `${kind} id`);
    if (ids.has(id)) throw new Error(`Duplicate AI ${kind} identity`);
    ids.add(id);
    if ("apiKeyRef" in result)
      throw new Error("Secret references are not public settings inputs");
    const ref = `renderer:ai-${kind}:${id}:api-key`;
    if (captureSecret(result.apiKey, ref, secrets)) result.apiKeyRef = ref;
    delete result.apiKey;
    return result;
  });
}

function encodeConnection(
  value: unknown,
  domain: "networkProxy" | "sync",
  secrets: Record<string, string>,
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  const proxy = { ...record(value, domain) };
  for (const field of ["username", "password"] as const) {
    if (`${field}Ref` in proxy)
      throw new Error("Secret references are not public settings inputs");
    const ref = `renderer:${domain}:${field}`;
    if (captureSecret(proxy[field], ref, secrets)) proxy[`${field}Ref`] = ref;
    delete proxy[field];
  }
  return proxy;
}

export function encodeRendererSettings(
  input: Record<string, unknown>,
): EncodedRendererSettings {
  const settings: Record<string, unknown> = Object.fromEntries(
    Object.entries(input)
      .filter(
        ([key, value]) => PUBLIC_SETTING_KEYS.has(key) && value !== undefined,
      )
      .map(([key, value]) => {
        if (typeof value === "function" || typeof value === "symbol")
          throw new Error(`Invalid renderer setting ${key}`);
        return [key, value];
      }),
  );
  const secrets: Record<string, string> = {};
  for (const field of FLAT_SECRET_FIELDS) {
    const ref = `renderer:${field}`;
    if (captureSecret(input[field], ref, secrets))
      settings[field] = { secretRef: ref };
  }
  settings.modelRouteDefaults = input.modelRouteDefaults ?? {};
  settings.aiProviders = encodeModels(input.aiProviders, "provider", secrets);
  settings.aiModels = encodeModels(input.aiModels, "model", secrets);
  for (const domain of ["networkProxy", "sync"] as const) {
    const connection = encodeConnection(input[domain], domain, secrets);
    if (connection !== undefined) settings[domain] = connection;
  }
  // Validate metadata before publication; secrets have already been removed from this object.
  return {
    settings: record(JSON.parse(JSON.stringify(settings)), "settings"),
    secrets,
  };
}

function readSecret(ref: unknown, secrets: Record<string, string>): string {
  if (
    typeof ref !== "string" ||
    !Object.prototype.hasOwnProperty.call(secrets, ref)
  )
    throw new Error("Missing settings secret reference");
  return secrets[ref];
}

function decodeModels(
  value: unknown,
  secrets: Record<string, string>,
): Record<string, unknown>[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Invalid stored AI collection");
  return value.map((entry) => {
    const result = { ...record(entry, "stored AI entry") };
    if ("apiKey" in result)
      throw new Error("Unprotected AI secret in settings");
    if ("apiKeyRef" in result) {
      result.apiKey = readSecret(result.apiKeyRef, secrets);
      delete result.apiKeyRef;
    }
    return result;
  });
}

export function decodeRendererSettings(
  input: Record<string, unknown>,
  secrets: Record<string, string>,
): Record<string, unknown> {
  const result = { ...input };
  for (const field of FLAT_SECRET_FIELDS) {
    if (!(field in input)) continue;
    if (typeof input[field] !== "object" || input[field] === null)
      throw new Error("Unprotected secret in settings");
    result[field] = readSecret(
      record(input[field], "stored secret reference").secretRef,
      secrets,
    );
  }
  result.modelRouteDefaults = input.modelRouteDefaults ?? {};
  result.aiProviders = decodeModels(input.aiProviders, secrets);
  result.aiModels = decodeModels(input.aiModels, secrets);
  for (const domain of ["networkProxy", "sync"] as const) {
    if (input[domain] === undefined) continue;
    const proxy = { ...record(input[domain], `stored ${domain}`) };
    for (const field of ["username", "password"] as const) {
      if (field in proxy)
        throw new Error("Unprotected proxy secret in settings");
      if (`${field}Ref` in proxy) {
        proxy[field] = readSecret(proxy[`${field}Ref`], secrets);
        delete proxy[`${field}Ref`];
      }
    }
    result[domain] = proxy;
  }
  return result;
}
