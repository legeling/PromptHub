import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const cursorAgentDefinition = {
  platform: {
    id: "cursor",
    name: "Cursor",
    icon: "Terminal",
    rootDir: {
      darwin: "~/.cursor",
      win32: "%USERPROFILE%\\.cursor",
      linux: "~/.cursor",
    },
    skillsRelativePath: "skills",
    projectRuleFile: ".cursor/rules/prompthub.mdc",
    projectRuleKind: "cursor",
    agentsRelativePath: "agents",
    mcpRelativePath: "mcp.json",
    pluginsRelativePath: "plugins",
    launchPaths: {
      darwin: ["/Applications/Cursor.app", "~/Applications/Cursor.app"],
    },
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
      evidence: "verified-readonly-agent-transcripts",
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
