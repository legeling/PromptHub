import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LocalImage } from "../../../src/renderer/components/ui/LocalImage";

vi.mock("../../../src/renderer/utils/media-url", () => ({
  resolveLocalImageSrc: (src: string) => `resolved://${src}`,
}));

describe("LocalImage", () => {
  it("recovers from a previous load failure when the src changes", async () => {
    const { rerender } = render(<LocalImage src="broken.png" alt="Preview" />);

    fireEvent.error(screen.getByAltText("Preview"));
    expect(screen.queryByAltText("Preview")).not.toBeInTheDocument();

    rerender(<LocalImage src="fixed.png" alt="Preview" />);

    await waitFor(() => {
      expect(screen.getByAltText("Preview")).toHaveAttribute(
        "src",
        "resolved://fixed.png",
      );
    });
  });

  it("uses a named non-submit button for clickable images", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(
      <form onSubmit={(event) => event.preventDefault()}>
        <LocalImage
          src="preview.png"
          alt="Reference preview"
          aria-label="Preview reference image 1"
          onClick={handleClick}
        />
      </form>,
    );

    const previewButton = screen.getByRole("button", {
      name: "Preview reference image 1",
    });
    const image = previewButton.querySelector("img");
    expect(previewButton).toHaveAttribute("type", "button");
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("aria-hidden", "true");

    await user.click(previewButton);
    previewButton.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(handleClick).toHaveBeenCalledTimes(3);
  });

  it("keeps failed clickable images keyboard accessible", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(
      <LocalImage
        src=""
        alt="Broken preview"
        aria-label="Preview missing image"
        onClick={handleClick}
      />,
    );

    const fallbackButton = screen.getByRole("button", {
      name: "Preview missing image",
    });
    expect(fallbackButton).toHaveAttribute("type", "button");

    await user.click(fallbackButton);
    fallbackButton.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(handleClick).toHaveBeenCalledTimes(3);
  });
});
