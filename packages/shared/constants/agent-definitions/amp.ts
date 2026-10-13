import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const ampAgentDefinition = {
  platform: {
    id: "amp",
    name: "Amp",
    icon: "Zap",
    rootDir: {
      darwin: "~/.config/amp",
      win32: "%USERPROFILE%\\.config\\amp",
      linux: "~/.config/amp",
    },
    rootDirFallbacks: {
      win32: ["%APPDATA%\\amp"],
    },
    skillsRelativePath: "skills",
    mcpRelativePath: "settings.json",
    globalRuleFile: "AGENTS.md",
  },
  capabilities: {
    providerModel: {
      enabled: false,
      status: "unsupported",
      evidence: "service-managed-provider-contract",
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
