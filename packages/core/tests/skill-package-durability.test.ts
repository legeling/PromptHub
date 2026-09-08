import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseAdapter, SCHEMA } from "@prompthub/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanonicalSkillDB } from "../src/canonical-skill-db";
import {
  getCanonicalSkillWorkspacePath,
  hydrateCanonicalSkillWorkspace,
  publishCanonicalSkill,
} from "../src/canonical-skill-library";
import { mutateCanonicalSkillPackage } from "../src/skills/canonical-package-mutation";
import { readSkillResourceBundle } from "../src/skill-resource-schema";
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
  let db: CanonicalSkillDB;
  let id: string;
  let bundle: string;
  let cache: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-durability-"));
    configureRuntimePaths({ userDataPath: root });
    writeRuntimeLayoutState(root);
    writeCanonicalStorageAuthority(root, {
      consistencyId: "d".repeat(64),
      operationId: "skill-test",
    });
    database = new DatabaseAdapter(":memory:");
    database.exec(SCHEMA);
    db = new CanonicalSkillDB(database);
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
    bundle = path.join(root, "data", "skills", id);
    cache = getCanonicalSkillWorkspacePath(id);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    database.close();
    resetRuntimePaths();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("retains canonical bytes and reconstructs missing cache on favorite update", () => {
    fs.rmSync(cache, { recursive: true });
    expect(db.update(id, { is_favorite: true })?.is_favorite).toBe(true);
    expect(readSkillResourceBundle(bundle).packageFiles).toHaveLength(2);
    expect(fs.readFileSync(path.join(cache, "helper.py"), "utf8")).toBe(
      "print(1)",
    );
  });

  it("rejects an explicitly missing package source without replacing canonical bytes", () => {
    const before = fs.readFileSync(path.join(bundle, "manifest.json"));
    expect(() =>
      publishCanonicalSkill({
        skill: db.getById(id)!,
        versions: db.getVersions(id),
        packageSourcePath: path.join(root, "missing"),
      }),
    ).toThrow();
    expect(fs.readFileSync(path.join(bundle, "manifest.json"))).toEqual(before);
  });

  it("publishes edits, nested renames and deletes and survives reconstruction", async () => {
    await mutateCanonicalSkillPackage(db, id, {
      kind: "write",
      relativePath: "docs/嵌套.txt",
      content: "new",
    });
    await mutateCanonicalSkillPackage(db, id, {
      kind: "write",
      relativePath: "helper.py",
      content: "print(2)",
    });
    await mutateCanonicalSkillPackage(db, id, {
      kind: "rename",
      relativePath: "docs",
      newRelativePath: "notes",
    });
    await mutateCanonicalSkillPackage(db, id, {
      kind: "delete",
      relativePath: "helper.py",
    });
    hydrateCanonicalSkillWorkspace(id);
    expect(fs.existsSync(path.join(cache, "helper.py"))).toBe(false);
    expect(fs.existsSync(path.join(cache, "docs"))).toBe(false);
    expect(fs.readFileSync(path.join(cache, "notes/嵌套.txt"), "utf8")).toBe(
      "new",
    );
    expect(db.getById(id)?.directory_fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not touch cache/canonical when publication fails", async () => {
    vi.spyOn(db, "update").mockImplementation(() => {
      throw new Error("publication denied");
    });
    await expect(
      mutateCanonicalSkillPackage(db, id, {
        kind: "write",
        relativePath: "helper.py",
        content: "bad",
      }),
    ).rejects.toThrow("publication denied");
    expect(fs.readFileSync(path.join(cache, "helper.py"), "utf8")).toBe(
      "print(1)",
    );
    expect(
      fs.readFileSync(
        readSkillResourceBundle(bundle).packageFiles.find(
          (f) => f.path === "helper.py",
        )!.absolutePath,
        "utf8",
      ),
    ).toBe("print(1)");
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
      await expect(
        mutateCanonicalSkillPackage(db, id, mutation),
      ).rejects.toThrow();
      expect(fs.readFileSync(path.join(cache, "SKILL.md"), "utf8")).toBe(
        "# Skill",
      );
    },
  );

  it("restores binary snapshots into canonical authority and keeps bytes in history", async () => {
    const files = [
      { relativePath: "SKILL.md", content: "# Restored" },
      {
        relativePath: "asset.bin",
        content: "AP+A",
        encoding: "base64" as const,
      },
    ];
    await mutateCanonicalSkillPackage(db, id, { kind: "replace", files });
    db.createVersion(id, "binary", files);
    fs.rmSync(cache, { recursive: true });
    hydrateCanonicalSkillWorkspace(id);
    expect(fs.readFileSync(path.join(cache, "asset.bin"))).toEqual(
      Buffer.from([0, 255, 128]),
    );
    expect(db.getVersions(id)[0].filesSnapshot).toEqual(files);
    expect(readSkillResourceBundle(bundle).versions[0].filesSnapshot).toEqual(
      files,
    );
  });

  it("serializes overlapping edits with a revision conflict instead of silently losing one", async () => {
    const results = await Promise.allSettled([
      mutateCanonicalSkillPackage(db, id, {
        kind: "write",
        relativePath: "one.txt",
        content: "one",
      }),
      mutateCanonicalSkillPackage(db, id, {
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

  it("keeps legacy and internal metadata operations on their existing owners", async () => {
    expect(
      await mutateCanonicalSkillPackage(db, id, {
        kind: "write",
        relativePath: ".prompthub/state.json",
        content: "{}",
      }),
    ).toBe(false);
    await expect(
      mutateCanonicalSkillPackage(db, "missing", {
        kind: "delete",
        relativePath: "x",
      }),
    ).rejects.toThrow("Skill not found");
    configureRuntimePaths({ userDataPath: path.join(root, "legacy") });
    expect(
      await mutateCanonicalSkillPackage(db, id, {
        kind: "delete",
        relativePath: "helper.py",
      }),
    ).toBe(false);
  });

  it("cleans staging when the owning Skill disappears before publication", async () => {
    vi.spyOn(db, "update").mockReturnValue(null);
    await expect(
      mutateCanonicalSkillPackage(db, id, {
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
