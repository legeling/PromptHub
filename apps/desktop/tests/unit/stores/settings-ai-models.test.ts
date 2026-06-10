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
    delete (window as any).api;
  });

  it("syncs AI model changes to the main process JSON settings payload", async () => {
    const setSettings = vi.fn().mockResolvedValue(undefined);
    window.api = {
      ...(window.api ?? {}),
      settings: {
        get: vi.fn(),
        set: setSettings,
      },
    };
    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    useSettingsStore.getState().addAiProvider({
      name: "Work OpenAI",
      provider: "openai",
      apiProtocol: "openai",
      apiKey: "provider-key",
      apiUrl: "https://api.openai.com/v1",
    });
    const providerId = useSettingsStore.getState().aiProviders[0].id;
    useSettingsStore.getState().addAiModel({
      providerId,
      type: "chat",
      provider: "openai",
      apiProtocol: "openai",
      apiKey: "ignored-model-key",
      apiUrl: "https://api.openai.com/v1",
      model: "gpt-4.1",
    });

    const lastPayload = setSettings.mock.calls.at(-1)?.[0];
    expect(lastPayload).toMatchObject({
      aiProviders: [
        expect.objectContaining({
          id: providerId,
          name: "Work OpenAI",
        }),
      ],
      aiModels: [
        expect.objectContaining({
          providerId,
          provider: "openai",
          apiKey: "provider-key",
          model: "gpt-4.1",
        }),
      ],
    });
  });

  it("removes scenario defaults that point to a deleted model", async () => {
    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

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
      modelRouteDefaults: {
        fastText: "chat-b",
        mainText: "chat-a",
      },
    });

    useSettingsStore.getState().deleteAiModel("chat-b");

    expect(useSettingsStore.getState().scenarioModelDefaults).toEqual({
      translation: "chat-a",
    });
    expect(useSettingsStore.getState().modelRouteDefaults).toEqual({
      mainText: "chat-a",
    });
  });

  it("stores model capabilities and switches them when the model becomes image generation", async () => {
    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    useSettingsStore.getState().addAiModel({
      type: "chat",
      provider: "openai",
      apiProtocol: "openai",
      apiKey: "key-a",
      apiUrl: "https://api.openai.com",
      model: "gpt-4o",
      capabilities: { vision: true },
    });

    const created = useSettingsStore.getState().aiModels[0];
    expect(created.capabilities).toEqual({
      chat: true,
      vision: true,
      imageGeneration: false,
      reasoning: false,
      toolUse: false,
      webSearch: false,
      embedding: false,
      rerank: false,
    });

    useSettingsStore.getState().updateAiModel(created.id, {
      type: "image",
      model: "gpt-image-1",
    });

    expect(useSettingsStore.getState().aiModels[0]).toMatchObject({
      type: "image",
      model: "gpt-image-1",
    });
    expect(useSettingsStore.getState().aiModels[0].capabilities).toEqual({
      chat: false,
      vision: false,
      imageGeneration: true,
      reasoning: false,
      toolUse: false,
      webSearch: false,
      embedding: false,
      rerank: false,
    });
  });

  it("stores future-facing capability flags independently from model type", async () => {
    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    useSettingsStore.getState().addAiModel({
      type: "chat",
      provider: "openai",
      apiProtocol: "openai",
      apiKey: "key-a",
      apiUrl: "https://api.openai.com",
      model: "gpt-4.1",
      capabilities: {
        reasoning: true,
        toolUse: true,
        webSearch: true,
        embedding: true,
        rerank: true,
      },
    });

    expect(useSettingsStore.getState().aiModels[0].capabilities).toEqual({
      chat: true,
      vision: false,
      imageGeneration: false,
      reasoning: true,
      toolUse: true,
      webSearch: true,
      embedding: true,
      rerank: true,
    });
  });

  it("stores model route defaults independently from business scenario defaults", async () => {
    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    useSettingsStore.getState().setModelRouteDefault("fastText", "chat-fast");

    expect(useSettingsStore.getState().modelRouteDefaults).toEqual({
      fastText: "chat-fast",
    });
    expect(useSettingsStore.getState().scenarioModelDefaults).toEqual({});
  });

  it("stores provider endpoints independently from model records", async () => {
    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    useSettingsStore.getState().addAiProvider({
      name: "Work OpenAI",
      provider: "openai",
      apiProtocol: "openai",
      apiKey: "provider-key",
      apiUrl: "https://api.openai.com/v1",
    });

    expect(useSettingsStore.getState().aiProviders).toEqual([
      expect.objectContaining({
        name: "Work OpenAI",
        provider: "openai",
        apiProtocol: "openai",
        apiKey: "provider-key",
        apiUrl: "https://api.openai.com/v1",
      }),
    ]);
    expect(useSettingsStore.getState().aiModels).toEqual([]);
  });

  it("normalizes same-version persisted AI model and provider settings during hydration", async () => {
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          aiApiProtocol: "unsupported",
          aiProvider: "google",
          aiApiUrl: "https://generativelanguage.googleapis.com/v1beta",
          aiProviders: [
            { id: "broken-provider", provider: "openai" },
            {
              id: "provider-gemini",
              name: "  Team Gemini  ",
              provider: "google",
              apiProtocol: "unsupported",
              apiKey: "gemini-key",
              apiUrl: " https://generativelanguage.googleapis.com/v1beta ",
            },
          ],
          aiModels: [
            { id: "broken-model", provider: "openai", apiUrl: "https://api.openai.com/v1" },
            {
              id: "model-anthropic",
              type: "chat",
              provider: "custom",
              apiProtocol: "unsupported",
              apiKey: "anthropic-key",
              apiUrl: "https://api.anthropic.com",
              model: "claude-sonnet-4",
              capabilities: { vision: true, embedding: true },
            },
          ],
        },
        version: 16,
      }),
    );

    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    expect(useSettingsStore.getState().aiApiProtocol).toBe("gemini");
    expect(useSettingsStore.getState().aiProviders).toEqual([
      expect.objectContaining({
        id: "provider-gemini",
        name: "Team Gemini",
        provider: "google",
        apiProtocol: "gemini",
        apiKey: "gemini-key",
        apiUrl: "https://generativelanguage.googleapis.com/v1beta",
      }),
    ]);
    expect(useSettingsStore.getState().aiModels).toEqual([
      expect.objectContaining({
        id: "model-anthropic",
        type: "chat",
        provider: "custom",
        apiProtocol: "anthropic",
        apiKey: "anthropic-key",
        apiUrl: "https://api.anthropic.com",
        model: "claude-sonnet-4",
        capabilities: {
          chat: true,
          vision: true,
          imageGeneration: false,
          reasoning: false,
          toolUse: false,
          webSearch: false,
          embedding: true,
          rerank: false,
        },
      }),
    ]);
  });

  it("normalizes same-version persisted AI model route defaults during hydration", async () => {
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: {
          scenarioModelDefaults: {
            quickAdd: "model-fast",
            imageReverse: "model-vision",
            unknownScenario: "model-unknown",
            promptTest: "",
            translation: 42,
          },
          modelRouteDefaults: {
            invalidRoute: "model-invalid",
            fastText: "",
            visionText: 42,
          },
        },
        version: 16,
      }),
    );

    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    expect(useSettingsStore.getState().scenarioModelDefaults).toEqual({
      quickAdd: "model-fast",
      imageReverse: "model-vision",
    });
    expect(useSettingsStore.getState().modelRouteDefaults).toEqual({
      fastText: "model-fast",
      visionText: "model-vision",
    });
  });

  it("keeps model records attached to their provider instance id", async () => {
    const { useSettingsStore } =
      await import("../../../src/renderer/stores/settings.store");

    useSettingsStore.setState({
      aiProviders: [
        {
          id: "provider-a",
          name: "Team A",
          provider: "custom",
          apiProtocol: "openai",
          apiKey: "shared-key",
          apiUrl: "https://gateway.example.com/v1",
        },
        {
          id: "provider-b",
          name: "Team B",
          provider: "custom",
          apiProtocol: "openai",
          apiKey: "shared-key",
          apiUrl: "https://gateway.example.com/v1",
        },
      ],
      aiModels: [],
    });

    useSettingsStore.getState().addAiModel({
      providerId: "provider-b",
      type: "chat",
      provider: "custom",
      apiProtocol: "openai",
      apiKey: "shared-key",
      apiUrl: "https://gateway.example.com/v1",
      model: "team-b-chat",
    });

    expect(useSettingsStore.getState().aiModels[0]).toMatchObject({
      providerId: "provider-b",
      provider: "custom",
      apiKey: "shared-key",
      apiUrl: "https://gateway.example.com/v1",
    });
  });

  it("loads shared AI providers, models, and routes from main process settings", async () => {
    const mainSettings = {
      githubToken: "",
      aiProvider: "openai",
      aiApiProtocol: "openai",
      aiApiKey: "sk-from-cli",
      aiApiUrl: "https://api.openai.com/v1",
      aiModel: "gpt-4.1",
      aiProviders: [
        {
          id: "provider_cli",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "sk-from-cli",
          apiUrl: "https://api.openai.com/v1",
        },
      ],
      aiModels: [
        {
          id: "model_cli_vision",
          type: "chat",
          providerId: "provider_cli",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "sk-from-cli",
          apiUrl: "https://api.openai.com/v1",
          model: "gpt-4.1",
          capabilities: { chat: true, vision: true },
        },
      ],
      modelRouteDefaults: {
        visionText: "model_cli_vision",
      },
    };
    window.api = {
      ...(window.api ?? {}),
      settings: {
        get: vi.fn().mockResolvedValue(mainSettings),
        set: vi.fn().mockResolvedValue(undefined),
      },
    };
    const { useSettingsStore, loadSettingsFromMainProcess } =
      await import("../../../src/renderer/stores/settings.store");

    await loadSettingsFromMainProcess();

    expect(useSettingsStore.getState().aiProviders).toEqual(
      mainSettings.aiProviders,
    );
    expect(useSettingsStore.getState().aiModels).toEqual([
      expect.objectContaining({
        ...mainSettings.aiModels[0],
        capabilities: {
          chat: true,
          vision: true,
          imageGeneration: false,
          reasoning: false,
          toolUse: false,
          webSearch: false,
          embedding: false,
          rerank: false,
        },
      }),
    ]);
    expect(useSettingsStore.getState().modelRouteDefaults).toEqual({
      visionText: "model_cli_vision",
    });
    expect(useSettingsStore.getState().aiModel).toBe("gpt-4.1");
  });

  it("normalizes shared AI providers, models, and routes from main process settings", async () => {
    const mainSettings = {
      githubToken: "",
      aiProvider: "google",
      aiApiProtocol: "unsupported",
      aiApiUrl: "https://generativelanguage.googleapis.com/v1beta",
      aiProviders: [
        { id: "broken-provider", provider: "openai" },
        {
          id: "provider-gemini",
          name: "  Team Gemini  ",
          provider: "google",
          apiProtocol: "unsupported",
          apiKey: "gemini-key",
          apiUrl: " https://generativelanguage.googleapis.com/v1beta ",
        },
      ],
      aiModels: [
        { id: "broken-model", provider: "openai", apiUrl: "https://api.openai.com/v1" },
        {
          id: "model-gemini",
          type: "chat",
          provider: "google",
          apiProtocol: "unsupported",
          apiKey: "gemini-key",
          apiUrl: " https://generativelanguage.googleapis.com/v1beta ",
          model: " gemini-2.5-pro ",
          capabilities: { vision: true, embedding: true },
        },
      ],
      modelRouteDefaults: {
        visionText: "model-gemini",
        invalidRoute: "model-broken",
      },
    };
    window.api = {
      ...(window.api ?? {}),
      settings: {
        get: vi.fn().mockResolvedValue(mainSettings),
        set: vi.fn().mockResolvedValue(undefined),
      },
    };
    const { useSettingsStore, loadSettingsFromMainProcess } =
      await import("../../../src/renderer/stores/settings.store");

    await loadSettingsFromMainProcess();

    expect(useSettingsStore.getState().aiApiProtocol).toBe("gemini");
    expect(useSettingsStore.getState().aiProviders).toEqual([
      expect.objectContaining({
        id: "provider-gemini",
        name: "Team Gemini",
        provider: "google",
        apiProtocol: "gemini",
        apiUrl: "https://generativelanguage.googleapis.com/v1beta",
      }),
    ]);
    expect(useSettingsStore.getState().aiModels).toEqual([
      expect.objectContaining({
        id: "model-gemini",
        providerId: "provider-gemini",
        provider: "google",
        apiProtocol: "gemini",
        apiUrl: "https://generativelanguage.googleapis.com/v1beta",
        model: "gemini-2.5-pro",
        capabilities: {
          chat: true,
          vision: true,
          imageGeneration: false,
          reasoning: false,
          toolUse: false,
          webSearch: false,
          embedding: true,
          rerank: false,
        },
      }),
    ]);
    expect(useSettingsStore.getState().modelRouteDefaults).toEqual({
      visionText: "model-gemini",
    });
  });
});
