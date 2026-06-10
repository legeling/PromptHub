import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const changeLanguageMock = vi.fn();

vi.mock("../../../src/renderer/i18n", () => ({
  __esModule: true,
  default: { language: "en" },
  changeLanguage: changeLanguageMock,
}));

describe("settings background image actions", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    changeLanguageMock.mockReset();
    document.documentElement.style.removeProperty("--app-background-image");
    document.documentElement.style.removeProperty("--app-background-opacity");
    document.documentElement.style.removeProperty("--app-background-blur");
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.style.removeProperty("--app-background-image");
    document.documentElement.style.removeProperty("--app-background-opacity");
    document.documentElement.style.removeProperty("--app-background-blur");
  });

  it("trims the background file name and writes the CSS image var", async () => {
    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    useSettingsStore.getState().setBackgroundImageFileName(" hero.png ");

    expect(useSettingsStore.getState().backgroundImageFileName).toBe("hero.png");
    expect(
      document.documentElement.style.getPropertyValue("--app-background-image"),
    ).toBe('url("local-image://hero.png")');
  });

  it("clamps background opacity and blur before persisting CSS vars", async () => {
    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    useSettingsStore.getState().setBackgroundImageOpacity(1);
    useSettingsStore.getState().setBackgroundImageBlur(100);

    expect(useSettingsStore.getState().backgroundImageOpacity).toBe(1);
    expect(useSettingsStore.getState().backgroundImageBlur).toBe(50);
    expect(
      document.documentElement.style.getPropertyValue("--app-background-blur")
    ).toBe("50px");
  });

  it("keeps the current tuning when selecting the first background image", async () => {
    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    useSettingsStore.getState().setBackgroundImageOpacity(1);
    useSettingsStore.getState().setBackgroundImageBlur(0);
    useSettingsStore.getState().applyBackgroundImageSelection(" wallpaper.png ");

    expect(useSettingsStore.getState().backgroundImageFileName).toBe(
      "wallpaper.png"
    );
    expect(useSettingsStore.getState().backgroundImageOpacity).toBe(1);
    expect(useSettingsStore.getState().backgroundImageBlur).toBe(0);
    expect(
      document.documentElement.style.getPropertyValue("--app-background-image")
    ).toBe('url("local-image://wallpaper.png")');
    expect(
      document.documentElement.style.getPropertyValue("--app-background-opacity")
    ).toBe("1");
    expect(
      document.documentElement.style.getPropertyValue("--app-background-blur")
    ).toBe("0px");
  });

  it("keeps the current tuning when replacing an existing background image", async () => {
    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    useSettingsStore.getState().applyBackgroundImageSelection("first.png");
    useSettingsStore.getState().setBackgroundImageOpacity(0.34);
    useSettingsStore.getState().setBackgroundImageBlur(7.5);

    useSettingsStore.getState().applyBackgroundImageSelection("second.png");

    expect(useSettingsStore.getState().backgroundImageFileName).toBe("second.png");
    expect(useSettingsStore.getState().backgroundImageOpacity).toBe(0.34);
    expect(useSettingsStore.getState().backgroundImageBlur).toBe(7.5);
    expect(
      document.documentElement.style.getPropertyValue("--app-background-image")
    ).toBe('url("local-image://second.png")');
    expect(
      document.documentElement.style.getPropertyValue("--app-background-opacity")
    ).toBe("0.34");
    expect(
      document.documentElement.style.getPropertyValue("--app-background-blur")
    ).toBe("7.5px");
  });

  it("rejects non-local background image sources during selection", async () => {
    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    useSettingsStore.getState().setBackgroundImageFileName(
      "https://example.com/wallpaper.png"
    );

    expect(useSettingsStore.getState().backgroundImageFileName).toBeUndefined();
    expect(
      document.documentElement.style.getPropertyValue("--app-background-image")
    ).toBe("none");
  });

  it("normalizes local-image protocol values before writing CSS vars", async () => {
    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    useSettingsStore
      .getState()
      .setBackgroundImageFileName(" local-image://hero image.png ");

    expect(useSettingsStore.getState().backgroundImageFileName).toBe(
      "hero image.png"
    );
    expect(
      document.documentElement.style.getPropertyValue("--app-background-image")
    ).toBe('url("local-image://hero%20image.png")');
  });

  it("normalizes encoded local-image protocol values before writing CSS vars", async () => {
    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    useSettingsStore
      .getState()
      .setBackgroundImageFileName("local-image://hero%20image.png");

    expect(useSettingsStore.getState().backgroundImageFileName).toBe(
      "hero image.png"
    );
    expect(
      document.documentElement.style.getPropertyValue("--app-background-image")
    ).toBe('url("local-image://hero%20image.png")');
  });

  it("does not bump settingsUpdatedAt when opacity is unchanged", async () => {
    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    const initialUpdatedAt = useSettingsStore.getState().settingsUpdatedAt;

    useSettingsStore.getState().setBackgroundImageOpacity(1);

    expect(useSettingsStore.getState().settingsUpdatedAt).toBe(initialUpdatedAt);
  });

  it("toggles background image visibility without clearing the saved file", async () => {
    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    useSettingsStore.getState().applyBackgroundImageSelection("wallpaper.png");
    useSettingsStore.getState().setBackgroundImageEnabled(false);

    expect(useSettingsStore.getState().backgroundImageEnabled).toBe(false);
    expect(useSettingsStore.getState().backgroundImageFileName).toBe(
      "wallpaper.png"
    );
  });

  it("defaults background image visibility to enabled during migration", async () => {
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          backgroundImageFileName: "wallpaper.png",
          backgroundImageOpacity: 0.55,
          backgroundImageBlur: 6,
        },
        version: 11,
      })
    );

    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    expect(useSettingsStore.getState().backgroundImageEnabled).toBe(true);
    expect(useSettingsStore.getState().backgroundImageFileName).toBe(
      "wallpaper.png"
    );
  });

  it("sanitizes same-version persisted background image state during hydration", async () => {
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          backgroundImageEnabled: true,
          backgroundImageFileName: "https://example.com/wallpaper.png",
          backgroundImageOpacity: 2,
          backgroundImageBlur: 100,
        },
        version: 16,
      })
    );

    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    expect(useSettingsStore.getState().backgroundImageFileName).toBeUndefined();
    expect(useSettingsStore.getState().backgroundImageOpacity).toBe(1);
    expect(useSettingsStore.getState().backgroundImageBlur).toBe(50);
    expect(
      document.documentElement.style.getPropertyValue("--app-background-image")
    ).toBe("none");
  });
});
