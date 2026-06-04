import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildMessagesFromPrompt,
  chatCompletion,
  fetchAvailableModels,
  generateImage,
  testAIConnection,
} from "../../../src/renderer/services/ai";
import { installWindowMocks } from "../../helpers/window";

describe("ai transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installWindowMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("uses the main-process stream transport for streaming chat completions", async () => {
    const onContent = vi.fn();
    window.api.ai.requestStream.mockImplementation(
      async (
        _request: unknown,
        handlers?: {
          onChunk?: (chunk: string) => void;
        },
      ) => {
        handlers?.onChunk?.(
          'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
        );
        handlers?.onChunk?.(
          'data: {"choices":[{"delta":{"content":" world"}}]}\n',
        );
        handlers?.onChunk?.("data: [DONE]\n");
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          body: "",
          headers: { "content-type": "text/event-stream" },
        };
      },
    );

    const result = await chatCompletion(
      {
        provider: "openai",
        apiProtocol: "openai",
        apiKey: "test-key",
        apiUrl: "https://api.example.com",
        model: "gpt-test",
        chatParams: {
          stream: true,
        },
      },
      [{ role: "user", content: "Say hello" }],
      {
        stream: true,
        onStream: onContent,
      },
    );

    expect(window.api.ai.requestStream).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(onContent).toHaveBeenCalledWith("Hello");
    expect(onContent).toHaveBeenCalledWith(" world");
    expect(result).toEqual({
      content: "Hello world",
      thinkingContent: undefined,
    });
  });

  it("uses the main-process request transport for model discovery", async () => {
    window.api.ai.request.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      body: JSON.stringify({
        data: [{ id: "gpt-4o" }, { id: "gpt-4.1-mini" }],
      }),
      headers: { "content-type": "application/json" },
    });

    const result = await fetchAvailableModels(
      "https://api.openai.com",
      "test-key",
    );

    expect(window.api.ai.request).toHaveBeenCalledWith({
      method: "GET",
      url: "https://api.openai.com/v1/models",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer test-key",
      },
      timeoutMs: 12_000,
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      models: [
        { id: "gpt-4.1-mini", name: "gpt-4.1-mini", owned_by: undefined, created: undefined },
        { id: "gpt-4o", name: "gpt-4o", owned_by: undefined, created: undefined },
      ],
    });
  });

  it("uses a lightweight non-streaming probe for chat model connection tests", async () => {
    window.api.ai.request.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      body: JSON.stringify({
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "OK" },
            finish_reason: "stop",
          },
        ],
      }),
      headers: { "content-type": "application/json" },
    });

    const result = await testAIConnection({
      provider: "custom",
      apiProtocol: "openai",
      apiKey: "local-key",
      apiUrl: "http://127.0.0.1:8000",
      model: "Qwen3.5-9B-MLX-4bit",
      chatParams: {
        maxTokens: 4096,
        stream: true,
        enableThinking: true,
        temperature: 0.9,
      },
    });

    expect(result.success).toBe(true);
    expect(window.api.ai.request).toHaveBeenCalledTimes(1);
    expect(window.api.ai.requestStream).not.toHaveBeenCalled();

    const request = window.api.ai.request.mock.calls[0]?.[0];
    expect(request).toEqual(
      expect.objectContaining({
        method: "POST",
        url: "http://127.0.0.1:8000/v1/chat/completions",
        timeoutMs: 12_000,
      }),
    );

    const body = JSON.parse(String(request?.body));
    expect(body.messages).toEqual([
      { role: "user", content: "Reply with exactly: OK" },
    ]);
    expect(body.max_tokens).toBe(8);
    expect(body.stream).toBe(false);
    expect(body.enable_thinking).toBe(false);
    expect(body.temperature).toBe(0);
  });

  it("uses the main-process request transport for OpenAI-compatible image generation", async () => {
    window.api.ai.request.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      body: JSON.stringify({
        created: 1,
        data: [{ url: "https://example.com/generated.png" }],
      }),
      headers: { "content-type": "application/json" },
    });

    const result = await generateImage(
      {
        provider: "openai",
        apiProtocol: "openai",
        apiKey: "image-key",
        apiUrl: "https://api.legeling.xyz/v1",
        model: "gpt-image-1",
        type: "image",
      },
      "a reusable image prompt",
      { n: 1 },
    );

    expect(result.data[0]?.url).toBe("https://example.com/generated.png");
    expect(window.api.ai.request).toHaveBeenCalledWith({
      method: "POST",
      url: "https://api.legeling.xyz/v1/images/generations",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer image-key",
      },
      body: JSON.stringify({
        prompt: "a reusable image prompt",
        model: "gpt-image-1",
      }),
      timeoutMs: 300_000,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the minimal GPT Image request body when generating a single image", async () => {
    window.api.ai.request.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      body: JSON.stringify({
        created: 1,
        data: [{ b64_json: "base64imagedata==" }],
      }),
      headers: { "content-type": "application/json" },
    });

    await generateImage(
      {
        provider: "custom",
        apiProtocol: "openai",
        apiKey: "image-key",
        apiUrl: "https://api.legeling.xyz/v1",
        model: "gpt-image-2",
        type: "image",
      },
      "a reusable image prompt",
      { n: 1 },
    );

    const request = window.api.ai.request.mock.calls[0]?.[0];
    expect(JSON.parse(String(request?.body))).toEqual({
      prompt: "a reusable image prompt",
      model: "gpt-image-2",
    });
  });

  it("keeps explicit multi-image counts for GPT Image requests", async () => {
    window.api.ai.request.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      body: JSON.stringify({
        created: 1,
        data: [{ b64_json: "base64imagedata==" }],
      }),
      headers: { "content-type": "application/json" },
    });

    await generateImage(
      {
        provider: "custom",
        apiProtocol: "openai",
        apiKey: "image-key",
        apiUrl: "https://api.legeling.xyz/v1",
        model: "gpt-image-2",
        type: "image",
      },
      "a reusable image prompt",
      { n: 2 },
    );

    const request = window.api.ai.request.mock.calls[0]?.[0];
    expect(JSON.parse(String(request?.body))).toEqual({
      prompt: "a reusable image prompt",
      model: "gpt-image-2",
      n: 2,
    });
  });

  it("surfaces main-process image generation network errors", async () => {
    window.api.ai.request.mockResolvedValue({
      ok: false,
      status: 0,
      statusText: "",
      body: "",
      headers: {},
      error: "Failed to fetch",
    });

    await expect(
      generateImage(
        {
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "image-key",
          apiUrl: "https://api.legeling.xyz/v1",
          model: "gpt-image-1",
          type: "image",
        },
        "a reusable image prompt",
      ),
    ).rejects.toThrow("Failed to fetch");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("formats provider HTML gateway timeout pages as a concise image generation error", async () => {
    window.api.ai.request.mockResolvedValue({
      ok: false,
      status: 504,
      statusText: "Gateway Time-out",
      body: '<!DOCTYPE html><html><head><title>legeling.xyz | 504: Gateway time-out</title></head><body><h1>Gateway time-out</h1></body></html>',
      headers: { "content-type": "text/html; charset=UTF-8" },
    });

    await expect(
      generateImage(
        {
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "image-key",
          apiUrl: "https://api.legeling.xyz/v1",
          model: "gpt-image-2",
          type: "image",
        },
        "a reusable image prompt",
      ),
    ).rejects.toThrow(
      "Image generation gateway timed out (504). The provider or proxy did not finish before its own timeout.",
    );
    await expect(
      generateImage(
        {
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "image-key",
          apiUrl: "https://api.legeling.xyz/v1",
          model: "gpt-image-2",
          type: "image",
        },
        "a reusable image prompt",
      ),
    ).rejects.not.toThrow("<!DOCTYPE html>");
  });

  it.each([
    {
      name: "FLUX",
      config: {
        provider: "flux",
        apiProtocol: "openai" as const,
        apiKey: "flux-key",
        apiUrl: "https://api.bfl.ai/v1",
        model: "flux-pro-1.1",
        type: "image" as const,
      },
      responseBody: { sample: "https://example.com/flux.png" },
      expectedUrl: "https://api.bfl.ai/v1/images/generations",
      expectedHeaders: {
        "Content-Type": "application/json",
        "X-Key": "flux-key",
      },
      expectedImageUrl: "https://example.com/flux.png",
    },
    {
      name: "Ideogram",
      config: {
        provider: "ideogram",
        apiProtocol: "openai" as const,
        apiKey: "ideogram-key",
        apiUrl: "https://api.ideogram.ai",
        model: "V_3",
        type: "image" as const,
      },
      responseBody: { data: [{ url: "https://example.com/ideogram.png" }] },
      expectedUrl: "https://api.ideogram.ai/generate",
      expectedHeaders: {
        "Content-Type": "application/json",
        "Api-Key": "ideogram-key",
      },
      expectedImageUrl: "https://example.com/ideogram.png",
    },
    {
      name: "Recraft",
      config: {
        provider: "recraft",
        apiProtocol: "openai" as const,
        apiKey: "recraft-key",
        apiUrl: "https://external.api.recraft.ai/v1",
        model: "recraftv3",
        type: "image" as const,
      },
      responseBody: { data: [{ url: "https://example.com/recraft.png" }] },
      expectedUrl: "https://external.api.recraft.ai/v1/images/generations",
      expectedHeaders: {
        "Content-Type": "application/json",
        Authorization: "Bearer recraft-key",
      },
      expectedImageUrl: "https://example.com/recraft.png",
    },
  ])(
    "uses the main-process request transport for $name image generation",
    async ({ config, responseBody, expectedHeaders, expectedImageUrl, expectedUrl }) => {
      window.api.ai.request.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        body: JSON.stringify(responseBody),
        headers: { "content-type": "application/json" },
      });

      const result = await generateImage(config, "a reusable image prompt");

      expect(result.data[0]?.url).toBe(expectedImageUrl);
      expect(window.api.ai.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          url: expectedUrl,
          headers: expectedHeaders,
          timeoutMs: 300_000,
        }),
      );
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("uses the main-process request transport for Stability image generation", async () => {
    window.api.ai.request.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      body: JSON.stringify({
        artifacts: [{ base64: "base64imagedata==" }],
      }),
      headers: { "content-type": "application/json" },
    });

    const result = await generateImage(
      {
        provider: "stability",
        apiProtocol: "openai",
        apiKey: "stability-key",
        apiUrl: "https://api.stability.ai/v1",
        model: "stable-diffusion-xl-1024-v1-0",
        type: "image",
      },
      "a reusable image prompt",
    );

    expect(result.data[0]?.b64_json).toBe("base64imagedata==");
    expect(window.api.ai.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer stability-key",
          Accept: "application/json",
        },
        timeoutMs: 300_000,
      }),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the main-process request transport for Replicate image generation and polling", async () => {
    vi.useFakeTimers();
    try {
      window.api.ai.request
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          body: JSON.stringify({
            status: "processing",
            urls: { get: "https://api.replicate.com/v1/predictions/abc" },
          }),
          headers: { "content-type": "application/json" },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          body: JSON.stringify({
            status: "succeeded",
            output: ["https://example.com/replicate.png"],
          }),
          headers: { "content-type": "application/json" },
        });

      const resultPromise = generateImage(
        {
          provider: "replicate",
          apiProtocol: "openai",
          apiKey: "replicate-key",
          apiUrl: "https://api.replicate.com",
          model: "replicate-version",
          type: "image",
        },
        "a reusable image prompt",
      );

      await vi.advanceTimersByTimeAsync(1_000);
      const result = await resultPromise;

      expect(result.data[0]?.url).toBe("https://example.com/replicate.png");
      expect(window.api.ai.request).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          method: "POST",
          url: "https://api.replicate.com/v1/predictions",
          timeoutMs: 300_000,
        }),
      );
      expect(window.api.ai.request).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          method: "GET",
          url: "https://api.replicate.com/v1/predictions/abc",
          headers: { Authorization: "Bearer replicate-key" },
          timeoutMs: 300_000,
        }),
      );
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("builds text-only prompt messages with the legacy string content shape", () => {
    const messages = buildMessagesFromPrompt(
      "You are concise.",
      "Describe {{topic}}",
      { topic: "SQLite" },
    );

    expect(messages).toEqual([
      { role: "system", content: "You are concise." },
      { role: "user", content: "Describe SQLite" },
    ]);
  });

  it("builds multimodal prompt messages with base64 image URL parts", () => {
    const messages = buildMessagesFromPrompt(
      "You inspect screenshots.",
      "What changed?",
      undefined,
      [
        {
          name: "screen.png",
          mimeType: "image/png",
          base64: "iVBORw0KGgo=",
        },
      ],
    );

    expect(messages).toEqual([
      { role: "system", content: "You inspect screenshots." },
      {
        role: "user",
        content: [
          { type: "text", text: "What changed?" },
          {
            type: "image_url",
            image_url: {
              url: "data:image/png;base64,iVBORw0KGgo=",
            },
          },
        ],
      },
    ]);
  });

  it("sends multimodal messages through the main-process request transport", async () => {
    window.api.ai.request.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      body: JSON.stringify({
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "The image contains a chart." },
            finish_reason: "stop",
          },
        ],
      }),
      headers: { "content-type": "application/json" },
    });

    const messages = buildMessagesFromPrompt(
      undefined,
      "Read the image",
      undefined,
      [{ mimeType: "image/jpeg", base64: "/9j/4AAQSkZJRg==" }],
    );

    const result = await chatCompletion(
      {
        provider: "openai",
        apiProtocol: "openai",
        apiKey: "test-key",
        apiUrl: "https://api.example.com",
        model: "gpt-4o",
      },
      messages,
    );

    expect(result.content).toBe("The image contains a chart.");
    expect(window.api.ai.request).toHaveBeenCalledTimes(1);

    const request = window.api.ai.request.mock.calls[0]?.[0];
    expect(request).toBeDefined();
    const body = JSON.parse(String(request?.body));

    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "Read the image" },
          {
            type: "image_url",
            image_url: {
              url: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
            },
          },
        ],
      },
    ]);
  });

  it("uses Authorization bearer for Gemini OpenAI-compatible chat completions", async () => {
    window.api.ai.request.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      body: JSON.stringify({
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Gemini says hi." },
            finish_reason: "stop",
          },
        ],
      }),
      headers: { "content-type": "application/json" },
    });

    const result = await chatCompletion(
      {
        provider: "google",
        apiProtocol: "gemini",
        apiKey: "gemini-key",
        apiUrl: "https://generativelanguage.googleapis.com",
        model: "gemini-3-flash-preview",
      },
      [{ role: "user", content: "Say hi" }],
    );

    expect(result.content).toBe("Gemini says hi.");
    expect(window.api.ai.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        headers: expect.objectContaining({
          Authorization: "Bearer gemini-key",
        }),
      }),
    );

    const headers = window.api.ai.request.mock.calls[0]?.[0]?.headers;
    expect(headers["x-goog-api-key"]).toBeUndefined();
  });

  it("uses x-goog-api-key for Gemini native model discovery", async () => {
    window.api.ai.request.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      body: JSON.stringify({
        models: [{ name: "models/gemini-3-flash-preview", displayName: "Gemini 3 Flash Preview" }],
      }),
      headers: { "content-type": "application/json" },
    });

    const result = await fetchAvailableModels(
      "https://generativelanguage.googleapis.com",
      "gemini-key",
      "gemini",
    );

    expect(result).toEqual({
      success: true,
      models: [
        {
          id: "gemini-3-flash-preview",
          name: "Gemini 3 Flash Preview (gemini-3-flash-preview)",
          owned_by: "Google",
          description: undefined,
        },
      ],
    });

    expect(window.api.ai.request).toHaveBeenCalledWith({
      method: "GET",
      url: "https://generativelanguage.googleapis.com/v1beta/models",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-goog-api-key": "gemini-key",
      },
      timeoutMs: 12_000,
    });
  });

  it("returns a network error when model discovery times out in the main-process transport", async () => {
    window.api.ai.request.mockResolvedValue({
      ok: false,
      status: 0,
      statusText: "",
      body: "",
      headers: {},
      error: "Request timeout after 12000ms",
    });

    const result = await fetchAvailableModels(
      "https://api.openai.com",
      "test-key",
    );

    expect(result).toEqual({
      success: false,
      models: [],
      error: "Request timeout after 12000ms",
      reason: "network",
      endpoint: "https://api.openai.com/v1/models",
      status: 0,
    });
  });

  it("preserves image attachments when sending Anthropic multimodal chat requests", async () => {
    window.api.ai.request.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      body: JSON.stringify({
        content: [{ type: "text", text: "I can see the screenshot." }],
      }),
      headers: { "content-type": "application/json" },
    });

    const messages = buildMessagesFromPrompt(
      "You inspect screenshots.",
      "Describe the UI",
      undefined,
      [{ mimeType: "image/png", base64: "iVBORw0KGgo=" }],
    );

    const result = await chatCompletion(
      {
        provider: "anthropic",
        apiProtocol: "anthropic",
        apiKey: "anthropic-key",
        apiUrl: "https://api.anthropic.com",
        model: "claude-3-7-sonnet-latest",
      },
      messages,
    );

    expect(result.content).toBe("I can see the screenshot.");
    const request = window.api.ai.request.mock.calls[0]?.[0];
    const body = JSON.parse(String(request?.body));
    expect(body.system).toBe("You inspect screenshots.");
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "Describe the UI" },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: "iVBORw0KGgo=",
            },
          },
        ],
      },
    ]);
  });
});
