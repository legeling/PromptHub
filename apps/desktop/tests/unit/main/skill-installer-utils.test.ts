import * as childProcess from "child_process";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("child_process", async () => {
  const actual =
    await vi.importActual<typeof import("child_process")>("child_process");

  return {
    ...actual,
    spawn: vi.fn(actual.spawn),
  };
});

vi.mock("../../../src/main/database", () => ({
  getDatabase: vi.fn(),
  initDatabase: vi.fn(),
}));

import { getDatabase, initDatabase } from "../../../src/main/database";
import { getPlatformById } from "@prompthub/shared/constants/platforms";
import {
  getCustomAgentPlatforms,
  getConfiguredBuiltinAgentPlatformIds,
  getPlatformRootDir,
  getPlatformSkillsDir,
  getPlatformGlobalRulePath,
  getDefaultMcpRelativePath,
  getDefaultPluginsRelativePath,
  validateMCPConfig,
  resolvePlatformPath,
  gitClone,
  gitListRemoteBranches,
  GitExecutableUnavailableError,
  invalidateCustomPathsCache,
} from "../../../src/main/services/skill-installer-utils";

describe("skill-installer-utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateCustomPathsCache();
  });

  describe("getCustomAgentPlatforms", () => {
    it("reads the already initialized database without restarting canonical reconciliation", () => {
      vi.mocked(getDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({
          get: vi.fn().mockReturnValue(undefined),
        }),
      } as unknown as ReturnType<typeof getDatabase>);

      expect(getCustomAgentPlatforms()).toEqual([]);
      expect(getDatabase).toHaveBeenCalledTimes(1);
      expect(initDatabase).not.toHaveBeenCalled();
    });

    it("projects every enabled custom Agent asset path into the shared platform registry", () => {
      const getMock = vi.fn().mockImplementation((key: string) => {
        if (key !== "customAgents") return undefined;
        return {
          value: JSON.stringify([
            {
              id: "team-agent",
              name: "Team Agent",
              rootPath: "~/team-agent",
              skillsRelativePath: "skills-custom",
              mcpRelativePath: "config/mcp.json",
              pluginsRelativePath: "extensions",
              rulesRelativePath: "AGENTS.md",
              configRelativePaths: ["settings.json"],
            },
            {
              id: "disabled-agent",
              name: "Disabled Agent",
              rootPath: "~/disabled-agent",
              enabled: false,
            },
          ]),
        };
      });
      vi.mocked(getDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof getDatabase>);

      expect(getCustomAgentPlatforms()).toEqual([
        expect.objectContaining({
          id: "team-agent",
          skillsRelativePath: "skills-custom",
          mcpRelativePath: "config/mcp.json",
          pluginsRelativePath: "extensions",
          globalRuleFile: "AGENTS.md",
          configFiles: ["settings.json"],
          isCustom: true,
        }),
      ]);
    });
  });

  describe("getConfiguredBuiltinAgentPlatformIds", () => {
    it("returns platform ids with any non-empty builtin override fields", () => {
      const getMock = vi.fn().mockImplementation((key: string) => {
        if (key === "builtinAgentOverrides") {
          return {
            value: JSON.stringify({
              claude: { rootPath: "~/.agent" },
              codex: { skillsRelativePath: "custom-skills" },
              opencode: {},
            }),
          };
        }
        return undefined;
      });
      vi.mocked(getDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof getDatabase>);

      expect(getConfiguredBuiltinAgentPlatformIds().sort()).toEqual([
        "claude",
        "codex",
      ]);
    });

    it("does not read retired root aliases when current overrides are empty", () => {
      const getMock = vi.fn().mockImplementation((key: string) => {
        if (key === "customPlatformRootPaths") {
          return {
            value: JSON.stringify({ claude: "~/.custom-claude" }),
          };
        }
        return undefined;
      });
      vi.mocked(getDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof getDatabase>);

      expect(getConfiguredBuiltinAgentPlatformIds()).toEqual([]);
    });

    it("does not read retired Skill path aliases", () => {
      const getMock = vi.fn().mockImplementation((key: string) => {
        if (key === "customSkillPlatformPaths") {
          return {
            value: JSON.stringify({ claude: "~/.legacy-claude/skills" }),
          };
        }
        return undefined;
      });
      vi.mocked(getDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof getDatabase>);

      expect(getConfiguredBuiltinAgentPlatformIds()).toEqual([]);
    });
  });

  // ---------- getPlatformSkillsDir ----------

  describe("getPlatformSkillsDir", () => {
    it("uses the saved platform override when one exists", () => {
      const getMock = vi.fn().mockImplementation((key: string) => {
        if (key === "builtinAgentOverrides") {
          return {
            value: JSON.stringify({ trae: { rootPath: "~/.trae-cn" } }),
          };
        }
        return undefined;
      });
      vi.mocked(getDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof getDatabase>);

      const platform = getPlatformById("trae");
      expect(platform).toBeDefined();

      const resolvedPath = getPlatformSkillsDir(platform!);

      expect(getMock).toHaveBeenCalledWith("builtinAgentOverrides");
      expect(resolvedPath).toContain(".trae-cn/skills");
    });

    it("does not interpret legacy Skill paths during ordinary reads", () => {
      const getMock = vi.fn().mockImplementation((key: string) => {
        if (key === "customPlatformRootPaths") {
          return undefined;
        }
        if (key === "customSkillPlatformPaths") {
          return { value: JSON.stringify({ trae: "~/.trae-cn/skills" }) };
        }
        return undefined;
      });
      vi.mocked(getDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof getDatabase>);

      const platform = getPlatformById("trae");
      expect(platform).toBeDefined();

      const resolvedRoot = getPlatformRootDir(platform!);
      const resolvedPath = getPlatformSkillsDir(platform!);

      expect(getMock).not.toHaveBeenCalledWith("customPlatformRootPaths");
      expect(getMock).not.toHaveBeenCalledWith("customSkillPlatformPaths");
      expect(resolvedRoot).toContain(".trae");
      expect(resolvedPath).toContain(".trae/skills");
      expect(resolvedPath.endsWith("/skills/skills")).toBe(false);
    });

    it("falls back to the built-in platform path when no override exists", () => {
      const getMock = vi.fn().mockReturnValue(undefined);
      vi.mocked(getDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof getDatabase>);

      const platform = getPlatformById("trae");
      expect(platform).toBeDefined();

      const resolvedPath = getPlatformSkillsDir(platform!);

      expect(resolvedPath).toContain(".trae/skills");
    });

    it("resolves the built-in Trae CN path without overrides", () => {
      const getMock = vi.fn().mockReturnValue(undefined);
      vi.mocked(getDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof getDatabase>);

      const platform = getPlatformById("trae-cn");
      expect(platform).toBeDefined();

      const resolvedRoot = getPlatformRootDir(platform!);
      const resolvedPath = getPlatformSkillsDir(platform!);

      expect(resolvedRoot).toContain(".trae-cn");
      expect(resolvedPath).toContain(".trae-cn/skills");
    });

    it("resolves the built-in TRAE Work path without overrides", () => {
      const getMock = vi.fn().mockReturnValue(undefined);
      vi.mocked(getDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof getDatabase>);

      const platform = getPlatformById("trae-work");
      expect(platform).toBeDefined();

      const resolvedRoot = getPlatformRootDir(platform!);
      const resolvedPath = getPlatformSkillsDir(platform!);

      expect(resolvedRoot).toContain(".trae-work");
      expect(resolvedPath).toContain(".trae-work/skills");
    });

    it("resolves the built-in TRAE Work CN path without overrides", () => {
      const getMock = vi.fn().mockReturnValue(undefined);
      vi.mocked(getDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof getDatabase>);

      const platform = getPlatformById("trae-work-cn");
      expect(platform).toBeDefined();

      const resolvedRoot = getPlatformRootDir(platform!);
      const resolvedPath = getPlatformSkillsDir(platform!);

      expect(resolvedRoot).toContain(".trae-work-cn");
      expect(resolvedPath).toContain(".trae-work-cn/skills");
    });

    it("resolves the built-in Cline path without overrides", () => {
      const getMock = vi.fn().mockReturnValue(undefined);
      vi.mocked(getDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof getDatabase>);

      const platform = getPlatformById("cline");
      expect(platform).toBeDefined();

      const resolvedRoot = getPlatformRootDir(platform!);
      const resolvedPath = getPlatformSkillsDir(platform!);

      expect(resolvedRoot).toContain(".cline");
      expect(resolvedPath).toContain(".cline/skills");
    });

    it("prefers current Kimi Code roots and falls back to legacy roots only when needed", () => {
      vi.mocked(getDatabase).mockReturnValue({
        prepare: vi
          .fn()
          .mockReturnValue({ get: vi.fn().mockReturnValue(undefined) }),
      } as unknown as ReturnType<typeof getDatabase>);
      const platform = getPlatformById("kimi");
      expect(platform).toBeDefined();

      const fromCurrentEnvironment = getPlatformRootDir(platform!, undefined, {
        environment: { KIMI_CODE_HOME: "/tmp/kimi-current" },
        pathExists: () => false,
      });
      expect(fromCurrentEnvironment).toBe("/tmp/kimi-current");

      const fromCurrentDefault = getPlatformRootDir(platform!, undefined, {
        environment: { KIMI_SHARE_DIR: "/tmp/kimi-legacy-env" },
        pathExists: (candidate) => candidate.endsWith(".kimi-code"),
      });
      expect(fromCurrentDefault).toContain(".kimi-code");

      const fromLegacyEnvironment = getPlatformRootDir(platform!, undefined, {
        environment: { KIMI_SHARE_DIR: "/tmp/kimi-legacy-env" },
        pathExists: (candidate) => candidate === "/tmp/kimi-legacy-env",
      });
      expect(fromLegacyEnvironment).toBe("/tmp/kimi-legacy-env");

      const freshTarget = getPlatformRootDir(platform!, undefined, {
        environment: {
          KIMI_CODE_HOME: "relative/current",
          KIMI_SHARE_DIR: "relative/legacy",
        },
        pathExists: () => false,
      });
      expect(freshTarget).toContain(".kimi-code");
    });

    it("resolves Qwen Code from QWEN_HOME without treating QWEN_RUNTIME_DIR as its config root", () => {
      vi.mocked(getDatabase).mockReturnValue({
        prepare: vi
          .fn()
          .mockReturnValue({ get: vi.fn().mockReturnValue(undefined) }),
      } as unknown as ReturnType<typeof getDatabase>);
      const platform = getPlatformById("qwen");
      expect(platform).toBeDefined();

      expect(
        getPlatformRootDir(platform!, undefined, {
          environment: {
            QWEN_HOME: "/tmp/qwen-config",
            QWEN_RUNTIME_DIR: "/tmp/qwen-runtime",
          },
          pathExists: () => false,
        }),
      ).toBe("/tmp/qwen-config");
      expect(
        getPlatformRootDir(platform!, undefined, {
          environment: { QWEN_RUNTIME_DIR: "/tmp/qwen-runtime" },
          pathExists: () => false,
        }),
      ).toContain(".qwen");
      expect(
        getPlatformRootDir(platform!, undefined, {
          environment: { QWEN_HOME: "relative/qwen-config" },
          pathExists: () => false,
          cwd: "/workspace/project",
        }),
      ).toBe(path.join("/workspace/project", "relative/qwen-config"));
    });

    it("resolves the built-in Cherry Studio macOS skills path under the production data directory", () => {
      const originalPlatform = process.platform;
      const originalHome = process.env.HOME;

      Object.defineProperty(process, "platform", {
        value: "darwin",
        configurable: true,
      });
      process.env.HOME = "/Users/TestUser";
      vi.mocked(getDatabase).mockReturnValue({
        prepare: vi
          .fn()
          .mockReturnValue({ get: vi.fn().mockReturnValue(undefined) }),
      } as unknown as ReturnType<typeof getDatabase>);
      invalidateCustomPathsCache();

      const platform = getPlatformById("cherry-studio");
      expect(platform).toBeDefined();
      expect(getPlatformRootDir(platform!)).toBe(
        "/Users/TestUser/Library/Application Support/CherryStudio",
      );
      expect(getPlatformSkillsDir(platform!)).toBe(
        "/Users/TestUser/Library/Application Support/CherryStudio/Data/Skills",
      );

      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true,
      });
      process.env.HOME = originalHome;
      invalidateCustomPathsCache();
    });

    it("resolves the built-in Cherry Studio Windows skills path under AppData", () => {
      const originalPlatform = process.platform;
      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;
      const originalAppData = process.env.APPDATA;

      Object.defineProperty(process, "platform", {
        value: "win32",
        configurable: true,
      });
      process.env.HOME = "C:\\Users\\TestUser";
      process.env.USERPROFILE = "C:\\Users\\TestUser";
      process.env.APPDATA = "C:\\Users\\TestUser\\AppData\\Roaming";
      vi.mocked(getDatabase).mockReturnValue({
        prepare: vi
          .fn()
          .mockReturnValue({ get: vi.fn().mockReturnValue(undefined) }),
      } as unknown as ReturnType<typeof getDatabase>);
      invalidateCustomPathsCache();

      const platform = getPlatformById("cherry-studio");
      expect(platform).toBeDefined();
      expect(getPlatformRootDir(platform!)).toBe(
        "C:\\Users\\TestUser\\AppData\\Roaming\\CherryStudio",
      );
      const skillsDir = getPlatformSkillsDir(platform!);
      expect(skillsDir).toContain("CherryStudio");
      expect(skillsDir).toContain("Data");
      expect(skillsDir).toContain("Skills");
      expect(skillsDir.replace(/[\\/]+/g, "\\")).toBe(
        "C:\\Users\\TestUser\\AppData\\Roaming\\CherryStudio\\Data\\Skills",
      );

      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true,
      });
      process.env.HOME = originalHome;
      process.env.USERPROFILE = originalUserProfile;
      if (originalAppData === undefined) {
        delete process.env.APPDATA;
      } else {
        process.env.APPDATA = originalAppData;
      }
      invalidateCustomPathsCache();
    });

    it("resolves the Antigravity global skills path", () => {
      const getMock = vi.fn().mockReturnValue(undefined);
      vi.mocked(getDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof getDatabase>);

      const platform = getPlatformById("antigravity");
      expect(platform).toBeDefined();

      const resolvedPath = getPlatformSkillsDir(platform!);

      expect(resolvedPath).toContain(".gemini");
      expect(resolvedPath).toContain("config");
      expect(resolvedPath).not.toContain("antigravity/skills");
      expect(resolvedPath).toContain("skills");
    });

    it("uses overrides parameter when provided", () => {
      const platform = getPlatformById("claude");
      expect(platform).toBeDefined();

      const resolvedPath = getPlatformSkillsDir(platform!, {
        claude: "/custom/claude",
      });

      expect(resolvedPath).toBe("/custom/claude/skills");
    });

    it("ignores empty string override and falls back to built-in", () => {
      const getMock = vi.fn().mockReturnValue(undefined);
      vi.mocked(getDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof getDatabase>);

      const platform = getPlatformById("cursor");
      expect(platform).toBeDefined();

      const resolvedPath = getPlatformSkillsDir(platform!, { cursor: "  " });
      // Empty/whitespace override should be ignored, falls back to built-in
      expect(resolvedPath).toContain(".cursor/skills");
    });

    it("propagates database read failure without changing target", () => {
      vi.mocked(getDatabase).mockImplementation(() => {
        throw new Error("DB not available");
      });

      const platform = getPlatformById("claude");
      expect(platform).toBeDefined();

      expect(() => getPlatformSkillsDir(platform!)).toThrow("DB not available");
    });

    it("rejects malformed configuration without changing target", () => {
      const getMock = vi.fn().mockReturnValue({
        value: "not valid json!",
      });
      vi.mocked(getDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof getDatabase>);

      const platform = getPlatformById("claude");
      expect(platform).toBeDefined();

      expect(() => getPlatformSkillsDir(platform!)).toThrow(
        "Invalid Agent setting JSON",
      );
    });
  });

  describe("getPlatformGlobalRulePath", () => {
    it("resolves Antigravity's shared global rule outside the config asset root", () => {
      vi.mocked(getDatabase).mockReturnValue({
        prepare: vi
          .fn()
          .mockReturnValue({ get: vi.fn().mockReturnValue(undefined) }),
      } as unknown as ReturnType<typeof getDatabase>);
      const platform = getPlatformById("antigravity");
      expect(platform).toBeDefined();

      const resolvedPath = getPlatformGlobalRulePath(platform!);

      expect(resolvedPath).toContain(".gemini");
      expect(resolvedPath).toMatch(/\.gemini[\\/]GEMINI\.md$/);
      expect(resolvedPath).not.toContain("config/../");
      expect(resolvedPath).not.toContain("config\\..\\");
    });

    it("derives the Windsurf global rules file from the platform root", () => {
      const platform = getPlatformById("windsurf");
      expect(platform).toBeDefined();

      const resolvedPath = getPlatformGlobalRulePath(platform!);

      expect(resolvedPath).toContain(".codeium");
      expect(resolvedPath).toContain("windsurf");
      expect(resolvedPath).toContain("memories");
      expect(resolvedPath).toContain("global_rules.md");
    });

    it("uses explicit root overrides for the Windsurf global rules file", () => {
      const platform = getPlatformById("windsurf");
      expect(platform).toBeDefined();

      const resolvedPath = getPlatformGlobalRulePath(platform!, {
        windsurf: "/custom/windsurf",
      });

      expect(resolvedPath).toBe("/custom/windsurf/memories/global_rules.md");
    });

    it("uses built-in override relative paths when configured in settings", () => {
      const getMock = vi.fn().mockImplementation((key: string) => {
        if (key === "builtinAgentOverrides") {
          return {
            value: JSON.stringify({
              opencode: {
                rootPath: "/tmp/opencode-root",
                skillsRelativePath: "custom-skills",
                rulesRelativePath: "docs/AGENTS.md",
              },
            }),
          };
        }
        return undefined;
      });
      vi.mocked(getDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof getDatabase>);

      const platform = getPlatformById("opencode");
      expect(platform).toBeDefined();

      expect(getPlatformRootDir(platform!)).toBe("/tmp/opencode-root");
      expect(getPlatformSkillsDir(platform!)).toBe(
        "/tmp/opencode-root/custom-skills",
      );
      expect(getPlatformGlobalRulePath(platform!)).toBe(
        "/tmp/opencode-root/docs/AGENTS.md",
      );
    });

    it("uses %USERPROFILE%\\.config\\opencode as the default OpenCode root on Windows", () => {
      const originalPlatform = process.platform;
      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;

      Object.defineProperty(process, "platform", {
        value: "win32",
        configurable: true,
      });
      process.env.HOME = "C:\\Users\\TestUser";
      process.env.USERPROFILE = "C:\\Users\\TestUser";
      vi.mocked(getDatabase).mockReturnValue({
        prepare: vi
          .fn()
          .mockReturnValue({ get: vi.fn().mockReturnValue(undefined) }),
      } as unknown as ReturnType<typeof getDatabase>);
      invalidateCustomPathsCache();

      const platform = getPlatformById("opencode");
      expect(platform).toBeDefined();
      expect(getPlatformRootDir(platform!)).toBe(
        "C:\\Users\\TestUser\\.config\\opencode",
      );
      const skillsDir = getPlatformSkillsDir(platform!);
      expect(
        skillsDir.startsWith("C:\\Users\\TestUser\\.config\\opencode"),
      ).toBe(true);
      expect(skillsDir.endsWith("skills")).toBe(true);

      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true,
      });
      process.env.HOME = originalHome;
      process.env.USERPROFILE = originalUserProfile;
      invalidateCustomPathsCache();
    });

    it("uses %USERPROFILE%\\.kilo as the default Kilo Code root on Windows", () => {
      const originalPlatform = process.platform;
      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;

      Object.defineProperty(process, "platform", {
        value: "win32",
        configurable: true,
      });
      process.env.HOME = "C:\\Users\\TestUser";
      process.env.USERPROFILE = "C:\\Users\\TestUser";
      vi.mocked(getDatabase).mockReturnValue({
        prepare: vi
          .fn()
          .mockReturnValue({ get: vi.fn().mockReturnValue(undefined) }),
      } as unknown as ReturnType<typeof getDatabase>);
      invalidateCustomPathsCache();

      const platform = getPlatformById("kilo");
      expect(platform).toBeDefined();
      expect(getPlatformRootDir(platform!)).toBe("C:\\Users\\TestUser\\.kilo");
      const skillsDir = getPlatformSkillsDir(platform!);
      expect(skillsDir.startsWith("C:\\Users\\TestUser\\.kilo")).toBe(true);
      expect(skillsDir.endsWith("skills")).toBe(true);
      expect(getDefaultMcpRelativePath("kilo")).toBe(
        "../.config/kilo/kilo.json",
      );

      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true,
      });
      process.env.HOME = originalHome;
      process.env.USERPROFILE = originalUserProfile;
      invalidateCustomPathsCache();
    });

    it("uses %LOCALAPPDATA%\\hermes as the default Hermes Agent root on Windows", () => {
      const originalPlatform = process.platform;
      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;
      const originalLocalAppData = process.env.LOCALAPPDATA;

      Object.defineProperty(process, "platform", {
        value: "win32",
        configurable: true,
      });
      process.env.HOME = "C:\\Users\\TestUser";
      process.env.USERPROFILE = "C:\\Users\\TestUser";
      process.env.LOCALAPPDATA = "C:\\Users\\TestUser\\AppData\\Local";
      vi.mocked(getDatabase).mockReturnValue({
        prepare: vi
          .fn()
          .mockReturnValue({ get: vi.fn().mockReturnValue(undefined) }),
      } as unknown as ReturnType<typeof getDatabase>);
      invalidateCustomPathsCache();

      const platform = getPlatformById("hermes");
      expect(platform).toBeDefined();
      expect(getPlatformRootDir(platform!)).toBe(
        "C:\\Users\\TestUser\\AppData\\Local\\hermes",
      );
      const skillsDir = getPlatformSkillsDir(platform!);
      expect(
        skillsDir.startsWith("C:\\Users\\TestUser\\AppData\\Local\\hermes"),
      ).toBe(true);
      expect(skillsDir.endsWith("skills")).toBe(true);

      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true,
      });
      process.env.HOME = originalHome;
      process.env.USERPROFILE = originalUserProfile;
      process.env.LOCALAPPDATA = originalLocalAppData;
      invalidateCustomPathsCache();
    });

    it("returns shared MCP defaults only for confirmed built-in targets", () => {
      expect(getDefaultMcpRelativePath("cline")).toBe(
        "data/settings/cline_mcp_settings.json",
      );
      expect(getDefaultMcpRelativePath("kilo")).toBe(
        "../.config/kilo/kilo.json",
      );
      expect(getDefaultMcpRelativePath("workbuddy")).toBe("mcp.json");
      expect(getDefaultMcpRelativePath("codebuddy")).toBe(".mcp.json");
      expect(getDefaultMcpRelativePath("trae-work")).toBeUndefined();
    });

    it("returns shared Plugin discovery paths declared by built-in targets", () => {
      expect(getDefaultPluginsRelativePath("claude")).toBe(
        "plugins/cache/prompthub",
      );
      expect(getDefaultPluginsRelativePath("copilot")).toBe(
        "installed-plugins",
      );
      expect(getDefaultPluginsRelativePath("cline")).toBeUndefined();
    });
  });

  // ---------- validateMCPConfig ----------

  describe("validateMCPConfig", () => {
    describe("top-level server config (no servers wrapper)", () => {
      it("accepts a valid server config with command only", () => {
        expect(() =>
          validateMCPConfig(
            { command: "node", args: ["server.js"] },
            "test-skill",
          ),
        ).not.toThrow();
      });

      it("accepts config with command, args, and env", () => {
        expect(() =>
          validateMCPConfig(
            {
              command: "python",
              args: ["-m", "mcp"],
              env: { PATH: "/usr/bin" },
            },
            "test",
          ),
        ).not.toThrow();
      });

      it("rejects null config", () => {
        expect(() => validateMCPConfig(null, "test")).toThrow(
          /expected an object/,
        );
      });

      it("rejects array config", () => {
        expect(() => validateMCPConfig([1, 2], "test")).toThrow(
          /expected an object.*array/i,
        );
      });

      it("rejects string config", () => {
        expect(() => validateMCPConfig("hello", "test")).toThrow(
          /expected an object/,
        );
      });

      it("rejects config without command field", () => {
        expect(() => validateMCPConfig({ args: ["a"] }, "my-server")).toThrow(
          /command.*must be a non-empty string/,
        );
      });

      it("rejects config with empty command", () => {
        expect(() => validateMCPConfig({ command: "  " }, "my-server")).toThrow(
          /command.*must be a non-empty string/,
        );
      });

      it("rejects config with numeric command", () => {
        expect(() => validateMCPConfig({ command: 42 }, "my-server")).toThrow(
          /command.*must be a non-empty string/,
        );
      });

      it("rejects non-array args", () => {
        expect(() =>
          validateMCPConfig({ command: "node", args: "bad" }, "test"),
        ).toThrow(/args.*must be a string array/);
      });

      it("rejects args array with non-string elements", () => {
        expect(() =>
          validateMCPConfig({ command: "node", args: ["ok", 123] }, "test"),
        ).toThrow(/args.*must be a string array/);
      });

      it("rejects non-object env", () => {
        expect(() =>
          validateMCPConfig({ command: "node", env: "bad" }, "test"),
        ).toThrow(/env.*must be an object/);
      });

      it("rejects env array", () => {
        expect(() =>
          validateMCPConfig({ command: "node", env: [1] }, "test"),
        ).toThrow(/env.*must be an object/);
      });

      it("rejects env with non-string values", () => {
        expect(() =>
          validateMCPConfig({ command: "node", env: { PORT: 8080 } }, "test"),
        ).toThrow(/env\["PORT"\] must be a string/);
      });
    });

    describe("wrapped config with servers key", () => {
      it("accepts valid wrapped config", () => {
        expect(() =>
          validateMCPConfig(
            {
              servers: {
                "my-mcp": { command: "node", args: ["index.js"] },
              },
            },
            "my-mcp",
          ),
        ).not.toThrow();
      });

      it("validates each server entry inside servers", () => {
        expect(() =>
          validateMCPConfig({ servers: { bad: { command: "" } } }, "skill"),
        ).toThrow(/command.*must be a non-empty string/);
      });

      it("rejects servers as an array", () => {
        expect(() =>
          validateMCPConfig({ servers: [{ command: "node" }] }, "skill"),
        ).toThrow(/servers.*must be an object/);
      });

      it("rejects servers as a string", () => {
        expect(() => validateMCPConfig({ servers: "bad" }, "skill")).toThrow(
          /servers.*must be an object/,
        );
      });

      it("accepts empty servers object", () => {
        expect(() => validateMCPConfig({ servers: {} }, "skill")).not.toThrow();
      });
    });

    describe("adversarial inputs", () => {
      it("rejects undefined config", () => {
        expect(() => validateMCPConfig(undefined, "test")).toThrow(
          /expected an object/,
        );
      });

      it("rejects boolean config", () => {
        expect(() => validateMCPConfig(true, "test")).toThrow(
          /expected an object/,
        );
      });

      it("rejects nested null servers", () => {
        expect(() => validateMCPConfig({ servers: null }, "test")).toThrow(
          /servers.*must be an object/,
        );
      });

      it("includes skill name in error messages", () => {
        expect(() => validateMCPConfig(null, "special-skill-99")).toThrow(
          /special-skill-99/,
        );
      });

      it("accepts config with extra unknown fields (passthrough)", () => {
        expect(() =>
          validateMCPConfig(
            { command: "node", custom_field: true, version: 2 },
            "test",
          ),
        ).not.toThrow();
      });

      it("rejects env with null values", () => {
        expect(() =>
          validateMCPConfig({ command: "node", env: { KEY: null } }, "test"),
        ).toThrow(/env\["KEY"\] must be a string/);
      });

      it("rejects env with boolean values", () => {
        expect(() =>
          validateMCPConfig({ command: "node", env: { DEBUG: true } }, "test"),
        ).toThrow(/env\["DEBUG"\] must be a string/);
      });
    });
  });

  // ---------- resolvePlatformPath ----------

  describe("resolvePlatformPath", () => {
    it("expands ~ to home directory", () => {
      const result = resolvePlatformPath("~/.claude/skills");
      expect(result).not.toContain("~");
      expect(result).toContain(".claude/skills");
    });

    it("expands %USERPROFILE%", () => {
      const result = resolvePlatformPath("%USERPROFILE%\\.cursor\\skills");
      expect(result).not.toContain("%USERPROFILE%");
      expect(result).toContain(".cursor");
    });

    it("expands %APPDATA%", () => {
      const result = resolvePlatformPath("%APPDATA%\\opencode\\skills");
      expect(result).not.toContain("%APPDATA%");
      expect(result).toContain("opencode");
    });

    it("expands %LOCALAPPDATA%", () => {
      const originalLocalAppData = process.env.LOCALAPPDATA;
      process.env.LOCALAPPDATA = "C:\\Users\\TestUser\\AppData\\Local";

      const result = resolvePlatformPath("%LOCALAPPDATA%\\hermes\\skills");

      expect(result).toBe(
        "C:\\Users\\TestUser\\AppData\\Local\\hermes\\skills",
      );
      process.env.LOCALAPPDATA = originalLocalAppData;
    });

    it("falls back to the Windows local app data path when LOCALAPPDATA is unset", () => {
      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;
      const originalLocalAppData = process.env.LOCALAPPDATA;
      process.env.HOME = "C:\\Users\\FallbackUser";
      process.env.USERPROFILE = "C:\\Users\\FallbackUser";
      delete process.env.LOCALAPPDATA;

      const result = resolvePlatformPath("%LOCALAPPDATA%\\hermes");

      expect(result).toBe("C:\\Users\\FallbackUser\\AppData\\Local\\hermes");
      process.env.HOME = originalHome;
      process.env.USERPROFILE = originalUserProfile;
      process.env.LOCALAPPDATA = originalLocalAppData;
    });

    it("returns plain path unchanged (no placeholders)", () => {
      const result = resolvePlatformPath("/usr/local/skills");
      expect(result).toBe("/usr/local/skills");
    });

    it("handles case-insensitive %APPDATA%", () => {
      const result = resolvePlatformPath("%appdata%\\test");
      expect(result).not.toContain("%appdata%");
      expect(result).toContain("test");
    });

    it("handles case-insensitive %USERPROFILE%", () => {
      const result = resolvePlatformPath("%userprofile%\\.test");
      expect(result).not.toContain("%userprofile%");
    });

    it("handles case-insensitive %LOCALAPPDATA%", () => {
      const originalLocalAppData = process.env.LOCALAPPDATA;
      process.env.LOCALAPPDATA = "C:\\Users\\TestUser\\AppData\\Local";

      const result = resolvePlatformPath("%localappdata%\\hermes");

      expect(result).toBe("C:\\Users\\TestUser\\AppData\\Local\\hermes");
      process.env.LOCALAPPDATA = originalLocalAppData;
    });

    it("expands only ~ at the start of the string", () => {
      const result = resolvePlatformPath("hello~world");
      // ~ not at start should remain
      expect(result).toBe("hello~world");
    });
  });

  // ---------- gitClone argument validation ----------

  describe("gitClone", () => {
    it("rejects empty URL", () => {
      expect(() => gitClone("", "/tmp/dest")).toThrow(/cannot be empty/);
    });

    it("rejects whitespace-only URL", () => {
      expect(() => gitClone("   ", "/tmp/dest")).toThrow(/cannot be empty/);
    });

    it("rejects URL starting with dash (argument injection)", () => {
      expect(() => gitClone("--upload-pack=evil", "/tmp/dest")).toThrow(
        /cannot start with/,
      );
    });

    it("rejects public HTTP URLs", async () => {
      await expect(
        gitClone("http://93.184.216.34/user/repo", "/tmp/dest"),
      ).rejects.toThrow(/private-network HTTP/);
    });

    it("rejects file:// protocol", async () => {
      await expect(gitClone("file:///etc/passwd", "/tmp/dest")).rejects.toThrow(
        /private-network HTTP/,
      );
    });

    it("rejects ftp:// protocol", async () => {
      await expect(
        gitClone("ftp://example.com/repo", "/tmp/dest"),
      ).rejects.toThrow(/private-network HTTP/);
    });

    it("allows private-network HTTP clone URLs", async () => {
      const closeHandlers: Array<(code: number) => void> = [];

      vi.mocked(childProcess.spawn).mockReturnValue({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => event === "close" && closeHandlers.push(cb)),
        kill: vi.fn(),
      } as unknown as childProcess.ChildProcess);

      const promise = gitClone(
        "http://192.168.31.12:3000/team/skills",
        "/tmp/dest",
      );
      await vi.waitFor(() => expect(childProcess.spawn).toHaveBeenCalled());
      closeHandlers[0]?.(0);

      await expect(promise).resolves.toBeUndefined();
      expect(childProcess.spawn).toHaveBeenCalledWith(
        "git",
        [
          "clone",
          "--depth",
          "1",
          "--",
          "http://192.168.31.12:3000/team/skills",
          "/tmp/dest",
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
    });

    it("does not reject SSH-style GitHub clone URLs during upfront validation", async () => {
      const closeHandlers: Array<(code: number) => void> = [];

      vi.mocked(childProcess.spawn).mockReturnValue({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => event === "close" && closeHandlers.push(cb)),
        kill: vi.fn(),
      } as unknown as childProcess.ChildProcess);

      const promise = gitClone("git@github.com:user/repo.git", "/tmp/dest");
      await vi.waitFor(() => expect(childProcess.spawn).toHaveBeenCalled());
      closeHandlers[0]?.(0);

      await expect(promise).resolves.toBeUndefined();
    });

    it("does not reject SSH-style self-hosted git clone URLs during upfront validation", async () => {
      const closeHandlers: Array<(code: number) => void> = [];

      vi.mocked(childProcess.spawn).mockReturnValue({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => event === "close" && closeHandlers.push(cb)),
        kill: vi.fn(),
      } as unknown as childProcess.ChildProcess);

      const promise = gitClone(
        "git@gitea.example.com:icelemon/skills.git",
        "/tmp/dest",
      );
      await vi.waitFor(() => expect(childProcess.spawn).toHaveBeenCalled());
      closeHandlers[0]?.(0);

      await expect(promise).resolves.toBeUndefined();
    });

    it("redacts clone credentials from Git failure diagnostics", async () => {
      const stderrHandlers: Array<(chunk: Buffer) => void> = [];
      const closeHandlers: Array<(code: number) => void> = [];

      vi.mocked(childProcess.spawn).mockReturnValue({
        stdout: { on: vi.fn() },
        stderr: {
          on: vi.fn((event, cb) => event === "data" && stderrHandlers.push(cb)),
        },
        on: vi.fn((event, cb) => event === "close" && closeHandlers.push(cb)),
        kill: vi.fn(),
        // Only the streams and process events consumed by gitClone are mocked.
      } as unknown as childProcess.ChildProcess);

      const promise = gitClone(
        "https://alice:secret@gitea.example.com/team/skills",
        "/tmp/dest",
      );
      await vi.waitFor(() => expect(childProcess.spawn).toHaveBeenCalled());
      stderrHandlers[0]?.(
        Buffer.from(
          "fatal: unable to access 'https://alice:secret@gitea.example.com/team/skills': authentication failed",
        ),
      );
      closeHandlers[0]?.(128);

      const error = await promise.catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("gitea.example.com");
      expect((error as Error).message).not.toContain("alice");
      expect((error as Error).message).not.toContain("secret");
    });

    it.each(["ENOENT", "EACCES"])(
      "classifies an unavailable Git executable from %s",
      async (code) => {
        const errorHandlers: Array<(error: NodeJS.ErrnoException) => void> = [];
        vi.mocked(childProcess.spawn).mockReturnValue({
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, cb) => event === "error" && errorHandlers.push(cb)),
          kill: vi.fn(),
        } as unknown as childProcess.ChildProcess);

        const promise = gitClone("https://github.com/acme/skills", "/tmp/dest");
        await vi.waitFor(() => expect(childProcess.spawn).toHaveBeenCalled());
        errorHandlers[0]?.(
          Object.assign(new Error(`spawn git ${code}`), { code }),
        );

        await expect(promise).rejects.toBeInstanceOf(
          GitExecutableUnavailableError,
        );
      },
    );

    it("keeps other Git process launch failures sanitized and distinct", async () => {
      const errorHandlers: Array<(error: NodeJS.ErrnoException) => void> = [];
      vi.mocked(childProcess.spawn).mockReturnValue({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => event === "error" && errorHandlers.push(cb)),
        kill: vi.fn(),
      } as unknown as childProcess.ChildProcess);

      const promise = gitClone("https://github.com/acme/skills", "/tmp/dest");
      await vi.waitFor(() => expect(childProcess.spawn).toHaveBeenCalled());
      errorHandlers[0]?.(
        Object.assign(new Error("spawn git EIO"), { code: "EIO" }),
      );

      const error = await promise.catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(GitExecutableUnavailableError);
      expect((error as Error).message).toContain("Git clone error");
    });
  });

  describe("gitListRemoteBranches", () => {
    it("rejects empty URL", () => {
      expect(() => gitListRemoteBranches("" as string)).toThrow(
        /cannot be empty/,
      );
    });

    it("uses the same actionable error when branch discovery cannot run Git", async () => {
      const errorHandlers: Array<(error: NodeJS.ErrnoException) => void> = [];
      vi.mocked(childProcess.spawn).mockReturnValue({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => event === "error" && errorHandlers.push(cb)),
        kill: vi.fn(),
      } as unknown as childProcess.ChildProcess);

      const promise = gitListRemoteBranches("https://github.com/acme/skills");
      await vi.waitFor(() => expect(childProcess.spawn).toHaveBeenCalled());
      errorHandlers[0]?.(
        Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT" }),
      );

      await expect(promise).rejects.toBeInstanceOf(
        GitExecutableUnavailableError,
      );
    });

    it("parses remote branch names from git ls-remote output", async () => {
      const stdoutHandlers: Array<(chunk: Buffer) => void> = [];
      const stderrHandlers: Array<(chunk: Buffer) => void> = [];
      const closeHandlers: Array<(code: number) => void> = [];

      vi.mocked(childProcess.spawn).mockReturnValue({
        stdout: {
          on: vi.fn((event, cb) => event === "data" && stdoutHandlers.push(cb)),
        },
        stderr: {
          on: vi.fn((event, cb) => event === "data" && stderrHandlers.push(cb)),
        },
        on: vi.fn((event, cb) => event === "close" && closeHandlers.push(cb)),
        kill: vi.fn(),
      } as unknown as childProcess.ChildProcess);

      const promise = gitListRemoteBranches("git@github.com:demo/skills.git");
      await vi.waitFor(() => expect(childProcess.spawn).toHaveBeenCalled());
      stdoutHandlers[0]?.(
        Buffer.from("abc123\trefs/heads/main\ndef456\trefs/heads/release\n"),
      );
      closeHandlers[0]?.(0);

      await expect(promise).resolves.toEqual(["main", "release"]);
    });

    it("normalizes GitHub tree URLs before listing remote branches", async () => {
      const stdoutHandlers: Array<(chunk: Buffer) => void> = [];
      const closeHandlers: Array<(code: number) => void> = [];

      vi.mocked(childProcess.spawn).mockReturnValue({
        stdout: {
          on: vi.fn((event, cb) => event === "data" && stdoutHandlers.push(cb)),
        },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => event === "close" && closeHandlers.push(cb)),
        kill: vi.fn(),
      } as unknown as childProcess.ChildProcess);

      const promise = gitListRemoteBranches(
        "https://github.com/anthropics/skills/tree/main/skills/.curated",
      );

      await vi.waitFor(() => expect(childProcess.spawn).toHaveBeenCalled());
      expect(childProcess.spawn).toHaveBeenCalledWith(
        "git",
        ["ls-remote", "--heads", "--", "https://github.com/anthropics/skills"],
        { stdio: ["ignore", "pipe", "pipe"] },
      );

      stdoutHandlers[0]?.(Buffer.from("abc123\trefs/heads/main\n"));
      closeHandlers[0]?.(0);

      await expect(promise).resolves.toEqual(["main"]);
    });
  });
});
