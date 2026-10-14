import { createMcpTestStorage } from "../../../../../packages/core/tests/helpers/mcp-storage";
let mcpStorage: ReturnType<typeof createMcpTestStorage>;
/**
 * @vitest-environment node
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    vi.restoreAllMocks();
    mcpStorage.dispose();
    resetRuntimePaths();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  });

  it("persists created servers in the PromptHub data directory", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);

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

    const service = new CoreMcpLibraryService(mcpStorage.options);
    expect(service.read().servers.map((server) => server.name)).toEqual([
      "legacy",
    ]);

    expect(fs.existsSync(getMcpLibraryFilePath())).toBe(false);
    expect(fs.existsSync(legacyPath)).toBe(false);
    expect(service.read().servers.map((server) => server.name)).toEqual([
      "legacy",
    ]);
  });

  it("prefers the data MCP library when both data and legacy config files exist", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
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
    const service = new CoreMcpLibraryService(mcpStorage.options);

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
    const service = new CoreMcpLibraryService(mcpStorage.options);

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

  it("tracks and applies upstream MCP template updates without losing user-owned values", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const template = {
      id: "prompthub-official:review",
      version: "1.0.0",
      name: "review",
      displayName: "Review MCP",
      description: "Review source code.",
      transport: "stdio" as const,
      command: "npx",
      args: ["-y", "@prompthub/review-mcp@1.0.0"],
      env: { REVIEW_TOKEN: "" },
      tags: ["review"],
      source: {
        id: "prompthub-official",
        label: "Official Store",
        url: "https://github.com/legeling/PromptHub",
        trustLevel: "official" as const,
      },
    };
    const installed = service.installMarketTemplate(template);
    expect(installed.source).toEqual(
      expect.objectContaining({
        id: template.id,
        marketSourceId: "prompthub-official",
        installedTemplateVersion: "1.0.0",
        installedTemplateFingerprint: expect.stringMatching(/^sha256:/),
      }),
    );
    expect(service.checkMarketTemplateUpdate(installed.id, template)).toEqual(
      expect.objectContaining({
        status: "up-to-date",
        localModified: false,
        remoteChanged: false,
      }),
    );

    service.updateServer(installed.id, {
      env: { REVIEW_TOKEN: "private-token" },
      isFavorite: true,
      notes: "Keep my note",
      tags: ["personal"],
    });
    const targetPath = path.join(userDataPath, "agent", "mcp.json");
    service.apply({
      target: "claude",
      scope: "custom",
      path: targetPath,
      serverIds: [installed.id],
    });
    const updatedTemplate = {
      ...template,
      version: "2.0.0",
      description: "Review and explain source code.",
      args: ["-y", "@prompthub/review-mcp@2.0.0"],
      env: { REVIEW_TOKEN: "", REVIEW_MODE: "" },
    };

    expect(
      service.checkMarketTemplateUpdate(installed.id, updatedTemplate),
    ).toEqual(
      expect.objectContaining({
        status: "update-available",
        localModified: false,
        remoteChanged: true,
      }),
    );

    const result = service.updateFromMarketTemplate(
      installed.id,
      updatedTemplate,
    );
    expect(result.status).toBe("updated");
    expect(result.server).toMatchObject({
      id: installed.id,
      name: "review",
      args: ["-y", "@prompthub/review-mcp@2.0.0"],
      env: { REVIEW_TOKEN: "[REDACTED]", REVIEW_MODE: "" },
      isFavorite: true,
      notes: "Keep my note",
      tags: ["personal"],
      source: {
        installedTemplateVersion: "2.0.0",
      },
    });
    expect(
      service.checkServerTargetSync(installed.id).map((item) => item.status),
    ).toContain("needs-sync");
    expect(fs.readFileSync(targetPath, "utf8")).toContain(
      "@prompthub/review-mcp@1.0.0",
    );
  });

  it("requires review for legacy or locally modified MCP market entries", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const template = {
      id: "registry:demo",
      version: "1.0.0",
      name: "demo",
      displayName: "Demo",
      description: "Demo MCP",
      transport: "stdio" as const,
      command: "npx",
      args: ["demo@1"],
      tags: [],
      source: {
        id: "registry",
        label: "Registry",
        url: "https://registry.example.com/catalog.json",
        trustLevel: "community" as const,
      },
    };
    const installed = service.installMarketTemplate(template);
    service.updateServer(installed.id, { command: "custom-command" });

    expect(
      service.checkMarketTemplateUpdate(installed.id, {
        ...template,
        version: "2.0.0",
        args: ["demo@2"],
      }),
    ).toEqual(
      expect.objectContaining({
        status: "conflict",
        localModified: true,
        remoteChanged: true,
      }),
    );

    const library = service.read();
    library.servers[0].source.installedTemplateFingerprint = undefined;
    service.write(library);
    expect(service.checkMarketTemplateUpdate(installed.id, template)).toEqual(
      expect.objectContaining({ status: "legacy-review" }),
    );
  });

  it("does not reread stale JSON binding inputs after SQLite adoption", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
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

    expect(service.read().bindings).toEqual([]);
  });

  it("updates and deletes library servers without mutating unrelated records", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
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
    ).toThrow(/already exists/);
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
    const service = new CoreMcpLibraryService(mcpStorage.options);
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
    const service = new CoreMcpLibraryService(mcpStorage.options);

    service.write(service.read());
    const beforeInstall = service.read();

    expect(() => service.installTemplate("context7")).toThrow(/模板不存在/);
    expect(service.read()).toEqual(beforeInstall);
  });

  it("applies JSON targets without leaving a backup and preserves unrelated keys", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
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

    expect(result.backupPath).toBeUndefined();
    expect(fs.readdirSync(path.dirname(targetPath))).toEqual(["mcp.json"]);
    expect(written.keep).toBe(true);
    expect(written.mcpServers.old.command).toBe("node");
    expect(written.mcpServers.fetch.command).toBe("uvx");
  });

  it("applies OpenClaw and Grok targets through their verified native schemas", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const server = service.createServer({
      name: "fetch",
      displayName: "Fetch",
      transport: "streamable-http",
      url: "https://example.test/mcp",
      headers: { Authorization: "Bearer token" },
    });
    const openClawPath = path.join(userDataPath, "openclaw.json");
    fs.writeFileSync(
      openClawPath,
      JSON.stringify({ channel: "stable", mcp: { oauth: { enabled: true } } }),
      "utf8",
    );
    service.apply({
      target: "openclaw",
      scope: "global",
      path: openClawPath,
      serverIds: [server.id],
    });
    const openClaw = JSON.parse(fs.readFileSync(openClawPath, "utf8"));
    expect(openClaw).toMatchObject({
      channel: "stable",
      mcp: {
        oauth: { enabled: true },
        servers: {
          fetch: {
            url: "https://example.test/mcp",
            transport: "streamable-http",
          },
        },
      },
    });

    const grokPath = path.join(userDataPath, "config.toml");
    fs.writeFileSync(grokPath, 'model = "grok-4"\n', "utf8");
    const grokResult = service.apply({
      target: "grok",
      scope: "global",
      path: grokPath,
      serverIds: [server.id],
    });
    const grok = fs.readFileSync(grokPath, "utf8");
    expect(grok).toContain('model = "grok-4"');
    expect(grok).toContain('headers = { Authorization = "Bearer token" }');
    expect(grok).not.toContain("http_headers");
    expect(grokResult.content).not.toContain("Bearer token");
  });

  it("round-trips Antigravity serverUrl entries without exposing secrets", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const server = service.createServer({
      name: "remote",
      displayName: "Remote",
      transport: "streamable-http",
      url: "https://example.test/mcp",
      headers: { Authorization: "Bearer token" },
    });
    const targetPath = path.join(userDataPath, "mcp_config.json");
    fs.writeFileSync(
      targetPath,
      JSON.stringify({ mcpServers: {}, ui: { compact: true } }),
      "utf8",
    );

    const result = service.apply({
      target: "antigravity",
      scope: "global",
      path: targetPath,
      serverIds: [server.id],
    });

    expect(JSON.parse(fs.readFileSync(targetPath, "utf8"))).toMatchObject({
      ui: { compact: true },
      mcpServers: {
        remote: {
          serverUrl: "https://example.test/mcp",
          headers: { Authorization: "Bearer token" },
        },
      },
    });
    expect(result.content).not.toContain("Bearer token");
    expect(
      service.getTargetStatus([
        {
          id: "antigravity-test",
          target: "antigravity",
          scope: "global",
          label: "Antigravity",
          path: targetPath,
          platformId: "antigravity",
        },
      ])[0]?.servers,
    ).toEqual([
      expect.objectContaining({
        name: "remote",
        url: "https://example.test/mcp",
        transport: "streamable-http",
      }),
    ]);
  });

  it("does not write target files or bindings when applying only disabled servers", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
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
    const service = new CoreMcpLibraryService(mcpStorage.options);
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
    const service = new CoreMcpLibraryService(mcpStorage.options);
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
    expect(result.backupPath).toBeUndefined();
    expect(fs.readdirSync(path.dirname(targetPath))).toEqual(["mcp.json"]);
    expect(written.mcpServers.fetch.command).toBe("uvx");
    expect(
      fs
        .readdirSync(path.dirname(targetPath))
        .filter((entry) => entry.includes(".tmp-")),
    ).toEqual([]);
  });

  it("allows reapplying PromptHub-managed target entries without force", () => {
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
    const result = service.apply({
      target: "claude",
      scope: "custom",
      path: targetPath,
      serverIds: [server.id],
    });

    expect(result.overwrittenServerNames).toEqual(["fetch"]);
    expect(service.read().bindings[0].serverIds).toEqual([server.id]);
    expect(service.read().bindings[0].entryDigests?.[server.id]).toEqual(
      expect.objectContaining({
        algorithm: "mcp-target-entry-sha256-v1",
        serverName: "fetch",
        digest: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it("does not replace an unchanged target file when reapplying the same projection", () => {
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
    const stableTimestamp = new Date("2020-01-02T03:04:05.000Z");
    fs.utimesSync(targetPath, stableTimestamp, stableTimestamp);
    const before = fs.statSync(targetPath);

    const result = service.apply({
      target: "claude",
      scope: "custom",
      path: targetPath,
      serverIds: [server.id],
    });
    const after = fs.statSync(targetPath);

    expect(result.backupPath).toBeUndefined();
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(after.ino).toBe(before.ino);
    expect(fs.readdirSync(path.dirname(targetPath))).toEqual(["mcp.json"]);
  });

  it("restores the exact existing target when binding persistence fails", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const server = service.createServer({
      name: "fetch",
      displayName: "Fetch",
      transport: "stdio",
      command: "uvx",
      args: ["mcp-server-fetch"],
    });
    const targetPath = path.join(userDataPath, "target", "mcp.json");
    const original = '{\n  "keep": true\n}\n';
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, original, "utf8");
    vi.spyOn(service, "write").mockImplementationOnce(() => {
      throw new Error("simulated library write failure");
    });

    expect(() =>
      service.apply({
        target: "claude",
        scope: "custom",
        path: targetPath,
        serverIds: [server.id],
      }),
    ).toThrow("simulated library write failure");

    expect(fs.readFileSync(targetPath, "utf8")).toBe(original);
    expect(fs.readdirSync(path.dirname(targetPath))).toEqual(["mcp.json"]);
    expect(service.read().bindings).toEqual([]);
  });

  it("removes a newly created target when binding persistence fails", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const server = service.createServer({
      name: "fetch",
      displayName: "Fetch",
      transport: "stdio",
      command: "uvx",
      args: ["mcp-server-fetch"],
    });
    const targetPath = path.join(userDataPath, "target", "mcp.json");
    vi.spyOn(service, "write").mockImplementationOnce(() => {
      throw new Error("simulated library write failure");
    });

    expect(() =>
      service.apply({
        target: "claude",
        scope: "custom",
        path: targetPath,
        serverIds: [server.id],
      }),
    ).toThrow("simulated library write failure");

    expect(fs.existsSync(targetPath)).toBe(false);
    expect(fs.readdirSync(path.dirname(targetPath))).toEqual([]);
    expect(service.read().bindings).toEqual([]);
  });

  it("cleans the temporary projection file when atomic replacement fails", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const server = service.createServer({
      name: "fetch",
      displayName: "Fetch",
      transport: "stdio",
      command: "uvx",
      args: ["mcp-server-fetch"],
    });
    const targetPath = path.join(userDataPath, "target", "mcp.json");
    const original = '{"keep":true}\n';
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, original, "utf8");
    vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
      throw new Error("simulated rename failure");
    });

    expect(() =>
      service.apply({
        target: "claude",
        scope: "custom",
        path: targetPath,
        serverIds: [server.id],
      }),
    ).toThrow("simulated rename failure");

    expect(fs.readFileSync(targetPath, "utf8")).toBe(original);
    expect(fs.readdirSync(path.dirname(targetPath))).toEqual(["mcp.json"]);
    expect(service.read().bindings).toEqual([]);
  });

  it("syncs stale managed targets without returning secret-bearing content", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const server = service.createServer({
      name: "mineru",
      displayName: "MinerU",
      transport: "stdio",
      command: process.execPath,
      args: ["mineru-mcp"],
      env: {
        MINERU_TOKEN: "ph-token-mineru-old",
      },
    });
    const targetPath = path.join(userDataPath, "target", "mcp.json");

    service.apply({
      target: "claude",
      scope: "custom",
      path: targetPath,
      serverIds: [server.id],
    });
    service.updateServer(server.id, {
      env: {
        MINERU_TOKEN: "ph-token-mineru-new",
      },
    });

    expect(service.checkServerTargetSync(server.id)).toEqual([
      expect.objectContaining({
        status: "needs-sync",
        safeToReapply: true,
      }),
    ]);

    const result = service.syncServerToBoundTargets(server.id);
    const written = JSON.parse(fs.readFileSync(targetPath, "utf8"));

    expect(result.updated).toEqual([
      expect.objectContaining({
        path: targetPath,
        serverName: "mineru",
        backupPath: undefined,
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("ph-token-mineru-new");
    expect(written.mcpServers.mineru.env.MINERU_TOKEN).toBe(
      "ph-token-mineru-new",
    );
    expect(service.checkServerTargetSync(server.id)[0]).toMatchObject({
      status: "synced",
      safeToReapply: false,
    });
  });

  it("detects target-side JSON entry fields that PromptHub does not project", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const server = service.createServer({
      name: "mineru",
      displayName: "MinerU",
      transport: "stdio",
      command: process.execPath,
      args: ["mineru-mcp"],
    });
    const targetPath = path.join(userDataPath, "target", "mcp.json");

    service.apply({
      target: "claude",
      scope: "custom",
      path: targetPath,
      serverIds: [server.id],
    });
    const target = JSON.parse(fs.readFileSync(targetPath, "utf8"));
    target.mcpServers.mineru.description = "external local note";
    fs.writeFileSync(targetPath, JSON.stringify(target, null, 2), "utf8");

    expect(service.checkServerTargetSync(server.id)[0]).toMatchObject({
      status: "external-modified",
      safeToReapply: false,
    });

    const result = service.syncServerToBoundTargets(server.id);
    const written = JSON.parse(fs.readFileSync(targetPath, "utf8"));

    expect(result.updated).toEqual([]);
    expect(result.blocked).toEqual([
      expect.objectContaining({ status: "external-modified" }),
    ]);
    expect(written.mcpServers.mineru.description).toBe("external local note");
  });

  it("skips external modifications and disabled platforms during sync", () => {
    const service = new CoreMcpLibraryService(mcpStorage.options);
    const server = service.createServer({
      name: "mineru",
      displayName: "MinerU",
      transport: "stdio",
      command: process.execPath,
      args: ["mineru-mcp"],
      env: {
        MINERU_TOKEN: "ph-token-mineru-old",
      },
    });
    const targetPath = path.join(userDataPath, "target", "mcp.json");

    service.apply({
      target: "claude",
      scope: "custom",
      path: targetPath,
      serverIds: [server.id],
    });
    const external = JSON.parse(fs.readFileSync(targetPath, "utf8"));
    external.mcpServers.mineru.env.MINERU_TOKEN = "ph-token-external";
    fs.writeFileSync(targetPath, JSON.stringify(external, null, 2), "utf8");
    service.updateServer(server.id, {
      env: { MINERU_TOKEN: "ph-token-mineru-new" },
    });

    expect(service.checkServerTargetSync(server.id)[0]).toMatchObject({
      status: "conflict",
      safeToReapply: false,
    });

    const result = service.syncServerToBoundTargets(server.id, {
      disabledPlatformIds: ["claude"],
    });
    const written = JSON.parse(fs.readFileSync(targetPath, "utf8"));

    expect(result.updated).toEqual([]);
    expect(result.skipped).toEqual([
      expect.objectContaining({ status: "skipped-disabled-platform" }),
    ]);
    expect(JSON.stringify(result)).not.toContain("ph-token");
    expect(written.mcpServers.mineru.env.MINERU_TOKEN).toBe(
      "ph-token-external",
    );
  });

  it("classifies missing, parse-error, disabled, and legacy sync states", () => {
    const createAppliedServer = (name: string) => {
      const service = new CoreMcpLibraryService(mcpStorage.options);
      const server = service.createServer({
        name,
        displayName: name,
        transport: "stdio",
        command: process.execPath,
        args: [`${name}-mcp`],
      });
      const targetPath = path.join(userDataPath, "target", `${name}.json`);
      service.apply({
        target: "claude",
        scope: "custom",
        path: targetPath,
        serverIds: [server.id],
      });
      return { service, server, targetPath };
    };

    const missing = createAppliedServer("missing");
    fs.rmSync(missing.targetPath);
    expect(missing.service.checkServerTargetSync(missing.server.id)[0]).toEqual(
      expect.objectContaining({
        status: "missing-target",
        safeToReapply: false,
      }),
    );

    const missingEntry = createAppliedServer("missing-entry");
    fs.writeFileSync(
      missingEntry.targetPath,
      JSON.stringify({ mcpServers: {} }),
      "utf8",
    );
    expect(
      missingEntry.service.checkServerTargetSync(missingEntry.server.id)[0],
    ).toEqual(
      expect.objectContaining({
        status: "missing-entry",
        safeToReapply: false,
      }),
    );

    const parseError = createAppliedServer("parse-error");
    fs.writeFileSync(parseError.targetPath, "{ invalid json", "utf8");
    expect(
      parseError.service.checkServerTargetSync(parseError.server.id)[0],
    ).toEqual(
      expect.objectContaining({
        status: "parse-error",
        safeToReapply: false,
      }),
    );

    const disabled = createAppliedServer("disabled");
    disabled.service.updateServer(disabled.server.id, { enabled: false });
    expect(
      disabled.service.checkServerTargetSync(disabled.server.id)[0],
    ).toEqual(
      expect.objectContaining({
        status: "skipped-server-disabled",
        safeToReapply: false,
      }),
    );

    const legacySynced = createAppliedServer("legacy-synced");
    const legacyFile = legacySynced.service.read();
    const legacyBinding = legacyFile.bindings.find((binding) =>
      binding.serverIds.includes(legacySynced.server.id),
    );
    if (!legacyBinding) throw new Error("MCP test binding is missing");
    delete legacyBinding.entryDigests;
    legacySynced.service.write(legacyFile);
    expect(
      legacySynced.service.checkServerTargetSync(legacySynced.server.id)[0],
    ).toEqual(expect.objectContaining({ status: "synced" }));
    expect(
      legacySynced.service
        .read()
        .bindings.find((binding) =>
          binding.serverIds.includes(legacySynced.server.id),
        )?.entryDigests?.[legacySynced.server.id],
    ).toEqual(
      expect.objectContaining({ algorithm: "mcp-target-entry-sha256-v1" }),
    );

    const legacyReview = createAppliedServer("legacy-review");
    const reviewFile = legacyReview.service.read();
    const reviewBinding = reviewFile.bindings.find((binding) =>
      binding.serverIds.includes(legacyReview.server.id),
    );
    if (!reviewBinding) throw new Error("MCP test binding is missing");
    delete reviewBinding.entryDigests;
    legacyReview.service.write(reviewFile);
    const target = JSON.parse(fs.readFileSync(legacyReview.targetPath, "utf8"));
    target.mcpServers["legacy-review"].args = ["external-edit"];
    fs.writeFileSync(
      legacyReview.targetPath,
      JSON.stringify(target, null, 2),
      "utf8",
    );
    expect(
      legacyReview.service.checkServerTargetSync(legacyReview.server.id)[0],
    ).toEqual(expect.objectContaining({ status: "legacy-needs-review" }));
  });
});
