import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Prompt } from "@prompthub/shared/types";

import { PromptListView } from "../../../src/renderer/components/prompt/PromptListView";
import { renderWithI18n } from "../../helpers/i18n";

const prompt: Prompt = {
  id: "prompt-list-1",
  title: "List prompt",
  description: "A prompt shown in the list view",
  promptType: "text",
  systemPrompt: "You are concise.",
  userPrompt: "Summarize {{topic}}",
  variables: [],
  tags: ["list"],
  folderId: null,
  isFavorite: false,
  isPinned: false,
  version: 1,
  currentVersion: 1,
  usageCount: 2,
  createdAt: "2026-05-29T00:00:00.000Z",
  updatedAt: "2026-05-29T00:00:00.000Z",
};

function renderListView({
  selectedId = null,
  prompts = [prompt],
  onSelect = vi.fn<(id: string) => void>(),
  onCopy = vi.fn<(copiedPrompt: Prompt) => void>(),
  onToggleFavorite = vi.fn<(id: string) => void>(),
}: {
  selectedId?: string | null;
  prompts?: Prompt[];
  onSelect?: (id: string) => void;
  onCopy?: (copiedPrompt: Prompt) => void;
  onToggleFavorite?: (id: string) => void;
} = {}) {
  return renderWithI18n(
    <PromptListView
      prompts={prompts}
      selectedId={selectedId}
      onSelect={onSelect}
      onToggleFavorite={onToggleFavorite}
      onCopy={onCopy}
      onContextMenu={vi.fn()}
    />,
    { language: "en" },
  );
}

describe("PromptListView", () => {
  it("lets keyboard users select rows with Enter and Space", async () => {
    const onSelect = vi.fn<(id: string) => void>();
    await renderListView({ onSelect });

    const row = screen.getByRole("button", { name: "List prompt" });
    expect(row).toHaveAttribute("aria-pressed", "false");

    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: " " });

    expect(onSelect).toHaveBeenNthCalledWith(1, prompt.id);
    expect(onSelect).toHaveBeenNthCalledWith(2, prompt.id);
  });

  it("exposes action names on icon buttons without selecting the row", async () => {
    const onSelect = vi.fn<(id: string) => void>();
    const onCopy = vi.fn<(copiedPrompt: Prompt) => void>();
    const onToggleFavorite = vi.fn<(id: string) => void>();
    await renderListView({ onSelect, onCopy, onToggleFavorite });

    const copyButton = screen.getByRole("button", { name: "Copy Prompt" });
    const favoriteButton = screen.getByRole("button", { name: "Add to Favorites" });

    expect(copyButton).toHaveAttribute("type", "button");
    expect(favoriteButton).toHaveAttribute("type", "button");

    fireEvent.click(copyButton);
    fireEvent.click(favoriteButton);

    expect(onCopy).toHaveBeenCalledWith(prompt);
    expect(onToggleFavorite).toHaveBeenCalledWith(prompt.id);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("uses an action name when a prompt can be removed from favorites", async () => {
    await renderListView({
      prompts: [{ ...prompt, isFavorite: true }],
      selectedId: prompt.id,
    });

    const row = screen.getByRole("button", { name: "List prompt" });
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Remove from Favorites" })).toBeInTheDocument();
  });
});
