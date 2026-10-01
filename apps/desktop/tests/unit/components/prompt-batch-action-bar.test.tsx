import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PromptBatchActionBar } from "../../../src/renderer/components/prompt/PromptBatchActionBar";
import { useFolderStore } from "../../../src/renderer/stores/folder.store";
import { renderWithI18n } from "../../helpers/i18n";

const ids = ["prompt-a", "prompt-b"];

function setupProps() {
  return {
    selectedIds: ids,
    totalCount: 5,
    onClear: vi.fn(),
    onFavorite: vi.fn<(batchIds: string[], favorite: boolean) => void>(),
    onMove: vi.fn<(batchIds: string[], folderId: string | undefined) => void>(),
    onDelete: vi.fn<(batchIds: string[]) => void>(),
    onTag: vi.fn<(batchIds: string[]) => void>(),
  };
}

async function renderBar(
  props: ReturnType<typeof setupProps>,
  language: "en" | "zh" = "en",
) {
  return renderWithI18n(<PromptBatchActionBar {...props} />, { language });
}

describe("PromptBatchActionBar", () => {
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

  it("renders nothing when there is no selection", async () => {
    const props = setupProps();
    await renderBar({ ...props, selectedIds: [] });
    expect(
      screen.queryByRole("button", { name: "Batch Favorite" }),
    ).not.toBeInTheDocument();
  });

  it("shows the selection denominator instead of a hardcoded Chinese fallback", async () => {
    const props = setupProps();
    await renderBar(props);
    expect(
      screen.getByText("2 of 5 selected"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/已选择/)).not.toBeInTheDocument();

    const zh = await renderBar(props, "zh");
    expect(zh.getByText("已选择 2 项 / 共 5 项")).toBeInTheDocument();
  });

  it("passes every selected id to each batch action", async () => {
    const props = setupProps();
    await renderBar(props);

    fireEvent.click(screen.getByRole("button", { name: /Tags/ }));
    expect(props.onTag).toHaveBeenCalledWith(ids);

    fireEvent.click(
      screen.getByRole("button", { name: "Batch Favorite" }),
    );
    expect(props.onFavorite).toHaveBeenCalledWith(ids, true);

    fireEvent.click(screen.getByRole("button", { name: "Batch Delete" }));
    expect(props.onDelete).toHaveBeenCalledWith(ids);
  });

  it("routes a move to the root (no folder) through the folder menu", async () => {
    const props = setupProps();
    await renderBar(props);

    fireEvent.click(screen.getByRole("button", { name: "Batch Move" }));
    fireEvent.click(screen.getByRole("button", { name: "No folder" }));
    expect(props.onMove).toHaveBeenCalledWith(ids, undefined);
    expect(
      screen.queryByRole("button", { name: /Examples/ }),
    ).not.toBeInTheDocument();
  });

  it("routes a move to a concrete folder through the folder menu", async () => {
    const props = setupProps();
    await renderBar(props);

    fireEvent.click(screen.getByRole("button", { name: "Batch Move" }));
    fireEvent.click(screen.getByRole("button", { name: /Examples/ }));
    expect(props.onMove).toHaveBeenCalledWith(ids, "folder-1");
  });

  it("hides the tag entry when no handler is provided", async () => {
    const props = setupProps();
    await renderBar({ ...props, onTag: undefined });
    expect(
      screen.queryByRole("button", { name: /Tags/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Batch Favorite" }),
    ).toBeInTheDocument();
  });

  it("clears selection through the cancel button", async () => {
    const props = setupProps();
    await renderBar(props);
    fireEvent.click(screen.getByRole("button", { name: "Clear Selection" }));
    expect(props.onClear).toHaveBeenCalledTimes(1);
  });
});
