import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  closeDatabase,
  initDatabase as initializeSqlite,
  SkillDB as LegacySkillDB,
  type DatabaseAdapter,
} from "@prompthub/db";
import type { SkillFileSnapshot } from "@prompthub/shared/types";
import { initDatabase } from "../src/database";
import { migrateSkillPayloadFiles } from "../src/migrations/skill-payload-upgrade";
import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";
import { SkillStorageDB } from "../src/skill-storage";
import { getSkillVersionPayloadPath } from "../src/skill-version-files";

let root: string;
let databasePath: string;
let database: DatabaseAdapter;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-path-upgrade-"));
  configureRuntimePaths({ userDataPath: root });
  databasePath = path.join(root, "data", "prompthub.db");
  database = initializeSqlite(databasePath);
});
afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});
function seed(files: SkillFileSnapshot[]) {
  const legacy = new LegacySkillDB(database);
  const skill = legacy.create({
    name: "windows-history",
    content: "Historical entrypoint",
    protocol_type: "skill",
    is_favorite: false,
  });
  const version = legacy.createVersion(skill.id, "Original note", files)!;
  legacy.update(skill.id, { content: "Current entrypoint" });
  return { skill, version };
}
function upgrade(injectFailure?: (target: string) => void): void {
  migrateSkillPayloadFiles(database, {
    rootPath: root,
    databasePath,
    skillsRoot: path.join(root, "data", "skills"),
    injectFailure,
  });
}
function readSqlSnapshot(id: string): unknown {
  return database.get(
    "SELECT files_snapshot FROM skill_versions WHERE id = ?",
    id,
  );
}

it("upgrades Windows and mixed-separator history through normal startup and two reopens", () => {
  const { skill, version } = seed([
    { relativePath: "assets\\playwright-small.svg", content: "<svg/>\r\n" },
    { relativePath: "docs\\nested/guide.md", content: "Guide" },
    { relativePath: "assets\\pixel.bin", content: "AP+A", encoding: "base64" },
  ]);
  const expectedFiles: SkillFileSnapshot[] = [
    { relativePath: "assets/playwright-small.svg", content: "<svg/>\r\n" },
    { relativePath: "docs/nested/guide.md", content: "Guide" },
    { relativePath: "assets/pixel.bin", content: "AP+A", encoding: "base64" },
  ];
  for (let launch = 0; launch < 3; launch++) {
    closeDatabase();
    database = initDatabase();
    const storage = new SkillStorageDB(database);
    expect(storage.getById(skill.id)?.content).toBe("Current entrypoint");
    expect(storage.getVersion(skill.id, version.version)).toEqual({
      ...version,
      filesSnapshot: expectedFiles,
    });
    expect(readSqlSnapshot(version.id)).toEqual({ files_snapshot: null });
  }
  const history = getSkillVersionPayloadPath(skill.id, version.id);
  expect(fs.readFileSync(path.join(history, "files/assets/pixel.bin"))).toEqual(
    Buffer.from([0, 255, 128]),
  );
  expect(
    fs.readFileSync(
      path.join(history, "files/assets/playwright-small.svg"),
      "utf8",
    ),
  ).toBe("<svg/>\r\n");
  expect(database.pragma("foreign_key_check")).toEqual([]);
});

it.each([
  "..\\escape",
  "C:\\escape",
  "\\rooted",
  "\\\\server\\share",
  "nested\\..\\escape",
  "nested\\.\\file",
  "nested\\\\file",
  "a\0b",
])(
  "rejects unsafe legacy path %j and retains original SQL and files",
  (relativePath) => {
    const files = [
      { relativePath: "assets\\valid.txt", content: "Keep" },
      { relativePath, content: "Reject" },
    ];
    const { skill, version } = seed(files);
    expect(() => upgrade()).toThrow(/snapshot|path/i);
    expect(readSqlSnapshot(version.id)).toEqual({
      files_snapshot: JSON.stringify(files),
    });
    expect(
      database.get(
        "SELECT name FROM schema_migrations WHERE name = ?",
        "skill-snapshot-paths-v1",
      ),
    ).toBeNull();
    expect(
      fs.existsSync(getSkillVersionPayloadPath(skill.id, version.id)),
    ).toBe(false);
    expect(fs.existsSync(path.join(root, "escape"))).toBe(false);
  },
);

it("rejects separator collisions without merging or dropping either historical file", () => {
  const files = [
    { relativePath: "assets\\icon.svg", content: "First" },
    { relativePath: "assets/icon.svg", content: "Second" },
  ];
  const { version } = seed(files);
  expect(() => upgrade()).toThrow(/duplicate/i);
  expect(readSqlSnapshot(version.id)).toEqual({
    files_snapshot: JSON.stringify(files),
  });
});

it("rolls back the correction transaction and retries after a SQL failure", () => {
  const files = [{ relativePath: "assets\\icon.svg", content: "Keep" }];
  const { skill, version } = seed(files);
  database.exec(
    "CREATE TRIGGER reject_path_migration BEFORE INSERT ON schema_migrations WHEN NEW.name = 'skill-snapshot-paths-v1' BEGIN SELECT RAISE(ABORT, 'path migration failed'); END",
  );
  expect(() => upgrade()).toThrow("path migration failed");
  expect(readSqlSnapshot(version.id)).toEqual({
    files_snapshot: JSON.stringify(files),
  });
  database.exec("DROP TRIGGER reject_path_migration");
  upgrade();
  expect(
    new SkillStorageDB(database).getVersion(skill.id, version.version)
      ?.filesSnapshot,
  ).toEqual([{ relativePath: "assets/icon.svg", content: "Keep" }]);
});

it("retains history after publication fails and completes on restart", () => {
  const { skill, version } = seed([
    { relativePath: "assets\\icon.svg", content: "Keep" },
  ]);
  expect(() =>
    upgrade((target) => {
      if (target.includes("versions")) throw new Error("publication failed");
    }),
  ).toThrow("publication failed");
  expect(
    new LegacySkillDB(database).getVersion(skill.id, version.version)?.content,
  ).toBe("Historical entrypoint");
  expect(readSqlSnapshot(version.id)).toEqual({
    files_snapshot: JSON.stringify([
      { relativePath: "assets/icon.svg", content: "Keep" },
    ]),
  });
  closeDatabase();
  database = initDatabase();
  expect(
    new SkillStorageDB(database).getVersion(skill.id, version.version),
  ).toEqual({
    ...version,
    filesSnapshot: [{ relativePath: "assets/icon.svg", content: "Keep" }],
  });
});
