import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Prompt, PromptRelation } from "@prompthub/shared/types";

import { PromptGraphView } from "../../../src/renderer/components/prompt/PromptGraphView";
import { renderWithI18n } from "../../helpers/i18n";

const basePrompt: Prompt = {
  id: "prompt-parent",
  title: "Parent prompt",
  description: "Top level prompt",
  promptType: "text",
  systemPrompt: "",
  userPrompt: "Parent body",
  variables: [],
  tags: [],
  folderId: null,
  isFavorite: false,
  isPinned: false,
  version: 1,
  currentVersion: 1,
  usageCount: 0,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

function createPrompt(id: string, title: string, parentId?: string): Prompt {
  return {
    ...basePrompt,
    id,
    title,
    parentId,
  };
}

const parentPrompt = basePrompt;
const childPrompt = createPrompt(
  "prompt-child",
  "Child prompt",
  parentPrompt.id,
);
const relatedPrompt = createPrompt("prompt-related", "Related prompt");

const relation: PromptRelation = {
  id: "relation-1",
  sourcePromptId: childPrompt.id,
  targetPromptId: relatedPrompt.id,
  kind: "depends_on",
  note: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

describe("PromptGraphView", () => {
  it("renders all prompt nodes with hierarchy and semantic relation edges", async () => {
    const onSelectPrompt = vi.fn();

    await renderWithI18n(
      <PromptGraphView
        prompts={[parentPrompt, childPrompt, relatedPrompt]}
        relations={[relation]}
        selectedPromptId={childPrompt.id}
        onSelectPrompt={onSelectPrompt}
      />,
      { language: "en" },
    );

    expect(screen.getByText("Relationship Graph")).toBeInTheDocument();
    expect(screen.getByText("Parent prompt")).toBeInTheDocument();
    expect(screen.getByText("Child prompt")).toBeInTheDocument();
    expect(screen.getByText("Related prompt")).toBeInTheDocument();
    expect(screen.getByText("Grouped under")).toBeInTheDocument();
    expect(screen.getByText("Depends on")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Open graph prompt Child prompt" }),
    );

    expect(onSelectPrompt).toHaveBeenCalledWith(childPrompt.id);
  });

  it("shows an empty graph state without relying on filters", async () => {
    await renderWithI18n(
      <PromptGraphView
        prompts={[]}
        relations={[]}
        selectedPromptId={null}
        onSelectPrompt={vi.fn()}
      />,
      { language: "en" },
    );

    expect(screen.getByText("No prompts to map yet")).toBeInTheDocument();
  });
});
