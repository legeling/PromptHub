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
import { type CanonicalEntryMutation } from "../canonical-entry-publication";
import {
  publishSqliteEntries,
  recoverSqliteEntryPublication,
} from "../sqlite-entry-publication";
import {
  calculatePromptCanonicalGraphHash,
  insertMissingPromptGraphRows,
  normalizePromptGraphForDatabase,
} from "../prompt-canonical-catalog";
import {
  collectPromptCanonicalGraph,
  type PromptCanonicalGraphSnapshot,
} from "../prompt-canonical-export";
import { readPromptCanonicalGraph } from "../prompt-canonical-import";
import {
  assertStoragePathComponentsSafe,
  resolveRuntimeStorageContext,
} from "../runtime-storage-context";

const MIGRATION_NAME = "prompt-sqlite-v1";
const GRAPH_ENTRIES = [
  "prompts",
  "folders",
  "tags",
  "relations",
  "output-formats",
  "catalog.json",
];
const HASH_BUFFER_BYTES = 64 * 1024;

function readDatabaseGraph(
  database: DatabaseAdapter.Database,
): PromptCanonicalGraphSnapshot {
  return normalizePromptGraphForDatabase(
    collectPromptCanonicalGraph(
      new PromptDB(database),
      new FolderDB(database),
      database,
    ),
  );
}

function mergeRecords<T extends { id: string }>(
  current: T[],
  historical: T[],
  label: string,
): T[] {
  const merged = new Map(current.map((entry) => [entry.id, entry]));
  for (const entry of historical) {
    const prior = merged.get(entry.id);
    if (prior && !isDeepStrictEqual(prior, entry))
      throw new Error(`Prompt migration conflict in ${label}: ${entry.id}`);
    merged.set(entry.id, entry);
  }
  return [...merged.values()];
}

function mergeGraphs(
  current: PromptCanonicalGraphSnapshot,
  historical: PromptCanonicalGraphSnapshot,
): PromptCanonicalGraphSnapshot {
  return {
    prompts: mergeRecords(current.prompts, historical.prompts, "prompts"),
    folders: mergeRecords(current.folders, historical.folders, "folders"),
    promptVersions: mergeRecords(
      current.promptVersions,
      historical.promptVersions,
      "versions",
    ),
    promptRelations: mergeRecords(
      current.promptRelations,
      historical.promptRelations,
      "relations",
    ),
    outputFormatItems: mergeRecords(
      current.outputFormatItems,
      historical.outputFormatItems,
      "output formats",
    ),
  };
}

