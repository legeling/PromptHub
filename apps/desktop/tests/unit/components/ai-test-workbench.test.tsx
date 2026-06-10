import type { FormEvent } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiTestModal } from "../../../src/renderer/components/prompt/AiTestModal";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import type { Prompt } from "@prompthub/shared/types";

const chatCompletionMock = vi.fn();
const multiModelCompareMock = vi.fn();
const generateImageMock = vi.fn();

vi.mock("../../../src/renderer/services/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/renderer/services/ai")>();
  return {
    ...actual,
    chatCompletion: (...args: unknown[]) => chatCompletionMock(...args),
    multiModelCompare: (...args: unknown[]) => multiModelCompareMock(...args),
    generateImage: (...args: unknown[]) => generateImageMock(...args),
  };
});

const prompt: Prompt = {
  id: "prompt-1",
  title: "Screenshot Analyzer",
  systemPrompt: "You inspect product screenshots.",
  userPrompt: "Describe {{feature}} in the attached image.",
  variables: [],
  tags: [],
  isFavorite: false,
  isPinned: false,
  version: 1,
  currentVersion: 1,
  usageCount: 0,
  createdAt: new Date("2026-05-01T00:00:00.000Z").toISOString(),
  updatedAt: new Date("2026-05-01T00:00:00.000Z").toISOString(),
};

class MockFileReader {
  result: string | null = null;
  onload: null | (() => void) = null;
  onerror: null | (() => void) = null;

