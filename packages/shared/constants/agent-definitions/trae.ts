import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const traeAgentDefinition = {
  platform: {
    id: "trae",
    name: "TRAE IDE",
    icon: "Zap",
    rootDir: {
      darwin: "~/.trae",
      win32: "%USERPROFILE%\\.trae",
      linux: "~/.trae",
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
