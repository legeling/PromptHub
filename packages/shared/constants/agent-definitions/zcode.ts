import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const zcodeAgentDefinition = {
  platform: {
    id: "zcode",
    name: "智谱 ZCode",
    icon: "Bot",
    rootDir: {
      darwin: "~/.zcode",
      win32: "%USERPROFILE%\\.zcode",
      linux: "~/.zcode",
    },
    skillsRelativePath: "skills",
    agentsRelativePath: "agents",
    commandsRelativePath: "commands",
    mcpRelativePath: "cli/config.json",
    globalRuleFile: "AGENTS.md",
    configFiles: ["cli/config.json"],
  },
  capabilities: {
    providerModel: {
      enabled: false,
      status: "planned",
      evidence: "adapter-evidence-pending",
    },
    sessions: {
      enabled: false,
      status: "planned",
      evidence: "adapter-evidence-pending",
    },
    usage: {
      enabled: false,
      status: "planned",
      evidence: "adapter-evidence-pending",
    },
    appearance: {
      enabled: false,
      status: "unsupported",
      evidence: "appearance-adapter-unavailable",
    },
  },
} satisfies AgentPlatformDefinition;
