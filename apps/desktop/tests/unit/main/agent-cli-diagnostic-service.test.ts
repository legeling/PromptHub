import { describe, expect, it, vi } from "vitest";

import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
import { getPlatformById } from "@prompthub/shared/constants/platforms";
import { diagnoseAgentCli } from "../../../src/main/services/agent-cli-diagnostic-service";

const platform: SkillPlatform = {
  id: "codex",
  name: "Codex",
  icon: "Terminal",
  rootDir: {
    darwin: "~/.codex",
    win32: "%USERPROFILE%\\.codex",
    linux: "~/.codex",
  },
  skillsRelativePath: "skills",
  cli: {
    executableCandidates: ["codex", "codex-cli"],
    versionArgs: ["--version"],
    evidence: "official-codex-cli",
  },
};

function dependencies(
  overrides: Partial<Parameters<typeof diagnoseAgentCli>[1]> = {},
): Parameters<typeof diagnoseAgentCli>[1] {
  return {
    now: () => 1_700_000_000_000,
    resolve: vi.fn(async (command) => `/Users/test/.local/bin/${command}`),
    run: vi.fn(async () => ({
      stdout: "codex-cli 0.137.0\n",
      stderr: "",
    })),
    ...overrides,
  };
}

describe("Agent CLI diagnostic service", () => {
  it("diagnoses the native Antigravity executable through the platform registry", async () => {
    const antigravity = getPlatformById("antigravity");
    if (!antigravity) throw new Error("Missing Antigravity platform");
    const deps = dependencies({
      run: vi.fn(async () => ({
        stdout: "Antigravity CLI 2.0.0\n",
        stderr: "",
      })),
    });
    const result = await diagnoseAgentCli(antigravity, deps);
    expect(result).toMatchObject({
      agentId: "antigravity",
      status: "installed",
      executablePath: "/Users/test/.local/bin/agy",
      version: "Antigravity CLI 2.0.0",
      canUpdate: false,
    });
    expect(deps.resolve).toHaveBeenCalledWith("agy");
  });
  it("returns a bounded public version result for the first resolved candidate", async () => {
    const deps = dependencies();

    await expect(diagnoseAgentCli(platform, deps)).resolves.toEqual({
      agentId: "codex",
      status: "installed",
      executablePath: "/Users/test/.local/bin/codex",
      version: "codex-cli 0.137.0",
      installSource: "user-local",
      errorCode: null,
      checkedAt: 1_700_000_000_000,
      canUpdate: false,
    });
    expect(deps.resolve).toHaveBeenCalledTimes(1);
    expect(deps.run).toHaveBeenCalledWith(
      "/Users/test/.local/bin/codex",
      ["--version"],
      { timeout: 5_000, maxBuffer: 64 * 1024 },
    );
  });

  it("falls back to the next allowlisted executable candidate", async () => {
    const resolve = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("/opt/homebrew/bin/codex-cli");
    const deps = dependencies({ resolve });

    const result = await diagnoseAgentCli(platform, deps);

    expect(result).toMatchObject({
      status: "installed",
      executablePath: "/opt/homebrew/bin/codex-cli",
      installSource: "homebrew",
    });
    expect(resolve.mock.calls.map(([candidate]) => candidate)).toEqual([
      "codex",
      "codex-cli",
    ]);
  });

  it("classifies package-manager and version-manager paths without treating them as commands", async () => {
    const paths = [
      ["/Users/test/.nvm/versions/node/v22/bin/codex", "node-version-manager"],
      ["/Users/test/.volta/bin/codex", "node-version-manager"],
      ["/Users/test/.local/share/pnpm/codex", "pnpm"],
      ["C:\\Users\\test\\AppData\\Roaming\\npm\\codex.cmd", "npm"],
      ["/usr/local/bin/codex", "system"],
      ["/opt/local/bin/codex", "system"],
      ["C:\\Program Files\\Codex\\codex.exe", "system"],
      ["/Applications/Codex.app/Contents/MacOS/codex", "unknown"],
    ] as const;

    for (const [resolvedPath, installSource] of paths) {
      const result = await diagnoseAgentCli(
        platform,
        dependencies({ resolve: vi.fn(async () => resolvedPath) }),
      );
      expect(result.installSource, resolvedPath).toBe(installSource);
    }
  });

  it("returns unsupported without resolving a command when no descriptor exists", async () => {
    const deps = dependencies();

    await expect(
      diagnoseAgentCli({ ...platform, cli: undefined }, deps),
    ).resolves.toEqual({
      agentId: "codex",
      status: "unsupported",
      executablePath: null,
      version: null,
      installSource: null,
      errorCode: "unsupported",
      checkedAt: 1_700_000_000_000,
      canUpdate: false,
    });
    expect(deps.resolve).not.toHaveBeenCalled();
    expect(deps.run).not.toHaveBeenCalled();
  });

  it("returns not-installed after every declared candidate is unresolved", async () => {
    const deps = dependencies({ resolve: vi.fn(async () => null) });

    await expect(diagnoseAgentCli(platform, deps)).resolves.toMatchObject({
      status: "not-installed",
      executablePath: null,
      version: null,
      errorCode: "not-found",
    });
    expect(deps.run).not.toHaveBeenCalled();
  });

  it("classifies timeout, output limits and non-zero exits without leaking process errors", async () => {
    for (const [error, errorCode] of [
      [
        Object.assign(new Error("token=secret-timeout"), { killed: true }),
        "timeout",
      ],
      [
        Object.assign(new Error("token=secret-timeout"), { code: "ETIMEDOUT" }),
        "timeout",
      ],
      [
        Object.assign(new Error("token=secret-timeout"), { signal: "SIGTERM" }),
        "timeout",
      ],
      [
        Object.assign(new Error("api_key=secret-buffer"), {
          code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
        }),
        "output-limit",
      ],
      [
        Object.assign(new Error("api_key=secret-buffer"), { code: "ENOBUFS" }),
        "output-limit",
      ],
      [
        Object.assign(new Error("Authorization: Bearer secret"), { code: 7 }),
        "command-failed",
      ],
      ["not-an-error-object", "command-failed"],
    ] as const) {
      const result = await diagnoseAgentCli(
        platform,
        dependencies({
          run: vi.fn(async () => {
            throw error;
          }),
        }),
      );

      expect(result).toMatchObject({
        status: "unhealthy",
        executablePath: "/Users/test/.local/bin/codex",
        version: null,
        errorCode,
      });
      expect(JSON.stringify(result)).not.toContain("secret");
      expect(JSON.stringify(result)).not.toContain("Bearer");
    }
  });

  it("normalizes one line and caps version text returned to renderer", async () => {
    const result = await diagnoseAgentCli(
      platform,
      dependencies({
        run: vi.fn(async () => ({
          stdout: `  Codex\tCLI ${"1".repeat(400)}\nTOKEN=should-not-return`,
          stderr: "",
        })),
      }),
    );

    expect(result.version).toHaveLength(160);
    expect(result.version).toMatch(/^Codex CLI 1+$/);
    expect(JSON.stringify(result)).not.toContain("TOKEN");
  });

  it("uses a bounded stderr version line when stdout is empty", async () => {
    const result = await diagnoseAgentCli(
      platform,
      dependencies({
        run: vi.fn(async () => ({
          stdout: "",
          stderr: "kimi 0.17.1\nwarning: ignored",
        })),
      }),
    );

    expect(result).toMatchObject({
      status: "installed",
      version: "kimi 0.17.1",
    });
  });

  it("rejects a version line that appears to contain a credential", async () => {
    const result = await diagnoseAgentCli(
      platform,
      dependencies({
        run: vi.fn(async () => ({
          stdout: "Authorization: Bearer should-never-reach-renderer",
          stderr: "",
        })),
      }),
    );

    expect(result).toMatchObject({
      status: "unhealthy",
      version: null,
      errorCode: "invalid-output",
    });
    expect(JSON.stringify(result)).not.toContain("should-never");
    expect(JSON.stringify(result)).not.toContain("Bearer");
  });

  it("treats empty stdout and stderr as invalid version output", async () => {
    const result = await diagnoseAgentCli(
      platform,
      dependencies({
        run: vi.fn(async () => ({ stdout: "", stderr: "" })),
      }),
    );

    expect(result).toMatchObject({
      status: "unhealthy",
      version: null,
      errorCode: "invalid-output",
    });
  });
});
