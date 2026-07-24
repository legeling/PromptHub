import { afterEach, describe, expect, it, vi } from "vitest";

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
  vi.unstubAllGlobals();
});

describe("shared AI protocol derivation", () => {
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
    [
      "openai",
      "https://api.atlascloud.ai/v1",
      "https://api.atlascloud.ai/v1/chat/completions",
    ],
  ] as const)("builds the %s chat endpoint", (protocol, input, expected) => {
    expect(
      buildChatEndpointFromBase(resolveProtocolBase(input, protocol)),
    ).toBe(expected);
  });

  it("builds the Atlas Cloud OpenAI-compatible model discovery endpoint", () => {
    expect(
      buildModelsEndpointFromBase(
        resolveProtocolBase("https://api.atlascloud.ai/v1", "openai"),
      ),
    ).toBe("https://api.atlascloud.ai/v1/models");
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
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: "safe" }] }),
      text: async () => "",
    });
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
  });
});
