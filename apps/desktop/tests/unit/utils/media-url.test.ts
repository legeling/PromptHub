import { afterEach, describe, expect, it } from "vitest";

import {
  resolveLocalImageSrc,
  resolveLocalVideoSrc,
} from "../../../src/renderer/utils/media-url";

type PromptHubRuntimeWindow = Window &
  typeof globalThis & {
    __PROMPTHUB_WEB__?: boolean;
  };

function runtimeWindow(): PromptHubRuntimeWindow {
  return window as PromptHubRuntimeWindow;
}

describe("media URL helpers", () => {
  afterEach(() => {
    delete runtimeWindow().__PROMPTHUB_WEB__;
  });

  it("preserves external media sources", () => {
    expect(resolveLocalImageSrc("https://example.com/hero.png")).toBe(
      "https://example.com/hero.png",
    );
    expect(resolveLocalVideoSrc("data:video/mp4;base64,AAAA")).toBe(
      "data:video/mp4;base64,AAAA",
    );
  });

  it("encodes desktop local image and video filenames before building protocol URLs", () => {
    expect(resolveLocalImageSrc("hero #1?.png")).toBe(
      "local-image://hero%20%231%3F.png",
    );
    expect(resolveLocalVideoSrc("clip #1?.mp4")).toBe(
      "local-video://clip%20%231%3F.mp4",
    );
  });

  it("keeps already encoded local media protocol URLs stable", () => {
    expect(resolveLocalImageSrc("local-image://hero%20%231%3F.png")).toBe(
      "local-image://hero%20%231%3F.png",
    );
    expect(resolveLocalVideoSrc("local-video://clip%20%231%3F.mp4")).toBe(
      "local-video://clip%20%231%3F.mp4",
    );
  });

  it("encodes web media paths for image and video API routes", () => {
    runtimeWindow().__PROMPTHUB_WEB__ = true;

    expect(resolveLocalImageSrc("hero #1?.png")).toBe(
      "/api/media/images/hero%20%231%3F.png",
    );
    expect(resolveLocalVideoSrc("clip #1?.mp4")).toBe(
      "/api/media/videos/clip%20%231%3F.mp4",
    );
  });

  it("keeps already resolved web media API routes stable", () => {
    runtimeWindow().__PROMPTHUB_WEB__ = true;

    expect(resolveLocalImageSrc("/api/media/images/hero%20%231%3F.png")).toBe(
      "/api/media/images/hero%20%231%3F.png",
    );
    expect(resolveLocalVideoSrc("/api/media/videos/clip%20%231%3F.mp4")).toBe(
      "/api/media/videos/clip%20%231%3F.mp4",
    );
  });
});
