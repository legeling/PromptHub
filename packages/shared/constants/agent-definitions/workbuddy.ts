import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const workbuddyAgentDefinition = {
  platform: {
    id: "workbuddy",
    name: "Tencent WorkBuddy",
    icon: "Bot",
    rootDir: {
      darwin: "~/.workbuddy",
      win32: "%USERPROFILE%\\.workbuddy",
      linux: "~/.workbuddy",
    },
    skillsRelativePath: "skills",
    mcpRelativePath: "mcp.json",
    configFiles: ["mcp.json"],
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
