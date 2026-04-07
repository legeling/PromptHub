import Database from "./sqlite";
import { v4 as uuidv4 } from "uuid";
import type {
  Skill,
  CreateSkillParams,
  UpdateSkillParams,
  SkillVersion,
  SkillFileSnapshot,
} from "@shared/types";

interface SkillRow {
  id: string;
  name: string;
  description: string | null;
  content: string | null;
  mcp_config: string | null;
  protocol_type: Skill["protocol_type"];
  version: string | null;
  author: string | null;
  tags: string | null;
  original_tags: string | null;
  is_favorite: number;
  source_url: string | null;
  local_repo_path: string | null;
  icon_url: string | null;
  icon_emoji: string | null;
  icon_background: string | null;
  category: Skill["category"] | null;
  is_builtin: number;
  registry_slug: string | null;
  content_url: string | null;
  prerequisites: string | null;
  compatibility: string | null;
  current_version: number | null;
  version_tracking_enabled: number | null;
  created_at: number;
  updated_at: number;
}

interface SkillVersionRow {
  id: string;
  skill_id: string;
  version: number;
  content: string | null;
  files_snapshot: string | null;
  note: string | null;
  created_at: number;
}

function parseJsonArray<T>(value: string | null | undefined): T[] | undefined {
  return value ? (JSON.parse(value) as T[]) : undefined;
}

export class SkillDB {
  constructor(private db: Database.Database) {}

  /**
   * Get Skill by name (case-insensitive)
   * 根据名称获取 Skill（不区分大小写）
   */
  getByName(name: string): Skill | null {
    const stmt = this.db.prepare(
      "SELECT * FROM skills WHERE LOWER(name) = LOWER(?)",
    );
    const row = stmt.get(name) as SkillRow | undefined;
    return row ? this.rowToSkill(row) : null;
  }

  /**
   * Create Skill
   * 创建 Skill
   *
   * @param data - Skill creation parameters
   * @param options.skipInitialVersion - If true, skip creating the initial version snapshot
   *   (used during backup restore to avoid spurious versions).
   *   如果为 true，跳过创建初始版本快照（用于备份恢复时避免产生多余版本）。
   */
  create(
    data: CreateSkillParams,
    options?: { skipInitialVersion?: boolean; overwriteExisting?: boolean },
  ): Skill {
    const normalizedName =
      typeof data.name === "string" ? data.name.trim() : data.name;

    if (!normalizedName || typeof normalizedName !== "string") {
      throw new Error(
        `Cannot create skill: name is required but got "${data.name}"`,
      );
    }

    const existing = this.getByName(normalizedName);
    if (existing) {
      if (options?.overwriteExisting) {
        return (
          this.update(existing.id, {
            ...data,
            name: normalizedName,
          }) ?? existing
        );
      }
      throw new Error(`Skill already exists: ${normalizedName}`);
    }

    const id = uuidv4();
    const now = Date.now();

    const tagsJson = JSON.stringify(data.tags || []);

    const stmt = this.db.prepare(`
      INSERT INTO skills (
        id, name, description, content, mcp_config,
        protocol_type, version, author, tags, original_tags, is_favorite,
        source_url, local_repo_path, icon_url, icon_emoji, icon_background, category, is_builtin,
        registry_slug, content_url, prerequisites, compatibility, current_version,
        version_tracking_enabled,
        created_at, updated_at
      ) VALUES (
        @id, @name, @description, @content, @mcp_config,
        @protocol_type, @version, @author, @tags, @original_tags, @is_favorite,
        @source_url, @local_repo_path, @icon_url, @icon_emoji, @icon_background, @category, @is_builtin,
        @registry_slug, @content_url, @prerequisites, @compatibility, @current_version,
        @version_tracking_enabled,
        @created_at, @updated_at
      )
    `);

    stmt.run({
      "@id": id,
      "@name": normalizedName,
      "@description": data.description || null,
      "@content": data.content || data.instructions || null,
      "@mcp_config": data.mcp_config || null,
      "@protocol_type": data.protocol_type || "mcp",
      "@version": data.version || "1.0.0",
      "@author": data.author || "User",
      "@tags": tagsJson,
      "@original_tags": data.original_tags
        ? JSON.stringify(data.original_tags)
        : tagsJson,
      "@is_favorite": data.is_favorite ? 1 : 0,
      "@source_url": data.source_url || null,
      "@local_repo_path": data.local_repo_path || null,
      "@icon_url": data.icon_url || null,
      "@icon_emoji": data.icon_emoji || null,
      "@icon_background": data.icon_background || null,
      "@category": data.category || "general",
      "@is_builtin": data.is_builtin ? 1 : 0,
      "@registry_slug": data.registry_slug || null,
      "@content_url": data.content_url || null,
      "@prerequisites": data.prerequisites
        ? JSON.stringify(data.prerequisites)
        : null,
      "@compatibility": data.compatibility
        ? JSON.stringify(data.compatibility)
        : null,
      "@current_version": data.currentVersion ?? 0,
      "@version_tracking_enabled": (data.versionTrackingEnabled ?? true) ? 1 : 0,
      "@created_at": now,
      "@updated_at": now,
    });

    return this.getById(id)!;
  }

