/**
 * @vitest-environment node
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CoreMcpLibraryService,
  CorePluginLibraryService,
  configureRuntimePaths,
  emptyPluginInventory,
  getPluginLibraryFilePath,
  resetRuntimePaths,
} from "@prompthub/core";
import { importChildMcpServersForPlugin } from "../../../src/main/ipc/plugin.ipc";

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

describe("Plugin child MCP import", () => {
  let userDataPath: string;
  let pluginPackagePath: string;

  beforeEach(() => {
    userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-child-mcp-"));
    configureRuntimePaths({ userDataPath });
    pluginPackagePath = path.join(
      userDataPath,
      "data",
      "plugins",
      "gmail",
      "repo",
      "plugins",
      "gmail",
    );
    writeJson(path.join(pluginPackagePath, ".codex-plugin", "plugin.json"), {
      name: "gmail",
    });
    writeJson(path.join(pluginPackagePath, ".mcp.json"), {
      mcpServers: {
        gmail: {
          command: "node",
          args: ["server.js"],
        },
      },
    });
    writeJson(path.join(pluginPackagePath, "package.json"), {
      name: "gmail",
    });
    writeJson(getPluginLibraryFilePath(), {
      kind: "prompthub-plugin-library",
      version: 1,
      updatedAt: "2026-06-22T00:00:00.000Z",
      plugins: [
        {
          id: "gmail",
          name: "gmail",
          displayName: "Gmail",
          trustLevel: "official",
          inventory: { ...emptyPluginInventory(), skills: 1, mcpServers: 1 },
          classification: "bundle",
          source: {
            kind: "market",
            packagePath: "plugins/gmail",
            localPackagePath: pluginPackagePath,
          },
          localPackagePath: pluginPackagePath,
          localRepositoryPath: path.join(
            userDataPath,
            "data",
            "plugins",
            "gmail",
            "repo",
          ),
          distributedTargetIds: [],
          installedAt: 1,
          updatedAt: 1,
        },
      ],
    });
  });

  afterEach(() => {
    resetRuntimePaths();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  });

  it("imports MCP configs through the MCP library and skips symlink escapes", () => {
    const outsideConfigPath = path.join(userDataPath, "outside-mcp.json");
    writeJson(outsideConfigPath, {
      mcpServers: {
        escape: {
          command: "node",
          args: ["escape.js"],
        },
      },
    });
    fs.mkdirSync(path.join(pluginPackagePath, "mcp"), { recursive: true });
    fs.symlinkSync(
      outsideConfigPath,
      path.join(pluginPackagePath, "mcp", "escape.json"),
    );

    const result = importChildMcpServersForPlugin(
      new CorePluginLibraryService(),
      "gmail",
    );

    expect(result.scannedFiles).toEqual([
      fs.realpathSync(path.join(pluginPackagePath, ".mcp.json")),
    ]);
    expect(result.imported.map((server) => server.name)).toEqual(["gmail"]);
    expect(result.failedFiles).toEqual([]);
    expect(
      new CoreMcpLibraryService().read().servers.map((server) => server.name),
    ).toEqual(["gmail"]);
  });

  it("returns skipped server names when imported plugin MCP already exists", () => {
    importChildMcpServersForPlugin(new CorePluginLibraryService(), "gmail");

    const result = importChildMcpServersForPlugin(
      new CorePluginLibraryService(),
      "gmail",
    );

    expect(result.imported).toEqual([]);
    expect(result.skipped).toEqual(["gmail"]);
    expect(result.failedFiles).toEqual([]);
  });
});
