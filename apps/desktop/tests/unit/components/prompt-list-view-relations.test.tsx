import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PromptListView } from "../../../src/renderer/components/prompt/PromptListView";
import type { Prompt, PromptRelation } from "@prompthub/shared/types";
import { renderWithI18n } from "../../helpers/i18n";

function createPrompt(id: string, title: string): Prompt {
  return {
    id,
    title,
    description: "",
    promptType: "text",
    systemPrompt: "",
    userPrompt: title,
    variables: [],
    tags: [],
    isFavorite: false,
    isPinned: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function createDragDataTransfer() {
  return {
    dropEffect: "move",
    effectAllowed: "move",
    setData: vi.fn(),
    getData: vi.fn(),
  };
}

function mockRowRect(element: HTMLElement) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    right: 400,
    bottom: 90,
    left: 0,
    width: 400,
    height: 90,
    toJSON: () => ({}),
  });
}

describe("PromptListView relations", () => {
  it("creates a graph relation from a center-row drop choice", async () => {
    const source = createPrompt("prompt-source", "Source");
    const target = createPrompt("prompt-target", "Target");
    const createRelation = vi.fn().mockResolvedValue(undefined);

    await renderWithI18n(
      <PromptListView
        prompts={[source, target]}
        selectedId={null}
        selectedIds={[]}
        onSelect={vi.fn()}
        onToggleFavorite={vi.fn()}
        onCopy={vi.fn()}
        onContextMenu={vi.fn()}
        onMovePrompt={vi.fn()}
        onCreateRelation={createRelation}
      />,
      { language: "en" },
    );

    const sourceRow = screen.getByText("Source").closest("[draggable='true']");
    const targetRow = screen.getByText("Target").closest("[draggable='true']");
    expect(sourceRow).toBeTruthy();
    expect(targetRow).toBeTruthy();
    mockRowRect(targetRow as HTMLElement);

    const dataTransfer = createDragDataTransfer();
    fireEvent.dragStart(sourceRow!, { dataTransfer });
    fireEvent.dragOver(targetRow!, {
      clientY: 45,
      dataTransfer,
    });
    fireEvent.drop(targetRow!, {
      clientX: 120,
      clientY: 45,
      dataTransfer,
    });

    fireEvent.click(screen.getByRole("menuitem", { name: /Related/i }));

    expect(createRelation).toHaveBeenCalledWith({
      sourcePromptId: "prompt-source",
      targetPromptId: "prompt-target",
      kind: "related_to",
    });
  });

  it("renders relation badges for connected prompts", async () => {
    const source = createPrompt("prompt-source", "Source");
    const target = createPrompt("prompt-target", "Target");
    const relations: PromptRelation[] = [
      {
        id: "relation-1",
        sourcePromptId: source.id,
        targetPromptId: target.id,
        kind: "depends_on",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    await renderWithI18n(
      <PromptListView
        prompts={[source, target]}
        relations={relations}
        selectedId={null}
        selectedIds={[]}
        onSelect={vi.fn()}
        onToggleFavorite={vi.fn()}
        onCopy={vi.fn()}
        onContextMenu={vi.fn()}
        onMovePrompt={vi.fn()}
      />,
      { language: "en" },
    );

    expect(screen.getAllByText("Depends on")).toHaveLength(2);
  });
});
