import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  DatabaseAdapter,
  FolderDB,
  PromptDB,
  initDatabase,
  closeDatabase,
} from "@prompthub/db";
import { migratePromptWorkspaceV1 } from "../src/migrations/prompt-workspace-v1";
import {
  formatFrontmatter,
  formatPromptBody,
  promptFrontmatter,
  versionFrontmatter,
} from "../src/prompt-workspace/codec";

let root: string;
let databasePath: string;
let database: DatabaseAdapter.Database;
const timestamp = "2026-01-01T00:00:00.000Z";

function writePrompt(
  id = "historical",
  body = "Preserved body",
  extra = "",
): string {
  const file = path.join(root, "workspace", "prompts", `${id}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `---\nid: ${JSON.stringify(id)}\ntitle: "Historical"\ncreatedAt: "${timestamp}"\nupdatedAt: "${timestamp}"\n${extra}---\n<!-- PROMPTHUB:SYSTEM -->\n\n<!-- PROMPTHUB:USER -->\n${body}\n`,
  );
  return file;
}

function migrate(injectFailure?: (targetPath: string) => void): void {
  migratePromptWorkspaceV1(database, {
    rootPath: root,
    databasePath,
    injectFailure,
  });
}

function reopen(): void {
  database.close();
  database = new DatabaseAdapter(databasePath);
  database.pragma("foreign_keys = ON");
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-workspace-upgrade-"));
  databasePath = path.join(root, "data", "prompthub.db");
  initDatabase(databasePath);
  closeDatabase();
  database = new DatabaseAdapter(databasePath);
  database.pragma("foreign_keys = ON");
});

afterEach(() => {
  database.close();
  fs.rmSync(root, { recursive: true, force: true });
});

it("imports stable identities once, preserves SQL-only data and bytes, then deletes and reopens", () => {
  const file = writePrompt();
  const bytes = fs.readFileSync(file);
  const sqlOnly = new PromptDB(database).create({
    title: "SQL only",
    userPrompt: "keep",
  });
  migrate();
  const prompts = new PromptDB(database);
  expect(prompts.getById("historical")?.userPrompt).toBe("Preserved body");
  expect(prompts.getVersions("historical")).toHaveLength(1);
  expect(prompts.getById(sqlOnly.id)?.userPrompt).toBe("keep");
  expect(fs.existsSync(file)).toBe(false);
  const recovery = path.join(root, "recovery", "prompt-workspace-v1");
  const backup = path.join(
    recovery,
    fs.readdirSync(recovery)[0],
    "workspace",
    "prompts",
    "historical.md",
  );
  expect(fs.readFileSync(backup)).toEqual(bytes);
  prompts.delete("historical");
  reopen();
  migrate();
  expect(new PromptDB(database).getById("historical")).toBeNull();
  expect(new PromptDB(database).getById(sqlOnly.id)?.userPrompt).toBe("keep");
});

it("retains both sides of a same-ID content conflict regardless of timestamps", () => {
  const file = writePrompt();
  const prompt = new PromptDB(database).create({
    title: "SQL",
    userPrompt: "SQL body",
  });
  fs.renameSync(file, path.join(path.dirname(file), "conflict.md"));
  const conflict = path.join(path.dirname(file), "conflict.md");
  fs.writeFileSync(
    conflict,
    fs
      .readFileSync(conflict, "utf8")
      .replace('id: "historical"', `id: "${prompt.id}"`),
  );
  expect(() => migrate()).toThrow(/conflict/i);
  expect(new PromptDB(database).getById(prompt.id)).toEqual(prompt);
  expect(fs.existsSync(conflict)).toBe(true);
  expect(
    database.get(
      "SELECT name FROM schema_migrations WHERE name = ?",
      "prompt-workspace-v1",
    ),
  ).toBeNull();
});

it.each([false, true])(
  "honors a restore marker even with an empty restored database (%s)",
  (empty) => {
    if (!empty)
      new PromptDB(database).create({ title: "Restored", userPrompt: "keep" });
    const file = writePrompt();
    fs.writeFileSync(path.join(root, ".prompthub-restore-marker"), timestamp);
    migrate();
    expect(new PromptDB(database).getById("historical")).toBeNull();
    expect(new PromptDB(database).getAll()).toHaveLength(empty ? 0 : 1);
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.existsSync(path.join(root, ".prompthub-restore-marker"))).toBe(
      false,
    );
  },
);

it("rolls back file retirement and SQL on a publication failure, then retries", () => {
  const file = writePrompt();
  expect(() =>
    migrate((target) => {
      if (target.endsWith("prompts")) throw new Error("injected file failure");
    }),
  ).toThrow("injected file failure");
  expect(fs.existsSync(file)).toBe(true);
  expect(new PromptDB(database).getAll()).toEqual([]);
  migrate();
  expect(new PromptDB(database).getById("historical")?.userPrompt).toBe(
    "Preserved body",
  );
});

it("rolls back on SQL insertion failure and preserves the original files for retry", () => {
  const file = writePrompt();
  database.exec(
    "CREATE TRIGGER reject_workspace BEFORE INSERT ON prompts BEGIN SELECT RAISE(ABORT, 'injected SQL failure'); END",
  );
  expect(() => migrate()).toThrow("injected SQL failure");
  expect(fs.existsSync(file)).toBe(true);
  expect(new PromptDB(database).getAll()).toEqual([]);
  database.exec("DROP TRIGGER reject_workspace");
  migrate();
  expect(new PromptDB(database).getById("historical")).not.toBeNull();
});

it("rejects reappearing old writers after migration instead of resurrecting deletions", () => {
  writePrompt();
  migrate();
  new PromptDB(database).delete("historical");
  const file = writePrompt();
  expect(() => migrate()).toThrow(/explicit recovery/i);
  expect(new PromptDB(database).getAll()).toEqual([]);
  expect(fs.existsSync(file)).toBe(true);
});

it.each(["../escape", "invalid\u0000id"])(
  "rejects unsafe IDs before reading version paths (%s)",
  (id) => {
    const file = writePrompt();
    fs.writeFileSync(
      file,
      fs
        .readFileSync(file, "utf8")
        .replace('id: "historical"', `id: ${JSON.stringify(id)}`),
    );
    expect(() => migrate()).toThrow(/id/i);
    expect(fs.existsSync(file)).toBe(true);
    expect(new PromptDB(database).getAll()).toEqual([]);
  },
);

it("rejects symlinks without touching their targets", () => {
  const file = writePrompt();
  const outside = path.join(root, "outside.md");
  fs.renameSync(file, outside);
  fs.symlinkSync(outside, file);
  expect(() => migrate()).toThrow(/symbolic link/i);
  expect(fs.readFileSync(outside, "utf8")).toContain("Preserved body");
  expect(new PromptDB(database).getAll()).toEqual([]);
});

it("preserves SQL fields absent from Markdown and merges history from both historical directories", () => {
  const prompts = new PromptDB(database);
  const prompt = prompts.create({
    title: "Historical",
    userPrompt: "  keep whitespace\n",
    notes: "note",
  });
  prompts.incrementUsage(prompt.id);
  const current = prompts.getById(prompt.id)!;
  const file = writePrompt();
  fs.writeFileSync(
    file,
    formatFrontmatter(promptFrontmatter(current)) +
      formatPromptBody(current.systemPrompt, current.userPrompt),
  );
  const version = prompts.getVersions(prompt.id)[0];
  const versions = path.join(root, "workspace", ".versions", prompt.id);
  fs.mkdirSync(versions, { recursive: true });
  fs.writeFileSync(
    path.join(versions, "0001.md"),
    formatFrontmatter(versionFrontmatter(version)) +
      formatPromptBody(version.systemPrompt, version.userPrompt),
  );
  migrate();
  expect(prompts.getById(prompt.id)).toEqual(current);
  expect(prompts.getVersions(prompt.id)).toEqual([version]);
  reopen();
  expect(new PromptDB(database).getById(prompt.id)).toEqual(current);
});

it("archives orphaned history without resurrecting deleted Prompts, including failure and reopen", () => {
  const prompts = new PromptDB(database);
  const deleted = prompts.create({
    title: "Deleted",
    userPrompt: "Retained history",
  });
  const version = prompts.getVersions(deleted.id)[0];
  const relative = path.join("data", ".versions", deleted.id, "0001.md");
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const bytes =
    formatFrontmatter(versionFrontmatter(version)) +
    formatPromptBody(version.systemPrompt, version.userPrompt);
  fs.writeFileSync(file, bytes);
  prompts.delete(deleted.id);
  const survivor = prompts.create({ title: "Survivor", userPrompt: "Keep" });
  expect(() =>
    migrate((target) => {
      if (target.endsWith(".versions"))
        throw new Error("injected retirement failure");
    }),
  ).toThrow("injected retirement failure");
  expect(fs.readFileSync(file, "utf8")).toBe(bytes);
  expect(prompts.getAll()).toEqual([survivor]);
  migrate();
  const recovery = path.join(root, "recovery", "prompt-workspace-v1");
  const saved = path.join(recovery, fs.readdirSync(recovery)[0], relative);
  expect(fs.readFileSync(saved, "utf8")).toBe(bytes);
  expect(fs.existsSync(file)).toBe(false);
  for (let start = 0; start < 2; start += 1) {
    reopen();
    migrate();
    expect(new PromptDB(database).getAll()).toEqual([survivor]);
    expect(new PromptDB(database).getVersions(deleted.id)).toEqual([]);
    expect(fs.readFileSync(saved, "utf8")).toBe(bytes);
  }
});

it("imports both version locations without discarding history", () => {
  const file = writePrompt("historical", "Second body", "currentVersion: 2\n");
  const directory = path.join(path.dirname(file), "legacy");
  fs.mkdirSync(directory);
  fs.renameSync(file, path.join(directory, "prompt.md"));
  const locations = [
    path.join(directory, "versions"),
    path.join(root, "workspace", ".versions", "historical"),
  ];
  for (let index = 0; index < locations.length; index += 1) {
    fs.mkdirSync(locations[index], { recursive: true });
    fs.writeFileSync(
      path.join(locations[index], `000${index + 1}.md`),
      `---\nid: "version-${index}"\npromptId: "historical"\nversion: ${index + 1}\ncreatedAt: "${timestamp}"\n---\n<!-- PROMPTHUB:SYSTEM -->\n\n<!-- PROMPTHUB:USER -->\n${index === 0 ? "First body" : "Second body"}\n`,
    );
  }
  migrate();
  reopen();
  expect(
    new PromptDB(database)
      .getVersions("historical")
      .map((version) => version.userPrompt),
  ).toEqual(["Second body", "First body"]);
});

it("fails atomically for a missing parent, retaining the existing SQL row and source", () => {
  const survivor = new PromptDB(database).create({
    title: "Survivor",
    userPrompt: "keep",
  });
  const file = writePrompt(
    "historical",
    "body",
    'folderId: "missing-folder"\n',
  );
  expect(() => migrate()).toThrow(/folder/i);
  expect(fs.existsSync(file)).toBe(true);
  expect(new PromptDB(database).getAll()).toEqual([survivor]);
});

it("preserves nested folders, metadata and media references through the unified historical layout", () => {
  const file = writePrompt(
    "historical",
    "保留正文",
    'folderId: "child"\ntags: ["标签"]\nimages: ["nested/image.png"]\nnotes: "保留备注"\nisFavorite: true\n',
  );
  const data = path.join(root, "data");
  fs.renameSync(path.dirname(file), path.join(data, "prompts"));
  const folders = [
    {
      id: "child",
      name: "子目录",
      parentId: "parent",
      order: 0,
      isPrivate: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "parent",
      name: "目录",
      order: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
  fs.writeFileSync(path.join(data, "folders.json"), JSON.stringify(folders));
  migrate();
  reopen();
  expect(new FolderDB(database).getById("child")).toMatchObject(folders[0]);
  expect(new PromptDB(database).getById("historical")).toMatchObject({
    folderId: "child",
    tags: ["标签"],
    images: ["nested/image.png"],
    notes: "保留备注",
    isFavorite: true,
    userPrompt: "保留正文",
  });
});
