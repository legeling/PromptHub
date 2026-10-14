import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const geminiAgentDefinition = {
  platform: {
    id: "gemini",
    name: "Gemini",
    icon: "Sparkles",
    lifecycle: "enterprise-legacy",
    replacementPlatformId: "antigravity",
    rootDir: {
      darwin: "~/.gemini",
      win32: "%USERPROFILE%\\.gemini",
      linux: "~/.gemini",
    },
    skillsRelativePath: "skills",
    mcpRelativePath: "settings.json",
    pluginsRelativePath: "extensions",
    commandsRelativePath: "commands",
    globalRuleFile: "GEMINI.md",
    configFiles: ["settings.json"],
  },
  modelConfig: { format: "json", relativePaths: ["settings.json"] },
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
