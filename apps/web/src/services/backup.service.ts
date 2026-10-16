import { WebSkillStorage } from "./skill-storage.js";
import { getWebSkillPackagePath } from "./skill-workspace.js";
import {
  skillVersionPayloadEntry,
  getSkillVersionPayloadPath,
} from "@prompthub/core/skill-version-files";
import { getSkillsDir } from "../runtime-paths.js";
import type { CanonicalEntryMutation } from "@prompthub/core/canonical-entry-publication";
import { publishSqliteEntries } from "@prompthub/core/sqlite-entry-publication";
import { getRootDir } from "../runtime-paths.js";
import {
  FolderDB,
  PromptDB,
  PromptOutputFormatDB,
  PromptRelationDB,
  SkillMetadataDB,
} from "@prompthub/db";
import {
  decodeSkillFileSnapshot,
  hasEncodedSkillSnapshots,
  SKILL_SNAPSHOT_SYNC_VERSION,
} from "@prompthub/shared/utils/skill-file-snapshot";
import type {
  AgentAssetFilesSnapshot,
  AgentAssetStoreSourcesSnapshot,
  Folder,
  McpLibraryFile,
  OutputFormatItem,
  PluginLibraryFile,
  PluginPackageSnapshot,
  Prompt,
  PromptRelation,
  PromptVersion,
  RuleBackupRecord,
  Settings,
  Skill,
  SkillFileSnapshot,
  SkillSafetyReport,
  SkillVersion,
} from "@prompthub/shared";
import { getServerDatabase } from "../database.js";
import {
  readAgentAssetsSnapshot,
  writeAgentAssetsSnapshotFromPayload,
} from "./agent-assets-sync.js";
import { SettingsService } from "./settings.service.js";
import {
  exportRuleBackupRecords,
  prepareRuleBackupImport,
  validateRuleWorkspaceSnapshotPaths,
} from "./rule-workspace.js";
import {
  collectSkillWorkspaceFiles,
  prepareWebSkillPackage,
  validateSkillWorkspaceSnapshotPaths,
} from "./skill-workspace.js";

export interface BackupActor {
  userId: string;
  role: "admin" | "user";
}

export interface WebBackupPayload {
  version: string;
  exportedAt: string;
  prompts: Prompt[];
  promptVersions: PromptVersion[];
  versions?: PromptVersion[];
  folders: Folder[];
  rules?: RuleBackupRecord[];
  skills: Skill[];
  skillVersions: SkillVersion[];
  skillFiles?: Record<string, SkillFileSnapshot[]>;
  promptRelations?: PromptRelation[];
  outputFormatItems?: OutputFormatItem[];
  mcpLibrary?: McpLibraryFile;
  pluginLibrary?: PluginLibraryFile;
  pluginPackages?: PluginPackageSnapshot[];
  storeSources?: AgentAssetStoreSourcesSnapshot;
  agentAssetFiles?: AgentAssetFilesSnapshot;
  settings: Settings;
  settingsUpdatedAt?: string;
}

export interface BackupImportResult {
  promptsImported: number;
  foldersImported: number;
  rulesImported: number;
  skillsImported: number;
  promptRelationsImported?: number;
  promptRelationsSkipped?: number;
  outputFormatItemsImported?: number;
  outputFormatItemsSkipped?: number;
  mcpServersImported?: number;
  pluginsImported?: number;
  settingsUpdated: boolean;
}

export interface BackupImportOptions {
  forceSettingsImport?: boolean;
}

interface PromptRecordRow {
  id: string;
  owner_user_id: string | null;
  visibility: "private" | "shared";
}

interface FolderRecordRow {
  id: string;
  owner_user_id: string | null;
  visibility: "private" | "shared";
}

interface SkillRecordRow {
  id: string;
  owner_user_id: string | null;
  visibility: "private" | "shared";
}

interface DependencyImportStats {
  imported: number;
  skipped: number;
}

export class BackupService {
  private readonly db = getServerDatabase();
  private readonly promptDb = new PromptDB(this.db);
  private readonly promptRelationDb = new PromptRelationDB(this.db);
  private readonly promptOutputFormatDb = new PromptOutputFormatDB(this.db);
  private readonly folderDb = new FolderDB(this.db);
  private readonly skillDb = new WebSkillStorage(this.db);
  private readonly skillMetadata = new SkillMetadataDB(this.db);
  private readonly settingsService = new SettingsService();

