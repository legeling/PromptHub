import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SortableTreeItem } from "../../../src/renderer/components/layout/tree/SortableTreeItem";
import type { Folder } from "@prompthub/shared/types";
import { renderWithI18n } from "../../helpers/i18n";

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

function hasHiddenSvgAncestor(element: Element): boolean {
  let current: Element | null = element;

  while (current) {
    if (current.getAttribute("aria-hidden") === "true") {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

function createFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: "folder-1",
    name: "Research",
    icon: "folder",
    parentId: undefined,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as Folder;
}

describe("SortableTreeItem", () => {
  it("exposes the folder content as a keyboard-activatable selection button", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onToggleExpand = vi.fn();
    const onEdit = vi.fn();

    await renderWithI18n(
      <ul>
        <SortableTreeItem
          id="folder-1"
          folder={createFolder()}
          depth={0}
          indentationWidth={16}
          hasChildren={true}
          isExpanded={false}
          isLocked={true}
          promptCount={2}
          onSelect={onSelect}
          onToggleExpand={onToggleExpand}
          onEdit={onEdit}
        />
      </ul>,
      { language: "en" },
    );

    const folderButton = screen.getByRole("button", { name: "Research" });

    expect(folderButton).toHaveAttribute("type", "button");

    folderButton.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(onSelect).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: "Expand" }));
    await user.click(screen.getByRole("button", { name: "Edit Folder" }));

    expect(onToggleExpand).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("keeps tree item actions non-submit with named decorative icons", async () => {
    const handleSubmit = vi.fn();
    const onToggleExpand = vi.fn();
    const onEdit = vi.fn();

    await renderWithI18n(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <ul>
          <SortableTreeItem
            id="folder-1"
            folder={createFolder()}
            depth={0}
            indentationWidth={16}
            hasChildren={true}
            isExpanded={true}
            isLocked={true}
            promptCount={2}
            onToggleExpand={onToggleExpand}
            onEdit={onEdit}
          />
        </ul>
      </form>,
      { language: "en" },
    );

    const buttons = Array.from(document.body.querySelectorAll("button"));
    const implicitButtonMarkup = buttons
      .filter((button) => button.getAttribute("type") !== "button")
      .map((button) => button.outerHTML);
    const exposedIconMarkup = buttons
      .flatMap((button) => Array.from(button.querySelectorAll("svg")))
      .filter((icon) => !hasHiddenSvgAncestor(icon))
      .map((icon) => icon.outerHTML);

    expect(implicitButtonMarkup, implicitButtonMarkup.join("\n")).toHaveLength(
      0,
    );
    expect(exposedIconMarkup, exposedIconMarkup.join("\n")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Folder" }));

    expect(onToggleExpand).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(handleSubmit).not.toHaveBeenCalled();
  });
});
