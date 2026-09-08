import type {
  AgentAssetFilesSnapshot,
  AgentAssetStoreSourcesSnapshot,
  AgentManagementBackup,
  Folder,
  McpLibraryFile,
  OutputFormatItem,
  PluginLibraryFile,
  PluginPackageSnapshot,
  Prompt,
  PromptRelation,
  PromptVersion,
  RuleBackupRecord,
  Skill,
  SkillFileSnapshot,
  SkillVersion,
} from "@prompthub/shared/types";
import { parseAgentManagementBackup } from "@prompthub/shared/utils/agent-management-backup";
import { skillSnapshotEnvelopeKind, validateEncodedSkillSnapshots } from "@prompthub/shared/utils/skill-file-snapshot";

const MAX_LOGICAL_RECORDS = 100_000;

export interface PortableLogicalScope {
  prompts: boolean;
  folders: boolean;
  versions: boolean;
  images: boolean;
  videos: boolean;
  aiConfig: boolean;
  settings: boolean;
  rules: boolean;
  skills: boolean;
  mcp: boolean;
  plugins: boolean;
  agents: boolean;
}

export interface PortableLogicalSnapshot {
  version: number;
  exportedAt: string;
  prompts: Prompt[];
  folders: Folder[];
  versions: PromptVersion[];
  promptRelations?: PromptRelation[];
  outputFormatItems?: OutputFormatItem[];
  images?: Record<string, string>;
  videos?: Record<string, string>;
  aiConfig?: Record<string, unknown>;
  settings?: { state: Record<string, unknown> };
  settingsUpdatedAt?: string;
  rules?: RuleBackupRecord[];
  skills?: Skill[];
  skillVersions?: SkillVersion[];
  skillFiles?: Record<string, SkillFileSnapshot[]>;
  mcpLibrary?: McpLibraryFile;
  pluginLibrary?: PluginLibraryFile;
  pluginPackages?: PluginPackageSnapshot[];
  storeSources?: AgentAssetStoreSourcesSnapshot;
  agentAssetFiles?: AgentAssetFilesSnapshot;
  agentManagement?: AgentManagementBackup;
}

export interface PortableLogicalEnvelope {
  kind: "prompthub-export" | "prompthub-export-v2";
  exportedAt: string;
  scope: PortableLogicalScope;
  payload: PortableLogicalSnapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireArray<T>(value: unknown, label: string): T[] {
  if (!Array.isArray(value) || value.length > MAX_LOGICAL_RECORDS) {
    throw new Error(`Portable logical snapshot has invalid ${label}`);
  }
  return value as T[];
}

function optionalArray<T>(value: unknown, label: string): T[] | undefined {
  if (value === undefined) return undefined;
  return requireArray<T>(value, label);
}

function requireScope(value: unknown): PortableLogicalScope {
  if (!isRecord(value)) throw new Error("Portable logical scope is invalid");
  const keys: Array<keyof PortableLogicalScope> = [
    "prompts",
    "folders",
    "versions",
    "images",
    "videos",
    "aiConfig",
    "settings",
    "rules",
    "skills",
    "mcp",
    "plugins",
    "agents",
  ];
  const scope = {} as PortableLogicalScope;
  for (const key of keys) {
    if (typeof value[key] !== "boolean") {
      throw new Error(`Portable logical scope has invalid ${key}`);
    }
    scope[key] = value[key] as boolean;
  }
  return scope;
}

function optionalRecord<T>(value: unknown, label: string): T | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error(`Portable logical snapshot has invalid ${label}`);
  }
  return value as T;
}

