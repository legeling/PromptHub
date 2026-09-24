import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseAdapter, FolderDB, PromptDB, SCHEMA } from "@prompthub/db";
import { restorePromptGraph } from "./prompt-graph-restore";

let database: InstanceType<typeof DatabaseAdapter>;
const actor = { userId: "owner", role: "user" as const };

beforeEach(() => {
  database = new DatabaseAdapter(":memory:");
  database.exec(SCHEMA);
  database.pragma("foreign_keys = ON");
  for (const id of [actor.userId, "other"]) {
    database
      .prepare(
        "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, id, "test-hash", 0, 0);
  }
});
afterEach(() => database.close());

function graph() {
  const prompts = new PromptDB(database);
  const folders = new FolderDB(database);
  const folder = folders.create({ name: "Folder" });
  const prompt = prompts.create({
    title: "Prompt",
    userPrompt: "Original",
    folderId: folder.id,
  });
  database.prepare("UPDATE prompts SET owner_user_id = ?").run(actor.userId);
  database.prepare("UPDATE folders SET owner_user_id = ?").run(actor.userId);
  return {
    prompts: [prompt],
    folders: [folder],
    versions: prompts.getVersions(prompt.id),
  };
}

describe("current atomic graph restore", () => {
  it("restores content, folder, version and stable IDs through SQLite", () => {
    const input = graph();
    new PromptDB(database).update(input.prompts[0].id, {
      userPrompt: "Changed",
    });
    const result = restorePromptGraph(database, actor, input);
    expect(result.promptCount).toBe(1);
    const prompts = new PromptDB(database);
    expect(prompts.getById(input.prompts[0].id)?.userPrompt).toBe("Original");
    expect(prompts.getById(input.prompts[0].id)?.folderId).toBe(
      input.folders[0].id,
    );
    expect(prompts.getVersions(input.prompts[0].id)).toEqual(input.versions);
    expect(database.pragma("foreign_key_check")).toEqual([]);
  });

  it("preserves another owner when explicitly clearing the current graph", () => {
    graph();
    const foreign = new PromptDB(database).create({
      title: "Foreign",
      userPrompt: "Keep",
    });
    database
      .prepare("UPDATE prompts SET owner_user_id = ? WHERE id = ?")
      .run("other", foreign.id);
    restorePromptGraph(database, actor, {
      prompts: [],
      folders: [],
      versions: [],
    });
    expect(new PromptDB(database).getAll().map((prompt) => prompt.id)).toEqual([
      foreign.id,
    ]);
  });

  it("rolls back deletion when an incoming ID belongs to another owner", () => {
    const input = graph();
    database
      .prepare("UPDATE prompts SET owner_user_id = ? WHERE id = ?")
      .run("other", input.prompts[0].id);
    expect(() => restorePromptGraph(database, actor, input)).toThrow(/outside/);
    expect(
      new PromptDB(database).getById(input.prompts[0].id)?.userPrompt,
    ).toBe("Original");
    expect(new FolderDB(database).getAll()).toHaveLength(1);
  });

  it("rejects duplicate IDs and broken references before changing data", () => {
    const input = graph();
    expect(() =>
      restorePromptGraph(database, actor, {
        ...input,
        prompts: [...input.prompts, ...input.prompts],
      }),
    ).toThrow(/duplicate/i);
    expect(() =>
      restorePromptGraph(database, actor, {
        ...input,
        versions: [{ ...input.versions[0], promptId: "missing" }],
      }),
    ).toThrow(/reference/i);
    expect(
      new PromptDB(database).getById(input.prompts[0].id)?.userPrompt,
    ).toBe("Original");
  });

  it("rejects cross-visibility folders without replacing the current graph", () => {
    const input = graph();
    input.folders[0].visibility = "shared";
    expect(() =>
      restorePromptGraph(database, { ...actor, role: "admin" }, input),
    ).toThrow(/visibility/i);
    expect(
      new PromptDB(database).getById(input.prompts[0].id)?.userPrompt,
    ).toBe("Original");
  });
});
