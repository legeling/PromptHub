import type { Folder, Prompt, PromptVersion } from "../../shared/types";
import type {
  Skill,
  SkillFileSnapshot,
  SkillVersion,
} from "../../shared/types/skill";

export const DB_BACKUP_VERSION = 1;

export interface DatabaseBackup {
  version: number;
  exportedAt: string;
  prompts: Prompt[];
  folders: Folder[];
  versions: PromptVersion[];
  images?: { [fileName: string]: string };
  videos?: { [fileName: string]: string };
  aiConfig?: {
    aiModels?: any[];
    scenarioModelDefaults?: Record<string, string>;
    aiProvider?: string;
    aiApiKey?: string;
    aiApiUrl?: string;
    aiModel?: string;
  };
  settings?: { state: any };
  settingsUpdatedAt?: string;
  skills?: Skill[];
  skillVersions?: SkillVersion[];
  skillFiles?: {
    [skillId: string]: SkillFileSnapshot[];
  };
}

export type ExportScope = {
  prompts?: boolean;
  folders?: boolean;
  versions?: boolean;
  images?: boolean;
  aiConfig?: boolean;
  settings?: boolean;
  skills?: boolean;
};

export type PromptHubFile =
  | {
      kind: "prompthub-export";
      exportedAt: string;
      scope: Required<ExportScope>;
      payload: Partial<DatabaseBackup>;
    }
  | {
      kind: "prompthub-backup";
      exportedAt: string;
      payload: DatabaseBackup;
    };

export function normalizeImportedBackup(
  backup: Partial<DatabaseBackup> | null | undefined,
): DatabaseBackup {
  return {
    version:
      typeof backup?.version === "number" && Number.isFinite(backup.version)
        ? backup.version
        : DB_BACKUP_VERSION,
    exportedAt:
      typeof backup?.exportedAt === "string" && backup.exportedAt.trim()
        ? backup.exportedAt
        : new Date().toISOString(),
    prompts: Array.isArray(backup?.prompts) ? backup.prompts : [],
    folders: Array.isArray(backup?.folders) ? backup.folders : [],
    versions: Array.isArray(backup?.versions) ? backup.versions : [],
    images:
      backup?.images && typeof backup.images === "object"
        ? backup.images
        : undefined,
    videos:
      backup?.videos && typeof backup.videos === "object"
        ? backup.videos
        : undefined,
    aiConfig: backup?.aiConfig,
    settings: backup?.settings,
    settingsUpdatedAt: backup?.settingsUpdatedAt,
    skills: Array.isArray(backup?.skills) ? backup.skills : undefined,
    skillVersions: Array.isArray(backup?.skillVersions)
      ? backup.skillVersions
      : undefined,
    skillFiles:
      backup?.skillFiles && typeof backup.skillFiles === "object"
        ? backup.skillFiles
        : undefined,
  };
}

export function parsePromptHubBackupFileContent(text: string): DatabaseBackup {
  const parsed = JSON.parse(text) as any;

  if (parsed?.kind === "prompthub-backup") {
    return normalizeImportedBackup(parsed.payload);
  }

  if (parsed?.kind === "prompthub-export") {
    return normalizeImportedBackup(parsed.payload);
  }

  return normalizeImportedBackup(parsed);
}
