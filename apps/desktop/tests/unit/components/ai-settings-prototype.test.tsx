import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AISettingsPrototype } from "../../../src/renderer/components/settings/AISettingsPrototype";
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
    scenarioModelDefaults: {},
    aiProvider: "openai",
    aiApiKey: "",
    aiApiUrl: "",
    aiModel: "",
    translationMode: "immersive" as const,
    setScenarioModelDefault: vi.fn(),
    setTranslationMode: vi.fn(),
    addAiModel: vi.fn(),
    updateAiModel: vi.fn(),
    deleteAiModel: vi.fn(),
    setDefaultAiModel: vi.fn(),
  };
}

describe("AISettingsPrototype", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useToastMock.mockReturnValue({ showToast: vi.fn() });
  });

  it("renders translated English copy instead of hard-coded Chinese", async () => {
    useSettingsStoreMock.mockReturnValue(createSettingsState());

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    expect(screen.getByText("AI Model Workbench")).toBeInTheDocument();
    expect(screen.getByText("Status Overview")).toBeInTheDocument();
    expect(screen.queryByText("AI 模型工作台")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Test Default Model" }),
    ).toHaveClass("whitespace-nowrap", "shrink-0");
    expect(screen.getByRole("button", { name: "Add Model" })).toHaveClass(
      "whitespace-nowrap",
      "shrink-0",
    );
  });

  it("persists chat parameters when adding a chat model", async () => {
    const settingsState = createSettingsState();
    useSettingsStoreMock.mockReturnValue(settingsState);

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    fireEvent.click(screen.getByRole("button", { name: "Add Model" }));

    fireEvent.change(screen.getByPlaceholderText("Enter API Key"), {
      target: { value: "test-key" },
    });
    fireEvent.change(screen.getByLabelText("Model Name"), {
      target: { value: "gpt-4.1" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Advanced Parameters/i }),
    );
    fireEvent.change(screen.getByLabelText("Temperature"), {
      target: { value: "1.2" },
    });
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

  it("keeps advanced parameters collapsed by default in the add model modal", async () => {
    useSettingsStoreMock.mockReturnValue(createSettingsState());

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    fireEvent.click(screen.getByRole("button", { name: "Add Model" }));

    expect(screen.queryByLabelText("Temperature")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Advanced Parameters/i }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("shows api url guidance and normalizes pasted full endpoints on blur", async () => {
    useSettingsStoreMock.mockReturnValue(createSettingsState());

    await renderWithI18n(<AISettingsPrototype />, { language: "en" });

    fireEvent.click(screen.getByRole("button", { name: "Add Model" }));

    const apiUrlInput = screen.getByLabelText("API URL");
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

    fireEvent.click(screen.getByRole("button", { name: "Add Model" }));
    fireEvent.click(screen.getByRole("button", { name: "Chat Model" }));
    fireEvent.click(screen.getByRole("button", { name: "Image Model" }));

    fireEvent.change(screen.getByPlaceholderText("Enter API Key"), {
      target: { value: "image-key" },
    });
    fireEvent.change(screen.getByLabelText("Model Name"), {
      target: { value: "gpt-image-1" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Advanced Parameters/i }),
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
        apiKey: "image-key",
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

    fireEvent.click(screen.getByRole("button", { name: "Add Model" }));
    fireEvent.change(screen.getByLabelText("API URL"), {
      target: { value: "https://api.example.com/v1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter API Key"), {
      target: { value: "test-key" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Fetch Models" }));

    await waitFor(() => {
      expect(fetchAvailableModels).toHaveBeenCalledWith(
        "https://api.example.com/v1",
        "test-key",
      );
      expect(showToast).toHaveBeenCalledWith(
        "This provider did not return a compatible model list endpoint. You can still enter the model ID manually.",
        "info",
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

    fireEvent.click(screen.getByRole("button", { name: "Add Model" }));
    fireEvent.change(screen.getByPlaceholderText("Enter API Key"), {
      target: { value: "test-key" },
    });
    fireEvent.change(screen.getByLabelText("API URL"), {
      target: { value: "https://api.example.com/v1" },
    });
    fireEvent.change(screen.getByLabelText("Model Name"), {
      target: { value: "gpt-4.1" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Test Current Config" }),
    );

    await waitFor(() => {
      expect(testAIConnection).toHaveBeenCalledWith({
        provider: "openai",
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

      fireEvent.click(screen.getByRole("button", { name: "Add Model" }));
      fireEvent.change(screen.getByPlaceholderText("Enter API Key"), {
        target: { value: "test-key" },
      });
      fireEvent.change(screen.getByLabelText("API URL"), {
        target: { value: "https://api.openai.com/v1" },
      });
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
      fireEvent.click(screen.getByRole("button", { name: /^gpt-4o-miniopenai$/ }));

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
          apiUrl: "https://api.openai.com/v1",
        }),
      );
      expect(settingsState.addAiModel).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-4o-mini",
          apiKey: "test-key",
          apiUrl: "https://api.openai.com/v1",
        }),
      );
    });

    it("uses the single-add path when only one model is selected", async () => {
      const settingsState = createSettingsState();
      await openModalWithFetchedModels(settingsState);

      // Select only one model
      fireEvent.click(screen.getByRole("button", { name: /^gpt-4o-miniopenai$/ }));

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

    it(
      "blocks batch-add and shows error when API key is cleared after fetching",
      async () => {
      const showToast = vi.fn();
      useToastMock.mockReturnValue({ showToast });
      const settingsState = createSettingsState();
      useSettingsStoreMock.mockReturnValue(settingsState);
      vi.mocked(fetchAvailableModels).mockResolvedValue({
        success: true,
        models: mockModels,
      });

      await renderWithI18n(<AISettingsPrototype />, { language: "en" });

      // Open modal and fill credentials to enable model fetching
      fireEvent.click(screen.getByRole("button", { name: "Add Model" }));
      fireEvent.change(screen.getByPlaceholderText("Enter API Key"), {
        target: { value: "temp-key" },
      });
      fireEvent.change(screen.getByLabelText("API URL"), {
        target: { value: "https://api.openai.com/v1" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Fetch Models" }));

      await waitFor(() => {
        expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
      });

      // Clear the API key after fetching — simulates key being removed
      fireEvent.change(screen.getByPlaceholderText("Enter API Key"), {
        target: { value: "" },
      });

      // Select two models
      fireEvent.click(screen.getByRole("button", { name: /^gpt-4\.1openai$/ }));
      fireEvent.click(screen.getByRole("button", { name: /^gpt-4o-miniopenai$/ }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Add 2 Models" }),
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Add 2 Models" }));

      // addAiModel must NOT be called; toast with error must fire
      expect(settingsState.addAiModel).not.toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith(expect.any(String), "error");
      },
      15000,
    );

    it(
      "batch-adds share the same provider, apiKey, and apiUrl from the form",
      async () => {
      const settingsState = createSettingsState();
      useSettingsStoreMock.mockReturnValue(settingsState);
      vi.mocked(fetchAvailableModels).mockResolvedValue({
        success: true,
        models: mockModels,
      });

      await renderWithI18n(<AISettingsPrototype />, { language: "en" });

      fireEvent.click(screen.getByRole("button", { name: "Add Model" }));
      fireEvent.change(screen.getByPlaceholderText("Enter API Key"), {
        target: { value: "shared-key-123" },
      });
      fireEvent.change(screen.getByLabelText("API URL"), {
        target: { value: "https://custom.api.com/v1" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Fetch Models" }));

      await waitFor(() => {
        expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /^gpt-4\.1openai$/ }));
      fireEvent.click(screen.getByRole("button", { name: /^gpt-4o-miniopenai$/ }));

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
      },
      15000,
    );
  });
});
