import fs from "node:fs/promises";
import {
  getClaudeConfiguredModel,
  isClaudeCloudProviderEnabled,
} from "@prompthub/shared/utils/claude-config";
import path from "node:path";
import {
  applyEdits,
  modify,
  parse as parseJsonc,
  type ParseError,
} from "jsonc-parser";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { parseDocument } from "yaml";
import { getAgentDefinitionById } from "@prompthub/shared/constants/agent-definitions";
import {
  getAgentModelConfigPaths,
  getAgentPrimaryModelConfigPath,
} from "./agent-model-config-paths";

import type {
  AgentCredentialStatus,
  AgentModelConfiguration,
  AgentPiThinkingLevel,
  UpdateAgentModelResult,
} from "@prompthub/shared/types";

import { inspectPiModelCatalog } from "./agent-pi-model-catalog";
import { readOpenCodeConfigFiles } from "./agent-opencode-config-files";
import {
  fileExists,
  readTextConfig,
  sanitizeEndpoint,
} from "./agent-model-config-io";

interface AgentModelContext {
  agentId: string;
  rootPath: string;
}

interface UpdateAgentModelContext extends AgentModelContext {
  model: string;
  secondaryModel?: string | null;
  thinkingLevel?: AgentPiThinkingLevel;
}

interface UpdateOptions {
  backupRoot: string;
  validateNativeConfig?: (agentId: string, targetPath: string) => Promise<void>;
}

type JsonRecord = Record<string, unknown>;