  export(actor: BackupActor): WebBackupPayload {
    const prompts = this.listVisiblePrompts(actor);
    const promptVersions = prompts
      .flatMap((prompt) => this.promptDb.getVersions(prompt.id))
      .map((version) => ({
        ...version,
        createdAt: this.normalizeIsoTimestamp(version.createdAt),
      }));
    const folders = this.listVisibleFolders(actor);
    const skills = this.listVisibleSkills(actor);
    const skillVersions = skills
      .flatMap((skill) => this.skillDb.getVersions(skill.id))
      .map((version) => ({
        ...version,
        createdAt: this.normalizeIsoTimestamp(version.createdAt),
      }));
    const skillFiles = collectSkillWorkspaceFiles(skills);
    const visiblePromptIds = new Set(prompts.map((prompt) => prompt.id));
    const promptRelations = this.filterPromptRelations(
      this.promptRelationDb.list(),
      visiblePromptIds,
    );
    const outputFormatItems = this.filterOutputFormatItems(
      this.promptOutputFormatDb.list(),
      visiblePromptIds,
    );
    const settings = this.settingsService.get(actor.userId);
    const agentAssets = readAgentAssetsSnapshot(actor.userId);

    return {
      version: hasEncodedSkillSnapshots({ skillFiles, skillVersions })
        ? SKILL_SNAPSHOT_SYNC_VERSION
        : "web-backup-v2",
      exportedAt: new Date().toISOString(),
      prompts,
      promptVersions,
      versions: promptVersions,
      folders,
      rules: exportRuleBackupRecords(actor.userId),
      skills,
      skillVersions,
      skillFiles,
      promptRelations,
      outputFormatItems,
      mcpLibrary: agentAssets.mcpLibrary,
      pluginLibrary: agentAssets.pluginLibrary,
      pluginPackages: agentAssets.pluginPackages,
      storeSources: agentAssets.storeSources,
      agentAssetFiles: agentAssets.agentAssetFiles,
      settings,
      // An untouched default snapshot predates every user edit without writing defaults on read.
      settingsUpdatedAt:
        this.settingsService.getUpdatedAt(actor.userId) ??
        new Date(0).toISOString(),
    };
  }

  import(
    actor: BackupActor,
    payload: WebBackupPayload,
    options?: BackupImportOptions,
  ): BackupImportResult {
    validateSkillWorkspaceSnapshotPaths(
      payload.skills,
      payload.skillVersions,
      payload.skillFiles,
    );
    validateRuleWorkspaceSnapshotPaths(actor.userId, payload.rules ?? []);

    const skillPublication = this.prepareSkillImport(actor, payload);
    const rulePublication = prepareRuleBackupImport(
      actor.userId,
      payload.rules ?? [],
    );
    let result: BackupImportResult | undefined;
    publishSqliteEntries(this.db, {
      rootPath: getRootDir(),
      operationKey: "web-backup-import",
      entries: [...rulePublication.entries, ...skillPublication.entries],
      commit: () => {
        let promptsImported = 0;
        let foldersImported = 0;
        const rulesImported = payload.rules?.length ?? 0;
        let skillsImported = 0;

        const folderDepths = this.buildFolderDepthMap(payload.folders);
        const folders = [...payload.folders].sort(
          (left, right) =>
            (folderDepths.get(left.id) ?? 0) -
            (folderDepths.get(right.id) ?? 0),
        );

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
        const promptRelations = this.mergePromptRelations(
          actor,
          payload.promptRelations ?? [],
        );
        const outputFormatItems = this.mergeOutputFormatItems(
          actor,
          payload.outputFormatItems ?? [],
        );

        for (const skill of skillPublication.skills) {
          this.skillMetadata.insertSkillDirect(skill);
          skillsImported += 1;
        }

        this.mergeSkillVersions(skillPublication.skillVersions);

        rulePublication.commit();

        const settingsUpdated = this.mergeSettings(actor, payload, options);

        result = {
          promptsImported,
          foldersImported,
          rulesImported,
          skillsImported,
          ...(payload.promptRelations?.length
            ? {
                promptRelationsImported: promptRelations.imported,
                promptRelationsSkipped: promptRelations.skipped,
              }
            : {}),
          ...(payload.outputFormatItems?.length
            ? {
                outputFormatItemsImported: outputFormatItems.imported,
                outputFormatItemsSkipped: outputFormatItems.skipped,
              }
            : {}),
          mcpServersImported: payload.mcpLibrary?.servers.length ?? 0,
          pluginsImported: payload.pluginLibrary?.plugins.length ?? 0,
          settingsUpdated,
        };
      },
    });
    writeAgentAssetsSnapshotFromPayload(actor.userId, payload);

    if (!result) throw new Error("Backup import did not produce a result");
    return result;
  }

