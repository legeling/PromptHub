import { ipcMain } from 'electron';
import Database from 'better-sqlite3';
import { IPC_CHANNELS } from '../../shared/constants';
import type { Settings } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';

/**
 * Get minimizeOnLaunch setting from database
 * 从数据库读取启动时最小化设置
 * @param db Database instance
 * @returns boolean - whether to minimize on launch
 */
export function getMinimizeOnLaunchSetting(db: Database.Database): boolean {
  try {
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    const row = stmt.get('minimizeOnLaunch') as { value: string } | undefined;
    if (row) {
      return JSON.parse(row.value) === true;
    }
  } catch (e) {
    console.error('Failed to read minimizeOnLaunch setting:', e);
  }
  return false; // Default to false
}

/**
 * Register settings-related IPC handlers
 * 注册设置相关 IPC 处理器
 */
export function registerSettingsIPC(db: Database.Database): void {
  // Get settings
  // 获取设置
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => {
    const settings: Settings = { ...DEFAULT_SETTINGS };

    const stmt = db.prepare('SELECT key, value FROM settings');
    const rows = stmt.all() as { key: string; value: string }[];

    for (const row of rows) {
      try {
        (settings as any)[row.key] = JSON.parse(row.value);
      } catch {
        (settings as any)[row.key] = row.value;
      }
    }

    return settings;
  });

  // Save settings
  // 保存设置
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, async (_event, newSettings: Partial<Settings>) => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
    `);

    const transaction = db.transaction(() => {
      for (const [key, value] of Object.entries(newSettings)) {
        stmt.run(key, JSON.stringify(value));
      }
    });

    transaction();
    return true;
  });
}
