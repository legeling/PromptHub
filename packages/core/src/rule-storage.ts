import fs from "node:fs";
import path from "node:path";
import { RuleDB as SqlRuleDB, type DatabaseAdapter } from "@prompthub/db";
import type {
  RuleRecord,
  RuleVersionRecord,
  RuleVersionSnapshot,
  RuleFileId,
} from "@prompthub/shared/types";
import { encodeCanonicalResourceDirectory } from "./canonical-resource-path";
import type { CanonicalEntryMutation } from "./canonical-entry-publication";
import {
  publishSqliteEntries,
  recoverSqliteEntryPublication,
} from "./sqlite-entry-publication";
import { getRulesDir, getUserDataPath } from "./runtime-paths";
import { assertStoragePathComponentsSafe } from "./runtime-storage-context";
import { hashContent, assertSafeProjectId } from "./rules-workspace-support";
import { claudeScopedRuleRelativePath } from "./claude-scoped-rules";

const OPERATION_KEY = "rule-storage";

function ruleDirectoryIdentity(ruleId: RuleFileId): string {
  // Scoped identities encode a relative path and can exceed a filesystem segment.
  return claudeScopedRuleRelativePath(ruleId) === null
    ? encodeCanonicalResourceDirectory(ruleId)
    : `claude-scoped-${hashContent(ruleId)}`;
}

export interface RuleStorageContext {
  rootPath: string;
  rulesRoot: string;
  ownerUserId: string;
}

export interface RuleStoragePublication {
  entries: CanonicalEntryMutation[];
  commit: () => void;
}

export interface RuleStorageGraph {
  rule: RuleRecord;
  content: string | null;
  versions: RuleVersionSnapshot[];
}

export function getProjectRuleManagedDirectory(
  projectsRoot: string,
  projectId: string,
): string {
  assertSafeProjectId(projectId);
  return path.join(projectsRoot, encodeCanonicalResourceDirectory(projectId));
}

export function getRuleVersionDirectory(
  ruleId: RuleFileId,
  rulesRoot = getRulesDir(),
): string {
  return path.join(rulesRoot, ".versions", ruleDirectoryIdentity(ruleId));
}

export function getRuleManagedPath(
  rule: Pick<RuleRecord, "id" | "scope" | "canonicalFileName">,
  rulesRoot = getRulesDir(),
): string {
  // Scoped identity owns the nested native path; each managed package uses its leaf name.
  const scopedPath = claudeScopedRuleRelativePath(rule.id);
  const fileName =
    scopedPath === null ? rule.canonicalFileName : path.basename(scopedPath);
  if (
    !fileName ||
    [".", ".."].includes(fileName) ||
    path.basename(fileName) !== fileName ||
    /[\\\0]/u.test(fileName)
  )
    throw new Error("Invalid Rule managed file name");
  const directory =
    rule.scope === "project"
      ? getProjectRuleManagedDirectory(
          path.join(rulesRoot, "projects"),
          rule.id.slice("project:".length),
        )
      : path.join(rulesRoot, "global", ruleDirectoryIdentity(rule.id));
  return path.join(directory, fileName);
}

export function readRuleFile(file: string, root = getUserDataPath()): string {
  assertStoragePathComponentsSafe(root, file);
  if (!fs.lstatSync(file).isFile())
    throw new Error("Rule content path is not a regular file");
  const bytes = fs.readFileSync(file);
  const content = bytes.toString("utf8");
  if (!Buffer.from(content, "utf8").equals(bytes))
    throw new Error("Rule content is not valid UTF-8");
  return content;
}

export function ruleVersionRecords(
  ruleId: RuleFileId,
  versions: RuleVersionSnapshot[],
  rulesRoot = getRulesDir(),
): RuleVersionRecord[] {
  return versions.map((version, position) => ({
    id: version.id,
    ruleId,
    version: position + 1,
    filePath: path.join(
      getRuleVersionDirectory(ruleId, rulesRoot),
      `${hashContent(version.id)}.md`,
    ),
    source: version.source,
    createdAt: version.savedAt,
  }));
}

function contentEntry(
  targetPath: string,
  content: string,
): CanonicalEntryMutation {
  return {
    targetPath: path.dirname(targetPath),
    prepare(stagePath) {
      fs.mkdirSync(stagePath, { mode: 0o700 });
      fs.writeFileSync(
        path.join(stagePath, path.basename(targetPath)),
        content,
        { mode: 0o600 },
      );
    },
  };
}

