import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { getPlatformById } from "@prompthub/shared/constants/platforms";
import {
  KNOWN_RULE_FILE_TEMPLATES,
  PROJECT_RULE_FILE_TEMPLATES,
} from "@prompthub/shared/constants/rules";
import { isRuleFileId, isRulePlatformId } from "@prompthub/shared";
import type {
  CreateRuleProjectInput,
  CustomRuleFileId,
  KnownRuleFileId,
  RuleBackupRecord,
  RuleConflictResolutionStrategy,
  RuleFileContent,
  RuleFileDescriptor,
  RuleFileId,
  RuleMissingCleanupResult,
  RuleRecord,
  RuleSyncStatus,
  RuleVersionSnapshot,
} from "@prompthub/shared/types";
import { migrateRuleHistoryV1 } from "./migrations/rule-history-v1";
import {
  getRuleManagedPath,
  getRuleVersionDirectory,
  type RuleStorageGraph,
} from "./rule-storage";
import { mergeImportedRuleVersions } from "./rules-workspace-import";
import {
  claudeScopedRuleTemplate,
  claudeScopedRuleTarget,
  discoverClaudeScopedRules,
} from "./claude-scoped-rules";
import { validateRuleVersionSnapshot } from "./rule-resource-schema";
import {
  RULE_VERSION_LIMIT,
  SAFE_PROJECT_ID_PATTERN,
  assertSafeProjectId,
  fileExists,
  hashContent,
  isCustomRuleFileId,
  isProjectRuleFileId,
  pathsEqual,
  resolveDisplayedRuleFileName,
  ruleGroupForKnownId,
  type ProjectRuleId,
  type RuleSyncInspection,
  type RulesWorkspaceService,
  type RulesWorkspaceServiceDeps,
  type StoredRuleMeta,
} from "./rules-workspace-support";
export type {
  ExtraGlobalRuleTemplate,
  RulesWorkspaceService,
  RulesWorkspaceServiceDeps,
} from "./rules-workspace-support";
export {
  resolveDisplayedRuleFileName,
  ruleGroupForKnownId,
} from "./rules-workspace-support";

