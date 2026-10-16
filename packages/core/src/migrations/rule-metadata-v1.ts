import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  RuleDB,
  createDatabaseSafetyPoint,
  type DatabaseAdapter,
} from "@prompthub/db";
import type {
  RuleFileId,
  RuleRecord,
  RuleVersionRecord,
  RuleVersionSnapshot,
} from "@prompthub/shared/types";
import type { CanonicalEntryMutation } from "../canonical-entry-publication";
import {
  publishSqliteEntries,
  recoverSqliteEntryPublication,
} from "../sqlite-entry-publication";
import {
  getRuleManagedPath,
  ruleStorageEntries,
  ruleVersionRecords,
  readRuleFile,
  type RuleStorageGraph,
} from "../rule-storage";
import { hashContent, type StoredRuleMeta } from "../rules-workspace-support";
import {
  readRuleMetadataSources,
  ruleSourceDigest,
  type RuleMetadataSources,
} from "./rule-metadata-sources";
import { assertStoragePathComponentsSafe } from "../runtime-storage-context";

const MIGRATION_NAME = "rule-metadata-v1";

function metadataFor(
  id: RuleFileId,
  current: RuleRecord | undefined,
  sources: RuleMetadataSources,
  completed: boolean,
): StoredRuleMeta {
  const metadata = sources.metadata.get(id) ?? [];
  const matching =
    current &&
    metadata.find((meta) => meta.managedPath === current.managedPath);
  const meta = matching || metadata[0];
  const bundle = sources.bundles.get(id);
  const selected = current ?? meta;
  if (selected) {
    if (
      bundle &&
      [
        "platformId",
        "platformName",
        "platformIcon",
        "platformDescription",
        "description",
      ].some((key) => Reflect.get(selected, key) !== Reflect.get(bundle, key))
    )
      throw new Error(`Rule metadata migration conflict: ${id}`);
    // Before adoption, old catalog rebuilds could lose a binding still owned by
    // workspace metadata. After adoption, an explicit SQL detach always wins.
    if (
      !completed &&
      current?.scope === "project" &&
      !current.targetPath &&
      meta?.targetPath
    )
      return {
        ...selected,
        targetPath: meta.targetPath,
        projectRootPath: meta.projectRootPath ?? null,
      };
    return selected;
  }
  if (!bundle) throw new Error(`Historical Rule metadata is missing: ${id}`);
  const first = bundle.versions[0]?.savedAt ?? new Date().toISOString();
  return {
    id,
    scope: id.startsWith("project:") ? "project" : "global",
    platformId: bundle.platformId,
    platformName: bundle.platformName,
    platformIcon: bundle.platformIcon,
    platformDescription: bundle.platformDescription,
    canonicalFileName: bundle.name,
    description: bundle.description,
    managedPath: "",
    targetPath: bundle.targetPath ?? "",
    projectRootPath: bundle.projectRootPath ?? null,
    syncStatus: "target-missing",
    createdAt: first,
    updatedAt: bundle.versions.at(-1)?.savedAt ?? first,
  };
}

function safeExistingFile(root: string, file: string): string | null {
  if (!file) return null;
  const relative = path.relative(root, path.resolve(file));
  if (
    relative.startsWith(`..${path.sep}`) ||
    relative === ".." ||
    path.isAbsolute(relative)
  )
    return null;
  assertStoragePathComponentsSafe(root, file);
  return fs.existsSync(file) ? readRuleFile(file, root) : null;
}

function mergeVersions(
  id: RuleFileId,
  candidates: RuleVersionSnapshot[],
): RuleVersionSnapshot[] {
  const result = new Map<string, RuleVersionSnapshot>();
  for (const version of candidates) {
    const previous = result.get(version.id);
    if (previous && !isDeepStrictEqual(previous, version))
      throw new Error(`Rule version migration conflict: ${id}/${version.id}`);
    result.set(version.id, version);
  }
  return [...result.values()].sort(
    (a, b) =>
      Date.parse(a.savedAt) - Date.parse(b.savedAt) || a.id.localeCompare(b.id),
  );
}

function planRule(
  root: string,
  id: RuleFileId,
  current: RuleRecord | undefined,
  currentVersions: RuleVersionRecord[],
  sources: RuleMetadataSources,
  completed: boolean,
): RuleStorageGraph {
  const meta = metadataFor(id, current, sources, completed);
  const bundle = sources.bundles.get(id);
  const bodies = new Set<string>();
  if (bundle) bodies.add(bundle.content);
  if (current) {
    const body = safeExistingFile(root, current.managedPath);
    if (body !== null) bodies.add(body);
  }
  for (const historical of sources.metadata.get(id) ?? []) {
    const body = safeExistingFile(root, historical.managedPath);
    if (body !== null) bodies.add(body);
  }
  if (bodies.size > 1) throw new Error(`Rule body migration conflict: ${id}`);
  const historicalVersions = new Map(
    [...(bundle?.versions ?? []), ...(sources.versions.get(id) ?? [])].map(
      (version) => [version.id, version],
    ),
  );
  const versions = mergeVersions(id, [
    ...(bundle?.versions ?? []),
    ...(sources.versions.get(id) ?? []),
    ...currentVersions.flatMap((version) => {
      const content = safeExistingFile(root, version.filePath);
      if (content === null) {
        const preserved = historicalVersions.get(version.id);
        if (
          !preserved ||
          preserved.savedAt !== version.createdAt ||
          preserved.source !== version.source
        )
          throw new Error(`Rule history file is missing: ${id}/${version.id}`);
        return [preserved];
      }
      return [
        {
          id: version.id,
          savedAt: version.createdAt,
          source: version.source,
          content,
        },
      ];
    }),
  ]);
  const content = bodies.values().next().value ?? null;
  if (
    content === null &&
    (meta.scope === "project" ||
      versions.length > 0 ||
      (current &&
        current.contentHash !== "" &&
        current.contentHash !== hashContent("")))
  )
    throw new Error(`Rule managed body is missing: ${id}`);
  if (
    current &&
    content !== null &&
    current.contentHash !== hashContent(content)
  )
    throw new Error(`Rule content hash migration conflict: ${id}`);
  const rulesRoot = path.join(root, "data", "rule-files");
  return {
    rule: {
      ...meta,
      managedPath: getRuleManagedPath(meta, rulesRoot),
      syncStatus: meta.syncStatus ?? "target-missing",
      currentVersion: versions.length,
      contentHash: content === null ? "" : hashContent(content),
    },
    content,
    versions,
  };
}

