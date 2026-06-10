import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const changeLanguageMock = vi.fn();

vi.mock("../../../src/renderer/i18n", () => ({
  __esModule: true,
  default: { language: "en" },
  changeLanguage: changeLanguageMock,
}));

describe("settings prompt tag preferences", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    changeLanguageMock.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("normalizes same-version persisted prompt tag settings during hydration", async () => {
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          tagFilterMode: "invalid-mode",
          promptTagCatalog: [" beta ", 42, "alpha", "", "beta"],
        },
        version: 16,
      }),
    );

    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    expect(useSettingsStore.getState().tagFilterMode).toBe("multi");
    expect(useSettingsStore.getState().promptTagCatalog).toEqual([
      "alpha",
      "beta",
    ]);
  });
});
