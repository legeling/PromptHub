import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DatabaseAdapter, SCHEMA } from "@prompthub/db";
import { SkillStorageDB } from "../src/skill-storage";
import { getManagedSkillPackagePath } from "../src/skill-storage-files";
import { PromptDB } from "../src/database";
import {
  configureRuntimePaths,
  resetRuntimePaths,
  writeRuntimeLayoutState,
} from "../src/runtime-paths";
import { writeCanonicalStorageAuthority } from "../src/canonical-storage-authority";

let root: string;
let db: DatabaseAdapter.Database;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-command-outcome-"));
  configureRuntimePaths({ userDataPath: root });
  writeRuntimeLayoutState(root);
  writeCanonicalStorageAuthority(root, {
    consistencyId: "c".repeat(64),
    operationId: "outcome-test",
  });
  db = new DatabaseAdapter(path.join(root, "data", "prompthub.db"));
  db.exec(SCHEMA);
  db.pragma("foreign_keys = ON");
});
afterEach(() => {
  vi.restoreAllMocks();
  db.close();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

it("joins an outer SQLite transaction and rolls back records and initial versions together", () => {
  expect(() =>
    db.transaction(() => {
      new PromptDB(db).create({ title: "Rolled back", userPrompt: "body" });
      throw new Error("fixture outer command failure");
    })(),
  ).toThrow(/outer command failure/);
  expect(db.all("SELECT id FROM prompts")).toEqual([]);
  expect(db.all("SELECT id FROM prompt_versions")).toEqual([]);
  expect(fs.existsSync(path.join(root, "data", "catalog.json"))).toBe(false);
});

it("keeps SQLite edits usable without a parallel JSON publication", () => {
  const prompts = new PromptDB(db);
  const created = prompts.create({
    title: "committed",
    userPrompt: "new content",
  });
  db.run(
    "UPDATE prompts SET user_prompt = ? WHERE id = ?",
    "SQL edit",
    created.id,
  );
  expect(prompts.update(created.id, { title: "Updated" })?.userPrompt).toBe(
    "SQL edit",
  );
  expect(fs.existsSync(path.join(root, "data", "catalog.json"))).toBe(false);
});

it("retains the previous SQL record and package when a directory replacement fails", () => {
  const skills = new SkillStorageDB(db);
  const created = skills.create({
    name: "outcome-skill",
    protocol_type: "skill",
    content: "old",
    is_favorite: false,
  });
  const workspace = getManagedSkillPackagePath(created.id);
  const rename = fs.renameSync.bind(fs);
  let failed = false;
  vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
    if (!failed && String(to) === workspace) {
      failed = true;
      throw new Error("workspace rename failed");
    }
    return rename(from, to);
  });
  expect(() => skills.update(created.id, { content: "new" })).toThrow(
    "workspace rename failed",
  );
  expect(skills.getById(created.id)).toEqual(created);
  expect(fs.readFileSync(path.join(workspace, "SKILL.md"), "utf8")).toBe("old");
  expect(skills.update(created.id, { content: "retried" })?.content).toBe(
    "retried",
  );
});