function assertSelectedPayload(
  scope: PortableLogicalScope,
  payload: PortableLogicalSnapshot,
): void {
  const selectedContent =
    scope.prompts ||
    scope.folders ||
    scope.versions ||
    scope.images ||
    scope.videos ||
    scope.aiConfig ||
    scope.settings ||
    scope.rules ||
    scope.skills ||
    scope.mcp ||
    scope.plugins ||
    scope.agents;
  if (!selectedContent) {
    throw new Error("Portable logical snapshot has no selected scope");
  }
  if (scope.agents && payload.agentManagement === undefined) {
    throw new Error("Portable logical snapshot is missing Agent data");
  }
  if (scope.mcp && payload.mcpLibrary === undefined) {
    throw new Error("Portable logical snapshot is missing MCP data");
  }
  if (scope.plugins && payload.pluginLibrary === undefined) {
    throw new Error("Portable logical snapshot is missing Plugin data");
  }
  if (scope.settings && payload.settings === undefined) {
    throw new Error("Portable logical snapshot is missing settings data");
  }
  if (scope.aiConfig && payload.aiConfig === undefined) {
    throw new Error(
      "Portable logical snapshot is missing AI configuration data",
    );
  }
}

export function parsePortableLogicalEnvelope(
  text: string,
): PortableLogicalEnvelope {
  const raw = JSON.parse(text) as unknown;
  if (
    !isRecord(raw) ||
    (raw.kind !== "prompthub-export" && raw.kind !== "prompthub-export-v2") ||
    typeof raw.exportedAt !== "string" ||
    !Number.isFinite(Date.parse(raw.exportedAt)) ||
    !isRecord(raw.payload)
  ) {
    throw new Error("Portable logical snapshot envelope is invalid");
  }
  const scope = requireScope(raw.scope);
  const value = raw.payload;
  validateEncodedSkillSnapshots(value);
  const settings = optionalRecord<{ state?: unknown }>(
    value.settings,
    "settings",
  );
  if (settings && !isRecord(settings.state)) {
    throw new Error("Portable logical snapshot settings state is invalid");
  }
  const agentManagement =
    value.agentManagement === undefined
      ? undefined
      : parseAgentManagementBackup(value.agentManagement);
  const payload: PortableLogicalSnapshot = {
    version:
      typeof value.version === "number" && Number.isFinite(value.version)
        ? value.version
        : 1,
    exportedAt:
      typeof value.exportedAt === "string" ? value.exportedAt : raw.exportedAt,
    prompts: requireArray<Prompt>(value.prompts, "prompts"),
    folders: requireArray<Folder>(value.folders, "folders"),
    versions: requireArray<PromptVersion>(value.versions, "versions"),
    promptRelations: optionalArray<PromptRelation>(
      value.promptRelations,
      "prompt relations",
    ),
    outputFormatItems: optionalArray<OutputFormatItem>(
      value.outputFormatItems,
      "output format items",
    ),
    images: optionalRecord<Record<string, string>>(value.images, "images"),
    videos: optionalRecord<Record<string, string>>(value.videos, "videos"),
    aiConfig: optionalRecord<Record<string, unknown>>(
      value.aiConfig,
      "AI configuration",
    ),
    settings: settings
      ? { state: settings.state as Record<string, unknown> }
      : undefined,
    settingsUpdatedAt:
      typeof value.settingsUpdatedAt === "string"
        ? value.settingsUpdatedAt
        : undefined,
    rules: optionalArray<RuleBackupRecord>(value.rules, "rules"),
    skills: optionalArray<Skill>(value.skills, "skills"),
    skillVersions: optionalArray<SkillVersion>(
      value.skillVersions,
      "skill versions",
    ),
    skillFiles: optionalRecord<PortableLogicalSnapshot["skillFiles"]>(
      value.skillFiles,
      "skill files",
    ),
    mcpLibrary: optionalRecord<McpLibraryFile>(value.mcpLibrary, "MCP library"),
    pluginLibrary: optionalRecord<PluginLibraryFile>(
      value.pluginLibrary,
      "Plugin library",
    ),
    pluginPackages: optionalArray<PluginPackageSnapshot>(
      value.pluginPackages,
      "Plugin packages",
    ),
    storeSources: optionalRecord<AgentAssetStoreSourcesSnapshot>(
      value.storeSources,
      "store sources",
    ),
    agentAssetFiles: optionalRecord<AgentAssetFilesSnapshot>(
      value.agentAssetFiles,
      "Agent asset files",
    ),
    agentManagement,
  };
  assertSelectedPayload(scope, payload);
  return {
    kind: skillSnapshotEnvelopeKind("prompthub-export", payload),
    exportedAt: raw.exportedAt,
    scope,
    payload,
  };
}
