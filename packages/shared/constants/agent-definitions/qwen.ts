import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const qwenAgentDefinition = {
  platform: {
    id: "qwen",
    name: "Qwen Code",
    icon: "Bot",
    rootDir: {
      darwin: "~/.qwen",
      win32: "%USERPROFILE%\\.qwen",
      linux: "~/.qwen",
    },
    rootEnvironmentVariable: "QWEN_HOME",
    environmentRootRelativeToCwd: true,
    skillsRelativePath: "skills",
    agentsRelativePath: "agents",
    commandsRelativePath: "commands",
    mcpRelativePath: "settings.json",
    pluginsRelativePath: "extensions",
    globalRuleFile: "QWEN.md",
    cli: {
      executableCandidates: ["qwen"],
      versionArgs: ["--version"],
      evidence: "official-qwen-code-cli",
      update: {
        args: ["install", "-g", "@qwen-code/qwen-code@latest"],
        command: {
          executableCandidates: ["npm"],
          supportedInstallSources: ["npm", "node-version-manager"],
        },
        rollbackArgsPrefix: ["install", "-g"],
        rollbackTargetPrefix: "@qwen-code/qwen-code@",
        evidence: "official-qwen-code-npm-install",
      },
    },
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