const OH_MY_PI_MODEL_ADAPTER = "oh-my-pi-yaml-v1";
const OH_MY_PI_MODELS_PATH = "models.yml";
const HERMES_MODEL_ADAPTER = "hermes-yaml-v1";
const COPAW_MODEL_ADAPTER = "copaw-active-agent-v1";
const MAX_MODEL_LENGTH = 512;
const SAFE_CHILD_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function emptyResult(
  agentId: string,
  status: AgentModelConfiguration["status"],
  overrides: Partial<AgentModelConfiguration> = {},
): AgentModelConfiguration {
  return {
    agentId,
    adapter: null,
    status,
    model: null,
    secondaryModel: null,
    fallbackModels: [],
    provider: null,
    endpoint: null,
    availableModels: [],
    credentialStatus: "unknown",
    sourceRelativePath: null,
    canSetModel: false,
    formattingMayChange: false,
    ...overrides,
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getRecord(value: unknown, key: string): JsonRecord | undefined {
  if (!isRecord(value)) return undefined;
  const child = value[key];
  return isRecord(child) ? child : undefined;
}

function getString(value: unknown, key: string): string | null {
  if (!isRecord(value) || typeof value[key] !== "string") return null;
  return (value[key] as string).trim() || null;
}

function getStringArray(value: unknown, key: string): string[] {
  if (!isRecord(value) || !Array.isArray(value[key])) return [];
  return Array.from(
    new Set(
      (value[key] as unknown[])
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function providerFromModel(model: string | null): string | null {
  if (!model?.includes("/")) return null;
  return model.split("/", 1)[0] || null;
}

export { fileExists, readTextConfig, sanitizeEndpoint };

function normalizeModel(value: string): string {
  const model = value.trim();
  if (
    !model ||
    model.length > MAX_MODEL_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(model)
  ) {
    throw new Error("AGENT_MODEL_CONFIG_MODEL_INVALID");
  }
  return model;
}

async function resolveJsonConfigPath(
  agentId: string,
  rootPath: string,
): Promise<{ absolutePath: string; relativePath: string } | null> {
  const modelConfig = getAgentDefinitionById(agentId)?.modelConfig;
  if (!modelConfig || modelConfig.format !== "json") return null;
  const candidates = getAgentModelConfigPaths(agentId);
  for (const relativePath of candidates) {
    const absolutePath = path.join(rootPath, relativePath);
    if (await fileExists(absolutePath)) return { absolutePath, relativePath };
  }
  const relativePath = getAgentPrimaryModelConfigPath(agentId);
  return { absolutePath: path.join(rootPath, relativePath), relativePath };
}

function parseJsonRecord(raw: string): JsonRecord {
  const errors: ParseError[] = [];
  const parsed = parseJsonc(raw, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length > 0 || !isRecord(parsed)) {
    throw new Error("AGENT_MODEL_CONFIG_INVALID");
  }
  return parsed;
}

function parseYamlDocument(raw: string) {
  const document = parseDocument(raw, {
    schema: "core",
    strict: true,
    uniqueKeys: true,
  });
  if (document.errors.length > 0 || document.warnings.length > 0) {
    throw new Error("AGENT_MODEL_CONFIG_INVALID");
  }
  if (!isRecord(document.toJS({ maxAliasCount: 50 }))) {
    throw new Error("AGENT_MODEL_CONFIG_INVALID");
  }
  return document;
}

function parseYamlRecord(raw: string): JsonRecord {
  return parseYamlDocument(raw).toJS({ maxAliasCount: 50 }) as JsonRecord;
}

function serializeYamlDocument(
  document: ReturnType<typeof parseYamlDocument>,
): string {
  return String(document);
}

async function resolveOhMyPiConfigPath(
  rootPath: string,
): Promise<{ absolutePath: string; relativePath: string }> {
  const candidates = getAgentModelConfigPaths("oh-my-pi");
  for (const relativePath of candidates) {
    const absolutePath = path.join(rootPath, relativePath);
    if (await fileExists(absolutePath)) return { absolutePath, relativePath };
  }
  const relativePath = getAgentPrimaryModelConfigPath("oh-my-pi");
  return { absolutePath: path.join(rootPath, relativePath), relativePath };
}

function observedModel(value: string | null): string | null {
  if (!value) return null;
  try {
    return normalizeModel(value);
  } catch {
    throw new Error("AGENT_MODEL_CONFIG_INVALID");
  }
}

function ohMyPiModelRoles(config: JsonRecord): JsonRecord | undefined {
  if (!("modelRoles" in config)) return undefined;
  const roles = config.modelRoles;
  if (!isRecord(roles)) throw new Error("AGENT_MODEL_CONFIG_INVALID");
  return roles;
}

function ohMyPiDefaultModel(config: JsonRecord): string | null {
  const roles = ohMyPiModelRoles(config);
  if (roles && "default" in roles && typeof roles.default !== "string") {
    throw new Error("AGENT_MODEL_CONFIG_INVALID");
  }
  return observedModel(getString(roles, "default"));
}

function ohMyPiAvailableModels(
  data: JsonRecord | undefined,
  selectedModel: string | null,
): string[] {
  const providers = getRecord(data, "providers");
  const models = Object.entries(providers || {}).flatMap(
    ([providerId, providerValue]) => {
      const provider = isRecord(providerValue) ? providerValue : undefined;
      const entries = provider?.models;
      if (!Array.isArray(entries)) return [];
      let normalizedProvider: string;
      try {
        normalizedProvider = normalizeModel(providerId);
      } catch {
        return [];
      }
      return entries.flatMap((entry) => {
        const modelId = getString(entry, "id");
        if (!modelId) return [];
        try {
          return [`${normalizedProvider}/${normalizeModel(modelId)}`];
        } catch {
          return [];
        }
      });
    },
  );
  if (selectedModel) models.push(selectedModel);
  return Array.from(new Set(models));
}

function ohMyPiCredentialStatus(
  provider: JsonRecord | undefined,
): AgentCredentialStatus {
  const auth = getString(provider, "auth");
  if (auth === "none" || auth === "oauth") return "platform-managed";
  if (typeof provider?.apiKey === "string") {
    return provider.apiKey.trim() ? "configured" : "missing";
  }
  if (auth === "apiKey") return "missing";
  return "unknown";
}

function inspectOhMyPi(
  config: JsonRecord,
  models: JsonRecord | undefined,
  relativePath: string,
): AgentModelConfiguration {
  const model = ohMyPiDefaultModel(config);
  const providerId = providerFromModel(model);
  const provider = providerId
    ? getRecord(getRecord(models, "providers"), providerId)
    : undefined;
  return emptyResult("oh-my-pi", model ? "configured" : "not-configured", {
    adapter: OH_MY_PI_MODEL_ADAPTER,
    model,
    provider: providerId,
    endpoint: sanitizeEndpoint(getString(provider, "baseUrl")),
    availableModels: ohMyPiAvailableModels(models, model),
    credentialStatus: ohMyPiCredentialStatus(provider),
    sourceRelativePath: relativePath,
    canSetModel: true,
    formattingMayChange: true,
  });
}

function credentialStatusFromKeys(
  record: JsonRecord | undefined,
  keys: string[],
  fallback: AgentCredentialStatus,
): AgentCredentialStatus {
  if (
    record &&
    keys.some((key) => typeof record[key] === "string" && record[key] !== "")
  ) {
    return "configured";
  }
  return fallback;
}

function inspectClaude(
  data: JsonRecord,
  relativePath: string,
): AgentModelConfiguration {
  const model = getClaudeConfiguredModel(data);
  const env = getRecord(data, "env");
  const endpoint = sanitizeEndpoint(getString(env, "ANTHROPIC_BASE_URL"));
  const provider = isClaudeCloudProviderEnabled(env?.CLAUDE_CODE_USE_BEDROCK)
    ? "amazon-bedrock"
    : isClaudeCloudProviderEnabled(env?.CLAUDE_CODE_USE_VERTEX)
      ? "google-vertex"
      : isClaudeCloudProviderEnabled(env?.CLAUDE_CODE_USE_FOUNDRY)
        ? "microsoft-foundry"
        : endpoint
          ? "custom-gateway"
          : "anthropic";
  return emptyResult("claude", model ? "configured" : "not-configured", {
    adapter: "claude-settings-v1",
    model,
    provider,
    endpoint,
    availableModels: getStringArray(data, "availableModels"),
    credentialStatus: credentialStatusFromKeys(
      env,
      ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"],
      "platform-managed",
    ),
    sourceRelativePath: relativePath,
    canSetModel: true,
  });
}

function inspectGemini(
  data: JsonRecord,
  relativePath: string,
): AgentModelConfiguration {
  const model = getString(getRecord(data, "model"), "name");
  const auth = getRecord(getRecord(data, "security"), "auth");
  const selectedType = getString(auth, "selectedType");
  return emptyResult("gemini", model ? "configured" : "not-configured", {
    adapter: "gemini-settings-v1",
    model,
    provider: "google",
    credentialStatus: selectedType ? "platform-managed" : "unknown",
    sourceRelativePath: relativePath,
    canSetModel: true,
  });
}

function inspectCopilot(
  data: JsonRecord,
  relativePath: string,
): AgentModelConfiguration {
  const model = getString(data, "model");
  return emptyResult("copilot", model ? "configured" : "not-configured", {
    adapter: "copilot-settings-v1",
    model,
    provider: "github-copilot",
    availableModels: model ? [model] : [],
    credentialStatus: "platform-managed",
    sourceRelativePath: relativePath,
    canSetModel: true,
  });
}

function inspectAntigravity(
  data: JsonRecord,
  relativePath: string,
): AgentModelConfiguration {
  const model = getString(data, "model");
  return emptyResult("antigravity", model ? "configured" : "not-configured", {
    adapter: "antigravity-settings-v1",
    model,
    provider: "google-antigravity",
    availableModels: model ? [model] : [],
    credentialStatus: "platform-managed",
    sourceRelativePath: relativePath,
    canSetModel: true,
  });
}

function qoderCustomModels(data: JsonRecord): JsonRecord[] {
  const entries = getRecord(data, "modelConfigs")?.customModels;
  return Array.isArray(entries) ? entries.filter(isRecord) : [];
}

function inspectQoder(
  data: JsonRecord,
  relativePath: string,
): AgentModelConfiguration {
  const model = getString(getRecord(data, "model"), "name");
  const customModels = qoderCustomModels(data);
  const selected = customModels.find(
    (entry) =>
      getString(entry, "key") === model || getString(entry, "model") === model,
  );
  const availableModels = customModels
    .map((entry) => getString(entry, "key") || getString(entry, "model"))
    .filter((entry): entry is string => Boolean(entry));
  if (model && !availableModels.includes(model)) availableModels.push(model);
  const apiKey = getString(selected, "apiKey");
  return emptyResult("qoder", model ? "configured" : "not-configured", {
    adapter: "qoder-settings-v1",
    model,
    provider: getString(selected, "provider") || "qoder",
    endpoint: sanitizeEndpoint(getString(selected, "baseURL")),
    availableModels,
    credentialStatus: selected
      ? apiKey
        ? "configured"
        : "missing"
      : "platform-managed",
    sourceRelativePath: relativePath,
    canSetModel: true,
  });
}

function inspectAutoClaw(
  data: JsonRecord,
  relativePath: string,
): AgentModelConfiguration {
  const model = getString(data, "model");
  const endpoint = sanitizeEndpoint(getString(data, "baseUrl"));
  return emptyResult("autoclaw", model ? "configured" : "not-configured", {
    adapter: "autoclaw-setting-v1",
    model,
    provider: endpoint ? "openai-compatible" : "platform-default",
    endpoint,
    availableModels: model ? [model] : [],
    credentialStatus: getString(data, "apiKey") ? "configured" : "missing",
    sourceRelativePath: relativePath,
    canSetModel: true,
  });
}

function inspectPi(
  data: JsonRecord,
  relativePath: string,
): AgentModelConfiguration {
  const model = getString(data, "defaultModel");
  const provider = getString(data, "defaultProvider");
  const rawThinkingLevel = getString(data, "defaultThinkingLevel");
  const thinkingLevel = [
    "off",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ].includes(rawThinkingLevel ?? "")
    ? (rawThinkingLevel as AgentPiThinkingLevel)
    : null;
  return emptyResult("pi", model ? "configured" : "not-configured", {
    adapter: "pi-settings-v1",
    model,
    provider,
    availableModels: model ? [model] : [],
    credentialStatus: "platform-managed",
    sourceRelativePath: relativePath,
    canSetModel: true,
    thinkingLevel,
  });
}

function getQwenProviderEntries(
  data: JsonRecord,
  provider: string | null,
): JsonRecord[] {
  if (!provider) return [];
  const entries = getRecord(data, "modelProviders")?.[provider];
  return Array.isArray(entries) ? entries.filter(isRecord) : [];
}

function inspectQwen(
  data: JsonRecord,
  relativePath: string,
): AgentModelConfiguration {
  const model = getString(getRecord(data, "model"), "name");
  const provider = getString(
    getRecord(getRecord(data, "security"), "auth"),
    "selectedType",
  );
  const providers = getRecord(data, "modelProviders") || {};
  const availableModels = Array.from(
    new Set(
      Object.values(providers)
        .flatMap((entries) => (Array.isArray(entries) ? entries : []))
        .filter(isRecord)
        .map((entry) => getString(entry, "id"))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );
  const selectedEntry = getQwenProviderEntries(data, provider).find(
    (entry) => getString(entry, "id") === model,
  );
  const envKey = getString(selectedEntry, "envKey");
  const environment = getRecord(data, "env");
  const credentialStatus: AgentCredentialStatus =
    envKey && getString(environment, envKey)
      ? "configured"
      : provider === "qwen-oauth"
        ? "platform-managed"
        : envKey
          ? "platform-managed"
          : "unknown";

  return emptyResult("qwen", model ? "configured" : "not-configured", {
    adapter: "qwen-settings-v1",
    model,
    provider,
    endpoint: sanitizeEndpoint(getString(selectedEntry, "baseUrl")),
    availableModels,
    credentialStatus,
    sourceRelativePath: relativePath,
    canSetModel: true,
  });
}

function inspectOpenCode(
  data: JsonRecord,
  relativePath: string,
): AgentModelConfiguration {
  const model = getString(data, "model");
  const secondaryModel = getString(data, "small_model");
  const providers = getRecord(data, "provider");
  const provider = providerFromModel(model);
  const selectedProvider = provider
    ? getRecord(providers, provider)
    : undefined;
  const endpoint = getString(getRecord(selectedProvider, "options"), "baseURL");
  const configuredModels = selectedProvider
    ? Object.keys(getRecord(selectedProvider, "models") || {})
    : [];
  return emptyResult("opencode", model ? "configured" : "not-configured", {
    adapter: "opencode-config-v1",
    model,
    secondaryModel,
    provider,
    endpoint: sanitizeEndpoint(endpoint),
    availableModels: configuredModels.map((item) =>
      provider ? `${provider}/${item}` : item,
    ),
    credentialStatus: "platform-managed",
    sourceRelativePath: relativePath,
    canSetModel: true,
  });
}

function inspectOpenClaw(
  agentId: "openclaw" | "qclaw",
  data: JsonRecord,
  relativePath: string,
): AgentModelConfiguration {
  const defaults = getRecord(getRecord(data, "agents"), "defaults");
  const modelConfig = getRecord(defaults, "model");
  const model = getString(modelConfig, "primary");
  return emptyResult(agentId, model ? "configured" : "not-configured", {
    adapter:
      agentId === "openclaw"
        ? "openclaw-config-v1"
        : "qclaw-openclaw-config-v1",
    model,
    fallbackModels: getStringArray(modelConfig, "fallbacks"),
    provider: providerFromModel(model),
    credentialStatus: "platform-managed",
    sourceRelativePath: relativePath,
    canSetModel: true,
  });
}

function inspectKiro(
  data: JsonRecord,
  relativePath: string,
): AgentModelConfiguration {
  const model = getString(getRecord(data, "chat"), "defaultModel");
  return emptyResult("kiro", model ? "configured" : "not-configured", {
    adapter: "kiro-cli-settings-v1",
    model,
    provider: "kiro",
    credentialStatus: "platform-managed",
    sourceRelativePath: relativePath,
    canSetModel: true,
  });
}

function inspectJsonAdapter(
  agentId: string,
  data: JsonRecord,
  relativePath: string,
): AgentModelConfiguration {
  if (agentId === "antigravity") {
    return inspectAntigravity(data, relativePath);
  }
  if (agentId === "autoclaw") return inspectAutoClaw(data, relativePath);
  if (agentId === "claude") return inspectClaude(data, relativePath);
  if (agentId === "copilot") return inspectCopilot(data, relativePath);
  if (agentId === "gemini") return inspectGemini(data, relativePath);
  if (agentId === "pi") return inspectPi(data, relativePath);
  if (agentId === "qwen") return inspectQwen(data, relativePath);
  if (agentId === "opencode") return inspectOpenCode(data, relativePath);
  if (agentId === "kiro") return inspectKiro(data, relativePath);
  if (agentId === "qoder") return inspectQoder(data, relativePath);
  return inspectOpenClaw(agentId as "openclaw" | "qclaw", data, relativePath);
}

function jsonAdapterId(agentId: string): string {
  if (agentId === "antigravity") return "antigravity-settings-v1";
  if (agentId === "autoclaw") return "autoclaw-setting-v1";
  if (agentId === "copilot") return "copilot-settings-v1";
  if (agentId === "kiro") return "kiro-cli-settings-v1";
  if (agentId === "pi") return "pi-settings-v1";
  if (agentId === "qclaw") return "qclaw-openclaw-config-v1";
  if (agentId === "qoder") return "qoder-settings-v1";
  return agentId === "qwen" ? "qwen-settings-v1" : `${agentId}-config-v1`;
}

function inspectCodex(data: JsonRecord): AgentModelConfiguration {
  const model = getString(data, "model");
  const provider = getString(data, "model_provider") || "openai";
  const providerConfig = getRecord(
    getRecord(data, "model_providers"),
    provider,
  );
  const profiles = getRecord(data, "profiles") || {};
  const availableModels = Array.from(
    new Set(
      [
        model,
        ...Object.values(profiles).map((profile) =>
          getString(profile, "model"),
        ),
      ].filter((item): item is string => Boolean(item)),
    ),
  );
  return emptyResult("codex", model ? "configured" : "not-configured", {
    adapter: "codex-toml-v1",
    model,
    provider,
    endpoint: sanitizeEndpoint(getString(providerConfig, "base_url")),
    availableModels,
    credentialStatus: "platform-managed",
    sourceRelativePath: getAgentPrimaryModelConfigPath("codex"),
    canSetModel: true,
    formattingMayChange: true,
  });
}

function inspectKimi(data: JsonRecord): AgentModelConfiguration {
  const model = getString(data, "default_model");
  const models = getRecord(data, "models") || {};
  const modelConfig = model ? getRecord(models, model) : undefined;
  const provider = getString(modelConfig, "provider");
  const providerConfig = provider
    ? getRecord(getRecord(data, "providers"), provider)
    : undefined;
  const managedCredential =
    provider?.startsWith("managed:") ||
    getString(providerConfig, "type") === "kimi"
      ? "platform-managed"
      : "unknown";

  return emptyResult("kimi", model ? "configured" : "not-configured", {
    adapter: "kimi-code-toml-v1",
    model,
    provider,
    endpoint: sanitizeEndpoint(getString(providerConfig, "base_url")),
    availableModels: Object.keys(models),
    credentialStatus: credentialStatusFromKeys(
      providerConfig,
      ["api_key"],
      managedCredential,
    ),
    sourceRelativePath: getAgentPrimaryModelConfigPath("kimi"),
    canSetModel: true,
    formattingMayChange: true,
  });
}

function inspectTomlAdapter(
  agentId: "codex" | "kimi",
  data: JsonRecord,
): AgentModelConfiguration {
  return agentId === "codex" ? inspectCodex(data) : inspectKimi(data);
}

function inspectHermes(data: JsonRecord): AgentModelConfiguration {
  const modelValue = data.model;
  const modelConfig = isRecord(modelValue) ? modelValue : undefined;
  const model = modelConfig
    ? getString(modelConfig, "default")
    : typeof modelValue === "string"
      ? observedModel(modelValue.trim() || null)
      : null;
  const provider =
    getString(modelConfig, "provider") || providerFromModel(model);
  return emptyResult("hermes", model ? "configured" : "not-configured", {
    adapter: HERMES_MODEL_ADAPTER,
    model,
    provider,
    endpoint: sanitizeEndpoint(getString(modelConfig, "base_url")),
    availableModels: model ? [model] : [],
    credentialStatus: getString(modelConfig, "api_key")
      ? "configured"
      : "platform-managed",
    sourceRelativePath: getAgentPrimaryModelConfigPath("hermes"),
    canSetModel: true,
    formattingMayChange: true,
  });
}

interface CopawModelTarget {
  absolutePath: string;
  relativePath: string;
}

function copawWorkspaceFromConfig(
  rootPath: string,
  config: JsonRecord,
): { activeAgent: string; workspacePath: string } {
  const agents = getRecord(config, "agents");
  const activeAgent = getString(agents, "active_agent");
  if (!activeAgent || !SAFE_CHILD_ID.test(activeAgent)) {
    throw new Error("AGENT_MODEL_CONFIG_INVALID");
  }
  const profile = getRecord(getRecord(agents, "profiles"), activeAgent);
  const declaredWorkspace = getString(profile, "workspace_dir");
  const workspacePath = path.resolve(
    rootPath,
    declaredWorkspace || path.join("workspaces", activeAgent),
  );
  const root = path.resolve(rootPath);
  if (!workspacePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("AGENT_MODEL_CONFIG_INVALID");
  }
  return { activeAgent, workspacePath };
}

async function resolveCopawModelTarget(
  rootPath: string,
): Promise<CopawModelTarget> {
  const configPath = path.join(
    rootPath,
    getAgentPrimaryModelConfigPath("copaw"),
  );
  const config = parseJsonRecord(await readTextConfig(configPath));
  const { workspacePath } = copawWorkspaceFromConfig(rootPath, config);
  const [realRoot, realWorkspace] = await Promise.all([
    fs.realpath(rootPath),
    fs.realpath(workspacePath),
  ]);
  if (!realWorkspace.startsWith(`${realRoot}${path.sep}`)) {
    throw new Error("AGENT_MODEL_CONFIG_INVALID");
  }
  const absolutePath = path.join(workspacePath, "agent.json");
  return {
    absolutePath,
    relativePath: path
      .relative(rootPath, absolutePath)
      .split(path.sep)
      .join("/"),
  };
}

function inspectCopaw(
  data: JsonRecord,
  relativePath: string,
): AgentModelConfiguration {
  const activeModel = getRecord(data, "active_model");
  const provider = getString(activeModel, "provider_id");
  const nativeModel = getString(activeModel, "model");
  const model =
    provider && nativeModel ? `${provider}/${nativeModel}` : nativeModel;
  return emptyResult("copaw", model ? "configured" : "not-configured", {
    adapter: COPAW_MODEL_ADAPTER,
    model,
    provider,
    availableModels: model ? [model] : [],
    credentialStatus: "platform-managed",
    sourceRelativePath: relativePath,
    canSetModel: true,
  });
}

export async function inspectAgentModelConfig(
  context: AgentModelContext,
): Promise<AgentModelConfiguration> {
  if (context.agentId === "copaw") {
    const relativePath = getAgentPrimaryModelConfigPath(context.agentId);
    const configPath = path.join(context.rootPath, relativePath);
    if (!(await fileExists(configPath))) {
      return emptyResult("copaw", "missing", {
        adapter: COPAW_MODEL_ADAPTER,
        sourceRelativePath: relativePath,
      });
    }
    try {
      const target = await resolveCopawModelTarget(context.rootPath);
      if (!(await fileExists(target.absolutePath))) {
        return emptyResult("copaw", "missing", {
          adapter: COPAW_MODEL_ADAPTER,
          sourceRelativePath: target.relativePath,
          canSetModel: true,
        });
      }
      return inspectCopaw(
        parseJsonRecord(await readTextConfig(target.absolutePath)),
        target.relativePath,
      );
    } catch {
      return emptyResult("copaw", "invalid", {
        adapter: COPAW_MODEL_ADAPTER,
        sourceRelativePath: relativePath,
        errorCode: "AGENT_MODEL_CONFIG_INVALID",
      });
    }
  }

  if (context.agentId === "hermes") {
    const relativePath = getAgentPrimaryModelConfigPath(context.agentId);
    const configPath = path.join(context.rootPath, relativePath);
    if (!(await fileExists(configPath))) {
      return emptyResult("hermes", "missing", {
        adapter: HERMES_MODEL_ADAPTER,
        sourceRelativePath: relativePath,
        canSetModel: true,
        formattingMayChange: true,
      });
    }
    try {
      return inspectHermes(parseYamlRecord(await readTextConfig(configPath)));
    } catch {
      return emptyResult("hermes", "invalid", {
        adapter: HERMES_MODEL_ADAPTER,
        sourceRelativePath: relativePath,
        errorCode: "AGENT_MODEL_CONFIG_INVALID",
        formattingMayChange: true,
      });
    }
  }

  if (context.agentId === "codex" || context.agentId === "kimi") {
    const agentId = context.agentId;
    const adapter = agentId === "codex" ? "codex-toml-v1" : "kimi-code-toml-v1";
    const relativePath = getAgentPrimaryModelConfigPath(agentId);
    const configPath = path.join(context.rootPath, relativePath);
    if (!(await fileExists(configPath))) {
      return emptyResult(agentId, "missing", {
        adapter,
        sourceRelativePath: relativePath,
        canSetModel: true,
        formattingMayChange: true,
      });
    }
    try {
      return inspectTomlAdapter(
        agentId,
        parseToml(await readTextConfig(configPath)) as JsonRecord,
      );
    } catch {
      return emptyResult(agentId, "invalid", {
        adapter,
        sourceRelativePath: relativePath,
        canSetModel: false,
        formattingMayChange: true,
        errorCode: "AGENT_MODEL_CONFIG_INVALID",
      });
    }
  }

  if (context.agentId === "oh-my-pi") {
    const resolved = await resolveOhMyPiConfigPath(context.rootPath);
    if (!(await fileExists(resolved.absolutePath))) {
      return emptyResult(context.agentId, "missing", {
        adapter: OH_MY_PI_MODEL_ADAPTER,
        sourceRelativePath: resolved.relativePath,
        canSetModel: true,
        formattingMayChange: true,
      });
    }
    try {
      const config = parseYamlRecord(
        await readTextConfig(resolved.absolutePath),
      );
      const modelsPath = path.join(context.rootPath, OH_MY_PI_MODELS_PATH);
      const models = (await fileExists(modelsPath))
        ? parseYamlRecord(await readTextConfig(modelsPath))
        : undefined;
      return inspectOhMyPi(config, models, resolved.relativePath);
    } catch {
      return emptyResult(context.agentId, "invalid", {
        adapter: OH_MY_PI_MODEL_ADAPTER,
        sourceRelativePath: resolved.relativePath,
        canSetModel: false,
        formattingMayChange: true,
        errorCode: "AGENT_MODEL_CONFIG_INVALID",
      });
    }
  }

  const resolved = await resolveJsonConfigPath(
    context.agentId,
    context.rootPath,
  );
  if (!resolved) return emptyResult(context.agentId, "unsupported");
  if (!(await fileExists(resolved.absolutePath))) {
    const result = emptyResult(context.agentId, "missing", {
      adapter: jsonAdapterId(context.agentId),
      sourceRelativePath: resolved.relativePath,
      canSetModel: true,
    });
    if (context.agentId === "pi")
      result.modelCatalog = await inspectPiModelCatalog(context.rootPath);
    return result;
  }
  try {
    const data =
      context.agentId === "opencode"
        ? (await readOpenCodeConfigFiles(context.rootPath)).config
        : parseJsonRecord(await readTextConfig(resolved.absolutePath));
    const result = inspectJsonAdapter(
      context.agentId,
      data,
      resolved.relativePath,
    );
    if (context.agentId === "pi") {
      result.modelCatalog = await inspectPiModelCatalog(context.rootPath);
    }
    return result;
  } catch {
    return emptyResult(context.agentId, "invalid", {
      adapter: jsonAdapterId(context.agentId),
      sourceRelativePath: resolved.relativePath,
      canSetModel: false,
      errorCode: "AGENT_MODEL_CONFIG_INVALID",
    });
  }
}

export async function createBackup(
  sourcePath: string,
  backupRoot: string,
  agentId: string,
): Promise<string | null> {
  if (!(await fileExists(sourcePath))) return null;
  const targetDir = path.join(backupRoot, agentId, String(Date.now()));
  await fs.mkdir(targetDir, { recursive: true, mode: 0o700 });
  const targetPath = path.join(targetDir, path.basename(sourcePath));
  await fs.copyFile(sourcePath, targetPath);
  await fs.chmod(targetPath, 0o600).catch(() => undefined);
  return targetPath;
}

export async function atomicWrite(
  targetPath: string,
  content: string,
): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, content, {
      encoding: "utf8",
      mode: 0o600,
    });
    await fs.rename(temporaryPath, targetPath);
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

export async function assertConfigUnchanged(
  targetPath: string,
  original: string | null,
): Promise<void> {
  const exists = await fileExists(targetPath);
  if (exists !== (original !== null)) {
    throw new Error("AGENT_MODEL_CONFIG_CONCURRENT_CHANGE");
  }
  if (exists && (await readTextConfig(targetPath)) !== original) {
    throw new Error("AGENT_MODEL_CONFIG_CONCURRENT_CHANGE");
  }
}

export async function restoreModelConfig(
  targetPath: string,
  original: string | null,
): Promise<void> {
  if (original === null) {
    await fs.rm(targetPath, { force: true });
    return;
  }
  await atomicWrite(targetPath, original);
}

async function verifyModelUpdate(
  context: AgentModelContext,
  expectedModel: string,
): Promise<AgentModelConfiguration> {
  const inspected = await inspectAgentModelConfig(context);
  if (inspected.status === "invalid" || inspected.model !== expectedModel) {
    throw new Error("AGENT_MODEL_CONFIG_VERIFICATION_FAILED");
  }
  return inspected;
}

function jsonModelEdits(
  agentId: string,
  raw: string,
  model: string,
  secondaryModel?: string | null,
  thinkingLevel?: AgentPiThinkingLevel,
): string {
  const formatting = { insertSpaces: true, tabSize: 2, eol: "\n" };
  if (agentId === "pi") {
    const separator = model.indexOf("/");
    const provider = separator > 0 ? model.slice(0, separator) : null;
    const nativeModel = separator > 0 ? model.slice(separator + 1) : model;
    let next = raw;
    if (provider) {
      next = applyEdits(
        next,
        modify(next, ["defaultProvider"], provider, {
          formattingOptions: formatting,
        }),
      );
    }
    next = applyEdits(
      next,
      modify(next, ["defaultModel"], nativeModel, {
        formattingOptions: formatting,
      }),
    );
    if (thinkingLevel) {
      next = applyEdits(
        next,
        modify(next, ["defaultThinkingLevel"], thinkingLevel, {
          formattingOptions: formatting,
        }),
      );
    }
    return next.endsWith("\n") ? next : `${next}\n`;
  }
  const modelPath =
    agentId === "gemini" || agentId === "qwen" || agentId === "qoder"
      ? ["model", "name"]
      : agentId === "kiro"
        ? ["chat", "defaultModel"]
        : agentId === "openclaw" || agentId === "qclaw"
          ? ["agents", "defaults", "model", "primary"]
          : ["model"];
  let next = applyEdits(
    raw,
    modify(raw, modelPath, model, { formattingOptions: formatting }),
  );
  if (
    agentId === "claude" &&
    getRecord(parseJsonRecord(next), "env")?.ANTHROPIC_MODEL !== undefined
  ) {
    next = applyEdits(
      next,
      modify(next, ["env", "ANTHROPIC_MODEL"], undefined, {
        formattingOptions: formatting,
      }),
    );
  }
  if (agentId === "opencode" && secondaryModel !== undefined) {
    next = applyEdits(
      next,
      modify(next, ["small_model"], secondaryModel || undefined, {
        formattingOptions: formatting,
      }),
    );
  }
  return next.endsWith("\n") ? next : `${next}\n`;
}

function jsoncEdit(
  raw: string,
  propertyPath: (string | number)[],
  value: unknown,
): string {
  const next = applyEdits(
    raw,
    modify(raw, propertyPath, value, {
      formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" },
    }),
  );
  return next.endsWith("\n") ? next : `${next}\n`;
}

async function updateHermesModel(
  context: UpdateAgentModelContext,
  model: string,
  options: UpdateOptions,
): Promise<UpdateAgentModelResult> {
  const targetPath = path.join(
    context.rootPath,
    getAgentPrimaryModelConfigPath("hermes"),
  );
  const exists = await fileExists(targetPath);
  const original = exists ? await readTextConfig(targetPath) : null;
  const raw = original ?? "{}\n";
  const data = parseYamlRecord(raw);
  const document = parseYamlDocument(raw);
  if (isRecord(data.model) || !("model" in data)) {
    document.setIn(["model", "default"], model);
  } else if (typeof data.model === "string") {
    document.set("model", model);
  } else {
    throw new Error("AGENT_MODEL_CONFIG_INVALID");
  }
  const backupPath = await createBackup(
    targetPath,
    options.backupRoot,
    context.agentId,
  );
  await assertConfigUnchanged(targetPath, original);
  try {
    await atomicWrite(targetPath, serializeYamlDocument(document));
    return { ...(await verifyModelUpdate(context, model)), backupPath };
  } catch {
    await restoreModelConfig(targetPath, original).catch(() => undefined);
    throw new Error("AGENT_MODEL_CONFIG_UPDATE_FAILED");
  }
}

function splitCopawModel(
  value: string,
  currentProvider: string | null,
): { provider: string; model: string } {
  const separator = value.indexOf("/");
  const provider = separator > 0 ? value.slice(0, separator) : currentProvider;
  const model = separator > 0 ? value.slice(separator + 1) : value;
  if (!provider || !model) throw new Error("AGENT_MODEL_CONFIG_MODEL_INVALID");
  return { provider, model };
}

async function updateCopawModel(
  context: UpdateAgentModelContext,
  model: string,
  options: UpdateOptions,
): Promise<UpdateAgentModelResult> {
  let target: CopawModelTarget;
  try {
    target = await resolveCopawModelTarget(context.rootPath);
  } catch {
    throw new Error("AGENT_MODEL_CONFIG_INVALID");
  }
  const exists = await fileExists(target.absolutePath);
  const original = exists ? await readTextConfig(target.absolutePath) : null;
  const raw = original ?? "{}\n";
  const data = parseJsonRecord(raw);
  const currentProvider = getString(
    getRecord(data, "active_model"),
    "provider_id",
  );
  const selected = splitCopawModel(model, currentProvider);
  let next = jsoncEdit(raw, ["active_model", "provider_id"], selected.provider);
  next = jsoncEdit(next, ["active_model", "model"], selected.model);
  const backupPath = await createBackup(
    target.absolutePath,
    options.backupRoot,
    context.agentId,
  );
  await assertConfigUnchanged(target.absolutePath, original);
  try {
    await atomicWrite(target.absolutePath, next);
    const expected = `${selected.provider}/${selected.model}`;
    return { ...(await verifyModelUpdate(context, expected)), backupPath };
  } catch {
    await restoreModelConfig(target.absolutePath, original).catch(
      () => undefined,
    );
    throw new Error("AGENT_MODEL_CONFIG_UPDATE_FAILED");
  }
}

export async function updateAgentModelConfig(
  context: UpdateAgentModelContext,
  options: UpdateOptions,
): Promise<UpdateAgentModelResult> {
  const model = normalizeModel(context.model);
  const secondaryModel =
    context.secondaryModel === null || context.secondaryModel === undefined
      ? context.secondaryModel
      : normalizeModel(context.secondaryModel);

  if (context.agentId === "copaw") {
    return updateCopawModel(context, model, options);
  }

  if (context.agentId === "hermes") {
    return updateHermesModel(context, model, options);
  }

  if (context.agentId === "oh-my-pi") {
    const resolved = await resolveOhMyPiConfigPath(context.rootPath);
    let raw = "{}\n";
    let original: string | null = null;
    if (await fileExists(resolved.absolutePath)) {
      raw = await readTextConfig(resolved.absolutePath);
      original = raw;
      ohMyPiDefaultModel(parseYamlRecord(raw));
    }
    const backupPath = await createBackup(
      resolved.absolutePath,
      options.backupRoot,
      context.agentId,
    );
    const document = parseYamlDocument(raw);
    document.setIn(["modelRoles", "default"], model);
    const next = serializeYamlDocument(document);
    await assertConfigUnchanged(resolved.absolutePath, original);
    try {
      await atomicWrite(resolved.absolutePath, next);
      return {
        ...(await verifyModelUpdate(context, model)),
        backupPath,
      };
    } catch {
      await restoreModelConfig(resolved.absolutePath, original).catch(
        () => undefined,
      );
      throw new Error("AGENT_MODEL_CONFIG_UPDATE_FAILED");
    }
  }

  if (context.agentId === "codex" || context.agentId === "kimi") {
    const targetPath = path.join(
      context.rootPath,
      getAgentPrimaryModelConfigPath(context.agentId),
    );
    let data: JsonRecord = {};
    let original: string | null = null;
    if (await fileExists(targetPath)) {
      original = await readTextConfig(targetPath);
      try {
        data = parseToml(original) as JsonRecord;
      } catch {
        throw new Error("AGENT_MODEL_CONFIG_INVALID");
      }
    }
    const backupPath = await createBackup(
      targetPath,
      options.backupRoot,
      context.agentId,
    );
    if (context.agentId === "codex") data.model = model;
    else data.default_model = model;
    await assertConfigUnchanged(targetPath, original);
    try {
      await atomicWrite(targetPath, `${stringifyToml(data)}\n`);
      await options.validateNativeConfig?.(context.agentId, targetPath);
      return {
        ...(await verifyModelUpdate(context, model)),
        backupPath,
      };
    } catch {
      await restoreModelConfig(targetPath, original).catch(() => undefined);
      throw new Error("AGENT_MODEL_CONFIG_UPDATE_FAILED");
    }
  }

  const resolved = await resolveJsonConfigPath(
    context.agentId,
    context.rootPath,
  );
  if (!resolved) throw new Error("AGENT_MODEL_CONFIG_UNSUPPORTED");
  let raw = "{}\n";
  let original: string | null = null;
  if (await fileExists(resolved.absolutePath)) {
    raw = await readTextConfig(resolved.absolutePath);
    original = raw;
    parseJsonRecord(raw);
  }
  const backupPath = await createBackup(
    resolved.absolutePath,
    options.backupRoot,
    context.agentId,
  );
  const next = jsonModelEdits(
    context.agentId,
    raw,
    model,
    secondaryModel,
    context.thinkingLevel,
  );
  parseJsonRecord(next);
  await assertConfigUnchanged(resolved.absolutePath, original);
  try {
    await atomicWrite(resolved.absolutePath, next);
    return {
      ...(await verifyModelUpdate(
        context,
        context.agentId === "pi" && model.includes("/")
          ? model.slice(model.indexOf("/") + 1)
          : model,
      )),
      backupPath,
    };
  } catch {
    await restoreModelConfig(resolved.absolutePath, original).catch(
      () => undefined,
    );
    throw new Error("AGENT_MODEL_CONFIG_UPDATE_FAILED");
  }
}
