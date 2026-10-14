import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addPiCustomModel,
  addPiCustomProvider,
  importPiCustomProvider,
  removePiCustomModel,
  removePiCustomProvider,
  setPiCredential,
  updatePiCustomModel,
  updatePiCustomProvider,
} from "../../../src/main/services/agent-pi-model-writes";
import { inspectPiModelCatalog } from "../../../src/main/services/agent-pi-model-catalog";
// Package discovery has its own real-layout test; these fixtures own only user files.
vi.mock("../../../src/main/services/agent-pi-native-catalog", () => ({
  readPiNativeCatalog: async () => ({}),
}));

const temporaryRoots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prompthub-pi-write-"));
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

function options(rootPath: string) {
  return { backupRoot: path.join(rootPath, "backups") };
}

describe("Pi custom provider writes", () => {
  it("imports a provider and managed credential as one recoverable operation", async () => {
    const rootPath = await createRoot();
    await fs.writeFile(
      path.join(rootPath, "models.json"),
      '{ "customTopLevel": true, "providers": {} }\n',
    );
    await fs.writeFile(
      path.join(rootPath, "auth.json"),
      '{ "existing": { "type": "api_key", "key": "keep" } }\n',
    );

    const result = await importPiCustomProvider(
      rootPath,
      {
        providerId: "provider-work",
        baseUrl: "https://gateway.example.com/v1",
        api: "openai-completions",
        models: [{ id: "gpt-work", name: "GPT Work", reasoning: true }],
      },
      "provider-secret",
      options(rootPath),
    );

    const models = JSON.parse(
      await fs.readFile(path.join(rootPath, "models.json"), "utf8"),
    );
    const auth = JSON.parse(
      await fs.readFile(path.join(rootPath, "auth.json"), "utf8"),
    );
    expect(models.customTopLevel).toBe(true);
    expect(models.providers["provider-work"].models).toEqual([
      { id: "gpt-work", name: "GPT Work", reasoning: true },
    ]);
    expect(JSON.stringify(models)).not.toContain("provider-secret");
    expect(auth.existing.key).toBe("keep");
    expect(auth["provider-work"]).toEqual({
      type: "api_key",
      key: "provider-secret",
    });
    expect(result).toEqual({ backupPath: expect.any(String) });
  });

  it("imports a provider without creating auth.json when no credential exists", async () => {
    const rootPath = await createRoot();

    await importPiCustomProvider(
      rootPath,
      {
        providerId: "local-models",
        baseUrl: "http://localhost:11434/v1",
        api: "openai-completions",
        models: [{ id: "llama3.1:8b" }],
      },
      undefined,
      options(rootPath),
    );

    expect(
      JSON.parse(await fs.readFile(path.join(rootPath, "models.json"), "utf8"))
        .providers["local-models"],
    ).toBeDefined();
    await expect(fs.stat(path.join(rootPath, "auth.json"))).rejects.toThrow();
  });

  it("rejects an invalid imported secret before creating either Pi file", async () => {
    const rootPath = await createRoot();

    await expect(
      importPiCustomProvider(
        rootPath,
        {
          providerId: "provider-work",
          baseUrl: "https://gateway.example.com/v1",
          api: "openai-completions",
          models: [{ id: "gpt-work" }],
        },
        "invalid\nsecret",
        options(rootPath),
      ),
    ).rejects.toThrow("AGENT_PI_SECRET_INVALID");
    await expect(fs.stat(path.join(rootPath, "models.json"))).rejects.toThrow();
    await expect(fs.stat(path.join(rootPath, "auth.json"))).rejects.toThrow();
  });

  it("aborts a Pi import before writing when auth.json changes concurrently", async () => {
    const rootPath = await createRoot();
    const modelsPath = path.join(rootPath, "models.json");
    const authPath = path.join(rootPath, "auth.json");
    await fs.writeFile(modelsPath, '{ "providers": {} }\n');
    await fs.writeFile(authPath, "{}\n");

    await expect(
      importPiCustomProvider(
        rootPath,
        {
          providerId: "provider-work",
          baseUrl: "https://gateway.example.com/v1",
          api: "openai-completions",
          models: [{ id: "gpt-work" }],
        },
        "provider-secret",
        {
          ...options(rootPath),
          hooks: {
            beforeWrite: async () => {
              await fs.writeFile(authPath, '{ "external": true }\n');
            },
          },
        },
      ),
    ).rejects.toThrow("AGENT_MODEL_CONFIG_CONCURRENT_CHANGE");
    expect(JSON.parse(await fs.readFile(modelsPath, "utf8"))).toEqual({
      providers: {},
    });
    expect(JSON.parse(await fs.readFile(authPath, "utf8"))).toEqual({
      external: true,
    });
  });

  it("rolls back both Pi files when the credential write fails", async () => {
    const rootPath = await createRoot();
    const modelsPath = path.join(rootPath, "models.json");
    const authPath = path.join(rootPath, "auth.json");
    await fs.writeFile(modelsPath, '{ "providers": {} }\n');
    await fs.writeFile(authPath, "{}\n");
    const originalModels = await fs.readFile(modelsPath, "utf8");
    const originalAuth = await fs.readFile(authPath, "utf8");

    await expect(
      importPiCustomProvider(
        rootPath,
        {
          providerId: "provider-work",
          baseUrl: "https://gateway.example.com/v1",
          api: "openai-completions",
          models: [{ id: "gpt-work" }],
        },
        "provider-secret",
        {
          ...options(rootPath),
          hooks: {
            beforeCredentialWrite: async () => {
              throw new Error("fault");
            },
          },
        },
      ),
    ).rejects.toThrow("AGENT_PI_WRITE_FAILED");
    expect(await fs.readFile(modelsPath, "utf8")).toBe(originalModels);
    expect(await fs.readFile(authPath, "utf8")).toBe(originalAuth);
  });

  it("does not write either Pi file when an imported provider already exists", async () => {
    const rootPath = await createRoot();
    const modelsPath = path.join(rootPath, "models.json");
    await fs.writeFile(
      modelsPath,
      '{ "providers": { "provider-work": { "models": [] } } }\n',
    );

    await expect(
      importPiCustomProvider(
        rootPath,
        {
          providerId: "provider-work",
          baseUrl: "https://gateway.example.com/v1",
          api: "openai-completions",
          models: [{ id: "gpt-work" }],
        },
        "provider-secret",
        options(rootPath),
      ),
    ).rejects.toThrow("AGENT_PI_PROVIDER_EXISTS");
    await expect(fs.stat(path.join(rootPath, "auth.json"))).rejects.toThrow();
  });

  it("creates models.json for a new provider and keeps it callable", async () => {
    const rootPath = await createRoot();
    const result = await addPiCustomProvider(
      rootPath,
      {
        providerId: "ollama",
        baseUrl: "http://localhost:11434/v1",
        api: "openai-completions",
        models: [{ id: "llama3.1:8b" }, { id: "qwen2.5-coder:7b" }],
      },
      options(rootPath),
    );

    expect(result.backupPath).toBeNull();
    const raw = await fs.readFile(path.join(rootPath, "models.json"), "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed.providers.ollama).toMatchObject({
      baseUrl: "http://localhost:11434/v1",
      api: "openai-completions",
    });
    expect(parsed.providers.ollama.models).toHaveLength(2);

    const catalog = await inspectPiModelCatalog(rootPath);
    const ollama = catalog.find((provider) => provider.id === "ollama");
    expect(ollama).toMatchObject({ source: "custom", credentialReady: false });
    expect(ollama?.models.map((model) => model.id)).toEqual([
      "llama3.1:8b",
      "qwen2.5-coder:7b",
    ]);
  });

  it("updates a custom provider and preserves its models and credential reference", async () => {
    const rootPath = await createRoot();
    await fs.writeFile(
      path.join(rootPath, "models.json"),
      JSON.stringify({
        providers: {
          foxcode: {
            baseUrl: "https://old.example/v1",
            api: "openai-completions",
            apiKey: "$FOXCODE_API_KEY",
            unknown: true,
            models: [{ id: "gpt-old", contextWindow: 128000 }],
          },
        },
      }),
    );

    await updatePiCustomProvider(
      rootPath,
      {
        providerId: "foxcode",
        baseUrl: "https://new.example/v1",
        api: "openai-responses",
      },
      options(rootPath),
    );

    const parsed = JSON.parse(
      await fs.readFile(path.join(rootPath, "models.json"), "utf8"),
    );
    expect(parsed.providers.foxcode).toMatchObject({
      baseUrl: "https://new.example/v1",
      api: "openai-responses",
      apiKey: "$FOXCODE_API_KEY",
      unknown: true,
      models: [{ id: "gpt-old", contextWindow: 128000 }],
    });
  });

  it("updates and renames a custom model with context, output, and reasoning", async () => {
    const rootPath = await createRoot();
    await fs.writeFile(
      path.join(rootPath, "models.json"),
      JSON.stringify({
        providers: {
          foxcode: {
            models: [{ id: "gpt-old", unknown: "preserve" }, { id: "keep-me" }],
          },
        },
      }),
    );

    await updatePiCustomModel(
      rootPath,
      "foxcode",
      {
        originalId: "gpt-old",
        id: "gpt-new",
        name: "GPT New",
        contextWindow: 400000,
        maxTokens: 128000,
        reasoning: true,
      },
      options(rootPath),
    );

    const parsed = JSON.parse(
      await fs.readFile(path.join(rootPath, "models.json"), "utf8"),
    );
    expect(parsed.providers.foxcode.models).toEqual([
      {
        id: "gpt-new",
        name: "GPT New",
        contextWindow: 400000,
        maxTokens: 128000,
        reasoning: true,
        unknown: "preserve",
      },
      { id: "keep-me" },
    ]);
  });

  it("preserves existing providers, unknown fields, and comments", async () => {
    const rootPath = await createRoot();
    await fs.writeFile(
      path.join(rootPath, "models.json"),
      [
        "{",
        "  // keep me",
        '  "customTopLevel": true,',
        '  "providers": {',
        '    "existing": {',
        '      "baseUrl": "https://api.example.com/v1",',
        '      "api": "openai-completions",',
        '      "unknownField": { "nested": [1, 2] },',
        '      "models": [{ "id": "m1" }]',
        "    }",
        "  }",
        "}",
        "",
      ].join("\n"),
    );

    await addPiCustomProvider(
      rootPath,
      {
        providerId: "added",
        baseUrl: "https://api.added.com/v1",
        api: "anthropic-messages",
        models: [{ id: "claude-custom" }],
      },
      options(rootPath),
    );

    const raw = await fs.readFile(path.join(rootPath, "models.json"), "utf8");
    expect(raw).toContain("// keep me");
    expect(raw).toContain('"customTopLevel": true');
    expect(raw).toContain('"unknownField"');
    const parsed = JSON.parse(raw.replace("// keep me", ""));
    expect(parsed.providers.existing).toBeDefined();
    expect(parsed.providers.added.api).toBe("anthropic-messages");
  });

  it("rejects invalid provider ids, endpoints, apis, and literal keys", async () => {
    const rootPath = await createRoot();
    await expect(
      addPiCustomProvider(
        rootPath,
        {
          providerId: "Bad ID",
          baseUrl: "http://localhost:1/v1",
          api: "openai-completions",
          models: [{ id: "m" }],
        },
        options(rootPath),
      ),
    ).rejects.toThrow(/AGENT_PI_/);
    await expect(
      addPiCustomProvider(
        rootPath,
        {
          providerId: "ok",
          baseUrl: "file:///etc/passwd",
          api: "openai-completions",
          models: [{ id: "m" }],
        },
        options(rootPath),
      ),
    ).rejects.toThrow(/AGENT_PI_/);
    await expect(
      addPiCustomProvider(
        rootPath,
        {
          providerId: "ok",
          baseUrl: "http://localhost:1/v1",
          api: "not-an-api" as never,
          models: [{ id: "m" }],
        },
        options(rootPath),
      ),
    ).rejects.toThrow(/AGENT_PI_/);
    await expect(
      addPiCustomProvider(
        rootPath,
        {
          providerId: "ok",
          baseUrl: "http://localhost:1/v1",
          api: "openai-completions",
          apiKeyRef: "sk-literal-not-allowed",
          models: [{ id: "m" }],
        },
        options(rootPath),
      ),
    ).rejects.toThrow(/AGENT_PI_/);
    await expect(
      addPiCustomProvider(
        rootPath,
        {
          providerId: "ok",
          baseUrl: "http://localhost:1/v1",
          api: "openai-completions",
          models: [],
        },
        options(rootPath),
      ),
    ).rejects.toThrow(/AGENT_PI_/);
    expect(
      await fs
        .stat(path.join(rootPath, "models.json"))
        .then(() => true)
        .catch(() => false),
    ).toBe(false);
  });

  it("supports $ENV key references and marks the provider ready", async () => {
    vi.stubEnv("GEMINI_API_KEY", "synthetic-env-key");
    const rootPath = await createRoot();
    await addPiCustomProvider(
      rootPath,
      {
        providerId: "my-google",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        api: "google-generative-ai",
        apiKeyRef: "$GEMINI_API_KEY",
        models: [{ id: "gemma-4-31b-it" }],
      },
      options(rootPath),
    );
    const catalog = await inspectPiModelCatalog(rootPath);
    const google = catalog.find((provider) => provider.id === "my-google");
    expect(google?.credentialReady).toBe(true);
    expect(JSON.stringify(catalog)).not.toContain("GEMINI_API_KEY");
  });

  it("rolls back when the file changes between read and write", async () => {
    const rootPath = await createRoot();
    const target = path.join(rootPath, "models.json");
    await fs.writeFile(target, '{ "providers": {} }\n');
    const original = await fs.readFile(target, "utf8");

    await expect(
      addPiCustomProvider(
        rootPath,
        {
          providerId: "race",
          baseUrl: "http://localhost:1/v1",
          api: "openai-completions",
          models: [{ id: "m" }],
        },
        {
          backupRoot: path.join(rootPath, "backups"),
          hooks: {
            beforeWrite: async () => {
              await fs.writeFile(
                target,
                '{ "providers": { "external": {} } }\n',
              );
            },
          },
        },
      ),
    ).rejects.toThrow(/AGENT_MODEL_CONFIG_CONCURRENT_CHANGE/);
    expect(await fs.readFile(target, "utf8")).not.toBe(original);
    const parsed = JSON.parse(await fs.readFile(target, "utf8"));
    expect(parsed.providers.race).toBeUndefined();
  });
});

