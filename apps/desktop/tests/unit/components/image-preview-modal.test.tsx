import { screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { ImagePreviewModal } from "../../../src/renderer/components/ui/ImagePreviewModal";
import { renderWithI18n } from "../../helpers/i18n";

describe("ImagePreviewModal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.style.overflow = "";
  });

  it("renders nothing when closed", async () => {
    await renderWithI18n(
      <ImagePreviewModal
        isOpen={false}
        onClose={vi.fn()}
        imageSrc="/path.png"
      />,
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders nothing when imageSrc is null", async () => {
    await renderWithI18n(
      <ImagePreviewModal isOpen onClose={vi.fn()} imageSrc={null} />,
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("does not lock scroll or attach Escape handler when imageSrc is null", async () => {
    const addListenerSpy = vi.spyOn(window, "addEventListener");
    document.body.style.overflow = "auto";

    await renderWithI18n(
      <ImagePreviewModal isOpen onClose={vi.fn()} imageSrc={null} />,
    );

    expect(document.body.style.overflow).toBe("auto");
    expect(addListenerSpy).not.toHaveBeenCalledWith(
      "keydown",
      expect.any(Function),
    );
  });

  it("renders the image when open with a src", async () => {
    await renderWithI18n(
      <ImagePreviewModal isOpen onClose={vi.fn()} imageSrc="https://example.com/x.png" />,
    );
    const img = screen.getByRole("img");
    expect(img).toBeInTheDocument();
  });

  it("exposes explicit close-button semantics", async () => {
    const onClose = vi.fn();
    await renderWithI18n(
      <ImagePreviewModal isOpen onClose={onClose} imageSrc="https://example.com/x.png" />,
      { language: "en" },
    );

    const closeButton = screen.getByRole("button", { name: "Close" });
    expect(closeButton).toHaveAttribute("type", "button");
    expect(closeButton.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape", async () => {
    const onClose = vi.fn();
    await renderWithI18n(
      <ImagePreviewModal isOpen onClose={onClose} imageSrc="https://example.com/x.png" />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps image clicks open while backdrop clicks close the preview", async () => {
    const onClose = vi.fn();
    await renderWithI18n(
      <ImagePreviewModal isOpen onClose={onClose} imageSrc="https://example.com/x.png" />,
    );

    fireEvent.click(screen.getByRole("img"));

    expect(onClose).not.toHaveBeenCalled();

    const backdrop = screen.getByTestId("image-preview-backdrop");
    expect(backdrop).toHaveAttribute("role", "presentation");
    expect(backdrop).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("restores the previous body overflow when closed", async () => {
    document.body.style.overflow = "scroll";
    const { rerender } = await renderWithI18n(
      <ImagePreviewModal isOpen onClose={vi.fn()} imageSrc="https://example.com/x.png" />,
    );
    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <ImagePreviewModal
        isOpen={false}
        onClose={vi.fn()}
        imageSrc="https://example.com/x.png"
      />,
    );

    expect(document.body.style.overflow).toBe("scroll");
  });

  it("falls back to an error placeholder when the image fails to load", async () => {
    await renderWithI18n(
      <ImagePreviewModal isOpen onClose={vi.fn()} imageSrc="https://example.com/x.png" />,
    );
    const img = screen.getByRole("img");
    fireEvent.error(img);
    // After error, the img is unmounted in favor of the placeholder.
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Image load failed")).toBeInTheDocument();
    expect(document.body.querySelector(".lucide-image")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
