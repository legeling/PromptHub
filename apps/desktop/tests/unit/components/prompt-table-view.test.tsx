import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Prompt } from "@prompthub/shared/types";

import { PromptTableView } from "../../../src/renderer/components/prompt/PromptTableView";
import { renderWithI18n } from "../../helpers/i18n";

const prompt: Prompt = {
  id: "prompt-table-1",
  title: "Release notes",
  description: "Draft the release summary",
  promptType: "text",
  systemPrompt: "You are a concise editor.",
  userPrompt: "Summarize {{changes}}",
  variables: [],
  tags: ["release"],
  folderId: null,
  isFavorite: false,
  isPinned: false,
  version: 1,
  currentVersion: 1,
  usageCount: 0,
  lastAiResponse: "Looks good.",
  createdAt: "2026-05-29T00:00:00.000Z",
  updatedAt: "2026-05-29T00:00:00.000Z",
};

function createPrompt(id: number): Prompt {
  return {
    ...prompt,
    id: `prompt-table-${id}`,
    title: `Prompt ${id}`,
  };
}

function renderTableView({
  onCopy = vi.fn<(copiedPrompt: Prompt) => void>(),
  onAiTest = vi.fn<(testedPrompt: Prompt) => void>(),
  onVersionHistory = vi.fn<(historyPrompt: Prompt) => void>(),
  onToggleFavorite = vi.fn<(promptId: string) => void>(),
  onEdit = vi.fn<(editedPrompt: Prompt) => void>(),
  onDelete = vi.fn<(deletedPrompt: Prompt) => void>(),
  onMovePrompt,
  prompts = [prompt],
}: {
  onCopy?: (copiedPrompt: Prompt) => void;
  onAiTest?: (testedPrompt: Prompt) => void;
  onVersionHistory?: (historyPrompt: Prompt) => void;
  onToggleFavorite?: (promptId: string) => void;
  onEdit?: (editedPrompt: Prompt) => void;
  onDelete?: (deletedPrompt: Prompt) => void;
  onMovePrompt?: (
    promptId: string,
    newParentId: string | null,
    newOrder: number,
  ) => Promise<void> | void;
  prompts?: Prompt[];
} = {}) {
  return renderWithI18n(
    <PromptTableView
      prompts={prompts}
      onSelect={vi.fn()}
      onToggleFavorite={onToggleFavorite}
      onCopy={onCopy}
      onEdit={onEdit}
      onDelete={onDelete}
      onAiTest={onAiTest}
      onVersionHistory={onVersionHistory}
      onViewDetail={vi.fn()}
      onContextMenu={vi.fn()}
      onMovePrompt={onMovePrompt}
    />,
    { language: "en" },
  );
}

function createDataTransfer() {
  const store = new Map<string, string>();
  return {
    effectAllowed: "",
    dropEffect: "",
    setData: vi.fn((type: string, value: string) => {
      store.set(type, value);
    }),
    getData: vi.fn((type: string) => store.get(type) ?? ""),
  };
}

async function clickCopyButton() {
  await act(async () => {
    fireEvent.click(screen.getByTitle("Copy Prompt"));
    await Promise.resolve();
  });
}

