import type { Folder, Prompt, PromptVersion, RuleBackupRecord } from "@prompthub/shared/types";
import type {
  Skill,
  SkillFileSnapshot,
  SkillVersion,
} from "@prompthub/shared/types/skill";

function normalizeSkillSafetyReport<T extends { safetyReport?: unknown }>(value: T): T {
  if (!value.safetyReport || typeof value.safetyReport !== "object") {
    return value;
  }

  return {
    ...value,
    safetyReport: {
      ...(value.safetyReport as Record<string, unknown>),
      scanMethod: "ai",
    },
  };
}

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
    aiProviders?: any[];
    aiModels?: any[];
    scenarioModelDefaults?: Record<string, string>;
    modelRouteDefaults?: Record<string, string>;
    aiProvider?: string;
    aiApiProtocol?: string;
    aiApiKey?: string;
    aiApiUrl?: string;
    aiModel?: string;
  };
  settings?: { state: any };
  settingsUpdatedAt?: string;
  rules?: RuleBackupRecord[];
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
  videos?: boolean;
  aiConfig?: boolean;
  settings?: boolean;
  rules?: boolean;
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
  // Support web backup format which uses "promptVersions" instead of "versions"
  const versions = Array.isArray(backup?.versions) && backup.versions.length > 0
    ? backup.versions
    : Array.isArray((backup as any)?.promptVersions) ? (backup as any).promptVersions : [];

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
    versions,
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
    rules: Array.isArray(backup?.rules) ? backup.rules : undefined,
    skills: Array.isArray(backup?.skills)
      ? backup.skills.map((skill) => normalizeSkillSafetyReport(skill))
      : undefined,
    skillVersions: Array.isArray(backup?.skillVersions)
      ? backup.skillVersions
      : undefined,
    skillFiles:
      backup?.skillFiles && typeof backup.skillFiles === "object"
        ? backup.skillFiles
        : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasPromptShape(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.userPrompt === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function hasFolderShape(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function hasPromptVersionShape(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.promptId === "string" &&
    typeof value.version === "number" &&
    typeof value.userPrompt === "string" &&
    typeof value.createdAt === "string"
  );
}

function hasSkillShape(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.protocol_type === "string" &&
    typeof value.is_favorite === "boolean" &&
    typeof value.created_at === "number" &&
    typeof value.updated_at === "number"
  );
}

function hasSkillVersionShape(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.skillId === "string" &&
    typeof value.version === "number" &&
    typeof value.createdAt === "string"
  );
}

function hasSkillFileSnapshotShape(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.relativePath === "string" &&
    typeof value.content === "string"
  );
}

function hasRuleVersionShape(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.savedAt === "string" &&
    typeof value.content === "string" &&
    (value.source === "manual-save" ||
      value.source === "ai-rewrite" ||
      value.source === "create")
  );
}

function hasRuleShape(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.platformId === "string" &&
    typeof value.platformName === "string" &&
    typeof value.platformIcon === "string" &&
    typeof value.platformDescription === "string" &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    typeof value.path === "string" &&
    typeof value.content === "string" &&
    Array.isArray(value.versions) &&
    value.versions.every(hasRuleVersionShape)
  );
}

/**
 * Counts of records that were dropped from an imported backup because they
 * failed structural validation. This lets the UI surface a transparent
 * "succeeded X, skipped Y" summary instead of silently losing data.
 *
 * 因结构校验失败而被丢弃的导入条目统计。使 UI 能在"成功 X 条，跳过 Y 条"时
 * 给用户透明反馈，避免静默丢数据。
 */
export interface ImportSkippedStats {
  prompts: number;
  folders: number;
  versions: number;
  rules: number;
  skills: number;
  skillVersions: number;
  skillFiles: number;
}

export interface ParsedBackup {
  backup: DatabaseBackup;
  skipped: ImportSkippedStats;
}

export function hasMeaningfulBackupContent(backup: DatabaseBackup): boolean {
  return (
    backup.prompts.length > 0 ||
    backup.folders.length > 0 ||
    backup.versions.length > 0 ||
    (backup.rules?.length ?? 0) > 0 ||
    (backup.skills?.length ?? 0) > 0 ||
    (backup.skillVersions?.length ?? 0) > 0 ||
    Object.values(backup.skillFiles ?? {}).some((files) => files.length > 0) ||
    Object.keys(backup.images ?? {}).length > 0 ||
    Object.keys(backup.videos ?? {}).length > 0 ||
    !!backup.aiConfig ||
    !!backup.settings
  );
}

