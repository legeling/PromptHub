import fsp from "fs/promises";
import path from "path";

import type {
  CreateRuleProjectInput,
  RuleBackupRecord,
  RuleFileDescriptor,
  RuleFileId,
  RuleVersionSnapshot,
} from "@prompthub/shared/types";

import type { RuleDB } from "./database";
import { getProjectRuleManagedDirectory } from "./canonical-rule-db";
import {
  RULE_VERSION_LIMIT,
  encodeRuleId,
  fileExists,
  hashContent,
  isProjectRuleFileId,
  writeJsonFile,
  writeTextFileAtomic,
  type ImportRuleBackupRecordsOptions,
  type StoredRuleMeta,
  type StoredRuleVersionIndexEntry,
} from "./rules-workspace-support";

interface RuleImportRollbackState {
  managedPath: string;
  managedExists: boolean;
  managedContent: string;
  metaPath: string;
  meta: StoredRuleMeta;
  versions: RuleVersionSnapshot[];
}

interface BoundedRuleVersionCandidate {
  version: RuleVersionSnapshot;
  timestamp: number;
}

interface RuleVersionMergeState {
  merged: RuleVersionSnapshot[];
  seenContents: Set<string>;
  seenIds: Set<string>;
  protectedContents: Set<string>;
}

interface ImportedProjectSetup {
  managedDirectory: string | null;
  creationAttempted: boolean;
}

export interface RuleBackupImporterDeps {
  bootstrapRuleWorkspace: () => Promise<void>;
  getRuleProjectsRoot: () => string;
  getRuleVersionsDir: (ruleId: RuleFileId) => string;
  getRuleMetaPath: (managedPath: string) => string;
  resolveRuleMeta: (ruleId: RuleFileId) => Promise<StoredRuleMeta>;
  getProjectMetaById: (
    ruleId: `project:${string}`,
  ) => Promise<StoredRuleMeta | null>;
  createProjectRule: (
    input: CreateRuleProjectInput,
  ) => Promise<RuleFileDescriptor>;
  writeManagedRule: (meta: StoredRuleMeta, content: string) => Promise<void>;
  writeMeta: (meta: StoredRuleMeta) => Promise<void>;
  syncStatusForMeta: (
    meta: StoredRuleMeta,
  ) => Promise<StoredRuleMeta["syncStatus"]>;
  replaceRuleVersions: (
    ruleId: RuleFileId,
    versions: RuleVersionSnapshot[],
  ) => Promise<StoredRuleVersionIndexEntry[]>;
  syncRuleIndexWithData: (
    meta: StoredRuleMeta,
    content: string,
    versionIndex: StoredRuleVersionIndexEntry[],
  ) => Promise<void>;
  readRuleVersions: (ruleId: RuleFileId) => Promise<{
    index: StoredRuleVersionIndexEntry[];
    versions: RuleVersionSnapshot[];
  }>;
  createRuleDb: () => RuleDB;
  removeProjectRulesMissingFromImport: (
    records: RuleBackupRecord[],
  ) => Promise<void>;
}

function boundedVersionTimestamp(
  savedAt: string,
  now: number,
  clampFuture: boolean,
): number {
  const parsed = Date.parse(savedAt);
  if (!Number.isFinite(parsed)) {
    return now;
  }
  return clampFuture && parsed > now ? now : parsed;
}

function normalizeBoundedRuleVersion(
  version: RuleVersionSnapshot,
  now: number,
  clampFuture: boolean,
): BoundedRuleVersionCandidate {
  const timestamp = boundedVersionTimestamp(version.savedAt, now, clampFuture);
  const parsedTimestamp = Date.parse(version.savedAt);
  const normalizedVersion =
    !Number.isFinite(parsedTimestamp) ||
    (clampFuture && timestamp !== parsedTimestamp)
      ? { ...version, savedAt: new Date(timestamp).toISOString() }
      : version;
  return { version: normalizedVersion, timestamp };
}

function insertBoundedRuleVersionCandidate(
  candidates: BoundedRuleVersionCandidate[],
  candidate: BoundedRuleVersionCandidate,
  limit: number,
): void {
  const insertionIndex = candidates.findIndex(
    (current) => candidate.timestamp > current.timestamp,
  );
  if (insertionIndex < 0) {
    candidates.push(candidate);
  } else {
    candidates.splice(insertionIndex, 0, candidate);
  }
  if (candidates.length > limit) {
    candidates.pop();
  }
}

function isNewerBoundedRuleCandidate(
  candidate: BoundedRuleVersionCandidate,
  existing: BoundedRuleVersionCandidate,
): boolean {
  return candidate.timestamp > existing.timestamp;
}

