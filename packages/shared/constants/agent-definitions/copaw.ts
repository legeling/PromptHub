import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const copawAgentDefinition = {
  platform: {
    id: "copaw",
    name: "CoPaw",
    icon: "Bot",
    rootDir: {
      darwin: "~/.qwenpaw",
      win32: "%USERPROFILE%\\.qwenpaw",
      linux: "~/.qwenpaw",
    },
    rootDirFallbacks: {
      darwin: ["~/.copaw"],
      win32: ["%USERPROFILE%\\.copaw"],
      linux: ["~/.copaw"],
    },
    skillsRelativePath: "skills",
    configFiles: ["config.json"],
  },
  modelConfig: { format: "json", relativePaths: ["config.json"] },
  capabilities: {
    providerModel: {
      enabled: false,
      status: "partial",
      evidence: "model-config-adapter",
    },
    sessions: {
      enabled: true,
      status: "supported",
      evidence: "verified-copaw-safe-json-session-v2",
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
