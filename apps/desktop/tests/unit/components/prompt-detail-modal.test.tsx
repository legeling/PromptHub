import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Prompt, PromptRelation } from "@prompthub/shared/types";

import { PromptDetailModal } from "../../../src/renderer/components/prompt/PromptDetailModal";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { renderWithI18n } from "../../helpers/i18n";

const prompt = {
  id: "prompt-1",
  title: "Weekly planner",
  description: "Old description",
  promptType: "text" as const,
  systemPrompt: "You are a helpful planner.",
  userPrompt: "Plan my week.",
  variables: [],
  tags: ["planning"],
  isFavorite: false,
  isPinned: false,
  version: 1,
  currentVersion: 1,
  usageCount: 0,
  notes: "Old notes",
  createdAt: "2026-05-29T00:00:00.000Z",
  updatedAt: "2026-05-29T00:00:00.000Z",
};

const relatedPrompt: Prompt = {
  ...prompt,
  id: "prompt-2",
  title: "Review rubric",
  userPrompt: "Review the result.",
};

const relation: PromptRelation = {
  id: "relation-1",
  sourcePromptId: prompt.id,
  targetPromptId: relatedPrompt.id,
  kind: "depends_on",
  note: null,
  createdAt: "2026-05-29T00:00:00.000Z",
  updatedAt: "2026-05-29T00:00:00.000Z",
};

