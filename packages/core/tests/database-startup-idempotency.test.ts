import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  closeDatabase,
  CURRENT_DATABASE_SCHEMA_VERSION,
  initDatabase,
  PromptDB,
} from "@prompthub/db";

let root: string | undefined;

afterEach(() => {
  closeDatabase();
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

it("reopens a current populated database without rewriting its bytes or migration history", () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-startup-idempotency-"));
  const file = path.join(root, "prompthub.db");
  const database = initDatabase(file);
  const prompt = new PromptDB(database).create({
    title: "Preserved on reopen",
    userPrompt: "Exact content 中文 🦌",
  });
  const history = database.all(
    "SELECT * FROM database_migration_history ORDER BY migration_id",
  );
  closeDatabase();
  const before = fs.readFileSync(file);

  for (const _reopen of [1, 2]) {
    const reopened = initDatabase(file);
    expect(new PromptDB(reopened).getById(prompt.id)).toEqual(prompt);
    expect(reopened.pragma("user_version")).toEqual([
      { user_version: CURRENT_DATABASE_SCHEMA_VERSION },
    ]);
    expect(reopened.all(
      "SELECT * FROM database_migration_history ORDER BY migration_id",
    )).toEqual(history);
    expect(reopened.pragma("quick_check")).toEqual([{ quick_check: "ok" }]);
    expect(reopened.pragma("foreign_key_check")).toEqual([]);
    closeDatabase();
    expect(fs.readFileSync(file)).toEqual(before);
  }
});
