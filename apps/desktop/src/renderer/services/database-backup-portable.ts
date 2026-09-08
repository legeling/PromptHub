import { redactMcpLibraryForTransport } from "@prompthub/shared/utils/mcp-config";
import { skillSnapshotEnvelopeKind } from "@prompthub/shared/utils/skill-file-snapshot";

import type { DatabaseBackup, ExportScope } from "./database-backup-format";

const SECRET_FIELD =
  /(?:api[_-]?key|password|secret|token|access[_-]?key|private[_-]?key)/iu;

function withoutSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SECRET_FIELD.test(key))
      .map(([key, entry]) => [key, withoutSecrets(entry)]),
  );
}

function fullScope(payload: Record<string, unknown>): Required<ExportScope> {
  const has = (key: string) => Object.hasOwn(payload, key);
  return {
    prompts: true,
    folders: true,
    versions: true,
    images: has("images"),
    videos: has("videos"),
    aiConfig: has("aiConfig"),
    settings: has("settings"),
    rules: has("rules"),
    skills: has("skills") || has("skillVersions") || has("skillFiles"),
    mcp: has("mcpLibrary") || has("agentAssetFiles"),
    plugins:
      has("pluginLibrary") || has("pluginPackages") || has("agentAssetFiles"),
    agents: has("agentManagement"),
  };
}

export function createAtomicLogicalImportEnvelope(
  sourceText: string,
  backup: DatabaseBackup,
): string {
  const raw = JSON.parse(sourceText) as Record<string, unknown>;
  const payload =
    raw.payload && typeof raw.payload === "object"
      ? (raw.payload as Record<string, unknown>)
      : raw;
  const requested =
    (raw.kind === "prompthub-export" || raw.kind === "prompthub-export-v2") &&
    raw.scope &&
    typeof raw.scope === "object"
      ? (raw.scope as Partial<ExportScope>)
      : fullScope(payload);
  const scope = Object.fromEntries(
    [
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
    ].map((key) => [key, requested[key as keyof ExportScope] === true]),
  ) as Required<ExportScope>;
  return JSON.stringify({
    kind: skillSnapshotEnvelopeKind("prompthub-export", backup),
    exportedAt: backup.exportedAt,
    scope,
    payload: {
      ...backup,
      settings: backup.settings
        ? (withoutSecrets(backup.settings) as DatabaseBackup["settings"])
        : undefined,
      aiConfig: backup.aiConfig
        ? (withoutSecrets(backup.aiConfig) as DatabaseBackup["aiConfig"])
        : undefined,
      mcpLibrary: backup.mcpLibrary
        ? redactMcpLibraryForTransport(backup.mcpLibrary)
        : undefined,
    },
  });
}
