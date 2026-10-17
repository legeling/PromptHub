import { assertVersionImportMatches } from "./version-import";
import Database from "./adapter";
import { v4 as uuidv4 } from "uuid";
import type {
  Skill,
  CreateSkillParams,
  UpdateSkillParams,
  SkillVersion,
  SkillFileSnapshot,
  SkillSafetyReport,
} from "@prompthub/shared/types";

interface SkillRow {
  id: string;
  owner_user_id: string | null;
  visibility: Skill["visibility"];
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
  source_id: string | null;
  source_label: string | null;
  source_branch: string | null;
  source_directory: string | null;
  canonical_skill_path: string | null;
  logical_name: string | null;
  variant_key: string | null;
  local_repo_path: string | null;
  directory_fingerprint: string | null;
  installed_content_hash: string | null;
  installed_directory_fingerprint: string | null;
  fingerprint_algorithm: Skill["fingerprint_algorithm"] | null;
  source_last_checked_at: number | null;
  source_last_error: string | null;
  source_binding_state: Skill["source_binding_state"] | null;
  installed_version: string | null;
  installed_at: number | null;
  updated_from_store_at: number | null;
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
  // Safety columns (added via migration)
  safety_level: string | null;
  safety_score: number | null;
  safety_report: string | null;
  safety_scanned_at: number | null;
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

export interface FinalizeSkillPackageResult {
  skill: Skill;
  version: SkillVersion;
}

function parseJsonArray<T>(value: string | null | undefined): T[] | undefined {
  return value ? (JSON.parse(value) as T[]) : undefined;
}

function normalizeImportedSkillVersion(version: SkillVersion): SkillVersionRow {
  for (const [field, value] of Object.entries(version)) {
    if (typeof value === "string" && value.includes("\0"))
      throw new Error(`Skill version ${field} must not contain null bytes`);
  }
  return {
    id: version.id,
    skill_id: version.skillId,
    version: version.version,
    content: version.content ?? null,
    files_snapshot: version.filesSnapshot
      ? JSON.stringify(version.filesSnapshot)
      : null,
    note: version.note ?? null,
    created_at: version.createdAt
      ? new Date(version.createdAt).getTime()
      : Date.now(),
  };
}

const INSERT_SKILL_VERSION_SQL = `INSERT INTO skill_versions (
  id, skill_id, version, content, files_snapshot, note, created_at
) VALUES (
  @id, @skill_id, @version, @content, @files_snapshot, @note, @created_at
)`;

// Stable-ID import updates must not cascade-delete dependent records.
const UPSERT_SKILL_SQL = `INSERT INTO skills (
  id, owner_user_id, visibility, name, description, content, mcp_config,
  protocol_type, version, author, tags, original_tags, is_favorite,
  source_url, source_id, source_label, source_branch, source_directory, canonical_skill_path, logical_name, variant_key, local_repo_path, directory_fingerprint, icon_url, icon_emoji, icon_background, category, is_builtin,
  registry_slug, content_url, installed_content_hash, installed_directory_fingerprint, fingerprint_algorithm, source_last_checked_at, source_last_error, source_binding_state, installed_version, installed_at,
  updated_from_store_at, prerequisites, compatibility, current_version,
  version_tracking_enabled, safety_level, safety_score, safety_report, safety_scanned_at,
  created_at, updated_at
) VALUES (
  @id, @owner_user_id, @visibility, @name, @description, @content, @mcp_config,
  @protocol_type, @version, @author, @tags, @original_tags, @is_favorite,
  @source_url, @source_id, @source_label, @source_branch, @source_directory, @canonical_skill_path, @logical_name, @variant_key, @local_repo_path, @directory_fingerprint, @icon_url, @icon_emoji, @icon_background, @category, @is_builtin,
  @registry_slug, @content_url, @installed_content_hash, @installed_directory_fingerprint, @fingerprint_algorithm, @source_last_checked_at, @source_last_error, @source_binding_state, @installed_version, @installed_at,
  @updated_from_store_at, @prerequisites, @compatibility, @current_version,
  @version_tracking_enabled, @safety_level, @safety_score, @safety_report, @safety_scanned_at,
  @created_at, @updated_at
) ON CONFLICT(id) DO UPDATE SET
  owner_user_id = excluded.owner_user_id,
  visibility = excluded.visibility,
  name = excluded.name,
  description = excluded.description,
  content = excluded.content,
  mcp_config = excluded.mcp_config,
  protocol_type = excluded.protocol_type,
  version = excluded.version,
  author = excluded.author,
  tags = excluded.tags,
  original_tags = excluded.original_tags,
  is_favorite = excluded.is_favorite,
  source_url = excluded.source_url,
  source_id = excluded.source_id,
  source_label = excluded.source_label,
  source_branch = excluded.source_branch,
  source_directory = excluded.source_directory,
  canonical_skill_path = excluded.canonical_skill_path,
  logical_name = excluded.logical_name,
  variant_key = excluded.variant_key,
  local_repo_path = excluded.local_repo_path,
  directory_fingerprint = excluded.directory_fingerprint,
  icon_url = excluded.icon_url,
  icon_emoji = excluded.icon_emoji,
  icon_background = excluded.icon_background,
  category = excluded.category,
  is_builtin = excluded.is_builtin,
  registry_slug = excluded.registry_slug,
  content_url = excluded.content_url,
  installed_content_hash = excluded.installed_content_hash,
  installed_directory_fingerprint = excluded.installed_directory_fingerprint,
  fingerprint_algorithm = excluded.fingerprint_algorithm,
  source_last_checked_at = excluded.source_last_checked_at,
  source_last_error = excluded.source_last_error,
  source_binding_state = excluded.source_binding_state,
  installed_version = excluded.installed_version,
  installed_at = excluded.installed_at,
  updated_from_store_at = excluded.updated_from_store_at,
  prerequisites = excluded.prerequisites,
  compatibility = excluded.compatibility,
  current_version = excluded.current_version,
  version_tracking_enabled = excluded.version_tracking_enabled,
  safety_level = excluded.safety_level,
  safety_score = excluded.safety_score,
  safety_report = excluded.safety_report,
  safety_scanned_at = excluded.safety_scanned_at,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at`;

export class SkillDB {
  constructor(protected db: Database.Database) {}

