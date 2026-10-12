import type {
  AgentCapabilityKey,
  AgentCapabilityStatus,
  ManagedAgentSummary,
} from "@prompthub/shared/types";
import type { AgentAssetDomain } from "./use-agent-asset-domain";

export type AgentWorkspaceTabKey =
  | "overview"
  | AgentAssetDomain
  | "definitions"
  | "provider"
  | "appearance"
  | "configFiles"
  | "sessions";

export type AgentWorkspaceNavigate = (tab: AgentWorkspaceTabKey) => void;

export interface AgentWorkspaceTab {
  assetDomain?: AgentAssetDomain;
  capability: AgentCapabilityKey;
  fallback: string;
  key: AgentWorkspaceTabKey;
  labelKey: string;
  platformIds?: readonly string[];
}

export interface AgentCapabilityGuidance {
  fallback: string;
  key:
    | "agents.adapterPlannedDescription"
    | "agents.adapterUnsupportedDescription";
}

export const AGENT_ASSET_DOMAINS: AgentAssetDomain[] = [
  "skills",
  "mcp",
  "rules",
  "plugins",
];

export function isAgentAssetDomain(
  tab: AgentWorkspaceTabKey,
): tab is AgentAssetDomain {
  return AGENT_ASSET_DOMAINS.some((domain) => domain === tab);
}

export const AGENT_WORKSPACE_TABS: AgentWorkspaceTab[] = [
  {
    key: "overview",
    capability: "overview",
    labelKey: "agents.overview",
    fallback: "Overview",
  },
  {
    key: "skills",
    assetDomain: "skills",
    capability: "assets",
    labelKey: "agents.skills",
    fallback: "Skills",
  },
  {
    key: "mcp",
    assetDomain: "mcp",
    capability: "assets",
    labelKey: "agents.mcp",
    fallback: "MCP",
  },
  {
    key: "plugins",
    assetDomain: "plugins",
    capability: "assets",
    labelKey: "agents.plugins",
    fallback: "Plugins",
  },
  {
    key: "rules",
    assetDomain: "rules",
    capability: "assets",
    labelKey: "agents.rules",
    fallback: "Rules",
  },
  {
    key: "definitions",
    capability: "assets",
    labelKey: "agents.definitions",
    fallback: "Definitions",
    platformIds: ["qwen"],
  },
  {
    key: "provider",
    capability: "provider",
    labelKey: "agents.providerAndModel",
    fallback: "Provider & Model",
  },
  {
    key: "appearance",
    capability: "appearance",
    labelKey: "agents.appearanceTab",
    fallback: "Appearance",
  },
  {
    key: "configFiles",
    capability: "configFiles",
    labelKey: "agents.configFiles",
    fallback: "Config Files",
  },
  {
    key: "sessions",
    capability: "sessions",
    labelKey: "agents.sessions",
    fallback: "Sessions",
  },
];

export function getAgentTabStatus(
  agent: ManagedAgentSummary,
  tab: AgentWorkspaceTab,
): AgentCapabilityStatus {
  if (tab.platformIds && !tab.platformIds.includes(agent.id)) {
    return "unsupported";
  }
  if (
    tab.assetDomain &&
    !(
      tab.assetDomain === "plugins" &&
      (agent.workspaceKind === "plugin-harness" ||
        agent.id === "deepseek-harness") &&
      agent.paths.profiles
    ) &&
    !agent.paths[tab.assetDomain] &&
    !(tab.assetDomain === "rules" && agent.paths.projectRules)
  ) {
    return "unsupported";
  }
  return agent.capabilities[tab.capability].status;
}

export function getAgentWorkspaceTabs(
  agent: ManagedAgentSummary,
): AgentWorkspaceTab[] {
  if (
    agent.workspaceKind === "plugin-harness" ||
    agent.id === "deepseek-harness"
  ) {
    return AGENT_WORKSPACE_TABS.filter(
      (tab) => tab.key === "overview" || tab.key === "plugins",
    );
  }
  return AGENT_WORKSPACE_TABS.filter(
    (tab) => !tab.platformIds || tab.platformIds.includes(agent.id),
  );
}

export function isAgentTabEnabled(
  agent: ManagedAgentSummary,
  tab: AgentWorkspaceTab,
): boolean {
  if (!agent.isDetected) return tab.key === "overview";
  const status = getAgentTabStatus(agent, tab);
  return status === "supported" || status === "partial";
}

export function getAgentCapabilityGuidance(
  status: AgentCapabilityStatus,
): AgentCapabilityGuidance | null {
  if (status === "planned") {
    return {
      key: "agents.adapterPlannedDescription",
      fallback: "This adapter is planned and is not available yet.",
    };
  }
  if (status === "unsupported") {
    return {
      key: "agents.adapterUnsupportedDescription",
      fallback: "This feature is not currently supported for this Agent.",
    };
  }
  return null;
}
