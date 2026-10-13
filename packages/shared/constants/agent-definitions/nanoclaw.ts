import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const nanoclawAgentDefinition = {
  platform: {
    id: "nanoclaw",
    name: "NanoClaw",
    icon: "Bot",
    rootDir: {
      darwin: "~/.nanoclaw",
      win32: "%USERPROFILE%\\.nanoclaw",
      linux: "~/.nanoclaw",
    },
    rootDirFallbacks: {
      darwin: ["~/nanoclaw", "~/nanoclaw-v2"],
      win32: ["%USERPROFILE%\\nanoclaw", "%USERPROFILE%\\nanoclaw-v2"],
      linux: ["~/nanoclaw", "~/nanoclaw-v2"],
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
      enabled: true,
      status: "supported",
      evidence: "verified-nanoclaw-v2-sqlite",
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
