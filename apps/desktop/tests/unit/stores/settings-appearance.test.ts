import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rendererPersistence = window.api.settings.rendererPersistence;

const changeLanguageMock = vi.fn<() => Promise<void>>();

vi.mock("../../../src/renderer/i18n", () => ({
  __esModule: true,
  default: { language: "en" },
  changeLanguage: changeLanguageMock,
}));

describe("settings appearance persistence", () => {
  beforeEach(() => {
    window.api.settings.rendererPersistence = rendererPersistence;
    vi.resetModules();
    localStorage.clear();
    changeLanguageMock.mockReset();
    changeLanguageMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    window.api.settings.rendererPersistence = rendererPersistence;
    localStorage.clear();
  });

  it("normalizes same-version persisted appearance settings during hydration", async () => {
    // Legacy snapshots predate the canonical renderer-persistence bridge.
    Reflect.deleteProperty(window.api.settings, "rendererPersistence");
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          themeMode: "sepia",
          fontSize: "giant",
          motionPreference: "spin",
          language: "pt-BR",
        },
        version: 16,
      }),
    );

    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    expect(useSettingsStore.getState().themeMode).toBe("system");
    expect(useSettingsStore.getState().fontSize).toBe("medium");
    expect(useSettingsStore.getState().motionPreference).toBe("standard");
    expect(useSettingsStore.getState().language).toBe("en");
  });
});
