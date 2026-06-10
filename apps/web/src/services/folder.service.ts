import { FolderDB } from '@prompthub/db';
import type { CreateFolderDTO, Folder, FolderVisibility, UpdateFolderDTO } from '@prompthub/shared';
import { getServerDatabase } from '../database.js';
import { ErrorCode } from '../utils/response.js';
import { PromptDB } from '@prompthub/db';
import { syncPromptWorkspaceFromDatabase } from './prompt-workspace.js';

export interface FolderActor {
  userId: string;
  role: 'admin' | 'user';
}

export class FolderServiceError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 500,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FolderServiceError';
  }
}

interface FolderRow {
  id: string;
  owner_user_id: string | null;
  visibility: 'private' | 'shared';
}

interface FolderListRow extends FolderRow {
  name: string;
  icon: string | null;
  parent_id: string | null;
  sort_order: number;
  is_private: number;
  created_at: number;
  updated_at: number;
}

type DirectFolderInput = Omit<Folder, 'icon' | 'parentId'> & {
  icon?: string | null;
  parentId?: string | null;
};

function resolveCreateVisibility(data: CreateFolderDTO): FolderVisibility {
  if (data.visibility) {
    return data.visibility;
  }

  return data.isPrivate === false ? 'shared' : 'private';
}

function resolveUpdateVisibility(
  data: UpdateFolderDTO,
  currentVisibility: FolderVisibility,
): { visibility: FolderVisibility; provided: boolean } {
  if (data.visibility) {
    return { visibility: data.visibility, provided: true };
  }

  if (data.isPrivate !== undefined) {
    return { visibility: data.isPrivate ? 'private' : 'shared', provided: true };
  }

  return { visibility: currentVisibility, provided: false };
}

export class FolderService {
  private readonly folderDb = new FolderDB(getServerDatabase());
  private readonly promptDb = new PromptDB(getServerDatabase());
  private readonly db = getServerDatabase();

  create(actor: FolderActor, data: CreateFolderDTO): Folder {
    const visibility = resolveCreateVisibility(data);
    this.assertCreateVisibilityAllowed(actor, visibility);
    this.assertParentAllowed(actor, data.parentId, visibility);

    const folder = this.folderDb.create({
      ...data,
      visibility,
      isPrivate: visibility === 'private',
    });

    this.db
      .prepare('UPDATE folders SET owner_user_id = ?, visibility = ? WHERE id = ?')
      .run(actor.userId, visibility, folder.id);

    syncPromptWorkspaceFromDatabase(this.db, this.promptDb, this.folderDb);

    return this.getById(actor, folder.id);
  }

  list(actor: FolderActor, scope: 'private' | 'shared' | 'all' = 'private'): Folder[] {
    const rows = this.getVisibleFolderRows(actor, scope);
    return rows.map((row) => this.rowToFolder(row));
  }

  getById(actor: FolderActor, id: string): Folder {
    const row = this.getFolderRow(id);
    if (!row) {
      throw new FolderServiceError(404, ErrorCode.NOT_FOUND, 'Folder not found');
    }

    this.assertCanRead(actor, row);

    const folder = this.folderDb.getById(id);
    if (!folder) {
      throw new FolderServiceError(404, ErrorCode.NOT_FOUND, 'Folder not found');
    }

    return {
      ...folder,
      ownerUserId: row.owner_user_id,
      visibility: row.visibility,
    };
  }

