/**
 * IndexedDB Database Service
 * 使用 IndexedDB 存储数据，支持备份、恢复和迁移
 * Store data using IndexedDB, support backup, restore and migration
 */

import type { Prompt, PromptVersion, Folder } from "@prompthub/shared/types";
import type {
  Skill,
  SkillLocalFileEntry,
  SkillVersion,
  SkillFileSnapshot,
} from "@prompthub/shared/types/skill";
import {
  DB_BACKUP_VERSION,
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

const DB_NAME = "PromptHubDB";
const DB_VERSION = DB_BACKUP_VERSION;

// Generate UUID using browser native API
// 使用浏览器原生 API 生成 UUID
const generateId = () => crypto.randomUUID();

// Database storage names
// 数据库存储名称
const STORES = {
  PROMPTS: "prompts",
  VERSIONS: "versions",
  FOLDERS: "folders",
  SETTINGS: "settings",
} as const;

let db: IDBDatabase | null = null;

/**
 * 初始化数据库
 * Initialize database
 */
export async function initDatabase(): Promise<IDBDatabase> {
  // 如果已有连接，先关闭
  // If there's an existing connection, close it first
  if (db) {
    try {
      db.close();
    } catch (e) {
      console.warn("Failed to close existing db connection:", e);
    }
    db = null;
  }

  return new Promise((resolve, reject) => {
    // 添加超时机制，防止无限等待
    // Add timeout mechanism to prevent infinite waiting
    const timeout = setTimeout(() => {
      console.error("Database open timeout after 10s");
      reject(new Error("Database open timeout"));
    }, 10000);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("Failed to open database"));
    };

    request.onblocked = () => {
      console.warn("Database open blocked - another connection is open");
      // 不立即 reject，等待 onsuccess 或超时
      // Don't reject immediately, wait for onsuccess or timeout
    };

    request.onsuccess = () => {
      clearTimeout(timeout);
      db = request.result;

      // 监听版本变化事件，当其他标签页升级数据库时关闭连接
      // Listen for version change events, close connection when other tabs upgrade database
      db.onversionchange = () => {
        console.log("Database version change detected, closing connection");
        db?.close();
        db = null;
      };

      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // 创建 prompts 存储
      // Create prompts store
      if (!database.objectStoreNames.contains(STORES.PROMPTS)) {
        const promptStore = database.createObjectStore(STORES.PROMPTS, {
          keyPath: "id",
        });
        promptStore.createIndex("folderId", "folderId", { unique: false });
        promptStore.createIndex("isFavorite", "isFavorite", { unique: false });
        promptStore.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      // 创建 versions 存储
      // Create versions store
      if (!database.objectStoreNames.contains(STORES.VERSIONS)) {
        const versionStore = database.createObjectStore(STORES.VERSIONS, {
          keyPath: "id",
        });
        versionStore.createIndex("promptId", "promptId", { unique: false });
        versionStore.createIndex("createdAt", "createdAt", { unique: false });
      }

      // 创建 folders 存储
      // Create folders store
      if (!database.objectStoreNames.contains(STORES.FOLDERS)) {
        const folderStore = database.createObjectStore(STORES.FOLDERS, {
          keyPath: "id",
        });
        folderStore.createIndex("parentId", "parentId", { unique: false });
      }

      // 创建 settings 存储
      // Create settings store
      if (!database.objectStoreNames.contains(STORES.SETTINGS)) {
        database.createObjectStore(STORES.SETTINGS, { keyPath: "key" });
      }
    };
  });
}

/**
 * 获取数据库实例
 * Get database instance
 */
export async function getDatabase(): Promise<IDBDatabase> {
  if (db) return db;
  return initDatabase();
}

/**
 * 删除并重建数据库（用于开发调试）
 * Delete and recreate database (for development debugging)
 */
export async function resetDatabase(): Promise<void> {
  // 关闭现有连接
  // Close existing connection
  if (db) {
    db.close();
    db = null;
  }

  // 删除数据库
  // Delete database
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => {
      console.log("Database deleted successfully");
      resolve();
    };
    request.onerror = () => {
      console.error("Failed to delete database");
      reject(request.error);
    };
  });
}

// ==================== Prompt 操作 ====================
// ==================== Prompt Operations ====================

export async function getAllPrompts(): Promise<Prompt[]> {
  if (window.api?.prompt?.getAll) {
    return (await window.api.prompt.getAll()) ?? [];
  }

  return legacyGetAllPrompts();
}

