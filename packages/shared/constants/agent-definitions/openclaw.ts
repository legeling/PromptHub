import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const openclawAgentDefinition = {
  platform: {
    id: "openclaw",
    name: "OpenClaw",
    icon: "Bot",
    rootDir: {
      darwin: "~/.openclaw",
      win32: "%USERPROFILE%\\.openclaw",
      linux: "~/.openclaw",
    },
    skillsRelativePath: "skills",
    mcpRelativePath: "openclaw.json",
    globalRuleFile: "workspace/SOUL.md",
    configFiles: ["openclaw.json"],
    cli: {
      executableCandidates: ["openclaw"],
      versionArgs: ["--version"],
      evidence: "official-openclaw-cli",
    },
  },
  modelConfig: { format: "json", relativePaths: ["openclaw.json"] },
  capabilities: {
    providerModel: {
      enabled: false,
      status: "partial",
      evidence: "model-config-adapter",
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
