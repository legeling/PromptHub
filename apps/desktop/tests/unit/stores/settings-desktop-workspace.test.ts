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
    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    useSettingsStore.getState().toggleDesktopHomeModule("prompt");
    useSettingsStore.getState().toggleDesktopHomeModule("skill");
    useSettingsStore.getState().toggleDesktopHomeModule("rules");

    expect(useSettingsStore.getState().desktopHomeModules).toEqual(["rules"]);

    useSettingsStore.getState().toggleDesktopHomeModule("rules");

    expect(useSettingsStore.getState().desktopHomeModules).toEqual(["rules"]);
  });

  it("reorders enabled desktop modules without introducing hidden entries", async () => {
    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    useSettingsStore.setState({ desktopHomeModules: ["prompt", "rules"] });
    useSettingsStore.getState().reorderDesktopHomeModules(["rules", "prompt"]);

    expect(useSettingsStore.getState().desktopHomeModules).toEqual([
      "rules",
      "prompt",
    ]);

    useSettingsStore.getState().reorderDesktopHomeModules([
      "rules",
      "prompt",
      "ghost" as never,
    ]);

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

    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

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

    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

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
        },
        version: 16,
      }),
    );

    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    expect(useSettingsStore.getState().tagsSectionHeight).toBe(140);
    expect(useSettingsStore.getState().skillTagsSectionHeight).toBe(140);
  });

  it("persists and normalizes the skill list page size preference", async () => {
    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

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

    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    expect(useSettingsStore.getState().skillListPageSize).toBe(10);
  });
});
