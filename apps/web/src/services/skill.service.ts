import { SkillDB } from '@prompthub/db';
import type {
  CreateSkillParams,
  Skill,
  SkillSafetyReport,
  SkillSafetyScanInput,
  SkillVersion,
  UpdateSkillParams,
} from '@prompthub/shared';
import { getServerDatabase } from '../database.js';
import { ErrorCode } from '../utils/response.js';
import { requestRemoteBuffered } from '../utils/remote-http.js';
import { ensureSkillName } from '../utils/skill-name.js';
import {
  parseRemoteSkill,
  scanSkillContentWithAI,
} from './skill-content.service.js';
import { collectSkillUrlMetadataIssues } from './skill-url-validation.js';
import { syncSkillWorkspaceFromDatabase } from './skill-workspace.js';

export interface SkillActor {
  userId: string;
  role: 'admin' | 'user';
}

export class SkillServiceError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 500,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SkillServiceError';
  }
}

interface SkillRow {
  id: string;
  owner_user_id: string | null;
  visibility: 'private' | 'shared';
}

interface SkillListRow extends SkillRow {
  name: string;
  description: string | null;
  content: string | null;
  mcp_config: string | null;
  protocol_type: Skill['protocol_type'];
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
  local_repo_path: string | null;
  directory_fingerprint: string | null;
  installed_content_hash: string | null;
  installed_version: string | null;
  installed_at: number | null;
  updated_from_store_at: number | null;
  icon_url: string | null;
  icon_emoji: string | null;
  icon_background: string | null;
  category: Skill['category'] | null;
  is_builtin: number;
  registry_slug: string | null;
  content_url: string | null;
  prerequisites: string | null;
  compatibility: string | null;
  current_version: number | null;
  version_tracking_enabled: number | null;
  created_at: number;
  updated_at: number;
  safety_report: string | null;
}

const MAX_SKILL_METADATA_TAGS = 100;
const MAX_SKILL_METADATA_TAG_LENGTH = 100;
const MAX_SKILL_METADATA_DETAILS = 50;
const MAX_SKILL_METADATA_DETAIL_LENGTH = 500;

function parseJsonArray<T>(value: string | null | undefined): T[] | undefined {
  return value ? (JSON.parse(value) as T[]) : undefined;
}

export class SkillService {
  private readonly skillDb = new SkillDB(getServerDatabase());
  private readonly db = getServerDatabase();

  private syncWorkspace(): void {
    syncSkillWorkspaceFromDatabase(this.db, this.skillDb);
  }

  create(actor: SkillActor, data: CreateSkillParams): Skill {
    const visibility = data.visibility ?? 'shared';
    this.assertCanCreate(actor, visibility);
    this.assertMetadataArraysAllowed(data);
    this.assertUrlMetadataAllowed(data);

    const skill = this.skillDb.create({
      ...data,
      visibility,
    });

    this.db
      .prepare('UPDATE skills SET owner_user_id = ?, visibility = ? WHERE id = ?')
      .run(actor.userId, visibility, skill.id);

    this.syncWorkspace();

    return this.getById(actor, skill.id);
  }

  list(actor: SkillActor, scope: 'private' | 'shared' | 'all' = 'shared'): Skill[] {
    const rows = this.getVisibleSkillRows(actor, scope);
    return rows.map((row) => this.rowToSkill(row));
  }

  getById(actor: SkillActor, id: string): Skill {
    const row = this.getRow(id);
    if (!row) {
      throw new SkillServiceError(404, ErrorCode.NOT_FOUND, 'Skill not found');
    }

    this.assertCanRead(actor, row);

    const skill = this.skillDb.getById(id);
    if (!skill) {
      throw new SkillServiceError(404, ErrorCode.NOT_FOUND, 'Skill not found');
    }

    return {
      ...skill,
      ownerUserId: row.owner_user_id,
      visibility: row.visibility,
    };
  }

