import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PromptBatchActionBar,
  type PromptBatchActionBarProps,
} from "../../../src/renderer/components/prompt/PromptBatchActionBar";
import { useFolderStore } from "../../../src/renderer/stores/folder.store";
import { renderWithI18n } from "../../helpers/i18n";

const ids = ["prompt-a", "prompt-b"];
function setupProps() {
  return {
    selectedIds: ids,
    totalCount: 5,
    onSelectAll: vi.fn(),
    onInvertSelection: vi.fn(),
    onClear: vi.fn(),
    onFavorite: vi.fn<(ids: string[], favorite: boolean) => void>(),
    onMove: vi.fn<(ids: string[], folderId: string | undefined) => void>(),
    onDelete: vi.fn<(ids: string[]) => void>(),
    onTag: vi.fn<(ids: string[]) => void>(),
  };
}
async function renderBar(
  props: Omit<PromptBatchActionBarProps, "layout"> = setupProps(),
  layout: "card" | "gallery" | "table" = "gallery",
  language: "en" | "zh" = "en",
) {
  return renderWithI18n(<PromptBatchActionBar {...props} layout={layout} />, {
    language,
  });
}
function openFolders() {
  fireEvent.click(screen.getByRole("button", { name: "Batch Move" }));
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
    });
  });
  it("allows selection controls without enabling empty batch actions", async () => {
    const props = { ...setupProps(), selectedIds: [] };
    await renderBar(props);
    expect(screen.getByRole("toolbar")).toBeVisible();
    for (const name of [
      "Tags",
      "Batch Favorite",
      "Batch Move",
      "Batch Delete",
    ]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeVisible();
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(screen.queryByRole("menu")).toBeNull();
    expect(props.onFavorite).not.toHaveBeenCalled();
    expect(props.onMove).not.toHaveBeenCalled();
    expect(props.onTag).not.toHaveBeenCalled();
    expect(props.onDelete).not.toHaveBeenCalled();
  });
  it("shows the denominator and two lightweight selection controls in gallery", async () => {
    const props = setupProps();
    await renderBar(props);
    expect(screen.getByText("2 of 5 selected")).toBeVisible();
    expect(screen.queryByRole("menuitem")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Select All" }));
    fireEvent.click(screen.getByRole("button", { name: "Invert Selection" }));
    expect(props.onSelectAll).toHaveBeenCalledTimes(1);
    expect(props.onInvertSelection).toHaveBeenCalledTimes(1);
  });
  it("shows every action directly in the narrow card pane", async () => {
    const props = setupProps();
    await renderBar(props, "card");
    expect(
      within(screen.getByRole("toolbar")).getAllByRole("button"),
    ).toHaveLength(6);
    expect(screen.queryByRole("button", { name: "Select All" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "2 of 5 selected" }),
    ).toHaveTextContent("2 selected");
    fireEvent.click(screen.getByRole("button", { name: "2 of 5 selected" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Select All" }));
    expect(props.onSelectAll).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "2 of 5 selected" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Invert Selection" }));
    expect(props.onInvertSelection).toHaveBeenCalledTimes(1);
  });
  it("shows full localized selection commands in the card menu", async () => {
    await renderBar(setupProps(), "card", "zh");
    fireEvent.click(
      screen.getByRole("button", { name: "已选择 2 项 / 共 5 项" }),
    );
    expect(screen.getByRole("menuitem", { name: "全选" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "反选" })).toBeVisible();
  });
  it("runs visible actions with every selected id", async () => {
    const props = setupProps();
    await renderBar(props);
    for (const name of ["Tags", "Batch Favorite", "Batch Delete"]) {
      expect(screen.getByRole("button", { name })).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name }));
      expect(screen.queryByRole("menu")).toBeNull();
    }
    expect(props.onTag).toHaveBeenCalledWith(ids);
    expect(props.onFavorite).toHaveBeenCalledWith(ids, true);
    expect(props.onDelete).toHaveBeenCalledWith(ids);
  });
  it("uses icon-only actions with descriptive hover and accessible labels", async () => {
    await renderBar(setupProps(), "card");
    for (const name of [
      "Batch Favorite",
      "Batch Move",
      "Tags",
      "Batch Delete",
    ]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveAttribute("title", name);
      expect(button.textContent).toBe("");
      expect(button.querySelectorAll("svg")).toHaveLength(1);
    }
  });
  it.each([undefined, "folder-1"])(
    "moves to folder %s without losing the selected ids",
    async (folderId) => {
      const props = setupProps();
      await renderBar(props);
      openFolders();
      fireEvent.click(
        screen.getByRole("menuitem", {
          name: folderId ? "Examples" : "No folder",
        }),
      );
      expect(props.onMove).toHaveBeenCalledWith(ids, folderId);
      expect(screen.queryByRole("menu")).toBeNull();
    },
  );
  it("omits tags when its handler is absent", async () => {
    await renderBar({ ...setupProps(), onTag: undefined });
    expect(screen.queryByRole("button", { name: "Tags" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Batch Favorite" }),
    ).toBeVisible();
  });
  it("closes on Escape and restores focus to the trigger", async () => {
    await renderBar();
    openFolders();
    const first = screen.getByRole("menuitem", { name: "No folder" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Examples" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "Batch Move" })).toHaveFocus();
  });
  it("dismisses menus on outside click and resets folder choices", async () => {
    await renderBar();
    openFolders();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
    openFolders();
    expect(screen.getByRole("menuitem", { name: "Examples" })).toBeVisible();
  });
  it("clears selection through the remaining cancel trigger", async () => {
    const props = setupProps();
    await renderBar(props);
    fireEvent.click(screen.getByRole("button", { name: "Clear Selection" }));
    expect(props.onClear).toHaveBeenCalledTimes(1);
  });
});