  update(actor: FolderActor, id: string, data: UpdateFolderDTO): Folder {
    const row = this.getRequiredFolderRow(id);
    this.assertCanWrite(actor, row);

    const resolvedVisibility = resolveUpdateVisibility(data, row.visibility);
    const nextVisibility = resolvedVisibility.visibility;
    if (nextVisibility !== row.visibility && actor.role !== 'admin') {
      throw new FolderServiceError(403, ErrorCode.FORBIDDEN, 'Only admin can change shared visibility');
    }

    const isParentChanging = data.parentId !== undefined;
    const isVisibilityChanging = nextVisibility !== row.visibility;
    const nextParentId = isParentChanging ? data.parentId ?? undefined : this.getFolderParentId(id);
    if (isParentChanging || isVisibilityChanging) {
      this.assertParentAllowed(actor, nextParentId, nextVisibility);
      this.assertNoParentCycle(id, nextParentId);
      this.assertChildrenVisibilityAllowed(id, nextVisibility);
    }

    const updated = this.folderDb.update(id, {
      ...data,
      isPrivate: resolvedVisibility.provided ? nextVisibility === 'private' : data.isPrivate,
    });

    if (!updated) {
      throw new FolderServiceError(404, ErrorCode.NOT_FOUND, 'Folder not found');
    }

    if (resolvedVisibility.provided) {
      this.db.prepare('UPDATE folders SET visibility = ? WHERE id = ?').run(nextVisibility, id);
    }

    syncPromptWorkspaceFromDatabase(this.db, this.promptDb, this.folderDb);

    return this.getById(actor, id);
  }

  delete(actor: FolderActor, id: string): void {
    const row = this.getRequiredFolderRow(id);
    this.assertCanWrite(actor, row);

    const deleted = this.folderDb.delete(id);
    if (!deleted) {
      throw new FolderServiceError(404, ErrorCode.NOT_FOUND, 'Folder not found');
    }

    syncPromptWorkspaceFromDatabase(this.db, this.promptDb, this.folderDb);
  }

  insertDirect(actor: FolderActor, folder: DirectFolderInput): Folder {
    const visibility = folder.visibility ?? 'private';
    this.assertCreateVisibilityAllowed(actor, visibility);
    this.assertParentAllowed(actor, folder.parentId ?? undefined, visibility);

    this.folderDb.insertFolderDirect({
      ...folder,
      icon: folder.icon ?? undefined,
      parentId: folder.parentId ?? undefined,
      visibility,
      isPrivate: visibility === 'private',
    });
    this.db
      .prepare('UPDATE folders SET owner_user_id = ?, visibility = ? WHERE id = ?')
      .run(actor.userId, visibility, folder.id);

    syncPromptWorkspaceFromDatabase(this.db, this.promptDb, this.folderDb);

    return this.getById(actor, folder.id);
  }

  reorder(actor: FolderActor, ids: string[]): void {
    if (new Set(ids).size !== ids.length) {
      throw new FolderServiceError(422, ErrorCode.VALIDATION_ERROR, 'Folder reorder ids must be unique');
    }

    const rows = ids.map((id) => this.getRequiredFolderRow(id));
    if (rows.length === 0) {
      return;
    }

    const firstVisibility = rows[0].visibility;
    const firstOwner = rows[0].owner_user_id;

    for (const row of rows) {
      this.assertCanWrite(actor, row);

      if (row.visibility !== firstVisibility) {
        throw new FolderServiceError(422, ErrorCode.VALIDATION_ERROR, 'Cannot reorder mixed visibility folders');
      }

      if (firstVisibility === 'private' && row.owner_user_id !== firstOwner) {
        throw new FolderServiceError(422, ErrorCode.VALIDATION_ERROR, 'Cannot reorder folders from different owners');
      }
    }

    this.folderDb.reorder(ids);
    syncPromptWorkspaceFromDatabase(this.db, this.promptDb, this.folderDb);
  }

  private getVisibleFolderRows(actor: FolderActor, scope: 'private' | 'shared' | 'all'): FolderListRow[] {
    if (scope === 'private') {
      return this.db
        .prepare('SELECT * FROM folders WHERE owner_user_id = ? AND visibility = ? ORDER BY sort_order ASC')
        .all(actor.userId, 'private') as FolderListRow[];
    }

    if (scope === 'shared') {
      return this.db
        .prepare("SELECT * FROM folders WHERE visibility = 'shared' ORDER BY sort_order ASC")
        .all() as FolderListRow[];
    }

    return this.db
      .prepare('SELECT * FROM folders WHERE (owner_user_id = ? AND visibility = ?) OR visibility = ? ORDER BY sort_order ASC')
      .all(actor.userId, 'private', 'shared') as FolderListRow[];
  }

