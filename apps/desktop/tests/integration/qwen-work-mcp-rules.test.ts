/** @vitest-environment node */
import {
  createSkillTestRuntime,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { getDatabase } from "../../src/main/database";
import { invalidateCustomPathsCache } from "../../src/main/services/skill-installer-utils";
import { registerMcpIPC } from "../../src/main/ipc/mcp.ipc";
import { registerRulesIPC } from "../../src/main/ipc/rules.ipc";
import { mcpApi } from "../../src/preload/api/mcp";
import { rulesApi } from "../../src/preload/api/rules";

let runtime: SkillTestRuntime;
let nativeRoot: string;

function registerNativeRoots(): void {
  getDatabase()
    .prepare("DELETE FROM settings WHERE key = ?")
    .run("builtinAgentOverrides");
  invalidateCustomPathsCache();
  registerMcpIPC();
  registerRulesIPC();
}

beforeEach(async () => {
  runtime = await createSkillTestRuntime();
  nativeRoot = path.join(runtime.root, "home", ".qwenworkcn");
  fs.mkdirSync(nativeRoot, { recursive: true });
  registerNativeRoots();
});
afterEach(() => runtime?.dispose());

it("imports, deploys, reopens and removes Qwen Work MCP transports without touching Qwen Code", async () => {
  const preset = (await mcpApi.getTargetPresets()).find(
    (entry) => entry.id === "qwen-work",
  );
  if (!preset) throw new Error("Missing Qwen Work MCP preset");
  expect(preset.path).toBe(path.join(nativeRoot, "mcp.json"));
  const entries = {
    "work-local": { type: "stdio", command: "node", args: ["fixture.mjs"] },
    "work-http": { type: "streamable-http", url: "https://example.test/mcp" },
    "work-sse": { type: "sse", url: "https://example.test/sse" },
  };
  fs.writeFileSync(preset.path, JSON.stringify({ mcpServers: entries }));
  const imported = (await mcpApi.importFile(preset.path)).imported;
  expect(imported.map((server) => server.transport).sort()).toEqual([
    "sse",
    "stdio",
    "streamable-http",
  ]);
  const unrelated = { type: "stdio", command: "unrelated", disabled: true };
  const before = { mcpServers: { unrelated }, metadata: { keep: true } };
  fs.writeFileSync(preset.path, JSON.stringify(before));
  const target = { ...preset, serverIds: imported.map((server) => server.id) };
  await mcpApi.apply(target);
  expect(JSON.parse(fs.readFileSync(preset.path, "utf8"))).toEqual({
    ...before,
    mcpServers: { unrelated, ...entries },
  });
  expect(
    JSON.parse(await mcpApi.preview(preset.target, target.serverIds)),
  ).toEqual({ mcpServers: entries });
  await runtime.reopen();
  registerNativeRoots();
  expect(
    (await mcpApi.getLibrary()).servers.map((server) => server.id).sort(),
  ).toEqual(target.serverIds.sort());
  const status = (await mcpApi.getTargetStatus([preset]))[0];
  expect(status.serverNames.sort()).toEqual(
    [...Object.keys(entries), "unrelated"].sort(),
  );
  expect(
    status.servers?.find((server) => server.name === "unrelated")?.enabled,
  ).toBe(false);
  await mcpApi.remove(target);
  expect(JSON.parse(fs.readFileSync(preset.path, "utf8"))).toEqual(before);
  expect(fs.existsSync(path.join(runtime.root, "home", ".qwen"))).toBe(false);
});

it("refuses malformed MCP configuration without replacing its bytes", async () => {
  const preset = (await mcpApi.getTargetPresets()).find(
    (entry) => entry.id === "qwen-work",
  );
  if (!preset) throw new Error("Missing Qwen Work MCP preset");
  const server = await mcpApi.createServer({
    name: "work",
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

it("edits only the awareness work manual and preserves sibling memories through reopen and conflict resolution", async () => {
  const awareness = path.join(nativeRoot, "awareness/main");
  fs.mkdirSync(awareness, { recursive: true });
  const siblings = ["SOUL.md", "USER.md", "MEMORY.md"];
  for (const name of siblings)
    fs.writeFileSync(path.join(awareness, name), `Keep ${name}\n`);
  const manual = path.join(awareness, "AGENTS.md");
  fs.writeFileSync(manual, "# Original manual\n");
  const descriptor = (await rulesApi.scan()).find(
    (entry) => entry.id === "qwen-work-global",
  );
  expect(descriptor?.targetPath).toBe(manual);
  expect((await rulesApi.read("qwen-work-global")).content).toBe(
    "# Original manual\n",
  );
  await rulesApi.save("qwen-work-global", "# Updated manual\n");
  expect(fs.readFileSync(manual, "utf8")).toBe("# Updated manual\n");
  await runtime.reopen();
  registerNativeRoots();
  expect((await rulesApi.read("qwen-work-global")).content).toBe(
    "# Updated manual\n",
  );
  fs.writeFileSync(manual, "# External manual\n");
  await rulesApi.scan();
  await rulesApi.resolveConflict("qwen-work-global", "use-target");
  expect((await rulesApi.read("qwen-work-global")).content).toBe(
    "# External manual\n",
  );
  for (const name of siblings)
    expect(fs.readFileSync(path.join(awareness, name), "utf8")).toBe(
      `Keep ${name}\n`,
    );
  expect(fs.readdirSync(nativeRoot)).toEqual(["awareness"]);
  expect(fs.existsSync(path.join(runtime.root, "home", ".qwen"))).toBe(false);
});
