import { describe, expect, it, vi } from "vitest";
import {
  buildMessagesFromPrompt,
  generateSkillContentWithCompletion,
  multiModelCompareWithCompletion,
  polishSkillContentWithCompletion,
  rewritePromptDraftWithCompletion,
  type ChatCompletionExecutor,
} from "../../../src/renderer/services/ai-content-workflows";
import type { AIConfig } from "../../../src/renderer/services/ai-types";

function createConfig(overrides: Partial<AIConfig> = {}): AIConfig {
  return {
    id: "model-1",
    provider: "openai",
    apiProtocol: "openai",
    apiKey: "test-key",
    apiUrl: "https://api.example.com",
    model: "gpt-test",
    ...overrides,
  };
}

describe("AI content workflows", () => {
  it("forwards the selected structured output to every compared model", async () => {
    const complete = vi
      .fn<ChatCompletionExecutor>()
      .mockResolvedValue({ content: "{}" });
    const responseFormat = {
      type: "json_schema" as const,
      jsonSchema: {
        name: "answer",
        strict: true,
        schema: { type: "object" },
      },
    };
    await multiModelCompareWithCompletion(
      complete,
      [createConfig(), createConfig({ id: "model-2" })],
      [{ role: "user", content: "Compare" }],
      { stream: true, responseFormat },
    );
    expect(complete).toHaveBeenCalledTimes(2);
    for (const call of complete.mock.calls) {
      expect(call[2]).toMatchObject({ stream: true, responseFormat });
    }
  });
  it("keeps generation parameters when a custom system prompt is used", async () => {
    const complete = vi.fn<ChatCompletionExecutor>().mockResolvedValue({
      content: "generated skill",
    });
    const streamCallbacks = { onContent: vi.fn() };

    await expect(
      generateSkillContentWithCompletion(
        complete,
        createConfig(),
        "release-notes",
        "Create release notes",
        streamCallbacks,
        "Custom creator policy",
      ),
    ).resolves.toBe("generated skill");
    expect(complete).toHaveBeenCalledWith(
      expect.any(Object),
      [
        { role: "system", content: "Custom creator policy" },
        {
          role: "user",
          content: expect.stringContaining("release-notes"),
        },
      ],
      expect.objectContaining({
        temperature: 0.7,
        maxTokens: 4096,
        stream: true,
        streamCallbacks,
      }),
    );
  });

  it("uses conservative parameters for skill polishing", async () => {
    const complete = vi.fn<ChatCompletionExecutor>().mockResolvedValue({
      content: "polished skill",
    });

    await expect(
      polishSkillContentWithCompletion(
        complete,
        createConfig(),
        "# Existing",
        "existing-skill",
      ),
    ).resolves.toBe("polished skill");
    expect(complete.mock.calls[0]?.[2]).toMatchObject({
      temperature: 0.4,
      maxTokens: 4096,
      stream: false,
    });
    expect(complete.mock.calls[0]?.[1]?.[1]?.content).toContain(
      "existing-skill",
    );
  });

  it("parses only editable rewrite fields and trims the summary", async () => {
    const complete = vi.fn<ChatCompletionExecutor>().mockResolvedValue({
      content: JSON.stringify({
        summary: "  clearer output  ",
        userPrompt: "Updated {{topic}}",
        notes: "Keep concise",
      }),
    });

    await expect(
      rewritePromptDraftWithCompletion(complete, createConfig(), {
        promptType: "text",
        title: "Draft",
        userPrompt: "Original {{topic}}",
        instruction: "Improve clarity",
      }),
    ).resolves.toEqual({
      summary: "clearer output",
      userPrompt: "Updated {{topic}}",
      notes: "Keep concise",
    });
  });

  it.each([
    ["empty", "", "AI rewrite returned empty content"],
    ["invalid JSON", "not json", "AI rewrite did not return valid JSON"],
    [
      "invalid field",
      '{"userPrompt":42}',
      "AI rewrite returned an invalid userPrompt field",
    ],
    [
      "no fields",
      '{"summary":"only summary"}',
      "AI rewrite did not return any editable fields",
    ],
  ])("rejects %s rewrite responses", async (_name, content, message) => {
    const complete = vi
      .fn<ChatCompletionExecutor>()
      .mockResolvedValue({ content });
    await expect(
      rewritePromptDraftWithCompletion(complete, createConfig(), {
        promptType: "text",
        title: "Draft",
        userPrompt: "Original",
        instruction: "Improve clarity",
      }),
    ).rejects.toThrow(message);
  });

  it("keeps per-model success and failure isolated during comparison", async () => {
    const complete = vi.fn<ChatCompletionExecutor>(async (config) => {
      if (config.id === "broken") throw new Error("provider unavailable");
      return { content: `answer:${config.id}`, thinkingContent: "reasoning" };
    });
    const onContent = vi.fn();
    const configs = [
      createConfig({ id: "working", chatParams: { stream: true } }),
      createConfig({ id: "broken", provider: "custom" }),
    ];

    const result = await multiModelCompareWithCompletion(
      complete,
      configs,
      [{ role: "user", content: "Compare" }],
      { streamCallbacksMap: new Map([["working", { onContent }]]) },
    );

    expect(result.results).toMatchObject([
      { id: "working", success: true, response: "answer:working" },
      { id: "broken", success: false, error: "provider unavailable" },
    ]);
    expect(complete.mock.calls[0]?.[2]).toMatchObject({
      stream: true,
      streamCallbacks: { onContent },
    });
  });

  it("builds variable-expanded multimodal messages without mutating templates", () => {
    const messages = buildMessagesFromPrompt(
      "System {{topic}}",
      "Describe {{topic}}",
      { topic: "architecture" },
      [{ mimeType: "image/png", base64: "abc123" }],
    );

    expect(messages).toEqual([
      { role: "system", content: "System architecture" },
      {
        role: "user",
        content: [
          { type: "text", text: "Describe architecture" },
          {
            type: "image_url",
            image_url: { url: "data:image/png;base64,abc123" },
          },
        ],
      },
    ]);
  });
});
