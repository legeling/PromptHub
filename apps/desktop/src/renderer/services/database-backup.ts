import type {
  AgentAssetFilesSnapshot,
  AgentAssetStoreSourcesSnapshot,
  CustomStoreSourceSnapshot,
  PromptVersion,
  RuleBackupRecord,
  StoreSourceSnapshot,
} from "@prompthub/shared/types";
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
  getAiConfigSnapshot,
  getSettingsStateSnapshot,
  restoreAiConfigSnapshot,
  restoreSettingsStateSnapshot,
} from "./settings-snapshot";

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
const VERSION_STORE = "versions";
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
const STORE_SOURCE_SNAPSHOT_TARGETS = {
  skills: {
    key: "skill-store",
    selectedKey: "selectedStoreSourceId",
  },
  mcp: {
    key: "mcp-store",
    selectedKey: "selectedMarketSourceId",
  },
  plugins: {
    key: "plugin-store",
    selectedKey: "selectedMarketSourceId",
  },
} as const;

export const BACKUP_IMPORT_ACCEPT = ".json,.phub,.gz,.zip";

export function isSupportedBackupFileName(fileName: string): boolean {
  const normalized = fileName.trim().toLowerCase();
  return SUPPORTED_BACKUP_EXTENSIONS.some((extension) =>
    normalized.endsWith(extension),
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

function isStoreSourceType(
  value: unknown,
): value is StoreSourceSnapshot["type"] {
  return (
    value === "official" ||
    value === "community" ||
    value === "marketplace-json" ||
    value === "git-repo" ||
    value === "local-dir"
  );
}

function normalizeStoreSourceSnapshot(
  value: unknown,
): StoreSourceSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const source = value as Record<string, unknown>;
  if (
    typeof source.id !== "string" ||
    typeof source.name !== "string" ||
    !isStoreSourceType(source.type) ||
    typeof source.url !== "string"
  ) {
    return null;
  }

  return {
    id: source.id,
    name: source.name,
    type: source.type,
    url: source.url,
    branch: typeof source.branch === "string" ? source.branch : undefined,
    directory:
      typeof source.directory === "string" ? source.directory : undefined,
    enabled: typeof source.enabled === "boolean" ? source.enabled : undefined,
    order: typeof source.order === "number" ? source.order : undefined,
    createdAt:
      typeof source.createdAt === "number" ? source.createdAt : undefined,
  };
}

function readPersistedStoreState(
  key: string,
): {
  envelope: Record<string, unknown>;
  state: Record<string, unknown>;
} | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const envelope = JSON.parse(raw) as unknown;
    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
      return null;
    }
    const record = envelope as Record<string, unknown>;
    const state =
      record.state &&
      typeof record.state === "object" &&
      !Array.isArray(record.state)
        ? (record.state as Record<string, unknown>)
        : {};
    return { envelope: record, state };
  } catch (error) {
    console.warn(`Failed to read persisted store ${key}:`, error);
    return null;
  }
}

function collectCustomStoreSourceSnapshot(
  key: string,
  selectedKey: string,
): CustomStoreSourceSnapshot | undefined {
  const persisted = readPersistedStoreState(key);
  if (!persisted) {
    return undefined;
  }

  const customStoreSources = Array.isArray(persisted.state.customStoreSources)
    ? persisted.state.customStoreSources
        .map(normalizeStoreSourceSnapshot)
        .filter((source): source is StoreSourceSnapshot => Boolean(source))
    : [];
  const selectedSourceId =
    typeof persisted.state[selectedKey] === "string"
      ? persisted.state[selectedKey]
      : undefined;

  if (customStoreSources.length === 0 && !selectedSourceId) {
    return undefined;
  }

  return {
    customStoreSources,
    selectedSourceId,
  };
}

function collectStoreSourcesSnapshot():
  | AgentAssetStoreSourcesSnapshot
  | undefined {
  const snapshot: AgentAssetStoreSourcesSnapshot = {};
  for (const [key, config] of Object.entries(STORE_SOURCE_SNAPSHOT_TARGETS)) {
    const sourceSnapshot = collectCustomStoreSourceSnapshot(
      config.key,
      config.selectedKey,
    );
    if (sourceSnapshot) {
      snapshot[key as keyof AgentAssetStoreSourcesSnapshot] = sourceSnapshot;
    }
  }

  return Object.keys(snapshot).length > 0 ? snapshot : undefined;
}

async function collectAgentAssetFilesSnapshot(): Promise<
  AgentAssetFilesSnapshot | undefined
> {
  const [mcpFiles, pluginFiles] = await Promise.all([
    window.api?.mcp?.exportDataFiles?.() ?? Promise.resolve([]),
    window.api?.plugin?.exportDataFiles?.() ?? Promise.resolve([]),
  ]);

  const snapshot: AgentAssetFilesSnapshot = {};
  if (mcpFiles.length > 0) {
    snapshot.mcp = mcpFiles;
  }
  if (pluginFiles.length > 0) {
    snapshot.plugins = pluginFiles;
  }

  return Object.keys(snapshot).length > 0 ? snapshot : undefined;
}

function restoreCustomStoreSourceSnapshot(
  key: string,
  selectedKey: string,
  snapshot: CustomStoreSourceSnapshot | undefined,
): void {
  if (!snapshot) {
    return;
  }

  try {
    const persisted = readPersistedStoreState(key);
    const envelope = persisted?.envelope ?? {};
    const state = persisted?.state ?? {};
    localStorage.setItem(
      key,
      JSON.stringify({
        ...envelope,
        state: {
          ...state,
          customStoreSources: snapshot.customStoreSources,
          ...(snapshot.selectedSourceId
            ? { [selectedKey]: snapshot.selectedSourceId }
            : {}),
        },
      }),
    );
  } catch (error) {
    console.warn(`Failed to restore persisted store ${key}:`, error);
  }
}

