import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const setProxyMock = vi.fn().mockResolvedValue(undefined);

vi.mock("electron", () => ({
  session: {
    defaultSession: {
      setProxy: setProxyMock,
    },
  },
}));

describe("network proxy service", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    setProxyMock.mockClear();
    process.env = { ...originalEnv };
  });

  afterEach(async () => {
    const mod = await import("../../../src/main/services/network-proxy");
    await mod.applyNetworkProxySettings({ mode: "system" });
    process.env = { ...originalEnv };
  });

  it("applies manual proxy to Electron session, proxy env, and request agents", async () => {
    const mod = await import("../../../src/main/services/network-proxy");

    await mod.applyNetworkProxySettings({
      mode: "manual",
      protocol: "http",
      host: "127.0.0.1",
      port: 7890,
      username: "u",
      password: "p",
      bypass: "<local>,localhost",
    });

    expect(setProxyMock).toHaveBeenLastCalledWith({
      mode: "fixed_servers",
      proxyRules: "http://u:p@127.0.0.1:7890",
      proxyBypassRules: "<local>,localhost",
    });
    expect(process.env.HTTP_PROXY).toBe("http://u:p@127.0.0.1:7890");
    expect(process.env.HTTPS_PROXY).toBe("http://u:p@127.0.0.1:7890");
    expect(mod.getHttpRequestAgent("https://api.github.com/repos")).toBeDefined();
    expect(mod.getHttpRequestAgent("https://localhost/test")).toBeUndefined();
  });

  it("restores direct proxy mode", async () => {
    const mod = await import("../../../src/main/services/network-proxy");
    process.env.HTTP_PROXY = "http://old.proxy:8080";

    await mod.applyNetworkProxySettings({ mode: "direct" });

    expect(setProxyMock).toHaveBeenLastCalledWith({ mode: "direct" });
    expect(process.env.HTTP_PROXY).toBe(originalEnv.HTTP_PROXY);
  });
});
