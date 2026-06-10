import { screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { CloseDialog } from "../../../src/renderer/components/ui/CloseDialog";
import { renderWithI18n } from "../../helpers/i18n";

describe("CloseDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.style.overflow = "";
  });

  it("does not render when closed", async () => {
    await renderWithI18n(<CloseDialog isOpen={false} onClose={vi.fn()} />);
    // Dialog content uses i18n keys; assert by querying actions buttons that
    // would be rendered when open.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("does not change body overflow when mounted closed", async () => {
    document.body.style.overflow = "scroll";
    const { unmount } = await renderWithI18n(
      <CloseDialog isOpen={false} onClose={vi.fn()} />,
    );

    expect(document.body.style.overflow).toBe("scroll");
    unmount();
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("restores the previous body overflow when closed", async () => {
    document.body.style.overflow = "scroll";
    const { rerender } = await renderWithI18n(
      <CloseDialog isOpen onClose={vi.fn()} />,
    );
    expect(document.body.style.overflow).toBe("hidden");

    rerender(<CloseDialog isOpen={false} onClose={vi.fn()} />);

    expect(document.body.style.overflow).toBe("scroll");
  });

  it("notifies main process and closes on cancel (X / backdrop / Esc)", async () => {
    const onClose = vi.fn();
    const cancelMock = vi.fn();
    (window.electron as unknown as { sendCloseDialogCancel: typeof cancelMock })
      .sendCloseDialogCancel = cancelMock;

    const { container } = await renderWithI18n(
      <CloseDialog isOpen onClose={onClose} />,
      { language: "en" },
    );
    expect(container.ownerDocument.body.querySelector(".max-w-sm")).toHaveClass(
      "animate-in",
    );
    expect(container.ownerDocument.body.querySelector(".max-w-sm")).toHaveClass(
      "zoom-in-95",
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    cancelMock.mockClear();
    onClose.mockClear();

    // Backdrop click also cancels.
    const backdrop = container.ownerDocument.body.querySelector(
      ".bg-background\\/60",
    );
    expect(backdrop).toBeTruthy();
    expect(backdrop).toHaveAttribute("role", "presentation");
    expect(backdrop).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(backdrop!);
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("exposes alertdialog semantics and moves focus into the dialog", async () => {
    await renderWithI18n(<CloseDialog isOpen onClose={vi.fn()} />, {
      language: "en",
    });

    const dialog = screen.getByRole("alertdialog", {
      name: "Close Application",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription(
      "Would you like to close the app or minimize to system tray?",
    );
    expect(dialog).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement).toBe(dialog);
  });

  it("restores focus to the trigger when closed", async () => {
    const renderDialog = (isOpen: boolean) => (
      <>
        <button type="button">Open close dialog</button>
        <CloseDialog isOpen={isOpen} onClose={vi.fn()} />
      </>
    );
    const { rerender } = await renderWithI18n(renderDialog(false), {
      language: "en",
    });
    const trigger = screen.getByRole("button", { name: "Open close dialog" });
    trigger.focus();

    rerender(renderDialog(true));
    expect(document.activeElement).toBe(
      screen.getByRole("alertdialog", { name: "Close Application" }),
    );

    rerender(renderDialog(false));

    expect(document.activeElement).toBe(trigger);
  });

  it("exposes explicit button semantics for close actions", async () => {
    await renderWithI18n(<CloseDialog isOpen onClose={vi.fn()} />, {
      language: "en",
    });

    [
      screen.getByRole("button", { name: "Close" }),
      screen.getByRole("button", { name: "Minimize to Tray" }),
      screen.getByRole("button", { name: "Exit App" }),
    ].forEach((button) => {
      expect(button).toHaveAttribute("type", "button");
      expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    });
  });

  it("sends 'minimize' / 'exit' results with the rememberChoice flag", async () => {
    const onClose = vi.fn();
    const sendResult = vi.fn();
    (window.electron as unknown as {
      sendCloseDialogResult: typeof sendResult;
    }).sendCloseDialogResult = sendResult;

    await renderWithI18n(<CloseDialog isOpen onClose={onClose} />, {
      language: "en",
    });

    const minimizeButton = screen.getByRole("button", {
      name: "Minimize to Tray",
    });
    const exitButton = screen.getByRole("button", { name: "Exit App" });

    fireEvent.click(minimizeButton);
    expect(sendResult).toHaveBeenCalledWith("minimize", false);
    expect(onClose).toHaveBeenCalledTimes(1);

    sendResult.mockClear();
    onClose.mockClear();

    // Re-render to test exit.
    fireEvent.click(exitButton);
    expect(sendResult).toHaveBeenCalledWith("exit", false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
