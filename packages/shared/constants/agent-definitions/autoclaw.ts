import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const autoclawAgentDefinition = {
  platform: {
    id: "autoclaw",
    name: "AutoClaw",
    icon: "Bot",
    rootDir: {
      darwin: "~/.autoclaw",
      win32: "%USERPROFILE%\\.autoclaw",
      linux: "~/.autoclaw",
    },
    rootDirFallbacks: {
      darwin: ["~/.openclaw-autoclaw"],
      win32: ["%USERPROFILE%\\.openclaw-autoclaw"],
      linux: ["~/.openclaw-autoclaw"],
    },
    skillsRelativePath: "skills",
    configFiles: ["setting.json"],
  },
  modelConfig: { format: "json", relativePaths: ["setting.json"] },
  capabilities: {
    providerModel: {
      enabled: false,
      status: "partial",
      evidence: "model-config-adapter",
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
