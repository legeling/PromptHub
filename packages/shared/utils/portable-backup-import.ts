import type { PortableLogicalScope } from "../types/portable-backup";

const SECRET_FIELD =
  /(?:api[_-]?key|password|secret|token|access[_-]?key|private[_-]?key)/iu;

export function redactPortableBackupConfiguration(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPortableBackupConfiguration);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SECRET_FIELD.test(key))
      .map(([key, entry]) => [key, redactPortableBackupConfiguration(entry)]),
  );
}

export function resolvePortableImportScope(
  requested: Record<string, unknown> | null,
  payload: Record<string, unknown>,
): PortableLogicalScope {
  const has = (key: string): boolean => Object.hasOwn(payload, key);
  const selected = (
    key: keyof PortableLogicalScope,
    inferred: boolean,
  ): boolean => {
    const value = requested?.[key];
    if (value === undefined) return inferred;
    if (typeof value !== "boolean")
      throw new Error(`Portable import scope has invalid ${key}`);
    return value;
  };
  const full = requested === null;
  // Before MCP/Plugin received their own export switches they belonged to Skills.
  const bundled = full || (requested !== null && requested.skills === true);
  const hasSkills = has("skills") || has("skillVersions") || has("skillFiles");
  const hasMcp = has("mcpLibrary") || has("agentAssetFiles");
  const hasPlugins =
    has("pluginLibrary") || has("pluginPackages") || has("agentAssetFiles");
  return {
    prompts: selected("prompts", full),
    folders: selected("folders", full),
    versions: selected("versions", full),
    images: selected("images", full && has("images")),
    videos: selected("videos", full && has("videos")),
    aiConfig: selected("aiConfig", full && has("aiConfig")),
    settings: selected("settings", full && has("settings")),
    rules: selected("rules", full && has("rules")),
    skills: selected("skills", full && hasSkills),
    mcp: selected("mcp", bundled && hasMcp),
    plugins: selected("plugins", bundled && hasPlugins),
    agents: selected("agents", full && has("agentManagement")),
  };
}
