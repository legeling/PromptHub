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
    launchPaths: {
      darwin: [
        "/Applications/Antigravity.app",
        "~/Applications/Antigravity.app",
      ],
    },
  },
  capabilities: {
    providerModel: {
      enabled: false,
      status: "planned",
      evidence: "desktop-model-write-contract-unverified",
    },
    sessions: {
      enabled: false,
      status: "planned",
      evidence: "desktop-session-format-unverified",
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
