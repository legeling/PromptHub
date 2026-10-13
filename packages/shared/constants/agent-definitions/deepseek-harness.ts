import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const deepseekHarnessAgentDefinition = {
  platform: {
    id: "deepseek-harness",
    name: "DeepSeek Harness",
    icon: "Plug",
    rootEnvironmentVariable: "DSH_HOME",
    rootDir: {
      darwin: "~/.dsh",
      win32: "%USERPROFILE%\\.dsh",
      linux: "~/.dsh",
    },
    skillsRelativePath: "",
    assetModel: "plugin-harness",
    harnessProfilesRelativePath: "profiles",
    cli: {
      executableCandidates: ["dsh"],
      versionArgs: ["--version"],
      evidence: "official-deepseek-harness-cli",
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
