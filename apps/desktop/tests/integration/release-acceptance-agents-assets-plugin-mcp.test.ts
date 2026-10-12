import {
  createSkillTestRuntime,
  fileInventory,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { registerPluginIPC } from "../../src/main/ipc/plugin.ipc";
import { registerMcpIPC } from "../../src/main/ipc/mcp.ipc";
import { pluginApi } from "../../src/preload/api/plugin";
import { mcpApi } from "../../src/preload/api/mcp";

let runtime: SkillTestRuntime;
function registerLibraries(): void {
  registerPluginIPC();
  registerMcpIPC();
}
beforeEach(async () => {
  runtime = await createSkillTestRuntime();
  registerLibraries();
});
afterEach(() => runtime?.dispose());
function writeSource(files: Record<string, string>): void {
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(runtime.source, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

it("imports plugin child MCP via IPC, skips duplicate names, reports invalid config and persists native distribution", async () => {
  writeSource({
    ".codex-plugin/plugin.json": JSON.stringify({
      name: "child-mcp-acceptance",
      version: "1.0.0",
      skills: "./skills",
      commands: ["./commands/review.md"],
    }),
    "skills/review/SKILL.md": "---\nname: review\n---\nReview",
    "commands/review.md": "Review command",
    "config/nested/mcp.json": JSON.stringify({
      mcpServers: {
        "acceptance-child": { command: "node", args: ["fixture.mjs"] },
      },
    }),
    "config/invalid-server.json": JSON.stringify({
      mcpServers: { invalid: { command: "   " } },
    }),
    "config/invalid-json.json": "{broken",
    "assets/readme.txt": "Complete package stays intact",
  });
  const inventory = fileInventory(runtime.source);
  const installed = await pluginApi.importLocalPluginPackage({
    sourcePath: runtime.source,
  });
  expect(fileInventory(installed.plugin.localPackagePath)).toEqual(inventory);
  const result = await pluginApi.importChildMcpServers(installed.plugin.id);
  expect(result.imported).toHaveLength(1);
  expect(result.imported[0]).toMatchObject({
    name: "acceptance-child",
    command: "node",
    args: ["fixture.mjs"],
  });
  expect(
    result.scannedFiles.map((f) =>
      path.relative(installed.plugin.localPackagePath, f),
    ),
  ).toEqual(["config/invalid-server.json", "config/nested/mcp.json"]);
  expect(result.failedFiles).toEqual([
    {
      path: path.join(
        installed.plugin.localPackagePath,
        "config/invalid-server.json",
      ),
      error: expect.any(String),
    },
  ]);
  expect(result.skipped).toEqual([]);
  const duplicate = await pluginApi.importChildMcpServers(installed.plugin.id);
  expect(duplicate.imported).toEqual([]);
  expect(duplicate.skipped).toEqual(["acceptance-child"]);
  expect(duplicate.failedFiles).toHaveLength(1);
  const target = {
    target: "cursor",
    scope: "global",
    path: path.join(runtime.platformRoot("cursor"), "mcp.json"),
    serverIds: [result.imported[0].id],
  } satisfies Parameters<typeof mcpApi.apply>[0];
  await mcpApi.apply(target);
  expect(JSON.parse(fs.readFileSync(target.path, "utf8"))).toMatchObject({
    mcpServers: {
      "acceptance-child": { command: "node", args: ["fixture.mjs"] },
    },
  });
  await runtime.reopen();
  registerLibraries();
  expect((await mcpApi.getLibrary()).servers).toEqual(result.imported);
  expect((await pluginApi.getLibrary()).plugins.map((p) => p.id)).toEqual([
    installed.plugin.id,
  ]);
  await mcpApi.remove(target);
  await mcpApi.deleteServer(result.imported[0].id);
  await pluginApi.deletePlugin(installed.plugin.id);
  expect(JSON.parse(fs.readFileSync(target.path, "utf8"))).toMatchObject({
    mcpServers: {},
  });
  await runtime.reopen();
  registerLibraries();
  expect((await mcpApi.getLibrary()).servers).toEqual([]);
  expect((await pluginApi.getLibrary()).plugins).toEqual([]);
  expect(fileInventory(runtime.source)).toEqual(inventory);
});
