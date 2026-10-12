import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rendererPersistence = window.api.settings.rendererPersistence;

const changeLanguageMock = vi.fn();

vi.mock("../../../src/renderer/i18n", () => ({
  __esModule: true,
  default: { language: "en" },
  changeLanguage: changeLanguageMock,
}));

describe("settings desktop workspace actions", () => {
  beforeEach(() => {
    window.api.settings.rendererPersistence = rendererPersistence;
    vi.resetModules();
    localStorage.clear();
    changeLanguageMock.mockReset();
  });

  afterEach(() => {
    window.api.settings.rendererPersistence = rendererPersistence;
    localStorage.clear();
  });

  it("places Agents second in the default desktop module order", async () => {
    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    expect(useSettingsStore.getState().desktopHomeModules).toEqual([
      "prompt",
      "agents",
      "skill",
      "mcp",
      "plugin",
      "rules",
    ]);
  });

  it("keeps at least one desktop module enabled", async () => {
    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    useSettingsStore.getState().toggleDesktopHomeModule("prompt");
    useSettingsStore.getState().toggleDesktopHomeModule("skill");
    useSettingsStore.getState().toggleDesktopHomeModule("agents");
    useSettingsStore.getState().toggleDesktopHomeModule("mcp");
    useSettingsStore.getState().toggleDesktopHomeModule("plugin");

    expect(useSettingsStore.getState().desktopHomeModules).toEqual(["rules"]);

    useSettingsStore.getState().toggleDesktopHomeModule("rules");

    expect(useSettingsStore.getState().desktopHomeModules).toEqual(["rules"]);
  });

  it("reorders enabled desktop modules without introducing hidden entries", async () => {
    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    useSettingsStore.setState({ desktopHomeModules: ["prompt", "rules"] });
    useSettingsStore.getState().reorderDesktopHomeModules(["rules", "prompt"]);

    expect(useSettingsStore.getState().desktopHomeModules).toEqual([
      "rules",
      "prompt",
    ]);

    useSettingsStore
      .getState()
      .reorderDesktopHomeModules(["rules", "prompt", "ghost" as never]);

    expect(useSettingsStore.getState().desktopHomeModules).toEqual([
      "rules",
      "prompt",
    ]);
  });

  it("normalizes persisted desktop workspace settings on migration", async () => {
    // Legacy snapshots predate the canonical renderer-persistence bridge.
    Reflect.deleteProperty(window.api.settings, "rendererPersistence");
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          desktopHomeLayout: "unknown-layout",
          desktopHomeModules: ["skill", "ghost", "skill", "prompt"],
        },
        version: 9,
      }),
    );

    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    expect(useSettingsStore.getState().desktopHomeModules).toEqual([
      "skill",
      "prompt",
    ]);
  });

  it("adds Agents, MCP and Plugin to old persisted default desktop modules during hydration", async () => {
    // Legacy snapshots predate the canonical renderer-persistence bridge.
    Reflect.deleteProperty(window.api.settings, "rendererPersistence");
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          desktopHomeModules: ["prompt", "skill", "rules"],
        },
        version: 16,
      }),
    );

    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    expect(useSettingsStore.getState().desktopHomeModules).toEqual([
      "prompt",
      "agents",
      "skill",
      "mcp",
      "plugin",
      "rules",
    ]);
  });

  it("moves Agents to second when hydrating the previous complete default order", async () => {
    // Legacy snapshots predate the canonical renderer-persistence bridge.
    Reflect.deleteProperty(window.api.settings, "rendererPersistence");
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          desktopHomeModules: [
            "prompt",
            "skill",
            "agents",
            "mcp",
            "plugin",
            "rules",
          ],
        },
        version: 16,
      }),
    );

    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    expect(useSettingsStore.getState().desktopHomeModules).toEqual([
      "prompt",
      "agents",
      "skill",
      "mcp",
      "plugin",
      "rules",
    ]);
  });

  it("preserves the former default order when it is customized after migration", async () => {
    // Legacy snapshots predate the canonical renderer-persistence bridge.
    Reflect.deleteProperty(window.api.settings, "rendererPersistence");
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          desktopHomeModules: [
            "prompt",
            "skill",
            "agents",
            "mcp",
            "plugin",
            "rules",
          ],
        },
        version: 17,
      }),
    );

    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    expect(useSettingsStore.getState().desktopHomeModules).toEqual([
      "prompt",
      "skill",
      "agents",
      "mcp",
      "plugin",
      "rules",
    ]);
  });

  it("preserves a customized complete desktop module order", async () => {
    // Legacy snapshots predate the canonical renderer-persistence bridge.
    Reflect.deleteProperty(window.api.settings, "rendererPersistence");
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          desktopHomeModules: [
            "rules",
            "plugin",
            "mcp",
            "skill",
            "agents",
            "prompt",
          ],
        },
        version: 17,
      }),
    );

    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    expect(useSettingsStore.getState().desktopHomeModules).toEqual([
      "rules",
      "plugin",
      "mcp",
      "skill",
      "agents",
      "prompt",
    ]);
  });

  it("lets users hide MCP after it has been introduced", async () => {
    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    useSettingsStore.setState({
      desktopHomeModules: [
        "prompt",
        "skill",
        "agents",
        "mcp",
        "plugin",
        "rules",
      ],
    });
    useSettingsStore.getState().toggleDesktopHomeModule("mcp");

    expect(useSettingsStore.getState().desktopHomeModules).toEqual([
      "prompt",
      "skill",
      "agents",
      "plugin",
      "rules",
    ]);
  });

  it("does not add MCP to custom legacy module subsets", async () => {
    // Legacy snapshots predate the canonical renderer-persistence bridge.
    Reflect.deleteProperty(window.api.settings, "rendererPersistence");
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          desktopHomeModules: ["skill", "prompt"],
        },
        version: 16,
      }),
    );

    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    expect(useSettingsStore.getState().desktopHomeModules).toEqual([
      "skill",
      "prompt",
    ]);
  });

  it("normalizes same-version persisted desktop module settings during hydration", async () => {
    // Legacy snapshots predate the canonical renderer-persistence bridge.
    Reflect.deleteProperty(window.api.settings, "rendererPersistence");
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          desktopHomeModules: ["skill", "ghost", "skill", "prompt"],
        },
        version: 17,
      }),
    );

    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    expect(useSettingsStore.getState().desktopHomeModules).toEqual([
      "skill",
      "prompt",
    ]);
  });

  it("normalizes same-version persisted sidebar tag section heights during hydration", async () => {
    // Legacy snapshots predate the canonical renderer-persistence bridge.
    Reflect.deleteProperty(window.api.settings, "rendererPersistence");
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          tagsSectionHeight: -1,
          skillTagsSectionHeight: "invalid",
          resourceTagsSectionHeight: "invalid",
        },
        version: 17,
      }),
    );

    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    expect(useSettingsStore.getState().tagsSectionHeight).toBe(140);
    expect(useSettingsStore.getState().skillTagsSectionHeight).toBe(140);
    expect(useSettingsStore.getState().resourceTagsSectionHeight).toBe(140);
  });

  it("hydrates resource tag section settings from legacy skill tag settings", async () => {
    // Legacy snapshots predate the canonical renderer-persistence bridge.
    Reflect.deleteProperty(window.api.settings, "rendererPersistence");
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          skillTagsSectionHeight: 260,
          isSkillTagsSectionCollapsed: true,
        },
        version: 17,
      }),
    );

    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    expect(useSettingsStore.getState().resourceTagsSectionHeight).toBe(260);
    expect(useSettingsStore.getState().isResourceTagsSectionCollapsed).toBe(
      true,
    );
  });

  it("keeps legacy skill tag settings in sync with resource tag settings", async () => {
    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    useSettingsStore.getState().setResourceTagsSectionHeight(300);
    useSettingsStore.getState().setIsResourceTagsSectionCollapsed(true);

    expect(useSettingsStore.getState().resourceTagsSectionHeight).toBe(300);
    expect(useSettingsStore.getState().skillTagsSectionHeight).toBe(300);
    expect(useSettingsStore.getState().isResourceTagsSectionCollapsed).toBe(
      true,
    );
    expect(useSettingsStore.getState().isSkillTagsSectionCollapsed).toBe(true);
  });

  it("persists and normalizes the skill list page size preference", async () => {
    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    useSettingsStore.getState().setSkillListPageSize(25);

    expect(useSettingsStore.getState().skillListPageSize).toBe(25);
    expect(localStorage.getItem("prompthub-settings")).toContain(
      '"skillListPageSize":25',
    );

    useSettingsStore.getState().setSkillListPageSize(999);

    expect(useSettingsStore.getState().skillListPageSize).toBe(10);
  });

  it("normalizes invalid persisted skill list page sizes", async () => {
    // Legacy snapshots predate the canonical renderer-persistence bridge.
    Reflect.deleteProperty(window.api.settings, "rendererPersistence");
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          skillListPageSize: 999,
        },
        version: 14,
      }),
    );

    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    expect(useSettingsStore.getState().skillListPageSize).toBe(10);
  });
});
