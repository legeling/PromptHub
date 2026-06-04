import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AISettingsPrototype } from "../../../src/renderer/components/settings/AISettingsPrototype";
import { buildEndpointGroupKey } from "../../../src/renderer/components/settings/ai-workbench/helpers";
import {
  fetchAvailableModels,
  testAIConnection,
} from "../../../src/renderer/services/ai";
import { renderWithI18n } from "../../helpers/i18n";

const useSettingsStoreMock = vi.fn();
const useToastMock = vi.fn();

vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: () => useSettingsStoreMock(),
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => useToastMock(),
}));

vi.mock("../../../src/renderer/services/ai", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/renderer/services/ai")>();
  return {
    ...actual,
    fetchAvailableModels: vi.fn(),
    testAIConnection: vi.fn(),
    testImageGeneration: vi.fn(),
  };
});

function createSettingsState() {
  return {
    aiModels: [],
    aiProviders: [
      {
        id: "provider-1",
        provider: "openai",
        apiProtocol: "openai" as const,
        apiKey: "test-key",
        apiUrl: "https://api.example.com/v1",
      },
    ],
    scenarioModelDefaults: {},
    modelRouteDefaults: {},
    aiProvider: "openai",
    aiApiKey: "",
    aiApiUrl: "",
    aiModel: "",
    translationMode: "immersive" as const,
    setScenarioModelDefault: vi.fn(),
    setModelRouteDefault: vi.fn(),
    setTranslationMode: vi.fn(),
    addAiProvider: vi.fn(),
    updateAiProvider: vi.fn(),
    deleteAiProvider: vi.fn(),
    addAiModel: vi.fn(),
    updateAiModel: vi.fn(),
    deleteAiModel: vi.fn(),
    setDefaultAiModel: vi.fn(),
  };
}

function createConfiguredModel(
  overrides: Partial<{
    id: string;
    providerId?: string;
    provider: string;
    apiProtocol: "openai" | "gemini" | "anthropic";
    apiKey: string;
    apiUrl: string;
    model: string;
    type: "chat" | "image";
    capabilities?: {
      chat?: boolean;
      vision?: boolean;
      imageGeneration?: boolean;
      reasoning?: boolean;
      toolUse?: boolean;
      webSearch?: boolean;
      embedding?: boolean;
      rerank?: boolean;
    };
    lastVerifiedAt?: string;
  }> = {},
) {
  return {
    id: "model-1",
    provider: "custom",
    apiProtocol: "openai" as const,
    apiKey: "test-key",
    apiUrl: "https://api.example.com/v1",
    model: "gpt-4.1",
    type: "chat" as const,
    capabilities: {
      chat: true,
      vision: false,
      imageGeneration: false,
      reasoning: false,
      toolUse: false,
      webSearch: false,
      embedding: false,
      rerank: false,
    },
    ...overrides,
  };
}

function withinModal(title: string) {
  const heading = screen.getByRole("heading", { name: title });
  const modal = heading.closest(".app-wallpaper-panel-strong");
  if (!modal) {
    throw new Error(`Unable to locate modal for ${title}`);
  }
  return within(modal as HTMLElement);
}

