import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chatCompletion,
  multiModelCompare,
  type AIConfig,
} from "../../../src/renderer/services/ai";
import { installWindowMocks } from "../../helpers/window";

const config: AIConfig = {
  provider: "openai",
  apiProtocol: "openai",
  apiKey: "fixture",
  apiUrl: "https://example.com/v1",
  model: "test-model",
};
const messages = [{ role: "user" as const, content: "Hello" }];
const jsonReply = {
  ok: true,
  status: 200,
  statusText: "OK",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    choices: [{ message: { content: "Complete answer" } }],
  }),
};

describe("stream-first chat compatibility", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    installWindowMocks();
  });

  it("handles the browser transport's unsupported response before reading SSE", async () => {
    vi.stubGlobal("window", undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"error":{"message":"stream must be false"}}', {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(jsonReply.body, { headers: jsonReply.headers }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      chatCompletion(config, messages, { stream: true }),
    ).resolves.toMatchObject({ content: "Complete answer" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).stream).toBe(false);
  });

  it("uses JSON returned to a browser stream request without another request", async () => {
    vi.stubGlobal("window", undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(jsonReply.body, { headers: jsonReply.headers }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      chatCompletion(config, messages, { stream: true }),
    ).resolves.toMatchObject({ content: "Complete answer" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves explicit stream mode against conflicting custom parameters", async () => {
    vi.mocked(window.api.ai.requestStream).mockResolvedValue(jsonReply);
    await chatCompletion(
      { ...config, chatParams: { customParams: { stream: false } } },
      messages,
      { stream: true },
    );
    expect(
      JSON.parse(
        vi.mocked(window.api.ai.requestStream).mock.calls[0][0].body || "{}",
      ).stream,
    ).toBe(true);
  });

  it("can fall back after fixing a token parameter incompatibility", async () => {
    vi.mocked(window.api.ai.requestStream)
      .mockResolvedValueOnce({
        ...jsonReply,
        ok: false,
        status: 400,
        body: JSON.stringify({
          error: { message: "'max_completion_tokens' is not supported" },
        }),
      })
      .mockResolvedValueOnce({
        ...jsonReply,
        ok: false,
        status: 422,
        body: JSON.stringify({
          error: { message: "This model does not support streaming" },
        }),
      });
    vi.mocked(window.api.ai.request).mockResolvedValue(jsonReply);
    await expect(
      chatCompletion(config, messages, { stream: true }),
    ).resolves.toMatchObject({ content: "Complete answer" });
    expect(window.api.ai.requestStream).toHaveBeenCalledTimes(2);
    expect(window.api.ai.request).toHaveBeenCalledTimes(1);
  });

  it("does not retry again when non-streaming also fails", async () => {
    const unsupported = {
      ...jsonReply,
      ok: false,
      status: 400,
      body: JSON.stringify({
        error: { message: "Streaming is not supported" },
      }),
    };
    vi.mocked(window.api.ai.requestStream).mockResolvedValue(unsupported);
    vi.mocked(window.api.ai.request).mockResolvedValue(unsupported);
    await expect(
      chatCompletion(config, messages, { stream: true }),
    ).rejects.toThrow("Streaming is not supported");
    expect(window.api.ai.request).toHaveBeenCalledTimes(1);
  });

  it("uses a direct JSON response without generating twice", async () => {
    vi.mocked(window.api.ai.requestStream).mockResolvedValue(jsonReply);
    await expect(
      chatCompletion(config, messages, { stream: true }),
    ).resolves.toMatchObject({ content: "Complete answer" });
    expect(window.api.ai.request).not.toHaveBeenCalled();
  });

  it("retries once without streaming only after an explicit unsupported response", async () => {
    vi.mocked(window.api.ai.requestStream).mockResolvedValue({
      ...jsonReply,
      ok: false,
      status: 400,
      body: '{"error":{"message":"Streaming is not supported for this model"}}',
    });
    vi.mocked(window.api.ai.request).mockResolvedValue(jsonReply);
    await expect(
      chatCompletion(config, messages, { stream: true }),
    ).resolves.toMatchObject({ content: "Complete answer" });
    expect(window.api.ai.requestStream).toHaveBeenCalledTimes(1);
    expect(window.api.ai.request).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(
        vi.mocked(window.api.ai.request).mock.calls[0][0].body || "{}",
      ),
    ).toMatchObject({ stream: false });
  });

  it.each([401, 403, 429, 500, 503])(
    "does not replay status %s",
    async (status) => {
      vi.mocked(window.api.ai.requestStream).mockResolvedValue({
        ...jsonReply,
        ok: false,
        status,
        body: '{"error":{"message":"Streaming is not supported"}}',
      });
      await expect(
        chatCompletion(config, messages, { stream: true }),
      ).rejects.toThrow();
      expect(window.api.ai.request).not.toHaveBeenCalled();
    },
  );

  it("does not retry a normal validation error", async () => {
    vi.mocked(window.api.ai.requestStream).mockResolvedValue({
      ...jsonReply,
      ok: false,
      status: 400,
      body: '{"error":{"message":"Invalid messages"}}',
    });
    await expect(
      chatCompletion(config, messages, { stream: true }),
    ).rejects.toThrow("Invalid messages");
    expect(window.api.ai.request).not.toHaveBeenCalled();
  });

  it("does not replay an interrupted response after visible output", async () => {
    vi.mocked(window.api.ai.requestStream).mockImplementation(
      async (_, handlers) => {
        handlers?.onChunk?.(
          'data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n',
        );
        handlers?.onError?.("Connection interrupted");
        return {
          ...jsonReply,
          ok: false,
          status: 0,
          error: "Connection interrupted",
        };
      },
    );
    const onContent = vi.fn();
    await expect(
      chatCompletion(config, messages, {
        stream: true,
        streamCallbacks: { onContent },
      }),
    ).rejects.toThrow("Connection interrupted");
    expect(onContent).toHaveBeenCalledWith("Partial");
    expect(window.api.ai.request).not.toHaveBeenCalled();
  });

  it("accepts SSE data without a space and propagates in-stream errors", async () => {
    vi.mocked(window.api.ai.requestStream).mockImplementation(
      async (_, handlers) => {
        handlers?.onChunk?.(
          'data:{"choices":[{"delta":{"content":"First"}}]}\n\ndata: {"error":{"message":"Generation failed"}}\n\n',
        );
        return {
          ...jsonReply,
          body: "",
          headers: { "content-type": "text/event-stream" },
        };
      },
    );
    const onContent = vi.fn();
    await expect(
      chatCompletion(config, messages, {
        stream: true,
        streamCallbacks: { onContent },
      }),
    ).rejects.toThrow("Generation failed");
    expect(onContent).toHaveBeenCalledWith("First");
    expect(window.api.ai.request).not.toHaveBeenCalled();
  });

  it("requests streaming for every comparison model when requested by the test workflow", async () => {
    vi.mocked(window.api.ai.requestStream).mockResolvedValue(jsonReply);
    const result = await multiModelCompare(
      [
        { ...config, chatParams: { stream: false } },
        { ...config, model: "second" },
      ],
      messages,
      { stream: true },
    );
    expect(result.results.map((item) => item.response)).toEqual([
      "Complete answer",
      "Complete answer",
    ]);
    expect(window.api.ai.requestStream).toHaveBeenCalledTimes(2);
    expect(window.api.ai.request).not.toHaveBeenCalled();
  });
});