function selectBoundedRuleVersions(
  versions: RuleVersionSnapshot[],
  limit: number,
  clampFuture: boolean,
): RuleVersionSnapshot[] {
  const now = Date.now();
  const candidates: BoundedRuleVersionCandidate[] = [];
  for (const version of versions) {
    const candidate = normalizeBoundedRuleVersion(version, now, clampFuture);
    const duplicateIndex = candidates.findIndex(
      (current) => current.version.content === version.content,
    );
    if (duplicateIndex >= 0) {
      if (isNewerBoundedRuleCandidate(candidate, candidates[duplicateIndex])) {
        candidates.splice(duplicateIndex, 1);
        insertBoundedRuleVersionCandidate(candidates, candidate, limit);
      }
      continue;
    }
    insertBoundedRuleVersionCandidate(candidates, candidate, limit);
  }
  return candidates.map((candidate) => candidate.version);
}

function uniqueRuleVersionId(
  ruleId: RuleFileId,
  version: RuleVersionSnapshot,
  seenIds: Set<string>,
  imported: boolean,
): RuleVersionSnapshot {
  if (!seenIds.has(version.id)) {
    return version;
  }
  const suffix = imported ? "import" : "history";
  const digest = hashContent(`${ruleId}\n${version.content}`);
  const baseId = `${encodeRuleId(ruleId)}-${suffix}-${digest}`;
  let nextId = baseId;
  let collision = 1;
  while (seenIds.has(nextId)) {
    nextId = `${baseId}-${collision}`;
    collision += 1;
  }
  return { ...version, id: nextId };
}

function createRuleVersionMergeState(): RuleVersionMergeState {
  return {
    merged: [],
    seenContents: new Set<string>(),
    seenIds: new Set<string>(),
    protectedContents: new Set<string>(),
  };
}

function appendMergedRuleVersion(
  state: RuleVersionMergeState,
  ruleId: RuleFileId,
  version: RuleVersionSnapshot,
  imported: boolean,
): void {
  if (state.seenContents.has(version.content)) {
    return;
  }
  const uniqueVersion = uniqueRuleVersionId(
    ruleId,
    version,
    state.seenIds,
    imported,
  );
  state.seenContents.add(uniqueVersion.content);
  state.seenIds.add(uniqueVersion.id);
  state.merged.push(uniqueVersion);
}

function protectGeneratedRuleVersion(
  state: RuleVersionMergeState,
  ruleId: RuleFileId,
  content: string,
  suffix: string,
  savedAt: string,
): void {
  if (!content) {
    return;
  }
  state.protectedContents.add(content);
  if (state.seenContents.has(content)) {
    return;
  }
  appendMergedRuleVersion(
    state,
    ruleId,
    {
      id: `${encodeRuleId(ruleId)}-${suffix}-${hashContent(`${savedAt}\n${content}`).slice(0, 16)}`,
      savedAt,
      content,
      source: "manual-save",
    },
    false,
  );
}

function compareRuleVersionSnapshotsNewestFirst(
  left: RuleVersionSnapshot,
  right: RuleVersionSnapshot,
): number {
  return Date.parse(right.savedAt) - Date.parse(left.savedAt);
}

function limitMergedRuleVersions(
  state: RuleVersionMergeState,
): RuleVersionSnapshot[] {
  if (state.merged.length <= RULE_VERSION_LIMIT) {
    return state.merged;
  }
  const protectedVersions = state.merged.filter((version) =>
    state.protectedContents.has(version.content),
  );
  const unprotectedVersions = state.merged
    .filter((version) => !state.protectedContents.has(version.content))
    .sort(compareRuleVersionSnapshotsNewestFirst);
  return [
    ...unprotectedVersions.slice(
      0,
      RULE_VERSION_LIMIT - protectedVersions.length,
    ),
    ...protectedVersions,
  ];
}

function mergeImportedRuleVersions(
  ruleId: RuleFileId,
  previousManagedContent: string,
  existingVersions: RuleVersionSnapshot[],
  importedVersions: RuleVersionSnapshot[],
  importedContent: string,
): RuleVersionSnapshot[] {
  const state = createRuleVersionMergeState();
  for (const version of selectBoundedRuleVersions(
    existingVersions,
    RULE_VERSION_LIMIT,
    false,
  )) {
    appendMergedRuleVersion(state, ruleId, version, false);
  }
  for (const version of selectBoundedRuleVersions(
    importedVersions,
    RULE_VERSION_LIMIT,
    true,
  )) {
    appendMergedRuleVersion(state, ruleId, version, true);
  }
  const generatedAt = Date.now();
  protectGeneratedRuleVersion(
    state,
    ruleId,
    previousManagedContent,
    "pre-import",
    new Date(generatedAt).toISOString(),
  );
  protectGeneratedRuleVersion(
    state,
    ruleId,
    importedContent,
    "import",
    new Date(generatedAt + 1).toISOString(),
  );
  return limitMergedRuleVersions(state);
}

async function captureRuleImportRollbackState(
  deps: RuleBackupImporterDeps,
  meta: StoredRuleMeta,
): Promise<RuleImportRollbackState> {
  const metaPath = deps.getRuleMetaPath(meta.managedPath);
  const managedExists = await fileExists(meta.managedPath);
  const versionRead = await deps.readRuleVersions(meta.id);
  return {
    managedPath: meta.managedPath,
    managedExists,
    managedContent: managedExists
      ? await fsp.readFile(meta.managedPath, "utf-8")
      : "",
    metaPath,
    meta,
    versions: versionRead.versions,
  };
}

