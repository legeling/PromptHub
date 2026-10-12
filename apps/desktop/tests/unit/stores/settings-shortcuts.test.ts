import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rendererPersistence = window.api.settings.rendererPersistence;

const changeLanguageMock = vi.fn();

vi.mock("../../../src/renderer/i18n", () => ({
  __esModule: true,
  default: { language: "en" },
  changeLanguage: changeLanguageMock,
}));

describe("settings shortcut mode persistence", () => {
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

  it("normalizes same-version persisted shortcut modes during hydration", async () => {
    // Legacy snapshots predate the canonical renderer-persistence bridge.
    Reflect.deleteProperty(window.api.settings, "rendererPersistence");
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          shortcutModes: {
            newPrompt: "global",
            search: "disabled",
            settings: null,
            ghostAction: "global",
          },
        },
        version: 16,
      }),
    );

    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    expect(useSettingsStore.getState().shortcutModes).toEqual({
      showApp: "global",
      newPrompt: "global",
      search: "local",
      settings: "local",
    });
  });
});
