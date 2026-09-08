import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readSkillFileSnapshots,
  writeSkillFileSnapshots,
  replaceSkillFileSnapshots,
} from "../src/skills/file-snapshot";
import {
  MAX_SKILL_PACKAGE_FILE_BYTES,
  MAX_SKILL_PACKAGE_FILES,
} from "@prompthub/shared/constants/skill-package";

describe("Skill snapshot filesystem", () => {
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-bytes-"));
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  it("preserves complete nested text/binary packages above preview limits", async () => {
    const source = path.join(root, "source");
    const target = path.join(root, "target");
    const files = {
      "SKILL.md": Buffer.from("# Skill"),
      "docs/说明.txt": Buffer.from("文本\n".repeat(150_000)),
      "scripts/setup.sh": Buffer.from("#!/bin/sh\necho ok"),
      "assets/icon.png": Buffer.from([137, 80, 78, 71, 0, 255]),
    };
    for (const [name, bytes] of Object.entries(files)) {
      await fs.mkdir(path.dirname(path.join(source, name)), {
        recursive: true,
      });
      await fs.writeFile(path.join(source, name), bytes);
    }
    await fs.mkdir(path.join(source, ".prompthub"));
    await fs.writeFile(path.join(source, ".prompthub", "private.json"), "{}");
    const snapshot = await readSkillFileSnapshots(source);
    expect(snapshot.map((file) => file.relativePath).sort()).toEqual(
      Object.keys(files).sort(),
    );
    await writeSkillFileSnapshots(target, snapshot);
    for (const [name, bytes] of Object.entries(files)) {
      expect(await fs.readFile(path.join(target, name))).toEqual(bytes);
    }
  });

  it("does not turn an unreadable/missing tree into an empty snapshot", async () => {
    await expect(
      readSkillFileSnapshots(path.join(root, "missing")),
    ).rejects.toThrow();
  });

  it("rejects symlinks and traversal before any restoration writes", async () => {
    await fs.writeFile(path.join(root, "outside.txt"), "outside");
    const source = path.join(root, "source");
    await fs.mkdir(source);
    await fs.symlink(
      path.join(root, "outside.txt"),
      path.join(source, "link.txt"),
    );
    await expect(readSkillFileSnapshots(source)).rejects.toThrow(
      /symbolic|symlink/i,
    );
    const target = path.join(root, "target");
    await expect(
      writeSkillFileSnapshots(target, [
        { relativePath: "ok.txt", content: "ok" },
        { relativePath: "../escape.txt", content: "bad" },
      ]),
    ).rejects.toThrow();
    await expect(fs.stat(target)).rejects.toThrow();
  });

  it("atomically replaces the complete tree and rolls back a failed swap", async () => {
    const target = path.join(root, "target");
    await writeSkillFileSnapshots(target, [
      { relativePath: "old", content: "old" },
    ]);
    const rename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (path.basename(String(from)) === "next")
        throw new Error("swap denied");
      await rename(from, to);
    });
    await expect(
      replaceSkillFileSnapshots(target, [
        { relativePath: "new", content: "new" },
      ]),
    ).rejects.toThrow("swap denied");
    expect(await fs.readFile(path.join(target, "old"), "utf8")).toBe("old");
    expect(await fs.readdir(root)).toEqual(["target"]);
    vi.restoreAllMocks();
    await replaceSkillFileSnapshots(target, [
      { relativePath: "new", content: "new" },
    ]);
    expect(await fs.readdir(target)).toEqual(["new"]);
    await replaceSkillFileSnapshots(path.join(root, "created"), []);
    expect(await fs.readdir(path.join(root, "created"))).toEqual([]);
  });

  it("retains the old tree when both swap and rollback fail", async () => {
    const target = path.join(root, "target");
    await writeSkillFileSnapshots(target, [
      { relativePath: "old", content: "old" },
    ]);
    const rename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (["next", "prior"].includes(path.basename(String(from))))
        throw new Error("rename denied");
      await rename(from, to);
    });
    await expect(replaceSkillFileSnapshots(target, [])).rejects.toThrow(
      /prior package retained/,
    );
    const operation = (await fs.readdir(root)).find((name) =>
      name.startsWith(".skill-restore-"),
    )!;
    expect(
      await fs.readFile(path.join(root, operation, "prior", "old"), "utf8"),
    ).toBe("old");
  });

  it("bounds inventory work and rejects oversized files before buffering them", async () => {
    const large = path.join(root, "large");
    const handle = await fs.open(large, "w");
    await handle.truncate(MAX_SKILL_PACKAGE_FILE_BYTES + 1);
    await handle.close();
    await expect(readSkillFileSnapshots(root)).rejects.toThrow(/limit/);
    await fs.unlink(large);
    const start = performance.now();
    for (let index = 0; index < MAX_SKILL_PACKAGE_FILES; index++)
      await fs.writeFile(path.join(root, `file-${index}`), "content");
    expect(await readSkillFileSnapshots(root)).toHaveLength(
      MAX_SKILL_PACKAGE_FILES,
    );
    expect(performance.now() - start).toBeLessThan(15_000);
    await fs.writeFile(path.join(root, "overflow"), "extra");
    await expect(readSkillFileSnapshots(root)).rejects.toThrow(/file count/);
  });
});