  readAsDataURL(file: File) {
    this.result = `data:${file.type};base64,ZmFrZS1pbWFnZQ==`;
    this.onload?.();
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function expectButtonIconsHidden(button: HTMLElement) {
  for (const icon of button.querySelectorAll("svg")) {
    expect(
      icon.getAttribute("aria-hidden") === "true" ||
        Boolean(icon.closest("[aria-hidden='true']")),
    ).toBe(true);
  }
}

function expectRenderedButtonsNonSubmit() {
  for (const button of screen.getAllByRole("button")) {
    expect(button).toHaveAttribute("type", "button");
    expectButtonIconsHidden(button);
  }
}

describe("AiTestModal workbench", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installWindowMocks({
      electron: {
        readImageBase64: vi.fn().mockResolvedValue("c2F2ZWQtcmVmZXJlbmNl"),
      },
    });

    vi.stubGlobal("FileReader", MockFileReader as unknown as typeof FileReader);

    useSettingsStore.setState({
      aiProvider: "openai",
      aiApiProtocol: "openai",
      aiApiKey: "legacy-key",
      aiApiUrl: "https://example.com/v1",
      aiModel: "legacy-chat",
      aiProviders: [
        {
          id: "provider-image",
          name: "我的生图供应商",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "image-key",
          apiUrl: "https://example.com/v1",
        },
      ],
      aiModels: [
        {
          id: "chat-default",
          type: "chat",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "chat-key",
          apiUrl: "https://example.com/v1",
          model: "gpt-4o-mini",
          isDefault: true,
        },
        {
          id: "chat-compare",
          type: "chat",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "chat-key-2",
          apiUrl: "https://example.com/v1",
          model: "claude-sonnet",
        },
        {
          id: "image-default",
          type: "image",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "image-key",
          apiUrl: "https://example.com/v1",
          model: "gpt-image-1",
          isDefault: true,
        },
      ],
      scenarioModelDefaults: {
        promptTest: "chat-default",
        imageTest: "image-default",
      },
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);

    chatCompletionMock.mockResolvedValue({
      content: "analysis done",
      thinkingContent: "",
    });
    multiModelCompareMock.mockResolvedValue({
      messages: [],
      results: [
        {
          id: "chat-default",
          success: true,
          response: "result-a",
          thinkingContent: "",
          latency: 10,
          model: "gpt-4o-mini",
          provider: "openai",
        },
        {
          id: "chat-compare",
          success: true,
          response: "result-b",
          thinkingContent: "",
          latency: 12,
          model: "claude-sonnet",
          provider: "openai",
        },
      ],
      totalTime: 22,
    });
    generateImageMock.mockResolvedValue({
      data: [{ url: "https://example.com/generated.png" }],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("renders compare mode and attachment entry for text prompts", async () => {
    await renderWithI18n(
      <ToastProvider>
        <AiTestModal
          isOpen
          onClose={vi.fn()}
          prompt={prompt}
          initialMode="compare"
        />
      </ToastProvider>,
      { language: "en" },
    );

    expect(screen.getByText("Screenshot Analyzer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Multi-Model Compare" })).toHaveClass("bg-primary");
    expect(screen.getByText("Test Attachments")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Images" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Test Image" })).not.toBeInTheDocument();
    expect(screen.getByText("{{feature}}")) .toBeInTheDocument();
    expect(document.querySelector("aside")).toHaveClass("animate-in");
    expect(document.querySelector("aside")).toHaveClass("slide-in-from-right-8");
  });

  it("keeps AI test actions non-submit with decorative icons hidden", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    const { unmount } = await renderWithI18n(
      <ToastProvider>
        <form onSubmit={onSubmit}>
          <AiTestModal
            isOpen
            onClose={vi.fn()}
            prompt={prompt}
            initialMode="single"
          />
        </form>
      </ToastProvider>,
      { language: "en" },
    );

    expectRenderedButtonsNonSubmit();

    await user.click(screen.getByRole("button", { name: "Multi-Model Compare" }));
    expect(screen.getByRole("button", { name: "Multi-Model Compare" }))
      .toHaveAttribute("aria-pressed", "true");
    expectRenderedButtonsNonSubmit();

    unmount();

    await renderWithI18n(
      <ToastProvider>
        <form onSubmit={onSubmit}>
          <AiTestModal
            isOpen
            onClose={vi.fn()}
            onAddImage={vi.fn()}
            prompt={{
              ...prompt,
              id: "image-prompt-actions",
              promptType: "image",
              images: ["reference.png"],
            }}
          />
        </form>
      </ToastProvider>,
      { language: "en" },
    );

    expectRenderedButtonsNonSubmit();
    const selectedReferenceButton = screen.getByRole("button", {
      name: "Deselect reference image reference.png",
    });
    expect(selectedReferenceButton).toHaveAttribute("aria-pressed", "true");

    await user.click(selectedReferenceButton);

    expect(
      screen.getByRole("button", {
        name: "Select reference image reference.png",
      }),
    ).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getAllByRole("button", { name: "Test Image" }).at(-1)!);
    expect(await screen.findByRole("img", { name: "Generated 1" }))
      .toBeInTheDocument();
    expectRenderedButtonsNonSubmit();

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders unsafe AI response markdown links as text", async () => {
    const user = userEvent.setup();
    chatCompletionMock.mockResolvedValueOnce({
      content:
        "[bad](javascript:alert(1)) [file](file:///etc/passwd) [ok](https://example.com/docs)",
      thinkingContent: "",
    });

    await renderWithI18n(
      <ToastProvider>
        <AiTestModal
          isOpen
          onClose={vi.fn()}
          prompt={prompt}
          initialMode="single"
        />
      </ToastProvider>,
      { language: "en" },
    );

    await user.click(screen.getAllByRole("button", { name: "AI Test" })[1]);

    await waitFor(() => {
      expect(screen.getByText("bad")).toBeInTheDocument();
    });

    expect(screen.getByText("bad").closest("a")).toBeNull();
    expect(screen.getByText("file").closest("a")).toBeNull();
    expect(screen.getByRole("link", { name: "ok" })).toHaveAttribute(
      "href",
      "https://example.com/docs",
    );
  });

