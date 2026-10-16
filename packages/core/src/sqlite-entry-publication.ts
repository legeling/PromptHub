import fs from "node:fs";
import path from "node:path";
import {
  DatabaseAdapter,
  StoragePublicationDB,
  recoverDatabaseClientLock,
} from "@prompthub/db";
import {
  publishCanonicalEntries,
  recoverCanonicalEntryPublication,
  recoverCanonicalEntryPublications,
  type PublishCanonicalEntriesOptions,
  type CanonicalEntryPublicationResult,
} from "./canonical-entry-publication";
import { assertStoragePathComponentsSafe } from "./runtime-storage-context";

export interface PublishSqliteEntriesOptions extends Omit<
  PublishCanonicalEntriesOptions,
  "sqliteCommit"
> {
  databasePath?: string;
  commit: () => void;
}

function databaseFilePath(database: DatabaseAdapter.Database): string {
  const databases = database.pragma("database_list");
  if (database.inTransaction)
    throw new Error("Storage publication cannot use an outer SQL transaction");
  if (Array.isArray(databases))
    for (const entry of databases) {
      if (
        typeof entry === "object" &&
        entry !== null &&
        "name" in entry &&
        entry.name === "main" &&
        "file" in entry &&
        typeof entry.file === "string" &&
        entry.file.length > 0
      )
        return path.resolve(entry.file);
    }
  throw new Error("Storage publication requires a persistent database path");
}

function readCommit(
  databasePath: string,
  operationKey: string,
  operationId: string,
): boolean {
  if (!fs.lstatSync(databasePath).isFile())
    throw new Error("Storage publication database is not a regular file");
  if (recoverDatabaseClientLock(databasePath).status === "blocked")
    throw new Error(
      "Storage publication recovery database has another lock owner",
    );
  // Opening an existing database for SQLite hot-journal recovery may require writes;
  // the only application query here reads its committed receipt.
  const database = new DatabaseAdapter(databasePath);
  try {
    return new StoragePublicationDB(database).has(operationKey, operationId);
  } finally {
    database.close();
  }
}

export function recoverStorageEntryPublications(
  rootPath: string,
): ReturnType<typeof recoverCanonicalEntryPublications> {
  return recoverCanonicalEntryPublications(
    rootPath,
    (databasePath, key, id) => {
      assertStoragePathComponentsSafe(rootPath, databasePath);
      return readCommit(databasePath, key, id);
    },
  );
}

export function recoverSqliteEntryPublication(
  database: DatabaseAdapter.Database,
  rootPath: string,
  operationKey: string,
): ReturnType<typeof recoverCanonicalEntryPublication> {
  const receipts = new StoragePublicationDB(database);
  return recoverCanonicalEntryPublication(
    rootPath,
    operationKey,
    (recordedPath, key, id) => {
      const databasePath = databaseFilePath(database);
      if (path.resolve(recordedPath) !== path.resolve(databasePath))
        throw new Error("SQLite publication recovery database path mismatch");
      return receipts.has(key, id);
    },
  );
}

/** File publication owns staging; the outer SQLite transaction owns the commit decision. */
export function publishSqliteEntries(
  database: DatabaseAdapter.Database,
  options: PublishSqliteEntriesOptions,
): CanonicalEntryPublicationResult {
  const databasePath = databaseFilePath(database);
  if (
    options.databasePath !== undefined &&
    path.resolve(options.databasePath) !== databasePath
  )
    throw new Error(
      "Storage publication database path does not match its connection",
    );
  assertStoragePathComponentsSafe(options.rootPath, databasePath);
  const receipts = new StoragePublicationDB(database);
  const { commit, databasePath: _expectedPath, ...publication } = options;
  if (options.entries.length === 0) {
    recoverSqliteEntryPublication(
      database,
      options.rootPath,
      options.operationKey,
    );
    database.transaction(() => {
      options.beforePublish?.();
      commit();
    })();
    return { status: "unchanged", cleanupPending: false };
  }
  return publishCanonicalEntries({
    ...publication,
    sqliteCommit: {
      databasePath,
      commit: (id) => receipts.commit(options.operationKey, id, commit),
      resolve: (id) => receipts.has(options.operationKey, id),
    },
  });
}
