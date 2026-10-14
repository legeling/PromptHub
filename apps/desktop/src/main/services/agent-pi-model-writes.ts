import path from "node:path";
import { applyEdits, modify } from "jsonc-parser";
import { parse as parseJsonc, type ParseError } from "jsonc-parser";

import { normalizeAgentProviderEndpoint } from "@prompthub/shared/utils/agent-provider-config";
import type {
  AgentPiCustomModelInput,
  AgentPiCustomModelUpdateInput,
  AgentPiCustomProviderInput,
  AgentPiCustomProviderUpdateInput,
  AgentPiWriteResult,
} from "@prompthub/shared/types";

import { fileExists, readTextConfig } from "./agent-model-config-io";
import { PI_MODEL_CONFIG_FILES } from "./agent-pi-model-sources";
import {
  assertConfigUnchanged,
  atomicWrite,
  createBackup,
  restoreModelConfig,
} from "./agent-model-config";

/**
 * Pi custom provider/model writes.
 *
 * All writes target `~/.pi/agent/models.json` (user custom catalog) and
 * `~/.pi/agent/auth.json` (credential projection). Both go through the shared
 * backup -> digest check -> atomic write -> re-read verify -> rollback
 * pipeline. Plaintext keys are never written to models.json and never
 * returned from any function in this module.
 */

const PROVIDER_ID_PATTERN = /^[a-z0-9]([a-z0-9._-]{0,126}[a-z0-9])?$/;
const MODEL_ID_MAX_LENGTH = 512;
const MAX_SECRET_LENGTH = 10 * 1024;

const PI_APIS = new Set([
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
]);

