import { expect, it, vi } from "vitest";
import {
  prepareCliShellEnvironment,
  preparePnpmEnvironment,
  withCliDirectories,
} from "../../../src/main/services/cli-install-environment";

it("keeps the inherited environment when the login shell fails or has incomplete output", async () => {
  const env = { PATH: "/usr/bin", PNPM_HOME: "/existing", KEEP: "unchanged" };
  for (const probe of [
    async () => {
      throw new Error("shell unavailable");
    },
    async () => ({ stdout: "banner\0/not-complete\0" }),
  ]) {
    expect(await prepareCliShellEnvironment(probe, env, "darwin")).toEqual(env);
  }
});

it("never invokes a Unix shell on Windows", async () => {
  const probe = vi.fn();
  const env = { Path: "C:\\Node" };
  expect(await prepareCliShellEnvironment(probe, env, "win32")).toEqual(env);
  expect(probe).not.toHaveBeenCalled();
});

it("uses the configured global bin directory and preserves the original Windows environment", async () => {
  const env = {
    Path: "C:\\Windows",
    PATH: "C:\\Node",
    PNPM_HOME: "C:\\pnpm",
    KEEP: "original",
  };
  const probe = vi.fn(async (args: string[], child: NodeJS.ProcessEnv) => {
    if (args[0] === "config") return { stdout: "D:\\Global Tools\\bin\n" };
    expect(child.Path).toBeUndefined();
    expect(child.PATH?.split(";")).toContain("D:\\Global Tools\\bin");
    return { stdout: "D:\\Global Tools\\bin" };
  });
  const result = await preparePnpmEnvironment(probe, env, "win32");
  expect(result.globalBinDirectory).toBe("D:\\Global Tools\\bin");
  expect(result.env.PATH?.split(";")).toEqual([
    "D:\\Global Tools\\bin",
    "C:\\pnpm",
    "C:\\pnpm\\bin",
    "C:\\Windows",
    "C:\\Node",
  ]);
  expect(result.env.KEEP).toBe("original");
  expect(env.Path).toBe("C:\\Windows");
  expect(env.PATH).toBe("C:\\Node");
});

it("uses pnpm's reported bin subdirectory on Unix", async () => {
  const result = await preparePnpmEnvironment(
    async (args, env) => {
      if (args[0] === "config") return { stdout: "undefined" };
      expect(env.PATH).toBe("/home/test/pnpm:/home/test/pnpm/bin:/usr/bin");
      return { stdout: "/home/test/pnpm/bin" };
    },
    { PNPM_HOME: "/home/test/pnpm", PATH: "/usr/bin" },
    "linux",
  );
  expect(result.globalBinDirectory).toBe("/home/test/pnpm/bin");
});

it("does not add relative, multiline or empty probe output to PATH", async () => {
  const result = await preparePnpmEnvironment(
    async () => ({ stdout: "../other\n/untrusted" }),
    { PATH: "/usr/bin", PNPM_HOME: "relative" },
    "linux",
  );
  expect(result).toEqual({
    env: { PATH: "/usr/bin", PNPM_HOME: "relative" },
    globalBinDirectory: null,
  });
  expect(
    withCliDirectories({ PATH: "/usr/bin", Path: "unchanged" }, [], "linux"),
  ).toEqual({ PATH: "/usr/bin", Path: "unchanged" });
});
