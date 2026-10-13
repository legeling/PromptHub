import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import type {
  DatabaseSync as SQLiteDatabase,
  SQLInputValue,
} from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filterPrompts } from "../features/prompts/promptFilters";
import { mobileCapabilities } from "../platform/mobileCapabilities";

// Vite 5 does not recognize node:sqlite as a built-in; use the same native
// require boundary as the existing Mobile repository tests.
const { DatabaseSync }: typeof import("node:sqlite") = createRequire(
  import.meta.url,
)("node:sqlite");

const nativeStorage = vi.hoisted(() => ({
  root: "",
  connections: new Set<import("node:sqlite").DatabaseSync>(),
}));

// Substitute only the Expo native driver. App initialization, schema and
// repository operations execute unchanged against a real disk database.
vi.mock("expo-sqlite", () => ({
  openDatabaseAsync: async (name: string) => {
    const database = new DatabaseSync(path.join(nativeStorage.root, name));
    nativeStorage.connections.add(database);
    return {
      execAsync: async (sql: string) => database.exec(sql),
      getFirstAsync: async (sql: string, params: SQLInputValue[] = []) =>
        database.prepare(sql).get(...params),
      getAllAsync: async (sql: string, params: SQLInputValue[] = []) =>
        database.prepare(sql).all(...params),
      runAsync: async (sql: string, params: SQLInputValue[] = []) =>
        database.prepare(sql).run(...params),
    };
  },
}));

function closeConnections(): void {
  for (const connection of nativeStorage.connections) connection.close();
  nativeStorage.connections.clear();
}

async function reopenRepository() {
  closeConnections();
  vi.resetModules();
  return (await import("../features/prompts/data/promptRepository"))
    .promptRepository;
}

function withDatabase<T>(callback: (database: SQLiteDatabase) => T): T {
  const database = new DatabaseSync(
    path.join(nativeStorage.root, "prompthub.db"),
  );
  try {
    return callback(database);
  } finally {
    database.close();
  }
}

beforeEach(() => {
  nativeStorage.root = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-mobile-acceptance-"),
  );
  vi.resetModules();
});

afterEach(() => {
  closeConnections();
  fs.rmSync(nativeStorage.root, { recursive: true, force: true });
});

const prompt = {
  id: "persistent-prompt",
  title: "中文 😀 O'Reilly",
  description: "Literal <b>description</b>",
  systemPrompt: "Review carefully",
  userPrompt: "Line 1\nSELECT * FROM prompts;",
  tags: ["中文", "audit"],
  isFavorite: true,
};

