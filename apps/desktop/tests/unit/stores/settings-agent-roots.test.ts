import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const changeLanguageMock = vi.fn();

vi.mock("../../../src/renderer/i18n", () => ({
  __esModule: true,
  default: { language: "en" },
  changeLanguage: changeLanguageMock,
}));

async function importStore(settingsFromMain?: Record<string, unknown>) {
  vi.resetModules();
  const setSpy = vi.fn().mockResolvedValue(undefined);
  window.api = {
    ...window.api,
    settings: {
      ...window.api.settings,
      get: vi
        .fn()
        .mockResolvedValue({ githubToken: "", ...(settingsFromMain ?? {}) }),
      set: setSpy,
    },
  };

  const mod = await import("../../../src/renderer/stores/settings.store");
  await Promise.resolve();
  return {
    useSettingsStore: mod.useSettingsStore,
    setSpy,
    loadSettingsFromMainProcess: mod.loadSettingsFromMainProcess,
  };
}

describe("settings store agent roots", () => {
  beforeEach(() => {
    changeLanguageMock.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("persists independent Codex name and icon preferences", async () => {
    const { useSettingsStore } = await importStore();

    expect(useSettingsStore.getState().agentIdentityPreferences).toEqual({
      codex: { name: "codex", icon: "codex" },
    });

    useSettingsStore.getState().setCodexIdentityPreference({ name: "chatgpt" });
    useSettingsStore.getState().setCodexIdentityPreference({ icon: "chatgpt" });

    expect(useSettingsStore.getState().agentIdentityPreferences).toEqual({
      codex: { name: "chatgpt", icon: "chatgpt" },
    });
    expect(
      JSON.parse(localStorage.getItem("prompthub-settings") || "{}").state
        .agentIdentityPreferences,
    ).toEqual({ codex: { name: "chatgpt", icon: "chatgpt" } });
  });

  it("refreshes an already-loaded Agent workspace after visibility changes", async () => {
    const { useSettingsStore } = await importStore();
    const { useAgentStore } =
      await import("../../../src/renderer/stores/agent.store");
    useAgentStore.setState({ hasLoaded: true });
    const refresh = vi
      .spyOn(useAgentStore.getState(), "refresh")
      .mockResolvedValue(undefined);

    useSettingsStore.getState().setRulePlatformTracked("codex", false);

    expect(useSettingsStore.getState().disabledPlatformIds).toContain("codex");
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("normalizes unsupported Codex identity values field by field", async () => {
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          agentIdentityPreferences: {
            codex: { name: "remote-name", icon: "chatgpt" },
          },
        },
        version: 17,
      }),
    );

    const { useSettingsStore } = await importStore();

    expect(useSettingsStore.getState().agentIdentityPreferences).toEqual({
      codex: { name: "codex", icon: "chatgpt" },
    });

    useSettingsStore.getState().setCodexIdentityPreference({
      icon: "https://example.com/icon.png" as "codex",
    });
    expect(useSettingsStore.getState().agentIdentityPreferences).toEqual({
      codex: { name: "codex", icon: "codex" },
    });
  });

  it("preserves custom agent capability fields when updating one property", async () => {
    const { useSettingsStore } = await importStore();

    useSettingsStore.getState().setCustomAgents([
      {
        id: "team-agents",
        name: "Team Agents",
        rootPath: "~/.agents",
        enabled: false,
        skillsRelativePath: "skills",
        rulesRelativePath: "AGENTS.md",
        agentsRelativePath: "agents",
        commandsRelativePath: "commands",
        configRelativePaths: ["settings.json"],
      },
    ]);

    useSettingsStore.getState().updateCustomAgent("team-agents", {
      name: "Team Agents Updated",
    });

    expect(useSettingsStore.getState().customAgents).toEqual([
      expect.objectContaining({
        id: "team-agents",
        name: "Team Agents Updated",
        rootPath: "~/.agents",
        enabled: false,
        skillsRelativePath: "skills",
        rulesRelativePath: "AGENTS.md",
        agentsRelativePath: "agents",
        commandsRelativePath: "commands",
        configRelativePaths: ["settings.json"],
      }),
    ]);
  });

  it("normalizes same-version persisted custom agents during hydration", async () => {
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          customAgents: [
            { id: "broken-agent", name: "", rootPath: "/tmp/broken" },
            {
              id: "team-agent",
              name: "  Team Agent  ",
              rootPath: " /tmp/team-agent/ ",
              enabled: false,
              skillsRelativePath: "/skills/",
              configRelativePaths: [" config.json ", "config.json", 42],
            },
            {
              id: "duplicate-agent",
              name: "Duplicate Agent",
              rootPath: "/tmp/team-agent",
            },
          ],
          customAgentRootPaths: ["/tmp/stale-root", 42],
          customSkillScanPaths: ["/tmp/stale-scan", 42],
        },
        version: 16,
      }),
    );

    const { useSettingsStore } = await importStore();

    expect(useSettingsStore.getState().customAgents).toEqual([
      expect.objectContaining({
        id: "team-agent",
        name: "Team Agent",
        rootPath: "/tmp/team-agent",
        enabled: false,
        skillsRelativePath: "skills",
        configRelativePaths: ["config.json"],
      }),
    ]);
    expect(
      JSON.parse(localStorage.getItem("prompthub-settings")!).state
        .customAgentRootPaths,
    ).toEqual(["/tmp/stale-root", 42]);
  });

  it("adds default project deploy targets under .agents/skills", async () => {
    const { useSettingsStore } = await importStore();

    const project = useSettingsStore.getState().addSkillProject({
      name: "Workspace",
      rootPath: "/tmp/workspace",
      scanPaths: [],
    });

    expect(project.deployTargets).toEqual(["/tmp/workspace/.agents/skills"]);
    expect(useSettingsStore.getState().skillProjects[0]?.deployTargets).toEqual(
      ["/tmp/workspace/.agents/skills"],
    );
  });

  it("normalizes same-version persisted skill projects during hydration", async () => {
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          skillProjects: [
            { id: "broken-project", name: "", rootPath: "/tmp/broken" },
            {
              id: "workspace-project",
              name: "  Workspace  ",
              rootPath: " /tmp/workspace/ ",
              scanPaths: [
                " /tmp/workspace/ ",
                "/tmp/workspace/src",
                "/tmp/workspace/src",
                42,
              ],
              deployTargets: [
                "",
                " /tmp/workspace/.claude/skills ",
                "/tmp/workspace/.claude/skills",
                42,
              ],
              createdAt: "bad",
            },
          ],
        },
        version: 16,
      }),
    );

    const { useSettingsStore } = await importStore();

    expect(useSettingsStore.getState().skillProjects).toEqual([
      expect.objectContaining({
        id: "workspace-project",
        name: "Workspace",
        rootPath: "/tmp/workspace/",
        scanPaths: ["/tmp/workspace/src"],
        deployTargets: ["/tmp/workspace/.claude/skills"],
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      }),
    ]);
  });

  it("normalizes same-version persisted platform visibility settings during hydration", async () => {
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          builtinAgentOverrides: { trae: { rootPath: "~/.trae-cn" } },
          customPlatformRootPaths: { trae: "~/.trae-cn" },
          disabledPlatformIds: ["trae", 42, "codex"],
          skillPlatformOrder: ["claude", "trae", 42, "codex"],
        },
        version: 16,
      }),
    );

    const { useSettingsStore } = await importStore();

    expect(useSettingsStore.getState().builtinAgentOverrides).toEqual({
      trae: { rootPath: "~/.trae-cn" },
    });
    expect(useSettingsStore.getState().disabledPlatformIds).toEqual([
      "trae",
      "codex",
    ]);
    expect(useSettingsStore.getState().skillPlatformOrder).toEqual([
      "claude",
      "trae",
      "codex",
    ]);
  });

  it("does not publish default Agent values while rehydrating renderer preferences", async () => {
    const { setSpy } = await importStore();
    for (const [payload] of setSpy.mock.calls) {
      expect(payload).not.toHaveProperty("builtinAgentOverrides");
      expect(payload).not.toHaveProperty("customAgents");
      expect(payload).not.toHaveProperty("customPlatformRootPaths");
    }
  });

  it("keeps an explicitly empty current override and writes only the current key", async () => {
    const { useSettingsStore, loadSettingsFromMainProcess, setSpy } =
      await importStore({ builtinAgentOverrides: {} });
    await loadSettingsFromMainProcess();
    expect(useSettingsStore.getState().builtinAgentOverrides).toEqual({});
    useSettingsStore
      .getState()
      .updateBuiltinAgentOverride("codex", { rootPath: "/tmp/current" });
    useSettingsStore.getState().resetBuiltinAgentOverride("codex");
    expect(setSpy).toHaveBeenLastCalledWith({ builtinAgentOverrides: {} });
    expect(useSettingsStore.getState()).not.toHaveProperty(
      "customPlatformRootPaths",
    );
  });
  it("preserves the exact legacy snapshot before desktop main-process migration", async () => {
    const snapshot = JSON.stringify({
      state: { customSkillScanPaths: ["/original/skills"] },
      version: 11,
    });
    localStorage.setItem("prompthub-settings", snapshot);
    const previous = window.api.settings.rendererPersistence;
    window.api.settings.rendererPersistence = { ...previous, get: vi.fn() };
    try {
      const { useSettingsStore, setSpy } = await importStore();
      expect(localStorage.getItem("prompthub-settings")).toBe(snapshot);
      expect(useSettingsStore.getState().customAgents).toEqual([]);
      expect(setSpy).not.toHaveBeenCalled();
    } finally {
      window.api.settings.rendererPersistence = previous;
    }
  });
});
