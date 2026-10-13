import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const augmentAgentDefinition = {
  platform: {
    id: "augment",
    name: "Augment",
    icon: "Sparkle",
    rootDir: {
      darwin: "~/.augment",
      win32: "%USERPROFILE%\\.augment",
      linux: "~/.augment",
    },
    skillsRelativePath: "skills",
    commandsRelativePath: "commands",
    // Auggie persists MCP servers in settings.json; no generic MCP writer is
    // exposed until the settings schema has a dedicated target adapter.
    mcpRelativePath: "settings.json",
    globalRuleFile: "user-guidelines.md",
    configFiles: ["settings.json"],
  },
  capabilities: {
    providerModel: {
      enabled: false,
      status: "planned",
      evidence: "adapter-evidence-pending",
    },
    sessions: {
      enabled: true,
      status: "supported",
      evidence: "verified-augment-session-json",
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
