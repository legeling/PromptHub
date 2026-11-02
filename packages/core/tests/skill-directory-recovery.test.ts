import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DatabaseAdapter, SCHEMA, SkillDB } from "@prompthub/db";
import { migrateSkillSqliteV1 } from "../src/migrations/skill-sqlite-v1";
import { migrateSkillSqlite } from "../src/migrations/skill-sqlite-upgrade";
import { migrateWorkspaceData } from "../src/workspace-data-migrations";
import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";

let root: string;
let databasePath: string;
let database: DatabaseAdapter;
const recoveryName = "skill-directory-recovery-v1";
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-directory-recovery-"));
  configureRuntimePaths({ userDataPath: root });
  fs.mkdirSync(path.join(root, "data", "skills"), { recursive: true });
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
function orphan(name = "old-download"): string {
  const directory = path.join(root, "data", "skills", name);
  fs.mkdirSync(path.join(directory, "nested", "empty"), { recursive: true });
  fs.writeFileSync(
    path.join(directory, "nested", "asset.bin"),
    Buffer.from([0, 128, 255]),
  );
  fs.writeFileSync(path.join(directory, ".notes"), "Original notes");
  return directory;
}
function migrate(injectFailure?: (target: string) => void): void {
  migrateSkillSqlite(database, { rootPath: root, databasePath, injectFailure });
}
function archives(): string[] {
  const directory = path.join(root, "recovery", recoveryName);
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((name) => !name.startsWith("."))
    .map((name) => path.join(directory, name));
}
function assertOriginal(directory: string): void {
  expect(fs.readFileSync(path.join(directory, ".notes"), "utf8")).toBe(
    "Original notes",
  );
  expect(fs.readFileSync(path.join(directory, "nested", "asset.bin"))).toEqual(
    Buffer.from([0, 128, 255]),
  );
  expect(fs.readdirSync(path.join(directory, "nested", "empty"))).toEqual([]);
}
it.each([false, true])(
  "preserves unknown directories and completes Skill migration, including prior receipt=%s",
  (completed) => {
    const source = orphan();
    const repository = new SkillDB(database);
    const skill = repository.create({
      name: "keep",
      content: "Keep body",
      protocol_type: "skill",
      is_favorite: true,
    });
    repository.createVersion(skill.id, "history", [
      { relativePath: "SKILL.md", content: "Keep body" },
    ]);
    if (completed)
      database.run(
        "INSERT INTO schema_migrations VALUES (?, ?)",
        "skill-sqlite-v1",
        Date.now(),
      );
    expect(() =>
      migrateSkillSqliteV1(database, { rootPath: root, databasePath }),
    ).toThrow("Unrecognized Skill directory requires recovery");
    migrate();
    expect(repository.getById(skill.id)).toMatchObject({
      name: "keep",
      is_favorite: true,
      content: "Keep body",
    });
    expect(repository.getVersions(skill.id)).toHaveLength(1);
    expect(fs.existsSync(source)).toBe(false);
    expect(archives()).toHaveLength(1);
    const archive = archives()[0];
    assertOriginal(path.join(archive, "directories", "old-download"));
    expect(
      JSON.parse(fs.readFileSync(path.join(archive, "manifest.json"), "utf8")),
    ).toMatchObject({
      migration: recoveryName,
      sourceDirectories: ["data/skills/old-download"],
    });
    database.close();
    database = new DatabaseAdapter(databasePath);
    migrate();
    migrate();
    expect(archives()).toEqual([archive]);
    assertOriginal(path.join(archive, "directories", "old-download"));
  },
);
it("keeps recognized loose packages and registered directory owners in place", () => {
  const registered = orphan("registered");
  new SkillDB(database).create({
    name: "registered",
    content: "SQL body",
    protocol_type: "skill",
    is_favorite: false,
    local_repo_path: registered,
  });
  // Already migrated metadata can represent a temporarily missing entrypoint.
  database.run(
    "INSERT INTO schema_migrations VALUES (?, ?)",
    "skill-sqlite-v1",
    Date.now(),
  );
  for (const location of ["SKILL.md", "files/SKILL.md", "repo/SKILL.md"]) {
    const file = path.join(
      root,
      "data",
      "skills",
      location.replaceAll("/", "-"),
      location,
    );
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "Loose package");
  }
  orphan();
  migrate();
  assertOriginal(registered);
  expect(
    fs.existsSync(
      path.join(root, "data", "skills", "repo-SKILL.md", "repo", "SKILL.md"),
    ),
  ).toBe(true);
  expect(archives()).toHaveLength(1);
});
it.each(["publication", "SQL", "copy"])(
  "preserves original bytes on %s failure and retries once",
  (failure) => {
    const source = orphan();
    if (failure === "SQL")
      database.exec(
        `CREATE TRIGGER reject_recovery BEFORE INSERT ON schema_migrations WHEN NEW.name = '${recoveryName}' BEGIN SELECT RAISE(ABORT, 'recovery rejected'); END`,
      );
    if (failure === "copy")
      vi.spyOn(fs, "cpSync").mockImplementation(() => {
        throw new Error("copy rejected");
      });
    expect(() =>
      migrate(
        failure === "publication"
          ? (target) => {
              if (target === source) throw new Error("publication rejected");
            }
          : undefined,
      ),
    ).toThrow(/rejected/);
    assertOriginal(source);
    expect(archives()).toEqual([]);
    expect(
      database.get(
        "SELECT name FROM schema_migrations WHERE name = ?",
        recoveryName,
      ),
    ).toBeNull();
    vi.restoreAllMocks();
    if (failure === "SQL") database.exec("DROP TRIGGER reject_recovery");
    migrate();
    expect(archives()).toHaveLength(1);
    assertOriginal(path.join(archives()[0], "directories", "old-download"));
  },
);
it("rejects links without touching their external target or source", () => {
  const source = orphan();
  const external = path.join(root, "external");
  fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, "secret"), "unchanged");
  fs.symlinkSync(external, path.join(source, "link"), "junction");
  expect(() => migrate()).toThrow(/unsafe/);
  expect(fs.readFileSync(path.join(external, "secret"), "utf8")).toBe(
    "unchanged",
  );
  assertOriginal(source);
  expect(archives()).toEqual([]);
});
it("rolls back every directory when a later removal fails, then retries the whole batch", () => {
  const first = orphan("a-first");
  const last = orphan("z-last");
  expect(() =>
    migrate((target) => {
      if (target !== last) return;
      expect(fs.existsSync(first)).toBe(false);
      expect(archives()).toHaveLength(1);
      throw new Error("last removal failed");
    }),
  ).toThrow("last removal failed");
  assertOriginal(first);
  assertOriginal(last);
  expect(archives()).toEqual([]);
  database.close();
  database = new DatabaseAdapter(databasePath);
  migrate();
  expect(archives()).toHaveLength(1);
  for (const source of [first, last]) {
    expect(fs.existsSync(source)).toBe(false);
    assertOriginal(
      path.join(archives()[0], "directories", path.basename(source)),
    );
  }
});
it("resolves a committed recovery after its file journal fails without copying again", () => {
  const source = orphan();
  const rename = fs.renameSync;
  const fault = vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
    if (
      String(to).endsWith(`${recoveryName}-publication.json`) &&
      JSON.parse(fs.readFileSync(from, "utf8")).state === "committed"
    )
      throw new Error("recovery journal failed");
    rename(from, to);
  });
  expect(() => migrate()).toThrow(/outcome is unknown/);
  fault.mockRestore();
  expect(
    database.get(
      "SELECT name FROM schema_migrations WHERE name = ?",
      recoveryName,
    ),
  ).toEqual({ name: recoveryName });
  expect(archives()).toHaveLength(1);
  const archive = archives()[0];
  assertOriginal(path.join(archive, "directories", "old-download"));
  database.close();
  database = new DatabaseAdapter(databasePath);
  const copy = vi.spyOn(fs, "cpSync");
  migrate();
  migrate();
  expect(copy).not.toHaveBeenCalled();
  expect(archives()).toEqual([archive]);
  expect(fs.existsSync(source)).toBe(false);
  expect(
    fs
      .readdirSync(path.dirname(source))
      .some((name) => name.includes(".prior-")),
  ).toBe(false);
  assertOriginal(path.join(archive, "directories", "old-download"));
});
it.each(["copy", "source"])(
  "detects changed %s bytes before removing any original",
  (changed) => {
    const source = orphan();
    const copy = fs.cpSync;
    vi.spyOn(fs, "cpSync").mockImplementation((from, to, options) => {
      copy(from, to, options);
      fs.writeFileSync(
        path.join(changed === "source" ? String(from) : String(to), ".notes"),
        "Changed during copy",
      );
    });
    expect(() => migrate()).toThrow(
      /verification failed|changed before publication/,
    );
    expect(fs.readFileSync(path.join(source, ".notes"), "utf8")).toBe(
      changed === "source" ? "Changed during copy" : "Original notes",
    );
    expect(archives()).toEqual([]);
  },
);
it("does not conceal a malformed historical manifest", () => {
  const source = orphan();
  fs.writeFileSync(path.join(source, "manifest.json"), "invalid");
  expect(() => migrate()).toThrow();
  assertOriginal(source);
  expect(archives()).toEqual([]);
});
it("recovers a newly restored orphan after completion without replacing earlier archives", () => {
  orphan();
  migrate();
  const first = archives()[0];
  orphan();
  migrate();
  expect(archives()).toHaveLength(2);
  assertOriginal(path.join(first, "directories", "old-download"));
});
it("runs through the shared startup/restore migration sequence and reopens", () => {
  orphan();
  migrateWorkspaceData(database, root, path.join(root, "data", "skills"));
  database.close();
  database = new DatabaseAdapter(databasePath);
  migrateWorkspaceData(database, root, path.join(root, "data", "skills"));
  expect(archives()).toHaveLength(1);
  expect(database.pragma("quick_check")).toEqual([{ quick_check: "ok" }]);
});
it("preserves a representative binary checkout and performs no copy on reopen", () => {
  const source = orphan();
  const fileCount = 64;
  const fileBytes = 64 * 1024;
  const payload = Buffer.alloc(fileBytes, 0xa5);
  for (let index = 0; index < fileCount; index++)
    fs.writeFileSync(path.join(source, `asset-${index}.bin`), payload);
  const start = performance.now();
  migrate();
  const recoveryMs = performance.now() - start;
  const archive = path.join(archives()[0], "directories", "old-download");
  for (let index = 0; index < fileCount; index++)
    expect(fs.readFileSync(path.join(archive, `asset-${index}.bin`))).toEqual(
      payload,
    );
  database.close();
  database = new DatabaseAdapter(databasePath);
  const copy = vi.spyOn(fs, "cpSync");
  const reopenStart = performance.now();
  migrate();
  const reopenMs = performance.now() - reopenStart;
  expect(copy).not.toHaveBeenCalled();
  console.info(
    JSON.stringify({
      recoveredBytes: fileCount * fileBytes,
      recoveryMs,
      reopenMs,
    }),
  );
});