export function ruleStorageEntries(
  graph: RuleStorageGraph,
  rulesRoot: string,
): CanonicalEntryMutation[] {
  const expected = getRuleManagedPath(graph.rule, rulesRoot);
  if (path.resolve(graph.rule.managedPath) !== expected)
    throw new Error("Rule managed path does not match its identity");
  const versions = ruleVersionRecords(graph.rule.id, graph.versions, rulesRoot);
  const entries: CanonicalEntryMutation[] = [];
  if (graph.content !== null)
    entries.push(contentEntry(expected, graph.content));
  else if (fs.existsSync(expected))
    entries.push({ targetPath: path.dirname(expected), delete: true });
  const versionDirectory = getRuleVersionDirectory(graph.rule.id, rulesRoot);
  if (versions.length > 0 || fs.existsSync(versionDirectory))
    entries.push({
      targetPath: versionDirectory,
      prepare(stagePath) {
        fs.mkdirSync(stagePath, { mode: 0o700 });
        for (const [index, version] of versions.entries())
          fs.writeFileSync(
            path.join(stagePath, path.basename(version.filePath)),
            graph.versions[index].content,
            { mode: 0o600 },
          );
      },
    });
  return entries;
}

/** SQLite owns Rule metadata; publication coordinates only the referenced body files. */
export class RuleStorageDB extends SqlRuleDB {
  private readonly context: RuleStorageContext;

  constructor(
    database: DatabaseAdapter.Database,
    context?: RuleStorageContext,
  ) {
    super(database, context?.ownerUserId ?? "");
    this.context = context ?? {
      rootPath: getUserDataPath(),
      rulesRoot: getRulesDir(),
      ownerUserId: "",
    };
    assertStoragePathComponentsSafe(
      this.context.rootPath,
      this.context.rulesRoot,
    );
  }

  readVersions(ruleId: RuleFileId): RuleVersionSnapshot[] {
    return this.getVersions(ruleId).map((version) => {
      const expected = path.join(
        getRuleVersionDirectory(ruleId, this.context.rulesRoot),
        hashContent(version.id) + ".md",
      );
      if (version.filePath !== expected)
        throw new Error("Rule history path does not match its identity");
      return {
        id: version.id,
        savedAt: version.createdAt,
        source: version.source,
        content: readRuleFile(version.filePath, this.context.rootPath),
      };
    });
  }

  readContent(rule: RuleRecord): string {
    if (rule.managedPath !== getRuleManagedPath(rule, this.context.rulesRoot))
      throw new Error("Rule managed path does not match its identity");
    if (
      !fs.existsSync(rule.managedPath) &&
      rule.scope === "global" &&
      rule.currentVersion === 0 &&
      rule.contentHash === ""
    )
      return "";
    return readRuleFile(rule.managedPath, this.context.rootPath);
  }

  preparePublication(
    graphs: RuleStorageGraph[],
    deletedIds: RuleFileId[] = [],
  ): RuleStoragePublication {
    const rulesRoot = this.context.rulesRoot;
    const ids = new Set<string>();
    for (const graph of graphs) {
      if (ids.has(graph.rule.id))
        throw new Error("Duplicate Rule publication identity");
      ids.add(graph.rule.id);
    }
    const entries = graphs.flatMap((graph) =>
      ruleStorageEntries(graph, rulesRoot),
    );
    for (const id of deletedIds) {
      if (ids.has(id))
        throw new Error(
          "Rule publication cannot update and delete the same identity",
        );
      const rule = super.getById(id);
      if (!rule) continue;
      if (rule.managedPath !== getRuleManagedPath(rule, rulesRoot))
        throw new Error("Rule deletion path does not match its identity");
      entries.push(
        { targetPath: path.dirname(rule.managedPath), delete: true },
        { targetPath: getRuleVersionDirectory(id, rulesRoot), delete: true },
      );
    }
    return {
      entries,
      commit: () => {
        for (const id of deletedIds) super.delete(id);
        for (const graph of graphs) {
          super.upsert(graph.rule);
          super.replaceVersions(
            graph.rule.id,
            ruleVersionRecords(graph.rule.id, graph.versions, rulesRoot),
          );
        }
      },
    };
  }

  publishGraphs(
    graphs: RuleStorageGraph[],
    deletedIds: RuleFileId[] = [],
  ): void {
    const publication = this.preparePublication(graphs, deletedIds);
    publishSqliteEntries(this.db, {
      rootPath: this.context.rootPath,
      operationKey: OPERATION_KEY,
      ...publication,
    });
  }

  override delete(id: string): void {
    const rule = super.getById(id);
    if (rule) this.publishGraphs([], [rule.id]);
  }

  commitHistoryMigration(
    migrationName: string,
    records: Array<{ rule: RuleRecord; versions: RuleVersionRecord[] }>,
    entries: CanonicalEntryMutation[],
  ): void {
    publishSqliteEntries(this.db, {
      rootPath: this.context.rootPath,
      operationKey: migrationName,
      entries,
      commit: () => {
        for (const record of records) {
          super.upsert(record.rule);
          super.replaceVersions(record.rule.id, record.versions);
        }
        this.db.run(
          "INSERT OR REPLACE INTO schema_migrations (name, applied_at) VALUES (?, ?)",
          migrationName,
          Date.now(),
        );
      },
    });
  }

  recoverPublication(): void {
    recoverSqliteEntryPublication(
      this.db,
      this.context.rootPath,
      OPERATION_KEY,
    );
  }
}
