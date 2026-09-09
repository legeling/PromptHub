import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/renderer/i18n", () => ({
  __esModule: true,
  default: { language: "en" },
  changeLanguage: vi.fn(),
}));

async function importStore() {
  vi.resetModules();
  window.api = {
    ...(window.api ?? {}),
    settings: {
      ...(window.api?.settings ?? {}),
      get: vi.fn().mockResolvedValue({ githubToken: "" }),
      set: vi.fn().mockResolvedValue(undefined),
    },
  };
  return import("../../../src/renderer/stores/settings.store");
}

describe("standalone content scan settings", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());
  it("defaults off and persists only explicit enablement and method", async () => {
    const { useSettingsStore } = await importStore();
    expect(useSettingsStore.getState().skillSafetyScanEnabled).toBe(false);
    expect(useSettingsStore.getState().skillSafetyScanMethod).toBe("static");
    useSettingsStore.getState().setSkillSafetyScanEnabled(true);
    useSettingsStore.getState().setSkillSafetyScanMethod("ai");
    const reloaded = await importStore();
    expect(reloaded.useSettingsStore.getState()).toMatchObject({
      skillSafetyScanEnabled: true,
      skillSafetyScanMethod: "ai",
    });
  });
  it("does not migrate old automatic or trusted-source settings into opt-in", async () => {
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        version: 19,
        state: {
          autoScanInstalledSkills: true,
          autoScanStoreSkillsBeforeInstall: true,
          skillSafetyChannelPolicies: { official: "enabled" },
          skillSafetyStorePolicies: { team: "enabled" },
          trustedSkillUpdateSourceKeys: ["team"],
        },
      }),
    );
    const { useSettingsStore } = await importStore();
    expect(useSettingsStore.getState()).toMatchObject({
      skillSafetyScanEnabled: false,
      skillSafetyScanMethod: "static",
      autoScanInstalledSkills: false,
      autoScanStoreSkillsBeforeInstall: false,
      skillSafetyChannelPolicies: {},
      skillSafetyStorePolicies: {},
      trustedSkillUpdateSourceKeys: [],
    });
  });
});
