import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const changeLanguageMock = vi.fn<() => Promise<void>>();

vi.mock("../../../src/renderer/i18n", () => ({
  __esModule: true,
  default: { language: "en" },
  changeLanguage: changeLanguageMock,
}));

describe("settings language actions", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    changeLanguageMock.mockReset();
    changeLanguageMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("normalizes locale variants before updating settings", async () => {
    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    useSettingsStore.getState().setLanguage("fr-FR");

    expect(useSettingsStore.getState().language).toBe("fr");
    expect(changeLanguageMock).toHaveBeenCalledWith("fr");
  });

  it("maps traditional chinese locale aliases to zh-TW", async () => {
    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    useSettingsStore.getState().setLanguage("zh-Hant");

    expect(useSettingsStore.getState().language).toBe("zh-TW");
    expect(changeLanguageMock).toHaveBeenCalledWith("zh-TW");
  });

  it("handles async i18n switch failures without reverting persisted settings", async () => {
    const error = new Error("locale chunk failed");
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    changeLanguageMock.mockRejectedValueOnce(error);

    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    useSettingsStore.getState().setLanguage("de");
    await Promise.resolve();

    expect(useSettingsStore.getState().language).toBe("de");
    expect(changeLanguageMock).toHaveBeenCalledWith("de");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to change language:",
      error,
    );

    consoleErrorSpy.mockRestore();
  });
});
