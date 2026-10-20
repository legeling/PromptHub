import type { AgentPlatformDefinition } from "@prompthub/shared/types/agent-platform";

export const codexAgentDefinition = {
  platform: {
    id: "codex",
    name: "Codex",
    rootEnvironmentVariable: "CODEX_HOME",
    icon: "Terminal",
    rootDir: {
      darwin: "~/.codex",
      win32: "%USERPROFILE%\\.codex",
      linux: "~/.codex",
    },
    skillsRelativePath: "skills",
    mcpRelativePath: "config.toml",
    pluginsRelativePath: "plugins/cache/prompthub",
    globalRuleFile: "AGENTS.md",
    configFiles: ["config.toml"],
    launchPaths: {
      darwin: ["/Applications/Codex.app", "~/Applications/Codex.app"],
    },
    cli: {
      executableCandidates: ["codex"],
      bundledExecutablePaths: {
        darwin: [
          "/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex",
          "~/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex",
          "/Applications/Codex.app/Contents/Resources/codex",
          "~/Applications/Codex.app/Contents/Resources/codex",
        ],
      },
      windowsAppPackage: {
        name: "OpenAI.Codex",
        executableRelativePath: "app/resources/codex.exe",
      },
      vscodeExtensionRuntime: {
        id: "openai.chatgpt",
        extensionsRelativePath: ".vscode/extensions",
        executablePaths: {
          darwin: {
            arm64: "bin/macos-aarch64/codex",
            x64: "bin/macos-x86_64/codex",
          },
          win32: {
            arm64: "bin/windows-aarch64/codex.exe",
            x64: "bin/windows-x86_64/codex.exe",
          },
          linux: {
            arm64: "bin/linux-aarch64/codex",
            x64: "bin/linux-x86_64/codex",
          },
        },
      },
      versionArgs: ["--version"],
      evidence: "official-codex-cli",
      update: {
        args: ["install", "-g", "@openai/codex@latest"],
        command: {
          executableCandidates: ["npm"],
          supportedInstallSources: ["npm", "node-version-manager"],
        },
        rollbackArgsPrefix: ["install", "-g"],
        rollbackTargetPrefix: "@openai/codex@",
        evidence: "official-codex-npm-install",
      },
    },
  },
  modelConfig: { format: "toml", relativePaths: ["config.toml"] },
  capabilities: {
    providerModel: {
      enabled: true,
      status: "supported",
      evidence: "verified-provider-adapter",
    },
    sessions: {
      enabled: true,
      status: "supported",
      evidence: "verified-session-adapter",
    },
    usage: {
      enabled: true,
      status: "supported",
      evidence: "verified-usage-adapter",
    },
    appearance: {
      enabled: true,
      status: "supported",
      evidence: "verified-appearance-adapter",
    },
  },
} satisfies AgentPlatformDefinition;
