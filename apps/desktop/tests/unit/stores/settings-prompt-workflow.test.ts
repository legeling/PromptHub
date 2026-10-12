import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rendererPersistence = window.api.settings.rendererPersistence;

const changeLanguageMock = vi.fn();

vi.mock("../../../src/renderer/i18n", () => ({
  __esModule: true,
  default: { language: "en" },
  changeLanguage: changeLanguageMock,
}));

describe("settings prompt workflow persistence", () => {
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

  it("normalizes same-version persisted prompt workflow settings during hydration", async () => {
    // Legacy snapshots predate the canonical renderer-persistence bridge.
    Reflect.deleteProperty(window.api.settings, "rendererPersistence");
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          creationMode: "turbo",
          translationMode: "partial",
          imageReverseAttachReferenceByDefault: "yes",
          closeAction: "destroy",
          sourceHistory: [
            " https://example.com/a ",
            42,
            "",
            "https://example.com/a",
            "Book reference",
          ],
        },
        version: 16,
      }),
    );

    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    expect(useSettingsStore.getState().creationMode).toBe("manual");
    expect(useSettingsStore.getState().translationMode).toBe("immersive");
    expect(
      useSettingsStore.getState().imageReverseAttachReferenceByDefault,
    ).toBe(true);
    expect(useSettingsStore.getState().closeAction).toBe("ask");
    expect(useSettingsStore.getState().sourceHistory).toEqual([
      "https://example.com/a",
      "Book reference",
    ]);
  });
});
