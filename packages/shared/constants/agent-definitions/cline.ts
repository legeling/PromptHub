import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const clineAgentDefinition = {
  platform: {
    id: "cline",
    name: "Cline",
    icon: "Terminal",
    rootDir: {
      darwin: "~/.cline",
      win32: "%USERPROFILE%\\.cline",
      linux: "~/.cline",
    },
    skillsRelativePath: "skills",
    mcpRelativePath: "data/settings/cline_mcp_settings.json",
    globalRuleFile: "data/settings/rules/AGENTS.md",
    configFiles: [
      "data/settings/global-settings.json",
      "data/settings/cline_mcp_settings.json",
    ],
  },
  capabilities: {
    providerModel: {
      enabled: false,
      status: "planned",
      evidence: "adapter-evidence-pending",
    },
    sessions: {
      enabled: true,
      status: "partial",
      evidence: "verified-readonly-session-snapshots",
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
