import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const qwenWorkAgentDefinition = {
  platform: {
    id: "qwen-work",
    name: "Qwen Work (CN)",
    icon: "BriefcaseBusiness",
    rootDir: {
      darwin: "~/.qwenworkcn",
      win32: "%USERPROFILE%\\.qwenworkcn",
      linux: "~/.qwenworkcn",
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