async function legacyGetAllPrompts(): Promise<Prompt[]> {
  const database = await getDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.PROMPTS, "readonly");
    const store = transaction.objectStore(STORES.PROMPTS);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getPromptById(id: string): Promise<Prompt | undefined> {
  if (window.api?.prompt?.get) {
    return (await window.api.prompt.get(id)) ?? undefined;
  }

  const database = await getDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.PROMPTS, "readonly");
    const store = transaction.objectStore(STORES.PROMPTS);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function createPrompt(
  data: Omit<Prompt, "id" | "createdAt" | "updatedAt" | "version">,
): Promise<Prompt> {
  if (window.api?.prompt?.create) {
    return window.api.prompt.create({
      title: data.title,
      description: data.description ?? undefined,
      promptType: data.promptType,
      systemPrompt: data.systemPrompt ?? undefined,
      systemPromptEn: data.systemPromptEn ?? undefined,
      userPrompt: data.userPrompt,
      userPromptEn: data.userPromptEn ?? undefined,
      variables: data.variables,
      tags: data.tags,
      folderId: data.folderId ?? undefined,
      images: data.images,
      videos: data.videos,
      source: data.source ?? undefined,
      notes: data.notes ?? undefined,
    });
  }

  const database = await getDatabase();
  const now = new Date().toISOString();
  const prompt: Prompt = {
    ...data,
    id: generateId(),
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.PROMPTS, "readwrite");
    const store = transaction.objectStore(STORES.PROMPTS);
    const request = store.add(prompt);

    request.onsuccess = () => resolve(prompt);
    request.onerror = () => reject(request.error);
  });
}

export async function updatePrompt(
  id: string,
  data: Partial<Prompt>,
  incrementVersion = true,
): Promise<Prompt> {
  if (window.api?.prompt?.update) {
    const updated = await window.api.prompt.update(id, {
      title: data.title,
      description: data.description ?? undefined,
      promptType: data.promptType,
      systemPrompt: data.systemPrompt ?? undefined,
      systemPromptEn: data.systemPromptEn ?? undefined,
      userPrompt: data.userPrompt,
      userPromptEn: data.userPromptEn ?? undefined,
      variables: data.variables,
      tags: data.tags,
      folderId: data.folderId ?? undefined,
      images: data.images,
      videos: data.videos,
      isFavorite: data.isFavorite,
      isPinned: data.isPinned,
      usageCount: data.usageCount,
      source: data.source ?? undefined,
      notes: data.notes ?? undefined,
      lastAiResponse: data.lastAiResponse ?? undefined,
    });
    if (!updated) {
      throw new Error(`Prompt not found: ${id}`);
    }
    return updated;
  }

  const database = await getDatabase();
  const existing = await getPromptById(id);
  if (!existing) throw new Error("Prompt not found");

  // 只有内容变化才增加版本号
  // Only increment version number when content changes
  const hasContentChange =
    data.systemPrompt !== undefined || data.userPrompt !== undefined;
  const shouldIncrementVersion = incrementVersion && hasContentChange;

  const updated: Prompt = {
    ...existing,
    ...data,
    id,
    updatedAt: new Date().toISOString(),
    version: shouldIncrementVersion ? existing.version + 1 : existing.version,
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.PROMPTS, "readwrite");
    const store = transaction.objectStore(STORES.PROMPTS);
    const request = store.put(updated);

    request.onsuccess = () => resolve(updated);
    request.onerror = () => reject(request.error);
  });
}

export async function deletePrompt(id: string): Promise<void> {
  if (window.api?.prompt?.delete) {
    await window.api.prompt.delete(id);
    return;
  }

  const database = await getDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.PROMPTS, "readwrite");
    const store = transaction.objectStore(STORES.PROMPTS);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 批量移动 Prompt 到指定文件夹
 * Batch move prompts to a folder
 */
export async function movePrompts(
  ids: string[],
  folderId: string,
): Promise<void> {
  if (window.api?.prompt?.update) {
    await Promise.all(
      ids.map((id) => window.api.prompt.update(id, { folderId })),
    );
    return;
  }

  const database = await getDatabase();
  const now = new Date().toISOString();

  // 逐个更新 Prompt 的文件夹
  // Update prompt folders one by one
  for (const id of ids) {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORES.PROMPTS, "readwrite");
      const store = transaction.objectStore(STORES.PROMPTS);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const prompt = getRequest.result;
        if (prompt) {
          prompt.folderId = folderId;
          prompt.updatedAt = now;
          const putRequest = store.put(prompt);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }
}

