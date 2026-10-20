import { describe, expect, it, vi } from "vitest";
import { createCodexPluginRunner } from "../src/codex-plugins/runtime";
import { getPlatformById } from "@prompthub/shared/constants/platforms";

describe("Codex plugin runtime discovery", () => {
  it("uses the installed desktop runtime before an unrelated PATH CLI", async () => {
    const bundled =
      getPlatformById("codex")!.cli!.bundledExecutablePaths!.darwin![0];
    const standalone = {
      resolve: vi.fn(async () => "/cli/codex"),
      run: vi.fn(),
    };
    const runner = createCodexPluginRunner({
      platform: "darwin",
      environment: { HOME: "/Users/test" },
      standalone,
      accessExecutable: async (candidate) => {
        if (candidate !== bundled) throw new Error("missing");
      },
    });
    expect(await runner.resolve("codex")).toBe(bundled);
    expect(standalone.resolve).not.toHaveBeenCalled();
    expect(await runner.resolve("claude")).toBe("/cli/codex");
    expect(standalone.resolve).toHaveBeenCalledWith("claude");
  });

  it("supports per-user desktop installs and standalone-only hosts", async () => {
    const standalone = {
      resolve: vi.fn(async () => "/cli/codex"),
      run: vi.fn(),
    };
    const runner = createCodexPluginRunner({
      platform: "darwin",
      environment: { HOME: "/Users/test" },
      standalone,
      accessExecutable: async (candidate) => {
        if (
          candidate !==
          "/Users/test/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex"
        )
          throw new Error("missing");
      },
    });
    expect(await runner.resolve("codex")).toContain(
      "/Users/test/Applications/ChatGPT.app/",
    );
    const linux = createCodexPluginRunner({ platform: "linux", standalone });
    expect(await linux.resolve("codex")).toBe("/cli/codex");
  });
});

it("discovers the registered Windows Store package without a versioned path (#244)", async () => {
  const executable =
    "C:\\Program Files\\WindowsApps\\OpenAI.Codex_fixture\\app\\resources\\codex.exe";
  const standalone = {
    resolve: vi.fn(async (command: string) =>
      command === "powershell.exe" ? "C:\\Windows\\powershell.exe" : null,
    ),
    run: vi.fn(async (_command: string, _args: string[]) => ({
      stdout: "C:\\Program Files\\WindowsApps\\OpenAI.Codex_fixture\r\n",
      stderr: "",
    })),
  };
  const runner = createCodexPluginRunner({
    platform: "win32",
    environment: { USERPROFILE: "C:\\Users\\test" },
    standalone,
    accessExecutable: async (candidate) => {
      if (candidate !== executable) throw new Error("missing");
    },
  });
  expect(await runner.resolve("codex")).toBe(executable);
  expect(standalone.run.mock.calls[0]?.[1]).toContain(
    "Get-AppxPackage -Name 'OpenAI.Codex' | Select-Object -ExpandProperty InstallLocation",
  );
});

it("uses the active VS Code extension runtime, ignoring stale extension directories", async () => {
  const executable =
    "/Users/test/.vscode/extensions/openai.chatgpt-active/bin/macos-aarch64/codex";
  const runner = createCodexPluginRunner({
    platform: "darwin",
    arch: "arm64",
    environment: { HOME: "/Users/test" },
    standalone: { resolve: async () => null, run: vi.fn() },
    readFile: async () =>
      JSON.stringify([
        {
          identifier: { id: "openai.chatgpt" },
          relativeLocation: "openai.chatgpt-active",
        },
      ]),
    accessExecutable: async (candidate) => {
      if (candidate !== executable) throw new Error("missing");
    },
  });
  expect(await runner.resolve("codex")).toBe(executable);
});

it("rejects extension index paths escaping the installed extension directory", async () => {
  const runner = createCodexPluginRunner({
    platform: "linux",
    arch: "x64",
    environment: { HOME: "/test" },
    standalone: { resolve: async () => "/bin/codex", run: vi.fn() },
    readFile: async () =>
      JSON.stringify([
        {
          identifier: { id: "openai.chatgpt" },
          relativeLocation: "../elsewhere",
        },
      ]),
    accessExecutable: async () => {
      throw new Error("missing");
    },
  });
  expect(await runner.resolve("codex")).toBe("/bin/codex");
});