function restoreStoreSourcesSnapshot(
  snapshot: AgentAssetStoreSourcesSnapshot | undefined,
): void {
  if (!snapshot) {
    return;
  }

  restoreCustomStoreSourceSnapshot(
    STORE_SOURCE_SNAPSHOT_TARGETS.skills.key,
    STORE_SOURCE_SNAPSHOT_TARGETS.skills.selectedKey,
    snapshot.skills,
  );
  restoreCustomStoreSourceSnapshot(
    STORE_SOURCE_SNAPSHOT_TARGETS.mcp.key,
    STORE_SOURCE_SNAPSHOT_TARGETS.mcp.selectedKey,
    snapshot.mcp,
  );
  restoreCustomStoreSourceSnapshot(
    STORE_SOURCE_SNAPSHOT_TARGETS.plugins.key,
    STORE_SOURCE_SNAPSHOT_TARGETS.plugins.selectedKey,
    snapshot.plugins,
  );
}

async function collectMcpLibrary(): Promise<DatabaseBackup["mcpLibrary"]> {
  const library = await window.api?.mcp?.getLibrary?.();
  if (!library) {
    return undefined;
  }
  return library;
}

async function collectPluginSnapshot(): Promise<
  Pick<DatabaseBackup, "pluginLibrary" | "pluginPackages">
> {
  const snapshot = await window.api?.plugin?.exportLibrarySnapshot?.();
  if (!snapshot?.library) {
    return {};
  }
  return {
    pluginLibrary: snapshot.library,
    pluginPackages:
      snapshot.packages && snapshot.packages.length > 0
        ? snapshot.packages
        : undefined,
  };
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

function sortFoldersForRestore(
  folders: DatabaseBackup["folders"],
): DatabaseBackup["folders"] {
  const remaining = new Map(folders.map((folder) => [folder.id, folder]));
  const restored = new Set<string>();
  const ordered: DatabaseBackup["folders"] = [];

  while (remaining.size > 0) {
    let progressed = false;

    for (const [id, folder] of remaining) {
      if (
        !folder.parentId ||
        restored.has(folder.parentId) ||
        !remaining.has(folder.parentId)
      ) {
        ordered.push(folder);
        restored.add(id);
        remaining.delete(id);
        progressed = true;
      }
    }

    if (!progressed) {
      ordered.push(...remaining.values());
      break;
    }
  }

  return ordered;
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

  for (const folder of sortFoldersForRestore(normalizedBackup.folders)) {
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

  const [
    images,
    videos,
    skillData,
    ruleData,
    mcpLibrary,
    pluginSnapshot,
    agentAssetFiles,
  ] = await Promise.all([
    collectImages(prompts, imageLimits),
    options?.skipVideoContent
      ? Promise.resolve(undefined)
      : collectVideos(prompts, videoLimits),
    collectSkillData(),
    collectRuleData(),
    collectMcpLibrary(),
    collectPluginSnapshot(),
    collectAgentAssetFilesSnapshot(),
  ]);

  const settingsSnapshot = getSettingsStateSnapshot({
    updatedAt: new Date().toISOString(),
  });
  const storeSources = collectStoreSourcesSnapshot();

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
    pluginPackages: pluginSnapshot.pluginPackages,
    storeSources,
    agentAssetFiles,
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

    for (const folder of sortFoldersForRestore(normalizedBackup.folders)) {
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

  restoreStoreSourcesSnapshot(normalizedBackup.storeSources);

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

      for (const file of files) {
        try {
          await window.api?.skill?.writeLocalFile(
            restoredSkillId,
            file.relativePath,
            file.content,
            { skipVersionSnapshot: true },
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
  triggerBlobDownload(
    blob,
    `prompthub-backup-${new Date().toISOString().split("T")[0]}.json`,
  );
}

export async function downloadCompressedBackup(): Promise<void> {
  const backup = await exportDatabase();
  const file: PromptHubFile = {
    kind: "prompthub-backup",
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
  };

  const fullBackup = await exportDatabase({
    skipVideoContent: !normalized.videos,
  });

  const payload: Partial<DatabaseBackup> = {
    version: DB_VERSION,
    exportedAt: fullBackup.exportedAt,
    prompts: normalized.prompts ? fullBackup.prompts : [],
    folders: normalized.folders ? fullBackup.folders : [],
    versions: normalized.versions ? fullBackup.versions : [],
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
    mcpLibrary: normalized.skills ? fullBackup.mcpLibrary : undefined,
    pluginLibrary: normalized.skills ? fullBackup.pluginLibrary : undefined,
    pluginPackages: normalized.skills ? fullBackup.pluginPackages : undefined,
    storeSources: normalized.skills ? fullBackup.storeSources : undefined,
    agentAssetFiles: normalized.skills ? fullBackup.agentAssetFiles : undefined,
  };

  const exportFile: PromptHubFile = {
    kind: "prompthub-export",
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
      const snap = getAiConfigSnapshot({ includeRootApiKey: true });
      if (snap) aiConfigJson = JSON.stringify(snap, null, 2);
    }
    if (normalized.settings) {
      const snap = getSettingsStateSnapshot({
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
  const text = await readBackupFileText(file);
  const { backup, skipped } = parsePromptHubBackupFile(text);
  await importDatabase(backup);
  return skipped;
}

export async function restoreFromBackup(
  backup: DatabaseBackup,
): Promise<ImportSkippedStats> {
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
