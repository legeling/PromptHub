import type { PromptVersion } from "../../shared/types";
import type {
  Skill,
  SkillFileSnapshot,
  SkillLocalFileEntry,
  SkillVersion,
} from "../../shared/types/skill";
import {
  clearDatabase,
  getAllFolders,
  getAllPrompts,
  getDatabase,
} from "./database";
import {
  DB_BACKUP_VERSION,
  normalizeImportedBackup,
  parsePromptHubBackupFileContent,
} from "./database-backup-format";
import type {
  DatabaseBackup,
  ExportScope,
  PromptHubFile,
} from "./database-backup-format";
export type {
  DatabaseBackup,
  ExportScope,
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
): Promise<{ [fileName: string]: string }> {
  const images: { [fileName: string]: string } = {};
  const imageFileNames = new Set<string>();

  for (const prompt of prompts) {
    if (prompt.images && Array.isArray(prompt.images)) {
      for (const img of prompt.images) {
        imageFileNames.add(img);
      }
    }
  }

  const allNames = Array.from(imageFileNames);
  if (allNames.length > IMAGE_MAX_COUNT) {
    console.warn(
      `Image count (${allNames.length}) exceeds limit (${IMAGE_MAX_COUNT}), truncating`,
    );
  }
  const namesToProcess = allNames.slice(0, IMAGE_MAX_COUNT);

  await processBatched(namesToProcess, IMAGE_BATCH_SIZE, async (fileName) => {
    try {
      const size = await window.electron?.getImageSize?.(fileName);
      if (size != null && size > IMAGE_MAX_SIZE_BYTES) {
        console.warn(
          `Skipping image ${fileName}: size ${(size / 1024 / 1024).toFixed(1)}MB exceeds ${IMAGE_MAX_SIZE_BYTES / 1024 / 1024}MB limit`,
        );
        return;
      }

      const base64 = await window.electron?.readImageBase64?.(fileName);
      if (base64) {
        images[fileName] = base64;
      }
    } catch (error) {
      console.warn(`Failed to read image ${fileName}:`, error);
    }
  });

  return images;
}

async function collectVideos(
  prompts: Awaited<ReturnType<typeof getAllPrompts>>,
): Promise<{ [fileName: string]: string }> {
  const videos: { [fileName: string]: string } = {};
  const videoFileNames = new Set<string>();

  for (const prompt of prompts) {
    if (prompt.videos && Array.isArray(prompt.videos)) {
      for (const video of prompt.videos) {
        videoFileNames.add(video);
      }
    }
  }

  const allNames = Array.from(videoFileNames);
  if (allNames.length > VIDEO_MAX_COUNT) {
    console.warn(
      `Video count (${allNames.length}) exceeds limit (${VIDEO_MAX_COUNT}), truncating`,
    );
  }
  const namesToProcess = allNames.slice(0, VIDEO_MAX_COUNT);

  await processBatched(namesToProcess, VIDEO_BATCH_SIZE, async (fileName) => {
    try {
      const size = await window.electron?.getVideoSize?.(fileName);
      if (size != null && size > VIDEO_MAX_SIZE_BYTES) {
        console.warn(
          `Skipping video ${fileName}: size ${(size / 1024 / 1024).toFixed(1)}MB exceeds ${VIDEO_MAX_SIZE_BYTES / 1024 / 1024}MB limit`,
        );
        return;
      }

      const base64 = await window.electron?.readVideoBase64?.(fileName);
      if (base64) {
        videos[fileName] = base64;
      }
    } catch (error) {
      console.warn(`Failed to read video ${fileName}:`, error);
    }
  });

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

  try {
    const allSkills: Skill[] = (await window.api?.skill?.getAll()) ?? [];
    skills.push(...allSkills);

    await processBatched(allSkills, SKILL_CONCURRENCY, async (skill) => {
      const [versionsResult, filesResult] = await Promise.allSettled([
        window.api?.skill?.versionGetAll(skill.id),
        window.api?.skill?.readLocalFiles(skill.id),
      ]);

      if (versionsResult.status === "fulfilled" && versionsResult.value) {
        skillVersions.push(...versionsResult.value);
      } else if (versionsResult.status === "rejected") {
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
        console.warn(
          `Failed to read local files for skill ${skill.name}:`,
          filesResult.reason,
        );
      }
    });
  } catch (error) {
    console.warn("Failed to collect skill data:", error);
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

async function getAllPromptVersions(): Promise<PromptVersion[]> {
  const database = await getDatabase();
  return new Promise<PromptVersion[]>((resolve, reject) => {
    const transaction = database.transaction(VERSION_STORE, "readonly");
    const store = transaction.objectStore(VERSION_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function exportDatabase(options?: {
  skipVideoContent?: boolean;
}): Promise<DatabaseBackup> {
  const [prompts, folders, versions] = await Promise.all([
    getAllPrompts(),
    getAllFolders(),
    getAllPromptVersions(),
  ]);

  const [images, videos, skillData] = await Promise.all([
    collectImages(prompts),
    options?.skipVideoContent ? Promise.resolve(undefined) : collectVideos(prompts),
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
  const database = await getDatabase();
  const restoredSkillIdMap = new Map<string, string>();
  const restoredSkillsByName = new Map<string, Skill>();

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

  if (normalizedBackup.images) {
    for (const [fileName, base64] of Object.entries(normalizedBackup.images)) {
      try {
        await window.electron?.saveImageBase64?.(fileName, base64);
      } catch (error) {
        console.warn(`Failed to restore image ${fileName}:`, error);
      }
    }
  }

  if (normalizedBackup.videos) {
    for (const [fileName, base64] of Object.entries(normalizedBackup.videos)) {
      try {
        await window.electron?.saveVideoBase64?.(fileName, base64);
      } catch (error) {
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
          console.warn(
            `Failed to restore skill file ${skillKey}/${file.relativePath}:`,
            error,
          );
        }
      }
    }
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

export async function restoreFromFile(file: File): Promise<void> {
  const text = file.name.endsWith(".gz")
    ? await gunzipToText(file)
    : await file.text();
  await importDatabase(parsePromptHubBackupFileContent(text));
}

export async function restoreFromBackup(backup: DatabaseBackup): Promise<void> {
  await importDatabase(backup);
}
