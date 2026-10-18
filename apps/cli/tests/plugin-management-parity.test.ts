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

it("manages a complete local Plugin through CLI import, metadata, versions and distribution", async () => {
  const root = makeTempRoot(roots);
  await withTempHome(root, async (home) => {
    const prefix = withDataDir(root);
    const source = path.join(root, "source");
    fs.mkdirSync(path.join(source, ".cursor-plugin"), { recursive: true });
    fs.writeFileSync(
      path.join(source, ".cursor-plugin/plugin.json"),
      JSON.stringify({
        name: "cli-parity",
        version: "1.0.0",
        skills: "./skills",
        commands: "./commands",
      }),
    );
    fs.mkdirSync(path.join(source, "skills", "review"), { recursive: true });
    fs.mkdirSync(path.join(source, "commands"), { recursive: true });
    fs.writeFileSync(
      path.join(source, "skills", "review", "SKILL.md"),
      "---\nname: review\ndescription: Review\n---\nReview",
    );
    fs.writeFileSync(
      path.join(source, "commands", "review.md"),
      "Review files",
    );
    fs.writeFileSync(
      path.join(source, "asset.bin"),
      Buffer.from([0, 128, 255]),
    );
    fs.writeFileSync(
      path.join(source, ".mcp.json"),
      JSON.stringify({ mcpServers: { review: { command: "review-mcp" } } }),
    );
    const invoke = async (args: string[]) => {
      const result = await execCli([...prefix, "plugin", ...args]);
      expect(result.exitCode, result.joinedStderr).toBe(0);
      return result.json;
    };
    await invoke(["import", source]);
    expect(await invoke(["import-child-mcp", "cli-parity"])).toMatchObject({
      imported: [expect.objectContaining({ name: "review" })],
      failedFiles: [],
    });
    expect(await invoke(["import-child-mcp", "cli-parity"])).toMatchObject({
      imported: [],
      skipped: ["review"],
    });
    const mcp = await execCli([...prefix, "mcp", "list"]);
    expect(mcp.exitCode).toBe(0);
    expect(mcp.json).toEqual([
      expect.objectContaining({ name: "review", command: "review-mcp" }),
    ]);
    const saved = await invoke(["get", "cli-parity"]);
    if (
      !saved ||
      typeof saved !== "object" ||
      !("localPackagePath" in saved) ||
      typeof saved.localPackagePath !== "string"
    )
      throw new Error("Missing stored Plugin package");
    const configFile = path.join(saved.localPackagePath, ".mcp.json");
    const configBytes = fs.readFileSync(configFile);
    fs.writeFileSync(configFile, '{"secret":"never-echo-this",broken');
    const failedChildImport = await execCli([
      ...prefix,
      "plugin",
      "import-child-mcp",
      "cli-parity",
    ]);
    expect(failedChildImport.exitCode).toBe(4);
    expect(failedChildImport.json).toMatchObject({
      failedFiles: [expect.objectContaining({ path: configFile })],
    });
    expect(JSON.stringify(failedChildImport.json)).not.toContain(
      "never-echo-this",
    );
    fs.writeFileSync(configFile, configBytes);
    await invoke([
      "metadata",
      "cli-parity",
      "--favorite",
      "--tags",
      "review,tools",
      "--notes",
      "saved",
    ]);
    expect(await invoke(["get", "cli-parity"])).toMatchObject({
      isFavorite: true,
      userTags: ["review", "tools"],
      userNotes: "saved",
    });
    await invoke(["create-version", "cli-parity", "--note", "baseline"]);
    await invoke(["metadata", "cli-parity", "--notes", "changed"]);
    await invoke(["rollback", "cli-parity", "--version", "1"]);
    expect(await invoke(["get", "cli-parity"])).toMatchObject({
      userNotes: "saved",
    });
    const target = path.join(home, "cursor-config");
    expect(
      (
        await execCli([
          ...prefix,
          "agent",
          "configure",
          "cursor",
          "--root",
          target,
        ])
      ).exitCode,
    ).toBe(0);
    const distributed = await invoke([
      "distribute",
      "cli-parity",
      "--targets",
      "shared-agents",
      "--mode",
      "copy",
    ]);
    expect(distributed).toMatchObject({
      targets: [expect.objectContaining({ targetId: "shared-agents" })],
    });
    expect(await invoke(["status", "cli-parity"])).toMatchObject({
      "shared-agents": { installed: true },
    });
    await invoke([
      "redistribute",
      "cli-parity",
      "--targets",
      "shared-agents",
      "--mode",
      "copy",
    ]);
    expect(await invoke(["get", "cli-parity"])).toMatchObject({
      distributedTargetIds: ["shared-agents"],
    });
    await invoke(["undistribute", "cli-parity", "--targets", "shared-agents"]);
    expect(await invoke(["get", "cli-parity"])).toMatchObject({
      distributedTargetIds: [],
    });
    expect(await invoke(["status", "cli-parity"])).toMatchObject({
      "shared-agents": { installed: false },
    });
    expect(fs.readFileSync(path.join(source, "asset.bin"))).toEqual(
      Buffer.from([0, 128, 255]),
    );
    expect(await invoke(["check", "cli-parity"])).toMatchObject({
      status: "ok",
    });
  });
});