  update(actor: SkillActor, id: string, data: UpdateSkillParams): Skill {
    const row = this.getRequiredRow(id);
    this.assertCanWrite(actor, row);
    this.assertMetadataArraysAllowed(data);
    this.assertUrlMetadataAllowed(data);

    const nextVisibility = data.visibility ?? row.visibility;
    if (nextVisibility !== row.visibility && actor.role !== 'admin') {
      throw new SkillServiceError(403, ErrorCode.FORBIDDEN, 'Only admin can change shared visibility');
    }

    const updated = this.skillDb.update(id, data);
    if (!updated) {
      throw new SkillServiceError(404, ErrorCode.NOT_FOUND, 'Skill not found');
    }

    if (data.visibility !== undefined) {
      this.db.prepare('UPDATE skills SET visibility = ? WHERE id = ?').run(data.visibility, id);
    }

    this.syncWorkspace();

    return this.getById(actor, id);
  }

  delete(actor: SkillActor, id: string): void {
    const row = this.getRequiredRow(id);
    this.assertCanWrite(actor, row);

    const deleted = this.skillDb.delete(id);
    if (!deleted) {
      throw new SkillServiceError(404, ErrorCode.NOT_FOUND, 'Skill not found');
    }

    this.syncWorkspace();
  }

  deleteAll(actor: SkillActor, confirm: boolean): void {
    if (!confirm) {
      throw new SkillServiceError(422, ErrorCode.VALIDATION_ERROR, 'confirm=true is required');
    }

    if (actor.role !== 'admin') {
      throw new SkillServiceError(403, ErrorCode.FORBIDDEN, 'Only admin can delete all skills');
    }

    this.skillDb.deleteAll();
    this.syncWorkspace();
  }

  getVersions(actor: SkillActor, skillId: string): SkillVersion[] {
    this.getById(actor, skillId);
    return this.skillDb.getVersions(skillId);
  }

  createVersion(actor: SkillActor, skillId: string, note?: string): SkillVersion {
    const row = this.getRequiredRow(skillId);
    this.assertCanWrite(actor, row);

    const version = this.skillDb.createVersion(skillId, note);
    if (!version) {
      throw new SkillServiceError(404, ErrorCode.NOT_FOUND, 'Skill not found');
    }

    this.syncWorkspace();

    return version;
  }

  rollback(actor: SkillActor, skillId: string, version: number): Skill {
    const row = this.getRequiredRow(skillId);
    this.assertCanWrite(actor, row);

    const skill = this.skillDb.rollbackVersion(skillId, version);
    if (!skill) {
      throw new SkillServiceError(404, ErrorCode.NOT_FOUND, 'Skill version not found');
    }

    this.syncWorkspace();

    return this.getById(actor, skillId);
  }

  deleteVersion(actor: SkillActor, skillId: string, versionId: string): void {
    const row = this.getRequiredRow(skillId);
    this.assertCanWrite(actor, row);

    const deleted = this.skillDb.deleteVersion(skillId, versionId);
    if (!deleted) {
      throw new SkillServiceError(404, ErrorCode.NOT_FOUND, 'Skill version not found');
    }

    this.syncWorkspace();
  }

  saveSafetyReport(actor: SkillActor, skillId: string, report: SkillSafetyReport): Skill {
    const row = this.getRequiredRow(skillId);
    this.assertCanWrite(actor, row);

    const updated = this.skillDb.update(skillId, { safetyReport: report });
    if (!updated) {
      throw new SkillServiceError(404, ErrorCode.NOT_FOUND, 'Skill not found');
    }

    this.syncWorkspace();

    return this.getById(actor, skillId);
  }

  async scanSafety(
    actor: SkillActor,
    skillId: string,
    overrides: Partial<SkillSafetyScanInput> = {},
  ): Promise<SkillSafetyReport> {
    const skill = this.getById(actor, skillId);
    const input: SkillSafetyScanInput = {
      name: overrides.name ?? skill.name,
      content: overrides.content ?? skill.content ?? skill.instructions ?? '',
      sourceUrl: overrides.sourceUrl ?? skill.source_url,
      contentUrl: overrides.contentUrl ?? skill.content_url,
      localRepoPath: overrides.localRepoPath,
      securityAudits: overrides.securityAudits,
      aiConfig: overrides.aiConfig,
    };

    return scanSkillContentWithAI(input);
  }

  async scanSafetyInput(input: SkillSafetyScanInput): Promise<SkillSafetyReport> {
    return scanSkillContentWithAI(input);
  }

