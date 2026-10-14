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

it("uses the persisted Agent root for CLI MCP preset apply and removal", async () => {
  const root = makeTempRoot(roots);
  await withTempHome(root, async (home) => {
    const selected = path.join(home, "selected-cursor");
    const prefix = withDataDir(root);
    expect(
      (
        await execCli([
          ...prefix,
          "agent",
          "configure",
          "cursor",
          "--root",
          selected,
        ])
      ).exitCode,
    ).toBe(0);
    expect(
      (
        await execCli([
          ...prefix,
          "mcp",
          "create",
          "--name",
          "fixture",
          "--command",
          "node",
        ])
      ).exitCode,
    ).toBe(0);
    expect(
      (
        await execCli([
          ...prefix,
          "mcp",
          "apply",
          "--preset",
          "cursor",
          "--servers",
          "fixture",
        ])
      ).exitCode,
    ).toBe(0);
    const file = path.join(selected, "mcp.json");
    expect(
      JSON.parse(fs.readFileSync(file, "utf8")).mcpServers.fixture.command,
    ).toBe("node");
    expect(fs.existsSync(path.join(home, ".cursor", "mcp.json"))).toBe(false);
    expect(
      (
        await execCli([
          ...prefix,
          "mcp",
          "remove",
          "--preset",
          "cursor",
          "--servers",
          "fixture",
        ])
      ).exitCode,
    ).toBe(0);
    expect(
      JSON.parse(fs.readFileSync(file, "utf8")).mcpServers.fixture,
    ).toBeUndefined();
  });
});
