import { screen, fireEvent, act } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { UnsavedChangesDialog } from "../../../src/renderer/components/ui/UnsavedChangesDialog";
import { renderWithI18n } from "../../helpers/i18n";

describe("UnsavedChangesDialog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("does not render when closed", async () => {
    await renderWithI18n(
      <UnsavedChangesDialog
        isOpen={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.queryByText(/未保存的更改|Unsaved/i)).not.toBeInTheDocument();
  });

  it("does not attach global key handlers while closed", async () => {
    const addListenerSpy = vi.spyOn(document, "addEventListener");

    await renderWithI18n(
      <UnsavedChangesDialog
        isOpen={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    expect(addListenerSpy).not.toHaveBeenCalledWith(
      "keydown",
      expect.any(Function),
    );
  });

  it("wires up the three actions independently", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    await renderWithI18n(
      <UnsavedChangesDialog
        isOpen
        onClose={onClose}
        onSave={onSave}
        onDiscard={onDiscard}
      />,
      { language: "en" },
    );
    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    const discardButton = screen.getByRole("button", { name: "Discard" });
    const saveButton = screen.getByRole("button", { name: "Save" });
    const dialog = screen.getByRole("alertdialog", {
      name: "Unsaved Changes",
    });

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription(
      "You have unsaved changes. Do you want to save them?",
    );
    [cancelButton, discardButton, saveButton].forEach((button) => {
      expect(button).toHaveAttribute("type", "button");
    });
    expect(document.body.querySelector(".lucide-circle-alert")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    fireEvent.click(cancelButton);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();

    fireEvent.click(discardButton);
    expect(onDiscard).toHaveBeenCalledTimes(1);

    fireEvent.click(saveButton);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("keeps the pointer backdrop presentational while preserving click close", async () => {
    const onClose = vi.fn();
    await renderWithI18n(
      <UnsavedChangesDialog
        isOpen
        onClose={onClose}
        onSave={vi.fn()}
        onDiscard={vi.fn()}
      />,
      { language: "en" },
    );

    const backdrop = screen.getByTestId("unsaved-changes-backdrop");
    expect(backdrop).toHaveAttribute("role", "presentation");
    expect(backdrop).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape key triggers cancel callback", async () => {
    const onClose = vi.fn();
    await renderWithI18n(
      <UnsavedChangesDialog
        isOpen
        onClose={onClose}
        onSave={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("focuses the save button when the dialog opens", async () => {
    vi.useFakeTimers();
    await renderWithI18n(
      <UnsavedChangesDialog
        isOpen
        onClose={vi.fn()}
        onSave={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(100);
    });
    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(document.activeElement).toBe(saveButton);
  });

  it("restores focus to the trigger when closed", async () => {
    vi.useFakeTimers();
    const renderDialog = (isOpen: boolean) => (
      <>
        <button type="button">Open unsaved dialog</button>
        <UnsavedChangesDialog
          isOpen={isOpen}
          onClose={vi.fn()}
          onSave={vi.fn()}
          onDiscard={vi.fn()}
        />
      </>
    );
    const { rerender } = await renderWithI18n(renderDialog(false), {
      language: "en",
    });
    const trigger = screen.getByRole("button", {
      name: "Open unsaved dialog",
    });
    trigger.focus();

    rerender(renderDialog(true));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Save" }),
    );

    rerender(renderDialog(false));

    expect(document.activeElement).toBe(trigger);
  });

  it("clears the delayed focus timer on unmount", async () => {
    vi.useFakeTimers();
    const { unmount } = await renderWithI18n(
      <UnsavedChangesDialog
        isOpen
        onClose={vi.fn()}
        onSave={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
