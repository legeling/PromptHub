import { describe, expect, it } from "vitest";

import {
  getApiEndpointPreview,
  getImageApiEndpointPreview,
  normalizeApiUrlInput,
} from "../../../src/renderer/services/ai";

describe("ai url helpers", () => {
  it("normalizes pasted chat completion endpoints back to the base url", () => {
    expect(
      normalizeApiUrlInput("https://api.example.com/v1/chat/completions"),
    ).toBe("https://api.example.com/v1");
  });

  it("preserves the explicit # marker while normalizing the base url", () => {
    expect(
      normalizeApiUrlInput("https://api.example.com/v1/chat/completions#"),
    ).toBe("https://api.example.com/v1#");
  });

  it("shows the final chat endpoint preview from a base host", () => {
    expect(getApiEndpointPreview("https://api.openai.com")).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
  });

  it("shows the final image endpoint preview from a version root", () => {
    expect(getImageApiEndpointPreview("https://api.example.com/v1")).toBe(
      "https://api.example.com/v1/images/generations",
    );
  });
});
