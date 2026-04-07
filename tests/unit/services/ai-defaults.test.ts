import { describe, expect, it } from "vitest";

import { resolveScenarioModel } from "../../../src/renderer/services/ai-defaults";

describe("ai-defaults", () => {
  it("uses explicit scenario selection when available", () => {
    const model = resolveScenarioModel(
      [
        {
          id: "chat-a",
          type: "chat",
          provider: "openai",
          apiKey: "k1",
          apiUrl: "https://api.example.com",
          model: "gpt-4.1",
          isDefault: true,
        },
        {
          id: "chat-b",
          type: "chat",
          provider: "anthropic",
          apiKey: "k2",
          apiUrl: "https://api.anthropic.com",
          model: "claude-4-sonnet",
        },
      ],
      { translation: "chat-b" },
      "translation",
      "chat",
    );

    expect(model?.id).toBe("chat-b");
  });

  it("falls back to the type default when scenario selection is missing", () => {
    const model = resolveScenarioModel(
      [
        {
          id: "image-a",
          type: "image",
          provider: "openai",
          apiKey: "k1",
          apiUrl: "https://api.example.com",
          model: "gpt-image-1",
          isDefault: true,
        },
        {
          id: "image-b",
          type: "image",
          provider: "google",
          apiKey: "k2",
          apiUrl: "https://generativelanguage.googleapis.com",
          model: "gemini-image",
        },
      ],
      {},
      "imageTest",
      "image",
    );

    expect(model?.id).toBe("image-a");
  });
});
