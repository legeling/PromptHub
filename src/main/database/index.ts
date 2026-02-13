import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import { SCHEMA } from './schema';

let db: Database.Database | null = null;

/**
 * Get database file path
 * 获取数据库文件路径
 */
function getDbPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'prompthub.db');
}

/**
 * Initialize database
 * 初始化数据库
 */
export function initDatabase(): Database.Database {
  if (db) return db;

  const dbPath = getDbPath();
  db = new Database(dbPath);

  // Enable foreign key constraints
  // 启用外键约束
  db.pragma('foreign_keys = ON');

  // Create table schema
  // 创建表结构
  db.exec(SCHEMA);

  // Migration: check if prompts table has images column
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

  // Migration: check if folders table has is_private and updated_at columns
  // 迁移：检查 folders 表是否有 is_private 和 updated_at 字段
  try {
    const folderInfo = db.pragma('table_info(folders)') as any[];
    const hasIsPrivate = folderInfo.some(col => col.name === 'is_private');
    if (!hasIsPrivate) {
      console.log('Migrating: Adding is_private column to folders table');
      db.prepare('ALTER TABLE folders ADD COLUMN is_private INTEGER DEFAULT 0').run();
    }
    const hasUpdatedAt = folderInfo.some(col => col.name === 'updated_at');
    if (!hasUpdatedAt) {
      console.log('Migrating: Adding updated_at column to folders table');
      db.prepare('ALTER TABLE folders ADD COLUMN updated_at INTEGER').run();
    }
  } catch (error) {
    console.error('Migration (folders) failed:', error);
  }

  // Migration: check if prompts table has is_pinned column
  // 迁移：检查 prompts 表是否有 is_pinned 字段
  try {
    const tableInfo = db.pragma('table_info(prompts)') as any[];
    const hasIsPinned = tableInfo.some(col => col.name === 'is_pinned');
    if (!hasIsPinned) {
      console.log('Migrating: Adding is_pinned column to prompts table');
      db.prepare('ALTER TABLE prompts ADD COLUMN is_pinned INTEGER DEFAULT 0').run();
    }
  } catch (error) {
    console.error('Migration (is_pinned) failed:', error);
  }

  // Migration: check if prompts table has source column
  // 迁移：检查 prompts 表是否有 source 字段
  try {
    const tableInfo = db.pragma('table_info(prompts)') as any[];
    const hasSource = tableInfo.some(col => col.name === 'source');
    if (!hasSource) {
      console.log('Migrating: Adding source column to prompts table');
      db.prepare('ALTER TABLE prompts ADD COLUMN source TEXT').run();
    }
  } catch (error) {
    console.error('Migration (source) failed:', error);
  }

  // Migration: check if prompts table has notes column
  // 迁移：检查 prompts 表是否有 notes 字段
  try {
    const tableInfo = db.pragma('table_info(prompts)') as any[];
    const hasNotes = tableInfo.some(col => col.name === 'notes');
    if (!hasNotes) {
      console.log('Migrating: Adding notes column to prompts table');
      db.prepare('ALTER TABLE prompts ADD COLUMN notes TEXT').run();
    }
  } catch (error) {
    console.error('Migration (notes) failed:', error);
  }

  // Migration: check if skills table has skill store columns
  // 迁移：检查 skills 表是否有技能商店相关字段
  try {
    const skillInfo = db.pragma('table_info(skills)') as any[];
    const skillColumns = skillInfo.map(col => col.name);

    const newColumns: { name: string; type: string }[] = [
      { name: 'source_url', type: 'TEXT' },
      { name: 'icon_url', type: 'TEXT' },
      { name: 'icon_emoji', type: 'TEXT' },
      { name: 'category', type: "TEXT DEFAULT 'general'" },
      { name: 'is_builtin', type: 'INTEGER DEFAULT 0' },
      { name: 'registry_slug', type: 'TEXT' },
      { name: 'content_url', type: 'TEXT' },
      { name: 'prerequisites', type: 'TEXT' },
      { name: 'compatibility', type: 'TEXT' },
    ];

    for (const col of newColumns) {
      if (!skillColumns.includes(col.name)) {
        console.log(`Migrating: Adding ${col.name} column to skills table`);
        db.prepare(`ALTER TABLE skills ADD COLUMN ${col.name} ${col.type}`).run();
      }
    }
  } catch (error) {
    console.error('Migration (skills store columns) failed:', error);
  }

  console.log(`Database initialized at: ${dbPath}`);
  return db;
}

/**
 * Get database instance
 * 获取数据库实例
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

/**
 * Close database connection
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export { db };
