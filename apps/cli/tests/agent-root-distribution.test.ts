import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  closeDatabase,
  getMcpTargetPresets,
  resetRuntimePaths,
} from "@prompthub/core";
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
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
  vi.unstubAllEnvs();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

it("uses persisted absolute roots and MCP subpaths across the writable preset matrix", async () => {
  const root = makeTempRoot(roots);
  await withTempHome(root, async (home) => {
    const prefix = withDataDir(root);
    expect(
      (
        await execCli([
          ...prefix,
          "mcp",
          "create",
          "--name",
          "docs",
          "--command",
          "node",
        ])
      ).exitCode,
    ).toBe(0);
    const presets = getMcpTargetPresets(home).filter(
      (preset) => preset.id === preset.platformId,
    );
    for (const preset of presets) {
      const chosen = path.join(home, "selected", preset.id);
      const relativeRoot = path.relative(process.cwd(), chosen);
      const relativeFile = path.join("nested", path.basename(preset.path));
      const configured = await execCli([
        ...prefix,
        "agent",
        "configure",
        preset.id,
        "--root",
        relativeRoot,
        "--mcp-path",
        relativeFile,
      ]);
      expect(configured.exitCode, configured.joinedStderr).toBe(0);
      expect(configured.json.paths.root).toBe(chosen);
      closeDatabase();
      resetRuntimePaths();
      const applied = await execCli([
        ...prefix,
        "mcp",
        "apply",
        "--preset",
        preset.id,
        "--servers",
        "docs",
      ]);
      expect(applied.exitCode, `${preset.id}: ${applied.joinedStderr}`).toBe(0);
      const target = path.join(chosen, relativeFile);
      expect(applied.json.path).toBe(target);
      expect(fs.readFileSync(target, "utf8")).toContain("docs");
      expect(
        (
          await execCli([
            ...prefix,
            "mcp",
            "remove",
            "--preset",
            preset.id,
            "--servers",
            "docs",
          ])
        ).exitCode,
      ).toBe(0);
      expect(fs.readFileSync(target, "utf8")).not.toContain("docs");
      expect(fs.existsSync(preset.path)).toBe(false);
    }
  });
});

it.each(["cursor", "codex", "opencode", "claude", "kimi"])(
  "distributes complete Skill packages using %s Agent paths and reads the same status",
  async (id) => {
    const root = makeTempRoot(roots);
    await withTempHome(root, async (home) => {
      const prefix = withDataDir(root);
      const platform = SKILL_PLATFORMS.find((item) => item.id === id);
      expect(platform).toBeDefined();
      const chosen = path.join(home, "selected", id);
      if (platform?.rootEnvironmentVariable)
        vi.stubEnv(platform.rootEnvironmentVariable, chosen);
      else
        expect(
          (
            await execCli([
              ...prefix,
              "agent",
              "configure",
              id,
              "--root",
              chosen,
            ])
          ).exitCode,
        ).toBe(0);
      expect(
        (
          await execCli([
            ...prefix,
            "agent",
            "configure",
            id,
            "--skills-path",
            "team/packages",
          ])
        ).exitCode,
      ).toBe(0);
      const agent = await execCli([...prefix, "agent", "get", id]);
      const source = path.join(root, "writer");
      fs.mkdirSync(path.join(source, "assets"), { recursive: true });
      fs.writeFileSync(
        path.join(source, "SKILL.md"),
        "---\nname: writer\ndescription: Regression package\n---\nInstructions\n",
      );
      const bytes = Buffer.from([0, 128, 255]);
      fs.writeFileSync(path.join(source, "assets/example.bin"), bytes);
      expect(
        (await execCli([...prefix, "skill", "import", source])).exitCode,
      ).toBe(0);
      expect(
        (
          await execCli([
            ...prefix,
            "skill",
            "distribute",
            "writer",
            "--platform",
            id,
          ])
        ).exitCode,
      ).toBe(0);
      const installed = path.join(agent.json.paths.skills, "writer");
      expect(
        fs.readFileSync(path.join(installed, "assets/example.bin")),
      ).toEqual(bytes);
      closeDatabase();
      resetRuntimePaths();
      expect(
        (await execCli([...prefix, "skill", "platform-status", "writer"])).json[
          id
        ],
      ).toBe(true);
      expect(
        (
          await execCli([
            ...prefix,
            "skill",
            "undistribute",
            "writer",
            "--platform",
            id,
          ])
        ).exitCode,
      ).toBe(0);
      expect(fs.existsSync(installed)).toBe(false);
      expect(fs.readFileSync(path.join(source, "assets/example.bin"))).toEqual(
        bytes,
      );
      expect(
        (await execCli([...prefix, "skill", "platform-status", "writer"])).json[
          id
        ],
      ).toBe(false);
    });
  },
);
