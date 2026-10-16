import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  DatabaseAdapter,
  initDatabase,
  closeDatabase,
  CURRENT_DATABASE_SCHEMA_VERSION,
} from "@prompthub/db";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-generation-schema-"));
});
afterEach(() => {
  closeDatabase();
  fs.rmSync(root, { recursive: true, force: true });
});

// Issued schema-v6 columns: request details and errors existed only in batch.json.
const LEGACY_SCHEMA = `
CREATE TABLE generation_batches (
 id TEXT PRIMARY KEY, manifest_path TEXT NOT NULL UNIQUE, status TEXT NOT NULL,
 title TEXT NOT NULL, source_prompt_id TEXT REFERENCES prompts(id) ON DELETE SET NULL,
 provider TEXT NOT NULL, model TEXT NOT NULL, requested_count INTEGER NOT NULL,
 succeeded_count INTEGER NOT NULL DEFAULT 0, failed_count INTEGER NOT NULL DEFAULT 0,
 cancelled_count INTEGER NOT NULL DEFAULT 0, interrupted_count INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
);
CREATE TABLE generation_outputs (
 id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES generation_batches(id) ON DELETE CASCADE,
 slot_index INTEGER NOT NULL, status TEXT NOT NULL, file_name TEXT, mime_type TEXT,
 byte_size INTEGER, sha256 TEXT, favorite INTEGER NOT NULL DEFAULT 0, created_at TEXT, deleted_at TEXT,
 UNIQUE(batch_id, slot_index)
);`;

it("upgrades populated generation indexes transactionally and preserves every historical column value", () => {
  const dbPath = path.join(root, "prompthub.db");
  let database = initDatabase(dbPath);
  database.exec(
    "DROP TABLE generation_outputs; DROP TABLE generation_batches;",
  );
  database.exec(LEGACY_SCHEMA);
  const at = "2026-10-15T00:00:00.000Z";
  database.run(
    "INSERT INTO generation_batches VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "batch",
    "generations/batch/batch.json",
    "succeeded",
    "历史 🎨",
    null,
    "openai",
    "image",
    1,
    1,
    0,
    0,
    0,
    at,
    at,
    at,
  );
  database.run(
    "INSERT INTO generation_outputs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "output",
    "batch",
    0,
    "succeeded",
    "image.png",
    "image/png",
    10,
    "a".repeat(64),
    1,
    at,
    null,
  );
  const before = database.all("SELECT * FROM generation_outputs") as Record<
    string,
    unknown
  >[]; // The fixture creates and inserts the exact row shape above.
  database.exec(
    "DELETE FROM database_migration_history WHERE migration_id > 6; PRAGMA user_version = 6;",
  );
  closeDatabase();
  expect(() =>
    initDatabase(dbPath, {
      beforeMigrationCommit() {
        throw new Error("injected generation upgrade failure");
      },
    }),
  ).toThrow("injected generation upgrade failure");
  const probe = new DatabaseAdapter(dbPath);
  try {
    expect(
      probe.get(
        "SELECT manifest_path FROM generation_batches WHERE id = ?",
        "batch",
      ),
    ).toEqual({ manifest_path: "generations/batch/batch.json" });
    expect(probe.all("SELECT * FROM generation_outputs")).toEqual(before);
  } finally {
    probe.close();
  }
  database = initDatabase(dbPath);
  expect(
    database.get(
      "SELECT title, request_json FROM generation_batches WHERE id = ?",
      "batch",
    ),
  ).toEqual({ title: "历史 🎨", request_json: null });
  expect(database.all("SELECT * FROM generation_outputs")).toEqual(
    before.map((row) => ({ ...row, error_json: null, revised_prompt: null })),
  );
  expect(database.pragma("foreign_key_check")).toEqual([]);
  expect(database.pragma("user_version")).toEqual([
    { user_version: CURRENT_DATABASE_SCHEMA_VERSION },
  ]);
  expect(database.all("PRAGMA table_info(generation_batches)")).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "manifest_path" }),
    ]),
  );
});
