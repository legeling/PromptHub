import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PromptReferenceImages } from "../../../src/renderer/components/prompt/PromptReferenceImages";
import { renderWithI18n } from "../../helpers/i18n";

function ReferenceImages() {
  const [images, setImages] = useState(["first.png", "second.png"]);
  return (
    <PromptReferenceImages
      images={images}
      onRemove={(index) =>
        setImages((current) => current.filter((_, i) => i !== index))
      }
    />
  );
}

describe("Prompt reference thumbnails", () => {
  it("keeps removal separate from preview and opens the remaining image", async () => {
    await renderWithI18n(<ReferenceImages />, {
      language: "en",
      reactStrictMode: true,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Remove reference image 1" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByAltText("preview-0")).toHaveAttribute(
      "src",
      "local-image://second.png",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Preview reference image 1" }),
    );
    expect(screen.getByRole("img", { name: "Preview" })).toHaveAttribute(
      "src",
      "local-image://second.png",
    );
    expect(
      screen.queryByRole("button", { name: "Next image" }),
    ).not.toBeInTheDocument();
  });
});