describe("PromptTableView", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("clears the copy feedback timer when unmounted after copying", async () => {
    vi.useFakeTimers();
    const onCopy = vi.fn<(copiedPrompt: Prompt) => void>();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

    const { unmount } = await renderTableView({ onCopy });

    await clickCopyButton();

    expect(onCopy).toHaveBeenCalledWith(prompt);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);

    clearTimeoutSpy.mockClear();
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(expect.anything());
  });

  it("replaces the pending copy feedback timer on repeated copy", async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

    await renderTableView();

    await clickCopyButton();
    const firstCopyTimer = setTimeoutSpy.mock.results.find(
      (_, index) => setTimeoutSpy.mock.calls[index]?.[1] === 2000,
    )?.value;
    expect(firstCopyTimer).toBeDefined();

    clearTimeoutSpy.mockClear();
    await clickCopyButton();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(firstCopyTimer);
    expect(setTimeoutSpy.mock.calls.filter(([, delay]) => delay === 2000)).toHaveLength(2);
  });

  it("exposes accessible names and checked state for row selection controls", async () => {
    await renderTableView();

    const selectAll = screen.getByRole("checkbox", { name: "Select all prompts" });
    const selectRow = screen.getByRole("checkbox", { name: "Select Release notes" });

    expect(selectAll).toHaveAttribute("aria-checked", "false");
    expect(selectRow).toHaveAttribute("aria-checked", "false");

    fireEvent.click(selectRow);

    expect(selectRow).toHaveAttribute("aria-checked", "true");
    expect(selectAll).toHaveAttribute("aria-checked", "true");
  });

  it("exposes accessible names for pagination controls", async () => {
    await renderTableView();

    expect(screen.getByRole("combobox", { name: "Per page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
  });

  it("exposes accessible names for icon-only row actions", async () => {
    await renderTableView();

    expect(screen.getByRole("button", { name: "Copy Prompt" })).toHaveAttribute(
      "aria-label",
      "Copy Prompt",
    );
    expect(screen.getByRole("button", { name: "AI Test" })).toHaveAttribute(
      "aria-label",
      "AI Test",
    );
    expect(screen.getByRole("button", { name: "Version History" })).toHaveAttribute(
      "aria-label",
      "Version History",
    );
    expect(screen.getByRole("button", { name: "Add to Favorites" })).toHaveAttribute(
      "aria-label",
      "Add to Favorites",
    );
    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("aria-label", "Edit");
    expect(screen.getByRole("button", { name: "Delete" })).toHaveAttribute(
      "aria-label",
      "Delete",
    );
  });

  it("keeps row action clicks isolated from ancestor click handlers", async () => {
    const handleAncestorClick = vi.fn();
    const onCopy = vi.fn<(copiedPrompt: Prompt) => void>();
    const onAiTest = vi.fn<(testedPrompt: Prompt) => void>();
    const onVersionHistory = vi.fn<(historyPrompt: Prompt) => void>();
    const onToggleFavorite = vi.fn<(promptId: string) => void>();
    const onEdit = vi.fn<(editedPrompt: Prompt) => void>();
    const onDelete = vi.fn<(deletedPrompt: Prompt) => void>();

    await renderWithI18n(
      <div onClick={handleAncestorClick}>
        <PromptTableView
          prompts={[prompt]}
          onSelect={vi.fn()}
          onToggleFavorite={onToggleFavorite}
          onCopy={onCopy}
          onEdit={onEdit}
          onDelete={onDelete}
          onAiTest={onAiTest}
          onVersionHistory={onVersionHistory}
          onViewDetail={vi.fn()}
          onContextMenu={vi.fn()}
        />
      </div>,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy Prompt" }));
      fireEvent.click(screen.getByRole("button", { name: "AI Test" }));
      fireEvent.click(screen.getByRole("button", { name: "Version History" }));
      fireEvent.click(screen.getByRole("button", { name: "Add to Favorites" }));
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
      await Promise.resolve();
    });

    expect(onCopy).toHaveBeenCalledWith(prompt);
    expect(onAiTest).toHaveBeenCalledWith(prompt);
    expect(onVersionHistory).toHaveBeenCalledWith(prompt);
    expect(onToggleFavorite).toHaveBeenCalledWith(prompt.id);
    expect(onEdit).toHaveBeenCalledWith(prompt);
    expect(onDelete).toHaveBeenCalledWith(prompt);
    expect(handleAncestorClick).not.toHaveBeenCalled();
  });

  it("moves a dragged prompt under the dropped table row", async () => {
    const onMovePrompt = vi.fn();
    const prompts = [createPrompt(1), createPrompt(2)];

    await renderTableView({ prompts, onMovePrompt });

    const sourceRow = screen.getByText("Prompt 1").closest("tr");
    const targetRow = screen.getByText("Prompt 2").closest("tr");
    expect(sourceRow).not.toBeNull();
    expect(targetRow).not.toBeNull();

    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(sourceRow!, { dataTransfer });
    fireEvent.dragEnter(targetRow!, { clientY: 0, dataTransfer });
    fireEvent.drop(targetRow!, { clientY: 0, dataTransfer });

    expect(onMovePrompt).toHaveBeenCalledWith(
      "prompt-table-1",
      "prompt-table-2",
      0,
    );
  });

  it("shows visible hierarchy cues for parent and child prompts", async () => {
    const parent = createPrompt(1);
    const child = {
      ...createPrompt(2),
      parentId: parent.id,
      order: 0,
    };

    await renderTableView({ prompts: [parent, child] });

    expect(screen.getByRole("button", { name: parent.title })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: child.title })).toBeInTheDocument();
    expect(screen.getByText("Parent")).toBeInTheDocument();
    expect(screen.getByText(parent.title, { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Children 1")).toBeInTheDocument();
  });

  it("collapses and expands child prompt rows from the hierarchy control", async () => {
    const parent = createPrompt(1);
    const child = {
      ...createPrompt(2),
      parentId: parent.id,
      order: 0,
    };

    await renderTableView({ prompts: [parent, child] });

    fireEvent.click(screen.getByRole("button", { name: "Collapse Prompt 1" }));

    expect(screen.getByRole("button", { name: parent.title })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: child.title })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand Prompt 1" }));

    expect(screen.getByRole("button", { name: child.title })).toBeInTheDocument();
  });

  it("clamps the active page when the prompt list shrinks", async () => {
    const prompts = Array.from({ length: 11 }, (_, index) => createPrompt(index + 1));
    const { rerender } = await renderTableView({ prompts });

    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));

    expect(screen.getByRole("button", { name: "Prompt 11" })).toBeInTheDocument();

    rerender(
      <PromptTableView
        prompts={[prompts[0]]}
        onSelect={vi.fn()}
        onToggleFavorite={vi.fn()}
        onCopy={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAiTest={vi.fn()}
        onVersionHistory={vi.fn()}
        onViewDetail={vi.fn()}
        onContextMenu={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Prompt 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
  });

  it("removes selected ids that no longer exist after a prompt refresh", async () => {
    const prompts = [createPrompt(1), createPrompt(2)];
    const { rerender } = await renderTableView({ prompts });

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Prompt 2" }));

    expect(screen.getByText("1 selected")).toBeInTheDocument();

    rerender(
      <PromptTableView
        prompts={[prompts[0]]}
        onSelect={vi.fn()}
        onToggleFavorite={vi.fn()}
        onCopy={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAiTest={vi.fn()}
        onVersionHistory={vi.fn()}
        onViewDetail={vi.fn()}
        onContextMenu={vi.fn()}
      />,
    );

    expect(screen.queryByText("1 selected")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Batch Delete" })).not.toBeInTheDocument();
  });

  it("selects the current page even when another page has the same selected count", async () => {
    const prompts = Array.from({ length: 11 }, (_, index) => createPrompt(index + 1));
    await renderTableView({ prompts });

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Prompt 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));

    const selectAll = screen.getByRole("checkbox", { name: "Select all prompts" });
    expect(selectAll).toHaveAttribute("aria-checked", "false");

    fireEvent.click(selectAll);

    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Prompt 11" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("normalizes default-value variables in the variables column count", async () => {
    await renderTableView({
      prompts: [
        {
          ...prompt,
          systemPrompt: "Act as {{ role : planner }}.",
          userPrompt: "Summarize {{topic:release notes}} for {{role}}.",
          userPromptEn: "Summarize {{topic}}.",
        },
      ],
    });

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByText("3")).not.toBeInTheDocument();
  });
});
