import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_REQUEST_TIMEOUT_MS } from "@prompthub/shared/constants/ai";

import {
  buildChatEndpointFromBase,
  buildHeadersForProtocol,
  buildModelsEndpointFromBase,
  getBaseUrl,
  normalizeApiUrlInput,
  resolveAIProtocol,
  resolveProtocolBase,
} from "@prompthub/shared/utils/ai-protocol";
import { chatCompletion } from "../src/ai-client";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("shared AI protocol derivation", () => {
  it("delegates the shared deadline to an injected transport without starting a fetch timer", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => { throw new Error("Default transport must not run"); });
    vi.stubGlobal("fetch", fetchMock);
    const transport = vi.fn(async () => {
      expect(vi.getTimerCount()).toBe(0);
      return { ok: true, status: 200, statusText: "OK", headers: {}, body: JSON.stringify({ choices: [{ message: { content: "Transport result" } }] }) };
    });
    await expect(chatCompletion({
      apiKey: "fixture-key", apiUrl: "https://fixture.invalid", model: "fixture-model",
      provider: "openai", apiProtocol: "openai",
    }, [{ role: "user", content: "Rewrite" }], undefined, transport)).resolves.toEqual({ content: "Transport result" });
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: AI_REQUEST_TIMEOUT_MS }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    [
      "openai",
      "https://api.example.com",
      "https://api.example.com/v1/chat/completions",
    ],
    [
      "gemini",
      "https://generativelanguage.googleapis.com",
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    ],
    [
      "anthropic",
      "https://api.anthropic.com",
      "https://api.anthropic.com/v1/messages",
    ],
  ] as const)("builds the %s chat endpoint", (protocol, input, expected) => {
    expect(
      buildChatEndpointFromBase(resolveProtocolBase(input, protocol)),
    ).toBe(expected);
  });

  it("treats a trailing hash as an exact final endpoint on every surface", () => {
    const resolved = resolveProtocolBase(
      "https://gateway.example.com/custom/messages#",
      "anthropic",
    );
    expect(buildChatEndpointFromBase(resolved)).toBe(
      "https://gateway.example.com/custom/messages",
    );
    expect(buildModelsEndpointFromBase(resolved)).toBe(
      "https://gateway.example.com/custom/messages",
    );
  });

  it("normalizes complete endpoints while preserving the exact marker", () => {
    expect(getBaseUrl("https://api.example.com/v1/chat/completions")).toBe(
      "https://api.example.com/v1",
    );
    expect(
      normalizeApiUrlInput("https://api.example.com/v1/chat/completions#"),
    ).toBe("https://api.example.com/v1#");
  });

  it("uses protocol-specific authentication without inferring from host alone", () => {
    expect(buildHeadersForProtocol("anthropic", "secret")).toMatchObject({
      "x-api-key": "secret",
      "anthropic-version": "2023-06-01",
    });
    expect(
      buildHeadersForProtocol("gemini", "secret", {
        useNativeGeminiAuth: true,
      }),
    ).toMatchObject({ "x-goog-api-key": "secret" });
    expect(buildHeadersForProtocol("gemini", "secret")).toMatchObject({
      Authorization: "Bearer secret",
    });
  });

  it("keeps explicit protocols authoritative and only infers legacy configs", () => {
    expect(
      resolveAIProtocol({
        apiProtocol: "openai",
        provider: "google",
        apiUrl: "https://generativelanguage.googleapis.com",
      }),
    ).toBe("openai");
    expect(
      resolveAIProtocol({
        apiProtocol: undefined,
        provider: "anthropic",
        apiUrl: "https://proxy.example.com",
      }),
    ).toBe("anthropic");
  });

  it("uses the shared exact-endpoint policy in the core AI client", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ content: [{ type: "text", text: "safe" }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      chatCompletion(
        {
          provider: "anthropic",
          apiProtocol: "anthropic",
          apiKey: "secret",
          apiUrl: "https://gateway.example.com/custom/messages#",
          model: "claude-test",
        },
        [{ role: "user", content: "Review" }],
      ),
    ).resolves.toEqual({ content: "safe" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example.com/custom/messages",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-api-key": "secret",
          "anthropic-version": "2023-06-01",
        }),
      }),
    );
    const signal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;
    expect(signal.aborted).toBe(false);
  });

  it("aborts the core AI client at the shared deadline", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.fn().mockImplementation((_url, init: RequestInit) => {
      requestSignal = init.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        requestSignal?.addEventListener(
          "abort",
          () => reject(requestSignal?.reason),
          { once: true },
        );
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = chatCompletion(
      {
        provider: "openai",
        apiProtocol: "openai",
        apiKey: "secret",
        apiUrl: "https://api.example.com",
        model: "slow-model",
      },
      [{ role: "user", content: "Review" }],
    );
    const timeoutExpectation = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });

    await vi.advanceTimersByTimeAsync(AI_REQUEST_TIMEOUT_MS - 1);
    expect(requestSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await timeoutExpectation;
  });
});
