import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the real traversal and reads at small injectable capacity boundaries.
vi.mock("@prompthub/shared/constants/skill-package", async (original) => ({
  ...(await original<
    typeof import("@prompthub/shared/constants/skill-package")
  >()),
  MAX_SKILL_PACKAGE_DEPTH: 2,
  MAX_SKILL_PACKAGE_ENTRIES: 6,
  MAX_SKILL_PACKAGE_FILES: 4,
  MAX_SKILL_PACKAGE_FILE_BYTES: 8,
  MAX_SKILL_PACKAGE_TOTAL_BYTES: 12,
}));
import {
  readSkillFileSnapshots,
  replaceSkillFileSnapshots,
} from "../src/skills/file-snapshot";

describe("Skill snapshot capacity and IO failures", () => {
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-limits-"));
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  it("rejects non-directory roots and unreadable ignore files", async () => {
    await fs.writeFile(path.join(root, "plain"), "x");
    await expect(
      readSkillFileSnapshots(path.join(root, "plain")),
    ).rejects.toThrow(/not a directory/);
    await fs.symlink(
      path.join(root, "plain"),
      path.join(root, ".prompthubignore"),
    );
    await expect(readSkillFileSnapshots(root)).rejects.toThrow();
  });
  it("honors explicit ignores and does not snapshot the derived bundle marker", async () => {
    await fs.writeFile(path.join(root, ".prompthubignore"), "drop\n");
    await fs.writeFile(path.join(root, "drop"), "omitted");
    await fs.writeFile(path.join(root, "keep"), "keep");
    await fs.writeFile(path.join(root, ".canonical-bundle-hash"), "hash");
    const files = await readSkillFileSnapshots(root);
    expect(
      files.some((file) =>
        ["drop", ".canonical-bundle-hash"].includes(file.relativePath),
      ),
    ).toBe(false);
    expect(files).toContainEqual({ relativePath: "keep", content: "keep" });
  });
  it("bounds directory count, nesting and total bytes", async () => {
    for (let i = 0; i < 7; i++) await fs.mkdir(path.join(root, `dir-${i}`));
    await expect(readSkillFileSnapshots(root)).rejects.toThrow(/entry limit/);
    for (let i = 0; i < 7; i++) await fs.rmdir(path.join(root, `dir-${i}`));
    await fs.mkdir(path.join(root, "a/b/c"), { recursive: true });
    await expect(readSkillFileSnapshots(root)).rejects.toThrow(/depth limit/);
    await fs.rm(path.join(root, "a"), { recursive: true });
    await fs.writeFile(path.join(root, "one"), "12345678");
    await fs.writeFile(path.join(root, "two"), "12345678");
    await expect(readSkillFileSnapshots(root)).rejects.toThrow(
      /total byte limit/,
    );
  });
  it("rejects non-regular entries without opening a FIFO", async () => {
    execFileSync("mkfifo", [path.join(root, "fifo")], { timeout: 5_000 });
    await expect(readSkillFileSnapshots(root)).rejects.toThrow(/unsafe file/);
  });
  it("stops a file that grows beyond the initial stat and still closes it", async () => {
    const target = path.join(root, "growing");
    await fs.writeFile(target, "");
    const open = fs.open.bind(fs);
    const close = vi.fn();
    vi.spyOn(fs, "open").mockImplementation(async (...args) => {
      const handle = await open(...args);
      if (path.basename(String(args[0])) === "growing") {
        const stat = handle.stat.bind(handle);
        vi.spyOn(handle, "stat").mockImplementation(async () => {
          const initial = await stat();
          await fs.writeFile(target, "123456789");
          return initial;
        });
        const actualClose = handle.close.bind(handle);
        vi.spyOn(handle, "close").mockImplementation(async () => {
          close();
          await actualClose();
        });
      }
      return handle;
    });
    await expect(readSkillFileSnapshots(root)).rejects.toThrow(/file limit/);
    expect(close).toHaveBeenCalledOnce();
  });
  it("does not replace a live package when the first rename is denied", async () => {
    const target = path.join(root, "live");
    await fs.mkdir(target);
    await fs.writeFile(path.join(target, "old"), "old");
    vi.spyOn(fs, "rename").mockRejectedValue(new Error("permission denied"));
    await expect(
      replaceSkillFileSnapshots(target, [
        { relativePath: "new", content: "new" },
      ]),
    ).rejects.toThrow("permission denied");
    expect(await fs.readFile(path.join(target, "old"), "utf8")).toBe("old");
    expect(await fs.readdir(root)).toEqual(["live"]);
  });
});
