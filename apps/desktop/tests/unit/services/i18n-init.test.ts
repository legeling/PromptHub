import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function setNavigatorLanguage(language: string) {
  Object.defineProperty(window.navigator, "language", {
    configurable: true,
    value: language,
  });
}

describe("i18n initialization", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unmock("../../../src/renderer/i18n/locales/de.json");
  });

  it("prefers persisted language over system language", async () => {
    setNavigatorLanguage("fr-FR");
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({ state: { language: "de" } }),
    );

    const module = await import("../../../src/renderer/i18n");
    await module.i18nReady;

    expect(module.default.language).toBe("de");
  });

  it("maps system language prefixes when no persisted language exists", async () => {
    setNavigatorLanguage("zh-Hant");

    const module = await import("../../../src/renderer/i18n");
    await module.i18nReady;

    expect(module.default.language).toBe("zh-TW");
  });

  it("loads non-initial locale resources before switching language", async () => {
    setNavigatorLanguage("en-US");

    const module = await import("../../../src/renderer/i18n");
    await module.i18nReady;

    expect(module.default.language).toBe("en");
    expect(module.default.hasResourceBundle("fr", "translation")).toBe(false);

    await module.changeLanguage("fr-FR");

    expect(module.default.language).toBe("fr");
    expect(module.default.hasResourceBundle("fr", "translation")).toBe(true);
  });

  it("falls back to English when the initial non-English locale fails to load", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    setNavigatorLanguage("en-US");
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({ state: { language: "de" } }),
    );
    vi.doMock("../../../src/renderer/i18n/locales/de.json", () => {
      throw new Error("locale unavailable");
    });

    const module = await import("../../../src/renderer/i18n");
    await module.i18nReady;

    expect(module.default.language).toBe("en");
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy.mock.calls[0]?.[0]).toBe(
      "Failed to load initial language resources:",
    );
    expect(consoleErrorSpy.mock.calls[0]?.[1]).toBeInstanceOf(Error);
  });
});