  /**
   * Get Skill by ID
   * 根据 ID 获取 Skill
   */
  getById(id: string): Skill | null {
    const stmt = this.db.prepare("SELECT * FROM skills WHERE id = ?");
    const row = stmt.get(id) as SkillRow | undefined;
    return row ? this.rowToSkill(row) : null;
  }

  /**
   * Get all Skills
   * 获取所有 Skill
   */
  getAll(): Skill[] {
    const stmt = this.db.prepare(
      "SELECT * FROM skills ORDER BY updated_at DESC",
    );
    const rows = stmt.all() as SkillRow[];
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

    if (data.name !== undefined) {
      const normalizedName = data.name.trim();
      if (!normalizedName) {
        throw new Error("Skill name cannot be empty");
      }

      const duplicateSkill = this.getByName(normalizedName);
      if (duplicateSkill && duplicateSkill.id !== id) {
        throw new Error(`Skill already exists: ${normalizedName}`);
      }
    }

    const now = Date.now();
    const updates: string[] = ["updated_at = ?"];
    const values: Array<string | number | null> = [now];

    if (data.name !== undefined) {
      updates.push("name = ?");
      values.push(data.name.trim());
    }
    if (data.description !== undefined) {
      updates.push("description = ?");
      values.push(data.description);
    }
    // Handle both content and instructions (instructions syncs to content)
    // 处理 content 和 instructions（instructions 同步到 content）
    if (data.instructions !== undefined) {
      updates.push("content = ?");
      values.push(data.instructions);
    } else if (data.content !== undefined) {
      updates.push("content = ?");
      values.push(data.content);
    }
    if (data.mcp_config !== undefined) {
      updates.push("mcp_config = ?");
      values.push(data.mcp_config);
    }
    if (data.protocol_type !== undefined) {
      updates.push("protocol_type = ?");
      values.push(data.protocol_type);
    }
    if (data.version !== undefined) {
      updates.push("version = ?");
      values.push(data.version);
    }
    if (data.author !== undefined) {
      updates.push("author = ?");
      values.push(data.author);
    }
    if (data.tags !== undefined) {
      updates.push("tags = ?");
      values.push(JSON.stringify(data.tags));
    }
    if (data.is_favorite !== undefined) {
      updates.push("is_favorite = ?");
      values.push(data.is_favorite ? 1 : 0);
    }
    if (data.source_url !== undefined) {
      updates.push("source_url = ?");
      values.push(data.source_url);
    }
    if (data.local_repo_path !== undefined) {
      updates.push("local_repo_path = ?");
      values.push(data.local_repo_path);
    }
    if (data.icon_url !== undefined) {
      updates.push("icon_url = ?");
      values.push(data.icon_url);
    }
    if (data.icon_emoji !== undefined) {
      updates.push("icon_emoji = ?");
      values.push(data.icon_emoji);
    }
    if (data.icon_background !== undefined) {
      updates.push("icon_background = ?");
      values.push(data.icon_background);
    }
    if (data.category !== undefined) {
      updates.push("category = ?");
      values.push(data.category);
    }
    if (data.is_builtin !== undefined) {
      updates.push("is_builtin = ?");
      values.push(data.is_builtin ? 1 : 0);
    }
    if (data.registry_slug !== undefined) {
      updates.push("registry_slug = ?");
      values.push(data.registry_slug);
    }
    if (data.content_url !== undefined) {
      updates.push("content_url = ?");
      values.push(data.content_url);
    }
    if (data.prerequisites !== undefined) {
      updates.push("prerequisites = ?");
      values.push(JSON.stringify(data.prerequisites));
    }
    if (data.compatibility !== undefined) {
      updates.push("compatibility = ?");
      values.push(JSON.stringify(data.compatibility));
    }
    if (data.currentVersion !== undefined) {
      updates.push("current_version = ?");
      values.push(data.currentVersion);
    }
    if (data.versionTrackingEnabled !== undefined) {
      updates.push("version_tracking_enabled = ?");
      values.push(data.versionTrackingEnabled ? 1 : 0);
    }

    values.push(id);

    const stmt = this.db.prepare(
      `UPDATE skills SET ${updates.join(", ")} WHERE id = ?`,
    );
    stmt.run(...values);

    // Build updated skill in memory instead of re-querying (performance optimization)
    // 在内存中构建更新后的 skill 对象，而不是重新查询（性能优化）
    // Determine the new content value (instructions takes priority)
    // 确定新的 content 值（instructions 优先）
    const newContent =
      data.instructions ?? data.content ?? existingSkill.content;

    const updatedSkill: Skill = {
      ...existingSkill,
      updated_at: now,
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.description !== undefined && { description: data.description }),
      ...((data.content !== undefined || data.instructions !== undefined) && {
        content: newContent,
        instructions: newContent, // Keep instructions synced with content
      }),
      ...(data.mcp_config !== undefined && { mcp_config: data.mcp_config }),
      ...(data.protocol_type !== undefined && {
        protocol_type: data.protocol_type,
      }),
      ...(data.version !== undefined && { version: data.version }),
      ...(data.author !== undefined && { author: data.author }),
      ...(data.tags !== undefined && { tags: data.tags }),
      ...(data.is_favorite !== undefined && { is_favorite: data.is_favorite }),
      ...(data.source_url !== undefined && { source_url: data.source_url }),
      ...(data.local_repo_path !== undefined && {
        local_repo_path: data.local_repo_path,
      }),
      ...(data.icon_url !== undefined && { icon_url: data.icon_url }),
      ...(data.icon_emoji !== undefined && { icon_emoji: data.icon_emoji }),
      ...(data.icon_background !== undefined && {
        icon_background: data.icon_background,
      }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.is_builtin !== undefined && { is_builtin: data.is_builtin }),
      ...(data.registry_slug !== undefined && {
        registry_slug: data.registry_slug,
      }),
      ...(data.content_url !== undefined && { content_url: data.content_url }),
      ...(data.prerequisites !== undefined && {
        prerequisites: data.prerequisites,
      }),
      ...(data.compatibility !== undefined && {
        compatibility: data.compatibility,
      }),
      ...(data.currentVersion !== undefined && {
        currentVersion: data.currentVersion,
      }),
      ...(data.versionTrackingEnabled !== undefined && {
        versionTrackingEnabled: data.versionTrackingEnabled,
      }),
    };

