import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const traeCnAgentDefinition = {
  platform: {
    id: "trae-cn",
    name: "TRAE IDE CN",
    icon: "Zap",
    rootDir: {
      darwin: "~/.trae-cn",
      win32: "%USERPROFILE%\\.trae-cn",
      linux: "~/.trae-cn",
    },
    skillsRelativePath: "skills",
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
