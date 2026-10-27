import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  initDatabase,
  closeDatabase,
  PromptDB,
  FolderDB,
  PromptRelationDB,
  PromptOutputFormatDB,
  type DatabaseAdapter,
} from "@prompthub/db";
import type { LegacyIndexedDbSnapshot } from "@prompthub/shared/types/indexeddb-migration";
import { migrateIndexedDbSnapshot } from "../src/migrations/indexeddb-prompts-v1";

let root: string;
let database: DatabaseAdapter.Database;
let databasePath: string;
const timestamp = "2026-04-21T00:00:00Z";
function source(): LegacyIndexedDbSnapshot {
  return {
    folders: [
      {
        id: "folder",
        name: "旧目录",
        order: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    prompts: [
      {
        id: "legacy",
        title: "旧提示词",
        userPrompt: "原始正文\n",
        folderId: "folder",
        variables: [],
        tags: ["历史"],
        isFavorite: false,
        isPinned: false,
        currentVersion: 1,
        version: 1,
        usageCount: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    versions: [
      {
        id: "version",
        promptId: "legacy",
        version: 1,
        userPrompt: "原始正文\n",
        variables: [],
        createdAt: timestamp,
      },
    ],
  };
}
function run(
  snapshot = source(),
  resolution?: Parameters<typeof migrateIndexedDbSnapshot>[2]["resolution"],
) {
  return migrateIndexedDbSnapshot(database, snapshot, {
    rootPath: root,
    databasePath,
    resolution,
  });
}
function seed(snapshot = source()): void {
  const prompts = new PromptDB(database);
  const folders = new FolderDB(database);
  for (const folder of snapshot.folders) folders.insertFolderDirect(folder);
  for (const prompt of snapshot.prompts) prompts.insertPromptDirect(prompt);
  for (const version of snapshot.versions) prompts.insertVersionDirect(version);
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-idb-247-"));
  databasePath = path.join(root, "data", "prompthub.db");
  database = initDatabase(databasePath);
});
afterEach(() => {
  closeDatabase();
  fs.rmSync(root, { recursive: true, force: true });
});

it("#247 imports into a nonempty database, preserves current rows and survives reopen", () => {
  const current = new PromptDB(database).create({
    title: "Current",
    userPrompt: "Do not replace",
  });
  const result = run();
  expect(result).toMatchObject({
    status: "completed",
    imported: true,
    promptCount: 1,
    folderCount: 1,
    versionCount: 1,
  });
  expect(new PromptDB(database).getById(current.id)).toEqual(current);
  expect(new PromptDB(database).getById("legacy")?.userPrompt).toBe(
    "原始正文\n",
  );
  if (result.status !== "completed" || !result.recoveryPath)
    throw new Error("Missing recovery snapshot");
  expect(
    JSON.parse(
      fs.readFileSync(path.join(result.recoveryPath, "source.json"), "utf8"),
    ),
  ).toEqual(source());
  closeDatabase();
  database = initDatabase(databasePath);
  expect(run()).toMatchObject({ status: "completed", imported: false });
  expect(new PromptDB(database).getAll()).toHaveLength(2);
  new PromptDB(database).delete("legacy");
  expect(run()).toMatchObject({ status: "completed", imported: false });
  expect(new PromptDB(database).getById("legacy")).toBeNull();
});

it("#247 accepts SQL-normalized dates and fills missing history without overwriting current data", () => {
  seed({ ...source(), versions: [] });
  const before = new PromptDB(database).getById("legacy");
  expect(run()).toMatchObject({ status: "completed", imported: true });
  expect(new PromptDB(database).getById("legacy")).toEqual(before);
  expect(new PromptDB(database).getVersions("legacy")).toHaveLength(1);
});

it.each(["database", "indexeddb"] as const)(
  "reviews real conflicts and applies the explicit %s choice with both sources preserved",
  (choice) => {
    seed();
    new PromptDB(database).update("legacy", { userPrompt: "Current edit" });
    const result = run();
    expect(result.status).toBe("conflict");
    if (result.status !== "conflict") throw new Error("Conflict missing");
    expect(
      result.review.conflicts.some((conflict) =>
        conflict.differingFields.includes("userPrompt"),
      ),
    ).toBe(true);
    expect(new PromptDB(database).getById("legacy")?.userPrompt).toBe(
      "Current edit",
    );
    const resolved = run(source(), {
      fingerprint: result.review.fingerprint,
      choices: result.review.conflicts.map(({ key }) => ({
        key,
        source: choice,
      })),
    });
    expect(resolved.status).toBe("completed");
    if (resolved.status !== "completed" || !resolved.recoveryPath)
      throw new Error("Missing recovery snapshot");
    const archived = JSON.parse(
      fs.readFileSync(path.join(resolved.recoveryPath, "current.json"), "utf8"),
    );
    expect(
      archived.prompts.find((prompt: { id: string }) => prompt.id === "legacy")
        .userPrompt,
    ).toBe("Current edit");
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(resolved.recoveryPath, "source.json"),
          "utf8",
        ),
      ),
    ).toEqual(source());
    expect(new PromptDB(database).getById("legacy")?.userPrompt).toBe(
      choice === "database" ? "Current edit" : "原始正文\n",
    );
    closeDatabase();
    database = initDatabase(databasePath);
    expect(run().status).toBe("completed");
  },
);