  private rowToFolder(row: FolderListRow): Folder {
    return {
      id: row.id,
      ownerUserId: row.owner_user_id,
      visibility: row.visibility,
      name: row.name,
      icon: row.icon ?? undefined,
      parentId: row.parent_id ?? undefined,
      order: row.sort_order,
      isPrivate: !!row.is_private,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at || row.created_at).toISOString(),
    };
  }

  private getFolderRow(id: string): FolderRow | null {
    const row = this.db
      .prepare('SELECT id, owner_user_id, visibility FROM folders WHERE id = ?')
      .get(id) as FolderRow | undefined;
    return row ?? null;
  }

  private getRequiredFolderRow(id: string): FolderRow {
    const row = this.getFolderRow(id);
    if (!row) {
      throw new FolderServiceError(404, ErrorCode.NOT_FOUND, 'Folder not found');
    }
    return row;
  }

  private getFolderParentId(id: string): string | undefined {
    const row = this.db
      .prepare('SELECT parent_id FROM folders WHERE id = ?')
      .get(id) as { parent_id: string | null } | undefined;
    return row?.parent_id ?? undefined;
  }

  private assertNoParentCycle(folderId: string, parentId: string | undefined): void {
    if (!parentId) {
      return;
    }

    const seen = new Set<string>();
    let currentParentId: string | undefined = parentId;

    while (currentParentId) {
      if (currentParentId === folderId || seen.has(currentParentId)) {
        throw new FolderServiceError(
          422,
          ErrorCode.VALIDATION_ERROR,
          'Folder cannot be moved under itself or its descendants',
        );
      }

      seen.add(currentParentId);
      currentParentId = this.getFolderParentId(currentParentId);
    }
  }

  private assertChildrenVisibilityAllowed(folderId: string, visibility: 'private' | 'shared'): void {
    const mismatchedChild = this.db
      .prepare('SELECT id FROM folders WHERE parent_id = ? AND visibility != ? LIMIT 1')
      .get(folderId, visibility) as { id: string } | undefined;

    if (mismatchedChild) {
      throw new FolderServiceError(
        422,
        ErrorCode.VALIDATION_ERROR,
        'Child folder visibility must match parent visibility',
      );
    }
  }

  private assertCanRead(actor: FolderActor, row: FolderRow): void {
    if (row.visibility === 'shared') {
      return;
    }

    if (row.owner_user_id !== actor.userId) {
      throw new FolderServiceError(404, ErrorCode.NOT_FOUND, 'Folder not found');
    }
  }

  private assertCanWrite(actor: FolderActor, row: FolderRow): void {
    if (row.visibility === 'shared') {
      if (actor.role !== 'admin') {
        throw new FolderServiceError(403, ErrorCode.FORBIDDEN, 'Only admin can modify shared folders');
      }
      return;
    }

    if (row.owner_user_id !== actor.userId) {
      throw new FolderServiceError(404, ErrorCode.NOT_FOUND, 'Folder not found');
    }
  }

  private assertCreateVisibilityAllowed(actor: FolderActor, visibility: 'private' | 'shared' | undefined): void {
    if (visibility === 'shared' && actor.role !== 'admin') {
      throw new FolderServiceError(403, ErrorCode.FORBIDDEN, 'Only admin can create shared folders');
    }
  }

  private assertParentAllowed(
    actor: FolderActor,
    parentId: string | undefined,
    visibility: 'private' | 'shared',
  ): void {
    if (!parentId) {
      return;
    }

    const parent = this.getRequiredFolderRow(parentId);
    this.assertCanRead(actor, parent);

    if (parent.visibility !== visibility) {
      throw new FolderServiceError(422, ErrorCode.VALIDATION_ERROR, 'Parent folder visibility must match child visibility');
    }

    if (visibility === 'private' && parent.owner_user_id !== actor.userId) {
      throw new FolderServiceError(422, ErrorCode.VALIDATION_ERROR, 'Private folders must stay under the same owner');
    }
  }
}
