import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type {
  Prompt,
  CreatePromptDTO,
  UpdatePromptDTO,
  SearchQuery,
  PromptVersion,
} from '@shared/types';

export class PromptDB {
  constructor(private db: Database.Database) { }

  /**
   * 创建 Prompt
   */
  create(data: CreatePromptDTO): Prompt {
    const id = uuidv4();
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO prompts (
        id, title, description, system_prompt, user_prompt,
        variables, tags, folder_id, images, is_favorite, current_version,
        usage_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.title,
      data.description || null,
      data.systemPrompt || null,
      data.userPrompt,
      JSON.stringify(data.variables || []),
      JSON.stringify(data.tags || []),
      data.folderId || null,
      JSON.stringify(data.images || []),
      now,
      now
    );

    // 创建初始版本
    this.createVersion(id, '初始版本');

    return this.getById(id)!;
  }

  /**
   * 根据 ID 获取 Prompt
   */
  getById(id: string): Prompt | null {
    const stmt = this.db.prepare('SELECT * FROM prompts WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.rowToPrompt(row) : null;
  }

  /**
   * 获取所有 Prompt
   */
  getAll(): Prompt[] {
    const stmt = this.db.prepare('SELECT * FROM prompts ORDER BY updated_at DESC');
    const rows = stmt.all() as any[];
    return rows.map((row) => this.rowToPrompt(row));
  }

  /**
   * 更新 Prompt
   */
  update(id: string, data: UpdatePromptDTO): Prompt | null {
    const prompt = this.getById(id);
    if (!prompt) return null;

    const now = Date.now();
    const updates: string[] = ['updated_at = ?'];
    const values: any[] = [now];

    if (data.title !== undefined) {
      updates.push('title = ?');
      values.push(data.title);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description);
    }
    if (data.systemPrompt !== undefined) {
      updates.push('system_prompt = ?');
      values.push(data.systemPrompt);
    }
    if (data.userPrompt !== undefined) {
      updates.push('user_prompt = ?');
      values.push(data.userPrompt);
    }
    if (data.variables !== undefined) {
      updates.push('variables = ?');
      values.push(JSON.stringify(data.variables));
    }
    if (data.tags !== undefined) {
      updates.push('tags = ?');
      values.push(JSON.stringify(data.tags));
    }
    if (data.folderId !== undefined) {
      updates.push('folder_id = ?');
      values.push(data.folderId);
    }
    if (data.images !== undefined) {
      updates.push('images = ?');
      values.push(JSON.stringify(data.images));
    }
    if (data.isFavorite !== undefined) {
      updates.push('is_favorite = ?');
      values.push(data.isFavorite ? 1 : 0);
    }

    values.push(id);

    const stmt = this.db.prepare(
      `UPDATE prompts SET ${updates.join(', ')} WHERE id = ?`
    );
    stmt.run(...values);

    // 如果内容有变化，创建新版本
    if (data.systemPrompt !== undefined || data.userPrompt !== undefined || data.variables !== undefined) {
      this.createVersion(id);
    }

    return this.getById(id);
  }

  /**
   * 删除 Prompt
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM prompts WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * 搜索 Prompt
   */
  search(query: SearchQuery): Prompt[] {
    let sql = 'SELECT * FROM prompts WHERE 1=1';
    const params: any[] = [];

    if (query.keyword) {
      sql += ' AND id IN (SELECT rowid FROM prompts_fts WHERE prompts_fts MATCH ?)';
      params.push(query.keyword);
    }

    if (query.folderId) {
      sql += ' AND folder_id = ?';
      params.push(query.folderId);
    }

    if (query.isFavorite !== undefined) {
      sql += ' AND is_favorite = ?';
      params.push(query.isFavorite ? 1 : 0);
    }

    if (query.tags && query.tags.length > 0) {
      // 简单的标签匹配
      const tagConditions = query.tags.map(() => 'tags LIKE ?').join(' OR ');
      sql += ` AND (${tagConditions})`;
      params.push(...query.tags.map((tag) => `%"${tag}"%`));
    }

    // 排序
    const sortBy = query.sortBy || 'updatedAt';
    const sortOrder = query.sortOrder || 'desc';
    const sortColumn = {
      title: 'title',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      usageCount: 'usage_count',
    }[sortBy];
    sql += ` ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}`;

    // 分页
    if (query.limit) {
      sql += ' LIMIT ?';
      params.push(query.limit);
      if (query.offset) {
        sql += ' OFFSET ?';
        params.push(query.offset);
      }
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    return rows.map((row) => this.rowToPrompt(row));
  }

  /**
   * 增加使用次数
   */
  incrementUsage(id: string): void {
    const stmt = this.db.prepare(
      'UPDATE prompts SET usage_count = usage_count + 1 WHERE id = ?'
    );
    stmt.run(id);
  }

  /**
   * 创建版本
   */
  createVersion(promptId: string, note?: string): PromptVersion | null {
    const prompt = this.getById(promptId);
    if (!prompt) return null;

    const id = uuidv4();
    const version = prompt.currentVersion;
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO prompt_versions (
        id, prompt_id, version, system_prompt, user_prompt, variables, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      promptId,
      version,
      prompt.systemPrompt || null,
      prompt.userPrompt,
      JSON.stringify(prompt.variables),
      note || null,
      now
    );

    // 更新当前版本号
    this.db.prepare('UPDATE prompts SET current_version = current_version + 1 WHERE id = ?').run(promptId);

    return {
      id,
      promptId,
      version,
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      variables: prompt.variables,
      note,
      createdAt: new Date(now).toISOString(),
    };
  }

  /**
   * 获取所有版本
   */
  getVersions(promptId: string): PromptVersion[] {
    const stmt = this.db.prepare(
      'SELECT * FROM prompt_versions WHERE prompt_id = ? ORDER BY version DESC'
    );
    const rows = stmt.all(promptId) as any[];
    return rows.map((row) => this.rowToVersion(row));
  }

  /**
   * 回滚到指定版本
   */
  rollback(promptId: string, version: number): Prompt | null {
    const stmt = this.db.prepare(
      'SELECT * FROM prompt_versions WHERE prompt_id = ? AND version = ?'
    );
    const row = stmt.get(promptId, version) as any;
    if (!row) return null;

    const versionData = this.rowToVersion(row);

    return this.update(promptId, {
      systemPrompt: versionData.systemPrompt,
      userPrompt: versionData.userPrompt,
      variables: versionData.variables,
    });
  }

  /**
   * 数据库行转 Prompt 对象
   */
  private rowToPrompt(row: any): Prompt {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      systemPrompt: row.system_prompt,
      userPrompt: row.user_prompt,
      variables: JSON.parse(row.variables || '[]'),
      tags: JSON.parse(row.tags || '[]'),
      folderId: row.folder_id,
      images: JSON.parse(row.images || '[]'),
      isFavorite: row.is_favorite === 1,
      version: row.current_version,
      currentVersion: row.current_version,
      usageCount: row.usage_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * 数据库行转 PromptVersion 对象
   */
  private rowToVersion(row: any): PromptVersion {
    return {
      id: row.id,
      promptId: row.prompt_id,
      version: row.version,
      systemPrompt: row.system_prompt,
      userPrompt: row.user_prompt,
      variables: JSON.parse(row.variables || '[]'),
      note: row.note,
      createdAt: row.created_at,
    };
  }
}
