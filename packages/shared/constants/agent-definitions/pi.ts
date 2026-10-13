import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const piAgentDefinition = {
  platform: {
    id: "pi",
    name: "Pi",
    icon: "Pi",
    rootDir: {
      darwin: "~/.pi/agent",
      win32: "%USERPROFILE%\\.pi\\agent",
      linux: "~/.pi/agent",
    },
    rootEnvironmentVariable: "PI_CODING_AGENT_DIR",
    skillsRelativePath: "skills",
    mcpRelativePath: "mcp.json",
    pluginsRelativePath: "extensions",
    globalRuleFile: "AGENTS.md",
    configFiles: ["settings.json", "models.json", "AGENTS.md"],
    cli: {
      executableCandidates: ["pi"],
      versionArgs: ["--version"],
      evidence: "official-pi-cli",
    },
  },
  modelConfig: { format: "json", relativePaths: ["settings.json"] },
  capabilities: {
    providerModel: {
      enabled: true,
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
