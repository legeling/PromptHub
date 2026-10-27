import { describe, expect, it } from "vitest";

import {
  deriveProjectMcpTargetPresets,
  filterVisibleMcpTargetPresets,
  mergeMcpTargetPresets,
} from "../../../src/renderer/services/mcp-target-presets";
import { getMcpTargetPresets, type McpTargetPreset } from "@prompthub/core";

describe("mcp target presets", () => {
  it("derives one workspace MCP target per agent from registered projects", () => {
    const presets = deriveProjectMcpTargetPresets([
      {
        id: "project_docs",
        name: "Docs",
        rootPath: "/workspace/docs",
        scanPaths: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    expect(presets).toEqual([
      {
        id: "project:project_docs:opencode",
        target: "opencode",
        scope: "workspace",
        label: "Docs / OpenCode",
        path: "/workspace/docs/opencode.json",
        platformId: "opencode",
      },
      {
        id: "project:project_docs:zcode",
        target: "zcode",
        scope: "workspace",
        label: "Docs / ZCode",
        path: "/workspace/docs/.zcode/config.json",
        platformId: "zcode",
      },
      {
        id: "project:project_docs:kiro",
        target: "kiro",
        scope: "workspace",
        label: "Docs / Kiro",
        path: "/workspace/docs/.kiro/settings/mcp.json",
        platformId: "kiro",
      },
      {
        id: "project:project_docs:kilo",
        target: "kilo",
        scope: "workspace",
        label: "Docs / Kilo Code",
        path: "/workspace/docs/kilo.json",
        platformId: "kilo",
      },
      {
        id: "project:project_docs:workbuddy",
        target: "workbuddy",
        scope: "workspace",
        label: "Docs / Tencent WorkBuddy",
        path: "/workspace/docs/.workbuddy/mcp.json",
        platformId: "workbuddy",
      },
      {
        id: "project:project_docs:codebuddy",
        target: "codebuddy",
        scope: "workspace",
        label: "Docs / CodeBuddy",
        path: "/workspace/docs/.mcp.json",
        platformId: "codebuddy",
      },
      {
        id: "project:project_docs:augment",
        target: "augment",
        scope: "workspace",
        label: "Docs / Augment",
        path: "/workspace/docs/.augment/settings.json",
        platformId: "augment",
      },
      {
        id: "project:project_docs:amp",
        target: "amp",
        scope: "workspace",
        label: "Docs / Amp",
        path: "/workspace/docs/.amp/settings.json",
        platformId: "amp",
      },
      {
        id: "project:project_docs:qwen",
        target: "qwen",
        scope: "workspace",
        label: "Docs / Qwen Code",
        path: "/workspace/docs/.qwen/settings.json",
        platformId: "qwen",
      },
      {
        id: "project:project_docs:oh-my-pi",
        target: "oh-my-pi",
        scope: "workspace",
        label: "Docs / Oh My Pi",
        path: "/workspace/docs/.omp/mcp.json",
        platformId: "oh-my-pi",
      },
      {
        id: "project:project_docs:pi-shared",
        target: "pi",
        scope: "workspace",
        label: "Docs / Pi (shared)",
        path: "/workspace/docs/.mcp.json",
        platformId: "pi",
      },
      {
        id: "project:project_docs:pi",
        target: "pi",
        scope: "workspace",
        label: "Docs / Pi",
        path: "/workspace/docs/.pi/mcp.json",
        platformId: "pi",
      },
      {
        id: "project:project_docs:qoder-local",
        target: "qoder",
        scope: "workspace",
        label: "Docs / Qoder (local)",
        path: "/workspace/docs/.qoder/settings.local.json",
        platformId: "qoder",
      },
      {
        id: "project:project_docs:qoder",
        target: "qoder",
        scope: "workspace",
        label: "Docs / Qoder",
        path: "/workspace/docs/.mcp.json",
        platformId: "qoder",
      },
      {
        id: "project:project_docs:grok",
        target: "grok",
        scope: "workspace",
        label: "Docs / Grok Build",
        path: "/workspace/docs/.grok/config.toml",
        platformId: "grok",
      },
      {
        id: "project:project_docs:antigravity",
        target: "antigravity",
        scope: "workspace",
        label: "Docs / Antigravity",
        path: "/workspace/docs/.agents/mcp_config.json",
        platformId: "antigravity",
      },
      {
        id: "project:project_docs:antigravity-cli",
        target: "antigravity-cli",
        scope: "workspace",
        label: "Docs / Antigravity CLI",
        path: "/workspace/docs/.agents/mcp_config.json",
        platformId: "antigravity-cli",
      },
      {
        id: "project:project_docs:reasonix",
        target: "reasonix",
        scope: "workspace",
        label: "Docs / Reasonix",
        path: "/workspace/docs/.mcp.json",
        platformId: "reasonix",
      },
    ]);
  });

  it("includes verified OpenClaw, Qoder, and Grok global targets", () => {
    const presets = getMcpTargetPresets("/Users/test", "darwin", {});
    expect(
      presets
        .filter((preset) => ["openclaw", "qoder", "grok"].includes(preset.id))
        .map(({ id, target, path }) => ({ id, target, path })),
    ).toEqual([
      {
        id: "grok",
        target: "grok",
        path: "/Users/test/.grok/config.toml",
      },
      {
        id: "openclaw",
        target: "openclaw",
        path: "/Users/test/.openclaw/openclaw.json",
      },
      {
        id: "qoder",
        target: "qoder",
        path: "/Users/test/.qoder/settings.json",
      },
    ]);
  });

  it("includes the verified Antigravity global MCP target", () => {
    expect(
      getMcpTargetPresets("/Users/test", "darwin", {}).find(
        (preset) => preset.id === "antigravity",
      ),
    ).toMatchObject({
      target: "antigravity",
      scope: "global",
      path: "/Users/test/.gemini/config/mcp_config.json",
      platformId: "antigravity",
    });
  });

  it("filters MCP targets by the Settings disabled platform source of truth", () => {
    const presets: McpTargetPreset[] = [
      {
        id: "opencode",
        target: "opencode",
        scope: "global",
        label: "OpenCode",
        path: "/Users/test/.config/opencode/opencode.json",
        platformId: "opencode",
      },
      {
        id: "kiro",
        target: "kiro",
        scope: "global",
        label: "Kiro",
        path: "/Users/test/.kiro/settings/mcp.json",
        platformId: "kiro",
      },
      {
        id: "kilo",
        target: "kilo",
        scope: "global",
        label: "Kilo Code",
        path: "/Users/test/.config/kilo/kilo.json",
        platformId: "kilo",
      },
      {
        id: "claude-desktop",
        target: "claude-desktop",
        scope: "global",
        label: "Claude Desktop",
        path: "/Users/test/Library/Application Support/Claude/claude_desktop_config.json",
        platformId: "claude",
      },
    ];

    expect(
      filterVisibleMcpTargetPresets(presets, ["kiro", "claude"]).map(
        (preset) => preset.id,
      ),
    ).toEqual(["opencode", "kilo"]);
  });

  it("deduplicates merged target presets by target, scope, and path", () => {
    const globalOpenCode: McpTargetPreset = {
      id: "opencode",
      target: "opencode",
      scope: "global",
      label: "OpenCode",
      path: "/Users/test/.config/opencode/opencode.json",
      platformId: "opencode",
    };
    const duplicateOpenCode: McpTargetPreset = {
      ...globalOpenCode,
      id: "custom-opencode",
      label: "Custom OpenCode",
    };

    expect(
      mergeMcpTargetPresets([globalOpenCode], [duplicateOpenCode]).map(
        (preset) => preset.id,
      ),
    ).toEqual(["opencode"]);
  });
});
