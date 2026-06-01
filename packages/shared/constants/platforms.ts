/**
 * Skill Platform Configuration
 * 技能平台配置
 *
 * Defines the skills directory paths for various AI coding tools
 * 定义各种 AI 编程工具的 skills 目录路径
 */

export interface SkillPlatform {
  id: string;
  name: string;
  icon: string; // lucide icon name
  rootDir: {
    darwin: string;
    win32: string;
    linux: string;
  };
  skillsRelativePath: string;
  globalRuleFile?: string;
  configFiles?: string[];
  isCustom?: boolean;
}

export type SkillPlatformOsKey = "darwin" | "win32" | "linux";

function joinPlatformPath(basePath: string, relativePath: string): string {
  if (!relativePath.trim()) {
    return basePath;
  }

  const separator = basePath.includes("\\") ? "\\" : "/";
  const normalizedBase = basePath.replace(/[\\/]+$/, "");
  const normalizedRelative = relativePath
    .trim()
    .split(/[\\/]+/)
    .filter(Boolean)
    .join(separator);

  return normalizedRelative
    ? `${normalizedBase}${separator}${normalizedRelative}`
    : normalizedBase;
}

function stripTrailingRelativePath(
  fullPath: string,
  relativePath: string,
): string {
  const trimmed = fullPath.trim().replace(/[\\/]+$/, "");
  if (!trimmed || !relativePath.trim()) {
    return trimmed;
  }

  const pattern = relativePath
    .trim()
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[\\\\/]+");
  const nextValue = trimmed.replace(new RegExp(`[\\\\/]+${pattern}$`, "i"), "");

  return nextValue || trimmed;
}

export function getPlatformRootTemplate(
  platform: SkillPlatform,
  osKey: SkillPlatformOsKey,
): string {
  return platform.rootDir[osKey] || platform.rootDir.linux;
}

export function getPlatformSkillsTemplate(
  platform: SkillPlatform,
  osKey: SkillPlatformOsKey,
): string {
  return joinPlatformPath(
    getPlatformRootTemplate(platform, osKey),
    platform.skillsRelativePath,
  );
}

export function getPlatformGlobalRuleTemplate(
  platform: SkillPlatform,
  osKey: SkillPlatformOsKey,
): string | null {
  if (!platform.globalRuleFile) {
    return null;
  }

  return joinPlatformPath(
    getPlatformRootTemplate(platform, osKey),
    platform.globalRuleFile,
  );
}

export function normalizeLegacySkillPathToRootTemplate(
  platform: SkillPlatform,
  skillPath: string,
): string {
  return stripTrailingRelativePath(skillPath, platform.skillsRelativePath);
}

export const DEFAULT_SKILL_PLATFORM_ORDER = [
  "claude",
  "codex",
  "gemini",
  "opencode",
  "cline",
  "cursor",
  "cherry-studio",
  "windsurf",
  "kiro",
  "kilo",
  "trae",
  "trae-cn",
  "openclaw",
  "hermes",
] as const;

/**
 * Supported skill platforms
 * 支持的技能平台列表
 */
