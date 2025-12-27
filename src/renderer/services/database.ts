/**
 * IndexedDB Database Service
 * 使用 IndexedDB 存储数据，支持备份、恢复和迁移
 * Store data using IndexedDB, support backup, restore and migration
 */

import type { Prompt, PromptVersion, Folder } from '../../shared/types';
import { getSeedPrompts, getSeedFolders } from './seedData';
import i18n from '../i18n';

const DB_NAME = 'PromptHubDB';
const DB_VERSION = 1;

// Preset data - 3 folders: AI Programming, Role Playing, Drawing Prompts
// 预制数据 - 3个文件夹：AI编程、角色扮演、绘图提示词
// @deprecated Use multilingual data from seedData.ts
const SEED_PROMPTS: Prompt[] = [
  // ========== AI 编程规则 ==========
  // ========== AI Programming Rules ==========
  {
    id: 'seed-1',
    title: 'Cursor Rules 专家',
    description: '生成高质量的 Cursor/Windsurf AI 编程规则',
    folderId: 'folder-coding',
    systemPrompt: '你是一位 AI 辅助编程专家，精通 Cursor、Windsurf 等 AI IDE 的规则编写。你了解如何编写清晰、有效的 AI 编程指令，让 AI 更好地理解项目上下文和编码规范。',
    userPrompt: '请为我的 {{project_type}} 项目生成一份 Cursor Rules 文件：\n\n技术栈：{{tech_stack}}\n项目描述：{{description}}\n\n要求包含：\n1. 项目概述和目录结构说明\n2. 代码风格和命名规范\n3. 架构模式和设计原则\n4. 常用代码模板\n5. 禁止的实现方式\n6. 测试和文档要求',
    variables: [],
    tags: ['AI编程', 'Cursor', '规则'],
    isFavorite: true,
    isPinned: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-2',
    title: '代码审查专家',
    description: '专业代码审查，发现问题并给出改进建议',
    folderId: 'folder-coding',
    systemPrompt: '你是一位资深软件工程师，专注于代码质量和最佳实践。审查时要严谨但友好，解释每个建议背后的原因。',
    userPrompt: '请审查以下 {{language}} 代码：\n\n```{{language}}\n{{code}}\n```\n\n请从以下方面审查：\n1. **代码质量**：命名规范、代码结构、可读性\n2. **潜在问题**：Bug、边界情况、异常处理\n3. **性能优化**：时间复杂度、内存使用\n4. **安全隐患**：输入验证、数据安全\n5. **改进建议**：具体的优化方案',
    variables: [],
    tags: ['AI编程', '代码审查'],
    isFavorite: true,
    isPinned: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-3',
    title: 'Git Commit 生成器',
    description: '根据代码变更生成规范的 commit 信息',
    folderId: 'folder-coding',
    systemPrompt: '你是一位遵循 Conventional Commits 规范的开发者，擅长编写清晰、规范的提交信息。',
    userPrompt: '请根据以下代码变更生成 Git commit 信息：\n\n```diff\n{{diff}}\n```\n\n要求：\n1. 遵循格式：type(scope): description\n2. type：feat/fix/docs/style/refactor/test/chore\n3. 描述简洁，不超过 50 字符\n4. 如需要，添加详细 body',
    variables: [],
    tags: ['AI编程', 'Git'],
    isFavorite: false,
    isPinned: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  // ========== 角色扮演 ==========
  // ========== Role Playing ==========
  {
    id: 'seed-4',
    title: '资深产品经理',
    description: '扮演产品经理，帮助分析需求和设计产品',
    folderId: 'folder-roleplay',
    systemPrompt: '你是一位有 10 年经验的资深产品经理，曾在多家知名互联网公司工作。你擅长用户研究、需求分析、产品设计和项目管理。你的回答务实、有洞察力，会从用户价值和商业价值两个角度思考问题。',
    userPrompt: '{{question}}',
    variables: [],
    tags: ['角色扮演', '产品'],
    isFavorite: true,
    isPinned: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-5',
    title: '创业导师',
    description: '扮演创业导师，提供创业建议和指导',
    folderId: 'folder-roleplay',
    systemPrompt: '你是一位成功的连续创业者和天使投资人，有丰富的创业和投资经验。你直言不讳，会指出创业者的盲点，但也会给予鼓励和实用建议。你关注商业模式、市场机会、团队建设和融资策略。',
    userPrompt: '{{question}}',
    variables: [],
    tags: ['角色扮演', '创业'],
    isFavorite: false,
    isPinned: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-6',
    title: '心理咨询师',
    description: '扮演心理咨询师，提供情感支持和建议',
    folderId: 'folder-roleplay',
    systemPrompt: '你是一位专业的心理咨询师，拥有丰富的临床经验。你温和、有同理心，善于倾听和引导。你会帮助来访者探索自己的情绪和想法，但不会做出诊断或开具处方。如遇严重心理问题，你会建议寻求专业帮助。',
    userPrompt: '{{question}}',
    variables: [],
    tags: ['角色扮演', '心理'],
    isFavorite: false,
    isPinned: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  // ========== 绘图提示词 ==========
  // ========== Drawing Prompts ==========
  {
    id: 'seed-7',
    title: 'Midjourney 提示词生成',
    description: '生成高质量的 Midjourney 绘图提示词',
    folderId: 'folder-image',
    systemPrompt: '你是一位精通 Midjourney 的 AI 绘画专家，了解各种艺术风格、构图技巧和提示词写法。你会生成详细、有创意的英文提示词，包含主体、风格、光影、构图等要素。',
    userPrompt: '请为以下描述生成 Midjourney 提示词：\n\n{{description}}\n\n风格偏好：{{style}}\n\n请生成：\n1. 完整的英文提示词\n2. 推荐的参数（--ar, --v, --s 等）\n3. 3个变体版本',
    variables: [],
    tags: ['绘图', 'Midjourney'],
    isFavorite: true,
    isPinned: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-8',
    title: 'Stable Diffusion 提示词',
    description: '生成 Stable Diffusion / FLUX 绘图提示词',
    folderId: 'folder-image',
    systemPrompt: '你是一位精通 Stable Diffusion 和 FLUX 的 AI 绘画专家，了解各种模型特点、LoRA 使用和提示词技巧。你会生成结构化的提示词，包含正向和负向提示。',
    userPrompt: '请为以下描述生成 SD/FLUX 提示词：\n\n{{description}}\n\n风格：{{style}}\n模型：{{model}}\n\n请生成：\n1. Positive Prompt（正向提示词）\n2. Negative Prompt（负向提示词）\n3. 推荐的采样器和步数',
    variables: [],
    tags: ['绘图', 'SD', 'FLUX'],
    isFavorite: true,
    isPinned: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-9',
    title: 'DALL-E 提示词优化',
    description: '优化 DALL-E / GPT-4V 绘图提示词',
    folderId: 'folder-image',
    systemPrompt: '你是一位精通 DALL-E 和 GPT-4V 图像生成的专家，了解 OpenAI 图像模型的特点和最佳实践。你会生成清晰、具体的自然语言描述。',
    userPrompt: '请优化以下绘图描述，使其更适合 DALL-E 生成：\n\n原始描述：{{description}}\n\n请提供：\n1. 优化后的详细描述\n2. 艺术风格建议\n3. 构图和光影建议',
    variables: [],
    tags: ['绘图', 'DALL-E'],
    isFavorite: false,
    isPinned: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const SEED_FOLDERS: Folder[] = [
  { id: 'folder-coding', name: 'AI 编程', icon: '💻', order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'folder-roleplay', name: '角色扮演', icon: '🎭', order: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'folder-image', name: '绘图提示词', icon: '🎨', order: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

// Generate UUID using browser native API
// 使用浏览器原生 API 生成 UUID
const generateId = () => crypto.randomUUID();

// Database storage names
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
 * Initialize database
 */
export async function initDatabase(): Promise<IDBDatabase> {
  // 如果已有连接，先关闭
  // If there's an existing connection, close it first
  if (db) {
    try {
      db.close();
    } catch (e) {
      console.warn('Failed to close existing db connection:', e);
    }
    db = null;
  }

  return new Promise((resolve, reject) => {
    // 添加超时机制，防止无限等待
    // Add timeout mechanism to prevent infinite waiting
    const timeout = setTimeout(() => {
      console.error('Database open timeout after 10s');
      reject(new Error('Database open timeout'));
    }, 10000);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Failed to open database'));
    };

    request.onblocked = () => {
      console.warn('Database open blocked - another connection is open');
      // 不立即 reject，等待 onsuccess 或超时
      // Don't reject immediately, wait for onsuccess or timeout
    };

    request.onsuccess = () => {
      clearTimeout(timeout);
      db = request.result;

      // 监听版本变化事件，当其他标签页升级数据库时关闭连接
      // Listen for version change events, close connection when other tabs upgrade database
      db.onversionchange = () => {
        console.log('Database version change detected, closing connection');
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
        const promptStore = database.createObjectStore(STORES.PROMPTS, { keyPath: 'id' });
        promptStore.createIndex('folderId', 'folderId', { unique: false });
        promptStore.createIndex('isFavorite', 'isFavorite', { unique: false });
        promptStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // 创建 versions 存储
      // Create versions store
      if (!database.objectStoreNames.contains(STORES.VERSIONS)) {
        const versionStore = database.createObjectStore(STORES.VERSIONS, { keyPath: 'id' });
        versionStore.createIndex('promptId', 'promptId', { unique: false });
        versionStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // 创建 folders 存储
      // Create folders store
      if (!database.objectStoreNames.contains(STORES.FOLDERS)) {
        const folderStore = database.createObjectStore(STORES.FOLDERS, { keyPath: 'id' });
        folderStore.createIndex('parentId', 'parentId', { unique: false });
      }

      // 创建 settings 存储
      // Create settings store
      if (!database.objectStoreNames.contains(STORES.SETTINGS)) {
        database.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
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
 * Fill seed data (called on first startup)
 */
export async function seedDatabase(): Promise<void> {
  const database = await getDatabase();

  // 检查是否已有数据
  // Check if there's already data
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
  // If no data, fill with seed data
  if (promptCount === 0) {
    // 获取当前语言
    // Get current language
    const currentLanguage = i18n.language || 'en';
    console.log('Seeding database with initial data for language:', currentLanguage);

    // 获取对应语言的种子数据
    // Get seed data for corresponding language
    const seedPrompts = getSeedPrompts(currentLanguage);
    const seedFolders = getSeedFolders(currentLanguage);

    const transaction = database.transaction([STORES.PROMPTS, STORES.FOLDERS], 'readwrite');
    const promptStore = transaction.objectStore(STORES.PROMPTS);
    const folderStore = transaction.objectStore(STORES.FOLDERS);

    // 添加预制 Prompts
    // Add preset Prompts
    for (const prompt of seedPrompts) {
      console.log('Adding prompt:', prompt.title);
      promptStore.add(prompt);
    }

    // 添加预制文件夹
    // Add preset folders
    for (const folder of seedFolders) {
      console.log('Adding folder:', folder.name);
      folderStore.add(folder);
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        console.log('✅ Database seeded successfully with', seedPrompts.length, 'prompts and', seedFolders.length, 'folders');
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
// ==================== Prompt Operations ====================

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
  // Only increment version number when content changes
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

/**
 * 批量移动 Prompt 到指定文件夹
 * Batch move prompts to a folder
 */
export async function movePrompts(ids: string[], folderId: string): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();

  // 逐个更新 Prompt 的文件夹
  // Update prompt folders one by one
  for (const id of ids) {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORES.PROMPTS, 'readwrite');
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
// ==================== Folder Operations ====================

export async function getAllFolders(): Promise<Folder[]> {
  const database = await getDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.FOLDERS, 'readonly');
    const store = transaction.objectStore(STORES.FOLDERS);
    const request = store.getAll();

    request.onsuccess = () => {
      // 按 order 字段排序
      // Sort by order field
      const folders = request.result.sort((a, b) => (a.order || 0) - (b.order || 0));
      resolve(folders);
    };
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

export async function updateFolder(id: string, data: Partial<Folder>): Promise<Folder> {
  const database = await getDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.FOLDERS, 'readwrite');
    const store = transaction.objectStore(STORES.FOLDERS);

    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const existing = getRequest.result;
      if (!existing) {
        reject(new Error('Folder not found'));
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
  const database = await getDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.FOLDERS, 'readwrite');
    const store = transaction.objectStore(STORES.FOLDERS);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function updateFolderOrders(updates: { id: string; order: number }[]): Promise<void> {
  const database = await getDatabase();

  // 逐个更新文件夹顺序
  // Update folder order one by one
  for (const { id, order } of updates) {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORES.FOLDERS, 'readwrite');
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

export interface DatabaseBackup {
  version: number;
  exportedAt: string;
  prompts: Prompt[];
  folders: Folder[];
  versions: PromptVersion[];
  images?: { [fileName: string]: string }; // fileName -> base64
  // System settings snapshot (optional, for cross-device consistency)
  // 系统设置快照（可选，用于跨设备一致）
  aiConfig?: {
    aiModels?: any[];
    aiProvider?: string;
    aiApiKey?: string;
    aiApiUrl?: string;
    aiModel?: string;
  };
  // 系统设置快照（可选，用于跨设备一致）
  settings?: { state: any };
  settingsUpdatedAt?: string;
}

export type ExportScope = {
  prompts?: boolean;
  folders?: boolean;
  versions?: boolean;
  images?: boolean;
  aiConfig?: boolean;
  settings?: boolean;
};

export type PromptHubFile =
  | { kind: 'prompthub-export'; exportedAt: string; scope: Required<ExportScope>; payload: Partial<DatabaseBackup> }
  | { kind: 'prompthub-backup'; exportedAt: string; payload: DatabaseBackup };

const SETTINGS_STORAGE_KEY = 'prompthub-settings';

/**
 * 收集所有需要备份的图片
 * Collect all images that need to be backed up
 */
async function collectImages(prompts: Prompt[]): Promise<{ [fileName: string]: string }> {
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

  // 读取图片为 Base64
  // Read images as Base64
  for (const fileName of imageFileNames) {
    try {
      const base64 = await window.electron?.readImageBase64?.(fileName);
      if (base64) {
        images[fileName] = base64;
      }
    } catch (error) {
      console.warn(`Failed to read image ${fileName}:`, error);
    }
  }

  return images;
}

/**
 * 获取 AI 配置（从 localStorage）
 * Get AI configuration (from localStorage)
 */
function getAiConfig(): DatabaseBackup['aiConfig'] {
  try {
    // 当前版本的 settings store 持久化 key
    // Current version settings store persistence key
    const primary = localStorage.getItem('prompthub-settings');
    // 旧版兼容（历史 key）
    // Old version compatibility (legacy key)
    const legacy = localStorage.getItem('settings-storage');
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
      aiProvider: state.aiProvider,
      // aiApiKey is intentionally excluded for security
      // aiApiKey 出于安全考虑被故意排除
      aiApiUrl: state.aiApiUrl,
      aiModel: state.aiModel,
    };
  } catch (e) {
    console.warn('Failed to get AI config:', e);
  }
  return undefined;
}

/**
 * 恢复 AI 配置（到 localStorage）
 * Restore AI configuration (to localStorage)
 */
function restoreAiConfig(aiConfig: DatabaseBackup['aiConfig']): void {
  if (!aiConfig) return;
  try {
    const primaryKey = 'prompthub-settings';
    const legacyKey = 'settings-storage';
    const storedPrimary = localStorage.getItem(primaryKey);
    const storedLegacy = localStorage.getItem(legacyKey);

    const targetKey = storedPrimary ? primaryKey : (storedLegacy ? legacyKey : primaryKey);
    const stored = storedPrimary || storedLegacy;
    const data = stored ? JSON.parse(stored) : { state: {} };

    if (!data.state) data.state = {};
    data.state.aiModels = aiConfig.aiModels || [];
    if (aiConfig.aiProvider) data.state.aiProvider = aiConfig.aiProvider;
    if (aiConfig.aiApiKey) data.state.aiApiKey = aiConfig.aiApiKey;
    if (aiConfig.aiApiUrl) data.state.aiApiUrl = aiConfig.aiApiUrl;
    if (aiConfig.aiModel) data.state.aiModel = aiConfig.aiModel;
    localStorage.setItem(targetKey, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to restore AI config:', e);
  }
}

function getSettingsSnapshot(): { state: any; settingsUpdatedAt?: string } | undefined {
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
      'webdavUsername',
      'webdavPassword',
      'webdavEncryptionPassword',
      'aiApiKey',
    ];

    const filteredState = { ...state };
    for (const field of sensitiveFields) {
      delete filteredState[field];
    }

    return { state: filteredState, settingsUpdatedAt: state.settingsUpdatedAt };
  } catch (e) {
    console.warn('Failed to get settings snapshot:', e);
    return undefined;
  }
}

function restoreSettingsSnapshot(snapshot: { state: any } | undefined): void {
  if (!snapshot?.state) return;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ state: snapshot.state }));
  } catch (e) {
    console.warn('Failed to restore settings snapshot:', e);
  }
}

async function gzipText(text: string): Promise<Blob> {
  // Electron/Chromium 支持 CompressionStream
  // Electron/Chromium supports CompressionStream
  const cs = new CompressionStream('gzip');
  const stream = new Blob([text], { type: 'application/json' }).stream().pipeThrough(cs);
  return await new Response(stream).blob();
}

async function gunzipToText(blob: Blob): Promise<string> {
  const ds = new DecompressionStream('gzip');
  const stream = blob.stream().pipeThrough(ds);
  return await new Response(stream).text();
}

/**
 * 导出数据库为 JSON（包含图片和 AI 配置）
 * Export database as JSON (including images and AI configuration)
 */
export async function exportDatabase(): Promise<DatabaseBackup> {
  const [prompts, folders] = await Promise.all([
    getAllPrompts(),
    getAllFolders(),
  ]);

  // 获取所有版本
  // Get all versions
  const database = await getDatabase();
  const versions = await new Promise<PromptVersion[]>((resolve, reject) => {
    const transaction = database.transaction(STORES.VERSIONS, 'readonly');
    const store = transaction.objectStore(STORES.VERSIONS);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  // 收集图片
  // Collect images
  const images = await collectImages(prompts);

  // 获取 AI 配置
  // Get AI configuration
  const aiConfig = getAiConfig();
  // 获取系统设置快照
  // Get system settings snapshot
  const settingsSnapshot = getSettingsSnapshot();

  return {
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    prompts,
    folders,
    versions,
    images,
    aiConfig,
    settings: settingsSnapshot ? { state: settingsSnapshot.state } : undefined,
    settingsUpdatedAt: settingsSnapshot?.settingsUpdatedAt,
  };
}

/**
 * 从 JSON 导入数据库（包含图片和 AI 配置）
 * Import database from JSON (including images and AI configuration)
 */
export async function importDatabase(backup: DatabaseBackup): Promise<void> {
  const database = await getDatabase();

  // 清空现有数据
  // Clear existing data
  await clearDatabase();

  // 导入数据
  // Import data
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

  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  // 恢复图片
  // Restore images
  if (backup.images) {
    let imagesRestored = 0;
    for (const [fileName, base64] of Object.entries(backup.images)) {
      try {
        await window.electron?.saveImageBase64?.(fileName, base64);
        imagesRestored++;
      } catch (error) {
        console.warn(`Failed to restore image ${fileName}:`, error);
      }
    }
    console.log(`Restored ${imagesRestored} images`);
  }

  // 恢复 AI 配置
  // Restore AI configuration
  if (backup.aiConfig) {
    restoreAiConfig(backup.aiConfig);
  }

  // 恢复系统设置
  // Restore system settings
  if (backup.settings) {
    restoreSettingsSnapshot(backup.settings);
  }
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
  const storesToClear = [STORES.PROMPTS, STORES.FOLDERS, STORES.VERSIONS].filter(
    store => storeNames.includes(store)
  );

  if (storesToClear.length === 0) {
    console.warn('No stores to clear');
    return;
  }

  const transaction = database.transaction(storesToClear, 'readwrite');

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
    console.log('Images cleared');
  } catch (error) {
    console.warn('Failed to clear images:', error);
  }
}

/**
 * 获取数据库存储位置信息
 * Get database storage location information
 */
export function getDatabaseInfo(): { name: string; description: string } {
  return {
    name: DB_NAME,
    description: '数据存储在浏览器 IndexedDB 中，位于用户数据目录下',
    // Data is stored in browser IndexedDB, located in user data directory
  };
}

/**
 * 下载备份文件
 * Download backup file
 */
export async function downloadBackup(): Promise<void> {
  const backup = await exportDatabase();
  const file: PromptHubFile = { kind: 'prompthub-backup', exportedAt: backup.exportedAt, payload: backup };
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
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
 * 下载压缩的全量备份（.phub.gz）
 * Download compressed full backup (.phub.gz)
 */
export async function downloadCompressedBackup(): Promise<void> {
  const backup = await exportDatabase();
  const file: PromptHubFile = { kind: 'prompthub-backup', exportedAt: backup.exportedAt, payload: backup };
  const gz = await gzipText(JSON.stringify(file));
  const url = URL.createObjectURL(gz);
  const a = document.createElement('a');
  a.href = url;
  a.download = `prompthub-backup-${new Date().toISOString().split('T')[0]}.phub.gz`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 选择性导出（仅导出，不提供导入）
 */
export async function downloadSelectiveExport(scope: ExportScope): Promise<void> {
  const normalized: Required<ExportScope> = {
    prompts: !!scope.prompts,
    folders: !!scope.folders,
    versions: !!scope.versions,
    images: !!scope.images,
    aiConfig: !!scope.aiConfig,
    settings: !!scope.settings,
  };

  const payload: Partial<DatabaseBackup> = {
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
  };

  if (normalized.prompts) payload.prompts = await getAllPrompts();
  if (normalized.folders) payload.folders = await getAllFolders();
  if (normalized.versions) {
    const database = await getDatabase();
    payload.versions = await new Promise<PromptVersion[]>((resolve, reject) => {
      const transaction = database.transaction(STORES.VERSIONS, 'readonly');
      const store = transaction.objectStore(STORES.VERSIONS);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  if (normalized.images) {
    const promptsForImages = payload.prompts || (await getAllPrompts());
    payload.images = await collectImages(promptsForImages);
  }
  if (normalized.aiConfig) payload.aiConfig = getAiConfig();
  if (normalized.settings) {
    const snap = getSettingsSnapshot();
    if (snap) {
      payload.settings = { state: snap.state };
      payload.settingsUpdatedAt = snap.settingsUpdatedAt;
    }
  }

  const file: PromptHubFile = {
    kind: 'prompthub-export',
    exportedAt: payload.exportedAt || new Date().toISOString(),
    scope: normalized,
    payload,
  };

  // 始终使用 gzip 压缩，减少体积并避免用户对 JSON 包含图片的困惑
  const gz = await gzipText(JSON.stringify(file));
  const url = URL.createObjectURL(gz);
  const a = document.createElement('a');
  a.href = url;
  a.download = `prompthub-export-${new Date().toISOString().split('T')[0]}.phub.gz`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 从文件恢复备份
 */
export async function restoreFromFile(file: File): Promise<void> {
  let text: string;
  if (file.name.endsWith('.gz')) {
    text = await gunzipToText(file);
  } else {
    text = await file.text();
  }

  const parsed = JSON.parse(text) as any;

  // 新格式：PromptHubFile
  if (parsed?.kind === 'prompthub-backup') {
    await importDatabase(parsed.payload as DatabaseBackup);
    return;
  }
  if (parsed?.kind === 'prompthub-export') {
    // 选择性导出不支持导入，避免误用造成数据丢失/不完整恢复
    throw new Error('选择性导出文件不支持导入，请使用“全量备份/恢复”文件');
  }

  // 旧格式兼容：直接 DatabaseBackup
  await importDatabase(parsed as DatabaseBackup);
}

/**
 * 从备份数据恢复（用于 WebDAV 同步）
 */
export async function restoreFromBackup(backup: DatabaseBackup): Promise<void> {
  await importDatabase(backup);
}
