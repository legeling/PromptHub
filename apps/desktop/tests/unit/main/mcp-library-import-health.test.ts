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

  it("writes and removes OpenCode MCP entries without touching unrelated user config", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const server = service.createServer({
      name: "memory",
      displayName: "Memory",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
      env: {
        MEMORY_FILE_PATH: "/tmp/memory.json",
      },
    });
    const targetPath = path.join(
      userDataPath,
      ".config",
      "opencode",
      "opencode.json",
    );
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(
      targetPath,
      JSON.stringify(
        {
          provider: {
            openai: {
              npm: "@ai-sdk/openai",
            },
          },
          mcp: {
            external: {
              type: "remote",
              url: "https://example.com/mcp",
              enabled: true,
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    service.apply({
      target: "opencode",
      scope: "custom",
      path: targetPath,
      serverIds: [server.id],
    });
    const afterApply = JSON.parse(fs.readFileSync(targetPath, "utf8"));
    expect(afterApply.provider.openai.npm).toBe("@ai-sdk/openai");
    expect(afterApply.mcp.external.url).toBe("https://example.com/mcp");
    expect(afterApply.mcp.memory).toEqual({
      type: "local",
      command: ["npx", "-y", "@modelcontextprotocol/server-memory"],
      environment: {
        MEMORY_FILE_PATH: "/tmp/memory.json",
      },
      enabled: true,
    });

    const result = service.removeFromTarget({
      target: "opencode",
      scope: "custom",
      path: targetPath,
      serverIds: [server.id],
    });
    const afterRemove = JSON.parse(fs.readFileSync(targetPath, "utf8"));

    expect(result.backupPath).toBeUndefined();
    expect(fs.readdirSync(path.dirname(targetPath))).toEqual(["opencode.json"]);
    expect(afterRemove.provider.openai.npm).toBe("@ai-sdk/openai");
    expect(afterRemove.mcp.external.url).toBe("https://example.com/mcp");
    expect(afterRemove.mcp.memory).toBeUndefined();
    expect(service.read().bindings).toEqual([]);
  });

  it("writes ZCode MCP entries under the native nested config and imports disabled entries", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const server = service.createServer({
      name: "memory",
      displayName: "Memory",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
    });
    const targetPath = path.join(userDataPath, ".zcode", "cli", "config.json");
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(
      targetPath,
      JSON.stringify(
        {
          model: "glm-5",
          mcp: {
            servers: {
              existing: { command: "node" },
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    service.apply({
      target: "zcode",
      scope: "global",
      path: targetPath,
      serverIds: [server.id],
    });
    const afterApply = JSON.parse(fs.readFileSync(targetPath, "utf8"));
    expect(afterApply.model).toBe("glm-5");
    expect(afterApply.mcp.servers.existing.command).toBe("node");
    expect(afterApply.mcp.servers.memory.command).toBe("npx");

    const importedPath = path.join(userDataPath, ".zcode", "config.json");
    fs.writeFileSync(
      importedPath,
      JSON.stringify({
        mcp: {
          servers: {
            disabled: {
              command: "node",
              enable: false,
            },
          },
        },
      }),
      "utf8",
    );
    const imported = service.importFromFile(importedPath).imported[0];
    expect(imported.name).toBe("disabled");
    expect(imported.enabled).toBe(false);
  });

  it("removes external target MCP entries by server name without requiring library records", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const targetPath = path.join(userDataPath, "target", "external.json");
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(
      targetPath,
      JSON.stringify(
        {
          keep: true,
          mcpServers: {
            external: {
              command: "npx",
              args: ["external-mcp"],
            },
            keep: {
              command: "uvx",
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = service.removeNamesFromTarget({
      target: "claude",
      scope: "custom",
      path: targetPath,
      serverNames: ["external"],
    });
    const written = JSON.parse(fs.readFileSync(targetPath, "utf8"));

    expect(result.removedServerNames).toEqual(["external"]);
    expect(result.backupPath).toBeUndefined();
    expect(fs.readdirSync(path.dirname(targetPath))).toEqual(["external.json"]);
    expect(written.keep).toBe(true);
    expect(written.mcpServers.external).toBeUndefined();
    expect(written.mcpServers.keep.command).toBe("uvx");
    expect(service.read().bindings).toEqual([]);
  });

  it("force-overwrites same-name external Codex TOML sections without duplicating them", () => {
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
    fs.writeFileSync(
      targetPath,
      [
        'model = "gpt-5"',
        "",
        "[mcp_servers.filesystem]",
        'command = "node"',
        "",
        "[mcp_servers.keep]",
        'command = "uvx"',
      ].join("\n"),
      "utf8",
    );

    const result = service.apply({
      target: "codex",
      scope: "custom",
      path: targetPath,
      serverIds: [server.id],
      force: true,
    });
    const written = fs.readFileSync(targetPath, "utf8");

    expect(result.overwrittenServerNames).toEqual(["filesystem"]);
    expect(written.match(/\[mcp_servers\.filesystem\]/g)).toHaveLength(1);
    expect(written).toContain("[mcp_servers.keep]");
    expect(written).toContain('command = "npx"');
    expect(written).not.toContain('command = "node"');
  });

  it("imports Codex TOML MCP servers", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const importPath = path.join(userDataPath, "config.toml");
    fs.writeFileSync(
      importPath,
      [
        "[mcp_servers.filesystem]",
        'command = "npx"',
        'args = ["@modelcontextprotocol/server-filesystem", "/tmp"]',
        'env = { TOKEN = "abc" }',
      ].join("\n"),
      "utf8",
    );

    const result = service.importFromFile(importPath);
    const imported = result.imported[0];

    expect(result.skipped).toEqual([]);
    expect(imported.name).toBe("filesystem");
    expect(imported.command).toBe("npx");
    expect(imported.args).toEqual([
      "@modelcontextprotocol/server-filesystem",
      "/tmp",
    ]);
    expect(imported.env).toEqual({ TOKEN: "abc" });
  });

  it("imports JSON mcpServers and VS Code servers configs", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const mcpServersPath = path.join(userDataPath, "mcp.json");
    const vscodePath = path.join(userDataPath, "vscode-mcp.json");
    fs.writeFileSync(
      mcpServersPath,
      JSON.stringify({
        mcpServers: {
          fetch: {
            command: "uvx",
            args: ["mcp-server-fetch"],
          },
        },
      }),
      "utf8",
    );
    fs.writeFileSync(
      vscodePath,
      JSON.stringify({
        servers: {
          docs: {
            url: "https://example.com/mcp",
          },
        },
      }),
      "utf8",
    );

    const first = service.importFromFile(mcpServersPath);
    const second = service.importFromFile(vscodePath);

    expect(first.imported[0]).toMatchObject({
      name: "fetch",
      command: "uvx",
      args: ["mcp-server-fetch"],
      transport: "stdio",
    });
    expect(second.imported[0]).toMatchObject({
      name: "docs",
      url: "https://example.com/mcp",
      transport: "streamable-http",
    });
    expect(
      service
        .read()
        .servers.map((server) => server.name)
        .sort(),
    ).toEqual(["docs", "fetch"]);
  });

  it("creates MCP servers from command lines, URLs, GitHub repos, and local projects", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const projectPath = path.join(userDataPath, "sources", "node-mcp");
    fs.mkdirSync(projectPath, { recursive: true });
    fs.writeFileSync(
      path.join(projectPath, "package.json"),
      JSON.stringify({
        name: "@acme/node-mcp",
        description: "Local Node MCP",
        scripts: { mcp: "node server.js" },
      }),
      "utf8",
    );

    const commandResult = service.createFromSource({
      input: 'npx -y "@modelcontextprotocol/server-memory"',
      kind: "command",
    });
    const githubResult = service.createFromSource({
      input: "https://github.com/acme/custom-mcp",
    });
    const remoteResult = service.createFromSource({
      input: "https://example.com/mcp",
    });
    const localResult = service.createFromSource({
      input: projectPath,
      kind: "path",
    });

    expect(commandResult.detectedKind).toBe("command");
    expect(commandResult.imported[0]).toMatchObject({
      name: "modelcontextprotocol-server-memory",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
    });
    expect(githubResult).toMatchObject({
      detectedKind: "github",
      warnings: expect.arrayContaining([expect.stringContaining("npx")]),
    });
    expect(githubResult.imported[0]).toMatchObject({
      name: "custom-mcp",
      command: "npx",
      args: ["-y", "github:acme/custom-mcp"],
      source: {
        type: "import",
        label: "GitHub repository",
        url: "https://github.com/acme/custom-mcp",
      },
    });
    expect(remoteResult.imported[0]).toMatchObject({
      name: "example-com",
      transport: "streamable-http",
      url: "https://example.com/mcp",
    });
    expect(localResult.imported[0]).toMatchObject({
      name: "acme-node-mcp",
      command: "npm",
      args: ["run", "mcp"],
      cwd: projectPath,
      source: { label: "Local Node project" },
    });
  });

  it("creates MCP servers from pasted JSON config content", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);

    const result = service.createFromSource({
      kind: "config",
      input: JSON.stringify({
        mcpServers: {
          memory: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-memory"],
            env: { MEMORY_FILE_PATH: "/tmp/memory.json" },
          },
        },
      }),
    });

    expect(result).toMatchObject({
      detectedKind: "config-content",
      warnings: [],
      skipped: [],
    });
    expect(result.imported[0]).toMatchObject({
      name: "memory",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
      env: { MEMORY_FILE_PATH: "/tmp/memory.json" },
      source: { type: "import" },
    });
    expect(service.read().servers.map((server) => server.name)).toEqual([
      "memory",
    ]);
  });

  it("creates MCP servers from pasted Codex TOML config content", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);

    const result = service.createFromSource({
      kind: "config",
      input: [
        "[mcp_servers.filesystem]",
        'command = "npx"',
        'args = ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]',
      ].join("\n"),
    });

    expect(result).toMatchObject({
      detectedKind: "config-content",
      skipped: [],
    });
    expect(result.imported[0]).toMatchObject({
      name: "filesystem",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    });
  });

  it("selectively imports only required env keys for a server", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const server = service.createServer({
      name: "github",
      displayName: "GitHub",
      transport: "stdio",
      command: process.execPath,
      args: ["server.js", "--token", "${GITHUB_PERSONAL_ACCESS_TOKEN}"],
      env: {
        GITHUB_PERSONAL_ACCESS_TOKEN: "",
      },
    });
    const envPath = path.join(userDataPath, ".env");
    fs.writeFileSync(
      envPath,
      [
        "GITHUB_PERSONAL_ACCESS_TOKEN=ghp_test",
        "UNRELATED_SECRET=do-not-import",
      ].join("\n"),
      "utf8",
    );

    const result = service.importEnvForServer(server.id, envPath);
    const updated = service.read().servers[0];

    expect(result.importedKeys).toEqual(["GITHUB_PERSONAL_ACCESS_TOKEN"]);
    expect(result.skippedKeys).toEqual([]);
    expect(result.missingKeys).toEqual([]);
    expect(updated.env).toEqual({
      GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_test",
    });
  });

  it("toggles a server enabled state by id or name", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const server = service.createServer({
      name: "fetch",
      displayName: "Fetch",
      transport: "stdio",
      command: process.execPath,
    });

    expect(service.setServerEnabled(server.id, false)).toMatchObject({
      id: server.id,
      name: "fetch",
      enabled: false,
    });
    expect(service.setServerEnabled("fetch", true)).toMatchObject({
      id: server.id,
      name: "fetch",
      enabled: true,
    });
  });

  it("checks MCP health without starting unknown server processes", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const healthy = service.createServer({
      name: "healthy",
      displayName: "Healthy",
      transport: "stdio",
      command: process.execPath,
      args: ["server.js"],
    });
    const missingEnv = service.createServer({
      name: "github",
      displayName: "GitHub",
      transport: "stdio",
      command: "definitely-missing-prompthub-command",
      env: {
        GITHUB_PERSONAL_ACCESS_TOKEN: "",
      },
    });

    expect(service.checkServer(healthy.id)).toMatchObject({
      serverName: "healthy",
      status: "ok",
      issues: [],
    });
    expect(service.checkServer("github")).toMatchObject({
      serverId: missingEnv.id,
      status: "error",
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "COMMAND_NOT_FOUND" }),
        expect.objectContaining({
          code: "MISSING_ENV",
          field: "GITHUB_PERSONAL_ACCESS_TOKEN",
        }),
      ]),
    });
    expect(service.checkAllServers()).toHaveLength(2);
  });

  it("warns when known MCP env values do not match expected token formats", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const slack = service.createServer({
      name: "slack",
      displayName: "Slack",
      transport: "stdio",
      command: process.execPath,
      args: ["@modelcontextprotocol/server-slack"],
      env: {
        SLACK_BOT_TOKEN: "123",
        SLACK_TEAM_ID: "123",
      },
    });

    expect(service.checkServer(slack.id)).toMatchObject({
      serverId: slack.id,
      status: "warning",
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: "INVALID_ENV_VALUE",
          severity: "warning",
          field: "SLACK_BOT_TOKEN",
        }),
        expect.objectContaining({
          code: "INVALID_ENV_VALUE",
          severity: "warning",
          field: "SLACK_TEAM_ID",
        }),
      ]),
    });
  });

  it("warns when env values use unresolved config-file references", () => {
    const variableName = "PROMPTHOOK_MCP_HEALTH_MISSING";
    const previousValue = process.env[variableName];
    delete process.env[variableName];
    try {
      const service = new CoreMcpLibraryService(mcpStorage.options);
      const mineru = service.createServer({
        name: "mineru",
        displayName: "MinerU",
        transport: "stdio",
        command: process.execPath,
        args: ["mineru-mcp"],
        env: {
          MINERU_TOKEN: `\${${variableName}}`,
        },
      });

      expect(service.checkServer(mineru.id)).toMatchObject({
        serverId: mineru.id,
        status: "warning",
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: "UNRESOLVED_ENV_REFERENCE",
            severity: "warning",
            field: variableName,
          }),
        ]),
      });
      expect(JSON.stringify(service.checkServer(mineru.id))).not.toContain(
        "ph-token",
      );
    } finally {
      if (previousValue === undefined) {
        delete process.env[variableName];
      } else {
        process.env[variableName] = previousValue;
      }
    }
  });

  it("does not expose a warning when a reference is available or has a default", () => {
    const availableName = "PROMPTHOOK_MCP_HEALTH_AVAILABLE";
    const optionalName = "PROMPTHOOK_MCP_HEALTH_OPTIONAL";
    const previousAvailable = process.env[availableName];
    const previousOptional = process.env[optionalName];
    process.env[availableName] = "available";
    delete process.env[optionalName];
    try {
      const service = new CoreMcpLibraryService(mcpStorage.options);
      const server = service.createServer({
        name: "reference-health",
        displayName: "Reference Health",
        transport: "stdio",
        command: process.execPath,
        envRefs: {
          AVAILABLE: `\${${availableName}}`,
          OPTIONAL: `\${${optionalName}:-fallback}`,
        },
      });

      expect(service.checkServer(server.id)).toMatchObject({
        status: "ok",
        issues: [],
      });
    } finally {
      if (previousAvailable === undefined) {
        delete process.env[availableName];
      } else {
        process.env[availableName] = previousAvailable;
      }
      if (previousOptional === undefined) {
        delete process.env[optionalName];
      } else {
        process.env[optionalName] = previousOptional;
      }
    }
  });

  it("preserves local direct values when a redacted renderer draft is saved", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const server = service.createServer({
      name: "private-api",
      displayName: "Private API",
      transport: "streamable-http",
      url: "https://example.com/mcp",
      headers: { Authorization: "Bearer local-secret" },
    });

    const updated = service.updateServer(server.id, {
      displayName: "Private API (edited)",
      headers: { Authorization: "[REDACTED]" },
    });

    expect(updated.displayName).toBe("Private API (edited)");
    expect(updated.headers).toEqual({
      Authorization: "[REDACTED]",
    });
    expect(service.read().servers[0].headers).toEqual({
      Authorization: "Bearer local-secret",
    });
  });

  it("redacts apply and remove result content without redacting the target file", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const server = service.createServer({
      name: "private-api",
      displayName: "Private API",
      transport: "streamable-http",
      url: "https://example.com/mcp",
      headers: { Authorization: "Bearer local-secret" },
    });
    const targetPath = path.join(userDataPath, "private", "mcp.json");

    const applied = service.apply({
      target: "claude",
      scope: "custom",
      path: targetPath,
      serverIds: [server.id],
    });
    const written = fs.readFileSync(targetPath, "utf8");

    expect(written).toContain("Bearer local-secret");
    expect(applied.content).toContain("[REDACTED]");
    expect(applied.content).not.toContain("local-secret");

    const removed = service.removeFromTarget({
      target: "claude",
      scope: "custom",
      path: targetPath,
      serverIds: [server.id],
    });
    expect(removed.content).not.toContain("local-secret");
  });

  it("applies Codex TOML targets without leaving a sidecar backup", () => {
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

    const result = service.apply({
      target: "codex",
      scope: "custom",
      path: targetPath,
      serverIds: [server.id],
    });
    const written = fs.readFileSync(targetPath, "utf8");

    expect(result.backupPath).toBeUndefined();
    expect(fs.readdirSync(path.dirname(targetPath))).toEqual(["config.toml"]);
    expect(written).toContain('model = "gpt-5"');
    expect(written).toContain("# >>> PromptHub MCP managed block >>>");
    expect(written).toContain("[mcp_servers.filesystem]");
    expect(service.read().bindings[0]).toMatchObject({
      target: "codex",
      path: targetPath,
      serverIds: [server.id],
    });
  });
});
