import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const hermesAgentDefinition = {
  platform: {
    id: "hermes",
    name: "Hermes Agent",
    icon: "Bot",
    rootDir: {
      darwin: "~/.hermes",
      win32: "%LOCALAPPDATA%\\hermes",
      linux: "~/.hermes",
    },
    skillsRelativePath: "skills",
    globalRuleFile: "AGENTS.md",
    configFiles: ["config.yaml"],
  },
  modelConfig: { format: "yaml", relativePaths: ["config.yaml"] },
  capabilities: {
    providerModel: {
      enabled: false,
      status: "partial",
      evidence: "model-config-adapter",
    },
    sessions: {
      enabled: true,
      status: "supported",
      evidence: "verified-hermes-state-db",
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