  protected persistContent(content: string | undefined): string | null {
    return content ?? null;
  }

  protected persistFiles(
    files: SkillFileSnapshot[] | undefined,
  ): string | null {
    return files === undefined ? null : JSON.stringify(files);
  }

  protected hydrateSkill(skill: Skill): Skill {
    return skill;
  }
  protected hydrateVersion(version: SkillVersion): SkillVersion {
    return version;
  }

  /**
   * Get Skill by name (case-insensitive)
   * 根据名称获取 Skill（不区分大小写）
   */
  getByName(name: string): Skill | null {
    const stmt = this.db.prepare(
      "SELECT * FROM skills WHERE LOWER(name) = LOWER(?)",
    );
    const row = stmt.get(name) as SkillRow | undefined;
    return row ? this.hydrateSkill(this.rowToSkill(row)) : null;
  }

  getBySourceId(sourceId: string): Skill | null {
    const normalizedSourceId = sourceId.trim();
    if (!normalizedSourceId) {
      return null;
    }
    const stmt = this.db.prepare("SELECT * FROM skills WHERE source_id = ?");
    const row = stmt.get(normalizedSourceId) as SkillRow | undefined;
    return row ? this.hydrateSkill(this.rowToSkill(row)) : null;
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
    return this.createWithId(uuidv4(), data, options);
  }