  async fetchRemote(
    actor: SkillActor,
    payload: {
      url: string;
      importToLibrary?: boolean;
      name?: string;
      description?: string;
      visibility?: 'private' | 'shared';
    },
  ): Promise<{
    content: string;
    metadata: {
      name?: string;
      description?: string;
      version?: string;
      author?: string;
      tags?: string[];
    };
    importedSkill?: Skill;
  }> {
    this.assertHttpsRemoteSkillUrl(payload.url);

    const response = await requestRemoteBuffered({
      url: payload.url,
      method: 'GET',
      headers: {
        Accept: 'text/plain, text/markdown, application/octet-stream;q=0.8, */*;q=0.1',
        'User-Agent': 'PromptHub/web-remote-skill-fetch',
      },
      allowedProtocols: ['https:'],
      maxBytes: 5 * 1024 * 1024,
    });

    if (response.status !== 200) {
      throw new SkillServiceError(422, ErrorCode.VALIDATION_ERROR, `Remote fetch failed with HTTP ${response.status}`);
    }

    const content = response.body.toString('utf-8');
    const parsed = parseRemoteSkill(content);

    let importedSkill: Skill | undefined;
    if (payload.importToLibrary) {
      const name = ensureSkillName(payload.name ?? parsed.name ?? '', new URL(payload.url).pathname.split('/').pop() ?? 'remote-skill');
      const visibility = payload.visibility ?? (actor.role === 'admin' ? 'shared' : 'private');
      importedSkill = this.create(actor, {
        name,
        description: payload.description ?? parsed.description,
        content,
        instructions: parsed.body || content,
        protocol_type: 'skill',
        version: parsed.version,
        author: parsed.author,
        tags: parsed.tags,
        source_url: payload.url,
        content_url: payload.url,
        visibility,
        is_favorite: false,
      });
    }

    return {
      content,
      metadata: {
        name: parsed.name,
        description: parsed.description,
        version: parsed.version,
        author: parsed.author,
        tags: parsed.tags,
      },
      importedSkill,
    };
  }

  private getVisibleSkillRows(actor: SkillActor, scope: 'private' | 'shared' | 'all'): SkillListRow[] {
    if (scope === 'private') {
      return this.db
        .prepare('SELECT * FROM skills WHERE owner_user_id = ? AND visibility = ? ORDER BY updated_at DESC')
        .all(actor.userId, 'private') as SkillListRow[];
    }

    if (scope === 'shared') {
      return this.db
        .prepare("SELECT * FROM skills WHERE visibility = 'shared' ORDER BY updated_at DESC")
        .all() as SkillListRow[];
    }

    return this.db
      .prepare('SELECT * FROM skills WHERE (owner_user_id = ? AND visibility = ?) OR visibility = ? ORDER BY updated_at DESC')
      .all(actor.userId, 'private', 'shared') as SkillListRow[];
  }

  private getRow(id: string): SkillRow | null {
    const row = this.db
      .prepare('SELECT id, owner_user_id, visibility FROM skills WHERE id = ?')
      .get(id) as SkillRow | undefined;
    return row ?? null;
  }

  private getRequiredRow(id: string): SkillRow {
    const row = this.getRow(id);
    if (!row) {
      throw new SkillServiceError(404, ErrorCode.NOT_FOUND, 'Skill not found');
    }
    return row;
  }

  private assertCanCreate(actor: SkillActor, visibility: 'private' | 'shared'): void {
    if (visibility === 'shared' && actor.role !== 'admin') {
      throw new SkillServiceError(403, ErrorCode.FORBIDDEN, 'Only admin can create shared skills');
    }
  }

