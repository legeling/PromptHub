import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PromptListHeader } from "../../../src/renderer/components/prompt/PromptListHeader";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";

function resetStore() {
  // Reset only the slice fields the header reads / writes — calling actions
  // directly rather than poking internals.
  const store = usePromptStore.getState();
  store.setViewMode("card");
  store.setSort("updatedAt", "desc");
  store.setGalleryImageSize("medium");
  store.setKanbanColumns(3);
}

describe("PromptListHeader", () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the prompt count", () => {
    render(<PromptListHeader count={42} />);
    // The count is interpolated through i18n; assert the number appears.
    expect(screen.getByText(/42/)).toBeInTheDocument();
  });

  it("does not attach outside-click listeners while the sort menu is closed", () => {
    const addListenerSpy = vi.spyOn(document, "addEventListener");

    render(<PromptListHeader count={3} />);

    const mousedownCalls = addListenerSpy.mock.calls.filter(
      ([eventName]) => eventName === "mousedown",
    );
    expect(mousedownCalls).toHaveLength(0);
  });

  it("attaches the outside-click listener only while the sort menu is open", () => {
    const addListenerSpy = vi.spyOn(document, "addEventListener");
    const removeListenerSpy = vi.spyOn(document, "removeEventListener");

    render(<PromptListHeader count={3} />);
    const triggerButton = screen.getByRole("button", { name: "Sort: Newest" });
    expect(triggerButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(triggerButton);
    expect(triggerButton).toHaveAttribute("aria-expanded", "true");

    const mousedownCalls = addListenerSpy.mock.calls.filter(
      ([eventName]) => eventName === "mousedown",
    );
    expect(mousedownCalls).toHaveLength(1);

    fireEvent.mouseDown(document.body);

    expect(removeListenerSpy.mock.calls).toContainEqual([
      "mousedown",
      mousedownCalls[0][1],
    ]);
  });

  it("opens the sort menu and selects a different option", () => {
    render(<PromptListHeader count={3} />);
    // The summary button shows the currently-selected sort label.
    const triggerButton = screen.getByRole("button", { name: "Sort: Newest" });
    fireEvent.click(triggerButton);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Newest" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // The "title asc" option should now be visible.
    const titleAscOption = screen.getByRole("menuitemradio", { name: "Title A-Z" });
    fireEvent.click(titleAscOption);

    expect(usePromptStore.getState().sortBy).toBe("title");
    expect(usePromptStore.getState().sortOrder).toBe("asc");
  });

  it("updates sort key and order atomically", () => {
    const setSortSpy = vi.spyOn(usePromptStore.getState(), "setSort");

    render(<PromptListHeader count={3} />);

    fireEvent.click(screen.getByRole("button", { name: "Sort: Newest" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Title Z-A" }));

    expect(setSortSpy).toHaveBeenCalledWith("title", "desc");
    expect(usePromptStore.getState().sortBy).toBe("title");
    expect(usePromptStore.getState().sortOrder).toBe("desc");
  });

  it("offers child-count sorting options", () => {
    render(<PromptListHeader count={3} />);

    fireEvent.click(screen.getByRole("button", { name: "Sort: Newest" }));

    const childCountDescOption = screen.getByRole("menuitemradio", {
      name: "Node Count (High to Low)",
    });
    expect(
      screen.getByRole("menuitemradio", {
        name: "Node Count (Low to High)",
      }),
    ).toBeInTheDocument();

    fireEvent.click(childCountDescOption);

    expect(usePromptStore.getState().sortBy).toBe("childCount");
    expect(usePromptStore.getState().sortOrder).toBe("desc");
  });

  it("switches view mode to gallery and reveals the size picker", () => {
    render(<PromptListHeader count={1} />);
    const cardToggle = screen.getByRole("button", { name: "Card View" });
    const galleryToggle = screen.getByRole("button", { name: "Gallery View" });

    expect(cardToggle).toHaveAttribute("aria-pressed", "true");
    expect(galleryToggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(galleryToggle);

    expect(usePromptStore.getState().viewMode).toBe("gallery");
    expect(galleryToggle).toHaveAttribute("aria-pressed", "true");

    // S / M / L size buttons appear when in gallery mode.
    expect(screen.getByRole("button", { name: "Small thumbnails" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Medium thumbnails" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Large thumbnails" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("switches view mode to kanban and reveals the column picker", () => {
    render(<PromptListHeader count={1} />);
    const kanbanToggle = screen.getByRole("button", { name: "Kanban View" });

    expect(kanbanToggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(kanbanToggle);

    expect(usePromptStore.getState().viewMode).toBe("kanban");
    expect(kanbanToggle).toHaveAttribute("aria-pressed", "true");

    expect(screen.getByRole("button", { name: "2 Columns" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "3 Columns" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "4 Columns" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
