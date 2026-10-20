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
