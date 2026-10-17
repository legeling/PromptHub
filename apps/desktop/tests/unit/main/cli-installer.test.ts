import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const { execFileMock, userDataPath, appRuntime, releaseLookup } =
  await vi.hoisted(async () => {
    const os = await import("node:os");
    const paths = await import("node:path");
    return {
      execFileMock: vi.fn(),
      appRuntime: { isPackaged: true },
      releaseLookup: vi.fn(),
      userDataPath: paths.join(
        os.tmpdir(),
        `prompthub-cli-installer-${process.pid}`,
      ),
    };
  });

vi.mock("../../../src/main/services/cli-install-source", () => ({
  resolveCliInstallSource: releaseLookup,
}));

vi.mock("electron", () => ({
  app: {
    get isPackaged() {
      return appRuntime.isPackaged;
    },
    getAppPath: () => path.join(userDataPath, "workspace", "apps", "desktop"),
    getVersion: () => "0.6.0",
    getPath: (name: string) => {
      if (name !== "userData") throw new Error(`Unexpected path: ${name}`);
      return userDataPath;
    },
  },
}));

vi.mock("node:child_process", () => ({
  default: {
    execFile: execFileMock,
  },
  execFile: execFileMock,
}));

import {
  getCliStatus,
  installCli,
} from "../../../src/main/services/cli-installer";

const originalPlatform = process.platform;

function mockPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
  });
}

