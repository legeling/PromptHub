import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { FormEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AISettings } from "../../../src/renderer/components/settings/AISettings";
import type { AIModelConfig } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";

const useSettingsStoreMock = vi.fn();
const useToastMock = vi.fn();
const { testImageGenerationMock } = vi.hoisted(() => ({
  testImageGenerationMock: vi.fn(),
}));

function hasHiddenSvgAncestor(element: Element): boolean {
  let current: Element | null = element;

  while (current) {
    if (current.getAttribute("aria-hidden") === "true") {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

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
    fetchAvailableModels: vi.fn().mockResolvedValue({ success: true, models: [] }),
    testAIConnection: vi.fn().mockResolvedValue({ success: true, latency: 10 }),
    testImageGeneration: testImageGenerationMock,
  };
});

function createSettingsState() {
  return {
    aiModels: [] as AIModelConfig[],
    aiProvider: "openai",
    aiApiProtocol: "openai",
    aiApiKey: "",
    aiApiUrl: "",
    aiModel: "",
    addAiModel: vi.fn(),
    updateAiModel: vi.fn(),
    deleteAiModel: vi.fn(),
    setDefaultAiModel: vi.fn(),
    setScenarioModelDefault: vi.fn(),
    scenarioModelDefaults: {},
    setAiProvider: vi.fn(),
    setAiApiProtocol: vi.fn(),
    setAiApiKey: vi.fn(),
    setAiApiUrl: vi.fn(),
    setAiModel: vi.fn(),
    translationMode: "immersive",
    setTranslationMode: vi.fn(),
  };
}

