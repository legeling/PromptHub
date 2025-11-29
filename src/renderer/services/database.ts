/**
 * IndexedDB 数据库服务
 * 使用 IndexedDB 存储数据，支持备份、恢复和迁移
 */

import type { Prompt, PromptVersion, Folder } from '../../shared/types';

const DB_NAME = 'PromptHubDB';
const DB_VERSION = 1;

// 预制数据
const SEED_PROMPTS: Prompt[] = [
  {
    id: 'seed-1',
    title: '代码审查助手',
    description: '专业的代码审查专家，帮助发现代码问题',
    systemPrompt: '你是一个专业的代码审查专家，擅长发现代码问题并给出改进建议。',
    userPrompt: '请审查以下 {{language}} 代码：\n\n{{code}}\n\n请从以下方面进行审查：\n1. 代码质量\n2. 潜在 Bug\n3. 性能问题\n4. 最佳实践',
    variables: [
      { name: 'language', type: 'select', label: '编程语言', options: ['Python', 'JavaScript', 'TypeScript', 'Go'], required: true },
      { name: 'code', type: 'textarea', label: '代码', required: true },
    ],
    tags: ['开发', '代码审查'],
    isFavorite: true,
    version: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-2',
    title: '文章润色助手',
    description: '帮助优化文章表达，提升文章质量',
    userPrompt: '请帮我润色以下文章，保持原意的同时优化表达：\n\n{{content}}\n\n要求：\n- 语言流畅自然\n- 逻辑清晰\n- 用词准确',
    variables: [
      { name: 'content', type: 'textarea', label: '文章内容', required: true },
    ],
    tags: ['写作', '润色'],
    isFavorite: false,
    version: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-3',
    title: '翻译助手',
    description: '专业的多语言翻译，支持多种语言互译',
    systemPrompt: '你是一个专业的翻译专家，精通多国语言，能够准确传达原文的含义和语气。',
    userPrompt: '请将以下{{source_lang}}文本翻译成{{target_lang}}：\n\n{{text}}',
    variables: [
      { name: 'source_lang', type: 'select', label: '源语言', options: ['中文', '英文', '日文', '韩文'], required: true },
      { name: 'target_lang', type: 'select', label: '目标语言', options: ['中文', '英文', '日文', '韩文'], required: true },
      { name: 'text', type: 'textarea', label: '待翻译文本', required: true },
    ],
    tags: ['翻译', '多语言'],
    isFavorite: true,
    version: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const SEED_FOLDERS: Folder[] = [
  { id: 'folder-1', name: '工作', icon: '💼', order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'folder-2', name: '学习', icon: '📚', order: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'folder-3', name: '创意', icon: '💡', order: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

// 使用浏览器原生 API 生成 UUID
const generateId = () => crypto.randomUUID();

// 数据库存储名称
const STORES = {
  PROMPTS: 'prompts',
  VERSIONS: 'versions',
  FOLDERS: 'folders',
  SETTINGS: 'settings',
} as const;

let db: IDBDatabase | null = null;

/**
 * 初始化数据库
 */
export async function initDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open database'));
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // 创建 prompts 存储
      if (!database.objectStoreNames.contains(STORES.PROMPTS)) {
        const promptStore = database.createObjectStore(STORES.PROMPTS, { keyPath: 'id' });
        promptStore.createIndex('folderId', 'folderId', { unique: false });
        promptStore.createIndex('isFavorite', 'isFavorite', { unique: false });
        promptStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // 创建 versions 存储
      if (!database.objectStoreNames.contains(STORES.VERSIONS)) {
        const versionStore = database.createObjectStore(STORES.VERSIONS, { keyPath: 'id' });
        versionStore.createIndex('promptId', 'promptId', { unique: false });
        versionStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // 创建 folders 存储
      if (!database.objectStoreNames.contains(STORES.FOLDERS)) {
        const folderStore = database.createObjectStore(STORES.FOLDERS, { keyPath: 'id' });
        folderStore.createIndex('parentId', 'parentId', { unique: false });
      }

      // 创建 settings 存储
      if (!database.objectStoreNames.contains(STORES.SETTINGS)) {
        database.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }
    };
  });
}

/**
 * 获取数据库实例
 */
export async function getDatabase(): Promise<IDBDatabase> {
  if (db) return db;
  return initDatabase();
}

/**
 * 删除并重建数据库（用于开发调试）
 */
export async function resetDatabase(): Promise<void> {
  // 关闭现有连接
  if (db) {
    db.close();
    db = null;
  }
  
  // 删除数据库
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => {
      console.log('Database deleted successfully');
      resolve();
    };
    request.onerror = () => {
      console.error('Failed to delete database');
      reject(request.error);
    };
  });
}

