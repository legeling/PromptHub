import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseAdapter, SCHEMA } from "@prompthub/db";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SkillStorageDB } from "../src/skill-storage";
import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";

let root: string;
let database: DatabaseAdapter;
let skills: SkillStorageDB;
let source: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-storage-db-"));
  configureRuntimePaths({ userDataPath: root });
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  database = new DatabaseAdapter(path.join(root, "data", "prompthub.db"));
  database.exec(SCHEMA);
  skills = new SkillStorageDB(database);
  source = path.join(root, "incoming");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "SKILL.md"), "Initial");
});
afterEach(() => {
  vi.restoreAllMocks();
  database.close();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});
function create() {
  return skills.create({
    name: "storage",
    protocol_type: "skill",
    is_favorite: false,
    content: "Stale input",
    local_repo_path: source,
  });
}

it("removes only its new empty container when package preparation fails", () => {
  const copy = vi.spyOn(fs, "copyFileSync").mockImplementation(() => {
    throw new Error("fixture copy failure");
  });
  expect(create).toThrow("fixture copy failure");
  copy.mockRestore();
  expect(skills.getAll()).toEqual([]);
  expect(fs.readdirSync(path.join(root, "data", "skills"))).toEqual([]);
  expect(create().local_repo_path).toBeTruthy();
});

it("retains nonempty new containers when rollback cannot remove unrelated contents", () => {
  vi.spyOn(fs, "copyFileSync").mockImplementation((_source, target) => {
    const container = path.dirname(path.dirname(String(target)));
    fs.writeFileSync(path.join(container, "retained.txt"), "keep");
    throw new Error("fixture copy failure");
  });
  expect(create).toThrow("fixture copy failure");
  const containers = fs.readdirSync(path.join(root, "data", "skills"));
  expect(containers).toHaveLength(1);
  expect(
    fs.readFileSync(
      path.join(root, "data", "skills", containers[0], "retained.txt"),
      "utf8",
    ),
  ).toBe("keep");
  expect(skills.getAll()).toEqual([]);
});
it("adopts full package bytes and updates metadata and history in SQL", () => {
  const skill = create();
  const directory = path.join(root, "data", "skills", skill.id, "files");
  expect(skill).toMatchObject({
    content: "Initial",
    local_repo_path: directory,
  });
  skills.update(skill.id, { content: "Updated" });
  expect(fs.readFileSync(path.join(directory, "SKILL.md"), "utf8")).toBe(
    "Updated",
  );
  skills.createVersion(skill.id, "snapshot", [
    { relativePath: "SKILL.md", content: "Updated" },
  ]);
  expect(skills.getVersions(skill.id)[0].content).toBe("Updated");
  expect(skills.delete(skill.id)).toBe(true);
  expect(fs.existsSync(directory)).toBe(false);
});
it("retains the pending row and package if finalization receives unsafe files", () => {
  const pending = skills.create({
    name: "pending",
    protocol_type: "skill",
    is_favorite: false,
    content: "Pending",
    source_last_error: "PACKAGE_OPERATION_PENDING",
  });
  fs.symlinkSync(root, path.join(source, "linked"));
  expect(() =>
    skills.finalizePackageInstall(
      pending.id,
      { local_repo_path: source, source_last_error: null },
      "Install",
      [],
    ),
  ).toThrow(/symbolic link/);
  expect(skills.getById(pending.id)).toEqual(pending);
  expect(skills.getVersions(pending.id)).toEqual([]);
  expect(
    fs.readFileSync(path.join(pending.local_repo_path!, "SKILL.md"), "utf8"),
  ).toBe("Pending");
});
it("excludes incoming sidecars while preserving the original incoming package", () => {
  fs.mkdirSync(path.join(source, ".prompthub"));
  fs.writeFileSync(path.join(source, ".prompthub", "user.json"), "draft");
  const skill = create();
  expect(fs.existsSync(path.join(skill.local_repo_path!, ".prompthub"))).toBe(
    false,
  );
  expect(
    fs.readFileSync(path.join(source, ".prompthub", "user.json"), "utf8"),
  ).toBe("draft");
});
it.each([".prompthub", "repo"])(
  "preserves unrelated %s sibling bytes when editing a managed package",
  (directory) => {
    const skill = create();
    const sibling = path.join(root, "data", "skills", skill.id, directory);
    fs.mkdirSync(sibling);
    fs.writeFileSync(path.join(sibling, "user.json"), "retained");
    skills.update(skill.id, { content: "Updated" });
    expect(fs.readFileSync(path.join(sibling, "user.json"), "utf8")).toBe(
      "retained",
    );
  },
);
it("does not hydrate a removed package when a new storage repository opens", () => {
  const skill = create();
  fs.rmSync(skill.local_repo_path!, { recursive: true });
  database.close();
  database = new DatabaseAdapter(path.join(root, "data", "prompthub.db"));
  skills = new SkillStorageDB(database);
  const { content: _content, instructions: _instructions, ...metadata } = skill;
  expect(skills.getById(skill.id)).toEqual(metadata);
  expect(fs.existsSync(skill.local_repo_path!)).toBe(false);
  expect(() =>
    skills.update(skill.id, { content: "Attempted edit" }),
  ).toThrow();
});
it("keeps linked package paths in SQL and deletes only the library record", () => {
  const skill = skills.create({
    name: "linked",
    protocol_type: "skill",
    is_favorite: false,
    source_url: source,
    local_repo_path: source,
  });
  expect(skill.local_repo_path).toBe(source);
  expect(
    fs.existsSync(
      path.join(root, "config", "devices", "skill-sources", `${skill.id}.json`),
    ),
  ).toBe(false);
  skills.delete(skill.id);
  expect(fs.readFileSync(path.join(source, "SKILL.md"), "utf8")).toBe(
    "Initial",
  );
});
it("preserves an existing managed sidecar across package replacement", () => {
  const skill = create();
  const sidecar = path.join(skill.local_repo_path!, ".prompthub", "user.json");
  fs.mkdirSync(path.dirname(sidecar));
  fs.writeFileSync(sidecar, "local annotation");
  skills.update(skill.id, { content: "Edited" });
  expect(fs.readFileSync(sidecar, "utf8")).toBe("local annotation");
});

it("replaces managed snapshot bytes while preserving local annotations and rejecting linked packages", () => {
  const skill = create();
  const sidecar = path.join(skill.local_repo_path!, ".prompthub", "user.json");
  fs.mkdirSync(path.dirname(sidecar));
  fs.writeFileSync(sidecar, "keep annotation");
  skills.replacePackageFiles(skill.id, [
    { relativePath: "SKILL.md", content: "Replacement" },
    { relativePath: "icon.bin", content: "AP8D", encoding: "base64" },
  ]);
  expect(skills.getById(skill.id)?.content).toBe("Replacement");
  expect(
    fs.readFileSync(path.join(skill.local_repo_path!, "icon.bin")),
  ).toEqual(Buffer.from([0, 255, 3]));
  expect(fs.readFileSync(sidecar, "utf8")).toBe("keep annotation");
  const linked = skills.create({
    name: "linked-snapshot",
    protocol_type: "skill",
    is_favorite: false,
    source_url: source,
    local_repo_path: source,
  });
  expect(() =>
    skills.replacePackageFiles(linked.id, [
      { relativePath: "SKILL.md", content: "Do not write" },
    ]),
  ).toThrow(/Linked packages/);
  expect(fs.readFileSync(path.join(source, "SKILL.md"), "utf8")).toBe(
    "Initial",
  );
});
