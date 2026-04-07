import { beforeEach, describe, expect, it } from "vitest";
import {
  getAiConfigSnapshot,
  getSettingsStateSnapshot,
  restoreAiConfigSnapshot,
  restoreSettingsStateSnapshot,
} from "../../../src/renderer/services/settings-snapshot";

const PRIMARY_SETTINGS_KEY = "prompthub-settings";

describe("settings-snapshot", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("removes model api keys from AI snapshots while preserving root config when requested", () => {
    localStorage.setItem(
      PRIMARY_SETTINGS_KEY,
      JSON.stringify({
        state: {
          aiModels: [
            { id: "m1", name: "Model One", apiKey: "model-secret" },
            { id: "m2", name: "Model Two" },
          ],
          aiProvider: "openai",
          aiApiKey: "root-secret",
          aiApiUrl: "https://api.example.com",
          aiModel: "gpt-test",
        },
      }),
    );

    expect(getAiConfigSnapshot()).toEqual({
      aiModels: [
        { id: "m1", name: "Model One" },
        { id: "m2", name: "Model Two" },
      ],
      scenarioModelDefaults: {},
      aiProvider: "openai",
      aiApiUrl: "https://api.example.com",
      aiModel: "gpt-test",
    });

    expect(getAiConfigSnapshot({ includeRootApiKey: true })).toEqual({
      aiModels: [
        { id: "m1", name: "Model One" },
        { id: "m2", name: "Model Two" },
      ],
      scenarioModelDefaults: {},
      aiProvider: "openai",
      aiApiKey: "root-secret",
      aiApiUrl: "https://api.example.com",
      aiModel: "gpt-test",
    });
  });

  it("preserves local-only settings fields when restoring a remote snapshot", () => {
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

    restoreSettingsStateSnapshot(
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

    expect(JSON.parse(localStorage.getItem(PRIMARY_SETTINGS_KEY) || "{}")).toEqual(
      {
        state: {
          language: "en",
          webdavPassword: "local-password",
          aiApiKey: "local-ai-key",
          theme: "light",
        },
      },
    );
  });

  it("restores AI config into existing settings state", () => {
    localStorage.setItem(
      PRIMARY_SETTINGS_KEY,
      JSON.stringify({
        state: {
          language: "zh-CN",
        },
      }),
    );

    restoreAiConfigSnapshot({
      aiProvider: "anthropic",
      aiApiKey: "restored-key",
      aiApiUrl: "https://restored.example.com",
      aiModel: "claude-test",
      aiModels: [{ id: "claude-test", name: "Claude Test" }],
      scenarioModelDefaults: { translation: "claude-test" },
    });

    expect(getSettingsStateSnapshot()).toEqual({
      state: {
        language: "zh-CN",
        aiProvider: "anthropic",
        aiApiKey: "restored-key",
        aiApiUrl: "https://restored.example.com",
        aiModel: "claude-test",
        aiModels: [{ id: "claude-test", name: "Claude Test" }],
        scenarioModelDefaults: { translation: "claude-test" },
      },
      settingsUpdatedAt: undefined,
    });
  });
});