export interface PiWriteOptions {
  backupRoot: string;
  /** Test-only fault-injection hook fired after edits are computed and
   * before the digest check, so concurrent modifications are deterministic. */
  hooks?: {
    beforeWrite?: () => Promise<void>;
    beforeCredentialWrite?: () => Promise<void>;
  };
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(code: string): never {
  throw new Error(`AGENT_PI_${code}`);
}

function requireProviderId(value: string): string {
  const providerId = value.trim();
  if (!PROVIDER_ID_PATTERN.test(providerId)) fail("PROVIDER_ID_INVALID");
  return providerId;
}

function requireModelId(value: string): string {
  const id = value.trim();
  if (
    !id ||
    id.length > MODEL_ID_MAX_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(id)
  ) {
    fail("MODEL_ID_INVALID");
  }
  return id;
}

function normalizeModelInput(model: AgentPiCustomModelInput): JsonRecord {
  const id = requireModelId(model.id);
  const entry: JsonRecord = { id };
  if (model.name !== undefined) {
    const name = model.name.trim();
    if (!name || name.length > 200) fail("MODEL_NAME_INVALID");
    entry.name = name;
  }
  if (model.reasoning !== undefined) {
    if (typeof model.reasoning !== "boolean") fail("MODEL_REASONING_INVALID");
    entry.reasoning = model.reasoning;
  }
  if (model.input !== undefined) {
    if (
      !Array.isArray(model.input) ||
      model.input.some((item) => typeof item !== "string" || !item.trim())
    ) {
      fail("MODEL_INPUT_INVALID");
    }
    entry.input = model.input.map((item) => item.trim());
  }
  if (model.contextWindow !== undefined) {
    if (
      !Number.isSafeInteger(model.contextWindow) ||
      model.contextWindow < 1 ||
      model.contextWindow > 10_000_000
    ) {
      fail("MODEL_CONTEXT_INVALID");
    }
    entry.contextWindow = model.contextWindow;
  }
  if (model.maxTokens !== undefined) {
    if (
      !Number.isSafeInteger(model.maxTokens) ||
      model.maxTokens < 1 ||
      model.maxTokens > 10_000_000
    ) {
      fail("MODEL_TOKENS_INVALID");
    }
    entry.maxTokens = model.maxTokens;
  }
  return entry;
}

function normalizeProviderInput(input: AgentPiCustomProviderInput): {
  providerId: string;
  value: JsonRecord;
} {
  const providerId = requireProviderId(input.providerId);
  let baseUrl: string;
  try {
    baseUrl = normalizeAgentProviderEndpoint(input.baseUrl) ?? "";
  } catch {
    fail("ENDPOINT_INVALID");
  }
  if (!baseUrl) fail("ENDPOINT_INVALID");
  if (!PI_APIS.has(input.api)) fail("API_INVALID");
  if (!Array.isArray(input.models) || input.models.length === 0) {
    fail("MODELS_REQUIRED");
  }
  const models = input.models.map(normalizeModelInput);
  const ids = new Set(models.map((model) => String(model.id)));
  if (ids.size !== models.length) fail("MODEL_ID_DUPLICATE");

  const value: JsonRecord = { baseUrl, api: input.api, models };
  if (input.apiKeyRef !== undefined && input.apiKeyRef !== "") {
    const ref = input.apiKeyRef.trim();
    // Only "$ENV" references may be written to models.json; literal keys go
    // through setPiCredential into auth.json instead.
    if (!/^\$[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(ref)) fail("KEY_REF_INVALID");
    value.apiKey = ref;
  }
  return { providerId, value };
}

function parseJsonObject(raw: string): JsonRecord {
  const errors: ParseError[] = [];
  const parsed = parseJsonc(raw, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length > 0 || !isRecord(parsed)) fail("FILE_INVALID");
  return parsed;
}

interface JsonWriteContext {
  absolutePath: string;
  raw: string;
  original: string | null;
}

async function readJsonTarget(absolutePath: string): Promise<JsonWriteContext> {
  if (await fileExists(absolutePath)) {
    const raw = await readTextConfig(absolutePath);
    parseJsonObject(raw);
    return { absolutePath, raw, original: raw };
  }
  return { absolutePath, raw: "{}\n", original: null };
}

async function applyJsonWrite(
  context: JsonWriteContext,
  options: PiWriteOptions,
  pathSegments: (string | number)[],
  nextValue: unknown,
  verify: (written: JsonRecord) => boolean,
): Promise<AgentPiWriteResult> {
  let backupPath: string | null = null;
  try {
    backupPath = await createBackup(
      context.absolutePath,
      options.backupRoot,
      "pi",
    );
  } catch {
    fail("BACKUP_FAILED");
  }
  const edits = modify(context.raw, pathSegments, nextValue, {
    formattingOptions: { insertFinalNewline: true },
  });
  const next = applyEdits(context.raw, edits);
  const written = parseJsonObject(next);
  if (!verify(written)) fail("VERIFY_FAILED");
  await options.hooks?.beforeWrite?.();
  await assertConfigUnchanged(context.absolutePath, context.original);
  try {
    await atomicWrite(context.absolutePath, next);
  } catch {
    await restoreModelConfig(context.absolutePath, context.original).catch(
      () => undefined,
    );
    fail("WRITE_FAILED");
  }
  return { backupPath };
}

function prepareJsonWrite(
  context: JsonWriteContext,
  pathSegments: (string | number)[],
  nextValue: unknown,
  verify: (written: JsonRecord) => boolean,
): string {
  const edits = modify(context.raw, pathSegments, nextValue, {
    formattingOptions: { insertFinalNewline: true },
  });
  const next = applyEdits(context.raw, edits);
  const written = parseJsonObject(next);
  if (!verify(written)) fail("VERIFY_FAILED");
  return next;
}

async function backupJsonTarget(
  context: JsonWriteContext,
  backupRoot: string,
): Promise<string | null> {
  try {
    return await createBackup(context.absolutePath, backupRoot, "pi");
  } catch {
    fail("BACKUP_FAILED");
  }
}

function requireSecret(secret: string): string {
  if (
    typeof secret !== "string" ||
    !secret ||
    secret.length > MAX_SECRET_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(secret)
  ) {
    fail("SECRET_INVALID");
  }
  return secret;
}

async function commitPiImport(
  modelsContext: JsonWriteContext,
  authContext: JsonWriteContext,
  nextModels: string,
  nextAuth: string,
  options: PiWriteOptions,
): Promise<AgentPiWriteResult> {
  const backupPath = await backupJsonTarget(modelsContext, options.backupRoot);
  await backupJsonTarget(authContext, options.backupRoot);
  await options.hooks?.beforeWrite?.();
  await assertConfigUnchanged(
    modelsContext.absolutePath,
    modelsContext.original,
  );
  await assertConfigUnchanged(authContext.absolutePath, authContext.original);

  try {
    await atomicWrite(modelsContext.absolutePath, nextModels);
    await options.hooks?.beforeCredentialWrite?.();
    await atomicWrite(authContext.absolutePath, nextAuth);
  } catch {
    await Promise.all([
      restoreModelConfig(modelsContext.absolutePath, modelsContext.original),
      restoreModelConfig(authContext.absolutePath, authContext.original),
    ]).catch(() => undefined);
    fail("WRITE_FAILED");
  }
  return { backupPath };
}

function providersOf(record: JsonRecord): JsonRecord {
  const providers = record.providers;
  return isRecord(providers) ? providers : {};
}

export async function addPiCustomProvider(
  rootPath: string,
  input: AgentPiCustomProviderInput,
  options: PiWriteOptions,
): Promise<AgentPiWriteResult> {
  const { providerId, value } = normalizeProviderInput(input);
  const context = await readJsonTarget(
    path.join(rootPath, PI_MODEL_CONFIG_FILES.models),
  );
  const existing = providersOf(parseJsonObject(context.raw));
  if (isRecord(existing[providerId])) fail("PROVIDER_EXISTS");
  return applyJsonWrite(
    context,
    options,
    ["providers", providerId],
    value,
    (written) => isRecord(providersOf(written)[providerId]),
  );
}

export async function addPiProviderOverride(
  rootPath: string,
  providerIdInput: string,
  modelIdInput: string,
  options: PiWriteOptions,
): Promise<AgentPiWriteResult> {
  const providerId = requireProviderId(providerIdInput);
  const modelId = requireModelId(modelIdInput);

  const context = await readJsonTarget(
    path.join(rootPath, PI_MODEL_CONFIG_FILES.models),
  );
  const existing = providersOf(parseJsonObject(context.raw));
  if (isRecord(existing[providerId])) fail("PROVIDER_EXISTS");
  return applyJsonWrite(
    context,
    options,
    ["providers", providerId],
    { modelOverrides: { [modelId]: {} } },
    (written) => isRecord(providersOf(written)[providerId]),
  );
}

export async function importPiCustomProvider(
  rootPath: string,
  input: AgentPiCustomProviderInput,
  secret: string | undefined,
  options: PiWriteOptions,
): Promise<AgentPiWriteResult> {
  if (!secret) return addPiCustomProvider(rootPath, input, options);

  const { providerId, value } = normalizeProviderInput(input);
  const managedSecret = requireSecret(secret);
  const modelsContext = await readJsonTarget(
    path.join(rootPath, PI_MODEL_CONFIG_FILES.models),
  );
  const authContext = await readJsonTarget(
    path.join(rootPath, PI_MODEL_CONFIG_FILES.auth),
  );
  if (isRecord(providersOf(parseJsonObject(modelsContext.raw))[providerId])) {
    fail("PROVIDER_EXISTS");
  }

  const nextModels = prepareJsonWrite(
    modelsContext,
    ["providers", providerId],
    value,
    (written) => isRecord(providersOf(written)[providerId]),
  );
  const nextAuth = prepareJsonWrite(
    authContext,
    [providerId],
    { type: "api_key", key: managedSecret },
    (written) => {
      const entry = written[providerId];
      return (
        isRecord(entry) &&
        entry.type === "api_key" &&
        entry.key === managedSecret
      );
    },
  );

  return commitPiImport(
    modelsContext,
    authContext,
    nextModels,
    nextAuth,
    options,
  );
}

export async function updatePiCustomProvider(
  rootPath: string,
  input: AgentPiCustomProviderUpdateInput,
  options: PiWriteOptions,
): Promise<AgentPiWriteResult> {
  const providerId = requireProviderId(input.providerId);
  let baseUrl: string;
  try {
    baseUrl = normalizeAgentProviderEndpoint(input.baseUrl) ?? "";
  } catch {
    fail("ENDPOINT_INVALID");
  }
  if (!baseUrl) fail("ENDPOINT_INVALID");
  if (!PI_APIS.has(input.api)) fail("API_INVALID");

  const context = await readJsonTarget(
    path.join(rootPath, PI_MODEL_CONFIG_FILES.models),
  );
  const current = parseJsonObject(context.raw);
  const provider = providersOf(current)[providerId];
  if (!isRecord(provider)) fail("PROVIDER_NOT_FOUND");
  const nextProvider = { ...provider, baseUrl, api: input.api };
  return applyJsonWrite(
    context,
    options,
    ["providers", providerId],
    nextProvider,
    (written) => {
      const next = providersOf(written)[providerId];
      return (
        isRecord(next) && next.baseUrl === baseUrl && next.api === input.api
      );
    },
  );
}

export async function addPiCustomModel(
  rootPath: string,
  providerIdInput: string,
  model: AgentPiCustomModelInput,
  options: PiWriteOptions,
): Promise<AgentPiWriteResult> {
  const providerId = requireProviderId(providerIdInput);
  const entry = normalizeModelInput(model);
  const context = await readJsonTarget(
    path.join(rootPath, PI_MODEL_CONFIG_FILES.models),
  );
  const current = parseJsonObject(context.raw);
  const provider = providersOf(current)[providerId];
  if (!isRecord(provider)) fail("PROVIDER_NOT_FOUND");
  const models = Array.isArray(provider.models) ? provider.models : [];
  if (models.some((item) => isRecord(item) && item.id === entry.id)) {
    fail("MODEL_ID_DUPLICATE");
  }
  if (!Array.isArray(provider.models)) {
    // A malformed models field (e.g. a string) is replaced wholesale instead
    // of an index append, which jsonc-parser cannot apply to non-arrays.
    return applyJsonWrite(
      context,
      options,
      ["providers", providerId, "models"],
      [entry],
      (written) => {
        const nextProvider = providersOf(written)[providerId];
        return (
          isRecord(nextProvider) &&
          Array.isArray(nextProvider.models) &&
          nextProvider.models.length === 1
        );
      },
    );
  }
  return applyJsonWrite(
    context,
    options,
    ["providers", providerId, "models", models.length],
    entry,
    (written) => {
      const nextProvider = providersOf(written)[providerId];
      if (!isRecord(nextProvider) || !Array.isArray(nextProvider.models)) {
        return false;
      }
      return nextProvider.models.some(
        (item) => isRecord(item) && item.id === entry.id,
      );
    },
  );
}

export async function updatePiCustomModel(
  rootPath: string,
  providerIdInput: string,
  model: AgentPiCustomModelUpdateInput,
  options: PiWriteOptions,
): Promise<AgentPiWriteResult> {
  const providerId = requireProviderId(providerIdInput);
  const originalId = requireModelId(model.originalId);
  const normalized = normalizeModelInput(model);
  const context = await readJsonTarget(
    path.join(rootPath, PI_MODEL_CONFIG_FILES.models),
  );
  const current = parseJsonObject(context.raw);
  const provider = providersOf(current)[providerId];
  if (!isRecord(provider)) fail("PROVIDER_NOT_FOUND");
  const models = Array.isArray(provider.models) ? provider.models : [];
  const index = models.findIndex(
    (item) => isRecord(item) && item.id === originalId,
  );
  if (index < 0) fail("MODEL_NOT_FOUND");
  if (
    normalized.id !== originalId &&
    models.some((item) => isRecord(item) && item.id === normalized.id)
  ) {
    fail("MODEL_ID_DUPLICATE");
  }
  const existing = models[index];
  if (!isRecord(existing)) fail("MODEL_NOT_FOUND");
  const nextModel = { ...existing };
  for (const key of [
    "id",
    "name",
    "reasoning",
    "input",
    "contextWindow",
    "maxTokens",
    "thinkingLevelMap",
  ]) {
    delete nextModel[key];
  }
  Object.assign(nextModel, normalized);
  const nextModels = [...models];
  nextModels[index] = nextModel;
  return applyJsonWrite(
    context,
    options,
    ["providers", providerId, "models"],
    nextModels,
    (written) => {
      const nextProvider = providersOf(written)[providerId];
      return (
        isRecord(nextProvider) &&
        Array.isArray(nextProvider.models) &&
        nextProvider.models.some(
          (item) => isRecord(item) && item.id === normalized.id,
        )
      );
    },
  );
}

export async function removePiCustomModel(
  rootPath: string,
  providerIdInput: string,
  modelIdInput: string,
  options: PiWriteOptions,
): Promise<AgentPiWriteResult> {
  const providerId = requireProviderId(providerIdInput);
  const modelId = requireModelId(modelIdInput);
  const context = await readJsonTarget(
    path.join(rootPath, PI_MODEL_CONFIG_FILES.models),
  );
  const current = parseJsonObject(context.raw);
  const providers = providersOf(current);
  const provider = providers[providerId];
  if (!isRecord(provider)) fail("PROVIDER_NOT_FOUND");
  const models = Array.isArray(provider.models) ? provider.models : [];
  const nextModels = models.filter(
    (item) => !(isRecord(item) && item.id === modelId),
  );
  if (nextModels.length === models.length) fail("MODEL_NOT_FOUND");

  if (nextModels.length > 0) {
    return applyJsonWrite(
      context,
      options,
      ["providers", providerId, "models"],
      nextModels,
      (written) => {
        const nextProvider = providersOf(written)[providerId];
        return (
          isRecord(nextProvider) &&
          Array.isArray(nextProvider.models) &&
          nextProvider.models.length === nextModels.length
        );
      },
    );
  }

  return applyJsonWrite(
    context,
    options,
    ["providers", providerId],
    undefined,
    (written) => !isRecord(providersOf(written)[providerId]),
  );
}

export async function removePiCustomProvider(
  rootPath: string,
  providerIdInput: string,
  options: PiWriteOptions,
): Promise<AgentPiWriteResult> {
  const providerId = requireProviderId(providerIdInput);
  const context = await readJsonTarget(
    path.join(rootPath, PI_MODEL_CONFIG_FILES.models),
  );
  const current = parseJsonObject(context.raw);
  if (!isRecord(providersOf(current)[providerId])) fail("PROVIDER_NOT_FOUND");
  return applyJsonWrite(
    context,
    options,
    ["providers", providerId],
    undefined,
    (written) => !isRecord(providersOf(written)[providerId]),
  );
}

export async function setPiCredential(
  rootPath: string,
  providerIdInput: string,
  secret: string,
  options: PiWriteOptions,
): Promise<AgentPiWriteResult> {
  const providerId = requireProviderId(providerIdInput);
  const managedSecret = requireSecret(secret);
  const context = await readJsonTarget(
    path.join(rootPath, PI_MODEL_CONFIG_FILES.auth),
  );
  return applyJsonWrite(
    context,
    options,
    [providerId],
    { type: "api_key", key: managedSecret },
    (written) => {
      const entry = written[providerId];
      return isRecord(entry) && entry.type === "api_key" && Boolean(entry.key);
    },
  );
}
