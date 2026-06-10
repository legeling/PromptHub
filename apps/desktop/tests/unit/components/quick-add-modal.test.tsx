import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FormEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QuickAddModal } from "../../../src/renderer/components/prompt/QuickAddModal";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { useFolderStore } from "../../../src/renderer/stores/folder.store";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const chatCompletionMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/renderer/services/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/renderer/services/ai")>();
  return {
    ...actual,
    chatCompletion: (...args: unknown[]) => chatCompletionMock(...args),
  };
});

function createDeferredChatResult() {
  let resolve!: (value: { content: string }) => void;
  const promise = new Promise<{ content: string }>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function isHiddenFromAccessibility(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    if (current.getAttribute("aria-hidden") === "true") {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

describe("QuickAddModal", () => {
  beforeEach(() => {
    chatCompletionMock.mockReset();
    installWindowMocks();

    useFolderStore.setState({
      folders: [
        {
          id: "folder-1",
          name: "Marketing",
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

    usePromptStore.setState({
      prompts: [],
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

    useSettingsStore.setState({
      aiProvider: "openai",
      aiApiProtocol: "openai",
      aiApiKey: "test-key",
      aiApiUrl: "https://example.com/v1",
      aiModel: "gpt-4o-mini",
      aiModels: [],
      scenarioModelDefaults: {},
      enableNotifications: false,
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("keeps the pointer backdrop presentational while preserving click close", async () => {
    const onClose = vi.fn();

    await renderWithI18n(
      <ToastProvider>
        <QuickAddModal
          isOpen
          onClose={onClose}
          onCreate={vi.fn()}
          defaultPromptType="text"
        />
      </ToastProvider>,
      { language: "en" },
    );

    const backdrop = screen.getByTestId("quick-add-backdrop");
    expect(backdrop).toHaveAttribute("role", "presentation");
    expect(backdrop).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("switches to AI generate mode and updates the prompt request copy", async () => {
    const user = userEvent.setup();

    await renderWithI18n(
      <ToastProvider>
        <QuickAddModal
          isOpen
          onClose={vi.fn()}
          onCreate={vi.fn()}
          defaultPromptType="text"
        />
      </ToastProvider>,
      { language: "zh" },
    );

    expect(screen.getByText("分析已有内容")).toBeInTheDocument();
    expect(screen.getByText("AI 生成 Prompt")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "粘贴你的 Prompt" })).toBeInTheDocument();
    expect(document.querySelector(".max-w-2xl")).toHaveClass("animate-in");
    expect(document.querySelector(".max-w-2xl")).toHaveClass("zoom-in-95");

    await user.click(screen.getByRole("button", { name: /AI 生成 Prompt/i }));

    expect(screen.getByText("描述你想要的 Prompt")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        "例如：帮我生成一个用于写小红书标题的 Prompt，语气年轻、有网感，输出 10 个备选标题。",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "文本" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "绘图" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /AI 智能自动分类/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成并创建" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "图片反推" })).not.toBeInTheDocument();
  });

  it("keeps quick-add actions non-submit with decorative icons hidden", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    await renderWithI18n(
      <ToastProvider>
        <form onSubmit={onSubmit}>
          <QuickAddModal
            isOpen
            onClose={vi.fn()}
            onCreate={vi.fn()}
            defaultPromptType="text"
          />
        </form>
      </ToastProvider>,
      { language: "zh" },
    );

    await user.click(screen.getByRole("button", { name: /AI 生成 Prompt/i }));
    await user.click(screen.getByRole("button", { name: "绘图" }));

    for (const button of screen.getAllByRole("button")) {
      if (button.tagName === "BUTTON") {
        expect(button).toHaveAttribute("type", "button");
      }
    }

    for (const icon of document.querySelectorAll("button svg")) {
      expect(isHiddenFromAccessibility(icon)).toBe(true);
    }

    await user.click(screen.getByRole("button", { name: "文本" }));
    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("clears the delayed focus timer when unmounted before focus runs", async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

    const { unmount } = await renderWithI18n(
      <ToastProvider>
        <QuickAddModal
          isOpen
          onClose={vi.fn()}
          onCreate={vi.fn()}
          defaultPromptType="text"
        />
      </ToastProvider>,
      { language: "en" },
    );

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 100);
    clearTimeoutSpy.mockClear();

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(expect.anything());
  });

  it("ignores stale generated prompt drafts after close and reopen", async () => {
    const user = userEvent.setup();
    const generatedDraft = createDeferredChatResult();
    const handleCreate = vi.fn().mockResolvedValue({
      id: "created-prompt",
    });
    chatCompletionMock.mockReturnValue(generatedDraft.promise);

    const { rerender } = await renderWithI18n(
      <ToastProvider>
        <QuickAddModal
          isOpen
          onClose={vi.fn()}
          onCreate={handleCreate}
          defaultPromptType="text"
          initialMode="generate"
        />
      </ToastProvider>,
      { language: "en" },
    );

    await user.type(
      screen.getByRole("textbox", { name: "Describe the Prompt you want" }),
      "Generate a stale prompt draft.",
    );
    await user.click(screen.getByRole("button", { name: "Generate & Create" }));

    expect(chatCompletionMock).toHaveBeenCalledTimes(1);

    rerender(
      <ToastProvider>
        <QuickAddModal
          isOpen={false}
          onClose={vi.fn()}
          onCreate={handleCreate}
          defaultPromptType="text"
          initialMode="generate"
        />
      </ToastProvider>,
    );
    rerender(
      <ToastProvider>
        <QuickAddModal
          isOpen
          onClose={vi.fn()}
          onCreate={handleCreate}
          defaultPromptType="text"
          initialMode="generate"
        />
      </ToastProvider>,
    );

    generatedDraft.resolve({
      content: JSON.stringify({
        title: "Stale generated prompt",
        promptType: "text",
        userPrompt: "This stale prompt should not be created.",
        systemPrompt: "",
        description: "Generated after close.",
        suggestedFolder: null,
        tags: ["stale"],
      }),
    });
    await Promise.resolve();

    expect(handleCreate).not.toHaveBeenCalled();
  });
});
