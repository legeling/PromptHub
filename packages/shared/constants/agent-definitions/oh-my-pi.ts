import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const ohMyPiAgentDefinition = {
  platform: {
    id: "oh-my-pi",
    name: "Oh My Pi",
    icon: "Terminal",
    rootDir: {
      darwin: "~/.omp/agent",
      win32: "%USERPROFILE%\\.omp\\agent",
      linux: "~/.omp/agent",
    },
    rootEnvironmentVariable: "PI_CODING_AGENT_DIR",
    skillsRelativePath: "skills",
    mcpRelativePath: "mcp.json",
    // Oh My Pi installs plugin packages in the sibling user-level plugin root.
    pluginsRelativePath: "../plugins",
    globalRuleFile: "RULES.md",
    configFiles: [
      "config.yml",
      "config.yaml",
      "settings.json",
      "mcp.json",
      ".mcp.json",
      "RULES.md",
    ],
    cli: {
      executableCandidates: ["omp"],
      versionArgs: ["--version"],
      evidence: "official-oh-my-pi-cli",
    },
  },
  modelConfig: { format: "yaml", relativePaths: ["config.yml", "config.yaml"] },
  capabilities: {
    providerModel: {
      enabled: false,
      status: "partial",
      evidence: "model-config-adapter",
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
