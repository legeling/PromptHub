import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type {
  Skill,
  CreateSkillParams,
  UpdateSkillParams,
} from '@shared/types';

export class SkillDB {
  constructor(private db: Database.Database) { }

  /**
   * Get Skill by name (case-insensitive)
   * 根据名称获取 Skill（不区分大小写）
   */
  getByName(name: string): Skill | null {
    const stmt = this.db.prepare('SELECT * FROM skills WHERE LOWER(name) = LOWER(?)');
    const row = stmt.get(name) as any;
    return row ? this.rowToSkill(row) : null;
  }

  /**
   * Create Skill
   * 创建 Skill
   */
  create(data: CreateSkillParams): Skill {
    // Check for duplicate name
    // 检查重复名称
    const existing = this.getByName(data.name);
    if (existing) {
      throw new Error(`Skill "${data.name}" already exists`);
    }

    const id = uuidv4();
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO skills (
        id, name, description, content, mcp_config,
        protocol_type, version, author, tags, is_favorite,
        source_url, icon_url, icon_emoji, category, is_builtin,
        registry_slug, content_url, prerequisites, compatibility,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.name,
      data.description || null,
      data.content || data.instructions || null, // Prioritize content, fallback to instructions
      data.mcp_config || null,
      data.protocol_type || 'mcp',
      data.version || '1.0.0',
      data.author || 'User',
      JSON.stringify(data.tags || []),
      data.is_favorite ? 1 : 0,
      data.source_url || null,
      data.icon_url || null,
      data.icon_emoji || null,
      data.category || 'general',
      data.is_builtin ? 1 : 0,
      data.registry_slug || null,
      data.content_url || null,
      data.prerequisites ? JSON.stringify(data.prerequisites) : null,
      data.compatibility ? JSON.stringify(data.compatibility) : null,
      now,
      now
    );

    return this.getById(id)!;
  }

  /**
   * Get Skill by ID
   * 根据 ID 获取 Skill
   */
  getById(id: string): Skill | null {
    const stmt = this.db.prepare('SELECT * FROM skills WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.rowToSkill(row) : null;
  }

  /**
   * Get all Skills
   * 获取所有 Skill
   */
  getAll(): Skill[] {
    const stmt = this.db.prepare('SELECT * FROM skills ORDER BY updated_at DESC');
    const rows = stmt.all() as any[];
    return rows.map((row) => this.rowToSkill(row));
  }

  /**
   * Update Skill
   * 更新 Skill
   * Performance optimized: Builds return object in memory instead of re-querying
   * 性能优化：在内存中构建返回对象，而不是重新查询
   */
  update(id: string, data: UpdateSkillParams): Skill | null {
    const existingSkill = this.getById(id);
    if (!existingSkill) return null;

    const now = Date.now();
    const updates: string[] = ['updated_at = ?'];
    const values: any[] = [now];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description);
    }
    // Handle both content and instructions (instructions syncs to content)
    // 处理 content 和 instructions（instructions 同步到 content）
    if (data.instructions !== undefined) {
      updates.push('content = ?');
      values.push(data.instructions);
    } else if (data.content !== undefined) {
      updates.push('content = ?');
      values.push(data.content);
    }
    if (data.mcp_config !== undefined) {
      updates.push('mcp_config = ?');
      values.push(data.mcp_config);
    }
    if (data.protocol_type !== undefined) {
      updates.push('protocol_type = ?');
      values.push(data.protocol_type);
    }
    if (data.version !== undefined) {
      updates.push('version = ?');
      values.push(data.version);
    }
    if (data.author !== undefined) {
      updates.push('author = ?');
      values.push(data.author);
    }
    if (data.tags !== undefined) {
      updates.push('tags = ?');
      values.push(JSON.stringify(data.tags));
    }
    if (data.is_favorite !== undefined) {
      updates.push('is_favorite = ?');
      values.push(data.is_favorite ? 1 : 0);
    }
    if (data.source_url !== undefined) {
      updates.push('source_url = ?');
      values.push(data.source_url);
    }
    if (data.icon_url !== undefined) {
      updates.push('icon_url = ?');
      values.push(data.icon_url);
    }
    if (data.icon_emoji !== undefined) {
      updates.push('icon_emoji = ?');
      values.push(data.icon_emoji);
    }
    if (data.category !== undefined) {
      updates.push('category = ?');
      values.push(data.category);
    }
    if (data.is_builtin !== undefined) {
      updates.push('is_builtin = ?');
      values.push(data.is_builtin ? 1 : 0);
    }
    if (data.registry_slug !== undefined) {
      updates.push('registry_slug = ?');
      values.push(data.registry_slug);
    }
    if (data.content_url !== undefined) {
      updates.push('content_url = ?');
      values.push(data.content_url);
    }
    if (data.prerequisites !== undefined) {
      updates.push('prerequisites = ?');
      values.push(JSON.stringify(data.prerequisites));
    }
    if (data.compatibility !== undefined) {
      updates.push('compatibility = ?');
      values.push(JSON.stringify(data.compatibility));
    }

