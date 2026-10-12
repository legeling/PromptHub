import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const changeLanguageMock = vi.fn();

vi.mock("../../../src/renderer/i18n", () => ({
  __esModule: true,
  default: { language: "en" },
  changeLanguage: changeLanguageMock,
}));

describe("settings close action persistence", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    changeLanguageMock.mockReset();
  });

  afterEach(() => localStorage.clear());

  it("publishes close actions changed from general settings", async () => {
    const setSettings = vi.fn().mockResolvedValue(true);
    const setMainCloseAction = vi.fn();
    window.api.settings.set = setSettings;
    window.electron!.setCloseAction = setMainCloseAction;
    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    useSettingsStore.getState().setCloseAction("exit");

    expect(useSettingsStore.getState().closeAction).toBe("exit");
    expect(setMainCloseAction).toHaveBeenLastCalledWith("exit");
    expect(setSettings).toHaveBeenCalledWith({ closeAction: "exit" });
  });

  it.each(["minimize", "exit"] as const)(
    "reapplies hydrated %s behavior to the main process after restart",
    async (closeAction) => {
      const setMainCloseAction = vi.fn();
      window.electron!.setCloseAction = setMainCloseAction;
      window.api.settings.get = vi
        .fn()
        .mockResolvedValue({ githubToken: "", closeAction });
      window.api.settings.set = vi.fn().mockResolvedValue(true);
      const { loadSettingsFromMainProcess, useSettingsStore } =
        await import("../../../src/renderer/stores/settings.store");

      await loadSettingsFromMainProcess();

      expect(useSettingsStore.getState().closeAction).toBe(closeAction);
      expect(setMainCloseAction).toHaveBeenLastCalledWith(closeAction);
    },
  );

  it("normalizes an invalid hydrated close action back to ask", async () => {
    const setMainCloseAction = vi.fn();
    window.electron!.setCloseAction = setMainCloseAction;
    window.api.settings.get = vi.fn().mockResolvedValue({
      githubToken: "",
      closeAction: "destroy",
    });
    window.api.settings.set = vi.fn().mockResolvedValue(true);
    const { loadSettingsFromMainProcess, useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    await loadSettingsFromMainProcess();

    expect(useSettingsStore.getState().closeAction).toBe("ask");
    expect(setMainCloseAction).toHaveBeenLastCalledWith("ask");
  });
});