  private listVisiblePrompts(actor: BackupActor): Prompt[] {
    const includeShared = actor.role === "admin";
    const rows = this.db
      .prepare(
        "SELECT id, owner_user_id, visibility FROM prompts WHERE (owner_user_id = ? AND visibility = ?) OR (? = 1 AND visibility = ?) ORDER BY updated_at DESC",
      )
      .all(
        actor.userId,
        "private",
        includeShared ? 1 : 0,
        "shared",
      ) as PromptRecordRow[];

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
    const includeShared = actor.role === "admin";
    const rows = this.db
      .prepare(
        "SELECT id, owner_user_id, visibility FROM folders WHERE (owner_user_id = ? AND visibility = ?) OR (? = 1 AND visibility = ?) ORDER BY sort_order ASC",
      )
      .all(
        actor.userId,
        "private",
        includeShared ? 1 : 0,
        "shared",
      ) as FolderRecordRow[];

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
    const includeShared = actor.role === "admin";
    const rows = this.db
      .prepare(
        "SELECT id, owner_user_id, visibility FROM skills WHERE (owner_user_id = ? AND visibility = ?) OR (? = 1 AND visibility = ?) ORDER BY updated_at DESC",
      )
      .all(
        actor.userId,
        "private",
        includeShared ? 1 : 0,
        "shared",
      ) as SkillRecordRow[];

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

  private buildFolderDepthMap(folders: Folder[]): Map<string, number> {
    const folderById = new Map(folders.map((folder) => [folder.id, folder]));
    const depths = new Map<string, number>();
    const visiting = new Set<string>();

    const getDepth = (folder: Folder): number => {
      const cachedDepth = depths.get(folder.id);
      if (cachedDepth !== undefined) {
        return cachedDepth;
      }
      if (visiting.has(folder.id)) {
        throw new Error(
          `Invalid folder hierarchy: parent cycle at ${folder.id}`,
        );
      }

      visiting.add(folder.id);
      try {
        const parent = folder.parentId
          ? folderById.get(folder.parentId)
          : undefined;
        const depth = parent ? getDepth(parent) + 1 : 0;
        depths.set(folder.id, depth);
        return depth;
      } finally {
        visiting.delete(folder.id);
      }
    };

    for (const folder of folders) {
      getDepth(folder);
    }

    return depths;
  }

  private resolveVisibility(
    actor: BackupActor,
    visibility: "private" | "shared" | undefined,
  ): "private" | "shared" {
    if (visibility === "shared" && actor.role === "admin") {
      return "shared";
    }
    return "private";
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
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value !== "string" || !value.trim()) {
      return null;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private mergeFolder(actor: BackupActor, folder: Folder): boolean {
    const existing = this.folderDb.getById(folder.id);
    if (
      existing &&
      !this.shouldReplaceByTimestamp(existing.updatedAt, folder.updatedAt)
    ) {
      return false;
    }

    const visibility = this.resolveVisibility(actor, folder.visibility);
    const parentId =
      folder.parentId && this.folderDb.getById(folder.parentId)
        ? folder.parentId
        : undefined;

    this.folderDb.insertFolderDirect({
      ...folder,
      parentId,
      visibility,
      isPrivate: folder.isPrivate ?? false,
    });
    this.db
      .prepare(
        "UPDATE folders SET owner_user_id = ?, visibility = ? WHERE id = ?",
      )
      .run(actor.userId, visibility, folder.id);
    return true;
  }

  private mergePrompt(actor: BackupActor, prompt: Prompt): boolean {
    const existing = this.promptDb.getById(prompt.id);
    if (
      existing &&
      !this.shouldReplaceByTimestamp(existing.updatedAt, prompt.updatedAt)
    ) {
      return false;
    }

    const visibility = this.resolveVisibility(actor, prompt.visibility);
    const folderId =
      prompt.folderId && this.folderDb.getById(prompt.folderId)
        ? prompt.folderId
        : null;

    this.promptDb.insertPromptDirect({
      ...prompt,
      folderId,
      visibility,
    });
    this.db
      .prepare(
        "UPDATE prompts SET owner_user_id = ?, visibility = ? WHERE id = ?",
      )
      .run(actor.userId, visibility, prompt.id);
    return true;
  }

  private mergePromptVersions(payload: WebBackupPayload): void {
    const promptVersions =
      payload.promptVersions.length > 0
        ? payload.promptVersions
        : (payload.versions ?? []);
    for (const version of promptVersions) {
      if (!this.promptDb.getById(version.promptId)) {
        continue;
      }

      const existing = this.db
        .prepare(
          "SELECT id, created_at FROM prompt_versions WHERE prompt_id = ? AND version = ?",
        )
        .get(version.promptId, version.version) as
        | { id: string; created_at: number }
        | undefined;

      if (existing) {
        const incomingCreatedAt = this.toMillis(version.createdAt);
        if (
          !this.shouldReplaceByTimestamp(
            existing.created_at,
            incomingCreatedAt ?? undefined,
          )
        ) {
          continue;
        }
        this.db
          .prepare(
            "DELETE FROM prompt_versions WHERE prompt_id = ? AND version = ?",
          )
          .run(version.promptId, version.version);
      }

      this.promptDb.insertVersionDirect(version);
    }
  }

  private filterPromptRelations(
    relations: PromptRelation[],
    promptIds: Set<string>,
  ): PromptRelation[] | undefined {
    const valid = relations.filter(
      (relation) =>
        relation.sourcePromptId !== relation.targetPromptId &&
        promptIds.has(relation.sourcePromptId) &&
        promptIds.has(relation.targetPromptId),
    );
    return valid.length > 0 ? valid : undefined;
  }

  private filterOutputFormatItems(
    items: OutputFormatItem[],
    promptIds: Set<string>,
  ): OutputFormatItem[] | undefined {
    const valid = items.filter(
      (item) =>
        promptIds.has(item.sourcePromptId) &&
        (item.targetPromptId === null || promptIds.has(item.targetPromptId)),
    );
    return valid.length > 0 ? valid : undefined;
  }

  private canReadPrompt(actor: BackupActor, promptId: string): boolean {
    const includeShared = actor.role === "admin" ? 1 : 0;
    const row = this.db
      .prepare(
        "SELECT id FROM prompts WHERE id = ? AND ((owner_user_id = ? AND visibility = ?) OR (? = 1 AND visibility = ?))",
      )
      .get(promptId, actor.userId, "private", includeShared, "shared") as
      | { id: string }
      | undefined;
    return Boolean(row);
  }

  private mergePromptRelations(
    actor: BackupActor,
    relations: PromptRelation[],
  ): DependencyImportStats {
    const stats: DependencyImportStats = { imported: 0, skipped: 0 };
    for (const relation of relations) {
      if (
        relation.sourcePromptId === relation.targetPromptId ||
        !this.canReadPrompt(actor, relation.sourcePromptId) ||
        !this.canReadPrompt(actor, relation.targetPromptId)
      ) {
        stats.skipped += 1;
        continue;
      }
      const existing = this.promptRelationDb.getById(relation.id);
      if (
        existing &&
        !this.shouldReplaceByTimestamp(existing.updatedAt, relation.updatedAt)
      ) {
        stats.skipped += 1;
        continue;
      }
      this.promptRelationDb.insertRelationDirect(relation);
      stats.imported += 1;
    }
    return stats;
  }

  private mergeOutputFormatItems(
    actor: BackupActor,
    items: OutputFormatItem[],
  ): DependencyImportStats {
    const stats: DependencyImportStats = { imported: 0, skipped: 0 };
    for (const item of items) {
      if (
        !this.canReadPrompt(actor, item.sourcePromptId) ||
        (item.targetPromptId !== null &&
          !this.canReadPrompt(actor, item.targetPromptId))
      ) {
        stats.skipped += 1;
        continue;
      }
      const existing = this.promptOutputFormatDb.getById(item.id);
      if (
        existing &&
        !this.shouldReplaceByTimestamp(existing.updatedAt, item.updatedAt)
      ) {
        stats.skipped += 1;
        continue;
      }
      this.promptOutputFormatDb.insertItemDirect(item);
      stats.imported += 1;
    }
    return stats;
  }

  private prepareSkillImport(
    actor: BackupActor,
    payload: WebBackupPayload,
  ): {
    skills: Skill[];
    skillVersions: SkillVersion[];
    entries: CanonicalEntryMutation[];
  } {
    const skills: Skill[] = [];
    const entries: CanonicalEntryMutation[] = [];
    const selected = new Set<string>();
    for (const skill of payload.skills) {
      const existing = this.skillDb.getById(skill.id);
      if (
        existing &&
        !(existing.visibility === "shared"
          ? actor.role === "admin"
          : existing.ownerUserId === actor.userId)
      )
        throw new Error("Cannot restore Skill owned by another user");
      if (
        existing &&
        !this.shouldReplaceByTimestamp(existing.updated_at, skill.updated_at)
      )
        continue;
      const files = payload.skillFiles?.[skill.id];
      const entrypoint = files?.find(
        (file) => file.relativePath.toLowerCase() === "skill.md",
      );
      const content = entrypoint
        ? new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
            decodeSkillFileSnapshot(entrypoint),
          )
        : (skill.instructions ?? skill.content);
      const imported = {
        ...skill,
        content,
        instructions: content,
        ownerUserId: existing?.ownerUserId ?? actor.userId,
        visibility: this.resolveVisibility(actor, skill.visibility),
        local_repo_path: getWebSkillPackagePath(skill.id),
      };
      skills.push(imported);
      selected.add(skill.id);
      entries.push(prepareWebSkillPackage(imported, files, !existing));
    }
    const skillVersions = payload.skillVersions.filter((version) => {
      if (!selected.has(version.skillId)) return false;
      const existing = this.skillDb.getVersion(
        version.skillId,
        version.version,
      );
      if (
        existing &&
        !this.shouldReplaceByTimestamp(
          this.toMillis(existing.createdAt) ?? undefined,
          this.toMillis(version.createdAt) ?? undefined,
        )
      )
        return false;
      if (existing && existing.id !== version.id)
        entries.push({
          targetPath: getSkillVersionPayloadPath(
            existing.skillId,
            existing.id,
            getSkillsDir(),
          ),
          delete: true,
        });
      entries.push(
        skillVersionPayloadEntry(version, getSkillsDir(), getRootDir()),
      );
      return true;
    });
    return { skills, entries, skillVersions };
  }

  private mergeSkillVersions(versions: SkillVersion[]): void {
    for (const version of versions) {
      const resolvedSkillId = version.skillId;
      const existing = this.db
        .prepare(
          "SELECT id, created_at FROM skill_versions WHERE skill_id = ? AND version = ?",
        )
        .get(resolvedSkillId, version.version) as
        | { id: string; created_at: number }
        | undefined;

      if (existing) {
        const incomingCreatedAt = this.toMillis(version.createdAt);
        if (
          !this.shouldReplaceByTimestamp(
            existing.created_at,
            incomingCreatedAt ?? undefined,
          )
        ) {
          continue;
        }
        this.db
          .prepare(
            "DELETE FROM skill_versions WHERE skill_id = ? AND version = ?",
          )
          .run(resolvedSkillId, version.version);
      }

      this.skillMetadata.insertVersionDirect({
        ...version,
        skillId: resolvedSkillId,
      });
    }
  }

  private mergeSettings(
    actor: BackupActor,
    payload: WebBackupPayload,
    options?: BackupImportOptions,
  ): boolean {
    const localUpdatedAt = this.settingsService.getUpdatedAt(actor.userId);
    if (
      !options?.forceSettingsImport &&
      localUpdatedAt &&
      payload.settingsUpdatedAt &&
      !this.shouldReplaceByTimestamp(localUpdatedAt, payload.settingsUpdatedAt)
    ) {
      return false;
    }

    this.settingsService.set(actor.userId, {
      ...payload.settings,
      defaultFolderId:
        payload.settings.defaultFolderId &&
        this.folderDb.getById(payload.settings.defaultFolderId)
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
    return typeof value === "number" ? new Date(value).toISOString() : value;
  }
}