it("rejects stale or incomplete conflict resolutions before writing", () => {
  seed();
  new PromptDB(database).update("legacy", { title: "Edited" });
  const result = run();
  if (result.status !== "conflict") throw new Error("Conflict missing");
  expect(() =>
    run(source(), { fingerprint: result.review.fingerprint, choices: [] }),
  ).toThrow(/choice/i);
  new PromptDB(database).update("legacy", { title: "Edited again" });
  expect(() =>
    run(source(), {
      fingerprint: result.review.fingerprint,
      choices: result.review.conflicts.map(({ key }) => ({
        key,
        source: "indexeddb",
      })),
    }),
  ).toThrow(/changed/i);
  expect(new PromptDB(database).getById("legacy")?.title).toBe("Edited again");
});

it("preserves current relations and output-format references while resolving a prompt conflict", () => {
  seed();
  const target = new PromptDB(database).create({
    title: "Target",
    userPrompt: "Target content",
  });
  const relations = new PromptRelationDB(database);
  const formats = new PromptOutputFormatDB(database);
  const relation = relations.create({
    sourcePromptId: "legacy",
    targetPromptId: target.id,
    kind: "next_step",
  });
  const format = formats.create({
    sourcePromptId: "legacy",
    targetPromptId: target.id,
    sortOrder: 0,
  });
  const snapshot = source();
  snapshot.prompts[0].title = "Historical edit";
  const review = run(snapshot);
  if (review.status !== "conflict") throw new Error("Missing conflict");
  run(snapshot, {
    fingerprint: review.review.fingerprint,
    choices: review.review.conflicts.map(({ key }) => ({
      key,
      source: "indexeddb",
    })),
  });
  closeDatabase();
  database = initDatabase(databasePath);
  expect(new PromptRelationDB(database).list()).toEqual([relation]);
  expect(new PromptOutputFormatDB(database).list()).toEqual([format]);
  expect(new PromptDB(database).getById(target.id)).toEqual(target);
});

it("recognizes already converted data without reporting a content conflict", () => {
  seed();
  expect(run()).toMatchObject({ status: "completed", imported: false });
  expect(new PromptDB(database).getVersions("legacy")).toHaveLength(1);
});

it("archives an empty historical database and completes once", () => {
  expect(run({ prompts: [], folders: [], versions: [] })).toMatchObject({
    status: "completed",
    imported: false,
  });
  expect(run()).toMatchObject({ status: "completed", imported: false });
  expect(new PromptDB(database).getAll()).toEqual([]);
});

it("does not write data or a completion receipt when snapshot publication fails", () => {
  expect(() =>
    migrateIndexedDbSnapshot(database, source(), {
      rootPath: root,
      databasePath,
      injectFailure: () => {
        throw new Error("fixture publication failure");
      },
    }),
  ).toThrow("fixture publication failure");
  expect(new PromptDB(database).getAll()).toEqual([]);
  expect(
    database.get(
      "SELECT name FROM schema_migrations WHERE name = ?",
      "indexeddb-prompts-v1",
    ),
  ).toBeNull();
  expect(run()).toMatchObject({ status: "completed", imported: true });
});

