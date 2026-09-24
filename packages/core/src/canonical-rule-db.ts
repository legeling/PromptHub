import fs from "node:fs";
import path from "node:path";

import { RuleDB as BaseRuleDB, type DatabaseAdapter } from "@prompthub/db";
import type {
  RuleFileContent,
  RuleFileId,
  RuleRecord,
  RuleVersionRecord,
  RuleVersionSnapshot,
} from "@prompthub/shared/types";

import {
  publishCanonicalEntries,
  recoverCanonicalEntryPublication,
  isCanonicalCommitOutcomeError,
  CanonicalPostCommitError,
} from "./canonical-entry-publication";
import { encodeCanonicalResourceDirectory } from "./canonical-resource-path";
import {
  materializeRuleResourceBundle,
  readRuleResourceBundle,
} from "./rule-resource-schema";
import {
  RULE_META_FILE_NAME,
  RULE_VERSION_INDEX_FILE_NAME,
  encodeRuleId,
  ruleGroupForKnownId,
  type StoredRuleMeta,
  type StoredRuleVersionIndexEntry,
} from "./rules-workspace-support";
import {
  getDataDir,
  getRulesDir,
  getRuntimeStorageContext,
  getUserDataPath,
} from "./runtime-paths";

const OPERATION_KEY = "rule-library";
const reconciledRuleDatabases = new WeakSet<DatabaseAdapter.Database>();
const MAX_PROJECT_BINDING_BYTES = 1024 * 1024;
const MAX_PROJECT_BINDINGS = 10_000;

interface RuleSnapshot {
  rule: RuleRecord | null;
  versions: RuleVersionRecord[];
}

function bundlePath(ruleId: string): string {
  return path.join(
    getDataDir(),
    "rules",
    encodeCanonicalResourceDirectory(ruleId),
  );
}

function managedPath(record: RuleRecord): string {
  return record.scope === "project"
    ? path.join(
        getRulesDir(),
        "projects",
        encodeCanonicalResourceDirectory(record.id.slice("project:".length)),
        record.canonicalFileName,
      )
    : path.join(
        getRulesDir(),
        "global",
        record.platformId,
        record.canonicalFileName,
      );
}

function versionDirectory(ruleId: RuleFileId): string {
  return path.join(getRulesDir(), ".versions", encodeRuleId(ruleId));
}

function readProjectPlacement(
  metaPath: string,
  ruleId: string,
): { targetPath: string; projectRootPath: string | null } | null {
  const stats = fs.lstatSync(metaPath);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.size > MAX_PROJECT_BINDING_BYTES
  ) {
    throw new Error("Canonical Rule project binding is unsafe");
  }
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch (error) {
    throw new Error("Canonical Rule project binding is invalid", {
      cause: error,
    });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const meta = value as Partial<StoredRuleMeta>;
  if (meta.id !== ruleId) return null;
  if (
    typeof meta.targetPath !== "string" ||
    meta.targetPath.length === 0 ||
    meta.targetPath.includes("\0") ||
    (meta.projectRootPath !== null &&
      meta.projectRootPath !== undefined &&
      (typeof meta.projectRootPath !== "string" ||
        meta.projectRootPath.length === 0 ||
        meta.projectRootPath.includes("\0")))
  ) {
    throw new Error("Canonical Rule project binding is invalid");
  }
  return {
    targetPath: meta.targetPath,
    projectRootPath: meta.projectRootPath ?? null,
  };
}

function recoverProjectPlacement(record: RuleRecord): {
  targetPath: string;
  projectRootPath: string | null;
} {
  if (record.scope !== "project" || record.targetPath) {
    return {
      targetPath: record.targetPath,
      projectRootPath: record.projectRootPath ?? null,
    };
  }
  const projectsRoot = path.join(getRulesDir(), "projects");
  if (!fs.existsSync(projectsRoot)) {
    return { targetPath: "", projectRootPath: null };
  }
  const rootStats = fs.lstatSync(projectsRoot);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new Error("Canonical Rule project workspace path is unsafe");
  }
  const entries = fs.readdirSync(projectsRoot, { withFileTypes: true });
  if (entries.length > MAX_PROJECT_BINDINGS) {
    throw new Error("Canonical Rule project binding limit exceeded");
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const metaPath = path.join(projectsRoot, entry.name, RULE_META_FILE_NAME);
    if (!fs.existsSync(metaPath)) continue;
    const placement = readProjectPlacement(metaPath, record.id);
    if (placement) return placement;
  }
  return { targetPath: "", projectRootPath: null };
}

function readVersionSnapshots(
  versions: readonly RuleVersionRecord[],
): RuleVersionSnapshot[] {
  return [...versions]
    .sort((left, right) => left.version - right.version)
    .map((version) => ({
      id: version.id,
      savedAt: version.createdAt,
      source: version.source,
      content: fs.readFileSync(version.filePath, "utf8"),
    }));
}

