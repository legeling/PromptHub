import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const cherryStudioAgentDefinition = {
  platform: {
    id: "cherry-studio",
    name: "Cherry Studio",
    icon: "Bot",
    rootDir: {
      darwin: "~/Library/Application Support/CherryStudio",
      win32: "%APPDATA%\\CherryStudio",
      linux: "~/.config/CherryStudio",
    },
    skillsRelativePath: "Data/Skills",
    launchPaths: {
      darwin: [
        "/Applications/Cherry Studio.app",
        "~/Applications/Cherry Studio.app",
      ],
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
      evidence: "verified-cherry-agent-session-db",
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
