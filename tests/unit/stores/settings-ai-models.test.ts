import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const changeLanguageMock = vi.fn();

vi.mock("../../../src/renderer/i18n", () => ({
  __esModule: true,
  default: { language: "en" },
  changeLanguage: changeLanguageMock,
}));

describe("settings ai model actions", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    changeLanguageMock.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("removes scenario defaults that point to a deleted model", async () => {
    const { useSettingsStore } = await import(
      "../../../src/renderer/stores/settings.store"
    );

    useSettingsStore.setState({
      aiModels: [
        {
          id: "chat-a",
          type: "chat",
          provider: "openai",
          apiKey: "key-a",
          apiUrl: "https://api.openai.com",
          model: "gpt-4.1",
          isDefault: true,
        },
        {
          id: "chat-b",
          type: "chat",
          provider: "anthropic",
          apiKey: "key-b",
          apiUrl: "https://api.anthropic.com",
          model: "claude-sonnet-4",
        },
      ],
      scenarioModelDefaults: {
        quickAdd: "chat-b",
        translation: "chat-a",
      },
    });

    useSettingsStore.getState().deleteAiModel("chat-b");

    expect(useSettingsStore.getState().scenarioModelDefaults).toEqual({
      translation: "chat-a",
    });
  });
});
