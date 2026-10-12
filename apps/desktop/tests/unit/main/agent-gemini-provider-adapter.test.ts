/**
 * @vitest-environment node
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AgentProviderAdapterContext,
  AgentProviderModelMapping,
  AgentProviderProfile,
} from "@prompthub/shared";
import { createAgentGeminiProviderAdapter } from "../../../src/main/services/agent-gemini-provider-adapter";

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-profile-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

function context(rootPath: string): AgentProviderAdapterContext {
  return { agentId: "gemini", platformId: "gemini", rootPath };
}

function profile(
  overrides: Partial<AgentProviderProfile> = {},
): AgentProviderProfile {
  return {
    id: "profile-gemini",
    platformId: "gemini",
    name: "Gemini paid API",
    providerKind: "google-gemini",
    protocol: "google-generative-ai",
    endpoint: "https://gateway.example.com",
    config: { credentialEnvKey: "GEMINI_API_KEY" },
    secretRef: "agent-provider:profile-gemini",
    source: "manual",
    archived: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function mappings(
  model = "gemini-3-flash-preview",
): AgentProviderModelMapping[] {
  return [
    {
      id: "mapping-primary",
      providerProfileId: "profile-gemini",
      routeKey: "primary",
      modelId: model,
      parameters: {},
    },
  ];
}

function secretStore(secret: string | null = "main-only-gemini-key") {
  return { read: vi.fn().mockResolvedValue(secret) };
}

function encryption(available = true) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value: string) =>
      Buffer.from(`protected:${Buffer.from(value).toString("base64")}`),
    decryptString: (value: Buffer) =>
      Buffer.from(
        value.toString().replace(/^protected:/, ""),
        "base64",
      ).toString(),
  };
}

function options(root: string) {
  return {
    backupRoot: path.join(root, "backups"),
    backupEncryption: encryption(),
    secretStore: secretStore(),
  };
}

describe("Gemini CLI unified Provider Profile adapter", () => {
  it("imports paid API settings without exposing native credentials", async () => {
    const root = await temporaryRoot();
    await fs.writeFile(
      path.join(root, "settings.json"),
      [
        "{",
        "  // keep the user's UI settings",
        '  "model": { "name": "gemini-2.5-pro" },',
        '  "security": { "auth": { "selectedType": "gemini-api-key" } },',
        '  "ui": { "theme": "Default" }',
        "}",
        "",
      ].join("\n"),
    );
    await fs.writeFile(
      path.join(root, ".env"),
      [
        "# Gemini user environment",
        'GEMINI_API_KEY="native-secret"',
        'GOOGLE_GEMINI_BASE_URL="https://legacy.example.com/?key=hidden"',
        'UNRELATED_ENV="preserve-me"',
        "",
      ].join("\n"),
    );
    const adapter = createAgentGeminiProviderAdapter(options(root));

    const state = await adapter.inspect(context(root));
    expect(state.values).toMatchObject({
      provider: "google-gemini",
      endpoint: "https://legacy.example.com",
      protocol: "google-generative-ai",
      authType: "gemini-api-key",
      model: "gemini-2.5-pro",
      credentialStatus: "configured",
    });
    expect(JSON.stringify(state)).not.toContain("native-secret");
    expect(JSON.stringify(state)).not.toContain("key=hidden");
    expect(JSON.stringify(state)).not.toContain("preserve-me");

    const imported = await adapter.importCurrent(context(root));
    expect(imported).toMatchObject({
      profile: {
        platformId: "gemini",
        providerKind: "google-gemini",
        protocol: "google-generative-ai",
        endpoint: "https://legacy.example.com",
        config: { credentialEnvKey: "GEMINI_API_KEY" },
        secretRef: null,
        source: "native-import",
      },
      modelMappings: [{ routeKey: "primary", modelId: "gemini-2.5-pro" }],
    });
    expect(imported.warnings).toContain("native-credential-not-imported");
    expect(JSON.stringify(imported)).not.toContain("native-secret");
  });

  it("updates both native files, preserves unrelated content, and rolls back exactly", async () => {
    const root = await temporaryRoot();
    const settingsPath = path.join(root, "settings.json");
    const envPath = path.join(root, ".env");
    const originalSettings = [
      "{",
      "  // preserve this comment",
      '  "model": { "name": "gemini-2.5-flash" },',
      '  "security": { "auth": { "selectedType": "oauth-personal", "useExternal": true } },',
      '  "ui": { "theme": "ANSI" }',
      "}",
      "",
    ].join("\n");
    const originalEnv = [
      "# preserve this comment",
      "export UNRELATED_ENV='preserve-me'",
      "GOOGLE_API_KEY=vertex-owned",
      "GOOGLE_GENAI_USE_VERTEXAI=true",
      "",
    ].join("\n");
    await fs.writeFile(settingsPath, originalSettings);
    await fs.writeFile(envPath, originalEnv);
    const adapter = createAgentGeminiProviderAdapter(options(root));
    const input = {
      context: context(root),
      profile: profile(),
      modelMappings: mappings(),
      baseline: await adapter.inspect(context(root)),
    };

    const plan = await adapter.planActivation(input);
    expect(plan.canApply).toBe(true);
    expect(plan.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "authType",
          desired: "gemini-api-key",
        }),
        expect.objectContaining({
          field: "model",
          desired: "gemini-3-flash-preview",
        }),
        expect.objectContaining({
          field: "endpoint",
          desired: "https://gateway.example.com",
        }),
      ]),
    );
    expect(JSON.stringify(plan)).not.toContain("main-only-gemini-key");

    const receipt = await adapter.apply(context(root), plan, {
      profile: input.profile,
      modelMappings: input.modelMappings,
    });
    const settings = await fs.readFile(settingsPath, "utf8");
    const env = await fs.readFile(envPath, "utf8");
    expect(settings).toContain("// preserve this comment");
    expect(settings).toContain('"theme": "ANSI"');
    expect(settings).toContain('"name": "gemini-3-flash-preview"');
    expect(settings).toContain('"selectedType": "gemini-api-key"');
    expect(settings).toContain('"useExternal": true');
    expect(env).toContain("# preserve this comment");
    expect(env).toContain("export UNRELATED_ENV='preserve-me'");
    expect(env).toContain("GOOGLE_API_KEY=vertex-owned");
    expect(env).toContain("GOOGLE_GENAI_USE_VERTEXAI=true");
    expect(env).toContain('GEMINI_API_KEY="main-only-gemini-key"');
    expect(env).toContain(
      'GOOGLE_GEMINI_BASE_URL="https://gateway.example.com"',
    );
    expect(receipt.backupRef).toMatch(/provider-bundle\.json\.enc$/);
    expect(await fs.readFile(receipt.backupRef!, "utf8")).not.toContain(
      "vertex-owned",
    );
    await expect(
      adapter.verify(context(root), plan, receipt),
    ).resolves.toMatchObject({ verified: true });

    await expect(
      adapter.rollback(context(root), receipt),
    ).resolves.toMatchObject({ restored: true });
    await expect(fs.readFile(settingsPath, "utf8")).resolves.toBe(
      originalSettings,
    );
    await expect(fs.readFile(envPath, "utf8")).resolves.toBe(originalEnv);
  });

  it("preserves external OAuth, Vertex, ADC, Cloud Shell, and gateway authentication", async () => {
    const root = await temporaryRoot();
    const settingsPath = path.join(root, "settings.json");
    const envPath = path.join(root, ".env");
    const adapter = createAgentGeminiProviderAdapter(options(root));

    for (const authType of [
      "oauth-personal",
      "vertex-ai",
      "compute-default-credentials",
      "cloud-shell",
      "gateway",
    ]) {
      await fs.writeFile(
        settingsPath,
        JSON.stringify({
          model: { name: "gemini-2.5-pro" },
          security: { auth: { selectedType: authType } },
        }),
      );
      await fs.writeFile(
        envPath,
        [
          "GEMINI_API_KEY=old-direct-key",
          "GOOGLE_GEMINI_BASE_URL=https://old.example.com",
          "GOOGLE_API_KEY=external-vertex-key",
          "GOOGLE_CLOUD_PROJECT=project-a",
          "GOOGLE_CLOUD_LOCATION=global",
          "",
        ].join("\n"),
      );
      const imported = await adapter.importCurrent(context(root));
      expect(imported).toMatchObject({
        profile: {
          protocol: "platform-native",
          providerKind: authType,
          config: { nativeAuthType: authType },
          secretRef: null,
        },
      });
      expect(JSON.stringify(imported)).not.toContain("external-vertex-key");

      const nativeProfile = profile({
        id: `profile-${authType}`,
        providerKind: authType,
        protocol: "platform-native",
        endpoint: null,
        config: { nativeAuthType: authType },
        secretRef: null,
      });
      const plan = await adapter.planActivation({
        context: context(root),
        profile: nativeProfile,
        modelMappings: mappings("gemini-2.5-flash"),
        baseline: await adapter.inspect(context(root)),
      });
      const receipt = await adapter.apply(context(root), plan, {
        profile: nativeProfile,
        modelMappings: mappings("gemini-2.5-flash"),
      });
      const env = await fs.readFile(envPath, "utf8");
      expect(env).not.toContain("GEMINI_API_KEY");
      expect(env).not.toContain("GOOGLE_GEMINI_BASE_URL");
      expect(env).toContain("GOOGLE_API_KEY=external-vertex-key");
      expect(env).toContain("GOOGLE_CLOUD_PROJECT=project-a");
      expect(receipt.platformId).toBe("gemini");
    }
  });

  it("tests paid API profiles in isolation and refuses native credential borrowing", async () => {
    const root = await temporaryRoot();
    const testConnection = vi.fn().mockResolvedValue({
      protocol: "google-generative-ai",
      endpointOrigin: "https://gateway.example.com",
      model: "gemini-3-flash-preview",
      status: "ok",
      startedAt: 10,
      finishedAt: 20,
      totalMs: 10,
      retryCount: 0,
      modelCount: 2,
      modelAvailable: true,
    });
    const testModel = vi.fn().mockResolvedValue({
      protocol: "google-generative-ai",
      endpointOrigin: "https://gateway.example.com",
      model: "gemini-3-flash-preview",
      status: "ok",
      startedAt: 10,
      finishedAt: 25,
      totalMs: 15,
      firstTokenMs: 8,
      retryCount: 0,
      inputTokens: 6,
      outputTokens: 1,
      outputPreview: "OK",
    });
    const secrets = secretStore();
    const adapter = createAgentGeminiProviderAdapter({
      ...options(root),
      secretStore: secrets,
      testConnection,
      testModel,
    });
    const target = { profile: profile(), modelMappings: mappings() };

    await expect(
      adapter.testConnection?.(context(root), target),
    ).resolves.toMatchObject({ platformId: "gemini", status: "ok" });
    const controller = new AbortController();
    await expect(
      adapter.testModel?.(context(root), target, controller.signal),
    ).resolves.toMatchObject({ platformId: "gemini", outputPreview: "OK" });
    expect(testConnection).toHaveBeenCalledWith({
      endpoint: "https://gateway.example.com",
      credential: "main-only-gemini-key",
      model: "gemini-3-flash-preview",
      protocol: "google-generative-ai",
    });
    expect(testModel).toHaveBeenCalledWith({
      endpoint: "https://gateway.example.com",
      credential: "main-only-gemini-key",
      model: "gemini-3-flash-preview",
      protocol: "google-generative-ai",
      signal: controller.signal,
    });
    expect(secrets.read).toHaveBeenCalledWith("agent-provider:profile-gemini");

    const native = profile({
      providerKind: "vertex-ai",
      protocol: "platform-native",
      endpoint: null,
      config: { nativeAuthType: "vertex-ai" },
      secretRef: null,
    });
    await expect(
      adapter.testConnection?.(context(root), {
        profile: native,
        modelMappings: mappings(),
      }),
    ).resolves.toMatchObject({ status: "unsupported" });
    expect(secrets.read).toHaveBeenCalledTimes(2);
  });

  it("fails closed for invalid profiles, malformed files, symlinks, and stale plans", async () => {
    const root = await temporaryRoot();
    const settingsPath = path.join(root, "settings.json");
    const envPath = path.join(root, ".env");
    const adapter = createAgentGeminiProviderAdapter({
      ...options(root),
      secretStore: secretStore(null),
    });

    for (const invalidContext of [
      { ...context(root), agentId: "claude" },
      { ...context(root), platformId: "claude" },
      { ...context(root), rootPath: "relative" },
      { ...context(root), rootPath: `${root}\0invalid` },
    ]) {
      await expect(adapter.inspect(invalidContext)).rejects.toThrow(
        "AGENT_GEMINI_PROVIDER_CONTEXT_INVALID",
      );
    }

    await fs.writeFile(settingsPath, "{broken");
    await expect(adapter.inspect(context(root))).rejects.toThrow(
      "AGENT_GEMINI_PROVIDER_CONFIG_INVALID",
    );
    await fs.writeFile(settingsPath, "{}\n");
    await fs.writeFile(settingsPath, "x".repeat(2 * 1024 * 1024 + 1));
    await expect(adapter.inspect(context(root))).rejects.toThrow(
      "AGENT_GEMINI_PROVIDER_CONFIG_INVALID",
    );
    await fs.writeFile(settingsPath, "{}\n");

    for (const invalid of [
      profile({ platformId: "claude" }),
      profile({ protocol: "openai-chat" }),
      profile({ endpoint: "http://remote.example.com" }),
      profile({ endpoint: "https://user:pass@example.com" }),
      profile({ config: { credentialEnvKey: "GOOGLE_API_KEY" } }),
      profile({ secretRef: null }),
    ]) {
      const plan = await adapter.planActivation({
        context: context(root),
        profile: invalid,
        modelMappings: mappings(),
        baseline: null,
      });
      expect(plan.canApply).toBe(false);
    }

    const missingSecret = await adapter.planActivation({
      context: context(root),
      profile: profile(),
      modelMappings: mappings(),
      baseline: await adapter.inspect(context(root)),
    });
    expect(missingSecret.blockedReasons).toContain("provider-secret-missing");

    const staleAdapter = createAgentGeminiProviderAdapter({
      ...options(root),
      hooks: {
        beforeWrite: async () => {
          await fs.writeFile(envPath, "EXTERNAL_CHANGE=1\n");
        },
      },
    });
    const input = {
      context: context(root),
      profile: profile(),
      modelMappings: mappings(),
      baseline: await staleAdapter.inspect(context(root)),
    };
    const plan = await staleAdapter.planActivation(input);
    await expect(
      staleAdapter.apply(context(root), plan, {
        profile: input.profile,
        modelMappings: input.modelMappings,
      }),
    ).rejects.toThrow("AGENT_GEMINI_PROVIDER_CONCURRENT_CHANGE");

    const symlinkRoot = await temporaryRoot();
    await fs.symlink(settingsPath, path.join(symlinkRoot, "settings.json"));
    await expect(adapter.inspect(context(symlinkRoot))).rejects.toThrow(
      "AGENT_GEMINI_PROVIDER_CONFIG_INVALID",
    );
  });

  it("covers empty installs, environment auth fallbacks, and malformed native values", async () => {
    const root = await temporaryRoot();
    const adapter = createAgentGeminiProviderAdapter(options(root));

    await expect(adapter.inspect(context(root))).resolves.toMatchObject({
      values: {
        provider: "oauth-personal",
        protocol: "platform-native",
        authType: "oauth-personal",
        model: null,
      },
    });
    await fs.writeFile(
      path.join(root, ".env"),
      [
        "GOOGLE_GENAI_USE_VERTEXAI=true",
        'GOOGLE_GEMINI_BASE_URL="bad\\q"',
        "IGNORED LINE",
        "",
      ].join("\n"),
    );
    await expect(adapter.inspect(context(root))).resolves.toMatchObject({
      values: {
        provider: "vertex-ai",
        endpoint: null,
        authType: "vertex-ai",
      },
    });
    await expect(adapter.importCurrent(context(root))).resolves.toMatchObject({
      modelMappings: [],
    });
    await fs.writeFile(
      path.join(root, "settings.json"),
      '{"model":{"name":"   "}}\n',
    );
    await expect(adapter.inspect(context(root))).resolves.toMatchObject({
      values: { model: null },
    });
    await fs.writeFile(path.join(root, "settings.json"), "[]\n");
    await expect(adapter.inspect(context(root))).rejects.toThrow(
      "AGENT_GEMINI_PROVIDER_CONFIG_INVALID",
    );
  });

  it("blocks every unsupported profile shape and reports isolated test failures safely", async () => {
    const root = await temporaryRoot();
    const secrets = secretStore();
    const testConnection = vi.fn().mockResolvedValue({
      protocol: "google-generative-ai",
      endpointOrigin: "https://generativelanguage.googleapis.com",
      model: "gemini-2.5-pro",
      status: "ok",
      startedAt: 1,
      finishedAt: 2,
      totalMs: 1,
      retryCount: 0,
      modelCount: 1,
      modelAvailable: true,
    });
    const testModel = vi.fn().mockResolvedValue({
      protocol: "google-generative-ai",
      endpointOrigin: "https://generativelanguage.googleapis.com",
      model: "gemini-2.5-pro",
      status: "ok",
      startedAt: 1,
      finishedAt: 2,
      totalMs: 1,
      retryCount: 0,
      firstTokenMs: 1,
      inputTokens: 1,
      outputTokens: 1,
      outputPreview: "OK",
    });
    const adapter = createAgentGeminiProviderAdapter({
      ...options(root),
      secretStore: secrets,
      testConnection,
      testModel,
      now: () => 7,
    });
    const base = profile({
      endpoint: null,
    });
    await adapter.testConnection?.(context(root), {
      profile: base,
      modelMappings: mappings("gemini-2.5-pro"),
    });
    expect(testConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://generativelanguage.googleapis.com",
      }),
    );
    await adapter.testModel?.(
      context(root),
      {
        profile: base,
        modelMappings: mappings("gemini-2.5-pro"),
      },
      new AbortController().signal,
    );
    expect(testModel).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://generativelanguage.googleapis.com",
      }),
    );

    const native = profile({
      providerKind: "oauth-personal",
      protocol: "platform-native",
      endpoint: null,
      config: { nativeAuthType: "oauth-personal" },
      secretRef: null,
    });
    await expect(
      adapter.testModel?.(
        context(root),
        {
          profile: native,
          modelMappings: mappings(),
        },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      status: "unsupported",
      startedAt: 7,
      outputPreview: null,
    });
    const noSecretAdapter = createAgentGeminiProviderAdapter({
      ...options(root),
      secretStore: secretStore(null),
      now: () => 9,
    });
    await expect(
      noSecretAdapter.testModel?.(
        context(root),
        {
          profile: base,
          modelMappings: [],
        },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      status: "no-credentials",
      model: null,
      startedAt: 9,
    });
    await expect(
      noSecretAdapter.testConnection?.(context(root), {
        profile: base,
        modelMappings: [],
      }),
    ).resolves.toMatchObject({
      status: "no-credentials",
      model: null,
      startedAt: 9,
    });
    await expect(
      adapter.testConnection?.(context(root), {
        profile: profile({ protocol: "unsupported" }),
        modelMappings: mappings(),
      }),
    ).resolves.toMatchObject({ status: "unsupported" });
    for (const method of ["testConnection", "testModel"] as const) {
      await expect(
        method === "testConnection"
          ? adapter.testConnection?.(context(root), {
              profile: profile({ platformId: "claude" }),
              modelMappings: mappings(),
            })
          : adapter.testModel?.(
              context(root),
              {
                profile: profile({ platformId: "claude" }),
                modelMappings: mappings(),
              },
              new AbortController().signal,
            ),
      ).rejects.toThrow("AGENT_PROVIDER_PROFILE_PLATFORM_MISMATCH");
    }

    const invalidInputs = [
      {
        profile: profile({ name: "" }),
        modelMappings: mappings(),
      },
      {
        profile: profile({ name: "x".repeat(81) }),
        modelMappings: mappings(),
      },
      { profile: base, modelMappings: [] },
      {
        profile: base,
        modelMappings: [...mappings(), ...mappings("gemini-2.5-pro")],
      },
      {
        profile: base,
        modelMappings: [
          {
            ...mappings()[0],
            parameters: { temperature: 1 },
          },
        ],
      },
      {
        profile: base,
        modelMappings: mappings(`bad\nmodel`),
      },
      {
        profile: base,
        modelMappings: mappings("x".repeat(513)),
      },
      {
        profile: profile({
          config: {
            credentialEnvKey: "GEMINI_API_KEY",
            unsupported: true,
          },
        }),
        modelMappings: mappings(),
      },
      {
        profile: profile({
          providerKind: "oauth-personal",
          protocol: "platform-native",
          endpoint: null,
          secretRef: null,
          config: {
            nativeAuthType: "oauth-personal",
            unsupported: true,
          },
        }),
        modelMappings: mappings(),
      },
      {
        profile: profile({
          providerKind: "oauth-personal",
          protocol: "platform-native",
          endpoint: "https://example.com",
          secretRef: null,
          config: { nativeAuthType: "oauth-personal" },
        }),
        modelMappings: mappings(),
      },
      {
        profile: profile({ endpoint: ":::" }),
        modelMappings: mappings(),
      },
    ];
    for (const invalid of invalidInputs) {
      await expect(
        adapter.planActivation({
          context: context(root),
          ...invalid,
          baseline: null,
        }),
      ).resolves.toMatchObject({ canApply: false });
    }
  });

  it("rejects tampered activation inputs and returns stable verification and rollback failures", async () => {
    const root = await temporaryRoot();
    const settingsPath = path.join(root, "settings.json");
    const adapter = createAgentGeminiProviderAdapter(options(root));
    const input = {
      context: context(root),
      profile: profile(),
      modelMappings: mappings(),
      baseline: await adapter.inspect(context(root)),
    };
    const plan = await adapter.planActivation(input);

    for (const invalidPlan of [
      { ...plan, platformId: "claude" },
      { ...plan, profileId: "other" },
      { ...plan, adapterVersion: "old" },
      { ...plan, currentDigest: "stale" },
      { ...plan, status: "blocked" as const },
      { ...plan, canApply: false },
    ]) {
      await expect(
        adapter.apply(context(root), invalidPlan, {
          profile: input.profile,
          modelMappings: input.modelMappings,
        }),
      ).rejects.toThrow("AGENT_GEMINI_PROVIDER_PLAN_INVALID");
    }
    const tamperedPlan = {
      ...plan,
      decisions: plan.decisions.map((decision) =>
        decision.field === "model"
          ? { ...decision, desired: "tampered-model" }
          : decision,
      ),
    };
    await expect(
      adapter.apply(context(root), tamperedPlan, {
        profile: input.profile,
        modelMappings: input.modelMappings,
      }),
    ).rejects.toThrow("AGENT_GEMINI_PROVIDER_PLAN_INVALID");

    const missingDuringApply = secretStore();
    missingDuringApply.read
      .mockResolvedValueOnce("available-for-plan")
      .mockResolvedValueOnce(null);
    const missingAdapter = createAgentGeminiProviderAdapter({
      ...options(root),
      secretStore: missingDuringApply,
    });
    const missingPlan = await missingAdapter.planActivation(input);
    await expect(
      missingAdapter.apply(context(root), missingPlan, {
        profile: input.profile,
        modelMappings: input.modelMappings,
      }),
    ).rejects.toThrow("AGENT_GEMINI_PROVIDER_SECRET_MISSING");

    await expect(
      adapter.apply(context(root), plan, {
        profile: profile({ protocol: "unsupported" }),
        modelMappings: input.modelMappings,
      }),
    ).rejects.toThrow("AGENT_GEMINI_PROVIDER_PROFILE_INVALID");

    const receipt = await adapter.apply(context(root), plan, {
      profile: input.profile,
      modelMappings: input.modelMappings,
    });
    await expect(
      adapter.verify(context(root), plan, {
        ...receipt,
        profileId: "other",
      }),
    ).resolves.toMatchObject({
      verified: false,
      errorCode: "provider-state-mismatch",
    });
    await expect(
      adapter.rollback(context(root), {
        ...receipt,
        backupRef: null,
      }),
    ).resolves.toMatchObject({
      restored: false,
      errorCode: "provider-rollback-failed",
    });
    await expect(
      adapter.rollback(context(root), {
        ...receipt,
        nativeDigestBefore: "different",
      }),
    ).resolves.toMatchObject({
      restored: false,
      errorCode: "provider-rollback-mismatch",
    });

    const protectedInvalid = encryption().encryptString("{broken");
    await fs.writeFile(
      receipt.backupRef!,
      JSON.stringify({
        version: 1,
        payload: protectedInvalid.toString("base64"),
      }),
    );
    await expect(
      adapter.rollback(context(root), receipt),
    ).resolves.toMatchObject({
      restored: false,
      errorCode: "provider-rollback-failed",
    });
    const protectedInvalidShape = encryption().encryptString("{}");
    await fs.writeFile(
      receipt.backupRef!,
      JSON.stringify({
        version: 1,
        payload: protectedInvalidShape.toString("base64"),
      }),
    );
    await expect(
      adapter.rollback(context(root), receipt),
    ).resolves.toMatchObject({
      restored: false,
      errorCode: "provider-rollback-failed",
    });
    await fs.writeFile(settingsPath, "{}\n");
  });

  it("writes a platform-native profile without creating an empty managed environment", async () => {
    const root = await temporaryRoot();
    const adapter = createAgentGeminiProviderAdapter(options(root));
    const nativeProfile = profile({
      providerKind: "oauth-personal",
      protocol: "platform-native",
      endpoint: null,
      config: { nativeAuthType: "oauth-personal" },
      secretRef: null,
    });
    const input = {
      context: context(root),
      profile: nativeProfile,
      modelMappings: mappings(),
      baseline: await adapter.inspect(context(root)),
    };
    const plan = await adapter.planActivation(input);
    await adapter.apply(context(root), plan, {
      profile: nativeProfile,
      modelMappings: mappings(),
    });
    await expect(fs.readFile(path.join(root, ".env"), "utf8")).resolves.toBe(
      "",
    );
  });

  it("restores both files after partial write or verification failure", async () => {
    for (const hook of ["afterSettingsWrite", "afterWrite"] as const) {
      const root = await temporaryRoot();
      const settingsPath = path.join(root, "settings.json");
      const envPath = path.join(root, ".env");
      const originalSettings = '{"model":{"name":"gemini-2.5-pro"}}\n';
      const originalEnv = "UNRELATED=1\n";
      await fs.writeFile(settingsPath, originalSettings);
      await fs.writeFile(envPath, originalEnv);
      const adapter = createAgentGeminiProviderAdapter({
        ...options(root),
        hooks: {
          [hook]: async () => {
            if (hook === "afterWrite") {
              await fs.writeFile(settingsPath, '{"model":{"name":"wrong"}}\n');
              return;
            }
            throw new Error("injected failure");
          },
        },
      });
      const input = {
        context: context(root),
        profile: profile(),
        modelMappings: mappings(),
        baseline: await adapter.inspect(context(root)),
      };
      const plan = await adapter.planActivation(input);

      await expect(
        adapter.apply(context(root), plan, {
          profile: input.profile,
          modelMappings: input.modelMappings,
        }),
      ).rejects.toThrow("AGENT_GEMINI_PROVIDER_WRITE_FAILED");
      await expect(fs.readFile(settingsPath, "utf8")).resolves.toBe(
        originalSettings,
      );
      await expect(fs.readFile(envPath, "utf8")).resolves.toBe(originalEnv);
    }
  });

  it("reports blocked native profiles and missing encryption without leaking errors", async () => {
    const root = await temporaryRoot();
    const throwingSecrets = {
      read: vi.fn().mockRejectedValue(new Error("keychain secret material")),
    };
    const adapter = createAgentGeminiProviderAdapter({
      ...options(root),
      secretStore: throwingSecrets,
    });
    const plan = await adapter.planActivation({
      context: context(root),
      profile: profile(),
      modelMappings: mappings(),
      baseline: await adapter.inspect(context(root)),
    });
    expect(plan.blockedReasons).toContain("provider-secret-unavailable");
    expect(JSON.stringify(plan)).not.toContain("keychain secret material");

    const invalidNative = profile({
      providerKind: "unknown-native",
      protocol: "platform-native",
      endpoint: null,
      config: { nativeAuthType: "unknown-native" },
      secretRef: null,
    });
    await expect(
      adapter.planActivation({
        context: context(root),
        profile: invalidNative,
        modelMappings: mappings(),
        baseline: null,
      }),
    ).resolves.toMatchObject({ canApply: false, status: "blocked" });

    const noEncryption = createAgentGeminiProviderAdapter({
      ...options(root),
      backupEncryption: encryption(false),
    });
    const input = {
      context: context(root),
      profile: profile(),
      modelMappings: mappings(),
      baseline: await noEncryption.inspect(context(root)),
    };
    const noEncryptionPlan = await noEncryption.planActivation(input);
    await expect(
      noEncryption.apply(context(root), noEncryptionPlan, {
        profile: input.profile,
        modelMappings: input.modelMappings,
      }),
    ).rejects.toThrow("AGENT_CONFIG_BACKUP_ENCRYPTION_UNAVAILABLE");
  });
});
