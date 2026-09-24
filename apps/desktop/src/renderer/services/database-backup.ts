import type { PromptVersion, RuleBackupRecord } from "@prompthub/shared/types";
import { skillSnapshotEnvelopeKind } from "@prompthub/shared/utils/skill-file-snapshot";
import type {
  Skill,
  SkillFileSnapshot,
  SkillVersion,
} from "@prompthub/shared/types/skill";
import {
  getAllFolders,
  getAllPrompts,
  listPromptRelations,
  listOutputFormatItems,
} from "./database";
import {
  DB_BACKUP_VERSION,
  createEmptySkippedStats,
  hasMeaningfulBackupContent,
  normalizeImportedBackup,
  parsePromptHubBackupFile,
  parsePromptHubBackupFileContent,
} from "./database-backup-format";
import type {
  DatabaseBackup,
  ExportScope,
  ImportSkippedStats,
  ParsedBackup,
  PromptHubFile,
} from "./database-backup-format";
export type {
  DatabaseBackup,
  ExportScope,
  ImportSkippedStats,
  ParsedBackup,
  PromptHubFile,
} from "./database-backup-format";
import {
  getCanonicalAiConfigSnapshot,
  getCanonicalSettingsStateSnapshot,
  restoreAiConfigSnapshot,
  restoreSettingsStateSnapshot,
  SENSITIVE_SETTINGS_FIELDS,
} from "./settings-snapshot";
import {
  collectAgentAssetFilesSnapshot,
  collectAgentManagementBackup,
  collectMcpLibrary,
  collectPluginSnapshot,
  collectStoreSourcesSnapshot,
  restoreStoreSourcesSnapshot,
} from "./database-backup-assets";
import { createAtomicLogicalImportEnvelope } from "./database-backup-portable";

async function collectRuleData(): Promise<RuleBackupRecord[]> {
  const rulesApi = window.api?.rules;
  if (!rulesApi?.list || !rulesApi?.read) {
    return [];
  }

  const files = await rulesApi.list();
  return Promise.all(
    files.map(async (file) => {
      const full = await rulesApi.read(file.id);
      return {
        id: full.id,
        platformId: full.platformId,
        platformName: full.platformName,
        platformIcon: full.platformIcon,
        platformDescription: full.platformDescription,
        name: full.name,
        description: full.description,
        path: full.path,
        managedPath: full.managedPath,
        targetPath: full.targetPath,
        projectRootPath: full.projectRootPath ?? null,
        syncStatus: full.syncStatus,
        content: full.content,
        versions: full.versions,
      } satisfies RuleBackupRecord;
    }),
  );
}
const DB_VERSION = DB_BACKUP_VERSION;
const IMAGE_BATCH_SIZE = 10;
const IMAGE_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const IMAGE_MAX_COUNT = 500;
const VIDEO_BATCH_SIZE = 5;
const VIDEO_MAX_SIZE_BYTES = 100 * 1024 * 1024;
const VIDEO_MAX_COUNT = 100;
const SKILL_CONCURRENCY = 5;
const SUPPORTED_BACKUP_EXTENSIONS = [
  ".phub.gz",
  ".json",
  ".phub",
  ".gz",
  ".zip",
];

export const BACKUP_IMPORT_ACCEPT = ".json,.phub,.gz,.zip,.db";

export function isSupportedBackupFileName(fileName: string): boolean {
  const normalized = fileName.trim().toLowerCase();
  return SUPPORTED_BACKUP_EXTENSIONS.some((extension) =>
    normalized.endsWith(extension),
  );
}

export function isPotentialSqliteBackupFileName(fileName: string): boolean {
  const normalized = fileName.trim().toLowerCase();
  return (
    normalized === "prompthub.db" ||
    /^prompthub\.db\.(?:backup(?:-before)?-|pre-recovery-|integrity-backup-|legacy-conflict-)/.test(
      normalized,
    )
  );
}

export function pickSupportedBackupFile(files: FileList | File[]): File | null {
  return (
    Array.from(files).find((file) => isSupportedBackupFileName(file.name)) ??
    null
  );
}

interface MediaCollectionLimits {
  maxCount?: number;
  maxSizeBytes?: number;
}

async function processBatched<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  return results;
}

