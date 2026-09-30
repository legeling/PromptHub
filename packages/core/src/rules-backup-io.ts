import path from "path";

import type {
  CreateRuleProjectInput,
  RuleBackupRecord,
  RuleFileContent,
  RuleFileDescriptor,
  RuleFileId,
  RuleSyncStatus,
} from "@prompthub/shared/types";

export type ProjectRuleId = `project:${string}`;

export interface StoredRuleMeta {
  id: RuleFileId;
  scope: "global" | "project";
  platformId: RuleFileDescriptor["platformId"];
  platformName: string;
  platformIcon: string;
  platformDescription: string;
  canonicalFileName: string;
  description: string;
  managedPath: string;
  targetPath: string;
  projectRootPath?: string | null;
  syncStatus?: RuleSyncStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ImportRuleBackupRecordsOptions {
  replace?: boolean;
  /**
   *Restore the pre-#210 unconditional overwrite semantics (write managed +
   * target + version history even when the user edited the target file
   * outside PromptHub or the backup content is empty).
   */
  forceOverwriteTargets?: boolean;
}

export interface ImportRuleBackupRecordsResult {
  imported: RuleFileId[];
  conflicts: Array<{ id: RuleFileId; targetPath: string }>;
  skipped: Array<{ id: RuleFileId; reason: "empty-content" }>;
}

function isProjectRuleFileId(ruleId: RuleFileId): ruleId is ProjectRuleId {
  return ruleId.startsWith("project:");
}

export interface RuleBackupIoDeps {
  listRuleDescriptors: () => Promise<RuleFileDescriptor[]>;
  readRuleContent: (ruleId: RuleFileId) => Promise<RuleFileContent>;
  bootstrapRuleWorkspace: () => Promise<void>;
  removeMissingProjectRules: (records: RuleBackupRecord[]) => Promise<void>;
  getProjectMetaById: (ruleId: ProjectRuleId) => Promise<StoredRuleMeta | null>;
  createProjectRule: (
    input: CreateRuleProjectInput,
  ) => Promise<RuleFileDescriptor>;
  resolveRuleMeta: (ruleId: RuleFileId) => Promise<StoredRuleMeta>;
  writeManagedRule: (meta: StoredRuleMeta, content: string) => Promise<void>;
  writeTargetRule: (
    meta: StoredRuleMeta,
    content: string,
  ) => Promise<RuleSyncStatus>;
  /** Local divergence probe shared with the rules workspace sync checks. */
  syncStatusForMeta: (meta: StoredRuleMeta) => Promise<RuleSyncStatus>;
  /** Current target file content; null when the target does not exist. */
  readTargetContent: (meta: StoredRuleMeta) => Promise<string | null>;
  replaceRuleVersions: (
    ruleId: RuleFileId,
    versions: RuleBackupRecord["versions"],
  ) => Promise<unknown>;
  writeMeta: (meta: StoredRuleMeta) => Promise<void>;
  syncRuleIndex: (meta: StoredRuleMeta) => Promise<void>;
}

/**
 * Backup export/import for the rules workspace. Importing is conflict-aware
 * (upstream #210): records never silently overwrite a target the user edited
 * outside PromptHub, never zero a non-empty target with empty content, and
 * never destroy local version history on those protected records unless the
 * caller passes forceOverwriteTargets.
 */
export function createRuleBackupIo(deps: RuleBackupIoDeps) {
  async function exportRuleBackupRecords(): Promise<RuleBackupRecord[]> {
    const descriptors = await deps.listRuleDescriptors();
    return Promise.all(
      descriptors.map(async (descriptor) => {
        const content = await deps.readRuleContent(descriptor.id);
        return {
          id: content.id,
          platformId: content.platformId,
          platformName: content.platformName,
          platformIcon: content.platformIcon,
          platformDescription: content.platformDescription,
          name: content.name,
          description: content.description,
          path: content.path,
          managedPath: content.managedPath,
          targetPath: content.targetPath,
          projectRootPath: content.projectRootPath ?? null,
          syncStatus: content.syncStatus,
          content: content.content,
          versions: content.versions,
        } satisfies RuleBackupRecord;
      }),
    );
  }

  async function importRuleBackupRecords(
    records: RuleBackupRecord[],
    options: ImportRuleBackupRecordsOptions = {},
  ): Promise<ImportRuleBackupRecordsResult> {
    const summary: ImportRuleBackupRecordsResult = {
      imported: [],
      conflicts: [],
      skipped: [],
    };

    await deps.bootstrapRuleWorkspace();

    if (options.replace) {
      await deps.removeMissingProjectRules(records);
    }

    for (const record of records) {
      if (isProjectRuleFileId(record.id)) {
        const projectId = record.id.slice("project:".length);
        const existing = await deps.getProjectMetaById(record.id);
        if (!existing) {
          await deps.createProjectRule({
            id: projectId,
            name: record.platformName,
            rootPath:
              record.projectRootPath ??
              path.dirname(record.targetPath ?? record.path),
          });
        }
      }

      const meta = await deps.resolveRuleMeta(record.id);

      if (!options.forceOverwriteTargets) {
        if (record.content === "") {
          const currentTarget = await deps.readTargetContent(meta);
          if (currentTarget !== null && currentTarget.length > 0) {
            summary.skipped.push({ id: record.id, reason: "empty-content" });
            continue;
          }
        }

        const preflightStatus = await deps.syncStatusForMeta(meta);
        if (preflightStatus === "out-of-sync") {
          summary.conflicts.push({
            id: record.id,
            targetPath: meta.targetPath,
          });
          continue;
        }
      }

      await deps.writeManagedRule(meta, record.content);
      const restoredSyncStatus = await deps.writeTargetRule(
        meta,
        record.content,
      );
      await deps.replaceRuleVersions(record.id, record.versions);
      const nextMeta: StoredRuleMeta = {
        ...meta,
        syncStatus: restoredSyncStatus,
        updatedAt: new Date().toISOString(),
      };
      await deps.writeMeta(nextMeta);
      await deps.syncRuleIndex(nextMeta);
      summary.imported.push(record.id);
    }

    return summary;
  }

  return { exportRuleBackupRecords, importRuleBackupRecords };
}
