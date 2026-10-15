/** @vitest-environment node */
import {
  createSkillTestRuntime,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { registerMcpIPC } from "../../src/main/ipc/mcp.ipc";
import { mcpApi } from "../../src/preload/api/mcp";

let runtime: SkillTestRuntime;
beforeEach(async () => {
  runtime = await createSkillTestRuntime();
  registerMcpIPC();
});
afterEach(() => runtime?.dispose());

async function copilotPreset() {
  const preset = (await mcpApi.getTargetPresets()).find(
    ({ id }) => id === "copilot",
  );
  if (!preset) throw new Error("Missing Copilot CLI MCP preset");
  expect(preset.path).toBe(
    path.join(runtime.platformRoot("copilot"), "mcp-config.json"),
  );
  fs.mkdirSync(path.dirname(preset.path), { recursive: true });
  return preset;
}

it("imports, deploys, reopens and removes native Copilot entries without touching VS Code", async () => {
  const preset = await copilotPreset();
  const vscode = (await mcpApi.getTargetPresets()).find(
    ({ id }) => id === "vscode",
  );
  if (!vscode) throw new Error("Missing independent VS Code preset");
  fs.mkdirSync(path.dirname(vscode.path), { recursive: true });
  const vscodeBytes = '{"servers":{"vscode-only":{"command":"fixture"}}}\n';
  fs.writeFileSync(vscode.path, vscodeBytes);
  const entries = {
    "cli-local": {
      type: "local",
      command: "node",
      args: ["fixture.mjs"],
      tools: ["*"],
    },
    "cli-http": {
      type: "http",
      url: "https://example.test/mcp",
      tools: ["read"],
    },
    "cli-sse": { type: "sse", url: "https://example.test/sse", tools: [] },
  };
  fs.writeFileSync(preset.path, JSON.stringify({ mcpServers: entries }));
  const { imported } = await mcpApi.importFile(preset.path);
  expect(imported.map(({ transport }) => transport).sort()).toEqual([
    "sse",
    "stdio",
    "streamable-http",
  ]);
  const before = {
    mcpServers: { unrelated: { command: "keep", tools: ["read"] } },
    metadata: { keep: true },
  };
  fs.writeFileSync(preset.path, JSON.stringify(before));
  const target = { ...preset, serverIds: imported.map(({ id }) => id) };
  await mcpApi.apply(target);
  expect(JSON.parse(fs.readFileSync(preset.path, "utf8"))).toEqual({
    ...before,
    mcpServers: { ...before.mcpServers, ...entries },
  });
  expect(
    JSON.parse(await mcpApi.preview(preset.target, target.serverIds)),
  ).toEqual({ mcpServers: entries });
  expect(fs.readFileSync(vscode.path, "utf8")).toBe(vscodeBytes);
  await runtime.reopen();
  registerMcpIPC();
  expect(
    (await mcpApi.getLibrary()).servers.map(({ id }) => id).sort(),
  ).toEqual(target.serverIds.sort());
  const status = (await mcpApi.getTargetStatus([preset]))[0];
  expect(status.serverNames.sort()).toEqual(
    [...Object.keys(entries), "unrelated"].sort(),
  );
  await mcpApi.remove(target);
  expect(JSON.parse(fs.readFileSync(preset.path, "utf8"))).toEqual(before);
  expect(fs.readFileSync(vscode.path, "utf8")).toBe(vscodeBytes);
});

it("rejects malformed Copilot configuration without replacing its bytes", async () => {
  const preset = await copilotPreset();
  const server = await mcpApi.createServer({
    name: "fixture",
    transport: "stdio",
    command: "node",
  });
  const malformed = '{"mcpServers":';
  fs.writeFileSync(preset.path, malformed);
  await expect(
    mcpApi.apply({ ...preset, serverIds: [server.id] }),
  ).rejects.toThrow();
  expect(fs.readFileSync(preset.path, "utf8")).toBe(malformed);
});

it("projects newly authored servers with the native default tool selection", async () => {
  const preset = await copilotPreset();
  const server = await mcpApi.createServer({
    name: "fixture",
    transport: "stdio",
    command: "node",
  });
  await mcpApi.apply({ ...preset, serverIds: [server.id] });
  expect(JSON.parse(fs.readFileSync(preset.path, "utf8"))).toEqual({
    mcpServers: {
      fixture: { type: "local", command: "node", tools: ["*"] },
    },
  });
});
