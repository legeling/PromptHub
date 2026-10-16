import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  initDatabase,
  closeDatabase,
  DatabaseAdapter,
  PromptDB,
  CURRENT_DATABASE_SCHEMA_VERSION,
} from "@prompthub/db";

let root: string;
afterEach(() => {
  closeDatabase();
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

it("upgrades a populated prior schema atomically and keeps old rows intact on failure and retry", () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-plugin-schema-"));
  const file = path.join(root, "prompthub.db");
  let database = initDatabase(file);
  const prompt = new PromptDB(database).create({
    title: "Historical",
    userPrompt: "preserve exact content",
  });
  database.exec(
    "DROP TABLE plugin_versions; DROP TABLE plugins; DELETE FROM database_migration_history WHERE migration_id > 8; PRAGMA user_version = 8;",
  );
  closeDatabase();
  expect(() =>
    initDatabase(file, {
      beforeMigrationCommit() {
        throw new Error("injected schema failure");
      },
    }),
  ).toThrow("injected schema failure");
  const old = new DatabaseAdapter(file);
  try {
    expect(new PromptDB(old).getById(prompt.id)).toEqual(prompt);
    expect(old.pragma("user_version")).toEqual([{ user_version: 8 }]);
    expect(
      old.get("SELECT name FROM sqlite_master WHERE name = 'plugins'"),
    ).toBeNull();
  } finally {
    old.close();
  }
  database = initDatabase(file);
  expect(new PromptDB(database).getById(prompt.id)).toEqual(prompt);
  expect(database.all("SELECT * FROM plugins")).toEqual([]);
  expect(database.pragma("user_version")).toEqual([
    { user_version: CURRENT_DATABASE_SCHEMA_VERSION },
  ]);
  expect(database.pragma("foreign_key_check")).toEqual([]);
});