// ==================== Version 操作 ====================
// ==================== Version Operations ====================

export async function getPromptVersions(
  promptId: string,
): Promise<PromptVersion[]> {
  if (window.api?.version?.getAll) {
    return (await window.api.version.getAll(promptId)) ?? [];
  }

  return legacyGetPromptVersions(promptId);
}

async function legacyGetPromptVersions(
  promptId: string,
): Promise<PromptVersion[]> {
  const database = await getDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.VERSIONS, "readonly");
    const store = transaction.objectStore(STORES.VERSIONS);
    const index = store.index("promptId");
    const request = index.getAll(promptId);

    request.onsuccess = () => {
      const versions = request.result.sort((a, b) => b.version - a.version);
      resolve(versions);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function createPromptVersion(
  promptId: string,
  data: { systemPrompt?: string; userPrompt: string; version: number },
): Promise<PromptVersion> {
  if (window.api?.version?.create) {
    const version = await window.api.version.create(promptId);
    if (!version) {
      throw new Error(`Failed to create version for prompt: ${promptId}`);
    }
    return version;
  }

  const database = await getDatabase();
  const now = new Date().toISOString();
  const versionRecord: PromptVersion = {
    id: generateId(),
    promptId,
    version: data.version,
    systemPrompt: data.systemPrompt,
    userPrompt: data.userPrompt,
    variables: [],
    createdAt: now,
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.VERSIONS, "readwrite");
    const store = transaction.objectStore(STORES.VERSIONS);
    const request = store.add(versionRecord);

    request.onsuccess = () => resolve(versionRecord);
    request.onerror = () => reject(request.error);
  });
}

export async function deletePromptVersion(versionId: string): Promise<void> {
  if (window.api?.version?.delete) {
    await window.api.version.delete(versionId);
    return;
  }

  const database = await getDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.VERSIONS, "readwrite");
    const store = transaction.objectStore(STORES.VERSIONS);
    const request = store.delete(versionId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ==================== Folder 操作 ====================
// ==================== Folder Operations ====================

export async function getAllFolders(): Promise<Folder[]> {
  if (window.api?.folder?.getAll) {
    return (await window.api.folder.getAll()) ?? [];
  }

  return legacyGetAllFolders();
}

async function legacyGetAllFolders(): Promise<Folder[]> {
  const database = await getDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.FOLDERS, "readonly");
    const store = transaction.objectStore(STORES.FOLDERS);
    const request = store.getAll();

    request.onsuccess = () => {
      // 按 order 字段排序
      // Sort by order field
      const folders = request.result.sort(
        (a, b) => (a.order || 0) - (b.order || 0),
      );
      resolve(folders);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function createFolder(
  data: Omit<Folder, "id" | "createdAt" | "updatedAt">,
): Promise<Folder> {
  if (window.api?.folder?.create) {
    return window.api.folder.create({
      name: data.name,
      icon: data.icon,
      parentId: data.parentId,
      isPrivate: data.isPrivate,
      visibility: data.visibility,
    });
  }

  const database = await getDatabase();
  const now = new Date().toISOString();
  const folder: Folder = {
    ...data,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.FOLDERS, "readwrite");
    const store = transaction.objectStore(STORES.FOLDERS);
    const request = store.add(folder);

    request.onsuccess = () => resolve(folder);
    request.onerror = () => reject(request.error);
  });
}

