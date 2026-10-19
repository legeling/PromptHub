import { redactMcpLibraryForTransport } from "@prompthub/shared/utils/mcp-config";
import { skillSnapshotEnvelopeKind } from "@prompthub/shared/utils/skill-file-snapshot";
import {
  redactPortableBackupConfiguration,
  resolvePortableImportScope,
} from "@prompthub/shared/utils/portable-backup-import";
import type { DatabaseBackup } from "./database-backup-format";

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
      ? (raw.scope as Record<string, unknown>)
      : null;
  const scope = resolvePortableImportScope(requested, payload);
  return JSON.stringify({
    kind: skillSnapshotEnvelopeKind("prompthub-export", backup),
    exportedAt: backup.exportedAt,
    scope,
    payload: {
      ...backup,
      settings: backup.settings
        ? (redactPortableBackupConfiguration(
            backup.settings,
          ) as DatabaseBackup["settings"])
        : undefined,
      aiConfig: backup.aiConfig
        ? (redactPortableBackupConfiguration(
            backup.aiConfig,
          ) as DatabaseBackup["aiConfig"])
        : undefined,
      mcpLibrary: backup.mcpLibrary
        ? redactMcpLibraryForTransport(backup.mcpLibrary)
        : undefined,
    },
  });
}