function toRuleContent(
  record: RuleRecord,
  versions: readonly RuleVersionRecord[],
): RuleFileContent {
  const snapshots = readVersionSnapshots(versions);
  const content = fs.readFileSync(record.managedPath, "utf8");
  return {
    id: record.id,
    platformId: record.platformId,
    platformName: record.platformName,
    platformIcon: record.platformIcon,
    platformDescription: record.platformDescription,
    name: record.canonicalFileName,
    description: record.description,
    path: record.targetPath,
    exists: true,
    group: ruleGroupForKnownId(record.id),
    managedPath: record.managedPath,
    targetPath: record.targetPath,
    projectRootPath: record.projectRootPath,
    syncStatus: record.syncStatus,
    content,
    versions: snapshots,
  };
}

function canonicalRuleMatches(
  current: ReturnType<typeof readRuleResourceBundle>["rule"],
  expected: RuleFileContent,
): boolean {
  const placementMatches = expected.id.startsWith("project:")
    ? current.targetPath === expected.targetPath &&
      current.projectRootPath === (expected.projectRootPath ?? null)
    : current.targetPath === undefined;
  return (
    placementMatches &&
    current.id === expected.id &&
    current.platformId === expected.platformId &&
    current.platformName === expected.platformName &&
    current.platformIcon === expected.platformIcon &&
    current.platformDescription === expected.platformDescription &&
    current.name === expected.name &&
    current.description === expected.description &&
    current.group === expected.group &&
    current.content === expected.content &&
    JSON.stringify(current.versions) === JSON.stringify(expected.versions)
  );
}

function publishRule(
  record: RuleRecord,
  versions: readonly RuleVersionRecord[],
): void {
  if (versions.length === 0) return;
  const targetPath = bundlePath(record.id);
  const current = fs.existsSync(targetPath)
    ? readRuleResourceBundle(targetPath)
    : null;
  const expected = toRuleContent(record, versions);
  if (current && canonicalRuleMatches(current.rule, expected)) return;
  publishCanonicalEntries({
    rootPath: getUserDataPath(),
    operationKey: OPERATION_KEY,
    entries: [
      {
        targetPath,
        prepare(stagePath) {
          materializeRuleResourceBundle({
            bundlePath: stagePath,
            rule: toRuleContent(record, versions),
            writePolicy: {
              mode: "create",
              revision: (current?.bundleManifest.revision ?? 0) + 1,
            },
          });
        },
      },
    ],
    verify() {
      const restored = readRuleResourceBundle(targetPath).rule;
      if (!canonicalRuleMatches(restored, expected))
        throw new Error("Canonical Rule publication verification failed");
    },
  });
}

