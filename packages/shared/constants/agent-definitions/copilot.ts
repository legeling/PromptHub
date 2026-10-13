import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const copilotAgentDefinition = {
  platform: {
    id: "copilot",
    name: "GitHub Copilot",
    icon: "Github",
    rootDir: {
      darwin: "~/.copilot",
      win32: "%USERPROFILE%\\.copilot",
      linux: "~/.copilot",
    },
    rootEnvironmentVariable: "COPILOT_HOME",
    skillsRelativePath: "skills",
    mcpRelativePath: "mcp-config.json",
    pluginsRelativePath: "installed-plugins",
    globalRuleFile: "copilot-instructions.md",
    agentsRelativePath: "agents",
    configFiles: ["settings.json"],
  },
  modelConfig: { format: "json", relativePaths: ["settings.json"] },
  capabilities: {
    providerModel: {
      enabled: false,
      status: "partial",
      evidence: "model-config-adapter",
    },
    sessions: {
      enabled: true,
      status: "partial",
      evidence: "verified-readonly-session-store",
    },
    usage: {
      enabled: false,
      status: "supported",
      evidence: "verified-usage-adapter",
    },
    appearance: {
      enabled: false,
      status: "unsupported",
      evidence: "appearance-adapter-unavailable",
    },
  },
} satisfies AgentPlatformDefinition;