async function restoreRuleImportVersionFiles(
  deps: RuleBackupImporterDeps,
  ruleId: RuleFileId,
  versions: RuleVersionSnapshot[],
): Promise<StoredRuleVersionIndexEntry[]> {
  if (versions.length > 0) {
    return deps.replaceRuleVersions(ruleId, versions);
  }
  await fsp.rm(deps.getRuleVersionsDir(ruleId), {
    recursive: true,
    force: true,
  });
  return [];
}

async function restoreRuleImportRollbackState(
  deps: RuleBackupImporterDeps,
  ruleId: RuleFileId,
  state: RuleImportRollbackState,
): Promise<void> {
  if (state.managedExists) {
    await writeTextFileAtomic(state.managedPath, state.managedContent);
  } else {
    await fsp.rm(state.managedPath, { force: true });
  }
  await writeJsonFile(state.metaPath, state.meta);
  const versionIndex = await restoreRuleImportVersionFiles(
    deps,
    ruleId,
    state.versions,
  );
  await deps.syncRuleIndexWithData(
    state.meta,
    state.managedContent,
    versionIndex,
  );
}

function importedProjectManagedDirectory(
  deps: RuleBackupImporterDeps,
  record: RuleBackupRecord,
): string {
  const projectId = record.id.slice("project:".length);
  return getProjectRuleManagedDirectory(deps.getRuleProjectsRoot(), projectId);
}

async function removeFailedImportedProject(
  deps: RuleBackupImporterDeps,
  ruleId: RuleFileId,
  managedDirectory: string,
): Promise<void> {
  await fsp.rm(managedDirectory, { recursive: true, force: true });
  await fsp.rm(deps.getRuleVersionsDir(ruleId), {
    recursive: true,
    force: true,
  });
  deps.createRuleDb().delete(ruleId);
}

async function prepareImportedProject(
  deps: RuleBackupImporterDeps,
  record: RuleBackupRecord,
): Promise<ImportedProjectSetup> {
  if (!isProjectRuleFileId(record.id)) {
    return { managedDirectory: null, creationAttempted: false };
  }
  const managedDirectory = importedProjectManagedDirectory(deps, record);
  if (await deps.getProjectMetaById(record.id)) {
    return { managedDirectory, creationAttempted: false };
  }
  try {
    await deps.createProjectRule({
      id: record.id.slice("project:".length),
      kind: record.platformId === "cursor" ? "cursor" : "workspace",
      name:
        record.platformId === "cursor"
          ? record.platformName.replace(/ \/ Cursor$/u, "")
          : record.platformName,
      rootPath:
        record.projectRootPath ??
        path.dirname(record.targetPath ?? record.path),
    });
  } catch (error) {
    await removeFailedImportedProject(deps, record.id, managedDirectory);
    throw error;
  }
  return { managedDirectory, creationAttempted: true };
}

async function publishImportedRule(
  deps: RuleBackupImporterDeps,
  record: RuleBackupRecord,
  meta: StoredRuleMeta,
  rollbackState: RuleImportRollbackState,
): Promise<void> {
  const mergedVersions = mergeImportedRuleVersions(
    record.id,
    rollbackState.managedContent,
    rollbackState.versions,
    record.versions,
    record.content,
  );
  await deps.writeManagedRule(meta, record.content);
  const index = await deps.replaceRuleVersions(record.id, mergedVersions);
  const nextMeta: StoredRuleMeta = {
    ...meta,
    syncStatus: await deps.syncStatusForMeta(meta),
    updatedAt: new Date().toISOString(),
  };
  await deps.writeMeta(nextMeta);
  await deps.syncRuleIndexWithData(nextMeta, record.content, index);
}

async function importSingleRuleBackupRecord(
  deps: RuleBackupImporterDeps,
  record: RuleBackupRecord,
): Promise<void> {
  const project = await prepareImportedProject(deps, record);
  let rollbackState: RuleImportRollbackState | null = null;
  try {
    const meta = await deps.resolveRuleMeta(record.id);
    rollbackState = await captureRuleImportRollbackState(deps, meta);
    await publishImportedRule(deps, record, meta, rollbackState);
  } catch (error) {
    if (project.creationAttempted) {
      await removeFailedImportedProject(
        deps,
        record.id,
        project.managedDirectory!,
      );
    } else if (rollbackState) {
      await restoreRuleImportRollbackState(deps, record.id, rollbackState);
    }
    throw error;
  }
}

export function createRuleBackupImporter(
  deps: RuleBackupImporterDeps,
): (
  records: RuleBackupRecord[],
  options?: ImportRuleBackupRecordsOptions,
) => Promise<void> {
  return async (records, options = {}): Promise<void> => {
    await deps.bootstrapRuleWorkspace();
    for (const record of records) {
      await importSingleRuleBackupRecord(deps, record);
    }
    if (options.replace) {
      await deps.removeProjectRulesMissingFromImport(records);
    }
  };
}
