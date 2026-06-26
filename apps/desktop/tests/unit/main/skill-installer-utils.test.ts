import * as childProcess from "child_process";
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
  initDatabase: vi.fn(),
}));

import { initDatabase } from "../../../src/main/database";
import { getPlatformById } from "@prompthub/shared/constants/platforms";
import {
  getPlatformRootDir,
  getPlatformSkillsDir,
  getPlatformGlobalRulePath,
  getDefaultMcpRelativePath,
  getDefaultPluginsRelativePath,
  validateMCPConfig,
  resolvePlatformPath,
  gitClone,
  gitListRemoteBranches,
  invalidateCustomPathsCache,
} from "../../../src/main/services/skill-installer-utils";

describe("skill-installer-utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateCustomPathsCache();
  });

  // ---------- getPlatformSkillsDir ----------

  describe("getPlatformSkillsDir", () => {
    it("uses the saved platform override when one exists", () => {
      const getMock = vi.fn().mockImplementation((key: string) => {
        if (key === "customPlatformRootPaths") {
          return { value: JSON.stringify({ trae: "~/.trae-cn" }) };
        }
        return undefined;
      });
      vi.mocked(initDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof initDatabase>);

      const platform = getPlatformById("trae");
      expect(platform).toBeDefined();

      const resolvedPath = getPlatformSkillsDir(platform!);

      expect(getMock).toHaveBeenCalledWith("customPlatformRootPaths");
      expect(resolvedPath).toContain(".trae-cn/skills");
    });

    it("migrates legacy saved skills path back to platform root", () => {
      const getMock = vi.fn().mockImplementation((key: string) => {
        if (key === "customPlatformRootPaths") {
          return undefined;
        }
        if (key === "customSkillPlatformPaths") {
          return { value: JSON.stringify({ trae: "~/.trae-cn/skills" }) };
        }
        return undefined;
      });
      vi.mocked(initDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof initDatabase>);

      const platform = getPlatformById("trae");
      expect(platform).toBeDefined();

      const resolvedRoot = getPlatformRootDir(platform!);
      const resolvedPath = getPlatformSkillsDir(platform!);

      expect(getMock).toHaveBeenCalledWith("customPlatformRootPaths");
      expect(getMock).toHaveBeenCalledWith("customSkillPlatformPaths");
      expect(resolvedRoot).toContain(".trae-cn");
      expect(resolvedPath).toContain(".trae-cn/skills");
      expect(resolvedPath.endsWith("/skills/skills")).toBe(false);
    });

    it("falls back to the built-in platform path when no override exists", () => {
      const getMock = vi.fn().mockReturnValue(undefined);
      vi.mocked(initDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof initDatabase>);

      const platform = getPlatformById("trae");
      expect(platform).toBeDefined();

      const resolvedPath = getPlatformSkillsDir(platform!);

      expect(resolvedPath).toContain(".trae/skills");
    });

    it("resolves the built-in Trae CN path without overrides", () => {
      const getMock = vi.fn().mockReturnValue(undefined);
      vi.mocked(initDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof initDatabase>);

      const platform = getPlatformById("trae-cn");
      expect(platform).toBeDefined();

      const resolvedRoot = getPlatformRootDir(platform!);
      const resolvedPath = getPlatformSkillsDir(platform!);

      expect(resolvedRoot).toContain(".trae-cn");
      expect(resolvedPath).toContain(".trae-cn/skills");
    });

    it("resolves the built-in TRAE Work path without overrides", () => {
      const getMock = vi.fn().mockReturnValue(undefined);
      vi.mocked(initDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof initDatabase>);

      const platform = getPlatformById("trae-work");
      expect(platform).toBeDefined();

      const resolvedRoot = getPlatformRootDir(platform!);
      const resolvedPath = getPlatformSkillsDir(platform!);

      expect(resolvedRoot).toContain(".trae-work");
      expect(resolvedPath).toContain(".trae-work/skills");
    });

    it("resolves the built-in TRAE Work CN path without overrides", () => {
      const getMock = vi.fn().mockReturnValue(undefined);
      vi.mocked(initDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof initDatabase>);

      const platform = getPlatformById("trae-work-cn");
      expect(platform).toBeDefined();

      const resolvedRoot = getPlatformRootDir(platform!);
      const resolvedPath = getPlatformSkillsDir(platform!);

      expect(resolvedRoot).toContain(".trae-work-cn");
      expect(resolvedPath).toContain(".trae-work-cn/skills");
    });

    it("resolves the built-in Cline path without overrides", () => {
      const getMock = vi.fn().mockReturnValue(undefined);
      vi.mocked(initDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof initDatabase>);

      const platform = getPlatformById("cline");
      expect(platform).toBeDefined();

      const resolvedRoot = getPlatformRootDir(platform!);
      const resolvedPath = getPlatformSkillsDir(platform!);

      expect(resolvedRoot).toContain(".cline");
      expect(resolvedPath).toContain(".cline/skills");
    });

    it("resolves the built-in Cherry Studio macOS skills path under the production data directory", () => {
      const originalPlatform = process.platform;
      const originalHome = process.env.HOME;

      Object.defineProperty(process, "platform", {
        value: "darwin",
        configurable: true,
      });
      process.env.HOME = "/Users/TestUser";
      vi.mocked(initDatabase).mockReturnValue({
        prepare: vi
          .fn()
          .mockReturnValue({ get: vi.fn().mockReturnValue(undefined) }),
      } as unknown as ReturnType<typeof initDatabase>);
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
      vi.mocked(initDatabase).mockReturnValue({
        prepare: vi
          .fn()
          .mockReturnValue({ get: vi.fn().mockReturnValue(undefined) }),
      } as unknown as ReturnType<typeof initDatabase>);
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
      vi.mocked(initDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof initDatabase>);

      const platform = getPlatformById("antigravity");
      expect(platform).toBeDefined();

      const resolvedPath = getPlatformSkillsDir(platform!);

      expect(resolvedPath).toContain(".gemini");
      expect(resolvedPath).toContain("antigravity");
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
      vi.mocked(initDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof initDatabase>);

      const platform = getPlatformById("cursor");
      expect(platform).toBeDefined();

      const resolvedPath = getPlatformSkillsDir(platform!, { cursor: "  " });
      // Empty/whitespace override should be ignored, falls back to built-in
      expect(resolvedPath).toContain(".cursor/skills");
    });

    it("handles DB read failure gracefully (returns built-in path)", () => {
      vi.mocked(initDatabase).mockImplementation(() => {
        throw new Error("DB not available");
      });

      const platform = getPlatformById("claude");
      expect(platform).toBeDefined();

      // Should not throw — falls back to built-in
      const resolvedPath = getPlatformSkillsDir(platform!);
      expect(resolvedPath).toContain(".claude/skills");
    });

    it("handles malformed JSON in DB gracefully", () => {
      const getMock = vi.fn().mockReturnValue({
        value: "not valid json!",
      });
      vi.mocked(initDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof initDatabase>);

      const platform = getPlatformById("claude");
      expect(platform).toBeDefined();

      // Should not throw — falls back to built-in
      const resolvedPath = getPlatformSkillsDir(platform!);
      expect(resolvedPath).toContain(".claude/skills");
    });
  });

  describe("getPlatformGlobalRulePath", () => {
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
      vi.mocked(initDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof initDatabase>);

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
      vi.mocked(initDatabase).mockReturnValue({
        prepare: vi
          .fn()
          .mockReturnValue({ get: vi.fn().mockReturnValue(undefined) }),
      } as unknown as ReturnType<typeof initDatabase>);
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
      vi.mocked(initDatabase).mockReturnValue({
        prepare: vi
          .fn()
          .mockReturnValue({ get: vi.fn().mockReturnValue(undefined) }),
      } as unknown as ReturnType<typeof initDatabase>);
      invalidateCustomPathsCache();

      const platform = getPlatformById("kilo");
      expect(platform).toBeDefined();
      expect(getPlatformRootDir(platform!)).toBe("C:\\Users\\TestUser\\.kilo");
      const skillsDir = getPlatformSkillsDir(platform!);
      expect(skillsDir.startsWith("C:\\Users\\TestUser\\.kilo")).toBe(true);
      expect(skillsDir.endsWith("skills")).toBe(true);
      expect(getDefaultMcpRelativePath("kilo")).toBe(
        "../.config/kilo/kilo.jsonc",
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
      vi.mocked(initDatabase).mockReturnValue({
        prepare: vi
          .fn()
          .mockReturnValue({ get: vi.fn().mockReturnValue(undefined) }),
      } as unknown as ReturnType<typeof initDatabase>);
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
        "../.config/kilo/kilo.jsonc",
      );
      expect(getDefaultMcpRelativePath("trae-work")).toBeUndefined();
    });

    it("returns shared Plugin package defaults only for supported targets", () => {
      expect(getDefaultPluginsRelativePath("claude")).toBe(
        "plugins/cache/prompthub",
      );
      expect(getDefaultPluginsRelativePath("copilot")).toBe("plugins");
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
  });

  describe("gitListRemoteBranches", () => {
    it("rejects empty URL", () => {
      expect(() => gitListRemoteBranches("" as string)).toThrow(
        /cannot be empty/,
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