/**
 * 填充种子数据（首次启动时调用）
 */
export async function seedDatabase(): Promise<void> {
  const database = await getDatabase();
  
  // 检查是否已有数据
  const promptCount = await new Promise<number>((resolve) => {
    const transaction = database.transaction(STORES.PROMPTS, 'readonly');
    const store = transaction.objectStore(STORES.PROMPTS);
    const request = store.count();
    request.onsuccess = () => {
      console.log('Current prompt count:', request.result);
      resolve(request.result);
    };
    request.onerror = () => {
      console.error('Failed to count prompts');
      resolve(0);
    };
  });

  // 如果没有数据，填充种子数据
  if (promptCount === 0) {
    console.log('Seeding database with initial data...');
    const transaction = database.transaction([STORES.PROMPTS, STORES.FOLDERS], 'readwrite');
    const promptStore = transaction.objectStore(STORES.PROMPTS);
    const folderStore = transaction.objectStore(STORES.FOLDERS);

    // 添加预制 Prompts
    for (const prompt of SEED_PROMPTS) {
      console.log('Adding prompt:', prompt.title);
      promptStore.add(prompt);
    }

    // 添加预制文件夹
    for (const folder of SEED_FOLDERS) {
      console.log('Adding folder:', folder.name);
      folderStore.add(folder);
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        console.log('✅ Database seeded successfully with', SEED_PROMPTS.length, 'prompts and', SEED_FOLDERS.length, 'folders');
        resolve();
      };
      transaction.onerror = () => {
        console.error('❌ Failed to seed database:', transaction.error);
        reject(transaction.error);
      };
    });
  } else {
    console.log('Database already has data, skipping seed');
  }
}

// ==================== Prompt 操作 ====================

export async function getAllPrompts(): Promise<Prompt[]> {
  const database = await getDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.PROMPTS, 'readonly');
    const store = transaction.objectStore(STORES.PROMPTS);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getPromptById(id: string): Promise<Prompt | undefined> {
  const database = await getDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.PROMPTS, 'readonly');
    const store = transaction.objectStore(STORES.PROMPTS);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function createPrompt(data: Omit<Prompt, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Promise<Prompt> {
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
    const transaction = database.transaction(STORES.PROMPTS, 'readwrite');
    const store = transaction.objectStore(STORES.PROMPTS);
    const request = store.add(prompt);

    request.onsuccess = () => resolve(prompt);
    request.onerror = () => reject(request.error);
  });
}

export async function updatePrompt(id: string, data: Partial<Prompt>, incrementVersion = true): Promise<Prompt> {
  const database = await getDatabase();
  const existing = await getPromptById(id);
  if (!existing) throw new Error('Prompt not found');

  // 只有内容变化才增加版本号
  const hasContentChange = data.systemPrompt !== undefined || data.userPrompt !== undefined;
  const shouldIncrementVersion = incrementVersion && hasContentChange;

  const updated: Prompt = {
    ...existing,
    ...data,
    id,
    updatedAt: new Date().toISOString(),
    version: shouldIncrementVersion ? existing.version + 1 : existing.version,
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.PROMPTS, 'readwrite');
    const store = transaction.objectStore(STORES.PROMPTS);
    const request = store.put(updated);

    request.onsuccess = () => resolve(updated);
    request.onerror = () => reject(request.error);
  });
}

export async function deletePrompt(id: string): Promise<void> {
  const database = await getDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.PROMPTS, 'readwrite');
    const store = transaction.objectStore(STORES.PROMPTS);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ==================== Version 操作 ====================

