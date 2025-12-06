import Database from 'better-sqlite3';
import { registerPromptIPC } from './prompt.ipc';
import { registerFolderIPC } from './folder.ipc';
import { registerSettingsIPC } from './settings.ipc';
import { registerImageIPC } from './image.ipc';
import { PromptDB } from '../database/prompt';
import { FolderDB } from '../database/folder';

/**
 * 注册所有 IPC 处理器
 */
export function registerAllIPC(db: Database.Database): void {
  const promptDB = new PromptDB(db);
  const folderDB = new FolderDB(db);

  registerPromptIPC(promptDB);
  registerFolderIPC(folderDB);
  registerSettingsIPC(db);
  registerImageIPC();
}
