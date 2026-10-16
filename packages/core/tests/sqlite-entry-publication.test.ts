import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  DatabaseAdapter,
  initDatabase,
  closeDatabase,
  CURRENT_DATABASE_SCHEMA_VERSION,
} from "@prompthub/db";
import {
  publishSqliteEntries,
  recoverStorageEntryPublications,
} from "../src/sqlite-entry-publication";
import { recoverCanonicalEntryPublications } from "../src/canonical-entry-publication";

let root: string;
let databasePath: string;
let target: string;
let database: DatabaseAdapter.Database;

beforeEach(() => {
  root = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-sqlite-publication-"),
  );
  databasePath = path.join(root, "data", "prompthub.db");
  database = initDatabase(databasePath);
  database.run("INSERT INTO settings(key, value) VALUES (?, ?)", "body", "old");
  target = path.join(root, "body.md");
  fs.writeFileSync(target, "old");
});

afterEach(() => {
  vi.restoreAllMocks();
  closeDatabase();
  fs.rmSync(root, { recursive: true, force: true });
});

function publish(
  commit = () =>
    database.run("UPDATE settings SET value = ? WHERE key = ?", "new", "body"),
) {
  return publishSqliteEntries(database, {
    rootPath: root,
    databasePath,
    operationKey: "sqlite-test",
    entries: [
      {
        targetPath: target,
        prepare: (stage) => fs.writeFileSync(stage, "new"),
      },
    ],
    commit,
  });
}

function reopen(): void {
  closeDatabase();
  database = initDatabase(databasePath);
}

function expectState(value: string): void {
  expect(
    database.get("SELECT value FROM settings WHERE key = ?", "body"),
  ).toEqual({ value });
  expect(fs.readFileSync(target, "utf8")).toBe(value);
}

function failCommitJournal() {
  const rename = fs.renameSync.bind(fs);
  return vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
    if (
      String(to).endsWith("sqlite-test-publication.json") &&
      JSON.parse(fs.readFileSync(from, "utf8")).state === "committed"
    ) {
      throw new Error("injected journal commit failure");
    }
    return rename(from, to);
  });
}

it("commits actual file and SQL data, retaining only one receipt per operation key", () => {
  publish();
  publish();
  expect(
    database.get("SELECT COUNT(*) AS count FROM storage_publication_receipts"),
  ).toEqual({ count: 1 });
  reopen();
  expectState("new");
  expect(recoverStorageEntryPublications(root)).toEqual([]);
});

it("rolls back file and database when the SQL callback fails", () => {
  expect(() =>
    publish(() => {
      database.run(
        "UPDATE settings SET value = ? WHERE key = ?",
        "new",
        "body",
      );
      throw new Error("injected SQL callback failure");
    }),
  ).toThrow("injected SQL callback failure");
  reopen();
  expectState("old");
  expect(
    database.get("SELECT COUNT(*) AS count FROM storage_publication_receipts"),
  ).toEqual({ count: 0 });
});

it("uses the durable SQL receipt after the file commit marker fails", () => {
  const fault = failCommitJournal();
  expect(() => publish()).toThrow(/outcome is unknown/);
  fault.mockRestore();
  closeDatabase();
  expect(() => recoverCanonicalEntryPublications(root)).toThrow(
    /SQLite.*resolver/i,
  );
  expect(recoverStorageEntryPublications(root)).toEqual([
    { operationKey: "sqlite-test", status: "committed" },
  ]);
  database = initDatabase(databasePath);
  expectState("new");
  expect(recoverStorageEntryPublications(root)).toEqual([]);
});

it("preserves new and prior files if the committed SQL database cannot be read", () => {
  const fault = failCommitJournal();
  expect(() => publish()).toThrow(/outcome is unknown/);
  fault.mockRestore();
  closeDatabase();
  const saved = `${databasePath}.saved`;
  fs.renameSync(databasePath, saved);
  expect(() => recoverStorageEntryPublications(root)).toThrow();
  expect(fs.existsSync(databasePath)).toBe(false);
  expect(fs.readFileSync(target, "utf8")).toBe("new");
  expect(fs.readdirSync(root).some((entry) => entry.includes(".prior-"))).toBe(
    true,
  );
  fs.renameSync(saved, databasePath);
  recoverStorageEntryPublications(root);
  database = initDatabase(databasePath);
  expectState("new");
});

it("rejects an outer SQL transaction before publishing files", () => {
  database.transaction(() => {
    expect(() => publish()).toThrow(/outer.*transaction/i);
    expectState("old");
  })();
});

it("resolves an earlier joint commit before a SQL-only operation with the same key", () => {
  const fault = failCommitJournal();
  expect(() => publish()).toThrow(/outcome is unknown/);
  fault.mockRestore();
  publishSqliteEntries(database, {
    rootPath: root,
    operationKey: "sqlite-test",
    entries: [],
    commit: () =>
      database.run(
        "INSERT INTO settings(key, value) VALUES (?, ?)",
        "annotation",
        "kept",
      ),
  });
  reopen();
  expectState("new");
  expect(
    database.get("SELECT value FROM settings WHERE key = ?", "annotation"),
  ).toEqual({ value: "kept" });
  expect(recoverStorageEntryPublications(root)).toEqual([]);
});

