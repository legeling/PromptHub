import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const kiroAgentDefinition = {
  platform: {
    id: "kiro",
    name: "Kiro",
    icon: "Sparkle",
    rootEnvironmentVariable: "KIRO_HOME",
    rootDir: {
      darwin: "~/.kiro",
      win32: "%USERPROFILE%\\.kiro",
      linux: "~/.kiro",
    },
    skillsRelativePath: "skills",
    agentsRelativePath: "agents",
    mcpRelativePath: "settings/mcp.json",
    pluginsRelativePath: "powers",
    globalRuleFile: "steering/AGENTS.md",
    configFiles: ["settings/cli.json"],
    launchPaths: {
      darwin: ["/Applications/Kiro.app", "~/Applications/Kiro.app"],
    },
  },
  modelConfig: { format: "json", relativePaths: ["settings/cli.json"] },
  capabilities: {
    providerModel: {
      enabled: false,
      status: "partial",
      evidence: "model-config-adapter",
    },
    sessions: {
      enabled: true,
      status: "partial",
      evidence: "verified-local-session-adapter",
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
