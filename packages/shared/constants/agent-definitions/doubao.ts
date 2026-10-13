import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const doubaoAgentDefinition = {
  platform: {
    id: "doubao",
    name: "Doubao Work",
    icon: "Bot",
    rootDir: {
      darwin:
        "~/Library/Application Support/Doubao/Default/.doubao/agent_mode/workspace",
      win32: "%APPDATA%\\Doubao\\Default\\.doubao\\agent_mode\\workspace",
      linux: "~/.config/Doubao/Default/.doubao/agent_mode/workspace",
    },
    skillsRelativePath: ".user_skills",
    launchPaths: {
      darwin: ["/Applications/Doubao.app", "~/Applications/Doubao.app"],
    },
  },
  capabilities: {
    providerModel: {
      enabled: false,
      status: "planned",
      evidence: "adapter-evidence-pending",
    },
    sessions: {
      enabled: false,
      status: "planned",
      evidence: "adapter-evidence-pending",
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
