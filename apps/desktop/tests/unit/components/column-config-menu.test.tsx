import { screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import type { ColumnConfig } from "../../../src/renderer/hooks/useTableConfig";
import { ColumnConfigMenu } from "../../../src/renderer/components/prompt/ColumnConfigMenu";
import { renderWithI18n } from "../../helpers/i18n";

function makeColumns(): ColumnConfig[] {
  return [
    { id: "checkbox", label: "Checkbox", visible: true } as ColumnConfig,
    { id: "title", label: "prompt.title", visible: true } as ColumnConfig,
    { id: "tags", label: "prompt.tags", visible: false } as ColumnConfig,
    { id: "actions", label: "Actions", visible: true } as ColumnConfig,
  ];
}

describe("ColumnConfigMenu", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the trigger button closed by default", async () => {
    await renderWithI18n(
      <ColumnConfigMenu
        columns={makeColumns()}
        onToggleVisibility={vi.fn()}
        onReset={vi.fn()}
      />,
      { language: "en" },
    );
    // Trigger button is one button; menu is not in DOM yet.
    const triggerButton = screen.getByRole("button", { name: "Column Settings" });
    expect(triggerButton).toBeInTheDocument();
    expect(triggerButton).toHaveAttribute("type", "button");
    expect(triggerButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Title")).not.toBeInTheDocument();
  });

  it("does not attach outside-click listeners while closed", async () => {
    const addListenerSpy = vi.spyOn(document, "addEventListener");

    await renderWithI18n(
      <ColumnConfigMenu
        columns={makeColumns()}
        onToggleVisibility={vi.fn()}
        onReset={vi.fn()}
      />,
      { language: "en" },
    );

    const mousedownCalls = addListenerSpy.mock.calls.filter(
      ([eventName]) => eventName === "mousedown",
    );
    expect(mousedownCalls).toHaveLength(0);
  });

  it("attaches the outside-click listener only while open", async () => {
    const addListenerSpy = vi.spyOn(document, "addEventListener");
    const removeListenerSpy = vi.spyOn(document, "removeEventListener");

    await renderWithI18n(
      <ColumnConfigMenu
        columns={makeColumns()}
        onToggleVisibility={vi.fn()}
        onReset={vi.fn()}
      />,
      { language: "en" },
    );

    const triggerButton = screen.getByRole("button", { name: "Column Settings" });
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

  it("opens the menu and lists configurable columns (excluding checkbox / actions)", async () => {
    await renderWithI18n(
      <ColumnConfigMenu
        columns={makeColumns()}
        onToggleVisibility={vi.fn()}
        onReset={vi.fn()}
      />,
      { language: "en" },
    );
    fireEvent.click(screen.getByRole("button", { name: "Column Settings" }));
    // 'title' and 'tags' should appear; 'Checkbox' and 'Actions' should not.
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Tags")).toBeInTheDocument();
    expect(screen.getByRole("menu", { name: "Column Settings" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemcheckbox", { name: "Title" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemcheckbox", { name: "Tags" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.queryByText("Checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Actions")).not.toBeInTheDocument();
  });

  it("invokes onToggleVisibility with the column id", async () => {
    const onToggleVisibility = vi.fn();
    await renderWithI18n(
      <ColumnConfigMenu
        columns={makeColumns()}
        onToggleVisibility={onToggleVisibility}
        onReset={vi.fn()}
      />,
      { language: "en" },
    );
    fireEvent.click(screen.getByRole("button", { name: "Column Settings" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Title" }));
    expect(onToggleVisibility).toHaveBeenCalledWith("title");
  });

  it("invokes onReset and closes the menu when reset is clicked", async () => {
    const onReset = vi.fn();
    await renderWithI18n(
      <ColumnConfigMenu
        columns={makeColumns()}
        onToggleVisibility={vi.fn()}
        onReset={onReset}
      />,
      { language: "en" },
    );
    fireEvent.click(screen.getByRole("button", { name: "Column Settings" }));
    // Reset button is the only button with the rotate-ccw icon; we identify
    // by its localized label.
    const resetButton = screen.getByRole("button", { name: "Reset" });
    expect(resetButton).toHaveAttribute("type", "button");
    fireEvent.click(resetButton);
    expect(onReset).toHaveBeenCalledTimes(1);
    // The menu should now be closed; configurable column entries gone.
    expect(screen.queryByText("Title")).not.toBeInTheDocument();
  });
});
