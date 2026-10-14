import path from "node:path";
import { parse as parseJsonc, type ParseError } from "jsonc-parser";
import type { AgentModelCatalogProvider } from "@prompthub/shared/types";
import type { NativeCommandRunner } from "./native-command";
import { fileExists, readTextConfig } from "./agent-model-config-io";
import { readPiNativeCatalog } from "./agent-pi-native-catalog";

export const PI_MODEL_CONFIG_FILES = {
  catalog: "models-store.json",
  models: "models.json",
  auth: "auth.json",
};
export type PiConfigRecord = Record<string, unknown>;
export interface PiModelCatalogOptions {
  environment?: Readonly<Record<string, string | undefined>>;
  resolveExecutable?: NativeCommandRunner["resolve"];
}
export interface PiModelSources {
  builtIn: PiConfigRecord;
  custom: PiConfigRecord;
  auth: PiConfigRecord;
}
export interface PiCredentialResolution {
  source: NonNullable<AgentModelCatalogProvider["credentialSource"]>;
  key: string | null;
  platformManaged: boolean;
  command: boolean;
}
export function piRecord(value: unknown): value is PiConfigRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function piString(value: unknown, key: string): string | null {
  if (!piRecord(value)) return null;
  const entry = value[key];
  return typeof entry === "string" && entry.trim() ? entry.trim() : null;
}
export async function readPiJsonConfig(
  absolutePath: string,
): Promise<PiConfigRecord | null> {
  if (!(await fileExists(absolutePath))) return null;
  try {
    const errors: ParseError[] = [];
    const parsed: unknown = parseJsonc(
      await readTextConfig(absolutePath),
      errors,
      {
        allowTrailingComma: true,
        disallowComments: false,
      },
    );
    if (errors.length === 0 && piRecord(parsed)) return parsed;
    console.warn(`Invalid Pi JSON configuration: ${absolutePath}`);
  } catch (error) {
    console.warn(`Cannot read Pi configuration: ${absolutePath}`, error);
  }
  return null;
}
export async function readPiModelSources(
  rootPath: string,
  options: PiModelCatalogOptions,
): Promise<PiModelSources> {
  const builtIn = await readPiNativeCatalog(options.resolveExecutable);
  const cached = await readPiJsonConfig(
    path.join(rootPath, PI_MODEL_CONFIG_FILES.catalog),
  );
  return {
    builtIn: { ...builtIn, ...cached },
    custom:
      (await readPiJsonConfig(
        path.join(rootPath, PI_MODEL_CONFIG_FILES.models),
      )) ?? {},
    auth:
      (await readPiJsonConfig(
        path.join(rootPath, PI_MODEL_CONFIG_FILES.auth),
      )) ?? {},
  };
}
function configCredential(
  raw: string,
  environment: Readonly<Record<string, string | undefined>>,
): PiCredentialResolution {
  if (raw.startsWith("!"))
    return {
      source: "provider-config",
      key: null,
      platformManaged: false,
      command: true,
    };
  let missing = false;
  let referenced = false;
  const key = raw.replace(
    /\$([$!])|\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (
      _,
      escaped: string | undefined,
      braced: string | undefined,
      plain: string | undefined,
    ) => {
      if (escaped) return escaped;
      referenced = true;
      const name = braced ?? plain;
      const value = name ? environment[name] : undefined;
      if (!value?.trim()) missing = true;
      return value ?? "";
    },
  );
  return {
    source: referenced ? "environment" : "provider-config",
    key: missing ? null : key.trim() || null,
    platformManaged: false,
    command: false,
  };
}
export function resolvePiCredential(
  providerId: string,
  sources: PiModelSources,
  environment: Readonly<Record<string, string | undefined>>,
): PiCredentialResolution {
  const stored = sources.auth[providerId];
  const key = piString(stored, "key");
  if (piString(stored, "type") === "api_key" && key) {
    const storedEnvironment =
      piRecord(stored) && piRecord(stored.env) ? stored.env : {};
    const resolvedEnvironment = { ...environment };
    for (const [name, value] of Object.entries(storedEnvironment)) {
      if (typeof value === "string" && value) resolvedEnvironment[name] = value;
    }
    return { ...configCredential(key, resolvedEnvironment), source: "auth" };
  }
  if (piString(stored, "type") === "oauth")
    return { source: "auth", key: null, platformManaged: true, command: false };
  const providers = piRecord(sources.custom.providers)
    ? sources.custom.providers
    : {};
  const raw = piString(providers[providerId], "apiKey");
  return raw
    ? configCredential(raw, environment)
    : { source: "missing", key: null, platformManaged: false, command: false };
}
