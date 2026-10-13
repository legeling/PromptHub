import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const codebuddyAgentDefinition = {
  platform: {
    id: "codebuddy",
    name: "CodeBuddy",
    icon: "Code",
    rootDir: {
      darwin: "~/.codebuddy",
      win32: "%USERPROFILE%\\.codebuddy",
      linux: "~/.codebuddy",
    },
    skillsRelativePath: "skills",
    agentsRelativePath: "agents",
    commandsRelativePath: "commands",
    mcpRelativePath: ".mcp.json",
    globalRuleFile: "CODEBUDDY.md",
    configFiles: ["settings.json", ".mcp.json", "CODEBUDDY.md"],
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