export const SKILL_PLATFORMS: SkillPlatform[] = [
  {
    id: "claude",
    name: "Claude Code",
    icon: "Sparkles",
    rootDir: {
      darwin: "~/.claude",
      win32: "%USERPROFILE%\\.claude",
      linux: "~/.claude",
    },
    skillsRelativePath: "skills",
    globalRuleFile: "CLAUDE.md",
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    icon: "Github",
    rootDir: {
      darwin: "~/.copilot",
      win32: "%USERPROFILE%\\.copilot",
      linux: "~/.copilot",
    },
    skillsRelativePath: "skills",
  },
  {
    id: "cursor",
    name: "Cursor",
    icon: "Terminal",
    rootDir: {
      darwin: "~/.cursor",
      win32: "%USERPROFILE%\\.cursor",
      linux: "~/.cursor",
    },
    skillsRelativePath: "skills",
  },
  {
    id: "cherry-studio",
    name: "Cherry Studio",
    icon: "Bot",
    rootDir: {
      darwin: "~/Library/Application Support/CherryStudio",
      win32: "%APPDATA%\\CherryStudio",
      linux: "~/.config/CherryStudio",
    },
    skillsRelativePath: "Data\\Skills",
  },
  {
    id: "windsurf",
    name: "Windsurf",
    icon: "Wind",
    rootDir: {
      darwin: "~/.codeium/windsurf",
      win32: "%USERPROFILE%\\.codeium\\windsurf",
      linux: "~/.codeium/windsurf",
    },
    skillsRelativePath: "skills",
    globalRuleFile: "memories/global_rules.md",
  },
  {
    id: "kiro",
    name: "Kiro",
    icon: "Sparkle",
    rootDir: {
      darwin: "~/.kiro",
      win32: "%USERPROFILE%\\.kiro",
      linux: "~/.kiro",
    },
    skillsRelativePath: "skills",
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    icon: "Sparkles",
    rootDir: {
      darwin: "~/.gemini",
      win32: "%USERPROFILE%\\.gemini",
      linux: "~/.gemini",
    },
    skillsRelativePath: "skills",
    globalRuleFile: "GEMINI.md",
  },
  {
    id: "antigravity",
    name: "Antigravity",
    icon: "Sparkles",
    rootDir: {
      darwin: "~/.gemini/antigravity",
      win32: "%USERPROFILE%\\.gemini\\antigravity",
      linux: "~/.gemini/antigravity",
    },
    skillsRelativePath: "skills",
  },
  {
    id: "trae",
    name: "Trae",
    icon: "Zap",
    rootDir: {
      darwin: "~/.trae",
      win32: "%USERPROFILE%\\.trae",
      linux: "~/.trae",
    },
    skillsRelativePath: "skills",
  },
  {
    id: "trae-cn",
    name: "Trae CN",
    icon: "Zap",
    rootDir: {
      darwin: "~/.trae-cn",
      win32: "%USERPROFILE%\\.trae-cn",
      linux: "~/.trae-cn",
    },
    skillsRelativePath: "skills",
  },
  {
    id: "opencode",
    name: "OpenCode",
    icon: "Terminal",
    rootDir: {
      darwin: "~/.config/opencode",
      win32: "%USERPROFILE%\\.config\\opencode",
      linux: "~/.config/opencode",
    },
    skillsRelativePath: "skills",
    globalRuleFile: "AGENTS.md",
    configFiles: ["opencode.json"],
  },
  {
    id: "cline",
    name: "Cline",
    icon: "Terminal",
    rootDir: {
      darwin: "~/.cline",
      win32: "%USERPROFILE%\\.cline",
      linux: "~/.cline",
    },
    skillsRelativePath: "skills",
    configFiles: [
      "data/settings/global-settings.json",
      "data/settings/providers.json",
      "data/settings/cline_mcp_settings.json",
    ],
  },
  {
    id: "codex",
    name: "Codex CLI",
    icon: "Terminal",
    rootDir: {
      darwin: "~/.codex",
      win32: "%USERPROFILE%\\.codex",
      linux: "~/.codex",
    },
    skillsRelativePath: "skills",
    globalRuleFile: "AGENTS.md",
    configFiles: ["config.toml"],
  },
  {
    id: "kilo",
    name: "Kilo Code",
    icon: "Bot",
    rootDir: {
      darwin: "~/.kilo",
      win32: "%USERPROFILE%\\.kilo",
      linux: "~/.kilo",
    },
    skillsRelativePath: "skills",
    globalRuleFile: "rules/global.md",
  },
  {
    id: "amp",
    name: "Amp",
    icon: "Zap",
    rootDir: {
      darwin: "~/.config/amp",
      win32: "%APPDATA%\\amp",
      linux: "~/.config/amp",
    },
    skillsRelativePath: "skills",
    globalRuleFile: "AGENTS.md",
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    icon: "Bot",
    rootDir: {
      darwin: "~/.openclaw",
      win32: "%USERPROFILE%\\.openclaw",
      linux: "~/.openclaw",
    },
    skillsRelativePath: "skills",
    globalRuleFile: "workspace/SOUL.md",
  },
  {
    id: "qoder",
    name: "Qoder",
    icon: "Bot",
    rootDir: {
      darwin: "~/.qoder",
      win32: "%USERPROFILE%\\.qoder",
      linux: "~/.qoder",
    },
    skillsRelativePath: "skills",
  },
  {
    id: "qoderwork",
    name: "QoderWorker",
    icon: "Code",
    rootDir: {
      darwin: "~/.qoderwork",
      win32: "%USERPROFILE%\\.qoderwork",
      linux: "~/.qoderwork",
    },
    skillsRelativePath: "skills",
  },
  {
    id: "hermes",
    name: "Hermes Agent",
    icon: "Bot",
    rootDir: {
      darwin: "~/.hermes",
      win32: "%USERPROFILE%\\.hermes",
      linux: "~/.hermes",
    },
    skillsRelativePath: "skills",
    globalRuleFile: "AGENTS.md",
  },
  {
    id: "codebuddy",
    name: "CodeBuddy",
    icon: "Code",
    rootDir: {
      darwin: "~/.codebuddy",
      win32: "%USERPROFILE%\\.codebuddy",
      linux: "~/.codebuddy",
    },
    skillsRelativePath: "skills",
  },
];

/**
 * Get platform by ID
 * 根据 ID 获取平台配置
 */
export function getPlatformById(id: string): SkillPlatform | undefined {
  return SKILL_PLATFORMS.find((p) => p.id === id);
}
