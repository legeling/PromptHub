import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createInstance } from "i18next";
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
  it("keeps the relationships action inside the relationship metadata row", async () => {
    const onToggleRelatedPrompts = vi.fn();
    const i18n = createInstance();
    await i18n.init({
      lng: "en",
      resources: {
        en: {
          translation: {
            prompt: {
              childPrompts: "Children",
              openChildPrompt: "Open child prompt {{title}}",
              relationships: {
                openButton: "Relations",
                openPanel: "Open prompt relationships",
              },
            },
          },
        },
      },
    });

    await renderWithI18n(
      <PromptDetailMetadata
        prompt={prompt}
        parentPrompt={null}
        childPrompts={[{ ...prompt, id: "child-1", title: "Child prompt" }]}
        folderOptions={[]}
        relationshipCount={3}
        isRelatedPromptsOpen={false}
        t={i18n.t}
        onMoveToFolder={vi.fn()}
        onSelectPrompt={vi.fn()}
        onToggleRelatedPrompts={onToggleRelatedPrompts}
      />,
      { language: "en" },
    );

    const row = screen.getByTestId("prompt-detail-relationship-row");
    expect(
      within(row).getByRole("button", { name: "Open prompt relationships" }),
    ).toHaveTextContent("Relations3");

    fireEvent.click(
      within(row).getByRole("button", { name: "Open prompt relationships" }),
    );

    expect(onToggleRelatedPrompts).toHaveBeenCalledTimes(1);
  });
});
