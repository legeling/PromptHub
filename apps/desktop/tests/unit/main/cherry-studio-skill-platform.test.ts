/** @vitest-environment node */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
import Database from "../../../src/main/database/sqlite";
import { createCherryStudioSchema } from "../../fixtures/cherry-studio";
import {
  getCherryStudioPlatformSkillMetadata,
  getCherryStudioSkillStatus,
  installCherryStudioSkill,
  uninstallCherryStudioPlatformSkill,
  uninstallCherryStudioSkill,
} from "../../../src/main/services/cherry-studio-skill-platform";

const platform: SkillPlatform = {
  id: "cherry-studio",
  name: "Cherry Studio",
  icon: "Bot",
  rootDir: { darwin: "/unused", win32: "/unused", linux: "/unused" },
  skillsRelativePath: "Data/Skills",
};
let root: string;
let source: string;
let dbPath: string;
const options = () => ({ overrides: { "cherry-studio": root } });
const library = () => path.join(root, "Data", "Skills", "writer");
const mirror = () =>
  path.join(root, "Data", "Agents", ".claude", "skills", "writer");
const entry =
  '---\nname: writer\ndescription: "Writer\'s helper"\nversion: 2.0.0\n---\n# Writer';
const bytes = Buffer.from([0, 1, 128, 255]);

function query(sql: string): unknown {
  const db = new Database(dbPath);
  try {
    return db.get(sql);
  } finally {
    db.close();
  }
}
function execute(sql: string): void {
  const db = new Database(dbPath);
  try {
    db.exec(sql);
  } finally {
    db.close();
  }
}
async function install(): Promise<void> {
  await installCherryStudioSkill(platform, "writer", source, options());
}
async function expectPackage(
  directory: string,
  content = entry,
): Promise<void> {
  expect(await fs.readFile(path.join(directory, "SKILL.md"), "utf8")).toBe(
    content,
  );
  expect(
    await fs.readFile(path.join(directory, "assets", "binary.bin")),
  ).toEqual(bytes);
}

