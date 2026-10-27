import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const antigravityCliAgentDefinition = {
  platform: {
    id: "antigravity-cli",
    name: "Antigravity CLI",
    icon: "Sparkles",
    lifecycle: "current",
    rootDir: {
      darwin: "~/.gemini/antigravity-cli",
      win32: "%USERPROFILE%\\.gemini\\antigravity-cli",
      linux: "~/.gemini/antigravity-cli",
    },
    skillsRelativePath: "skills",
    // agy 1.4.6 plugin list consumes this shared directory, not CLI staging.
    pluginsRelativePath: "../config/plugins",
    mcpRelativePath: "../config/mcp_config.json",
    globalRuleFile: "../GEMINI.md",
    configFiles: ["settings.json"],
    cli: {
      executableCandidates: ["agy"],
      versionArgs: ["--version"],
      evidence: "https://antigravity.google/docs/cli/install/",
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
      status: "partial",
      evidence: "verified-antigravity-cli-transcripts",
    },
    usage: {
      enabled: false,
      status: "planned",
      evidence: "cli-quota-contract-unverified",
    },
    appearance: {
      enabled: false,
      status: "unsupported",
      evidence: "appearance-adapter-unavailable",
    },
  },
} satisfies AgentPlatformDefinition;
