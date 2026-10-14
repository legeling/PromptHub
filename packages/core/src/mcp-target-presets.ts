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

import type {
  McpTargetKind,
  McpTargetPreset,
  McpTargetScope,
} from "@prompthub/shared/types/mcp";

export type { McpTargetPreset } from "@prompthub/shared/types/mcp";

/**
 * Global MCP config targets for every supported agent platform.
 * Project-level files are derived by the renderer from registered projects.
 * 各支持平台的全局 MCP 配置目标。项目级文件由渲染端根据已登记项目推导。
 */
export function getMcpTargetPresets(
  homeDir = os.homedir(),
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
  builtinOverrides: Record<string, BuiltinAgentOverrideConfig> = {},
): McpTargetPreset[] {
  const claude = getPlatformById("claude");
  if (!claude) throw new Error("Missing Claude MCP platform");
  const claudeRoot = getDefaultPlatformRootDir(
    claude,
    platform,
    environment,
    homeDir,
    builtinOverrides.claude?.rootPath,
  );
  const claudeMcpRelativePath =
    builtinOverrides.claude?.mcpRelativePath ||
    getPlatformMcpRelativePath(
      claude,
      isPlatformRootConfigured(claude, claudeRoot, {
        rootOverride: builtinOverrides.claude?.rootPath,
        environment, homeDir, targetPlatform: platform,
      }),
    );
  if (!claudeMcpRelativePath) {
    throw new Error("Missing Claude MCP configuration path");
  }
  const qwenHome = resolveQwenHome(homeDir, environment.QWEN_HOME);
  const ohMyPiHome = resolveOhMyPiHome(
    homeDir,
    environment.PI_CODING_AGENT_DIR,
  );
  const claudeDesktopPath =
    platform === "darwin"
      ? path.join(
          homeDir,
          "Library",
          "Application Support",
          "Claude",
          "claude_desktop_config.json",
        )
      : platform === "win32"
        ? path.join(
            homeDir,
            "AppData",
            "Roaming",
            "Claude",
            "claude_desktop_config.json",
          )
        : path.join(homeDir, ".config", "Claude", "claude_desktop_config.json");
  const vscodeUserPath =
    platform === "darwin"
      ? path.join(
          homeDir,
          "Library",
          "Application Support",
          "Code",
          "User",
          "mcp.json",
        )
      : platform === "win32"
        ? path.join(homeDir, "AppData", "Roaming", "Code", "User", "mcp.json")
        : path.join(homeDir, ".config", "Code", "User", "mcp.json");

  return [
    {
      id: "claude",
      target: "claude",
      scope: "global",
      label: "Claude Code",
      path: path.join(claudeRoot, claudeMcpRelativePath),
      platformId: "claude",
    },
    {
      id: "codex",
      target: "codex",
      scope: "global",
      label: "Codex",
      path: path.join(homeDir, ".codex", "config.toml"),
      platformId: "codex",
    },
    {
      id: "grok",
      target: "grok",
      scope: "global",
      label: "Grok Build",
      path: path.join(homeDir, ".grok", "config.toml"),
      platformId: "grok",
    },
    {
      id: "openclaw",
      target: "openclaw",
      scope: "global",
      label: "OpenClaw",
      path: path.join(homeDir, ".openclaw", "openclaw.json"),
      platformId: "openclaw",
    },
    {
      id: "qoder",
      target: "qoder",
      scope: "global",
      label: "Qoder",
      path: path.join(homeDir, ".qoder", "settings.json"),
      platformId: "qoder",
    },
    {
      id: "antigravity",
      target: "antigravity",
      scope: "global",
      label: "Antigravity",
      path: path.join(homeDir, ".gemini", "config", "mcp_config.json"),
      platformId: "antigravity",
    },
    {
      id: "kimi",
      target: "kimi",
      scope: "global",
      label: "Kimi Code",
      path: path.join(homeDir, ".kimi", "mcp.json"),
      platformId: "kimi",
    },
    {
      id: "augment",
      target: "augment",
      scope: "global",
      label: "Augment",
      path: path.join(homeDir, ".augment", "settings.json"),
      platformId: "augment",
    },
    {
      id: "amp",
      target: "amp",
      scope: "global",
      label: "Amp",
      path: path.join(homeDir, ".config", "amp", "settings.json"),
      platformId: "amp",
    },
    {
      id: "qwen",
      target: "qwen",
      scope: "global",
      label: "Qwen Code",
      path: path.join(qwenHome, "settings.json"),
      platformId: "qwen",
    },
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
      id: "pi",
      target: "pi",
      scope: "global",
      label: "Pi",
      path: path.join(homeDir, ".pi", "agent", "mcp.json"),
      platformId: "pi",
    },
    {
      id: "oh-my-pi",
      target: "oh-my-pi",
      scope: "global",
      label: "Oh My Pi",
      path: path.join(ohMyPiHome, "mcp.json"),
      platformId: "oh-my-pi",
    },
    {
      id: "gemini",
      target: "gemini",
      scope: "global",
      label: "Gemini CLI",
      path: path.join(homeDir, ".gemini", "settings.json"),
      platformId: "gemini",
    },
    {
      id: "opencode",
      target: "opencode",
      scope: "global",
      label: "OpenCode",
      path: path.join(homeDir, ".config", "opencode", "opencode.json"),
      platformId: "opencode",
    },
    {
      id: "zcode",
      target: "zcode",
      scope: "global",
      label: "智谱 ZCode",
      path: path.join(homeDir, ".zcode", "cli", "config.json"),
      platformId: "zcode",
    },
    {
      id: "kilo",
      target: "kilo",
      scope: "global",
      label: "Kilo Code",
      path: path.join(homeDir, ".config", "kilo", "kilo.json"),
      platformId: "kilo",
    },
    {
      id: "cursor",
      target: "cursor",
      scope: "global",
      label: "Cursor",
      path: path.join(homeDir, ".cursor", "mcp.json"),
      platformId: "cursor",
    },
    {
      id: "claude-desktop",
      target: "claude-desktop",
      scope: "global",
      label: "Claude Desktop",
      path: claudeDesktopPath,
      platformId: "claude",
    },
    {
      id: "vscode",
      target: "vscode",
      scope: "global",
      label: "VS Code",
      path: vscodeUserPath,
      platformId: "copilot",
    },
    {
      id: "windsurf",
      target: "windsurf",
      scope: "global",
      label: "Windsurf",
      path: path.join(homeDir, ".codeium", "windsurf", "mcp_config.json"),
      platformId: "windsurf",
    },
    {
      id: "kiro",
      target: "kiro",
      scope: "global",
      label: "Kiro",
      path: path.join(homeDir, ".kiro", "settings", "mcp.json"),
      platformId: "kiro",
    },
    {
      id: "cline",
      target: "cline",
      scope: "global",
      label: "Cline",
      path: path.join(
        homeDir,
        ".cline",
        "data",
        "settings",
        "cline_mcp_settings.json",
      ),
      platformId: "cline",
    },
    {
      id: "workbuddy",
      target: "workbuddy",
      scope: "global",
      label: "Tencent WorkBuddy",
      path: path.join(homeDir, ".workbuddy", "mcp.json"),
      platformId: "workbuddy",
    },
    {
      id: "codebuddy",
      target: "codebuddy",
      scope: "global",
      label: "CodeBuddy",
      path: path.join(homeDir, ".codebuddy", ".mcp.json"),
      platformId: "codebuddy",
    },
  ];
}

function resolveQwenHome(
  homeDir: string,
  configured: string | undefined,
): string {
  const value = configured?.trim();
  if (!value || value.includes("\0")) return path.join(homeDir, ".qwen");
  const expanded = value.replace(/^~(?=$|[\\/])/, homeDir);
  return path.isAbsolute(expanded)
    ? path.normalize(expanded)
    : path.resolve(expanded);
}

function resolveOhMyPiHome(
  homeDir: string,
  configured: string | undefined,
): string {
  const value = configured?.trim();
  if (!value || value.includes("\0")) {
    return path.join(homeDir, ".omp", "agent");
  }
  const expanded = value.replace(/^~(?=$|[\\/])/, homeDir);
  return path.isAbsolute(expanded)
    ? path.normalize(expanded)
    : path.resolve(expanded);
}
