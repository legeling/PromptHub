import type { CreateAgentProviderProfileRequest } from "@prompthub/shared";
import { describe, expect, it, vi } from "vitest";

import type { CoreAIConfigFile } from "@prompthub/core";
import type {
  AgentPiWriteResult,
  AgentProviderProfilePublic,
} from "@prompthub/shared";
import { createAgentProviderSourceService } from "../../../src/main/services/agent-provider-source-service";

const CREATED_PROFILE: AgentProviderProfilePublic = {
  id: "profile-imported",
  platformId: "codex",
  name: "Work Gateway",
  providerKind: "openai-compatible",
  protocol: "openai-responses",
  endpoint: "https://gateway.example.com/v1",
  config: { providerId: "provider-work" },
  source: "import",
  archived: false,
  createdAt: 1,
  updatedAt: 1,
  modelMappings: [],
  secretState: "available",
};

function config(): CoreAIConfigFile {
  return {
    kind: "prompthub-ai-config",
    version: 1,
    updatedAt: "2026-08-01T00:00:00.000Z",
    providers: [
      {
        id: "provider-work",
        name: "Work Gateway",
        provider: "openai-compatible",
        apiProtocol: "openai",
        apiKey: "provider-secret",
        apiUrl: "https://gateway.example.com/v1",
      },
      {
        id: "provider-anthropic",
        name: "Anthropic Direct",
        provider: "anthropic",
        apiProtocol: "anthropic",
        apiKey: "anthropic-secret",
        apiUrl: "https://api.anthropic.com",
      },
      {
        id: "provider-empty",
        name: "No Models",
        provider: "openai",
        apiProtocol: "openai",
        apiKey: "",
        apiUrl: "https://empty.example.com/v1",
      },
    ],
    models: [
      {
        id: "model-chat",
        providerId: "provider-work",
        provider: "openai-compatible",
        apiProtocol: "openai",
        apiKey: "",
        apiUrl: "https://gateway.example.com/v1",
        model: "gpt-work",
        name: "GPT Work",
        type: "chat",
        isDefault: true,
      },
      {
        id: "model-image",
        providerId: "provider-work",
        provider: "openai-compatible",
        apiProtocol: "openai",
        apiKey: "image-secret",
        apiUrl: "https://gateway.example.com/v1",
        model: "image-work",
        type: "image",
      },
      {
        id: "model-anthropic",
        providerId: "provider-anthropic",
        provider: "anthropic",
        apiProtocol: "anthropic",
        apiKey: "",
        apiUrl: "https://api.anthropic.com",
        model: "claude-work",
        type: "chat",
      },
    ],
    modelRouteDefaults: {},
  };
}

function harness(read = vi.fn(() => config())) {
  const create = vi.fn<
    (
      request: CreateAgentProviderProfileRequest,
    ) => Promise<typeof CREATED_PROFILE>
  >(async () => CREATED_PROFILE);
  const importPiProvider = vi.fn(
    async (): Promise<AgentPiWriteResult> => ({ backupPath: null }),
  );
  return {
    read,
    create,
    importPiProvider,
    service: createAgentProviderSourceService({
      readConfig: read,
      createProfile: create,
      importPiProvider,
    }),
  };
}