function retirementEntries(
  root: string,
  directories: string[],
): CanonicalEntryMutation[] {
  return directories.flatMap((directory) => {
    const digest = ruleSourceDigest(root, directory);
    const backup = path.join(
      root,
      "recovery",
      MIGRATION_NAME,
      `${path.basename(path.dirname(directory))}-${path.basename(directory)}-${digest}`,
    );
    assertStoragePathComponentsSafe(root, backup);
    const entries: CanonicalEntryMutation[] = [];
    if (fs.existsSync(backup)) {
      if (ruleSourceDigest(root, backup) !== digest)
        throw new Error(
          "Rule metadata recovery copy does not match its source",
        );
    } else
      entries.push({
        targetPath: backup,
        prepare(stage) {
          fs.cpSync(directory, stage, {
            recursive: true,
            dereference: false,
            errorOnExist: true,
            force: false,
          });
          if (ruleSourceDigest(root, stage) !== digest)
            throw new Error("Rule metadata recovery copy verification failed");
        },
      });
    entries.push({ targetPath: directory, delete: true });
    return entries;
  });
}

function assertGraphIdentities(graphs: RuleStorageGraph[]): void {
  const owners = new Map<string, string>();
  for (const graph of graphs)
    for (const version of graph.versions) {
      const owner = owners.get(version.id);
      if (owner && owner !== graph.rule.id)
        throw new Error(
          `Rule history identity belongs to another Rule: ${version.id}`,
        );
      owners.set(version.id, graph.rule.id);
    }
}

/** Historical metadata is consumed once at startup; runtime Rules read only SQL references. */
export function migrateRuleMetadataV1(
  database: DatabaseAdapter.Database,
  options: { rootPath: string; databasePath: string },
): void {
  const root = path.resolve(options.rootPath);
  recoverSqliteEntryPublication(database, root, MIGRATION_NAME);
  const repository = new RuleDB(database);
  const completed = Boolean(
    database.get(
      "SELECT name FROM schema_migrations WHERE name = ?",
      MIGRATION_NAME,
    ),
  );
  const legacyPresent = [
    path.join(root, "data", "rules"),
    path.join(root, "cache", "rules-workspace"),
  ].some((directory) => fs.existsSync(directory));
  if (completed && !legacyPresent) return;
  const current = new Map(
    repository.getAll().map((record) => [record.id, record]),
  );
  const versionsByRule = new Map<RuleFileId, RuleVersionRecord[]>();
  for (const version of repository.getAllVersions()) {
    const versions = versionsByRule.get(version.ruleId) ?? [];
    versions.push(version);
    versionsByRule.set(version.ruleId, versions);
  }
  const sources = readRuleMetadataSources(root, [...current.values()]);
  const ids = new Set([
    ...current.keys(),
    ...sources.metadata.keys(),
    ...sources.bundles.keys(),
    ...sources.versions.keys(),
  ]);
  const graphs = [...ids].map((id) => {
    if (completed && !current.has(id))
      throw new Error(
        `Rule migration conflict: retired identity ${id} is absent from SQLite`,
      );
    return planRule(
      root,
      id,
      current.get(id),
      versionsByRule.get(id) ?? [],
      sources,
      completed,
    );
  });
  assertGraphIdentities(graphs);
  const rulesRoot = path.join(root, "data", "rule-files");
  const entries = [
    ...graphs.flatMap((graph) => ruleStorageEntries(graph, rulesRoot)),
    ...retirementEntries(root, sources.directories),
  ];
  if (graphs.length || sources.directories.length)
    createDatabaseSafetyPoint(
      options.databasePath,
      "pre-migration",
    );
  publishSqliteEntries(database, {
    rootPath: root,
    databasePath: options.databasePath,
    operationKey: MIGRATION_NAME,
    entries,
    commit: () => {
      for (const graph of graphs) {
        repository.upsert(graph.rule);
        repository.replaceVersions(
          graph.rule.id,
          ruleVersionRecords(graph.rule.id, graph.versions, rulesRoot),
        );
      }
      database.run(
        "DELETE FROM canonical_resources WHERE resource_type = ?",
        "rule",
      );
      database.run(
        "INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES (?, ?)",
        MIGRATION_NAME,
        Date.now(),
      );
    },
  });
}
