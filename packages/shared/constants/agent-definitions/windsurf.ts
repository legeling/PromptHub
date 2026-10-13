import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const windsurfAgentDefinition = {
  platform: {
    id: "windsurf",
    name: "Windsurf",
    icon: "Wind",
    rootDir: {
      darwin: "~/.codeium/windsurf",
      win32: "%USERPROFILE%\\.codeium\\windsurf",
      linux: "~/.codeium/windsurf",
    },
    skillsRelativePath: "skills",
    mcpRelativePath: "mcp_config.json",
    globalRuleFile: "memories/global_rules.md",
    launchPaths: {
      darwin: ["/Applications/Windsurf.app", "~/Applications/Windsurf.app"],
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
      evidence: "verified-transcript-hook-adapter",
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
