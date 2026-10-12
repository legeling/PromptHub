import {
  createSkillTestRuntime,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import fs from "node:fs";
import path from "node:path";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { CoreMcpLibraryService, getMcpTargetPresets } from "@prompthub/core";
import {
  listMcpServerNamesInJson,
  listMcpServerNamesInToml,
} from "@prompthub/shared/utils/mcp-config";
import { registerMcpIPC } from "../../src/main/ipc/mcp.ipc";
import { mcpApi } from "../../src/preload/api/mcp";
let runtime: SkillTestRuntime;
beforeEach(async () => {
  runtime = await createSkillTestRuntime();
});
afterEach(() => runtime?.dispose());
describe("MCP every global preset native file roundtrip", () => {
  const presets = getMcpTargetPresets("/acceptance-matrix-home", "darwin", {});
  for (const preset of presets)
    it(preset.id + " apply/read/reopen/remove", async () => {
      const actualPreset = getMcpTargetPresets(
        path.join(runtime.root, "mcp-home"),
        "darwin",
        {},
      ).find((item) => item.id === preset.id);
      if (!actualPreset) throw new Error("Missing preset " + preset.id);
      const targetPath = actualPreset.path;
      const service = new CoreMcpLibraryService();
      const server = service.createServer({
        name: "acceptance-" + preset.id,
        transport: "stdio",
        command: "node",
        args: ["fixture.mjs"],
      });
      const target = {
        target: preset.target,
        scope: preset.scope,
        path: targetPath,
        serverIds: [server.id],
      };
      service.apply(target);
      const content = fs.readFileSync(targetPath, "utf8");
      const names =
        preset.target === "codex" || preset.target === "grok"
          ? listMcpServerNamesInToml(content)
          : listMcpServerNamesInJson(JSON.parse(content), preset.target);
      expect(names).toContain(server.name);
      expect(content).toContain("fixture.mjs");
      await runtime.reopen();
      const reopened = new CoreMcpLibraryService();
      expect(
        reopened.read().servers.find((s) => s.id === server.id)?.args,
      ).toEqual(["fixture.mjs"]);
      reopened.removeFromTarget(target);
      const after = fs.readFileSync(targetPath, "utf8");
      const remaining =
        preset.target === "codex" || preset.target === "grok"
          ? listMcpServerNamesInToml(after)
          : listMcpServerNamesInJson(JSON.parse(after), preset.target);
      expect(remaining).not.toContain(server.name);
      reopened.deleteServer(server.id);
      expect(reopened.read().servers).toEqual([]);
    });
});

it("checks configuration health through registered IPC without executing commands or changing stored records", async () => {
  const envName = "PROMPTHUB_ACCEPTANCE_HEALTH_UNSET";
  vi.stubEnv(envName, undefined);
  try {
    registerMcpIPC();
    const command = path.join(runtime.root, "presence-only-command");
    fs.writeFileSync(command, "This file must never be executed");
    const healthy = await mcpApi.createServer({
      name: "health-valid",
      transport: "stdio",
      command,
    });
    const warning = await mcpApi.createServer({
      name: "health-warning",
      transport: "stdio",
      command,
      cwd: path.join(runtime.root, "missing-cwd"),
      args: ["$" + "{" + envName + "}"],
    });
    const missing = await mcpApi.createServer({
      name: "health-missing",
      transport: "stdio",
      command: path.join(runtime.root, "missing-command"),
    });
    const beforeInvalid = await mcpApi.getLibrary();
    await expect(
      mcpApi.createServer({
        name: "health-invalid-url",
        transport: "streamable-http",
        url: "invalid-url",
      }),
    ).rejects.toThrow("MCP resource url is invalid");
    expect(await mcpApi.getLibrary()).toEqual(beforeInvalid);
    const before = await mcpApi.getLibrary();
    const single = await mcpApi.checkServer(healthy.name);
    expect(single).toMatchObject({
      serverId: healthy.id,
      status: "ok",
      issues: [],
    });
    expect(Number.isNaN(Date.parse(single.checkedAt))).toBe(false);
    const results = await mcpApi.checkAllServers();
    expect(results.map((r) => r.serverId).sort()).toEqual(
      [healthy.id, warning.id, missing.id].sort(),
    );
    expect(results.find((r) => r.serverId === warning.id)).toMatchObject({
      status: "warning",
      issues: [
        expect.objectContaining({ code: "MISSING_CWD" }),
        expect.objectContaining({
          code: "UNRESOLVED_ENV_REFERENCE",
          field: envName,
        }),
      ],
    });
    expect(results.find((r) => r.serverId === missing.id)).toMatchObject({
      status: "error",
      issues: [expect.objectContaining({ code: "COMMAND_NOT_FOUND" })],
    });
    await expect(mcpApi.checkServer("absent-server")).rejects.toThrow();
    expect(await mcpApi.getLibrary()).toEqual(before);
    await runtime.reopen();
    registerMcpIPC();
    expect(await mcpApi.getLibrary()).toEqual(before);
    expect(fs.readFileSync(command, "utf8")).toBe(
      "This file must never be executed",
    );
  } finally {
    vi.unstubAllEnvs();
  }
});