export function createEmptySkippedStats(): ImportSkippedStats {
  return {
    prompts: 0,
    folders: 0,
    versions: 0,
    rules: 0,
    skills: 0,
    skillVersions: 0,
    skillFiles: 0,
  };
}

export function hasAnySkipped(stats: ImportSkippedStats): boolean {
  return (
    stats.prompts > 0 ||
    stats.folders > 0 ||
    stats.versions > 0 ||
    stats.rules > 0 ||
    stats.skills > 0 ||
    stats.skillVersions > 0 ||
    stats.skillFiles > 0
  );
}

function validateImportedBackupShape(backup: DatabaseBackup): void {
  if (!Array.isArray(backup.prompts) || !Array.isArray(backup.folders) || !Array.isArray(backup.versions)) {
    throw new Error("Invalid PromptHub backup: prompts, folders, and versions must be arrays.");
  }

  if (!backup.prompts.every(hasPromptShape)) {
    throw new Error("Invalid PromptHub backup: prompts payload is malformed.");
  }

  if (!backup.folders.every(hasFolderShape)) {
    throw new Error("Invalid PromptHub backup: folders payload is malformed.");
  }

  if (!backup.versions.every(hasPromptVersionShape)) {
    throw new Error("Invalid PromptHub backup: versions payload is malformed.");
  }

  if (backup.rules && !backup.rules.every(hasRuleShape)) {
    throw new Error("Invalid PromptHub backup: rules payload is malformed.");
  }

  if (backup.skills && !backup.skills.every(hasSkillShape)) {
    throw new Error("Invalid PromptHub backup: skills payload is malformed.");
  }

  if (backup.skillVersions && !backup.skillVersions.every(hasSkillVersionShape)) {
    throw new Error("Invalid PromptHub backup: skill versions payload is malformed.");
  }

  if (backup.skillFiles) {
    for (const files of Object.values(backup.skillFiles)) {
      if (!Array.isArray(files) || !files.every(hasSkillFileSnapshotShape)) {
        throw new Error("Invalid PromptHub backup: skill files payload is malformed.");
      }
    }
  }
}

/**
 * Lenient, per-record sanitization for file-based imports.
 *
 * Historical backups (especially from v0.4.x/v0.5.1) can contain individual
 * records with missing fields due to schema drift across versions. Rejecting
 * the entire payload because of a single malformed record means the user
 * loses ALL their data. We instead drop the bad records and report the
 * count, so good data still flows through.
 *
 * Referential integrity is preserved: prompt versions referencing dropped
 * prompts are themselves dropped; skill versions / skill files referencing
 * dropped skills are dropped too. This prevents orphaned FK records.
 *
 * 针对文件导入的宽容式逐条清洗。历史备份因跨版本 schema 漂移可能含字段缺失
 * 的个别记录，整包拒绝会让用户失去全部数据。改为"丢坏条目 + 统计"以保住好
 * 数据。同步维护引用完整性：被丢 prompt 对应的 version 一并丢弃；被丢 skill
 * 对应的 version / files 一并丢弃。
 */
