import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAiConfigSnapshot,
  getCanonicalAiConfigSnapshot,
  getCanonicalSettingsStateSnapshot,
  getSettingsStateSnapshot,
  restoreAiConfigSnapshot,
  restoreSettingsStateSnapshot,
} from "../../../src/renderer/services/settings-snapshot";

const PRIMARY_SETTINGS_KEY = "prompthub-settings";
const originalPersistence = window.api.settings.rendererPersistence;
if (!originalPersistence) throw new Error("Expected canonical settings fixture");

describe("settings-snapshot", () => {
  beforeEach(() => {
    localStorage.clear();
    Reflect.deleteProperty(window.api.settings, "rendererPersistence");
  });

  afterEach(() => {
    window.api.settings.rendererPersistence = originalPersistence;
  });

  it("removes model api keys from AI snapshots while preserving root config when requested", () => {
    localStorage.setItem(
      PRIMARY_SETTINGS_KEY,
      JSON.stringify({
        state: {
          aiProviders: [
            {
              id: "p1",
              name: "Work OpenAI",
              provider: "openai",
              apiProtocol: "openai",
              apiKey: "provider-secret",
              apiUrl: "https://api.openai.com/v1",
            },
          ],
          aiModels: [
            {
              id: "m1",
              name: "Model One",
              apiProtocol: "openai",
              apiKey: "model-secret",
            },
            { id: "m2", name: "Model Two", apiProtocol: "anthropic" },
          ],
          aiProvider: "openai",
          aiApiProtocol: "openai",
          aiApiKey: "root-secret",
          aiApiUrl: "https://api.example.com",
          aiModel: "gpt-test",
        },
      }),
    );

    expect(getAiConfigSnapshot()).toEqual({
      aiProviders: [
        {
          id: "p1",
          name: "Work OpenAI",
          provider: "openai",
          apiProtocol: "openai",
          apiUrl: "https://api.openai.com/v1",
        },
      ],
      aiModels: [
        { id: "m1", name: "Model One", apiProtocol: "openai" },
        { id: "m2", name: "Model Two", apiProtocol: "anthropic" },
      ],
      scenarioModelDefaults: {},
      modelRouteDefaults: {},
      aiProvider: "openai",
      aiApiProtocol: "openai",
      aiApiUrl: "https://api.example.com",
      aiModel: "gpt-test",
    });

    expect(getAiConfigSnapshot({ includeRootApiKey: true })).toEqual({
      aiProviders: [
        {
          id: "p1",
          name: "Work OpenAI",
          provider: "openai",
          apiProtocol: "openai",
          apiUrl: "https://api.openai.com/v1",
        },
      ],
      aiModels: [
        { id: "m1", name: "Model One", apiProtocol: "openai" },
        { id: "m2", name: "Model Two", apiProtocol: "anthropic" },
      ],
      scenarioModelDefaults: {},
      modelRouteDefaults: {},
      aiProvider: "openai",
      aiApiProtocol: "openai",
      aiApiKey: "root-secret",
      aiApiUrl: "https://api.example.com",
      aiModel: "gpt-test",
    });
  });

  it("preserves local-only settings fields when restoring a remote snapshot", async () => {
    localStorage.setItem(
      PRIMARY_SETTINGS_KEY,
      JSON.stringify({
        state: {
          language: "zh-CN",
          webdavPassword: "local-password",
          aiApiKey: "local-ai-key",
          theme: "dark",
        },
      }),
    );

    await restoreSettingsStateSnapshot(
      {
        state: {
          language: "en",
          webdavPassword: "remote-password",
          aiApiKey: "remote-ai-key",
          theme: "light",
        },
      },
      {
        preserveLocalFields: ["webdavPassword", "aiApiKey"],
      },
    );

    expect(
      JSON.parse(localStorage.getItem(PRIMARY_SETTINGS_KEY) || "{}"),
    ).toEqual({
      state: {
        language: "en",
        webdavPassword: "local-password",
        aiApiKey: "local-ai-key",
        theme: "light",
      },
    });
  });

  it("round-trips the non-sensitive Codex identity preference", async () => {
    localStorage.setItem(
      PRIMARY_SETTINGS_KEY,
      JSON.stringify({
        state: {
          language: "en",
          agentIdentityPreferences: {
            codex: { name: "chatgpt", icon: "codex" },
          },
        },
      }),
    );
    const snapshot = getSettingsStateSnapshot();

    localStorage.setItem(
      PRIMARY_SETTINGS_KEY,
      JSON.stringify({
        state: {
          language: "zh",
          agentIdentityPreferences: {
            codex: { name: "codex", icon: "chatgpt" },
          },
        },
      }),
    );
    await restoreSettingsStateSnapshot(snapshot);

    expect(getSettingsStateSnapshot()?.state.agentIdentityPreferences).toEqual({
      codex: { name: "chatgpt", icon: "codex" },
    });
  });

  it("restores AI config into existing settings state", async () => {
    localStorage.setItem(
      PRIMARY_SETTINGS_KEY,
      JSON.stringify({
        state: {
          language: "zh-CN",
          aiApiKey: "local-key",
        },
      }),
    );

    await restoreAiConfigSnapshot({
      aiProvider: "anthropic",
      aiApiProtocol: "anthropic",
      aiApiKey: "restored-key",
      aiApiUrl: "https://restored.example.com",
      aiModel: "claude-test",
      aiModels: [
        { id: "claude-test", name: "Claude Test", apiProtocol: "anthropic" },
      ],
      scenarioModelDefaults: { translation: "claude-test" },
      modelRouteDefaults: { fastText: "claude-test" },
    });

    expect(getSettingsStateSnapshot()).toEqual({
      state: {
        language: "zh-CN",
        aiProvider: "anthropic",
        aiApiProtocol: "anthropic",
        aiApiKey: "local-key",
        aiApiUrl: "https://restored.example.com",
        aiModel: "claude-test",
        aiModels: [
          { id: "claude-test", name: "Claude Test", apiProtocol: "anthropic" },
        ],
        scenarioModelDefaults: { translation: "claude-test" },
        modelRouteDefaults: { fastText: "claude-test" },
      },
      settingsUpdatedAt: undefined,
    });
  });

  it("restores desktop snapshots through canonical main storage and propagates failures", async () => {
    const replaceSettings = vi.fn(async () => undefined);
    window.api.settings = {
      ...window.api.settings,
      rendererPersistence: {
        ...originalPersistence,
        get: vi.fn(async () => ({
          settings: {
            language: "zh",
            webdavPassword: "local-secret",
            aiProviders: [{ id: "p1", apiKey: "provider-secret" }],
          },
        })),
        replaceSettings,
      },
    };

    expect(
      await getCanonicalSettingsStateSnapshot({
        excludeFields: ["webdavPassword"],
      }),
    ).toEqual({
      state: {
        language: "zh",
        aiProviders: [{ id: "p1", apiKey: "provider-secret" }],
      },
      settingsUpdatedAt: undefined,
    });
    expect(await getCanonicalAiConfigSnapshot()).toMatchObject({
      aiProviders: [{ id: "p1" }],
    });

    await restoreSettingsStateSnapshot(
      { state: { language: "en", webdavPassword: "remote-secret" } },
      { preserveLocalFields: ["webdavPassword"] },
    );
    await restoreAiConfigSnapshot({
      aiProviders: [{ id: "p1", provider: "openai" }],
    });

    expect(replaceSettings).toHaveBeenNthCalledWith(1, {
      language: "en",
      webdavPassword: "local-secret",
    });
    expect(replaceSettings).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        aiProviders: [
          { id: "p1", provider: "openai", apiKey: "provider-secret" },
        ],
      }),
    );

    replaceSettings.mockRejectedValueOnce(new Error("canonical write failed"));
    await expect(
      restoreSettingsStateSnapshot({ state: { language: "fr" } }),
    ).rejects.toThrow("canonical write failed");
  });
});
