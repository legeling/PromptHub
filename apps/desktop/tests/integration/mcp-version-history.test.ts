import { afterEach, beforeEach, expect, it } from "vitest";
import {
  createSkillTestRuntime,
  invokeSkillIPC,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import { registerMcpIPC } from "../../src/main/ipc/mcp.ipc";
import { mcpApi } from "../../src/preload/api/mcp";
import { CoreMcpLibraryService } from "@prompthub/core";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import fs from "node:fs";
import { getMcpLibraryFilePath } from "@prompthub/core";
let runtime: SkillTestRuntime;
beforeEach(async () => {
  runtime = await createSkillTestRuntime();
  registerMcpIPC(new CoreMcpLibraryService());
});
afterEach(() => runtime.dispose());
it("exposes history through registered preload IPC and reopens the restored current definition", async () => {
  const server = await mcpApi.createServer({
    name: "history",
    command: "node",
    args: ["one.mjs"],
  });
  await mcpApi.updateServer(server.id, { args: ["two.mjs"] });
  expect(
    (await mcpApi.listVersions(server.id)).items.map((v) => v.version),
  ).toEqual([2, 1]);
  expect(
    (await mcpApi.compareVersions(server.id, 1, 2)).changes,
  ).toContainEqual({ field: "args", before: ["one.mjs"], after: ["two.mjs"] });
  await mcpApi.updateVersionNote(server.id, 1, "reviewed");
  expect((await mcpApi.getVersion(server.id, 1)).note).toBe("reviewed");
  const restored = await mcpApi.restoreVersion(server.id, 1);
  expect(restored.version).toBe(3);
  await expect(mcpApi.deleteVersion(server.id, 3)).rejects.toThrow(/current/i);
  await mcpApi.deleteVersion(server.id, 2);
  expect((await mcpApi.createVersion(server.id, "manual")).version).toBe(4);
  await runtime.reopen();
  registerMcpIPC(new CoreMcpLibraryService());
  expect((await mcpApi.getLibrary()).servers[0].args).toEqual(["one.mjs"]);
  expect(
    (await mcpApi.listVersions(server.id)).items.map((v) => v.version),
  ).toEqual([4, 3, 1]);
});

it("rejects malformed history IPC inputs without mutating the stored history", async () => {
  const server = await mcpApi.createServer({
    name: "validation",
    command: "node",
  });
  const invalidCalls: [string, ...unknown[]][] = [
    [IPC_CHANNELS.MCP_VERSION_LIST, "../outside"],
    [IPC_CHANNELS.MCP_VERSION_LIST, server.id, { offset: -1 }],
    [IPC_CHANNELS.MCP_VERSION_LIST, server.id, { limit: 0 }],
    [IPC_CHANNELS.MCP_VERSION_LIST, server.id, { unknown: true }],
    [IPC_CHANNELS.MCP_VERSION_GET, server.id, "1"],
    [IPC_CHANNELS.MCP_VERSION_GET, server.id, 1.5],
    [IPC_CHANNELS.MCP_VERSION_COMPARE, server.id, 1, 0],
    [IPC_CHANNELS.MCP_VERSION_CREATE, server.id, "note\0value"],
    [IPC_CHANNELS.MCP_VERSION_RESTORE, server.id, -1],
    [IPC_CHANNELS.MCP_VERSION_NOTE, server.id, 1, {}],
    [IPC_CHANNELS.MCP_VERSION_DELETE, "", 1],
  ];
  for (const [channel, ...args] of invalidCalls)
    await expect(invokeSkillIPC(channel, ...args)).rejects.toThrow(/invalid/);
  expect(
    (await mcpApi.listVersions(server.id)).items.map((item) => item.version),
  ).toEqual([1]);
});

it("exports and restores the complete retained history through the existing asset snapshot entrypoints", async () => {
  const server = await mcpApi.createServer({
    name: "backup",
    command: "node",
    args: ["original.mjs"],
  });
  await mcpApi.updateServer(server.id, { args: ["changed.mjs"] });
  await mcpApi.updateVersionNote(server.id, 1, "backup baseline");
  const retainedInput = '{"retainedPlaintext":"backup-exclusion-fixture"}';
  fs.writeFileSync(getMcpLibraryFilePath(), retainedInput);
  const snapshot = await mcpApi.exportDataFiles();
  expect(fs.readFileSync(getMcpLibraryFilePath(), "utf8")).toBe(retainedInput);
  expect(
    snapshot.some((file) => file.relativePath === "mcp-state.sqlite"),
  ).toBe(true);
  expect(snapshot.some((file) => file.relativePath === "library.json")).toBe(
    false,
  );
  expect(snapshot.map((file) => file.relativePath)).toEqual(
    expect.arrayContaining([
      `${server.id}/versions/000001.json`,
      `${server.id}/versions/000002.json`,
    ]),
  );
  await mcpApi.createVersion(server.id, "after backup");
  await mcpApi.restoreDataFiles(snapshot);
  await runtime.reopen();
  registerMcpIPC(new CoreMcpLibraryService());
  expect(
    (await mcpApi.listVersions(server.id)).items.map((item) => item.version),
  ).toEqual([2, 1]);
  expect((await mcpApi.getVersion(server.id, 1)).note).toBe("backup baseline");
  expect((await mcpApi.getLibrary()).servers[0].args).toEqual(["changed.mjs"]);
});