  it("shows image-only workbench controls for image prompts", async () => {
    await renderWithI18n(
      <ToastProvider>
        <AiTestModal
          isOpen
          onClose={vi.fn()}
          prompt={{
            ...prompt,
            id: "image-prompt-1",
            promptType: "image",
            images: ["reference.png"],
          }}
        />
      </ToastProvider>,
      { language: "en" },
    );

    expect(screen.getAllByRole("button", { name: "Test Image" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Multi-Model Compare" })).not.toBeInTheDocument();
    expect(screen.getByText("Reference Images")).toBeInTheDocument();
    expect(screen.getByText("Select existing reference images")).toBeInTheDocument();
    expect(screen.getByText("Selected")).toBeInTheDocument();
  });

  it("uses localized prompt labels in zh interface", async () => {
    await renderWithI18n(
      <ToastProvider>
        <AiTestModal
          isOpen
          onClose={vi.fn()}
          prompt={{
            ...prompt,
            id: "image-prompt-zh",
            promptType: "image",
            images: ["reference.png"],
          }}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    expect(screen.getByText("用户提示词")).toBeInTheDocument();
    expect(screen.getByText("参考图片")).toBeInTheDocument();
    expect(screen.getByText("已选择")).toBeInTheDocument();
    expect(screen.getByText("模型: gpt-image-1")).toBeInTheDocument();
    expect(screen.getByText("服务提供商: 我的生图供应商")).toBeInTheDocument();
  });

  it("renders generated images in the image test panel", async () => {
    const user = userEvent.setup();

    await renderWithI18n(
      <ToastProvider>
        <AiTestModal
          isOpen
          onClose={vi.fn()}
          prompt={{
            ...prompt,
            id: "image-prompt-success",
            promptType: "image",
          }}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    await user.click(screen.getAllByRole("button", { name: "测试生图" }).at(-1)!);

    const generatedImage = await screen.findByRole("img", { name: "Generated 1" });
    expect(generatedImage).toHaveAttribute("src", "https://example.com/generated.png");
  });

  it("filters unsafe generated image URLs before rendering", async () => {
    const user = userEvent.setup();
    generateImageMock.mockResolvedValue({
      data: [{ url: "javascript:alert(1)" }, { url: "file:///tmp/image.png" }],
    });

    await renderWithI18n(
      <ToastProvider>
        <AiTestModal
          isOpen
          onClose={vi.fn()}
          prompt={{
            ...prompt,
            id: "image-prompt-unsafe-url",
            promptType: "image",
          }}
        />
      </ToastProvider>,
      { language: "en" },
    );

    await user.click(screen.getAllByRole("button", { name: "Test Image" }).at(-1)!);

    expect(await screen.findByText("The image generation endpoint returned no image"))
      .toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Generated 1" })).not.toBeInTheDocument();
  });

  it("downloads safe generated image URLs before adding them to the prompt", async () => {
    const user = userEvent.setup();
    const onAddImage = vi.fn();
    const downloadImage = vi.fn().mockResolvedValue("generated-local.png");
    window.electron.downloadImage = downloadImage;

    await renderWithI18n(
      <ToastProvider>
        <AiTestModal
          isOpen
          onClose={vi.fn()}
          onAddImage={onAddImage}
          prompt={{
            ...prompt,
            id: "image-prompt-add-safe-url",
            promptType: "image",
          }}
        />
      </ToastProvider>,
      { language: "en" },
    );

    await user.click(screen.getAllByRole("button", { name: "Test Image" }).at(-1)!);
    expect(await screen.findByRole("img", { name: "Generated 1" }))
      .toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add to Prompt" }));

    expect(downloadImage).toHaveBeenCalledWith("https://example.com/generated.png");
    expect(onAddImage).toHaveBeenCalledWith("generated-local.png");
  });

  it("cleans up generated image download links when the browser click fails", async () => {
    const user = userEvent.setup();
    const blob = new Blob(["image"], { type: "image/png" });
    const fetchMock = vi.fn().mockResolvedValue({
      blob: vi.fn().mockResolvedValue(blob),
    });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn().mockReturnValue("blob:ai-generated-image"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("blocked download click");
    });

    await renderWithI18n(
      <ToastProvider>
        <AiTestModal
          isOpen
          onClose={vi.fn()}
          prompt={{
            ...prompt,
            id: "image-prompt-download-cleanup",
            promptType: "image",
          }}
        />
      </ToastProvider>,
      { language: "en" },
    );

    await user.click(screen.getAllByRole("button", { name: "Test Image" }).at(-1)!);
    expect(await screen.findByRole("img", { name: "Generated 1" }))
      .toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => {
      expect(screen.getByText("Download failed")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/generated.png");
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:ai-generated-image");
    expect(document.querySelectorAll("a[download='generated-image-1.png']")).toHaveLength(0);
  });

  it("keeps image generation failure details visible in the image test panel", async () => {
    const user = userEvent.setup();
    generateImageMock.mockRejectedValue(new Error("Failed to fetch"));

    await renderWithI18n(
      <ToastProvider>
        <AiTestModal
          isOpen
          onClose={vi.fn()}
          prompt={{
            ...prompt,
            id: "image-prompt-error",
            promptType: "image",
          }}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    await user.click(screen.getAllByRole("button", { name: "测试生图" }).at(-1)!);

    expect(await screen.findByText("生图失败")).toBeInTheDocument();
    expect(screen.getByText("Failed to fetch")).toBeInTheDocument();
  });

  it("passes uploaded chat attachments to single-model tests for text prompts", async () => {
    const user = userEvent.setup();

    await renderWithI18n(
      <ToastProvider>
        <AiTestModal isOpen onClose={vi.fn()} prompt={prompt} />
      </ToastProvider>,
      { language: "en" },
    );

    const input = screen.getByLabelText("Add Images") as HTMLInputElement;
    const file = new File(["fake-image"], "diagram.png", { type: "image/png" });
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText("diagram.png")).toBeInTheDocument();
    });

    await user.click(screen.getAllByRole("button", { name: "AI Test" })[1]);

    await waitFor(() => {
      expect(chatCompletionMock).toHaveBeenCalledTimes(1);
    });

    const messages = chatCompletionMock.mock.calls[0][1] as Array<{ role: string; content: unknown }>;
    const userMessage = messages.find((message) => message.role === "user");

    expect(Array.isArray(userMessage?.content)).toBe(true);
    expect(userMessage?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text" }),
        expect.objectContaining({
          type: "image_url",
          image_url: expect.objectContaining({
            url: expect.stringContaining("data:image/png;base64,ZmFrZS1pbWFnZQ=="),
          }),
        }),
      ]),
    );
  });

  it("normalizes default-value variables before running a single-model test", async () => {
    const user = userEvent.setup();

    await renderWithI18n(
      <ToastProvider>
        <AiTestModal
          isOpen
          onClose={vi.fn()}
          prompt={{
            ...prompt,
            id: "prompt-default-variable",
            userPrompt: "Describe {{feature:checkout flow}} in detail.",
          }}
        />
      </ToastProvider>,
      { language: "en" },
    );

    expect(screen.getByText("{{feature}}")).toBeInTheDocument();
    expect(screen.getByText("Describe checkout flow in detail.")).toBeInTheDocument();

    await user.clear(screen.getByDisplayValue("checkout flow"));
    await user.type(screen.getByPlaceholderText("Enter value"), "settings panel");

    expect(screen.getByText("Describe settings panel in detail.")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "AI Test" })[1]);

    await waitFor(() => {
      expect(chatCompletionMock).toHaveBeenCalledTimes(1);
    });

    const messages = chatCompletionMock.mock.calls[0][1] as Array<{
      role: string;
      content: string;
    }>;

    expect(messages.find((message) => message.role === "user")?.content).toBe(
      "Describe settings panel in detail.",
    );
  });

