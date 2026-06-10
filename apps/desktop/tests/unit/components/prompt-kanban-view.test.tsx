import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Prompt } from "@prompthub/shared/types";

import { PromptKanbanView } from "../../../src/renderer/components/prompt/PromptKanbanView";
import { renderWithI18n } from "../../helpers/i18n";

vi.mock("../../../src/renderer/stores/folder.store", () => ({
  useFolderStore: <T,>(selector: (state: { folders: unknown[] }) => T) =>
    selector({ folders: [] }),
}));

vi.mock("../../../src/renderer/stores/prompt.store", () => ({
  usePromptStore: <T,>(selector: (state: { kanbanColumns: 3 }) => T) =>
    selector({ kanbanColumns: 3 }),
}));

const prompt: Prompt = {
  id: "kanban-prompt-1",
  title: "Kanban prompt",
  description: "A prompt shown on the kanban board",
  promptType: "text",
  systemPrompt: "You are precise.",
  userPrompt: "Summarize {{topic}}",
  variables: [],
  tags: ["kanban"],
  folderId: null,
  isFavorite: false,
  isPinned: false,
  version: 1,
  currentVersion: 1,
  usageCount: 0,
  createdAt: "2026-05-29T00:00:00.000Z",
  updatedAt: "2026-05-29T00:00:00.000Z",
};

async function renderKanbanView(override: Partial<Prompt> = {}) {
  const result = await renderWithI18n(
    <PromptKanbanView
      prompts={[{ ...prompt, ...override }]}
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
    { language: "en" },
  );

  await act(async () => {
    await Promise.resolve();
  });

  return result;
}

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

describe("PromptKanbanView", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes explicit accessible names for icon-only card actions", async () => {
    await renderKanbanView();

    expect(screen.getByRole("button", { name: "Pin" })).toHaveAttribute("aria-label", "Pin");
    expect(screen.getByRole("button", { name: "Add to Favorites" })).toHaveAttribute(
      "aria-label",
      "Add to Favorites",
    );
    expect(screen.getByRole("button", { name: "Copy Prompt" })).toHaveAttribute(
      "aria-label",
      "Copy Prompt",
    );
    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("aria-label", "Edit");
    expect(screen.getByRole("button", { name: "AI Test" })).toHaveAttribute(
      "aria-label",
      "AI Test",
    );
  });

  it("keeps rendered kanban actions from submitting surrounding forms", async () => {
    const handleSubmit = vi.fn();

    await renderWithI18n(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <PromptKanbanView
          prompts={[prompt]}
          onSelect={vi.fn()}
          onToggleFavorite={vi.fn()}
          onCopy={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onAiTest={vi.fn()}
          onVersionHistory={vi.fn()}
          onViewDetail={vi.fn()}
          onContextMenu={vi.fn()}
        />
      </form>,
      { language: "en" },
    );

    await act(async () => {
      await Promise.resolve();
    });

    const buttons = Array.from(document.body.querySelectorAll("button"));
    const implicitButtonMarkup = buttons
      .filter((button) => button.getAttribute("type") !== "button")
      .map((button) => button.outerHTML);
    const exposedIconMarkup = buttons
      .flatMap((button) => Array.from(button.querySelectorAll("svg")))
      .filter((icon) => !hasHiddenSvgAncestor(icon))
      .map((icon) => icon.outerHTML);

    expect(implicitButtonMarkup, implicitButtonMarkup.join("\n")).toHaveLength(
      0,
    );
    expect(exposedIconMarkup, exposedIconMarkup.join("\n")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Copy Prompt" }));

    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it("exposes disclosure state for the pinned section", async () => {
    await renderKanbanView();

    fireEvent.click(screen.getByRole("button", { name: "Pin" }));

    const pinnedSectionToggle = screen.getByRole("button", { name: /Pinned Prompts/ });
    expect(pinnedSectionToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Unpin" })).toHaveAttribute("aria-label", "Unpin");

    fireEvent.click(pinnedSectionToggle);

    expect(pinnedSectionToggle).toHaveAttribute("aria-expanded", "false");
  });

  it("exposes accessible names for pinned bulk actions", async () => {
    await renderKanbanView();

    fireEvent.click(screen.getByRole("button", { name: "Pin" }));

    const expandAllButton = screen.getByRole("button", { name: "Expand All" });
    expect(expandAllButton).toHaveAttribute("aria-label", "Expand All");
    expect(screen.getByRole("button", { name: "Clear All" })).toHaveAttribute(
      "aria-label",
      "Clear All",
    );

    fireEvent.click(expandAllButton);

    expect(screen.getByRole("button", { name: "Collapse All" })).toHaveAttribute(
      "aria-label",
      "Collapse All",
    );
  });

  it("normalizes default-value variables in card badges", async () => {
    await renderKanbanView({
      systemPrompt: "Act as {{ role : planner }}.",
      userPrompt: "Summarize {{topic:release notes}} for {{role}}.",
    });

    expect(screen.getByText("{{role}}")).toBeInTheDocument();
    expect(screen.getByText("{{topic}}")).toBeInTheDocument();
    expect(screen.queryByText("{{topic:release notes}}")).not.toBeInTheDocument();
    expect(screen.queryByText("{{ role : planner }}")).not.toBeInTheDocument();
  });
});
