import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseAdapter, SCHEMA } from "@prompthub/db";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  FolderDB,
  PromptDB,
  PromptOutputFormatDB,
  PromptRelationDB,
} from "../src/database";
import { writeCanonicalStorageAuthority } from "../src/canonical-storage-authority";
import {
  configureRuntimePaths,
  resetRuntimePaths,
  writeRuntimeLayoutState,
} from "../src/runtime-paths";

let root: string;
let database: DatabaseAdapter.Database;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-prompt-sql-"));
  configureRuntimePaths({ userDataPath: root });
  writeRuntimeLayoutState(root);
  writeCanonicalStorageAuthority(root, {
    consistencyId: "c".repeat(64),
    operationId: "sql-prompt-test",
  });
  database = new DatabaseAdapter(path.join(root, "data", "prompthub.db"));
  database.exec(SCHEMA);
  database.pragma("foreign_keys = ON");
});
afterEach(() => {
  database.close();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

it("persists CRUD, history and relationships directly in SQLite and reopens without JSON catalogs", () => {
  const folders = new FolderDB(database);
  const prompts = new PromptDB(database);
  const folder = folders.create({ name: "Writing" });
  const first = prompts.create({
    title: "First",
    userPrompt: "Draft",
    folderId: folder.id,
    tags: ["writing"],
  });
  const second = prompts.create({ title: "Second", userPrompt: "Review" });
  folders.update(folder.id, { name: "Updated folder" });
  prompts.update(first.id, { userPrompt: "Revised" });
  const relation = new PromptRelationDB(database).create({
    sourcePromptId: first.id,
    targetPromptId: second.id,
    kind: "depends_on",
  });
  const format = new PromptOutputFormatDB(database).create({
    sourcePromptId: first.id,
    targetPromptId: second.id,
  });
  database.close();
  database = new DatabaseAdapter(path.join(root, "data", "prompthub.db"));
  database.pragma("foreign_keys = ON");
  expect(new PromptDB(database).getById(first.id)?.userPrompt).toBe("Revised");
  expect(
    new PromptDB(database)
      .getVersions(first.id)
      .map((version) => version.userPrompt),
  ).toEqual(["Revised", "Draft"]);
  expect(new FolderDB(database).getAll()[0].name).toBe("Updated folder");
  expect(new PromptRelationDB(database).list()).toEqual([relation]);
  expect(new PromptOutputFormatDB(database).list()).toEqual([format]);
  new PromptDB(database).delete(second.id);
  expect(new PromptRelationDB(database).list()).toEqual([]);
  expect(database.pragma("foreign_key_check")).toEqual([]);
  expect(fs.existsSync(path.join(root, "data", "catalog.json"))).toBe(false);
  expect(fs.existsSync(path.join(root, "data", "prompts"))).toBe(false);
});