describe("AISettings legacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testImageGenerationMock.mockResolvedValue({
      success: true,
      latency: 10,
      model: "dall-e-3",
      provider: "openai",
    });
    useToastMock.mockReturnValue({ showToast: vi.fn() });
  });

  it("preserves apiProtocol when adding a Google chat model", async () => {
    const settingsState = createSettingsState();
    useSettingsStoreMock.mockReturnValue(settingsState);

    await renderWithI18n(<AISettings />, { language: "en" });

    fireEvent.click(screen.getByRole("button", { name: "Add Chat Model" }));
    expect(
      screen.getByRole("textbox", { name: "Custom Name (Optional)" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Provider" }));
    fireEvent.click(await screen.findByText("Google"));
    fireEvent.change(screen.getByPlaceholderText("Enter API Key"), {
      target: { value: "test-key" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "API URL" }), {
      target: { value: "https://generativelanguage.googleapis.com" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Model Name" }), {
      target: { value: "gemini-2.5-pro" },
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Add Model" }).at(-1)!);

    expect(settingsState.addAiModel).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        apiProtocol: "gemini",
        model: "gemini-2.5-pro",
      }),
    );
  });

  it("keeps configured model and translation actions non-submit with decorative icons hidden", async () => {
    const settingsState = createSettingsState();
    settingsState.aiModels = [
      {
        id: "chat-1",
        type: "chat",
        name: "GPT Workhorse",
        provider: "openai",
        apiProtocol: "openai",
        apiKey: "test-key",
        apiUrl: "https://api.openai.com/v1",
        model: "gpt-4o",
        isDefault: false,
      },
      {
        id: "image-1",
        type: "image",
        name: "Image Workhorse",
        provider: "openai",
        apiProtocol: "openai",
        apiKey: "test-key",
        apiUrl: "https://api.openai.com/v1",
        model: "dall-e-3",
        isDefault: false,
      },
    ];
    useSettingsStoreMock.mockReturnValue(settingsState);
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    await renderWithI18n(
      <form onSubmit={onSubmit}>
        <AISettings />
      </form>,
      { language: "en" },
    );

    const buttons = [
      screen.getAllByRole("button", { name: /OpenAI/ })[0],
      screen.getByRole("button", { name: "Test Connection" }),
      screen.getAllByRole("button", { name: "Set as Default" })[0],
      screen.getAllByRole("button", { name: "Edit" })[0],
      screen.getAllByRole("button", { name: "Delete" })[0],
      screen.getByRole("button", { name: "Add Chat Model" }),
      screen.getByRole("button", { name: /^Immersive/ }),
      screen.getByRole("button", { name: /^Full Translation/ }),
    ];

    for (const button of buttons) {
      expect(button).toHaveAttribute("type", "button");
      for (const icon of button.querySelectorAll("svg")) {
        expect(
          icon.getAttribute("aria-hidden") === "true" ||
            Boolean(icon.closest("[aria-hidden='true']")),
        ).toBe(true);
      }
    }

    fireEvent.click(screen.getByRole("button", { name: /^Full Translation/ }));
    expect(settingsState.setTranslationMode).toHaveBeenCalledWith("full");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not crash when a configured chat model has an invalid API URL", async () => {
    const settingsState = createSettingsState();
    settingsState.aiModels = [
      {
        id: "chat-invalid-url",
        type: "chat",
        name: "Invalid Endpoint",
        provider: "openai",
        apiProtocol: "openai",
        apiKey: "test-key",
        apiUrl: "not a url",
        model: "gpt-4o",
        isDefault: false,
      },
    ];
    useSettingsStoreMock.mockReturnValue(settingsState);

    await renderWithI18n(<AISettings />, { language: "en" });

    expect(screen.getByText("not a url")).toBeInTheDocument();
  });

  it("exposes the image model provider select by its field label", async () => {
    useSettingsStoreMock.mockReturnValue(createSettingsState());

    await renderWithI18n(<AISettings />, { language: "en" });

    fireEvent.click(screen.getByRole("button", { name: "Add Image Model" }));
    expect(
      screen.getByRole("textbox", { name: "Custom Name (Optional)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "API URL" }))
      .toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Model Name" }))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Provider" }));

    expect(await screen.findByRole("option", { name: "Google" }))
      .toBeInTheDocument();

    const exposedIconMarkup = Array.from(
      document.body.querySelectorAll("button svg"),
    )
      .filter((icon) => !hasHiddenSvgAncestor(icon))
      .map((icon) => icon.outerHTML);

    expect(exposedIconMarkup, exposedIconMarkup.join("\n")).toHaveLength(0);
  });

  it("exposes chat advanced parameter sliders by their field labels", async () => {
    useSettingsStoreMock.mockReturnValue(createSettingsState());

    await renderWithI18n(<AISettings />, { language: "en" });

    fireEvent.click(screen.getByRole("button", { name: "Add Chat Model" }));
    const advancedParameters = screen.getByRole("button", {
      name: "Advanced Parameters",
    });
    expect(advancedParameters).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(advancedParameters);

    expect(advancedParameters).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: /\+ Add Parameter/ }));

    expect(screen.getByRole("slider", { name: "Temperature" }))
      .toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Max Tokens" }))
      .toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Top P" }))
      .toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Frequency Penalty" }))
      .toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Presence Penalty" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" }))
      .toBeInTheDocument();

    const exposedIconMarkup = Array.from(
      document.body.querySelectorAll("button svg"),
    )
      .filter((icon) => !hasHiddenSvgAncestor(icon))
      .map((icon) => icon.outerHTML);

    expect(exposedIconMarkup, exposedIconMarkup.join("\n")).toHaveLength(0);
  });

  it("does not render unsafe image test result URLs", async () => {
    const settingsState = createSettingsState();
    settingsState.aiModels = [
      {
        id: "image-unsafe",
        type: "image",
        name: "Unsafe Image Model",
        provider: "openai",
        apiProtocol: "openai",
        apiKey: "test-key",
        apiUrl: "https://api.openai.com/v1",
        model: "dall-e-3",
        isDefault: false,
      },
    ];
    testImageGenerationMock.mockResolvedValue({
      success: true,
      imageUrl: "javascript:alert(1)",
      latency: 10,
      model: "dall-e-3",
      provider: "openai",
    });
    useSettingsStoreMock.mockReturnValue(settingsState);

    await renderWithI18n(<AISettings />, { language: "en" });
    fireEvent.click(screen.getByRole("button", { name: "Test Image" }));

    await waitFor(() => {
      expect(testImageGenerationMock).toHaveBeenCalledTimes(1);
    });

    expect(document.querySelector('img[src="javascript:alert(1)"]')).toBeNull();
    expect(screen.queryByAltText("Generated")).not.toBeInTheDocument();
  });
});
