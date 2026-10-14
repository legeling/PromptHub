import os from "os";
import path from "path";
import {
  getPlatformById,
  getPlatformMcpRelativePath,
} from "@prompthub/shared/constants/platforms";
import type { BuiltinAgentOverrideConfig } from "@prompthub/shared/types";
import {
  getDefaultPlatformRootDir,
  isPlatformRootConfigured,
} from "./platform-paths";
import type { McpTargetPreset } from "@prompthub/shared/types/mcp";

export type { McpTargetPreset } from "@prompthub/shared/types/mcp";

// Only verified writable targets belong here. Discovery-only paths in the
// registry do not implicitly become writable MCP targets.
const PRIMARY_TARGET_IDS = [
  "claude",
  "codex",
  "grok",
  "openclaw",
  "qoder",
  "antigravity",
  "kimi",
  "augment",
  "amp",
  "qwen",
  "qwen-work",
  "pi",
  "oh-my-pi",
  "gemini",
  "opencode",
  "zcode",
  "kilo",
  "cursor",
  "windsurf",
  "kiro",
  "cline",
  "workbuddy",
  "codebuddy",
] as const;

export function getMcpTargetPresets(
  homeDir = os.homedir(),
  targetPlatform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
  builtinOverrides: Record<string, BuiltinAgentOverrideConfig> = {},
): McpTargetPreset[] {
  const primary = PRIMARY_TARGET_IDS.map((id): McpTargetPreset => {
    const platform = getPlatformById(id);
    if (!platform) throw new Error(`Missing built-in MCP platform: ${id}`);
    const override = builtinOverrides[id];
    const root = getDefaultPlatformRootDir(
      platform,
      targetPlatform,
      environment,
      homeDir,
      override?.rootPath,
    );
    const relativePath =
      override?.mcpRelativePath ||
      getPlatformMcpRelativePath(
        platform,
        isPlatformRootConfigured(platform, root, {
          rootOverride: override?.rootPath,
          environment,
          homeDir,
          targetPlatform,
        }),
      );
    if (!relativePath) throw new Error(`Missing MCP configuration path: ${id}`);
    return {
      id,
      target: id,
      scope: "global",
      label: platform.name,
      path: path.join(root, relativePath),
      platformId: id,
    };
  });
  const shared = sharedApplicationTargets(homeDir, targetPlatform);
  return primary.flatMap((preset) => {
    if (preset.id === "pi") return [...shared.slice(0, 3), preset];
    if (preset.id === "cursor") return [preset, ...shared.slice(3)];
    return [preset];
  });
}

function sharedApplicationTargets(
  homeDir: string,
  targetPlatform: NodeJS.Platform,
): McpTargetPreset[] {
  const applicationRoot =
    targetPlatform === "darwin"
      ? path.join(homeDir, "Library", "Application Support")
      : targetPlatform === "win32"
        ? path.join(homeDir, "AppData", "Roaming")
        : path.join(homeDir, ".config");
  return [
    {
      id: "pi-shared",
      target: "pi",
      scope: "global",
      label: "Pi (shared MCP)",
      path: path.join(homeDir, ".config", "mcp", "mcp.json"),
      platformId: "pi",
    },
    {
      id: "pi-agents",
      target: "pi",
      scope: "global",
      label: "Pi (.agents)",
      path: path.join(homeDir, ".agents", "mcp.json"),
      platformId: "pi",
    },
    {
      id: "pi-agents-nested",
      target: "pi",
      scope: "global",
      label: "Pi (.agents nested)",
      path: path.join(homeDir, ".agents", "mcp", "mcp.json"),
      platformId: "pi",
    },
    {
      id: "claude-desktop",
      target: "claude-desktop",
      scope: "global",
      label: "Claude Desktop",
      path: path.join(applicationRoot, "Claude", "claude_desktop_config.json"),
      platformId: "claude",
    },
    {
      id: "vscode",
      target: "vscode",
      scope: "global",
      label: "VS Code",
      path: path.join(applicationRoot, "Code", "User", "mcp.json"),
      platformId: "copilot",
    },
  ];
}
