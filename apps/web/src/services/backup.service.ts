import { FolderDB, PromptDB, SkillDB } from '@prompthub/db';
import type {
  Folder,
  Prompt,
  PromptVersion,
  Settings,
  Skill,
  SkillSafetyReport,
  SkillVersion,
} from '@prompthub/shared';
import { getServerDatabase } from '../database.js';
import { SettingsService } from './settings.service.js';
import { syncPromptWorkspaceFromDatabase } from './prompt-workspace.js';
import { syncSkillWorkspaceFromDatabase } from './skill-workspace.js';

export interface BackupActor {
  userId: string;
  role: 'admin' | 'user';
}

export interface WebBackupPayload {
  version: string;
  exportedAt: string;
  prompts: Prompt[];
  promptVersions: PromptVersion[];
  versions?: PromptVersion[];
  folders: Folder[];
  skills: Skill[];
  skillVersions: SkillVersion[];
  settings: Settings;
  settingsUpdatedAt?: string;
}

export interface BackupImportResult {
  promptsImported: number;
  foldersImported: number;
  skillsImported: number;
  settingsUpdated: boolean;
}

interface PromptRecordRow {
  id: string;
  owner_user_id: string | null;
  visibility: 'private' | 'shared';
}

interface FolderRecordRow {
  id: string;
  owner_user_id: string | null;
  visibility: 'private' | 'shared';
}

interface SkillRecordRow {
  id: string;
  owner_user_id: string | null;
  visibility: 'private' | 'shared';
}

export class BackupService {
  private readonly db = getServerDatabase();
  private readonly promptDb = new PromptDB(this.db);
  private readonly folderDb = new FolderDB(this.db);
  private readonly skillDb = new SkillDB(this.db);
  private readonly settingsService = new SettingsService();

  export(actor: BackupActor): WebBackupPayload {
    const prompts = this.listVisiblePrompts(actor);
    const promptVersions = prompts.flatMap((prompt) => this.promptDb.getVersions(prompt.id)).map((version) => ({
      ...version,
      createdAt: this.normalizeIsoTimestamp(version.createdAt),
    }));
    const folders = this.listVisibleFolders(actor);
    const skills = this.listVisibleSkills(actor);
    const skillVersions = skills.flatMap((skill) => this.skillDb.getVersions(skill.id)).map((version) => ({
      ...version,
      createdAt: this.normalizeIsoTimestamp(version.createdAt),
    }));
    const settings = this.settingsService.get(actor.userId);

    return {
      version: 'web-backup-v2',
      exportedAt: new Date().toISOString(),
      prompts,
      promptVersions,
      versions: promptVersions,
      folders,
      skills,
      skillVersions,
      settings,
      settingsUpdatedAt: this.settingsService.getUpdatedAt(actor.userId),
    };
  }

  import(actor: BackupActor, payload: WebBackupPayload): BackupImportResult {
    let promptsImported = 0;
    let foldersImported = 0;
    let skillsImported = 0;

    const folders = [...payload.folders].sort((left, right) => {
      const leftDepth = this.getFolderDepth(left, payload.folders);
      const rightDepth = this.getFolderDepth(right, payload.folders);
      return leftDepth - rightDepth;
    });

    for (const folder of folders) {
      if (this.mergeFolder(actor, folder)) {
        foldersImported += 1;
      }
    }

    for (const prompt of payload.prompts) {
      if (this.mergePrompt(actor, prompt)) {
        promptsImported += 1;
      }
    }

    this.mergePromptVersions(payload);

    for (const skill of payload.skills) {
      if (this.mergeSkill(actor, skill)) {
        skillsImported += 1;
      }
    }

    this.mergeSkillVersions(payload);

    const settingsUpdated = this.mergeSettings(actor, payload);

    syncPromptWorkspaceFromDatabase(this.db, this.promptDb, this.folderDb);
    syncSkillWorkspaceFromDatabase(this.db, this.skillDb);

    return {
      promptsImported,
      foldersImported,
      skillsImported,
      settingsUpdated,
    };
  }

  private listVisiblePrompts(actor: BackupActor): Prompt[] {
    const includeShared = actor.role === 'admin';
    const rows = this.db
      .prepare(
        'SELECT id, owner_user_id, visibility FROM prompts WHERE (owner_user_id = ? AND visibility = ?) OR (? = 1 AND visibility = ?) ORDER BY updated_at DESC',
      )
      .all(actor.userId, 'private', includeShared ? 1 : 0, 'shared') as PromptRecordRow[];

    const prompts: Prompt[] = [];

    for (const row of rows) {
      const prompt = this.promptDb.getById(row.id);
      if (!prompt) {
        continue;
      }

      prompts.push({
        ...prompt,
        ownerUserId: row.owner_user_id ?? undefined,
        visibility: row.visibility,
        createdAt: this.normalizeIsoTimestamp(prompt.createdAt),
        updatedAt: this.normalizeIsoTimestamp(prompt.updatedAt),
      });
    }

    return prompts;
  }

