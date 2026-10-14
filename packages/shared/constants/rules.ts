import { getPlatformById } from "./platforms";

function requirePlatform(platformId: string) {
  const platform = getPlatformById(platformId);
  if (!platform) {
    throw new Error(`Missing rule platform metadata for: ${platformId}`);
  }
  return platform;
}

const claudePlatform = requirePlatform("claude");
const copilotPlatform = requirePlatform("copilot");
const codexPlatform = requirePlatform("codex");
const zcodePlatform = requirePlatform("zcode");
const grokPlatform = requirePlatform("grok");
const qwenPlatform = requirePlatform("qwen");
const qwenWorkPlatform = requirePlatform("qwen-work");
const kimiPlatform = requirePlatform("kimi");
const geminiPlatform = requirePlatform("gemini");
const opencodePlatform = requirePlatform("opencode");
const piPlatform = requirePlatform("pi");
const ohMyPiPlatform = requirePlatform("oh-my-pi");
const windsurfPlatform = requirePlatform("windsurf");
const kiroPlatform = requirePlatform("kiro");
const clinePlatform = requirePlatform("cline");
const augmentPlatform = requirePlatform("augment");
const openclawPlatform = requirePlatform("openclaw");
const qclawPlatform = requirePlatform("qclaw");
const hermesPlatform = requirePlatform("hermes");
const codebuddyPlatform = requirePlatform("codebuddy");
const ampPlatform = requirePlatform("amp");
const kiloPlatform = requirePlatform("kilo");
const cursorPlatform = requirePlatform("cursor");

export const RULE_FILE_GROUPS = ["workspace", "assistant", "tooling"] as const;

export const PROJECT_RULE_FILE_TEMPLATES = {
  workspace: {
    platformId: "workspace",
    platformIcon: "FolderRoot",
    relativePath: "AGENTS.md",
    canonicalFileName: "AGENTS.md",
    description: "Project rule file loaded from a user-managed directory.",
  },
  cursor: {
    platformId: "cursor",
    platformIcon: cursorPlatform.icon,
    relativePath: ".cursor/rules/prompthub.mdc",
    canonicalFileName: "prompthub.mdc",
    description:
      "Cursor project rule managed in the project's .cursor/rules directory.",
  },
} as const;

export const RULE_PLATFORM_ORDER = [
  "claude",
  "copilot",
  "codex",
  "zcode",
  "grok",
  "qwen",
  "qwen-work",
  "kimi",
  "gemini",
  "opencode",
  "pi",
  "oh-my-pi",
  "windsurf",
  "kiro",
  "cline",
  "augment",
  "openclaw",
  "qclaw",
  "hermes",
  "codebuddy",
  "amp",
  "kilo",
] as const;

