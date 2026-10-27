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
import { createAgentCodexProviderAdapter } from "../../../src/main/services/agent-codex-provider-adapter";

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-profile-"));
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
  return {
    agentId: "codex",
    platformId: "codex",
    rootPath,
  };
}

function profile(
  overrides: Partial<AgentProviderProfile> = {},
): AgentProviderProfile {
  return {
    id: "profile-1",
    platformId: "codex",
    name: "Work Gateway",
    providerKind: "openai-compatible",
    protocol: "openai-responses",
    endpoint: "https://gateway.example.com/v1",
    config: { providerId: "work-gateway" },
    secretRef: "agent-provider:profile-1",
    source: "manual",
    archived: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function mappings(
  model = "gpt-5.4",
  parameters: Record<string, unknown> = {},
): AgentProviderModelMapping[] {
  return [
    {
      id: "mapping-primary",
      providerProfileId: "profile-1",
      routeKey: "primary",
      modelId: model,
      parameters,
    },
  ];
}

function secretStore(secret: string | null = "secret-token") {
  return {
    read: vi.fn().mockResolvedValue(secret),
  };
}

function backupEncryption() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) =>
      Buffer.from(`protected:${Buffer.from(value).toString("base64")}`),
    decryptString: (value: Buffer) => {
      const encoded = value.toString().replace(/^protected:/, "");
      return Buffer.from(encoded, "base64").toString();
    },
  };
}

