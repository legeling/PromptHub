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

  it("lets keyboard users open a gallery card with Enter and Space", async () => {
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

    const card = screen.getByRole("button", { name: basePrompt.title });

    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });

    expect(onViewDetail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: "prompt-1" }),
    );
    expect(onViewDetail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: "prompt-1" }),
    );
  });

  it("exposes favorite action labels without opening detail from the button", async () => {
    usePromptStore.setState({ galleryImageSize: "medium" });
    const onToggleFavorite = vi.fn();
    const onViewDetail = vi.fn();

    await act(async () => {
      await renderWithI18n(
        <PromptGalleryView
          prompts={[basePrompt]}
          onSelect={vi.fn()}
          onToggleFavorite={onToggleFavorite}
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

    const favoriteButton = screen.getByRole("button", { name: "Add to Favorites" });

    fireEvent.click(favoriteButton);

    expect(favoriteButton).toHaveAttribute("aria-label", "Add to Favorites");
    expect(onToggleFavorite).toHaveBeenCalledWith("prompt-1");
    expect(onViewDetail).not.toHaveBeenCalled();
  });

  it("uses an action label for removing gallery favorites", async () => {
    usePromptStore.setState({ galleryImageSize: "medium" });

    await act(async () => {
      await renderWithI18n(
        <PromptGalleryView
          prompts={[{ ...basePrompt, isFavorite: true }]}
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

    expect(screen.getByRole("button", { name: "Remove from Favorites" })).toHaveAttribute(
      "aria-label",
      "Remove from Favorites",
    );
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

  it("applies vertical spacing between virtualized gallery rows", async () => {
    usePromptStore.setState({ galleryImageSize: "medium" });

    const prompts = Array.from({ length: 8 }, (_, index) => ({
      ...basePrompt,
      id: `prompt-gap-${index + 1}`,
      title: `Gap Prompt ${index + 1}`,
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

    const firstRow = screen.getByRole("heading", { name: "Gap Prompt 1", level: 3 })
      .closest("[data-index]") as HTMLElement | null;

    expect(firstRow).not.toBeNull();
    expect(firstRow?.style.paddingBottom).toBe("16px");
    expect(firstRow?.style.boxSizing).toBe("border-box");
  });

  it("supports checkbox multi-select and shows the shared batch actions bar (v0.6.2)", async () => {
    usePromptStore.setState({ galleryImageSize: "medium" });

    const prompts = [
      { ...basePrompt, id: "gb-1", title: "Batch Alpha" },
      { ...basePrompt, id: "gb-2", title: "Batch Beta" },
    ];
    const onBatchTags = vi.fn<(ids: string[]) => void>();
    const onBatchFavorite = vi.fn<(ids: string[], favorite: boolean) => void>();

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
          onBatchTags={onBatchTags}
          onBatchFavorite={onBatchFavorite}
        />,
        { language: "en" },
      );
    });

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Batch Alpha" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Batch Beta" }));
    expect(screen.getByText("2 of 2 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Tags/ }));
    expect(onBatchTags).toHaveBeenCalledWith(["gb-1", "gb-2"]);

    fireEvent.click(screen.getByRole("button", { name: "Batch Favorite" }));
    expect(onBatchFavorite).toHaveBeenCalledWith(["gb-1", "gb-2"], true);
    expect(screen.queryByText("2 of 2 selected")).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Select Batch Alpha" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("hides batch UI entirely when no batch handlers are provided", async () => {
    usePromptStore.setState({ galleryImageSize: "medium" });

    await act(async () => {
      await renderWithI18n(
        <PromptGalleryView
          prompts={[{ ...basePrompt, id: "gb-plain", title: "Plain Prompt" }]}
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

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
