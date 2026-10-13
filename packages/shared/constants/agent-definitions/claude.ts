import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const claudeAgentDefinition = {
  platform: {
    id: "claude",
    name: "Claude Code",
    icon: "Sparkles",
    rootDir: {
      darwin: "~/.claude",
      win32: "%USERPROFILE%\\.claude",
      linux: "~/.claude",
    },
    skillsRelativePath: "skills",
    mcpRelativePath: "../.claude.json",
    pluginsRelativePath: "plugins/cache/prompthub",
    globalRuleFile: "CLAUDE.md",
    configFiles: ["settings.json"],
    launchPaths: {
      darwin: ["/Applications/Claude.app", "~/Applications/Claude.app"],
    },
    cli: {
      executableCandidates: ["claude"],
      versionArgs: ["--version"],
      evidence: "official-claude-cli",
    },
  },
  modelConfig: { format: "json", relativePaths: ["settings.json"] },
  capabilities: {
    providerModel: {
      enabled: true,
      status: "supported",
      evidence: "verified-provider-adapter",
    },
    sessions: {
      enabled: true,
      status: "supported",
      evidence: "verified-session-adapter",
    },
    usage: {
      enabled: true,
      status: "supported",
      evidence: "verified-usage-adapter",
    },
    appearance: {
      enabled: false,
      status: "unsupported",
      evidence: "appearance-adapter-unavailable",
    },
  },
} satisfies AgentPlatformDefinition;
