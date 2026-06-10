import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Renderer-side tests for the GitHub token setter (issue #108).
 *
 * Besides functional behavior, we also guard:
 *   - Control characters (CR/LF/null bytes) are stripped before the value
 *     lands in persisted state — this is a defence-in-depth layer against
 *     HTTP header injection; the main process re-validates before sending.
 *   - Every store change is pushed to the main-process DB via
 *     window.api.settings.set so the main process sees the same value when
 *     it attaches Authorization headers.
 */

const changeLanguageMock = vi.fn();

vi.mock("../../../src/renderer/i18n", () => ({
  __esModule: true,
  default: { language: "en" },
  changeLanguage: changeLanguageMock,
}));

async function importStoreWithSpy() {
  vi.resetModules();
  const setSpy = vi.fn().mockResolvedValue(undefined);
  const getSpy = vi.fn().mockResolvedValue({ githubToken: "" });
  window.api = {
    ...(window.api ?? {}),
    settings: {
      ...(window.api?.settings ?? {}),
      get: getSpy,
      set: setSpy,
    },
  };
  const mod = await import("../../../src/renderer/stores/settings.store");
  await Promise.resolve();
  return { useSettingsStore: mod.useSettingsStore, setSpy, getSpy };
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

describe("settings store · setGithubToken (issue #108)", () => {
  beforeEach(() => {
    changeLanguageMock.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("stores a valid token and pushes it to the main process", async () => {
    const { useSettingsStore, setSpy } = await importStoreWithSpy();

    useSettingsStore.getState().setGithubToken("ghp_ValidToken123");

    expect(useSettingsStore.getState().githubToken).toBe("ghp_ValidToken123");
    const payload = lastPayloadWithKey(setSpy, "githubToken");
    expect(payload?.githubToken).toBe("ghp_ValidToken123");
  });

  it("does not persist the raw token into localStorage", async () => {
    const { useSettingsStore } = await importStoreWithSpy();

    useSettingsStore.getState().setGithubToken("ghp_OnlyInMemory");

    const persistedState = localStorage.getItem("prompthub-settings") ?? "";
    expect(persistedState).not.toContain("ghp_OnlyInMemory");
  });

  it("clears same-version persisted tokens during hydration", async () => {
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          githubToken: "ghp_LeakedInRendererStorage",
        },
        version: 16,
      }),
    );

    const { useSettingsStore } = await importStoreWithSpy();

    expect(useSettingsStore.getState().githubToken).toBe("");
    expect(localStorage.getItem("prompthub-settings") ?? "").not.toContain(
      "ghp_LeakedInRendererStorage",
    );
  });

  it("loads the token from the main process on demand", async () => {
    const { useSettingsStore, getSpy } = await importStoreWithSpy();
    getSpy.mockResolvedValueOnce({ githubToken: "ghp_FromMain" });

    const { loadSettingsFromMainProcess } = await import(
      "../../../src/renderer/stores/settings.store"
    );
    await loadSettingsFromMainProcess();

    expect(useSettingsStore.getState().githubToken).toBe("ghp_FromMain");
  });

  it("does not overwrite an existing main-process startup setting during hydration", async () => {
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          launchAtStartup: false,
          minimizeOnLaunch: false,
        },
        version: 8,
      }),
    );

    const { useSettingsStore, getSpy, setSpy } = await importStoreWithSpy();
    getSpy.mockResolvedValueOnce({
      launchAtStartup: true,
      minimizeOnLaunch: true,
      githubToken: "",
    });

    const { loadSettingsFromMainProcess } = await import(
      "../../../src/renderer/stores/settings.store"
    );
    await loadSettingsFromMainProcess();

    expect(useSettingsStore.getState().launchAtStartup).toBe(true);
    expect(useSettingsStore.getState().minimizeOnLaunch).toBe(true);
    expect(lastPayloadWithKey(setSpy, "launchAtStartup")).toBeUndefined();
    expect(lastPayloadWithKey(setSpy, "minimizeOnLaunch")).toBeUndefined();
  });

  it("migrates startup settings from local storage when main-process values are missing", async () => {
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          launchAtStartup: true,
          minimizeOnLaunch: false,
        },
        version: 8,
      }),
    );

    const { useSettingsStore, getSpy, setSpy } = await importStoreWithSpy();
    getSpy.mockResolvedValueOnce({ githubToken: "" });

    const { loadSettingsFromMainProcess } = await import(
      "../../../src/renderer/stores/settings.store"
    );
    await loadSettingsFromMainProcess();

    expect(useSettingsStore.getState().launchAtStartup).toBe(true);
    expect(useSettingsStore.getState().minimizeOnLaunch).toBe(false);
    expect(
      lastPayloadWithKey(setSpy, "launchAtStartup")?.launchAtStartup,
    ).toBe(true);
    expect(
      lastPayloadWithKey(setSpy, "minimizeOnLaunch")?.minimizeOnLaunch,
    ).toBe(false);
  });

  it("trims surrounding whitespace", async () => {
    const { useSettingsStore, setSpy } = await importStoreWithSpy();

    useSettingsStore.getState().setGithubToken("   ghp_Trimmed   ");

    expect(useSettingsStore.getState().githubToken).toBe("ghp_Trimmed");
    const payload = lastPayloadWithKey(setSpy, "githubToken");
    expect(payload?.githubToken).toBe("ghp_Trimmed");
  });

  it.each([
    ["newline", "ghp_value\nextra"],
    ["carriage return", "ghp_value\rextra"],
    ["CRLF", "ghp_value\r\nextra"],
    ["null byte", "ghp_value\x00extra"],
    ["tab (falls under control range)", "ghp_value\textra"],
  ])(
    "strips control characters to prevent header injection (%s)",
    async (_label, dangerous) => {
      const { useSettingsStore } = await importStoreWithSpy();

      useSettingsStore.getState().setGithubToken(dangerous);

      const stored = useSettingsStore.getState().githubToken;
      expect(stored).not.toMatch(/[\r\n\x00-\x1f\x7f]/);
      // The safe prefix survives so the caller still gets a usable token.
      expect(stored.startsWith("ghp_value")).toBe(true);
    },
  );

  it("clearing the token also clears the main-process value", async () => {
    const { useSettingsStore, setSpy } = await importStoreWithSpy();

    useSettingsStore.getState().setGithubToken("ghp_First");
    useSettingsStore.getState().setGithubToken("");

    expect(useSettingsStore.getState().githubToken).toBe("");
    const payload = lastPayloadWithKey(setSpy, "githubToken");
    expect(payload?.githubToken).toBe("");
  });
});
