import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { replaceSkillDestination } from "../src/skills/destination";

describe("Skill destination replacement", () => {
  let root: string;
  let target: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-target-"));
    target = path.join(root, "writer");
    await fs.mkdir(target);
    await fs.writeFile(path.join(target, "SKILL.md"), "old");
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });
  it("preserves the working package when staging fails after partial copy", async () => {
    await expect(
      replaceSkillDestination(target, async (stage) => {
        await fs.mkdir(stage);
        await fs.writeFile(path.join(stage, "SKILL.md"), "partial");
        throw new Error("ENOSPC");
      }),
    ).rejects.toThrow("ENOSPC");
    expect(await fs.readFile(path.join(target, "SKILL.md"), "utf8")).toBe(
      "old",
    );
    expect(await fs.readdir(root)).toEqual(["writer"]);
  });
  it("restores the old target when publishing a missing stage fails", async () => {
    await expect(
      replaceSkillDestination(target, async () => {}),
    ).rejects.toThrow();
    expect(await fs.readFile(path.join(target, "SKILL.md"), "utf8")).toBe(
      "old",
    );
    expect(await fs.readdir(root)).toEqual(["writer"]);
  });
  it("replaces copies and broken symlinks without leaving staging or backup directories", async () => {
    await replaceSkillDestination(target, async (stage) => {
      await fs.mkdir(stage);
      await fs.writeFile(path.join(stage, "SKILL.md"), "new");
    });
    expect(await fs.readFile(path.join(target, "SKILL.md"), "utf8")).toBe(
      "new",
    );
    await fs.rm(target, { recursive: true });
    await fs.symlink(path.join(root, "missing"), target);
    await replaceSkillDestination(target, async (stage) => {
      await fs.mkdir(stage);
      await fs.writeFile(path.join(stage, "SKILL.md"), "restored");
    });
    expect(await fs.readFile(path.join(target, "SKILL.md"), "utf8")).toBe(
      "restored",
    );
    expect(await fs.readdir(root)).toEqual(["writer"]);
  });
  it("installs a new target and rejects an inaccessible prior target without removing it", async () => {
    await fs.rm(target, { recursive: true });
    await replaceSkillDestination(target, async (stage) => {
      await fs.mkdir(stage);
      await fs.writeFile(path.join(stage, "SKILL.md"), "new");
    });
    vi.spyOn(fs, "lstat").mockRejectedValueOnce(
      Object.assign(new Error("denied"), { code: "EACCES" }),
    );
    await expect(
      replaceSkillDestination(target, async (stage) => {
        await fs.mkdir(stage);
      }),
    ).rejects.toThrow("denied");
    expect(await fs.readFile(path.join(target, "SKILL.md"), "utf8")).toBe(
      "new",
    );
  });
  it("retains the recovery backup when publication and rollback renames fail", async () => {
    const rename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (from === target) return rename(from, to);
      throw new Error("filesystem unavailable");
    });
    await expect(
      replaceSkillDestination(target, async (stage) => {
        await fs.mkdir(stage);
      }),
    ).rejects.toThrow(/backup for recovery/);
    const backup = (await fs.readdir(root)).find((name) =>
      name.includes(".backup-"),
    );
    expect(
      await fs.readFile(path.join(root, backup!, "SKILL.md"), "utf8"),
    ).toBe("old");
  });
  it("never restores a partly removed backup after publication", async () => {
    const rm = fs.rm.bind(fs);
    vi.spyOn(fs, "rm").mockImplementation(async (file, options) => {
      if (String(file).includes(".backup-")) throw new Error("cleanup denied");
      return rm(file, options);
    });
    await expect(
      replaceSkillDestination(target, async (stage) => {
        await fs.mkdir(stage);
        await fs.writeFile(path.join(stage, "SKILL.md"), "new");
      }),
    ).rejects.toThrow("cleanup denied");
    expect(await fs.readFile(path.join(target, "SKILL.md"), "utf8")).toBe(
      "new",
    );
  });
  it("copies a bounded 2 MiB package without duplicate target trees", async () => {
    const source = path.join(root, "source");
    await fs.mkdir(source);
    const bytes = Buffer.alloc(16 * 1024, 7);
    for (let index = 0; index < 128; index++)
      await fs.writeFile(path.join(source, `file-${index}`), bytes);
    const started = performance.now();
    await replaceSkillDestination(target, (stage) =>
      fs.cp(source, stage, { recursive: true }),
    );
    expect(await fs.readdir(target)).toHaveLength(128);
    expect((await fs.readdir(root)).sort()).toEqual(["source", "writer"]);
    console.info(
      `Skill replacement fixture: 128 files / 2 MiB in ${Math.round(performance.now() - started)} ms`,
    );
  });
});
