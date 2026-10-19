/** @vitest-environment node */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { extractReleaseSection } from "../../../src/utils/release-notes";
import { compareVersions } from "../../../src/utils/version";
import {
  selectPreviewRelease,
  resolveUpdateNotes,
} from "../../../src/main/updater-release-metadata";

describe("release identity and update notes", () => {
  const changelog =
    "## [Unreleased]\nFuture work\n\n## [0.6.0]\nStable changes\n\n## [0.6.0-beta.2]\nPreview changes\n\n## [0.5.9]\nOld changes";

  it("extracts exactly the requested version, excluding future and beta sections", () => {
    expect(extractReleaseSection(changelog, "v0.6.0")).toBe(
      "## [0.6.0]\nStable changes",
    );
    expect(extractReleaseSection(changelog, "0.6.0-beta.2")).toBe(
      "## [0.6.0-beta.2]\nPreview changes",
    );
    expect(extractReleaseSection(changelog, "0.7.0")).toBe("");
  });

  it("never substitutes beta history or Unreleased for missing stable notes", () => {
    const historicalManifest =
      "## [Unreleased]\nDraft changes\n\n## [0.6.0-beta.2]\nPreview changes";
    expect(resolveUpdateNotes(historicalManifest, "0.6.0")).toBe("");
    expect(resolveUpdateNotes(changelog, "0.6.0")).toBe(
      "## [0.6.0]\nStable changes",
    );
  });

  it("retains rich release-specific content and selects only matching array notes", () => {
    const rich =
      "## Features\n[![Badge](https://img.shields.io/badge/test-blue)](https://github.com/legeling/PromptHub)";
    expect(resolveUpdateNotes(rich, "0.6.0")).toBe(rich);
    expect(
      resolveUpdateNotes(
        [
          { version: "0.6.0-beta.2", note: "Beta" },
          { version: "0.6.0", note: rich },
        ],
        "0.6.0",
      ),
    ).toBe(rich);
    expect(
      resolveUpdateNotes([{ version: "0.5.9", note: "Old" }], "0.6.0"),
    ).toBe("");
  });

  it("chooses the highest published version, regardless of API ordering", () => {
    const candidates = [
      { tag_name: "v0.6.0-beta.2", prerelease: true, draft: false },
      { tag_name: "v0.6.0", prerelease: false, draft: false, body: "Stable" },
      { tag_name: "v9.0.0", prerelease: false, draft: true },
      { tag_name: "bad", prerelease: false, draft: false },
    ];
    expect(selectPreviewRelease(JSON.stringify(candidates))).toEqual({
      tagName: "v0.6.0",
      body: "Stable",
    });
    candidates.push({
      tag_name: "v0.7.0-beta.1",
      prerelease: true,
      draft: false,
    });
    expect(selectPreviewRelease(JSON.stringify(candidates))?.tagName).toBe(
      "v0.7.0-beta.1",
    );
    expect(selectPreviewRelease("[]")).toBeNull();
    expect(() => selectPreviewRelease("{}")).toThrow();
  });

  it.each([
    ["0.6.0", "0.6.0-beta.2", 1],
    ["0.6.0-beta.10", "0.6.0-beta.2", 1],
    ["0.6.0", "0.7.0-beta.1", -1],
    ["v0.6.0", "0.6.0+build.1", 0],
  ])("compares %s against %s without downgrades", (left, right, expected) => {
    expect(compareVersions(left, right)).toBe(expected);
  });

  it("packages only the current version's release notes", () => {
    const require = createRequire(import.meta.url);
    const config = require("../../../electron-builder.config.cjs");
    const { version } = require("../../../package.json");
    const source = readFileSync(
      new URL("../../../../../CHANGELOG.md", import.meta.url),
      "utf8",
    );
    expect(config.releaseInfo.releaseNotes).toBe(
      extractReleaseSection(source, version),
    );
    expect(config.releaseInfo.releaseNotes).toContain(`## [${version}]`);
    expect(config.releaseInfo.releaseNotes).not.toContain("## [Unreleased]");
    expect(config.releaseInfo.releaseNotes).not.toContain("## [0.6.0-beta.2]");
  });
});
