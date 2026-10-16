import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  DatabaseAdapter,
  RuleDB,
  closeDatabase,
  initDatabase,
  CURRENT_DATABASE_SCHEMA_VERSION,
} from "@prompthub/db";
import type { RuleRecord } from "@prompthub/shared";

let root: string;
let databasePath: string;
const savedAt = "2026-01-01T00:00:00.000Z";
function record(description: string): RuleRecord {
  return {
    id: "claude-global",
    scope: "global",
    platformId: "claude",
    platformName: "Claude",
    platformIcon: "Bot",
    platformDescription: "Rule",
    canonicalFileName: "CLAUDE.md",
    description,
    managedPath: "/managed/CLAUDE.md",
    targetPath: "",
    projectRootPath: null,
    syncStatus: "target-missing",
    currentVersion: 1,
    contentHash: "hash",
    createdAt: savedAt,
    updatedAt: savedAt,
  };
}
function version(contentPath: string) {
  return {
    id: "same-version",
    ruleId: "claude-global" as const,
    version: 1,
    filePath: contentPath,
    source: "create" as const,
    createdAt: savedAt,
  };
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-rule-owners-"));
  databasePath = path.join(root, "prompthub.db");
});
afterEach(() => {
  closeDatabase();
  fs.rmSync(root, { recursive: true, force: true });
});

it("isolates identical Rule and version identities between local storage and two users across reopen", () => {
  const database = initDatabase(databasePath);
  for (const owner of ["", "user-a", "user-b"]) {
    const repository = new RuleDB(database, owner);
    repository.upsert(record(owner || "local"));
    repository.replaceVersions("claude-global", [
      version(`/managed/${owner || "local"}/history.md`),
    ]);
  }
  new RuleDB(database, "user-a").delete("claude-global");
  closeDatabase();
  const reopened = initDatabase(databasePath);
  expect(new RuleDB(reopened, "user-a").getAll()).toEqual([]);
  for (const owner of ["", "user-b"]) {
    const repository = new RuleDB(reopened, owner);
    expect(repository.getAll()).toEqual([record(owner || "local")]);
    expect(repository.getVersions("claude-global")).toEqual([
      version(`/managed/${owner || "local"}/history.md`),
    ]);
  }
  expect(reopened.pragma("foreign_key_check")).toEqual([]);
});

// Issued schema-v5 Rule tables, kept explicit to exercise the actual upgrade boundary.
const SCHEMA_V5_RULES = `CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK(scope IN ('global', 'project')),
  platform_id TEXT NOT NULL,
  platform_name TEXT NOT NULL,
  platform_icon TEXT NOT NULL,
  platform_description TEXT NOT NULL,
  canonical_file_name TEXT NOT NULL,
  description TEXT NOT NULL,
  managed_path TEXT NOT NULL,
  target_path TEXT NOT NULL,
  project_root_path TEXT,
  sync_status TEXT NOT NULL CHECK(sync_status IN ('synced', 'target-missing', 'out-of-sync', 'sync-error')),
  current_version INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rule_versions (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('manual-save', 'ai-rewrite', 'create')),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (rule_id) REFERENCES rules(id) ON DELETE CASCADE,
  UNIQUE(rule_id, version)
);

`;

