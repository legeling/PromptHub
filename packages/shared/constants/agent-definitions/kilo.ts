import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const kiloAgentDefinition = {
  platform: {
    id: "kilo",
    name: "Kilo Code",
    icon: "Bot",
    rootDir: {
      darwin: "~/.kilo",
      win32: "%USERPROFILE%\\.kilo",
      linux: "~/.kilo",
    },
    skillsRelativePath: "skills",
    mcpRelativePath: "../.config/kilo/kilo.json",
    globalRuleFile: "rules/global.md",
  },
  capabilities: {
    providerModel: {
      enabled: false,
      status: "planned",
      evidence: "adapter-evidence-pending",
    },
    sessions: {
      enabled: true,
      status: "supported",
      evidence: "verified-kilo-session-json",
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
