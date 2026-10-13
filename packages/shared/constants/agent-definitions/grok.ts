import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const grokAgentDefinition = {
  platform: {
    id: "grok",
    name: "Grok Build",
    icon: "Terminal",
    rootDir: {
      darwin: "~/.grok",
      win32: "%USERPROFILE%\\.grok",
      linux: "~/.grok",
    },
    rootEnvironmentVariable: "GROK_HOME",
    skillsRelativePath: "skills",
    agentsRelativePath: "agents",
    commandsRelativePath: "commands",
    mcpRelativePath: "config.toml",
    pluginsRelativePath: "plugins",
    globalRuleFile: "AGENTS.md",
    configFiles: [
      "config.toml",
      "pager.toml",
      "settings.json",
      "lsp.json",
      "sandbox.toml",
    ],
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
      enabled: false,
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
