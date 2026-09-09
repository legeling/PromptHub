import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateRepoPackageInventory } from "../src/cli/skill/paths";
import {
  MAX_SKILL_PACKAGE_FILE_BYTES,
  MAX_SKILL_PACKAGE_TOTAL_BYTES,
} from "@prompthub/shared/constants/skill-package";
describe("package capacity independent of content scanning", () => {
  const roots: string[] = [];
  const makeRoot = async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "prompthub-inventory-"),
    );
    roots.push(root);
    return root;
  };
  const sparseFile = async (file: string, bytes: number) => {
    const handle = await fs.open(file, "w");
    try {
      await handle.truncate(bytes);
    } finally {
      await handle.close();
    }
  };
  afterEach(async () => {
    for (const root of roots.splice(0))
      await fs.rm(root, { recursive: true, force: true });
  });
  it("allows empty inventories and content beyond the retired scan budget", async () => {
    const root = await makeRoot();
    await expect(validateRepoPackageInventory(root)).resolves.toBeUndefined();
    await fs.mkdir(path.join(root, "nested"));
    await sparseFile(path.join(root, "nested", "file.bin"), 3 * 1024 * 1024);
    await fs.writeFile(
      path.join(root, "credentials.txt"),
      "password=correct-horse-battery-staple",
    );
    await expect(validateRepoPackageInventory(root)).resolves.toBeUndefined();
  });
  it("rejects oversized binary and text packages using metadata only", async () => {
    const root = await makeRoot();
    const file = path.join(root, "large.bin");
    await sparseFile(file, MAX_SKILL_PACKAGE_FILE_BYTES + 1);
    await expect(validateRepoPackageInventory(root)).rejects.toThrow(
      "capacity",
    );
    await fs.unlink(file);
    for (
      let i = 0;
      i < MAX_SKILL_PACKAGE_TOTAL_BYTES / MAX_SKILL_PACKAGE_FILE_BYTES + 1;
      i++
    )
      await sparseFile(
        path.join(root, i + ".bin"),
        MAX_SKILL_PACKAGE_FILE_BYTES,
      );
    await expect(validateRepoPackageInventory(root)).rejects.toThrow(
      "capacity",
    );
  });
});