describe("cli-installer", () => {
  it("checks an installed CLI without waiting for remote releases", async () => {
    releaseLookup.mockImplementation(() => new Promise(() => undefined));
    execFileMock.mockImplementation((command, args, _options, callback) => {
      if (args[0] === "-lc")
        return callback(null, "/usr/local/bin/prompthub", "");
      return callback(
        null,
        command.endsWith("prompthub") ? "0.5.9" : "9.15.0",
        "",
      );
    });
    await expect(getCliStatus()).resolves.toMatchObject({
      installed: true,
      version: "0.5.9",
      error: undefined,
    });
    expect(releaseLookup).not.toHaveBeenCalled();
    expect(
      execFileMock.mock.calls.every(([, , options]) => options.timeout <= 3000),
    ).toBe(true);
  });

  beforeEach(() => {
    appRuntime.isPackaged = true;
    releaseLookup.mockReset().mockResolvedValue({
      releaseTag: "v0.5.9",
      location:
        "https://github.com/legeling/PromptHub/releases/download/v0.5.9/prompthub-cli-0.5.9.tgz",
    });
    fs.rmSync(userDataPath, { recursive: true, force: true });
    mockPlatform("darwin");
    execFileMock.mockReset();
    execFileMock.mockImplementation(
      (
        _command: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        callback(new Error("command not found"), "", "");
      },
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(userDataPath, { recursive: true, force: true });
    mockPlatform(originalPlatform);
  });

  it.each(["pnpm", "npm"] as const)(
    "installs the published CLI with %s independently of the desktop version",
    async (method) => {
      appRuntime.isPackaged = false;
      execFileMock.mockImplementation(
        (
          command: string,
          args: string[],
          _options: unknown,
          callback: (
            error: Error | null,
            stdout: string,
            stderr: string,
          ) => void,
        ) => {
          if (["pnpm", "npm"].includes(command) && args[0] === "--version")
            return callback(null, "9.15.0", "");
          if (args[0] === "add" || args[0] === "install") {
            expect(command).toBe(method);
            expect(args[2]).toBe(
              "https://github.com/legeling/PromptHub/releases/download/v0.5.9/prompthub-cli-0.5.9.tgz",
            );
            return callback(null, "installed", "");
          }
          callback(new Error("not found"), "", "");
        },
      );
      const status = await getCliStatus();
      expect(status.releaseTag).toBe("v0.5.9");
      expect(status.manualInstallCommands[method]).not.toContain("0.6.0");
      expect(await installCli(method)).toMatchObject({ success: true });
      expect(
        execFileMock.mock.calls.some(([, args]) => args.includes("pack")),
      ).toBe(false);
    },
  );

  it("reports release lookup failure without building or installing a guessed source", async () => {
    releaseLookup.mockRejectedValue(
      new Error("CLI release lookup failed: HTTP 403"),
    );
    const status = await getCliStatus();
    expect(status.installSource).toBe("");
    expect(status.manualInstallCommands).toEqual({ pnpm: "", npm: "" });
    expect(await installCli("pnpm")).toMatchObject({
      success: false,
      errorCode: "network",
    });
    expect(
      execFileMock.mock.calls.some(([, args]) =>
        ["add", "install", "pack"].includes(args[0]),
      ),
    ).toBe(false);
  });

  it("installs with the pnpm home on the child PATH and detects the installed command there", async () => {
    mockPlatform("win32");
    vi.stubEnv("PNPM_HOME", "E:\\Dev Tools\\pnpm");
    const originalPath = process.env.PATH;
    let installed = false;
    execFileMock.mockImplementation(
      (
        command: string,
        args: string[],
        options: { env: NodeJS.ProcessEnv },
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        if (command === "pnpm" && args[0] === "--version")
          return callback(null, "9.15.0", "");
        if (command === "pnpm" && args[0] === "config")
          return callback(null, "undefined", "");
        const childPath = options.env.PATH ?? "";
        if (command === "pnpm" && args[0] === "bin") {
          return childPath.split(";").includes("E:\\Dev Tools\\pnpm")
            ? callback(null, "E:\\Dev Tools\\pnpm", "")
            : callback(
                new Error("global bin directory is not in PATH"),
                "",
                "",
              );
        }
        if (command === "pnpm" && args[0] === "add") {
          if (!childPath.split(";").includes("E:\\Dev Tools\\pnpm"))
            return callback(
              new Error("global bin directory is not in PATH"),
              "",
              "",
            );
          installed = true;
          return callback(null, "installed", "");
        }
        if (installed && command === '"E:\\Dev Tools\\pnpm\\prompthub.cmd"')
          return callback(null, "0.5.9", "");
        callback(new Error("command not found"), "", "");
      },
    );
    expect(await installCli("pnpm")).toMatchObject({ success: true });
    expect(await getCliStatus()).toMatchObject({
      installed: true,
      version: "0.5.9",
      globalBinDirectory: "E:\\Dev Tools\\pnpm",
    });
    expect(process.env.PATH).toBe(originalPath);
  });

  it("captures stderr and classifies an unresolved pnpm environment failure", async () => {
    execFileMock.mockImplementation(
      (
        command: string,
        args: string[],
        _options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        if (command === "pnpm" && args[0] === "--version")
          return callback(null, "9.15.0", "");
        if (command === "pnpm" && args[0] === "add")
          return callback(
            new Error("Command failed"),
            "",
            "ERR_PNPM_NO_GLOBAL_BIN_DIR: Unable to find global bin directory",
          );
        callback(new Error("command not found"), "", "");
      },
    );
    expect(await installCli("pnpm")).toMatchObject({
      success: false,
      errorCode: "environment",
      stderr: "ERR_PNPM_NO_GLOBAL_BIN_DIR: Unable to find global bin directory",
    });
  });

  function writeLegacyWrapper(): string {
    const wrapperPath = path.join(userDataPath, "bin", "prompthub");
    fs.mkdirSync(path.dirname(wrapperPath), { recursive: true });
    fs.writeFileSync(
      wrapperPath,
      [
        "#!/bin/sh",
        'exec "/Applications/PromptHub.app/Contents/MacOS/PromptHub" --cli "$@"',
        "",
      ].join("\n"),
      { encoding: "utf8", mode: 0o755 },
    );
    return wrapperPath;
  }

  it("classifies the retired desktop wrapper without executing Electron", async () => {
    const wrapperPath = writeLegacyWrapper();
    execFileMock.mockImplementation(
      (
        command: string,
        args: string[],
        _options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        if (args.join(" ") === "-lc command -v prompthub") {
          callback(null, `${wrapperPath}\n`, "");
          return;
        }
        callback(new Error(`command not found: ${command}`), "", "");
      },
    );

    const status = await getCliStatus();

    expect(status).toMatchObject({
      installed: false,
      legacyCommandPath: wrapperPath,
    });
    expect(
      execFileMock.mock.calls.some(
        ([command, args]) =>
          (command === wrapperPath || command === "prompthub") &&
          Array.isArray(args) &&
          args.includes("--version"),
      ),
    ).toBe(false);
  });

  it("ignores oversized files at the retired wrapper path", async () => {
    const wrapperPath = path.join(userDataPath, "bin", "prompthub");
    fs.mkdirSync(path.dirname(wrapperPath), { recursive: true });
    fs.writeFileSync(
      wrapperPath,
      `#!/bin/sh\n${"#".repeat(5_000)}\nPromptHub --cli \"$@\"\n`,
      "utf8",
    );

    const status = await getCliStatus();

    expect(status.legacyCommandPath).toBeNull();
    expect(fs.existsSync(wrapperPath)).toBe(true);
  });

  it.each(["win32", "darwin"] as const)(
    "resolves CLI paths before probing and skips an old wrapper outside userData on %s",
    async (platform) => {
      mockPlatform(platform);
      const wrapper = path.join(
        userDataPath,
        "old-profile",
        platform === "win32" ? "prompthub.cmd" : "prompthub",
      );
      const standalone = path.join(
        userDataPath,
        "standalone",
        platform === "win32" ? "prompthub.cmd" : "prompthub",
      );
      fs.mkdirSync(path.dirname(wrapper), { recursive: true });
      fs.writeFileSync(
        wrapper,
        platform === "win32"
          ? '@echo off\n"D:\\Apps\\PromptHub.exe" --cli %*\n'
          : '#!/bin/sh\nexec "/Applications/PromptHub.app/Contents/MacOS/PromptHub" --cli "$@"\n',
      );
      execFileMock.mockImplementation(
        (
          command: string,
          args: string[],
          _options: unknown,
          callback: (
            error: Error | null,
            stdout: string,
            stderr: string,
          ) => void,
        ) => {
          if (command === "where.exe" && args[0] === "prompthub")
            return callback(null, `${wrapper}\n${standalone}\n`, "");
          if (args.join(" ") === "-lc command -v prompthub")
            return callback(null, wrapper, "");
          if (command === standalone) return callback(null, "0.5.9", "");
          if (command === "prompthub")
            return callback(null, "desktop-started", "");
          callback(new Error("not found"), "", "");
        },
      );
      const status = await getCliStatus();
      expect(status.installed).toBe(platform === "win32");
      expect(status.version).toBe(platform === "win32" ? "0.5.9" : null);
      expect(
        execFileMock.mock.calls.some(
          ([command, args]) =>
            (command === "prompthub" || command === wrapper) &&
            args.includes("--version"),
        ),
      ).toBe(false);
      expect(fs.existsSync(wrapper)).toBe(true);
    },
  );

  it("does not launch the desktop executable returned by Windows command lookup", async () => {
    mockPlatform("win32");
    execFileMock.mockImplementation(
      (
        command: string,
        args: string[],
        _options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        if (command === "where.exe" && args[0] === "prompthub")
          return callback(null, "D:\\Apps\\PromptHub.exe\n", "");
        callback(new Error("not found"), "", "");
      },
    );
    expect((await getCliStatus()).installed).toBe(false);
    expect(
      execFileMock.mock.calls.some(
        ([command]) => command === "D:\\Apps\\PromptHub.exe",
      ),
    ).toBe(false);
  });

  it("removes the exact legacy wrapper only after standalone installation succeeds", async () => {
    const wrapperPath = writeLegacyWrapper();
    execFileMock.mockImplementation(
      (
        command: string,
        args: string[],
        _options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        if (command === "pnpm" && args.join(" ") === "--version") {
          callback(null, "10.0.0\n", "");
          return;
        }
        if (command === "pnpm" && args[0] === "add") {
          callback(null, "installed\n", "");
          return;
        }
        callback(new Error("command not found"), "", "");
      },
    );

    const result = await installCli("pnpm");

    expect(result).toMatchObject({
      success: true,
      removedLegacyCommand: true,
    });
    expect(fs.existsSync(wrapperPath)).toBe(false);
  });

  it("preserves the legacy wrapper when standalone installation fails", async () => {
    const wrapperPath = writeLegacyWrapper();
    execFileMock.mockImplementation(
      (
        command: string,
        args: string[],
        _options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        if (command === "pnpm" && args.join(" ") === "--version") {
          callback(null, "10.0.0\n", "");
          return;
        }
        callback(new Error("install failed"), "", "");
      },
    );

    const result = await installCli("pnpm");

    expect(result.success).toBe(false);
    expect(fs.existsSync(wrapperPath)).toBe(true);
  });

  it("preserves an unrelated command file at the retired wrapper path", async () => {
    const wrapperPath = path.join(userDataPath, "bin", "prompthub");
    fs.mkdirSync(path.dirname(wrapperPath), { recursive: true });
    fs.writeFileSync(wrapperPath, "#!/bin/sh\necho custom-command\n", "utf8");
    execFileMock.mockImplementation(
      (
        command: string,
        args: string[],
        _options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        if (command === "pnpm" && args.join(" ") === "--version") {
          callback(null, "10.0.0\n", "");
          return;
        }
        if (command === "pnpm" && args[0] === "add") {
          callback(null, "installed\n", "");
          return;
        }
        callback(new Error("command not found"), "", "");
      },
    );

    const result = await installCli("pnpm");

    expect(result).toMatchObject({
      success: true,
      removedLegacyCommand: false,
    });
    expect(fs.readFileSync(wrapperPath, "utf8")).toContain("custom-command");
  });

  it("rechecks the wrapper before cleanup and preserves a replacement", async () => {
    const wrapperPath = writeLegacyWrapper();
    execFileMock.mockImplementation(
      (
        command: string,
        args: string[],
        _options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        if (command === "pnpm" && args.join(" ") === "--version") {
          callback(null, "10.0.0\n", "");
          return;
        }
        if (command === "pnpm" && args[0] === "add") {
          fs.writeFileSync(
            wrapperPath,
            "#!/bin/sh\necho user-replacement\n",
            "utf8",
          );
          callback(null, "installed\n", "");
          return;
        }
        callback(new Error("command not found"), "", "");
      },
    );

    const result = await installCli("pnpm");

    expect(result).toMatchObject({
      success: true,
      removedLegacyCommand: false,
    });
    expect(fs.readFileSync(wrapperPath, "utf8")).toContain("user-replacement");
  });

  it("does not run the install command when the requested package manager is not on PATH", async () => {
    const result = await installCli("pnpm");

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        method: "pnpm",
        error: "CLI_PACKAGE_MANAGER_NOT_FOUND",
      }),
    );
    expect(
      execFileMock.mock.calls.some(
        ([command, args]) =>
          command === "pnpm" && Array.isArray(args) && args.includes("add"),
      ),
    ).toBe(false);
  });

  it("returns a manual-install result when no package manager is available", async () => {
    const result = await installCli();

    expect(result).toEqual({
      success: false,
      method: "npm",
      command: "",
      error: "Neither pnpm nor npm is available on PATH.",
    });
  });

  it("uses bounded probes and installation timeouts for npm", async () => {
    execFileMock.mockImplementation(
      (
        command: string,
        args: string[],
        _options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        if (command === "npm" && args.join(" ") === "--version") {
          callback(null, "10.8.2\n", "");
          return;
        }
        if (command === "npm" && args[0] === "install") {
          callback(null, "installed\n", "");
          return;
        }
        callback(new Error("command not found"), "", "");
      },
    );

    const result = await installCli("npm");

    expect(result).toMatchObject({
      success: true,
      method: "npm",
      removedLegacyCommand: false,
    });
    const versionProbe = execFileMock.mock.calls.find(
      ([command, args]) =>
        command === "npm" && Array.isArray(args) && args[0] === "--version",
    );
    const installation = execFileMock.mock.calls.find(
      ([command, args]) =>
        command === "npm" && Array.isArray(args) && args[0] === "install",
    );
    expect(versionProbe?.[2]).toMatchObject({ timeout: 3_000 });
    expect(installation?.[2]).toMatchObject({ timeout: 120_000 });
  });

  it("includes manual install commands even when no package manager is detected", async () => {
    const status = await getCliStatus();

    expect(status.packageManager).toBeNull();
    expect(status.installCommand).toBeNull();
    expect(status.manualInstallCommands).toEqual({
      pnpm: "pnpm add -g https://github.com/legeling/PromptHub/releases/download/v0.5.9/prompthub-cli-0.5.9.tgz",
      npm: "npm install -g https://github.com/legeling/PromptHub/releases/download/v0.5.9/prompthub-cli-0.5.9.tgz",
    });
  });

  it("detects pnpm from the user's login shell when the app PATH is incomplete", async () => {
    execFileMock.mockImplementation(
      (
        command: string,
        args: string[],
        _options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        if (
          command === "pnpm" ||
          command === "npm" ||
          command === "prompthub"
        ) {
          callback(new Error("command not found"), "", "");
          return;
        }
        if (args.join(" ") === "-lc command -v pnpm") {
          callback(null, "/Users/demo/.local/share/pnpm/pnpm\n", "");
          return;
        }
        if (command === "/Users/demo/.local/share/pnpm/pnpm") {
          callback(null, "9.15.0\n", "");
          return;
        }
        callback(new Error("command not found"), "", "");
      },
    );

    const status = await getCliStatus();

    expect(status.packageManager).toBe("pnpm");
    expect(status.packageManagerVersion).toBe("9.15.0");
    expect(status.packageManagerPath).toBe(
      "/Users/demo/.local/share/pnpm/pnpm",
    );
    expect(status.packageManagerPathSource).toBe("login-shell");
  });

  it("detects the Windows CLI from a custom npm prefix when the app PATH is incomplete", async () => {
    mockPlatform("win32");
    execFileMock.mockImplementation(
      (
        command: string,
        args: string[],
        _options: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        if (command === "prompthub" || command === "pnpm") {
          callback(new Error("command not found"), "", "");
          return;
        }
        if (command === "where.exe" && args[0] === "prompthub") {
          callback(new Error("INFO: Could not find files"), "", "");
          return;
        }
        if (command === "npm" && args.join(" ") === "--version") {
          callback(null, "10.8.2\n", "");
          return;
        }
        if (command === "npm" && args.join(" ") === "config get prefix") {
          callback(null, "D:\\npm-global\n", "");
          return;
        }
        if (command === "D:\\npm-global\\prompthub.cmd") {
          callback(null, "0.5.8-beta.3\n", "");
          return;
        }
        callback(new Error("command not found"), "", "");
      },
    );

    const status = await getCliStatus();

    expect(status.installed).toBe(true);
    expect(status.version).toBe("0.5.8-beta.3");
  });
});