  private rowToSkill(row: SkillListRow): Skill {
    let safetyReport: SkillSafetyReport | undefined;
    if (row.safety_report) {
      try {
        safetyReport = JSON.parse(row.safety_report) as SkillSafetyReport;
      } catch {
        safetyReport = undefined;
      }
    }

    return {
      id: row.id,
      ownerUserId: row.owner_user_id,
      visibility: row.visibility,
      name: row.name,
      ...(row.description !== null && { description: row.description }),
      ...(row.content !== null && { content: row.content, instructions: row.content }),
      ...(row.mcp_config !== null && { mcp_config: row.mcp_config }),
      protocol_type: row.protocol_type,
      ...(row.version !== null && { version: row.version }),
      ...(row.author !== null && { author: row.author }),
      tags: parseJsonArray<string>(row.tags) ?? [],
      original_tags: parseJsonArray<string>(row.original_tags),
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
      local_repo_path: row.local_repo_path || undefined,
      directory_fingerprint: row.directory_fingerprint || undefined,
      icon_url: row.icon_url || undefined,
      icon_emoji: row.icon_emoji || undefined,
      icon_background: row.icon_background || undefined,
      category: row.category || 'general',
      is_builtin: row.is_builtin === 1,
      registry_slug: row.registry_slug || undefined,
      content_url: row.content_url || undefined,
      installed_content_hash: row.installed_content_hash || undefined,
      installed_version: row.installed_version || undefined,
      installed_at: row.installed_at ?? undefined,
      updated_from_store_at: row.updated_from_store_at ?? undefined,
      prerequisites: parseJsonArray<string>(row.prerequisites),
      compatibility: parseJsonArray<string>(row.compatibility),
      safetyReport,
    };
  }

  private assertHttpsRemoteSkillUrl(url: string): void {
    if (new URL(url).protocol !== 'https:') {
      throw new SkillServiceError(422, ErrorCode.VALIDATION_ERROR, 'Remote skill URL must use HTTPS');
    }
  }

  private assertMetadataArraysAllowed(data: Pick<
    CreateSkillParams,
    'tags' | 'original_tags' | 'prerequisites' | 'compatibility'
  >): void {
    this.assertBoundedMetadataArray(data.tags, 'tags', MAX_SKILL_METADATA_TAGS, MAX_SKILL_METADATA_TAG_LENGTH);
    this.assertBoundedMetadataArray(
      data.original_tags,
      'original_tags',
      MAX_SKILL_METADATA_TAGS,
      MAX_SKILL_METADATA_TAG_LENGTH,
    );
    this.assertBoundedMetadataArray(
      data.prerequisites,
      'prerequisites',
      MAX_SKILL_METADATA_DETAILS,
      MAX_SKILL_METADATA_DETAIL_LENGTH,
    );
    this.assertBoundedMetadataArray(
      data.compatibility,
      'compatibility',
      MAX_SKILL_METADATA_DETAILS,
      MAX_SKILL_METADATA_DETAIL_LENGTH,
    );
  }

  private assertUrlMetadataAllowed(data: Pick<
    CreateSkillParams,
    'source_url' | 'content_url' | 'icon_url'
  >): void {
    const issues = collectSkillUrlMetadataIssues(data);
    if (issues.length === 0) {
      return;
    }

    throw new SkillServiceError(
      422,
      ErrorCode.VALIDATION_ERROR,
      issues.map((issue) => issue.message).join('; '),
    );
  }

  private assertBoundedMetadataArray(
    values: string[] | undefined,
    fieldName: string,
    maxItems: number,
    maxLength: number,
  ): void {
    if (values === undefined) {
      return;
    }

    if (!Array.isArray(values) || values.length > maxItems) {
      throw new SkillServiceError(
        422,
        ErrorCode.VALIDATION_ERROR,
        `${fieldName} must contain at most ${maxItems} entries`,
      );
    }

    for (const value of values) {
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new SkillServiceError(
          422,
          ErrorCode.VALIDATION_ERROR,
          `${fieldName} entries must be non-empty strings`,
        );
      }
      if (value.trim().length > maxLength) {
        throw new SkillServiceError(
          422,
          ErrorCode.VALIDATION_ERROR,
          `${fieldName} entries must be at most ${maxLength} characters`,
        );
      }
    }
  }

  private assertCanRead(actor: SkillActor, row: SkillRow): void {
    if (row.visibility === 'shared') {
      return;
    }

    if (row.owner_user_id !== actor.userId) {
      throw new SkillServiceError(404, ErrorCode.NOT_FOUND, 'Skill not found');
    }
  }

  private assertCanWrite(actor: SkillActor, row: SkillRow): void {
    if (row.visibility === 'shared') {
      if (actor.role !== 'admin') {
        throw new SkillServiceError(403, ErrorCode.FORBIDDEN, 'Only admin can modify shared skills');
      }
      return;
    }

    if (row.owner_user_id !== actor.userId) {
      throw new SkillServiceError(404, ErrorCode.NOT_FOUND, 'Skill not found');
    }
  }
}