  protected createWithId(
    id: string,
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

    const existing = data.source_id
      ? this.getBySourceId(data.source_id)
      : this.getByName(normalizedName);
    if (existing) {
      if (options?.overwriteExisting) {
        return (
          this.update(existing.id, {
            ...data,
            name: normalizedName,
          }) ?? existing
        );
      }
      throw new Error(
        data.source_id
          ? `Skill source already exists: ${data.source_id}`
          : `Skill already exists: ${normalizedName}`,
      );
    }

    const now = Date.now();

    const tagsJson = JSON.stringify(data.tags || []);

    const stmt = this.db.prepare(`
      INSERT INTO skills (
        id, owner_user_id, visibility, name, description, content, mcp_config,
        protocol_type, version, author, tags, original_tags, is_favorite,
        source_url, source_id, source_label, source_branch, source_directory, canonical_skill_path, logical_name, variant_key, local_repo_path, directory_fingerprint, icon_url, icon_emoji, icon_background, category, is_builtin,
        registry_slug, content_url, installed_content_hash, installed_directory_fingerprint, fingerprint_algorithm, source_last_checked_at, source_last_error, source_binding_state, installed_version, installed_at,
        updated_from_store_at, prerequisites, compatibility, current_version,
        version_tracking_enabled, safety_level, safety_score, safety_report, safety_scanned_at,
        created_at, updated_at
      ) VALUES (
        @id, @owner_user_id, @visibility, @name, @description, @content, @mcp_config,
        @protocol_type, @version, @author, @tags, @original_tags, @is_favorite,
        @source_url, @source_id, @source_label, @source_branch, @source_directory, @canonical_skill_path, @logical_name, @variant_key, @local_repo_path, @directory_fingerprint, @icon_url, @icon_emoji, @icon_background, @category, @is_builtin,
        @registry_slug, @content_url, @installed_content_hash, @installed_directory_fingerprint, @fingerprint_algorithm, @source_last_checked_at, @source_last_error, @source_binding_state, @installed_version, @installed_at,
        @updated_from_store_at, @prerequisites, @compatibility, @current_version,
        @version_tracking_enabled, @safety_level, @safety_score, @safety_report, @safety_scanned_at,
        @created_at, @updated_at
      )
    `);

    const safetyReport = data.safetyReport;

    stmt.run({
      "@id": id,
      "@owner_user_id": data.ownerUserId ?? null,
      "@visibility": data.visibility ?? "private",
      "@name": normalizedName,
      "@description": data.description || null,
      "@content": this.persistContent(data.instructions ?? data.content),
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
      "@source_id": data.source_id || null,
      "@source_label": data.source_label || null,
      "@source_branch": data.source_branch || null,
      "@source_directory": data.source_directory || null,
      "@canonical_skill_path": data.canonical_skill_path || null,
      "@logical_name": data.logical_name || null,
      "@variant_key": data.variant_key || null,
      "@local_repo_path": data.local_repo_path || null,
      "@directory_fingerprint": data.directory_fingerprint || null,
      "@icon_url": data.icon_url || null,
      "@icon_emoji": data.icon_emoji || null,
      "@icon_background": data.icon_background || null,
      "@category": data.category || "general",
      "@is_builtin": data.is_builtin ? 1 : 0,
      "@registry_slug": data.registry_slug || null,
      "@content_url": data.content_url || null,
      "@installed_content_hash": data.installed_content_hash || null,
      "@installed_directory_fingerprint":
        data.installed_directory_fingerprint || null,
      "@fingerprint_algorithm": data.fingerprint_algorithm || null,
      "@source_last_checked_at": data.source_last_checked_at ?? null,
      "@source_last_error": data.source_last_error ?? null,
      "@source_binding_state": data.source_binding_state || null,
      "@installed_version": data.installed_version || null,
      "@installed_at": data.installed_at ?? null,
      "@updated_from_store_at": data.updated_from_store_at ?? null,
      "@prerequisites": data.prerequisites
        ? JSON.stringify(data.prerequisites)
        : null,
      "@compatibility": data.compatibility
        ? JSON.stringify(data.compatibility)
        : null,
      "@current_version": data.currentVersion ?? 0,
      "@version_tracking_enabled":
        (data.versionTrackingEnabled ?? true) ? 1 : 0,
      "@safety_level": safetyReport?.level ?? null,
      "@safety_score": safetyReport?.score ?? null,
      "@safety_report": safetyReport ? JSON.stringify(safetyReport) : null,
      "@safety_scanned_at": safetyReport?.scannedAt ?? null,
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
    return row ? this.hydrateSkill(this.rowToSkill(row)) : null;
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
    return rows.map((row) => this.hydrateSkill(this.rowToSkill(row)));
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

    const normalizedName = data.name?.trim();
    if (data.name !== undefined && !normalizedName) {
      throw new Error("Skill name cannot be empty");
    }

    if (data.name !== undefined || data.source_id !== undefined) {
      const effectiveName = normalizedName ?? existingSkill.name;
      const effectiveSourceId =
        data.source_id !== undefined
          ? data.source_id.trim()
          : existingSkill.source_id?.trim();
      const duplicateSkill = effectiveSourceId
        ? this.getBySourceId(effectiveSourceId)
        : this.getByName(effectiveName);
      if (duplicateSkill && duplicateSkill.id !== id) {
        throw new Error(
          effectiveSourceId
            ? `Skill source already exists: ${effectiveSourceId}`
            : `Skill already exists: ${effectiveName}`,
        );
      }
    }

    const now = Date.now();
    const updates: string[] = ["updated_at = ?"];
    const values: Array<string | number | null> = [now];

    if (data.ownerUserId !== undefined) {
      updates.push("owner_user_id = ?");
      values.push(data.ownerUserId);
    }
    if (data.visibility !== undefined) {
      updates.push("visibility = ?");
      values.push(data.visibility);
    }

    if (data.name !== undefined) {
      if (normalizedName === undefined) {
        throw new Error("Skill name cannot be empty");
      }
      updates.push("name = ?");
      values.push(normalizedName);
    }
    if (data.description !== undefined) {
      updates.push("description = ?");
      values.push(data.description);
    }
    // Handle both content and instructions (instructions syncs to content)
    // 处理 content 和 instructions（instructions 同步到 content）
    if (data.instructions !== undefined) {
      updates.push("content = ?");
      values.push(this.persistContent(data.instructions));
    } else if (data.content !== undefined) {
      updates.push("content = ?");
      values.push(this.persistContent(data.content));
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
    if (data.original_tags !== undefined) {
      updates.push("original_tags = ?");
      values.push(JSON.stringify(data.original_tags));
    }
    if (data.is_favorite !== undefined) {
      updates.push("is_favorite = ?");
      values.push(data.is_favorite ? 1 : 0);
    }
    if (data.source_url !== undefined) {
      updates.push("source_url = ?");
      values.push(data.source_url);
    }
    if (data.source_id !== undefined) {
      updates.push("source_id = ?");
      values.push(data.source_id);
    }
    if (data.source_label !== undefined) {
      updates.push("source_label = ?");
      values.push(data.source_label);
    }
    if (data.source_branch !== undefined) {
      updates.push("source_branch = ?");
      values.push(data.source_branch);
    }
    if (data.source_directory !== undefined) {
      updates.push("source_directory = ?");
      values.push(data.source_directory);
    }
    if (data.canonical_skill_path !== undefined) {
      updates.push("canonical_skill_path = ?");
      values.push(data.canonical_skill_path);
    }
    if (data.logical_name !== undefined) {
      updates.push("logical_name = ?");
      values.push(data.logical_name);
    }
    if (data.variant_key !== undefined) {
      updates.push("variant_key = ?");
      values.push(data.variant_key);
    }
    if (data.local_repo_path !== undefined) {
      updates.push("local_repo_path = ?");
      values.push(data.local_repo_path);
    }
    if (data.directory_fingerprint !== undefined) {
      updates.push("directory_fingerprint = ?");
      values.push(data.directory_fingerprint);
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
    if (data.installed_content_hash !== undefined) {
      updates.push("installed_content_hash = ?");
      values.push(data.installed_content_hash);
    }
    if (data.installed_directory_fingerprint !== undefined) {
      updates.push("installed_directory_fingerprint = ?");
      values.push(data.installed_directory_fingerprint);
    }
    if (data.fingerprint_algorithm !== undefined) {
      updates.push("fingerprint_algorithm = ?");
      values.push(data.fingerprint_algorithm);
    }
    if (data.source_last_checked_at !== undefined) {
      updates.push("source_last_checked_at = ?");
      values.push(data.source_last_checked_at);
    }
    if (data.source_last_error !== undefined) {
      updates.push("source_last_error = ?");
      values.push(data.source_last_error);
    }
    if (data.source_binding_state !== undefined) {
      updates.push("source_binding_state = ?");
      values.push(data.source_binding_state);
    }
    if (data.installed_version !== undefined) {
      updates.push("installed_version = ?");
      values.push(data.installed_version);
    }
    if (data.installed_at !== undefined) {
      updates.push("installed_at = ?");
      values.push(data.installed_at);
    }
    if (data.updated_from_store_at !== undefined) {
      updates.push("updated_from_store_at = ?");
      values.push(data.updated_from_store_at);
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
    if (data.safetyReport !== undefined) {
      const report = data.safetyReport;
      updates.push("safety_level = ?");
      values.push(report.level);
      updates.push("safety_score = ?");
      values.push(report.score ?? null);
      updates.push("safety_report = ?");
      values.push(JSON.stringify(report));
      updates.push("safety_scanned_at = ?");
      values.push(report.scannedAt);
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
      ...(data.ownerUserId !== undefined && {
        ownerUserId: data.ownerUserId,
      }),
      ...(data.visibility !== undefined && { visibility: data.visibility }),
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
      ...(data.original_tags !== undefined && {
        original_tags: data.original_tags,
      }),
      ...(data.is_favorite !== undefined && { is_favorite: data.is_favorite }),
      ...(data.source_url !== undefined && { source_url: data.source_url }),
      ...(data.source_id !== undefined && { source_id: data.source_id }),
      ...(data.source_label !== undefined && {
        source_label: data.source_label,
      }),
      ...(data.source_branch !== undefined && {
        source_branch: data.source_branch,
      }),
      ...(data.source_directory !== undefined && {
        source_directory: data.source_directory,
      }),
      ...(data.canonical_skill_path !== undefined && {
        canonical_skill_path: data.canonical_skill_path,
      }),
      ...(data.logical_name !== undefined && {
        logical_name: data.logical_name,
      }),
      ...(data.variant_key !== undefined && { variant_key: data.variant_key }),
      ...(data.local_repo_path !== undefined && {
        local_repo_path: data.local_repo_path,
      }),
      ...(data.directory_fingerprint !== undefined && {
        directory_fingerprint: data.directory_fingerprint,
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
      ...(data.installed_content_hash !== undefined && {
        installed_content_hash: data.installed_content_hash,
      }),
      ...(data.installed_directory_fingerprint !== undefined && {
        installed_directory_fingerprint: data.installed_directory_fingerprint,
      }),
      ...(data.fingerprint_algorithm !== undefined && {
        fingerprint_algorithm: data.fingerprint_algorithm,
      }),
      ...(data.source_last_checked_at !== undefined && {
        source_last_checked_at: data.source_last_checked_at,
      }),
      ...(data.source_last_error !== undefined && {
        source_last_error: data.source_last_error ?? undefined,
      }),
      ...(data.source_binding_state !== undefined && {
        source_binding_state: data.source_binding_state,
      }),
      ...(data.installed_version !== undefined && {
        installed_version: data.installed_version,
      }),
      ...(data.installed_at !== undefined && {
        installed_at: data.installed_at,
      }),
      ...(data.updated_from_store_at !== undefined && {
        updated_from_store_at: data.updated_from_store_at,
      }),
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
      ...(data.safetyReport !== undefined && {
        safetyReport: data.safetyReport,
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
    const transaction = this.db.transaction(() =>
      this.insertVersionSnapshot(skillId, note, filesSnapshot, skill),
    );
    return transaction();
  }

  /** Finalize install metadata and its initial version as one DB mutation. */
  finalizePackageInstall(
    skillId: string,
    data: UpdateSkillParams,
    note: string,
    filesSnapshot: SkillFileSnapshot[],
  ): FinalizeSkillPackageResult | null {
    const transaction = this.db.transaction(() => {
      const updated = this.update(skillId, data);
      if (!updated) return null;
      const version = this.insertVersionSnapshot(
        skillId,
        note,
        filesSnapshot,
        updated,
      );
      if (!version)
        throw new Error("Skill disappeared during install finalization");
      const skill = this.getById(skillId);
      if (!skill)
        throw new Error("Skill disappeared after install finalization");
      return { skill, version };
    });
    return transaction();
  }

  /** Snapshot the old package and finalize update metadata in one transaction. */
  finalizePackageUpdate(
    skillId: string,
    data: UpdateSkillParams,
    note: string,
    filesSnapshot: SkillFileSnapshot[] | undefined,
    expectedSkill?: Skill,
  ): FinalizeSkillPackageResult | null {
    const transaction = this.db.transaction(() => {
      const current = this.getById(skillId);
      if (!current) return null;
      this.assertPackageUpdateBaseline(current, expectedSkill);
      const version = this.insertVersionSnapshot(
        skillId,
        note,
        filesSnapshot,
        current,
      );
      if (!version) throw new Error("Skill disappeared during update snapshot");
      const skill = this.update(skillId, data);
      if (!skill)
        throw new Error("Skill disappeared during update finalization");
      return { skill, version };
    });
    return transaction();
  }

  private assertPackageUpdateBaseline(current: Skill, expected?: Skill): void {
    if (!expected) return;
    const changed =
      current.updated_at !== expected.updated_at ||
      (current.currentVersion ?? 0) !== (expected.currentVersion ?? 0);
    if (changed)
      throw new Error("Skill changed during package update finalization");
  }

  private insertVersionSnapshot(
    skillId: string,
    note: string | undefined,
    filesSnapshot: SkillFileSnapshot[] | undefined,
    skill: Skill,
  ): SkillVersion | null {
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
        "@content": this.persistContent(skill.content),
        "@files_snapshot": this.persistFiles(filesSnapshot),
        "@note": note || null,
        "@created_at": now,
      });
    this.db
      .prepare(
        `UPDATE skills
         SET current_version = ?, version_tracking_enabled = 1
         WHERE id = ?`,
      )
      .run(version, skillId);
    return {
      id,
      skillId,
      version,
      content: skill.content,
      filesSnapshot,
      note,
      createdAt: new Date(now).toISOString(),
    };
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
    return rows.map((row) => this.hydrateVersion(this.rowToSkillVersion(row)));
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
    return row ? this.hydrateVersion(this.rowToSkillVersion(row)) : null;
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

  /** Remove a failed-operation snapshot and restore its counter when still current. */
  discardVersionAndRestoreCounter(
    skillId: string,
    versionId: string,
    previousCurrentVersion: number,
  ): boolean {
    const transaction = this.db.transaction(() => {
      const snapshot = this.db
        .prepare(
          "SELECT version FROM skill_versions WHERE skill_id = ? AND id = ?",
        )
        .get(skillId, versionId) as { version: number } | undefined;
      if (!snapshot) return false;
      this.db
        .prepare("DELETE FROM skill_versions WHERE skill_id = ? AND id = ?")
        .run(skillId, versionId);
      this.db
        .prepare(
          `UPDATE skills SET current_version = ?
           WHERE id = ? AND current_version = ?`,
        )
        .run(previousCurrentVersion, skillId, snapshot.version);
      return true;
    });
    return transaction();
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

  insertSkillDirect(skill: Skill): void {
    const safetyReport = skill.safetyReport;

    this.db.prepare(UPSERT_SKILL_SQL).run({
      "@id": skill.id,
      "@owner_user_id": skill.ownerUserId ?? null,
      "@visibility": skill.visibility ?? "private",
      "@name": skill.name,
      "@description": skill.description ?? null,
      "@content": this.persistContent(skill.instructions ?? skill.content),
      "@mcp_config": skill.mcp_config ?? null,
      "@protocol_type": skill.protocol_type,
      "@version": skill.version ?? null,
      "@author": skill.author ?? null,
      "@tags": JSON.stringify(skill.tags ?? []),
      "@original_tags": JSON.stringify(skill.original_tags ?? skill.tags ?? []),
      "@is_favorite": skill.is_favorite ? 1 : 0,
      "@source_url": skill.source_url ?? null,
      "@source_id": skill.source_id ?? null,
      "@source_label": skill.source_label ?? null,
      "@source_branch": skill.source_branch ?? null,
      "@source_directory": skill.source_directory ?? null,
      "@canonical_skill_path": skill.canonical_skill_path ?? null,
      "@logical_name": skill.logical_name ?? null,
      "@variant_key": skill.variant_key ?? null,
      "@local_repo_path": skill.local_repo_path ?? null,
      "@directory_fingerprint": skill.directory_fingerprint ?? null,
      "@icon_url": skill.icon_url ?? null,
      "@icon_emoji": skill.icon_emoji ?? null,
      "@icon_background": skill.icon_background ?? null,
      "@category": skill.category ?? "general",
      "@is_builtin": skill.is_builtin ? 1 : 0,
      "@registry_slug": skill.registry_slug ?? null,
      "@content_url": skill.content_url ?? null,
      "@installed_content_hash": skill.installed_content_hash ?? null,
      "@installed_directory_fingerprint":
        skill.installed_directory_fingerprint ?? null,
      "@fingerprint_algorithm": skill.fingerprint_algorithm ?? null,
      "@source_last_checked_at": skill.source_last_checked_at ?? null,
      "@source_last_error": skill.source_last_error ?? null,
      "@source_binding_state": skill.source_binding_state ?? null,
      "@installed_version": skill.installed_version ?? null,
      "@installed_at": skill.installed_at ?? null,
      "@updated_from_store_at": skill.updated_from_store_at ?? null,
      "@prerequisites": skill.prerequisites
        ? JSON.stringify(skill.prerequisites)
        : null,
      "@compatibility": skill.compatibility
        ? JSON.stringify(skill.compatibility)
        : null,
      "@current_version": skill.currentVersion ?? 0,
      "@version_tracking_enabled":
        (skill.versionTrackingEnabled ?? true) ? 1 : 0,
      "@safety_level": safetyReport?.level ?? null,
      "@safety_score": safetyReport?.score ?? null,
      "@safety_report": safetyReport ? JSON.stringify(safetyReport) : null,
      "@safety_scanned_at": safetyReport?.scannedAt ?? null,
      "@created_at": skill.created_at || Date.now(),
      "@updated_at": skill.updated_at || Date.now(),
    });
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
  insertVersionDirect(version: SkillVersion): SkillVersion {
    const row = normalizeImportedSkillVersion(version);
    row.content = this.persistContent(version.content);
    row.files_snapshot = this.persistFiles(version.filesSnapshot);
    const candidate = this.rowToSkillVersion(row);
    return this.db.transaction(() => {
      // The typed adapter row is normalized before semantic JSON comparison.
      const existing = this.db
        .prepare(
          "SELECT * FROM skill_versions WHERE id = ? OR (skill_id = ? AND version = ?)",
        )
        .all(row.id, row.skill_id, row.version) as SkillVersionRow[];
      if (existing.length > 0) {
        assertVersionImportMatches(
          "Skill",
          row.id,
          existing.map((value) => this.rowToSkillVersion(value)),
          candidate,
        );
        return this.rowToSkillVersion(existing[0]);
      }
      this.db
        .prepare(INSERT_SKILL_VERSION_SQL)
        .run(
          Object.fromEntries(
            Object.entries(row).map(([key, value]) => [`@${key}`, value]),
          ),
        );
      // Readback catches unsupported text representations before committing.
      const stored = this.db
        .prepare("SELECT * FROM skill_versions WHERE id = ?")
        .get(row.id) as SkillVersionRow | undefined;
      const persisted = stored ? [this.rowToSkillVersion(stored)] : [];
      assertVersionImportMatches("Skill", row.id, persisted, candidate);
      return persisted[0];
    })();
  }

  /**
   * Convert database row to Skill object
   * 数据库行转 Skill 对象
   */
  private rowToSkill(row: SkillRow): Skill {
    let safetyReport: SkillSafetyReport | undefined;
    if (row.safety_report) {
      try {
        safetyReport = JSON.parse(row.safety_report) as SkillSafetyReport;
      } catch {
        // malformed JSON — ignore
      }
    }
    return {
      id: row.id,
      ownerUserId: row.owner_user_id ?? undefined,
      visibility: row.visibility ?? "private",
      name: row.name,
      ...(row.description !== null && { description: row.description }),
      ...(row.content !== null && { content: row.content }),
      ...(row.content !== null && { instructions: row.content }),
      ...(row.mcp_config !== null && { mcp_config: row.mcp_config }),
      protocol_type: row.protocol_type,
      ...(row.version !== null && { version: row.version }),
      ...(row.author !== null && { author: row.author }),
      tags: parseJsonArray<string>(row.tags) ?? [],
      is_favorite: row.is_favorite === 1,
      currentVersion: row.current_version ?? 0,
      versionTrackingEnabled: row.version_tracking_enabled === 1,
      created_at: row.created_at,
      updated_at: row.updated_at,
      source_url: row.source_url || undefined,
      source_id: row.source_id || undefined,
      source_label: row.source_label || undefined,
      source_branch: row.source_branch || undefined,
      source_directory: row.source_directory || undefined,
      canonical_skill_path: row.canonical_skill_path || undefined,
      logical_name: row.logical_name || undefined,
      variant_key: row.variant_key || undefined,
      local_repo_path: row.local_repo_path || undefined,
      directory_fingerprint: row.directory_fingerprint || undefined,
      icon_url: row.icon_url || undefined,
      icon_emoji: row.icon_emoji || undefined,
      icon_background: row.icon_background || undefined,
      category: row.category || "general",
      is_builtin: row.is_builtin === 1,
      registry_slug: row.registry_slug || undefined,
      content_url: row.content_url || undefined,
      installed_content_hash: row.installed_content_hash || undefined,
      installed_directory_fingerprint:
        row.installed_directory_fingerprint || undefined,
      fingerprint_algorithm: row.fingerprint_algorithm || undefined,
      source_last_checked_at: row.source_last_checked_at ?? undefined,
      source_last_error: row.source_last_error || undefined,
      source_binding_state: row.source_binding_state || undefined,
      installed_version: row.installed_version || undefined,
      installed_at: row.installed_at ?? undefined,
      updated_from_store_at: row.updated_from_store_at ?? undefined,
      prerequisites: parseJsonArray<string>(row.prerequisites),
      compatibility: parseJsonArray<string>(row.compatibility),
      original_tags: parseJsonArray<string>(row.original_tags),
      safetyReport,
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
      ...(row.content !== null && { content: row.content }),
      filesSnapshot: parseJsonArray<SkillFileSnapshot>(row.files_snapshot),
      ...(row.note !== null && { note: row.note }),
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}
