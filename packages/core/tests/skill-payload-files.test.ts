import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  DatabaseAdapter,
  SCHEMA,
  SkillDB as LegacySkillDB,
} from "@prompthub/db";
import { SkillStorageDB } from "../src/skill-storage";
import { migrateSkillPayloadFilesV1 } from "../src/migrations/skill-payload-files-v1";
import { getSkillVersionPayloadPath } from "../src/skill-version-files";
import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";

let root: string;
let databasePath: string;
let database: DatabaseAdapter;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-payload-files-"));
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
  vi.restoreAllMocks();
  database.close();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});
function migrate(injectFailure?: (target: string) => void): void {
  migrateSkillPayloadFilesV1(database, {
    rootPath: root,
    databasePath,
    skillsRoot: path.join(root, "data", "skills"),
    injectFailure,
  });
}
function reopen(): SkillStorageDB {
  database.close();
  database = new DatabaseAdapter(databasePath);
  migrate();
  return new SkillStorageDB(database);
}
function legacyFixture() {
  const repository = new LegacySkillDB(database);
  const skill = repository.create({
    name: "legacy",
    content: "First",
    protocol_type: "skill",
    is_favorite: true,
  });
  const version = repository.createVersion(skill.id, "Original", [
    { relativePath: "SKILL.md", content: "First" },
    { relativePath: "assets/pixel.bin", content: "AP+A", encoding: "base64" },
  ])!;
  repository.update(skill.id, { content: "Current" });
  const empty = repository.createVersion(skill.id, "Empty snapshot", [])!;
  repository.update(skill.id, { content: "Latest" });
  return { skill: repository.getById(skill.id)!, versions: [empty, version] };
}
function assertSqlHasNoPayload(): void {
  expect(database.all("SELECT content FROM skills")).toEqual(
    expect.arrayContaining([{ content: null }]),
  );
  expect(
    database.get("SELECT COUNT(*) AS n FROM skills WHERE content IS NOT NULL"),
  ).toEqual({ n: 0 });
  expect(
    database.get(
      "SELECT COUNT(*) AS n FROM skill_versions WHERE content IS NOT NULL OR files_snapshot IS NOT NULL",
    ),
  ).toEqual({ n: 0 });
}
it("upgrades current and complete history, preserves identities and binary bytes through two reopens", () => {
  const before = legacyFixture();
  migrate();
  for (let pass = 0; pass < 2; pass++) {
    const repository = reopen();
    expect(repository.getById(before.skill.id)).toEqual({
      ...before.skill,
      local_repo_path: path.join(
        root,
        "data",
        "skills",
        before.skill.id,
        "files",
      ),
    });
    expect(repository.getVersions(before.skill.id)).toEqual(before.versions);
    assertSqlHasNoPayload();
  }
  expect(database.pragma("foreign_key_check")).toEqual([]);
  expect(database.pragma("quick_check")).toEqual([{ quick_check: "ok" }]);
});
it("rolls back a partially published migration and retries without losing SQL or files", () => {
  const before = legacyFixture();
  let touched = false;
  expect(() =>
    migrate((target) => {
      if (target.includes("versions")) {
        touched = true;
        throw new Error("injected migration failure");
      }
    }),
  ).toThrow("injected migration failure");
  expect(touched).toBe(true);
  expect(new LegacySkillDB(database).getById(before.skill.id)).toEqual(
    before.skill,
  );
  expect(new LegacySkillDB(database).getVersions(before.skill.id)).toEqual(
    before.versions,
  );
  expect(
    database.get(
      "SELECT name FROM schema_migrations WHERE name = ?",
      "skill-payload-files-v1",
    ),
  ).toBeNull();
  const repository = reopen();
  expect(repository.getVersions(before.skill.id)).toEqual(before.versions);
  assertSqlHasNoPayload();
});
it("publishes CRUD, versions, rollback and history deletion without SQL body copies", () => {
  migrate();
  let repository = new SkillStorageDB(database);
  const skill = repository.create({
    name: "authored",
    content: "First",
    protocol_type: "skill",
    is_favorite: false,
  });
  const version = repository.createVersion(skill.id, "saved", [
    { relativePath: "SKILL.md", content: "First" },
    { relativePath: "image.bin", content: "AP8=", encoding: "base64" },
  ])!;
  repository.update(skill.id, { content: "Second" });
  repository = reopen();
  expect(repository.getById(skill.id)?.content).toBe("Second");
  expect(repository.getVersion(skill.id, version.version)).toEqual(version);
  expect(repository.rollbackVersion(skill.id, version.version)?.content).toBe(
    "First",
  );
  expect(
    fs.readFileSync(
      path.join(repository.getById(skill.id)!.local_repo_path!, "image.bin"),
    ),
  ).toEqual(Buffer.from([0, 255]));
  expect(repository.deleteVersion(skill.id, version.id)).toBe(true);
  repository = reopen();
  expect(repository.getVersions(skill.id)).toEqual([]);
  expect(fs.existsSync(getSkillVersionPayloadPath(skill.id, version.id))).toBe(
    false,
  );
  assertSqlHasNoPayload();
  expect(repository.delete(skill.id)).toBe(true);
  expect(reopen().getAll()).toEqual([]);
});
it("rejects an immutable history conflict before touching published history", () => {
  migrate();
  const repository = new SkillStorageDB(database);
  const skill = repository.create({
    name: "history",
    content: "",
    protocol_type: "skill",
    is_favorite: false,
  });
  const version = repository.createVersion(skill.id, "")!;
  expect(repository.insertVersionDirect(version)).toEqual(version);
  expect(() =>
    repository.insertVersionDirect({ ...version, content: "conflict" }),
  ).toThrow(/conflict/i);
  expect(reopen().getVersion(skill.id, version.version)).toEqual(version);
});
it("restores package and history after SQL failure during finalization", () => {
  migrate();
  const repository = new SkillStorageDB(database);
  const skill = repository.create({
    name: "atomic",
    content: "Before",
    protocol_type: "skill",
    is_favorite: false,
  });
  const original = database.prepare.bind(database);
  vi.spyOn(database, "prepare").mockImplementation((sql) => {
    if (/INSERT INTO skill_versions/u.test(sql))
      throw new Error("injected SQL failure");
    return original(sql);
  });
  expect(() =>
    repository.finalizePackageUpdate(
      skill.id,
      { content: "After" },
      "before update",
      undefined,
      skill,
    ),
  ).toThrow("injected SQL failure");
  vi.restoreAllMocks();
  const restored = reopen();
  expect(restored.getById(skill.id)?.content).toBe("Before");
  expect(restored.getVersions(skill.id)).toEqual([]);
  expect(restored.getById(skill.id)?.currentVersion).toBe(0);
});
it("fails on missing history or unsafe legacy snapshot paths without silently losing content", () => {
  const before = legacyFixture();
  database.run(
    "UPDATE skill_versions SET files_snapshot = ? WHERE id = ?",
    JSON.stringify([{ relativePath: "../escape", content: "bad" }]),
    before.versions[1].id,
  );
  expect(() => migrate()).toThrow(/path/i);
  expect(new LegacySkillDB(database).getById(before.skill.id)?.content).toBe(
    "Latest",
  );
  database.run(
    "UPDATE skill_versions SET files_snapshot = ? WHERE id = ?",
    JSON.stringify(before.versions[1].filesSnapshot),
    before.versions[1].id,
  );
  migrate();
  fs.rmSync(
    getSkillVersionPayloadPath(before.skill.id, before.versions[1].id),
    { recursive: true },
  );
  expect(() =>
    new SkillStorageDB(database).getVersions(before.skill.id),
  ).toThrow();
});
it("keeps linked packages external and rejects retired SQL writers after upgrade", () => {
  const external = path.join(root, "linked-package");
  fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, "SKILL.md"), "File is current");
  fs.writeFileSync(path.join(external, "sidecar.bin"), Buffer.from([0, 255]));
  const legacy = new LegacySkillDB(database);
  const skill = legacy.create({
    name: "linked",
    content: "Old SQL body",
    local_repo_path: external,
    source_url: external,
    protocol_type: "skill",
    is_favorite: false,
  });
  migrate();
  const repository = reopen();
  expect(repository.getById(skill.id)?.content).toBe("File is current");
  expect(repository.getById(skill.id)?.local_repo_path).toBe(external);
  expect(fs.readdirSync(external).sort()).toEqual(["SKILL.md", "sidecar.bin"]);
  expect(() =>
    database.run("UPDATE skills SET content = ? WHERE id = ?", "bad", skill.id),
  ).toThrow(/stored in files/);
  expect(repository.delete(skill.id)).toBe(true);
  expect(fs.readFileSync(path.join(external, "SKILL.md"), "utf8")).toBe(
    "File is current",
  );
});
it("migrates a multi-megabyte history with bounded per-version decoding", () => {
  const versionCount = 64;
  const bytesPerVersion = 64 * 1024;
  const bytes = Buffer.alloc(bytesPerVersion, 0x80);
  const legacy = new LegacySkillDB(database);
  const skill = legacy.create({
    name: "history-scale",
    content: "Current",
    protocol_type: "skill",
    is_favorite: false,
  });
  database.transaction(() => {
    for (let index = 0; index < versionCount; index++)
      legacy.createVersion(skill.id, `History ${index}`, [
        {
          relativePath: "asset.bin",
          content: bytes.toString("base64"),
          encoding: "base64",
        },
      ]);
  })();
  const started = performance.now();
  const memoryBefore = process.resourceUsage().maxRSS;
  migrate();
  const elapsedMs = performance.now() - started;
  const memoryDeltaKiB = process.resourceUsage().maxRSS - memoryBefore;
  const repository = reopen();
  expect(repository.getVersions(skill.id)).toHaveLength(versionCount);
  for (let version = 1; version <= versionCount; version++)
    expect(repository.getVersion(skill.id, version)?.filesSnapshot).toEqual([
      {
        relativePath: "asset.bin",
        content: bytes.toString("base64"),
        encoding: "base64",
      },
    ]);
  assertSqlHasNoPayload();
  console.info("Skill payload migration measurement", {
    versionCount,
    bytesPerVersion,
    elapsedMs,
    memoryDeltaKiB,
  });
}, 30000);
it("rolls back SQL payload retirement if the migration transaction fails after clearing it", () => {
  const before = legacyFixture();
  database.exec(
    "CREATE TRIGGER reject_payload_migration BEFORE INSERT ON schema_migrations WHEN NEW.name = 'skill-payload-files-v1' BEGIN SELECT RAISE(ABORT, 'migration SQL failed'); END",
  );
  expect(() => migrate()).toThrow("migration SQL failed");
  expect(new LegacySkillDB(database).getById(before.skill.id)).toEqual(
    before.skill,
  );
  expect(new LegacySkillDB(database).getVersions(before.skill.id)).toEqual(
    before.versions,
  );
  expect(
    fs.existsSync(
      getSkillVersionPayloadPath(before.skill.id, before.versions[0].id),
    ),
  ).toBe(false);
  database.exec("DROP TRIGGER reject_payload_migration");
  const repository = reopen();
  expect(repository.getVersions(before.skill.id)).toEqual(before.versions);
  assertSqlHasNoPayload();
});
it("resolves a committed migration from its receipt when writing the final journal fails", () => {
  const before = legacyFixture();
  const rename = fs.renameSync.bind(fs);
  vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
    if (
      String(to).endsWith("skill-payload-files-v1-publication.json") &&
      JSON.parse(fs.readFileSync(from, "utf8")).state === "committed"
    )
      throw new Error("injected committed journal failure");
    return rename(from, to);
  });
  expect(() => migrate()).toThrow(/outcome is unknown/);
  vi.restoreAllMocks();
  for (let pass = 0; pass < 2; pass++) {
    const repository = reopen();
    expect(repository.getById(before.skill.id)?.content).toBe(
      before.skill.content,
    );
    expect(repository.getVersions(before.skill.id)).toEqual(before.versions);
    assertSqlHasNoPayload();
  }
});
