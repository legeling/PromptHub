import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { makeTempRoot } from "./helpers/cli-harness";

describe("CLI test database fixture", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([true, false])(
    "resolves an aliased temporary parent before returning a fixture (seeded=%s)",
    (seedDatabase) => {
      const parent = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-cli-temp-alias-")),
      );
      tempDirs.push(parent);
      const physical = path.join(parent, "physical");
      const alias = path.join(parent, "alias");
      fs.mkdirSync(physical);
      fs.symlinkSync(physical, alias, process.platform === "win32" ? "junction" : "dir");
      vi.spyOn(os, "tmpdir").mockReturnValue(alias);

      const root = makeTempRoot(tempDirs, { seedDatabase });

      expect(path.dirname(root)).toBe(physical);
      expect(root).toBe(fs.realpathSync(root));
      expect(tempDirs).toContain(root);
      expect(fs.existsSync(path.join(root, "user-data", "data", "prompthub.db"))).toBe(seedDatabase);
    },
  );

  it("seeds ordinary roots and preserves an explicit unseeded mode", () => {
    const seededRoot = makeTempRoot(tempDirs);
    const unseededRoot = makeTempRoot(tempDirs, { seedDatabase: false });
    const relativeDatabasePath = path.join(
      "user-data",
      "data",
      "prompthub.db",
    );

    expect(fs.existsSync(path.join(seededRoot, relativeDatabasePath))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(unseededRoot, relativeDatabasePath))).toBe(
      false,
    );
  });
});
