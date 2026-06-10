import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreatePromptModal } from "../../../src/renderer/components/prompt/CreatePromptModal";
import { EditPromptModal } from "../../../src/renderer/components/prompt/EditPromptModal";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { useFolderStore } from "../../../src/renderer/stores/folder.store";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import type { Prompt } from "@prompthub/shared/types";

const basePrompt: Prompt = {
  id: "prompt-1",
  title: "Prompt draft",
  description: "Draft description",
  promptType: "text",
  systemPrompt: "You are a helpful assistant.",
  userPrompt: "Draft the final answer.",
  variables: [],
  tags: ["demo"],
  isFavorite: false,
  isPinned: false,
  version: 1,
  currentVersion: 1,
  usageCount: 0,
  createdAt: new Date("2026-05-01T00:00:00.000Z").toISOString(),
  updatedAt: new Date("2026-05-01T00:00:00.000Z").toISOString(),
};

function createDeferredAiResponse() {
  let resolve!: (response: {
    ok: boolean;
    status: number;
    statusText: string;
    body: string;
    headers: Record<string, string>;
  }) => void;
  const promise = new Promise<{
    ok: boolean;
    status: number;
    statusText: string;
    body: string;
    headers: Record<string, string>;
  }>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function buildAiJsonResponse(content: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    body: JSON.stringify({
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: JSON.stringify(content),
          },
          finish_reason: "stop",
        },
      ],
    }),
    headers: { "content-type": "application/json" },
  };
}

