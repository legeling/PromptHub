import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupportedPlatformsMock = vi.fn();
const getBuiltinAgentOverrideMock = vi.fn();
const getPlatformRootDirMock = vi.fn();

vi.mock("../../../src/main/services/skill-installer", () => ({
  SkillInstaller: {
    getSupportedPlatforms: getSupportedPlatformsMock,
  },
}));

vi.mock("../../../src/main/services/skill-installer-utils", () => ({
  getBuiltinAgentOverride: getBuiltinAgentOverrideMock,
  getPlatformRootDir: getPlatformRootDirMock,
}));

async function loadModule() {
  vi.resetModules();
  return import("../../../src/main/services/agent-platform-context");
}

describe("Agent platform context", () => {
  beforeEach(() => {
    getSupportedPlatformsMock.mockReset();
    getBuiltinAgentOverrideMock.mockReset();
    getPlatformRootDirMock.mockReset();
    getSupportedPlatformsMock.mockReturnValue([
      {
        id: "codex",
        configFiles: ["config.toml", "./profiles//work.toml"],
      },
    ]);
    getPlatformRootDirMock.mockReturnValue("/Users/test/.codex");
  });

  it("resolves one canonical main-owned provider context", async () => {
    const { resolveAgentProviderContext } = await loadModule();

    expect(resolveAgentProviderContext(" codex ")).toEqual({
      agentId: "codex",
      platformId: "codex",
      rootPath: "/Users/test/.codex",
    });
  });

  it.each(["kimi", "gemini", "grok", "qwen", "cursor"])(
    "rejects provider access for %s without changing asset access",
    async (id) => {
      getSupportedPlatformsMock.mockReturnValue([
        { id, configFiles: ["settings.json"] },
      ]);
      const { resolveAgentProviderContext, getAgentConfigContext } =
        await loadModule();
      expect(() => resolveAgentProviderContext(id)).toThrow(
        "AGENT_PROVIDER_ADAPTER_UNSUPPORTED",
      );
      expect(getAgentConfigContext(id).relativePaths).toEqual([
        "settings.json",
      ]);
    },
  );

  it("separates Antigravity's CLI model root from its shared asset root", async () => {
    getSupportedPlatformsMock.mockReturnValue([{ id: "antigravity" }]);
    getPlatformRootDirMock.mockReturnValue("/Users/test/.gemini/config");
    const { resolveAgentProviderContext } = await loadModule();

    expect(resolveAgentProviderContext("antigravity")).toEqual({
      agentId: "antigravity",
      platformId: "antigravity",
      rootPath: "/Users/test/.gemini/antigravity-cli",
    });

    getPlatformRootDirMock.mockReturnValue("/custom/antigravity-models");
    expect(resolveAgentProviderContext("antigravity").rootPath).toBe(
      "/custom/antigravity-models",
    );
  });

  it("normalizes, deduplicates, and allowlists declared config files", async () => {
    getBuiltinAgentOverrideMock.mockReturnValue({
      configRelativePaths: [
        " profiles\\work.toml ",
        "./profiles//work.toml",
        "../secret",
        "/absolute",
        "C:\\absolute",
        "bad\0path",
        "",
      ],
    });
    const { getAgentConfigContext, requireAllowlistedAgentConfigPath } =
      await loadModule();

    const context = getAgentConfigContext("codex");
    expect(context).toEqual({
      agentId: "codex",
      rootPath: "/Users/test/.codex",
      relativePaths: ["profiles/work.toml"],
    });
    expect(
      requireAllowlistedAgentConfigPath(context, "./profiles\\work.toml"),
    ).toBe("profiles/work.toml");
    expect(() =>
      requireAllowlistedAgentConfigPath(context, "../secret"),
    ).toThrow("not allowlisted");
    expect(() => requireAllowlistedAgentConfigPath(context, null)).toThrow(
      "must be a string",
    );
  });

  it("uses registry config files and rejects missing platform identities", async () => {
    getBuiltinAgentOverrideMock.mockReturnValue({
      configRelativePaths: [],
    });
    const { getAgentConfigContext } = await loadModule();

    expect(getAgentConfigContext("codex").relativePaths).toEqual([
      "config.toml",
      "profiles/work.toml",
    ]);
    getSupportedPlatformsMock.mockReturnValue([{ id: "empty" }]);
    expect(getAgentConfigContext("empty").relativePaths).toEqual([]);
    expect(() => getAgentConfigContext("")).toThrow("non-empty agentId");
    expect(() => getAgentConfigContext(42)).toThrow("non-empty agentId");
    expect(() => getAgentConfigContext("missing")).toThrow(
      "Unknown Agent platform",
    );
  });
});