it("refuses a symbolic-link archive directory without touching the linked target", () => {
  const outside = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-idb-outside-"),
  );
  try {
    fs.symlinkSync(outside, path.join(root, "recovery"), "junction");
    expect(() => run()).toThrow();
    expect(fs.readdirSync(outside)).toEqual([]);
    expect(new PromptDB(database).getAll()).toEqual([]);
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

it("rolls back failed writes and retries without duplicates", () => {
  database.exec(
    "CREATE TRIGGER fail_idb BEFORE INSERT ON prompts BEGIN SELECT RAISE(ABORT, 'fixture write failure'); END",
  );
  expect(() => run()).toThrow(/fixture write failure/);
  expect(new FolderDB(database).getAll()).toEqual([]);
  expect(new PromptDB(database).getAll()).toEqual([]);
  database.exec("DROP TRIGGER fail_idb");
  expect(run()).toMatchObject({ status: "completed", imported: true });
  expect(new PromptDB(database).getAll()).toHaveLength(1);
});

it("rolls back content and the receipt when SQL readback detects a changed version note", () => {
  database.exec(
    "CREATE TRIGGER corrupt_idb AFTER INSERT ON prompt_versions BEGIN UPDATE prompt_versions SET note = 'unexpected note' WHERE id = NEW.id; END",
  );
  expect(() => run()).toThrow(
    "Prompt version import conflicts with stored history: version",
  );
  expect(new PromptDB(database).getAll()).toEqual([]);
  expect(new FolderDB(database).getAll()).toEqual([]);
  expect(
    database.get(
      "SELECT name FROM schema_migrations WHERE name = ?",
      "indexeddb-prompts-v1",
    ),
  ).toBeNull();
  database.exec("DROP TRIGGER corrupt_idb");
  expect(run()).toMatchObject({ status: "completed", imported: true });
});

it("verifies the complete graph after writes and rolls back a changed folder", () => {
  database.exec(
    "CREATE TRIGGER corrupt_folder AFTER INSERT ON folders BEGIN UPDATE folders SET name = 'unexpected name' WHERE id = NEW.id; END",
  );
  expect(() => run()).toThrow("IndexedDB migration verification failed");
  expect(new PromptDB(database).getAll()).toEqual([]);
  expect(new FolderDB(database).getAll()).toEqual([]);
  database.exec("DROP TRIGGER corrupt_folder");
  expect(run()).toMatchObject({ status: "completed", imported: true });
});

it.each([null, {}, { prompts: [], folders: [], versions: null }])(
  "rejects malformed snapshot %j at the write boundary",
  (snapshot) => {
    expect(() =>
      migrateIndexedDbSnapshot(database, snapshot, {
        rootPath: root,
        databasePath,
      }),
    ).toThrow();
    expect(new PromptDB(database).getAll()).toEqual([]);
  },
);

it("preserves current-only fields and independent version choices", () => {
  seed();
  new PromptDB(database).update("legacy", {
    notes: "Current notes",
    userPrompt: "Current edit",
  });
  const snapshot = source();
  snapshot.folders[0].name = "Historical folder edit";
  snapshot.versions[0].userPrompt = "Different historical version";
  const review = run(snapshot);
  if (review.status !== "conflict") throw new Error("Missing conflict");
  expect(review.review.conflicts.map(({ kind }) => kind).sort()).toEqual([
    "folder",
    "prompt",
    "version",
  ]);
  const promptConflict = review.review.conflicts.find(
    ({ kind }) => kind === "prompt",
  )!;
  expect(Object.keys(promptConflict.variants[0].fields!)[0]).toBe(
    promptConflict.differingFields[0],
  );
  expect(
    run(snapshot, {
      fingerprint: review.review.fingerprint,
      choices: review.review.conflicts.map(({ key, kind }) => ({
        key,
        source: kind === "version" ? "database" : "indexeddb",
      })),
    }).status,
  ).toBe("completed");
  const prompt = new PromptDB(database).getById("legacy");
  expect(prompt?.userPrompt).toBe("原始正文\n");
  expect(prompt?.notes).toBe("Current notes");
  expect(new FolderDB(database).getById("folder")?.name).toBe(
    "Historical folder edit",
  );
  expect(
    new PromptDB(database)
      .getVersions("legacy")
      .map(({ userPrompt }) => userPrompt),
  ).toEqual(["原始正文\n", "Current edit", "原始正文\n"]);
});

it("rejects a changed source and invalid choices without mutating current content", () => {
  seed();
  new PromptDB(database).update("legacy", { userPrompt: "Current edit" });
  const review = run();
  if (review.status !== "conflict") throw new Error("Missing conflict");
  const resolution = {
    fingerprint: review.review.fingerprint,
    choices: review.review.conflicts.map(({ key }) => ({
      key,
      source: "database" as const,
    })),
  };
  const changed = source();
  changed.prompts[0].userPrompt = "Changed while reviewing";
  expect(() => run(changed, resolution)).toThrow(/changed/i);
  expect(() =>
    run(source(), {
      ...resolution,
      choices: [...resolution.choices, resolution.choices[0]],
    }),
  ).toThrow(/duplicate/i);
  expect(() =>
    run(source(), {
      ...resolution,
      choices: [{ key: resolution.choices[0].key, source: "workspace" }],
    }),
  ).toThrow(/invalid/i);
  expect(new PromptDB(database).getById("legacy")?.userPrompt).toBe(
    "Current edit",
  );
});

it("measures a populated historical library and verifies every body and version after reopen", () => {
  const promptCount = 500;
  const versionsPerPrompt = 3;
  const base = source();
  const snapshot: LegacyIndexedDbSnapshot = {
    folders: base.folders,
    prompts: Array.from({ length: promptCount }, (_, index) => ({
      ...base.prompts[0],
      id: `legacy-${index}`,
      currentVersion: versionsPerPrompt,
      version: versionsPerPrompt,
      userPrompt: `Body ${index} revision ${versionsPerPrompt} 中文 🚀\n`,
    })),
    versions: Array.from(
      { length: promptCount * versionsPerPrompt },
      (_, index) => {
        const owner = Math.floor(index / versionsPerPrompt);
        const version = (index % versionsPerPrompt) + 1;
        return {
          ...base.versions[0],
          id: `version-${index}`,
          promptId: `legacy-${owner}`,
          version,
          userPrompt: `Body ${owner} revision ${version} 中文 🚀\n`,
        };
      },
    ),
  };
  const started = performance.now();
  expect(run(snapshot)).toMatchObject({
    status: "completed",
    promptCount,
    versionCount: snapshot.versions.length,
  });
  const elapsedMs = Math.round(performance.now() - started);
  closeDatabase();
  database = initDatabase(databasePath);
  const prompts = new PromptDB(database);
  expect(prompts.getAll()).toHaveLength(promptCount);
  for (const record of snapshot.prompts) {
    expect(prompts.getById(record.id)?.userPrompt).toBe(record.userPrompt);
    expect(prompts.getVersions(record.id)).toHaveLength(versionsPerPrompt);
  }
  console.info(
    JSON.stringify({
      scenario: "indexeddb-247",
      promptCount,
      versionCount: snapshot.versions.length,
      elapsedMs,
    }),
  );
});

it.each([
  "duplicate",
  "missing-parent",
  "cycle",
  "orphan-version",
  "null-byte",
  "bad-date",
  "duplicate-version-slot",
  "invalid-title",
  "invalid-array",
  "invalid-boolean",
  "invalid-version",
])("rejects malformed %s data without changing SQLite", (scenario) => {
  const snapshot = source();
  if (scenario === "duplicate") snapshot.prompts.push(snapshot.prompts[0]);
  if (scenario === "missing-parent") snapshot.folders[0].parentId = "missing";
  if (scenario === "cycle") snapshot.folders[0].parentId = "folder";
  if (scenario === "orphan-version") snapshot.versions[0].promptId = "missing";
  if (scenario === "null-byte") snapshot.prompts[0].userPrompt = "bad\0text";
  if (scenario === "bad-date") snapshot.prompts[0].createdAt = "invalid";
  if (scenario === "duplicate-version-slot")
    snapshot.versions.push({ ...snapshot.versions[0], id: "another-version" });
  if (scenario === "invalid-title")
    Reflect.set(snapshot.prompts[0], "title", 42);
  if (scenario === "invalid-array")
    Reflect.set(snapshot.prompts[0], "tags", "invalid");
  if (scenario === "invalid-boolean")
    Reflect.set(snapshot.prompts[0], "isFavorite", "false");
  if (scenario === "invalid-version")
    Reflect.set(snapshot.versions[0], "version", "1");
  expect(() => run(snapshot)).toThrow();
  expect(new PromptDB(database).getAll()).toEqual([]);
  expect(new FolderDB(database).getAll()).toEqual([]);
});