export function createRulesWorkspaceService(
  deps: RulesWorkspaceServiceDeps,
): RulesWorkspaceService {
  const getRuleDb = deps.createRuleDb;
  function assertStorageAvailable(): void {
    deps.assertStorageAvailable?.();
  }
  function getAllGlobalRuleTemplates(repository = getRuleDb()) {
    return [
      ...Object.values(KNOWN_RULE_FILE_TEMPLATES),
      ...(deps.getExtraGlobalRuleTemplates?.() ?? []),
      ...discoverClaudeScopedRules(deps, repository.getAll()),
    ];
  }
  function baseGlobalMeta(
    ruleId: KnownRuleFileId | CustomRuleFileId,
  ): StoredRuleMeta {
    const template = isCustomRuleFileId(ruleId)
      ? (claudeScopedRuleTemplate(ruleId) ??
        deps
          .getExtraGlobalRuleTemplates?.()
          .find((candidate) => candidate.id === ruleId))
      : KNOWN_RULE_FILE_TEMPLATES[ruleId];
    if (!template) throw new Error(`Unknown rule file id: ${ruleId}`);
    const platform = getPlatformById(template.platformId);
    const managedPath = getRuleManagedPath(
      { id: ruleId, scope: "global", canonicalFileName: template.name },
      deps.getRulesDir(),
    );
    const targetPath = isCustomRuleFileId(ruleId)
      ? (claudeScopedRuleTarget(ruleId, deps) ??
        deps.getExtraGlobalRuleTargetPath?.({ ...template, id: ruleId }) ??
        managedPath)
      : platform
        ? deps.getPlatformGlobalRulePath(platform)
        : null;
    if (!targetPath)
      throw new Error(
        `Rules file path is not defined for platform: ${template.platformId}`,
      );
    const now = new Date().toISOString();
    return {
      id: ruleId,
      scope: "global",
      platformId: template.platformId,
      platformName: template.platformName,
      platformIcon: template.platformIcon,
      platformDescription: template.platformDescription,
      canonicalFileName: template.name,
      description: template.description,
      managedPath,
      targetPath,
      syncStatus: "target-missing",
      createdAt: now,
      updatedAt: now,
    };
  }
  function toRecord(
    meta: StoredRuleMeta,
    content: string | null,
    currentVersion: number,
  ): RuleRecord {
    return {
      ...meta,
      projectRootPath: meta.projectRootPath ?? null,
      syncStatus: meta.syncStatus ?? "target-missing",
      contentHash: content === null ? "" : hashContent(content),
      currentVersion,
    };
  }
  function graph(
    meta: StoredRuleMeta,
    content: string | null,
    versions: RuleVersionSnapshot[],
  ): RuleStorageGraph {
    return {
      rule: toRecord(meta, content, versions.length),
      content,
      versions,
    };
  }
  function publish(
    graphs: RuleStorageGraph[],
    deletedIds: RuleFileId[] = [],
  ): void {
    assertStorageAvailable();
    getRuleDb().publishGraphs(graphs, deletedIds);
  }
  function createVersion(
    content: string,
    source: RuleVersionSnapshot["source"],
  ): RuleVersionSnapshot {
    return {
      id: crypto.randomUUID(),
      content,
      source,
      savedAt: new Date().toISOString(),
    };
  }
  function nextVersions(
    ruleId: RuleFileId,
    content: string,
    source: RuleVersionSnapshot["source"],
  ): RuleVersionSnapshot[] {
    const current = getRuleDb().readVersions(ruleId);
    return (
      current[0]?.content === content
        ? current
        : [createVersion(content, source), ...current].slice(
            0,
            RULE_VERSION_LIMIT,
          )
    ).reverse();
  }
  function inspectRuleSyncState(
    meta: StoredRuleMeta,
    managedContent: string,
  ): RuleSyncInspection {
    if (!meta.targetPath || !fs.existsSync(meta.targetPath))
      return { exists: false, syncStatus: "target-missing" };
    try {
      const target = fs.readFileSync(meta.targetPath, "utf8");
      return {
        exists: true,
        syncStatus: target === managedContent ? "synced" : "out-of-sync",
      };
    } catch {
      return { exists: true, syncStatus: "sync-error" };
    }
  }
  function updateSyncStatus(
    meta: StoredRuleMeta,
    content: string,
    repository = getRuleDb(),
  ): RuleSyncInspection {
    const state = inspectRuleSyncState(meta, content);
    const current = repository.getById(meta.id);
    if (current && current.syncStatus !== state.syncStatus) {
      assertStorageAvailable();
      repository.upsert({ ...current, syncStatus: state.syncStatus });
    }
    return state;
  }
  function descriptor(
    meta: StoredRuleMeta,
    state: RuleSyncInspection,
  ): RuleFileDescriptor {
    return {
      id: meta.id,
      platformId: meta.platformId,
      platformName: meta.platformName,
      platformIcon: meta.platformIcon,
      platformDescription: meta.platformDescription,
      name: resolveDisplayedRuleFileName(
        meta.canonicalFileName,
        meta.targetPath,
      ),
      description: meta.description,
      path: meta.targetPath,
      targetPath: meta.targetPath,
      managedPath: meta.managedPath,
      projectRootPath: meta.projectRootPath ?? null,
      exists: state.exists,
      group:
        meta.scope === "project" ? "workspace" : ruleGroupForKnownId(meta.id),
      syncStatus: state.syncStatus,
    };
  }
  function materializeGlobalRule(
    ruleId: KnownRuleFileId | CustomRuleFileId,
    repository = getRuleDb(),
  ): RuleRecord {
    const base = baseGlobalMeta(ruleId);
    const current = repository.getById(ruleId);
    if (
      current &&
      !(
        current.currentVersion === 0 &&
        current.contentHash === "" &&
        !fs.existsSync(current.managedPath) &&
        fs.existsSync(base.targetPath)
      )
    ) {
      // Deployment locations follow this device's current platform configuration.
      if (current.targetPath !== base.targetPath) {
        assertStorageAvailable();
        repository.upsert({ ...current, targetPath: base.targetPath });
        return { ...current, targetPath: base.targetPath };
      }
      return current;
    }
    const content = fs.existsSync(base.targetPath)
      ? fs.readFileSync(base.targetPath, "utf8")
      : null;
    const versions = content === null ? [] : [createVersion(content, "create")];
    base.syncStatus = content === null ? "target-missing" : "synced";
    const next = graph(
      current
        ? {
            ...current,
            targetPath: base.targetPath,
            syncStatus: base.syncStatus,
          }
        : base,
      content,
      versions,
    );
    assertStorageAvailable();
    repository.publishGraphs([next]);
    return next.rule;
  }
  async function getProjectMetaById(
    ruleId: ProjectRuleId,
  ): Promise<StoredRuleMeta | null> {
    return getRuleDb().getById(ruleId);
  }
  async function resolveRuleMeta(ruleId: RuleFileId): Promise<StoredRuleMeta> {
    if (!isProjectRuleFileId(ruleId)) return materializeGlobalRule(ruleId);
    const record = getRuleDb().getById(ruleId);
    if (!record) throw new Error(`Unknown rule file id: ${ruleId}`);
    return record;
  }
  function readManaged(meta: StoredRuleMeta, repository = getRuleDb()): string {
    const record = repository.getById(meta.id);
    if (!record) throw new Error(`Unknown rule file id: ${meta.id}`);
    return repository.readContent(record);
  }
  async function scanRuleDescriptors(): Promise<RuleFileDescriptor[]> {
    const repository = getRuleDb();
    const result: RuleFileDescriptor[] = [];
    for (const template of getAllGlobalRuleTemplates(repository)) {
      const meta = materializeGlobalRule(template.id, repository);
      const state = updateSyncStatus(
        meta,
        readManaged(meta, repository),
        repository,
      );
      const platform = getPlatformById(meta.platformId);
      if (
        state.exists ||
        fs.existsSync(meta.managedPath) ||
        meta.platformId.startsWith("custom:") ||
        (platform && fs.existsSync(deps.getPlatformRootDir(platform)))
      )
        result.push(descriptor(meta, state));
    }
    for (const meta of repository
      .getAll()
      .filter((record) => record.scope === "project"))
      result.push(
        descriptor(
          meta,
          updateSyncStatus(meta, readManaged(meta, repository), repository),
        ),
      );
    return result;
  }
  async function readRuleContent(ruleId: RuleFileId): Promise<RuleFileContent> {
    const meta = await resolveRuleMeta(ruleId);
    const content = readManaged(meta);
    const versions = getRuleDb().readVersions(ruleId);
    const state = updateSyncStatus(meta, content);
    return {
      ...descriptor(meta, state),
      content,
      versions,
      targetContent:
        state.syncStatus === "out-of-sync"
          ? fs.readFileSync(meta.targetPath, "utf8")
          : undefined,
    };
  }
  async function writeTargetRule(
    meta: StoredRuleMeta,
    content: string,
  ): Promise<RuleSyncStatus> {
    assertStorageAvailable();
    if (!meta.targetPath) return "target-missing";
    if (pathsEqual(meta.targetPath, meta.managedPath)) return "synced";
    try {
      await fsp.mkdir(path.dirname(meta.targetPath), { recursive: true });
      await fsp.writeFile(meta.targetPath, content, "utf8");
      return "synced";
    } catch {
      return "sync-error";
    }
  }
  async function saveRuleContent(
    ruleId: RuleFileId,
    content: string,
  ): Promise<RuleFileContent> {
    const meta = await resolveRuleMeta(ruleId);
    const existed = fs.existsSync(meta.managedPath);
    // Read the existing files before committing, so missing history cannot be silently discarded.
    readManaged(meta);
    const versions = nextVersions(
      ruleId,
      content,
      existed ? "manual-save" : "create",
    );
    const next = {
      ...meta,
      updatedAt: new Date().toISOString(),
      syncStatus: inspectRuleSyncState(meta, content).syncStatus,
    };
    publish([graph(next, content, versions)]);
    const status = await writeTargetRule(next, content);
    const repository = getRuleDb();
    const current = repository.getById(ruleId)!;
    repository.upsert({ ...current, syncStatus: status });
    return {
      ...descriptor(next, {
        exists: fs.existsSync(next.targetPath),
        syncStatus: status,
      }),
      content,
      versions: [...versions].reverse(),
    };
  }
  async function resolveRuleConflict(
    ruleId: RuleFileId,
    strategy: RuleConflictResolutionStrategy,
  ): Promise<RuleFileContent> {
    if (strategy !== "use-managed" && strategy !== "use-target")
      throw new Error(`Unknown rule conflict resolution strategy: ${strategy}`);
    const meta = await resolveRuleMeta(ruleId);
    const managed = readManaged(meta);
    if (strategy === "use-managed") {
      const status = await writeTargetRule(meta, managed);
      const current = getRuleDb().getById(ruleId)!;
      getRuleDb().upsert({ ...current, syncStatus: status });
      return {
        ...descriptor(meta, {
          exists: fs.existsSync(meta.targetPath),
          syncStatus: status,
        }),
        content: managed,
        versions: getRuleDb().readVersions(ruleId),
      };
    }
    if (!fs.existsSync(meta.targetPath))
      throw new Error(
        `Cannot resolve rule conflict because target file is missing: ${meta.targetPath}`,
      );
    const content = fs.readFileSync(meta.targetPath, "utf8");
    const versions = nextVersions(ruleId, content, "manual-save");
    publish([
      graph(
        { ...meta, syncStatus: "synced", updatedAt: new Date().toISOString() },
        content,
        versions,
      ),
    ]);
    return readRuleContent(ruleId);
  }
  async function deleteRuleVersion(
    ruleId: RuleFileId,
    versionId: string,
  ): Promise<RuleVersionSnapshot[]> {
    const meta = await resolveRuleMeta(ruleId);
    const content = readManaged(meta);
    const versions = getRuleDb().readVersions(ruleId);
    if (!versions.some((version) => version.id === versionId)) return versions;
    const remaining = versions.filter((version) => version.id !== versionId);
    publish([graph(meta, content, [...remaining].reverse())]);
    return remaining;
  }
  async function createProjectRule(
    input: CreateRuleProjectInput,
  ): Promise<RuleFileDescriptor> {
    const name = input.name.trim();
    const rootPath = input.rootPath.trim();
    if (!name || !rootPath)
      throw new Error("Rule project name and rootPath are required");
    const template = PROJECT_RULE_FILE_TEMPLATES[input.kind ?? "workspace"];
    const targetPath = path.join(rootPath, ...template.relativePath.split("/"));
    const projectId = input.id ?? crypto.randomUUID();
    assertSafeProjectId(projectId);
    const id: ProjectRuleId = `project:${projectId}`;
    const existing = getRuleDb().getAll();
    if (existing.some((record) => record.id === id))
      throw new Error("Rule project id already exists");
    if (
      existing.some(
        (record) =>
          record.scope === "project" &&
          pathsEqual(record.targetPath, targetPath),
      )
    )
      throw new Error("Rule project target path already exists");
    const now = new Date().toISOString();
    const meta: StoredRuleMeta = {
      id,
      scope: "project",
      platformId: template.platformId,
      platformName: input.kind === "cursor" ? `${name} / Cursor` : name,
      platformIcon: template.platformIcon,
      platformDescription: `Project rules from ${rootPath}`,
      canonicalFileName: template.canonicalFileName,
      description: template.description,
      managedPath: getRuleManagedPath(
        { id, scope: "project", canonicalFileName: template.canonicalFileName },
        deps.getRulesDir(),
      ),
      targetPath,
      projectRootPath: rootPath,
      syncStatus: "target-missing",
      createdAt: now,
      updatedAt: now,
    };
    const content = fs.existsSync(targetPath)
      ? fs.readFileSync(targetPath, "utf8")
      : "";
    const state = inspectRuleSyncState(meta, content);
    meta.syncStatus = state.syncStatus;
    publish([
      graph(
        meta,
        content,
        content.trim() ? [createVersion(content, "create")] : [],
      ),
    ]);
    return descriptor(meta, state);
  }
  async function bootstrapRuleWorkspace(): Promise<void> {
    assertStorageAvailable();
    const repository = getRuleDb();
    repository.recoverPublication();
    migrateRuleHistoryV1({
      getRules: () =>
        getAllGlobalRuleTemplates(repository).map(
          (template) =>
            repository.getById(template.id) ?? baseGlobalMeta(template.id),
        ),
      getVersionsDir: (id) => getRuleVersionDirectory(id, deps.getRulesDir()),
      getCurrentVersions: () => repository.getAllVersions(),
      commit: (name, records, entries) =>
        repository.commitHistoryMigration(
          name,
          records.map(({ meta, content, index }) => ({
            rule: toRecord(meta, content, index.length),
            versions: index.map((entry, position) => ({
              id: entry.id,
              ruleId: meta.id,
              version: index.length - position,
              filePath: path.join(
                getRuleVersionDirectory(meta.id, deps.getRulesDir()),
                entry.fileName,
              ),
              source: entry.source,
              createdAt: entry.savedAt,
            })),
          })),
          entries,
        ),
    });
  }
  async function removeProjectRule(projectId: string): Promise<void> {
    assertStorageAvailable();
    assertSafeProjectId(projectId);
    getRuleDb().delete(`project:${projectId}`);
  }
  async function removeMissingProjectRules(
    ruleIds: string[],
  ): Promise<RuleMissingCleanupResult> {
    const result: RuleMissingCleanupResult = {
      removed: [],
      skipped: [],
      failed: [],
    };
    for (const ruleId of new Set(ruleIds)) {
      const projectId = ruleId.startsWith("project:")
        ? ruleId.slice("project:".length)
        : "";
      if (!SAFE_PROJECT_ID_PATTERN.test(projectId)) {
        result.skipped.push(ruleId);
        continue;
      }
      try {
        const meta = getRuleDb().getById(ruleId);
        if (!meta || (await fileExists(meta.targetPath))) {
          result.skipped.push(ruleId);
          continue;
        }
        await removeProjectRule(projectId);
        result.removed.push(meta.id);
      } catch {
        result.failed.push(ruleId);
      }
    }
    return result;
  }
  async function exportRuleBackupRecords(): Promise<RuleBackupRecord[]> {
    await scanRuleDescriptors();
    return getRuleDb()
      .getAll()
      .filter(
        (record) =>
          record.scope === "project" || fs.existsSync(record.managedPath),
      )
      .map((record) => {
        const content = getRuleDb().readContent(record);
        return {
          ...descriptor(record, inspectRuleSyncState(record, content)),
          content,
          versions: getRuleDb().readVersions(record.id),
        };
      });
  }
  function importedMeta(record: RuleBackupRecord): StoredRuleMeta {
    const existing = getRuleDb().getById(record.id);
    if (existing) return existing;
    if (!isProjectRuleFileId(record.id)) return baseGlobalMeta(record.id);
    assertSafeProjectId(record.id.slice("project:".length));
    const now = new Date().toISOString();
    return {
      id: record.id,
      scope: "project",
      platformId: record.platformId,
      platformName: record.platformName,
      platformIcon: record.platformIcon,
      platformDescription: record.platformDescription,
      canonicalFileName: record.name,
      description: record.description,
      managedPath: getRuleManagedPath(
        { id: record.id, scope: "project", canonicalFileName: record.name },
        deps.getRulesDir(),
      ),
      targetPath: "",
      projectRootPath: null,
      syncStatus: "target-missing",
      createdAt: now,
      updatedAt: now,
    };
  }
  async function importRuleBackupRecords(
    records: RuleBackupRecord[],
    options: { replace?: boolean } = {},
  ): Promise<void> {
    await bootstrapRuleWorkspace();
    const seen = new Set<RuleFileId>();
    const plans = records.map((record) => {
      if (
        !isRuleFileId(record.id) ||
        !isRulePlatformId(record.platformId) ||
        typeof record.content !== "string" ||
        !Array.isArray(record.versions) ||
        seen.has(record.id)
      )
        throw new Error("Invalid or duplicate imported Rule");
      seen.add(record.id);
      const meta = importedMeta(record);
      const current = getRuleDb().getById(record.id);
      const content = current ? getRuleDb().readContent(current) : "";
      const versions = mergeImportedRuleVersions(
        record.id,
        content,
        current ? getRuleDb().readVersions(record.id) : [],
        record.versions.map(validateRuleVersionSnapshot),
        record.content,
      ).sort(
        (left, right) => Date.parse(left.savedAt) - Date.parse(right.savedAt),
      );
      return graph(
        {
          ...meta,
          syncStatus: inspectRuleSyncState(meta, record.content).syncStatus,
          updatedAt: new Date().toISOString(),
        },
        record.content,
        versions,
      );
    });
    const removed = options.replace
      ? getRuleDb()
          .getAll()
          .filter(
            (record) => record.scope === "project" && !seen.has(record.id),
          )
          .map((record) => record.id)
      : [];
    publish(plans, removed);
  }
  return {
    listRuleDescriptors: scanRuleDescriptors,
    listCachedRuleDescriptors: scanRuleDescriptors,
    scanRuleDescriptors,
    getProjectMetaById,
    resolveRuleMeta,
    readRuleContent,
    saveRuleContent,
    resolveRuleConflict,
    deleteRuleVersion,
    createProjectRule,
    bootstrapRuleWorkspace,
    removeProjectRule,
    removeMissingProjectRules,
    exportRuleBackupRecords,
    importRuleBackupRecords,
  };
}
