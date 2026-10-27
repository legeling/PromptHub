import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  createDatabaseSafetyPoint,
  FolderDB,
  PromptDB,
  type DatabaseAdapter,
} from "@prompthub/db";
import type {
  IndexedDbMigrationResponse,
  LegacyIndexedDbSnapshot,
} from "@prompthub/shared/types/indexeddb-migration";
import type { PromptWorkspaceResolution } from "@prompthub/shared/types/prompt-workspace-recovery";
import {
  collectPromptCanonicalGraph,
  type PromptCanonicalGraphSnapshot,
} from "../prompt-canonical-export";
import {
  calculatePromptCanonicalGraphHash,
  insertMissingPromptGraphRows,
  normalizePromptGraphForDatabase,
} from "../prompt-canonical-catalog";
import { completePromptWorkspaceHistory } from "../prompt-workspace/upgrade-plan";
import {
  publishSqliteEntries,
  recoverSqliteEntryPublication,
} from "../sqlite-entry-publication";
import {
  normalizeIndexedDbSnapshot,
  planIndexedDbMerge,
  validateIndexedDbSnapshot,
} from "./indexeddb-snapshot";

const MIGRATION = "indexeddb-prompts-v1";
interface MigrationOptions {
  rootPath: string;
  databasePath: string;
  resolution?: PromptWorkspaceResolution;
  injectFailure?: (targetPath: string) => void;
}

function readGraph(
  database: DatabaseAdapter.Database,
): PromptCanonicalGraphSnapshot {
  return collectPromptCanonicalGraph(
    new PromptDB(database),
    new FolderDB(database),
    database,
  );
}

function fingerprint(
  source: LegacyIndexedDbSnapshot,
  current: PromptCanonicalGraphSnapshot,
): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ source, current }))
    .digest("hex");
}

function writeChanges(
  database: DatabaseAdapter.Database,
  current: PromptCanonicalGraphSnapshot,
  graph: PromptCanonicalGraphSnapshot,
): void {
  const prompts = new PromptDB(database);
  const folders = new FolderDB(database);
  insertMissingPromptGraphRows(database, { ...graph, promptVersions: [] });
  const knownFolders = new Map(current.folders.map((row) => [row.id, row]));
  const knownPrompts = new Map(current.prompts.map((row) => [row.id, row]));
  const knownVersions = new Map(
    current.promptVersions.map((row) => [row.id, row]),
  );
  for (const folder of graph.folders)
    if (
      knownFolders.has(folder.id) &&
      !isDeepStrictEqual(knownFolders.get(folder.id), folder)
    )
      folders.insertFolderDirect(folder);
  for (const prompt of graph.prompts)
    if (
      knownPrompts.has(prompt.id) &&
      !isDeepStrictEqual(knownPrompts.get(prompt.id), prompt)
    )
      prompts.insertPromptDirect(prompt);
  prompts.replaceVersionsForRecovery(
    graph.promptVersions.filter(
      (row) => !isDeepStrictEqual(knownVersions.get(row.id), row),
    ),
  );
}

export function migrateIndexedDbSnapshot(
  database: DatabaseAdapter.Database,
  input: unknown,
  options: MigrationOptions,
): IndexedDbMigrationResponse {
  recoverSqliteEntryPublication(database, options.rootPath, MIGRATION);
  validateIndexedDbSnapshot(input);
  const source: LegacyIndexedDbSnapshot = {
    prompts: input.prompts,
    folders: input.folders,
    versions: input.versions,
  };
  if (
    database.get("SELECT name FROM schema_migrations WHERE name = ?", MIGRATION)
  )
    return {
      status: "completed",
      imported: false,
      promptCount: 0,
      folderCount: 0,
      versionCount: 0,
      recoveryPath: null,
    };
  const current = readGraph(database);
  const reviewFingerprint = fingerprint(source, current);
  if (
    options.resolution &&
    options.resolution.fingerprint !== reviewFingerprint
  )
    throw new Error(
      "IndexedDB or current data changed after review; refresh before choosing again",
    );
  const incoming = normalizeIndexedDbSnapshot(source);
  const plan = planIndexedDbMerge(
    current,
    incoming,
    source,
    options.resolution,
  );
  if (plan.conflicts.length && !options.resolution)
    return {
      status: "conflict",
      review: {
        fingerprint: reviewFingerprint,
        reappeared: false,
        sourceFileCount: 0,
        conflicts: plan.conflicts,
      },
    };
  let graph = structuredClone(plan.graph);
  completePromptWorkspaceHistory(graph);
  graph = normalizePromptGraphForDatabase(graph);
  const expected = calculatePromptCanonicalGraphHash(graph);
  const imported = !isDeepStrictEqual(graph, current);
  return commitMigration(
    database,
    source,
    current,
    graph,
    reviewFingerprint,
    expected,
    imported,
    options,
  );
}

function commitMigration(
  database: DatabaseAdapter.Database,
  input: LegacyIndexedDbSnapshot,
  current: PromptCanonicalGraphSnapshot,
  graph: PromptCanonicalGraphSnapshot,
  reviewed: string,
  expected: string,
  imported: boolean,
  options: MigrationOptions,
): IndexedDbMigrationResponse {
  const recoveryPath = path.join(
    options.rootPath,
    "recovery",
    MIGRATION,
    crypto.randomUUID(),
  );
  createDatabaseSafetyPoint(options.databasePath, "pre-migration");
  publishSqliteEntries(database, {
    rootPath: options.rootPath,
    databasePath: options.databasePath,
    operationKey: MIGRATION,
    injectFailure: options.injectFailure,
    entries: [
      {
        targetPath: recoveryPath,
        prepare(stage) {
          fs.mkdirSync(stage, { recursive: true, mode: 0o700 });
          fs.writeFileSync(
            path.join(stage, "source.json"),
            JSON.stringify(input),
            { mode: 0o600 },
          );
          fs.writeFileSync(
            path.join(stage, "current.json"),
            JSON.stringify(current),
            { mode: 0o600 },
          );
        },
      },
    ],
    beforePublish() {
      if (fingerprint(input, readGraph(database)) !== reviewed)
        throw new Error("Current data changed during IndexedDB recovery");
    },
    commit() {
      writeChanges(database, current, graph);
      if (calculatePromptCanonicalGraphHash(readGraph(database)) !== expected)
        throw new Error("IndexedDB migration verification failed");
      database.run(
        "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
        MIGRATION,
        Date.now(),
      );
    },
  });
  return {
    status: "completed",
    imported,
    promptCount: input.prompts.length,
    folderCount: input.folders.length,
    versionCount: input.versions.length,
    recoveryPath,
  };
}