describe("PromptDetailModal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("shows AI quick edit action in the header", async () => {
    await renderWithI18n(
      <ToastProvider>
        <PromptDetailModal
          isOpen
          onClose={vi.fn()}
          prompt={prompt}
          onEdit={vi.fn()}
          onQuickRewriteEdit={vi.fn()}
        />
      </ToastProvider>,
      { language: "en" },
    );

    expect(
      screen.getByRole("button", { name: "AI Quick Edit" }),
    ).toBeInTheDocument();
  });

  it("opens prompt relationships from a quiet detail action", async () => {
    const onClose = vi.fn();
    const onSelectPrompt = vi.fn();
    const onDeleteRelation = vi.fn().mockResolvedValue(undefined);

    await renderWithI18n(
      <ToastProvider>
        <PromptDetailModal
          isOpen
          onClose={onClose}
          prompt={prompt}
          prompts={[prompt, relatedPrompt]}
          relations={[relation]}
          onSelectPrompt={onSelectPrompt}
          onDeleteRelation={onDeleteRelation}
          onCreateRelation={vi.fn()}
        />
      </ToastProvider>,
      { language: "en" },
    );

    expect(screen.queryByText("Prompt relationships")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Open prompt relationships" }),
    );

    expect(await screen.findByText("Prompt relationships")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Open related prompt Review rubric" }),
    );

    expect(onSelectPrompt).toHaveBeenCalledWith(relatedPrompt.id);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render unsafe source URLs as links", async () => {
    await renderWithI18n(
      <ToastProvider>
        <PromptDetailModal
          isOpen
          onClose={vi.fn()}
          prompt={{ ...prompt, source: "javascript:alert(1)" }}
        />
      </ToastProvider>,
      { language: "en" },
    );

    expect(screen.getByText("javascript:alert(1)").closest("a")).toBeNull();
  });

  it("keeps safe source URLs clickable", async () => {
    await renderWithI18n(
      <ToastProvider>
        <PromptDetailModal
          isOpen
          onClose={vi.fn()}
          prompt={{ ...prompt, source: "https://example.com/prompts/weekly" }}
        />
      </ToastProvider>,
      { language: "en" },
    );

    expect(
      screen.getByRole("link", { name: "https://example.com/prompts/weekly" }),
    ).toHaveAttribute("href", "https://example.com/prompts/weekly");
  });

  it("exposes explicit button semantics for detail actions", async () => {
    await renderWithI18n(
      <ToastProvider>
        <PromptDetailModal
          isOpen
          onClose={vi.fn()}
          prompt={{ ...prompt, lastAiResponse: "Use this schedule." }}
          onEdit={vi.fn()}
        />
      </ToastProvider>,
      { language: "en" },
    );

    const fullscreenButton = screen.getByRole("button", { name: "Fullscreen" });
    const shareButton = screen.getByRole("button", { name: "Share as JSON" });
    const editButton = screen.getByRole("button", { name: "Edit" });
    const copyPromptButtons = screen.getAllByRole("button", {
      name: "Copy Prompt",
    });
    const copyResponseButton = screen.getByRole("button", {
      name: "Copy Response",
    });

    expect(fullscreenButton).toHaveAttribute("type", "button");
    expect(shareButton).toHaveAttribute("type", "button");
    expect(editButton).toHaveAttribute("type", "button");
    expect(copyResponseButton).toHaveAttribute("type", "button");
    copyPromptButtons.forEach((button) => {
      expect(button).toHaveAttribute("type", "button");
    });

    [
      fullscreenButton,
      shareButton,
      editButton,
      copyResponseButton,
      ...copyPromptButtons,
    ].forEach((button) => {
      expect(button.querySelector("svg")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    });
  });

  it("clears copy feedback timers when unmounted after copying", async () => {
    vi.useFakeTimers();
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

    const { unmount } = await renderWithI18n(
      <ToastProvider>
        <PromptDetailModal
          isOpen
          onClose={vi.fn()}
          prompt={{ ...prompt, systemPrompt: undefined }}
        />
      </ToastProvider>,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy Prompt" }));
      await Promise.resolve();
    });
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);
    const feedbackTimer = setTimeoutSpy.mock.results.find(
      (_, index) => setTimeoutSpy.mock.calls[index]?.[1] === 2000,
    )?.value;
    expect(feedbackTimer).toBeDefined();

    clearTimeoutSpy.mockClear();
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(2);
  });

  it("delegates user prompt copy to parent flow when provided", async () => {
    const onCopy = vi.fn();
    const writeTextSpy = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);

    await renderWithI18n(
      <ToastProvider>
        <PromptDetailModal
          isOpen
          onClose={vi.fn()}
          prompt={prompt}
          onCopy={onCopy}
        />
      </ToastProvider>,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(
        screen.getAllByRole("button", { name: "Copy Prompt" }).at(-1)!,
      );
      await Promise.resolve();
    });

    expect(onCopy).toHaveBeenCalledWith(prompt);
    expect(writeTextSpy).not.toHaveBeenCalled();
  });

  it("clears share feedback timers when unmounted after sharing", async () => {
    vi.useFakeTimers();
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

    const { unmount } = await renderWithI18n(
      <ToastProvider>
        <PromptDetailModal isOpen onClose={vi.fn()} prompt={prompt} />
      </ToastProvider>,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share as JSON" }));
      await Promise.resolve();
    });
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);
    const feedbackTimer = setTimeoutSpy.mock.results.find(
      (_, index) => setTimeoutSpy.mock.calls[index]?.[1] === 2000,
    )?.value;
    expect(feedbackTimer).toBeDefined();

    clearTimeoutSpy.mockClear();
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(2);
  });

  it("hands off to edit immediately without leaving a delayed callback", async () => {
    const onClose = vi.fn();
    const onEdit = vi.fn();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");

    await renderWithI18n(
      <ToastProvider>
        <PromptDetailModal
          isOpen
          onClose={onClose}
          prompt={prompt}
          onEdit={onEdit}
        />
      </ToastProvider>,
      { language: "en" },
    );
    const timeoutCallsBeforeEdit = setTimeoutSpy.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(prompt);
    expect(setTimeoutSpy.mock.calls).toHaveLength(timeoutCallsBeforeEdit);
  });

  it("normalizes default-value prompt variables in the detail list and shared JSON", async () => {
    const writeTextSpy = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);

    await renderWithI18n(
      <ToastProvider>
        <PromptDetailModal
          isOpen
          onClose={vi.fn()}
          prompt={{
            ...prompt,
            systemPrompt: "Act as a {{role:planner}}.",
            userPrompt: "Plan {{courseName:Computer Science}} for {{role}}.",
          }}
        />
      </ToastProvider>,
      { language: "en" },
    );

    expect(screen.getByText("{{role}}")).toBeInTheDocument();
    expect(screen.getByText("{{courseName}}")).toBeInTheDocument();
    expect(
      screen.queryByText("{{courseName:Computer Science}}"),
    ).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share as JSON" }));
      await Promise.resolve();
    });

    const sharedJson = writeTextSpy.mock.calls.at(-1)?.[0];
    expect(JSON.parse(String(sharedJson))).toMatchObject({
      variables: ["role", "courseName"],
    });
  });
});
