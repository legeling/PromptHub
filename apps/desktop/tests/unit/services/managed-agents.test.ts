import { describe, expect, it } from "vitest";
import {
  SKILL_PLATFORMS,
  type SkillPlatform,
} from "@prompthub/shared/constants/platforms";

import {
  buildManagedAgents,
  filterManagedAgents,
} from "../../../src/renderer/services/managed-agents";

function platform(
  id: string,
  name: string,
  options: Partial<SkillPlatform> = {},
): SkillPlatform {
  return {
    id,
    name,
    icon: "Bot",
    rootDir: {
      darwin: `~/.${id}`,
      win32: `%USERPROFILE%\\.${id}`,
      linux: `~/.${id}`,
    },
    skillsRelativePath: "skills",
    ...options,
  };
}

describe("managed Agent projection", () => {
  it("uses Codex by default and applies independent ChatGPT name and icon preferences", () => {
    const [defaultIdentity] = buildManagedAgents({
      platforms: [platform("codex", "Codex CLI")],
      detectedPlatformIds: ["codex"],
      pinnedPlatformIds: [],
      builtinOverrides: {},
      agentIdentityPreferences: {},
      osKey: "darwin",
    });
    const [preferredIdentity] = buildManagedAgents({
      platforms: [platform("codex", "Codex CLI")],
      detectedPlatformIds: ["codex"],
      pinnedPlatformIds: [],
      builtinOverrides: {},
      agentIdentityPreferences: {
        codex: { name: "chatgpt", icon: "codex" },
      },
      osKey: "darwin",
    });

    expect(defaultIdentity).toMatchObject({
      id: "codex",
      name: "Codex",
      displayIconId: "codex",
    });
    expect(preferredIdentity).toMatchObject({
      id: "codex",
      name: "ChatGPT",
      displayIconId: "codex",
    });
  });

  it("keeps every platform and prioritizes pinned, detected, configured, then common Agents", () => {
    const agents = buildManagedAgents({
      platforms: [
        platform("hermes", "Hermes"),
        platform("claude", "Claude Code"),
        platform("custom-team", "Team Agent", {
          isCustom: true,
          isConfigured: true,
        }),
        platform("gemini", "Gemini CLI"),
        platform("codex", "Codex CLI", { isConfigured: true }),
      ],
      detectedPlatformIds: ["gemini"],
      pinnedPlatformIds: ["hermes"],
      builtinOverrides: {},
      osKey: "darwin",
    });

    expect(agents.map((agent) => agent.id)).toEqual([
      "hermes",
      "codex",
      "gemini",
      "custom-team",
      "claude",
    ]);
    expect(agents).toHaveLength(5);
    expect(agents.find((agent) => agent.id === "hermes")?.isDetected).toBe(
      false,
    );
  });

  it("excludes built-in Agents disabled by the user", () => {
    const agents = buildManagedAgents({
      platforms: [
        platform("claude", "Claude Code"),
        platform("codex", "Codex"),
        platform("cursor", "Cursor"),
      ],
      detectedPlatformIds: ["claude", "codex", "cursor"],
      pinnedPlatformIds: ["codex"],
      disabledPlatformIds: ["codex", "cursor"],
      builtinOverrides: {},
      osKey: "darwin",
    });

    expect(agents.map((agent) => agent.id)).toEqual(["claude"]);
  });

  it("prioritizes Antigravity while retaining Gemini as enterprise compatibility", () => {
    const agents = buildManagedAgents({
      platforms: [
        platform("cursor", "Cursor"),
        platform("antigravity", "Antigravity", {
          lifecycle: "current",
        }),
        platform("gemini", "Gemini", {
          lifecycle: "enterprise-legacy",
          replacementPlatformId: "antigravity",
        }),
      ],
      detectedPlatformIds: [],
      pinnedPlatformIds: [],
      builtinOverrides: {},
      osKey: "darwin",
    });

    expect(agents.map((agent) => agent.id)).toEqual([
      "antigravity",
      "gemini",
      "cursor",
    ]);
    expect(agents.find((agent) => agent.id === "antigravity")).toMatchObject({
      name: "Antigravity",
      lifecycle: "current",
    });
    expect(agents.find((agent) => agent.id === "gemini")).toMatchObject({
      name: "Gemini",
      lifecycle: "enterprise-legacy",
      replacementPlatformId: "antigravity",
    });
  });

  it("derives overridden paths and independent capability states without claiming unsupported adapters", () => {
    const [agent] = buildManagedAgents({
      platforms: [
        platform("claude", "Claude Code", {
          mcpRelativePath: "../.claude.json",
          pluginsRelativePath: "plugins",
          globalRuleFile: "CLAUDE.md",
          configFiles: ["settings.json"],
          cli: {
            executableCandidates: ["claude"],
            versionArgs: ["--version"],
            evidence: "official-claude-cli",
          },
        }),
      ],
      detectedPlatformIds: ["claude"],
      pinnedPlatformIds: [],
      builtinOverrides: {
        claude: {
          rootPath: "~/agents/claude",
          mcpRelativePath: "config/mcp.json",
        },
      },
      osKey: "darwin",
    });

    expect(agent.paths).toMatchObject({
      root: "~/agents/claude",
      skills: "~/agents/claude/skills",
      mcp: "~/agents/claude/config/mcp.json",
      plugins: "~/agents/claude/plugins",
      rules: "~/agents/claude/CLAUDE.md",
      configFiles: ["~/agents/claude/settings.json"],
      configFileRelativePaths: ["settings.json"],
    });
    expect(agent.capabilities.overview.status).toBe("supported");
    expect(agent.capabilities.assets.status).toBe("partial");
    expect(agent.capabilities.maintenance).toEqual({
      status: "partial",
      reason: "cli-diagnostics-read-only",
    });
    expect(agent.capabilities.provider).toEqual({ status: "supported" });
    expect(agent.capabilities.configFiles.status).toBe("partial");
    expect(agent.capabilities.sessions.status).toBe("supported");
    expect(agent.capabilities.usage.status).toBe("supported");
  });

  it("does not advertise CLI maintenance for platforms without a verified descriptor", () => {
    const [agent] = buildManagedAgents({
      platforms: [platform("cursor", "Cursor")],
      detectedPlatformIds: ["cursor"],
      pinnedPlatformIds: [],
      builtinOverrides: {},
      osKey: "darwin",
    });

    expect(agent.capabilities.maintenance).toEqual({
      status: "planned",
      reason: "lifecycle-adapter-pending",
    });
  });

  it("marks the usage adapter supported for quota-capable agents and unsupported elsewhere", () => {
    const agents = buildManagedAgents({
      platforms: [
        platform("claude", "Claude Code"),
        platform("codex", "Codex CLI"),
        platform("kimi", "Kimi Code"),
        platform("antigravity", "Antigravity"),
        platform("gemini", "Gemini CLI"),
        platform("copilot", "GitHub Copilot"),
        platform("cursor", "Cursor"),
      ],
      detectedPlatformIds: [
        "claude",
        "codex",
        "kimi",
        "antigravity",
        "gemini",
        "copilot",
        "cursor",
      ],
      pinnedPlatformIds: [],
      builtinOverrides: {},
      osKey: "darwin",
    });

    for (const id of ["claude", "codex", "kimi", "antigravity"]) {
      expect(
        agents.find((agent) => agent.id === id)?.capabilities.usage,
        `${id} usage capability`,
      ).toEqual({ status: "supported" });
    }
    expect(
      agents.find((agent) => agent.id === "cursor")?.capabilities.usage,
    ).toEqual({ status: "unsupported", reason: "adapter-pending" });
  });

  it("enables history only for Agents with verified session adapters", () => {
    const agents = buildManagedAgents({
      platforms: [
        platform("claude", "Claude Code"),
        platform("codex", "Codex"),
        platform("gemini", "Gemini"),
        platform("kimi", "Kimi Code"),
        platform("opencode", "OpenCode"),
        platform("grok", "Grok Build"),
        platform("copilot", "GitHub Copilot"),
        platform("cline", "Cline"),
        platform("openclaw", "OpenClaw"),
        platform("qwen", "Qwen Code"),
        platform("antigravity", "Antigravity"),
        platform("cursor", "Cursor"),
      ],
      detectedPlatformIds: [],
      pinnedPlatformIds: [],
      builtinOverrides: {},
      osKey: "darwin",
    });

    for (const id of [
      "claude",
      "codex",
      "gemini",
      "kimi",
      "opencode",
      "grok",
      "openclaw",
      "qwen",
    ]) {
      expect(
        agents.find((agent) => agent.id === id)?.capabilities.sessions,
        `${id} sessions capability`,
      ).toEqual({ status: "supported" });
    }
    expect(
      agents.find((agent) => agent.id === "copilot")?.capabilities.sessions,
    ).toEqual({
      status: "partial",
      reason: "verified-readonly-session-store",
    });
    expect(
      agents.find((agent) => agent.id === "cline")?.capabilities.sessions,
    ).toEqual({
      status: "partial",
      reason: "verified-readonly-session-snapshots",
    });
    expect(
      agents.find((agent) => agent.id === "cursor")?.capabilities.sessions,
    ).toEqual({
      status: "partial",
      reason: "verified-readonly-agent-transcripts",
    });
    expect(
      agents.find((agent) => agent.id === "antigravity")?.capabilities.sessions,
    ).toEqual({
      status: "partial",
      reason: "verified-antigravity-cli-transcripts",
    });
  });

  it("enables user-root config discovery with declared paths as preferences", () => {
    const [supported, unsupported] = buildManagedAgents({
      platforms: [
        platform("codex", "Codex CLI", {
          configFiles: ["config.toml"],
        }),
        platform("cursor", "Cursor"),
      ],
      detectedPlatformIds: ["codex", "cursor"],
      pinnedPlatformIds: [],
      builtinOverrides: {},
      osKey: "darwin",
    });

    expect(supported.paths.configFileRelativePaths).toEqual(["config.toml"]);
    expect(supported.paths.configFiles).toEqual(["~/.codex/config.toml"]);
    expect(supported.capabilities.configFiles).toEqual({
      status: "partial",
      reason: "direct-file-editing",
    });
    expect(supported.capabilities.appearance).toEqual({
      status: "supported",
    });
    expect(unsupported.paths.configFileRelativePaths).toEqual([]);
    expect(unsupported.capabilities.configFiles).toEqual({
      status: "partial",
      reason: "direct-file-editing",
    });
    expect(unsupported.capabilities.appearance).toEqual({
      status: "unsupported",
      reason: "appearance-adapter-unavailable",
    });
  });

  it("uses the main-process resolved root before the static platform template", () => {
    const [agent] = buildManagedAgents({
      platforms: [
        platform("kimi", "Kimi Code", {
          resolvedRootPath: "/Users/test/.kimi-code",
        }),
      ],
      detectedPlatformIds: ["kimi"],
      pinnedPlatformIds: [],
      builtinOverrides: {},
      osKey: "darwin",
    });

    expect(agent.paths.root).toBe("/Users/test/.kimi-code");
    expect(agent.paths.skills).toBe("/Users/test/.kimi-code/skills");
  });

  it("enables verified model and session adapters independently by platform", () => {
    const agents = buildManagedAgents({
      platforms: [
        platform("gemini", "Gemini CLI", { configFiles: ["settings.json"] }),
        platform("kimi", "Kimi Code", { configFiles: ["config.toml"] }),
        platform("openclaw", "OpenClaw", { configFiles: ["openclaw.json"] }),
        platform("cursor", "Cursor"),
      ],
      detectedPlatformIds: ["gemini", "openclaw", "cursor"],
      pinnedPlatformIds: [],
      builtinOverrides: {},
      osKey: "darwin",
    });

    expect(
      agents.find((agent) => agent.id === "gemini")?.capabilities.sessions,
    ).toEqual({ status: "supported" });
    expect(
      agents.find((agent) => agent.id === "kimi")?.capabilities,
    ).toMatchObject({
      provider: { status: "unsupported" },
      sessions: { status: "supported" },
    });
    expect(
      agents.find((agent) => agent.id === "openclaw")?.capabilities.sessions,
    ).toEqual({ status: "supported" });
    expect(
      agents.find((agent) => agent.id === "cursor")?.capabilities.provider,
    ).toEqual({ status: "unsupported", reason: "adapter-pending" });
  });

  it("projects Qwen Code model and session support without claiming quota support", () => {
    const [agent] = buildManagedAgents({
      platforms: [
        platform("qwen", "Qwen Code", {
          mcpRelativePath: "settings.json",
          pluginsRelativePath: "extensions",
          globalRuleFile: "QWEN.md",
          resolvedRootPath: "/Users/test/.qwen-custom",
        }),
      ],
      detectedPlatformIds: ["qwen"],
      pinnedPlatformIds: [],
      builtinOverrides: {},
      osKey: "darwin",
    });

    expect(agent.paths).toMatchObject({
      root: "/Users/test/.qwen-custom",
      skills: "/Users/test/.qwen-custom/skills",
      mcp: "/Users/test/.qwen-custom/settings.json",
      plugins: "/Users/test/.qwen-custom/extensions",
      rules: "/Users/test/.qwen-custom/QWEN.md",
    });
    expect(agent.capabilities).toMatchObject({
      provider: { status: "unsupported" },
      sessions: { status: "supported" },
      usage: { status: "unsupported", reason: "adapter-pending" },
    });
  });

  it("projects only verified Cursor user asset paths", () => {
    const cursor = SKILL_PLATFORMS.find(
      (platformEntry) => platformEntry.id === "cursor",
    );
    expect(cursor).toMatchObject({
      rootDir: {
        darwin: "~/.cursor",
        linux: "~/.cursor",
        win32: "%USERPROFILE%\\.cursor",
      },
      skillsRelativePath: "skills",
      agentsRelativePath: "agents",
      mcpRelativePath: "mcp.json",
      pluginsRelativePath: "plugins",
    });
    expect(cursor).not.toHaveProperty("globalRuleFile");
    expect(cursor).not.toHaveProperty("configFiles");

    const [agent] = buildManagedAgents({
      platforms: [cursor!],
      detectedPlatformIds: ["cursor"],
      pinnedPlatformIds: [],
      builtinOverrides: {},
      osKey: "darwin",
    });

    expect(agent.paths).toMatchObject({
      root: "~/.cursor",
      skills: "~/.cursor/skills",
      mcp: "~/.cursor/mcp.json",
      plugins: "~/.cursor/plugins",
      configFiles: [],
      configFileRelativePaths: [],
    });
    expect(agent.paths.rules).toBeUndefined();
    expect(agent.capabilities).toMatchObject({
      provider: { status: "unsupported", reason: "adapter-pending" },
      sessions: {
        status: "partial",
        reason: "verified-readonly-agent-transcripts",
      },
      usage: { status: "unsupported", reason: "adapter-pending" },
    });
  });

  it("projects only the current Cherry Studio Skill and launch surfaces", () => {
    const cherryStudio = SKILL_PLATFORMS.find(
      (platformEntry) => platformEntry.id === "cherry-studio",
    );
    expect(cherryStudio).toMatchObject({
      rootDir: {
        darwin: "~/Library/Application Support/CherryStudio",
        linux: "~/.config/CherryStudio",
        win32: "%APPDATA%\\CherryStudio",
      },
      skillsRelativePath: "Data/Skills",
      launchPaths: {
        darwin: [
          "/Applications/Cherry Studio.app",
          "~/Applications/Cherry Studio.app",
        ],
      },
    });
    expect(cherryStudio).not.toHaveProperty("agentsRelativePath");
    expect(cherryStudio).not.toHaveProperty("mcpRelativePath");
    expect(cherryStudio).not.toHaveProperty("pluginsRelativePath");
    expect(cherryStudio).not.toHaveProperty("globalRuleFile");
    expect(cherryStudio).not.toHaveProperty("configFiles");

    const [agent] = buildManagedAgents({
      platforms: [cherryStudio!],
      detectedPlatformIds: ["cherry-studio"],
      pinnedPlatformIds: [],
      builtinOverrides: {},
      osKey: "darwin",
    });

    expect(agent.paths).toMatchObject({
      root: "~/Library/Application Support/CherryStudio",
      skills: "~/Library/Application Support/CherryStudio/Data/Skills",
      configFiles: [],
      configFileRelativePaths: [],
    });
    expect(agent.paths.mcp).toBeUndefined();
    expect(agent.paths.plugins).toBeUndefined();
    expect(agent.paths.rules).toBeUndefined();
    expect(agent.launchable).toBe(true);
  });

  it("projects only verified Windsurf global assets and partial transcript history", () => {
    const windsurf = SKILL_PLATFORMS.find(
      (platformEntry) => platformEntry.id === "windsurf",
    );
    expect(windsurf).toMatchObject({
      rootDir: {
        darwin: "~/.codeium/windsurf",
        linux: "~/.codeium/windsurf",
        win32: "%USERPROFILE%\\.codeium\\windsurf",
      },
      skillsRelativePath: "skills",
      mcpRelativePath: "mcp_config.json",
      globalRuleFile: "memories/global_rules.md",
      launchPaths: {
        darwin: ["/Applications/Windsurf.app", "~/Applications/Windsurf.app"],
      },
    });
    expect(windsurf).not.toHaveProperty("agentsRelativePath");
    expect(windsurf).not.toHaveProperty("pluginsRelativePath");
    expect(windsurf).not.toHaveProperty("configFiles");

    const [agent] = buildManagedAgents({
      platforms: [windsurf!],
      detectedPlatformIds: ["windsurf"],
      pinnedPlatformIds: [],
      builtinOverrides: {},
      osKey: "darwin",
    });

    expect(agent.paths).toMatchObject({
      root: "~/.codeium/windsurf",
      skills: "~/.codeium/windsurf/skills",
      mcp: "~/.codeium/windsurf/mcp_config.json",
      rules: "~/.codeium/windsurf/memories/global_rules.md",
      configFiles: [],
      configFileRelativePaths: [],
    });
    expect(agent.paths.plugins).toBeUndefined();
    expect(agent.capabilities).toMatchObject({
      provider: { status: "unsupported", reason: "adapter-pending" },
      sessions: {
        status: "partial",
        reason: "verified-transcript-hook-adapter",
      },
      usage: { status: "unsupported", reason: "adapter-pending" },
      configFiles: {
        status: "partial",
        reason: "direct-file-editing",
      },
    });
    expect(agent.launchable).toBe(true);
  });

  it("projects Oh My Pi paths with model routing and read-only session support", () => {
    const [agent] = buildManagedAgents({
      platforms: [
        platform("oh-my-pi", "Oh My Pi", {
          rootEnvironmentVariable: "PI_CODING_AGENT_DIR",
          mcpRelativePath: "mcp.json",
          pluginsRelativePath: "../plugins",
          globalRuleFile: "RULES.md",
          configFiles: [
            "config.yml",
            "config.yaml",
            "settings.json",
            "mcp.json",
            "RULES.md",
          ],
          resolvedRootPath: "/Users/test/.omp/agent",
        }),
      ],
      detectedPlatformIds: ["oh-my-pi"],
      pinnedPlatformIds: [],
      builtinOverrides: {},
      osKey: "darwin",
    });

    expect(agent.paths).toMatchObject({
      root: "/Users/test/.omp/agent",
      skills: "/Users/test/.omp/agent/skills",
      mcp: "/Users/test/.omp/agent/mcp.json",
      plugins: "/Users/test/.omp/plugins",
      rules: "/Users/test/.omp/agent/RULES.md",
      configFileRelativePaths: [
        "config.yml",
        "config.yaml",
        "settings.json",
        "mcp.json",
        "RULES.md",
      ],
    });
    expect(agent.capabilities).toMatchObject({
      provider: { status: "unsupported", reason: "adapter-pending" },
      sessions: { status: "supported" },
      usage: { status: "unsupported", reason: "adapter-pending" },
    });
  });

  it("projects Kiro current assets with model-only and read-only session support", () => {
    const kiro = SKILL_PLATFORMS.find(
      (platformEntry) => platformEntry.id === "kiro",
    );
    expect(kiro).toMatchObject({
      rootEnvironmentVariable: "KIRO_HOME",
      skillsRelativePath: "skills",
      agentsRelativePath: "agents",
      mcpRelativePath: "settings/mcp.json",
      pluginsRelativePath: "powers",
      globalRuleFile: "steering/AGENTS.md",
      configFiles: ["settings/cli.json"],
      launchPaths: {
        darwin: ["/Applications/Kiro.app", "~/Applications/Kiro.app"],
      },
    });
    const [agent] = buildManagedAgents({
      platforms: [kiro!],
      detectedPlatformIds: ["kiro"],
      pinnedPlatformIds: [],
      builtinOverrides: {},
      osKey: "darwin",
    });
    expect(agent.paths).toMatchObject({
      root: "~/.kiro",
      skills: "~/.kiro/skills",
      mcp: "~/.kiro/settings/mcp.json",
      plugins: "~/.kiro/powers",
      rules: "~/.kiro/steering/AGENTS.md",
      configFileRelativePaths: ["settings/cli.json"],
    });
    expect(agent.capabilities).toMatchObject({
      provider: { status: "unsupported", reason: "adapter-pending" },
      sessions: {
        status: "partial",
        reason: "verified-local-session-adapter",
      },
      usage: { status: "unsupported", reason: "adapter-pending" },
      configFiles: { status: "partial" },
    });
    expect(agent.launchable).toBe(true);
  });

  it("normalizes parent segments in displayed Agent asset paths", () => {
    const [agent] = buildManagedAgents({
      platforms: [
        platform("claude", "Claude Code", {
          mcpRelativePath: "../.claude.json",
        }),
      ],
      detectedPlatformIds: ["claude"],
      pinnedPlatformIds: [],
      builtinOverrides: {},
      osKey: "darwin",
    });

    expect(agent.paths.mcp).toBe("~/.claude.json");
  });

  it("filters the complete projection by status and searchable path metadata", () => {
    const agents = buildManagedAgents({
      platforms: [
        platform("claude", "Claude Code"),
        platform("custom-team", "Team Agent", {
          isCustom: true,
          isConfigured: true,
          rootDir: {
            darwin: "~/work/team-agent",
            win32: "%USERPROFILE%\\work\\team-agent",
            linux: "~/work/team-agent",
          },
        }),
      ],
      detectedPlatformIds: ["claude"],
      pinnedPlatformIds: [],
      builtinOverrides: {},
      osKey: "darwin",
    });

    expect(filterManagedAgents(agents, "work/team", "all")).toHaveLength(1);
    expect(filterManagedAgents(agents, "", "installed")).toHaveLength(1);
    expect(filterManagedAgents(agents, "", "configured")).toHaveLength(1);
    expect(filterManagedAgents(agents, "", "custom")).toHaveLength(1);
    expect(filterManagedAgents(agents, "", "not-detected")).toHaveLength(1);
  });

  it("finds enterprise compatibility targets by lifecycle metadata", () => {
    const agents = buildManagedAgents({
      platforms: [
        platform("gemini", "Gemini CLI", {
          lifecycle: "enterprise-legacy",
          replacementPlatformId: "antigravity",
        }),
        platform("claude", "Claude Code"),
      ],
      detectedPlatformIds: [],
      pinnedPlatformIds: [],
      builtinOverrides: {},
      osKey: "darwin",
    });

    expect(filterManagedAgents(agents, "enterprise", "all")).toHaveLength(1);
    expect(filterManagedAgents(agents, "antigravity", "all")[0]?.id).toBe(
      "gemini",
    );
  });
});