async function collectImages(
  prompts: Awaited<ReturnType<typeof getAllPrompts>>,
  limits?: MediaCollectionLimits,
): Promise<{ [fileName: string]: string }> {
  const images: { [fileName: string]: string } = {};
  const imageFileNames = new Set<string>();
  const readFailures: string[] = [];

  for (const prompt of prompts) {
    if (prompt.images && Array.isArray(prompt.images)) {
      for (const img of prompt.images) {
        imageFileNames.add(img);
      }
    }
  }

  const allNames = Array.from(imageFileNames);
  if (
    typeof limits?.maxCount === "number" &&
    allNames.length > limits.maxCount
  ) {
    console.warn(
      `Image count (${allNames.length}) exceeds limit (${limits.maxCount}), truncating`,
    );
  }
  const namesToProcess =
    typeof limits?.maxCount === "number"
      ? allNames.slice(0, limits.maxCount)
      : allNames;

  await processBatched(namesToProcess, IMAGE_BATCH_SIZE, async (fileName) => {
    try {
      const size = await window.electron?.getImageSize?.(fileName);
      if (
        typeof limits?.maxSizeBytes === "number" &&
        size != null &&
        size > limits.maxSizeBytes
      ) {
        console.warn(
          `Skipping image ${fileName}: size ${(size / 1024 / 1024).toFixed(1)}MB exceeds ${limits.maxSizeBytes / 1024 / 1024}MB limit`,
        );
        return;
      }

      const base64 = await window.electron?.readImageBase64?.(fileName);
      if (base64) {
        images[fileName] = base64;
      }
    } catch (error) {
      readFailures.push(fileName);
      console.warn(`Failed to read image ${fileName}:`, error);
    }
  });

  if (readFailures.length > 0) {
    const preview = readFailures.slice(0, 5).join(", ");
    throw new Error(
      `Backup export failed to read ${readFailures.length} image files: ${preview}`,
    );
  }

  return images;
}

async function collectVideos(
  prompts: Awaited<ReturnType<typeof getAllPrompts>>,
  limits?: MediaCollectionLimits,
): Promise<{ [fileName: string]: string }> {
  const videos: { [fileName: string]: string } = {};
  const videoFileNames = new Set<string>();
  const readFailures: string[] = [];

  for (const prompt of prompts) {
    if (prompt.videos && Array.isArray(prompt.videos)) {
      for (const video of prompt.videos) {
        videoFileNames.add(video);
      }
    }
  }

  const allNames = Array.from(videoFileNames);
  if (
    typeof limits?.maxCount === "number" &&
    allNames.length > limits.maxCount
  ) {
    console.warn(
      `Video count (${allNames.length}) exceeds limit (${limits.maxCount}), truncating`,
    );
  }
  const namesToProcess =
    typeof limits?.maxCount === "number"
      ? allNames.slice(0, limits.maxCount)
      : allNames;

  await processBatched(namesToProcess, VIDEO_BATCH_SIZE, async (fileName) => {
    try {
      const size = await window.electron?.getVideoSize?.(fileName);
      if (
        typeof limits?.maxSizeBytes === "number" &&
        size != null &&
        size > limits.maxSizeBytes
      ) {
        console.warn(
          `Skipping video ${fileName}: size ${(size / 1024 / 1024).toFixed(1)}MB exceeds ${limits.maxSizeBytes / 1024 / 1024}MB limit`,
        );
        return;
      }

      const base64 = await window.electron?.readVideoBase64?.(fileName);
      if (base64) {
        videos[fileName] = base64;
      }
    } catch (error) {
      readFailures.push(fileName);
      console.warn(`Failed to read video ${fileName}:`, error);
    }
  });

  if (readFailures.length > 0) {
    const preview = readFailures.slice(0, 5).join(", ");
    throw new Error(
      `Backup export failed to read ${readFailures.length} video files: ${preview}`,
    );
  }

  return videos;
}

