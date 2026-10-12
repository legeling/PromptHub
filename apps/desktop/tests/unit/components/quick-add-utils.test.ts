import { describe, expect, it } from "vitest";

import {
  buildQuickAddGeneratePrompt,
  getQuickAddFallbackTitle,
  parseQuickAddAnalysisResult,
  parseQuickAddGeneratedDraft,
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
          apiProtocol: "openai",
          apiKey: "img-key",
          apiUrl: "https://api.example.com",
          model: "gpt-image-1",
        },
        {
          id: "chat-a",
          type: "chat",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "key-a",
          apiUrl: "https://api.example.com",
          model: "gpt-4o-mini",
        },
        {
          id: "chat-b",
          type: "chat",
          provider: "anthropic",
          apiProtocol: "anthropic",
          apiKey: "key-b",
          apiUrl: "https://api.anthropic.com",
          model: "claude-sonnet",
          isDefault: true,
        },
      ],
      scenarioModelDefaults: {},
      aiProvider: "",
      aiApiProtocol: "openai",
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
          apiProtocol: "openai",
          apiKey: "img-key",
          apiUrl: "https://api.example.com",
          model: "gpt-image-1",
        },
      ],
      scenarioModelDefaults: {},
      aiProvider: "openai",
      aiApiProtocol: "openai",
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
          apiProtocol: "openai",
          apiKey: "",
          apiUrl: "https://api.example.com",
          model: "gpt-4o",
        },
      ],
      scenarioModelDefaults: {},
      aiProvider: "",
      aiApiProtocol: "openai",
      aiApiKey: "",
      aiApiUrl: "",
      aiModel: "",
    });

    expect(config).toBeNull();
  });

  it("builds a fallback title from the first non-empty line", () => {
    expect(
      getQuickAddFallbackTitle(
        "\n  Generate image prompt for a forest  \nMore",
      ),
    ).toBe("Generate image prompt for a fo");
  });

  it("uses the provided empty fallback when prompt text is blank", () => {
    expect(getQuickAddFallbackTitle("   \n  ", "Untitled Prompt")).toBe(
      "Untitled Prompt",
    );
  });

  it("prefers the fast model route over the legacy quick add scenario model", () => {
    const config = resolveQuickAddAnalysisConfig({
      aiModels: [
        {
          id: "chat-a",
          type: "chat",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "key-a",
          apiUrl: "https://api.example.com",
          model: "gpt-4o-mini",
          isDefault: true,
        },
        {
          id: "chat-b",
          type: "chat",
          provider: "anthropic",
          apiProtocol: "anthropic",
          apiKey: "key-b",
          apiUrl: "https://api.anthropic.com",
          model: "claude-sonnet",
        },
      ],
      scenarioModelDefaults: {
        quickAdd: "chat-a",
      },
      modelRouteDefaults: {
        fastText: "chat-b",
      },
      aiProvider: "",
      aiApiProtocol: "openai",
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

  it("builds an AI generation prompt with the user request and preferred type", () => {
    const prompt = buildQuickAddGeneratePrompt(
      "Write a prompt for podcast show notes",
      {
        folderNames: "Writing, Marketing",
        tagsString: "writing, podcast",
      },
      "text",
    );

    expect(prompt).toContain("Write a prompt for podcast show notes");
    expect(prompt).toContain("Writing, Marketing");
    expect(prompt).toContain("text（文本）");
    expect(prompt).toContain('"userPrompt"');
    expect(prompt).toContain("输出格式");
    expect(prompt).toContain("保留用户要求的变量占位符");
  });

  it("parses AI quick-add analysis results from JSON content", () => {
    const result = parseQuickAddAnalysisResult(`before\n{
      "title": "SEO Writer",
      "systemPrompt": "You are an SEO expert.",
      "description": "Generate SEO blog outlines",
      "suggestedFolder": "Marketing",
      "tags": ["seo", "blog"]
    }\nafter`);

    expect(result).toEqual({
      title: "SEO Writer",
      systemPrompt: "You are an SEO expert.",
      description: "Generate SEO blog outlines",
      suggestedFolder: "Marketing",
      tags: ["seo", "blog"],
    });
  });

  it("parses AI generated prompt drafts and falls back missing title", () => {
    const result = parseQuickAddGeneratedDraft(
      `{
        "promptType": "image",
        "systemPrompt": "",
        "userPrompt": "cinematic portrait lighting, shallow depth of field",
        "description": "Portrait image prompt",
        "suggestedFolder": null,
        "tags": ["portrait", "image"]
      }`,
      "text",
      "New Prompt",
    );

    expect(result).toEqual({
      title: "cinematic portrait lighting, s",
      promptType: "image",
      systemPrompt: undefined,
      userPrompt: "cinematic portrait lighting, shallow depth of field",
      description: "Portrait image prompt",
      suggestedFolder: null,
      tags: ["portrait", "image"],
    });
  });

  it("returns null when generated draft is missing userPrompt", () => {
    expect(
      parseQuickAddGeneratedDraft(
        '{"title":"Oops","promptType":"text"}',
        "text",
        "New Prompt",
      ),
    ).toBeNull();
  });
});
