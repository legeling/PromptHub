import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const changeLanguageMock = vi.fn();

vi.mock("../../../src/renderer/i18n", () => ({
  __esModule: true,
  default: { language: "en" },
  changeLanguage: changeLanguageMock,
}));

async function importStoreWithSpy() {
  vi.resetModules();
  localStorage.clear();
  const setSpy = vi.fn().mockResolvedValue(undefined);
  window.api = {
    ...(window.api ?? {}),
    settings: {
      ...(window.api?.settings ?? {}),
      set: setSpy,
    },
  };
  const mod = await import("../../../src/renderer/stores/settings.store");
  await Promise.resolve();
  return { useSettingsStore: mod.useSettingsStore, setSpy };
}

function lastNetworkProxyPayload(spy: ReturnType<typeof vi.fn>) {
  for (let i = spy.mock.calls.length - 1; i >= 0; i -= 1) {
    const payload = spy.mock.calls[i]?.[0] as
      | { networkProxy?: unknown }
      | undefined;
    if (payload?.networkProxy) {
      return payload.networkProxy;
    }
  }
  return undefined;
}

describe("settings network proxy", () => {
  beforeEach(() => {
    changeLanguageMock.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("normalizes and syncs manual proxy settings to the main process", async () => {
    const { useSettingsStore, setSpy } = await importStoreWithSpy();

    useSettingsStore.getState().setNetworkProxy({
      mode: "manual",
      host: "https://user:pass@127.0.0.1:8080",
      bypass: "<local>; localhost\n127.0.0.1",
    });

    expect(useSettingsStore.getState().networkProxy).toMatchObject({
      mode: "manual",
      protocol: "https",
      host: "127.0.0.1",
      port: 8080,
      username: "user",
      password: "pass",
      bypass: "<local>,localhost,127.0.0.1",
    });
    expect(lastNetworkProxyPayload(setSpy)).toMatchObject(
      useSettingsStore.getState().networkProxy,
    );
  });
});
