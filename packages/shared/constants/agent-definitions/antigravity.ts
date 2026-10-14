import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const antigravityAgentDefinition = {
  platform: {
    id: "antigravity",
    name: "Antigravity",
    icon: "Sparkles",
    lifecycle: "current",
    rootDir: {
      darwin: "~/.gemini/config",
      win32: "%USERPROFILE%\\.gemini\\config",
      linux: "~/.gemini/config",
    },
    skillsRelativePath: "skills",
    mcpRelativePath: "mcp_config.json",
    pluginsRelativePath: "plugins",
    globalRuleFile: "../GEMINI.md",
    cli: {
      executableCandidates: ["agy"],
      versionArgs: ["--version"],
      evidence: "https://antigravity.google/docs/cli/install/",
    },
    launchPaths: {
      darwin: [
        "/Applications/Antigravity.app",
        "~/Applications/Antigravity.app",
      ],
    },
  },
  modelConfig: {
    format: "json",
    relativePaths: ["settings.json"],
    defaultRootRelativePath: "../antigravity-cli",
  },
  capabilities: {
    providerModel: {
      enabled: true,
      status: "partial",
      evidence: "model-config-adapter",
    },
    sessions: {
      enabled: true,
      status: "partial",
      evidence: "verified-antigravity-cli-transcripts",
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
