import { DatabaseAdapter, PromptDB, SCHEMA } from "@prompthub/db";
import { afterEach, beforeEach, expect, it } from "vitest";
let db: DatabaseAdapter.Database;
beforeEach(() => {
  db = new DatabaseAdapter(":memory:");
  db.exec(SCHEMA);
  db.pragma("foreign_keys = ON");
});
afterEach(() => db.close());
it("rolls back the Prompt when its initial version cannot be persisted", () => {
  db.exec(
    "CREATE TRIGGER reject_version BEFORE INSERT ON prompt_versions BEGIN SELECT RAISE(ABORT, 'version rejected'); END;",
  );
  expect(() =>
    new PromptDB(db).create({ title: "atomic", userPrompt: "content" }),
  ).toThrow("version rejected");
  expect(db.all("SELECT id FROM prompts")).toEqual([]);
  expect(db.all("SELECT id FROM prompt_versions")).toEqual([]);
});
it("creates exactly one matching initial version inside an enclosing transaction", () => {
  const prompt = db.transaction(() =>
    new PromptDB(db).create({ title: "atomic", userPrompt: "content" }),
  )();
  expect(prompt.currentVersion).toBe(1);
  expect(new PromptDB(db).getVersions(prompt.id)).toHaveLength(1);
});
