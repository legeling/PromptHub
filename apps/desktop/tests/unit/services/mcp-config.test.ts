import { describe, expect, it } from "vitest";
import type { McpServerConfig } from "@prompthub/shared/types/mcp";
import {
  buildCodexMcpToml,
  computeMcpTargetEntryDigest,
  buildMcpServersJson,
  buildMcpTargetJson,
  buildVsCodeMcpJson,
  getMcpTargetEntryObject,
  getMcpServersJsonKey,
  inferMcpEnvRequirements,
  inferMcpPlaceholderRequirements,
  inferMcpRuntimeDetails,
  getMcpEnvReferenceSyntax,
  MCP_TARGET_ENTRY_DIGEST_ALGORITHM,
  listMcpServerNamesInJson,
  listMcpServerNamesInToml,
  mergeCodexMcpToml,
  mergeMcpToml,
  mergeMcpServersJson,
  normalizeMcpServerDraft,
  parseMcpJsonConfigContent,
  parseMcpDotEnv,
  redactMcpLibraryForTransport,
  redactMcpConfigContent,
  mergeMcpLibraryFromTransport,
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
  it("retains imported target entry names when normalizing and editing", () => {
    const imported = normalizeMcpServerDraft({
      name: "Docs.API",
      command: "node",
      source: { type: "import" },
    });
    expect(imported.name).toBe("Docs.API");
    expect(normalizeMcpServerDraft({ ...imported, notes: "edited" }).name).toBe(
      "Docs.API",
    );
  });
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

  it("normalizes legacy environment reference syntax into additive reference maps", () => {
    const normalized = normalizeMcpServerDraft({
      name: "remote",
      transport: "streamable-http",
      url: "https://example.test/mcp",
      env: {
        API_TOKEN: "${env:API_TOKEN}",
        HOME_DIR: "$HOME_DIR",
        PI_TOKEN: "$env:PI_TOKEN",
        LITERAL: "keep-me",
      },
      headers: {
        Authorization: "Bearer ${TOKEN}",
        "X-Trace": "${TRACE_ID:-local}",
      },
    });

    expect(normalized.env).toEqual({ LITERAL: "keep-me" });
    expect(normalized.headers).toBeUndefined();
    expect(normalized.envRefs).toEqual({
      API_TOKEN: "${API_TOKEN}",
      HOME_DIR: "${HOME_DIR}",
      PI_TOKEN: "${PI_TOKEN}",
    });
    expect(normalized.headerRefs).toEqual({
      Authorization: "Bearer ${TOKEN}",
      "X-Trace": "${TRACE_ID:-local}",
    });
  });

  it("renders reference syntax per target without resolving secret values", () => {
    const server = normalizeMcpServerDraft({
      name: "remote",
      transport: "streamable-http",
      url: "https://example.test/mcp",
      headerRefs: { Authorization: "Bearer ${TOKEN}" },
    });

    expect(getMcpEnvReferenceSyntax("cursor")).toBe("env-prefix");
    expect(getMcpEnvReferenceSyntax("claude")).toBe("braced");
    expect(buildMcpTargetJson("cursor", [server])).toMatchObject({
      mcpServers: {
        remote: { headers: { Authorization: "Bearer ${env:TOKEN}" } },
      },
    });
    expect(buildMcpTargetJson("claude", [server])).toMatchObject({
      mcpServers: {
        remote: { headers: { Authorization: "Bearer ${TOKEN}" } },
      },
    });
    expect(buildMcpTargetJson("claude", [server])).not.toContain(
      "example-secret",
    );
    expect(() =>
      buildMcpTargetJson("cursor", [
        normalizeMcpServerDraft({
          name: "with-default",
          transport: "streamable-http",
          url: "https://example.test/mcp",
          headerRefs: { Authorization: "Bearer ${TOKEN:-fallback}" },
        }),
      ]),
    ).toThrow(/不支持带默认值/);
    expect(
      redactMcpConfigContent(
        "claude",
        JSON.stringify({
          mcpServers: {
            remote: {
              headers: { Authorization: "Bearer ${TOKEN}" },
            },
          },
        }),
      ),
    ).toContain("Bearer ${TOKEN}");
  });

  it("redacts direct values in transport snapshots and preserves local values on restore", () => {
    const local = {
      kind: "prompthub-mcp-library" as const,
      version: 1 as const,
      updatedAt: "2026-01-01T00:00:00.000Z",
      servers: [
        {
          ...baseServer,
          env: { API_TOKEN: "local-secret" },
          headers: { Authorization: "Bearer local-secret" },
        },
      ],
      bindings: [],
    };
    const exported = redactMcpLibraryForTransport(local);
    expect(JSON.stringify(exported)).not.toContain("local-secret");
    expect(exported.servers[0].env).toEqual({ API_TOKEN: "[REDACTED]" });
    expect(exported.servers[0].headers).toEqual({
      Authorization: "[REDACTED]",
    });

    const restored = mergeMcpLibraryFromTransport(local, exported);
    expect(restored.servers[0].env).toEqual({ API_TOKEN: "local-secret" });
    expect(restored.servers[0].headers).toEqual({
      Authorization: "Bearer local-secret",
    });
  });

  it("keeps legacy references visible while redacting legacy literals", () => {
    const legacy: McpServerConfig = {
      ...baseServer,
      env: {
        API_TOKEN: "${API_TOKEN}",
        LOCAL_TOKEN: "local-secret",
      },
      headers: {
        Authorization: "Bearer ${API_TOKEN}",
        "X-Local": "local-secret",
      },
    };

    const redacted = redactMcpLibraryForTransport({
      kind: "prompthub-mcp-library",
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      servers: [legacy],
      bindings: [],
    });

    expect(redacted.servers[0].env).toEqual({
      API_TOKEN: "${API_TOKEN}",
      LOCAL_TOKEN: "[REDACTED]",
    });
    expect(redacted.servers[0].headers).toEqual({
      Authorization: "Bearer ${API_TOKEN}",
      "X-Local": "[REDACTED]",
    });
    expect(
      buildMcpTargetJson("cursor", [legacy], { redactValues: true }),
    ).toEqual({
      mcpServers: {
        playwright: {
          command: "npx",
          args: ["@playwright/mcp@latest", "--headless"],
          env: {
            API_TOKEN: "${env:API_TOKEN}",
            LOCAL_TOKEN: "[REDACTED]",
          },
        },
      },
    });
  });

  it("redacts TOML values without redacting quoted map keys", () => {
    const content = [
      "[mcp_servers.playwright]",
      'env = { "API-TOKEN" = "local-secret", MODE = "${MODE}" }',
      'http_headers = { "X-Trace-Id" = "trace-secret" }',
    ].join("\\n");

    const redacted = redactMcpConfigContent("codex", content);

    expect(redacted).toContain('"API-TOKEN" = "[REDACTED]"');
    expect(redacted).toContain('MODE = "${MODE}"');
    expect(redacted).toContain('"X-Trace-Id" = "[REDACTED]"');
    expect(redacted).not.toContain('"[REDACTED]" =');
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
    expect(getMcpServersJsonKey("kimi")).toBe("mcpServers");
    expect(getMcpServersJsonKey("augment")).toBe("mcpServers");
    expect(getMcpServersJsonKey("qwen")).toBe("mcpServers");
    expect(getMcpServersJsonKey("gemini")).toBe("mcpServers");
    expect(getMcpServersJsonKey("windsurf")).toBe("mcpServers");
    expect(getMcpServersJsonKey("kiro")).toBe("mcpServers");
    expect(getMcpServersJsonKey("workbuddy")).toBe("mcpServers");
    expect(getMcpServersJsonKey("codebuddy")).toBe("mcpServers");
    expect(getMcpServersJsonKey("pi")).toBe("mcpServers");
    expect(getMcpServersJsonKey("claude-desktop")).toBe("mcpServers");
    expect(getMcpServersJsonKey("vscode")).toBe("servers");
    expect(getMcpServersJsonKey("opencode")).toBe("mcp");
    expect(getMcpServersJsonKey("kilo")).toBe("mcp");
    expect(getMcpServersJsonKey("zcode")).toBe("servers");
  });

  it("projects ZCode MCP servers under mcp.servers and preserves sibling config", () => {
    const built = buildMcpTargetJson("zcode", [baseServer]);
    expect(built).toEqual({
      mcp: {
        servers: {
          playwright: {
            command: "npx",
            args: ["@playwright/mcp@latest", "--headless"],
            env: { CI: "1" },
          },
        },
      },
    });

    const merged = mergeMcpServersJson(
      {
        model: "glm-5",
        mcp: {
          telemetry: { enabled: true },
          servers: { existing: { command: "node" } },
        },
      },
      "zcode",
      [baseServer],
    );
    expect(merged).toMatchObject({
      model: "glm-5",
      mcp: {
        telemetry: { enabled: true },
        servers: {
          existing: { command: "node" },
          playwright: { command: "npx" },
        },
      },
    });

    expect(
      removeMcpServersFromJson(merged, "zcode", [baseServer.name]),
    ).toMatchObject({
      model: "glm-5",
      mcp: {
        telemetry: { enabled: true },
        servers: { existing: { command: "node" } },
      },
    });
  });

  it("projects OpenClaw MCP servers under mcp.servers with canonical transports", () => {
    const remote: McpServerConfig = {
      ...baseServer,
      id: "mcp_remote",
      name: "remote",
      transport: "streamable-http",
      command: undefined,
      args: undefined,
      env: undefined,
      url: "https://example.test/mcp",
      headers: { Authorization: "Bearer token" },
    };

    expect(buildMcpTargetJson("openclaw", [baseServer, remote])).toEqual({
      mcp: {
        servers: {
          playwright: {
            command: "npx",
            args: ["@playwright/mcp@latest", "--headless"],
            env: { CI: "1" },
          },
          remote: {
            url: "https://example.test/mcp",
            transport: "streamable-http",
            headers: { Authorization: "Bearer token" },
          },
        },
      },
    });

    expect(
      mergeMcpServersJson(
        { channel: "stable", mcp: { oauth: { enabled: true } } },
        "openclaw",
        [baseServer],
      ),
    ).toMatchObject({
      channel: "stable",
      mcp: {
        oauth: { enabled: true },
        servers: { playwright: { command: "npx" } },
      },
    });
  });

  it("projects Antigravity remote servers with its required serverUrl field", () => {
    const remote: McpServerConfig = {
      ...baseServer,
      id: "mcp_remote",
      name: "remote",
      transport: "streamable-http",
      command: undefined,
      args: undefined,
      env: undefined,
      url: "https://example.test/mcp",
      headers: { Authorization: "Bearer token" },
    };

    expect(buildMcpTargetJson("antigravity", [remote])).toEqual({
      mcpServers: {
        remote: {
          serverUrl: "https://example.test/mcp",
          headers: { Authorization: "Bearer token" },
        },
      },
    });
  });

  it("projects Qoder JSON and Grok TOML without crossing target schemas", () => {
    expect(buildMcpTargetJson("qoder", [baseServer])).toMatchObject({
      mcpServers: { playwright: { command: "npx" } },
    });

    const remote: McpServerConfig = {
      ...baseServer,
      id: "mcp_remote",
      name: "remote",
      transport: "streamable-http",
      command: undefined,
      args: undefined,
      env: undefined,
      url: "https://example.test/mcp",
      headers: { Authorization: "Bearer token" },
    };
    const grok = mergeMcpToml('model = "grok-4"\n', "grok", [remote]);
    expect(grok).toContain('headers = { Authorization = "Bearer token" }');
    expect(grok).not.toContain("http_headers");
    expect(mergeCodexMcpToml("", [remote])).toContain(
      'http_headers = { Authorization = "Bearer token" }',
    );
    expect(redactMcpConfigContent("grok", grok)).not.toContain("Bearer token");
  });

  it("projects Kimi, Augment and Qwen MCP servers with the documented mcpServers shape", () => {
    for (const target of ["kimi", "augment", "qwen"] as const) {
      const merged = mergeMcpServersJson(
        { theme: "dark", mcpServers: { existing: { command: "node" } } },
        target,
        [baseServer],
      );

      expect(merged).toMatchObject({
        theme: "dark",
        mcpServers: {
          existing: { command: "node" },
          playwright: { command: "npx" },
        },
      });
    }
  });

  it("projects OpenCode local entries with a combined command array", () => {
    expect(toOpenCodeMcpEntry(baseServer)).toEqual({
      type: "local",
      command: ["npx", "@playwright/mcp@latest", "--headless"],
      environment: { CI: "1" },
      enabled: true,
    });
  });

  it("computes stable target-entry digests with target-specific shapes", () => {
    const first = computeMcpTargetEntryDigest(
      "claude",
      getMcpTargetEntryObject("claude", baseServer),
    );
    const reordered = computeMcpTargetEntryDigest("claude", {
      env: { CI: "1" },
      command: "npx",
      args: ["@playwright/mcp@latest", "--headless"],
      ignored: undefined,
    });
    const changedArgOrder = computeMcpTargetEntryDigest("claude", {
      command: "npx",
      args: ["--headless", "@playwright/mcp@latest"],
      env: { CI: "1" },
    });
    const openCode = computeMcpTargetEntryDigest(
      "opencode",
      getMcpTargetEntryObject("opencode", baseServer),
    );

    expect(first.algorithm).toBe(MCP_TARGET_ENTRY_DIGEST_ALGORITHM);
    expect(first.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(reordered.digest).toBe(first.digest);
    expect(changedArgOrder.digest).not.toBe(first.digest);
    expect(openCode.digest).not.toBe(first.digest);
    expect(getMcpTargetEntryObject("opencode", baseServer)).toEqual({
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
    expect(getMcpTargetEntryObject("codex", remoteServer)).toEqual({
      url: "https://mcp.context7.com/mcp",
      http_headers: { CONTEXT7_API_KEY: "key" },
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
    expect(removed).not.toContain(
      "[mcp_servers.playwright.tools.browser_click]",
    );
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