  it("ignores stale single-model responses after close and reopen", async () => {
    const user = userEvent.setup();
    const singleResponse = createDeferred<{
      content: string;
      thinkingContent: string;
    }>();
    const handleSaveResponse = vi.fn();
    chatCompletionMock.mockReturnValue(singleResponse.promise);

    const { rerender } = await renderWithI18n(
      <ToastProvider>
        <AiTestModal
          isOpen
          onClose={vi.fn()}
          onSaveResponse={handleSaveResponse}
          prompt={prompt}
        />
      </ToastProvider>,
      { language: "en" },
    );

    await user.click(screen.getAllByRole("button", { name: "AI Test" })[1]);

    await waitFor(() => {
      expect(chatCompletionMock).toHaveBeenCalledTimes(1);
    });

    rerender(
      <ToastProvider>
        <AiTestModal
          isOpen={false}
          onClose={vi.fn()}
          onSaveResponse={handleSaveResponse}
          prompt={prompt}
        />
      </ToastProvider>,
    );
    rerender(
      <ToastProvider>
        <AiTestModal
          isOpen
          onClose={vi.fn()}
          onSaveResponse={handleSaveResponse}
          prompt={prompt}
        />
      </ToastProvider>,
    );

    await act(async () => {
      singleResponse.resolve({
        content: "stale single-model answer",
        thinkingContent: "",
      });
      await Promise.resolve();
    });

    expect(screen.queryByText("stale single-model answer")).not.toBeInTheDocument();
    expect(handleSaveResponse).not.toHaveBeenCalled();
  });