    values.push(id);

    const stmt = this.db.prepare(
      `UPDATE skills SET ${updates.join(', ')} WHERE id = ?`
    );
    stmt.run(...values);

    // Build updated skill in memory instead of re-querying (performance optimization)
    // 在内存中构建更新后的 skill 对象，而不是重新查询（性能优化）
    // Determine the new content value (instructions takes priority)
    // 确定新的 content 值（instructions 优先）
    const newContent = data.instructions ?? data.content ?? existingSkill.content;
    
    const updatedSkill: Skill = {
      ...existingSkill,
      updated_at: now,
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...((data.content !== undefined || data.instructions !== undefined) && { 
        content: newContent,
        instructions: newContent, // Keep instructions synced with content
      }),
      ...(data.mcp_config !== undefined && { mcp_config: data.mcp_config }),
      ...(data.protocol_type !== undefined && { protocol_type: data.protocol_type }),
      ...(data.version !== undefined && { version: data.version }),
      ...(data.author !== undefined && { author: data.author }),
      ...(data.tags !== undefined && { tags: data.tags }),
      ...(data.is_favorite !== undefined && { is_favorite: data.is_favorite }),
      ...(data.source_url !== undefined && { source_url: data.source_url }),
      ...(data.icon_url !== undefined && { icon_url: data.icon_url }),
      ...(data.icon_emoji !== undefined && { icon_emoji: data.icon_emoji }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.is_builtin !== undefined && { is_builtin: data.is_builtin }),
      ...(data.registry_slug !== undefined && { registry_slug: data.registry_slug }),
      ...(data.content_url !== undefined && { content_url: data.content_url }),
      ...(data.prerequisites !== undefined && { prerequisites: data.prerequisites }),
      ...(data.compatibility !== undefined && { compatibility: data.compatibility }),
    };

    return updatedSkill;
  }

  /**
   * Delete Skill
   * 删除 Skill
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM skills WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Convert database row to Skill object
   * 数据库行转 Skill 对象
   */
  private rowToSkill(row: any): Skill {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      content: row.content,
      instructions: row.content, // Map content to instructions (alias)
      mcp_config: row.mcp_config,
      protocol_type: row.protocol_type,
      version: row.version,
      author: row.author,
      tags: JSON.parse(row.tags || '[]'),
      is_favorite: row.is_favorite === 1,
      created_at: row.created_at,
      updated_at: row.updated_at,
      source_url: row.source_url || undefined,
      icon_url: row.icon_url || undefined,
      icon_emoji: row.icon_emoji || undefined,
      category: row.category || 'general',
      is_builtin: row.is_builtin === 1,
      registry_slug: row.registry_slug || undefined,
      content_url: row.content_url || undefined,
      prerequisites: row.prerequisites ? JSON.parse(row.prerequisites) : undefined,
      compatibility: row.compatibility ? JSON.parse(row.compatibility) : undefined,
    };
  }
}
