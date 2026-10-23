import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rendererPersistence = window.api.settings.rendererPersistence;

const changeLanguageMock = vi.fn();

vi.mock("../../../src/renderer/i18n", () => ({
  __esModule: true,
  default: { language: "en" },
  changeLanguage: changeLanguageMock,
}));

describe("settings prompt tag preferences", () => {
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

  it("normalizes same-version persisted prompt tag settings during hydration", async () => {
    // Legacy snapshots predate the canonical renderer-persistence bridge.
    Reflect.deleteProperty(window.api.settings, "rendererPersistence");
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

    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    expect(useSettingsStore.getState().tagFilterMode).toBe("multi");
    expect(useSettingsStore.getState().promptTagCatalog).toEqual([
      "beta",
      "alpha",
    ]);
  });

  it("keeps manual order when adding, renaming and deleting catalog entries", async () => {
    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");
    useSettingsStore.setState({ promptTagCatalog: ["gamma", "alpha", "beta"] });
    await useSettingsStore
      .getState()
      .addPromptTagCatalogEntry("delta", ["gamma", "alpha", "beta"]);
    expect(useSettingsStore.getState().promptTagCatalog).toEqual([
      "gamma",
      "alpha",
      "beta",
      "delta",
    ]);
    useSettingsStore.getState().renamePromptTagCatalogEntry("gamma", "zeta");
    expect(useSettingsStore.getState().promptTagCatalog).toEqual([
      "zeta",
      "alpha",
      "beta",
      "delta",
    ]);
    useSettingsStore.getState().deletePromptTagCatalogEntry("beta");
    expect(useSettingsStore.getState().promptTagCatalog).toEqual([
      "zeta",
      "alpha",
      "delta",
    ]);
  });
});
