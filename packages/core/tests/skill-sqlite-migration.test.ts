import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { DatabaseAdapter, SCHEMA, SkillDB } from "@prompthub/db";
import { migrateSkillSqliteV1 } from "../src/migrations/skill-sqlite-v1";
import {
  materializeSkillResourceBundle,
  readSkillResourceBundle,
} from "../src/skill-resource-schema";
import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";
import { deriveLocalResourceDeviceId } from "../src/storage-root-identity";

let root: string;
let databasePath: string;
let database: DatabaseAdapter;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-sqlite-upgrade-"));
  configureRuntimePaths({ userDataPath: root });
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  databasePath = path.join(root, "data", "prompthub.db");
  database = new DatabaseAdapter(databasePath);
  database.exec(SCHEMA);
  database.exec(
    "CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
});
afterEach(() => {
  database.close();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const repository = new SkillDB(database);
  const skill = repository.create({
    name: "historical",
    content: "Original",
    instructions: "Original",
    protocol_type: "skill",
    is_favorite: true,
  });
  repository.createVersion(skill.id, "retained", [
    { relativePath: "SKILL.md", content: "Original" },
  ]);
  const current = repository.getById(skill.id)!;
  const source = path.join(root, "incoming");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "SKILL.md"), "Original");
  fs.writeFileSync(path.join(source, "binary.bin"), Buffer.from([0, 255, 128]));
  const bundlePath = path.join(root, "data", "skills", skill.id);
  materializeSkillResourceBundle({
    bundlePath,
    skill: current,
    versions: repository.getVersions(skill.id),
    packageFiles: ["SKILL.md", "binary.bin"].map((name) => ({
      path: name,
      sourcePath: path.join(source, name),
    })),
  });
  const cache = path.join(root, "cache", "skill-workspaces", skill.id);
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(path.join(cache, "draft.txt"), "Unpublished draft");
  repository.update(skill.id, { local_repo_path: cache });
  // Local-only fields do not change portable metadata; preserve identical timestamps.
  database.run(
    "UPDATE skills SET updated_at = ? WHERE id = ?",
    current.updated_at,
    skill.id,
  );
  return { id: skill.id, bundlePath, cache, repository };
}
function migrate(injectFailure?: (target: string) => void): void {
  migrateSkillSqliteV1(database, {
    rootPath: root,
    databasePath,
    injectFailure,
  });
}
function recoveryPath(id: string): string {
  const parent = path.join(root, "recovery", "skill-sqlite-v1", id);
  return path.join(parent, fs.readdirSync(parent)[0]);
}
it("adopts metadata, versions and full package bytes, preserves unpublished cache bytes, and never resurrects deletion", () => {
  const { id, bundlePath, cache, repository } = fixture();
  const before = repository.getById(id)!;
  const versions = repository.getVersions(id);
  const original = readSkillResourceBundle(bundlePath).bundleManifest;
  migrate();
  expect(repository.getById(id)).toEqual({
    ...before,
    local_repo_path: path.join(bundlePath, "files"),
  });
  expect(repository.getVersions(id)).toEqual(versions);
  expect(fs.readFileSync(path.join(bundlePath, "files", "binary.bin"))).toEqual(
    Buffer.from([0, 255, 128]),
  );
  expect(fs.existsSync(path.join(bundlePath, "skill.json"))).toBe(false);
  expect(fs.existsSync(cache)).toBe(false);
  expect(
    readSkillResourceBundle(path.join(recoveryPath(id), "bundle"))
      .bundleManifest,
  ).toEqual(original);
  expect(
    fs.readFileSync(
      path.join(recoveryPath(id), "workspace", "draft.txt"),
      "utf8",
    ),
  ).toBe("Unpublished draft");
  database.close();
  database = new DatabaseAdapter(databasePath);
  migrate();
  expect(new SkillDB(database).getById(id)?.is_favorite).toBe(true);
  new SkillDB(database).delete(id);
  migrate();
  expect(new SkillDB(database).getById(id)).toBeNull();
});
it("rolls back source bytes and SQL on a failed commit, then migrates exactly once", () => {
  const { id, bundlePath, cache, repository } = fixture();
  const original = readSkillResourceBundle(bundlePath).bundleManifest;
  const before = repository.getById(id);
  database.exec(
    "CREATE TRIGGER reject_skill_upgrade BEFORE UPDATE ON skills BEGIN SELECT RAISE(ABORT, 'upgrade rejected'); END",
  );
  expect(() => migrate()).toThrow("upgrade rejected");
  expect(repository.getById(id)).toEqual(before);
  expect(readSkillResourceBundle(bundlePath).bundleManifest).toEqual(original);
  expect(fs.existsSync(cache)).toBe(true);
  database.exec("DROP TRIGGER reject_skill_upgrade");
  migrate();
  migrate();
  expect(
    fs.readdirSync(path.join(root, "recovery", "skill-sqlite-v1", id)),
  ).toHaveLength(1);
});
it("rejects divergent metadata without changing either copy", () => {
  const { id, bundlePath, repository } = fixture();
  repository.update(id, { description: "SQL-only edit" });
  const original = fs.readFileSync(path.join(bundlePath, "manifest.json"));
  expect(() => migrate()).toThrow("migration conflict");
  expect(repository.getById(id)?.description).toBe("SQL-only edit");
  expect(fs.readFileSync(path.join(bundlePath, "manifest.json"))).toEqual(
    original,
  );
});
it("moves historical managed SQL-only packages to their single current location and recovery", () => {
  const source = path.join(root, "data", "skills", "loose", "repo");
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, "SKILL.md"), "Disk body");
  fs.writeFileSync(path.join(source, "tool.bin"), Buffer.from([255, 0]));
  const repository = new SkillDB(database);
  const skill = repository.create({
    name: "loose",
    protocol_type: "skill",
    is_favorite: false,
    content: "Stale projection",
    local_repo_path: source,
  });
  migrate();
  const current = repository.getById(skill.id)!;
  expect(current.content).toBe("Disk body");
  expect(
    fs.readFileSync(path.join(current.local_repo_path!, "tool.bin")),
  ).toEqual(Buffer.from([255, 0]));
  expect(fs.existsSync(source)).toBe(false);
  expect(
    fs.readFileSync(path.join(recoveryPath(skill.id), "SKILL.md"), "utf8"),
  ).toBe("Disk body");
});
it("adopts this device's linked source into SQL and retires only its binding file", () => {
  const { id, bundlePath, repository } = fixture();
  const external = path.join(root, "linked");
  fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, "SKILL.md"), "Linked body");
  const binding = path.join(
    root,
    "config",
    "devices",
    "skill-sources",
    `${id}.json`,
  );
  fs.mkdirSync(path.dirname(binding), { recursive: true });
  fs.writeFileSync(
    binding,
    JSON.stringify({
      kind: "prompthub-skill-source-binding",
      version: 1,
      deviceId: deriveLocalResourceDeviceId(root),
      skillId: id,
      sourceUrl: external,
      localRepoPath: external,
    }),
  );
  migrate();
  expect(repository.getById(id)).toMatchObject({
    source_url: external,
    local_repo_path: external,
    content: "Linked body",
  });
  expect(fs.existsSync(binding)).toBe(false);
  expect(fs.existsSync(path.join(bundlePath, "files"))).toBe(false);
  expect(fs.readFileSync(path.join(external, "SKILL.md"), "utf8")).toBe(
    "Linked body",
  );
  expect(
    JSON.parse(
      fs.readFileSync(path.join(recoveryPath(id), "binding.json"), "utf8"),
    ).sourceUrl,
  ).toBe(external);
});
it("does not follow a linked historical bundle or overwrite its target", () => {
  const { bundlePath } = fixture();
  const original = path.join(root, "original-bundle");
  fs.renameSync(bundlePath, original);
  fs.symlinkSync(original, bundlePath);
  expect(() => migrate()).toThrow("unsafe");
  expect(
    fs.readFileSync(path.join(original, "files", "SKILL.md"), "utf8"),
  ).toBe("Original");
});
