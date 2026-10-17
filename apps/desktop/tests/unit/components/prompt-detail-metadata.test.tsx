import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createInstance } from "i18next";
import type { Prompt } from "@prompthub/shared/types";

import { PromptDetailMetadata } from "../../../src/renderer/components/prompt/PromptDetailMetadata";
import { createTestI18n, renderWithI18n } from "../../helpers/i18n";

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
  it("keeps creation time when favorite, content, and folder metadata change", async () => {
    const i18n = await createTestI18n();
    const props = {
      parentPrompt: null,
      childPrompts: [],
      folderOptions: [],
      t: i18n.t,
      onMoveToFolder: vi.fn(),
      onSelectPrompt: vi.fn(),
    };
    const { rerender } = await renderWithI18n(
      <PromptDetailMetadata {...props} prompt={prompt} />,
    );
    const createdText = new Date(prompt.createdAt).toLocaleString();
    expect(screen.getByTitle("Created")).toHaveTextContent(createdText);

    for (const patch of [
      { isFavorite: true },
      { isFavorite: false },
      { userPrompt: "Edited content", version: 2 },
      { folderId: "folder-2", tags: ["edited"] },
    ]) {
      rerender(
        <PromptDetailMetadata
          {...props}
          prompt={{ ...prompt, ...patch, updatedAt: "2026-10-17T04:24:28Z" }}
        />,
      );
      expect(screen.getByTitle("Created")).toHaveTextContent(createdText);
      expect(screen.getByTitle("Created")).toHaveAttribute(
        "datetime",
        prompt.createdAt,
      );
    }
  });

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
