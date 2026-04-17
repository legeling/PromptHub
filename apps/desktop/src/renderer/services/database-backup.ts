import type { PromptVersion } from "@prompthub/shared/types";
import type {
  Skill,
  SkillFileSnapshot,
  SkillLocalFileEntry,
  SkillVersion,
} from "@prompthub/shared/types/skill";
import {
  clearDatabase,
  getAllFolders,
  getAllPrompts,
  getDatabase,
} from "./database";
import {
  DB_BACKUP_VERSION,
  createEmptySkippedStats,
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
  getAiConfigSnapshot,
  getSettingsStateSnapshot,
  restoreAiConfigSnapshot,
  restoreSettingsStateSnapshot,
} from "./settings-snapshot";
const DB_VERSION = DB_BACKUP_VERSION;
const VERSION_STORE = "versions";
const IMAGE_BATCH_SIZE = 10;
const IMAGE_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const IMAGE_MAX_COUNT = 500;
const VIDEO_BATCH_SIZE = 5;
const VIDEO_MAX_SIZE_BYTES = 100 * 1024 * 1024;
const VIDEO_MAX_COUNT = 100;
const SKILL_CONCURRENCY = 5;

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

async function collectSkillData(): Promise<{
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

  await processBatched(allSkills, SKILL_CONCURRENCY, async (skill) => {
    const [versionsResult, filesResult] = await Promise.allSettled([
      skillApi.versionGetAll?.(skill.id),
      skillApi.readLocalFiles?.(skill.id),
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
      const fileSnapshots: SkillFileSnapshot[] = (
        filesResult.value as SkillLocalFileEntry[]
      )
        .filter((file) => !file.isDirectory)
        .map((file) => ({
          relativePath: file.path,
          content: file.content,
        }));

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
    skills: number;
    skillVersions: number;
    skillFiles: number;
    images: number;
    videos: number;
  };
  skipped: ImportSkippedStats;
}

async function readBackupFileText(file: File): Promise<string> {
  return file.name.endsWith(".gz") ? gunzipToText(file) : file.text();
}

function parsePromptHubFileKind(text: string): ImportPreviewSummary["kind"] {
  const parsed = JSON.parse(text) as unknown;
  if (
    parsed &&
    typeof parsed === "object" &&
    "kind" in parsed &&
    (parsed.kind === "prompthub-backup" || parsed.kind === "prompthub-export")
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
      skills: backup.skills?.length ?? 0,
      skillVersions: backup.skillVersions?.length ?? 0,
      skillFiles: Object.values(backup.skillFiles ?? {}).reduce(
        (count, files) => count + files.length,
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
  if (window.api?.version?.getAll) {
    const prompts = await getAllPrompts();
    const versionLists = await Promise.all(
      prompts.map(async (prompt) => {
        const versions = await window.api?.version?.getAll?.(prompt.id);
        return versions ?? [];
      }),
    );
    return versionLists.flat();
  }

  const database = await getDatabase();
  return new Promise<PromptVersion[]>((resolve, reject) => {
    const transaction = database.transaction(VERSION_STORE, "readonly");
    const store = transaction.objectStore(VERSION_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function importDatabaseViaMainProcess(
  normalizedBackup: DatabaseBackup,
): Promise<boolean> {
  if (
    !window.api?.prompt?.getAll ||
    !window.api?.prompt?.delete ||
    !window.api?.prompt?.insertDirect ||
    !window.api?.folder?.getAll ||
    !window.api?.folder?.delete ||
    !window.api?.folder?.insertDirect ||
    !window.api?.version?.insertDirect
  ) {
    return false;
  }

  const existingPrompts = await getAllPrompts();
  for (const prompt of existingPrompts) {
    await window.api.prompt.delete(prompt.id);
  }

  const existingFolders = await getAllFolders();
  for (const folder of existingFolders) {
    await window.api.folder.delete(folder.id);
  }

  for (const folder of normalizedBackup.folders) {
    await window.api.folder.insertDirect(folder);
  }

  for (const prompt of normalizedBackup.prompts) {
    await window.api.prompt.insertDirect(prompt);
  }

  for (const version of normalizedBackup.versions) {
    await window.api.version.insertDirect(version);
  }

  await window.api.prompt.syncWorkspace?.();
  return true;
}

export async function exportDatabase(options?: {
  skipVideoContent?: boolean;
  limitMedia?: boolean;
}): Promise<DatabaseBackup> {
  const [prompts, folders, versions] = await Promise.all([
    getAllPrompts(),
    getAllFolders(),
    getAllPromptVersions(),
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

  const [images, videos, skillData] = await Promise.all([
    collectImages(prompts, imageLimits),
    options?.skipVideoContent
      ? Promise.resolve(undefined)
      : collectVideos(prompts, videoLimits),
    collectSkillData(),
  ]);

  const settingsSnapshot = getSettingsStateSnapshot({
    updatedAt: new Date().toISOString(),
  });

  return {
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    prompts,
    folders,
    versions,
    images,
    videos,
    aiConfig: getAiConfigSnapshot({ includeRootApiKey: true }),
    settings: settingsSnapshot ? { state: settingsSnapshot.state } : undefined,
    settingsUpdatedAt: settingsSnapshot?.settingsUpdatedAt,
    skills: skillData.skills.length > 0 ? skillData.skills : undefined,
    skillVersions:
      skillData.skillVersions.length > 0 ? skillData.skillVersions : undefined,
    skillFiles:
      Object.keys(skillData.skillFiles).length > 0
        ? skillData.skillFiles
        : undefined,
  };
}

export async function importDatabase(backup: DatabaseBackup): Promise<void> {
  const normalizedBackup = normalizeImportedBackup(backup);

  // Never clear local data unless the imported payload has already passed the
  // same structural validation as file-based imports.
  parsePromptHubBackupFileContent(JSON.stringify({
    kind: "prompthub-backup",
    exportedAt: normalizedBackup.exportedAt,
    payload: normalizedBackup,
  }));

  const restoredSkillIdMap = new Map<string, string>();
  const restoredSkillsByName = new Map<string, Skill>();
  const restoreFailures: string[] = [];
  const restoredViaMainProcess =
    await importDatabaseViaMainProcess(normalizedBackup);

  if (!restoredViaMainProcess) {
    const database = await getDatabase();

    await clearDatabase();

    const transaction = database.transaction(
      ["prompts", "folders", VERSION_STORE],
      "readwrite",
    );

    const promptStore = transaction.objectStore("prompts");
    const folderStore = transaction.objectStore("folders");
    const versionStore = transaction.objectStore(VERSION_STORE);

    for (const prompt of normalizedBackup.prompts) {
      promptStore.add(prompt);
    }

    for (const folder of normalizedBackup.folders) {
      folderStore.add(folder);
    }

    for (const version of normalizedBackup.versions) {
      versionStore.add(version);
    }

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

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
    restoreAiConfigSnapshot(normalizedBackup.aiConfig);
  }

  if (normalizedBackup.settings) {
    restoreSettingsStateSnapshot(normalizedBackup.settings);
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
          ...createData
        } = skill;
        const restoredSkill = await window.api?.skill?.create(
          {
            ...createData,
            is_favorite: createData.is_favorite ?? false,
            protocol_type: createData.protocol_type ?? "skill",
            currentVersion: createData.currentVersion,
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

  if (normalizedBackup.skillVersions && normalizedBackup.skillVersions.length > 0) {
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
    for (const [skillKey, files] of Object.entries(normalizedBackup.skillFiles)) {
      const restoredSkillId =
        restoredSkillIdMap.get(skillKey) ??
        restoredSkillsByName.get(skillKey)?.id ??
        skillKey;

      for (const file of files) {
        try {
          await window.api?.skill?.writeLocalFile(
            restoredSkillId,
            file.relativePath,
            file.content,
          );
        } catch (error) {
          restoreFailures.push(`skill file ${skillKey}/${file.relativePath}`);
          console.warn(
            `Failed to restore skill file ${skillKey}/${file.relativePath}:`,
            error,
          );
        }
      }
    }
  }

  if (restoreFailures.length > 0) {
    const preview = restoreFailures.slice(0, 5).join(", ");
    throw new Error(
      `Backup restore completed with ${restoreFailures.length} file errors: ${preview}`,
    );
  }
}

export function getDatabaseInfo(): { name: string; description: string } {
  return {
    name: "PromptHubDB",
    description: "数据存储在浏览器 IndexedDB 中，位于用户数据目录下",
  };
}

export async function downloadBackup(): Promise<void> {
  const backup = await exportDatabase();
  const file: PromptHubFile = {
    kind: "prompthub-backup",
    exportedAt: backup.exportedAt,
    payload: backup,
  };
  const blob = new Blob([JSON.stringify(file, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `prompthub-backup-${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadCompressedBackup(): Promise<void> {
  const backup = await exportDatabase();
  const file: PromptHubFile = {
    kind: "prompthub-backup",
    exportedAt: backup.exportedAt,
    payload: backup,
  };
  const gz = await gzipText(JSON.stringify(file));
  const url = URL.createObjectURL(gz);
  const a = document.createElement("a");
  a.href = url;
  a.download = `prompthub-backup-${new Date().toISOString().split("T")[0]}.phub.gz`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadSelectiveExport(
  scope: ExportScope,
): Promise<void> {
  const normalized: Required<ExportScope> = {
    prompts: !!scope.prompts,
    folders: !!scope.folders,
    versions: !!scope.versions,
    images: !!scope.images,
    aiConfig: !!scope.aiConfig,
    settings: !!scope.settings,
    skills: !!scope.skills,
  };

  const payload: Partial<DatabaseBackup> = {
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
  };

  if (normalized.prompts) payload.prompts = await getAllPrompts();
  if (normalized.folders) payload.folders = await getAllFolders();
  if (normalized.versions) payload.versions = await getAllPromptVersions();
  if (normalized.images) {
    const promptsForImages = payload.prompts || (await getAllPrompts());
    payload.images = await collectImages(promptsForImages);
  }
  if (normalized.aiConfig) {
    payload.aiConfig = getAiConfigSnapshot({ includeRootApiKey: true });
  }
  if (normalized.settings) {
    const snap = getSettingsStateSnapshot({
      updatedAt: new Date().toISOString(),
    });
    if (snap) {
      payload.settings = { state: snap.state };
      payload.settingsUpdatedAt = snap.settingsUpdatedAt;
    }
  }
  if (normalized.skills) {
    const skillData = await collectSkillData();
    payload.skills = skillData.skills;
    payload.skillVersions = skillData.skillVersions;
    payload.skillFiles = skillData.skillFiles;
  }

  const file: PromptHubFile = {
    kind: "prompthub-export",
    exportedAt: payload.exportedAt || new Date().toISOString(),
    scope: normalized,
    payload,
  };

  const gz = await gzipText(JSON.stringify(file));
  const url = URL.createObjectURL(gz);
  const a = document.createElement("a");
  a.href = url;
  a.download = `prompthub-export-${new Date().toISOString().split("T")[0]}.phub.gz`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function restoreFromFile(file: File): Promise<ImportSkippedStats> {
  const text = await readBackupFileText(file);
  const { backup, skipped } = parsePromptHubBackupFile(text);
  await importDatabase(backup);
  return skipped;
}

export async function restoreFromBackup(backup: DatabaseBackup): Promise<ImportSkippedStats> {
  await importDatabase(backup);
  return createEmptySkippedStats();
}