it("upgrades populated schema-v5 Rule tables without changing metadata, order or references", () => {
  let database = initDatabase(databasePath);
  database.exec("DROP TABLE rule_versions; DROP TABLE rules;");
  database.exec(SCHEMA_V5_RULES);
  const current = record("legacy local");
  database.run(
    `INSERT INTO rules VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    current.id,
    current.scope,
    current.platformId,
    current.platformName,
    current.platformIcon,
    current.platformDescription,
    current.canonicalFileName,
    current.description,
    current.managedPath,
    current.targetPath,
    current.projectRootPath,
    current.syncStatus,
    current.currentVersion,
    current.contentHash,
    Date.parse(savedAt),
    Date.parse(savedAt),
  );
  database.run(
    "INSERT INTO rule_versions VALUES (?, ?, ?, ?, ?, ?)",
    "same-version",
    current.id,
    1,
    "/original/history.md",
    "create",
    Date.parse(savedAt),
  );
  database.exec(
    "DELETE FROM database_migration_history WHERE migration_id > 5; PRAGMA user_version = 5;",
  );
  closeDatabase();
  expect(() =>
    initDatabase(databasePath, {
      beforeMigrationCommit() {
        throw new Error("injected tenant upgrade failure");
      },
    }),
  ).toThrow("injected tenant upgrade failure");
  const probe = new DatabaseAdapter(databasePath);
  try {
    expect(
      probe.get("SELECT description FROM rules WHERE id = ?", current.id),
    ).toEqual({ description: "legacy local" });
    expect(
      probe
        .all("PRAGMA table_info(rules)")
        .some(
          (row: unknown) =>
            typeof row === "object" &&
            row !== null &&
            "name" in row &&
            row.name === "owner_user_id",
        ),
    ).toBe(false);
  } finally {
    probe.close();
  }
  database = initDatabase(databasePath);
  expect(new RuleDB(database).getAll()).toEqual([current]);
  expect(new RuleDB(database).getVersions(current.id)).toEqual([
    version("/original/history.md"),
  ]);
  expect(new RuleDB(database, "user-a").getAll()).toEqual([]);
  expect(database.pragma("user_version")).toEqual([
    { user_version: CURRENT_DATABASE_SCHEMA_VERSION },
  ]);
  expect(database.pragma("foreign_key_check")).toEqual([]);
});

it("preserves a thousand-rule schema-v5 graph during the tenant-key rebuild", () => {
  let database = initDatabase(databasePath);
  database.exec("DROP TABLE rule_versions; DROP TABLE rules;");
  database.exec(SCHEMA_V5_RULES);
  const ruleCount = 1000;
  const versionsPerRule = 2;
  const metadata = record("Scale annotation");
  database.transaction(() => {
    const insert = database.prepare(
      "INSERT INTO rules VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const insertVersion = database.prepare(
      "INSERT INTO rule_versions VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (let index = 0; index < ruleCount; index++) {
      const id = `project:scale-${index}`;
      insert.run(
        id,
        "project",
        metadata.platformId,
        metadata.platformName,
        metadata.platformIcon,
        metadata.platformDescription,
        metadata.canonicalFileName,
        `${metadata.description} ${index}`,
        metadata.managedPath,
        "",
        null,
        "target-missing",
        versionsPerRule,
        metadata.contentHash,
        Date.parse(savedAt),
        Date.parse(savedAt),
      );
      for (let ordinal = 1; ordinal <= versionsPerRule; ordinal++)
        insertVersion.run(
          `scale-version-${index}-${ordinal}`,
          id,
          ordinal,
          `/original/${index}-${ordinal}.md`,
          "create",
          Date.parse(savedAt),
        );
    }
    database.exec(
      "DELETE FROM database_migration_history WHERE migration_id > 5; PRAGMA user_version = 5;",
    );
  })();
  closeDatabase();
  const beforeRss = process.memoryUsage().rss;
  const started = performance.now();
  database = initDatabase(databasePath);
  const elapsedMs = performance.now() - started;
  expect(
    database.get(
      "SELECT COUNT(*) AS count FROM rules WHERE owner_user_id = ''",
    ),
  ).toEqual({ count: ruleCount });
  expect(
    database.get(
      "SELECT COUNT(*) AS count FROM rule_versions WHERE owner_user_id = ''",
    ),
  ).toEqual({ count: ruleCount * versionsPerRule });
  expect(
    new RuleDB(database).getById(`project:scale-${ruleCount - 1}`)?.description,
  ).toBe(`Scale annotation ${ruleCount - 1}`);
  expect(
    new RuleDB(database)
      .getVersions(`project:scale-${ruleCount - 1}`)
      .map((version) => version.filePath),
  ).toEqual([
    `/original/${ruleCount - 1}-2.md`,
    `/original/${ruleCount - 1}-1.md`,
  ]);
  expect(database.pragma("foreign_key_check")).toEqual([]);
  console.log(
    JSON.stringify({
      ruleCount,
      versionCount: ruleCount * versionsPerRule,
      elapsedMs,
      rssDeltaBytes: process.memoryUsage().rss - beforeRss,
      databaseBytes: fs.statSync(databasePath).size,
    }),
  );
});
