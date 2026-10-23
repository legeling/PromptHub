export interface AgentExtensionCapability {
  projectDirectory: string;
  subagentExtension: ".md" | ".toml";
  hooksPath: "settings.json" | "hooks.json" | null;
  hooksFormat:
    | "claude"
    | "gemini"
    | "cursor"
    | "codex"
    | "antigravity"
    | "plugin";
  localHooks: boolean;
  subagentsUrl: string;
  hooksUrl: string;
}

// Native file formats, not an assertion that every native runtime was exercised.
const CAPABILITIES: Record<string, AgentExtensionCapability> = {
  claude: {
    projectDirectory: ".claude",
    subagentExtension: ".md",
    hooksPath: "settings.json",
    hooksFormat: "claude",
    localHooks: true,
    subagentsUrl: "https://code.claude.com/docs/en/sub-agents",
    hooksUrl: "https://code.claude.com/docs/en/hooks",
  },
  opencode: {
    projectDirectory: ".opencode",
    subagentExtension: ".md",
    hooksPath: null,
    hooksFormat: "plugin",
    localHooks: false,
    subagentsUrl: "https://opencode.ai/docs/agents/",
    hooksUrl: "https://opencode.ai/docs/plugins/",
  },
  cursor: {
    projectDirectory: ".cursor",
    subagentExtension: ".md",
    hooksPath: "hooks.json",
    hooksFormat: "cursor",
    localHooks: false,
    subagentsUrl: "https://cursor.com/docs/subagents",
    hooksUrl: "https://cursor.com/docs/hooks",
  },
  codex: {
    projectDirectory: ".codex",
    subagentExtension: ".toml",
    hooksPath: "hooks.json",
    hooksFormat: "codex",
    localHooks: false,
    subagentsUrl:
      "https://learn.chatgpt.com/docs/agent-configuration/subagents",
    hooksUrl: "https://learn.chatgpt.com/docs/hooks",
  },
  gemini: {
    projectDirectory: ".gemini",
    subagentExtension: ".md",
    hooksPath: "settings.json",
    hooksFormat: "gemini",
    localHooks: false,
    subagentsUrl: "https://geminicli.com/docs/core/subagents/",
    hooksUrl: "https://geminicli.com/docs/hooks/",
  },
  antigravity: {
    projectDirectory: ".agents",
    subagentExtension: ".md",
    hooksPath: "hooks.json",
    hooksFormat: "antigravity",
    localHooks: false,
    subagentsUrl: "https://antigravity.google/docs/subagents",
    hooksUrl: "https://antigravity.google/docs/hooks",
  },
};

export function getAgentExtensionCapability(
  agentId: string,
): AgentExtensionCapability | undefined {
  return Object.hasOwn(CAPABILITIES, agentId)
    ? CAPABILITIES[agentId]
    : undefined;
}

export const AGENT_EXTENSION_PLATFORM_IDS = Object.keys(CAPABILITIES);