it("does not guess rollback for a historical SQL journal without a receipt", () => {
  const fault = failCommitJournal();
  expect(() => publish()).toThrow(/outcome is unknown/);
  fault.mockRestore();
  closeDatabase();
  const directory = path.join(root, "data", "operations", "journals");
  const file = path.join(directory, "sqlite-test-publication.json");
  const journal = JSON.parse(fs.readFileSync(file, "utf8"));
  journal.version = 2;
  journal.operationKey = "prompt-sqlite-v1";
  delete journal.sqliteDatabasePath;
  fs.writeFileSync(
    path.join(directory, "prompt-sqlite-v1-publication.json"),
    JSON.stringify(journal),
  );
  fs.rmSync(file);
  expect(() => recoverStorageEntryPublications(root)).toThrow(
    /explicit recovery/,
  );
  expect(fs.readFileSync(target, "utf8")).toBe("new");
  expect(fs.readdirSync(root).some((entry) => entry.includes(".prior-"))).toBe(
    true,
  );
});

it("rejects an unrelated database path before file or SQL mutation", () => {
  expect(() =>
    publishSqliteEntries(database, {
      rootPath: root,
      databasePath: path.join(root, "other.db"),
      operationKey: "wrong-database",
      entries: [
        {
          targetPath: target,
          prepare: (stage) => fs.writeFileSync(stage, "new"),
        },
      ],
      commit: () => database.run("UPDATE settings SET value = ?", "new"),
    }),
  ).toThrow(/database.*path/i);
  expectState("old");
});

it("upgrades a populated previous schema and preserves data through repeated reopen", () => {
  database.exec("DROP TABLE storage_publication_receipts");
  database.run(
    "DELETE FROM database_migration_history WHERE migration_id = ?",
    CURRENT_DATABASE_SCHEMA_VERSION,
  );
  database.pragma(`user_version = ${CURRENT_DATABASE_SCHEMA_VERSION - 1}`);
  reopen();
  expectState("old");
  expect(database.pragma("user_version")).toEqual([
    { user_version: CURRENT_DATABASE_SCHEMA_VERSION },
  ]);
  publish();
  reopen();
  expectState("new");
});

function compileDatabaseModule(name: string): string {
  const sourcePath = path.resolve(`../db/src/${name}.ts`);
  const source = fs.readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  const modulePath = path.join(root, `${name}.mjs`);
  const driverPath = createRequire(sourcePath).resolve("node-sqlite3-wasm");
  fs.writeFileSync(
    modulePath,
    compiled.replace(
      '"node-sqlite3-wasm"',
      JSON.stringify(pathToFileURL(driverPath).href),
    ),
  );
  return pathToFileURL(modulePath).href;
}

it.each(["before", "after"] as const)(
  "recovers real process exit %s the SQL commit",
  (moment) => {
    publish();
    database.run("UPDATE settings SET value = ? WHERE key = ?", "old", "body");
    fs.writeFileSync(target, "old");
    closeDatabase();
    const publication = pathToFileURL(
      path.resolve("src/canonical-entry-publication.ts"),
    ).href;
    const adapter = compileDatabaseModule("adapter");
    const receipts = compileDatabaseModule("storage-publication");
    const script = `
    import fs from 'node:fs';
    import Database from ${JSON.stringify(adapter)};
    import { StoragePublicationDB } from ${JSON.stringify(receipts)};
    import { publishCanonicalEntries } from ${JSON.stringify(publication)};
    const database = new Database(${JSON.stringify(databasePath)});
    const receipts = new StoragePublicationDB(database);
    publishCanonicalEntries({ rootPath: ${JSON.stringify(root)}, operationKey: 'sqlite-test',
      entries: [{ targetPath: ${JSON.stringify(target)}, prepare(p) { fs.writeFileSync(p, 'new'); } }],
      sqliteCommit: { databasePath: ${JSON.stringify(databasePath)},
        resolve: id => receipts.has('sqlite-test', id),
        commit(id) {
          receipts.commit('sqlite-test', id, () => {
            database.run('UPDATE settings SET value = ? WHERE key = ?', 'new', 'body');
            if (${JSON.stringify(moment)} === 'before') process.exit(71);
          });
          process.exit(72);
        }
      }
    });`;
    const child = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--input-type=module", "-e", script],
      {
        timeout: 10_000,
        maxBuffer: 1024 * 1024,
        encoding: "utf8",
      },
    );
    expect(child.status, child.stderr).toBe(moment === "before" ? 71 : 72);
    expect(recoverStorageEntryPublications(root)).toEqual([
      {
        operationKey: "sqlite-test",
        status: moment === "before" ? "rolled-back" : "committed",
      },
    ]);
    database = initDatabase(databasePath);
    expectState(moment === "before" ? "old" : "new");
  },
);
