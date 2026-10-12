import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rendererPersistence = window.api.settings.rendererPersistence;

const changeLanguageMock = vi.fn();

vi.mock("../../../src/renderer/i18n", () => ({
  __esModule: true,
  default: { language: "en" },
  changeLanguage: changeLanguageMock,
}));

async function importStoreWithSettingsSpies(
  settingsFromMain: Record<string, unknown> = { githubToken: "" },
) {
  vi.resetModules();
  const setSpy = vi.fn().mockResolvedValue(undefined);
  const getSpy = vi.fn().mockResolvedValue(settingsFromMain);
  window.api.settings.get = getSpy;
  window.api.settings.set = setSpy;
  const mod = await import("../../../src/renderer/stores/settings.store");
  await Promise.resolve();
  return {
    useSettingsStore: mod.useSettingsStore,
    setSpy,
    getSpy,
    loadSettingsFromMainProcess: mod.loadSettingsFromMainProcess,
  };
}

function lastPayloadWithKey(
  spy: ReturnType<typeof vi.fn>,
  key: string,
): Record<string, unknown> | undefined {
  for (let i = spy.mock.calls.length - 1; i >= 0; i -= 1) {
    const payload = spy.mock.calls[i]?.[0] as
      | Record<string, unknown>
      | undefined;
    if (payload && key in payload) {
      return payload;
    }
  }
  return undefined;
}