  it("clears the copy response feedback timer when unmounted after copying", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const user = userEvent.setup();

    const { unmount } = await renderWithI18n(
      <ToastProvider>
        <AiTestModal isOpen onClose={vi.fn()} prompt={prompt} />
      </ToastProvider>,
      { language: "en" },
    );

    await user.click(screen.getAllByRole("button", { name: "AI Test" })[1]);
    await waitFor(() => {
      expect(screen.getByText("analysis done")).toBeInTheDocument();
    });

    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy Response" }));
      await Promise.resolve();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("analysis done");
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);

    clearTimeoutSpy.mockClear();
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(expect.anything());
  });

  it("does not schedule copy feedback when closed before clipboard write finishes", async () => {
    const clipboardWrite = createDeferred<void>();
    vi.spyOn(navigator.clipboard, "writeText").mockReturnValue(clipboardWrite.promise);
    const user = userEvent.setup();

    const { rerender } = await renderWithI18n(
      <ToastProvider>
        <AiTestModal isOpen onClose={vi.fn()} prompt={prompt} />
      </ToastProvider>,
      { language: "en" },
    );

    await user.click(screen.getAllByRole("button", { name: "AI Test" })[1]);
    await waitFor(() => {
      expect(screen.getByText("analysis done")).toBeInTheDocument();
    });

    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");

    fireEvent.click(screen.getByRole("button", { name: "Copy Response" }));

    rerender(
      <ToastProvider>
        <AiTestModal isOpen={false} onClose={vi.fn()} prompt={prompt} />
      </ToastProvider>,
    );

    await act(async () => {
      clipboardWrite.resolve();
      await Promise.resolve();
    });

    expect(setTimeoutSpy.mock.calls.filter(([, delay]) => delay === 2000)).toHaveLength(0);
  });

  it(
    "passes uploaded chat attachments to compare mode for text prompts",
    async () => {
    const user = userEvent.setup();

    await renderWithI18n(
      <ToastProvider>
        <AiTestModal isOpen onClose={vi.fn()} prompt={prompt} initialMode="compare" />
      </ToastProvider>,
      { language: "en" },
    );

    const input = screen.getByLabelText("Add Images") as HTMLInputElement;
    const file = new File(["fake-image"], "diagram.png", { type: "image/png" });
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText("diagram.png")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "gpt-4o-mini" }));
    await user.click(screen.getByRole("button", { name: "claude-sonnet" }));
    await user.click(screen.getByRole("button", { name: "Run Comparison" }));

    await waitFor(() => {
      expect(multiModelCompareMock).toHaveBeenCalledTimes(1);
    });

    const messages = multiModelCompareMock.mock.calls[0][1] as Array<{ role: string; content: unknown }>;
    const userMessage = messages.find((message) => message.role === "user");

    expect(Array.isArray(userMessage?.content)).toBe(true);
    expect(userMessage?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text" }),
        expect.objectContaining({
          type: "image_url",
          image_url: expect.objectContaining({
            url: expect.stringContaining("data:image/png;base64,ZmFrZS1pbWFnZQ=="),
          }),
        }),
      ]),
    );
    },
    30000,
  );

  it("ignores stale compare results after close and reopen", async () => {
    const compareResponse = createDeferred<{
      messages: unknown[];
      results: Array<{
        id: string;
        success: boolean;
        response: string;
        thinkingContent: string;
        latency: number;
        model: string;
        provider: string;
      }>;
      totalTime: number;
    }>();
    multiModelCompareMock.mockReturnValue(compareResponse.promise);

    const { rerender } = await renderWithI18n(
      <ToastProvider>
        <AiTestModal isOpen onClose={vi.fn()} prompt={prompt} initialMode="compare" />
      </ToastProvider>,
      { language: "en" },
    );

    fireEvent.click(screen.getByRole("button", { name: "gpt-4o-mini" }));
    fireEvent.click(screen.getByRole("button", { name: "claude-sonnet" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Run Comparison" }));
      await Promise.resolve();
    });
    expect(multiModelCompareMock).toHaveBeenCalledTimes(1);

    rerender(
      <ToastProvider>
        <AiTestModal isOpen={false} onClose={vi.fn()} prompt={prompt} initialMode="compare" />
      </ToastProvider>,
    );
    rerender(
      <ToastProvider>
        <AiTestModal isOpen onClose={vi.fn()} prompt={prompt} initialMode="compare" />
      </ToastProvider>,
    );

    await act(async () => {
      compareResponse.resolve({
        messages: [],
        results: [
          {
            id: "chat-default",
            success: true,
            response: "stale compare answer",
            thinkingContent: "",
            latency: 10,
            model: "gpt-4o-mini",
            provider: "openai",
          },
        ],
        totalTime: 10,
      });
      await Promise.resolve();
    });

    expect(screen.queryByText("stale compare answer")).not.toBeInTheDocument();
  });

  it("ignores stale generated images after close and reopen", async () => {
    const imageResponse = createDeferred<{
      data: Array<{ url?: string; b64_json?: string }>;
    }>();
    generateImageMock.mockReturnValue(imageResponse.promise);

    const imagePrompt: Prompt = {
      ...prompt,
      id: "image-prompt-stale-result",
      promptType: "image",
    };

    const { rerender } = await renderWithI18n(
      <ToastProvider>
        <AiTestModal isOpen onClose={vi.fn()} prompt={imagePrompt} />
      </ToastProvider>,
      { language: "zh" },
    );

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "测试生图" }).at(-1)!);
      await Promise.resolve();
    });
    expect(generateImageMock).toHaveBeenCalledTimes(1);

    rerender(
      <ToastProvider>
        <AiTestModal isOpen={false} onClose={vi.fn()} prompt={imagePrompt} />
      </ToastProvider>,
    );
    rerender(
      <ToastProvider>
        <AiTestModal isOpen onClose={vi.fn()} prompt={imagePrompt} />
      </ToastProvider>,
    );

    await act(async () => {
      imageResponse.resolve({
        data: [{ url: "https://example.com/stale-generated.png" }],
      });
      await Promise.resolve();
    });

    expect(screen.queryByRole("img", { name: "Generated 1" })).not.toBeInTheDocument();
  });
});
