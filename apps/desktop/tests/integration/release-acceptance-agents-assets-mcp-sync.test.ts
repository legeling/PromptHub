import {
  createSkillTestRuntime,
  fileInventory,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { safeStorage } from "electron";
import { MCP_REDACTED_VALUE } from "@prompthub/shared/utils/mcp-config";
import { createRendererPersistenceStore } from "@prompthub/core";
import { getDatabase } from "../../src/main/database";
import { registerSettingsIPC } from "../../src/main/ipc/settings.ipc";
import { settingsApi } from "../../src/preload/api/settings";
import { registerMcpIPC } from "../../src/main/ipc/mcp.ipc";
import { mcpApi } from "../../src/preload/api/mcp";
import { deriveProjectMcpTargetPresets } from "../../src/renderer/services/mcp-target-presets";
import type { McpServerDraft } from "@prompthub/shared/types/mcp";

let runtime: SkillTestRuntime;
function register(): void {
  registerMcpIPC();
  registerSettingsIPC(getDatabase(), {
    rendererPersistence: createRendererPersistenceStore({
      rootPath: runtime.profile,
      encryption: safeStorage,
    }),
  });
}
const draft: McpServerDraft = {
  name: "acceptance-env",
  displayName: "Acceptance env",
  transport: "stdio",
  command: "node",
  args: ["fixture.mjs", "before"],
  env: { EXISTING: "preserved" },
};
beforeEach(async () => {
  // OS keychain boundary only; synthetic values still use the real vault.
  vi.spyOn(safeStorage, "isEncryptionAvailable").mockReturnValue(true);
  vi.spyOn(safeStorage, "encryptString").mockImplementation((value) =>
    Buffer.from(value, "utf8"),
  );
  vi.spyOn(safeStorage, "decryptString").mockImplementation((value) =>
    value.toString("utf8"),
  );
  runtime = await createSkillTestRuntime();
  register();
});
afterEach(() => {
  runtime?.dispose();
  vi.restoreAllMocks();
});
it("imports selected env keys, syncs JSON and TOML targets independently and preserves conflicting target bytes through reopen", async () => {
  const server = await mcpApi.createServer(draft);
  const envPath = path.join(runtime.root, "fixture.env");
  fs.writeFileSync(
    envPath,
    'MODE="local fixture"\nUNSELECTED=excluded\nEXISTING=replaced\n',
  );
  const envBytes = fs.readFileSync(envPath);
  const imported = await mcpApi.importEnv(server.id, envPath, [
    "MODE",
    "MISSING",
  ]);
  expect(imported).toMatchObject({
    importedKeys: ["MODE"],
    missingKeys: [],
    skippedKeys: ["MISSING"],
    server: { env: { EXISTING: MCP_REDACTED_VALUE, MODE: MCP_REDACTED_VALUE } },
  });
  const paths = [
    path.join(runtime.platformRoot("cursor"), "mcp.json"),
    path.join(runtime.platformRoot("codex"), "config.toml"),
  ];
  await mcpApi.apply({
    target: "cursor",
    scope: "global",
    path: paths[0],
    serverIds: [server.id],
  });
  await mcpApi.apply({
    target: "codex",
    scope: "global",
    path: paths[1],
    serverIds: [server.id],
  });
  await mcpApi.updateServer(server.id, {
    ...draft,
    args: ["fixture.mjs", "after"],
    env: imported.server.env,
  });
  expect(
    (await mcpApi.checkTargetSync(server.id)).map((entry) => entry.status),
  ).toEqual(["needs-sync", "needs-sync"]);
  const external = fs
    .readFileSync(paths[1], "utf8")
    .replace('"before"', '"external"');
  fs.writeFileSync(paths[1], external);
  const synced = await mcpApi.syncTargets(server.id);
  expect(synced.updated).toEqual([expect.objectContaining({ path: paths[0] })]);
  expect(synced.blocked).toEqual([
    expect.objectContaining({ path: paths[1], status: "conflict" }),
  ]);
  expect(synced.failed).toEqual([]);
  expect(JSON.parse(fs.readFileSync(paths[0], "utf8"))).toMatchObject({
    mcpServers: {
      "acceptance-env": {
        args: ["fixture.mjs", "after"],
        env: { EXISTING: "preserved", MODE: "local fixture" },
      },
    },
  });
  expect(fs.readFileSync(paths[1], "utf8")).toBe(external);
  const inventory = fileInventory(runtime.platformRoot("codex"));
  await expect(
    mcpApi.importEnv(server.id, path.join(runtime.root, "missing.env")),
  ).rejects.toThrow();
  await runtime.reopen();
  register();
  expect((await mcpApi.getLibrary()).servers).toEqual([
    expect.objectContaining({ id: server.id, args: ["fixture.mjs", "after"] }),
  ]);
  expect(fileInventory(runtime.platformRoot("codex"))).toEqual(inventory);
  expect(
    (await mcpApi.checkTargetSync(server.id))
      .map((entry) => entry.status)
      .sort(),
  ).toEqual(["conflict", "synced"]);
  expect(fs.readFileSync(envPath)).toEqual(envBytes);
});
it("derives a registered project target, applies native config there and retains the binding after reopen", async () => {
  const projectRoot = path.join(runtime.root, "project with spaces");
  const project = {
    id: "fixture-project",
    name: "Project",
    rootPath: projectRoot,
    scanPaths: [],
    createdAt: 1,
    updatedAt: 1,
  };
  await settingsApi.set({ skillProjects: [project] });
  const preset = deriveProjectMcpTargetPresets(
    (await settingsApi.get()).skillProjects,
  ).find((entry) => entry.id === "project:fixture-project:opencode");
  if (!preset) throw new Error("Missing project preset");
  expect(preset.path).toBe(path.join(projectRoot, "opencode.json"));
  const server = await mcpApi.createServer(draft);
  await mcpApi.apply({ ...preset, serverIds: [server.id] });
  expect(JSON.parse(fs.readFileSync(preset.path, "utf8"))).toMatchObject({
    mcp: {
      "acceptance-env": {
        type: "local",
        command: ["node", "fixture.mjs", "before"],
      },
    },
  });
  await runtime.reopen();
  register();
  expect((await settingsApi.get()).skillProjects).toEqual([project]);
  expect(await mcpApi.checkTargetSync(server.id)).toEqual([
    expect.objectContaining({
      path: preset.path,
      scope: "workspace",
      status: "synced",
    }),
  ]);
  expect(fs.existsSync(path.join(runtime.root, "opencode.json"))).toBe(false);
});