    return updatedSkill;
  }

  // ==================== Version Management ====================
  // ==================== 版本管理 ====================

  /**
   * Create version snapshot (wrapped in a transaction for atomicity).
   * 创建版本快照（使用事务保证原子性）。
   *
   * @param skillId - Skill ID
   * @param note - Optional version note
   * @param filesSnapshot - Optional multi-file snapshot
   * @param existingSkill - Pre-fetched skill object (avoids re-query in update flow)
   */
  createVersion(
    skillId: string,
    note?: string,
    filesSnapshot?: SkillFileSnapshot[],
    existingSkill?: Skill,
  ): SkillVersion | null {
    const skill = existingSkill ?? this.getById(skillId);
    if (!skill) return null;

    // Use a transaction to atomically insert version + increment counter,
    // preventing UNIQUE(skill_id, version) conflicts from concurrent calls.
    // 使用事务原子化地插入版本 + 递增计数器，防止并发调用导致 UNIQUE 约束冲突。
    const txn = this.db.transaction(() => {
      // Re-read current_version inside transaction for consistency
      // 在事务内重新读取 current_version 以保证一致性
      const freshRow = this.db
        .prepare("SELECT current_version FROM skills WHERE id = ?")
        .get(skillId) as { current_version: number } | undefined;
      if (!freshRow) return null;

      const version = (freshRow.current_version ?? 0) + 1;
      const id = uuidv4();
      const now = Date.now();

      this.db
        .prepare(
          `INSERT INTO skill_versions (
          id, skill_id, version, content, files_snapshot, note, created_at
        ) VALUES (
          @id, @skill_id, @version, @content, @files_snapshot, @note, @created_at
        )`,
        )
        .run({
          "@id": id,
          "@skill_id": skillId,
          "@version": version,
          "@content": skill.content || null,
          "@files_snapshot": filesSnapshot
            ? JSON.stringify(filesSnapshot)
            : null,
          "@note": note || null,
          "@created_at": now,
        });

      // Update current version number
      // 更新当前版本号
      this.db
        .prepare(
          "UPDATE skills SET current_version = ? WHERE id = ?",
        )
        .run(version, skillId);

      this.db
        .prepare(
          "UPDATE skills SET version_tracking_enabled = 1 WHERE id = ?",
        )
        .run(skillId);

      return {
        id,
        skillId,
        version,
        content: skill.content,
        filesSnapshot,
        note,
        createdAt: new Date(now).toISOString(),
      } as SkillVersion;
    });

    return txn();
  }

  /**
   * Get all versions for a skill
   * 获取 Skill 的所有版本
   */
  getVersions(skillId: string): SkillVersion[] {
    const stmt = this.db.prepare(
      "SELECT * FROM skill_versions WHERE skill_id = ? ORDER BY version DESC",
    );
    const rows = stmt.all(skillId) as SkillVersionRow[];
    return rows.map((row) => this.rowToSkillVersion(row));
  }

  /**
   * Get one specific version for a skill.
   * 获取 Skill 的指定版本。
   */
  getVersion(skillId: string, version: number): SkillVersion | null {
    const stmt = this.db.prepare(
      "SELECT * FROM skill_versions WHERE skill_id = ? AND version = ?",
    );
    const row = stmt.get(skillId, version) as SkillVersionRow | undefined;
    return row ? this.rowToSkillVersion(row) : null;
  }

  /**
   * Delete one version snapshot for a skill.
   * 删除 Skill 的单个版本快照。
   */
  deleteVersion(skillId: string, versionId: string): boolean {
    const stmt = this.db.prepare(
      "DELETE FROM skill_versions WHERE skill_id = ? AND id = ?",
    );
    const result = stmt.run(skillId, versionId);
    return result.changes > 0;
  }

  /**
   * Rollback to specified version
   * 回滚到指定版本
   */
  rollbackVersion(skillId: string, version: number): Skill | null {
    const stmt = this.db.prepare(
      "SELECT * FROM skill_versions WHERE skill_id = ? AND version = ?",
    );
    const row = stmt.get(skillId, version) as SkillVersionRow | undefined;
    if (!row) return null;

    const versionData = this.rowToSkillVersion(row);

    // Restore content via update (which will auto-create a new version snapshot)
    // 通过 update 恢复内容（会自动创建新版本快照）
    return this.update(skillId, {
      content: versionData.content,
    });
  }

  /**
   * Delete Skill
   * 删除 Skill
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare("DELETE FROM skills WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Delete all skills and their versions (for backup restore).
   * 删除所有 Skill 及其版本（用于备份恢复）。
   */
  deleteAll(): void {
    const txn = this.db.transaction(() => {
      this.db.prepare("DELETE FROM skill_versions").run();
      this.db.prepare("DELETE FROM skills").run();
    });
    txn();
  }

  /**
   * Insert a version row directly (for backup restore).
   * 直接插入版本行（用于备份恢复）。
   *
   * Unlike `createVersion`, this does NOT auto-increment `current_version`
   * and accepts explicit values for all fields.
   * 与 `createVersion` 不同，此方法不会自动递增 `current_version`，
   * 且接受所有字段的显式值。
   */
  insertVersionDirect(version: SkillVersion): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO skill_versions (
          id, skill_id, version, content, files_snapshot, note, created_at
        ) VALUES (
          @id, @skill_id, @version, @content, @files_snapshot, @note, @created_at
        )`,
      )
      .run({
        "@id": version.id,
        "@skill_id": version.skillId,
        "@version": version.version,
        "@content": version.content || null,
        "@files_snapshot": version.filesSnapshot
          ? JSON.stringify(version.filesSnapshot)
          : null,
        "@note": version.note || null,
        "@created_at": version.createdAt
          ? new Date(version.createdAt).getTime()
          : Date.now(),
      });
  }

  /**
   * Convert database row to Skill object
   * 数据库行转 Skill 对象
   */
  private rowToSkill(row: SkillRow): Skill {
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
      tags: parseJsonArray<string>(row.tags) ?? [],
      is_favorite: row.is_favorite === 1,
      currentVersion: row.current_version ?? 0,
      versionTrackingEnabled: row.version_tracking_enabled === 1,
      created_at: row.created_at,
      updated_at: row.updated_at,
      source_url: row.source_url || undefined,
      local_repo_path: row.local_repo_path || undefined,
      icon_url: row.icon_url || undefined,
      icon_emoji: row.icon_emoji || undefined,
      icon_background: row.icon_background || undefined,
      category: row.category || "general",
      is_builtin: row.is_builtin === 1,
      registry_slug: row.registry_slug || undefined,
      content_url: row.content_url || undefined,
      prerequisites: parseJsonArray<string>(row.prerequisites),
      compatibility: parseJsonArray<string>(row.compatibility),
      original_tags: parseJsonArray<string>(row.original_tags),
    };
  }

  /**
   * Convert database row to SkillVersion object
   * 数据库行转 SkillVersion 对象
   */
  private rowToSkillVersion(row: SkillVersionRow): SkillVersion {
    return {
      id: row.id,
      skillId: row.skill_id,
      version: row.version,
      content: row.content,
      filesSnapshot: parseJsonArray<SkillFileSnapshot>(row.files_snapshot),
      note: row.note,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}