export function sanitizeImportedBackup(
  raw: DatabaseBackup,
): ParsedBackup {
  const skipped = createEmptySkippedStats();

  const originalFoldersLen = raw.folders.length;
  const structurallyValidFolders = raw.folders.filter(hasFolderShape);
  skipped.folders = originalFoldersLen - structurallyValidFolders.length;
  const validFolderIds = new Set(structurallyValidFolders.map((folder) => folder.id));
  const validFolders = structurallyValidFolders.map((folder) => {
    if (folder.parentId && !validFolderIds.has(folder.parentId)) {
      skipped.folders += 1;
      return {
        ...folder,
        parentId: null,
      };
    }

    return folder;
  });
  const normalizedFolderIds = new Set(validFolders.map((folder) => folder.id));

  const originalPromptsLen = raw.prompts.length;
  const validPrompts = raw.prompts
    .filter(hasPromptShape)
    .map((prompt) => {
      if (prompt.folderId && !normalizedFolderIds.has(prompt.folderId)) {
        skipped.prompts += 1;
        return {
          ...prompt,
          folderId: null,
        };
      }

      return prompt;
    });
  skipped.prompts += originalPromptsLen - validPrompts.length;
  const validPromptIds = new Set(validPrompts.map((p) => p.id));

  const originalVersionsLen = raw.versions.length;
  const structurallyValidVersions = raw.versions.filter(hasPromptVersionShape);
  const validVersions = structurallyValidVersions.filter((v) =>
    validPromptIds.has((v as unknown as { promptId: string }).promptId),
  );
  skipped.versions = originalVersionsLen - validVersions.length;

  let validRules = raw.rules;
  if (raw.rules) {
    const originalRulesLen = raw.rules.length;
    validRules = raw.rules.filter(hasRuleShape);
    skipped.rules = originalRulesLen - validRules.length;
  }

  let validSkills = raw.skills;
  const validSkillIds = new Set<string>();
  if (raw.skills) {
    const originalSkillsLen = raw.skills.length;
    validSkills = raw.skills.filter(hasSkillShape);
    skipped.skills = originalSkillsLen - validSkills.length;
    for (const s of validSkills) {
      validSkillIds.add((s as unknown as { id: string }).id);
    }
  }

  let validSkillVersions = raw.skillVersions;
  if (raw.skillVersions) {
    const originalSkillVersionsLen = raw.skillVersions.length;
    const structurallyValid = raw.skillVersions.filter(hasSkillVersionShape);
    validSkillVersions = raw.skills
      ? structurallyValid.filter((v) =>
          validSkillIds.has((v as unknown as { skillId: string }).skillId),
        )
      : structurallyValid;
    skipped.skillVersions = originalSkillVersionsLen - validSkillVersions.length;
  }

  let validSkillFiles = raw.skillFiles;
  if (raw.skillFiles) {
    const sanitized: typeof raw.skillFiles = {};
    for (const [skillId, files] of Object.entries(raw.skillFiles)) {
      if (raw.skills && !validSkillIds.has(skillId)) {
        skipped.skillFiles += Array.isArray(files) ? files.length : 0;
        continue;
      }
      if (!Array.isArray(files)) {
        continue;
      }
      const originalLen = files.length;
      const validFiles = files.filter(hasSkillFileSnapshotShape);
      skipped.skillFiles += originalLen - validFiles.length;
      if (validFiles.length > 0) {
        sanitized[skillId] = validFiles as typeof files;
      }
    }
    validSkillFiles = sanitized;
  }

  return {
    backup: {
      ...raw,
      prompts: validPrompts,
      folders: validFolders,
      versions: validVersions,
      rules: validRules,
      skills: validSkills,
      skillVersions: validSkillVersions,
      skillFiles: validSkillFiles,
    },
    skipped,
  };
}

function parseEnvelope(text: string): DatabaseBackup {
  const parsed = JSON.parse(text) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("Invalid PromptHub backup: expected a JSON object.");
  }

  if (parsed.kind === "prompthub-backup" || parsed.kind === "prompthub-export") {
    return normalizeImportedBackup(parsed.payload as Partial<DatabaseBackup>);
  }

  const hasKnownRootFields =
    "prompts" in parsed ||
    "folders" in parsed ||
    "versions" in parsed ||
    "skills" in parsed ||
    "skillVersions" in parsed ||
    "skillFiles" in parsed;

  if (!hasKnownRootFields) {
    throw new Error(
      "Invalid PromptHub backup: unsupported file format. Please import a PromptHub backup/export file.",
    );
  }

  return normalizeImportedBackup(parsed as Partial<DatabaseBackup>);
}

/**
 * Lenient file-import entry point. Recognized PromptHub envelopes (including
 * legacy raw payloads) are parsed and then sanitized per-record so partial
 * data corruption no longer triggers an all-or-nothing rejection.
 *
 * 宽容式文件导入入口。已识别的 PromptHub 信封（含历史裸 payload）会被解析并
 * 逐条清洗，个别条目损坏不再导致整包拒绝。
 */
export function parsePromptHubBackupFile(text: string): ParsedBackup {
  const normalized = parseEnvelope(text);
  return sanitizeImportedBackup(normalized);
}

/**
 * Strict variant retained for internal callers that pass DatabaseBackup
 * objects programmatically (not from user files). Keeps the original
 * "reject the whole payload on any structural problem" semantics, which is
 * the safe default for in-process flows where a malformed payload indicates
 * a bug rather than drifted legacy data.
 *
 * 保留严格版本供内部编程式调用（非用户文件）使用。保持原"任何结构异常即整
 * 包拒绝"的语义——程序内传入不合法 payload 通常是 bug 信号，应该尽早抛出。
 */
export function parsePromptHubBackupFileContent(text: string): DatabaseBackup {
  const normalized = parseEnvelope(text);
  validateImportedBackupShape(normalized);
  return normalized;
}