export async function getPromptVersions(promptId: string): Promise<PromptVersion[]> {
  const database = await getDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.VERSIONS, 'readonly');
    const store = transaction.objectStore(STORES.VERSIONS);
    const index = store.index('promptId');
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
  data: { systemPrompt?: string; userPrompt: string; version: number }
): Promise<PromptVersion> {
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
    const transaction = database.transaction(STORES.VERSIONS, 'readwrite');
    const store = transaction.objectStore(STORES.VERSIONS);
    const request = store.add(versionRecord);

    request.onsuccess = () => resolve(versionRecord);
    request.onerror = () => reject(request.error);
  });
}

// ==================== Folder 操作 ====================

export async function getAllFolders(): Promise<Folder[]> {
  const database = await getDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.FOLDERS, 'readonly');
    const store = transaction.objectStore(STORES.FOLDERS);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function createFolder(data: Omit<Folder, 'id' | 'createdAt' | 'updatedAt'>): Promise<Folder> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const folder: Folder = {
    ...data,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.FOLDERS, 'readwrite');
    const store = transaction.objectStore(STORES.FOLDERS);
    const request = store.add(folder);

    request.onsuccess = () => resolve(folder);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteFolder(id: string): Promise<void> {
  const database = await getDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.FOLDERS, 'readwrite');
    const store = transaction.objectStore(STORES.FOLDERS);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ==================== 备份与恢复 ====================

export interface DatabaseBackup {
  version: number;
  exportedAt: string;
  prompts: Prompt[];
  folders: Folder[];
  versions: PromptVersion[];
}

/**
 * 导出数据库为 JSON
 */
export async function exportDatabase(): Promise<DatabaseBackup> {
  const [prompts, folders] = await Promise.all([
    getAllPrompts(),
    getAllFolders(),
  ]);

  // 获取所有版本
  const database = await getDatabase();
  const versions = await new Promise<PromptVersion[]>((resolve, reject) => {
    const transaction = database.transaction(STORES.VERSIONS, 'readonly');
    const store = transaction.objectStore(STORES.VERSIONS);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return {
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    prompts,
    folders,
    versions,
  };
}

/**
 * 从 JSON 导入数据库
 */
export async function importDatabase(backup: DatabaseBackup): Promise<void> {
  const database = await getDatabase();

  // 清空现有数据
  await clearDatabase();

  // 导入数据
  const transaction = database.transaction(
    [STORES.PROMPTS, STORES.FOLDERS, STORES.VERSIONS],
    'readwrite'
  );

  const promptStore = transaction.objectStore(STORES.PROMPTS);
  const folderStore = transaction.objectStore(STORES.FOLDERS);
  const versionStore = transaction.objectStore(STORES.VERSIONS);

  for (const prompt of backup.prompts) {
    promptStore.add(prompt);
  }

  for (const folder of backup.folders) {
    folderStore.add(folder);
  }

  for (const version of backup.versions) {
    versionStore.add(version);
  }

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * 清空数据库
 */
export async function clearDatabase(): Promise<void> {
  const database = await getDatabase();

  const transaction = database.transaction(
    [STORES.PROMPTS, STORES.FOLDERS, STORES.VERSIONS],
    'readwrite'
  );

  transaction.objectStore(STORES.PROMPTS).clear();
  transaction.objectStore(STORES.FOLDERS).clear();
  transaction.objectStore(STORES.VERSIONS).clear();

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * 获取数据库存储位置信息
 */
export function getDatabaseInfo(): { name: string; description: string } {
  return {
    name: DB_NAME,
    description: '数据存储在浏览器 IndexedDB 中，位于用户数据目录下',
  };
}

/**
 * 下载备份文件
 */
export async function downloadBackup(): Promise<void> {
  const backup = await exportDatabase();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `prompthub-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 从文件恢复备份
 */
export async function restoreFromFile(file: File): Promise<void> {
  const text = await file.text();
  const backup = JSON.parse(text) as DatabaseBackup;
  await importDatabase(backup);
}

/**
 * 从备份数据恢复（用于 WebDAV 同步）
 */
export async function restoreFromBackup(backup: DatabaseBackup): Promise<void> {
  await importDatabase(backup);
}
