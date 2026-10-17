import path from "node:path";
import { describe, expect, it } from "vitest";

import { getMcpTargetPresets } from "@prompthub/core";
import {
  getMcpServersJsonKey,
  MCP_JSON_TARGETS,
} from "@prompthub/shared/utils/mcp-config";

describe("Oh My Pi MCP target", () => {
  it("uses the user agent directory and the native mcpServers JSON key", () => {
    const presets = getMcpTargetPresets("/Users/test", "darwin", {
      PI_CODING_AGENT_DIR: "/Users/test/.omp/agent",
    });

    expect(
      presets.find((preset) => preset.target === "oh-my-pi"),
    ).toMatchObject({
      id: "oh-my-pi",
      label: "Oh My Pi",
      path: path.join("/Users/test", ".omp", "agent", "mcp.json"),
      platformId: "oh-my-pi",
    });
    expect(MCP_JSON_TARGETS).toContain("oh-my-pi");
    expect(getMcpServersJsonKey("oh-my-pi")).toBe("mcpServers");
  });

  it("offers native Pi and only the selected shared compatibility path", () => {
    const presets = getMcpTargetPresets("/Users/test", "darwin", {});

    expect(
      presets
        .filter((preset) => preset.target === "pi")
        .map((preset) => [preset.id, preset.path]),
    ).toEqual([
      [
        "pi-agents-nested",
        path.join("/Users/test", ".agents", "mcp", "mcp.json"),
      ],
      ["pi", path.join("/Users/test", ".pi", "agent", "mcp.json")],
    ]);
    expect(getMcpServersJsonKey("pi")).toBe("mcpServers");
    expect(MCP_JSON_TARGETS).toContain("pi");
  });
});
