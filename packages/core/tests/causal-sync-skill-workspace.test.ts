import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { DatabaseAdapter, SCHEMA, SkillDB } from "@prompthub/db";
import { SkillCausalSyncWorkspace } from "../src/causal-sync/skill-workspace";
import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";
import { SkillStorageDB } from "../src/skill-storage";
import { publishSqliteEntries } from "../src/sqlite-entry-publication";
import { planCausalSync } from "../src/causal-sync";
import { syncPayload } from "../src/causal-sync/payload";

const roots: string[] = [];
const databases: DatabaseAdapter[] = [];
afterEach(() => {
  resetRuntimePaths();
  for (const database of databases.splice(0)) database.close();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

function device() {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ph-sync-skills-")),
  );
  roots.push(root);
  const database = new DatabaseAdapter(path.join(root, "app.db"));
  databases.push(database);
  database.exec(SCHEMA);
  return {
    root,
    database,
    skills: new SkillDB(database),
    workspace: new SkillCausalSyncWorkspace(database, root),
  };
}

function source() {
  const result = device();
  configureRuntimePaths({ userDataPath: result.root });
  const skill = new SkillStorageDB(result.database).create({
    name: "sync-package",
    protocol_type: "skill",
    description: "Binary package",
    is_favorite: false,
    content:
      "---\nname: sync-package\ndescription: Binary package\n---\nOriginal",
  });
  if (!skill.local_repo_path) throw new Error("Missing managed package");
  fs.mkdirSync(path.join(skill.local_repo_path, "assets"));
  fs.writeFileSync(
    path.join(skill.local_repo_path, "assets", "binary.bin"),
    Buffer.from([0, 128, 255]),
  );
  return { ...result, skill, packagePath: skill.local_repo_path };
}

it("transfers the whole package, metadata and history through one SQL/file publication and reopen", () => {
  const a = source();
  const b = device();
  const resources = a.workspace.capture();
  const application = b.workspace.prepareApplication(resources);
  publishSqliteEntries(b.database, {
    rootPath: b.root,
    operationKey: "sync-skill-test",
    entries: application.entries,
    commit: application.apply,
  });
  expect(b.workspace.capture()).toEqual(resources);
  const restored = b.skills.getById(a.skill.id);
  expect(restored?.name).toBe("sync-package");
  expect(
    fs.readFileSync(
      path.join(restored!.local_repo_path!, "assets", "binary.bin"),
    ),
  ).toEqual(Buffer.from([0, 128, 255]));
  b.database.close();
  databases.splice(databases.indexOf(b.database), 1);
  const reopened = new DatabaseAdapter(path.join(b.root, "app.db"));
  databases.push(reopened);
  expect(new SkillCausalSyncWorkspace(reopened, b.root).capture()).toEqual(
    resources,
  );
  const removal = new SkillCausalSyncWorkspace(
    reopened,
    b.root,
  ).prepareApplication([]);
  publishSqliteEntries(reopened, {
    rootPath: b.root,
    operationKey: "sync-skill-test",
    entries: removal.entries,
    commit: removal.apply,
  });
  expect(new SkillDB(reopened).getAll()).toEqual([]);
  expect(fs.existsSync(restored!.local_repo_path!)).toBe(false);
});

it("treats edits to different files of the same Skill as one resource conflict", () => {
  const a = source();
  const inventory = () =>
    a.workspace.capture().map(({ text: _text, ...resource }) => resource);
  const initial = inventory();
  const base = planCausalSync({
    syncId: "library",
    deviceId: "a",
    commitId: "base",
    local: initial,
    base: null,
    remote: null,
  });
  if (base.status !== "publish") throw new Error("Missing base");
  fs.writeFileSync(
    path.join(a.packagePath, "assets", "binary.bin"),
    Buffer.from([42]),
  );
  const remote = planCausalSync({
    syncId: "library",
    deviceId: "b",
    commitId: "remote",
    local: inventory(),
    base: base.generation,
    remote: base.generation,
  });
  if (remote.status !== "publish") throw new Error("Missing remote change");
  fs.writeFileSync(
    path.join(a.packagePath, "assets", "binary.bin"),
    Buffer.from([0, 128, 255]),
  );
  fs.writeFileSync(path.join(a.packagePath, "other.txt"), "independent file");
  expect(
    planCausalSync({
      syncId: "library",
      deviceId: "a",
      commitId: "local",
      local: inventory(),
      base: base.generation,
      remote: remote.generation,
    }),
  ).toMatchObject({ status: "conflict" });
});

it("rejects traversal before staging or deleting existing package data", () => {
  const a = source();
  const resource = a.workspace.capture()[0];
  const value = JSON.parse(resource.text);
  value.files.push({ relativePath: "../escape", content: "escape" });
  expect(() =>
    a.workspace.prepareApplication([
      { ...resource, text: JSON.stringify(value) },
    ]),
  ).toThrow();
  expect(
    fs.readFileSync(path.join(a.packagePath, "assets", "binary.bin")),
  ).toEqual(Buffer.from([0, 128, 255]));
  expect(a.skills.getAll()).toHaveLength(1);
});

it("preserves device-local sidecars when replacing a package", () => {
  const a = source();
  const sidecar = path.join(a.packagePath, ".prompthub");
  fs.mkdirSync(sidecar, { recursive: true });
  fs.writeFileSync(path.join(sidecar, "local.json"), "device state");
  const value = JSON.parse(a.workspace.capture()[0].text);
  value.files.push({
    relativePath: "added.txt",
    content: Buffer.from("remote").toString("base64"),
    encoding: "base64",
  });
  value.files.sort((a: { relativePath: string }, b: { relativePath: string }) =>
    a.relativePath.localeCompare(b.relativePath),
  );
  const application = a.workspace.prepareApplication([
    syncPayload("skill", a.skill.id, value),
  ]);
  publishSqliteEntries(a.database, {
    rootPath: a.root,
    operationKey: "sync-skill-test",
    entries: application.entries,
    commit: application.apply,
  });
  expect(fs.readFileSync(path.join(sidecar, "local.json"), "utf8")).toBe(
    "device state",
  );
  expect(fs.readFileSync(path.join(a.packagePath, "added.txt"), "utf8")).toBe(
    "remote",
  );
});

it("rejects an incomplete Skill package before it replaces the current package", () => {
  const a = source();
  const value = JSON.parse(a.workspace.capture()[0].text);
  value.files = value.files.filter(
    (file: { relativePath: string }) => file.relativePath !== "SKILL.md",
  );
  expect(() =>
    a.workspace.prepareApplication([syncPayload("skill", a.skill.id, value)]),
  ).toThrow();
  expect(fs.existsSync(path.join(a.packagePath, "SKILL.md"))).toBe(true);
});

it("rejects duplicate installed source identities before publication", () => {
  const a = source(),
    b = source();
  const resources = [a.workspace.capture()[0], b.workspace.capture()[0]].map(
    (resource) => {
      const value = JSON.parse(resource.text);
      value.skill.source_id = "shared-source";
      return syncPayload("skill", value.skill.id, value);
    },
  );
  const before = a.workspace.capture();
  expect(() => a.workspace.prepareApplication(resources)).toThrow(
    /source identity/,
  );
  expect(a.workspace.capture()).toEqual(before);
});
