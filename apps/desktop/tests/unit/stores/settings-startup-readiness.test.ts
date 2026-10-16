import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@prompthub/shared/types";
import { installWindowMocks } from "../../helpers/window";

const originalApi = window.api;
const originalElectron = window.electron;

vi.mock("../../../src/renderer/i18n", () => ({
  default: { language: "en" },
  changeLanguage: () => Promise.resolve(),
}));

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  installWindowMocks({
    api: {
      settings: {
        get: vi.fn().mockResolvedValue({
          ...DEFAULT_SETTINGS,
          themeMode: "dark",
          startupFolderMode: "pinned",
          pinnedStartFolderId: "fixture-start-folder",
          launchAtStartup: false,
          minimizeOnLaunch: false,
        }),
        set: vi.fn().mockResolvedValue(true),
      },
    },
  });
});

afterEach(() => {
  window.api = originalApi;
  window.electron = originalElectron;
  localStorage.clear();
  vi.restoreAllMocks();
});

async function loadCurrentSettings() {
  const store = await import("../../../src/renderer/stores/settings.store");
  await store.loadSettingsFromMainProcess();
  expect(store.useSettingsStore.getState()).toMatchObject({
    themeMode: "dark",
    startupFolderMode: "pinned",
    pinnedStartFolderId: "fixture-start-folder",
  });
  vi.mocked(window.api.settings.set).mockClear();
  return store;
}

it("hydrates a current settings snapshot through the bridge", async () => {
  await loadCurrentSettings();
  expect(window.api.settings.get).toHaveBeenCalledOnce();
});

it.each([undefined, null, [], "", false, 0])(
  "rejects malformed settings %j without replacing state or writing defaults",
  async (invalid) => {
    const store = await loadCurrentSettings();
    const before = store.useSettingsStore.getState();
    Reflect.set(window.api.settings, "get", vi.fn().mockResolvedValue(invalid));
    await expect(store.loadSettingsFromMainProcess()).rejects.toThrow(
      "Invalid settings snapshot from the current settings bridge",
    );
    expect(store.useSettingsStore.getState()).toBe(before);
    expect(window.api.settings.set).not.toHaveBeenCalled();
  },
);

it("requires the current settings bridge instead of reporting readiness", async () => {
  const store = await loadCurrentSettings();
  const before = store.useSettingsStore.getState();
  Reflect.deleteProperty(window.api.settings, "get");
  await expect(store.loadSettingsFromMainProcess()).rejects.toThrow(
    "Current settings bridge is unavailable",
  );
  expect(store.useSettingsStore.getState()).toBe(before);
  expect(window.api.settings.set).not.toHaveBeenCalled();
});

it("propagates a storage read failure without publishing replacement settings", async () => {
  const store = await loadCurrentSettings();
  const before = store.useSettingsStore.getState();
  const failure = new Error("Settings storage unavailable");
  vi.mocked(window.api.settings.get).mockRejectedValueOnce(failure);
  await expect(store.loadSettingsFromMainProcess()).rejects.toBe(failure);
  expect(store.useSettingsStore.getState()).toBe(before);
  expect(window.api.settings.set).not.toHaveBeenCalled();
});
