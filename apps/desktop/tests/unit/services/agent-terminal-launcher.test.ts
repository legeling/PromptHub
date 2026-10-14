/**
 * @vitest-environment node
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentTerminalLauncher } from "../../../src/main/services/agent-terminal-launcher";

const createdRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("createAgentTerminalLauncher", () => {
  it("passes all declared native roots through a real shell without interpolation", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "agent-resume-env-"),
    );
    createdRoots.push(tempRoot);
    const environment = {
      CODEX_HOME: "/fixture/a 'quoted' $(false)",
      GROK_HOME: "/fixture/grok",
      PI_CODING_AGENT_DIR: "/fixture/pi",
      QWEN_RUNTIME_DIR: "/fixture/qwen",
    };
    let output = "";
    const launcher = createAgentTerminalLauncher({
      platform: "darwin",
      tempRoot,
      scheduleCleanup: () => undefined,
      openPath: async (script) => {
        output = (
          await promisify(execFile)("/bin/sh", [script], {
            timeout: 5000,
            env: { PATH: "/usr/bin:/bin", CODEX_HOME: "/wrong" },
          })
        ).stdout;
        return "";
      },
    });
    await launcher.launch({
      executable: "/usr/bin/env",
      args: [],
      environment,
    });
    for (const [key, value] of Object.entries(environment))
      expect(output.split("\n")).toContain(`${key}=${value}`);
    expect(await fs.readdir(tempRoot)).toEqual([]);
  });

  it("stores arguments outside the macOS command script and opens it", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "prompthub-terminal-test-"),
    );
    createdRoots.push(tempRoot);
    const openPath = vi.fn<(filePath: string) => Promise<string>>(
      async () => "",
    );
    const launcher = createAgentTerminalLauncher({
      platform: "darwin",
      tempRoot,
      openPath,
    });
    const secretPayload = "Continue this; rm -rf /; token=sk-test-secret";

    await launcher.launch({
      executable: "/opt/homebrew/bin/codex",
      args: [secretPayload],
      cwd: "/Users/test/My Project",
    });

    const scriptPath = openPath.mock.calls[0]?.[0];
    expect(scriptPath).toMatch(/launch\.command$/);
    const script = await fs.readFile(scriptPath!, "utf8");
    expect(script).not.toContain(secretPayload);
    expect(script).toContain("arg-0");
    expect(script).toContain("/opt/homebrew/bin/codex");
    const argument = await fs.readFile(
      path.join(path.dirname(scriptPath!), "arg-0"),
      "utf8",
    );
    expect(argument).toBe(secretPayload);
  });

  it("rejects relative executables, null bytes, and unsupported platforms", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "prompthub-terminal-test-"),
    );
    createdRoots.push(tempRoot);
    const darwin = createAgentTerminalLauncher({
      platform: "darwin",
      tempRoot,
      openPath: vi.fn(async () => ""),
    });
    await expect(
      darwin.launch({ executable: "codex", args: [], cwd: "/tmp" }),
    ).rejects.toThrow("EXECUTABLE_INVALID");
    await expect(
      darwin.launch({
        executable: "/usr/bin/codex",
        args: ["bad\0arg"],
        cwd: "/tmp",
      }),
    ).rejects.toThrow("ARGUMENT_INVALID");

    const linux = createAgentTerminalLauncher({
      platform: "linux",
      tempRoot,
      openPath: vi.fn(async () => ""),
    });
    await expect(
      linux.launch({ executable: "/usr/bin/codex", args: [], cwd: "/tmp" }),
    ).rejects.toThrow("TERMINAL_UNSUPPORTED");
  });

  it("removes staged files when the operating system cannot open the script", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "prompthub-terminal-test-"),
    );
    createdRoots.push(tempRoot);
    const launcher = createAgentTerminalLauncher({
      platform: "darwin",
      tempRoot,
      openPath: vi.fn(async () => "No application can open the file"),
    });
    await expect(
      launcher.launch({
        executable: "/usr/bin/claude",
        args: ["--resume", "session-1"],
        cwd: "/tmp",
      }),
    ).rejects.toThrow("TERMINAL_OPEN_FAILED");
    expect(await fs.readdir(tempRoot)).toEqual([]);
  });

  it("schedules expiry cleanup when the terminal never executes the script", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "prompthub-terminal-test-"),
    );
    createdRoots.push(tempRoot);
    let cleanup: (() => Promise<void>) | null = null;
    const scheduleCleanup = vi.fn((operation: () => Promise<void>) => {
      cleanup = operation;
    });
    const launcher = createAgentTerminalLauncher({
      platform: "darwin",
      tempRoot,
      openPath: vi.fn(async () => ""),
      scheduleCleanup,
    });

    await launcher.launch({
      executable: "/usr/bin/claude",
      args: ["portable context"],
      cwd: "/tmp",
    });
    expect(scheduleCleanup).toHaveBeenCalledWith(expect.any(Function), 900_000);
    expect(await fs.readdir(tempRoot)).toHaveLength(1);
    await cleanup!();
    expect(await fs.readdir(tempRoot)).toEqual([]);
  });
});
