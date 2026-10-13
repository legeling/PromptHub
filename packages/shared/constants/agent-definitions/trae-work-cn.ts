import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const traeWorkCnAgentDefinition = {
  platform: {
    id: "trae-work-cn",
    name: "TRAE Work CN",
    icon: "Zap",
    rootDir: {
      darwin: "~/.trae-work-cn",
      win32: "%USERPROFILE%\\.trae-work-cn",
      linux: "~/.trae-work-cn",
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
