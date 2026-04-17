import Database from '../database/sqlite';
import { registerPromptIPC } from './prompt.ipc';
import { registerFolderIPC } from './folder.ipc';
import { registerSettingsIPC } from './settings.ipc';
import { registerImageIPC } from './image.ipc';
import { registerSkillIPC } from './skill.ipc';
import { registerAIIPC } from './ai.ipc';
import { PromptDB } from '../database/prompt';
import { FolderDB } from '../database/folder';
import { SkillDB } from '../database/skill';
import { registerSecurityIPC } from './security.ipc';
import { registerBackupIPC } from './backup.ipc';

/**
 * Register all IPC handlers
 * 注册所有 IPC 处理器
 */
export function registerAllIPC(
  db: Database.Database,
  setDbRef: (db: Database.Database) => void,
): void {
  const promptDB = new PromptDB(db);
  const folderDB = new FolderDB(db);
  const skillDB = new SkillDB(db);

  registerPromptIPC(promptDB, folderDB);
  registerFolderIPC(folderDB, promptDB);
  registerSkillIPC(skillDB);
  registerSettingsIPC(db);
  registerSecurityIPC(db);
  registerBackupIPC(setDbRef);
  registerImageIPC();
  registerAIIPC();
}
