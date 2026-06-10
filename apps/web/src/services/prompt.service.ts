import { FolderDB, PromptDB } from '@prompthub/db';
import type { CreatePromptDTO, Prompt, PromptVersion, SearchQuery, UpdatePromptDTO } from '@prompthub/shared';
import { getServerDatabase } from '../database.js';
import { ErrorCode } from '../utils/response.js';
import { normalizeMediaFileName } from './media-filename.js';
import { syncPromptWorkspaceFromDatabase } from './prompt-workspace.js';

export interface PromptActor {
  userId: string;
  role: 'admin' | 'user';
}

interface PromptRow {
  id: string;
  owner_user_id: string | null;
  visibility: 'private' | 'shared';
}

interface PromptListRow extends PromptRow {
  title: string;
  description: string | null;
  prompt_type: Prompt['promptType'] | null;
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
  created_at: number;
  updated_at: number;
}

interface PromptTagRow extends PromptRow {
  tags: string | null;
}

interface FolderRow {
  id: string;
  owner_user_id: string | null;
  visibility: 'private' | 'shared';
}

export class PromptServiceError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 500,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PromptServiceError';
  }
}

export interface PromptDiffResult {
  from: PromptVersion;
  to: PromptVersion;
  fields: Array<{
    field: 'systemPrompt' | 'systemPromptEn' | 'userPrompt' | 'userPromptEn' | 'variables' | 'aiResponse';
    from: string;
    to: string;
  }>;
}

export interface PromptListResult {
  items: Prompt[];
  total: number;
}

