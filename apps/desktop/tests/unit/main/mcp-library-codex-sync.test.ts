import { createMcpTestStorage } from "../../../../../packages/core/tests/helpers/mcp-storage";
let mcpStorage: ReturnType<typeof createMcpTestStorage>;
/**
 * @vitest-environment node
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CoreMcpLibraryService,
  configureRuntimePaths,
  getLegacyMcpLibraryFilePath,
  getMcpLibraryFilePath,
  getMcpTargetPresets,
  resetRuntimePaths,
} from "@prompthub/core";

describe("CoreMcpLibraryService", () => {
  let userDataPath: string;

  beforeEach(() => {
    userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-library-"));
    configureRuntimePaths({ userDataPath });
    mcpStorage = createMcpTestStorage();
  });

  afterEach(() => {
    mcpStorage.dispose();
    resetRuntimePaths();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  });

  it("syncs one Codex server without deleting other managed servers", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const first = service.createServer({
      name: "filesystem",
      displayName: "Filesystem",
      transport: "stdio",
      command: "npx",
      args: ["@modelcontextprotocol/server-filesystem", "/tmp"],
    });
    const second = service.createServer({
      name: "memory",
      displayName: "Memory",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
      env: {
        MEMORY_FILE_PATH: "/tmp/memory.json",
      },
    });
    const targetPath = path.join(userDataPath, ".codex", "config.toml");

    service.apply({
      target: "codex",
      scope: "custom",
      path: targetPath,
      serverIds: [first.id, second.id],
    });
    service.updateServer(first.id, {
      args: ["@modelcontextprotocol/server-filesystem", "/var/tmp"],
    });

    const result = service.syncServerToBoundTargets(first.id);
    const written = fs.readFileSync(targetPath, "utf8");

    expect(result.updated).toEqual([
      expect.objectContaining({
        serverName: "filesystem",
        path: targetPath,
      }),
    ]);
    expect(written).toContain("[mcp_servers.filesystem]");
    expect(written).toContain('"/var/tmp"');
    expect(written).toContain("[mcp_servers.memory]");
    expect(written).toContain("@modelcontextprotocol/server-memory");
    expect(service.checkServerTargetSync(second.id)[0]).toMatchObject({
      status: "synced",
    });
  });

  it("blocks Codex single-server sync when a managed sibling was externally modified", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const first = service.createServer({
      name: "filesystem",
      displayName: "Filesystem",
      transport: "stdio",
      command: "npx",
      args: ["@modelcontextprotocol/server-filesystem", "/tmp"],
    });
    const second = service.createServer({
      name: "memory",
      displayName: "Memory",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
      env: {
        MEMORY_FILE_PATH: "/tmp/memory.json",
      },
    });
    const targetPath = path.join(userDataPath, ".codex", "config.toml");

    service.apply({
      target: "codex",
      scope: "custom",
      path: targetPath,
      serverIds: [first.id, second.id],
    });
    fs.writeFileSync(
      targetPath,
      fs
        .readFileSync(targetPath, "utf8")
        .replace("/tmp/memory.json", "/external/memory.json"),
      "utf8",
    );
    service.updateServer(first.id, {
      args: ["@modelcontextprotocol/server-filesystem", "/var/tmp"],
    });

    const result = service.syncServerToBoundTargets(first.id);
    const written = fs.readFileSync(targetPath, "utf8");

    expect(result.updated).toEqual([]);
    expect(result.blocked).toEqual([
      expect.objectContaining({
        serverName: "memory",
        status: "external-modified",
      }),
    ]);
    expect(written).toContain('"/tmp"');
    expect(written).not.toContain('"/var/tmp"');
    expect(written).toContain("/external/memory.json");
  });

  it("removes empty target bindings when a distributed server is deleted", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const server = service.createServer({
      name: "fetch",
      displayName: "Fetch",
      transport: "stdio",
      command: "uvx",
      args: ["mcp-server-fetch"],
    });
    const targetPath = path.join(userDataPath, "target", "mcp.json");
    service.apply({
      target: "claude",
      scope: "custom",
      path: targetPath,
      serverIds: [server.id],
    });

    const library = service.deleteServer(server.id);

    expect(library.servers).toHaveLength(0);
    expect(library.bindings).toEqual([]);
  });

  it("merges binding serverIds when re-applying to the same target", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const first = service.createServer({
      name: "fetch",
      displayName: "Fetch",
      transport: "stdio",
      command: "uvx",
      args: ["mcp-server-fetch"],
    });
    const second = service.createServer({
      name: "memory",
      displayName: "Memory",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
    });
    const targetPath = path.join(userDataPath, "target", "mcp.json");

    service.apply({
      target: "claude",
      scope: "custom",
      path: targetPath,
      serverIds: [first.id],
    });
    service.apply({
      target: "claude",
      scope: "custom",
      path: targetPath,
      serverIds: [second.id],
    });

    const binding = service.read().bindings[0];
    expect(binding.serverIds.sort()).toEqual([first.id, second.id].sort());
  });

  it("removes a server from a JSON target without leaving a backup sidecar", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const fetchServer = service.createServer({
      name: "fetch",
      displayName: "Fetch",
      transport: "stdio",
      command: "uvx",
      args: ["mcp-server-fetch"],
    });
    const memoryServer = service.createServer({
      name: "memory",
      displayName: "Memory",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
    });
    const targetPath = path.join(userDataPath, "target", "mcp.json");
    service.apply({
      target: "claude",
      scope: "custom",
      path: targetPath,
      serverIds: [fetchServer.id, memoryServer.id],
    });

    const result = service.removeFromTarget({
      target: "claude",
      scope: "custom",
      path: targetPath,
      serverIds: [fetchServer.id],
    });
    const written = JSON.parse(fs.readFileSync(targetPath, "utf8"));

    expect(result.removedServerNames).toEqual(["fetch"]);
    expect(result.backupPath).toBeUndefined();
    expect(fs.readdirSync(path.dirname(targetPath))).toEqual(["mcp.json"]);
    expect(written.mcpServers.fetch).toBeUndefined();
    expect(written.mcpServers.memory.command).toBe("npx");
    const binding = service.read().bindings[0];
    expect(binding.serverIds).toEqual([memoryServer.id]);

    service.removeFromTarget({
      target: "claude",
      scope: "custom",
      path: targetPath,
      serverIds: [memoryServer.id],
    });
    expect(service.read().bindings).toEqual([]);
  });

  it("removes a server section from a Codex TOML target", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const server = service.createServer({
      name: "filesystem",
      displayName: "Filesystem",
      transport: "stdio",
      command: "npx",
      args: ["@modelcontextprotocol/server-filesystem", "/tmp"],
    });
    const targetPath = path.join(userDataPath, ".codex", "config.toml");
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, 'model = "gpt-5"\n', "utf8");
    service.apply({
      target: "codex",
      scope: "custom",
      path: targetPath,
      serverIds: [server.id],
    });
    fs.appendFileSync(
      targetPath,
      [
        "",
        "[mcp_servers.filesystem.tools.read_file]",
        'approval_mode = "approve"',
        "",
        "[mcp_servers.filesystem-extra.tools.keep]",
        'approval_mode = "approve"',
      ].join("\n"),
      "utf8",
    );

    const result = service.removeFromTarget({
      target: "codex",
      scope: "custom",
      path: targetPath,
      serverIds: [server.id],
    });
    const written = fs.readFileSync(targetPath, "utf8");

    expect(result.removedServerNames).toEqual(["filesystem"]);
    expect(written).toContain('model = "gpt-5"');
    expect(written).not.toContain("[mcp_servers.filesystem]");
    expect(written).not.toContain("[mcp_servers.filesystem.tools.read_file]");
    expect(written).toContain("[mcp_servers.filesystem-extra.tools.keep]");
  });

  it("rejects removal when the target file does not exist", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const server = service.createServer({
      name: "fetch",
      displayName: "Fetch",
      transport: "stdio",
      command: "uvx",
      args: ["mcp-server-fetch"],
    });

    expect(() =>
      service.removeFromTarget({
        target: "claude",
        scope: "custom",
        path: path.join(userDataPath, "missing.json"),
        serverIds: [server.id],
      }),
    ).toThrow(/不存在/);
  });

  it("reports real per-target distribution status from config files", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const jsonPath = path.join(userDataPath, "status", "mcp.json");
    fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({ mcpServers: { fetch: { command: "uvx" } } }),
      "utf8",
    );
    const tomlPath = path.join(userDataPath, "status", "config.toml");
    fs.writeFileSync(
      tomlPath,
      '[mcp_servers.filesystem]\ncommand = "npx"\n',
      "utf8",
    );
    const kiloPath = path.join(userDataPath, "status", "kilo.json");
    fs.writeFileSync(
      kiloPath,
      [
        "{",
        "  // Kilo Code MCP",
        '  "mcp": {',
        '    "playwright": {',
        '      "type": "local",',
        '      "command": ["npx", "@playwright/mcp@latest"],',
        "    },",
        "  },",
        "}",
      ].join("\n"),
      "utf8",
    );
    const invalidPath = path.join(userDataPath, "status", "broken.json");
    fs.writeFileSync(invalidPath, "{not-json", "utf8");

    const status = service.getTargetStatus([
      {
        id: "claude",
        target: "claude",
        scope: "global",
        label: "Claude Code",
        path: jsonPath,
      },
      {
        id: "codex",
        target: "codex",
        scope: "global",
        label: "Codex",
        path: tomlPath,
      },
      {
        id: "missing",
        target: "cursor",
        scope: "global",
        label: "Cursor",
        path: path.join(userDataPath, "status", "missing.json"),
      },
      {
        id: "kilo",
        target: "kilo",
        scope: "global",
        label: "Kilo Code",
        path: kiloPath,
      },
      {
        id: "broken",
        target: "claude",
        scope: "global",
        label: "Broken",
        path: invalidPath,
      },
    ]);

    expect(status).toEqual([
      {
        presetId: "claude",
        path: jsonPath,
        exists: true,
        serverNames: ["fetch"],
        servers: [
          expect.objectContaining({
            name: "fetch",
            command: "uvx",
            source: { type: "import", id: "claude", label: "Claude Code" },
          }),
        ],
      },
      {
        presetId: "codex",
        path: tomlPath,
        exists: true,
        serverNames: ["filesystem"],
        servers: [
          expect.objectContaining({
            name: "filesystem",
            command: "npx",
            source: { type: "import", id: "codex", label: "Codex" },
          }),
        ],
      },
      {
        presetId: "missing",
        path: path.join(userDataPath, "status", "missing.json"),
        exists: false,
        serverNames: [],
      },
      {
        presetId: "kilo",
        path: kiloPath,
        exists: true,
        serverNames: ["playwright"],
        servers: [
          expect.objectContaining({
            name: "playwright",
            command: "npx",
            source: { type: "import", id: "kilo", label: "Kilo Code" },
          }),
        ],
      },
      {
        presetId: "broken",
        path: invalidPath,
        exists: true,
        serverNames: [],
        error: "MCP target configuration could not be read: broken",
      },
    ]);
  });

  it("exposes platform-scoped global target presets", () => {
    // The simulated platform selects locations; path separators follow the test host.
    const presets = getMcpTargetPresets("/Users/test", "darwin", {}).map(
      (preset) => ({
        ...preset,
        path: preset.path.replace(/\\/g, "/"),
      }),
    );
    const byId = Object.fromEntries(
      presets.map((preset) => [preset.id, preset]),
    );

    expect(byId.roo).toBeUndefined();
    expect(byId.grok).toMatchObject({
      target: "grok",
      platformId: "grok",
      scope: "global",
      path: "/Users/test/.grok/config.toml",
    });
    expect(byId.reasonix).toBeUndefined();
    expect(byId.kimi.path).toBe("/Users/test/.kimi-code/mcp.json");
    expect(byId.augment.path).toBe("/Users/test/.augment/settings.json");
    expect(byId.qwen).toMatchObject({
      target: "qwen",
      path: "/Users/test/.qwen/settings.json",
      platformId: "qwen",
    });
    expect(byId.claude.path).toBe("/Users/test/.claude.json");
    expect(byId.codex.path).toBe("/Users/test/.codex/config.toml");
    expect(byId.gemini.path).toBe("/Users/test/.gemini/settings.json");
    expect(byId.opencode.path).toBe(
      "/Users/test/.config/opencode/opencode.json",
    );
    expect(byId.zcode.path).toBe("/Users/test/.zcode/cli/config.json");
    expect(byId.kilo.path).toBe("/Users/test/.config/kilo/kilo.json");
    expect(presets.filter((preset) => preset.platformId === "kilo")).toEqual([
      byId.kilo,
    ]);
    expect(byId.windsurf.path).toBe(
      "/Users/test/.codeium/windsurf/mcp_config.json",
    );
    expect(byId.kiro.path).toBe("/Users/test/.kiro/settings/mcp.json");
    expect(byId.cline.path).toBe(
      "/Users/test/.cline/data/settings/cline_mcp_settings.json",
    );
    expect(byId.workbuddy.path).toBe("/Users/test/.workbuddy/mcp.json");
    expect(byId.codebuddy.path).toBe("/Users/test/.codebuddy/.mcp.json");
    expect(byId["claude-desktop"].path).toBe(
      "/Users/test/Library/Application Support/Claude/claude_desktop_config.json",
    );
    expect(byId.vscode.path).toBe(
      "/Users/test/Library/Application Support/Code/User/mcp.json",
    );
    expect(presets.every((preset) => preset.scope === "global")).toBe(true);
    expect(byId.vscode.platformId).toBeUndefined();
    expect(
      presets
        .filter((preset) => preset.id !== "vscode")
        .every((preset) => Boolean(preset.platformId)),
    ).toBe(true);

    const winPresets = getMcpTargetPresets("C:\\Users\\test", "win32");
    const winById = Object.fromEntries(
      winPresets.map((preset) => [preset.id, preset]),
    );
    expect(winById["claude-desktop"].path).toContain("AppData");
  });

  it("resolves Qwen MCP settings from QWEN_HOME without using its runtime directory", () => {
    const preset = getMcpTargetPresets("/Users/test", "darwin", {
      QWEN_HOME: "workspace-qwen",
      QWEN_RUNTIME_DIR: "/private/qwen-runtime",
    }).find((entry) => entry.id === "qwen");

    expect(preset?.path).toBe(path.resolve("workspace-qwen", "settings.json"));
  });
});