  private listVisibleFolders(actor: BackupActor): Folder[] {
    const includeShared = actor.role === 'admin';
    const rows = this.db
      .prepare(
        'SELECT id, owner_user_id, visibility FROM folders WHERE (owner_user_id = ? AND visibility = ?) OR (? = 1 AND visibility = ?) ORDER BY sort_order ASC',
      )
      .all(actor.userId, 'private', includeShared ? 1 : 0, 'shared') as FolderRecordRow[];

    const folders: Folder[] = [];

    for (const row of rows) {
      const folder = this.folderDb.getById(row.id);
      if (!folder) {
        continue;
      }

      folders.push({
        ...folder,
        ownerUserId: row.owner_user_id ?? undefined,
        visibility: row.visibility,
        createdAt: this.normalizeIsoTimestamp(folder.createdAt),
        updatedAt: this.normalizeIsoTimestamp(folder.updatedAt),
      });
    }

    return folders;
  }

  private listVisibleSkills(actor: BackupActor): Skill[] {
    const includeShared = actor.role === 'admin';
    const rows = this.db
      .prepare(
        'SELECT id, owner_user_id, visibility FROM skills WHERE (owner_user_id = ? AND visibility = ?) OR (? = 1 AND visibility = ?) ORDER BY updated_at DESC',
      )
      .all(actor.userId, 'private', includeShared ? 1 : 0, 'shared') as SkillRecordRow[];

    const skills: Skill[] = [];

    for (const row of rows) {
      const skill = this.skillDb.getById(row.id);
      if (!skill) {
        continue;
      }

      skills.push({
        ...skill,
        ownerUserId: row.owner_user_id ?? undefined,
        visibility: row.visibility,
      });
    }

    return skills;
  }

  private getFolderDepth(folder: Folder, allFolders: Folder[]): number {
    let depth = 0;
    let currentParentId = folder.parentId;

    while (currentParentId) {
      depth += 1;
      currentParentId = allFolders.find((candidate) => candidate.id === currentParentId)?.parentId;
    }

    return depth;
  }

  private resolveVisibility(
    actor: BackupActor,
    visibility: 'private' | 'shared' | undefined,
  ): 'private' | 'shared' {
    if (visibility === 'shared' && actor.role === 'admin') {
      return 'shared';
    }
    return 'private';
  }

  private shouldReplaceByTimestamp(
    existing: string | number | undefined,
    incoming: string | number | undefined,
  ): boolean {
    if (existing === undefined) {
      return true;
    }

    const existingTime = this.toMillis(existing);
    const incomingTime = this.toMillis(incoming);
    if (incomingTime == null) {
      return false;
    }
    if (existingTime == null) {
      return true;
    }
    return incomingTime >= existingTime;
  }

