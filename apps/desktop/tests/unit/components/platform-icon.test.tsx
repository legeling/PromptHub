import { render, screen } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { PlatformIcon } from "../../../src/renderer/components/ui/PlatformIcon";

const PNG_SIGNATURE = "89504e470d0a1a0a";
const platformAssetsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../src/renderer/assets/platforms",
);

describe("PlatformIcon", () => {
  it("renders the real Cherry Studio icon instead of the generic fallback", () => {
    render(<PlatformIcon platformId="cherry-studio" size={20} />);

    const icon = screen.getByRole("img", { name: "cherry-studio icon" });
    expect(icon).toHaveAttribute(
      "src",
      expect.stringContaining("cherry-studio.png"),
    );
  });

  it("keeps bundled platform PNG assets as real PNG files", () => {
    const invalidPngFiles = readdirSync(platformAssetsDir)
      .filter((fileName) => fileName.endsWith(".png"))
      .filter((fileName) => {
        const signature = readFileSync(join(platformAssetsDir, fileName))
          .subarray(0, 8)
          .toString("hex");

        return signature !== PNG_SIGNATURE;
      });

    expect(invalidPngFiles).toEqual([]);
  });
});
