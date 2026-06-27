import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Prompt } from "@prompthub/shared/types";

import { PromptCard } from "../../../src/renderer/components/layout/MainContent";
import { renderWithI18n } from "../../helpers/i18n";

const prompt: Prompt = {
  id: "prompt-1",
  title: "Nested prompt title",
  description: "Nested prompt description",
  promptType: "text",
  systemPrompt: "",
  userPrompt: "Write something.",
  variables: [],
  tags: [],
  folderId: null,
  parentId: "prompt-parent",
  order: 0,
  isFavorite: false,
  isPinned: false,
  version: 1,
  currentVersion: 1,
  usageCount: 0,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

describe("PromptCard layout", () => {
  it("indents nested cards by depth and keeps the title flexible", async () => {
    await renderWithI18n(
      <PromptCard
        prompt={prompt}
        depth={3}
        childCount={2}
        parentTitle="Parent prompt"
        isCollapsed={false}
        isSelected={false}
        isDragging={false}
        isDropTarget={false}
        dropPosition={null}
        onSelect={vi.fn()}
        onContextMenu={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
        onDragOver={vi.fn()}
        onDragEnter={vi.fn()}
        onDragLeave={vi.fn()}
        onDrop={vi.fn()}
        onToggleCollapse={vi.fn()}
        highlightTerms={[]}
      />,
      { language: "en" },
    );

    expect(screen.getByTestId("prompt-card-title-row")).toHaveStyle({
      paddingLeft: "48px",
    });
    expect(screen.getByTestId("prompt-card-title")).toHaveClass("min-w-0");
  });

  it("does not reserve collapse space or draw a line over leaf child content", async () => {
    const { container } = await renderWithI18n(
      <PromptCard
        prompt={prompt}
        depth={1}
        childCount={0}
        parentTitle="Parent prompt"
        isCollapsed={false}
        isSelected={false}
        isDragging={false}
        isDropTarget={false}
        dropPosition={null}
        onSelect={vi.fn()}
        onContextMenu={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
        onDragOver={vi.fn()}
        onDragEnter={vi.fn()}
        onDragLeave={vi.fn()}
        onDrop={vi.fn()}
        onToggleCollapse={vi.fn()}
        highlightTerms={[]}
      />,
      { language: "en" },
    );

    expect(
      screen.queryByTestId("prompt-card-collapse-toggle"),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".absolute.bottom-3.top-3.w-px"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("prompt-card-parent-chip")).toHaveStyle({
      marginLeft: "34px",
    });
  });
});
