import Database from "./adapter";
import { v4 as uuidv4 } from "uuid";
import type {
  Prompt,
  CreatePromptDTO,
  UpdatePromptDTO,
  SearchQuery,
  PromptVersion,
  PromptType,
} from "@prompthub/shared/types";

interface PromptRow {
  id: string;
  title: string;
  description: string | null;
  prompt_type: PromptType | null;
  system_prompt: string | null;
  system_prompt_en: string | null;
  user_prompt: string;
  user_prompt_en: string | null;
  variables: string | null;
  tags: string | null;
  folder_id: string | null;
  images: string | null;
  videos: string | null;
  is_favorite: number;
  is_pinned: number;
  current_version: number;
  usage_count: number;
  source: string | null;
  notes: string | null;
  last_ai_response: string | null;
  created_at: string;
  updated_at: string;
}

interface PromptVersionRow {
  id: string;
  prompt_id: string;
  version: number;
  system_prompt: string | null;
  system_prompt_en: string | null;
  user_prompt: string;
  user_prompt_en: string | null;
  variables: string | null;
  note: string | null;
  ai_response: string | null;
  created_at: string;
}

export class PromptDB {
  constructor(private db: Database.Database) {}

  /**
   * Create Prompt
   * 创建 Prompt
   */
  create(data: CreatePromptDTO): Prompt {
    const id = uuidv4();
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO prompts (
        id, title, description, prompt_type, system_prompt, system_prompt_en, user_prompt,
        user_prompt_en, variables, tags, folder_id, images, videos, source, notes,
        last_ai_response, is_favorite, current_version, usage_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.title,
      data.description || null,
      data.promptType || "text",
      data.systemPrompt || null,
      data.systemPromptEn || null,
      data.userPrompt,
      data.userPromptEn || null,
      JSON.stringify(data.variables || []),
      JSON.stringify(data.tags || []),
      data.folderId || null,
      JSON.stringify(data.images || []),
      JSON.stringify(data.videos || []),
      data.source || null,
      data.notes || null,
      null,
      0,
      1,
      0,
      now,
      now,
    );

    // Create initial version
    // 创建初始版本
    this.createVersion(id, "Initial version");
    // 初始版本

    return this.getById(id)!;
  }

  /**
   * Get Prompt by ID
   * 根据 ID 获取 Prompt
   */
  getById(id: string): Prompt | null {
    const stmt = this.db.prepare("SELECT * FROM prompts WHERE id = ?");
    const row = stmt.get(id) as PromptRow | undefined;
    return row ? this.rowToPrompt(row) : null;
  }

  /**
   * Get all Prompts
   * 获取所有 Prompt
   */
  getAll(): Prompt[] {
    const stmt = this.db.prepare(
      "SELECT * FROM prompts ORDER BY updated_at DESC",
    );
    const rows = stmt.all() as PromptRow[];
    return rows.map((row) => this.rowToPrompt(row));
  }

