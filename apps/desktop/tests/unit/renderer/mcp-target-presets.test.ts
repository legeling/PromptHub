import { describe, expect, it } from "vitest";

import {
  deriveProjectMcpTargetPresets,
  filterVisibleMcpTargetPresets,
  mergeMcpTargetPresets,
} from "../../../src/renderer/services/mcp-target-presets";
import type { McpTargetPreset } from "@prompthub/core";

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
        path: "/workspace/docs/kilo.jsonc",
        platformId: "kilo",
      },
    ]);
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
        path: "/Users/test/.config/kilo/kilo.jsonc",
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
