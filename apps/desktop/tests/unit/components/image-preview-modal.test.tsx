import { screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { ImagePreviewModal } from "../../../src/renderer/components/ui/ImagePreviewModal";
import { PromptWorkspaceSupplementDialogs } from "../../../src/renderer/components/layout/PromptWorkspaceSupplementDialogs";
import type { PromptWorkspaceDialogsProps } from "../../../src/renderer/components/layout/prompt-workspace-dialog-types";
import { renderWithI18n } from "../../helpers/i18n";

describe("ImagePreviewModal", () => {
  it('traps keyboard focus and restores the trigger when closed', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const { unmount } = await renderWithI18n(
      <ImagePreviewModal isOpen onClose={vi.fn()} imageSrc="/path.png" />,
      { language: 'en' },
    );
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(close).toHaveFocus();
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
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
      <ImagePreviewModal
        isOpen
        onClose={vi.fn()}
        imageSrc="https://example.com/x.png"
      />,
    );
    const img = screen.getByRole("img");
    expect(img).toBeInTheDocument();
  });

  it("navigates a multi-image preview from the clicked image without wrapping", async () => {
    await renderWithI18n(
      <ImagePreviewModal
        isOpen
        onClose={vi.fn()}
        imageSrc="second.png"
        imageSources={["first.png", "second.png", "third.png"]}
      />,
      { language: "en" },
    );

    const previous = screen.getByRole("button", { name: "Previous image" });
    const next = screen.getByRole("button", { name: "Next image" });
    expect(screen.getByText("Image 2 of 3")).toBeInTheDocument();
    expect(previous).toBeEnabled();
    expect(next).toBeEnabled();

    fireEvent.click(previous);
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "local-image://first.png",
    );
    expect(screen.getByText("Image 1 of 3")).toBeInTheDocument();
    expect(previous).toBeDisabled();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "local-image://third.png",
    );
    expect(screen.getByText("Image 3 of 3")).toBeInTheDocument();
    expect(next).toBeDisabled();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "local-image://third.png",
    );

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "local-image://second.png",
    );
  });

  it("keeps single and out-of-gallery images free of gallery controls", async () => {
    const { rerender } = await renderWithI18n(
      <ImagePreviewModal
        isOpen
        onClose={vi.fn()}
        imageSrc="only.png"
        imageSources={["only.png"]}
      />,
      { language: "en" },
    );

    expect(
      screen.queryByRole("button", { name: "Previous image" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Image 1 of/)).not.toBeInTheDocument();

    rerender(
      <ImagePreviewModal
        isOpen
        onClose={vi.fn()}
        imageSrc="temporary-output.png"
        imageSources={["first.png", "second.png"]}
      />,
    );

    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "local-image://temporary-output.png",
    );
    expect(
      screen.queryByRole("button", { name: "Next image" }),
    ).not.toBeInTheDocument();
  });

  it("recovers from one failed image when navigating to the next image", async () => {
    await renderWithI18n(
      <ImagePreviewModal
        isOpen
        onClose={vi.fn()}
        imageSrc="first.png"
        imageSources={["first.png", "second.png"]}
      />,
      { language: "en" },
    );

    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByText("Image load failed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "local-image://second.png",
    );
  });

  it("passes the selected Prompt image order through the workspace dialog layer", async () => {
    const props = {
      previewImage: "second.png",
      setPreviewImage: vi.fn(),
      selectedPrompt: {
        id: "prompt-1",
        images: ["first.png", "second.png", "third.png"],
      },
      versionHistoryPrompt: null,
      isVersionModalOpen: false,
      setIsVersionModalOpen: vi.fn(),
      setVersionHistoryPrompt: vi.fn(),
      deleteConfirm: { isOpen: false, prompt: null },
      setDeleteConfirm: vi.fn(),
      confirmDelete: vi.fn(),
      contextMenu: null,
    } as unknown as PromptWorkspaceDialogsProps;

    await renderWithI18n(<PromptWorkspaceSupplementDialogs {...props} />, {
      language: "en",
    });

    expect(screen.getByText("Image 2 of 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "local-image://third.png",
    );
  });

  it("exposes explicit close-button semantics", async () => {
    const onClose = vi.fn();
    await renderWithI18n(
      <ImagePreviewModal
        isOpen
        onClose={onClose}
        imageSrc="https://example.com/x.png"
      />,
      { language: "en" },
    );

    const closeButton = screen.getByRole("button", { name: "Close" });
    expect(closeButton).toHaveAttribute("type", "button");
    expect(closeButton.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape", async () => {
    const onClose = vi.fn();
    await renderWithI18n(
      <ImagePreviewModal
        isOpen
        onClose={onClose}
        imageSrc="https://example.com/x.png"
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps image clicks open while backdrop clicks close the preview", async () => {
    const onClose = vi.fn();
    await renderWithI18n(
      <ImagePreviewModal
        isOpen
        onClose={onClose}
        imageSrc="https://example.com/x.png"
      />,
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
      <ImagePreviewModal
        isOpen
        onClose={vi.fn()}
        imageSrc="first.png"
        imageSources={["first.png", "second.png"]}
      />,
      { language: "en" },
    );
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));

    rerender(
      <ImagePreviewModal
        isOpen={false}
        onClose={vi.fn()}
        imageSrc="first.png"
        imageSources={["first.png", "second.png"]}
      />,
    );

    expect(document.body.style.overflow).toBe("scroll");
  });

  it("falls back to an error placeholder when the image fails to load", async () => {
    await renderWithI18n(
      <ImagePreviewModal
        isOpen
        onClose={vi.fn()}
        imageSrc="https://example.com/x.png"
      />,
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
