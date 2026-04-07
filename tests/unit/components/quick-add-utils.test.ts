import { describe, expect, it } from "vitest";

import {
  getQuickAddFallbackTitle,
  resolveQuickAddAnalysisConfig,
} from "../../../src/renderer/components/prompt/quick-add-utils";

describe("quick-add-utils", () => {
  it("prefers the default usable chat model for AI analysis", () => {
    const config = resolveQuickAddAnalysisConfig({
      aiModels: [
        {
          id: "image-model",
          type: "image",
          provider: "openai",
          apiKey: "img-key",
          apiUrl: "https://api.example.com",
          model: "gpt-image-1",
        },
        {
          id: "chat-a",
          type: "chat",
          provider: "openai",
          apiKey: "key-a",
          apiUrl: "https://api.example.com",
          model: "gpt-4o-mini",
        },
        {
          id: "chat-b",
          type: "chat",
          provider: "anthropic",
          apiKey: "key-b",
          apiUrl: "https://api.anthropic.com",
          model: "claude-sonnet",
          isDefault: true,
        },
      ],
      scenarioModelDefaults: {},
      aiProvider: "",
      aiApiKey: "",
      aiApiUrl: "",
      aiModel: "",
    });

    expect(config).toMatchObject({
      provider: "anthropic",
      model: "claude-sonnet",
      type: "chat",
    });
  });

  it("falls back to legacy root AI config when no usable chat model exists", () => {
    const config = resolveQuickAddAnalysisConfig({
      aiModels: [
        {
          id: "image-only",
          type: "image",
          provider: "openai",
          apiKey: "img-key",
          apiUrl: "https://api.example.com",
          model: "gpt-image-1",
        },
      ],
      scenarioModelDefaults: {},
      aiProvider: "openai",
      aiApiKey: "legacy-key",
      aiApiUrl: "https://api.legacy.example.com",
      aiModel: "gpt-4o",
    });

    expect(config).toMatchObject({
      provider: "openai",
      apiKey: "legacy-key",
      apiUrl: "https://api.legacy.example.com",
      model: "gpt-4o",
      type: "chat",
    });
  });

  it("returns null when no usable chat analysis config exists", () => {
    const config = resolveQuickAddAnalysisConfig({
      aiModels: [
        {
          id: "broken-chat",
          type: "chat",
          provider: "openai",
          apiKey: "",
          apiUrl: "https://api.example.com",
          model: "gpt-4o",
        },
      ],
      scenarioModelDefaults: {},
      aiProvider: "",
      aiApiKey: "",
      aiApiUrl: "",
      aiModel: "",
    });

    expect(config).toBeNull();
  });

  it("builds a fallback title from the first non-empty line", () => {
    expect(
      getQuickAddFallbackTitle("\n  Generate image prompt for a forest  \nMore"),
    ).toBe("Generate image prompt for a fo");
  });

  it("uses the provided empty fallback when prompt text is blank", () => {
    expect(getQuickAddFallbackTitle("   \n  ", "Untitled Prompt")).toBe(
      "Untitled Prompt",
    );
  });

  it("prefers the explicit quick add scenario model over the generic default", () => {
    const config = resolveQuickAddAnalysisConfig({
      aiModels: [
        {
          id: "chat-a",
          type: "chat",
          provider: "openai",
          apiKey: "key-a",
          apiUrl: "https://api.example.com",
          model: "gpt-4o-mini",
          isDefault: true,
        },
        {
          id: "chat-b",
          type: "chat",
          provider: "anthropic",
          apiKey: "key-b",
          apiUrl: "https://api.anthropic.com",
          model: "claude-sonnet",
        },
      ],
      scenarioModelDefaults: {
        quickAdd: "chat-b",
      },
      aiProvider: "",
      aiApiKey: "",
      aiApiUrl: "",
      aiModel: "",
    });

    expect(config).toMatchObject({
      provider: "anthropic",
      model: "claude-sonnet",
      type: "chat",
    });
  });
});
