import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PromptDB, PromptOutputFormatDB } from "../../../src/main/database";
import {
  SCHEMA_INDEXES,
  SCHEMA_TABLES,
} from "../../../src/main/database/schema";
import DatabaseAdapter from "../../../src/main/database/sqlite";

describe("PromptOutputFormatDB", () => {
  let rawDb: DatabaseAdapter.Database;
  let promptDb: PromptDB;
  let outputFormatDb: PromptOutputFormatDB;

  beforeEach(() => {
    rawDb = new DatabaseAdapter(":memory:");
    rawDb.pragma("foreign_keys = ON");
    rawDb.exec(SCHEMA_TABLES);
    rawDb.exec(SCHEMA_INDEXES);
    promptDb = new PromptDB(rawDb);
    outputFormatDb = new PromptOutputFormatDB(rawDb);
  });

  afterEach(() => {
    rawDb.close();
  });

  function createPrompt(title: string) {
    return promptDb.create({ title, userPrompt: title });
  }

  it("creates an ordered output sequence for a source prompt", () => {
    const source = createPrompt("Source");
    const target = createPrompt("Target");

    const self = outputFormatDb.create({
      sourcePromptId: source.id,
      targetPromptId: null,
    });
    const linked = outputFormatDb.create({
      sourcePromptId: source.id,
      targetPromptId: target.id,
    });

    expect(outputFormatDb.list({ sourcePromptId: source.id })).toEqual([
      self,
      linked,
    ]);
    expect(self.sortOrder).toBe(0);
    expect(linked.sortOrder).toBe(1);
  });

  it("returns the existing item for duplicate self or target entries", () => {
    const source = createPrompt("Source");
    const target = createPrompt("Target");

    const self = outputFormatDb.create({
      sourcePromptId: source.id,
      targetPromptId: null,
    });
    const duplicateSelf = outputFormatDb.create({
      sourcePromptId: source.id,
      targetPromptId: null,
    });
    const linked = outputFormatDb.create({
      sourcePromptId: source.id,
      targetPromptId: target.id,
    });
    const duplicateLinked = outputFormatDb.create({
      sourcePromptId: source.id,
      targetPromptId: target.id,
    });

    expect(duplicateSelf.id).toBe(self.id);
    expect(duplicateLinked.id).toBe(linked.id);
    expect(outputFormatDb.list({ sourcePromptId: source.id })).toHaveLength(2);
  });

  it("enforces a single self item per source prompt at the database boundary", () => {
    const source = createPrompt("Source");
    const now = Date.now();

    rawDb
      .prepare(
        `INSERT INTO prompt_output_format_items (
          id, source_prompt_id, target_prompt_id, sort_order, created_at, updated_at
        ) VALUES (?, ?, NULL, ?, ?, ?)`,
      )
      .run("self-1", source.id, 0, now, now);

    expect(() =>
      rawDb
        .prepare(
          `INSERT INTO prompt_output_format_items (
            id, source_prompt_id, target_prompt_id, sort_order, created_at, updated_at
          ) VALUES (?, ?, NULL, ?, ?, ?)`,
        )
        .run("self-2", source.id, 1, now, now),
    ).toThrow();
  });

  it("reorders items and normalizes remaining sort order after delete", () => {
    const source = createPrompt("Source");
    const firstTarget = createPrompt("First");
    const secondTarget = createPrompt("Second");
    const self = outputFormatDb.create({
      sourcePromptId: source.id,
      targetPromptId: null,
    });
    const first = outputFormatDb.create({
      sourcePromptId: source.id,
      targetPromptId: firstTarget.id,
    });
    const second = outputFormatDb.create({
      sourcePromptId: source.id,
      targetPromptId: secondTarget.id,
    });

    outputFormatDb.reorder(source.id, second.id, 0);

    expect(
      outputFormatDb.list({ sourcePromptId: source.id }).map((item) => item.id),
    ).toEqual([second.id, self.id, first.id]);

    expect(outputFormatDb.delete(self.id)).toBe(true);
    expect(
      outputFormatDb
        .list({ sourcePromptId: source.id })
        .map((item) => item.sortOrder),
    ).toEqual([0, 1]);
  });

  it("removes output format items when source or target prompts are deleted", () => {
    const source = createPrompt("Source");
    const target = createPrompt("Target");
    outputFormatDb.create({
      sourcePromptId: source.id,
      targetPromptId: target.id,
    });

    expect(outputFormatDb.list()).toHaveLength(1);
    expect(promptDb.delete(target.id)).toBe(true);
    expect(outputFormatDb.list()).toEqual([]);
  });
});