async function collectSkillData(includeFiles = true): Promise<{
  skills: Skill[];
  skillVersions: SkillVersion[];
  skillFiles: { [skillId: string]: SkillFileSnapshot[] };
}> {
  const skills: Skill[] = [];
  const skillVersions: SkillVersion[] = [];
  const skillFiles: { [skillId: string]: SkillFileSnapshot[] } = {};
  const readFailures: string[] = [];
  const skillApi = window.api?.skill;

  if (!skillApi?.getAll) {
    return { skills, skillVersions, skillFiles };
  }

  let allSkills: Skill[] = [];
  try {
    allSkills = (await skillApi.getAll()) ?? [];
  } catch (error) {
    throw new Error(
      `Backup export failed to list skills: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  skills.push(...allSkills);
  if (includeFiles && allSkills.length && !skillApi.readFilesSnapshot) {
    throw new Error(
      "Lossless Skill snapshot API is unavailable; update the desktop client before backing up",
    );
  }

  await processBatched(allSkills, SKILL_CONCURRENCY, async (skill) => {
    const [versionsResult, filesResult] = await Promise.allSettled([
      skillApi.versionGetAll?.(skill.id),
      includeFiles
        ? skillApi.readFilesSnapshot?.(skill.id)
        : Promise.resolve(undefined),
    ]);

    if (versionsResult.status === "fulfilled" && versionsResult.value) {
      skillVersions.push(...versionsResult.value);
    } else if (versionsResult.status === "rejected") {
      readFailures.push(`skill versions ${skill.name}`);
      console.warn(
        `Failed to get versions for skill ${skill.name}:`,
        versionsResult.reason,
      );
    }

    if (filesResult.status === "fulfilled" && filesResult.value) {
      const fileSnapshots = filesResult.value;

      if (fileSnapshots.length > 0) {
        skillFiles[skill.id] = fileSnapshots;
      }
    } else if (filesResult.status === "rejected") {
      readFailures.push(`skill files ${skill.name}`);
      console.warn(
        `Failed to read local files for skill ${skill.name}:`,
        filesResult.reason,
      );
    }
  });

  if (readFailures.length > 0) {
    const preview = readFailures.slice(0, 5).join(", ");
    throw new Error(
      `Backup export failed to read ${readFailures.length} skill records: ${preview}`,
    );
  }

  return { skills, skillVersions, skillFiles };
}

async function gzipText(text: string): Promise<Blob> {
  const stream = new Blob([text], { type: "application/json" })
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).blob();
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);

  const cleanup = () => {
    if (a.isConnected) {
      document.body.removeChild(a);
    }
    URL.revokeObjectURL(url);
  };

  try {
    a.click();
  } catch (error) {
    cleanup();
    throw error;
  }

  setTimeout(cleanup, 1000);
}

async function gunzipToText(blob: Blob): Promise<string> {
  const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

export interface ImportPreviewSummary {
  kind: PromptHubFile["kind"] | "legacy-payload";
  exportedAt: string;
  counts: {
    prompts: number;
    folders: number;
    versions: number;
    promptRelations: number;
    outputFormatItems: number;
    rules: number;
    skills: number;
    skillVersions: number;
    skillFiles: number;
    mcpServers: number;
    plugins: number;
    pluginFiles: number;
    images: number;
    videos: number;
  };
  skipped: ImportSkippedStats;
}

async function unzipExportToText(file: File): Promise<string> {
  const archivePath = window.electron?.getPathForFile?.(file) ?? "";
  const previewPortableBackup = window.electron?.previewPortableBackup;
  if (archivePath && previewPortableBackup) {
    const result = await previewPortableBackup(archivePath);
    if (!result.success || typeof result.text !== "string") {
      throw new Error(result.error || "Portable snapshot preview failed");
    }
    return result.text;
  }
  const { unzipSync } = await import("fflate");
  const buffer = await file.arrayBuffer();
  const unzipped = unzipSync(new Uint8Array(buffer));
  const jsonEntry = unzipped["import-with-prompthub.json"];
  if (!jsonEntry) {
    throw new Error(
      "ZIP 文件中缺少 import-with-prompthub.json，无法导入。请使用 PromptHub 导出的 ZIP 文件。",
    );
  }
  return new TextDecoder().decode(jsonEntry);
}

async function readBackupFileText(file: File): Promise<string> {
  if (file.name.endsWith(".gz")) return gunzipToText(file);
  if (file.name.endsWith(".zip")) return unzipExportToText(file);
  return file.text();
}

function parsePromptHubFileKind(text: string): ImportPreviewSummary["kind"] {
  const parsed = JSON.parse(text) as unknown;
  if (
    parsed &&
    typeof parsed === "object" &&
    "kind" in parsed &&
    (parsed.kind === "prompthub-backup" ||
      parsed.kind === "prompthub-export" ||
      parsed.kind === "prompthub-backup-v2" ||
      parsed.kind === "prompthub-export-v2")
  ) {
    return parsed.kind;
  }
  return "legacy-payload";
}

export async function previewImportFile(
  file: File,
): Promise<{ backup: DatabaseBackup; summary: ImportPreviewSummary }> {
  const text = await readBackupFileText(file);
  const kind = parsePromptHubFileKind(text);
  const parsed: ParsedBackup = parsePromptHubBackupFile(text);
  const { backup, skipped } = parsed;

  const summary: ImportPreviewSummary = {
    kind,
    exportedAt: backup.exportedAt,
    counts: {
      prompts: backup.prompts.length,
      folders: backup.folders.length,
      versions: backup.versions.length,
      promptRelations: backup.promptRelations?.length ?? 0,
      outputFormatItems: backup.outputFormatItems?.length ?? 0,
      rules: backup.rules?.length ?? 0,
      skills: backup.skills?.length ?? 0,
      skillVersions: backup.skillVersions?.length ?? 0,
      skillFiles: Object.values(backup.skillFiles ?? {}).reduce(
        (count, files) => count + files.length,
        0,
      ),
      mcpServers: backup.mcpLibrary?.servers.length ?? 0,
      plugins: backup.pluginLibrary?.plugins.length ?? 0,
      pluginFiles: (backup.pluginPackages ?? []).reduce(
        (count, pluginPackage) => count + pluginPackage.files.length,
        0,
      ),
      images: Object.keys(backup.images ?? {}).length,
      videos: Object.keys(backup.videos ?? {}).length,
    },
    skipped,
  };

  return { backup, summary };
}

async function getAllPromptVersions(): Promise<PromptVersion[]> {
  const versions: PromptVersion[] = [];
  for (const prompt of await getAllPrompts()) {
    versions.push(...(await window.api.version.getAll(prompt.id)));
  }
  return versions;
}

async function importDatabaseViaMainProcess(
  backup: DatabaseBackup,
): Promise<void> {
  if (typeof window.api?.prompt?.restoreGraph !== "function")
    throw new Error("Current graph restore API is unavailable");
  await window.api.prompt.restoreGraph({
    folders: backup.folders,
    prompts: backup.prompts,
    versions: backup.versions,
    promptRelations: backup.promptRelations,
    outputFormatItems: backup.outputFormatItems,
  });
}

export async function exportDatabase(options?: {
  skipImageContent?: boolean;
  skipVideoContent?: boolean;
  skipSkillFileContent?: boolean;
  skipMcpAssetFileContent?: boolean;
  skipPluginAssetFileContent?: boolean;
  skipPluginPackageContent?: boolean;
  limitMedia?: boolean;
  skipAgentManagement?: boolean;
  selection?: Required<ExportScope>;
}): Promise<DatabaseBackup> {
  const selected = options?.selection;
  const include = (key: keyof ExportScope) => !selected || selected[key];
  const needPrompts =
    include("prompts") || include("images") || include("videos");
  const [prompts, folders, versions] = await Promise.all([
    needPrompts ? getAllPrompts() : Promise.resolve([]),
    include("folders") ? getAllFolders() : Promise.resolve([]),
    include("versions") ? getAllPromptVersions() : Promise.resolve([]),
  ]);

  const imageLimits = options?.limitMedia
    ? {
        maxCount: IMAGE_MAX_COUNT,
        maxSizeBytes: IMAGE_MAX_SIZE_BYTES,
      }
    : undefined;
  const videoLimits = options?.limitMedia
    ? {
        maxCount: VIDEO_MAX_COUNT,
        maxSizeBytes: VIDEO_MAX_SIZE_BYTES,
      }
    : undefined;

  const [
    images,
    videos,
    skillData,
    ruleData,
    mcpLibrary,
    pluginSnapshot,
    agentAssetFiles,
    agentManagement,
    promptRelations,
    outputFormatItems,
  ] = await Promise.all([
    include("images") && !options?.skipImageContent
      ? collectImages(prompts, imageLimits)
      : Promise.resolve(undefined),
    options?.skipVideoContent || !include("videos")
      ? Promise.resolve(undefined)
      : collectVideos(prompts, videoLimits),
    include("skills")
      ? collectSkillData(!options?.skipSkillFileContent)
      : Promise.resolve({ skills: [], skillVersions: [], skillFiles: {} }),
    include("rules") ? collectRuleData() : Promise.resolve([]),
    include("mcp") ? collectMcpLibrary() : Promise.resolve(undefined),
    include("plugins")
      ? collectPluginSnapshot(!options?.skipPluginPackageContent)
      : Promise.resolve({
          pluginLibrary: undefined,
          pluginPackages: undefined,
        }),
    (include("mcp") && !options?.skipMcpAssetFileContent) ||
    (include("plugins") && !options?.skipPluginAssetFileContent)
      ? collectAgentAssetFilesSnapshot({
          mcp: include("mcp") && !options?.skipMcpAssetFileContent,
          plugins: include("plugins") && !options?.skipPluginAssetFileContent,
        })
      : Promise.resolve(undefined),
    options?.skipAgentManagement || !include("agents")
      ? Promise.resolve(undefined)
      : collectAgentManagementBackup(),
    include("prompts") ? listPromptRelations() : Promise.resolve([]),
    include("prompts") ? listOutputFormatItems() : Promise.resolve([]),
  ]);

  const settingsSnapshot = include("settings")
    ? await getCanonicalSettingsStateSnapshot({
        excludeFields: SENSITIVE_SETTINGS_FIELDS,
        updatedAt: new Date().toISOString(),
      })
    : null;
  const aiConfigSnapshot = include("aiConfig")
    ? await getCanonicalAiConfigSnapshot({
        includeRootApiKey: false,
      })
    : undefined;
  if (aiConfigSnapshot) {
    delete aiConfigSnapshot.aiApiKey;
  }
  const storeSources =
    include("skills") || include("mcp") || include("plugins")
      ? await collectStoreSourcesSnapshot()
      : undefined;

  return {
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    prompts,
    folders,
    versions,
    promptRelations: promptRelations.length > 0 ? promptRelations : undefined,
    outputFormatItems:
      outputFormatItems.length > 0 ? outputFormatItems : undefined,
    images,
    videos,
    aiConfig: aiConfigSnapshot,
    settings: settingsSnapshot ? { state: settingsSnapshot.state } : undefined,
    settingsUpdatedAt: settingsSnapshot?.settingsUpdatedAt,
    rules: ruleData.length > 0 ? ruleData : undefined,
    skills: skillData.skills.length > 0 ? skillData.skills : undefined,
    skillVersions:
      skillData.skillVersions.length > 0 ? skillData.skillVersions : undefined,
    skillFiles:
      Object.keys(skillData.skillFiles).length > 0
        ? skillData.skillFiles
        : undefined,
    mcpLibrary,
    pluginLibrary: pluginSnapshot.pluginLibrary,
    pluginPackages: options?.skipPluginPackageContent
      ? undefined
      : pluginSnapshot.pluginPackages,
    storeSources,
    agentAssetFiles,
    agentManagement,
  };
}

export async function importDatabase(backup: DatabaseBackup): Promise<void> {
  const normalizedBackup = normalizeImportedBackup(backup);

  // Never clear local data unless the imported payload has already passed the
  // same structural validation as file-based imports.
  parsePromptHubBackupFileContent(
    JSON.stringify({
      kind: "prompthub-backup",
      exportedAt: normalizedBackup.exportedAt,
      payload: normalizedBackup,
    }),
  );

  if (!hasMeaningfulBackupContent(normalizedBackup)) {
    throw new Error(
      "Backup restore was blocked because the imported backup is empty. " +
        "Refusing to overwrite current data with an empty payload.",
    );
  }

  const restoredSkillIdMap = new Map<string, string>();
  const restoredSkillsByName = new Map<string, Skill>();
  const restoreFailures: string[] = [];
  await importDatabaseViaMainProcess(normalizedBackup);

  if (normalizedBackup.images) {
    for (const [fileName, base64] of Object.entries(normalizedBackup.images)) {
      try {
        await window.electron?.saveImageBase64?.(fileName, base64);
      } catch (error) {
        restoreFailures.push(`image ${fileName}`);
        console.warn(`Failed to restore image ${fileName}:`, error);
      }
    }
  }

  if (normalizedBackup.videos) {
    for (const [fileName, base64] of Object.entries(normalizedBackup.videos)) {
      try {
        await window.electron?.saveVideoBase64?.(fileName, base64);
      } catch (error) {
        restoreFailures.push(`video ${fileName}`);
        console.warn(`Failed to restore video ${fileName}:`, error);
      }
    }
  }

  if (normalizedBackup.aiConfig) {
    await restoreAiConfigSnapshot(normalizedBackup.aiConfig);
  }

  if (normalizedBackup.settings) {
    await restoreSettingsStateSnapshot(normalizedBackup.settings, {
      preserveLocalFields: SENSITIVE_SETTINGS_FIELDS,
    });
  }

  await restoreStoreSourcesSnapshot(normalizedBackup.storeSources);

  if (normalizedBackup.agentManagement) {
    try {
      const restoreManagementBackup =
        window.api?.agent?.restoreManagementBackup;
      if (!restoreManagementBackup) {
        throw new Error("Agent management restore API is unavailable");
      }
      await restoreManagementBackup(normalizedBackup.agentManagement);
    } catch (error) {
      restoreFailures.push("Agent management restore");
      console.warn("Failed to restore Agent management data:", error);
    }
  }

  if (normalizedBackup.rules && normalizedBackup.rules.length > 0) {
    try {
      await window.api?.rules?.importRecords?.(normalizedBackup.rules, {
        replace: true,
      });
    } catch (error) {
      restoreFailures.push("rules restore");
      console.warn("Failed to restore rules:", error);
    }
  }

  try {
    await window.api?.skill?.deleteAll();
  } catch (error) {
    restoreFailures.push("existing skills cleanup");
    console.warn("Failed to clear existing skills:", error);
  }

  if (normalizedBackup.skills && normalizedBackup.skills.length > 0) {
    for (const skill of normalizedBackup.skills) {
      if (!skill.name || typeof skill.name !== "string" || !skill.name.trim()) {
        console.warn("Skipping skill from backup with missing name:", skill.id);
        continue;
      }

      try {
        const {
          id: _id,
          created_at: _createdAt,
          updated_at: _updatedAt,
          // Backup files can cross machines. Reusing an old local source path
          // could write restored files into a missing or user-owned directory.
          local_repo_path: _localRepoPath,
          ...createData
        } = skill;
        const restoredSkill = await window.api?.skill?.create(
          {
            ...createData,
            is_favorite: createData.is_favorite ?? false,
            protocol_type: createData.protocol_type ?? "skill",
            currentVersion: createData.currentVersion,
            source_id: createData.source_id,
            source_label: createData.source_label,
            source_branch: createData.source_branch,
            source_directory: createData.source_directory,
            canonical_skill_path: createData.canonical_skill_path,
          },
          { skipInitialVersion: true },
        );
        if (restoredSkill) {
          restoredSkillIdMap.set(skill.id, restoredSkill.id);
          restoredSkillsByName.set(restoredSkill.name, restoredSkill);
        }
      } catch (error) {
        restoreFailures.push(`skill ${skill.name}`);
        console.warn(`Failed to restore skill ${skill.name}:`, error);
      }
    }
  }

  if (
    normalizedBackup.skillVersions &&
    normalizedBackup.skillVersions.length > 0
  ) {
    const nextCurrentVersionBySkillId = new Map<string, number>();

    for (const version of normalizedBackup.skillVersions) {
      try {
        const restoredSkillId =
          restoredSkillIdMap.get(version.skillId) ?? version.skillId;
        const remappedVersion: SkillVersion = {
          ...version,
          skillId: restoredSkillId,
        };
        await window.api?.skill?.insertVersionDirect(remappedVersion);
        nextCurrentVersionBySkillId.set(
          restoredSkillId,
          Math.max(
            nextCurrentVersionBySkillId.get(restoredSkillId) ?? 1,
            version.version + 1,
          ),
        );
      } catch (error) {
        restoreFailures.push(
          `skill version ${version.skillId}@${version.version}`,
        );
        console.warn(
          `Failed to restore skill version ${version.skillId}@${version.version}:`,
          error,
        );
      }
    }

    for (const [skillId, currentVersion] of nextCurrentVersionBySkillId) {
      try {
        await window.api?.skill?.update(skillId, { currentVersion });
      } catch (error) {
        restoreFailures.push(`skill current version ${skillId}`);
        console.warn(
          `Failed to restore current version for skill ${skillId}:`,
          error,
        );
      }
    }
  }

  if (normalizedBackup.skillFiles) {
    for (const [skillKey, files] of Object.entries(
      normalizedBackup.skillFiles,
    )) {
      const restoredSkillId =
        restoredSkillIdMap.get(skillKey) ??
        restoredSkillsByName.get(skillKey)?.id ??
        skillKey;

      try {
        await window.api.skill.replaceFilesSnapshot(restoredSkillId, files);
      } catch (error) {
        restoreFailures.push(`skill package ${skillKey}`);
        console.warn(`Failed to restore skill package ${skillKey}:`, error);
      }
    }
  }

  if (normalizedBackup.agentAssetFiles?.mcp) {
    try {
      await window.api?.mcp?.restoreDataFiles?.(
        normalizedBackup.agentAssetFiles.mcp,
      );
    } catch (error) {
      restoreFailures.push("MCP asset files restore");
      console.warn("Failed to restore MCP asset files:", error);
    }
  }

  if (normalizedBackup.agentAssetFiles?.plugins) {
    try {
      await window.api?.plugin?.restoreDataFiles?.(
        normalizedBackup.agentAssetFiles.plugins,
      );
    } catch (error) {
      restoreFailures.push("plugin asset files restore");
      console.warn("Failed to restore plugin asset files:", error);
    }
  }

  if (normalizedBackup.mcpLibrary) {
    try {
      await window.api?.mcp?.replaceLibrary?.(normalizedBackup.mcpLibrary);
    } catch (error) {
      restoreFailures.push("MCP library restore");
      console.warn("Failed to restore MCP library:", error);
    }
  }

  if (normalizedBackup.pluginLibrary) {
    try {
      await window.api?.plugin?.restoreLibrarySnapshot?.({
        library: normalizedBackup.pluginLibrary,
        packages: normalizedBackup.pluginPackages,
      });
    } catch (error) {
      restoreFailures.push("plugin library restore");
      console.warn("Failed to restore plugin library:", error);
    }
  }

  if (restoreFailures.length > 0) {
    const preview = restoreFailures.slice(0, 5).join(", ");
    throw new Error(
      `Backup restore completed with ${restoreFailures.length} file errors: ${preview}`,
    );
  }
}

export { getDatabaseInfo } from "./database";

export async function downloadBackup(): Promise<void> {
  const backup = await exportDatabase();
  const file: PromptHubFile = {
    kind: skillSnapshotEnvelopeKind("prompthub-backup", backup),
    exportedAt: backup.exportedAt,
    payload: backup,
  };
  const blob = new Blob([JSON.stringify(file, null, 2)], {
    type: "application/json",
  });
  triggerBlobDownload(
    blob,
    `prompthub-backup-${new Date().toISOString().split("T")[0]}.json`,
  );
}

export async function downloadCompressedBackup(): Promise<void> {
  const backup = await exportDatabase();
  const file: PromptHubFile = {
    kind: skillSnapshotEnvelopeKind("prompthub-backup", backup),
    exportedAt: backup.exportedAt,
    payload: backup,
  };
  const gz = await gzipText(JSON.stringify(file));
  triggerBlobDownload(
    gz,
    `prompthub-backup-${new Date().toISOString().split("T")[0]}.phub.gz`,
  );
}

export async function downloadSelectiveExport(
  scope: ExportScope,
): Promise<void> {
  const normalized: Required<ExportScope> = {
    prompts: !!scope.prompts,
    folders: !!scope.folders,
    versions: !!scope.versions,
    images: !!scope.images,
    videos: !!scope.videos,
    aiConfig: !!scope.aiConfig,
    settings: !!scope.settings,
    rules: !!scope.rules,
    skills: !!scope.skills,
    mcp: !!scope.mcp,
    plugins: !!scope.plugins,
    agents: !!scope.agents,
  };

  const usesMainArchive =
    typeof window !== "undefined" && Boolean(window.electron?.exportZip);
  const fullBackup = await exportDatabase({
    skipImageContent: usesMainArchive,
    skipVideoContent: !normalized.videos || usesMainArchive,
    skipSkillFileContent: usesMainArchive,
    skipMcpAssetFileContent: false,
    skipPluginAssetFileContent: usesMainArchive,
    skipPluginPackageContent: usesMainArchive,
    skipAgentManagement: !normalized.agents,
    selection: normalized,
  });

  const payload: Partial<DatabaseBackup> = {
    version: DB_VERSION,
    exportedAt: fullBackup.exportedAt,
    prompts: normalized.prompts ? fullBackup.prompts : [],
    folders: normalized.folders ? fullBackup.folders : [],
    versions: normalized.versions ? fullBackup.versions : [],
    promptRelations: normalized.prompts
      ? fullBackup.promptRelations
      : undefined,
    outputFormatItems: normalized.prompts
      ? fullBackup.outputFormatItems
      : undefined,
    images: normalized.images ? fullBackup.images : undefined,
    videos: normalized.videos ? fullBackup.videos : undefined,
    aiConfig: normalized.aiConfig ? fullBackup.aiConfig : undefined,
    settings: normalized.settings ? fullBackup.settings : undefined,
    settingsUpdatedAt: normalized.settings
      ? fullBackup.settingsUpdatedAt
      : undefined,
    rules: normalized.rules ? fullBackup.rules : undefined,
    skills: normalized.skills ? fullBackup.skills : undefined,
    skillVersions: normalized.skills ? fullBackup.skillVersions : undefined,
    skillFiles: normalized.skills ? fullBackup.skillFiles : undefined,
    mcpLibrary: normalized.mcp ? fullBackup.mcpLibrary : undefined,
    pluginLibrary: normalized.plugins ? fullBackup.pluginLibrary : undefined,
    pluginPackages: normalized.plugins ? fullBackup.pluginPackages : undefined,
    agentManagement: normalized.agents ? fullBackup.agentManagement : undefined,
    storeSources:
      normalized.skills || normalized.mcp || normalized.plugins
        ? {
            skills: normalized.skills
              ? fullBackup.storeSources?.skills
              : undefined,
            mcp: normalized.mcp ? fullBackup.storeSources?.mcp : undefined,
            plugins: normalized.plugins
              ? fullBackup.storeSources?.plugins
              : undefined,
          }
        : undefined,
    agentAssetFiles:
      normalized.mcp || normalized.plugins
        ? {
            mcp: normalized.mcp ? fullBackup.agentAssetFiles?.mcp : undefined,
            plugins: normalized.plugins
              ? fullBackup.agentAssetFiles?.plugins
              : undefined,
          }
        : undefined,
  };

  const exportFile: PromptHubFile = {
    kind: skillSnapshotEnvelopeKind("prompthub-export", payload),
    exportedAt: payload.exportedAt || new Date().toISOString(),
    scope: normalized,
    payload,
  };
  const exportJson = JSON.stringify(exportFile, null, 2);

  // In Electron, delegate to main process which creates a proper ZIP with readable files
  if (typeof window !== "undefined" && window.electron?.exportZip) {
    let aiConfigJson: string | undefined;
    let settingsJson: string | undefined;

    if (normalized.aiConfig) {
      const snap = await getCanonicalAiConfigSnapshot({
        includeRootApiKey: false,
      });
      if (snap) aiConfigJson = JSON.stringify(snap, null, 2);
    }
    if (normalized.settings) {
      const snap = await getCanonicalSettingsStateSnapshot({
        updatedAt: new Date().toISOString(),
      });
      if (snap) settingsJson = JSON.stringify(snap, null, 2);
    }

    const result = await window.electron.exportZip({
      scope: {
        prompts: normalized.prompts || normalized.folders,
        versions: normalized.versions,
        images: normalized.images,
        videos: normalized.videos,
        skills: normalized.skills,
        rules: normalized.rules,
        mcp: normalized.mcp,
        plugins: normalized.plugins,
        agents: normalized.agents,
        config: false,
        aiConfigJson,
        settingsJson,
        exportJson,
      },
    });

    if (result?.error) throw new Error(result.error);
    return;
  }

  // Fallback for web / non-Electron: download as PromptHub JSON format
  const blob = new Blob([exportJson], { type: "application/json" });
  triggerBlobDownload(
    blob,
    `prompthub-export-${new Date().toISOString().split("T")[0]}.json`,
  );
}

export async function restoreFromFile(file: File): Promise<ImportSkippedStats> {
  if (file.name.toLowerCase().endsWith(".zip")) {
    const archivePath = window.electron?.getPathForFile?.(file) ?? "";
    const restorePortableBackup = window.electron?.restorePortableBackup;
    if (archivePath && restorePortableBackup) {
      const result = await restorePortableBackup(archivePath);
      if (!result.success) {
        throw new Error(result.error || "Portable snapshot restore failed");
      }
      return createEmptySkippedStats();
    }
  }
  const text = await readBackupFileText(file);
  const { backup, skipped } = parsePromptHubBackupFile(text);
  const restorePortableLogicalBackup =
    window.electron?.restorePortableLogicalBackup;
  if (restorePortableLogicalBackup) {
    const result = await restorePortableLogicalBackup(
      createAtomicLogicalImportEnvelope(text, backup),
    );
    if (!result.success) {
      throw new Error(result.error || "Portable logical restore failed");
    }
    return skipped;
  }
  await importDatabase(backup);
  return skipped;
}

export function usesAtomicPortableRestore(file: File): boolean {
  if (file.name.toLowerCase().endsWith(".zip")) {
    return (
      Boolean(window.electron?.getPathForFile?.(file)) &&
      Boolean(window.electron?.restorePortableBackup)
    );
  }
  return Boolean(window.electron?.restorePortableLogicalBackup);
}

export async function restoreFromBackup(
  backup: DatabaseBackup,
): Promise<ImportSkippedStats> {
  const restorePortableLogicalBackup =
    window.electron?.restorePortableLogicalBackup;
  if (restorePortableLogicalBackup) {
    const result = await restorePortableLogicalBackup(
      createAtomicLogicalImportEnvelope(JSON.stringify(backup), backup),
    );
    if (!result.success) {
      throw new Error(result.error || "Portable logical restore failed");
    }
    return createEmptySkippedStats();
  }
  await importDatabase(backup);
  return createEmptySkippedStats();
}

export function formatBackupImportError(error: unknown): string {
  const message =
    error instanceof Error && error.message
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("unsupported file format")) {
    return "不是 PromptHub 可识别的备份文件，请选择 PromptHub 导出的 JSON、PHUB 或 ZIP 文件。";
  }

  if (
    normalizedMessage.includes("unexpected end of json input") ||
    normalizedMessage.includes("unterminated string")
  ) {
    return "备份文件不是完整 JSON，可能在导出、复制或上传过程中被截断。请重新从 PromptHub 导出完整的 JSON、PHUB 或 ZIP 文件后再导入。";
  }

  if (normalizedMessage.includes("imported backup is empty")) {
    return "该备份内容为空。为避免覆盖当前数据，PromptHub 已阻止这次导入。";
  }

  if (normalizedMessage.includes("payload is malformed")) {
    return "备份文件结构不完整或部分字段缺失，PromptHub 无法安全恢复。";
  }

  if (normalizedMessage.includes("foreign key constraint failed")) {
    return "备份中的文件夹或 Prompt 引用关系不完整，PromptHub 无法安全导入。建议重新导出一份新备份后再试。";
  }

  if (normalizedMessage.includes("file errors:")) {
    return `导入部分完成，但有附件或 Skill 文件恢复失败。${message}`;
  }

  return message || "导入失败，请检查备份文件是否完整后重试。";
}