function parseJsonArray<T>(value: string | null | undefined): T[] {
  return JSON.parse(value || '[]') as T[];
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export class PromptService {
  private readonly promptDb = new PromptDB(getServerDatabase());
  private readonly folderDb = new FolderDB(getServerDatabase());
  private readonly db = getServerDatabase();

  create(actor: PromptActor, data: CreatePromptDTO): Prompt {
    const visibility = data.visibility ?? 'private';
    this.assertCanCreate(actor, visibility);
    this.assertFolderAllowed(actor, data.folderId ?? undefined, visibility);
    this.assertMediaReferencesAllowed(data.images, 'image');
    this.assertMediaReferencesAllowed(data.videos, 'video');

    const prompt = this.promptDb.create(data);
    this.db
      .prepare('UPDATE prompts SET owner_user_id = ?, visibility = ? WHERE id = ?')
      .run(actor.userId, visibility, prompt.id);

    syncPromptWorkspaceFromDatabase(this.db, this.promptDb, this.folderDb);

    return this.getById(actor, prompt.id);
  }

  list(actor: PromptActor, query: SearchQuery): PromptListResult {
    const shouldPageInSql = query.sortBy !== 'title' && (query.limit !== undefined || query.offset !== undefined);
    const rows = this.getVisibleRows(actor, query, shouldPageInSql);
    const baseData = rows.map((row) => this.rowToPrompt(row));

    if (shouldPageInSql) {
      return {
        items: baseData,
        total: this.countVisibleRows(actor, query),
      };
    }

    const sorted = query.sortBy === 'title'
      ? this.sortPrompts(baseData, query.sortBy, query.sortOrder)
      : baseData;
    const total = baseData.length;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? sorted.length;
    return {
      items: sorted.slice(offset, offset + limit),
      total,
    };
  }

  getById(actor: PromptActor, id: string): Prompt {
    const row = this.getRow(id);
    if (!row) {
      throw new PromptServiceError(404, ErrorCode.NOT_FOUND, 'Prompt not found');
    }

    this.assertCanRead(actor, row);

    const prompt = this.promptDb.getById(id);
    if (!prompt) {
      throw new PromptServiceError(404, ErrorCode.NOT_FOUND, 'Prompt not found');
    }

    return {
      ...prompt,
      ownerUserId: row.owner_user_id,
      visibility: row.visibility,
    };
  }

  update(actor: PromptActor, id: string, data: UpdatePromptDTO): Prompt {
    const row = this.getRequiredRow(id);
    this.assertCanWrite(actor, row);

    const nextVisibility = data.visibility ?? row.visibility;
    if (nextVisibility !== row.visibility && actor.role !== 'admin') {
      throw new PromptServiceError(403, ErrorCode.FORBIDDEN, 'Only admin can change shared visibility');
    }

    const existing = this.promptDb.getById(id);
    if (!existing) {
      throw new PromptServiceError(404, ErrorCode.NOT_FOUND, 'Prompt not found');
    }
    const nextFolderId = data.folderId !== undefined ? data.folderId : existing.folderId;
    this.assertFolderAllowed(actor, nextFolderId ?? undefined, nextVisibility);
    this.assertMediaReferencesAllowed(data.images, 'image');
    this.assertMediaReferencesAllowed(data.videos, 'video');

    const prompt = this.promptDb.update(id, data);
    if (!prompt) {
      throw new PromptServiceError(404, ErrorCode.NOT_FOUND, 'Prompt not found');
    }

    if (data.visibility !== undefined) {
      this.db.prepare('UPDATE prompts SET visibility = ? WHERE id = ?').run(data.visibility, id);
    }

    syncPromptWorkspaceFromDatabase(this.db, this.promptDb, this.folderDb);

    return this.getById(actor, id);
  }

  delete(actor: PromptActor, id: string): void {
    const row = this.getRequiredRow(id);
    this.assertCanWrite(actor, row);

    const deleted = this.promptDb.delete(id);
    if (!deleted) {
      throw new PromptServiceError(404, ErrorCode.NOT_FOUND, 'Prompt not found');
    }

    syncPromptWorkspaceFromDatabase(this.db, this.promptDb, this.folderDb);
  }

  insertDirect(actor: PromptActor, prompt: Prompt): Prompt {
    const visibility = prompt.visibility ?? 'private';
    this.assertCanCreate(actor, visibility);

    this.promptDb.insertPromptDirect({
      ...prompt,
      visibility,
    });
    this.db
      .prepare('UPDATE prompts SET owner_user_id = ?, visibility = ? WHERE id = ?')
      .run(actor.userId, visibility, prompt.id);

    syncPromptWorkspaceFromDatabase(this.db, this.promptDb, this.folderDb);

    return this.getById(actor, prompt.id);
  }

  duplicate(actor: PromptActor, id: string): Prompt {
    const existing = this.getById(actor, id);
    const folderId = this.getCopyFolderId(actor, existing.folderId ?? undefined);

    const duplicated = this.promptDb.create({
      title: `${existing.title} (Copy)`,
      description: existing.description ?? undefined,
      promptType: existing.promptType,
      systemPrompt: existing.systemPrompt ?? undefined,
      systemPromptEn: existing.systemPromptEn ?? undefined,
      userPrompt: existing.userPrompt,
      userPromptEn: existing.userPromptEn ?? undefined,
      variables: existing.variables,
      tags: existing.tags,
      folderId,
      images: existing.images,
      videos: existing.videos,
      source: existing.source ?? undefined,
      notes: existing.notes ?? undefined,
    });

    this.db
      .prepare('UPDATE prompts SET owner_user_id = ?, visibility = ? WHERE id = ?')
      .run(actor.userId, 'private', duplicated.id);

    syncPromptWorkspaceFromDatabase(this.db, this.promptDb, this.folderDb);

    return this.getById(actor, duplicated.id);
  }

  getVersions(actor: PromptActor, id: string): PromptVersion[] {
    this.getById(actor, id);
    return this.promptDb.getVersions(id);
  }

  createVersion(actor: PromptActor, id: string, note?: string): PromptVersion {
    const row = this.getRequiredRow(id);
    this.assertCanWrite(actor, row);

    const version = this.promptDb.createVersion(id, note);
    if (!version) {
      throw new PromptServiceError(404, ErrorCode.NOT_FOUND, 'Prompt not found');
    }

    syncPromptWorkspaceFromDatabase(this.db, this.promptDb, this.folderDb);

    return version;
  }

  insertVersionDirect(actor: PromptActor, version: PromptVersion): PromptVersion {
    const row = this.getRequiredRow(version.promptId);
    this.assertCanWrite(actor, row);

    this.promptDb.insertVersionDirect(version);
    syncPromptWorkspaceFromDatabase(this.db, this.promptDb, this.folderDb);

    return version;
  }

  deleteVersionById(actor: PromptActor, versionId: string): void {
    const row = this.db
      .prepare(
        `SELECT prompts.id, prompts.owner_user_id, prompts.visibility
         FROM prompt_versions
         JOIN prompts ON prompts.id = prompt_versions.prompt_id
         WHERE prompt_versions.id = ?`,
      )
      .get(versionId) as PromptRow | undefined;

    if (!row) {
      throw new PromptServiceError(404, ErrorCode.NOT_FOUND, 'Prompt version not found');
    }

    this.assertCanWrite(actor, row);

    const deleted = this.promptDb.deleteVersion(versionId);
    if (!deleted) {
      throw new PromptServiceError(404, ErrorCode.NOT_FOUND, 'Prompt version not found');
    }

    syncPromptWorkspaceFromDatabase(this.db, this.promptDb, this.folderDb);
  }

  deleteVersion(actor: PromptActor, id: string, versionId: string): void {
    const row = this.getRequiredRow(id);
    this.assertCanWrite(actor, row);

    const versionRow = this.db
      .prepare('SELECT prompt_id FROM prompt_versions WHERE id = ?')
      .get(versionId) as { prompt_id: string } | undefined;
    if (!versionRow || versionRow.prompt_id !== id) {
      throw new PromptServiceError(404, ErrorCode.NOT_FOUND, 'Prompt version not found');
    }

    const deleted = this.promptDb.deleteVersion(versionId);
    if (!deleted) {
      throw new PromptServiceError(404, ErrorCode.NOT_FOUND, 'Prompt version not found');
    }

    syncPromptWorkspaceFromDatabase(this.db, this.promptDb, this.folderDb);
  }

  rollback(actor: PromptActor, id: string, version: number): Prompt {
    const row = this.getRequiredRow(id);
    this.assertCanWrite(actor, row);

    const prompt = this.promptDb.rollback(id, version);
    if (!prompt) {
      throw new PromptServiceError(404, ErrorCode.NOT_FOUND, 'Prompt version not found');
    }

    syncPromptWorkspaceFromDatabase(this.db, this.promptDb, this.folderDb);

    return this.getById(actor, id);
  }

  diff(actor: PromptActor, id: string, fromVersion: number, toVersion: number): PromptDiffResult {
    this.getById(actor, id);

    const versions = this.promptDb.getVersions(id);
    const from = versions.find((version) => version.version === fromVersion);
    const to = versions.find((version) => version.version === toVersion);

    if (!from || !to) {
      throw new PromptServiceError(404, ErrorCode.NOT_FOUND, 'Prompt version not found');
    }

    const fields: PromptDiffResult['fields'] = [];

    this.pushDiff(fields, 'systemPrompt', from.systemPrompt, to.systemPrompt);
    this.pushDiff(fields, 'systemPromptEn', from.systemPromptEn, to.systemPromptEn);
    this.pushDiff(fields, 'userPrompt', from.userPrompt, to.userPrompt);
    this.pushDiff(fields, 'userPromptEn', from.userPromptEn, to.userPromptEn);
    this.pushDiff(fields, 'variables', JSON.stringify(from.variables), JSON.stringify(to.variables));
    this.pushDiff(fields, 'aiResponse', from.aiResponse, to.aiResponse);

    return { from, to, fields };
  }

  getAllTags(actor: PromptActor): string[] {
    const tagSet = new Set<string>();

    for (const row of this.getTagRowsForRead(actor)) {
      for (const tag of this.parseTags(row.tags)) {
        tagSet.add(tag);
      }
    }

    return Array.from(tagSet).sort((left, right) => left.localeCompare(right));
  }

  renameTag(actor: PromptActor, oldTag: string, newTag: string): void {
    if (!oldTag || !newTag || oldTag === newTag) {
      return;
    }

    this.updateScopedTags(actor, (tags) => {
      if (!tags.includes(oldTag)) {
        return null;
      }

      return Array.from(new Set(tags.map((tag) => (tag === oldTag ? newTag : tag))));
    });
    syncPromptWorkspaceFromDatabase(this.db, this.promptDb, this.folderDb);
  }

  deleteTag(actor: PromptActor, tag: string): void {
    if (!tag) {
      return;
    }

    this.updateScopedTags(actor, (tags) => {
      if (!tags.includes(tag)) {
        return null;
      }

      return tags.filter((item) => item !== tag);
    });
    syncPromptWorkspaceFromDatabase(this.db, this.promptDb, this.folderDb);
  }

  syncWorkspace(): void {
    syncPromptWorkspaceFromDatabase(this.db, this.promptDb, this.folderDb);
  }

  private getVisibleRows(actor: PromptActor, query: SearchQuery, paginateInSql: boolean): PromptListRow[] {
    const filter = this.buildPromptListFilter(actor, query);
    let sql = `SELECT * FROM prompts WHERE ${filter.whereSql}`;

    if (query.sortBy !== 'title') {
      sql += ` ${this.getPromptListOrderSql(query)}`;
    }

    if (paginateInSql) {
      if (query.limit !== undefined) {
        sql += ' LIMIT ?';
        filter.params.push(query.limit);
      } else {
        sql += ' LIMIT -1';
      }

      if (query.offset !== undefined) {
        sql += ' OFFSET ?';
        filter.params.push(query.offset);
      }
    }

    return this.db.prepare(sql).all(...filter.params) as PromptListRow[];
  }

  private countVisibleRows(actor: PromptActor, query: SearchQuery): number {
    const filter = this.buildPromptListFilter(actor, query);
    const row = this.db
      .prepare(`SELECT COUNT(*) as total FROM prompts WHERE ${filter.whereSql}`)
      .get(...filter.params) as { total: number } | undefined;
    return row?.total ?? 0;
  }

  private buildPromptListFilter(actor: PromptActor, query: SearchQuery): {
    whereSql: string;
    params: Array<string | number>;
  } {
    const scope = query.scope ?? 'private';
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (scope === 'private') {
      clauses.push('owner_user_id = ? AND visibility = ?');
      params.push(actor.userId, 'private');
    } else if (scope === 'shared') {
      clauses.push("visibility = 'shared'");
    } else {
      clauses.push('((owner_user_id = ? AND visibility = ?) OR visibility = ?)');
      params.push(actor.userId, 'private', 'shared');
    }

    if (query.keyword) {
      const needle = `%${escapeLikePattern(query.keyword.toLowerCase())}%`;
      clauses.push(
        `(LOWER(COALESCE(title, '')) LIKE ? ESCAPE '\\'
          OR LOWER(COALESCE(description, '')) LIKE ? ESCAPE '\\'
          OR LOWER(COALESCE(system_prompt, '')) LIKE ? ESCAPE '\\'
          OR LOWER(COALESCE(user_prompt, '')) LIKE ? ESCAPE '\\'
          OR LOWER(COALESCE(tags, '')) LIKE ? ESCAPE '\\')`,
      );
      params.push(needle, needle, needle, needle, needle);
    }

    for (const tag of query.tags ?? []) {
      clauses.push("tags LIKE ? ESCAPE '\\'");
      params.push(`%${escapeLikePattern(JSON.stringify(tag))}%`);
    }

    if (query.folderId) {
      clauses.push('folder_id = ?');
      params.push(query.folderId);
    }

    if (query.isFavorite !== undefined) {
      clauses.push('is_favorite = ?');
      params.push(query.isFavorite ? 1 : 0);
    }

    return {
      whereSql: clauses.join(' AND '),
      params,
    };
  }

  private getPromptListOrderSql(query: SearchQuery): string {
    const sortColumn = {
      title: 'title',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      usageCount: 'usage_count',
    }[query.sortBy ?? 'updatedAt'] ?? 'updated_at';
    const sortOrder = query.sortOrder === 'asc' ? 'ASC' : 'DESC';
    return `ORDER BY ${sortColumn} ${sortOrder}`;
  }

  private rowToPrompt(row: PromptListRow): Prompt {
    return {
      id: row.id,
      ownerUserId: row.owner_user_id,
      visibility: row.visibility,
      title: row.title,
      description: row.description,
      promptType: row.prompt_type || 'text',
      systemPrompt: row.system_prompt,
      systemPromptEn: row.system_prompt_en,
      userPrompt: row.user_prompt,
      userPromptEn: row.user_prompt_en,
      variables: parseJsonArray(row.variables),
      tags: parseJsonArray(row.tags),
      folderId: row.folder_id,
      images: parseJsonArray(row.images),
      videos: parseJsonArray(row.videos),
      isFavorite: row.is_favorite === 1,
      isPinned: row.is_pinned === 1,
      version: row.current_version,
      currentVersion: row.current_version,
      usageCount: row.usage_count,
      source: row.source,
      notes: row.notes,
      lastAiResponse: row.last_ai_response,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private getTagRowsForRead(actor: PromptActor): PromptTagRow[] {
    return this.db
      .prepare(
        `SELECT id, owner_user_id, visibility, tags
         FROM prompts
         WHERE tags IS NOT NULL
           AND tags != '[]'
           AND ((owner_user_id = ? AND visibility = ?) OR visibility = ?)
         ORDER BY updated_at DESC`,
      )
      .all(actor.userId, 'private', 'shared') as PromptTagRow[];
  }

  private getTagRowsForWrite(actor: PromptActor): PromptTagRow[] {
    if (actor.role === 'admin') {
      return this.db
        .prepare(
          `SELECT id, owner_user_id, visibility, tags
           FROM prompts
           WHERE tags IS NOT NULL
             AND tags != '[]'
             AND ((owner_user_id = ? AND visibility = ?) OR visibility = ?)
           ORDER BY updated_at DESC`,
        )
        .all(actor.userId, 'private', 'shared') as PromptTagRow[];
    }

    return this.db
      .prepare(
        `SELECT id, owner_user_id, visibility, tags
         FROM prompts
         WHERE tags IS NOT NULL
           AND tags != '[]'
           AND owner_user_id = ?
           AND visibility = ?
         ORDER BY updated_at DESC`,
      )
      .all(actor.userId, 'private') as PromptTagRow[];
  }

  private parseTags(rawTags: string | null): string[] {
    try {
      const tags = JSON.parse(rawTags ?? '[]');
      if (!Array.isArray(tags)) {
        return [];
      }

      return tags
        .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
        .map((tag) => tag.trim());
    } catch {
      return [];
    }
  }

  private updateScopedTags(
    actor: PromptActor,
    update: (tags: string[]) => string[] | null,
  ): void {
    const rows = this.getTagRowsForWrite(actor);
    const updateStmt = this.db.prepare(`
      UPDATE prompts
      SET tags = ?, current_version = current_version + 1, updated_at = ?
      WHERE id = ?
    `);
    const now = Date.now();

    const transaction = this.db.transaction(() => {
      for (const row of rows) {
        const nextTags = update(this.parseTags(row.tags));
        if (!nextTags) {
          continue;
        }

        updateStmt.run(JSON.stringify(nextTags), now, row.id);
      }
    });

    transaction();
  }

  private getRow(id: string): PromptRow | null {
    const row = this.db
      .prepare('SELECT id, owner_user_id, visibility FROM prompts WHERE id = ?')
      .get(id) as PromptRow | undefined;
    return row ?? null;
  }

  private getRequiredRow(id: string): PromptRow {
    const row = this.getRow(id);
    if (!row) {
      throw new PromptServiceError(404, ErrorCode.NOT_FOUND, 'Prompt not found');
    }
    return row;
  }

  private assertCanCreate(actor: PromptActor, visibility: 'private' | 'shared'): void {
    if (visibility === 'shared' && actor.role !== 'admin') {
      throw new PromptServiceError(403, ErrorCode.FORBIDDEN, 'Only admin can create shared prompts');
    }
  }

  private getFolderRow(id: string): FolderRow | null {
    const row = this.db
      .prepare('SELECT id, owner_user_id, visibility FROM folders WHERE id = ?')
      .get(id) as FolderRow | undefined;
    return row ?? null;
  }

  private assertFolderAllowed(
    actor: PromptActor,
    folderId: string | undefined,
    visibility: 'private' | 'shared',
  ): void {
    if (!folderId) {
      return;
    }

    const folder = this.getFolderRow(folderId);
    if (!folder) {
      throw new PromptServiceError(404, ErrorCode.NOT_FOUND, 'Folder not found');
    }

    if (folder.visibility === 'private' && folder.owner_user_id !== actor.userId) {
      throw new PromptServiceError(404, ErrorCode.NOT_FOUND, 'Folder not found');
    }

    if (folder.visibility !== visibility) {
      throw new PromptServiceError(422, ErrorCode.VALIDATION_ERROR, 'Prompt folder visibility must match prompt visibility');
    }
  }

  private getCopyFolderId(actor: PromptActor, folderId: string | undefined): string | undefined {
    try {
      this.assertFolderAllowed(actor, folderId, 'private');
      return folderId;
    } catch (routeError) {
      if (routeError instanceof PromptServiceError) {
        return undefined;
      }
      throw routeError;
    }
  }

  private assertMediaReferencesAllowed(
    fileNames: string[] | undefined,
    label: 'image' | 'video',
  ): void {
    for (const fileName of fileNames ?? []) {
      try {
        normalizeMediaFileName(fileName, `Invalid ${label} filename`);
      } catch {
        throw new PromptServiceError(422, ErrorCode.VALIDATION_ERROR, `Invalid ${label} filename: ${fileName}`);
      }
    }
  }

  private assertCanRead(actor: PromptActor, row: PromptRow): void {
    if (row.visibility === 'shared') {
      return;
    }

    if (row.owner_user_id !== actor.userId) {
      throw new PromptServiceError(404, ErrorCode.NOT_FOUND, 'Prompt not found');
    }
  }

  private assertCanWrite(actor: PromptActor, row: PromptRow): void {
    if (row.visibility === 'shared') {
      if (actor.role !== 'admin') {
        throw new PromptServiceError(403, ErrorCode.FORBIDDEN, 'Only admin can modify shared prompts');
      }
      return;
    }

    if (row.owner_user_id !== actor.userId) {
      throw new PromptServiceError(404, ErrorCode.NOT_FOUND, 'Prompt not found');
    }
  }

  private sortPrompts(
    prompts: Prompt[],
    sortBy: SearchQuery['sortBy'],
    sortOrder: SearchQuery['sortOrder'],
  ): Prompt[] {
    const direction = sortOrder === 'asc' ? 1 : -1;
    const copy = [...prompts];

    copy.sort((a, b) => {
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title) * direction;
      }

      if (sortBy === 'usageCount') {
        return (a.usageCount - b.usageCount) * direction;
      }

      if (sortBy === 'createdAt') {
        return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * direction;
      }

      return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * direction;
    });

    return copy;
  }

  private pushDiff(
    fields: PromptDiffResult['fields'],
    field: PromptDiffResult['fields'][number]['field'],
    from: string | null | undefined,
    to: string | null | undefined,
  ): void {
    const fromValue = from ?? '';
    const toValue = to ?? '';

    if (fromValue !== toValue) {
      fields.push({ field, from: fromValue, to: toValue });
    }
  }
}
