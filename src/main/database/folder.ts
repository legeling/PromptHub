import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { Folder, CreateFolderDTO, UpdateFolderDTO } from '@shared/types';

export class FolderDB {
  constructor(private db: Database.Database) {}

  /**
   * Create folder
   * 创建文件夹
   */
  create(data: CreateFolderDTO): Folder {
    const id = uuidv4();
    const now = Date.now();

    // Get maximum sort order
    // 获取最大排序值
    const maxOrder = this.db
      .prepare('SELECT MAX(sort_order) as max FROM folders WHERE parent_id IS ?')
      .get(data.parentId || null) as { max: number | null };

    const order = (maxOrder?.max ?? -1) + 1;

    const stmt = this.db.prepare(`
      INSERT INTO folders (id, name, icon, parent_id, sort_order, is_private, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.name,
      data.icon || null,
      data.parentId || null,
      order,
      data.isPrivate ? 1 : 0,
      now,
      now
    );

    return this.getById(id)!;
  }

  /**
   * Get folder by ID
   * 根据 ID 获取文件夹
   */
  getById(id: string): Folder | null {
    const stmt = this.db.prepare('SELECT * FROM folders WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.rowToFolder(row) : null;
  }

  /**
   * Get all folders
   * 获取所有文件夹
   */
  getAll(): Folder[] {
    const stmt = this.db.prepare('SELECT * FROM folders ORDER BY sort_order ASC');
    const rows = stmt.all() as any[];
    return rows.map((row) => this.rowToFolder(row));
  }

  /**
   * Update folder
   * 更新文件夹
   * Performance optimized: Builds return object in memory instead of re-querying
   * 性能优化：在内存中构建返回对象，而不是重新查询
   */
  update(id: string, data: UpdateFolderDTO): Folder | null {
    const existingFolder = this.getById(id);
    if (!existingFolder) return null;

    const updates: string[] = [];
    const values: any[] = [];
    const now = Date.now();

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.icon !== undefined) {
      updates.push('icon = ?');
      values.push(data.icon);
    }
    if (data.parentId !== undefined) {
      updates.push('parent_id = ?');
      values.push(data.parentId);
    }
    if (data.order !== undefined) {
      updates.push('sort_order = ?');
      values.push(data.order);
    }
    if (data.isPrivate !== undefined) {
      updates.push('is_private = ?');
      values.push(data.isPrivate ? 1 : 0);
    }
    updates.push('updated_at = ?');
    values.push(now);

    if (updates.length === 1) return existingFolder; // Only updated_at, no actual changes

    values.push(id);

    const stmt = this.db.prepare(
      `UPDATE folders SET ${updates.join(', ')} WHERE id = ?`
    );
    stmt.run(...values);

    // Build updated folder in memory instead of re-querying (performance optimization)
    // 在内存中构建更新后的 folder 对象，而不是重新查询（性能优化）
    // Note: updatedAt is stored as number in DB but typed as string - using 'as any' for compatibility
    // 注意：updatedAt 在数据库中存储为数字但类型定义为字符串 - 使用 'as any' 保持兼容
    const updatedFolder: Folder = {
      ...existingFolder,
      updatedAt: now as any,
      ...(data.name !== undefined && { name: data.name }),
      ...(data.icon !== undefined && { icon: data.icon }),
      ...(data.parentId !== undefined && { parentId: data.parentId }),
      ...(data.order !== undefined && { order: data.order }),
      ...(data.isPrivate !== undefined && { isPrivate: data.isPrivate }),
    };

    return updatedFolder;
  }

  /**
   * Delete folder
   * 删除文件夹
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM folders WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Reorder folders
   * 重新排序文件夹
   */
  reorder(ids: string[]): void {
    const stmt = this.db.prepare('UPDATE folders SET sort_order = ? WHERE id = ?');
    const transaction = this.db.transaction(() => {
      ids.forEach((id, index) => {
        stmt.run(index, id);
      });
    });
    transaction();
  }

  /**
   * Convert database row to Folder object
   * 数据库行转 Folder 对象
   */
  private rowToFolder(row: any): Folder {
    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      parentId: row.parent_id,
      order: row.sort_order,
      isPrivate: !!row.is_private,
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at,
    };
  }
}