describe("Prompt modal structure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installWindowMocks();

    usePromptStore.setState({
      prompts: [basePrompt],
      selectedId: null,
      selectedIds: [],
      isLoading: false,
      searchQuery: "",
      filterTags: [],
      promptTypeFilter: "all",
      sortBy: "updatedAt",
      sortOrder: "desc",
      viewMode: "card",
      galleryImageSize: "medium",
      kanbanColumns: 3,
    });

    useFolderStore.setState({
      folders: [
        {
          id: "folder-1",
          name: "Examples",
          createdAt: new Date("2026-05-01T00:00:00.000Z").toISOString(),
          updatedAt: new Date("2026-05-01T00:00:00.000Z").toISOString(),
          order: 0,
          icon: "folder",
        },
      ],
      selectedFolderId: null,
      expandedIds: new Set(),
      unlockedFolderIds: new Set(),
    } as Partial<ReturnType<typeof useFolderStore.getState>>);

    useSettingsStore.setState({
      sourceHistory: ["https://example.com/reference"],
      aiModels: [
        {
          id: "translation-chat",
          type: "chat",
          name: "Translation Chat",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "test-key",
          apiUrl: "https://api.example.com",
          model: "gpt-4.1-mini",
          isDefault: true,
        },
      ],
      scenarioModelDefaults: {},
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it(
    "keeps create modal first screen focused on type and prompt content",
    async () => {
      const user = userEvent.setup();

    await renderWithI18n(
      <ToastProvider>
        <CreatePromptModal
          isOpen
          onClose={vi.fn()}
          onCreate={vi.fn()}
          defaultPromptType="image"
        />
      </ToastProvider>,
      { language: "en" },
    );

    expect(screen.getByText("Prompt Type")).toBeInTheDocument();
    expect(screen.getByText("User Prompt")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Use {{variableName}} or {{variableName:exampleValue}} to define variables, e.g., {{language}} or {{courseName:Computer Science}}",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Basic Info")).not.toBeInTheDocument();
    expect(screen.queryByText("Description (Optional)")).not.toBeInTheDocument();
    expect(screen.queryByText("Reference Media")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Test with image models (e.g., DALL-E). Generated images will be saved to preview."),
    ).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /More Settings/i }));

      expect(screen.getByText("Description (Optional)")).toBeInTheDocument();
      expect(screen.getByText("System Prompt (Optional)")).toBeInTheDocument();
      expect(screen.getByText("Reference Media")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "More Settings" })).toBeInTheDocument();
    },
    10000,
  );

  it("clears discarded create modal drafts before reopening", async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();

    const { rerender } = await renderWithI18n(
      <ToastProvider>
        <CreatePromptModal
          isOpen
          onClose={handleClose}
          onCreate={vi.fn()}
        />
      </ToastProvider>,
      { language: "en" },
    );

    await user.type(screen.getByPlaceholderText("Name your Prompt"), "Discarded draft");
    await user.type(
      screen.getByPlaceholderText(/Enter your Prompt content/),
      "This draft should not survive reopening.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(handleClose).toHaveBeenCalledTimes(1);

    rerender(
      <ToastProvider>
        <CreatePromptModal
          isOpen={false}
          onClose={handleClose}
          onCreate={vi.fn()}
        />
      </ToastProvider>,
    );
    rerender(
      <ToastProvider>
        <CreatePromptModal
          isOpen
          onClose={handleClose}
          onCreate={vi.fn()}
        />
      </ToastProvider>,
    );

    expect(screen.queryByDisplayValue("Discarded draft")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("This draft should not survive reopening.")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Name your Prompt")).toHaveValue("");
  });

  it("keeps text prompt reference media inside more settings when editing", async () => {
    const user = userEvent.setup();

    await renderWithI18n(
      <ToastProvider>
        <EditPromptModal
          isOpen
          onClose={vi.fn()}
          prompt={{
            ...basePrompt,
            images: ["reference.png"],
          }}
        />
      </ToastProvider>,
      { language: "en" },
    );

    expect(screen.getByText("Basic Info")).toBeInTheDocument();
    expect(screen.getByText("Description (Optional)")).toBeInTheDocument();
    expect(screen.queryByText("Reference Media")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /More Settings/i }));

    expect(screen.getByText("Reference Media")).toBeInTheDocument();
  });

  it("keeps image prompt reference media in basic info when editing", async () => {
    await renderWithI18n(
      <ToastProvider>
        <EditPromptModal
          isOpen
          onClose={vi.fn()}
          prompt={{
            ...basePrompt,
            promptType: "image",
            images: ["reference.png"],
          }}
        />
      </ToastProvider>,
      { language: "en" },
    );

    expect(screen.getByText("Basic Info")).toBeInTheDocument();
    expect(screen.getByText("Description (Optional)")).toBeInTheDocument();
    expect(screen.getByText("Reference Media")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /More Settings/i }),
    ).toBeInTheDocument();
  });

  it("generates an AI rewrite draft and allows undoing it", async () => {
    const user = userEvent.setup();
    window.api.ai.request.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      body: JSON.stringify({
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify({
                summary: "Improved the output structure",
                description: "Updated description",
                userPrompt: "Return a structured answer with numbered steps.",
                notes: "AI rewrote this draft.",
              }),
            },
            finish_reason: "stop",
          },
        ],
      }),
      headers: { "content-type": "application/json" },
    });

    await renderWithI18n(
      <ToastProvider>
        <EditPromptModal isOpen onClose={vi.fn()} prompt={basePrompt} />
      </ToastProvider>,
      { language: "en" },
    );

    expect(screen.getByText("AI Rewrite")).toBeInTheDocument();

    const rewriteInstruction = screen.getByPlaceholderText(
      "Example: keep the original intent, but make the output more suitable for Claude and add clearer steps plus a final output format.",
    );
    await user.click(rewriteInstruction);
    await user.paste("Make the output easier to scan.");
    await user.click(screen.getByRole("button", { name: "Generate rewrite" }));

    expect(await screen.findByText("Improved the output structure")).toBeInTheDocument();

    const descriptionInput = screen.getByDisplayValue("Updated description");
    expect(descriptionInput).toBeInTheDocument();

    const userPromptTextarea = screen.getByDisplayValue(
      "Return a structured answer with numbered steps.",
    );
    expect(userPromptTextarea).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /More Settings/i }));
    expect(screen.getByDisplayValue("AI rewrote this draft.")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Undo AI rewrite" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Undo AI rewrite" }));

    await waitFor(() => {
      expect(screen.queryByText("Improved the output structure")).not.toBeInTheDocument();
    });

    expect(screen.getByDisplayValue(basePrompt.description ?? "")).toBeInTheDocument();
    expect(screen.getByDisplayValue(basePrompt.userPrompt)).toBeInTheDocument();
    expect(screen.queryByDisplayValue("AI rewrote this draft.")).not.toBeInTheDocument();

    const toast = await screen.findByText(
      "Restored the draft from before the AI rewrite",
    );
    expect(toast).toBeInTheDocument();
  }, 60000);

  it("ignores stale AI rewrite results after close and reopen", async () => {
    const user = userEvent.setup();
    let resolveRequest: (response: {
      ok: boolean;
      status: number;
      statusText: string;
      body: string;
      headers: Record<string, string>;
    }) => void = () => undefined;
    window.api.ai.request.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const handleClose = vi.fn();
    const { rerender } = await renderWithI18n(
      <ToastProvider>
        <EditPromptModal isOpen onClose={handleClose} prompt={basePrompt} />
      </ToastProvider>,
      { language: "en" },
    );

    const rewriteInstruction = screen.getByPlaceholderText(
      "Example: keep the original intent, but make the output more suitable for Claude and add clearer steps plus a final output format.",
    );
    await user.click(rewriteInstruction);
    await user.paste("Make the output easier to scan.");
    await user.click(screen.getByRole("button", { name: "Generate rewrite" }));

    await waitFor(() => {
      expect(window.api.ai.request).toHaveBeenCalledTimes(1);
    });

    rerender(
      <ToastProvider>
        <EditPromptModal isOpen={false} onClose={handleClose} prompt={basePrompt} />
      </ToastProvider>,
    );
    rerender(
      <ToastProvider>
        <EditPromptModal isOpen onClose={handleClose} prompt={basePrompt} />
      </ToastProvider>,
    );

    await act(async () => {
      resolveRequest({
        ok: true,
        status: 200,
        statusText: "OK",
        body: JSON.stringify({
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: JSON.stringify({
                  summary: "Stale rewrite summary",
                  description: "Stale description",
                  userPrompt: "Stale rewritten prompt.",
                  notes: "Stale notes.",
                }),
              },
              finish_reason: "stop",
            },
          ],
        }),
        headers: { "content-type": "application/json" },
      });
      await Promise.resolve();
    });

    expect(screen.queryByText("Stale rewrite summary")).not.toBeInTheDocument();
    expect(
      screen.queryByText("AI draft ready. Review it before saving."),
    ).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Stale description")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Stale rewritten prompt.")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue(basePrompt.description ?? "")).toBeInTheDocument();
    expect(screen.getByDisplayValue(basePrompt.userPrompt)).toBeInTheDocument();
  }, 10000);

  it("ignores stale translate-to-English results after close and reopen", async () => {
    const user = userEvent.setup();
    const translationResponse = createDeferredAiResponse();
    window.api.ai.request.mockReturnValue(translationResponse.promise);
    const chinesePrompt: Prompt = {
      ...basePrompt,
      id: "prompt-translate-to-english",
      systemPrompt: "你是一个严谨的助手。",
      userPrompt: "请整理最终答案。",
      systemPromptEn: "",
      userPromptEn: "",
    };

    const { rerender } = await renderWithI18n(
      <ToastProvider>
        <EditPromptModal isOpen onClose={vi.fn()} prompt={chinesePrompt} />
      </ToastProvider>,
      { language: "zh" },
    );

    const translateToEnglishButton = screen.getByRole("button", {
      name: "翻译为英文",
    });
    expect(translateToEnglishButton).toHaveAttribute(
      "aria-label",
      "翻译为英文",
    );
    await user.click(translateToEnglishButton);

    await waitFor(() => {
      expect(window.api.ai.request).toHaveBeenCalledTimes(1);
    });

    rerender(
      <ToastProvider>
        <EditPromptModal isOpen={false} onClose={vi.fn()} prompt={chinesePrompt} />
      </ToastProvider>,
    );
    rerender(
      <ToastProvider>
        <EditPromptModal isOpen onClose={vi.fn()} prompt={chinesePrompt} />
      </ToastProvider>,
    );

    await act(async () => {
      translationResponse.resolve(
        buildAiJsonResponse({
          systemPromptEn: "Stale English system prompt.",
          userPromptEn: "Stale English user prompt.",
        }),
      );
      await Promise.resolve();
    });

    expect(screen.queryByDisplayValue("Stale English system prompt.")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Stale English user prompt.")).not.toBeInTheDocument();
    expect(screen.queryByText("已生成英文版 Prompt")).not.toBeInTheDocument();
  }, 10000);

  it("ignores stale translate-from-English results after close and reopen", async () => {
    const user = userEvent.setup();
    const translationResponse = createDeferredAiResponse();
    window.api.ai.request.mockReturnValue(translationResponse.promise);
    const bilingualPrompt: Prompt = {
      ...basePrompt,
      id: "prompt-translate-from-english",
      systemPrompt: "原始系统提示词。",
      userPrompt: "原始用户提示词。",
      systemPromptEn: "You are a careful assistant.",
      userPromptEn: "Draft the final answer.",
    };

    const { rerender } = await renderWithI18n(
      <ToastProvider>
        <EditPromptModal isOpen onClose={vi.fn()} prompt={bilingualPrompt} />
      </ToastProvider>,
      { language: "zh" },
    );

    const translateFromEnglishButton = screen.getByRole("button", {
      name: "从英文翻译",
    });
    expect(translateFromEnglishButton).toHaveAttribute(
      "aria-label",
      "从英文翻译",
    );
    await user.click(translateFromEnglishButton);

    await waitFor(() => {
      expect(window.api.ai.request).toHaveBeenCalledTimes(1);
    });

    rerender(
      <ToastProvider>
        <EditPromptModal isOpen={false} onClose={vi.fn()} prompt={bilingualPrompt} />
      </ToastProvider>,
    );
    rerender(
      <ToastProvider>
        <EditPromptModal isOpen onClose={vi.fn()} prompt={bilingualPrompt} />
      </ToastProvider>,
    );

    await act(async () => {
      translationResponse.resolve(
        buildAiJsonResponse({
          systemPrompt: "过期系统提示词。",
          userPrompt: "过期用户提示词。",
        }),
      );
      await Promise.resolve();
    });

    expect(screen.queryByDisplayValue("过期系统提示词。")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("过期用户提示词。")).not.toBeInTheDocument();
    expect(screen.queryByText("已生成当前语言版本")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("原始系统提示词。")).toBeInTheDocument();
    expect(screen.getByDisplayValue("原始用户提示词。")).toBeInTheDocument();
  }, 10000);

  it("shows an error toast when rewrite is requested without instructions", async () => {
    const user = userEvent.setup();

    await renderWithI18n(
      <ToastProvider>
        <EditPromptModal isOpen onClose={vi.fn()} prompt={basePrompt} />
      </ToastProvider>,
      { language: "en" },
    );

    const button = screen.getByRole("button", {
      name: /Generate rewrite/i,
    });
    expect(button).toBeDisabled();

    await user.click(
      screen.getByRole("button", {
        name: "Preserve intent, improve clarity",
      }),
    );

    expect(button).toBeEnabled();
  });

  it("surfaces rewrite failures from the AI service", async () => {
    const user = userEvent.setup();
    window.api.ai.request.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      body: JSON.stringify({
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "not valid json",
            },
            finish_reason: "stop",
          },
        ],
      }),
      headers: { "content-type": "application/json" },
    });

    await renderWithI18n(
      <ToastProvider>
        <EditPromptModal isOpen onClose={vi.fn()} prompt={basePrompt} />
      </ToastProvider>,
      { language: "en" },
    );

    const rewriteInstruction = screen.getByPlaceholderText(
      "Example: keep the original intent, but make the output more suitable for Claude and add clearer steps plus a final output format.",
    );
    await user.click(rewriteInstruction);
    await user.paste("Make it clearer.");
    await user.click(screen.getByRole("button", { name: "Generate rewrite" }));

    expect(
      await screen.findByText("AI rewrite did not return valid JSON"),
    ).toBeInTheDocument();
  });

  it("clears create modal source suggestion blur timer when unmounted", async () => {
    const { unmount } = await renderWithI18n(
      <ToastProvider>
        <CreatePromptModal isOpen onClose={vi.fn()} onCreate={vi.fn()} />
      </ToastProvider>,
      { language: "en" },
    );

    fireEvent.click(screen.getByRole("button", { name: /More Settings/i }));
    const sourceInput = screen.getByPlaceholderText(
      "Where did you find this Prompt? e.g. URL, book, etc.",
    );
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

    fireEvent.focus(sourceInput);
    expect(screen.getByText("https://example.com/reference")).toBeInTheDocument();

    fireEvent.blur(sourceInput);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 150);

    clearTimeoutSpy.mockClear();
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(expect.anything());
  });

  it("clears edit modal source suggestion blur timer when unmounted", async () => {
    const { unmount } = await renderWithI18n(
      <ToastProvider>
        <EditPromptModal isOpen onClose={vi.fn()} prompt={basePrompt} />
      </ToastProvider>,
      { language: "en" },
    );

    fireEvent.click(screen.getByRole("button", { name: /More Settings/i }));
    const sourceInput = screen.getByPlaceholderText(
      "Where did you find this Prompt? e.g. URL, book, etc.",
    );
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

    fireEvent.focus(sourceInput);
    expect(screen.getByText("https://example.com/reference")).toBeInTheDocument();

    fireEvent.blur(sourceInput);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 150);

    clearTimeoutSpy.mockClear();
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(expect.anything());
  });
});
