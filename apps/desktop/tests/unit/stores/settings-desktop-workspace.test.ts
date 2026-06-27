import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const changeLanguageMock = vi.fn();

vi.mock("../../../src/renderer/i18n", () => ({
  __esModule: true,
  default: { language: "en" },
  changeLanguage: changeLanguageMock,
}));

describe("settings desktop workspace actions", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    changeLanguageMock.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("keeps at least one desktop module enabled", async () => {
    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    useSettingsStore.getState().toggleDesktopHomeModule("prompt");
    useSettingsStore.getState().toggleDesktopHomeModule("skill");
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

  it("adds MCP and Plugin to old persisted default desktop modules during hydration", async () => {
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          desktopHomeModules: ["skill", "prompt", "rules"],
        },
        version: 16,
      }),
    );

    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    expect(useSettingsStore.getState().desktopHomeModules).toEqual([
      "skill",
      "mcp",
      "plugin",
      "prompt",
      "rules",
    ]);
  });

  it("lets users hide MCP after it has been introduced", async () => {
    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    useSettingsStore.setState({
      desktopHomeModules: ["prompt", "skill", "mcp", "plugin", "rules"],
    });
    useSettingsStore.getState().toggleDesktopHomeModule("mcp");

    expect(useSettingsStore.getState().desktopHomeModules).toEqual([
      "prompt",
      "skill",
      "plugin",
      "rules",
    ]);
  });

  it("does not add MCP to custom legacy module subsets", async () => {
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
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          desktopHomeModules: ["skill", "ghost", "skill", "prompt"],
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

  it("normalizes same-version persisted sidebar tag section heights during hydration", async () => {
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          tagsSectionHeight: -1,
          skillTagsSectionHeight: "invalid",
          resourceTagsSectionHeight: "invalid",
        },
        version: 16,
      }),
    );

    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    expect(useSettingsStore.getState().tagsSectionHeight).toBe(140);
    expect(useSettingsStore.getState().skillTagsSectionHeight).toBe(140);
    expect(useSettingsStore.getState().resourceTagsSectionHeight).toBe(140);
  });

  it("hydrates resource tag section settings from legacy skill tag settings", async () => {
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          skillTagsSectionHeight: 260,
          isSkillTagsSectionCollapsed: true,
        },
        version: 16,
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
