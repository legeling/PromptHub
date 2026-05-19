import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Prompt } from "@prompthub/shared/types";

import { PromptGalleryView } from "../../../src/renderer/components/prompt/PromptGalleryView";
import { useFolderStore } from "../../../src/renderer/stores/folder.store";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { renderWithI18n } from "../../helpers/i18n";

const basePrompt: Prompt = {
  id: "prompt-1",
  title:
    "An extremely long prompt title that should stay readable in small and medium gallery modes without being clamped to two lines",
  description: "Prompt description",
  promptType: "text",
  systemPrompt: "System",
  userPrompt: "User prompt",
  variables: [],
  tags: ["demo"],
  isFavorite: false,
  isPinned: false,
  version: 1,
  currentVersion: 1,
  usageCount: 0,
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
};

describe("PromptGalleryView", () => {
  beforeEach(() => {
    useFolderStore.setState({
      folders: [
        {
          id: "folder-1",
          name: "Examples",
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
          order: 0,
          icon: "folder",
        },
      ],
      selectedFolderId: null,
      expandedIds: new Set<string>(),
      unlockedFolderIds: new Set<string>(),
    } as Partial<ReturnType<typeof useFolderStore.getState>>);
  });

  it("lets small gallery titles wrap instead of forcing a two-line clamp", async () => {
    usePromptStore.setState({ galleryImageSize: "small" });

    await act(async () => {
      await renderWithI18n(
        <PromptGalleryView
          prompts={[basePrompt]}
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
    });

    const title = screen.getByRole("heading", {
      name: basePrompt.title,
      level: 3,
    });

    expect(title.className).toContain("whitespace-pre-wrap");
    expect(title.className).not.toContain("line-clamp-2");
  });

  it("keeps large gallery titles clamped for the denser card layout", async () => {
    usePromptStore.setState({ galleryImageSize: "large" });

    await act(async () => {
      await renderWithI18n(
        <PromptGalleryView
          prompts={[basePrompt]}
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
    });

    const title = screen.getByRole("heading", {
      name: basePrompt.title,
      level: 3,
    });

    expect(title.className).toContain("line-clamp-2");
  });

  it("opens the detail view when a card is clicked", async () => {
    usePromptStore.setState({ galleryImageSize: "medium" });
    const onViewDetail = vi.fn();

    await act(async () => {
      await renderWithI18n(
        <PromptGalleryView
          prompts={[basePrompt]}
          onSelect={vi.fn()}
          onToggleFavorite={vi.fn()}
          onCopy={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onAiTest={vi.fn()}
          onVersionHistory={vi.fn()}
          onViewDetail={onViewDetail}
          onContextMenu={vi.fn()}
        />,
        { language: "en" },
      );
    });

    fireEvent.click(screen.getByRole("heading", { name: basePrompt.title, level: 3 }));

    expect(onViewDetail).toHaveBeenCalledWith(expect.objectContaining({ id: "prompt-1" }));
  });

  it("preserves top and bottom gutters for the virtualized gallery scroller", async () => {
    usePromptStore.setState({ galleryImageSize: "medium" });

    const prompts = Array.from({ length: 3 }, (_, index) => ({
      ...basePrompt,
      id: `prompt-${index + 1}`,
      title: `Prompt ${index + 1}`,
    }));

    await act(async () => {
      await renderWithI18n(
        <PromptGalleryView
          prompts={prompts}
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
    });

    const firstCard = screen.getByRole("heading", { name: "Prompt 1", level: 3 })
      .closest("div[class*='app-wallpaper-panel']");
    const spacer = firstCard
      ?.closest("[data-index]")
      ?.parentElement as HTMLElement | null;

    expect(spacer).not.toBeNull();
    expect(spacer?.style.paddingTop).toBe("20px");
    expect(spacer?.style.paddingBottom).toBe("96px");
    expect(spacer?.style.boxSizing).toBe("border-box");
  });
});
