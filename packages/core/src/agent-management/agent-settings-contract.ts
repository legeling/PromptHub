import type { AgentManagementSettings } from "./agent-settings-repository";
import { normalizeAgentIdentityPreferences } from "./agent-query";
import {
  normalizeBuiltinAgentOverrides,
  normalizeCustomAgents,
  validateAgentRelativePath,
} from "./agent-root-config";

export const RETIRED_AGENT_SETTING_KEYS = [
  "customPlatformRootPaths",
  "customSkillPlatformPaths",
  "customAgentRootPaths",
  "customSkillScanPaths",
  "trackedRulePlatformIds",
] as const;

export const AGENT_SETTING_KEYS = [
  "builtinAgentOverrides",
  "customAgents",
  "disabledPlatformIds",
  "agentIdentityPreferences",
] as const;

export function requireAgentSettingsRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid Agent settings: ${label} must be an object`);
  }
  return value as Record<string, unknown>; // Object shape is checked at the input boundary.
}

function requireText(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(`Invalid Agent settings: ${label}`);
  }
}

function validateAsset(value: unknown, custom: boolean): void {
  const asset = requireAgentSettingsRecord(value, "asset");
  if (custom || asset.rootPath !== undefined)
    requireText(asset.rootPath, "rootPath");
  for (const key of [
    "skillsRelativePath",
    "rulesRelativePath",
    "mcpRelativePath",
    "pluginsRelativePath",
    "agentsRelativePath",
    "commandsRelativePath",
  ]) {
    if (asset[key] !== undefined) {
      requireText(asset[key], key);
      validateAgentRelativePath(asset[key], key);
    }
  }
  if (asset.configRelativePaths !== undefined) {
    if (!Array.isArray(asset.configRelativePaths))
      throw new Error("Invalid Agent configRelativePaths");
    for (const entry of asset.configRelativePaths) {
      requireText(entry, "configRelativePaths");
      validateAgentRelativePath(entry, "configRelativePaths");
    }
  }
  if (custom) {
    requireText(asset.id, "id");
    requireText(asset.name, "name");
    if (asset.enabled !== undefined && typeof asset.enabled !== "boolean")
      throw new Error("Invalid Agent enabled");
  }
}

export function parseAgentManagementSettings(
  value: unknown,
): AgentManagementSettings {
  const input = requireAgentSettingsRecord(value, "configuration");
  for (const key of AGENT_SETTING_KEYS) {
    if (input[key] === null)
      throw new Error(`Invalid Agent settings: ${key} cannot be null`);
  }
  const overrides = requireAgentSettingsRecord(
    input.builtinAgentOverrides ?? {},
    "builtinAgentOverrides",
  );
  for (const [id, asset] of Object.entries(overrides)) {
    requireText(id, "platform id");
    validateAsset(asset, false);
  }
  const agents = input.customAgents ?? [];
  if (!Array.isArray(agents)) throw new Error("Invalid Agent customAgents");
  agents.forEach((agent) => validateAsset(agent, true));
  const disabled = input.disabledPlatformIds ?? [];
  if (!Array.isArray(disabled))
    throw new Error("Invalid Agent disabledPlatformIds");
  disabled.forEach((id) => requireText(id, "disabledPlatformIds"));
  const preferences = requireAgentSettingsRecord(
    input.agentIdentityPreferences ?? {},
    "agentIdentityPreferences",
  );
  for (const [id, value] of Object.entries(preferences)) {
    const preference = requireAgentSettingsRecord(value, "identity");
    if (
      id !== "codex" ||
      !["codex", "chatgpt"].includes(String(preference.name)) ||
      !["codex", "chatgpt"].includes(String(preference.icon))
    ) {
      throw new Error("Invalid Agent identity preference");
    }
  }
  // Values have been checked above; normalization only trims current-contract fields.
  const builtinAgentOverrides = normalizeBuiltinAgentOverrides(
    overrides as AgentManagementSettings["builtinAgentOverrides"],
  );
  const customAgents = normalizeCustomAgents(agents);
  if (
    customAgents.length !== agents.length ||
    new Set(customAgents.map((agent) => agent.id)).size !== agents.length
  ) {
    throw new Error("Invalid Agent duplicate custom identity");
  }
  return {
    builtinAgentOverrides,
    customAgents,
    disabledPlatformIds: [...new Set<string>(disabled)],
    agentIdentityPreferences: normalizeAgentIdentityPreferences(preferences),
  };
}
