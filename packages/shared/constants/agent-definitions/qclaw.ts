import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const qclawAgentDefinition = {
  platform: {
    id: "qclaw",
    name: "QClaw",
    icon: "Bot",
    rootDir: {
      darwin: "~/.qclaw",
      win32: "%USERPROFILE%\\.qclaw",
      linux: "~/.qclaw",
    },
    skillsRelativePath: "skills",
    globalRuleFile: "workspace/SOUL.md",
    configFiles: ["openclaw.json"],
  },
  modelConfig: { format: "json", relativePaths: ["openclaw.json"] },
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
