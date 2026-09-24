import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseAdapter, SCHEMA } from "@prompthub/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanonicalSkillDB } from "../src/canonical-skill-db";
import {
  configureRuntimePaths,
  getOperationsDir,
  resetRuntimePaths,
} from "../src/runtime-paths";
import {
  writeCanonicalStorageAuthority,
  writeRuntimeLayoutState,
} from "../src";
import { readSkillResourceBundle } from "../src/skill-resource-schema";
import {
  createLibrarySkill,
  prepareLibrarySkillEdit,
} from "../src/skills/library-commands";

describe("Skill library commands", () => {
  let root: string;
  let database: DatabaseAdapter.Database;
  let db: CanonicalSkillDB;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-crud-"));
    configureRuntimePaths({ userDataPath: root });
    writeRuntimeLayoutState(root);
    writeCanonicalStorageAuthority(root, {
      consistencyId: "d".repeat(64),
      operationId: "crud-test",
    });
    database = new DatabaseAdapter(":memory:");
    database.exec(SCHEMA);
    db = new CanonicalSkillDB(database);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    database.close();
    resetRuntimePaths();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const create = () =>
    createLibrarySkill(db, {
      name: "writer",
      protocol_type: "skill",
      is_favorite: false,
      content: "---\nname: writer\nlicense: MIT\ntags: [source]\n---\nOriginal",
      tags: ["personal"],
    });
  const bundle = (id: string) =>
    readSkillResourceBundle(path.join(root, "data/skills", id));

  it("creates a complete package and edits body, metadata and history with one publication", async () => {
    const skill = await create();
    expect(
      fs.readFileSync(path.join(skill.local_repo_path!, "SKILL.md"), "utf8"),
    ).toContain("Original");
    fs.writeFileSync(
      path.join(skill.local_repo_path!, "asset.bin"),
      Buffer.from([0, 255, 1]),
    );
    db.update(skill.id, {});
    const before = bundle(skill.id);
    const edit = await prepareLibrarySkillEdit(db, skill.id, {
      name: "author",
      instructions:
        "---\nname: writer\nlicense: MIT\ntags: [source]\n---\nUpdated",
    });
    try {
      edit!.commit();
    } finally {
      await edit!.dispose();
    }
    const after = bundle(skill.id);
    expect(after.bundleManifest.revision).toBe(
      before.bundleManifest.revision + 1,
    );
    expect(after.versions).toHaveLength(before.versions.length + 1);
    expect(
      after.versions
        .at(-1)
        ?.filesSnapshot?.find((f) => f.relativePath === "SKILL.md")?.content,
    ).toContain("Original");
    expect(
      fs.readFileSync(
        path.join(after.skill.local_repo_path!, "SKILL.md"),
        "utf8",
      ),
    ).toContain("name: author");
    expect(
      fs.readFileSync(path.join(after.skill.local_repo_path!, "asset.bin")),
    ).toEqual(Buffer.from([0, 255, 1]));
    expect(after.skill.tags).toEqual(["personal"]);
    expect(after.skill.content).toContain("license: MIT");
    expect(after.skill.content).toContain("- source");
    expect(after.skill.local_repo_path).not.toContain("author");
  });
  it("does not publish a version or lose bytes if finalization fails", async () => {
    const skill = await create();
    const before = bundle(skill.id);
    const edit = await prepareLibrarySkillEdit(db, skill.id, {
      content: "changed",
    });
    vi.spyOn(db, "finalizePackageUpdate").mockImplementationOnce(() => {
      throw new Error("disk full");
    });
    try {
      expect(() => edit!.commit()).toThrow("disk full");
    } finally {
      await edit!.dispose();
    }
    expect(bundle(skill.id).bundleManifest.revision).toBe(
      before.bundleManifest.revision,
    );
    expect(db.getById(skill.id)?.content).toContain("Original");
  });
  it("rejects stale edits and invalid names before publishing", async () => {
    const skill = await create();
    const edit = await prepareLibrarySkillEdit(db, skill.id, {
      content: "stale",
    });
    db.update(skill.id, { description: "newer" });
    try {
      expect(() => edit!.commit()).toThrow(/changed/);
    } finally {
      await edit!.dispose();
    }
    await expect(
      prepareLibrarySkillEdit(db, skill.id, { name: "../bad" }),
    ).rejects.toThrow(/name/);
    await expect(
      createLibrarySkill(db, {
        name: "bad\0name",
        protocol_type: "skill",
        is_favorite: false,
      }),
    ).rejects.toThrow();
  });
  it("keeps metadata-only user tags out of source frontmatter", async () => {
    const skill = await create();
    const edit = await prepareLibrarySkillEdit(db, skill.id, {
      tags: ["mine"],
    });
    try {
      edit!.commit();
    } finally {
      await edit!.dispose();
    }
    expect(db.getById(skill.id)?.tags).toEqual(["mine"]);
    expect(
      fs.readFileSync(path.join(skill.local_repo_path!, "SKILL.md"), "utf8"),
    ).not.toContain("mine");
    await expect(
      prepareLibrarySkillEdit(db, "missing", {}),
    ).resolves.toBeNull();
  });
  it("rejects malformed entrypoints, relocation and failed staging without changing the package", async () => {
    const skill = await create();
    const before = bundle(skill.id).bundleManifest.revision;
    await expect(
      prepareLibrarySkillEdit(db, skill.id, {
        content: "---\nname: [\n---\ninvalid",
      }),
    ).rejects.toThrow(/frontmatter/);
    await expect(
      prepareLibrarySkillEdit(db, skill.id, { local_repo_path: root }),
    ).rejects.toThrow(/relocation/);
    await expect(
      createLibrarySkill(db, {
        name: "imported",
        local_repo_path: root,
        is_favorite: false,
        protocol_type: "skill",
      }),
    ).rejects.toThrow(/lifecycle/);
    expect(bundle(skill.id).bundleManifest.revision).toBe(before);
    const operations = getOperationsDir();
    expect(
      fs
        .readdirSync(operations)
        .filter((name) => name.startsWith("skill-save-")),
    ).toEqual([]);
  });
  it("requires canonical migration instead of taking a legacy write path", async () => {
    const otherRoot = path.join(root, "unmigrated");
    configureRuntimePaths({ userDataPath: otherRoot });
    await expect(
      createLibrarySkill(db, {
        name: "writer",
        is_favorite: false,
        protocol_type: "skill",
      }),
    ).rejects.toThrow(/migration/);
    expect(db.getAll()).toEqual([]);
  });
  it("supports an empty new body and metadata-only edits while preserving source fields", async () => {
    const skill = await createLibrarySkill(db, {
      name: "empty",
      protocol_type: "skill",
      is_favorite: false,
    });
    const edit = await prepareLibrarySkillEdit(db, skill.id, {
      description: "Description",
      author: "Author",
      version: "2.0",
    });
    try {
      edit!.commit();
    } finally {
      await edit!.dispose();
    }
    expect(db.getById(skill.id)?.content).toContain("description: Description");
    const next = await prepareLibrarySkillEdit(db, skill.id, {
      content: "New body",
    });
    try {
      next!.commit();
    } finally {
      await next!.dispose();
    }
    expect(db.getById(skill.id)?.content).toContain("author: Author");
  });
  it("rejects malformed IPC-shaped fields and missing entrypoints without fallback writes", async () => {
    for (const data of [
      null,
      [],
      { name: 3 },
      { name: "writer", content: 3 },
      { name: "writer", description: "bad\0value" },
      { protocol_type: "skill" },
    ]) {
      await expect(
        Reflect.apply(createLibrarySkill, undefined, [db, data]),
      ).rejects.toThrow();
    }
    const noPackage = db.create({
      name: "no-entry",
      protocol_type: "skill",
      is_favorite: false,
    });
    await expect(
      prepareLibrarySkillEdit(db, noPackage.id, { name: "new-entry" }),
    ).rejects.toThrow(/entrypoint/);
    const skill = await create();
    const edit = await prepareLibrarySkillEdit(db, skill.id, {
      content: "New",
    });
    vi.spyOn(db, "finalizePackageUpdate").mockReturnValueOnce(null);
    try {
      expect(() => edit!.commit()).toThrow(/disappeared/);
    } finally {
      await edit!.dispose();
    }
    vi.spyOn(db, "create").mockImplementationOnce(() => {
      throw new Error("creation failed");
    });
    await expect(
      createLibrarySkill(db, {
        name: "failed",
        protocol_type: "skill",
        is_favorite: false,
      }),
    ).rejects.toThrow("creation failed");
  });
});
