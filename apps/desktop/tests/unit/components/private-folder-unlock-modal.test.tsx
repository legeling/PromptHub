import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PrivateFolderUnlockModal } from "../../../src/renderer/components/folder/PrivateFolderUnlockModal";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
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

describe("PrivateFolderUnlockModal", () => {
  beforeEach(() => {
    installWindowMocks();
  });

  it("keeps unlock actions non-submit with a named close control and decorative icons hidden", async () => {
    const onClose = vi.fn();
    const handleSubmit = vi.fn();

    await act(async () => {
      await renderWithI18n(
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <PrivateFolderUnlockModal
            isOpen={true}
            folderName="Secrets"
            onClose={onClose}
            onSuccess={vi.fn()}
          />
        </form>,
        { language: "en" },
      );
    });

    const closeButton = screen.getByRole("button", { name: "Close" });
    const buttons = Array.from(document.body.querySelectorAll("button"));
    const implicitButtonMarkup = buttons
      .filter((button) => button.getAttribute("type") !== "button")
      .map((button) => button.outerHTML);
    const exposedIconMarkup = buttons
      .flatMap((button) => Array.from(button.querySelectorAll("svg")))
      .filter((icon) => !hasHiddenSvgAncestor(icon))
      .map((icon) => icon.outerHTML);

    expect(closeButton).toHaveAttribute("type", "button");
    expect(implicitButtonMarkup, implicitButtonMarkup.join("\n")).toHaveLength(
      0,
    );
    expect(exposedIconMarkup, exposedIconMarkup.join("\n")).toHaveLength(0);

    fireEvent.click(closeButton);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("keeps the pointer backdrop presentational while preserving click close", async () => {
    const onClose = vi.fn();

    await act(async () => {
      await renderWithI18n(
        <PrivateFolderUnlockModal
          isOpen={true}
          folderName="Secrets"
          onClose={onClose}
          onSuccess={vi.fn()}
        />,
        { language: "en" },
      );
    });

    const backdrop = screen.getByTestId("private-folder-unlock-backdrop");
    expect(backdrop).toHaveAttribute("role", "presentation");
    expect(backdrop).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
