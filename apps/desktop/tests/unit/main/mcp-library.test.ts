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
  });

  afterEach(() => {
    resetRuntimePaths();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  });

  it("persists created servers in the PromptHub data directory", () => {
    const service = new CoreMcpLibraryService();

    const server = service.createServer({
      name: "Playwright",
      displayName: "Playwright",
      transport: "stdio",
      command: "npx",
      args: ["@playwright/mcp@latest"],
    });

    expect(server.name).toBe("playwright");
    expect(getMcpLibraryFilePath()).toBe(
      path.join(userDataPath, "data", "mcp", "library.json"),
    );
    expect(fs.existsSync(getLegacyMcpLibraryFilePath())).toBe(false);
    expect(service.read().servers).toHaveLength(1);
  });

  it("migrates legacy config MCP library files to data on first read", () => {
    const legacyPath = getLegacyMcpLibraryFilePath();
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(
      legacyPath,
      `${JSON.stringify(
        {
          kind: "prompthub-mcp-library",
          version: 1,
          updatedAt: "2026-01-01T00:00:00.000Z",
          servers: [
            {
              id: "mcp_legacy",
              name: "legacy",
              displayName: "Legacy",
              transport: "stdio",
              command: "npx",
              args: ["legacy-mcp"],
              enabled: true,
              tags: [],
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          bindings: [],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const service = new CoreMcpLibraryService();
    expect(service.read().servers.map((server) => server.name)).toEqual([
      "legacy",
    ]);

    expect(fs.existsSync(getMcpLibraryFilePath())).toBe(true);
    expect(fs.existsSync(legacyPath)).toBe(true);
    expect(service.read().servers.map((server) => server.name)).toEqual([
      "legacy",
    ]);
  });

  it("prefers the data MCP library when both data and legacy config files exist", () => {
    const service = new CoreMcpLibraryService();
    service.createServer({
      name: "data-server",
      displayName: "Data Server",
      transport: "stdio",
      command: "npx",
      args: ["data-server"],
    });

    const legacyPath = getLegacyMcpLibraryFilePath();
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(
      legacyPath,
      `${JSON.stringify({
        kind: "prompthub-mcp-library",
        version: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        servers: [
          {
            id: "mcp_legacy",
            name: "legacy-server",
            displayName: "Legacy Server",
            transport: "stdio",
            command: "npx",
            args: ["legacy-server"],
            enabled: true,
            tags: [],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        bindings: [],
      })}\n`,
      "utf8",
    );

    expect(service.read().servers.map((server) => server.name)).toEqual([
      "data-server",
    ]);
  });

  it("preconfigures real MCP store channels without third-party static templates", () => {
    const service = new CoreMcpLibraryService();

    const sources = service.getMarketSources();
    const templates = service.getMarketTemplates();

    expect(sources.map((source) => source.id)).toEqual([
      "prompthub-official",
      "modelcontextprotocol",
    ]);
    expect(sources).toEqual([
      expect.objectContaining({
        id: "prompthub-official",
        url: "https://github.com/legeling/PromptHub",
        trustLevel: "official",
      }),
      expect.objectContaining({
        id: "modelcontextprotocol",
        url: "https://registry.modelcontextprotocol.io",
        trustLevel: "official",
      }),
    ]);
    expect(templates).toEqual([]);
  });

  it("installs remote MCP store templates by value instead of requiring a built-in id", () => {
    const service = new CoreMcpLibraryService();

    const server = service.installMarketTemplate({
      id: "modelcontextprotocol:ai-adeu-adeu",
      name: "ai-adeu-adeu",
      displayName: "ADeu",
      description: "Automated DOCX redlining.",
      transport: "stdio",
      command: "uvx",
      args: ["adeu"],
      tags: ["docx"],
      packageName: "adeu",
      source: {
        id: "modelcontextprotocol",
        label: "MCP Registry",
        url: "https://registry.modelcontextprotocol.io",
        trustLevel: "official",
      },
    });

    expect(server).toMatchObject({
      name: "ai-adeu-adeu",
      displayName: "ADeu",
      command: "uvx",
      args: ["adeu"],
      source: {
        type: "market",
        id: "modelcontextprotocol:ai-adeu-adeu",
        label: "MCP Registry",
        url: "https://registry.modelcontextprotocol.io",
      },
    });
    expect(service.read().servers).toHaveLength(1);
  });

  it("drops legacy Roo target bindings when reading the MCP library", () => {
    const service = new CoreMcpLibraryService();
    const server = service.createServer({
      name: "filesystem",
      displayName: "Filesystem",
      transport: "stdio",
      command: "npx",
      args: ["@modelcontextprotocol/server-filesystem"],
    });
    const filePath = getMcpLibraryFilePath();
    const current = service.read();

    fs.writeFileSync(
      filePath,
      `${JSON.stringify(
        {
          ...current,
          bindings: [
            {
              id: "codex:global:/Users/test/.codex/config.toml",
              target: "codex",
              scope: "global",
              path: "/Users/test/.codex/config.toml",
              serverIds: [server.id],
              enabled: true,
              createdAt: 1,
              updatedAt: 1,
            },
            {
              id: "roo:global:/Users/test/.roo/mcp_settings.json",
              target: "roo",
              scope: "global",
              path: "/Users/test/.roo/mcp_settings.json",
              serverIds: [server.id],
              enabled: true,
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    expect(service.read().bindings).toEqual([
      expect.objectContaining({
        id: "codex:global:/Users/test/.codex/config.toml",
        target: "codex",
      }),
    ]);
  });

  it("updates and deletes library servers without mutating unrelated records", () => {
    const service = new CoreMcpLibraryService();
    const fetch = service.createServer({
      name: "fetch",
      displayName: "Fetch",
      transport: "stdio",
      command: "uvx",
      args: ["mcp-server-fetch"],
    });
    const memory = service.createServer({
      name: "memory",
      displayName: "Memory",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
    });
    const beforeFailedUpdate = service.read();

    expect(() =>
      service.updateServer(memory.id, {
        name: "fetch",
        displayName: "Duplicate Fetch",
        transport: "stdio",
        command: "npx",
      }),
    ).toThrow(/已存在/);
    expect(service.read()).toEqual(beforeFailedUpdate);

    const updated = service.updateServer(fetch.id, {
      displayName: "Fetch Updated",
      transport: "stdio",
      command: "uvx",
      args: ["mcp-server-fetch", "--ignore-robots-txt"],
      tags: ["web", "research"],
    });
    expect(updated).toMatchObject({
      id: fetch.id,
      name: "fetch",
      displayName: "Fetch Updated",
      args: ["mcp-server-fetch", "--ignore-robots-txt"],
      tags: ["web", "research"],
    });

    const afterDelete = service.deleteServer(memory.id);
    expect(afterDelete.servers.map((server) => server.id)).toEqual([fetch.id]);
    expect(afterDelete.servers[0]).toMatchObject({
      displayName: "Fetch Updated",
      args: ["mcp-server-fetch", "--ignore-robots-txt"],
    });
  });

  it("persists MCP favorite state through reads and updates", () => {
    const service = new CoreMcpLibraryService();
    const server = service.createServer({
      name: "fetch",
      displayName: "Fetch",
      transport: "stdio",
      command: "uvx",
      args: ["mcp-server-fetch"],
    });

    expect(
      service.updateServer(server.id, { isFavorite: true } as any),
    ).toMatchObject({ id: server.id, isFavorite: true });
    expect(service.read().servers[0]).toMatchObject({
      id: server.id,
      isFavorite: true,
    });

    expect(
      service.updateServer(server.id, { isFavorite: false } as any).isFavorite,
    ).toBe(false);
    expect(service.read().servers[0].isFavorite).toBe(false);
  });

  it("leaves the library unchanged when a legacy built-in template id is no longer available", () => {
    const service = new CoreMcpLibraryService();

    const beforeInstall = service.write(service.read());

    expect(() => service.installTemplate("context7")).toThrow(/模板不存在/);
    expect(service.read()).toEqual(beforeInstall);
  });

  it("applies JSON targets with a backup and preserves unrelated keys", () => {
    const service = new CoreMcpLibraryService();
    const server = service.createServer({
      name: "fetch",
      displayName: "Fetch",
      transport: "stdio",
      command: "uvx",
      args: ["mcp-server-fetch"],
    });
    const targetPath = path.join(userDataPath, "target", "mcp.json");
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(
      targetPath,
      JSON.stringify({ keep: true, mcpServers: { old: { command: "node" } } }),
      "utf8",
    );

    const result = service.apply({
      target: "claude",
      scope: "custom",
      path: targetPath,
      serverIds: [server.id],
    });
    const written = JSON.parse(fs.readFileSync(targetPath, "utf8"));

    expect(result.backupPath).toBeTruthy();
    expect(fs.existsSync(result.backupPath!)).toBe(true);
    expect(written.keep).toBe(true);
    expect(written.mcpServers.old.command).toBe("node");
    expect(written.mcpServers.fetch.command).toBe("uvx");
  });

  it("does not write target files or bindings when applying only disabled servers", () => {
    const service = new CoreMcpLibraryService();
    const server = service.createServer({
      name: "disabled-fetch",
      displayName: "Disabled Fetch",
      transport: "stdio",
      command: "uvx",
      args: ["mcp-server-fetch"],
      enabled: false,
    });
    const targetPath = path.join(userDataPath, "target", "disabled.json");

    expect(() =>
      service.apply({
        target: "claude",
        scope: "custom",
        path: targetPath,
        serverIds: [server.id],
      }),
    ).toThrow(/没有已启用/);
    expect(fs.existsSync(targetPath)).toBe(false);
    expect(service.read().bindings).toEqual([]);
  });

  it("does not modify an invalid JSON target when apply validation fails", () => {
    const service = new CoreMcpLibraryService();
    const server = service.createServer({
      name: "fetch",
      displayName: "Fetch",
      transport: "stdio",
      command: "uvx",
      args: ["mcp-server-fetch"],
    });
    const targetPath = path.join(userDataPath, "target", "broken.json");
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, "{not-json", "utf8");

    expect(() =>
      service.apply({
        target: "claude",
        scope: "custom",
        path: targetPath,
        serverIds: [server.id],
      }),
    ).toThrow();
    expect(fs.readFileSync(targetPath, "utf8")).toBe("{not-json");
    expect(fs.readdirSync(path.dirname(targetPath))).toEqual(["broken.json"]);
    expect(service.read().bindings).toEqual([]);
  });

  it("rejects same-name external target conflicts unless force is set", () => {
    const service = new CoreMcpLibraryService();
    const server = service.createServer({
      name: "fetch",
      displayName: "Fetch",
      transport: "stdio",
      command: "uvx",
      args: ["mcp-server-fetch"],
    });
    const targetPath = path.join(userDataPath, "target", "mcp.json");
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(
      targetPath,
      JSON.stringify({ mcpServers: { fetch: { command: "node" } } }),
      "utf8",
    );

    expect(() =>
      service.apply({
        target: "claude",
        scope: "custom",
        path: targetPath,
        serverIds: [server.id],
      }),
    ).toThrow(/同名 MCP 服务/);
    expect(
      JSON.parse(fs.readFileSync(targetPath, "utf8")).mcpServers.fetch,
    ).toEqual({
      command: "node",
    });
    expect(fs.readdirSync(path.dirname(targetPath))).toEqual(["mcp.json"]);

    const result = service.apply({
      target: "claude",
      scope: "custom",
      path: targetPath,
      serverIds: [server.id],
      force: true,
    });
    const written = JSON.parse(fs.readFileSync(targetPath, "utf8"));

    expect(result.overwrittenServerNames).toEqual(["fetch"]);
    expect(result.backupPath).toBeTruthy();
    expect(fs.existsSync(result.backupPath!)).toBe(true);
    expect(written.mcpServers.fetch.command).toBe("uvx");
    expect(
      fs
        .readdirSync(path.dirname(targetPath))
        .filter((entry) => entry.includes(".tmp-")),
    ).toEqual([]);
  });

  it("allows reapplying PromptHub-managed target entries without force", () => {
    const service = new CoreMcpLibraryService();
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
    const result = service.apply({
      target: "claude",
      scope: "custom",
      path: targetPath,
      serverIds: [server.id],
    });

    expect(result.overwrittenServerNames).toEqual(["fetch"]);
    expect(service.read().bindings[0].serverIds).toEqual([server.id]);
  });

  it("writes and removes OpenCode MCP entries without touching unrelated user config", () => {
    const service = new CoreMcpLibraryService();
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

    expect(result.backupPath).toBeTruthy();
    expect(afterRemove.provider.openai.npm).toBe("@ai-sdk/openai");
    expect(afterRemove.mcp.external.url).toBe("https://example.com/mcp");
    expect(afterRemove.mcp.memory).toBeUndefined();
    expect(service.read().bindings).toEqual([]);
  });

  it("removes external target MCP entries by server name without requiring library records", () => {
    const service = new CoreMcpLibraryService();
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
    expect(result.backupPath).toBeTruthy();
    expect(fs.existsSync(result.backupPath!)).toBe(true);
    expect(written.keep).toBe(true);
    expect(written.mcpServers.external).toBeUndefined();
    expect(written.mcpServers.keep.command).toBe("uvx");
    expect(service.read().bindings).toEqual([]);
  });

  it("force-overwrites same-name external Codex TOML sections without duplicating them", () => {
    const service = new CoreMcpLibraryService();
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
    const service = new CoreMcpLibraryService();
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
    const service = new CoreMcpLibraryService();
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
    expect(service.read().servers.map((server) => server.name)).toEqual([
      "docs",
      "fetch",
    ]);
  });

  it("creates MCP servers from command lines, URLs, GitHub repos, and local projects", () => {
    const service = new CoreMcpLibraryService();
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
    const service = new CoreMcpLibraryService();

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
    const service = new CoreMcpLibraryService();

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
    const service = new CoreMcpLibraryService();
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
    const service = new CoreMcpLibraryService();
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
    const service = new CoreMcpLibraryService();
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
    const service = new CoreMcpLibraryService();
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

  it("applies Codex TOML targets with a backup and managed block", () => {
    const service = new CoreMcpLibraryService();
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

    expect(result.backupPath).toBeTruthy();
    expect(fs.existsSync(result.backupPath!)).toBe(true);
    expect(written).toContain('model = "gpt-5"');
    expect(written).toContain("# >>> PromptHub MCP managed block >>>");
    expect(written).toContain("[mcp_servers.filesystem]");
    expect(service.read().bindings[0]).toMatchObject({
      target: "codex",
      path: targetPath,
      serverIds: [server.id],
    });
  });

  it("removes empty target bindings when a distributed server is deleted", () => {
    const service = new CoreMcpLibraryService();
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
    const service = new CoreMcpLibraryService();
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

  it("removes a server from a JSON target with a backup and keeps other entries", () => {
    const service = new CoreMcpLibraryService();
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
    expect(result.backupPath).toBeTruthy();
    expect(fs.existsSync(result.backupPath!)).toBe(true);
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
    const service = new CoreMcpLibraryService();
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
    const service = new CoreMcpLibraryService();
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
    const service = new CoreMcpLibraryService();
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
    const kiloPath = path.join(userDataPath, "status", "kilo.jsonc");
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
        label: "Codex CLI",
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
            source: { type: "import", id: "codex", label: "Codex CLI" },
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
      },
    ]);
  });

  it("exposes platform-scoped global target presets", () => {
    const presets = getMcpTargetPresets("/Users/test", "darwin");
    const byId = Object.fromEntries(
      presets.map((preset) => [preset.id, preset]),
    );

    expect(byId.roo).toBeUndefined();
    expect(byId.claude.path).toBe("/Users/test/.claude.json");
    expect(byId.codex.path).toBe("/Users/test/.codex/config.toml");
    expect(byId.gemini.path).toBe("/Users/test/.gemini/settings.json");
    expect(byId.opencode.path).toBe(
      "/Users/test/.config/opencode/opencode.json",
    );
    expect(byId.kilo.path).toBe("/Users/test/.config/kilo/kilo.jsonc");
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
    expect(byId["claude-desktop"].path).toBe(
      "/Users/test/Library/Application Support/Claude/claude_desktop_config.json",
    );
    expect(byId.vscode.path).toBe(
      "/Users/test/Library/Application Support/Code/User/mcp.json",
    );
    expect(presets.every((preset) => preset.scope === "global")).toBe(true);
    expect(presets.every((preset) => Boolean(preset.platformId))).toBe(true);

    const winPresets = getMcpTargetPresets("C:\\Users\\test", "win32");
    const winById = Object.fromEntries(
      winPresets.map((preset) => [preset.id, preset]),
    );
    expect(winById["claude-desktop"].path).toContain("AppData");
  });
});
