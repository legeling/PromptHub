import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const reasonixAgentDefinition = {
  platform: {
    id: "reasonix",
    name: "Reasonix",
    icon: "Code",
    rootDir: {
      darwin: "~/.reasonix",
      win32: "%APPDATA%\\reasonix",
      linux: "~/.reasonix",
    },
    skillsRelativePath: "skills",
    commandsRelativePath: "commands",
    // Reasonix stores MCP/plugin declarations in TOML, but its schema is not
    // compatible with the Codex TOML writer. Keep this path discovery-only.
    mcpRelativePath: "config.toml",
    configFiles: ["config.toml", "settings.json", "trust.json"],
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
      evidence: "verified-reasonix-events-v1",
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
