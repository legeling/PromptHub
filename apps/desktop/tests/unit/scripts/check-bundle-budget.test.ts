import { describe, expect, it } from "vitest";

import { measureEntry } from "../../../scripts/check-bundle-budget.mts";

describe("check-bundle-budget", () => {
  const matches = [
    {
      filePath: "/out/assets/index-main.js",
      relPath: "assets/index-main.js",
      gzipBytes: 120_000,
    },
    {
      filePath: "/out/assets/index-language.js",
      relPath: "assets/index-language.js",
      gzipBytes: 32_000,
    },
  ];

  it("sums matching chunks by default", () => {
    expect(measureEntry({}, matches)).toEqual({
      gzipBytes: 152_000,
      matches,
    });
  });

  it("can measure only the largest matching chunk", () => {
    expect(measureEntry({ aggregation: "max" }, matches)).toEqual({
      gzipBytes: 120_000,
      matches: [matches[0]],
    });
  });
});
