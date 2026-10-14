import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const kimiAgentDefinition = {
  platform: {
    id: "kimi",
    name: "Kimi Code",
    icon: "Sparkles",
    rootDir: {
      darwin: "~/.kimi-code",
      win32: "%USERPROFILE%\\.kimi-code",
      linux: "~/.kimi-code",
    },
    rootEnvironmentVariable: "KIMI_CODE_HOME",
    skillsRelativePath: "skills",
    mcpRelativePath: "mcp.json",
    pluginsRelativePath: "plugins",
    globalRuleFile: "AGENTS.md",
    configFiles: ["config.toml", "tui.toml", "mcp.json"],
    cli: {
      executableCandidates: ["kimi"],
      versionArgs: ["--version"],
      evidence: "official-kimi-code-cli",
    },
  },
  modelConfig: { format: "toml", relativePaths: ["config.toml"] },
  capabilities: {
    providerModel: {
      enabled: false,
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
