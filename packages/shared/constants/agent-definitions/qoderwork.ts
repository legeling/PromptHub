import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const qoderworkAgentDefinition = {
  platform: {
    id: "qoderwork",
    name: "QoderWorker",
    icon: "Code",
    rootDir: {
      darwin: "~/.qoderwork",
      win32: "%USERPROFILE%\\.qoderwork",
      linux: "~/.qoderwork",
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