  private toMillis(value: string | number | undefined): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value !== 'string' || !value.trim()) {
      return null;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private mergeFolder(actor: BackupActor, folder: Folder): boolean {
    const existing = this.folderDb.getById(folder.id);
    if (existing && !this.shouldReplaceByTimestamp(existing.updatedAt, folder.updatedAt)) {
      return false;
    }

    const visibility = this.resolveVisibility(actor, folder.visibility);
    const parentId =
      folder.parentId && this.folderDb.getById(folder.parentId) ? folder.parentId : undefined;

    this.folderDb.insertFolderDirect({
      ...folder,
      parentId,
      visibility,
      isPrivate: folder.isPrivate ?? false,
    });
    this.db
      .prepare('UPDATE folders SET owner_user_id = ?, visibility = ? WHERE id = ?')
      .run(actor.userId, visibility, folder.id);
    return true;
  }

  private mergePrompt(actor: BackupActor, prompt: Prompt): boolean {
    const existing = this.promptDb.getById(prompt.id);
    if (existing && !this.shouldReplaceByTimestamp(existing.updatedAt, prompt.updatedAt)) {
      return false;
    }

    const visibility = this.resolveVisibility(actor, prompt.visibility);
    const folderId =
      prompt.folderId && this.folderDb.getById(prompt.folderId) ? prompt.folderId : null;

    this.promptDb.insertPromptDirect({
      ...prompt,
      folderId,
      visibility,
    });
    this.db
      .prepare('UPDATE prompts SET owner_user_id = ?, visibility = ? WHERE id = ?')
      .run(actor.userId, visibility, prompt.id);
    return true;
  }

  private mergePromptVersions(payload: WebBackupPayload): void {
    const promptVersions = payload.promptVersions.length > 0 ? payload.promptVersions : (payload.versions ?? []);
    for (const version of promptVersions) {
      if (!this.promptDb.getById(version.promptId)) {
        continue;
      }

      const existing = this.db
        .prepare('SELECT id, created_at FROM prompt_versions WHERE prompt_id = ? AND version = ?')
        .get(version.promptId, version.version) as { id: string; created_at: number } | undefined;

      if (existing) {
        const incomingCreatedAt = this.toMillis(version.createdAt);
        if (!this.shouldReplaceByTimestamp(existing.created_at, incomingCreatedAt ?? undefined)) {
          continue;
        }
        this.db.prepare('DELETE FROM prompt_versions WHERE prompt_id = ? AND version = ?').run(version.promptId, version.version);
      }

      this.promptDb.insertVersionDirect(version);
    }
  }

  private resolveSkillId(skill: Skill): string {
    const exact = this.skillDb.getById(skill.id);
    if (exact) {
      return exact.id;
    }

    const byName = this.db
      .prepare('SELECT id FROM skills WHERE LOWER(name) = LOWER(?)')
      .get(skill.name) as { id?: string } | undefined;
    return byName?.id ?? skill.id;
  }

  private mergeSkill(actor: BackupActor, skill: Skill): boolean {
    const resolvedSkillId = this.resolveSkillId(skill);
    const existing = this.skillDb.getById(resolvedSkillId);
    if (existing && !this.shouldReplaceByTimestamp(existing.updated_at, skill.updated_at)) {
      return false;
    }

    const visibility = this.resolveVisibility(actor, skill.visibility);
    this.skillDb.insertSkillDirect({
      ...skill,
      id: resolvedSkillId,
      visibility,
    });
    this.db
      .prepare('UPDATE skills SET owner_user_id = ?, visibility = ? WHERE id = ?')
      .run(actor.userId, visibility, resolvedSkillId);
    return true;
  }

  private mergeSkillVersions(payload: WebBackupPayload): void {
    const skillMap = new Map(payload.skills.map((skill) => [skill.id, skill]));
    for (const version of payload.skillVersions) {
      const sourceSkill = skillMap.get(version.skillId);
      const resolvedSkillId = sourceSkill
        ? this.resolveSkillId(sourceSkill)
        : version.skillId;
      if (!this.skillDb.getById(resolvedSkillId)) {
        continue;
      }

      const existing = this.db
        .prepare('SELECT id, created_at FROM skill_versions WHERE skill_id = ? AND version = ?')
        .get(resolvedSkillId, version.version) as { id: string; created_at: number } | undefined;

      if (existing) {
        const incomingCreatedAt = this.toMillis(version.createdAt);
        if (!this.shouldReplaceByTimestamp(existing.created_at, incomingCreatedAt ?? undefined)) {
          continue;
        }
        this.db.prepare('DELETE FROM skill_versions WHERE skill_id = ? AND version = ?').run(resolvedSkillId, version.version);
      }

      this.skillDb.insertVersionDirect({
        ...version,
        skillId: resolvedSkillId,
      });
    }
  }

  private mergeSettings(actor: BackupActor, payload: WebBackupPayload): boolean {
    const localUpdatedAt = this.settingsService.getUpdatedAt(actor.userId);
    if (
      localUpdatedAt &&
      payload.settingsUpdatedAt &&
      !this.shouldReplaceByTimestamp(localUpdatedAt, payload.settingsUpdatedAt)
    ) {
      return false;
    }

    this.settingsService.set(actor.userId, {
      ...payload.settings,
      defaultFolderId: payload.settings.defaultFolderId && this.folderDb.getById(payload.settings.defaultFolderId)
        ? payload.settings.defaultFolderId
        : undefined,
    });
    return true;
  }

  private cloneSafetyReport(report: SkillSafetyReport): SkillSafetyReport {
    return {
      ...report,
      findings: report.findings.map((finding) => ({ ...finding })),
    };
  }

  private normalizeIsoTimestamp(value: string | number): string {
    return typeof value === 'number' ? new Date(value).toISOString() : value;
  }
}
