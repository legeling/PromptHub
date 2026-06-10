/**
 * @vitest-environment node
 */
import path from "path";
import { describe, expect, it } from "vitest";

import { resolveLocalMediaProtocolPath } from "../../../src/main/local-media-protocol";

describe("resolveLocalMediaProtocolPath", () => {
  const baseDir = path.join(path.sep, "tmp", "prompthub-images");

  it("resolves simple and nested protocol paths inside the media directory", () => {
    expect(resolveLocalMediaProtocolPath("local-image://hero.png", "local-image", baseDir)).toBe(
      path.join(baseDir, "hero.png"),
    );
    expect(
      resolveLocalMediaProtocolPath(
        "local-image://albums/cover%20one.png",
        "local-image",
        baseDir,
      ),
    ).toBe(path.join(baseDir, "albums", "cover one.png"));
    expect(resolveLocalMediaProtocolPath("local-video://clips/intro.mp4", "local-video", baseDir)).toBe(
      path.join(baseDir, "clips", "intro.mp4"),
    );
  });

  it("rejects traversal through slash, encoded slash, or backslash segments", () => {
    expect(
      resolveLocalMediaProtocolPath("local-image://../secret.png", "local-image", baseDir),
    ).toBeNull();
    expect(
      resolveLocalMediaProtocolPath(
        "local-image://safe/%2e%2e/secret.png",
        "local-image",
        baseDir,
      ),
    ).toBeNull();
    expect(
      resolveLocalMediaProtocolPath(
        "local-image://safe%5C..%5Csecret.png",
        "local-image",
        baseDir,
      ),
    ).toBeNull();
  });

  it("rejects absolute and malformed protocol paths", () => {
    expect(
      resolveLocalMediaProtocolPath("local-image:///etc/passwd", "local-image", baseDir),
    ).toBeNull();
    expect(
      resolveLocalMediaProtocolPath("local-video://hero.mp4", "local-image", baseDir),
    ).toBeNull();
    expect(
      resolveLocalMediaProtocolPath("local-image://bad%zz.png", "local-image", baseDir),
    ).toBeNull();
  });

  it("rejects paths with unsupported media extensions", () => {
    expect(resolveLocalMediaProtocolPath("local-image://notes.txt", "local-image", baseDir)).toBeNull();
    expect(resolveLocalMediaProtocolPath("local-video://poster.png", "local-video", baseDir)).toBeNull();
  });

  it("rejects path segments with control characters or stream separators", () => {
    expect(
      resolveLocalMediaProtocolPath("local-image://safe%00.png", "local-image", baseDir),
    ).toBeNull();
    expect(
      resolveLocalMediaProtocolPath("local-image://safe.png:ads", "local-image", baseDir),
    ).toBeNull();
  });
});