  /**
   * Update Prompt
   * 更新 Prompt
   * Performance optimized: Builds return object in memory instead of re-querying
   * 性能优化：在内存中构建返回对象，而不是重新查询
   */
  update(id: string, data: UpdatePromptDTO): Prompt | null {
    const existingPrompt = this.getById(id);
    if (!existingPrompt) return null;

    const now = Date.now();
    const updates: string[] = ["updated_at = ?"];
    const values: Array<string | number | null> = [now];

    if (data.title !== undefined) {
      updates.push("title = ?");
      values.push(data.title);
    }
    if (data.description !== undefined) {
      updates.push("description = ?");
      values.push(data.description);
    }
    if (data.promptType !== undefined) {
      updates.push("prompt_type = ?");
      values.push(data.promptType);
    }
    if (data.systemPrompt !== undefined) {
      updates.push("system_prompt = ?");
      values.push(data.systemPrompt);
    }
    if (data.systemPromptEn !== undefined) {
      updates.push("system_prompt_en = ?");
      values.push(data.systemPromptEn);
    }
    if (data.userPrompt !== undefined) {
      updates.push("user_prompt = ?");
      values.push(data.userPrompt);
    }
    if (data.userPromptEn !== undefined) {
      updates.push("user_prompt_en = ?");
      values.push(data.userPromptEn);
    }
    if (data.variables !== undefined) {
      updates.push("variables = ?");
      values.push(JSON.stringify(data.variables));
    }
    if (data.tags !== undefined) {
      updates.push("tags = ?");
      values.push(JSON.stringify(data.tags));
    }
    if (data.folderId !== undefined) {
      updates.push("folder_id = ?");
      values.push(data.folderId);
    }
    if (data.images !== undefined) {
      updates.push("images = ?");
      values.push(JSON.stringify(data.images));
    }
    if (data.videos !== undefined) {
      updates.push("videos = ?");
      values.push(JSON.stringify(data.videos));
    }
    if (data.isFavorite !== undefined) {
      updates.push("is_favorite = ?");
      values.push(data.isFavorite ? 1 : 0);
    }
    if (data.isPinned !== undefined) {
      updates.push("is_pinned = ?");
      values.push(data.isPinned ? 1 : 0);
    }
    if (data.source !== undefined) {
      updates.push("source = ?");
      values.push(data.source);
    }
    if (data.notes !== undefined) {
      updates.push("notes = ?");
      values.push(data.notes);
    }
    if (data.usageCount !== undefined) {
      updates.push("usage_count = ?");
      values.push(data.usageCount);
    }
    if (data.lastAiResponse !== undefined) {
      updates.push("last_ai_response = ?");
      values.push(data.lastAiResponse);
    }

    values.push(id);

    // Wrap SQL update + version creation in a transaction for atomicity
    const runUpdate = this.db.transaction(() => {
      const stmt = this.db.prepare(
        `UPDATE prompts SET ${updates.join(", ")} WHERE id = ?`,
      );
      stmt.run(...values);

      // Create a new version if content changes
      // 如果内容有变化，创建新版本
      if (
        data.systemPrompt !== undefined ||
        data.systemPromptEn !== undefined ||
        data.userPrompt !== undefined ||
        data.userPromptEn !== undefined ||
        data.variables !== undefined
      ) {
        this.createVersion(id);
      }
    });

    runUpdate();

    // Build updated prompt in memory instead of re-querying (performance optimization)
    // 在内存中构建更新后的 prompt 对象，而不是重新查询（性能优化）
    const updatedPrompt: Prompt = {
      ...existingPrompt,
      updatedAt: new Date(now).toISOString(),
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.promptType !== undefined && { promptType: data.promptType }),
      ...(data.systemPrompt !== undefined && {
        systemPrompt: data.systemPrompt,
      }),
      ...(data.systemPromptEn !== undefined && {
        systemPromptEn: data.systemPromptEn,
      }),
      ...(data.userPrompt !== undefined && { userPrompt: data.userPrompt }),
      ...(data.userPromptEn !== undefined && { userPromptEn: data.userPromptEn }),
      ...(data.variables !== undefined && { variables: data.variables }),
      ...(data.tags !== undefined && { tags: data.tags }),
      ...(data.folderId !== undefined && { folderId: data.folderId }),
      ...(data.images !== undefined && { images: data.images }),
      ...(data.videos !== undefined && { videos: data.videos }),
      ...(data.isFavorite !== undefined && { isFavorite: data.isFavorite }),
      ...(data.isPinned !== undefined && { isPinned: data.isPinned }),
      ...(data.usageCount !== undefined && { usageCount: data.usageCount }),
      ...(data.source !== undefined && { source: data.source }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.lastAiResponse !== undefined && { lastAiResponse: data.lastAiResponse }),
    };

