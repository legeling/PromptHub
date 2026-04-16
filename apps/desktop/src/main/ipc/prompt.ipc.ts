import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@prompthub/shared/constants';
import { PromptDB } from '../database/prompt';
import { FolderDB } from '../database/folder';
import type {
  CreatePromptDTO,
  Prompt,
  PromptVersion,
  SearchQuery,
  UpdatePromptDTO,
} from '@prompthub/shared/types';
import { syncPromptWorkspaceFromDatabase } from "../services/prompt-workspace";

/**
 * Register Prompt-related IPC handlers
 * 注册 Prompt 相关 IPC 处理器
 */
export function registerPromptIPC(db: PromptDB, folderDb: FolderDB): void {
  const syncWorkspace = () => {
    syncPromptWorkspaceFromDatabase(db, folderDb);
  };

  // Create Prompt
  // 创建 Prompt
  ipcMain.handle(IPC_CHANNELS.PROMPT_CREATE, async (_, data: CreatePromptDTO) => {
    const created = db.create(data);
    syncWorkspace();
    return created;
  });

  // Get single Prompt
  // 获取单个 Prompt
  ipcMain.handle(IPC_CHANNELS.PROMPT_GET, async (_, id: string) => {
    return db.getById(id);
  });

  // Get all Prompts
  // 获取所有 Prompt
  ipcMain.handle(IPC_CHANNELS.PROMPT_GET_ALL, async () => {
    return db.getAll();
  });

  // Update Prompt
  // 更新 Prompt
  ipcMain.handle(IPC_CHANNELS.PROMPT_UPDATE, async (_, id: string, data: UpdatePromptDTO) => {
    const updated = db.update(id, data);
    if (updated) {
      syncWorkspace();
    }
    return updated;
  });

  // Delete Prompt
  // 删除 Prompt
  ipcMain.handle(IPC_CHANNELS.PROMPT_DELETE, async (_, id: string) => {
    const deleted = db.delete(id);
    if (deleted) {
      syncWorkspace();
    }
    return deleted;
  });

  // Search Prompts
  // 搜索 Prompt
  ipcMain.handle(IPC_CHANNELS.PROMPT_SEARCH, async (_, query: SearchQuery) => {
    return db.search(query);
  });

  // Copy Prompt (after variable replacement)
  // 复制 Prompt（替换变量后）
  ipcMain.handle(
    IPC_CHANNELS.PROMPT_COPY,
    async (_, id: string, variables: Record<string, string>) => {
      const prompt = db.getById(id);
      if (!prompt) return null;

      // Replace variables
      // 替换变量
      let content = prompt.userPrompt;
      for (const [key, value] of Object.entries(variables)) {
        content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      }

      // Update usage count
      // 更新使用次数
      db.incrementUsage(id);

      return content;
    }
  );

  ipcMain.handle(IPC_CHANNELS.PROMPT_INSERT_DIRECT, async (_, prompt: Prompt) => {
    db.insertPromptDirect(prompt);
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.PROMPT_SYNC_WORKSPACE, async () => {
    syncWorkspace();
    return true;
  });

  // Get all versions
  // 获取所有版本
  ipcMain.handle(IPC_CHANNELS.VERSION_GET_ALL, async (_, promptId: string) => {
    return db.getVersions(promptId);
  });

  // Create version
  // 创建版本
  ipcMain.handle(IPC_CHANNELS.VERSION_CREATE, async (_, promptId: string, note?: string) => {
    const created = db.createVersion(promptId, note);
    syncWorkspace();
    return created;
  });

  // Rollback version
  // 回滚版本
  ipcMain.handle(IPC_CHANNELS.VERSION_ROLLBACK, async (_, promptId: string, version: number) => {
    const rolledBack = db.rollback(promptId, version);
    if (rolledBack) {
      syncWorkspace();
    }
    return rolledBack;
  });

  ipcMain.handle(IPC_CHANNELS.VERSION_DELETE, async (_, versionId: string) => {
    const deleted = db.deleteVersion(versionId);
    if (deleted) {
      syncWorkspace();
    }
    return deleted;
  });

  ipcMain.handle(IPC_CHANNELS.VERSION_INSERT_DIRECT, async (_, version: PromptVersion) => {
    db.insertVersionDirect(version);
    return true;
  });
}
