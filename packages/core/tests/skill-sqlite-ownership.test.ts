import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { closeDatabase, initDatabase, SkillDB } from "../src/database";
import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";
import {
  createLibrarySkill,
  prepareLibrarySkillEdit,
} from "../src/skills/library-commands";
import { mutateSkillPackage } from "../src/skills/package-mutation";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-skill-sqlite-"));
  configureRuntimePaths({ userDataPath: root });
});
afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

it("saves package bytes and SQL metadata without a live JSON bundle or cache copy, then reopens and deletes", async () => {
  const skills = new SkillDB(initDatabase());
  const created = await createLibrarySkill(skills, {
    name: "sqlite-skill",
    protocol_type: "skill",
    is_favorite: false,
    content: "---\nname: sqlite-skill\nlicense: MIT\n---\nOriginal",
  });
  const directory = path.join(root, "data", "skills", created.id, "files");
  expect(created.local_repo_path).toBe(directory);
  await mutateSkillPackage(skills, created.id, {
    kind: "write",
    relativePath: "scripts/binary.bin",
    content: Buffer.from([0, 255, 128]),
  });
  const edit = await prepareLibrarySkillEdit(skills, created.id, {
    instructions: "Revised",
    tags: ["mine"],
  });
  if (!edit) throw new Error("Fixture Skill was not created");
  try {
    edit.commit();
  } finally {
    await edit.dispose();
  }
  const before = skills.getById(created.id);
  const versions = skills.getVersions(created.id);
  expect(before?.content).toContain("Revised");
  expect(
    versions
      .at(0)
      ?.filesSnapshot?.find((file) => file.relativePath === "SKILL.md")
      ?.content,
  ).toContain("Original");
  expect(
    fs.readFileSync(path.join(directory, "scripts", "binary.bin")),
  ).toEqual(Buffer.from([0, 255, 128]));
  expect(
    fs.existsSync(path.join(root, "data", "skills", created.id, "skill.json")),
  ).toBe(false);
  expect(
    fs.existsSync(path.join(root, "cache", "skill-workspaces", created.id)),
  ).toBe(false);
  closeDatabase();
  const reopened = new SkillDB(initDatabase());
  expect(reopened.getById(created.id)).toEqual(before);
  expect(reopened.getVersions(created.id)).toEqual(versions);
  expect(reopened.delete(created.id)).toBe(true);
  expect(fs.existsSync(directory)).toBe(false);
  closeDatabase();
  expect(new SkillDB(initDatabase()).getById(created.id)).toBeNull();
});

it("rolls back staged package bytes when SQL metadata cannot commit", async () => {
  const database = initDatabase();
  const skills = new SkillDB(database);
  const skill = await createLibrarySkill(skills, {
    name: "atomic-skill",
    protocol_type: "skill",
    is_favorite: false,
    content: "Original",
  });
  if (!skill.local_repo_path)
    throw new Error("Fixture package was not persisted");
  const before = fs.readFileSync(path.join(skill.local_repo_path, "SKILL.md"));
  database.exec(
    "CREATE TRIGGER reject_skill_update BEFORE UPDATE ON skills BEGIN SELECT RAISE(ABORT, 'fixture SQL failure'); END",
  );
  await expect(
    mutateSkillPackage(skills, skill.id, {
      kind: "write",
      relativePath: "SKILL.md",
      content: "Failed",
    }),
  ).rejects.toThrow("fixture SQL failure");
  expect(fs.readFileSync(path.join(skill.local_repo_path, "SKILL.md"))).toEqual(
    before,
  );
  expect(skills.getById(skill.id)).toEqual(skill);
  database.exec("DROP TRIGGER reject_skill_update");
  await mutateSkillPackage(skills, skill.id, {
    kind: "write",
    relativePath: "SKILL.md",
    content: "Retried",
  });
  closeDatabase();
  expect(new SkillDB(initDatabase()).getById(skill.id)?.content).toBe(
    "Retried",
  );
});

it("updates annotations without rewriting the package, and does not fabricate a missing package on read", async () => {
  const skills = new SkillDB(initDatabase());
  const skill = await createLibrarySkill(skills, {
    name: "metadata-skill",
    protocol_type: "skill",
    is_favorite: false,
    content: "Original",
  });
  if (!skill.local_repo_path)
    throw new Error("Fixture package was not persisted");
  const entry = path.join(skill.local_repo_path, "SKILL.md");
  const before = fs.statSync(entry);
  expect(skills.update(skill.id, { is_favorite: true })?.is_favorite).toBe(
    true,
  );
  expect(fs.statSync(entry).mtimeMs).toBe(before.mtimeMs);
  expect(fs.statSync(entry).ino).toBe(before.ino);
  fs.rmSync(entry);
  await expect(
    prepareLibrarySkillEdit(skills, skill.id, { content: "Replacement" }),
  ).rejects.toThrow();
  expect(fs.existsSync(entry)).toBe(false);
});
