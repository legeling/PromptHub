import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseAdapter, SCHEMA } from "@prompthub/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkillStorageDB } from "../src/skill-storage";
import { getManagedSkillPackagePath } from "../src/skill-storage-files";
import { mutateSkillPackage } from "../src/skills/package-mutation";
import {
  configureRuntimePaths,
  resetRuntimePaths,
  getOperationsDir,
} from "../src/runtime-paths";
import {
  writeCanonicalStorageAuthority,
  writeRuntimeLayoutState,
} from "../src";

describe("Skill package durability", () => {
  let root: string;
  let database: DatabaseAdapter.Database;
  let db: SkillStorageDB;
  let id: string;
  let cache: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-durability-"));
    configureRuntimePaths({ userDataPath: root });
    writeRuntimeLayoutState(root);
    writeCanonicalStorageAuthority(root, {
      consistencyId: "d".repeat(64),
      operationId: "skill-test",
    });
    database = new DatabaseAdapter(path.join(root, "data", "prompthub.db"));
    database.exec(SCHEMA);
    db = new SkillStorageDB(database);
    const source = path.join(root, "source");
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, "SKILL.md"), "# Skill");
    fs.writeFileSync(path.join(source, "helper.py"), "print(1)");
    id = db.create({
      name: "durability",
      protocol_type: "skill",
      local_repo_path: source,
      content: "# Skill",
      is_favorite: false,
    }).id;
    cache = getManagedSkillPackagePath(id);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    database.close();
    resetRuntimePaths();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("updates favorite without regenerating a missing package", () => {
    fs.rmSync(cache, { recursive: true });
    expect(db.update(id, { is_favorite: true })?.is_favorite).toBe(true);
    expect(fs.existsSync(cache)).toBe(false);
  });
  it("rejects a missing replacement source without touching current bytes", () => {
    const before = db.getById(id);
    expect(() =>
      db.update(id, { local_repo_path: path.join(root, "missing") }),
    ).toThrow();
    expect(db.getById(id)).toEqual(before);
    expect(fs.readFileSync(path.join(cache, "helper.py"), "utf8")).toBe(
      "print(1)",
    );
  });
  it("publishes edits, nested renames and deletes and survives reopening", async () => {
    await mutateSkillPackage(db, id, {
      kind: "write",
      relativePath: "docs/嵌套.txt",
      content: "new",
    });
    await mutateSkillPackage(db, id, {
      kind: "write",
      relativePath: "helper.py",
      content: "print(2)",
    });
    await mutateSkillPackage(db, id, {
      kind: "rename",
      relativePath: "docs",
      newRelativePath: "notes",
    });
    await mutateSkillPackage(db, id, {
      kind: "delete",
      relativePath: "helper.py",
    });
    database.close();
    database = new DatabaseAdapter(path.join(root, "data", "prompthub.db"));
    db = new SkillStorageDB(database);
    expect(fs.existsSync(path.join(cache, "helper.py"))).toBe(false);
    expect(fs.existsSync(path.join(cache, "docs"))).toBe(false);
    expect(fs.readFileSync(path.join(cache, "notes/嵌套.txt"), "utf8")).toBe(
      "new",
    );
    expect(db.getById(id)?.directory_fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not touch stored package bytes when publication fails", async () => {
    vi.spyOn(db, "update").mockImplementation(() => {
      throw new Error("publication denied");
    });
    await expect(
      mutateSkillPackage(db, id, {
        kind: "write",
        relativePath: "helper.py",
        content: "bad",
      }),
    ).rejects.toThrow("publication denied");
    expect(fs.readFileSync(path.join(cache, "helper.py"), "utf8")).toBe(
      "print(1)",
    );
  });

  it.each([
    { kind: "delete", relativePath: "SKILL.md" },
    { kind: "write", relativePath: "../outside", content: "bad" },
    { kind: "rename", relativePath: "helper.py", newRelativePath: "SKILL.md" },
    {
      kind: "rename",
      relativePath: "helper.py",
      newRelativePath: ".prompthub/lost.py",
    },
  ] as const)(
    "rejects unsafe or incomplete resulting packages (%#)",
    async (mutation) => {
      await expect(mutateSkillPackage(db, id, mutation)).rejects.toThrow();
      expect(fs.readFileSync(path.join(cache, "SKILL.md"), "utf8")).toBe(
        "# Skill",
      );
    },
  );

  it("restores binary snapshots into the managed package and keeps bytes in history", async () => {
    const files = [
      { relativePath: "SKILL.md", content: "# Restored" },
      {
        relativePath: "asset.bin",
        content: "AP+A",
        encoding: "base64" as const,
      },
    ];
    await mutateSkillPackage(db, id, { kind: "replace", files });
    db.createVersion(id, "binary", files);
    database.close();
    database = new DatabaseAdapter(path.join(root, "data", "prompthub.db"));
    db = new SkillStorageDB(database);
    expect(fs.readFileSync(path.join(cache, "asset.bin"))).toEqual(
      Buffer.from([0, 255, 128]),
    );
    expect(db.getVersions(id)[0].filesSnapshot).toEqual(files);
  });

  it("serializes overlapping edits with a SQL baseline conflict instead of silently losing one", async () => {
    const results = await Promise.allSettled([
      mutateSkillPackage(db, id, {
        kind: "write",
        relativePath: "one.txt",
        content: "one",
      }),
      mutateSkillPackage(db, id, {
        kind: "write",
        relativePath: "two.txt",
        content: "two",
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(
      fs
        .readdirSync(getOperationsDir())
        .filter((name) => name.startsWith("skill-edit-")),
    ).toEqual([]);
  });

  it("keeps external and internal metadata operations on their existing owners", async () => {
    expect(
      await mutateSkillPackage(db, id, {
        kind: "write",
        relativePath: ".prompthub/state.json",
        content: "{}",
      }),
    ).toBe(false);
    await expect(
      mutateSkillPackage(db, "missing", {
        kind: "delete",
        relativePath: "x",
      }),
    ).rejects.toThrow("Skill not found");
    configureRuntimePaths({ userDataPath: path.join(root, "legacy") });
    expect(
      await mutateSkillPackage(db, id, {
        kind: "delete",
        relativePath: "helper.py",
      }),
    ).toBe(false);
  });

  it("cleans staging when the owning Skill disappears before publication", async () => {
    vi.spyOn(db, "update").mockReturnValue(null);
    await expect(
      mutateSkillPackage(db, id, {
        kind: "write",
        relativePath: "helper.py",
        content: "new",
      }),
    ).rejects.toThrow(/disappeared/);
    expect(
      fs
        .readdirSync(getOperationsDir())
        .filter((name) => name.startsWith("skill-edit-")),
    ).toEqual([]);
  });
});
