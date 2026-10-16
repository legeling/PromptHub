import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  DatabaseAdapter,
  FolderDB,
  PromptDB,
  closeDatabase,
  initDatabase,
} from "@prompthub/db";
import { migratePromptWorkspaceV1 } from "../src/migrations/prompt-workspace-v1";

let root: string;
let databasePath: string;
let database: DatabaseAdapter.Database;
const timestamp = "2026-01-01T00:00:00.000Z";
function source(
  id = "historical",
  owner: string | null = "user-a",
  body = "Preserved body",
): string {
  const file = path.join(root, "data", "prompts", `${id}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `---\nid: ${JSON.stringify(id)}\nownerUserId: ${JSON.stringify(owner)}\nvisibility: "private"\ntitle: "Historical"\nusageCount: 9\nlastAiResponse: "Saved answer"\ncreatedAt: "${timestamp}"\nupdatedAt: "${timestamp}"\n---\n<!-- PROMPTHUB:SYSTEM -->\nSystem\n\n<!-- PROMPTHUB:USER -->\n${body}\n`,
  );
  return file;
}
function migrate(injectFailure?: (target: string) => void): void {
  migratePromptWorkspaceV1(database, {
    rootPath: root,
    databasePath,
    sourceFormat: "web",
    injectFailure,
  });
}
function reopen(): void {
  database.close();
  database = new DatabaseAdapter(databasePath);
  database.pragma("foreign_keys = ON");
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-web-prompt-upgrade-"));
  databasePath = path.join(root, "data", "prompthub.db");
  initDatabase(databasePath);
  closeDatabase();
  database = new DatabaseAdapter(databasePath);
  database.pragma("foreign_keys = ON");
  for (const id of ["user-a", "user-b"])
    database.run(
      "INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)",
      id,
      id,
      "fixture-hash",
      "user",
      1,
      1,
    );
});
afterEach(() => {
  database.close();
  fs.rmSync(root, { recursive: true, force: true });
});

it("preserves multiple owners, usage, answers, versions and exact recovery bytes before SQL-only reopen", () => {
  const first = source();
  source("second", "user-b");
  const bytes = fs.readFileSync(first);
  const versions = path.join(path.dirname(first), ".versions", "historical");
  fs.mkdirSync(versions, { recursive: true });
  fs.writeFileSync(
    path.join(versions, "0001.md"),
    `---\nid: "version-one"\npromptId: "historical"\nversion: 1\ncreatedAt: "${timestamp}"\n---\n<!-- PROMPTHUB:SYSTEM -->\nSystem\n\n<!-- PROMPTHUB:USER -->\nPreserved body\n`,
  );
  const sqlOnly = new PromptDB(database).create({
    title: "SQL only",
    userPrompt: "keep",
  });
  migrate();
  reopen();
  const prompts = new PromptDB(database);
  expect(prompts.getById("historical")).toMatchObject({
    ownerUserId: "user-a",
    visibility: "private",
    usageCount: 9,
    lastAiResponse: "Saved answer",
    userPrompt: "Preserved body",
  });
  expect(prompts.getById("second")?.ownerUserId).toBe("user-b");
  expect(prompts.getVersions("historical")).toMatchObject([
    { id: "version-one", version: 1 },
  ]);
  expect(prompts.getById(sqlOnly.id)?.userPrompt).toBe("keep");
  expect(fs.existsSync(first)).toBe(false);
  const recovery = path.join(root, "recovery", "web-prompt-workspace-v1");
  expect(
    fs.readFileSync(
      path.join(
        recovery,
        fs.readdirSync(recovery)[0],
        "data",
        "prompts",
        "historical.md",
      ),
    ),
  ).toEqual(bytes);
  prompts.delete("historical");
  reopen();
  migrate();
  expect(new PromptDB(database).getById("historical")).toBeNull();
  expect(new PromptDB(database).getById("second")?.ownerUserId).toBe("user-b");
});

it("preserves ownerless records without converting an unresolved owner into an ownerless record", () => {
  const file = source("historical", "missing-user");
  expect(() => migrate()).toThrow(/foreign key|owner/i);
  expect(new PromptDB(database).getAll()).toEqual([]);
  expect(fs.existsSync(file)).toBe(true);
  source("historical", null);
  migrate();
  expect(
    new PromptDB(database).getById("historical")?.ownerUserId,
  ).toBeUndefined();
});

it("preserves both sides of a SQL and file ownership conflict", () => {
  source();
  migrate();
  database.run(
    "DELETE FROM schema_migrations WHERE name = ?",
    "web-prompt-workspace-v1",
  );
  const file = source("historical", "user-b");
  expect(() => migrate()).toThrow(/conflict/i);
  expect(new PromptDB(database).getById("historical")?.ownerUserId).toBe(
    "user-a",
  );
  expect(fs.existsSync(file)).toBe(true);
});

it("preserves nested folder ownership and private visibility", () => {
  const file = source();
  fs.writeFileSync(
    file,
    fs
      .readFileSync(file, "utf8")
      .replace('title: "Historical"', 'title: "Historical"\nfolderId: "child"'),
  );
  const folder = {
    id: "parent",
    ownerUserId: "user-a",
    visibility: "private",
    name: "Parent",
    order: 0,
    isPrivate: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  fs.writeFileSync(
    path.join(path.dirname(file), "_folder.json"),
    JSON.stringify(folder),
  );
  const nested = path.join(path.dirname(file), "nested");
  fs.mkdirSync(nested);
  fs.writeFileSync(
    path.join(nested, "_folder.json"),
    JSON.stringify({ ...folder, id: "child", parentId: "parent" }),
  );
  migrate();
  reopen();
  expect(new FolderDB(database).getById("child")).toMatchObject({
    ownerUserId: "user-a",
    parentId: "parent",
    isPrivate: true,
  });
  expect(new PromptDB(database).getById("historical")?.folderId).toBe("child");
});

it("backs up interrupted export scratch files without importing them", () => {
  const file = source();
  const scratch = path.join(path.dirname(file), ".prompts-staging-interrupted");
  fs.mkdirSync(scratch);
  fs.writeFileSync(
    path.join(scratch, "partial.md"),
    "incomplete interrupted export",
  );
  migrate();
  expect(new PromptDB(database).getAll()).toHaveLength(1);
  const recovery = path.join(root, "recovery", "web-prompt-workspace-v1");
  const copy = path.join(
    recovery,
    fs.readdirSync(recovery)[0],
    "data",
    "prompts",
    ".prompts-staging-interrupted",
    "partial.md",
  );
  expect(fs.readFileSync(copy, "utf8")).toBe("incomplete interrupted export");
});

it("rolls back publication and retries without losing the owner", () => {
  const file = source();
  expect(() =>
    migrate((target) => {
      if (target.endsWith("prompts"))
        throw new Error("injected retirement failure");
    }),
  ).toThrow("injected retirement failure");
  expect(fs.existsSync(file)).toBe(true);
  expect(new PromptDB(database).getAll()).toEqual([]);
  migrate();
  expect(new PromptDB(database).getById("historical")?.ownerUserId).toBe(
    "user-a",
  );
});

it("rejects stale files after a successful migration and deletion", () => {
  source();
  migrate();
  new PromptDB(database).delete("historical");
  const file = source();
  expect(() => migrate()).toThrow(/explicit recovery/i);
  expect(new PromptDB(database).getAll()).toEqual([]);
  expect(fs.existsSync(file)).toBe(true);
});

it("converts the historical zero-version entrypoint into one retained current version", () => {
  const file = source();
  fs.writeFileSync(
    file,
    fs
      .readFileSync(file, "utf8")
      .replace('title: "Historical"', 'title: "Historical"\ncurrentVersion: 0'),
  );
  migrate();
  expect(new PromptDB(database).getById("historical")?.currentVersion).toBe(1);
  expect(new PromptDB(database).getVersions("historical")).toMatchObject([
    { version: 1, userPrompt: "Preserved body" },
  ]);
});
