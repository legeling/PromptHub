/**
 * @vitest-environment node
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { DatabaseAdapter, SCHEMA_TABLES, PromptDB } from "@prompthub/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("PromptDB.deleteTagIfUnreferenced", () => {
  let tempDir: string;
  let db: PromptDB;
  let dirDb: DatabaseAdapter.Database;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-tag-ref-"));
    dirDb = new DatabaseAdapter(path.join(tempDir, "tags.db"));
    dirDb.exec(SCHEMA_TABLES);
    db = new PromptDB(dirDb);
  });

  afterEach(() => {
    dirDb.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function addPrompt(id: string, tags: string[]): void {
    dirDb
      .prepare(
        `INSERT INTO prompts (id, title, user_prompt, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, id, "content", JSON.stringify(tags), Date.now(), Date.now());
  }

  function tagsOf(id: string): string[] {
    const row = dirDb
      .prepare("SELECT tags FROM prompts WHERE id = ?")
      .get(id) as { tags: string };
    return JSON.parse(row.tags) as string[];
  }

  it("refuses deletion while any prompt still references the tag", () => {
    addPrompt("p1", ["ops", "cli"]);
    addPrompt("p2", ["ops"]);

    const result = db.deleteTagIfUnreferenced("ops");

    expect(result).toEqual({ deleted: false, referenced: 2 });
    // Rows still own the tag and were not touched.
    expect(tagsOf("p1")).toEqual(["ops", "cli"]);
    expect(tagsOf("p2")).toEqual(["ops"]);
  });

  it("allows deletion (reports removed) when nothing references the tag", () => {
    addPrompt("p1", ["cli"]);

    const result = db.deleteTagIfUnreferenced("remote-only");

    expect(result).toEqual({ deleted: true, referenced: 0 });
    expect(tagsOf("p1")).toEqual(["cli"]);
  });

  it("matches exact arrays only and ignores unparseable rows", () => {
    addPrompt("p1", ["ops"]);
    addPrompt("p2", ["opsx"]);
    dirDb
      .prepare(
        `INSERT INTO prompts (id, title, user_prompt, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("p3", "p3", "c", "not-json", Date.now(), Date.now());

    expect(db.deleteTagIfUnreferenced("ops")).toEqual({
      deleted: false,
      referenced: 1,
    });
    expect(db.deleteTagIfUnreferenced("opsx")).toEqual({
      deleted: false,
      referenced: 1,
    });
  });

  it("treats an empty tag as deletable without a transactional write", () => {
    expect(db.deleteTagIfUnreferenced("")).toEqual({
      deleted: true,
      referenced: 0,
    });
  });
});