export async function updateFolder(
  id: string,
  data: Partial<Folder>,
): Promise<Folder> {
  if (window.api?.folder?.update) {
    const updated = await window.api.folder.update(id, {
      name: data.name,
      icon: data.icon,
      parentId: data.parentId,
      order: data.order,
      isPrivate: data.isPrivate,
      visibility: data.visibility,
    });
    if (!updated) {
      throw new Error(`Folder not found: ${id}`);
    }
    return updated;
  }

  const database = await getDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.FOLDERS, "readwrite");
    const store = transaction.objectStore(STORES.FOLDERS);

    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const existing = getRequest.result;
      if (!existing) {
        reject(new Error("Folder not found"));
        return;
      }

      const updated: Folder = {
        ...existing,
        ...data,
        updatedAt: new Date().toISOString(),
      };

      const putRequest = store.put(updated);
      putRequest.onsuccess = () => resolve(updated);
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function deleteFolder(id: string): Promise<void> {
  if (window.api?.folder?.delete) {
    await window.api.folder.delete(id);
    return;
  }

  const database = await getDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.FOLDERS, "readwrite");
    const store = transaction.objectStore(STORES.FOLDERS);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function updateFolderOrders(
  updates: { id: string; order: number }[],
): Promise<void> {
  if (window.api?.folder?.update) {
    await Promise.all(
      updates.map(({ id, order }) => window.api.folder.update(id, { order })),
    );
    return;
  }

  const database = await getDatabase();

  // 逐个更新文件夹顺序
  // Update folder order one by one
  for (const { id, order } of updates) {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORES.FOLDERS, "readwrite");
      const store = transaction.objectStore(STORES.FOLDERS);
      const request = store.get(id);

      request.onsuccess = () => {
        const folder = request.result;
        if (folder) {
          folder.order = order;
          folder.updatedAt = new Date().toISOString();
          const putRequest = store.put(folder);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
}

// ==================== 备份与恢复 ====================
// ==================== Backup & Restore ====================

const SETTINGS_STORAGE_KEY = "prompthub-settings";

// Batch processing limits for media collection
// 媒体收集的批处理限制
const IMAGE_BATCH_SIZE = 10;
const IMAGE_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const IMAGE_MAX_COUNT = 500;
const VIDEO_BATCH_SIZE = 5;
const VIDEO_MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100MB
const VIDEO_MAX_COUNT = 100;
const SKILL_CONCURRENCY = 5;

/**
 * 按批次处理数组，限制并发量
 * Process an array in batches with limited concurrency
 */
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

/**
 * 收集所有需要备份的图片
 * Collect all images that need to be backed up
 */
async function collectImages(
  prompts: Prompt[],
): Promise<{ [fileName: string]: string }> {
  const images: { [fileName: string]: string } = {};
  const imageFileNames = new Set<string>();

  // 收集所有 prompt 中引用的图片
  // Collect all images referenced in prompts
  for (const prompt of prompts) {
    if (prompt.images && Array.isArray(prompt.images)) {
      for (const img of prompt.images) {
        imageFileNames.add(img);
      }
    }
  }

  // 应用总数量上限
  // Apply total count limit
  const allNames = Array.from(imageFileNames);
  if (allNames.length > IMAGE_MAX_COUNT) {
    console.warn(
      `Image count (${allNames.length}) exceeds limit (${IMAGE_MAX_COUNT}), truncating`,
    );
  }
  const namesToProcess = allNames.slice(0, IMAGE_MAX_COUNT);

  // 按批次读取图片为 Base64，跳过超大文件
  // Read images as Base64 in batches, skip oversized files
  await processBatched(namesToProcess, IMAGE_BATCH_SIZE, async (fileName) => {
    try {
      // 检查文件大小，跳过超过限制的文件
      // Check file size, skip files exceeding the limit
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

/**
 * 收集所有需要备份的视频
 * Collect all videos that need to be backed up
 */
async function collectVideos(
  prompts: Prompt[],
): Promise<{ [fileName: string]: string }> {
  const videos: { [fileName: string]: string } = {};
  const videoFileNames = new Set<string>();

  // 收集所有 prompt 中引用的视频
  // Collect all videos referenced in prompts
  for (const prompt of prompts) {
    if (prompt.videos && Array.isArray(prompt.videos)) {
      for (const video of prompt.videos) {
        videoFileNames.add(video);
      }
    }
  }

  // 应用总数量上限
  // Apply total count limit
  const allNames = Array.from(videoFileNames);
  if (allNames.length > VIDEO_MAX_COUNT) {
    console.warn(
      `Video count (${allNames.length}) exceeds limit (${VIDEO_MAX_COUNT}), truncating`,
    );
  }
  const namesToProcess = allNames.slice(0, VIDEO_MAX_COUNT);

  // 按批次读取视频为 Base64，跳过超大文件
  // Read videos as Base64 in batches, skip oversized files
  await processBatched(namesToProcess, VIDEO_BATCH_SIZE, async (fileName) => {
    try {
      // 检查文件大小，跳过超过限制的文件
      // Check file size, skip files exceeding the limit
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

/**
 * 收集所有 skill 数据（从 SQLite）
 * Collect all skill data (from SQLite)
 */
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

    // 按批次并发处理 skill，避免 N+1 逐个串行 IPC 调用
    // Process skills in concurrent batches to avoid N+1 sequential IPC calls
    await processBatched(allSkills, SKILL_CONCURRENCY, async (skill) => {
      // 并发获取版本和本地文件
      // Fetch versions and local files concurrently
      const [versionsResult, filesResult] = await Promise.allSettled([
        window.api?.skill?.versionGetAll(skill.id),
        window.api?.skill?.readLocalFiles(skill.id),
      ]);

      // Collect versions
      // 收集版本
      if (versionsResult.status === "fulfilled" && versionsResult.value) {
        skillVersions.push(...versionsResult.value);
      } else if (versionsResult.status === "rejected") {
        console.warn(
          `Failed to get versions for skill ${skill.name}:`,
          versionsResult.reason,
        );
      }

      // Collect local files
      // 收集本地文件
      if (filesResult.status === "fulfilled" && filesResult.value) {
        const fileSnapshots: SkillFileSnapshot[] = (
          filesResult.value as SkillLocalFileEntry[]
        )
          .filter((f) => !f.isDirectory)
          .map((f) => ({
            relativePath: f.path,
            content: f.content,
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

/**
 * 获取 AI 配置（从 localStorage）
 * Get AI configuration (from localStorage)
 */
function getAiConfig(): DatabaseBackup["aiConfig"] {
  try {
    // 当前版本的 settings store 持久化 key
    // Current version settings store persistence key
    const primary = localStorage.getItem("prompthub-settings");
    // 旧版兼容（历史 key）
    // Old version compatibility (legacy key)
    const legacy = localStorage.getItem("settings-storage");
    const raw = primary || legacy;
    if (!raw) return undefined;

    const data = JSON.parse(raw);
    const state = data?.state;
    if (!state) return undefined;

    // Security: Filter out API keys from AI models before exporting
    // 安全：导出前过滤 AI 模型中的 API 密钥
    // API keys are sensitive and should NOT be included in backups
    // API 密钥是敏感信息，不应包含在备份中
    const filteredModels = (state.aiModels || []).map((model: any) => {
      const { apiKey, ...rest } = model;
      return rest;
    });

    return {
      aiModels: filteredModels,
      scenarioModelDefaults: state.scenarioModelDefaults || {},
      aiProvider: state.aiProvider,
      // aiApiKey is intentionally excluded for security
      // aiApiKey 出于安全考虑被故意排除
      aiApiUrl: state.aiApiUrl,
      aiModel: state.aiModel,
    };
  } catch (e) {
    console.warn("Failed to get AI config:", e);
  }
  return undefined;
}

/**
 * 恢复 AI 配置（到 localStorage）
 * Restore AI configuration (to localStorage)
 */
function restoreAiConfig(aiConfig: DatabaseBackup["aiConfig"]): void {
  if (!aiConfig) return;
  try {
    const primaryKey = "prompthub-settings";
    const legacyKey = "settings-storage";
    const storedPrimary = localStorage.getItem(primaryKey);
    const storedLegacy = localStorage.getItem(legacyKey);

    const targetKey = storedPrimary
      ? primaryKey
      : storedLegacy
        ? legacyKey
        : primaryKey;
    const stored = storedPrimary || storedLegacy;
    const data = stored ? JSON.parse(stored) : { state: {} };

    if (!data.state) data.state = {};
    data.state.aiModels = aiConfig.aiModels || [];
    if (aiConfig.scenarioModelDefaults) {
      data.state.scenarioModelDefaults = aiConfig.scenarioModelDefaults;
    }
    if (aiConfig.aiProvider) data.state.aiProvider = aiConfig.aiProvider;
    if (aiConfig.aiApiKey) data.state.aiApiKey = aiConfig.aiApiKey;
    if (aiConfig.aiApiUrl) data.state.aiApiUrl = aiConfig.aiApiUrl;
    if (aiConfig.aiModel) data.state.aiModel = aiConfig.aiModel;
    localStorage.setItem(targetKey, JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to restore AI config:", e);
  }
}

function getSettingsSnapshot():
  | { state: any; settingsUpdatedAt?: string }
  | undefined {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return undefined;
    const data = JSON.parse(raw);
    const state = data?.state;
    if (!state) return undefined;

    // Security: Filter out sensitive fields before exporting
    // 安全：导出前过滤敏感字段
    // These fields should NOT be synced to WebDAV for security reasons:
    // 这些字段出于安全考虑不应同步到 WebDAV：
    // - webdavUsername / webdavPassword: WebDAV credentials (circular reference & security)
    // - webdavEncryptionPassword: Encryption key (security)
    // - aiApiKey: API keys for AI services (security)
    // Issue: https://github.com/legeling/PromptHub/issues/23
    const sensitiveFields = [
      "webdavUsername",
      "webdavPassword",
      "webdavEncryptionPassword",
      "selfHostedSyncUsername",
      "selfHostedSyncPassword",
      "aiApiKey",
    ];

    const filteredState = { ...state };
    for (const field of sensitiveFields) {
      delete filteredState[field];
    }

    return { state: filteredState, settingsUpdatedAt: state.settingsUpdatedAt };
  } catch (e) {
    console.warn("Failed to get settings snapshot:", e);
    return undefined;
  }
}

function restoreSettingsSnapshot(snapshot: { state: any } | undefined): void {
  if (!snapshot?.state) return;
  try {
    // Read current local settings to preserve sensitive fields
    // 读取当前本地设置以保留敏感字段
    const currentRaw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    const currentData = currentRaw ? JSON.parse(currentRaw) : { state: {} };
    const currentState = currentData?.state || {};

    // Sensitive fields that should NOT be overwritten by restore
    // 不应被恢复操作覆盖的敏感字段
    const sensitiveFields = [
      "webdavUsername",
      "webdavPassword",
      "webdavEncryptionPassword",
      "selfHostedSyncUsername",
      "selfHostedSyncPassword",
      "aiApiKey",
    ];

    // Merge: use restored settings as base, but preserve local sensitive fields
    // 合并：以恢复的设置为基础，但保留本地敏感字段
    const mergedState = { ...snapshot.state };
    for (const field of sensitiveFields) {
      if (currentState[field] !== undefined) {
        mergedState[field] = currentState[field];
      }
    }

    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ state: mergedState }),
    );
  } catch (e) {
    console.warn("Failed to restore settings snapshot:", e);
  }
}

async function gzipText(text: string): Promise<Blob> {
  // Electron/Chromium 支持 CompressionStream
  // Electron/Chromium supports CompressionStream
  const cs = new CompressionStream("gzip");
  const stream = new Blob([text], { type: "application/json" })
    .stream()
    .pipeThrough(cs);
  return await new Response(stream).blob();
}

async function gunzipToText(blob: Blob): Promise<string> {
  const ds = new DecompressionStream("gzip");
  const stream = blob.stream().pipeThrough(ds);
  return await new Response(stream).text();
}

/**
 * 导出数据库为 JSON（包含图片和 AI 配置）
 * Export database as JSON (including images and AI configuration)
 */
export async function exportDatabase(options?: {
  skipVideoContent?: boolean;
}): Promise<DatabaseBackup> {
  const backupModule = await import("./database-backup");
  return backupModule.exportDatabase(options);
}

/**
 * 从 JSON 导入数据库（包含图片和 AI 配置）
 * Import database from JSON (including images and AI configuration)
 */
export async function importDatabase(backup: DatabaseBackup): Promise<void> {
  const backupModule = await import("./database-backup");
  await backupModule.importDatabase(backup);
}

/**
 * 清空数据库
 * Clear database
 */
export async function clearDatabase(): Promise<void> {
  const database = await getDatabase();

  // 获取所有存在的 store 名称
  // Get all existing store names
  const storeNames = Array.from(database.objectStoreNames);
  const storesToClear = [
    STORES.PROMPTS,
    STORES.FOLDERS,
    STORES.VERSIONS,
  ].filter((store) => storeNames.includes(store));

  if (storesToClear.length === 0) {
    console.warn("No stores to clear");
    return;
  }

  const transaction = database.transaction(storesToClear, "readwrite");

  for (const storeName of storesToClear) {
    transaction.objectStore(storeName).clear();
  }

  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  // 清除图片文件
  // Clear image files
  try {
    await window.electron?.clearImages?.();
    console.log("Images cleared");
  } catch (error) {
    console.warn("Failed to clear images:", error);
  }

  // 清除视频文件
  // Clear video files
  try {
    await window.electron?.clearVideos?.();
    console.log("Videos cleared");
  } catch (error) {
    console.warn("Failed to clear videos:", error);
  }
}

/**
 * 获取数据库存储位置信息
 * Get database storage location information
 */
export function getDatabaseInfo(): { name: string; description: string } {
  return {
    name: "SQLite + Workspace Files",
    description: "Prompt/Folder/Version 存储在主进程 SQLite，并同步为 workspace 文件",
  };
}

/**
 * Key stored in localStorage once a successful IDB→SQLite migration is done.
 * Persists across restarts so we don't re-check IndexedDB every launch.
 *
 * 首次 IDB→SQLite 迁移成功后写入 localStorage 的标记 key，防止每次启动都重复检查。
 */
const IDB_MIGRATION_DONE_KEY = "prompthub:idb-migration-done";

async function getMainProcessVersionKeys(promptIds: string[]): Promise<Set<string>> {
  if (!window.api?.version?.getAll || promptIds.length === 0) {
    return new Set();
  }

  const versionGroups = await Promise.all(
    promptIds.map(async (promptId) => (await window.api.version.getAll(promptId)) ?? []),
  );

  return new Set(
    versionGroups.flatMap((versions) =>
      versions.map((version) => `${version.promptId}:${version.version}`),
    ),
  );
}

async function isMainProcessMigrationComplete(
  legacyPrompts: Prompt[],
  legacyFolders: Folder[],
  legacyVersions: PromptVersion[],
  mainPrompts: Prompt[],
  mainFolders: Folder[],
): Promise<boolean> {
  const legacyPromptIds = new Set(legacyPrompts.map((prompt) => prompt.id));
  const legacyFolderIds = new Set(legacyFolders.map((folder) => folder.id));
  const mainPromptIds = new Set((mainPrompts ?? []).map((prompt) => prompt.id));
  const mainFolderIds = new Set((mainFolders ?? []).map((folder) => folder.id));

  const hasAllPrompts = Array.from(legacyPromptIds).every((id) => mainPromptIds.has(id));
  const hasAllFolders = Array.from(legacyFolderIds).every((id) => mainFolderIds.has(id));
  if (!hasAllPrompts || !hasAllFolders) {
    return false;
  }

  const mainVersionKeys = await getMainProcessVersionKeys(Array.from(legacyPromptIds));
  const legacyVersionKeys = new Set(
    legacyVersions.map((version) => `${version.promptId}:${version.version}`),
  );
  return Array.from(legacyVersionKeys).every((key) => mainVersionKeys.has(key));
}

export async function migrateLegacyIndexedDbToMainProcess(): Promise<{
  migrated: boolean;
  promptCount: number;
  folderCount: number;
  versionCount: number;
}> {
  // Fast path: migration already confirmed in a previous session.
  // 快速路径：localStorage 标记说明上次已完成，直接跳过。
  if (localStorage.getItem(IDB_MIGRATION_DONE_KEY) === "1") {
    return { migrated: false, promptCount: 0, folderCount: 0, versionCount: 0 };
  }

  // migrateIdbBatch is required: non-atomic fallback writes can strand partial
  // data and then be misclassified as "done" on the next boot.
  // 必须使用 migrateIdbBatch：非原子 fallback 可能留下部分写入并在下次启动被误判为已完成。
  const hasBatchApi = !!window.api?.prompt?.migrateIdbBatch;
  if (!hasBatchApi) {
    console.warn(
      "[IDB migration] migrateIdbBatch API is unavailable; refusing non-atomic migration.",
    );
    return { migrated: false, promptCount: 0, folderCount: 0, versionCount: 0 };
  }

  // Read legacy IndexedDB data.
  // 读取旧版 IndexedDB 数据。
  const [legacyPrompts, legacyFolders] = await Promise.all([
    legacyGetAllPrompts(),
    legacyGetAllFolders(),
  ]);

  if (legacyPrompts.length === 0 && legacyFolders.length === 0) {
    // Nothing in IDB either — mark as done so we skip this check on next boot.
    // IDB 也没有数据 — 写入标记，下次启动跳过此检查。
    localStorage.setItem(IDB_MIGRATION_DONE_KEY, "1");
    return { migrated: false, promptCount: 0, folderCount: 0, versionCount: 0 };
  }

  const legacyVersions = (
    await Promise.all(legacyPrompts.map((prompt) => legacyGetPromptVersions(prompt.id)))
  ).flat();

  const fetchMainProcessSnapshot = async (): Promise<{
    prompts: Prompt[];
    folders: Folder[];
  }> => {
    const [prompts, folders] = await Promise.all([
      window.api.prompt.getAll(),
      window.api.folder?.getAll ? window.api.folder.getAll() : Promise.resolve([]),
    ]);

    return {
      prompts: prompts ?? [],
      folders: folders ?? [],
    };
  };

  // Fetch main-process data once; reuse for completion check AND partial-data guard.
  // 只获取一次主进程数据，同时供完整性检查和部分数据守卫使用（消除重复 IPC 调用）。
  const { prompts: mainPrompts, folders: mainFolders } = await fetchMainProcessSnapshot();

  if (
    await isMainProcessMigrationComplete(
      legacyPrompts,
      legacyFolders,
      legacyVersions,
      mainPrompts,
      mainFolders,
    )
  ) {
    localStorage.setItem(IDB_MIGRATION_DONE_KEY, "1");
    return { migrated: false, promptCount: 0, folderCount: 0, versionCount: 0 };
  }

  if (mainPrompts.length > 0 || mainFolders.length > 0) {
    console.warn(
      "[IDB migration] Main process already contains data but migration is incomplete; " +
        "refusing to merge legacy IndexedDB data non-atomically.",
    );
    return { migrated: false, promptCount: 0, folderCount: 0, versionCount: 0 };
  }

  try {
    // Preferred: single atomic transaction on the main process.
    // 首选：在主进程单事务一次性写入。
    const result = await window.api.prompt.migrateIdbBatch({
      folders: legacyFolders,
      prompts: legacyPrompts,
      versions: legacyVersions,
    });

    if (!result?.imported) {
      const {
        prompts: refreshedPrompts,
        folders: refreshedFolders,
      } = await fetchMainProcessSnapshot();

      if (
        await isMainProcessMigrationComplete(
          legacyPrompts,
          legacyFolders,
          legacyVersions,
          refreshedPrompts,
          refreshedFolders,
        )
      ) {
        localStorage.setItem(IDB_MIGRATION_DONE_KEY, "1");
      }
      return { migrated: false, promptCount: 0, folderCount: 0, versionCount: 0 };
    }
  } catch (err) {
    // Migration failed — do NOT set the localStorage marker so we retry next boot.
    // 迁移失败 — 不写标记，下次启动会重试。
    console.error("[IDB migration] Failed to migrate IndexedDB data to SQLite:", err);
    return { migrated: false, promptCount: 0, folderCount: 0, versionCount: 0 };
  }

  // Mark migration as done so future boots skip the IDB check entirely.
  // 写入持久化标记，后续启动直接跳过 IDB 检查。
  localStorage.setItem(IDB_MIGRATION_DONE_KEY, "1");

  return {
    migrated: true,
    promptCount: legacyPrompts.length,
    folderCount: legacyFolders.length,
    versionCount: legacyVersions.length,
  };
}

/**
 * 下载备份文件
 * Download backup file
 */
export async function downloadBackup(): Promise<void> {
  const backupModule = await import("./database-backup");
  await backupModule.downloadBackup();
}

/**
 * 下载压缩的全量备份（.phub.gz）
 * Download compressed full backup (.phub.gz)
 */
export async function downloadCompressedBackup(): Promise<void> {
  const backupModule = await import("./database-backup");
  await backupModule.downloadCompressedBackup();
}

/**
 * 选择性导出（仅导出，不提供导入）
 */
export async function downloadSelectiveExport(
  scope: ExportScope,
): Promise<void> {
  const backupModule = await import("./database-backup");
  await backupModule.downloadSelectiveExport(scope);
}

/**
 * 从文件恢复备份
 */
export async function restoreFromFile(
  file: File,
): Promise<import("./database-backup-format").ImportSkippedStats> {
  const backupModule = await import("./database-backup");
  return backupModule.restoreFromFile(file);
}

/**
 * 从备份数据恢复（用于 WebDAV 同步）
 */
export async function restoreFromBackup(
  backup: DatabaseBackup,
): Promise<import("./database-backup-format").ImportSkippedStats> {
  const backupModule = await import("./database-backup");
  return backupModule.restoreFromBackup(backup);
}