describe("release acceptance: Mobile public repository and disk storage", () => {
  it("persists system-only Prompt content and metadata edits across reopen (#225)", async () => {
    let repository = await reopenRepository();
    const systemOnly = { ...prompt, userPrompt: "" };
    await repository.create(systemOnly);
    await repository.update(prompt.id, { title: "Renamed system policy" });
    repository = await reopenRepository();
    expect(await repository.getById(prompt.id)).toMatchObject({
      title: "Renamed system policy",
      systemPrompt: prompt.systemPrompt,
      userPrompt: "",
    });
    expect(await repository.list()).toEqual([
      expect.objectContaining({
        title: "Renamed system policy",
        userPrompt: "",
      }),
    ]);
  });

  it("rejects blank Mobile writes before changing persisted rows (#225)", async () => {
    let repository = await reopenRepository();
    for (const blank of ["", " \n\t\u3000"]) {
      await expect(
        repository.create({
          ...prompt,
          systemPrompt: blank,
          userPrompt: blank,
        }),
      ).rejects.toThrow("At least one");
    }
    expect(await repository.list()).toEqual([]);
    await repository.create({ ...prompt, userPrompt: "" });
    const before = await repository.getById(prompt.id);
    await expect(
      repository.update(prompt.id, {
        title: "Must not save",
        systemPrompt: " \n ",
      }),
    ).rejects.toThrow("At least one");
    expect(await repository.getById(prompt.id)).toEqual(before);
    repository = await reopenRepository();
    expect(await repository.getById(prompt.id)).toEqual(before);
    await repository.update(prompt.id, {
      systemPrompt: "",
      userPrompt: "User content",
    });
    expect(await repository.getById(prompt.id)).toMatchObject({
      systemPrompt: "",
      userPrompt: "User content",
    });
  });

  it("persists create, edit and delete across reopen with matching list, detail and filtered results", async () => {
    let repository = await reopenRepository();
    await repository.create(prompt);
    await repository.create({
      ...prompt,
      id: "untouched",
      title: "Keep me",
      isFavorite: false,
    });
    repository = await reopenRepository();
    expect(await repository.getById(prompt.id)).toMatchObject(prompt);
    expect(
      filterPrompts(await repository.list(), "中文", "favorite").map(
        (item) => item.id,
      ),
    ).toEqual([prompt.id]);
    expect(
      withDatabase((db) =>
        db
          .prepare("SELECT title, user_prompt FROM prompts WHERE id = ?")
          .get(prompt.id),
      ),
    ).toEqual({ title: prompt.title, user_prompt: prompt.userPrompt });

    await repository.update(prompt.id, {
      title: "Edited title",
      isFavorite: false,
    });
    repository = await reopenRepository();
    expect(await repository.getById(prompt.id)).toMatchObject({
      ...prompt,
      title: "Edited title",
      isFavorite: false,
    });
    expect(filterPrompts(await repository.list(), "", "favorite")).toEqual([]);
    await repository.delete(prompt.id);
    repository = await reopenRepository();
    expect(await repository.getById(prompt.id)).toBeNull();
    expect((await repository.list()).map((item) => item.id)).toEqual([
      "untouched",
    ]);
    expect(await repository.getById("untouched")).toMatchObject({
      title: "Keep me",
      userPrompt: prompt.userPrompt,
    });
  });

  it("retains the original row after duplicate creation and a missing-row update", async () => {
    let repository = await reopenRepository();
    await repository.create(prompt);
    const before = await repository.getById(prompt.id);
    await expect(
      repository.create({ ...prompt, title: "Overwrite attempt" }),
    ).rejects.toThrow(/UNIQUE/);
    await expect(
      repository.update("missing", { title: "Missing" }),
    ).rejects.toThrow("Prompt not found: missing");
    repository = await reopenRepository();
    expect(await repository.list()).toEqual([before]);
    expect(
      withDatabase((db) =>
        db.prepare("SELECT COUNT(*) AS count FROM prompts").get(),
      ),
    ).toEqual({ count: 1 });
  });

  it("preserves content after a real SQLite update failure and persists a successful retry", async () => {
    let repository = await reopenRepository();
    await repository.create(prompt);
    const before = await repository.getById(prompt.id);
    withDatabase((db) =>
      db.exec(`
      CREATE TRIGGER acceptance_prompt_update_failure BEFORE UPDATE ON prompts
      BEGIN SELECT RAISE(ABORT, 'acceptance update failure'); END;
    `),
    );
    await expect(
      repository.update(prompt.id, { userPrompt: "Failed edit" }),
    ).rejects.toThrow("acceptance update failure");
    repository = await reopenRepository();
    expect(await repository.getById(prompt.id)).toEqual(before);
    withDatabase((db) =>
      db.exec("DROP TRIGGER acceptance_prompt_update_failure"),
    );
    await repository.update(prompt.id, { userPrompt: "Successful retry" });
    repository = await reopenRepository();
    expect(await repository.getById(prompt.id)).toMatchObject({
      ...prompt,
      userPrompt: "Successful retry",
    });
  });

  it("D3 declares SQLite storage after the public Prompt workflow has persisted and reopened", async () => {
    let repository = await reopenRepository();
    await repository.create(prompt);
    repository = await reopenRepository();
    expect(await repository.getById(prompt.id)).toMatchObject(prompt);
    expect(mobileCapabilities.durableStorage).toBe("sqlite");
  });
});
