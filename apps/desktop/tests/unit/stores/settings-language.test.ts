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
    window.api.settings.get = vi.fn().mockResolvedValue(undefined);
    window.api.settings.set = vi.fn().mockResolvedValue(true);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("normalizes locale variants before updating settings", async () => {
    const setSettings = vi.fn().mockResolvedValue(true);
    window.api.settings.set = setSettings;
    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");
    setSettings.mockClear();

    useSettingsStore.getState().setLanguage("fr-FR");

    expect(useSettingsStore.getState().language).toBe("fr");
    expect(changeLanguageMock).toHaveBeenCalledWith("fr");
    await vi.waitFor(() => {
      expect(setSettings).toHaveBeenCalledWith({ language: "fr" });
    });
  });

  it("migrates the persisted renderer language to main-process settings", async () => {
    const setSettings = vi.fn().mockResolvedValue(true);
    window.api.settings.set = setSettings;
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: { language: "zh-TW" },
        version: 16,
      }),
    );

    await import("../../../src/renderer/stores/settings.store");

    await vi.waitFor(() => {
      expect(setSettings).toHaveBeenCalledWith(
        expect.objectContaining({ language: "zh-TW" }),
      );
    });
  });

  it("does not sync a temporary language when renderer persistence is absent", async () => {
    const setSettings = vi.fn().mockResolvedValue(true);
    window.api.settings.set = setSettings;

    await import("../../../src/renderer/stores/settings.store");

    await vi.waitFor(() => {
      expect(setSettings).toHaveBeenCalled();
    });
    expect(
      setSettings.mock.calls.some(([payload]) =>
        Object.prototype.hasOwnProperty.call(payload, "language"),
      ),
    ).toBe(false);
  });

  it("restores the main-process language when renderer persistence is absent", async () => {
    const setSettings = vi.fn().mockResolvedValue(true);
    window.api.settings.set = setSettings;
    window.api.settings.get = vi.fn().mockResolvedValue({ language: "zh" });
    const { loadSettingsFromMainProcess, useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    await loadSettingsFromMainProcess();

    expect(useSettingsStore.getState().language).toBe("zh");
    expect(changeLanguageMock).toHaveBeenCalledWith("zh");
  });

  it("keeps an explicit renderer language over a different main value", async () => {
    const setSettings = vi.fn().mockResolvedValue(true);
    window.api.settings.set = setSettings;
    window.api.settings.get = vi.fn().mockResolvedValue({ language: "zh" });
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: { language: "de" },
        version: 19,
      }),
    );
    const { loadSettingsFromMainProcess, useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    await loadSettingsFromMainProcess();

    expect(useSettingsStore.getState().language).toBe("de");
    expect(changeLanguageMock).not.toHaveBeenCalledWith("zh");
  });

  it.each([20, 19])(
    "treats an unsupported persisted renderer language in version %s as absent",
    async (version) => {
      window.api.settings.get = vi.fn().mockResolvedValue({ language: "zh" });
      localStorage.setItem(
        "prompthub-settings",
        JSON.stringify({
          state: { language: "unsupported" },
          version,
        }),
      );
      const { loadSettingsFromMainProcess, useSettingsStore } =
        await import("../../../src/renderer/stores/settings.store");

      await loadSettingsFromMainProcess();

      expect(useSettingsStore.getState().language).toBe("zh");
      expect(changeLanguageMock).toHaveBeenCalledWith("zh");
    },
  );

  it("ignores an unsupported main-process language", async () => {
    window.api.settings.get = vi
      .fn()
      .mockResolvedValue({ language: "unsupported" });
    const { loadSettingsFromMainProcess, useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    await loadSettingsFromMainProcess();

    expect(useSettingsStore.getState().language).toBe("en");
    expect(changeLanguageMock).not.toHaveBeenCalledWith("unsupported");
  });

  it("recognizes only supported persisted language values", async () => {
    const { getPersistedLanguageSetting } =
      await import("../../../src/renderer/stores/settings/settings-persistence");

    expect(getPersistedLanguageSetting(null)).toBeNull();
    expect(getPersistedLanguageSetting({})).toBeNull();
    expect(getPersistedLanguageSetting({ language: 1 })).toBeNull();
    expect(getPersistedLanguageSetting({ language: "unsupported" })).toBeNull();
    expect(getPersistedLanguageSetting({ language: "zh-TW" })).toBe("zh-TW");
  });

  it("logs storage hydration failures with the original error", async () => {
    const error = new Error("local storage unavailable");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const getItem = vi
      .spyOn(localStorage, "getItem")
      .mockImplementationOnce(() => {
        throw error;
      });

    await import("../../../src/renderer/stores/settings.store");

    expect(consoleError).toHaveBeenCalledWith(
      "Failed to rehydrate settings store:",
      error,
    );
    getItem.mockRestore();
    consoleError.mockRestore();
  });

  it("maps traditional chinese locale aliases to zh-TW", async () => {
    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

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

    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

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
