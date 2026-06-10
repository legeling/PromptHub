import Database from "./adapter";
import { v4 as uuidv4 } from "uuid";
import type {
  Folder,
  FolderVisibility,
  CreateFolderDTO,
  UpdateFolderDTO,
} from "@prompthub/shared/types";

interface FolderRow {
  id: string;
  owner_user_id: string | null;
  visibility: string;
  name: string;
  icon: string | null;
  parent_id: string | null;
  sort_order: number;
  is_private: number;
  created_at: number;
  updated_at: number;
}

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
      .prepare(
        "SELECT MAX(sort_order) as max FROM folders WHERE parent_id IS ?",
      )
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
      now,
    );

    return this.getById(id)!;
  }

  /**
   * Get folder by ID
   * 根据 ID 获取文件夹
   */
  getById(id: string): Folder | null {
    const stmt = this.db.prepare("SELECT * FROM folders WHERE id = ?");
    const row = stmt.get(id) as FolderRow | undefined;
    return row ? this.rowToFolder(row) : null;
  }

  /**
   * Get all folders
   * 获取所有文件夹
   */
  getAll(): Folder[] {
    const stmt = this.db.prepare(
      "SELECT * FROM folders ORDER BY sort_order ASC",
    );
    const rows = stmt.all() as FolderRow[];
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
      updates.push("name = ?");
      values.push(data.name);
    }
    if (data.icon !== undefined) {
      updates.push("icon = ?");
      values.push(data.icon);
    }
    if (data.parentId !== undefined) {
      updates.push("parent_id = ?");
      values.push(data.parentId);
    }
    if (data.order !== undefined) {
      updates.push("sort_order = ?");
      values.push(data.order);
    }
    if (data.isPrivate !== undefined) {
      updates.push("is_private = ?");
      values.push(data.isPrivate ? 1 : 0);
    }
    updates.push("updated_at = ?");
    values.push(now);

    if (updates.length === 1) return existingFolder; // Only updated_at, no actual changes

    values.push(id);

    const stmt = this.db.prepare(
      `UPDATE folders SET ${updates.join(", ")} WHERE id = ?`,
    );
    stmt.run(...values);

    // Build updated folder in memory instead of re-querying (performance optimization)
    // 在内存中构建更新后的 folder 对象，而不是重新查询（性能优化）
    const updatedFolder: Folder = {
      ...existingFolder,
      updatedAt: new Date(now).toISOString(),
      ...(data.name !== undefined && { name: data.name }),
      ...(data.icon !== undefined && { icon: data.icon }),
      ...(data.parentId !== undefined && { parentId: data.parentId ?? undefined }),
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
    const stmt = this.db.prepare("DELETE FROM folders WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Reorder folders
   * 重新排序文件夹
   */
  reorder(ids: string[]): void {
    const stmt = this.db.prepare(
      "UPDATE folders SET sort_order = ? WHERE id = ?",
    );
    const transaction = this.db.transaction(() => {
      ids.forEach((id, index) => {
        stmt.run(index, id);
      });
    });
    transaction();
  }

  insertFolderDirect(folder: Folder): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO folders (
          id, name, icon, parent_id, sort_order, is_private, created_at, updated_at
        ) VALUES (
          @id, @name, @icon, @parent_id, @sort_order, @is_private, @created_at, @updated_at
        )`,
      )
      .run({
        "@id": folder.id,
        "@name": folder.name,
        "@icon": folder.icon ?? null,
        "@parent_id": folder.parentId ?? null,
        "@sort_order": folder.order ?? 0,
        "@is_private": folder.isPrivate ? 1 : 0,
        "@created_at": folder.createdAt
          ? new Date(folder.createdAt).getTime()
          : Date.now(),
        "@updated_at": folder.updatedAt
          ? new Date(folder.updatedAt).getTime()
          : Date.now(),
      });
  }

  /**
   * Convert database row to Folder object
   * 数据库行转 Folder 对象
   */
  private rowToFolder(row: FolderRow): Folder {
    return {
      id: row.id,
      ownerUserId: row.owner_user_id ?? undefined,
      visibility: (row.visibility as FolderVisibility) ?? "private",
      name: row.name,
      icon: row.icon ?? undefined,
      parentId: row.parent_id ?? undefined,
      order: row.sort_order,
      isPrivate: !!row.is_private,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at || row.created_at).toISOString(),
    };
  }
}
