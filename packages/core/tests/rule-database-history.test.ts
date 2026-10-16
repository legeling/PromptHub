import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { RuleDB } from "@prompthub/db";
import type { RuleRecord, RuleVersionRecord } from "@prompthub/shared";
import { closeDatabase, initDatabase } from "../src/database";
import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";

let root: string;
let record: RuleRecord;
let version: RuleVersionRecord;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-rule-database-"));
  configureRuntimePaths({ userDataPath: root });
  const createdAt = "2026-01-01T00:00:00.000Z";
  record = {
    id: "project:history-test",
    scope: "project",
    platformId: "claude",
    platformName: "History project",
    platformIcon: "test",
    platformDescription: "Test project",
    canonicalFileName: "CLAUDE.md",
    description: "Original description",
    managedPath: path.join(root, "managed", "CLAUDE.md"),
    targetPath: path.join(root, "target", "CLAUDE.md"),
    projectRootPath: path.join(root, "target"),
    syncStatus: "synced",
    currentVersion: 1,
    contentHash: "original-content-hash",
    createdAt,
    updatedAt: createdAt,
  };
  version = {
    id: "history-version",
    ruleId: record.id,
    version: 1,
    filePath: path.join(root, "history.md"),
    source: "create",
    createdAt,
  };
  fs.writeFileSync(version.filePath, "# Original history\n");
  const repository = new RuleDB(initDatabase());
  repository.upsert(record);
  repository.replaceVersions(record.id, [version]);
});

afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

function reopened(): RuleDB {
  closeDatabase();
  return new RuleDB(initDatabase());
}

it("updates Rule metadata without deleting its history and preserves it after reopen", () => {
  const repository = new RuleDB(initDatabase());
  const updated: RuleRecord = {
    ...record,
    description: "Updated 中文 description",
    targetPath: path.join(root, "moved", "CLAUDE.md"),
    projectRootPath: path.join(root, "moved"),
    syncStatus: "target-missing",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
  repository.upsert(updated);
  expect(repository.getById(record.id)).toEqual(updated);
  expect(repository.getVersions(record.id)).toEqual([version]);
  const persisted = reopened();
  expect(persisted.getById(record.id)).toEqual(updated);
  expect(persisted.getVersions(record.id)).toEqual([version]);
  expect(fs.readFileSync(version.filePath, "utf8")).toBe(
    "# Original history\n",
  );
});

it("preserves metadata and history when an in-place update fails", () => {
  const database = initDatabase();
  database.exec(`CREATE TRIGGER reject_rule_update BEFORE UPDATE ON rules
    BEGIN SELECT RAISE(ABORT, 'injected rule update failure'); END`);
  const repository = new RuleDB(database);
  expect(() =>
    repository.upsert({ ...record, description: "Rejected" }),
  ).toThrow("injected rule update failure");
  const persisted = reopened();
  expect(persisted.getById(record.id)).toEqual(record);
  expect(persisted.getVersions(record.id)).toEqual([version]);
});

it("rolls back a metadata and history replacement together in the caller transaction", () => {
  const database = initDatabase();
  const repository = new RuleDB(database);
  const replacement = { ...version, id: "replacement-version" };
  expect(() =>
    database.transaction(() => {
      repository.upsert({ ...record, description: "Uncommitted" });
      repository.replaceVersions(record.id, [replacement]);
      throw new Error("injected outer transaction failure");
    })(),
  ).toThrow("injected outer transaction failure");
  const persisted = reopened();
  expect(persisted.getById(record.id)).toEqual(record);
  expect(persisted.getVersions(record.id)).toEqual([version]);
});

it("preserves history on failed replacement and deletes it only on explicit deletion", () => {
  const repository = new RuleDB(initDatabase());
  repository.upsert({ ...record, description: "Committed metadata" });
  expect(() =>
    repository.replaceVersions(record.id, [version, version]),
  ).toThrow();
  expect(repository.getVersions(record.id)).toEqual([version]);
  repository.delete(record.id);
  const persisted = reopened();
  expect(persisted.getById(record.id)).toBeNull();
  expect(persisted.getVersions(record.id)).toEqual([]);
  expect(fs.readFileSync(version.filePath, "utf8")).toBe(
    "# Original history\n",
  );
});
