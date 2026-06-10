import { screen, fireEvent, act } from "@testing-library/react";
import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { Modal } from "../../../src/renderer/components/ui/Modal";
import { renderWithI18n } from "../../helpers/i18n";

/**
 * Modal is the foundation for nearly every modal surface in the app. The
 * failure modes that have shipped before are:
 *  - ESC closing modals that should not close (regression risk for unsaved-data dialogs)
 *  - Closing-from-backdrop firing twice
 *  - Body overflow style not being restored after close
 *  - Component never unmounting children when isOpen flips to false
 */
describe("Modal", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("does not render content when isOpen is false on first paint", async () => {
    await renderWithI18n(
      <Modal isOpen={false} onClose={vi.fn()} title="Hidden">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.queryByText("Body")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });

  it("renders title, subtitle, and children when open", async () => {
    await renderWithI18n(
      <Modal isOpen onClose={vi.fn()} title="Edit prompt" subtitle="Update fields">
        <p>Modal body</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog", { name: "Edit prompt" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("Update fields");
    expect(screen.getByRole("heading", { name: "Edit prompt" })).toBeInTheDocument();
    expect(screen.getByText("Update fields")).toBeInTheDocument();
    expect(screen.getByText("Modal body")).toBeInTheDocument();
  });

  it("provides a generic accessible name when no title is rendered", async () => {
    await renderWithI18n(
      <Modal isOpen onClose={vi.fn()} subtitle="Hidden description">
        <p>Untitled body</p>
      </Modal>,
    );

    const dialog = screen.getByRole("dialog", { name: "Dialog" });
    expect(dialog).toBeInTheDocument();
    expect(dialog).not.toHaveAttribute("aria-describedby");
  });

  it("moves focus into the dialog on open and restores the trigger on close", async () => {
    const onClose = vi.fn();
    const renderModal = (isOpen: boolean) => (
      <>
        <button type="button">Open modal</button>
        <Modal isOpen={isOpen} onClose={onClose} title="Focus modal">
          <button type="button">Inside action</button>
        </Modal>
      </>
    );
    const { rerender } = await renderWithI18n(renderModal(false));
    const trigger = screen.getByRole("button", { name: "Open modal" });
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    rerender(renderModal(true));

    const dialog = screen.getByRole("dialog", { name: "Focus modal" });
    expect(dialog).toHaveAttribute("tabindex", "-1");
    expect(dialog).toHaveClass("focus:outline-none");
    expect(document.activeElement).toBe(dialog);

    rerender(renderModal(false));

    expect(document.activeElement).toBe(trigger);
  });

  it("does not steal focus from an auto-focused child control", async () => {
    await renderWithI18n(
      <Modal isOpen onClose={vi.fn()} title="Edit field">
        <input aria-label="Name" autoFocus />
      </Modal>,
    );

    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Name" }));
  });

  it("cancels pending nested entrance animation frames on unmount", async () => {
    const rafCallbacks = new Map<number, FrameRequestCallback>();
    let nextFrameId = 1;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      rafCallbacks.set(frameId, callback);
      return frameId;
    });
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation((frameId) => {
        rafCallbacks.delete(frameId);
      });
    const { unmount } = await renderWithI18n(
      <Modal isOpen onClose={vi.fn()} title="Edit prompt">
        <p>Modal body</p>
      </Modal>,
    );

    act(() => {
      const firstFrame = rafCallbacks.get(1);
      expect(firstFrame).toBeDefined();
      rafCallbacks.delete(1);
      firstFrame?.(0);
    });
    expect(rafCallbacks.has(2)).toBe(true);

    unmount();

    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(2);
    expect(rafCallbacks.has(2)).toBe(false);
  });

  it("calls onClose when ESC is pressed", async () => {
    const onClose = vi.fn();
    await renderWithI18n(
      <Modal isOpen onClose={onClose} title="t">
        <p>x</p>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose on ESC when closeOnEscape is false", async () => {
    const onClose = vi.fn();
    await renderWithI18n(
      <Modal isOpen onClose={onClose} title="t" closeOnEscape={false}>
        <p>x</p>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("locks body scroll while open and restores it after close", async () => {
    vi.useFakeTimers();
    const { rerender } = await renderWithI18n(
      <Modal isOpen onClose={vi.fn()} title="t">
        <p>x</p>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <Modal isOpen={false} onClose={vi.fn()} title="t">
        <p>x</p>
      </Modal>,
    );

    // Modal cleanup happens after a 200ms unmount delay; advance through it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(220);
    });
    expect(document.body.style.overflow).toBe("");
  });

  it("restores the previous body overflow value after close", async () => {
    vi.useFakeTimers();
    document.body.style.overflow = "auto";
    const { rerender } = await renderWithI18n(
      <Modal isOpen onClose={vi.fn()} title="t">
        <p>x</p>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <Modal isOpen={false} onClose={vi.fn()} title="t">
        <p>x</p>
      </Modal>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(220);
    });
    expect(document.body.style.overflow).toBe("auto");
  });

  it("calls onClose when backdrop is clicked by default", async () => {
    const onClose = vi.fn();
    const { container } = await renderWithI18n(
      <Modal isOpen onClose={onClose} title="t">
        <p>x</p>
      </Modal>,
    );
    // The backdrop is the first absolute-inset div inside the portal.
    const backdrop = container.ownerDocument.body.querySelector(
      ".bg-background\\/60",
    );
    expect(backdrop).toBeTruthy();
    expect(backdrop).toHaveAttribute("role", "presentation");
    expect(backdrop).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on backdrop click when closeOnBackdrop is false", async () => {
    const onClose = vi.fn();
    const { container } = await renderWithI18n(
      <Modal isOpen onClose={onClose} title="t" closeOnBackdrop={false}>
        <p>x</p>
      </Modal>,
    );
    const backdrop = container.ownerDocument.body.querySelector(
      ".bg-background\\/60",
    );
    expect(backdrop).toHaveAttribute("role", "presentation");
    expect(backdrop).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(backdrop!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("hides the X close button when showCloseButton is false", async () => {
    await renderWithI18n(
      <Modal isOpen onClose={vi.fn()} title="t" showCloseButton={false}>
        <p>x</p>
      </Modal>,
    );
    // The X close button is the only icon-only button in the header. With
    // showCloseButton off, there should be no buttons in the header at all
    // unless the test passes headerActions.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders headerActions next to the close button", async () => {
    await renderWithI18n(
      <Modal
        isOpen
        onClose={vi.fn()}
        title="t"
        headerActions={<button type="button">Save</button>}
      >
        <p>x</p>
      </Modal>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("names the icon-only close button for assistive technology", async () => {
    const onClose = vi.fn();
    await renderWithI18n(
      <Modal isOpen onClose={onClose} title="t">
        <p>x</p>
      </Modal>,
    );

    const closeButton = screen.getByRole("button", { name: "Close" });
    expect(closeButton).toHaveAttribute("type", "button");
    expect(closeButton.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