describe("settings sync provider guards", () => {
  beforeEach(() => {
    window.api.settings.rendererPersistence = rendererPersistence;
    changeLanguageMock.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    window.api.settings.rendererPersistence = rendererPersistence;
    localStorage.clear();
  });

  it("falls back to manual when disabling the active WebDAV sync provider", async () => {
    const { useSettingsStore, setSpy } = await importStoreWithSettingsSpies();

    useSettingsStore.getState().setWebdavEnabled(true);
    useSettingsStore.getState().setSyncProvider("webdav");
    setSpy.mockClear();

    useSettingsStore.getState().setWebdavEnabled(false);

    expect(useSettingsStore.getState().webdavEnabled).toBe(false);
    expect(useSettingsStore.getState().syncProvider).toBe("manual");
    expect(lastPayloadWithKey(setSpy, "sync")?.sync).toEqual({
      enabled: false,
      provider: "manual",
      autoSync: false,
    });
  });

  it("falls back to manual when disabling the active self-hosted sync provider", async () => {
    const { useSettingsStore, setSpy } = await importStoreWithSettingsSpies();

    useSettingsStore.getState().setSelfHostedSyncEnabled(true);
    useSettingsStore.getState().setSyncProvider("self-hosted");
    setSpy.mockClear();

    useSettingsStore.getState().setSelfHostedSyncEnabled(false);

    expect(useSettingsStore.getState().selfHostedSyncEnabled).toBe(false);
    expect(useSettingsStore.getState().syncProvider).toBe("manual");
    expect(lastPayloadWithKey(setSpy, "sync")?.sync).toEqual({
      enabled: false,
      provider: "manual",
      autoSync: false,
    });
  });

  it("falls back to manual when disabling the active S3 sync provider", async () => {
    const { useSettingsStore, setSpy } = await importStoreWithSettingsSpies();

    useSettingsStore.getState().setS3StorageEnabled(true);
    useSettingsStore.getState().setSyncProvider("s3");
    setSpy.mockClear();

    useSettingsStore.getState().setS3StorageEnabled(false);

    expect(useSettingsStore.getState().s3StorageEnabled).toBe(false);
    expect(useSettingsStore.getState().syncProvider).toBe("manual");
    expect(lastPayloadWithKey(setSpy, "sync")?.sync).toEqual({
      enabled: false,
      provider: "manual",
      autoSync: false,
    });
  });

  it("rejects selecting an automatic sync provider that is not enabled", async () => {
    const { useSettingsStore, setSpy } = await importStoreWithSettingsSpies();

    useSettingsStore.getState().setSyncProvider("s3");

    expect(useSettingsStore.getState().syncProvider).toBe("manual");
    expect(lastPayloadWithKey(setSpy, "sync")?.sync).toEqual({
      enabled: false,
      provider: "manual",
      autoSync: false,
    });
  });

  it("infers the only active legacy auto-sync provider during migration", async () => {
    // Legacy snapshots predate the canonical renderer-persistence bridge.
    Reflect.deleteProperty(window.api.settings, "rendererPersistence");
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          s3StorageEnabled: true,
          s3SyncOnSave: true,
        },
        version: 8,
      }),
    );

    const { useSettingsStore } = await importStoreWithSettingsSpies();

    expect(useSettingsStore.getState().syncProvider).toBe("s3");
  });

  it("ignores self-hosted backup automation when migrating the active sync provider", async () => {
    // Legacy snapshots predate the canonical renderer-persistence bridge.
    Reflect.deleteProperty(window.api.settings, "rendererPersistence");
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          selfHostedSyncEnabled: true,
          selfHostedSyncOnStartup: true,
          s3StorageEnabled: true,
          s3SyncOnSave: true,
        },
        version: 8,
      }),
    );

    const { useSettingsStore } = await importStoreWithSettingsSpies();

    expect(useSettingsStore.getState().syncProvider).toBe("s3");
  });

  it("clamps an invalid persisted sync provider after migration", async () => {
    // Legacy snapshots predate the canonical renderer-persistence bridge.
    Reflect.deleteProperty(window.api.settings, "rendererPersistence");
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          s3StorageEnabled: false,
          syncProvider: "s3",
        },
        version: 9,
      }),
    );

    const { useSettingsStore } = await importStoreWithSettingsSpies();

    expect(useSettingsStore.getState().syncProvider).toBe("manual");
  });

  it("normalizes same-version persisted sync timing values during hydration", async () => {
    // Legacy snapshots predate the canonical renderer-persistence bridge.
    Reflect.deleteProperty(window.api.settings, "rendererPersistence");
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          webdavSyncOnStartupDelay: -20,
          selfHostedSyncOnStartupDelay: "invalid",
          s3SyncOnStartupDelay: 99,
          webdavAutoSyncInterval: "15",
          selfHostedAutoSyncInterval: "invalid",
          s3AutoSyncInterval: -5,
        },
        version: 16,
      }),
    );

    const { useSettingsStore } = await importStoreWithSettingsSpies();

    expect(useSettingsStore.getState().webdavSyncOnStartupDelay).toBe(0);
    expect(useSettingsStore.getState().selfHostedSyncOnStartupDelay).toBe(10);
    expect(useSettingsStore.getState().s3SyncOnStartupDelay).toBe(60);
    expect(useSettingsStore.getState().webdavAutoSyncInterval).toBe(15);
    expect(useSettingsStore.getState().selfHostedAutoSyncInterval).toBe(0);
    expect(useSettingsStore.getState().s3AutoSyncInterval).toBe(0);
  });

  it("clamps a main-process sync provider to manual when that provider is disabled locally", async () => {
    const { useSettingsStore, setSpy, loadSettingsFromMainProcess } =
      await importStoreWithSettingsSpies({
        githubToken: "",
        sync: { provider: "s3" },
      });

    expect(useSettingsStore.getState().s3StorageEnabled).toBe(false);
    setSpy.mockClear();

    await loadSettingsFromMainProcess();

    expect(useSettingsStore.getState().syncProvider).toBe("manual");
    expect(lastPayloadWithKey(setSpy, "sync")?.sync).toEqual({
      enabled: false,
      provider: "manual",
      autoSync: false,
    });
  });

  it("restores the canonical flat WebDAV provider after renderer reload", async () => {
    const { useSettingsStore, loadSettingsFromMainProcess } =
      await importStoreWithSettingsSpies({
        githubToken: "",
        sync: { provider: "manual" },
        syncProvider: "webdav",
        webdavEnabled: true,
        webdavUrl: "https://dav.example.com",
        webdavUsername: "dav-user",
        webdavPassword: "dav-secret",
        webdavSyncOnStartup: true,
      });

    await loadSettingsFromMainProcess();

    expect(useSettingsStore.getState()).toMatchObject({
      syncProvider: "webdav",
      webdavEnabled: true,
      webdavSyncOnStartup: true,
    });
  });

  it("hydrates canonical backup credentials and timing settings from the main process", async () => {
    const { useSettingsStore, loadSettingsFromMainProcess } =
      await importStoreWithSettingsSpies({
        githubToken: "",
        sync: { provider: "self-hosted" },
        webdavEnabled: true,
        webdavUrl: "https://dav.example.com",
        webdavUsername: "dav-user",
        webdavPassword: "dav-secret",
        webdavSyncOnStartup: true,
        webdavSyncOnStartupDelay: 3,
        selfHostedSyncEnabled: true,
        selfHostedSyncUrl: "https://hub.example.com",
        selfHostedSyncUsername: "hub-user",
        selfHostedSyncPassword: "hub-secret",
        selfHostedSyncOnStartup: true,
        selfHostedSyncOnStartupDelay: 4,
        s3StorageEnabled: true,
        s3Endpoint: "https://s3.example.com",
        s3AccessKeyId: "access-key",
        s3SecretAccessKey: "secret-key",
      });

    await loadSettingsFromMainProcess();

    expect(useSettingsStore.getState()).toMatchObject({
      syncProvider: "manual",
      webdavEnabled: true,
      webdavUrl: "https://dav.example.com",
      webdavUsername: "dav-user",
      webdavPassword: "dav-secret",
      webdavSyncOnStartup: true,
      webdavSyncOnStartupDelay: 3,
      selfHostedSyncEnabled: true,
      selfHostedSyncUrl: "https://hub.example.com",
      selfHostedSyncUsername: "hub-user",
      selfHostedSyncPassword: "hub-secret",
      selfHostedSyncOnStartup: true,
      selfHostedSyncOnStartupDelay: 4,
      s3StorageEnabled: true,
      s3Endpoint: "https://s3.example.com",
      s3AccessKeyId: "access-key",
      s3SecretAccessKey: "secret-key",
    });
  });
});