function deleteRuleBundle(ruleId: string): void {
  recoverCanonicalEntryPublication(getUserDataPath(), OPERATION_KEY);
  const targetPath = bundlePath(ruleId);
  if (fs.existsSync(targetPath)) {
    publishCanonicalEntries({
      rootPath: getUserDataPath(),
      operationKey: OPERATION_KEY,
      entries: [{ targetPath, delete: true }],
    });
  }
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function hydrateWorkspace(
  record: RuleRecord,
  resource = readRuleResourceBundle(bundlePath(record.id)),
): {
  managedPath: string;
  targetPath: string;
  projectRootPath: string | null;
  versions: RuleVersionRecord[];
} {
  const placement = recoverProjectPlacement(record);
  const targetManagedPath = managedPath(record);
  const containerPath = path.dirname(targetManagedPath);
  const stagePath = `${containerPath}.stage-${process.pid}`;
  fs.rmSync(stagePath, { recursive: true, force: true });
  fs.mkdirSync(stagePath, { recursive: true, mode: 0o700 });
  try {
    const stagedManagedPath = path.join(stagePath, record.canonicalFileName);
    fs.writeFileSync(stagedManagedPath, resource.rule.content, {
      encoding: "utf8",
      mode: 0o600,
    });
    const meta: StoredRuleMeta = {
      id: record.id,
      scope: record.scope,
      platformId: record.platformId,
      platformName: record.platformName,
      platformIcon: record.platformIcon,
      platformDescription: record.platformDescription,
      canonicalFileName: record.canonicalFileName,
      description: record.description,
      managedPath: targetManagedPath,
      targetPath: placement.targetPath,
      projectRootPath: placement.projectRootPath,
      syncStatus: record.syncStatus,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
    writeJson(path.join(stagePath, RULE_META_FILE_NAME), meta);
    fs.rmSync(containerPath, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(containerPath), { recursive: true, mode: 0o700 });
    fs.renameSync(stagePath, containerPath);
  } finally {
    fs.rmSync(stagePath, { recursive: true, force: true });
  }

  const versionDir = versionDirectory(record.id);
  const versionStage = `${versionDir}.stage-${process.pid}`;
  fs.rmSync(versionStage, { recursive: true, force: true });
  fs.mkdirSync(versionStage, { recursive: true, mode: 0o700 });
  const versionRecords: RuleVersionRecord[] = [];
  const index: StoredRuleVersionIndexEntry[] = [];
  try {
    for (const [position, version] of resource.rule.versions.entries()) {
      const fileName = `${String(position + 1).padStart(4, "0")}.md`;
      const finalFilePath = path.join(versionDir, fileName);
      fs.writeFileSync(path.join(versionStage, fileName), version.content, {
        encoding: "utf8",
        mode: 0o600,
      });
      index.unshift({
        id: version.id,
        savedAt: version.savedAt,
        source: version.source,
        fileName,
      });
      versionRecords.push({
        id: version.id,
        ruleId: record.id,
        version: position + 1,
        filePath: finalFilePath,
        source: version.source,
        createdAt: version.savedAt,
      });
    }
    writeJson(path.join(versionStage, RULE_VERSION_INDEX_FILE_NAME), index);
    fs.rmSync(versionDir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(versionDir), { recursive: true, mode: 0o700 });
    fs.renameSync(versionStage, versionDir);
  } finally {
    fs.rmSync(versionStage, { recursive: true, force: true });
  }
  return {
    managedPath: targetManagedPath,
    targetPath: placement.targetPath,
    projectRootPath: placement.projectRootPath,
    versions: versionRecords,
  };
}

export class CanonicalRuleDB extends BaseRuleDB {
  private pending = new Map<string, RuleSnapshot>();

  constructor(db: DatabaseAdapter.Database) {
    super(db);
  }

  private canonical(): boolean {
    return getRuntimeStorageContext().localAuthority === "canonical-files";
  }

  private snapshot(ruleId: string): RuleSnapshot {
    return { rule: super.getById(ruleId), versions: super.getVersions(ruleId) };
  }

  private restore(snapshot: RuleSnapshot, ruleId: string): void {
    super.delete(ruleId);
    if (snapshot.rule) {
      super.upsert(snapshot.rule);
      super.replaceVersions(ruleId, snapshot.versions);
      if (fs.existsSync(bundlePath(ruleId))) {
        const hydrated = hydrateWorkspace(snapshot.rule);
        this.db
          .prepare(
            "UPDATE rules SET managed_path = ?, target_path = ?, project_root_path = ? WHERE id = ?",
          )
          .run(
            hydrated.managedPath,
            hydrated.targetPath,
            hydrated.projectRootPath,
            ruleId,
          );
        super.replaceVersions(ruleId, hydrated.versions);
      }
    }
  }

  override upsert(rule: RuleRecord): void {
    if (this.canonical() && !this.pending.has(rule.id))
      this.pending.set(rule.id, this.snapshot(rule.id));
    super.upsert(rule);
  }

  override replaceVersions(
    ruleId: string,
    versions: RuleVersionRecord[],
  ): void {
    if (!this.canonical()) return super.replaceVersions(ruleId, versions);
    const before = this.pending.get(ruleId) ?? this.snapshot(ruleId);
    try {
      super.replaceVersions(ruleId, versions);
      const record = super.getById(ruleId);
      if (record) publishRule(record, super.getVersions(ruleId));
      this.pending.delete(ruleId);
    } catch (error) {
      this.pending.delete(ruleId);
      if (isCanonicalCommitOutcomeError(error)) throw error;
      this.restore(before, ruleId);
      throw error;
    }
  }

  override delete(id: string): void {
    if (!this.canonical()) return super.delete(id);
    const before = this.snapshot(id);
    let published = false;
    try {
      super.delete(id);
      deleteRuleBundle(id);
      published = true;
      if (before.rule)
        fs.rmSync(path.dirname(managedPath(before.rule)), {
          recursive: true,
          force: true,
        });
      if (before.rule)
        fs.rmSync(versionDirectory(before.rule.id), {
          recursive: true,
          force: true,
        });
    } catch (error) {
      if (isCanonicalCommitOutcomeError(error)) throw error;
      if (published) throw new CanonicalPostCommitError(`rule:${id}`, error);
      this.restore(before, id);
      throw error;
    }
  }

  reconcileCanonicalWorkspaces(): void {
    if (!this.canonical() || reconciledRuleDatabases.has(this.db)) return;
    try {
      for (const record of super.getAll()) {
        if (!fs.existsSync(bundlePath(record.id))) continue;
        const hydrated = hydrateWorkspace(record);
        this.db.transaction(() => {
          this.db
            .prepare(
              "UPDATE rules SET managed_path = ?, target_path = ?, project_root_path = ? WHERE id = ?",
            )
            .run(
              hydrated.managedPath,
              hydrated.targetPath,
              hydrated.projectRootPath,
              record.id,
            );
          super.replaceVersions(record.id, hydrated.versions);
        })();
      }
      reconciledRuleDatabases.add(this.db);
    } catch (error) {
      reconciledRuleDatabases.delete(this.db);
      throw error;
    }
  }
}