describe("Pi custom model writes", () => {
  it("appends a model to an existing custom provider", async () => {
    const rootPath = await createRoot();
    await addPiCustomProvider(
      rootPath,
      {
        providerId: "ollama",
        baseUrl: "http://localhost:11434/v1",
        api: "openai-completions",
        models: [{ id: "llama3.1:8b" }],
      },
      options(rootPath),
    );

    await addPiCustomModel(
      rootPath,
      "ollama",
      { id: "qwen2.5-coder:7b", name: "Qwen Coder", contextWindow: 128000 },
      options(rootPath),
    );

    const catalog = await inspectPiModelCatalog(rootPath);
    const ollama = catalog.find((provider) => provider.id === "ollama");
    expect(ollama?.models.map((model) => model.id)).toEqual([
      "llama3.1:8b",
      "qwen2.5-coder:7b",
    ]);
    expect(ollama?.models[1]).toMatchObject({
      name: "Qwen Coder",
      contextWindow: 128000,
    });
  });

  it("rejects duplicate ids and models for built-in providers", async () => {
    const rootPath = await createRoot();
    await addPiCustomProvider(
      rootPath,
      {
        providerId: "ollama",
        baseUrl: "http://localhost:11434/v1",
        api: "openai-completions",
        models: [{ id: "m1" }],
      },
      options(rootPath),
    );
    await expect(
      addPiCustomModel(rootPath, "ollama", { id: "m1" }, options(rootPath)),
    ).rejects.toThrow(/AGENT_PI_/);
    await expect(
      addPiCustomModel(rootPath, "missing", { id: "m" }, options(rootPath)),
    ).rejects.toThrow(/AGENT_PI_/);
  });

  it("removes a model and drops the provider when it becomes empty", async () => {
    const rootPath = await createRoot();
    await addPiCustomProvider(
      rootPath,
      {
        providerId: "ollama",
        baseUrl: "http://localhost:11434/v1",
        api: "openai-completions",
        models: [{ id: "m1" }, { id: "m2" }],
      },
      options(rootPath),
    );
    await removePiCustomModel(rootPath, "ollama", "m2", options(rootPath));
    let catalog = await inspectPiModelCatalog(rootPath);
    expect(
      catalog
        .find((provider) => provider.id === "ollama")
        ?.models.map((model) => model.id),
    ).toEqual(["m1"]);

    await removePiCustomModel(rootPath, "ollama", "m1", options(rootPath));
    catalog = await inspectPiModelCatalog(rootPath);
    expect(
      catalog.find((provider) => provider.id === "ollama"),
    ).toBeUndefined();
  });

  it("removes a whole custom provider", async () => {
    const rootPath = await createRoot();
    await addPiCustomProvider(
      rootPath,
      {
        providerId: "ollama",
        baseUrl: "http://localhost:11434/v1",
        api: "openai-completions",
        models: [{ id: "m1" }],
      },
      options(rootPath),
    );
    await removePiCustomProvider(rootPath, "ollama", options(rootPath));
    const catalog = await inspectPiModelCatalog(rootPath);
    expect(
      catalog.find((provider) => provider.id === "ollama"),
    ).toBeUndefined();
    await expect(
      removePiCustomProvider(rootPath, "ollama", options(rootPath)),
    ).rejects.toThrow(/AGENT_PI_/);
  });
});