    return updatedPrompt;
  }

  /**
   * Delete Prompt
   * 删除 Prompt
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare("DELETE FROM prompts WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Search Prompts
   * 搜索 Prompt
   */
  search(query: SearchQuery): Prompt[] {
    let sql = "SELECT * FROM prompts WHERE 1=1";
    const params: Array<string | number> = [];

    if (query.keyword) {
      sql +=
        " AND rowid IN (SELECT rowid FROM prompts_fts WHERE prompts_fts MATCH ?)";
      // Escape FTS5 special characters by wrapping in double quotes
      params.push(`"${query.keyword.replace(/"/g, '""')}"`);
    }

    if (query.folderId) {
      sql += " AND folder_id = ?";
      params.push(query.folderId);
    }

    if (query.isFavorite !== undefined) {
      sql += " AND is_favorite = ?";
      params.push(query.isFavorite ? 1 : 0);
    }

    if (query.tags && query.tags.length > 0) {
      // Simple tag match
      // 简单的标签匹配
      const tagConditions = query.tags.map(() => "tags LIKE ?").join(" OR ");
      sql += ` AND (${tagConditions})`;
      params.push(...query.tags.map((tag) => `%"${tag}"%`));
    }

    // Sorting
    // 排序
    const sortBy = query.sortBy || "updatedAt";
    const sortOrder = query.sortOrder || "desc";
    const sortColumn =
      (
        {
          title: "title",
          createdAt: "created_at",
          updatedAt: "updated_at",
          usageCount: "usage_count",
        } as Record<string, string>
      )[sortBy] ?? "updated_at";
    const safeOrder = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";
    sql += ` ORDER BY ${sortColumn} ${safeOrder}`;

    // Pagination
    // 分页
    if (query.limit) {
      sql += " LIMIT ?";
      params.push(query.limit);
      if (query.offset) {
        sql += " OFFSET ?";
        params.push(query.offset);
      }
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as PromptRow[];
    return rows.map((row) => this.rowToPrompt(row));
  }

  /**
   * Increment usage count
   * 增加使用次数
   */
  incrementUsage(id: string): void {
    const stmt = this.db.prepare(
      "UPDATE prompts SET usage_count = usage_count + 1 WHERE id = ?",
    );
    stmt.run(id);
  }

  /**
   * Create version
   * 创建版本
   */
  createVersion(promptId: string, note?: string): PromptVersion | null {
    const prompt = this.getById(promptId);
    if (!prompt) return null;

    const txn = this.db.transaction(() => {
      // Re-read current_version inside transaction for consistency
      const freshRow = this.db
        .prepare("SELECT current_version FROM prompts WHERE id = ?")
        .get(promptId) as { current_version: number } | undefined;
      if (!freshRow) return null;

      const version = freshRow.current_version ?? 1;
      const id = uuidv4();
      const now = Date.now();

      this.db
        .prepare(
          `
        INSERT INTO prompt_versions (
          id, prompt_id, version, system_prompt, system_prompt_en, user_prompt,
          user_prompt_en, variables, note, ai_response, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          id,
          promptId,
          version,
          prompt.systemPrompt || null,
          prompt.systemPromptEn || null,
          prompt.userPrompt,
          prompt.userPromptEn || null,
          JSON.stringify(prompt.variables),
          note || null,
          prompt.lastAiResponse || null,
          now,
        );

      // Update current version number
      // 更新当前版本号
      this.db
        .prepare(
          "UPDATE prompts SET current_version = current_version + 1 WHERE id = ?",
        )
        .run(promptId);

      return {
        id,
        promptId,
        version,
        systemPrompt: prompt.systemPrompt,
        systemPromptEn: prompt.systemPromptEn,
        userPrompt: prompt.userPrompt,
        userPromptEn: prompt.userPromptEn,
        variables: prompt.variables,
        note,
        aiResponse: prompt.lastAiResponse,
        createdAt: new Date(now).toISOString(),
      } as PromptVersion;
    });

    return txn();
  }

  /**
   * Get all versions
   * 获取所有版本
   */
  getVersions(promptId: string): PromptVersion[] {
    const stmt = this.db.prepare(
      "SELECT * FROM prompt_versions WHERE prompt_id = ? ORDER BY version DESC",
    );
    const rows = stmt.all(promptId) as PromptVersionRow[];
    return rows.map((row) => this.rowToVersion(row));
  }

  deleteVersion(versionId: string): boolean {
    const stmt = this.db.prepare("DELETE FROM prompt_versions WHERE id = ?");
    const result = stmt.run(versionId);
    return result.changes > 0;
  }

  /**
   * Insert a version row directly (for backup restore).
   * 直接插入版本行（用于备份恢复）。
   */
  insertVersionDirect(version: PromptVersion): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO prompt_versions (
          id, prompt_id, version, system_prompt, system_prompt_en, user_prompt,
          user_prompt_en, variables, note, ai_response, created_at
        ) VALUES (
          @id, @prompt_id, @version, @system_prompt, @system_prompt_en, @user_prompt,
          @user_prompt_en, @variables, @note, @ai_response, @created_at
        )`,
      )
      .run({
        "@id": version.id,
        "@prompt_id": version.promptId,
        "@version": version.version,
        "@system_prompt": version.systemPrompt || null,
        "@system_prompt_en": version.systemPromptEn || null,
        "@user_prompt": version.userPrompt,
        "@user_prompt_en": version.userPromptEn || null,
        "@variables": JSON.stringify(version.variables),
        "@note": version.note || null,
        "@ai_response": version.aiResponse || null,
        "@created_at": version.createdAt
          ? new Date(version.createdAt).getTime()
          : Date.now(),
      });
  }

  insertPromptDirect(prompt: Prompt): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO prompts (
          id, title, description, prompt_type, system_prompt, system_prompt_en, user_prompt,
          user_prompt_en, variables, tags, folder_id, images, videos, is_favorite, is_pinned,
          current_version, usage_count, source, notes, last_ai_response, created_at, updated_at
        ) VALUES (
          @id, @title, @description, @prompt_type, @system_prompt, @system_prompt_en, @user_prompt,
          @user_prompt_en, @variables, @tags, @folder_id, @images, @videos, @is_favorite, @is_pinned,
          @current_version, @usage_count, @source, @notes, @last_ai_response, @created_at, @updated_at
        )`,
      )
      .run({
        "@id": prompt.id,
        "@title": prompt.title,
        "@description": prompt.description ?? null,
        "@prompt_type": prompt.promptType ?? "text",
        "@system_prompt": prompt.systemPrompt ?? null,
        "@system_prompt_en": prompt.systemPromptEn ?? null,
        "@user_prompt": prompt.userPrompt,
        "@user_prompt_en": prompt.userPromptEn ?? null,
        "@variables": JSON.stringify(prompt.variables ?? []),
        "@tags": JSON.stringify(prompt.tags ?? []),
        "@folder_id": prompt.folderId ?? null,
        "@images": JSON.stringify(prompt.images ?? []),
        "@videos": JSON.stringify(prompt.videos ?? []),
        "@is_favorite": prompt.isFavorite ? 1 : 0,
        "@is_pinned": prompt.isPinned ? 1 : 0,
        "@current_version": prompt.currentVersion ?? prompt.version ?? 1,
        "@usage_count": prompt.usageCount ?? 0,
        "@source": prompt.source ?? null,
        "@notes": prompt.notes ?? null,
        "@last_ai_response": prompt.lastAiResponse ?? null,
        "@created_at": prompt.createdAt
          ? new Date(prompt.createdAt).getTime()
          : Date.now(),
        "@updated_at": prompt.updatedAt
          ? new Date(prompt.updatedAt).getTime()
          : Date.now(),
      });
  }

  /**
   * Rollback to specified version
   * 回滚到指定版本
   */
  rollback(promptId: string, version: number): Prompt | null {
    const stmt = this.db.prepare(
      "SELECT * FROM prompt_versions WHERE prompt_id = ? AND version = ?",
    );
    const row = stmt.get(promptId, version) as PromptVersionRow | undefined;
    if (!row) return null;

    const versionData = this.rowToVersion(row);

    return this.update(promptId, {
      systemPrompt: versionData.systemPrompt ?? undefined,
      systemPromptEn: versionData.systemPromptEn ?? undefined,
      userPrompt: versionData.userPrompt,
      userPromptEn: versionData.userPromptEn ?? undefined,
      variables: versionData.variables,
      lastAiResponse: versionData.aiResponse ?? undefined,
    });
  }

  /**
   * Convert database row to Prompt object
   * 数据库行转 Prompt 对象
   */
  private rowToPrompt(row: PromptRow): Prompt {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      promptType: row.prompt_type || "text",
      systemPrompt: row.system_prompt,
      systemPromptEn: row.system_prompt_en,
      userPrompt: row.user_prompt,
      userPromptEn: row.user_prompt_en,
      variables: JSON.parse(row.variables || "[]"),
      tags: JSON.parse(row.tags || "[]"),
      folderId: row.folder_id,
      images: JSON.parse(row.images || "[]"),
      videos: JSON.parse(row.videos || "[]"),
      isFavorite: row.is_favorite === 1,
      isPinned: row.is_pinned === 1,
      version: row.current_version,
      currentVersion: row.current_version,
      usageCount: row.usage_count,
      source: row.source,
      notes: row.notes,
      lastAiResponse: row.last_ai_response,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Convert database row to PromptVersion object
   * 数据库行转 PromptVersion 对象
   */
  private rowToVersion(row: PromptVersionRow): PromptVersion {
    return {
      id: row.id,
      promptId: row.prompt_id,
      version: row.version,
      systemPrompt: row.system_prompt,
      systemPromptEn: row.system_prompt_en,
      userPrompt: row.user_prompt,
      userPromptEn: row.user_prompt_en,
      variables: JSON.parse(row.variables || "[]"),
      note: row.note,
      aiResponse: row.ai_response,
      createdAt: row.created_at,
    };
  }
}
