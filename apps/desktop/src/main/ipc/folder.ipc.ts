import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@prompthub/shared/constants';
import { FolderDB } from '../database/folder';
import { PromptDB } from '../database/prompt';
import type { CreateFolderDTO, Folder, UpdateFolderDTO } from '@prompthub/shared/types';
import { syncPromptWorkspaceFromDatabase } from "../services/prompt-workspace";

/**
 * Register folder-related IPC handlers
 * 注册文件夹相关 IPC 处理器
 */
export function registerFolderIPC(db: FolderDB, promptDb: PromptDB): void {
  const syncWorkspace = () => {
    syncPromptWorkspaceFromDatabase(promptDb, db);
  };

  // Create folder
  // 创建文件夹
  ipcMain.handle(IPC_CHANNELS.FOLDER_CREATE, async (_event, data: CreateFolderDTO) => {
    const created = db.create(data);
    syncWorkspace();
    return created;
  });

  // Get all folders
  // 获取所有文件夹
  ipcMain.handle(IPC_CHANNELS.FOLDER_GET_ALL, async () => {
    return db.getAll();
  });

  // Update folder
  // 更新文件夹
  ipcMain.handle(IPC_CHANNELS.FOLDER_UPDATE, async (_event, id: string, data: UpdateFolderDTO) => {
    const updated = db.update(id, data);
    if (updated) {
      syncWorkspace();
    }
    return updated;
  });

  // Delete folder
  // 删除文件夹
  ipcMain.handle(IPC_CHANNELS.FOLDER_DELETE, async (_event, id: string) => {
    const deleted = db.delete(id);
    if (deleted) {
      syncWorkspace();
    }
    return deleted;
  });

  // Reorder folders
  // 重新排序文件夹
  ipcMain.handle(IPC_CHANNELS.FOLDER_REORDER, async (_event, ids: string[]) => {
    db.reorder(ids);
    syncWorkspace();
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.FOLDER_INSERT_DIRECT, async (_event, folder: Folder) => {
    db.insertFolderDirect(folder);
    return true;
  });
}