describe("Pi credential projection", () => {
  it("writes auth.json with 0600 and preserves other providers", async () => {
    const rootPath = await createRoot();
    await fs.writeFile(
      path.join(rootPath, "auth.json"),
      JSON.stringify(
        { existing: { type: "api_key", key: "keep-me" } },
        null,
        2,
      ),
    );
    const result = await setPiCredential(
      rootPath,
      "ollama",
      "sk-test-secret",
      options(rootPath),
    );
    expect(JSON.stringify(result)).not.toContain("sk-test-secret");

    const authPath = path.join(rootPath, "auth.json");
    const stat = await fs.stat(authPath);
    expect(stat.mode & 0o777).toBe(0o600);
    const parsed = JSON.parse(await fs.readFile(authPath, "utf8"));
    expect(parsed.existing.key).toBe("keep-me");
    expect(parsed.ollama).toEqual({ type: "api_key", key: "sk-test-secret" });

    const catalog = await inspectPiModelCatalog(rootPath);
    const store = JSON.parse(
      await fs.readFile(path.join(rootPath, "auth.json"), "utf8"),
    );
    expect(store.ollama.type).toBe("api_key");
    expect(catalog).toEqual([]);
  });

  it("rejects empty or oversized keys without writing", async () => {
    const rootPath = await createRoot();
    await expect(
      setPiCredential(rootPath, "ollama", "", options(rootPath)),
    ).rejects.toThrow(/AGENT_PI_/);
    await expect(
      setPiCredential(
        rootPath,
        "ollama",
        "x".repeat(10 * 1024 + 1),
        options(rootPath),
      ),
    ).rejects.toThrow(/AGENT_PI_/);
    expect(
      await fs
        .stat(path.join(rootPath, "auth.json"))
        .then(() => true)
        .catch(() => false),
    ).toBe(false);
  });
});