describe("AISettingsPrototype", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useToastMock.mockReturnValue({ showToast: vi.fn() });
  });

  it("uses provider instance ids as endpoint grouping keys", () => {
    expect(
      buildEndpointGroupKey(
        createConfiguredModel({
          id: "model-a",
          providerId: "provider-a",
          provider: "custom",
          apiUrl: "https://gateway.example.com/v1",
        }),
      ),
    ).toBe("provider:provider-a");
    expect(
      buildEndpointGroupKey(
        createConfiguredModel({
          id: "model-b",
          providerId: "provider-b",
          provider: "custom",
          apiUrl: "https://gateway.example.com/v1",
        }),
      ),
    ).toBe("provider:provider-b");
  });

  it("renders translated English copy instead of hard-coded Chinese", async () => {
    useSettingsStoreMock.mockReturnValue(createSettingsState());

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    expect(screen.getByText("Provider")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Model Routing" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Advanced Parameters" }),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Search provider or model..."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Status Overview")).not.toBeInTheDocument();
    expect(screen.queryByText("AI 模型工作台")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Provider" })).toHaveClass(
      "w-full",
    );

    fireEvent.click(screen.getByRole("button", { name: "Model Routing" }));

    expect(screen.getByText("Status Overview")).toBeInTheDocument();
  });

  it("lets the endpoint detail panel fill the available model-service width", async () => {
    const settingsState = createSettingsState();
    settingsState.aiModels = [
      createConfiguredModel({
        id: "model-wide",
        providerId: "provider-1",
        name: "Wide Model",
        model: "gpt-wide",
      }),
    ];
    useSettingsStoreMock.mockReturnValue(settingsState);

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    const detailPanel = screen.getByRole("heading", {
      name: "Model Services",
    }).parentElement;

    expect(detailPanel).toHaveClass("w-full");
    expect(detailPanel).not.toHaveClass("max-w-4xl");
    expect(detailPanel).not.toHaveClass("mx-auto");
  });

  it("updates endpoint api key and url inline without opening the edit dialog", async () => {
    const settingsState = createSettingsState();
    settingsState.aiModels = [
      createConfiguredModel({
        id: "model-inline",
        providerId: "provider-1",
        provider: "openai",
        apiKey: "old-key",
        apiUrl: "https://api.example.com/v1",
        model: "gpt-inline",
      }),
    ];
    settingsState.aiProviders = [
      {
        id: "provider-1",
        name: "Inline Provider",
        provider: "openai",
        apiProtocol: "openai" as const,
        apiKey: "old-key",
        apiUrl: "https://api.example.com/v1",
      },
    ];
    useSettingsStoreMock.mockReturnValue(settingsState);

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    expect(screen.queryByRole("heading", { name: "Edit Endpoint" }))
      .not.toBeInTheDocument();

    const endpointApiKeyInput = screen.getByLabelText("Endpoint API Key");
    expect(endpointApiKeyInput).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(endpointApiKeyInput).toHaveAttribute("type", "text");

    fireEvent.change(endpointApiKeyInput, {
      target: { value: "new-key" },
    });
    fireEvent.change(screen.getByLabelText("Endpoint API URL"), {
      target: { value: "https://api.changed.example/v1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(settingsState.updateAiProvider).toHaveBeenCalledWith("provider-1", {
      name: "Inline Provider",
      provider: "openai",
      apiProtocol: "openai",
      apiKey: "new-key",
      apiUrl: "https://api.changed.example/v1",
      lastVerifiedAt: undefined,
    });
    expect(settingsState.updateAiModel).toHaveBeenCalledWith("model-inline", {
      providerId: "provider-1",
      name: "Inline Provider",
      provider: "openai",
      apiProtocol: "openai",
      apiKey: "new-key",
      apiUrl: "https://api.changed.example/v1",
      lastVerifiedAt: undefined,
    });
    expect(screen.queryByRole("heading", { name: "Edit Endpoint" }))
      .not.toBeInTheDocument();
  });

  it("adds a provider endpoint without creating a model", async () => {
    const settingsState = createSettingsState();
    useSettingsStoreMock.mockReturnValue(settingsState);

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    fireEvent.click(screen.getByRole("button", { name: "Add Provider" }));
    expect(
      screen.getByRole("heading", { name: "Add Provider" }),
    ).toBeInTheDocument();
    const modal = withinModal("Add Provider");
    expect(modal.getByLabelText("Provider Name")).toHaveValue("OpenAI");
    expect(modal.getByText("Provider Type")).toBeInTheDocument();
    fireEvent.change(modal.getByPlaceholderText("Enter API Key"), {
      target: { value: "provider-key" },
    });
    fireEvent.change(modal.getByLabelText("API URL"), {
      target: { value: "https://api.provider.test/v1" },
    });
    fireEvent.click(modal.getByRole("button", { name: "Save Changes" }));

    expect(settingsState.addAiProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "OpenAI",
        provider: "openai",
        apiKey: "provider-key",
        apiUrl: "https://api.provider.test/v1",
      }),
    );
    expect(settingsState.addAiModel).not.toHaveBeenCalled();
  });

  it("uses the provider instance name in the provider list and detail panel", async () => {
    const settingsState = createSettingsState();
    settingsState.aiProviders[0].name = "Work OpenAI";
    useSettingsStoreMock.mockReturnValue(settingsState);

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    expect(screen.getAllByText("Work OpenAI").length).toBeGreaterThan(0);
    expect(screen.getAllByText("api.example.com").length).toBeGreaterThan(0);
  });

  it("persists chat parameters when adding a chat model", async () => {
    const settingsState = createSettingsState();
    useSettingsStoreMock.mockReturnValue(settingsState);

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    fireEvent.click(screen.getByRole("button", { name: "Model Routing" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Model" }));
    fireEvent.change(screen.getByLabelText("Model Name"), {
      target: { value: "gpt-4.1" },
    });
    fireEvent.click(
      screen.getAllByRole("button", { name: /Advanced Parameters/i }).at(-1)!,
    );
    fireEvent.change(screen.getByLabelText("Temperature"), {
      target: { value: "1.2" },
    });
    expect(screen.getByLabelText("Stream Output")).toHaveClass("sr-only");
    fireEvent.click(screen.getByLabelText("Stream Output"));
    fireEvent.change(screen.getByLabelText("Custom Parameters"), {
      target: { value: '{"max_completion_tokens":4096}' },
    });

    fireEvent.click(
      screen.getAllByRole("button", { name: "Add Model" }).at(-1)!,
    );

    expect(settingsState.addAiModel).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        apiKey: "test-key",
        model: "gpt-4.1",
        type: "chat",
        chatParams: expect.objectContaining({
          temperature: 1.2,
          stream: true,
          customParams: {
            max_completion_tokens: 4096,
          },
        }),
      }),
    );
  });

  it("persists the vision model capability flag", async () => {
    const settingsState = createSettingsState();
    useSettingsStoreMock.mockReturnValue(settingsState);

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    fireEvent.click(screen.getByRole("button", { name: "Model Routing" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Model" }));
    fireEvent.change(screen.getByLabelText("Model Name"), {
      target: { value: "gpt-4o" },
    });
    fireEvent.click(screen.getByLabelText("Vision input"));

    fireEvent.click(
      screen.getAllByRole("button", { name: "Add Model" }).at(-1)!,
    );

    expect(settingsState.addAiModel).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o",
        type: "chat",
        capabilities: expect.objectContaining({
          chat: true,
          vision: true,
          imageGeneration: false,
        }),
      }),
    );
  });

  it("persists image generation as a model capability from the capability section", async () => {
    const settingsState = createSettingsState();
    useSettingsStoreMock.mockReturnValue(settingsState);

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    fireEvent.click(screen.getByRole("button", { name: "Model Routing" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Model" }));
    fireEvent.change(screen.getByLabelText("Model Name"), {
      target: { value: "gpt-image-2" },
    });
    fireEvent.click(screen.getByLabelText("Image generation"));

    fireEvent.click(
      screen.getAllByRole("button", { name: "Add Model" }).at(-1)!,
    );

    expect(settingsState.addAiModel).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-image-2",
        type: "image",
        capabilities: expect.objectContaining({
          chat: true,
          vision: false,
          imageGeneration: true,
        }),
        imageParams: expect.any(Object),
      }),
    );
  });

  it("preserves both chat and image parameters for dual-capability models", async () => {
    const settingsState = createSettingsState();
    useSettingsStoreMock.mockReturnValue(settingsState);

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    fireEvent.click(screen.getByRole("button", { name: "Model Routing" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Model" }));
    fireEvent.change(screen.getByLabelText("Model Name"), {
      target: { value: "gpt-4o-image" },
    });
    fireEvent.click(screen.getByLabelText("Image generation"));

    fireEvent.click(
      screen.getAllByRole("button", { name: "Add Model" }).at(-1)!,
    );

    expect(settingsState.addAiModel).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-image",
        type: "image",
        capabilities: expect.objectContaining({
          chat: true,
          imageGeneration: true,
        }),
        chatParams: expect.any(Object),
        imageParams: expect.any(Object),
      }),
    );
  });

  it("keeps advanced parameters collapsed by default in the add model modal", async () => {
    useSettingsStoreMock.mockReturnValue(createSettingsState());

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    fireEvent.click(screen.getByRole("button", { name: "Model Routing" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Model" }));

    expect(screen.queryByLabelText("Temperature")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Advanced Parameters/i }).at(-1)!,
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("shows api url guidance and normalizes pasted full endpoints on blur", async () => {
    useSettingsStoreMock.mockReturnValue(createSettingsState());

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    fireEvent.click(screen.getByRole("button", { name: "Add Provider" }));

    const apiUrlInput = withinModal("Add Provider").getByLabelText("API URL");
    fireEvent.change(apiUrlInput, {
      target: { value: "https://api.example.com/v1/chat/completions" },
    });

    expect(screen.getByText("Stored Base URL:")).toBeInTheDocument();
    expect(screen.getByText("https://api.example.com/v1")).toBeInTheDocument();
    expect(
      screen.getByText("https://api.example.com/v1/chat/completions"),
    ).toBeInTheDocument();

    fireEvent.blur(apiUrlInput);

    expect(apiUrlInput).toHaveValue("https://api.example.com/v1");
  });

  it("persists image parameters when adding an image model", async () => {
    const settingsState = createSettingsState();
    useSettingsStoreMock.mockReturnValue(settingsState);

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    fireEvent.click(screen.getByRole("button", { name: "Model Routing" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Model" }));
    fireEvent.click(screen.getByLabelText("Image generation"));
    fireEvent.change(screen.getByLabelText("Model Name"), {
      target: { value: "gpt-image-1" },
    });
    fireEvent.click(
      screen.getAllByRole("button", { name: /Advanced Parameters/i }).at(-1)!,
    );
    fireEvent.change(screen.getByLabelText("Number of Images"), {
      target: { value: "3" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Standard" }));
    fireEvent.click(screen.getByRole("button", { name: "HD" }));

    fireEvent.click(
      screen.getAllByRole("button", { name: "Add Model" }).at(-1)!,
    );

    expect(settingsState.addAiModel).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        apiKey: "test-key",
        model: "gpt-image-1",
        type: "image",
        imageParams: expect.objectContaining({
          size: "1024x1024",
          quality: "hd",
          style: "vivid",
          n: 3,
        }),
      }),
    );
  });

  it("shows manual-entry guidance when provider does not expose a compatible model list", async () => {
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });
    useSettingsStoreMock.mockReturnValue(createSettingsState());
    vi.mocked(fetchAvailableModels).mockResolvedValue({
      success: false,
      models: [],
      reason: "unsupported",
      error: "Unsupported response shape",
    });

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    fireEvent.click(screen.getByRole("button", { name: "Fetch Models" }));

    await waitFor(() => {
      expect(fetchAvailableModels).toHaveBeenCalledWith(
        "https://api.example.com/v1",
        "test-key",
        "openai",
      );
      expect(showToast).toHaveBeenCalledWith(
        "This provider did not return a compatible model list endpoint. You can still enter the model ID manually.",
        "info",
      );
    });
  });

  it("surfaces a timeout error when model discovery hangs", async () => {
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });
    useSettingsStoreMock.mockReturnValue(createSettingsState());
    vi.mocked(fetchAvailableModels).mockResolvedValue({
      success: false,
      models: [],
      reason: "network",
      error: "Request timeout after 12000ms",
    });

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    fireEvent.click(screen.getByRole("button", { name: "Fetch Models" }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        "Request timeout after 12000ms",
        "warning",
      );
    });
  });

  it("maps raw network failures to a friendlier connection message", async () => {
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });
    useSettingsStoreMock.mockReturnValue(createSettingsState());
    vi.mocked(testAIConnection).mockResolvedValue({
      success: false,
      error: "Failed to fetch",
      provider: "openai",
      model: "gpt-4.1",
    });

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    fireEvent.click(screen.getByRole("button", { name: "Model Routing" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Model" }));
    fireEvent.change(screen.getByLabelText("Model Name"), {
      target: { value: "gpt-4.1" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Test Current Config" }),
    );

    await waitFor(() => {
      expect(testAIConnection).toHaveBeenCalledWith({
        provider: "openai",
        apiProtocol: "openai",
        apiKey: "test-key",
        apiUrl: "https://api.example.com/v1",
        model: "gpt-4.1",
      });
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining(
          "Browser blocked this cross-origin request (CORS).",
        ),
        "error",
      );
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining("https://api.example.com"),
        "error",
      );
    });
  }, 15000);

  it("includes the model name in success toasts when testing a draft chat model", async () => {
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });
    useSettingsStoreMock.mockReturnValue(createSettingsState());
    vi.mocked(testAIConnection).mockResolvedValue({
      success: true,
      response: "hello",
      latency: 321,
      provider: "openai",
      model: "gpt-4.1",
    });

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    fireEvent.click(screen.getByRole("button", { name: "Model Routing" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Model" }));
    fireEvent.change(screen.getByLabelText("Model Name"), {
      target: { value: "gpt-4.1" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Test Current Config" }),
    );

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        "gpt-4.1 test succeeded (321ms)",
        "success",
      );
    });
  });

  it("includes the model name in failure toasts when testing a draft chat model", async () => {
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });
    useSettingsStoreMock.mockReturnValue(createSettingsState());
    vi.mocked(testAIConnection).mockResolvedValue({
      success: false,
      error: "API request failed (504)",
      latency: 654,
      provider: "openai",
      model: "gpt-4.1",
    });

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    fireEvent.click(screen.getByRole("button", { name: "Model Routing" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Model" }));
    fireEvent.change(screen.getByLabelText("Model Name"), {
      target: { value: "gpt-4.1" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Test Current Config" }),
    );

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        "gpt-4.1 test failed: API request failed (504)",
        "error",
      );
    });
  });

  it("persists endpoint verification status across remounts", async () => {
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });
    const settingsState = createSettingsState();
    settingsState.aiModels = [createConfiguredModel()];
    settingsState.updateAiModel.mockImplementation((id, patch) => {
      settingsState.aiModels = settingsState.aiModels.map((model: any) =>
        model.id === id ? { ...model, ...patch } : model,
      );
    });
    useSettingsStoreMock.mockImplementation(() => settingsState);
    vi.mocked(testAIConnection).mockResolvedValue({
      success: true,
      response: "ok",
      latency: 123,
      provider: "custom",
      model: "gpt-4.1",
    });

    const firstRender = await renderWithI18n(<AISettingsPrototype />, {
      language: "en",
    });

    expect(screen.getByText("Unverified")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));

    await waitFor(() => {
      expect(settingsState.updateAiModel).toHaveBeenCalledWith(
        "model-1",
        expect.objectContaining({
          lastVerifiedAt: expect.any(String),
        }),
      );
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    firstRender.unmount();

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.queryByText("Unverified")).not.toBeInTheDocument();
  });

  it("shows providers as a side list and switches the model panel by provider", async () => {
    const settingsState = createSettingsState();
    settingsState.aiModels = [
      createConfiguredModel({
        id: "openai-model",
        provider: "openai",
        model: "gpt-5.4",
      }),
      createConfiguredModel({
        id: "anthropic-model",
        provider: "anthropic",
        apiProtocol: "anthropic",
        apiUrl: "https://api.anthropic.com",
        model: "claude-opus-4-6",
      }),
    ];
    useSettingsStoreMock.mockReturnValue(settingsState);

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    expect(screen.getByText("claude-opus-4-6")).toBeInTheDocument();
    expect(screen.getByText("API Key")).toBeInTheDocument();
    expect(screen.getByText("API URL")).toBeInTheDocument();
    expect(screen.queryByText("Protocol")).not.toBeInTheDocument();
    expect(screen.getAllByText("Anthropic-compatible").length).toBeGreaterThan(
      0,
    );

    fireEvent.click(screen.getByRole("button", { name: /OpenAI/i }));

    expect(screen.getAllByText("gpt-5.4").length).toBeGreaterThan(0);
    expect(screen.queryByText("claude-opus-4-6")).not.toBeInTheDocument();
  });

  it("renders model capabilities as icons and route badges as text", async () => {
    const settingsState = createSettingsState();
    settingsState.aiModels = [
      createConfiguredModel({
        id: "routed-vision-model",
        provider: "openai",
        model: "gpt-4o",
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
    ];
    settingsState.modelRouteDefaults = {
      mainText: "routed-vision-model",
      fastText: "routed-vision-model",
      visionText: "routed-vision-model",
    };
    useSettingsStoreMock.mockReturnValue(settingsState);

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    const modelRow = screen.getByText("gpt-4o").closest(".group");
    expect(modelRow).not.toBeNull();
    const row = within(modelRow!);

    expect(row.getByLabelText("Chat Model")).toBeInTheDocument();
    expect(row.getByLabelText("Vision input")).toBeInTheDocument();
    expect(row.queryByText("Chat Model")).not.toBeInTheDocument();
    expect(row.queryByText("Vision input")).not.toBeInTheDocument();
    expect(row.getByText("Main text route")).toBeInTheDocument();
    expect(row.getByText("Fast route")).toBeInTheDocument();
    expect(row.getByText("Vision route")).toBeInTheDocument();
  });

  it("uses test tube icons for model test actions", async () => {
    const settingsState = createSettingsState();
    settingsState.aiModels = [
      createConfiguredModel({
        id: "testable-model",
        provider: "openai",
        model: "gpt-4o",
      }),
    ];
    settingsState.modelRouteDefaults = {
      mainText: "testable-model",
    };
    useSettingsStoreMock.mockReturnValue(settingsState);

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    const modelRow = screen.getByText("gpt-4o").closest(".group");
    expect(modelRow).not.toBeNull();

    expect(
      screen
        .getByRole("button", { name: "Test Default Model" })
        .querySelector(".lucide-test-tube"),
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole("button", { name: "Test Connection" })
        .querySelector(".lucide-test-tube"),
    ).toBeInTheDocument();
    expect(
      within(modelRow!)
        .getByRole("button", { name: "Test" })
        .querySelector(".lucide-test-tube"),
    ).toBeInTheDocument();
  });

  it("locks provider fields without showing provider details when editing an existing model", async () => {
    const settingsState = createSettingsState();
    settingsState.aiModels = [
      createConfiguredModel({
        provider: "custom",
        model: "gpt-4.1",
      }),
    ];
    useSettingsStoreMock.mockReturnValue(settingsState);

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" }).at(-1)!);

    const modal = withinModal("Edit Model");
    expect(modal.queryByText("Provider Endpoint")).not.toBeInTheDocument();
    expect(
      modal.queryByLabelText("API URL"),
    ).not.toBeInTheDocument();
    expect(
      modal.queryByPlaceholderText("Enter API Key"),
    ).not.toBeInTheDocument();
  });

  it("defaults known image models to image type when selected from fetched models", async () => {
    const settingsState = createSettingsState();
    useSettingsStoreMock.mockReturnValue(settingsState);
    vi.mocked(fetchAvailableModels).mockResolvedValue({
      success: true,
      models: [{ id: "gpt-image-2", owned_by: "openai" }],
    });

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    fireEvent.click(screen.getByRole("button", { name: "Fetch Models" }));

    await waitFor(() => {
      expect(screen.getByText("gpt-image-2")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: /^gpt-image-2openai$/ }),
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add Model" }).at(-1)!,
    );

    expect(settingsState.addAiModel).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-image-2",
        type: "image",
        imageParams: expect.any(Object),
      }),
    );
  });

  it("keeps the provider when deleting the last model from a model-derived provider", async () => {
    const settingsState = createSettingsState();
    settingsState.aiProviders = [];
    settingsState.aiModels = [
      createConfiguredModel({
        id: "legacy-model",
        provider: "openai",
        apiUrl: "https://api.example.com/v1",
        model: "gpt-4.1",
      }),
    ];
    useSettingsStoreMock.mockReturnValue(settingsState);
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);

    try {
      await renderWithI18n(<AISettingsPrototype />, { language: "en" });

      fireEvent.click(screen.getByRole("button", { name: "Delete" }));

      expect(settingsState.addAiProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "test-key",
          apiUrl: "https://api.example.com/v1",
        }),
      );
      expect(settingsState.deleteAiModel).toHaveBeenCalledWith("legacy-model");
      expect(settingsState.deleteAiProvider).not.toHaveBeenCalled();
    } finally {
      window.confirm = originalConfirm;
    }
  });

  it("opens manual model add from the provider plus button without fetching models", async () => {
    const settingsState = createSettingsState();
    useSettingsStoreMock.mockReturnValue(settingsState);

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    fireEvent.click(screen.getByRole("button", { name: "Add Model" }));

    expect(fetchAvailableModels).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Add Model" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Provider Endpoint")).not.toBeInTheDocument();
    expect(screen.queryByText("Select Models")).not.toBeInTheDocument();
  });

  it("fetches models from the provider fetch button and batch-adds selected models", async () => {
    const settingsState = createSettingsState();
    useSettingsStoreMock.mockReturnValue(settingsState);
    vi.mocked(fetchAvailableModels).mockResolvedValue({
      success: true,
      models: [
        { id: "gpt-4.1", owned_by: "openai" },
        { id: "gpt-4o-mini", owned_by: "openai" },
      ],
    });

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    fireEvent.click(screen.getByRole("button", { name: "Fetch Models" }));

    await waitFor(() => {
      expect(fetchAvailableModels).toHaveBeenCalledWith(
        "https://api.example.com/v1",
        "test-key",
        "openai",
      );
      expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
      expect(screen.getByText("gpt-4o-mini")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^gpt-4\.1openai$/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /^gpt-4o-miniopenai$/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add 2 Models" }));

    expect(settingsState.addAiModel).toHaveBeenCalledTimes(2);
    expect(settingsState.addAiModel).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        apiKey: "test-key",
        apiUrl: "https://api.example.com/v1",
        model: "gpt-4.1",
      }),
    );
    expect(settingsState.addAiModel).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        apiKey: "test-key",
        apiUrl: "https://api.example.com/v1",
        model: "gpt-4o-mini",
      }),
    );
  });

  describe("batch model selection", () => {
    const mockModels = [
      { id: "gpt-4.1", owned_by: "openai" },
      { id: "gpt-4o", owned_by: "openai" },
      { id: "gpt-4o-mini", owned_by: "openai" },
    ];

    async function openModalWithFetchedModels(
      settingsState: ReturnType<typeof createSettingsState>,
    ) {
      useSettingsStoreMock.mockReturnValue(settingsState);
      vi.mocked(fetchAvailableModels).mockResolvedValue({
        success: true,
        models: mockModels,
      });

      await renderWithI18n(<AISettingsPrototype />, { language: "en" });

      fireEvent.click(screen.getByRole("button", { name: "Fetch Models" }));

      await waitFor(() => {
        expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
      });
    }

    it("batch-adds all selected models when multiple are chosen", async () => {
      const settingsState = createSettingsState();
      await openModalWithFetchedModels(settingsState);

      // Select two models from the list
      fireEvent.click(screen.getByRole("button", { name: /^gpt-4\.1openai$/ }));
      fireEvent.click(
        screen.getByRole("button", { name: /^gpt-4o-miniopenai$/ }),
      );

      // Button label should reflect multi-select count
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Add 2 Models" }),
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Add 2 Models" }));

      expect(settingsState.addAiModel).toHaveBeenCalledTimes(2);
      expect(settingsState.addAiModel).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-4.1",
          apiKey: "test-key",
          apiUrl: "https://api.example.com/v1",
        }),
      );
      expect(settingsState.addAiModel).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-4o-mini",
          apiKey: "test-key",
          apiUrl: "https://api.example.com/v1",
        }),
      );
    }, 15000);

    it("infers each selected model independently when batch-adding mixed model types", async () => {
      const settingsState = createSettingsState();
      useSettingsStoreMock.mockReturnValue(settingsState);
      vi.mocked(fetchAvailableModels).mockResolvedValue({
        success: true,
        models: [
          { id: "gpt-4o", owned_by: "openai" },
          { id: "gpt-image-2", owned_by: "openai" },
        ],
      });

      await renderWithI18n(<AISettingsPrototype />, { language: "en" });

      fireEvent.click(screen.getByRole("button", { name: "Fetch Models" }));

      await waitFor(() => {
        expect(screen.getByText("gpt-image-2")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /^gpt-4oopenai$/ }));
      fireEvent.click(
        screen.getByRole("button", { name: /^gpt-image-2openai$/ }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Add 2 Models" }));

      expect(settingsState.addAiModel).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-4o",
          type: "chat",
          capabilities: expect.objectContaining({
            chat: true,
            vision: true,
            imageGeneration: false,
          }),
          chatParams: expect.any(Object),
          imageParams: undefined,
        }),
      );
      expect(settingsState.addAiModel).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-image-2",
          type: "image",
          capabilities: expect.objectContaining({
            chat: false,
            vision: false,
            imageGeneration: true,
          }),
          chatParams: undefined,
          imageParams: expect.any(Object),
        }),
      );
    }, 15000);

    it("uses the single-add path when only one model is selected", async () => {
      const settingsState = createSettingsState();
      await openModalWithFetchedModels(settingsState);

      // Select only one model
      fireEvent.click(
        screen.getByRole("button", { name: /^gpt-4o-miniopenai$/ }),
      );

      // Button should still say "Add Model" (not batch label)
      expect(
        screen.getAllByRole("button", { name: "Add Model" }).length,
      ).toBeGreaterThanOrEqual(1);

      fireEvent.click(
        screen.getAllByRole("button", { name: "Add Model" }).at(-1)!,
      );

      expect(settingsState.addAiModel).toHaveBeenCalledTimes(1);
      expect(settingsState.addAiModel).toHaveBeenCalledWith(
        expect.objectContaining({ model: "gpt-4o-mini" }),
      );
    });

    it("blocks model discovery when the selected provider endpoint has no API key", async () => {
      const showToast = vi.fn();
      useToastMock.mockReturnValue({ showToast });
      const settingsState = createSettingsState();
      settingsState.aiProviders[0].apiKey = "";
      useSettingsStoreMock.mockReturnValue(settingsState);
      vi.mocked(fetchAvailableModels).mockResolvedValue({
        success: true,
        models: mockModels,
      });

      await renderWithI18n(<AISettingsPrototype />, { language: "en" });

      fireEvent.click(screen.getByRole("button", { name: "Fetch Models" }));

      await waitFor(() => {
        expect(showToast).toHaveBeenCalledWith(
          "Please fill in API Key and URL first",
          "error",
        );
      });
      expect(fetchAvailableModels).not.toHaveBeenCalled();
      expect(settingsState.addAiModel).not.toHaveBeenCalled();
    }, 15000);

    it("batch-adds share the same provider, apiKey, and apiUrl from the form", async () => {
      const settingsState = createSettingsState();
      settingsState.aiProviders[0].apiKey = "shared-key-123";
      settingsState.aiProviders[0].apiUrl = "https://custom.api.com/v1";
      useSettingsStoreMock.mockReturnValue(settingsState);
      vi.mocked(fetchAvailableModels).mockResolvedValue({
        success: true,
        models: mockModels,
      });

      await renderWithI18n(<AISettingsPrototype />, { language: "en" });

      fireEvent.click(screen.getByRole("button", { name: "Fetch Models" }));

      await waitFor(() => {
        expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /^gpt-4\.1openai$/ }));
      fireEvent.click(
        screen.getByRole("button", { name: /^gpt-4o-miniopenai$/ }),
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Add 2 Models" }),
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Add 2 Models" }));

      // Both models must carry the same shared credentials
      for (const call of settingsState.addAiModel.mock.calls) {
        expect(call[0]).toMatchObject({
          apiKey: "shared-key-123",
          apiUrl: "https://custom.api.com/v1",
          provider: "openai",
        });
      }
      expect(settingsState.addAiModel).toHaveBeenCalledTimes(2);
    }, 15000);
  });
});