describe("Codex unified Provider Profile adapter", () => {
  it("defaults a native custom provider without wire_api to Responses", async () => {
    const root = await temporaryRoot();
    await fs.writeFile(
      path.join(root, "config.toml"),
      'model = "audit-model"\nmodel_provider = "audit"\n[model_providers.audit]\nbase_url = "https://example.test/v1"\n',
    );
    const adapter = createAgentCodexProviderAdapter({
      backupRoot: path.join(root, "backups"),
      backupEncryption: backupEncryption(),
      secretStore: secretStore(),
    });
    expect((await adapter.inspect(context(root))).values.protocol).toBe(
      "responses",
    );
  });
  it("imports the active native provider without exposing inline credentials", async () => {
    const root = await temporaryRoot();
    await fs.writeFile(
      path.join(root, "config.toml"),
      [
        'model = "gpt-5.3"',
        'model_provider = "legacy"',
        "",
        "[model_providers.legacy]",
        'name = "Legacy Gateway"',
        'base_url = "https://legacy.example.com/v1?token=redacted"',
        'wire_api = "responses"',
        'experimental_bearer_token = "native-secret"',
        "",
        "[profiles.legacy]",
        'model = "gpt-5.3-codex"',
        'model_provider = "legacy"',
        "",
      ].join("\n"),
    );
    const adapter = createAgentCodexProviderAdapter({
      backupRoot: path.join(root, "backups"),
      backupEncryption: backupEncryption(),
      secretStore: secretStore(),
    });

    const state = await adapter.inspect(context(root));
    expect(state.values).toMatchObject({
      provider: "legacy",
      endpoint: "https://legacy.example.com/v1",
      protocol: "responses",
      model: "gpt-5.3",
      credentialStatus: "configured",
    });
    expect(JSON.stringify(state)).not.toContain("native-secret");
    expect(JSON.stringify(state)).not.toContain("token=redacted");

    const imported = await adapter.importCurrent(context(root));
    expect(imported).toMatchObject({
      profile: {
        platformId: "codex",
        name: "Legacy Gateway",
        protocol: "responses",
        endpoint: "https://legacy.example.com/v1",
        config: { providerId: "legacy" },
        secretRef: null,
        source: "native-import",
      },
      modelMappings: [{ routeKey: "primary", modelId: "gpt-5.3" }],
    });
    expect(imported.warnings).toContain("native-credential-not-imported");
    expect(JSON.stringify(imported)).not.toContain("native-secret");
  });

  it("round-trips Codex reasoning effort and context window with the primary model", async () => {
    const root = await temporaryRoot();
    const target = path.join(root, "config.toml");
    await fs.writeFile(
      target,
      [
        'model = "gpt-5.4"',
        'model_provider = "legacy"',
        'model_reasoning_effort = "medium"',
        "model_context_window = 262144",
        "",
        "[model_providers.legacy]",
        'name = "Legacy Gateway"',
        'base_url = "https://legacy.example.com/v1"',
        'wire_api = "responses"',
        'env_key = "LEGACY_API_KEY"',
        "",
      ].join("\n"),
    );
    const adapter = createAgentCodexProviderAdapter({
      backupRoot: path.join(root, "backups"),
      backupEncryption: backupEncryption(),
      secretStore: secretStore(),
    });

    await expect(adapter.inspect(context(root))).resolves.toMatchObject({
      values: {
        reasoningEffort: "medium",
        contextWindow: 262144,
      },
    });
    await expect(adapter.importCurrent(context(root))).resolves.toMatchObject({
      modelMappings: [
        {
          routeKey: "primary",
          modelId: "gpt-5.4",
          parameters: {
            reasoningEffort: "medium",
            contextWindow: 262144,
          },
        },
      ],
    });

    const activation = {
      context: context(root),
      profile: profile(),
      modelMappings: mappings("gpt-5.6-sol", {
        reasoningEffort: "high",
        contextWindow: 400000,
      }),
      baseline: await adapter.inspect(context(root)),
    };
    const plan = await adapter.planActivation(activation);
    const receipt = await adapter.apply(context(root), plan, {
      profile: activation.profile,
      modelMappings: activation.modelMappings,
    });
    await expect(
      adapter.verify(context(root), plan, receipt),
    ).resolves.toMatchObject({ verified: true });
    await expect(fs.readFile(target, "utf8")).resolves.toContain(
      'model_reasoning_effort = "high"',
    );
    await expect(fs.readFile(target, "utf8")).resolves.toContain(
      "model_context_window = 400000",
    );

    const clearActivation = {
      context: context(root),
      profile: profile(),
      modelMappings: mappings("gpt-5.6-sol"),
      baseline: await adapter.inspect(context(root)),
    };
    const clearPlan = await adapter.planActivation(clearActivation);
    await adapter.apply(context(root), clearPlan, {
      profile: clearActivation.profile,
      modelMappings: clearActivation.modelMappings,
    });
    const cleared = await fs.readFile(target, "utf8");
    expect(cleared).not.toContain("model_reasoning_effort");
    expect(cleared).not.toContain("model_context_window");
  });

  it("plans all Codex provider fields without returning a secret reference", async () => {
    const root = await temporaryRoot();
    await fs.writeFile(
      path.join(root, "config.toml"),
      'model = "gpt-5.3"\nmodel_provider = "openai"\n',
    );
    const adapter = createAgentCodexProviderAdapter({
      backupRoot: path.join(root, "backups"),
      backupEncryption: backupEncryption(),
      secretStore: secretStore(),
    });

    const baseline = await adapter.inspect(context(root));
    const plan = await adapter.planActivation({
      context: context(root),
      profile: profile(),
      modelMappings: mappings(),
      baseline,
    });

    expect(plan.canApply).toBe(true);
    expect(plan.status).toBe("apply");
    expect(plan.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "provider",
          desired: "work-gateway",
        }),
        expect.objectContaining({
          field: "endpoint",
          desired: "https://gateway.example.com/v1",
        }),
        expect.objectContaining({ field: "protocol", desired: "responses" }),
        expect.objectContaining({ field: "model", desired: "gpt-5.4" }),
        expect.objectContaining({
          field: "credentialStatus",
          desired: "configured",
        }),
      ]),
    );
    expect(JSON.stringify(plan)).not.toContain("agent-provider:profile-1");
    expect(JSON.stringify(plan)).not.toContain("secret-token");
  });

  it("tests the selected Profile in isolation without touching config.toml", async () => {
    const root = await temporaryRoot();
    const original = 'model = "gpt-5.3"\nmodel_provider = "openai"\n';
    await fs.writeFile(path.join(root, "config.toml"), original);
    const testConnection = vi.fn().mockResolvedValue({
      protocol: "responses",
      endpointOrigin: "https://gateway.example.com",
      model: "gpt-5.4",
      status: "ok",
      startedAt: 10,
      finishedAt: 20,
      totalMs: 10,
      retryCount: 0,
      modelCount: 3,
      modelAvailable: true,
    });
    const secrets = secretStore();
    const adapter = createAgentCodexProviderAdapter({
      backupRoot: path.join(root, "backups"),
      backupEncryption: backupEncryption(),
      secretStore: secrets,
      testConnection,
    });

    await expect(
      adapter.testConnection?.(context(root), {
        profile: profile(),
        modelMappings: mappings(),
      }),
    ).resolves.toMatchObject({
      platformId: "codex",
      profileId: "profile-1",
      status: "ok",
      modelAvailable: true,
    });
    expect(testConnection).toHaveBeenCalledWith({
      endpoint: "https://gateway.example.com/v1",
      credential: "secret-token",
      model: "gpt-5.4",
      protocol: "responses",
    });
    expect(secrets.read).toHaveBeenCalledWith("agent-provider:profile-1");
    await expect(
      fs.readFile(path.join(root, "config.toml"), "utf8"),
    ).resolves.toBe(original);
  });

  it("fails closed for unsupported connection profiles and resolves environment credentials", async () => {
    const root = await temporaryRoot();
    const connection = vi.fn().mockResolvedValue({
      protocol: "chat",
      endpointOrigin: "https://environment.example.com",
      model: "gpt-5.4",
      status: "ok",
      startedAt: 10,
      finishedAt: 20,
      totalMs: 10,
      retryCount: 0,
      modelCount: 1,
      modelAvailable: true,
    });
    const nativeConnection = vi.fn().mockResolvedValue({
      protocol: "platform-native",
      endpointOrigin: null,
      model: "gpt-5.4",
      status: "ok",
      startedAt: 20,
      finishedAt: 25,
      totalMs: 5,
      retryCount: 0,
      modelCount: null,
      modelAvailable: null,
    });
    const adapter = createAgentCodexProviderAdapter({
      backupRoot: path.join(root, "backups"),
      backupEncryption: backupEncryption(),
      secretStore: secretStore(null),
      env: { CODEX_PROVIDER_KEY: "environment-secret" },
      now: () => 25,
      testConnection: connection,
      testNativeConnection: nativeConnection,
    });

    await expect(
      adapter.testConnection?.(context(root), {
        profile: profile({ platformId: "claude" }),
        modelMappings: mappings(),
      }),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_PLATFORM_MISMATCH");
    await expect(
      adapter.testConnection?.(context(root), {
        profile: profile(),
        modelMappings: mappings(),
      }),
    ).resolves.toMatchObject({
      status: "no-credentials",
      startedAt: 25,
      model: "gpt-5.4",
    });
    await expect(
      adapter.testConnection?.(context(root), {
        profile: profile({
          name: "",
          secretRef: null,
          config: {
            providerId: "environment",
            envKey: "CODEX_PROVIDER_KEY",
          },
        }),
        modelMappings: [],
      }),
    ).resolves.toMatchObject({
      status: "unsupported",
      model: null,
    });
    await expect(
      adapter.testConnection?.(context(root), {
        profile: profile({
          name: "OpenAI",
          providerKind: "openai",
          protocol: "platform-native",
          endpoint: null,
          config: { providerId: "openai" },
          secretRef: null,
        }),
        modelMappings: mappings(),
      }),
    ).resolves.toMatchObject({
      status: "ok",
      protocol: "platform-native",
      startedAt: 20,
    });
    expect(nativeConnection).toHaveBeenCalledWith({
      codexHome: root,
      model: "gpt-5.4",
    });
    await expect(
      adapter.testConnection?.(context(root), {
        profile: profile({
          protocol: "responses",
          endpoint: "https://environment.example.com/v1",
          config: {
            providerId: "environment",
            envKey: "CODEX_PROVIDER_KEY",
          },
          secretRef: null,
        }),
        modelMappings: mappings(),
      }),
    ).resolves.toMatchObject({ status: "ok" });
    expect(connection).toHaveBeenLastCalledWith({
      endpoint: "https://environment.example.com/v1",
      credential: "environment-secret",
      model: "gpt-5.4",
      protocol: "responses",
    });
  });

  it("routes an official model test through the native Codex probe", async () => {
    const root = await temporaryRoot();
    const signal = new AbortController().signal;
    const nativeModel = vi.fn().mockResolvedValue({
      protocol: "platform-native",
      endpointOrigin: null,
      model: "gpt-5.4",
      status: "ok",
      startedAt: 30,
      finishedAt: 45,
      totalMs: 15,
      firstTokenMs: null,
      retryCount: 0,
      inputTokens: null,
      outputTokens: null,
      outputPreview: "OK",
    });
    const adapter = createAgentCodexProviderAdapter({
      backupRoot: path.join(root, "backups"),
      backupEncryption: backupEncryption(),
      secretStore: secretStore(null),
      testNativeModel: nativeModel,
    });

    await expect(
      adapter.testModel?.(
        context(root),
        {
          profile: profile({
            name: "OpenAI",
            providerKind: "openai",
            protocol: "platform-native",
            endpoint: null,
            config: { providerId: "openai" },
            secretRef: null,
          }),
          modelMappings: mappings(),
        },
        signal,
      ),
    ).resolves.toMatchObject({
      platformId: "codex",
      profileId: "profile-1",
      status: "ok",
      outputPreview: "OK",
    });
    expect(nativeModel).toHaveBeenCalledWith({
      codexHome: root,
      model: "gpt-5.4",
      signal,
    });
  });

  it("does not trust a baseline produced by an older adapter contract", async () => {
    const root = await temporaryRoot();
    await fs.writeFile(
      path.join(root, "config.toml"),
      'model = "gpt-5.3"\nmodel_provider = "openai"\n',
    );
    const adapter = createAgentCodexProviderAdapter({
      backupRoot: path.join(root, "backups"),
      backupEncryption: backupEncryption(),
      secretStore: secretStore(),
    });
    const baseline = await adapter.inspect(context(root));

    const plan = await adapter.planActivation({
      context: context(root),
      profile: profile(),
      modelMappings: mappings(),
      baseline: {
        ...baseline,
        adapterVersion: "model-profile-v1",
      },
    });

    expect(plan.canApply).toBe(false);
    expect(plan.requiresReview).toBe(true);
    expect(plan.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "provider",
          status: "backfill",
        }),
        expect.objectContaining({
          field: "model",
          status: "backfill",
        }),
      ]),
    );
  });

  it("normalizes incomplete native files and rejects invalid contexts and TOML", async () => {
    const root = await temporaryRoot();
    const adapter = createAgentCodexProviderAdapter({
      backupRoot: path.join(root, "backups"),
      backupEncryption: backupEncryption(),
      secretStore: secretStore(),
    });

    for (const invalidContext of [
      { ...context(root), agentId: "claude" },
      { ...context(root), platformId: "claude" },
      { ...context(root), rootPath: "relative" },
      { ...context(root), rootPath: `${root}\0invalid` },
    ]) {
      await expect(adapter.inspect(invalidContext)).rejects.toThrow(
        "AGENT_CODEX_PROVIDER_CONTEXT_INVALID",
      );
    }

    await fs.writeFile(path.join(root, "config.toml"), "not = [valid");
    await expect(adapter.inspect(context(root))).rejects.toThrow(
      "AGENT_CODEX_PROVIDER_CONFIG_INVALID",
    );

    await fs.writeFile(
      path.join(root, "config.toml"),
      [
        'model_provider = "minimal"',
        "",
        "[model_providers.minimal]",
        'name = "   "',
        "wire_api = 7",
        "experimental_bearer_token = false",
        "env_key = false",
        "",
      ].join("\n"),
    );
    await expect(adapter.inspect(context(root))).resolves.toMatchObject({
      values: {
        provider: "minimal",
        protocol: "responses",
        model: null,
        credentialStatus: "missing",
      },
    });
    await expect(adapter.importCurrent(context(root))).resolves.toMatchObject({
      profile: {
        name: "minimal",
        providerKind: "openai-compatible",
        protocol: "responses",
      },
      modelMappings: [],
      warnings: [],
    });

    await fs.writeFile(
      path.join(root, "config.toml"),
      [
        'model = "gpt-5.4"',
        'model_provider = "environment"',
        "",
        "[model_providers.environment]",
        'base_url = "https://environment.example.com/v1"',
        'wire_api = "responses"',
        'env_key = "CODEX_ENV_KEY"',
        "",
      ].join("\n"),
    );
    await expect(adapter.importCurrent(context(root))).resolves.toMatchObject({
      profile: {
        config: {
          providerId: "environment",
          envKey: "CODEX_ENV_KEY",
        },
      },
    });
  });

  it("blocks every malformed Codex Profile field before native writes", async () => {
    const root = await temporaryRoot();
    const adapter = createAgentCodexProviderAdapter({
      backupRoot: path.join(root, "backups"),
      backupEncryption: backupEncryption(),
      secretStore: {
        read: vi.fn().mockRejectedValue(new Error("secret unavailable")),
      },
    });
    const cases: Array<{
      candidate: AgentProviderProfile;
      mappings?: AgentProviderModelMapping[];
      reason: string;
    }> = [
      {
        candidate: profile({ protocol: "unknown" }),
        reason: "provider-protocol-unsupported",
      },
      {
        candidate: profile({ protocol: "native" }),
        reason: "provider-protocol-unsupported",
      },
      {
        candidate: profile({ endpoint: "not a url" }),
        reason: "provider-endpoint-invalid",
      },
      {
        candidate: profile({ endpoint: "https://user@example.com/v1" }),
        reason: "provider-endpoint-invalid",
      },
      {
        candidate: profile({
          endpoint: "http://localhost:11434/v1",
          secretRef: null,
          config: { providerId: "local", envKey: "invalid-key" },
        }),
        reason: "provider-env-key-invalid",
      },
      {
        candidate: profile({ name: "" }),
        reason: "provider-name-invalid",
      },
      {
        candidate: profile({ name: `bad\nname` }),
        reason: "provider-name-invalid",
      },
      {
        candidate: profile(),
        mappings: [],
        reason: "primary-model-required",
      },
      {
        candidate: profile(),
        mappings: mappings(""),
        reason: "primary-model-required",
      },
      {
        candidate: profile(),
        mappings: mappings(`bad\nmodel`),
        reason: "primary-model-invalid",
      },
      {
        candidate: profile(),
        mappings: [
          ...mappings(),
          {
            ...mappings()[0],
            id: "secondary",
            routeKey: "secondary",
          },
        ],
        reason: "primary-model-required",
      },
      {
        candidate: profile(),
        mappings: [
          {
            ...mappings()[0],
            parameters: { temperature: 1 },
          },
        ],
        reason: "primary-model-required",
      },
      {
        candidate: profile(),
        mappings: mappings("gpt-5.4", { reasoningEffort: "max" }),
        reason: "primary-model-required",
      },
      {
        candidate: profile(),
        mappings: mappings("gpt-5.4", { contextWindow: 0 }),
        reason: "primary-model-required",
      },
      {
        candidate: profile({ protocol: "openai-chat" }),
        mappings: mappings("gpt-5.4", { reasoningEffort: "high" }),
        reason: "model-reasoning-effort-unsupported",
      },
      {
        candidate: profile({ secretRef: null }),
        reason: "provider-credential-required",
      },
      {
        candidate: profile(),
        reason: "provider-secret-unavailable",
      },
    ];

    for (const item of cases) {
      const result = await adapter.planActivation({
        context: context(root),
        profile: item.candidate,
        modelMappings: item.mappings ?? mappings(),
        baseline: null,
      });
      expect(result.blockedReasons).toContain(item.reason);
    }

    await expect(
      adapter.planActivation({
        context: context(root),
        profile: profile({ platformId: "claude" }),
        modelMappings: mappings(),
        baseline: null,
      }),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_PLATFORM_MISMATCH");

    const chatPlan = await createAgentCodexProviderAdapter({
      backupRoot: path.join(root, "backups"),
      backupEncryption: backupEncryption(),
      secretStore: secretStore(),
    }).planActivation({
      context: context(root),
      profile: profile({ protocol: "openai-chat" }),
      modelMappings: mappings(),
      baseline: null,
    });
    expect(chatPlan.canApply).toBe(false);
    expect(chatPlan.blockedReasons).toContain("provider-protocol-unsupported");
  });

  it("atomically activates and verifies a managed provider while preserving unrelated config", async () => {
    const root = await temporaryRoot();
    const target = path.join(root, "config.toml");
    const auth = path.join(root, "auth.json");
    const original = [
      "# preserve this comment",
      'model = "gpt-5.3"',
      'model_provider = "openai"',
      'approval_policy = "on-request"',
      "",
      "[features]",
      "web_search = true",
      "",
      "[model_providers.old-gateway]",
      'base_url = "https://old.example.com/v1"',
      'wire_api = "responses"',
      'experimental_bearer_token = "old-secret-token"',
      "",
    ].join("\n");
    await fs.writeFile(target, original);
    await fs.writeFile(auth, '{"tokens":"do-not-touch"}\n');
    const secrets = secretStore();
    const adapter = createAgentCodexProviderAdapter({
      backupRoot: path.join(root, "backups"),
      backupEncryption: backupEncryption(),
      secretStore: secrets,
      now: () => 42,
    });
    const activation = {
      context: context(root),
      profile: profile(),
      modelMappings: mappings(),
      baseline: await adapter.inspect(context(root)),
    };
    const plan = await adapter.planActivation(activation);

    const receipt = await adapter.apply(context(root), plan, {
      profile: activation.profile,
      modelMappings: activation.modelMappings,
    });
    await expect(
      adapter.verify(context(root), plan, receipt),
    ).resolves.toMatchObject({
      verified: true,
      state: {
        values: {
          provider: "work-gateway",
          model: "gpt-5.4",
          endpoint: "https://gateway.example.com/v1",
          protocol: "responses",
          credentialStatus: "configured",
        },
      },
    });
    const updated = await fs.readFile(target, "utf8");
    expect(updated).toContain("# preserve this comment");
    expect(updated).toContain('approval_policy = "on-request"');
    expect(updated).toContain("[features]");
    expect(updated).toContain("[model_providers.work-gateway]");
    expect(updated).toContain('experimental_bearer_token = "secret-token"');
    expect(updated).not.toContain("[profiles.work-gateway]");
    expect(updated).toContain('model_provider = "work-gateway"');
    await expect(fs.readFile(auth, "utf8")).resolves.toBe(
      '{"tokens":"do-not-touch"}\n',
    );
    expect(JSON.stringify(receipt)).not.toContain("secret-token");
    expect(receipt.backupRef).not.toBeNull();
    await expect(
      fs.readFile(receipt.backupRef!, "utf8"),
    ).resolves.not.toContain("old-secret-token");

    await expect(adapter.rollback(context(root), receipt)).resolves.toEqual({
      restored: true,
      nativeDigest: plan.currentDigest,
    });
    await expect(fs.readFile(target, "utf8")).resolves.toBe(original);
  });

  it("projects an environment credential without reading or retaining a managed token", async () => {
    const root = await temporaryRoot();
    const secrets = secretStore();
    const adapter = createAgentCodexProviderAdapter({
      backupRoot: path.join(root, "backups"),
      backupEncryption: backupEncryption(),
      secretStore: secrets,
    });
    const envProfile = profile({
      secretRef: null,
      config: {
        providerId: "environment-gateway",
        envKey: "CODEX_GATEWAY_KEY",
      },
    });
    const activation = {
      context: context(root),
      profile: envProfile,
      modelMappings: mappings(),
      baseline: await adapter.inspect(context(root)),
    };
    const plan = await adapter.planActivation(activation);
    const receipt = await adapter.apply(context(root), plan, {
      profile: envProfile,
      modelMappings: activation.modelMappings,
    });

    const updated = await fs.readFile(path.join(root, "config.toml"), "utf8");
    expect(updated).toContain('env_key = "CODEX_GATEWAY_KEY"');
    expect(updated).not.toContain("experimental_bearer_token");
    expect(secrets.read).not.toHaveBeenCalled();
    await expect(
      adapter.verify(context(root), plan, receipt),
    ).resolves.toMatchObject({ verified: true });
  });

  it("activates the native OpenAI profile and removes a newly created config on rollback", async () => {
    const root = await temporaryRoot();
    const adapter = createAgentCodexProviderAdapter({
      backupRoot: path.join(root, "backups"),
      backupEncryption: backupEncryption(),
      secretStore: secretStore(),
    });
    const nativeProfile = profile({
      providerKind: "openai",
      protocol: "platform-native",
      endpoint: null,
      config: { providerId: "openai" },
      secretRef: null,
    });
    const activation = {
      context: context(root),
      profile: nativeProfile,
      modelMappings: mappings("gpt-5.4"),
      baseline: await adapter.inspect(context(root)),
    };
    const plan = await adapter.planActivation(activation);
    const receipt = await adapter.apply(context(root), plan, {
      profile: nativeProfile,
      modelMappings: activation.modelMappings,
    });

    expect(receipt.backupRef).toBeNull();
    await expect(
      adapter.verify(context(root), plan, {
        ...receipt,
        nativeDigestAfter: "wrong-digest",
      }),
    ).resolves.toMatchObject({
      verified: false,
      errorCode: "provider-state-mismatch",
    });
    await expect(adapter.rollback(context(root), receipt)).resolves.toEqual({
      restored: true,
      nativeDigest: plan.currentDigest,
    });
    await expect(fs.stat(path.join(root, "config.toml"))).rejects.toMatchObject(
      { code: "ENOENT" },
    );

    await expect(adapter.importCurrent(context(root))).resolves.toMatchObject({
      profile: {
        name: "OpenAI",
        providerKind: "openai",
        protocol: "platform-native",
      },
    });
    await expect(
      adapter.rollback(context(root), {
        ...receipt,
        nativeDigestBefore: "different",
      }),
    ).resolves.toEqual({
      restored: false,
      nativeDigest: plan.currentDigest,
      errorCode: "provider-rollback-mismatch",
    });
  });

  it("rejects stale or tampered activation contracts and reports rollback failures", async () => {
    const root = await temporaryRoot();
    const adapter = createAgentCodexProviderAdapter({
      backupRoot: path.join(root, "backups"),
      backupEncryption: backupEncryption(),
      secretStore: secretStore(),
    });
    const activation = {
      context: context(root),
      profile: profile(),
      modelMappings: mappings(),
      baseline: await adapter.inspect(context(root)),
    };
    const plan = await adapter.planActivation(activation);
    const target = {
      profile: activation.profile,
      modelMappings: activation.modelMappings,
    };

    for (const invalidPlan of [
      { ...plan, platformId: "claude" },
      { ...plan, profileId: "other" },
      { ...plan, adapterVersion: "old" },
      { ...plan, currentDigest: "stale" },
      { ...plan, status: "blocked" as const },
      { ...plan, canApply: false },
    ]) {
      await expect(
        adapter.apply(context(root), invalidPlan, target),
      ).rejects.toThrow("AGENT_CODEX_PROVIDER_PLAN_INVALID");
    }

    const changedProfile = profile({
      endpoint: "https://different.example.com/v1",
    });
    await expect(
      adapter.apply(context(root), plan, {
        profile: changedProfile,
        modelMappings: mappings(),
      }),
    ).rejects.toThrow("AGENT_CODEX_PROVIDER_PLAN_INVALID");

    const invalidTarget = profile({ endpoint: "not a url" });
    await expect(
      adapter.apply(context(root), plan, {
        profile: invalidTarget,
        modelMappings: mappings(),
      }),
    ).rejects.toThrow("AGENT_CODEX_PROVIDER_PROFILE_INVALID");

    await expect(
      adapter.rollback(context(root), {
        platformId: "codex",
        profileId: "profile-1",
        adapterVersion: "codex-provider-profile-v1",
        nativeDigestBefore: "before",
        nativeDigestAfter: "after",
        backupRef: path.join(root, "missing.enc"),
        appliedAt: 1,
      }),
    ).resolves.toEqual({
      restored: false,
      nativeDigest: null,
      errorCode: "provider-rollback-failed",
    });
  });

  it("fails closed for invalid profiles, stale writes, symlinks, and missing secrets", async () => {
    const root = await temporaryRoot();
    const target = path.join(root, "config.toml");
    await fs.writeFile(
      target,
      'model = "gpt-5.3"\nmodel_provider = "openai"\n',
    );
    const backupRoot = path.join(root, "backups");
    const invalidAdapter = createAgentCodexProviderAdapter({
      backupRoot,
      backupEncryption: backupEncryption(),
      secretStore: secretStore(),
    });
    for (const invalid of [
      profile({ config: {} }),
      profile({ config: { providerId: "openai" } }),
      profile({ endpoint: "http://remote.example.com/v1" }),
      profile({
        config: { providerId: "work", envKey: "CODEX_KEY" },
        secretRef: "agent-provider:profile-1",
      }),
    ]) {
      await expect(
        invalidAdapter.planActivation({
          context: context(root),
          profile: invalid,
          modelMappings: mappings(),
          baseline: null,
        }),
      ).resolves.toMatchObject({ canApply: false, status: "blocked" });
    }

    const disappearingSecret = {
      read: vi
        .fn()
        .mockResolvedValueOnce("secret-token")
        .mockResolvedValue(null),
    };
    const adapter = createAgentCodexProviderAdapter({
      backupRoot,
      backupEncryption: backupEncryption(),
      secretStore: disappearingSecret,
    });
    const activation = {
      context: context(root),
      profile: profile(),
      modelMappings: mappings(),
      baseline: await adapter.inspect(context(root)),
    };
    const plan = await adapter.planActivation(activation);
    await expect(
      adapter.apply(context(root), plan, {
        profile: activation.profile,
        modelMappings: activation.modelMappings,
      }),
    ).rejects.toThrow("AGENT_CODEX_PROVIDER_SECRET_MISSING");

    const staleAdapter = createAgentCodexProviderAdapter({
      backupRoot,
      backupEncryption: backupEncryption(),
      secretStore: secretStore(),
      hooks: {
        beforeWrite: async () => {
          await fs.appendFile(target, "# external edit\n");
        },
      },
    });
    const staleActivation = {
      ...activation,
      baseline: await staleAdapter.inspect(context(root)),
    };
    const stalePlan = await staleAdapter.planActivation(staleActivation);
    await expect(
      staleAdapter.apply(context(root), stalePlan, {
        profile: activation.profile,
        modelMappings: activation.modelMappings,
      }),
    ).rejects.toThrow("AGENT_CODEX_PROVIDER_CONCURRENT_CHANGE");

    const symlinkRoot = await temporaryRoot();
    await fs.symlink(target, path.join(symlinkRoot, "config.toml"));
    await expect(adapter.inspect(context(symlinkRoot))).rejects.toThrow(
      "AGENT_CODEX_PROVIDER_CONFIG_INVALID",
    );
  });

  it("restores the original config when post-write verification fails", async () => {
    const root = await temporaryRoot();
    const target = path.join(root, "config.toml");
    const original = 'model = "gpt-5.3"\nmodel_provider = "openai"\n';
    await fs.writeFile(target, original);
    const adapter = createAgentCodexProviderAdapter({
      backupRoot: path.join(root, "backups"),
      backupEncryption: backupEncryption(),
      secretStore: secretStore(),
      hooks: {
        afterWrite: async () => {
          await fs.writeFile(target, "not = [valid");
        },
      },
    });
    const activation = {
      context: context(root),
      profile: profile(),
      modelMappings: mappings(),
      baseline: await adapter.inspect(context(root)),
    };
    const plan = await adapter.planActivation(activation);

    await expect(
      adapter.apply(context(root), plan, {
        profile: activation.profile,
        modelMappings: activation.modelMappings,
      }),
    ).rejects.toThrow("AGENT_CODEX_PROVIDER_WRITE_FAILED");
    await expect(fs.readFile(target, "utf8")).resolves.toBe(original);
  });

  it("restores when a syntactically valid post-write edit changes the desired provider", async () => {
    const root = await temporaryRoot();
    const target = path.join(root, "config.toml");
    const original = 'model = "gpt-5.3"\nmodel_provider = "openai"\n';
    await fs.writeFile(target, original);
    const adapter = createAgentCodexProviderAdapter({
      backupRoot: path.join(root, "backups"),
      backupEncryption: backupEncryption(),
      secretStore: secretStore(),
      hooks: {
        afterWrite: async () => {
          await fs.writeFile(
            target,
            'model = "gpt-5.4"\nmodel_provider = "openai"\n',
          );
        },
      },
    });
    const activation = {
      context: context(root),
      profile: profile(),
      modelMappings: mappings(),
      baseline: await adapter.inspect(context(root)),
    };
    const plan = await adapter.planActivation(activation);

    await expect(
      adapter.apply(context(root), plan, {
        profile: activation.profile,
        modelMappings: activation.modelMappings,
      }),
    ).rejects.toThrow("AGENT_CODEX_PROVIDER_WRITE_FAILED");
    await expect(fs.readFile(target, "utf8")).resolves.toBe(original);
  });
});