describe("Pi model input validation", () => {
  it("accepts a fully specified model and normalizes fields", async () => {
    const rootPath = await createRoot();
    await addPiCustomProvider(
      rootPath,
      {
        providerId: "full",
        baseUrl: "http://localhost:11434/v1",
        api: "openai-completions",
        models: [
          {
            id: "complete-model",
            name: "Complete Model",
            reasoning: true,
            input: ["text", "image"],
            contextWindow: 262144,
            maxTokens: 8192,
          },
        ],
      },
      options(rootPath),
    );
    const catalog = await inspectPiModelCatalog(rootPath);
    const model = catalog
      .find((provider) => provider.id === "full")
      ?.models.find((entry) => entry.id === "complete-model");
    expect(model).toMatchObject({
      name: "Complete Model",
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 262144,
      maxTokens: 8192,
    });
  });

  it("rejects invalid model fields and ids", async () => {
    const rootPath = await createRoot();
    const base = {
      providerId: "validate",
      baseUrl: "http://localhost:11434/v1",
      api: "openai-completions" as const,
    };
    const attempt = (models: object[]) =>
      addPiCustomProvider(
        rootPath,
        { ...base, models: models as never },
        options(rootPath),
      );

    await expect(attempt([{ id: "" }])).rejects.toThrow(
      /AGENT_PI_MODEL_ID_INVALID/,
    );
    await expect(attempt([{ id: "x".repeat(600) }])).rejects.toThrow(
      /AGENT_PI_MODEL_ID_INVALID/,
    );
    await expect(attempt([{ id: "bad\tid" }])).rejects.toThrow(
      /AGENT_PI_MODEL_ID_INVALID/,
    );
    await expect(attempt([{ id: "m", name: "" }])).rejects.toThrow(
      /AGENT_PI_MODEL_NAME_INVALID/,
    );
    await expect(attempt([{ id: "m", name: "n".repeat(300) }])).rejects.toThrow(
      /AGENT_PI_MODEL_NAME_INVALID/,
    );
    await expect(
      attempt([{ id: "m", reasoning: "yes" as never }]),
    ).rejects.toThrow(/AGENT_PI_MODEL_REASONING_INVALID/);
    await expect(attempt([{ id: "m", input: [123] as never }])).rejects.toThrow(
      /AGENT_PI_MODEL_INPUT_INVALID/,
    );
    await expect(
      attempt([{ id: "m", input: "text" as never }]),
    ).rejects.toThrow(/AGENT_PI_MODEL_INPUT_INVALID/);
    await expect(attempt([{ id: "m", contextWindow: 0 }])).rejects.toThrow(
      /AGENT_PI_MODEL_CONTEXT_INVALID/,
    );
    await expect(
      attempt([{ id: "m", contextWindow: 20_000_000 }]),
    ).rejects.toThrow(/AGENT_PI_MODEL_CONTEXT_INVALID/);
    await expect(attempt([{ id: "m", contextWindow: 1.5 }])).rejects.toThrow(
      /AGENT_PI_MODEL_CONTEXT_INVALID/,
    );
    await expect(attempt([{ id: "m", maxTokens: -1 }])).rejects.toThrow(
      /AGENT_PI_MODEL_TOKENS_INVALID/,
    );
    await expect(attempt([{ id: "m" }, { id: "m" }])).rejects.toThrow(
      /AGENT_PI_MODEL_ID_DUPLICATE/,
    );
  });

  it("rejects adding a provider that already exists", async () => {
    const rootPath = await createRoot();
    const input = {
      providerId: "ollama",
      baseUrl: "http://localhost:11434/v1",
      api: "openai-completions" as const,
      models: [{ id: "m1" }],
    };
    await addPiCustomProvider(rootPath, input, options(rootPath));
    await expect(
      addPiCustomProvider(rootPath, input, options(rootPath)),
    ).rejects.toThrow(/AGENT_PI_PROVIDER_EXISTS/);
  });

  it("handles providers whose models field is not an array", async () => {
    const rootPath = await createRoot();
    await fs.writeFile(
      path.join(rootPath, "models.json"),
      JSON.stringify({ providers: { odd: { models: "not-array" } } }),
    );
    await addPiCustomModel(rootPath, "odd", { id: "first" }, options(rootPath));
    const parsed = JSON.parse(
      await fs.readFile(path.join(rootPath, "models.json"), "utf8"),
    );
    expect(parsed.providers.odd.models).toEqual([{ id: "first" }]);
    await expect(
      removePiCustomModel(rootPath, "odd", "missing", options(rootPath)),
    ).rejects.toThrow(/AGENT_PI_MODEL_NOT_FOUND/);
  });

  it("restores the original file when the atomic write fails", async () => {
    const rootPath = await createRoot();
    const target = path.join(rootPath, "models.json");
    const original = '{ "providers": { "keep": { "models": [] } } }\n';
    await fs.writeFile(target, original);
    // Backups live in their own writable directory; the target directory is
    // made read-only so the atomic temp-file write fails after backup.
    await fs.mkdir(path.join(rootPath, "backups"), { recursive: true });
    await fs.chmod(rootPath, 0o500);
    try {
      await expect(
        addPiCustomProvider(
          rootPath,
          {
            providerId: "blocked",
            baseUrl: "http://localhost:1/v1",
            api: "openai-completions",
            models: [{ id: "m" }],
          },
          options(rootPath),
        ),
      ).rejects.toThrow(/AGENT_PI_WRITE_FAILED/);
    } finally {
      await fs.chmod(rootPath, 0o700);
    }
    expect(await fs.readFile(target, "utf8")).toBe(original);
  });

  it("fails closed with a stable error when the backup cannot be created", async () => {
    const rootPath = await createRoot();
    await fs.writeFile(
      path.join(rootPath, "models.json"),
      '{ "providers": {} }\n',
    );
    await fs.chmod(rootPath, 0o500);
    try {
      await expect(
        addPiCustomProvider(
          rootPath,
          {
            providerId: "blocked",
            baseUrl: "http://localhost:1/v1",
            api: "openai-completions",
            models: [{ id: "m" }],
          },
          options(rootPath),
        ),
      ).rejects.toThrow(/AGENT_PI_BACKUP_FAILED/);
    } finally {
      await fs.chmod(rootPath, 0o700);
    }
    expect(await fs.readFile(path.join(rootPath, "models.json"), "utf8")).toBe(
      '{ "providers": {} }\n',
    );
  });
});
