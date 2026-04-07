import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  chatCompletion,
  fetchAvailableModels,
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
        Authorization: "Bearer test-key",
      },
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
});
