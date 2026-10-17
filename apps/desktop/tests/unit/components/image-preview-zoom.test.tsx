import { fireEvent, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ImagePreviewModal } from "../../../src/renderer/components/ui/ImagePreviewModal";
import { ImagePreviewViewport } from "../../../src/renderer/components/ui/ImagePreviewViewport";
import { resolveLocalGenerationImageSrc } from "../../../src/renderer/utils/media-url";
import { Modal } from "../../../src/renderer/components/ui/Modal";
import { renderWithI18n } from "../../helpers/i18n";

function NestedPreview() {
  const [open, setOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(true);
  return (
    <>
      <Modal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        title="Editor"
      >
        <button type="button" onClick={() => setOpen(true)}>
          View reference
        </button>
      </Modal>
      <ImagePreviewModal
        isOpen={open}
        onClose={() => setOpen(false)}
        imageSrc="first.png"
      />
    </>
  );
}

describe("Image preview zoom", () => {
  it("supports the generation media protocol and its accessible image description", async () => {
    await renderWithI18n(
      <ImagePreviewViewport
        imageSrc="batch/output.png"
        resolveSource={resolveLocalGenerationImageSrc}
        alt="Generated image 1"
        onError={vi.fn()}
      />,
      { language: "en" },
    );
    expect(
      screen.getByRole("img", { name: "Generated image 1" }),
    ).toHaveAttribute("src", "local-generation-image://batch/output.png");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(
      screen.getByRole("button", { name: "Reset zoom" }),
    ).toHaveTextContent("125%");
  });

  it("zooms with buttons and wheel, clamps limits and resets when changing images", async () => {
    await renderWithI18n(
      <ImagePreviewModal
        isOpen
        onClose={vi.fn()}
        imageSrc="first.png"
        imageSources={["first.png", "second.png"]}
      />,
      { language: "en" },
    );
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    const zoomOut = screen.getByRole("button", { name: "Zoom out" });
    const reset = screen.getByRole("button", { name: "Reset zoom" });
    expect(reset).toHaveTextContent("100%");
    fireEvent.click(zoomIn);
    expect(reset).toHaveTextContent("125%");
    fireEvent.click(zoomOut);
    expect(reset).toHaveTextContent("100%");
    fireEvent.wheel(screen.getByRole("img"), { deltaY: -100 });
    expect(reset).toHaveTextContent("125%");
    for (let i = 0; i < 12; i++) fireEvent.click(zoomIn);
    expect(reset).toHaveTextContent("400%");
    expect(zoomIn).toBeDisabled();
    for (let i = 0; i < 12; i++) fireEvent.click(zoomOut);
    expect(reset).toHaveTextContent("25%");
    expect(zoomOut).toBeDisabled();
    fireEvent.click(reset);
    expect(reset).toHaveTextContent("100%");
    fireEvent.click(zoomIn);
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(
      screen.getByRole("button", { name: "Reset zoom" }),
    ).toHaveTextContent("100%");
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "local-image://second.png",
    );
  });

  it("closes only the image preview on Escape and returns focus to the editor", async () => {
    await renderWithI18n(<NestedPreview />, { language: "en" });
    const trigger = screen.getByRole("button", { name: "View reference" });
    trigger.focus();
    fireEvent.click(trigger);
    const preview = screen.getByRole("dialog", { name: "Preview" });
    fireEvent.keyDown(within(preview).getByRole("button", { name: "Close" }), {
      key: "Escape",
    });
    expect(
      screen.queryByRole("dialog", { name: "Preview" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Editor" })).toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(
      screen.getByRole("button", { name: "Reset zoom" }),
    ).toHaveTextContent("100%");
  });
});
