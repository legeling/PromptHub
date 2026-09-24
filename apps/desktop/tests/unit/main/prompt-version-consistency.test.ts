/**
 * @vitest-environment node
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DatabaseAdapter,
  PromptDB,
  SCHEMA_TABLES,
  repairPromptVersionConsistency,
} from "@prompthub/db";

describe("repairPromptVersionConsistency", () => {
  let tempDir: string;
  let database: DatabaseAdapter.Database;

  function insertPrompt(
    overrides: Partial<{ id: string; current_version: number }> = {},
  ): void {
    const { id = `prompt-${Math.random()}` } = overrides;
    database
      .prepare(
        `INSERT INTO prompts (
          id, visibility, prompt_type, title, user_prompt, variables, tags,
          current_version, created_at, updated_at
        ) VALUES (?, 'private', 'text', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        "title",
        `content-of-${id}`,
        JSON.stringify([]),
        JSON.stringify([]),
        overrides.current_version ?? 0,
        Date.now(),
        Date.now(),
      );
  }

  function insertVersion(promptId: string, version: number): void {
    database
      .prepare(
        `INSERT INTO prompt_versions (
          id, prompt_id, version, user_prompt, variables, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        `${promptId}-v${version}`,
        promptId,
        version,
        `v${version}-content`,
        JSON.stringify([]),
        Date.now(),
      );
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-version-consistency-"),
    );
    const dbPath = path.join(tempDir, "test.db");
    database = new DatabaseAdapter(dbPath);
    database.exec(SCHEMA_TABLES);
  });

  afterEach(() => {
    database.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function allPrompts() {
    return database
      .prepare("SELECT id, current_version FROM prompts")
      .all() as Array<{ id: string; current_version: number }>;
  }

  it("converges current_version to the stored maximum when the pointer is stale or missing for prompts with history", () => {
    insertPrompt({ id: "ahead", current_version: 3 });
    insertVersion("ahead", 1);
    insertVersion("ahead", 2);

    const result = repairPromptVersionConsistency(database);

    expect(result.repairedPromptIds).toContain("ahead");
    const row = database
      .prepare("SELECT current_version FROM prompts WHERE id = ?")
      .get("ahead") as { current_version: number };
    expect(row.current_version).toBe(2);
    const count = database
      .prepare("SELECT COUNT(*) AS n FROM prompt_versions WHERE prompt_id = ?")
      .get("ahead") as { n: number };
    expect(count.n).toBe(2);
  });

  it("creates a v1 snapshot from the current prompt row when a prompt has content but no version rows", () => {
    insertPrompt({ id: "fresh", current_version: 0 });

    const result = repairPromptVersionConsistency(database);

    expect(result.createdInitialVersionPromptIds).toContain("fresh");
    const row = database
      .prepare("SELECT current_version FROM prompts WHERE id = ?")
      .get("fresh") as { current_version: number };
    expect(row.current_version).toBe(1);
    const version = database
      .prepare("SELECT * FROM prompt_versions WHERE prompt_id = ?")
      .get("fresh") as { version: number; user_prompt: string };
    expect(version.version).toBe(1);
    expect(version.user_prompt).toBe("content-of-fresh");
  });

  it("creates a missing initial snapshot even when the pointer already equals one", () => {
    insertPrompt({ id: "missing-v1", current_version: 1 });
    expect(
      repairPromptVersionConsistency(database).createdInitialVersionPromptIds,
    ).toEqual(["missing-v1"]);
    expect(new PromptDB(database).getVersions("missing-v1")).toHaveLength(1);
  });

  it("leaves healthy prompts untouched and reports no repair for them", () => {
    insertPrompt({ id: "ok", current_version: 2 });
    insertVersion("ok", 1);
    insertVersion("ok", 2);

    const result = repairPromptVersionConsistency(database);

    expect(result.repairedPromptIds).toEqual([]);
    expect(result.createdInitialVersionPromptIds).toEqual([]);
    const row = database
      .prepare("SELECT current_version FROM prompts WHERE id = ?")
      .get("ok") as { current_version: number };
    expect(row.current_version).toBe(2);
  });

  it("is idempotent and never fabricates a newer version than stored history", () => {
    insertPrompt({ id: "repeat", current_version: 9 });
    insertVersion("repeat", 1);

    const first = repairPromptVersionConsistency(database);
    const second = repairPromptVersionConsistency(database);

    expect(first.repairedPromptIds).toContain("repeat");
    expect(second.repairedPromptIds).toEqual([]);
    const row = allPrompts().find((p) => p.id === "repeat");
    expect(row?.current_version).toBe(1);
  });

  it("preserves a v0-only chain as v1 history followed by the current snapshot", () => {
    insertPrompt({ id: "zero-only", current_version: 0 });
    insertVersion("zero-only", 0);

    const result = repairPromptVersionConsistency(database);

    expect(result.createdInitialVersionPromptIds).not.toContain("zero-only");
    expect(
      database
        .prepare(
          "SELECT id, user_prompt FROM prompt_versions WHERE prompt_id = ?",
        )
        .get("zero-only"),
    ).toEqual({ id: "zero-only-v0", user_prompt: "v0-content" });
    const row = database
      .prepare("SELECT current_version FROM prompts WHERE id = ?")
      .get("zero-only") as { current_version: number };
    expect(row.current_version).toBe(2);
    const versions = database
      .prepare("SELECT version FROM prompt_versions WHERE prompt_id = ?")
      .all("zero-only") as { version: number }[];
    expect(versions.map((v) => v.version)).toEqual([1, 2]);
  });

  it("keeps legacy bodies selectable behind a real current snapshot", () => {
    insertPrompt({ id: "visible-history", current_version: 2 });
    insertVersion("visible-history", 0);
    insertVersion("visible-history", 2);
    const before = database
      .prepare("SELECT * FROM prompt_versions WHERE version = 0")
      .get() as Record<string, unknown>;
    repairPromptVersionConsistency(database);
    const promptDb = new PromptDB(database);
    const prompt = promptDb.getById("visible-history")!;
    const history = promptDb.getVersions(prompt.id);
    expect(prompt.currentVersion).toBe(4);
    expect(
      history.find((v) => v.version === prompt.currentVersion)?.userPrompt,
    ).toBe(prompt.userPrompt);
    // VersionHistoryModal hides the snapshot matching the current number.
    expect(
      history
        .filter((v) => v.version !== prompt.version)
        .map((v) => v.userPrompt),
    ).toContain("v0-content");
    expect(
      database
        .prepare("SELECT * FROM prompt_versions WHERE id = ?")
        .get(before.id),
    ).toEqual({ ...before, version: 3 });
    const repaired = database
      .prepare("SELECT * FROM prompt_versions ORDER BY version")
      .all();
    repairPromptVersionConsistency(database);
    expect(
      database.prepare("SELECT * FROM prompt_versions ORDER BY version").all(),
    ).toEqual(repaired);
  });

  it("rolls back legacy renumbering if the current snapshot cannot be inserted", () => {
    insertPrompt({ id: "failed-repair", current_version: 0 });
    insertVersion("failed-repair", 0);
    database.exec(
      "CREATE TRIGGER reject_repair BEFORE INSERT ON prompt_versions BEGIN SELECT RAISE(ABORT, 'snapshot rejected'); END",
    );
    expect(() => repairPromptVersionConsistency(database)).toThrow(
      "snapshot rejected",
    );
    expect(
      database.prepare("SELECT version FROM prompt_versions").get(),
    ).toEqual({ version: 0 });
    expect(allPrompts()).toEqual([{ id: "failed-repair", current_version: 0 }]);
  });

  it("preserves mixed invalid snapshots and remains idempotent", () => {
    insertPrompt({ id: "mixed", current_version: 3 });
    for (const version of [-2, 0, 3]) insertVersion("mixed", version);
    database
      .prepare(
        "UPDATE prompt_versions SET note = 'historic note' WHERE version = 0",
      )
      .run();
    repairPromptVersionConsistency(database);
    const rows = database
      .prepare("SELECT * FROM prompt_versions ORDER BY id")
      .all();
    expect(rows).toHaveLength(4);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "mixed-v0",
          user_prompt: "v0-content",
          note: "historic note",
          version: 5,
        }),
      ]),
    );
    repairPromptVersionConsistency(database);
    expect(
      database.prepare("SELECT * FROM prompt_versions ORDER BY id").all(),
    ).toEqual(rows);
  });
});

describe("PromptDB tag mutations keep version rows in sync", () => {
  let tempDir2: string;
  let database2: DatabaseAdapter.Database;
  let db2: PromptDB;

  function addPromptRaw(id: string, tags: string, currentVersion = 1): void {
    database2
      .prepare(
        `INSERT INTO prompts (id, title, user_prompt, tags, current_version, created_at, updated_at)
         VALUES (?, 't', 'c', ?, ?, ?, ?)`,
      )
      .run(id, tags, currentVersion, Date.now(), Date.now());
  }

  beforeEach(() => {
    tempDir2 = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-metaver-"));
    database2 = new DatabaseAdapter(path.join(tempDir2, "m.db"));
    database2.exec(SCHEMA_TABLES);
    db2 = new PromptDB(database2);
  });

  afterEach(() => {
    database2.close();
    fs.rmSync(tempDir2, { recursive: true, force: true });
  });

  function versionNumbers(promptId: string): number[] {
    return (
      database2
        .prepare("SELECT version FROM prompt_versions WHERE prompt_id = ?")
        .all(promptId) as { version: number }[]
    ).map((row) => row.version);
  }

  it.each(["rename", "delete"])(
    "rolls back tags when %s cannot write a version",
    (operation) => {
      addPromptRaw("rollback", '["old"]');
      database2.exec(
        "CREATE TRIGGER reject_version BEFORE INSERT ON prompt_versions BEGIN SELECT RAISE(ABORT, 'version write failed'); END",
      );
      expect(() =>
        operation === "rename"
          ? db2.renameTag("old", "new")
          : db2.deleteTag("old"),
      ).toThrow("version write failed");
      expect(
        database2
          .prepare(
            "SELECT tags, current_version FROM prompts WHERE id = 'rollback'",
          )
          .get(),
      ).toEqual({ tags: '["old"]', current_version: 1 });
    },
  );

  it.each(["rename", "delete"])(
    "rolls back %s if snapshot fields contain invalid JSON",
    (operation) => {
      addPromptRaw("invalid-snapshot", '["old"]');
      database2
        .prepare(
          "UPDATE prompts SET variables = 'broken' WHERE id = 'invalid-snapshot'",
        )
        .run();
      expect(() =>
        operation === "rename"
          ? db2.renameTag("old", "new")
          : db2.deleteTag("old"),
      ).toThrow(SyntaxError);
      expect(
        database2
          .prepare(
            "SELECT tags, current_version FROM prompts WHERE id = 'invalid-snapshot'",
          )
          .get(),
      ).toEqual({ tags: '["old"]', current_version: 1 });
      expect(versionNumbers("invalid-snapshot")).toEqual([]);
    },
  );

  it.each(["rename", "delete"])(
    "skips malformed tag JSON during %s",
    (operation) => {
      addPromptRaw("bad-tags", '["old",');
      expect(() =>
        operation === "rename"
          ? db2.renameTag("old", "new")
          : db2.deleteTag("old"),
      ).not.toThrow();
      expect(
        database2
          .prepare("SELECT tags FROM prompts WHERE id = 'bad-tags'")
          .get(),
      ).toEqual({ tags: '["old",' });
    },
  );

  it.each(['a"b', "a\\b", "line\nbreak", "100%_done", "标签😀"])(
    "mutates exact escaped tag %s without changing neighboring tags",
    (tag) => {
      addPromptRaw("escaped", JSON.stringify([tag, "untouched"]));
      addPromptRaw("neighbor", JSON.stringify([`${tag}-suffix`]));
      db2.renameTag(tag, "renamed");
      expect(db2.getById("escaped")?.tags).toEqual(["renamed", "untouched"]);
      expect(db2.getById("neighbor")?.tags).toEqual([`${tag}-suffix`]);
      db2.renameTag("renamed", tag);
      db2.deleteTag(tag);
      expect(db2.getById("escaped")?.tags).toEqual(["untouched"]);
      expect(db2.getById("neighbor")?.currentVersion).toBe(1);
      expect(versionNumbers("escaped")).toEqual([2, 3, 4]);
    },
  );

  it("matches an equivalent unicode escape spelling in stored JSON", () => {
    addPromptRaw("encoded", '["\\u0061"]');
    db2.renameTag("a", "b");
    expect(db2.getById("encoded")?.tags).toEqual(["b"]);
  });

  it("renameTag records a matching positive version row before advancing", () => {
    addPromptRaw("p-rn", JSON.stringify(["old"]), 1);
    database2
      .prepare(
        `INSERT INTO prompt_versions (id, prompt_id, version, user_prompt, variables, created_at)
         VALUES (?, 'p-rn', 1, 'c', '[]', ?)`,
      )
      .run("v1", Date.now());

    db2.renameTag("old", "new");

    const current = database2
      .prepare("SELECT current_version FROM prompts WHERE id = 'p-rn'")
      .get() as { current_version: number };
    expect(current.current_version).toBe(2);
    expect(versionNumbers("p-rn")).toContain(2);

    const tagsRow = database2
      .prepare("SELECT tags FROM prompts WHERE id = 'p-rn'")
      .get() as { tags: string };
    expect(JSON.parse(tagsRow.tags)).toEqual(["new"]);
  });

  it("deleteTag records a matching positive version row before advancing", () => {
    addPromptRaw("p-del", JSON.stringify(["gone", "keep"]), 1);
    database2
      .prepare(
        `INSERT INTO prompt_versions (id, prompt_id, version, user_prompt, variables, created_at)
         VALUES (?, 'p-del', 1, 'c', '[]', ?)`,
      )
      .run("v1", Date.now());

    db2.deleteTag("gone");

    const current = database2
      .prepare("SELECT current_version FROM prompts WHERE id = 'p-del'")
      .get() as { current_version: number };
    expect(current.current_version).toBe(2);
    expect(versionNumbers("p-del")).toContain(2);
  });
});
