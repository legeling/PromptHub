import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const qoderAgentDefinition = {
  platform: {
    id: "qoder",
    name: "Qoder",
    icon: "Bot",
    rootDir: {
      darwin: "~/.qoder",
      win32: "%USERPROFILE%\\.qoder",
      linux: "~/.qoder",
    },
    skillsRelativePath: "skills",
    mcpRelativePath: "settings.json",
    projectRuleFile: "AGENTS.md",
    projectRuleKind: "workspace",
    configFiles: ["settings.json"],
  },
  modelConfig: { format: "json", relativePaths: ["settings.json"] },
  capabilities: {
    providerModel: {
      enabled: false,
      status: "partial",
      evidence: "model-config-adapter",
    },
    sessions: {
      enabled: true,
      status: "supported",
      evidence: "verified-qoder-transcript-jsonl-v1",
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
