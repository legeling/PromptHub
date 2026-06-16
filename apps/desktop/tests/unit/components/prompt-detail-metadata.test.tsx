import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Prompt } from "@prompthub/shared/types";

import { PromptDetailMetadata } from "../../../src/renderer/components/prompt/PromptDetailMetadata";
import { renderWithI18n } from "../../helpers/i18n";

const prompt: Prompt = {
  id: "prompt-1",
  title: "Cover prompt",
  description: "",
  promptType: "image",
  systemPrompt: "",
  userPrompt: "Draw a cover.",
  variables: [],
  tags: [],
  folderId: null,
  parentId: null,
  order: 0,
  isFavorite: false,
  isPinned: false,
  version: 1,
  currentVersion: 1,
  usageCount: 0,
  createdAt: "2026-06-16T00:00:00.000Z",
  updatedAt: "2026-06-16T00:00:00.000Z",
};

describe("PromptDetailMetadata", () => {
  it("keeps the related prompts action inside the relationship metadata row", async () => {
    const onToggleRelatedPrompts = vi.fn();

    await renderWithI18n(
      <PromptDetailMetadata
        prompt={prompt}
        parentPrompt={null}
        childPrompts={[{ ...prompt, id: "child-1", title: "Child prompt" }]}
        folderOptions={[]}
        relatedPromptCount={2}
        isRelatedPromptsOpen={false}
        t={(key: string, options?: { title?: string }) =>
          key === "prompt.childPrompts"
            ? "Children"
            : key === "prompt.relationships.openButton"
              ? "Related"
              : key === "prompt.relationships.openPanel"
                ? "Open related prompts"
                : key === "prompt.openChildPrompt"
                  ? `Open child prompt ${options?.title ?? ""}`
                  : key
        }
        onMoveToFolder={vi.fn()}
        onSelectPrompt={vi.fn()}
        onToggleRelatedPrompts={onToggleRelatedPrompts}
      />,
      { language: "en" },
    );

    const row = screen.getByTestId("prompt-detail-relationship-row");
    expect(within(row).getByRole("button", { name: "Open related prompts" }))
      .toHaveTextContent("Related2");

    fireEvent.click(
      within(row).getByRole("button", { name: "Open related prompts" }),
    );

    expect(onToggleRelatedPrompts).toHaveBeenCalledTimes(1);
  });
});
