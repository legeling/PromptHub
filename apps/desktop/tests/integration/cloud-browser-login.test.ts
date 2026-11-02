import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  CloudBrowserLogin,
  CLOUD_BROWSER_LOGIN_TIMEOUT_MS,
} from "../../src/main/services/cloud-browser-login";

const baseUrl = "https://api.example.test";
const user = { id: "fixture", email: "fixture@example.test", name: null };

describe("desktop browser login listener", () => {
  it("accepts only its callback and state, exchanges with the private verifier, and closes its port", async () => {
    let callbackUrl = "";
    let challenge = "";
    const exchange = vi.fn(async (input) => {
      expect(
        createHash("sha256").update(input.codeVerifier).digest("base64url"),
      ).toBe(challenge);
      expect(input.ticket).toBe("t".repeat(43));
      return { user, baseUrl };
    });
    const login = new CloudBrowserLogin({
      exchange,
      openExternal: async (value) => {
        const start = new URL(value);
        callbackUrl = start.searchParams.get("callbackUrl")!;
        challenge = start.searchParams.get("codeChallenge")!;
        expect(start.searchParams.has("codeVerifier")).toBe(false);
        expect(
          (await fetch(`${callbackUrl}?state=wrong&ticket=${"t".repeat(43)}`))
            .status,
        ).toBe(400);
        const callback = new URL(callbackUrl);
        callback.search = new URLSearchParams({
          state: start.searchParams.get("state")!,
          ticket: "t".repeat(43),
        }).toString();
        const response = await fetch(callback, {
          headers: { "accept-language": "zh-CN,zh;q=0.9" },
        });
        expect(response.status).toBe(200);
        expect(await response.text()).toContain("请返回 PromptHub");
      },
    });
    expect(await login.start(baseUrl)).toEqual({ user, baseUrl });
    expect(exchange).toHaveBeenCalledOnce();
    await expect(fetch(callbackUrl)).rejects.toThrow();
  });
  it("cancels pending login and releases the listener", async () => {
    let ready!: () => void;
    const opened = new Promise<void>((resolve) => {
      ready = resolve;
    });
    let callback = "";
    const exchange = vi.fn();
    const login = new CloudBrowserLogin({
      exchange,
      openExternal: async (value) => {
        callback = new URL(value).searchParams.get("callbackUrl")!;
        ready();
      },
    });
    const pending = login.start(baseUrl);
    const rejected = expect(pending).rejects.toThrow(
      "cloud_browser_login_cancelled",
    );
    await opened;
    login.cancel();
    await rejected;
    await expect(fetch(callback)).rejects.toThrow();
    expect(exchange).not.toHaveBeenCalled();
  });
  it("cancels even before listening without launching a browser", async () => {
    const openExternal = vi.fn();
    const login = new CloudBrowserLogin({ exchange: vi.fn(), openExternal });
    const pending = login.start(baseUrl);
    login.cancel();
    await expect(pending).rejects.toThrow("cloud_browser_login_cancelled");
    await new Promise((resolve) => setImmediate(resolve));
    expect(openExternal).not.toHaveBeenCalled();
  });
  it("expires abandoned logins and rejects a second simultaneous login", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let ready!: () => void;
    const opened = new Promise<void>((resolve) => {
      ready = resolve;
    });
    let callback = "";
    const login = new CloudBrowserLogin({
      exchange: vi.fn(),
      openExternal: async (value) => {
        callback = new URL(value).searchParams.get("callbackUrl")!;
        ready();
      },
    });
    try {
      const pending = login.start(baseUrl);
      const rejected = expect(pending).rejects.toThrow(
        "cloud_browser_login_expired",
      );
      await opened;
      await expect(login.start(baseUrl)).rejects.toThrow(
        "cloud_browser_login_in_progress",
      );
      await vi.advanceTimersByTimeAsync(CLOUD_BROWSER_LOGIN_TIMEOUT_MS);
      await rejected;
    } finally {
      login.cancel();
      vi.useRealTimers();
    }
    await expect(fetch(callback)).rejects.toThrow();
  });
  it("cleans up on browser open failure and allows another attempt", async () => {
    const login = new CloudBrowserLogin({
      exchange: vi.fn(),
      openExternal: async () => {
        throw new Error("browser failed");
      },
    });
    await expect(login.start(baseUrl)).rejects.toThrow(
      "cloud_browser_open_failed",
    );
    await expect(login.start(baseUrl)).rejects.toThrow(
      "cloud_browser_open_failed",
    );
  });
});
