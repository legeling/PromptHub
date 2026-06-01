import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlatformIcon } from "../../../src/renderer/components/ui/PlatformIcon";

describe("PlatformIcon", () => {
  it("renders the real Cherry Studio icon instead of the generic fallback", () => {
    render(<PlatformIcon platformId="cherry-studio" size={20} />);

    const icon = screen.getByRole("img", { name: "cherry-studio icon" });
    expect(icon).toHaveAttribute(
      "src",
      expect.stringContaining("cherry-studio.png"),
    );
  });
});