function hashRegularFile(file: string): string {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error("Prompt migration source is unsafe");
  const descriptor = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  const digest = crypto.createHash("sha256");
  const buffer = Buffer.allocUnsafe(HASH_BUFFER_BYTES);
  try {
    let size: number;
    while ((size = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0)
      digest.update(buffer.subarray(0, size));
    return digest.digest("hex");
  } finally {
    fs.closeSync(descriptor);
  }
}

function mediaEntries(
  root: string,
  source: ReturnType<typeof readPromptCanonicalGraph>,
): CanonicalEntryMutation[] {
  const context = resolveRuntimeStorageContext(root);
  const destinations = new Map<string, string>();
  const entries: CanonicalEntryMutation[] = [];
  for (const object of source.mediaObjects) {
    const destination = path.join(
      object.kind === "image" ? context.imagesPath : context.videosPath,
      ...object.reference.split("/"),
    );
    assertStoragePathComponentsSafe(root, destination);
    const prior = destinations.get(destination);
    if (prior && prior !== object.sha256)
      throw new Error(`Prompt media migration conflict: ${object.reference}`);
    if (prior) continue;
    destinations.set(destination, object.sha256);
    if (fs.existsSync(destination)) {
      if (hashRegularFile(destination) !== object.sha256)
        throw new Error(`Prompt media migration conflict: ${object.reference}`);
      continue;
    }
    const objectPath = path.join(
      context.dataPath,
      "assets",
      "objects",
      "sha256",
      object.sha256.slice(0, 2),
      object.sha256,
    );
    entries.push({
      targetPath: destination,
      prepare(stage) {
        fs.copyFileSync(objectPath, stage, fs.constants.COPYFILE_EXCL);
        if (hashRegularFile(stage) !== object.sha256)
          throw new Error("Prompt media changed during migration");
      },
    });
  }
  return entries;
}

function recoveryEntries(
  root: string,
  source: ReturnType<typeof readPromptCanonicalGraph>,
): CanonicalEntryMutation[] {
  const data = path.join(root, "data");
  const catalog = path.join(data, "catalog.json");
  const backup = path.join(
    root,
    "recovery",
    MIGRATION_NAME,
    hashRegularFile(catalog),
  );
  assertStoragePathComponentsSafe(root, backup);
  const verify = (directory: string) => {
    const copied = readPromptCanonicalGraph(directory);
    if (!isDeepStrictEqual(source.manifest, copied.manifest))
      throw new Error("Prompt recovery copy does not match its source");
  };
  const entries: CanonicalEntryMutation[] = [];
  if (fs.existsSync(backup)) verify(backup);
  else
    entries.push({
      targetPath: backup,
      prepare(stage) {
        fs.mkdirSync(stage, { recursive: true, mode: 0o700 });
        for (const relative of [
          "catalog.json",
          ...source.manifest.files.map((entry) => entry.path),
        ]) {
          const destination = path.join(stage, ...relative.split("/"));
          fs.mkdirSync(path.dirname(destination), {
            recursive: true,
            mode: 0o700,
          });
          fs.copyFileSync(
            path.join(data, ...relative.split("/")),
            destination,
            fs.constants.COPYFILE_EXCL,
          );
        }
        verify(stage);
      },
    });
  for (const name of GRAPH_ENTRIES) {
    const targetPath = path.join(data, name);
    if (fs.existsSync(targetPath)) entries.push({ targetPath, delete: true });
  }
  return entries;
}

export function hasPromptSqliteMigration(
  database: DatabaseAdapter.Database,
): boolean {
  return Boolean(
    database.get(
      "SELECT name FROM schema_migrations WHERE name = ?",
      MIGRATION_NAME,
    ),
  );
}

function commitGraph(
  database: DatabaseAdapter.Database,
  graph: PromptCanonicalGraphSnapshot,
): void {
  const expected = calculatePromptCanonicalGraphHash(graph);
  database.transaction(() => {
    insertMissingPromptGraphRows(database, graph);
    if (
      calculatePromptCanonicalGraphHash(readDatabaseGraph(database)) !==
      expected
    )
      throw new Error("Prompt SQLite migration readback mismatch");
    database.run(
      "DELETE FROM canonical_resources WHERE resource_type = ?",
      "prompt",
    );
    database.run(
      "INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES (?, ?)",
      MIGRATION_NAME,
      Date.now(),
    );
  })();
}

/** Bootstrap conversion only. The completion record forbids replay after deletion. */
export function migratePromptSqliteV1(
  database: DatabaseAdapter.Database,
  options: {
    rootPath: string;
    databasePath: string;
    injectFailure?: (targetPath: string) => void;
  },
): void {
  const root = path.resolve(options.rootPath);
  const catalog = path.join(root, "data", "catalog.json");
  assertStoragePathComponentsSafe(root, catalog);
  recoverSqliteEntryPublication(database, root, MIGRATION_NAME);
  const completed = hasPromptSqliteMigration(database);
  if (completed && !fs.existsSync(catalog)) return;
  if (!fs.existsSync(catalog)) {
    if (resolveRuntimeStorageContext(root).localAuthority === "canonical-files")
      throw new Error(
        "Historical Prompt catalog is missing; explicit recovery is required",
      );
    commitGraph(database, readDatabaseGraph(database));
    return;
  }
  const source = readPromptCanonicalGraph(path.dirname(catalog));
  const current = readDatabaseGraph(database);
  const historical = normalizePromptGraphForDatabase(source.snapshot);
  if (
    completed &&
    calculatePromptCanonicalGraphHash(current) !==
      calculatePromptCanonicalGraphHash(historical)
  ) {
    throw new Error(
      "Historical Prompt graph differs after SQLite migration; explicit recovery is required",
    );
  }
  const merged = mergeGraphs(current, historical);
  calculatePromptCanonicalGraphHash(merged);
  const entries = [
    ...mediaEntries(root, source),
    ...recoveryEntries(root, source),
  ];
  createDatabaseSafetyPoint(options.databasePath, "pre-migration");
  publishSqliteEntries(database, {
    rootPath: root,
    databasePath: options.databasePath,
    operationKey: MIGRATION_NAME,
    entries,
    injectFailure: options.injectFailure,
    verify() {
      if (fs.existsSync(catalog))
        throw new Error("Historical Prompt graph retirement failed");
    },
    commit: () => commitGraph(database, merged),
  });
}
