import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const opencodeAgentDefinition = {
  platform: {
    id: "opencode",
    name: "OpenCode",
    icon: "Terminal",
    rootEnvironmentVariable: "XDG_CONFIG_HOME",
    rootEnvironmentSubdirectory: "opencode",
    rootDir: {
      darwin: "~/.config/opencode",
      win32: "%USERPROFILE%\\.config\\opencode",
      linux: "~/.config/opencode",
    },
    skillsRelativePath: "skills",
    agentsRelativePath: "agents",
    commandsRelativePath: "commands",
    mcpRelativePath: "opencode.json",
    globalRuleFile: "AGENTS.md",
    configFiles: ["opencode.jsonc", "opencode.json", "config.json"],
    cli: {
      executableCandidates: ["opencode"],
      versionArgs: ["--version"],
      evidence: "official-opencode-cli",
      update: {
        args: ["upgrade"],
        rollbackTargetPrefix: "v",
        evidence: "official-opencode-cli-upgrade",
      },
    },
  },
  modelConfig: {
    format: "json",
    relativePaths: ["opencode.jsonc", "opencode.json", "config.json"],
  },
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
