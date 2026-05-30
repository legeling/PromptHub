import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const changeLanguageMock = vi.fn();

vi.mock("../../../src/renderer/i18n", () => ({
  __esModule: true,
  default: { language: "en" },
  changeLanguage: changeLanguageMock,
}));

describe("settings store -> rules sync", () => {
  beforeEach(() => {
    changeLanguageMock.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("force rescans rules after changing a custom platform root path", async () => {
    vi.resetModules();
    let resolveSettingsSet!: () => void;
    const settingsSetMock = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSettingsSet = resolve;
        }),
    );
    const loadFilesMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../../../src/renderer/stores/rules.store", () => ({
      useRulesStore: {
        getState: () => ({
          loadFiles: loadFilesMock,
        }),
      },
    }));

    window.api = {
      ...(window.api ?? {}),
      settings: {
        ...(window.api?.settings ?? {}),
        get: vi.fn().mockResolvedValue({ customPlatformRootPaths: {} }),
        set: settingsSetMock,
      },
    };

    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    useSettingsStore.getState().setCustomPlatformRootPath(
      "opencode",
      "/tmp/opencode-root",
    );
    await vi.dynamicImportSettled();

    expect(loadFilesMock).not.toHaveBeenCalled();
    expect(settingsSetMock).toHaveBeenLastCalledWith({
      builtinAgentOverrides: { opencode: { rootPath: "/tmp/opencode-root" } },
      customPlatformRootPaths: { opencode: "/tmp/opencode-root" },
    });

    resolveSettingsSet();
    await vi.dynamicImportSettled();

    expect(loadFilesMock).toHaveBeenCalledWith({ force: true });
  });

  it("force rescans rules after changing a custom agent rules file path", async () => {
    vi.resetModules();
    let resolveSettingsSet!: () => void;
    const settingsSetMock = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSettingsSet = resolve;
        }),
    );
    const loadFilesMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../../../src/renderer/stores/rules.store", () => ({
      useRulesStore: {
        getState: () => ({
          loadFiles: loadFilesMock,
        }),
      },
    }));

    window.api = {
      ...(window.api ?? {}),
      settings: {
        ...(window.api?.settings ?? {}),
        get: vi.fn().mockResolvedValue({
          customAgents: [
            {
              id: "team-agents",
              name: "Team Agents",
              rootPath: "/tmp/team-agents",
              rulesRelativePath: "AGENTS.md",
            },
          ],
        }),
        set: settingsSetMock,
      },
    };

    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    useSettingsStore.setState({
      customAgents: [
        {
          id: "team-agents",
          name: "Team Agents",
          rootPath: "/tmp/team-agents",
          rulesRelativePath: "AGENTS.md",
        },
      ],
    });
    useSettingsStore.getState().updateCustomAgent("team-agents", {
      rulesRelativePath: "config/AGENTS.md",
    });
    await vi.dynamicImportSettled();

    expect(loadFilesMock).not.toHaveBeenCalled();
    expect(settingsSetMock).toHaveBeenLastCalledWith({
      customAgents: [
        expect.objectContaining({
          id: "team-agents",
          rootPath: "/tmp/team-agents",
          rulesRelativePath: "config/AGENTS.md",
        }),
      ],
      customAgentRootPaths: ["/tmp/team-agents"],
    });

    resolveSettingsSet();
    await vi.dynamicImportSettled();

    expect(loadFilesMock).toHaveBeenCalledWith({ force: true });
  });
});
