import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { closeDatabase, resetRuntimePaths } from "@prompthub/core";
import {
  execCli,
  makeTempRoot,
  withDataDir,
  withTempHome,
} from "./helpers/cli-harness";

const roots: string[] = [];
afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

it("shares full-package distribution identity, mode and redistribution with desktop", async () => {
  const root = makeTempRoot(roots);
  await withTempHome(root, async (home) => {
    const prefix = withDataDir(root);
    const source = path.join(root, "writer");
    fs.mkdirSync(path.join(source, "assets"), { recursive: true });
    fs.writeFileSync(
      path.join(source, "SKILL.md"),
      "---\nname: writer\ndescription: Writer\n---\nWrite",
    );
    fs.writeFileSync(
      path.join(source, "assets", "sample.bin"),
      Buffer.from([0, 255, 127]),
    );
    const invoke = async (args: string[]) => {
      const result = await execCli([...prefix, ...args]);
      expect(result.exitCode, result.joinedStderr).toBe(0);
      return result.json;
    };
    await invoke(["skill", "import", source]);
    const targetRoot = path.join(home, "cursor-root");
    await invoke(["agent", "configure", "cursor", "--root", targetRoot]);
    const args = ["writer", "--platform", "cursor"];
    await invoke(["skill", "distribute", ...args, "--mode", "copy"]);
    const target = path.join(targetRoot, "skills", "writer");
    expect(fs.readFileSync(path.join(target, "assets", "sample.bin"))).toEqual(
      Buffer.from([0, 255, 127]),
    );
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(
            targetRoot,
            "skills",
            ".prompthub-platform-activations.json",
          ),
          "utf8",
        ),
      ),
    ).toMatchObject({ writer: { skillName: "writer" } });
    closeDatabase();
    resetRuntimePaths();
    expect(await invoke(["skill", "platform-status", "writer"])).toMatchObject({
      cursor: true,
    });
    fs.writeFileSync(
      path.join(target, "assets", "sample.bin"),
      Buffer.from([7, 8]),
    );
    expect(
      await invoke(["skill", "platform-status", "writer", "--details"]),
    ).toMatchObject({ cursor: { installed: true, contentState: "conflict" } });
    const conflict = await execCli([
      ...prefix,
      "skill",
      "redistribute",
      ...args,
    ]);
    expect(conflict.exitCode).not.toBe(0);
    expect(fs.readFileSync(path.join(target, "assets", "sample.bin"))).toEqual(
      Buffer.from([7, 8]),
    );
    const removeConflict = await execCli([
      ...prefix,
      "skill",
      "undistribute",
      ...args,
    ]);
    expect(removeConflict.exitCode).not.toBe(0);
    expect(fs.existsSync(target)).toBe(true);
    fs.writeFileSync(
      path.join(target, "assets", "sample.bin"),
      Buffer.from([0, 255, 127]),
    );
    await invoke(["skill", "redistribute", ...args, "--mode", "symlink"]);
    expect(
      await invoke(["skill", "platform-status", "writer", "--details"]),
    ).toMatchObject({
      cursor: { installed: true, mode: expect.stringMatching(/copy|symlink/) },
    });
    await invoke(["skill", "undistribute", ...args]);
    expect(fs.existsSync(target)).toBe(false);
    const missing = await execCli([
      ...prefix,
      "skill",
      "redistribute",
      ...args,
    ]);
    expect(missing.exitCode).not.toBe(0);
    expect(fs.existsSync(target)).toBe(false);
  });
});
