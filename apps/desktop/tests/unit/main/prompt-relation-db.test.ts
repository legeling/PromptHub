import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PromptDB, PromptRelationDB } from "../../../src/main/database";
import {
  SCHEMA_INDEXES,
  SCHEMA_TABLES,
} from "../../../src/main/database/schema";
import DatabaseAdapter from "../../../src/main/database/sqlite";

describe("PromptRelationDB", () => {
  let rawDb: DatabaseAdapter.Database;
  let promptDb: PromptDB;
  let relationDb: PromptRelationDB;

  beforeEach(() => {
    rawDb = new DatabaseAdapter(":memory:");
    rawDb.pragma("foreign_keys = ON");
    rawDb.exec(SCHEMA_TABLES);
    rawDb.exec(SCHEMA_INDEXES);
    promptDb = new PromptDB(rawDb);
    relationDb = new PromptRelationDB(rawDb);
  });

  afterEach(() => {
    rawDb.close();
  });

  function createPrompt(title: string) {
    return promptDb.create({ title, userPrompt: title });
  }

  it("creates and lists directed prompt relations", () => {
    const source = createPrompt("Source");
    const target = createPrompt("Target");

    const relation = relationDb.create({
      sourcePromptId: source.id,
      targetPromptId: target.id,
      kind: "depends_on",
      note: "needs context",
    });

    expect(relation.sourcePromptId).toBe(source.id);
    expect(relation.targetPromptId).toBe(target.id);
    expect(relation.kind).toBe("depends_on");
    expect(relation.note).toBe("needs context");
    expect(
      relationDb.list({ promptId: source.id, direction: "outgoing" }),
    ).toEqual([relation]);
    expect(
      relationDb.list({ promptId: target.id, direction: "incoming" }),
    ).toEqual([relation]);
  });

  it("canonicalizes related_to as an undirected relation", () => {
    const first = createPrompt("A");
    const second = createPrompt("B");

    const original = relationDb.create({
      sourcePromptId: second.id,
      targetPromptId: first.id,
      kind: "related_to",
    });
    const duplicate = relationDb.create({
      sourcePromptId: first.id,
      targetPromptId: second.id,
      kind: "related_to",
    });

    expect(duplicate.id).toBe(original.id);
    expect(relationDb.list({ promptId: first.id })).toHaveLength(1);
    expect(relationDb.list({ promptId: second.id })).toHaveLength(1);
  });

  it("rejects invalid relation endpoints and kinds", () => {
    const prompt = createPrompt("Prompt");

    expect(() =>
      relationDb.create({
        sourcePromptId: prompt.id,
        targetPromptId: prompt.id,
        kind: "related_to",
      }),
    ).toThrow("Prompt relation cannot point to itself");
    expect(() =>
      relationDb.create({
        sourcePromptId: prompt.id,
        targetPromptId: "missing",
        kind: "related_to",
      }),
    ).toThrow("Target prompt does not exist");
    expect(() =>
      relationDb.create({
        sourcePromptId: prompt.id,
        targetPromptId: "missing",
        kind: "grouped_under" as "related_to",
      }),
    ).toThrow("Unsupported prompt relation kind");
  });

  it("updates and deletes relations", () => {
    const source = createPrompt("Source");
    const target = createPrompt("Target");
    const relation = relationDb.create({
      sourcePromptId: source.id,
      targetPromptId: target.id,
      kind: "variant_of",
    });

    const updated = relationDb.update(relation.id, {
      kind: "next_step",
      note: "run after source",
    });

    expect(updated?.kind).toBe("next_step");
    expect(updated?.note).toBe("run after source");
    expect(relationDb.delete(relation.id)).toBe(true);
    expect(relationDb.list()).toEqual([]);
  });

  it("deletes relations when a referenced prompt is deleted", () => {
    const source = createPrompt("Source");
    const target = createPrompt("Target");
    relationDb.create({
      sourcePromptId: source.id,
      targetPromptId: target.id,
      kind: "next_step",
    });

    expect(relationDb.list()).toHaveLength(1);
    expect(promptDb.delete(source.id)).toBe(true);
    expect(relationDb.list()).toEqual([]);
  });
});
