import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { inspectAgentModelConfig } from "../../../src/main/services/agent-model-config";
// Native installation discovery is covered separately by the real package-layout fixture.
vi.mock("../../../src/main/services/agent-pi-native-catalog", () => ({
  readPiNativeCatalog: async () => ({}),
}));

const temporaryRoots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "prompthub-pi-catalog-"),
  );
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

function piContext(rootPath: string) {
  return { agentId: "pi", platformId: "pi", rootPath };
}

async function writeJson(root: string, name: string, value: unknown) {
  await fs.writeFile(path.join(root, name), JSON.stringify(value, null, 2));
}

describe("Pi model catalog inspect", () => {
  it("returns the catalog before the first settings file is created", async () => {
    const root = await createRoot();
    await writeJson(root, "models-store.json", {
      native: { models: [{ id: "available" }] },
    });
    const result = await inspectAgentModelConfig(piContext(root));
    expect(result.status).toBe("missing");
    expect(result.modelCatalog?.[0].models[0].id).toBe("available");
    expect(await fs.readdir(root)).toEqual(["models-store.json"]);
  });
  it("merges built-in store and user custom models with per-provider readiness", async () => {
    const rootPath = await createRoot();
    await writeJson(rootPath, "settings.json", {
      defaultProvider: "kimi-coding",
      defaultModel: "k3",
      theme: "dark",
    });
    await writeJson(rootPath, "models-store.json", {
      deepseek: {
        models: [
          {
            id: "deepseek-v4-flash",
            name: "DeepSeek V4 Flash",
            api: "openai-completions",
            baseUrl: "https://api.deepseek.com",
            reasoning: true,
            input: ["text"],
            contextWindow: 1_000_000,
            maxTokens: 384_000,
          },
        ],
        checkedAt: 1_700_000_000_000,
        lastModified: "Mon, 01 Jan 2024",
        etag: "abc",
      },
    });
    await writeJson(rootPath, "models.json", {
      providers: {
        ollama: {
          baseUrl: "http://localhost:11434/v1",
          api: "openai-completions",
          apiKey: "sk-live-secret-should-never-leak",
          models: [{ id: "llama3.1:8b" }],
        },
      },
    });
    await writeJson(rootPath, "auth.json", {
      deepseek: { type: "api_key", key: "sk-native-secret" },
    });

    const result = await inspectAgentModelConfig(piContext(rootPath));

    expect(result).toMatchObject({
      agentId: "pi",
      adapter: "pi-settings-v1",
      status: "configured",
      model: "k3",
      provider: "kimi-coding",
      canSetModel: true,
    });
    expect(result.modelCatalog).toBeDefined();
    const catalog = result.modelCatalog ?? [];
    const deepseek = catalog.find((provider) => provider.id === "deepseek");
    expect(deepseek).toMatchObject({
      source: "built-in",
      credentialReady: true,
      endpoint: "https://api.deepseek.com",
    });
    expect(deepseek?.models).toEqual([
      expect.objectContaining({
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        reasoning: true,
        contextWindow: 1_000_000,
        source: "built-in",
      }),
    ]);
    const ollama = catalog.find((provider) => provider.id === "ollama");
    expect(ollama).toMatchObject({
      source: "custom",
      credentialReady: true,
      endpoint: "http://localhost:11434/v1",
    });
    expect(ollama?.models).toEqual([
      expect.objectContaining({ id: "llama3.1:8b", source: "custom" }),
    ]);

    // Cache metadata and secrets never cross the boundary.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("etag");
    expect(serialized).not.toContain("checkedAt");
    expect(serialized).not.toContain("sk-live-secret-should-never-leak");
    expect(serialized).not.toContain("sk-native-secret");
  });

  it("marks providers without any credential as not ready", async () => {
    const rootPath = await createRoot();
    await writeJson(rootPath, "settings.json", {
      defaultProvider: "kimi-coding",
      defaultModel: "k3",
    });
    await writeJson(rootPath, "models-store.json", {
      "kimi-coding": {
        models: [{ id: "k3", name: "K3" }],
      },
    });
    await writeJson(rootPath, "auth.json", {});

    const result = await inspectAgentModelConfig(piContext(rootPath));
    const kimi = result.modelCatalog?.find(
      (provider) => provider.id === "kimi-coding",
    );
    expect(kimi?.credentialReady).toBe(false);
  });

  it("merges a custom provider overriding a built-in id", async () => {
    const rootPath = await createRoot();
    await writeJson(rootPath, "settings.json", { defaultModel: "k3" });
    await writeJson(rootPath, "models-store.json", {
      ollama: { models: [{ id: "builtin-model" }] },
    });
    await writeJson(rootPath, "models.json", {
      providers: {
        ollama: {
          baseUrl: "http://localhost:11434/v1",
          api: "openai-completions",
          models: [{ id: "custom-model" }, { id: "builtin-model" }],
        },
      },
    });

    const result = await inspectAgentModelConfig(piContext(rootPath));
    const ollama = result.modelCatalog?.find(
      (provider) => provider.id === "ollama",
    );
    expect(ollama?.source).toBe("custom");
    const ids = ollama?.models.map((model) => model.id) ?? [];
    expect(ids).toContain("builtin-model");
    expect(ids).toContain("custom-model");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps working when catalog files are missing or malformed", async () => {
    const rootPath = await createRoot();
    await writeJson(rootPath, "settings.json", {
      defaultProvider: "anthropic",
      defaultModel: "claude-sonnet-4-5",
    });

    const missingOnly = await inspectAgentModelConfig(piContext(rootPath));
    expect(missingOnly).toMatchObject({
      status: "configured",
      model: "claude-sonnet-4-5",
    });
    expect(missingOnly.modelCatalog).toEqual([]);

    await fs.writeFile(
      path.join(rootPath, "models-store.json"),
      "{ not valid json",
    );
    await fs.writeFile(path.join(rootPath, "models.json"), "{ broken");
    await fs.writeFile(path.join(rootPath, "auth.json"), "not json either");

    const degraded = await inspectAgentModelConfig(piContext(rootPath));
    expect(degraded).toMatchObject({
      status: "configured",
      model: "claude-sonnet-4-5",
      provider: "anthropic",
    });
    expect(degraded.modelCatalog).toEqual([]);
  });

  it("rejects symlinked catalog files without touching other files", async () => {
    const rootPath = await createRoot();
    await writeJson(rootPath, "settings.json", { defaultModel: "k3" });
    const outside = await createRoot();
    await writeJson(outside, "secret-store.json", {
      evil: { models: [{ id: "x" }] },
    });
    await fs.symlink(
      path.join(outside, "secret-store.json"),
      path.join(rootPath, "models-store.json"),
    );

    const result = await inspectAgentModelConfig(piContext(rootPath));
    expect(result.status).toBe("configured");
    expect(result.modelCatalog).toEqual([]);
  });

  it("preserves every legal provider and Unicode model id", async () => {
    const rootPath = await createRoot();
    await writeJson(rootPath, "settings.json", { defaultModel: "m" });
    const huge: Record<string, unknown> = {};
    for (let index = 0; index < 200; index += 1) {
      huge[`provider-${index}`] = {
        models: Array.from({ length: 20 }, (_, modelIndex) => ({
          id: `模型-${index}-${modelIndex}-🚀`,
        })),
      };
    }
    await writeJson(rootPath, "models-store.json", huge);

    const result = await inspectAgentModelConfig(piContext(rootPath));
    const catalog = result.modelCatalog ?? [];
    expect(catalog).toHaveLength(Object.keys(huge).length);
    const totalModels = catalog.reduce(
      (count, provider) => count + provider.models.length,
      0,
    );
    expect(totalModels).toBe(Object.values(huge).length * 20);
    const unicode = catalog
      .flatMap((provider) => provider.models)
      .find((model) => model.id.includes("🚀"));
    expect(unicode?.id).toContain("模型-");
  });

  it("never returns an inline apiKey even when it contains an env reference", async () => {
    vi.stubEnv("GEMINI_API_KEY", "synthetic-env-key");
    const rootPath = await createRoot();
    await writeJson(rootPath, "settings.json", { defaultModel: "g4" });
    await writeJson(rootPath, "models.json", {
      providers: {
        "my-google": {
          baseUrl: "https://generativelanguage.googleapis.com/v1beta",
          api: "google-generative-ai",
          apiKey: "$GEMINI_API_KEY",
          models: [{ id: "gemma-4-31b-it" }],
        },
      },
    });

    const result = await inspectAgentModelConfig(piContext(rootPath));
    const google = result.modelCatalog?.find(
      (provider) => provider.id === "my-google",
    );
    // Only resolved references count as configured credentials.
    expect(google?.credentialReady).toBe(true);
    expect(JSON.stringify(result)).not.toContain("GEMINI_API_KEY");
  });

  it("skips malformed entries without truncating valid models", async () => {
    const rootPath = await createRoot();
    await writeJson(rootPath, "settings.json", { defaultModel: "k3" });
    await writeJson(rootPath, "models-store.json", {
      "not-a-record": "broken",
      "": { models: [{ id: "empty-provider" }] },
      "bad-models": { models: "nope" },
      "bad-entries": {
        models: [
          "just-a-string",
          { id: 123 },
          { id: "" },
          { id: "bad\tid" },
          { id: "x".repeat(600) },
          { id: "valid-model" },
        ],
      },
      bounded: {
        models: Array.from({ length: 80 }, (_, index) => ({
          id: `bounded-${index}`,
        })),
      },
    });
    await writeJson(rootPath, "models.json", {
      providers: {
        "still-not-a-record": 42,
        "": { models: [{ id: "empty" }] },
        "no-models": { baseUrl: "http://localhost:1/v1" },
      },
    });
    await writeJson(rootPath, "auth.json", {
      "keyless-api-key": { type: "api_key" },
      "oauth-provider": { type: "oauth" },
    });

    const result = await inspectAgentModelConfig(piContext(rootPath));
    const catalog = result.modelCatalog ?? [];
    expect(
      catalog.find((provider) => provider.id === "not-a-record"),
    ).toBeUndefined();
    expect(catalog.find((provider) => provider.id === "")).toBeUndefined();
    expect(
      catalog.find((provider) => provider.id === "bad-models"),
    ).toBeDefined();

    const badEntries = catalog.find(
      (provider) => provider.id === "bad-entries",
    );
    expect(badEntries?.models.map((model) => model.id)).toEqual([
      "valid-model",
    ]);

    const bounded = catalog.find((provider) => provider.id === "bounded");
    expect(bounded?.models).toHaveLength(80);

    const noModels = catalog.find((provider) => provider.id === "no-models");
    expect(noModels).toMatchObject({ source: "custom", models: [] });
    expect(
      catalog.find((provider) => provider.id === "still-not-a-record"),
    ).toBeUndefined();
  });

  it("preserves custom entries beyond the former provider cap", async () => {
    const rootPath = await createRoot();
    await writeJson(rootPath, "settings.json", { defaultModel: "k3" });
    const store: Record<string, unknown> = {};
    for (let index = 0; index < 64; index += 1) {
      store[`store-${index}`] = { models: [{ id: "m" }] };
    }
    await writeJson(rootPath, "models-store.json", store);
    await writeJson(rootPath, "models.json", {
      providers: {
        "custom-overflow": {
          baseUrl: "http://localhost:11434/v1",
          models: [{ id: "overflow-model" }],
        },
        "store-0": { models: [{ id: "merged-model" }] },
      },
    });

    const result = await inspectAgentModelConfig(piContext(rootPath));
    const catalog = result.modelCatalog ?? [];
    expect(catalog).toHaveLength(Object.keys(store).length + 1);
    expect(
      catalog.find((provider) => provider.id === "custom-overflow"),
    ).toMatchObject({ models: [{ id: "overflow-model", source: "custom" }] });
    const merged = catalog.find((provider) => provider.id === "store-0");
    expect(merged?.models.map((model) => model.id)).toEqual([
      "m",
      "merged-model",
    ]);
  });
});
