import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const changeLanguageMock = vi.fn<() => Promise<void>>();

vi.mock("../../../src/renderer/i18n", () => ({
  __esModule: true,
  default: { language: "en" },
  changeLanguage: changeLanguageMock,
}));

describe("settings appearance persistence", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    changeLanguageMock.mockReset();
    changeLanguageMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("normalizes same-version persisted appearance settings during hydration", async () => {
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
