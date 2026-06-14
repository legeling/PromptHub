/**
 * IndexedDB Database Service
 * 使用 IndexedDB 存储数据，支持备份、恢复和迁移
 * Store data using IndexedDB, support backup, restore and migration
 */

import type { Prompt, PromptVersion, Folder } from "@prompthub/shared/types";
import { DB_BACKUP_VERSION } from "./database-backup-format";

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

export async function movePrompt(
  promptId: string,
  newParentId: string | null,
  newOrder: number,
): Promise<void> {
  if (!Number.isFinite(newOrder) || newOrder < 0) {
    throw new Error("Prompt order must be a non-negative number");
  }

  if (window.api?.prompt?.move) {
    await window.api.prompt.move(promptId, newParentId, newOrder);
    return;
  }

  const database = await getDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORES.PROMPTS, "readwrite");
    const store = transaction.objectStore(STORES.PROMPTS);
    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = () => {
      const prompts = getAllRequest.result as Prompt[];
      const prompt = prompts.find((item) => item.id === promptId);
      if (!prompt) {
        resolve();
        return;
      }

      try {
        const targetParentId = newParentId ?? null;
        assertPromptMoveAllowed(prompts, promptId, targetParentId);
        const reorderedPrompts = reorderPromptTree(
          prompts,
          promptId,
          targetParentId,
          newOrder,
        );
        const now = new Date().toISOString();

        for (const item of reorderedPrompts) {
          const putRequest = store.put({
            ...item,
            updatedAt: item.id === promptId ? now : item.updatedAt,
          });
          putRequest.onerror = () => reject(putRequest.error);
        }

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      } catch (error) {
        reject(error);
      }
    };
    getAllRequest.onerror = () => reject(getAllRequest.error);
  });
}

function assertPromptMoveAllowed(
  prompts: Prompt[],
  promptId: string,
  parentId: string | null,
): void {
  if (!parentId) {
    return;
  }

  if (parentId === promptId) {
    throw new Error("Cannot move a prompt under itself");
  }

  const promptById = new Map(prompts.map((prompt) => [prompt.id, prompt]));
  let currentParentId: string | null | undefined = parentId;
  const visited = new Set<string>();

  while (currentParentId) {
    if (currentParentId === promptId) {
      throw new Error("Cannot move a prompt under its descendant");
    }
    if (visited.has(currentParentId)) {
      throw new Error("Cannot move prompt into a cyclic hierarchy");
    }

    visited.add(currentParentId);
    const parent = promptById.get(currentParentId);
    if (!parent) {
      throw new Error("Parent prompt does not exist");
    }
    currentParentId = parent.parentId;
  }
}

function reorderPromptTree(
  prompts: Prompt[],
  promptId: string,
  parentId: string | null,
  order: number,
): Prompt[] {
  const prompt = prompts.find((item) => item.id === promptId);
  if (!prompt) {
    return prompts;
  }

  const oldParentId = prompt.parentId ?? null;
  const nextPrompts = prompts.map((item) => ({ ...item }));
  normalizePromptSiblings(nextPrompts, oldParentId, promptId);

  const targetSiblings = nextPrompts
    .filter((item) => (item.parentId ?? null) === parentId && item.id !== promptId)
    .sort(comparePromptOrder);
  const targetIndex = Math.min(Math.trunc(order), targetSiblings.length);
  targetSiblings.splice(targetIndex, 0, prompt);

  targetSiblings.forEach((item, index) => {
    const target = nextPrompts.find((candidate) => candidate.id === item.id);
    if (target) {
      target.parentId = parentId;
      target.order = index;
    }
  });

  return nextPrompts;
}

function normalizePromptSiblings(
  prompts: Prompt[],
  parentId: string | null,
  excludeId: string,
): void {
  prompts
    .filter((prompt) => (prompt.parentId ?? null) === parentId && prompt.id !== excludeId)
    .sort(comparePromptOrder)
    .forEach((prompt, index) => {
      prompt.order = index;
    });
}

function comparePromptOrder(a: Prompt, b: Prompt): number {
  return (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id);
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
