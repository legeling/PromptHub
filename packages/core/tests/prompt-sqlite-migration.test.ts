import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DatabaseAdapter,
  FolderDB,
  PromptDB,
  PromptRelationDB,
  PromptOutputFormatDB,
  SCHEMA,
  initDatabase,
  closeDatabase,
} from "@prompthub/db";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { recoverStorageEntryPublications } from "../src/sqlite-entry-publication";
import {
  collectPromptCanonicalGraph,
  materializePromptCanonicalGraph,
} from "../src/prompt-canonical-export";
import { readPromptCanonicalGraph } from "../src/prompt-canonical-import";
import { migratePromptSqliteV1 } from "../src/migrations/prompt-sqlite-v1";
import {
  resolveRuntimeStorageContext,
  writeRuntimeLayoutState,
} from "../src/runtime-storage-context";
import { writeCanonicalStorageAuthority } from "../src/canonical-storage-authority";

let root: string;
let database: DatabaseAdapter.Database;
let databasePath: string;
let original: ReturnType<typeof collectPromptCanonicalGraph>;

function graph() {
  return collectPromptCanonicalGraph(
    new PromptDB(database),
    new FolderDB(database),
    database,
  );
}

function migrate(injectFailure?: (target: string) => void) {
  return migratePromptSqliteV1(database, {
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
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-prompt-sqlite-"));
  const source = new DatabaseAdapter(":memory:");
  try {
    source.exec(SCHEMA);
    const folders = new FolderDB(source);
    const parent = folders.create({ name: "保留目录" });
    const child = folders.create({ name: "Nested", parentId: parent.id });
    const prompts = new PromptDB(source);
    const first = prompts.create({
      title: "保留 Prompt",
      userPrompt: "Version one",
      folderId: child.id,
      images: ["nested/cover.png"],
    });
    prompts.update(first.id, {
      userPrompt: "Version two",
      notes: "annotation",
      isFavorite: true,
    });
    const second = prompts.create({
      title: "Second",
      userPrompt: "body",
      parentId: first.id,
    });
    new PromptRelationDB(source).create({
      sourcePromptId: first.id,
      targetPromptId: second.id,
      kind: "depends_on",
    });
    new PromptOutputFormatDB(source).create({
      sourcePromptId: first.id,
      targetPromptId: second.id,
    });
    original = collectPromptCanonicalGraph(prompts, folders, source);
    const image = path.join(root, "source.png");
    fs.writeFileSync(image, Buffer.from([0, 1, 127, 255]));
    materializePromptCanonicalGraph(path.join(root, "data"), original, {
      resolveMediaSource: () => image,
    });
    fs.rmSync(image);
  } finally {
    source.close();
  }
  writeRuntimeLayoutState(root);
  writeCanonicalStorageAuthority(root, {
    consistencyId: "b".repeat(64),
    operationId: "prompt-migration-fixture",
  });
  databasePath = path.join(root, "data", "prompthub.db");
  initDatabase(databasePath);
  closeDatabase();
  database = new DatabaseAdapter(databasePath);
  database.pragma("foreign_keys = ON");
});

afterEach(() => {
  vi.restoreAllMocks();
  database.close();
  fs.rmSync(root, { recursive: true, force: true });
});

it("recovers a committed graph when the file commit marker fails without restoring retired sources", () => {
  const rename = fs.renameSync.bind(fs);
  const fault = vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
    if (
      String(to).endsWith("prompt-sqlite-v1-publication.json") &&
      JSON.parse(fs.readFileSync(from, "utf8")).state === "committed"
    )
      throw new Error("injected commit journal failure");
    return rename(from, to);
  });
  expect(() => migrate()).toThrow(/outcome is unknown/);
  fault.mockRestore();
  reopen();
  expect(recoverStorageEntryPublications(root)).toEqual([
    { operationKey: "prompt-sqlite-v1", status: "committed" },
  ]);
  expect(graph()).toEqual(original);
  expect(fs.existsSync(path.join(root, "data", "catalog.json"))).toBe(false);
  migrate();
  expect(graph()).toEqual(original);
});

it("preserves the complete graph, SQL-only rows and media, then edits/deletes/reopens without file replay", () => {
  const sqlOnly = new PromptDB(database).create({
    title: "SQL only",
    userPrompt: "keep",
  });
  migrate();
  for (const prompt of original.prompts) {
    expect(new PromptDB(database).getById(prompt.id)).toEqual(prompt);
  }
  for (const version of original.promptVersions) {
    expect(
      graph().promptVersions.find((entry) => entry.id === version.id),
    ).toEqual(version);
  }
  expect(graph().prompts).toHaveLength(original.prompts.length + 1);
  expect(graph().promptVersions).toHaveLength(
    original.promptVersions.length + 1,
  );
  expect(graph().promptRelations).toEqual(original.promptRelations);
  expect(graph().outputFormatItems).toEqual(original.outputFormatItems);
  expect(new PromptDB(database).getById(sqlOnly.id)).toEqual(sqlOnly);
  const context = resolveRuntimeStorageContext(root);
  expect(
    fs.readFileSync(path.join(context.imagesPath, "nested", "cover.png")),
  ).toEqual(Buffer.from([0, 1, 127, 255]));
  expect(fs.existsSync(path.join(root, "data", "catalog.json"))).toBe(false);
  expect(fs.existsSync(path.join(root, "data", "prompts"))).toBe(false);
  const recoveries = fs.readdirSync(
    path.join(root, "recovery", "prompt-sqlite-v1"),
  );
  const recovery = path.join(
    root,
    "recovery",
    "prompt-sqlite-v1",
    recoveries[0],
  );
  expect(
    readPromptCanonicalGraph(recovery)
      .snapshot.prompts.map((p) => p.id)
      .sort(),
  ).toEqual(original.prompts.map((p) => p.id).sort());
  const edited = original.prompts[0];
  const deleted = original.prompts[1];
  new PromptDB(database).update(edited.id, { title: "SQLite edit" });
  new PromptDB(database).delete(deleted.id);
  reopen();
  migrate();
  expect(new PromptDB(database).getById(edited.id)?.title).toBe("SQLite edit");
  expect(new PromptDB(database).getById(deleted.id)).toBeNull();
  expect(database.pragma("foreign_key_check")).toEqual([]);
});

