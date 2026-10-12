import path from "node:path";
import { isAgentDepthCapabilityAvailable } from "@prompthub/shared/constants/agent-platform-capabilities";

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
  const rootPath =
    normalizedAgentId === "antigravity" &&
    path.basename(context.rootPath) === "config" &&
    path.basename(path.dirname(context.rootPath)) === ".gemini"
      ? path.join(path.dirname(context.rootPath), "antigravity-cli")
      : context.rootPath;
  return {
    agentId: normalizedAgentId,
    platformId: normalizedAgentId,
    rootPath,
  };
}
