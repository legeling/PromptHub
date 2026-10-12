import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_SKILL_PLATFORM_ORDER,
  getPlatformById,
  SKILL_PLATFORMS,
} from "@prompthub/shared/constants/platforms";
import {
  buildAgentRootAssetPreview,
  getEffectiveBuiltinAgentConfig,
} from "../../../src/renderer/services/agent-root-paths";

describe("agent root paths", () => {
  it("keeps the renderer facade scoped to the browser-safe root config module", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/renderer/services/agent-root-paths.ts",
      ),
      "utf8",
    );

    expect(source).toContain(
      'from "@prompthub/core/agent-management/agent-root-config"',
    );
    expect(source).not.toContain('from "@prompthub/core/agent-management"');
  });

  it("keeps Hermes Agent Windows Native rooted under local app data", () => {
    const platform = getPlatformById("hermes");
    expect(platform).toBeDefined();

    expect(platform!.rootDir.win32).toBe("%LOCALAPPDATA%\\hermes");
  });

  it("uses the official Kilo Code MCP config outside the .kilo asset root", () => {
    const platform = getPlatformById("kilo");
    expect(platform).toBeDefined();

    const config = getEffectiveBuiltinAgentConfig(
      platform!,
      "~/.kilo",
      undefined,
    );
    if (typeof config.rootPath !== "string")
      throw new Error("Missing built-in Agent root path");

    expect(config.mcpRelativePath).toBe("../.config/kilo/kilo.json");
    expect(
      buildAgentRootAssetPreview({ ...config, rootPath: config.rootPath })
        .mcpConfigPaths,
    ).toEqual(["~/.config/kilo/kilo.json"]);
  });

  it("uses Cline's settings data directory for MCP config", () => {
    const platform = getPlatformById("cline");
    expect(platform).toBeDefined();

    const config = getEffectiveBuiltinAgentConfig(
      platform!,
      "~/.cline",
      undefined,
    );
    if (typeof config.rootPath !== "string")
      throw new Error("Missing built-in Agent root path");

    expect(config.mcpRelativePath).toBe(
      "data/settings/cline_mcp_settings.json",
    );
    expect(
      buildAgentRootAssetPreview({ ...config, rootPath: config.rootPath })
        .mcpConfigPaths,
    ).toEqual(["~/.cline/data/settings/cline_mcp_settings.json"]);
  });

  it("does not invent MCP config paths for built-in agents without confirmed support", () => {
    const platform = getPlatformById("trae-work");
    expect(platform).toBeDefined();

    const config = getEffectiveBuiltinAgentConfig(
      platform!,
      "~/.trae-work",
      undefined,
    );
    if (typeof config.rootPath !== "string")
      throw new Error("Missing built-in Agent root path");

    expect(config.mcpRelativePath).toBeUndefined();
    expect(
      buildAgentRootAssetPreview({ ...config, rootPath: config.rootPath })
        .mcpConfigPaths,
    ).toEqual([]);
  });

  it("uses Tencent WorkBuddy's documented user MCP config path", () => {
    const platform = getPlatformById("workbuddy");
    expect(platform).toBeDefined();

    const config = getEffectiveBuiltinAgentConfig(
      platform!,
      "~/.workbuddy",
      undefined,
    );
    if (typeof config.rootPath !== "string")
      throw new Error("Missing built-in Agent root path");

    expect(config.skillsRelativePath).toBe("skills");
    expect(config.mcpRelativePath).toBe("mcp.json");
    expect(config.agentsRelativePath).toBeUndefined();
    expect(config.commandsRelativePath).toBeUndefined();
    expect(
      buildAgentRootAssetPreview({ ...config, rootPath: config.rootPath }),
    ).toMatchObject({
      mcpConfigPaths: ["~/.workbuddy/mcp.json"],
      agentDirectories: [],
      commandDirectories: [],
    });
  });

  it("resolves ZCode's documented user assets", () => {
    const platform = getPlatformById("zcode");
    expect(platform).toBeDefined();

    const config = getEffectiveBuiltinAgentConfig(
      platform!,
      "~/.zcode",
      undefined,
    );
    if (typeof config.rootPath !== "string")
      throw new Error("Missing built-in Agent root path");

    expect(config.skillsRelativePath).toBe("skills");
    expect(config.rulesRelativePath).toBe("AGENTS.md");
    expect(config.mcpRelativePath).toBe("cli/config.json");
    expect(config.configRelativePaths).toEqual(["cli/config.json"]);
    expect(config.pluginsRelativePath).toBeUndefined();
    expect(
      buildAgentRootAssetPreview({ ...config, rootPath: config.rootPath }),
    ).toMatchObject({
      skillScanPaths: ["~/.zcode/skills"],
      mcpConfigPaths: ["~/.zcode/cli/config.json"],
      ruleCandidates: ["~/.zcode/AGENTS.md"],
      agentDirectories: ["~/.zcode/agents"],
      configCandidates: ["~/.zcode/cli/config.json"],
    });
  });

  it("uses CodeBuddy's documented user assets instead of skills-only defaults", () => {
    const platform = getPlatformById("codebuddy");
    expect(platform).toBeDefined();

    const config = getEffectiveBuiltinAgentConfig(
      platform!,
      "~/.codebuddy",
      undefined,
    );
    if (typeof config.rootPath !== "string")
      throw new Error("Missing built-in Agent root path");

    expect(config.skillsRelativePath).toBe("skills");
    expect(config.rulesRelativePath).toBe("CODEBUDDY.md");
    expect(config.mcpRelativePath).toBe(".mcp.json");
    expect(config.agentsRelativePath).toBe("agents");
    expect(config.commandsRelativePath).toBe("commands");
    expect(config.configRelativePaths).toEqual([
      "settings.json",
      ".mcp.json",
      "CODEBUDDY.md",
    ]);
    expect(
      buildAgentRootAssetPreview({ ...config, rootPath: config.rootPath }),
    ).toMatchObject({
      mcpConfigPaths: ["~/.codebuddy/.mcp.json"],
      agentDirectories: ["~/.codebuddy/agents"],
      commandDirectories: ["~/.codebuddy/commands"],
    });
  });

  it("shows Grok Build's documented user assets without enabling an MCP writer", () => {
    const platform = getPlatformById("grok");
    expect(platform).toBeDefined();
    expect(platform!.rootDir.darwin).toBe("~/.grok");
    expect(platform!.rootDir.win32).toBe("%USERPROFILE%\\.grok");

    const config = getEffectiveBuiltinAgentConfig(
      platform!,
      "~/.grok",
      undefined,
    );
    if (typeof config.rootPath !== "string")
      throw new Error("Missing built-in Agent root path");

    expect(config.skillsRelativePath).toBe("skills");
    expect(config.pluginsRelativePath).toBe("plugins");
    expect(config.rulesRelativePath).toBe("AGENTS.md");
    expect(config.configRelativePaths).toEqual([
      "config.toml",
      "pager.toml",
      "settings.json",
      "lsp.json",
      "sandbox.toml",
    ]);
    expect(config.mcpRelativePath).toBe("config.toml");
    expect(
      buildAgentRootAssetPreview({ ...config, rootPath: config.rootPath }),
    ).toMatchObject({
      mcpConfigPaths: ["~/.grok/config.toml"],
      ruleCandidates: ["~/.grok/AGENTS.md"],
      agentDirectories: ["~/.grok/agents"],
      pluginDirectories: ["~/.grok/plugins"],
      configCandidates: [
        "~/.grok/config.toml",
        "~/.grok/pager.toml",
        "~/.grok/settings.json",
        "~/.grok/lsp.json",
        "~/.grok/sandbox.toml",
      ],
    });
  });

  it("keeps QClaw as an OpenClaw-compatible platform without an unconfirmed MCP path", () => {
    const platform = getPlatformById("qclaw");
    expect(platform).toBeDefined();

    const config = getEffectiveBuiltinAgentConfig(
      platform!,
      "~/.qclaw",
      undefined,
    );
    if (typeof config.rootPath !== "string")
      throw new Error("Missing built-in Agent root path");

    expect(config.skillsRelativePath).toBe("skills");
    expect(config.rulesRelativePath).toBe("workspace/SOUL.md");
    expect(config.mcpRelativePath).toBeUndefined();
    expect(
      buildAgentRootAssetPreview({ ...config, rootPath: config.rootPath })
        .mcpConfigPaths,
    ).toEqual([]);
  });

  it("keeps plugin package directories only on supported built-in targets", () => {
    const claude = getPlatformById("claude");
    const cline = getPlatformById("cline");
    expect(claude).toBeDefined();
    expect(cline).toBeDefined();

    expect(
      getEffectiveBuiltinAgentConfig(claude!, "~/.claude", undefined)
        .pluginsRelativePath,
    ).toBe("plugins/cache/prompthub");
    expect(
      getEffectiveBuiltinAgentConfig(cline!, "~/.cline", undefined)
        .pluginsRelativePath,
    ).toBeUndefined();
  });

  it("recognizes the current Kimi Code user asset contract", () => {
    const platform = getPlatformById("kimi");
    expect(platform).toBeDefined();

    const config = getEffectiveBuiltinAgentConfig(
      platform!,
      "~/.kimi-code",
      undefined,
    );
    if (typeof config.rootPath !== "string")
      throw new Error("Missing built-in Agent root path");

    expect(config.skillsRelativePath).toBe("skills");
    expect(config.mcpRelativePath).toBe("mcp.json");
    expect(config.pluginsRelativePath).toBe("plugins");
    expect(config.configRelativePaths).toEqual([
      "config.toml",
      "tui.toml",
      "mcp.json",
    ]);
    expect(config.rulesRelativePath).toBe("AGENTS.md");
    expect(
      buildAgentRootAssetPreview({ ...config, rootPath: config.rootPath }),
    ).toMatchObject({
      skillScanPaths: ["~/.kimi-code/skills"],
      mcpConfigPaths: ["~/.kimi-code/mcp.json"],
      pluginDirectories: ["~/.kimi-code/plugins"],
      ruleCandidates: ["~/.kimi-code/AGENTS.md"],
      configCandidates: [
        "~/.kimi-code/config.toml",
        "~/.kimi-code/tui.toml",
        "~/.kimi-code/mcp.json",
      ],
    });
  });

  it("keeps Gemini and Antigravity as distinct suffix-free Agent names", () => {
    const gemini = getPlatformById("gemini");
    const antigravity = getPlatformById("antigravity");

    expect(gemini).toMatchObject({
      id: "gemini",
      name: "Gemini",
      lifecycle: "enterprise-legacy",
      replacementPlatformId: "antigravity",
      rootDir: { darwin: "~/.gemini" },
      skillsRelativePath: "skills",
    });
    expect(antigravity).toMatchObject({
      id: "antigravity",
      name: "Antigravity",
      lifecycle: "current",
      rootDir: {
        darwin: "~/.gemini/config",
        win32: "%USERPROFILE%\\.gemini\\config",
        linux: "~/.gemini/config",
      },
      skillsRelativePath: "skills",
      mcpRelativePath: "mcp_config.json",
      pluginsRelativePath: "plugins",
      globalRuleFile: "../GEMINI.md",
    });

    const config = getEffectiveBuiltinAgentConfig(
      antigravity!,
      "~/.gemini/config",
      undefined,
    );
    if (typeof config.rootPath !== "string")
      throw new Error("Missing built-in Agent root path");
    expect(
      buildAgentRootAssetPreview({ ...config, rootPath: config.rootPath }),
    ).toMatchObject({
      skillScanPaths: ["~/.gemini/config/skills"],
      mcpConfigPaths: ["~/.gemini/config/mcp_config.json"],
      pluginDirectories: ["~/.gemini/config/plugins"],
      ruleCandidates: ["~/.gemini/GEMINI.md"],
    });
    expect(SKILL_PLATFORMS.filter(({ id }) => id === "gemini")).toHaveLength(1);
    expect(
      SKILL_PLATFORMS.filter(({ id }) => id === "antigravity"),
    ).toHaveLength(1);
    expect(DEFAULT_SKILL_PLATFORM_ORDER.indexOf("antigravity")).toBeLessThan(
      DEFAULT_SKILL_PLATFORM_ORDER.indexOf("gemini"),
    );
    expect(gemini?.name).not.toMatch(/\sCLI(?:\s|$)/i);
    expect(antigravity?.name).not.toMatch(/\sCLI(?:\s|$)/i);
  });

  it("keeps Reasonix MCP and hook files discovery-only", () => {
    const platform = getPlatformById("reasonix");
    expect(platform).toBeDefined();

    const config = getEffectiveBuiltinAgentConfig(
      platform!,
      "~/.reasonix",
      undefined,
    );
    if (typeof config.rootPath !== "string")
      throw new Error("Missing built-in Agent root path");

    expect(config.skillsRelativePath).toBe("skills");
    expect(config.mcpRelativePath).toBe("config.toml");
    expect(config.configRelativePaths).toEqual([
      "config.toml",
      "settings.json",
      "trust.json",
    ]);
    expect(config.rulesRelativePath).toBeUndefined();
    expect(
      buildAgentRootAssetPreview({ ...config, rootPath: config.rootPath }),
    ).toMatchObject({
      skillScanPaths: ["~/.reasonix/skills"],
      mcpConfigPaths: ["~/.reasonix/config.toml"],
      configCandidates: [
        "~/.reasonix/config.toml",
        "~/.reasonix/settings.json",
        "~/.reasonix/trust.json",
      ],
    });
  });

  it("models Augment's verified user-guidelines entry without flattening its rules directory", () => {
    const platform = getPlatformById("augment");
    expect(platform).toBeDefined();
    expect(platform?.name).toBe("Augment");

    const config = getEffectiveBuiltinAgentConfig(
      platform!,
      "~/.augment",
      undefined,
    );
    if (typeof config.rootPath !== "string")
      throw new Error("Missing built-in Agent root path");

    expect(config.skillsRelativePath).toBe("skills");
    expect(config.mcpRelativePath).toBe("settings.json");
    expect(config.configRelativePaths).toEqual(["settings.json"]);
    expect(config.rulesRelativePath).toBe("user-guidelines.md");
    expect(
      buildAgentRootAssetPreview({ ...config, rootPath: config.rootPath }),
    ).toMatchObject({
      skillScanPaths: ["~/.augment/skills"],
      mcpConfigPaths: ["~/.augment/settings.json"],
      ruleCandidates: ["~/.augment/user-guidelines.md"],
      configCandidates: ["~/.augment/settings.json"],
    });
  });

  it("models Qwen Code separately from Qoder with its documented user assets", () => {
    const qwen = getPlatformById("qwen");

    expect(getPlatformById("qoder")?.name).toBe("Qoder");
    expect(qwen).toMatchObject({
      id: "qwen",
      name: "Qwen Code",
      rootEnvironmentVariable: "QWEN_HOME",
      rootDir: {
        darwin: "~/.qwen",
        win32: "%USERPROFILE%\\.qwen",
        linux: "~/.qwen",
      },
      skillsRelativePath: "skills",
      mcpRelativePath: "settings.json",
      pluginsRelativePath: "extensions",
      globalRuleFile: "QWEN.md",
    });

    const config = getEffectiveBuiltinAgentConfig(qwen!, "~/.qwen", undefined);
    if (typeof config.rootPath !== "string")
      throw new Error("Missing built-in Agent root path");
    expect(config).toMatchObject({
      agentsRelativePath: "agents",
      commandsRelativePath: "commands",
      configRelativePaths: [],
    });
    expect(
      buildAgentRootAssetPreview({ ...config, rootPath: config.rootPath }),
    ).toMatchObject({
      skillScanPaths: ["~/.qwen/skills"],
      mcpConfigPaths: ["~/.qwen/settings.json"],
      pluginDirectories: ["~/.qwen/extensions"],
      ruleCandidates: ["~/.qwen/QWEN.md"],
      agentDirectories: ["~/.qwen/agents"],
      configCandidates: [],
    });
  });

  it("keeps the built-in platform registry free of duplicate ids", () => {
    const ids = SKILL_PLATFORMS.map((platform) => platform.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id === "augment")).toHaveLength(1);
    expect(ids.filter((id) => id === "qwen")).toHaveLength(1);
  });
});
