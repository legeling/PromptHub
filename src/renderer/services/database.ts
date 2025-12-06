/**
 * IndexedDB 数据库服务
 * 使用 IndexedDB 存储数据，支持备份、恢复和迁移
 */

import type { Prompt, PromptVersion, Folder } from '../../shared/types';

const DB_NAME = 'PromptHubDB';
const DB_VERSION = 1;

// 预制数据
const SEED_PROMPTS: Prompt[] = [
  // ========== 开发类 ==========
  {
    id: 'seed-1',
    title: '代码审查专家',
    description: '专业代码审查，发现问题并给出改进建议',
    folderId: 'folder-dev',
    systemPrompt: '你是一位资深软件工程师，专注于代码质量和最佳实践。你的审查风格严谨但友好，会解释每个建议背后的原因。',
    userPrompt: '请审查以下 {{language}} 代码：\n\n```{{language}}\n{{code}}\n```\n\n请从以下方面进行审查：\n1. **代码质量**：命名规范、代码结构、可读性\n2. **潜在问题**：Bug、边界情况、异常处理\n3. **性能优化**：时间复杂度、内存使用、潜在瓶颈\n4. **安全隐患**：输入验证、数据安全\n5. **改进建议**：具体的优化方案和代码示例',
    variables: [],
    tags: ['开发', '代码审查'],
    isFavorite: true,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-2',
    title: '代码解释器',
    description: '逐行解释代码逻辑，适合学习和理解复杂代码',
    folderId: 'folder-dev',
    systemPrompt: '你是一位耐心的编程导师，擅长将复杂的代码逻辑用简单易懂的方式解释清楚。',
    userPrompt: '请详细解释以下代码的功能和工作原理：\n\n```\n{{code}}\n```\n\n请包含：\n1. 代码整体功能概述\n2. 逐行或逐块详细解释\n3. 关键算法/设计模式说明\n4. 输入输出示例',
    variables: [],
    tags: ['开发', '学习'],
    isFavorite: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-3',
    title: 'SQL 查询优化',
    description: '分析并优化 SQL 查询性能',
    folderId: 'folder-dev',
    systemPrompt: '你是一位数据库性能优化专家，精通各种 SQL 优化技巧和索引策略。',
    userPrompt: '请分析并优化以下 SQL 查询：\n\n```sql\n{{sql}}\n```\n\n表结构信息（如有）：\n{{schema}}\n\n请提供：\n1. 性能问题分析\n2. 优化后的 SQL\n3. 建议的索引策略\n4. 预期性能提升',
    variables: [],
    tags: ['开发', 'SQL', '性能优化'],
    isFavorite: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-4',
    title: 'Git Commit 信息生成',
    description: '根据代码变更生成规范的 commit 信息',
    folderId: 'folder-dev',
    systemPrompt: '你是一位遵循 Conventional Commits 规范的开发者。',
    userPrompt: '请根据以下代码变更生成规范的 Git commit 信息：\n\n```diff\n{{diff}}\n```\n\n要求：\n1. 遵循 Conventional Commits 格式：type(scope): description\n2. type 可选：feat/fix/docs/style/refactor/test/chore\n3. 描述简洁明了，不超过 50 字符\n4. 如需要，添加详细的 body 说明',
    variables: [],
    tags: ['开发', 'Git'],
    isFavorite: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  // ========== 写作类 ==========
  {
    id: 'seed-5',
    title: '文章润色大师',
    description: '优化文章表达，提升文章质量和可读性',
    folderId: 'folder-writing',
    systemPrompt: '你是一位资深编辑，擅长在保持作者原意的基础上优化文章表达，使其更加流畅、专业。',
    userPrompt: '请帮我润色以下文章：\n\n{{content}}\n\n润色要求：\n- 保持原文核心观点和风格\n- 优化语言表达，使其更加流畅自然\n- 修正语法和标点错误\n- 提升逻辑连贯性\n\n请先给出修改后的版本，然后列出主要修改点。',
    variables: [],
    tags: ['写作', '润色'],
    isFavorite: true,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-6',
    title: '周报/日报生成器',
    description: '根据工作内容快速生成结构化周报',
    folderId: 'folder-writing',
    systemPrompt: '你是一位职场写作专家，擅长将零散的工作内容整理成结构清晰、重点突出的工作汇报。',
    userPrompt: '请根据以下工作内容生成一份{{type}}：\n\n{{tasks}}\n\n要求：\n1. 分类整理（已完成/进行中/计划中）\n2. 突出重点成果和数据\n3. 说明遇到的问题和解决方案\n4. 下一步计划\n5. 语言简洁专业',
    variables: [],
    tags: ['写作', '职场'],
    isFavorite: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-7',
    title: '邮件撰写助手',
    description: '快速生成专业得体的商务邮件',
    folderId: 'folder-writing',
    systemPrompt: '你是一位商务沟通专家，擅长撰写简洁、专业、得体的商务邮件。',
    userPrompt: '请帮我撰写一封{{purpose}}的邮件：\n\n收件人：{{recipient}}\n主要内容：{{content}}\n语气要求：{{tone}}\n\n请生成邮件标题和正文。',
    variables: [],
    tags: ['写作', '邮件', '职场'],
    isFavorite: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  // ========== 翻译类 ==========
  {
    id: 'seed-8',
    title: '专业翻译',
    description: '精准的多语言翻译，保留原文风格',
    folderId: 'folder-translate',
    systemPrompt: '你是一位专业翻译，精通中、英、日、韩等多国语言。翻译时注重准确传达原文含义、语气和文化背景。',
    userPrompt: '请将以下{{source_lang}}文本翻译成{{target_lang}}：\n\n{{text}}\n\n翻译要求：\n- 准确传达原意\n- 符合目标语言表达习惯\n- 保持原文风格和语气',
    variables: [],
    tags: ['翻译'],
    isFavorite: true,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-9',
    title: '技术文档翻译',
    description: '专业技术文档翻译，保留术语准确性',
    folderId: 'folder-translate',
    systemPrompt: '你是一位技术文档翻译专家，熟悉软件开发、云计算、人工智能等领域的专业术语。翻译时保持技术术语的准确性和一致性。',
    userPrompt: '请将以下技术文档从{{source_lang}}翻译成{{target_lang}}：\n\n{{text}}\n\n要求：\n- 技术术语保持准确\n- 代码和命令保持原样\n- 可以添加译注说明关键术语',
    variables: [],
    tags: ['翻译', '技术文档'],
    isFavorite: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  // ========== 学习类 ==========
  {
    id: 'seed-10',
    title: '概念解释器',
    description: '用简单的语言解释复杂概念',
    folderId: 'folder-learning',
    systemPrompt: '你是一位优秀的教育者，擅长用简单、生动的方式解释复杂概念，善于使用类比和实例。',
    userPrompt: '请用通俗易懂的方式解释以下概念：\n\n{{concept}}\n\n要求：\n1. 先给出简明定义\n2. 用生活中的例子类比\n3. 说明实际应用场景\n4. 列出相关概念\n5. 适合{{level}}理解',
    variables: [],
    tags: ['学习', '解释'],
    isFavorite: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-11',
    title: '学习计划制定',
    description: '制定系统的学习计划和路线图',
    folderId: 'folder-learning',
    systemPrompt: '你是一位学习规划专家，擅长根据学习者的背景和目标制定切实可行的学习计划。',
    userPrompt: '请帮我制定{{subject}}的学习计划：\n\n当前水平：{{current_level}}\n目标：{{goal}}\n可用时间：{{time}}\n\n请提供：\n1. 学习路线图\n2. 推荐资源（书籍/课程/项目）\n3. 阶段性目标和里程碑\n4. 学习方法建议\n5. 常见误区提醒',
    variables: [],
    tags: ['学习', '规划'],
    isFavorite: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  // ========== AI/ChatGPT ==========
  {
    id: 'seed-12',
    title: '角色扮演模板',
    description: '让 AI 扮演特定角色进行对话',
    folderId: 'folder-ai',
    systemPrompt: '{{role_description}}',
    userPrompt: '{{task}}',
    variables: [],
    tags: ['AI', '角色扮演'],
    isFavorite: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-13',
    title: '思维链分析',
    description: '引导 AI 进行深度思考和推理',
    folderId: 'folder-ai',
    systemPrompt: '你是一位逻辑分析专家。解答问题时，请展示完整的思维过程：先分析问题，列出关键信息，逐步推理，最后给出结论。',
    userPrompt: '请深入分析以下问题：\n\n{{question}}\n\n请按以下步骤思考：\n1. **理解问题**：明确问题的核心是什么\n2. **收集信息**：列出相关的已知条件\n3. **逻辑推理**：一步步分析\n4. **得出结论**：给出最终答案\n5. **验证检查**：确认答案的合理性',
    variables: [],
    tags: ['AI', '分析', '推理'],
    isFavorite: true,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-14',
    title: '文本摘要',
    description: '快速提炼长文章的核心要点',
    folderId: 'folder-ai',
    systemPrompt: '你是一位信息提炼专家，擅长从长篇内容中准确提取核心信息。',
    userPrompt: '请为以下内容生成摘要：\n\n{{content}}\n\n要求：\n1. 摘要长度：{{length}}\n2. 突出核心观点和关键数据\n3. 保持客观中立\n4. 结构化呈现（如适用）',
    variables: [],
    tags: ['AI', '摘要'],
    isFavorite: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const SEED_FOLDERS: Folder[] = [
  { id: 'folder-dev', name: '开发工具', icon: '�', order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'folder-writing', name: '写作助手', icon: '✍️', order: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'folder-translate', name: '翻译工具', icon: '🌐', order: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'folder-learning', name: '学习成长', icon: '📚', order: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'folder-ai', name: 'AI 技巧', icon: '🤖', order: 4, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
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
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.FOLDERS, 'readwrite');
    const store = transaction.objectStore(STORES.FOLDERS);

    updates.forEach(({ id, order }) => {
      const request = store.get(id);
      request.onsuccess = () => {
        const folder = request.result;
        if (folder) {
          folder.order = order;
          store.put(folder);
        }
      };
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
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
