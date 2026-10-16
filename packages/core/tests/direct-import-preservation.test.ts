import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  FolderDB,
  PromptDB,
  PromptOutputFormatDB,
  PromptRelationDB,
} from "@prompthub/db";
import { closeDatabase, initDatabase, SkillDB } from "../src/database";
import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-direct-import-"));
  configureRuntimePaths({ userDataPath: root });
});
afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});
function repositories() {
  const database = initDatabase();
  return {
    database,
    folders: new FolderDB(database),
    prompts: new PromptDB(database),
    relations: new PromptRelationDB(database),
    formats: new PromptOutputFormatDB(database),
    skills: new SkillDB(database),
  };
}

it("updates a Prompt by stable ID without losing history, children, graph edges or FTS", () => {
  const { prompts, relations, formats } = repositories();
  const parent = prompts.create({ title: "Originaltoken", userPrompt: "Body" });
  const child = prompts.create({
    title: "Child",
    userPrompt: "Child body",
    parentId: parent.id,
  });
  const versions = prompts.getVersions(parent.id);
  const edge = relations.create({
    sourcePromptId: parent.id,
    targetPromptId: child.id,
    kind: "depends_on",
  });
  const output = formats.create({
    sourcePromptId: child.id,
    targetPromptId: parent.id,
  });
  prompts.insertPromptDirect({ ...parent, title: "Updatedtoken" });
  expect(prompts.getVersions(parent.id)).toEqual(versions);
  closeDatabase();
  const persisted = repositories();
  expect(persisted.prompts.getById(parent.id)?.title).toBe("Updatedtoken");
  expect(persisted.prompts.getById(child.id)?.parentId).toBe(parent.id);
  expect(persisted.prompts.getVersions(parent.id)).toEqual(versions);
  expect(persisted.relations.getById(edge.id)).toEqual(edge);
  expect(persisted.formats.getById(output.id)).toEqual(output);
  expect(
    persisted.prompts
      .search({ keyword: "Updatedtoken" })
      .map((item) => item.id),
  ).toEqual([parent.id]);
  expect(persisted.prompts.search({ keyword: "Originaltoken" })).toEqual([]);
});

it("updates a Folder without cascading into descendants or clearing Prompt placement", () => {
  const { folders, prompts } = repositories();
  const parent = folders.create({ name: "Parent" });
  const child = folders.create({ name: "Child", parentId: parent.id });
  const prompt = prompts.create({
    title: "Nested",
    userPrompt: "Body",
    folderId: child.id,
  });
  const direct = prompts.create({
    title: "Direct",
    userPrompt: "Body",
    folderId: parent.id,
  });
  folders.insertFolderDirect({ ...parent, name: "Renamed" });
  closeDatabase();
  const persisted = repositories();
  expect(persisted.folders.getById(parent.id)?.name).toBe("Renamed");
  expect(persisted.folders.getById(child.id)).toEqual(child);
  expect(persisted.prompts.getById(prompt.id)?.folderId).toBe(child.id);
  expect(persisted.prompts.getById(direct.id)?.folderId).toBe(parent.id);
  persisted.folders.delete(parent.id);
  expect(persisted.folders.getById(child.id)).toBeNull();
  expect(persisted.prompts.getById(prompt.id)?.folderId).toBeNull();
});

it("preserves Skill versions when importing an existing stable identity", () => {
  const { skills } = repositories();
  const skill = skills.create({
    name: "History Skill",
    content: "# First",
    protocol_type: "skill",
    is_favorite: false,
  });
  skills.createVersion(skill.id, "Initial package", [
    { relativePath: "SKILL.md", content: "# First" },
  ]);
  skills.update(skill.id, { content: "# Second" });
  skills.createVersion(skill.id, "Updated package", [
    { relativePath: "SKILL.md", content: "# Second" },
    { relativePath: "scripts/task.ts", content: "export const value = 1;" },
  ]);
  const current = skills.getById(skill.id);
  if (!current) throw new Error("Test Skill was not persisted");
  const versions = skills.getVersions(skill.id);
  expect(versions).toHaveLength(2);
  skills.insertSkillDirect({ ...current, description: "Updated metadata" });
  closeDatabase();
  const persisted = repositories().skills;
  expect(persisted.getById(skill.id)?.description).toBe("Updated metadata");
  expect(persisted.getVersions(skill.id)).toEqual(versions);
});

it("rejects a conflicting Skill source identity without deleting either Skill or its history", () => {
  const { skills } = repositories();
  const first = skills.create({
    name: "First",
    content: "# First",
    protocol_type: "skill",
    is_favorite: false,
    source_id: "fixture-source",
  });
  const second = skills.create({
    name: "Second",
    content: "# Second",
    protocol_type: "skill",
    is_favorite: false,
  });
  skills.createVersion(first.id, "Preserved history");
  const original = skills.getById(first.id);
  const history = skills.getVersions(first.id);
  expect(history).toHaveLength(1);
  expect(() =>
    skills.insertSkillDirect({ ...second, source_id: first.source_id }),
  ).toThrow();
  closeDatabase();
  const persisted = repositories().skills;
  expect(persisted.getById(first.id)).toEqual(original);
  expect(persisted.getById(second.id)).toEqual(second);
  expect(persisted.getVersions(first.id)).toEqual(history);
});

it("rolls back a direct import batch when an updated row violates its foreign key", () => {
  const { database, folders, prompts } = repositories();
  const folder = folders.create({ name: "Preserved" });
  const prompt = prompts.create({
    title: "Preserved",
    userPrompt: "Body",
    folderId: folder.id,
  });
  const versions = prompts.getVersions(prompt.id);
  expect(() =>
    database.transaction(() => {
      folders.insertFolderDirect({ ...folder, name: "Uncommitted" });
      prompts.insertPromptDirect({ ...prompt, folderId: "missing-folder" });
    })(),
  ).toThrow();
  closeDatabase();
  const persisted = repositories();
  expect(persisted.folders.getById(folder.id)).toEqual(folder);
  expect(persisted.prompts.getById(prompt.id)).toEqual(prompt);
  expect(persisted.prompts.getVersions(prompt.id)).toEqual(versions);
});
