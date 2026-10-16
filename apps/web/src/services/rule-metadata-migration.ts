import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createDatabaseSafetyPoint, type DatabaseAdapter } from "@prompthub/db";
import type { RuleBackupRecord, RuleVersionSnapshot } from "@prompthub/shared";
import {
  readRuleFile,
  RuleStorageDB,
  type RuleStorageGraph,
} from "@prompthub/core/rule-storage";
import {
  publishSqliteEntries,
  recoverSqliteEntryPublication,
} from "@prompthub/core/sqlite-entry-publication";
import {
  ruleSourceDigest,
  ruleSourceFiles,
} from "@prompthub/core/migrations/rule-metadata-sources";
import type { CanonicalEntryMutation } from "@prompthub/core/canonical-entry-publication";
import {
  buildRuleStorageGraphs,
  validateRuleBackupRecords,
} from "./rule-storage-plan.js";

const MIGRATION_NAME = "web-rule-metadata-v1";
function readLegacyRecord(
  root: string,
  userRoot: string,
  metadataPath: string,
): RuleBackupRecord {
  const metadata: unknown = JSON.parse(readRuleFile(metadataPath, root));
  if (
    typeof metadata !== "object" ||
    metadata === null ||
    !("id" in metadata) ||
    typeof metadata.id !== "string" ||
    !("name" in metadata) ||
    typeof metadata.name !== "string"
  )
    throw new Error("Invalid historical Web Rule metadata");
  if (
    path.basename(metadata.name) !== metadata.name ||
    /[\\\0]/u.test(metadata.name)
  )
    throw new Error("Invalid historical Web Rule filename");
  const content = readRuleFile(
    path.join(path.dirname(metadataPath), metadata.name),
    root,
  );
  const historyRoot = path.join(
    userRoot,
    ".versions",
    encodeURIComponent(metadata.id),
  );
  const indexPath = path.join(historyRoot, "index.json");
  const versions: RuleVersionSnapshot[] = [];
  if (fs.existsSync(indexPath)) {
    const index: unknown = JSON.parse(readRuleFile(indexPath, root));
    if (!Array.isArray(index))
      throw new Error("Invalid historical Web Rule version index");
    for (const entry of index) {
      if (
        typeof entry !== "object" ||
        entry === null ||
        typeof entry.fileName !== "string" ||
        path.basename(entry.fileName) !== entry.fileName ||
        /[\\\0]/u.test(entry.fileName)
      )
        throw new Error("Invalid historical Web Rule version path");
      versions.push({
        id: entry.id,
        savedAt: entry.savedAt,
        source: entry.source,
        content: readRuleFile(path.join(historyRoot, entry.fileName), root),
      });
    }
  } else if (fs.existsSync(historyRoot) && fs.readdirSync(historyRoot).length)
    throw new Error("Historical Web Rule history index is missing");
  // The current record validator below checks all legacy metadata and version fields.
  const record = { ...metadata, content, versions } as RuleBackupRecord;
  validateRuleBackupRecords(
    [record],
    path.join(root, "data", "rule-files", "validation"),
  );
  return record;
}
function assertExistingGraph(
  repository: RuleStorageDB,
  graph: RuleStorageGraph,
): void {
  const existing = repository.getById(graph.rule.id);
  if (!existing) return;
  const {
    managedPath: _managed,
    createdAt: _created,
    updatedAt: _updated,
    ...metadata
  } = existing;
  const {
    managedPath: _nextManaged,
    createdAt: _nextCreated,
    updatedAt: _nextUpdated,
    ...expected
  } = graph.rule;
  if (
    !isDeepStrictEqual(metadata, expected) ||
    repository.readContent(existing) !== graph.content ||
    !isDeepStrictEqual(
      repository.readVersions(existing.id),
      [...graph.versions].reverse(),
    )
  )
    throw new Error("Historical Web Rule conflicts with SQLite");
}
export function migrateWebRuleMetadata(
  database: DatabaseAdapter.Database,
  root: string,
  databasePath: string,
): void {
  recoverSqliteEntryPublication(database, root, MIGRATION_NAME);
  const legacyRoot = path.join(root, "data", "rules");
  const completed = Boolean(
    database.get(
      "SELECT name FROM schema_migrations WHERE name = ?",
      MIGRATION_NAME,
    ),
  );
  if (completed) {
    if (fs.existsSync(legacyRoot))
      throw new Error("Retired Web Rule source requires explicit recovery");
    return;
  }
  const entries: CanonicalEntryMutation[] = [];
  const commits: Array<() => void> = [];
  if (fs.existsSync(legacyRoot)) {
    const files = ruleSourceFiles(root, legacyRoot);
    const filesByOwner = new Map<string, string[]>();
    for (const file of files) {
      const owner = path.relative(legacyRoot, file).split(path.sep)[0];
      const group = filesByOwner.get(owner) ?? [];
      group.push(file);
      filesByOwner.set(owner, group);
    }
    const users = new Set(
      database
        .all("SELECT id FROM users")
        .map((row: unknown) =>
          typeof row === "object" && row !== null && "id" in row
            ? row.id
            : undefined,
        ),
    );
    for (const owner of fs.readdirSync(legacyRoot, { withFileTypes: true })) {
      if (!owner.isDirectory() || !users.has(owner.name))
        throw new Error(
          "Historical Web storage contains an unknown Rule owner",
        );
      const userRoot = path.join(legacyRoot, owner.name);
      const ownerFiles = filesByOwner.get(owner.name) ?? [];
      const records = ownerFiles
        .filter((file) => path.basename(file) === "_rule.json")
        .map((file) => readLegacyRecord(root, userRoot, file));
      const knownVersions = new Set(
        records.map((record) =>
          path.join(
            userRoot,
            ".versions",
            encodeURIComponent(record.id),
            "index.json",
          ),
        ),
      );
      if (
        ownerFiles.some(
          (file) =>
            file.startsWith(path.join(userRoot, ".versions") + path.sep) &&
            path.basename(file) === "index.json" &&
            !knownVersions.has(file),
        )
      )
        throw new Error("Historical Web Rule history has no metadata owner");
      const rulesRoot = path.join(root, "data", "rule-files", owner.name);
      const repository = new RuleStorageDB(database, {
        rootPath: root,
        rulesRoot,
        ownerUserId: owner.name,
      });
      const graphs = buildRuleStorageGraphs(
        records,
        repository,
        rulesRoot,
        true,
      );
      for (const graph of graphs) assertExistingGraph(repository, graph);
      const plan = repository.preparePublication(graphs);
      entries.push(...plan.entries);
      commits.push(plan.commit);
    }
    const digest = ruleSourceDigest(root, legacyRoot);
    const backup = path.join(root, "recovery", MIGRATION_NAME, digest);
    if (fs.existsSync(backup)) {
      if (ruleSourceDigest(root, backup) !== digest)
        throw new Error("Web Rule recovery copy mismatch");
    } else
      entries.push({
        targetPath: backup,
        prepare(stage) {
          fs.cpSync(legacyRoot, stage, {
            recursive: true,
            dereference: false,
            errorOnExist: true,
            force: false,
          });
          if (ruleSourceDigest(root, stage) !== digest)
            throw new Error("Web Rule recovery copy verification failed");
        },
      });
    entries.push({ targetPath: legacyRoot, delete: true });
    createDatabaseSafetyPoint(databasePath, "pre-migration");
  }
  publishSqliteEntries(database, {
    rootPath: root,
    databasePath,
    operationKey: MIGRATION_NAME,
    entries,
    commit() {
      for (const commit of commits) commit();
      database.run(
        "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
        MIGRATION_NAME,
        Date.now(),
      );
    },
  });
}
