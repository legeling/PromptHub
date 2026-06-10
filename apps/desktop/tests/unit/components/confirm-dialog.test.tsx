import { render, screen, fireEvent, act } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { ConfirmDialog } from "../../../src/renderer/components/ui/ConfirmDialog";

describe("ConfirmDialog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("does not render when closed", () => {
    render(
      <ConfirmDialog
        isOpen={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        message="Delete?"
      />,
    );
    expect(screen.queryByText("Delete?")).not.toBeInTheDocument();
  });

  it("does not attach global key handlers while closed", () => {
    const addListenerSpy = vi.spyOn(document, "addEventListener");

    render(
      <ConfirmDialog
        isOpen={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        message="Delete?"
      />,
    );

    expect(addListenerSpy).not.toHaveBeenCalledWith(
      "keydown",
      expect.any(Function),
    );
  });

  it("renders message, title, and custom button labels", () => {
    render(
      <ConfirmDialog
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Heads up"
        message="Delete this prompt?"
        confirmText="Delete"
        cancelText="Keep"
      />,
    );
    const dialog = screen.getByRole("alertdialog", { name: "Heads up" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("Delete this prompt?");
    expect(screen.getByText("Heads up")).toBeInTheDocument();
    expect(screen.getByText("Delete this prompt?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toHaveAttribute(
      "type",
      "button",
    );
    expect(screen.getByRole("button", { name: "Keep" })).toHaveAttribute(
      "type",
      "button",
    );
  });

  it("uses the confirm action as the accessible name when no title is provided", () => {
    render(
      <ConfirmDialog
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        message="Remove this source?"
        confirmText="Remove"
      />,
    );

    expect(
      screen.getByRole("alertdialog", { name: "Remove" }),
    ).toHaveAccessibleDescription("Remove this source?");
  });

  it("fires onClose when cancel is clicked, onConfirm when confirm is clicked", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        message="Are you sure?"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("keeps the pointer backdrop presentational while preserving click close", () => {
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        onClose={onClose}
        onConfirm={vi.fn()}
        message="Are you sure?"
      />,
    );

    const backdrop = screen.getByTestId("confirm-dialog-backdrop");
    expect(backdrop).toHaveAttribute("role", "presentation");
    expect(backdrop).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Enter triggers confirm, Escape triggers cancel", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        message="Confirm?"
      />,
    );
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("focuses cancel button on open to prevent accidental confirm", () => {
    vi.useFakeTimers();
    render(
      <ConfirmDialog
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        message="Delete forever?"
      />,
    );
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Cancel" }),
    );
  });

  it("restores focus to the trigger when closed", () => {
    vi.useFakeTimers();
    const renderDialog = (isOpen: boolean) => (
      <>
        <button type="button">Open confirm</button>
        <ConfirmDialog
          isOpen={isOpen}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          message="Delete forever?"
        />
      </>
    );
    const { rerender } = render(renderDialog(false));
    const trigger = screen.getByRole("button", { name: "Open confirm" });
    trigger.focus();

    rerender(renderDialog(true));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Cancel" }),
    );

    rerender(renderDialog(false));

    expect(document.activeElement).toBe(trigger);
  });

  it("clears the delayed focus timer on unmount", () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <ConfirmDialog
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        message="Delete forever?"
      />,
    );
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("disables both buttons while loading and ignores their clicks", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        message="Working"
        isLoading
      />,
    );
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(cancel).toBeDisabled();
    expect(confirm).toBeDisabled();
    expect(confirm.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(cancel);
    fireEvent.click(confirm);
    expect(onClose).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("ignores Enter and Escape while loading", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        message="Working"
        isLoading
      />,
    );

    fireEvent.keyDown(document, { key: "Enter" });
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("uses red styling for destructive variant", () => {
    render(
      <ConfirmDialog
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        message="Delete"
        variant="destructive"
      />,
    );
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm.className).toContain("bg-red-600");
    expect(document.body.querySelector(".lucide-triangle-alert")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
