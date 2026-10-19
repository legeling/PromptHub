/** @vitest-environment node */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseAdapter, SCHEMA } from "@prompthub/db";
import { SkillStorageDB } from "@prompthub/core/skill-storage";
import {
  configureRuntimePaths,
  resetRuntimePaths,
} from "@prompthub/core/runtime-paths";
import {
  writeCanonicalStorageAuthority,
  writeRuntimeLayoutState,
} from "@prompthub/core";
import { createLibrarySkill } from "@prompthub/core/skills/library-commands";
import { mutateSkillPackage } from "@prompthub/core/skills/package-mutation";
import { updateLibrarySkill } from "../../../src/main/services/skill-library-crud";
import {
  installSkillMdForSkill,
  getSkillMdInstallStatusForSkill,
} from "../../../src/main/services/skill-installer-platform";

const state = vi.hoisted(() => ({ root: "" }));
vi.mock("../../../src/main/services/skill-installer", async () => ({
  SkillInstaller:
    await import("../../../src/main/services/skill-installer-platform"),
}));
vi.mock(
  "../../../src/main/services/skill-installer-utils",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../../src/main/services/skill-installer-utils")
    >()),
    getPlatformRootDir: () => state.root,
    getPlatformSkillsDir: () => path.join(state.root, "platform"),
    getBuiltinAgentOverride: () => undefined,
    getCustomAgentPlatforms: () => [],
    getConfiguredBuiltinAgentPlatformIds: () => [],
  }),
);
vi.mock("@prompthub/shared/constants/platforms", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@prompthub/shared/constants/platforms")
    >();
  return {
    ...actual,
    SKILL_PLATFORMS: actual.SKILL_PLATFORMS.filter(
      (platform) => platform.id === "claude",
    ),
  };
});

describe("Skill rename against actual platform files", () => {
  let root: string;
  let database: DatabaseAdapter.Database;
  let db: SkillStorageDB;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-platform-crud-"));
    state.root = root;
    configureRuntimePaths({ userDataPath: root });
    writeRuntimeLayoutState(root);
    writeCanonicalStorageAuthority(root, {
      consistencyId: "d".repeat(64),
      operationId: "platform-crud",
    });
    database = new DatabaseAdapter(path.join(root, "data", "prompthub.db"));
    database.exec(SCHEMA);
    db = new SkillStorageDB(database);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    database.close();
    resetRuntimePaths();
    fs.rmSync(root, { recursive: true, force: true });
  });
  async function prepare() {
    const skill = await createLibrarySkill(db, {
      name: "writer",
      content: "Original",
      protocol_type: "skill",
      is_favorite: false,
    });
    await mutateSkillPackage(db, skill.id, {
      kind: "write",
      relativePath: "notes.txt",
      content: "Package resource",
    });
    const current = db.getById(skill.id)!;
    await installSkillMdForSkill(
      current,
      current.content!,
      "claude",
      current.local_repo_path,
    );
    return current;
  }
  it("retains the new directory and activation while removing only the old directory", async () => {
    const skill = await prepare();
    const updated = await updateLibrarySkill(db, skill.id, { name: "author" });
    expect(fs.existsSync(path.join(root, "platform/writer"))).toBe(false);
    expect(
      fs.readFileSync(path.join(root, "platform/author/SKILL.md"), "utf8"),
    ).toContain("name: author");
    expect(
      fs.readFileSync(path.join(root, "platform/author/notes.txt"), "utf8"),
    ).toBe("Package resource");
    expect((await getSkillMdInstallStatusForSkill(updated!)).claude).toBe(true);
  });
  it("rejects rename before changing targets when a deployed package was externally edited", async () => {
    const skill = await prepare();
    const target = path.join(root, "platform/writer/notes.txt");
    fs.writeFileSync(target, "Local platform edits");
    const activationPath = path.join(
      root,
      "platform/.prompthub-platform-activations.json",
    );
    const activation = fs.readFileSync(activationPath, "utf8");
    await expect(
      updateLibrarySkill(db, skill.id, { name: "author" }),
    ).rejects.toThrow("external changes");
    expect(fs.readFileSync(target, "utf8")).toBe("Local platform edits");
    expect(fs.existsSync(path.join(root, "platform/author"))).toBe(false);
    expect(fs.readFileSync(activationPath, "utf8")).toBe(activation);
    expect(db.getById(skill.id)?.name).toBe("writer");
    expect(
      fs
        .readdirSync(path.join(root, "data/operations"))
        .filter((name) => name.startsWith("skill-rename-")),
    ).toEqual([]);
  });
  it("restores actual deployed bytes and activation if the final library commit fails", async () => {
    const skill = await prepare();
    vi.spyOn(db, "finalizePackageUpdate").mockImplementationOnce(() => {
      throw new Error("disk full");
    });
    await expect(
      updateLibrarySkill(db, skill.id, { name: "author" }),
    ).rejects.toThrow("disk full");
    expect(fs.existsSync(path.join(root, "platform/author"))).toBe(false);
    expect(
      fs.readFileSync(path.join(root, "platform/writer/notes.txt"), "utf8"),
    ).toBe("Package resource");
    expect((await getSkillMdInstallStatusForSkill(skill)).claude).toBe(true);
    expect(db.getById(skill.id)?.name).toBe("writer");
  });
});
