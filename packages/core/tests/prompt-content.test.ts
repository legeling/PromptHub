import { DatabaseAdapter, PromptDB, SCHEMA } from "@prompthub/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  hasPromptContent,
  PromptContentValidationError,
} from "@prompthub/shared/utils/prompt-content";

let database: DatabaseAdapter.Database;
let prompts: PromptDB;
beforeEach(() => {
  database = new DatabaseAdapter(":memory:");
  database.exec(SCHEMA);
  database.pragma("foreign_keys = ON");
  prompts = new PromptDB(database);
});
afterEach(() => database.close());

describe("Prompt content contract (#225)", () => {
  it.each([
    { systemPrompt: "Return JSON. 中文 🦌", userPrompt: "" },
    { systemPrompt: "", userPrompt: "Hello" },
    { systemPrompt: "Policy", userPrompt: "Question" },
  ])(
    "persists each valid content combination and its initial version: %j",
    (content) => {
      const prompt = prompts.create({ title: "Content contract", ...content });
      expect(prompts.getById(prompt.id)).toMatchObject({
        systemPrompt: content.systemPrompt || null,
        userPrompt: content.userPrompt,
      });
      expect(prompts.getVersions(prompt.id)).toHaveLength(1);
      expect(prompts.getVersions(prompt.id)[0]).toMatchObject({
        systemPrompt: content.systemPrompt || null,
        userPrompt: content.userPrompt,
      });
    },
  );

  it.each([
    { systemPrompt: "", userPrompt: "" },
    { systemPrompt: " \n\t", userPrompt: "\u3000" },
    { systemPrompt: undefined, userPrompt: "", userPromptEn: "English only" },
  ])("rejects empty primary content without inserting rows: %j", (content) => {
    expect(() => prompts.create({ title: "Empty", ...content })).toThrow(
      PromptContentValidationError,
    );
    expect(database.all("SELECT id FROM prompts")).toEqual([]);
    expect(database.all("SELECT id FROM prompt_versions")).toEqual([]);
  });

  it("merges partial updates and rejects clearing the last body without changing history", () => {
    const prompt = prompts.create({
      title: "Policy",
      systemPrompt: "Keep JSON",
      userPrompt: "",
    });
    expect(prompts.update(prompt.id, { title: "Renamed" })).toMatchObject({
      title: "Renamed",
      systemPrompt: "Keep JSON",
      userPrompt: "",
    });
    expect(prompts.update(prompt.id, { userPrompt: "" })).toMatchObject({
      systemPrompt: "Keep JSON",
    });
    const before = prompts.getById(prompt.id);
    const history = prompts.getVersions(prompt.id);
    expect(() =>
      prompts.update(prompt.id, {
        title: "Must not save",
        systemPrompt: " \n ",
      }),
    ).toThrow(PromptContentValidationError);
    expect(prompts.getById(prompt.id)).toEqual(before);
    expect(prompts.getVersions(prompt.id)).toEqual(history);
    expect(
      prompts.update(prompt.id, { systemPrompt: "", userPrompt: "User body" }),
    ).toMatchObject({
      systemPrompt: "",
      userPrompt: "User body",
    });
  });

  it("preserves existing blank historical records during metadata edits", () => {
    const prompt = prompts.create({ title: "Legacy", userPrompt: "Original" });
    database
      .prepare("UPDATE prompts SET user_prompt = ? WHERE id = ?")
      .run("", prompt.id);
    expect(
      prompts.update(prompt.id, { title: "Legacy renamed" }),
    ).toMatchObject({
      title: "Legacy renamed",
      userPrompt: "",
    });
  });

  it("treats null/absent and Unicode whitespace as empty without rejecting real text", () => {
    expect(
      hasPromptContent({ systemPrompt: null, userPrompt: "\u3000\n" }),
    ).toBe(false);
    expect(
      hasPromptContent({ systemPrompt: "\u3000中文\n", userPrompt: "" }),
    ).toBe(true);
  });
});
