import path from "node:path";
import { isPlatformRootConfigured } from "@prompthub/core/platform-paths";
import { getPlatformById } from "@prompthub/shared/constants/platforms";
import { isAgentDepthCapabilityAvailable } from "@prompthub/shared/constants/agent-platform-capabilities";
import { getAgentDefinitionById } from "@prompthub/shared/constants/agent-definitions";

import type { AgentProviderAdapterContext } from "@prompthub/shared";

import { SkillInstaller } from "./skill-installer";
import {
  getBuiltinAgentOverride,
  getPlatformRootDir,
} from "./skill-installer-utils";

export interface AgentConfigContext {
  agentId: string;
  rootPath: string;
  relativePaths: string[];
}

export function getClaudeNativeConfigDirectory(
  rootPath: string,
): string | undefined {
  const platform = getPlatformById("claude");
  if (!platform) throw new Error("Missing Claude platform definition");
  return isPlatformRootConfigured(platform, rootPath, {
    rootOverride: getBuiltinAgentOverride("claude")?.rootPath,
  })
    ? rootPath
    : undefined;
}

function normalizeDeclaredPath(value: string): string {
  const normalized = value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "");
  if (
    !normalized ||
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split("/").some((segment) => segment === "..")
  ) {
    return "";
  }
  return normalized.replace(/\/+/g, "/");
}

export function getAgentConfigContext(agentId: unknown): AgentConfigContext {
  if (typeof agentId !== "string" || agentId.trim().length === 0) {
    throw new Error("agent config access requires a non-empty agentId");
  }

  const normalizedAgentId = agentId.trim();
  const platform = SkillInstaller.getSupportedPlatforms().find(
    (candidate) => candidate.id === normalizedAgentId,
  );
  if (!platform) {
    throw new Error(`Unknown Agent platform: ${normalizedAgentId}`);
  }

  const override = getBuiltinAgentOverride(platform.id);
  const declaredPaths = override?.configRelativePaths?.length
    ? override.configRelativePaths
    : platform.configFiles || [];
  const relativePaths = Array.from(
    new Set(declaredPaths.map(normalizeDeclaredPath).filter(Boolean)),
  );

  return {
    agentId: normalizedAgentId,
    rootPath: getPlatformRootDir(platform),
    relativePaths,
  };
}

export function requireAllowlistedAgentConfigPath(
  context: AgentConfigContext,
  relativePath: unknown,
): string {
  if (typeof relativePath !== "string") {
    throw new Error("Agent config relativePath must be a string");
  }
  const normalized = normalizeDeclaredPath(relativePath);
  if (!context.relativePaths.includes(normalized)) {
    throw new Error("Agent config file is not allowlisted");
  }
  return normalized;
}

export function resolveAgentProviderContext(
  agentId: string,
): AgentProviderAdapterContext {
  const normalizedAgentId = agentId.trim();
  if (!isAgentDepthCapabilityAvailable(normalizedAgentId, "providerModel")) {
    throw new Error("AGENT_PROVIDER_ADAPTER_UNSUPPORTED");
  }
  const context = getAgentConfigContext(normalizedAgentId);
  const definition = getAgentDefinitionById(normalizedAgentId);
  const redirect = definition?.modelConfig?.defaultRootRelativePath;
  const osKey =
    process.platform === "darwin" || process.platform === "win32"
      ? process.platform
      : "linux";
  const declaredRootSuffix = definition?.platform.rootDir[osKey]
    .replace(/\\/g, "/")
    .replace(/^(~|%USERPROFILE%)\//, "");
  const matchesDeclaredRoot =
    declaredRootSuffix &&
    context.rootPath
      .replace(/\\/g, "/")
      .replace(/\/+$/, "")
      .endsWith(`/${declaredRootSuffix}`);
  const rootPath =
    redirect && matchesDeclaredRoot
      ? path.resolve(context.rootPath, redirect)
      : context.rootPath;
  return {
    agentId: normalizedAgentId,
    platformId: normalizedAgentId,
    rootPath,
  };
}
