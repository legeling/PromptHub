/**
 * Skill Platform Configuration
 * 技能平台配置
 *
 * Defines the skills directory paths for various AI coding tools
 * 定义各种 AI 编程工具的 skills 目录路径
 */

import { AGENT_DEFINITIONS } from "@prompthub/shared/constants/agent-definitions";
import type {
  SkillPlatform,
  SkillPlatformOsKey,
} from "@prompthub/shared/types/agent-platform";

export type {
  AgentCliDescriptor,
  AgentCliUpdateDescriptor,
  SkillPlatform,
  SkillPlatformOsKey,
} from "@prompthub/shared/types/agent-platform";

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

export function getPlatformMcpRelativePath(
  platformOrId: SkillPlatform | string | undefined,
  configuredRoot = false,
): string | undefined {
  const platform =
    typeof platformOrId === "string"
      ? getPlatformById(platformOrId)
      : platformOrId;

  return configuredRoot && platform?.configuredRootMcpRelativePath
    ? platform.configuredRootMcpRelativePath
    : platform?.mcpRelativePath;
}

export function getPlatformPluginsRelativePath(
  platformOrId: SkillPlatform | string | undefined,
): string | undefined {
  const platform =
    typeof platformOrId === "string"
      ? getPlatformById(platformOrId)
      : platformOrId;

  return platform?.pluginsRelativePath;
}

export const DEFAULT_SKILL_PLATFORM_ORDER = [
  "claude",
  "codex",
  "deepseek-harness",
  "kimi",
  "reasonix",
  "augment",
  "zcode",
  "antigravity",
  "antigravity-cli",
  "gemini",
  "opencode",
  "pi",
  "oh-my-pi",
  "cline",
  "cursor",
  "grok",
  "qwen",
  "qwen-work",
  "cherry-studio",
  "doubao",
  "windsurf",
  "kiro",
  "kilo",
  "trae",
  "trae-work",
  "trae-cn",
  "trae-work-cn",
  "openclaw",
  "copaw",
  "autoclaw",
  "nanoclaw",
  "qclaw",
  "qoder",
  "qoderwork",
  "workbuddy",
  "codebuddy",
  "hermes",
] as const;

/**
 * Agent product family for UI grouping.
 * - code-work: coding IDE / CLI workbenches (Claude Code, Codex, Cursor, …)
 * - claw: Claw-family agent runtimes (OpenClaw, QClaw, Hermes, …) — aka 龙虾系
 */
export type AgentPlatformFamily = "code-work" | "claw";

export const CLAW_PLATFORM_IDS = [
  "openclaw",
  "copaw",
  "autoclaw",
  "nanoclaw",
  "qclaw",
  "hermes",
] as const;

const CLAW_PLATFORM_ID_SET = new Set<string>(CLAW_PLATFORM_IDS);

export function getAgentPlatformFamily(
  platformId: string,
): AgentPlatformFamily {
  if (!platformId) {
    return "code-work";
  }

  if (CLAW_PLATFORM_ID_SET.has(platformId) || /claw$/i.test(platformId)) {
    return "claw";
  }

  return "code-work";
}

export function isClawPlatformId(platformId: string): boolean {
  return getAgentPlatformFamily(platformId) === "claw";
}

/**
 * Supported skill platforms
 * 支持的技能平台列表
 */
export const SKILL_PLATFORMS: SkillPlatform[] = AGENT_DEFINITIONS.map(
  ({ platform }) => platform,
);

/**
 * Get platform by ID
 * 根据 ID 获取平台配置
 */
export function getPlatformById(id: string): SkillPlatform | undefined {
  return SKILL_PLATFORMS.find((p) => p.id === id);
}
