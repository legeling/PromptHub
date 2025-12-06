import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import { SCHEMA } from './schema';

let db: Database.Database | null = null;

/**
 * 获取数据库文件路径
 */
function getDbPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'prompthub.db');
}

/**
 * 初始化数据库
 */
export function initDatabase(): Database.Database {
  if (db) return db;

  const dbPath = getDbPath();
  db = new Database(dbPath);

  // 启用外键约束
  db.pragma('foreign_keys = ON');

  // 创建表结构
  db.exec(SCHEMA);

  // 迁移：检查 prompts 表是否有 images 字段
  try {
    const tableInfo = db.pragma('table_info(prompts)') as any[];
    const hasImages = tableInfo.some(col => col.name === 'images');
    if (!hasImages) {
      console.log('Migrating: Adding images column to prompts table');
      db.prepare('ALTER TABLE prompts ADD COLUMN images TEXT').run();
    }
  } catch (error) {
    console.error('Migration failed:', error);
  }

  console.log(`Database initialized at: ${dbPath}`);
  return db;
}

/**
 * 获取数据库实例
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export { db };
