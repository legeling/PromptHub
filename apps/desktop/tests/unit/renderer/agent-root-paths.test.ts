import { describe, expect, it } from "vitest";

import { getPlatformById } from "@prompthub/shared/constants/platforms";
import {
  buildAgentRootAssetPreview,
  getEffectiveBuiltinAgentConfig,
} from "../../../src/renderer/services/agent-root-paths";

describe("agent root paths", () => {
  it("keeps Hermes Agent Windows Native rooted under local app data", () => {
    const platform = getPlatformById("hermes");
    expect(platform).toBeDefined();

    expect(platform!.rootDir.win32).toBe("%LOCALAPPDATA%\\hermes");
  });

  it("uses the official Kilo Code MCP config outside the .kilo asset root", () => {
    const platform = getPlatformById("kilo");
    expect(platform).toBeDefined();

    const config = getEffectiveBuiltinAgentConfig(
      platform!,
      "~/.kilo",
      undefined,
    );

    expect(config.mcpRelativePath).toBe("../.config/kilo/kilo.jsonc");
    expect(buildAgentRootAssetPreview(config).mcpConfigPaths).toEqual([
      "~/.config/kilo/kilo.jsonc",
    ]);
  });

  it("uses Cline's settings data directory for MCP config", () => {
    const platform = getPlatformById("cline");
    expect(platform).toBeDefined();

    const config = getEffectiveBuiltinAgentConfig(
      platform!,
      "~/.cline",
      undefined,
    );

    expect(config.mcpRelativePath).toBe(
      "data/settings/cline_mcp_settings.json",
    );
    expect(buildAgentRootAssetPreview(config).mcpConfigPaths).toEqual([
      "~/.cline/data/settings/cline_mcp_settings.json",
    ]);
  });

  it("does not invent MCP config paths for built-in agents without confirmed support", () => {
    const platform = getPlatformById("trae-work");
    expect(platform).toBeDefined();

    const config = getEffectiveBuiltinAgentConfig(
      platform!,
      "~/.trae-work",
      undefined,
    );

    expect(config.mcpRelativePath).toBeUndefined();
    expect(buildAgentRootAssetPreview(config).mcpConfigPaths).toEqual([]);
  });

  it("keeps plugin package directories only on supported built-in targets", () => {
    const claude = getPlatformById("claude");
    const cline = getPlatformById("cline");
    expect(claude).toBeDefined();
    expect(cline).toBeDefined();

    expect(
      getEffectiveBuiltinAgentConfig(claude!, "~/.claude", undefined)
        .pluginsRelativePath,
    ).toBe("plugins/cache/prompthub");
    expect(
      getEffectiveBuiltinAgentConfig(cline!, "~/.cline", undefined)
        .pluginsRelativePath,
    ).toBeUndefined();
  });
});