it("rejects a same-ID conflict without changing either graph or recording completion", () => {
  const prompt = original.prompts[0];
  new PromptDB(database).insertPromptDirect({
    ...prompt,
    folderId: null,
    parentId: null,
    title: "Distinct SQL content",
  });
  const before = graph();
  expect(() => migrate()).toThrow(/migration conflict/i);
  expect(graph()).toEqual(before);
  expect(
    readPromptCanonicalGraph(path.join(root, "data")).snapshot.prompts,
  ).toHaveLength(original.prompts.length);
  expect(
    database.get(
      "SELECT name FROM schema_migrations WHERE name = ?",
      "prompt-sqlite-v1",
    ),
  ).toBeNull();
});

it("rolls back publication failure, preserves history/media, and succeeds on retry", () => {
  const before = graph();
  expect(() =>
    migrate((target) => {
      if (target === path.join(root, "data", "catalog.json"))
        throw new Error("fixture publication failure");
    }),
  ).toThrow(/fixture publication failure/);
  expect(graph()).toEqual(before);
  expect(
    readPromptCanonicalGraph(path.join(root, "data")).snapshot.promptVersions,
  ).toHaveLength(original.promptVersions.length);
  reopen();
  migrate();
  expect(graph().promptVersions).toHaveLength(original.promptVersions.length);
  expect(fs.existsSync(path.join(root, "data", "catalog.json"))).toBe(false);
});

it("refuses a conflicting existing media file and an unsafe destination before retirement", () => {
  const images = resolveRuntimeStorageContext(root).imagesPath;
  fs.mkdirSync(path.join(images, "nested"), { recursive: true });
  const image = path.join(images, "nested", "cover.png");
  fs.writeFileSync(image, "different");
  expect(() => migrate()).toThrow(/media.*conflict/i);
  expect(fs.readFileSync(image, "utf8")).toBe("different");
  expect(graph().prompts).toEqual([]);
  fs.rmSync(path.join(images, "nested"), { recursive: true });
  const outside = path.join(root, "outside");
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(images, "nested"));
  expect(() => migrate()).toThrow(/symbolic|symlink|unsafe/i);
  expect(fs.readdirSync(outside)).toEqual([]);
  expect(fs.existsSync(path.join(root, "data", "catalog.json"))).toBe(true);
});

it("does not resurrect a retired ID if an old writer republishes the historical graph", () => {
  migrate();
  const id = original.prompts[0].id;
  new PromptDB(database).delete(id);
  const recoveryRoot = path.join(root, "recovery", "prompt-sqlite-v1");
  const recovery = path.join(recoveryRoot, fs.readdirSync(recoveryRoot)[0]);
  for (const name of [
    "prompts",
    "folders",
    "tags",
    "relations",
    "output-formats",
    "catalog.json",
  ]) {
    const source = path.join(recovery, name);
    if (fs.existsSync(source))
      fs.cpSync(source, path.join(root, "data", name), { recursive: true });
  }
  expect(() => migrate()).toThrow(/retired|after.*migration/i);
  expect(new PromptDB(database).getById(id)).toBeNull();
});

it("rolls back file retirement when the SQL transaction fails and retries from the same sources", () => {
  database.exec(
    "CREATE TRIGGER fixture_insert_failure BEFORE INSERT ON prompts BEGIN SELECT RAISE(ABORT, 'fixture SQL insert failure'); END",
  );
  expect(() => migrate()).toThrow(/fixture SQL insert failure/);
  expect(graph().prompts).toEqual([]);
  expect(
    readPromptCanonicalGraph(path.join(root, "data")).snapshot.promptVersions,
  ).toHaveLength(original.promptVersions.length);
  expect(
    database.get(
      "SELECT name FROM schema_migrations WHERE name = ?",
      "prompt-sqlite-v1",
    ),
  ).toBeNull();
  database.exec("DROP TRIGGER fixture_insert_failure");
  migrate();
  expect(graph().prompts).toHaveLength(original.prompts.length);
});

it("retires an identical explicit archive projection without replaying rows or duplicating history", () => {
  migrate();
  const before = graph();
  const recoveryRoot = path.join(root, "recovery", "prompt-sqlite-v1");
  const recovery = path.join(recoveryRoot, fs.readdirSync(recoveryRoot)[0]);
  for (const name of [
    "prompts",
    "folders",
    "tags",
    "relations",
    "output-formats",
    "catalog.json",
  ]) {
    const source = path.join(recovery, name);
    if (fs.existsSync(source))
      fs.cpSync(source, path.join(root, "data", name), { recursive: true });
  }
  migrate();
  reopen();
  expect(graph()).toEqual(before);
  expect(fs.existsSync(path.join(root, "data", "catalog.json"))).toBe(false);
  expect(fs.readdirSync(recoveryRoot)).toHaveLength(1);
});
