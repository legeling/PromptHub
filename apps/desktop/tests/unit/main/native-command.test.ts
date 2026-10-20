import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  createNativeCommandRunner,
  type NativeCommandRunner,
} from "../../../src/main/services/native-command";

interface ResolverOptions {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  accessExecutable(candidate: string): Promise<void>;
  realpath(candidate: string): Promise<string>;
}

function createRunner(options: ResolverOptions): NativeCommandRunner {
  const factory = createNativeCommandRunner as unknown as (
    resolverOptions: ResolverOptions,
  ) => NativeCommandRunner;
  return factory(options);
}

describe("native command resolution", () => {
  it("resolves an allowlisted executable from PATH without running it or a shell", async () => {
    const accessExecutable = vi.fn(async (candidate: string) => {
      if (candidate !== "/second/bin/codex") {
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      }
    });
    const runner = createRunner({
      platform: "darwin",
      env: { PATH: "/first/bin:/second/bin", HOME: "/Users/test" },
      accessExecutable,
      realpath: vi.fn(async (candidate) => `/real${candidate}`),
    });

    await expect(runner.resolve("codex")).resolves.toBe(
      "/real/second/bin/codex",
    );
    expect(accessExecutable).toHaveBeenCalledWith("/first/bin/codex");
    expect(accessExecutable).toHaveBeenCalledWith("/second/bin/codex");
  });

  it("rejects command names that could escape executable lookup", async () => {
    const accessExecutable = vi.fn(async () => undefined);
    const runner = createRunner({
      platform: "linux",
      env: { PATH: "/usr/bin", HOME: "/home/test" },
      accessExecutable,
      realpath: vi.fn(async (candidate) => candidate),
    });

    await expect(runner.resolve("../codex")).resolves.toBeNull();
    await expect(runner.resolve("codex --version")).resolves.toBeNull();
    expect(accessExecutable).not.toHaveBeenCalled();
  });

  it("honors Windows PATHEXT and returns the canonical executable path", async () => {
    const expected = path.win32.join("C:\\Tools", "qwen.CMD");
    const accessExecutable = vi.fn(async (candidate: string) => {
      if (candidate !== expected) {
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      }
    });
    const runner = createRunner({
      platform: "win32",
      env: {
        Path: "C:\\Missing;C:\\Tools",
        PATHEXT: ".EXE;.CMD",
        USERPROFILE: "C:\\Users\\test",
      },
      accessExecutable,
      realpath: vi.fn(async (candidate) => candidate),
    });

    await expect(runner.resolve("qwen")).resolves.toBe(expected);
  });

  it("does not append a second extension to a Windows executable name", async () => {
    const expected = path.win32.join("C:\\Tools", "qwen.CMD");
    const runner = createRunner({
      platform: "win32",
      env: { PATH: "C:\\Tools", PATHEXT: ".EXE;.CMD" },
      accessExecutable: vi.fn(async (candidate) => {
        if (candidate !== expected) throw new Error("missing");
      }),
      realpath: vi.fn(async () => {
        throw new Error("canonical path unavailable");
      }),
    });

    await expect(runner.resolve("qwen.CMD")).resolves.toBe(expected);
  });

  it("uses default Windows extensions and bounded manager paths", async () => {
    const expected = path.win32.join("C:\\pnpm", "omp.CMD");
    const accessExecutable = vi.fn(async (candidate: string) => {
      if (candidate !== expected) throw new Error("missing");
    });
    const runner = createRunner({
      platform: "win32",
      env: {
        PATH: "",
        PNPM_HOME: "C:\\pnpm",
        VOLTA_HOME: "C:\\volta",
        NVM_BIN: "C:\\nvm",
        FNM_MULTISHELL_PATH: "C:\\fnm",
      },
      accessExecutable,
      realpath: vi.fn(async (candidate) => candidate),
    });

    await expect(runner.resolve("omp")).resolves.toBe(expected);
  });

  it("bounds PATH scanning and returns null when no executable is readable", async () => {
    const accessExecutable = vi.fn(async () => {
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    });
    const searchPath = Array.from(
      { length: 400 },
      (_, index) => `/candidate/${index}`,
    ).join(":");
    const runner = createRunner({
      platform: "linux",
      env: { PATH: searchPath, HOME: "/home/test" },
      accessExecutable,
      realpath: vi.fn(async (candidate) => candidate),
    });

    await expect(runner.resolve("opencode")).resolves.toBeNull();
    expect(accessExecutable.mock.calls.length).toBeLessThanOrEqual(270);
  });

  it("falls back to the operating-system home when HOME is absent", async () => {
    const runner = createRunner({
      platform: "linux",
      env: { PATH: "" },
      accessExecutable: vi.fn(async () => {
        throw new Error("missing");
      }),
      realpath: vi.fn(async (candidate) => candidate),
    });

    await expect(runner.resolve("codex")).resolves.toBeNull();
  });

  it("runs a resolved executable without a shell and preserves stdout and stderr", async () => {
    const runner = createNativeCommandRunner();

    await expect(
      runner.run(
        process.execPath,
        [
          "-e",
          "process.stdout.write('version-output'); process.stderr.write('warning-output')",
        ],
        { timeout: 5_000, maxBuffer: 4_096 },
      ),
    ).resolves.toEqual({
      stdout: "version-output",
      stderr: "warning-output",
    });
    await expect(
      runner.run(process.execPath, ["-e", "process.exit(3)"], {
        timeout: 5_000,
        maxBuffer: 4_096,
      }),
    ).rejects.toBeTruthy();
  });

  it("passes an isolated environment and supports aborting a running command", async () => {
    const runner = createNativeCommandRunner();

    await expect(
      runner.run(
        process.execPath,
        ["-e", "process.stdout.write(process.env.PROMPTHUB_NATIVE_TEST || '')"],
        {
          timeout: 5_000,
          maxBuffer: 4_096,
          env: { PROMPTHUB_NATIVE_TEST: "isolated" },
        },
      ),
    ).resolves.toMatchObject({ stdout: "isolated" });

    const controller = new AbortController();
    const pending = runner.run(
      process.execPath,
      ["-e", "setInterval(() => {}, 1_000)"],
      {
        timeout: 5_000,
        maxBuffer: 4_096,
        signal: controller.signal,
      },
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("uses the default filesystem resolver for the current Node executable", async () => {
    const runner = createNativeCommandRunner({
      platform: process.platform,
      env: {
        ...process.env,
        PATH: path.dirname(process.execPath),
      },
    });

    await expect(runner.resolve(path.basename(process.execPath))).resolves.toBe(
      process.execPath,
    );
  });
});
