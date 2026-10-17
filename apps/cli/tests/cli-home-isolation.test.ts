import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, expect, it } from "vitest";
import { makeTempRoot, withTempHome } from "./helpers/cli-harness";

const roots: string[] = [];
const keys = [
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "XDG_CONFIG_HOME",
];
const snapshot = () => keys.map((key) => process.env[key]);

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

it("isolates native and child-process home resolution and restores the environment", async () => {
  const root = makeTempRoot(roots, { seedDatabase: false });
  const before = snapshot();
  const result = await withTempHome(root, async (home) => {
    expect(os.homedir()).toBe(home);
    expect(process.env.HOME).toBe(home);
    expect(process.env.USERPROFILE).toBe(home);
    for (const key of keys.slice(2)) {
      const directory = process.env[key];
      expect(directory).toBeDefined();
      expect(path.relative(home, directory ?? "")).not.toMatch(/^\.\./);
      expect(fs.existsSync(directory ?? "")).toBe(true);
    }
    expect(
      execFileSync(
        process.execPath,
        ["-e", "process.stdout.write(require('node:os').homedir())"],
        {
          encoding: "utf8",
          windowsHide: true,
        },
      ),
    ).toBe(home);
    return "completed";
  });
  expect(result).toBe("completed");
  expect(snapshot()).toEqual(before);
});

it("restores environment values after a failed nested operation", async () => {
  const root = makeTempRoot(roots, { seedDatabase: false });
  const before = snapshot();
  await expect(
    withTempHome(root, async () => {
      const outer = snapshot();
      await expect(
        withTempHome(path.join(root, "nested"), async () => {
          throw new Error("fixture failure");
        }),
      ).rejects.toThrow("fixture failure");
      expect(snapshot()).toEqual(outer);
      throw new Error("outer failure");
    }),
  ).rejects.toThrow("outer failure");
  expect(snapshot()).toEqual(before);
});