export const KNOWN_RULE_FILE_TEMPLATES = {
  "claude-global": {
    id: "claude-global",
    platformId: "claude",
    platformName: claudePlatform.name,
    platformIcon: claudePlatform.icon,
    platformDescription:
      "Global Claude Code rules stored next to the managed Claude skills directory.",
    name: "CLAUDE.md",
    description:
      "Global Claude rules loaded from the local Claude configuration.",
    group: "assistant",
  },
  "copilot-global": {
    id: "copilot-global",
    platformId: "copilot",
    platformName: copilotPlatform.name,
    platformIcon: copilotPlatform.icon,
    platformDescription:
      "Personal GitHub Copilot CLI instructions stored in the Copilot configuration directory.",
    name: "copilot-instructions.md",
    description:
      "Personal GitHub Copilot CLI instructions loaded for every session.",
    group: "assistant",
  },
  "codex-global": {
    id: "codex-global",
    platformId: "codex",
    platformName: codexPlatform.name,
    platformIcon: codexPlatform.icon,
    platformDescription:
      "Global Codex instructions stored next to the managed Codex settings directory.",
    name: "AGENTS.md",
    description:
      "Global Codex instructions loaded from the local Codex configuration.",
    group: "assistant",
  },
  "zcode-global": {
    id: "zcode-global",
    platformId: "zcode",
    platformName: zcodePlatform.name,
    platformIcon: zcodePlatform.icon,
    platformDescription:
      "Global ZCode Agent instructions stored next to the managed ZCode skills directory.",
    name: "AGENTS.md",
    description:
      "Global ZCode Agent instructions loaded from the local ZCode configuration.",
    group: "assistant",
  },
  "grok-global": {
    id: "grok-global",
    platformId: "grok",
    platformName: grokPlatform.name,
    platformIcon: grokPlatform.icon,
    platformDescription:
      "Global Grok Build instructions stored in the local Grok configuration directory.",
    name: "AGENTS.md",
    description: "Global Grok Build instructions loaded for every project.",
    group: "assistant",
  },
  "qwen-global": {
    id: "qwen-global",
    platformId: "qwen",
    platformName: qwenPlatform.name,
    platformIcon: qwenPlatform.icon,
    platformDescription:
      "Global Qwen Code instructions stored in the Qwen user configuration directory.",
    name: "QWEN.md",
    description: "Global Qwen Code instructions loaded for every project.",
    group: "assistant",
  },
  "qwen-work-global": {
    id: "qwen-work-global",
    platformId: "qwen-work",
    platformName: qwenWorkPlatform.name,
    platformIcon: qwenWorkPlatform.icon,
    platformDescription:
      "Qwen Work CN work manual in the awareness directory; other memory files remain unmanaged.",
    name: "AGENTS.md",
    description:
      "Work manual applied when awareness mode is enabled in Qwen Work CN.",
    group: "assistant",
  },
  "kimi-global": {
    id: "kimi-global",
    platformId: "kimi",
    platformName: kimiPlatform.name,
    platformIcon: kimiPlatform.icon,
    platformDescription:
      "Global Kimi Code instructions stored in the local Kimi Code configuration directory.",
    name: "AGENTS.md",
    description:
      "Global Kimi Code instructions loaded from the local Kimi Code configuration.",
    group: "assistant",
  },
  "gemini-global": {
    id: "gemini-global",
    platformId: "gemini",
    platformName: geminiPlatform.name,
    platformIcon: geminiPlatform.icon,
    platformDescription:
      "Global Gemini CLI context stored next to the managed Gemini settings directory.",
    name: "GEMINI.md",
    description:
      "Global Gemini CLI context loaded from the local Gemini configuration.",
    group: "assistant",
  },
  "opencode-global": {
    id: "opencode-global",
    platformId: "opencode",
    platformName: opencodePlatform.name,
    platformIcon: opencodePlatform.icon,
    platformDescription:
      "Global OpenCode rules stored next to the managed OpenCode skills directory.",
    name: "AGENTS.md",
    description:
      "Global OpenCode rules loaded from the local OpenCode configuration.",
    group: "tooling",
  },
  "oh-my-pi-global": {
    id: "oh-my-pi-global",
    platformId: "oh-my-pi",
    platformName: ohMyPiPlatform.name,
    platformIcon: ohMyPiPlatform.icon,
    platformDescription:
      "Global Oh My Pi rules stored in the local Oh My Pi agent directory.",
    name: "RULES.md",
    description: "Global Oh My Pi rules loaded for every project.",
    group: "assistant",
  },
  "pi-global": {
    id: "pi-global",
    platformId: "pi",
    platformName: piPlatform.name,
    platformIcon: piPlatform.icon,
    platformDescription:
      "Global Pi instructions stored in the local Pi agent directory.",
    name: "AGENTS.md",
    description: "Global Pi instructions loaded for every project.",
    group: "assistant",
  },
  "windsurf-global": {
    id: "windsurf-global",
    platformId: "windsurf",
    platformName: windsurfPlatform.name,
    platformIcon: windsurfPlatform.icon,
    platformDescription:
      "Global Windsurf rules stored in the local Cascade memories directory.",
    name: "global_rules.md",
    description:
      "Global Windsurf rules loaded from the local Windsurf configuration.",
    group: "tooling",
  },
  "kiro-global": {
    id: "kiro-global",
    platformId: "kiro",
    platformName: kiroPlatform.name,
    platformIcon: kiroPlatform.icon,
    platformDescription:
      "Global Kiro AGENTS.md entry stored in the user steering directory.",
    name: "AGENTS.md",
    description:
      "Global Kiro instructions loaded from the user steering directory. Other steering files remain Kiro-managed.",
    group: "assistant",
  },
  "cline-global": {
    id: "cline-global",
    platformId: "cline",
    platformName: clinePlatform.name,
    platformIcon: clinePlatform.icon,
    platformDescription:
      "Global Cline AGENTS.md entry stored in the CLI rules directory.",
    name: "AGENTS.md",
    description:
      "Global Cline instructions loaded from the CLI rules directory. Other rule files remain Cline-managed.",
    group: "tooling",
  },
  "augment-global": {
    id: "augment-global",
    platformId: "augment",
    platformName: augmentPlatform.name,
    platformIcon: augmentPlatform.icon,
    platformDescription:
      "Global Augment user guidelines stored in the documented local guidelines file.",
    name: "user-guidelines.md",
    description:
      "Global Augment user guidelines applied to Agent and Chat sessions.",
    group: "tooling",
  },
  "openclaw-global": {
    id: "openclaw-global",
    platformId: "openclaw",
    platformName: openclawPlatform.name,
    platformIcon: openclawPlatform.icon,
    platformDescription:
      "OpenClaw workspace persona and tone file injected into every session.",
    name: "SOUL.md",
    description:
      "Global OpenClaw persona rules loaded from the local workspace bootstrap directory.",
    group: "assistant",
  },
  "qclaw-global": {
    id: "qclaw-global",
    platformId: "qclaw",
    platformName: qclawPlatform.name,
    platformIcon: qclawPlatform.icon,
    platformDescription:
      "QClaw compatibility persona rules stored in its OpenClaw-style workspace directory.",
    name: "SOUL.md",
    description:
      "QClaw compatibility persona rules loaded from the local workspace bootstrap directory.",
    group: "assistant",
  },
  "hermes-global": {
    id: "hermes-global",
    platformId: "hermes",
    platformName: hermesPlatform.name,
    platformIcon: hermesPlatform.icon,
    platformDescription:
      "Global Hermes Agent instructions stored in the local Hermes configuration directory.",
    name: "AGENTS.md",
    description:
      "Global Hermes Agent rules loaded from the local Hermes configuration.",
    group: "assistant",
  },
  "codebuddy-global": {
    id: "codebuddy-global",
    platformId: "codebuddy",
    platformName: codebuddyPlatform.name,
    platformIcon: codebuddyPlatform.icon,
    platformDescription:
      "Global CodeBuddy instructions stored in the local CodeBuddy configuration directory.",
    name: "CODEBUDDY.md",
    description:
      "Global CodeBuddy instructions loaded from the local CodeBuddy configuration.",
    group: "assistant",
  },
  "amp-global": {
    id: "amp-global",
    platformId: "amp",
    platformName: ampPlatform.name,
    platformIcon: ampPlatform.icon,
    platformDescription:
      "Global Amp instructions stored in the local Amp configuration directory (~/.config/amp/).",
    name: "AGENTS.md",
    description:
      "Global Amp rules loaded from the local Amp configuration. Amp also checks $HOME/.config/AGENTS.md as a fallback.",
    group: "tooling",
  },
  "kilo-global": {
    id: "kilo-global",
    platformId: "kilo",
    platformName: kiloPlatform.name,
    platformIcon: kiloPlatform.icon,
    platformDescription:
      "Global Kilo Code rules stored in the local Kilo Code rules directory.",
    name: "global.md",
    description:
      "Global Kilo Code rules loaded from the local Kilo Code configuration. Kilo Code reads all .md files in ~/.kilo/rules/.",
    group: "tooling",
  },
} as const;
