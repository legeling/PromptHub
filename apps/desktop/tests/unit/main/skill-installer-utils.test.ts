import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/main/database", () => ({
  initDatabase: vi.fn(),
}));

import { initDatabase } from "../../../src/main/database";
import { getPlatformById } from "@prompthub/shared/constants/platforms";
import {
  getPlatformSkillsDir,
  validateMCPConfig,
  resolvePlatformPath,
  gitClone,
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
      const getMock = vi.fn().mockReturnValue({
        value: JSON.stringify({ trae: "~/.trae-cn/skills" }),
      });
      vi.mocked(initDatabase).mockReturnValue({
        prepare: vi.fn().mockReturnValue({ get: getMock }),
      } as unknown as ReturnType<typeof initDatabase>);

      const platform = getPlatformById("trae");
      expect(platform).toBeDefined();

      const resolvedPath = getPlatformSkillsDir(platform!);

      expect(getMock).toHaveBeenCalledWith("customSkillPlatformPaths");
      expect(resolvedPath).toContain(".trae-cn/skills");
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
        claude: "/custom/claude/skills",
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

    it("rejects non-HTTPS URL (HTTP)", () => {
      expect(() =>
        gitClone("http://github.com/user/repo", "/tmp/dest"),
      ).toThrow(/Only HTTPS/);
    });

    it("rejects file:// protocol", () => {
      expect(() => gitClone("file:///etc/passwd", "/tmp/dest")).toThrow(
        /Only HTTPS/,
      );
    });

    it("rejects ftp:// protocol", () => {
      expect(() => gitClone("ftp://example.com/repo", "/tmp/dest")).toThrow(
        /Only HTTPS/,
      );
    });

    it("rejects SSH-style URLs (no protocol)", () => {
      // URL constructor will throw for 'git@github.com:user/repo.git'
      expect(() =>
        gitClone("git@github.com:user/repo.git", "/tmp/dest"),
      ).toThrow();
    });
  });
});
