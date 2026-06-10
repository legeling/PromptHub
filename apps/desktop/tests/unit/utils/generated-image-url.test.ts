import { describe, expect, it } from "vitest";

import { resolveGeneratedImageUrl } from "../../../src/renderer/utils/generated-image-url";

describe("resolveGeneratedImageUrl", () => {
  it("resolves safe remote and image data URLs", () => {
    expect(resolveGeneratedImageUrl(" https://example.com/generated.png "))
      .toEqual({
        kind: "remote",
        url: "https://example.com/generated.png",
      });
    expect(resolveGeneratedImageUrl("http://example.com/generated.webp"))
      .toEqual({
        kind: "remote",
        url: "http://example.com/generated.webp",
      });
    expect(resolveGeneratedImageUrl("data:image/png;base64,AAAA")).toEqual({
      kind: "data",
      url: "data:image/png;base64,AAAA",
      base64: "AAAA",
    });
  });

  it("rejects unsafe or unsupported generated image URLs", () => {
    expect(resolveGeneratedImageUrl("javascript:alert(1)")).toBeNull();
    expect(resolveGeneratedImageUrl("file:///tmp/generated.png")).toBeNull();
    expect(resolveGeneratedImageUrl("data:text/html;base64,PHNjcmlwdD4="))
      .toBeNull();
    expect(resolveGeneratedImageUrl("data:image/svg+xml;base64,AAAA")).toBeNull();
    expect(resolveGeneratedImageUrl("/tmp/generated.png")).toBeNull();
  });
});
