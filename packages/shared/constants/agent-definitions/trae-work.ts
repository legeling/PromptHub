import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const traeWorkAgentDefinition = {
  platform: {
    id: "trae-work",
    name: "TRAE Work",
    icon: "Zap",
    rootDir: {
      darwin: "~/.trae-work",
      win32: "%USERPROFILE%\\.trae-work",
      linux: "~/.trae-work",
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
