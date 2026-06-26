import { describe, expect, it } from "vitest";
import type { McpServerConfig } from "@prompthub/shared/types/mcp";
import {
  buildCodexMcpToml,
  buildMcpServersJson,
  buildMcpTargetJson,
  buildVsCodeMcpJson,
  getMcpServersJsonKey,
  inferMcpEnvRequirements,
  inferMcpPlaceholderRequirements,
  inferMcpRuntimeDetails,
  listMcpServerNamesInJson,
  listMcpServerNamesInToml,
  mergeCodexMcpToml,
  mergeMcpServersJson,
  normalizeMcpServerDraft,
  parseMcpJsonConfigContent,
  parseMcpDotEnv,
  removeCodexMcpTomlServers,
  removeMcpServersFromJson,
  toOpenCodeMcpEntry,
} from "@prompthub/shared/utils/mcp-config";

const baseServer: McpServerConfig = {
  id: "mcp_1",
  name: "playwright",
  displayName: "Playwright",
  transport: "stdio",
  command: "npx",
  args: ["@playwright/mcp@latest", "--headless"],
  env: { CI: "1" },
  enabled: true,
  source: { type: "manual" },
  createdAt: 1,
  updatedAt: 1,
};

describe("mcp-config", () => {
  it("normalizes stdio server drafts and rejects missing command", () => {
    const normalized = normalizeMcpServerDraft({
      name: "Playwright MCP",
      displayName: "Playwright MCP",
      transport: "stdio",
      command: "npx",
      args: ["@playwright/mcp@latest"],
      env: { TOKEN: "abc" },
    });

    expect(normalized.name).toBe("playwright-mcp");
    expect(normalized.command).toBe("npx");
    expect(normalized.env).toEqual({ TOKEN: "abc" });
    expect(() =>
      normalizeMcpServerDraft({ name: "bad", transport: "stdio" }),
    ).toThrow(/command/);
  });

  it("projects generic and VS Code MCP JSON with different root keys", () => {
    expect(buildMcpServersJson([baseServer])).toEqual({
      mcpServers: {
        playwright: {
          command: "npx",
          args: ["@playwright/mcp@latest", "--headless"],
          env: { CI: "1" },
        },
      },
    });
    expect(buildVsCodeMcpJson([baseServer])).toEqual({
      servers: {
        playwright: {
          command: "npx",
          args: ["@playwright/mcp@latest", "--headless"],
          env: { CI: "1" },
        },
      },
    });
  });

  it("keeps personal notes in the library record and out of target projections", () => {
    const normalized = normalizeMcpServerDraft({
      ...baseServer,
      notes: "  Use only for local browser tests.  ",
    });
    const serverWithNotes: McpServerConfig = {
      ...normalized,
      notes: "Use only for local browser tests.",
    };

    expect(normalized.notes).toBe("Use only for local browser tests.");
    expect(
      buildMcpServersJson([serverWithNotes]).mcpServers.playwright,
    ).toEqual({
      command: "npx",
      args: ["@playwright/mcp@latest", "--headless"],
      env: { CI: "1" },
    });
    expect(
      buildVsCodeMcpJson([serverWithNotes]).servers.playwright,
    ).not.toHaveProperty("notes");
    expect(buildMcpTargetJson("opencode", [serverWithNotes]).mcp).toEqual({
      playwright: {
        type: "local",
        command: ["npx", "@playwright/mcp@latest", "--headless"],
        environment: { CI: "1" },
        enabled: true,
      },
    });
    expect(buildCodexMcpToml([serverWithNotes])).not.toContain("notes");
  });

  it("projects Codex TOML and replaces only the managed block", () => {
    const snippet = buildCodexMcpToml([baseServer]);

    expect(snippet).toContain("[mcp_servers.playwright]");
    expect(snippet).toContain('command = "npx"');
    expect(snippet).toContain('env = { CI = "1" }');

    const merged = mergeCodexMcpToml(
      'model = "gpt-5"\n\n# >>> PromptHub MCP managed block >>>\nold = true\n# <<< PromptHub MCP managed block <<<\n',
      [baseServer],
    );

    expect(merged).toContain('model = "gpt-5"');
    expect(merged).toContain("[mcp_servers.playwright]");
    expect(merged).not.toContain("old = true");
  });

  it("merges MCP JSON without overwriting unrelated settings", () => {
    const merged = mergeMcpServersJson(
      { theme: "dark", mcpServers: { old: { command: "node" } } },
      "claude",
      [baseServer],
    );

    expect(merged).toMatchObject({
      theme: "dark",
      mcpServers: {
        old: { command: "node" },
        playwright: { command: "npx" },
      },
    });
  });

  it("resolves the JSON root key per target", () => {
    expect(getMcpServersJsonKey("claude")).toBe("mcpServers");
    expect(getMcpServersJsonKey("gemini")).toBe("mcpServers");
    expect(getMcpServersJsonKey("windsurf")).toBe("mcpServers");
    expect(getMcpServersJsonKey("kiro")).toBe("mcpServers");
    expect(getMcpServersJsonKey("claude-desktop")).toBe("mcpServers");
    expect(getMcpServersJsonKey("vscode")).toBe("servers");
    expect(getMcpServersJsonKey("opencode")).toBe("mcp");
    expect(getMcpServersJsonKey("kilo")).toBe("mcp");
  });

  it("projects OpenCode local entries with a combined command array", () => {
    expect(toOpenCodeMcpEntry(baseServer)).toEqual({
      type: "local",
      command: ["npx", "@playwright/mcp@latest", "--headless"],
      environment: { CI: "1" },
      enabled: true,
    });
  });

  it("projects OpenCode remote entries with url and headers", () => {
    const remoteServer: McpServerConfig = {
      ...baseServer,
      name: "context7",
      transport: "streamable-http",
      command: undefined,
      args: undefined,
      env: undefined,
      url: "https://mcp.context7.com/mcp",
      headers: { CONTEXT7_API_KEY: "key" },
    };
    expect(toOpenCodeMcpEntry(remoteServer)).toEqual({
      type: "remote",
      url: "https://mcp.context7.com/mcp",
      headers: { CONTEXT7_API_KEY: "key" },
      enabled: true,
    });
    expect(buildMcpTargetJson("opencode", [remoteServer])).toEqual({
      mcp: {
        context7: {
          type: "remote",
          url: "https://mcp.context7.com/mcp",
          headers: { CONTEXT7_API_KEY: "key" },
          enabled: true,
        },
      },
    });
    expect(buildMcpTargetJson("kilo", [remoteServer])).toEqual({
      mcp: {
        context7: {
          type: "remote",
          url: "https://mcp.context7.com/mcp",
          headers: { CONTEXT7_API_KEY: "key" },
          enabled: true,
        },
      },
    });
  });

  it("merges OpenCode config under the mcp key and keeps other settings", () => {
    const merged = mergeMcpServersJson(
      { theme: "dark", mcp: { existing: { type: "local", command: ["x"] } } },
      "opencode",
      [baseServer],
    );

    expect(merged).toMatchObject({
      theme: "dark",
      mcp: {
        existing: { type: "local", command: ["x"] },
        playwright: { type: "local" },
      },
    });
  });

  it("removes named servers from JSON configs and keeps everything else", () => {
    const removed = removeMcpServersFromJson(
      {
        theme: "dark",
        mcpServers: {
          playwright: { command: "npx" },
          fetch: { command: "uvx" },
        },
      },
      "claude",
      ["playwright"],
    );

    expect(removed).toEqual({
      theme: "dark",
      mcpServers: { fetch: { command: "uvx" } },
    });
    // Missing root key is a no-op rather than an error.
    expect(removeMcpServersFromJson({ a: 1 }, "claude", ["x"])).toEqual({
      a: 1,
    });
    // VS Code and OpenCode use their own root keys.
    expect(
      removeMcpServersFromJson(
        { servers: { fetch: { command: "uvx" } } },
        "vscode",
        ["fetch"],
      ),
    ).toEqual({ servers: {} });
    expect(
      removeMcpServersFromJson(
        { mcp: { fetch: { type: "local", command: ["uvx"] } } },
        "opencode",
        ["fetch"],
      ),
    ).toEqual({ mcp: {} });
  });

  it("removes Codex TOML sections without touching unrelated content", () => {
    const content = [
      'model = "gpt-5"',
      "",
      "[mcp_servers.playwright]",
      'command = "npx"',
      'args = ["@playwright/mcp@latest"]',
      "",
      "[mcp_servers.playwright.tools.browser_click]",
      'approval_mode = "approve"',
      "",
      '[mcp_servers."weird name"]',
      'command = "uvx"',
      "",
      '[mcp_servers."weird name".tools.context]',
      'approval_mode = "approve"',
      "",
      "[mcp_servers.playwright-extra]",
      'command = "keep"',
      "",
      "[mcp_servers.playwright-extra.tools.keep]",
      'approval_mode = "approve"',
      "",
      "[other_table]",
      "keep = true",
    ].join("\n");

    const removed = removeCodexMcpTomlServers(content, [
      "playwright",
      "weird name",
    ]);

    expect(removed).toContain('model = "gpt-5"');
    expect(removed).toContain("[other_table]");
    expect(removed).toContain("keep = true");
    expect(removed).toContain("[mcp_servers.playwright-extra]");
    expect(removed).toContain("[mcp_servers.playwright-extra.tools.keep]");
    expect(removed).not.toContain("[mcp_servers.playwright]");
    expect(removed).not.toContain("[mcp_servers.playwright.tools.browser_click]");
    expect(removed).not.toContain('command = "npx"');
    expect(removed).not.toContain("weird name");
  });

  it("removes orphan Codex TOML child sections left after MCP uninstall", () => {
    const content = [
      'model = "gpt-5.5"',
      "",
      "[mcp_servers.codegraph.tools.codegraph_status]",
      'approval_mode = "approve"',
      "",
      "[mcp_servers.codegraph.tools.codegraph_context]",
      'approval_mode = "approve"',
      "",
      "[mcp_servers.node_repl]",
      'command = "node_repl"',
    ].join("\n");

    const removed = removeCodexMcpTomlServers(content, ["codegraph"]);

    expect(removed).toContain('model = "gpt-5.5"');
    expect(removed).toContain("[mcp_servers.node_repl]");
    expect(removed).toContain('command = "node_repl"');
    expect(removed).not.toContain("codegraph");
    expect(removed).not.toContain("approval_mode");
  });

  it("lists server names present in JSON and TOML configs", () => {
    expect(
      listMcpServerNamesInJson(
        { mcpServers: { a: {}, b: {} } },
        "claude",
      ).sort(),
    ).toEqual(["a", "b"]);
    expect(listMcpServerNamesInJson({ servers: { c: {} } }, "vscode")).toEqual([
      "c",
    ]);
    expect(listMcpServerNamesInJson({ mcp: { d: {} } }, "opencode")).toEqual([
      "d",
    ]);
    expect(listMcpServerNamesInJson({ mcp: { e: {} } }, "kilo")).toEqual(["e"]);
    expect(listMcpServerNamesInJson(null, "claude")).toEqual([]);
    expect(listMcpServerNamesInJson({ mcpServers: [] }, "claude")).toEqual([]);

    expect(
      listMcpServerNamesInToml(
        '[mcp_servers.a]\ncommand = "x"\n[mcp_servers."b c"]\nurl = "y"\n[other]\n',
      ),
    ).toEqual(["a", "b c"]);
  });

  it("parses JSONC MCP target config content for Kilo Code", () => {
    expect(
      parseMcpJsonConfigContent(
        [
          "{",
          "  // Kilo Code user settings",
          '  "mcp": {',
          '    "playwright": {',
          '      "type": "local",',
          '      "command": ["npx", "@playwright/mcp@latest"],',
          "    },",
          "  },",
          "}",
        ].join("\n"),
      ),
    ).toEqual({
      mcp: {
        playwright: {
          type: "local",
          command: ["npx", "@playwright/mcp@latest"],
        },
      },
    });
  });

  it("parses dotenv files without importing comments or invalid keys", () => {
    expect(
      parseMcpDotEnv(
        [
          "# comment",
          "GITHUB_TOKEN=abc # inline",
          'export SLACK_BOT_TOKEN="x y"',
          "1_BAD=no",
          "EMPTY=",
          "QUOTED='raw value'",
        ].join("\n"),
      ),
    ).toEqual({
      GITHUB_TOKEN: "abc",
      SLACK_BOT_TOKEN: "x y",
      EMPTY: "",
      QUOTED: "raw value",
    });
  });

  it("infers runtime details, env requirements, and placeholders", () => {
    expect(inferMcpRuntimeDetails(baseServer)).toEqual({
      runtime: "npx",
      packageOrScript: "@playwright/mcp@latest",
    });
    expect(
      inferMcpEnvRequirements({
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: "", OPTIONAL: "ok" },
        args: ["--token", "${GITHUB_PERSONAL_ACCESS_TOKEN}", "<repo-path>"],
        url: undefined,
        headers: { Authorization: "Bearer ${API_TOKEN}" },
      }),
    ).toEqual([
      {
        name: "API_TOKEN",
        required: true,
        source: "headers",
      },
      {
        name: "GITHUB_PERSONAL_ACCESS_TOKEN",
        required: true,
        source: "env",
      },
      {
        name: "OPTIONAL",
        required: false,
        source: "env",
      },
    ]);
    expect(
      inferMcpPlaceholderRequirements({
        args: ["mcp-server-git", "--repository", "<repo-path>"],
        url: undefined,
        headers: {},
      }),
    ).toEqual([{ value: "<repo-path>", source: "args" }]);
  });
});