describe("Cherry Studio current catalog distribution", () => {
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "ph-cherry-skill-"));
    dbPath = path.join(root, "Data", "cherrystudio.sqlite");
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    const db = new Database(dbPath);
    createCherryStudioSchema(db);
    db.close();
    source = path.join(root, "source");
    await fs.mkdir(path.join(source, "assets"), { recursive: true });
    await fs.writeFile(path.join(source, "SKILL.md"), entry);
    await fs.writeFile(path.join(source, "assets", "binary.bin"), bytes);
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("copies the full package, registers metadata and creates the native runtime projection", async () => {
    await install();
    await expectPackage(library());
    await expectPackage(mirror());
    await expectPackage(source);
    expect((await fs.lstat(library())).isSymbolicLink()).toBe(false);
    expect((await fs.lstat(mirror())).isSymbolicLink()).toBe(
      process.platform !== "win32",
    );
    expect(query("SELECT * FROM agent_global_skill")).toMatchObject({
      name: "writer",
      description: "Writer's helper",
      version: "2.0.0",
      source: "local",
      is_enabled: 1,
      folder_name: "writer",
      content_hash: expect.stringMatching(/^directory-sha256:[a-f0-9]{64}$/),
    });
    expect(
      await getCherryStudioSkillStatus(platform, "writer", options()),
    ).toBe(true);
    await fs.rm(mirror(), { recursive: true });
    expect(
      await getCherryStudioSkillStatus(platform, "writer", options()),
    ).toBe(false);
  });

  it("dereferences a linked source root while publishing an independent library copy", async () => {
    const link = path.join(root, "source-link");
    await fs.symlink(
      source,
      link,
      process.platform === "win32" ? "junction" : "dir",
    );
    await installCherryStudioSkill(platform, "writer", link, options());
    await expectPackage(library());
    expect((await fs.lstat(library())).isSymbolicLink()).toBe(false);
  });

  it("updates assets and directory hash while retaining identity, provenance and enablement", async () => {
    await install();
    const identity = query(
      "SELECT id, source, source_url, namespace FROM agent_global_skill",
    );
    const oldHash = query("SELECT content_hash FROM agent_global_skill");
    execute(
      "UPDATE agent_global_skill SET is_enabled=0; INSERT INTO agent_skill (agent_id, skill_id, is_enabled) SELECT 'agent-1', id, 1 FROM agent_global_skill",
    );
    await fs.writeFile(path.join(source, "assets", "extra.txt"), "new asset");
    await install();
    expect(
      query("SELECT id, source, source_url, namespace FROM agent_global_skill"),
    ).toEqual(identity);
    expect(query("SELECT content_hash FROM agent_global_skill")).not.toEqual(
      oldHash,
    );
    expect(query("SELECT is_enabled FROM agent_global_skill")).toEqual({
      is_enabled: 0,
    });
    expect(query("SELECT is_enabled FROM agent_skill")).toEqual({
      is_enabled: 1,
    });
    for (const target of [library(), mirror()]) {
      expect(
        await fs.readFile(path.join(target, "assets", "extra.txt"), "utf8"),
      ).toBe("new asset");
    }
  });

  it("removes catalog, selections, library and native mirror while preserving source", async () => {
    await install();
    execute(
      "INSERT INTO agent_skill (agent_id, skill_id) SELECT 'agent-1', id FROM agent_global_skill",
    );
    await uninstallCherryStudioPlatformSkill(platform, library(), options());
    expect(query("SELECT count(*) AS total FROM agent_global_skill")).toEqual({
      total: 0,
    });
    expect(query("SELECT count(*) AS total FROM agent_skill")).toEqual({
      total: 0,
    });
    for (const target of [library(), mirror()])
      await expect(fs.lstat(target)).rejects.toMatchObject({ code: "ENOENT" });
    await expectPackage(source);
    expect(
      await getCherryStudioSkillStatus(platform, "writer", options()),
    ).toBe(false);
  });

  it.each(["builtin", "marketplace"])(
    "preserves a protected %s package on local replacement",
    async (kind) => {
      await install();
      const db = new Database(dbPath);
      db.run("UPDATE agent_global_skill SET source=?", kind);
      db.close();
      await fs.writeFile(path.join(source, "SKILL.md"), entry + "\nchanged");
      await expect(install()).rejects.toMatchObject({
        code: "target-protected",
      });
      await expectPackage(library());
      await expectPackage(mirror());
    },
  );

  it("identifies builtins and refuses their removal without changing the catalog or files", async () => {
    await install();
    execute("UPDATE agent_global_skill SET source='builtin'");
    expect(
      await getCherryStudioPlatformSkillMetadata(
        platform,
        library(),
        options(),
      ),
    ).toEqual({ isBuiltin: true });
    await expect(
      uninstallCherryStudioSkill(platform, "writer", options()),
    ).rejects.toMatchObject({ code: "target-protected" });
    await expectPackage(library());
    expect(query("SELECT source FROM agent_global_skill")).toEqual({
      source: "builtin",
    });
  });

  it.each(["agents.db", "agent.db", "../cherrystudio.sqlite"])(
    "does not write to historical %s when the current database is absent",
    async (legacyName) => {
      const legacy = path.resolve(root, "Data", legacyName);
      await fs.rename(dbPath, legacy);
      const before = await fs.readFile(legacy);
      await expect(install()).rejects.toMatchObject({
        code: "cherry-database-unavailable",
      });
      expect(await fs.readFile(legacy)).toEqual(before);
      await expect(fs.lstat(library())).rejects.toMatchObject({
        code: "ENOENT",
      });
    },
  );

  it("rejects an incompatible current schema before publishing files and closes the database", async () => {
    execute("ALTER TABLE agent_global_skill DROP COLUMN version");
    const before = await fs.readFile(dbPath);
    await expect(install()).rejects.toMatchObject({
      code: "cherry-schema-unsupported",
    });
    expect(await fs.readFile(dbPath)).toEqual(before);
    await fs.rename(dbPath, dbPath + ".closed");
    await expect(fs.lstat(library())).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects symlink distribution before catalog or filesystem mutation", async () => {
    const before = await fs.readFile(dbPath);
    await expect(
      installCherryStudioSkill(platform, "writer", source, {
        ...options(),
        mode: "symlink",
      }),
    ).rejects.toMatchObject({ code: "cherry-copy-only" });
    expect(await fs.readFile(dbPath)).toEqual(before);
    await expect(fs.lstat(library())).rejects.toMatchObject({ code: "ENOENT" });
    await expectPackage(source);
  });

  it("rejects unregistered occupied targets and paths outside the library", async () => {
    await fs.cp(source, library(), { recursive: true });
    expect(
      await getCherryStudioSkillStatus(platform, "writer", options()),
    ).toBe(false);
    await expect(install()).rejects.toMatchObject({ code: "target-conflict" });
    await expect(
      uninstallCherryStudioPlatformSkill(platform, source, options()),
    ).rejects.toThrow("Path traversal");
    await expect(
      uninstallCherryStudioSkill(platform, "writer", options()),
    ).rejects.toMatchObject({ code: "target-conflict" });
    await expectPackage(library());
    await expectPackage(source);
  });

  it.each(["UPDATE", "DELETE"])(
    "rolls back library and mirror when catalog %s fails",
    async (operation) => {
      await install();
      const before = query("SELECT * FROM agent_global_skill");
      execute(
        "CREATE TRIGGER reject_change BEFORE " +
          operation +
          " ON agent_global_skill BEGIN SELECT RAISE(ABORT, 'injected catalog failure'); END",
      );
      await fs.writeFile(path.join(source, "SKILL.md"), entry + "\nnew");
      await expect(
        operation === "UPDATE"
          ? install()
          : uninstallCherryStudioSkill(platform, "writer", options()),
      ).rejects.toThrow("injected catalog failure");
      expect(query("SELECT * FROM agent_global_skill")).toEqual(before);
      await expectPackage(library());
      await expectPackage(mirror());
      expect(await fs.readdir(path.dirname(library()))).toEqual(["writer"]);
      expect(await fs.readdir(path.dirname(mirror()))).toEqual(["writer"]);
    },
  );
});