describe("Agent Provider source service", () => {
  it("defaults a third-party Claude import to Bearer without changing its source", async () => {
    const source = config();
    source.providers[1].apiUrl = "https://gateway.example.com/apps/anthropic";
    source.models[2].apiUrl = source.providers[1].apiUrl;
    const before = structuredClone(source);
    const { service, create } = harness(vi.fn(() => source));
    await service.importSource({
      platformId: "claude",
      sourceId: "provider-anthropic",
      modelId: "model-anthropic",
      protocol: "anthropic-messages",
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          config: { credentialEnvKey: "ANTHROPIC_AUTH_TOKEN" },
        }),
      }),
    );
    expect(source).toEqual(before);
  });

  it.each(["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"] as const)(
    "imports a custom Claude gateway with explicit %s authentication",
    async (credentialEnvKey) => {
      const source = config();
      source.providers[1].provider = "custom-vendor-label";
      const { service, create } = harness(vi.fn(() => source));
      await service.importSource({
        platformId: "claude",
        sourceId: "provider-anthropic",
        modelId: "model-anthropic",
        protocol: "anthropic-messages",
        credentialEnvKey,
      });
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          profile: expect.objectContaining({
            providerKind: "anthropic-compatible",
            config: { credentialEnvKey },
          }),
          secret: "anthropic-secret",
        }),
      );
    },
  );

  it("rejects a Claude credential selection for another platform", async () => {
    const { service, create } = harness();
    await expect(
      service.importSource({
        platformId: "codex",
        sourceId: "provider-work",
        modelId: "model-chat",
        protocol: "openai-responses",
        credentialEnvKey: "ANTHROPIC_AUTH_TOKEN",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_SOURCE_INPUT_INVALID");
    expect(create).not.toHaveBeenCalled();
  });

  it("lists redacted PromptHub providers and filters non-chat models", () => {
    const { service } = harness();

    const candidates = service.list("codex");

    expect(candidates).toEqual([
      expect.objectContaining({
        sourceId: "provider-work",
        name: "Work Gateway",
        protocol: "openai-responses",
        protocols: ["openai-responses"],
        compatible: true,
        credentialReady: true,
        models: [
          {
            id: "model-chat",
            name: "GPT Work",
            model: "gpt-work",
            isDefault: true,
          },
        ],
      }),
      expect.objectContaining({
        sourceId: "provider-anthropic",
        compatible: false,
        incompatibility: "protocol-unsupported",
      }),
      expect.objectContaining({
        sourceId: "provider-empty",
        compatible: false,
        incompatibility: "no-chat-model",
      }),
    ]);
    expect(JSON.stringify(candidates)).not.toContain("provider-secret");
    expect(JSON.stringify(candidates)).not.toContain("anthropic-secret");
    expect(JSON.stringify(candidates)).not.toContain("image-secret");
  });

  it("recommends the native Responses protocol for the official OpenAI endpoint", () => {
    const source = config();
    source.providers[0].provider = "openai";
    source.providers[0].apiUrl = "https://api.openai.com/v1";
    source.models[0].provider = "openai";
    source.models[0].apiUrl = "https://api.openai.com/v1";
    const { service } = harness(vi.fn(() => source));

    expect(service.list("codex")[0]).toEqual(
      expect.objectContaining({
        protocol: "openai-responses",
        protocols: ["openai-responses"],
      }),
    );
    expect(service.list("opencode")[0]).toEqual(
      expect.objectContaining({
        protocol: "openai-responses",
        protocols: ["openai-responses", "openai-chat"],
      }),
    );
    expect(service.list("pi")[0]).toEqual(
      expect.objectContaining({
        protocol: "openai-responses",
        protocols: ["openai-responses", "openai-completions"],
      }),
    );
  });

  it("rejects stale linked models whose protocol or endpoint no longer matches", () => {
    const source = config();
    source.models.push(
      {
        ...source.models[0],
        id: "model-wrong-protocol",
        apiProtocol: "anthropic",
        model: "claude-stale",
      },
      {
        ...source.models[0],
        id: "model-wrong-endpoint",
        apiUrl: "https://other.example.com/v1",
        model: "gpt-stale",
      },
    );
    const { service } = harness(vi.fn(() => source));

    expect(service.list("codex")[0].models.map((model) => model.id)).toEqual([
      "model-chat",
    ]);
  });

  it("accepts legacy model links by matching provider identity", () => {
    const source = config();
    delete source.models[0].providerId;
    const { service } = harness(vi.fn(() => source));

    expect(service.list("codex")[0].models).toEqual([
      expect.objectContaining({ id: "model-chat" }),
    ]);
  });

  it("keeps an invalid official OpenAI endpoint non-importable", () => {
    const source = config();
    source.providers[0].provider = "openai";
    source.providers[0].apiUrl = "://invalid";
    source.models[0].provider = "openai";
    source.models[0].apiUrl = "://invalid";
    const { service } = harness(vi.fn(() => source));

    expect(service.list("codex")[0]).toEqual(
      expect.objectContaining({
        compatible: false,
        incompatibility: "invalid-endpoint",
      }),
    );
  });

  it("falls back to provider identity when a source has no display name", () => {
    const source = config();
    delete source.providers[0].name;
    const { service } = harness(vi.fn(() => source));

    expect(service.list("claude")[0]).toEqual(
      expect.objectContaining({
        name: "openai-compatible",
        protocol: null,
        protocols: [],
        incompatibility: "protocol-unsupported",
      }),
    );
  });

  it("imports a compatible source as an independent Profile with a main-only secret", async () => {
    const { service, create, read } = harness();

    const result = await service.importSource({
      platformId: "codex",
      sourceId: "provider-work",
      modelId: "model-chat",
      protocol: "openai-responses",
    });

    expect(read).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      profile: {
        platformId: "codex",
        name: "Work Gateway",
        providerKind: "openai-compatible",
        protocol: "openai-responses",
        endpoint: "https://gateway.example.com/v1",
        config: { providerId: "provider-work" },
        source: "import",
      },
      modelMappings: [
        { routeKey: "primary", modelId: "gpt-work", parameters: {} },
      ],
      secret: "provider-secret",
    });
    expect(result).toBe(CREATED_PROFILE);
  });

  it("rejects a protocol that is not supported by the destination Agent", async () => {
    const { service, create } = harness();

    await expect(
      service.importSource({
        platformId: "codex",
        sourceId: "provider-work",
        modelId: "model-chat",
        protocol: "anthropic-messages",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_SOURCE_PROTOCOL_UNSUPPORTED");
    expect(create).not.toHaveBeenCalled();
  });

  it("uses the selected model credential when the provider has no key", async () => {
    const source = config();
    source.providers[0].apiKey = "";
    source.models[0].apiKey = "model-secret";
    const { service, create } = harness(vi.fn(() => source));

    await service.importSource({
      platformId: "codex",
      sourceId: "provider-work",
      modelId: "model-chat",
      protocol: "openai-responses",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ secret: "model-secret" }),
    );
  });

  it("imports a credential-free source without synthesizing a secret", async () => {
    const source = config();
    delete source.providers[0].name;
    source.providers[0].apiKey = "";
    source.models[0].apiKey = "";
    const { service, create } = harness(vi.fn(() => source));

    await service.importSource({
      platformId: "codex",
      sourceId: "provider-work",
      modelId: "model-chat",
      protocol: "openai-responses",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({ name: "openai-compatible" }),
      }),
    );
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty("secret");
  });

  it("imports supported platform fields and refuses retired Gemini and Qwen targets", async () => {
    const source = config();
    source.providers.push({
      id: "provider-gemini",
      name: "Gemini",
      provider: "gemini",
      apiProtocol: "gemini",
      apiKey: "gemini-secret",
      apiUrl: "https://generativelanguage.googleapis.com",
    });
    source.models.push({
      id: "model-gemini",
      providerId: "provider-gemini",
      provider: "gemini",
      apiProtocol: "gemini",
      apiKey: "",
      apiUrl: "https://generativelanguage.googleapis.com",
      model: "gemini-work",
      type: "chat",
    });
    const { service, create } = harness(vi.fn(() => source));

    expect(
      service.list("codex").find((item) => item.sourceId === "provider-gemini"),
    ).toEqual(
      expect.objectContaining({
        compatible: false,
        incompatibility: "protocol-unsupported",
      }),
    );

    await service.importSource({
      platformId: "claude",
      sourceId: "provider-anthropic",
      modelId: "model-anthropic",
      protocol: "anthropic-messages",
    });
    await expect(
      service.importSource({
        platformId: "gemini",
        sourceId: "provider-gemini",
        modelId: "model-gemini",
        protocol: "google-generative-ai",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_SOURCE_INCOMPATIBLE");
    await service.importSource({
      platformId: "opencode",
      sourceId: "provider-work",
      modelId: "model-chat",
      protocol: "openai-chat",
    });
    await service.importSource({
      platformId: "opencode",
      sourceId: "provider-work",
      modelId: "model-chat",
      protocol: "openai-responses",
    });
    await expect(
      service.importSource({
        platformId: "qwen",
        sourceId: "provider-anthropic",
        modelId: "model-anthropic",
        protocol: "anthropic-messages",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_SOURCE_INCOMPATIBLE");

    expect(create.mock.calls.map(([request]) => request.profile)).toEqual([
      expect.objectContaining({
        protocol: "anthropic-messages",
        config: { credentialEnvKey: "ANTHROPIC_API_KEY" },
      }),
      expect.objectContaining({
        protocol: "openai-chat",
        config: {
          providerId: "provider-work",
          package: "@ai-sdk/openai-compatible",
        },
      }),
      expect.objectContaining({
        providerKind: "openai",
        protocol: "openai-responses",
        config: {
          providerId: "provider-work",
          package: "@ai-sdk/openai",
        },
      }),
    ]);
  });

  it("projects PromptHub providers into Pi native catalog inputs", async () => {
    const source = config();
    source.models[0].capabilities = { reasoning: true };
    const { service, importPiProvider } = harness(vi.fn(() => source));

    expect(service.list("pi")[0]).toEqual(
      expect.objectContaining({
        compatible: true,
        protocol: "openai-completions",
        protocols: ["openai-completions", "openai-responses"],
      }),
    );
    const result = await service.importPiSource({
      platformId: "pi",
      sourceId: "provider-work",
      modelId: "model-chat",
      protocol: "openai-completions",
    });

    expect(importPiProvider).toHaveBeenCalledWith({
      provider: {
        providerId: "provider-work",
        baseUrl: "https://gateway.example.com/v1",
        api: "openai-completions",
        models: [{ id: "gpt-work", name: "GPT Work", reasoning: true }],
      },
      secret: "provider-secret",
    });
    expect(result).toEqual({ backupPath: null });
    expect(JSON.stringify(service.list("pi"))).not.toContain("provider-secret");
  });

  it("imports an OpenAI-compatible source through Pi Responses when selected", async () => {
    const { service, importPiProvider } = harness();

    await service.importPiSource({
      platformId: "pi",
      sourceId: "provider-work",
      modelId: "model-chat",
      protocol: "openai-responses",
    });

    expect(importPiProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: expect.objectContaining({ api: "openai-responses" }),
      }),
    );
  });

  it("normalizes a PromptHub source id into a safe Pi provider id", async () => {
    const source = config();
    source.providers[0].id = "My Provider!";
    source.models[0].providerId = "My Provider!";
    const { service, importPiProvider } = harness(vi.fn(() => source));

    await service.importPiSource({
      platformId: "pi",
      sourceId: "My Provider!",
      modelId: "model-chat",
      protocol: "openai-completions",
    });

    expect(importPiProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: expect.objectContaining({ providerId: "my-provider" }),
      }),
    );
  });

  it("avoids overwriting Pi's reserved OpenAI provider id", async () => {
    const source = config();
    source.providers[0].id = "openai";
    source.models[0].providerId = "openai";
    const { service, importPiProvider } = harness(vi.fn(() => source));

    await service.importPiSource({
      platformId: "pi",
      sourceId: "openai",
      modelId: "model-chat",
      protocol: "openai-completions",
    });

    expect(importPiProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: expect.objectContaining({
          providerId: "openai-prompthub",
        }),
      }),
    );
  });

  it("maps every supported PromptHub protocol to the Pi native API", () => {
    const source = config();
    source.providers.push({
      id: "provider-gemini",
      name: "Gemini",
      provider: "gemini",
      apiProtocol: "gemini",
      apiKey: "gemini-secret",
      apiUrl: "https://generativelanguage.googleapis.com",
    });
    source.models.push({
      id: "model-gemini",
      providerId: "provider-gemini",
      provider: "gemini",
      apiProtocol: "gemini",
      apiKey: "",
      apiUrl: "https://generativelanguage.googleapis.com",
      model: "gemini-work",
      type: "chat",
    });
    const { service } = harness(vi.fn(() => source));
    const byId = Object.fromEntries(
      service.list("pi").map((candidate) => [candidate.sourceId, candidate]),
    );

    expect(byId["provider-work"].protocol).toBe("openai-completions");
    expect(byId["provider-anthropic"].protocol).toBe("anthropic-messages");
    expect(byId["provider-gemini"].protocol).toBe("google-generative-ai");
  });

  it("fails closed before a Pi native import when the request is stale", async () => {
    const { service, importPiProvider } = harness();

    await expect(
      service.importPiSource({
        platformId: "codex",
        sourceId: "provider-work",
        modelId: "model-chat",
        protocol: "openai-completions",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_SOURCE_INCOMPATIBLE");
    await expect(
      service.importPiSource({
        platformId: "pi",
        sourceId: "missing",
        modelId: "model-chat",
        protocol: "openai-completions",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_SOURCE_NOT_FOUND");
    await expect(
      service.importPiSource({
        platformId: "pi",
        sourceId: "provider-work",
        modelId: "missing",
        protocol: "openai-completions",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_SOURCE_MODEL_NOT_FOUND");
    await expect(
      service.importPiSource({
        platformId: "pi",
        sourceId: "provider-work",
        modelId: "model-chat",
        protocol: "openai-chat",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_SOURCE_PROTOCOL_UNSUPPORTED");
    await expect(
      service.importPiSource({
        platformId: "pi",
        sourceId: "provider-empty",
        modelId: "model-chat",
        protocol: "openai-completions",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_SOURCE_INCOMPATIBLE");
    await expect(
      service.importSource({
        platformId: "pi",
        sourceId: "provider-work",
        modelId: "model-chat",
        protocol: "openai-completions",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_SOURCE_INCOMPATIBLE");
    expect(importPiProvider).not.toHaveBeenCalled();
  });

  it("rejects a Pi source whose id cannot become a native provider id", async () => {
    const source = config();
    source.providers[0].id = "---";
    source.models[0].providerId = "---";
    const { service, importPiProvider } = harness(vi.fn(() => source));

    await expect(
      service.importPiSource({
        platformId: "pi",
        sourceId: "---",
        modelId: "model-chat",
        protocol: "openai-completions",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_SOURCE_INCOMPATIBLE");
    expect(importPiProvider).not.toHaveBeenCalled();
  });

  it("fails closed for incompatible, missing and stale selections", async () => {
    const { service, create } = harness();

    await expect(
      service.importSource({
        platformId: "codex",
        sourceId: "provider-anthropic",
        modelId: "model-anthropic",
        protocol: "anthropic-messages",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_SOURCE_INCOMPATIBLE");
    await expect(
      service.importSource({
        platformId: "codex",
        sourceId: "missing",
        modelId: "model-chat",
        protocol: "openai-chat",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_SOURCE_NOT_FOUND");
    await expect(
      service.importSource({
        platformId: "codex",
        sourceId: "provider-work",
        modelId: "missing",
        protocol: "openai-responses",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_SOURCE_MODEL_NOT_FOUND");
    await expect(
      service.importSource({
        platformId: "kimi",
        sourceId: "provider-work",
        modelId: "model-chat",
        protocol: "openai-chat",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_SOURCE_INCOMPATIBLE");
    expect(create).not.toHaveBeenCalled();
  });

  it("keeps unsupported platforms and unusual source ids as non-importable metadata", () => {
    const source = config();
    source.providers[0].id = "---";
    source.models[0].providerId = "---";
    const { service } = harness(vi.fn(() => source));

    expect(service.list("kimi")[0]).toEqual(
      expect.objectContaining({
        sourceId: "---",
        compatible: false,
        incompatibility: "platform-unsupported",
      }),
    );
    expect(service.list("codex")[0]).toEqual(
      expect.objectContaining({
        sourceId: "---",
        compatible: false,
        incompatibility: "protocol-unsupported",
      }),
    );
  });

  it("validates bounded request identifiers before reading configuration", async () => {
    const { service, read } = harness();

    await expect(
      service.importSource({
        platformId: "codex\u0000",
        sourceId: "provider-work",
        modelId: "model-chat",
        protocol: "openai-chat",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_SOURCE_INPUT_INVALID");
    await expect(
      service.importSource({
        platformId: "codex",
        sourceId: "x".repeat(513),
        modelId: "model-chat",
        protocol: "openai-chat",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_SOURCE_INPUT_INVALID");
    await expect(
      service.importSource({
        platformId: "codex",
        sourceId: "provider-work",
        modelId: "model-chat",
        protocol: "",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_SOURCE_INPUT_INVALID");
    expect(read).not.toHaveBeenCalled();
  });
});
