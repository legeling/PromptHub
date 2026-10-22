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
import { createAgentClaudeProviderAdapter } from "../../../src/main/services/agent-claude-provider-adapter";

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claude-profile-"));
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
    agentId: "claude",
    platformId: "claude",
    rootPath,
  };
}

function profile(
  overrides: Partial<AgentProviderProfile> = {},
): AgentProviderProfile {
  return {
    id: "profile-claude",
    platformId: "claude",
    name: "Anthropic Gateway",
    providerKind: "anthropic-compatible",
    protocol: "anthropic-messages",
    endpoint: "https://gateway.example.com",
    config: { credentialEnvKey: "ANTHROPIC_API_KEY" },
    secretRef: "agent-provider:profile-claude",
    source: "manual",
    archived: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function mappings(model = "claude-sonnet-4-6"): AgentProviderModelMapping[] {
  return [
    {
      id: "mapping-primary",
      providerProfileId: "profile-claude",
      routeKey: "primary",
      modelId: model,
      parameters: {},
    },
  ];
}

function roleMappings(): AgentProviderModelMapping[] {
  return [
    ...mappings(),
    {
      id: "mapping-sonnet",
      providerProfileId: "profile-claude",
      routeKey: "sonnet",
      modelId: "claude-sonnet-4-6",
      parameters: {},
    },
    {
      id: "mapping-opus",
      providerProfileId: "profile-claude",
      routeKey: "opus",
      modelId: "claude-opus-4-6",
      parameters: {},
    },
    {
      id: "mapping-haiku",
      providerProfileId: "profile-claude",
      routeKey: "haiku",
      modelId: "claude-haiku-4-5",
      parameters: {},
    },
    {
      id: "mapping-subagent",
      providerProfileId: "profile-claude",
      routeKey: "subagent",
      modelId: "claude-haiku-4-5",
      parameters: {},
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

function options(root: string) {
  return {
    backupRoot: path.join(root, "backups"),
    backupEncryption: backupEncryption(),
    secretStore: secretStore(),
  };
}

describe("Claude Code unified Provider Profile adapter", () => {
  it("round-trips Claude role models and clears stale managed routes", async () => {
    const root = await temporaryRoot();
    const targetPath = path.join(root, "settings.json");
    await fs.writeFile(
      targetPath,
      JSON.stringify({
        model: "old-primary",
        modelSettings: { custom: { preserved: true } },
        permissions: { allow: ["Read"] },
        env: {
          ANTHROPIC_MODEL: "effective-primary",
          ANTHROPIC_DEFAULT_SONNET_MODEL: "old-sonnet",
          ANTHROPIC_DEFAULT_OPUS_MODEL: "old-opus",
          ANTHROPIC_DEFAULT_HAIKU_MODEL: "old-haiku",
          CLAUDE_CODE_SUBAGENT_MODEL: "old-subagent",
          UNRELATED_ENV: "preserve-me",
        },
      }),
    );
    const adapter = createAgentClaudeProviderAdapter(options(root));
    const baseline = await adapter.inspect(context(root));
    expect(baseline.values).toMatchObject({
      model: "effective-primary",
      sonnetModel: "old-sonnet",
      opusModel: "old-opus",
      haikuModel: "old-haiku",
      subagentModel: "old-subagent",
    });

    const routeInput = {
      context: context(root),
      profile: profile(),
      modelMappings: roleMappings(),
      baseline,
    };
    const routePlan = await adapter.planActivation(routeInput);
    expect(routePlan.canApply).toBe(true);
    const routeReceipt = await adapter.apply(context(root), routePlan, {
      profile: routeInput.profile,
      modelMappings: routeInput.modelMappings,
    });
    const routed = JSON.parse(await fs.readFile(targetPath, "utf8"));
    expect(routed.env).not.toHaveProperty("ANTHROPIC_MODEL");
    expect(routed.modelSettings).toEqual({ custom: { preserved: true } });
    expect(routed).toMatchObject({
      model: "claude-sonnet-4-6",
      permissions: { allow: ["Read"] },
      env: {
        ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-4-6",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus-4-6",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku-4-5",
        CLAUDE_CODE_SUBAGENT_MODEL: "claude-haiku-4-5",
        UNRELATED_ENV: "preserve-me",
      },
    });
    await expect(
      adapter.verify(context(root), routePlan, routeReceipt),
    ).resolves.toMatchObject({ verified: true });
    await expect(adapter.importCurrent(context(root))).resolves.toMatchObject({
      modelMappings: expect.arrayContaining([
        expect.objectContaining({
          routeKey: "primary",
          modelId: "claude-sonnet-4-6",
        }),
        expect.objectContaining({
          routeKey: "sonnet",
          modelId: "claude-sonnet-4-6",
        }),
        expect.objectContaining({
          routeKey: "opus",
          modelId: "claude-opus-4-6",
        }),
        expect.objectContaining({
          routeKey: "haiku",
          modelId: "claude-haiku-4-5",
        }),
        expect.objectContaining({
          routeKey: "subagent",
          modelId: "claude-haiku-4-5",
        }),
      ]),
    });

    const primaryOnlyInput = {
      context: context(root),
      profile: profile(),
      modelMappings: mappings("claude-opus-4-6"),
      baseline: await adapter.inspect(context(root)),
    };
    const primaryOnlyPlan = await adapter.planActivation(primaryOnlyInput);
    await adapter.apply(context(root), primaryOnlyPlan, {
      profile: primaryOnlyInput.profile,
      modelMappings: primaryOnlyInput.modelMappings,
    });
    const primaryOnly = JSON.parse(await fs.readFile(targetPath, "utf8"));
    expect(primaryOnly.env.UNRELATED_ENV).toBe("preserve-me");
    expect(primaryOnly.env).not.toHaveProperty(
      "ANTHROPIC_DEFAULT_SONNET_MODEL",
    );
    expect(primaryOnly.env).not.toHaveProperty("ANTHROPIC_DEFAULT_OPUS_MODEL");
    expect(primaryOnly.env).not.toHaveProperty("ANTHROPIC_DEFAULT_HAIKU_MODEL");
    expect(primaryOnly.env).not.toHaveProperty("CLAUDE_CODE_SUBAGENT_MODEL");
  });

  it("imports settings.json without exposing native credentials or unknown fields", async () => {
    const root = await temporaryRoot();
    await fs.writeFile(
      path.join(root, "settings.json"),
      JSON.stringify(
        {
          model: "claude-opus-4-6",
          permissions: { allow: ["Read"] },
          env: {
            ANTHROPIC_BASE_URL: "https://legacy.example.com/?token=hidden",
            ANTHROPIC_AUTH_TOKEN: "native-secret",
            UNRELATED_ENV: "preserve-me",
          },
        },
        null,
        2,
      ),
    );
    const adapter = createAgentClaudeProviderAdapter(options(root));

    const state = await adapter.inspect(context(root));
    expect(state.values).toMatchObject({
      provider: "custom-gateway",
      endpoint: "https://legacy.example.com",
      protocol: "anthropic-messages",
      model: "claude-opus-4-6",
      credentialKind: "auth-token",
      credentialStatus: "configured",
    });
    expect(JSON.stringify(state)).not.toContain("native-secret");
    expect(JSON.stringify(state)).not.toContain("token=hidden");
    expect(JSON.stringify(state)).not.toContain("preserve-me");

    const imported = await adapter.importCurrent(context(root));
    expect(imported).toMatchObject({
      profile: {
        platformId: "claude",
        name: "Claude custom-gateway",
        providerKind: "anthropic-compatible",
        protocol: "anthropic-messages",
        endpoint: "https://legacy.example.com",
        config: { credentialEnvKey: "ANTHROPIC_AUTH_TOKEN" },
        secretRef: null,
        source: "native-import",
      },
      modelMappings: [{ routeKey: "primary", modelId: "claude-opus-4-6" }],
    });
    expect(imported.warnings).toContain("native-credential-not-imported");
    expect(JSON.stringify(imported)).not.toContain("native-secret");
  });

  it("plans and applies an API-key profile while preserving unrelated JSON", async () => {
    const root = await temporaryRoot();
    const targetPath = path.join(root, "settings.json");
    const original = `${JSON.stringify(
      {
        model: "claude-haiku-4-5",
        permissions: { allow: ["Read", "Grep"] },
        localeNote: "保留此字段✨",
        env: { UNRELATED_ENV: "preserve-me" },
      },
      null,
      2,
    )}\n`;
    await fs.writeFile(targetPath, original);
    const adapter = createAgentClaudeProviderAdapter(options(root));
    const baseline = await adapter.inspect(context(root));
    const activation = {
      context: context(root),
      profile: profile(),
      modelMappings: mappings(),
      baseline,
    };

    const plan = await adapter.planActivation(activation);
    expect(plan.canApply).toBe(true);
    expect(plan.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "provider",
          desired: "custom-gateway",
        }),
        expect.objectContaining({
          field: "endpoint",
          desired: "https://gateway.example.com",
        }),
        expect.objectContaining({
          field: "protocol",
          desired: "anthropic-messages",
        }),
        expect.objectContaining({
          field: "model",
          desired: "claude-sonnet-4-6",
        }),
        expect.objectContaining({
          field: "credentialKind",
          desired: "api-key",
        }),
      ]),
    );
    expect(JSON.stringify(plan)).not.toContain("secret-token");
    expect(JSON.stringify(plan)).not.toContain("agent-provider:profile-claude");

    const receipt = await adapter.apply(context(root), plan, {
      profile: activation.profile,
      modelMappings: activation.modelMappings,
    });
    const written = JSON.parse(await fs.readFile(targetPath, "utf8"));
    expect(written).toMatchObject({
      model: "claude-sonnet-4-6",
      permissions: { allow: ["Read", "Grep"] },
      localeNote: "保留此字段✨",
      env: {
        ANTHROPIC_BASE_URL: "https://gateway.example.com",
        ANTHROPIC_API_KEY: "secret-token",
        UNRELATED_ENV: "preserve-me",
      },
    });
    expect(written.env).not.toHaveProperty("ANTHROPIC_AUTH_TOKEN");
    expect(receipt.backupRef).toMatch(/settings\.json\.enc$/);
    await expect(
      adapter.verify(context(root), plan, receipt),
    ).resolves.toMatchObject({ verified: true });

    await expect(
      adapter.rollback(context(root), receipt),
    ).resolves.toMatchObject({ restored: true });
    await expect(fs.readFile(targetPath, "utf8")).resolves.toBe(original);
  });

  it("supports explicit bearer-token profiles and official platform-owned auth", async () => {
    const root = await temporaryRoot();
    const adapter = createAgentClaudeProviderAdapter(options(root));
    const bearerProfile = profile({
      config: { credentialEnvKey: "ANTHROPIC_AUTH_TOKEN" },
    });
    const bearerInput = {
      context: context(root),
      profile: bearerProfile,
      modelMappings: mappings(),
      baseline: await adapter.inspect(context(root)),
    };
    const bearerPlan = await adapter.planActivation(bearerInput);
    const bearerReceipt = await adapter.apply(context(root), bearerPlan, {
      profile: bearerProfile,
      modelMappings: mappings(),
    });
    const bearerSettings = JSON.parse(
      await fs.readFile(path.join(root, "settings.json"), "utf8"),
    );
    expect(bearerSettings.env).toMatchObject({
      ANTHROPIC_AUTH_TOKEN: "secret-token",
      ANTHROPIC_BASE_URL: "https://gateway.example.com",
    });
    expect(bearerSettings.env).not.toHaveProperty("ANTHROPIC_API_KEY");

    const official = profile({
      id: "profile-official",
      name: "Claude subscription",
      providerKind: "anthropic",
      protocol: "platform-native",
      endpoint: null,
      config: {},
      secretRef: null,
    });
    const officialPlan = await adapter.planActivation({
      context: context(root),
      profile: official,
      modelMappings: mappings("claude-opus-4-6"),
      baseline: await adapter.inspect(context(root)),
    });
    const officialReceipt = await adapter.apply(context(root), officialPlan, {
      profile: official,
      modelMappings: mappings("claude-opus-4-6"),
    });
    const officialSettings = JSON.parse(
      await fs.readFile(path.join(root, "settings.json"), "utf8"),
    );
    expect(officialSettings.model).toBe("claude-opus-4-6");
    expect(officialSettings.env).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(officialSettings.env).not.toHaveProperty("ANTHROPIC_AUTH_TOKEN");
    expect(officialSettings.env).not.toHaveProperty("ANTHROPIC_BASE_URL");
    expect(officialReceipt.nativeDigestBefore).toBe(
      bearerReceipt.nativeDigestAfter,
    );
  });

  it("tests a Profile in isolation using the selected Anthropic auth kind", async () => {
    const root = await temporaryRoot();
    const testConnection = vi.fn().mockResolvedValue({
      protocol: "anthropic-messages",
      endpointOrigin: "https://gateway.example.com",
      model: "claude-sonnet-4-6",
      status: "ok",
      startedAt: 10,
      finishedAt: 20,
      totalMs: 10,
      retryCount: 0,
      modelCount: 2,
      modelAvailable: true,
    });
    const testModel = vi.fn().mockResolvedValue({
      protocol: "anthropic-messages",
      endpointOrigin: "https://gateway.example.com",
      model: "claude-sonnet-4-6",
      status: "ok",
      startedAt: 10,
      finishedAt: 25,
      totalMs: 15,
      firstTokenMs: 8,
      retryCount: 0,
      inputTokens: 9,
      outputTokens: 1,
      outputPreview: "OK",
    });
    const secrets = secretStore();
    const adapter = createAgentClaudeProviderAdapter({
      ...options(root),
      secretStore: secrets,
      testConnection,
      testModel,
    });
    const target = { profile: profile(), modelMappings: mappings() };

    await expect(
      adapter.testConnection?.(context(root), target),
    ).resolves.toMatchObject({
      platformId: "claude",
      profileId: "profile-claude",
      status: "ok",
    });
    const controller = new AbortController();
    await expect(
      adapter.testModel?.(context(root), target, controller.signal),
    ).resolves.toMatchObject({
      platformId: "claude",
      status: "ok",
      outputPreview: "OK",
    });
    expect(testConnection).toHaveBeenCalledWith({
      endpoint: "https://gateway.example.com",
      credential: "secret-token",
      credentialKind: "api-key",
      model: "claude-sonnet-4-6",
      protocol: "anthropic-messages",
    });
    expect(testModel).toHaveBeenCalledWith({
      endpoint: "https://gateway.example.com",
      credential: "secret-token",
      credentialKind: "api-key",
      model: "claude-sonnet-4-6",
      protocol: "anthropic-messages",
      signal: controller.signal,
    });
    expect(secrets.read).toHaveBeenCalledWith("agent-provider:profile-claude");
    await expect(
      fs.stat(path.join(root, "settings.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("fails closed for unsafe profiles, malformed native files, and stale writes", async () => {
    const root = await temporaryRoot();
    const targetPath = path.join(root, "settings.json");
    const adapter = createAgentClaudeProviderAdapter({
      ...options(root),
      secretStore: secretStore(null),
    });

    for (const invalidContext of [
      { ...context(root), agentId: "codex" },
      { ...context(root), platformId: "codex" },
      { ...context(root), rootPath: undefined as unknown as string },
      { ...context(root), rootPath: " " },
      { ...context(root), rootPath: "relative" },
      { ...context(root), rootPath: `${root}\0invalid` },
    ]) {
      await expect(adapter.inspect(invalidContext)).rejects.toThrow(
        "AGENT_CLAUDE_PROVIDER_CONTEXT_INVALID",
      );
    }

    await fs.writeFile(targetPath, "{not-json");
    await expect(adapter.inspect(context(root))).rejects.toThrow(
      "AGENT_CLAUDE_PROVIDER_CONFIG_INVALID",
    );
    await fs.writeFile(targetPath, "{}\n");

    for (const invalid of [
      profile({ platformId: "codex" }),
      profile({ protocol: "openai-chat" }),
      profile({ endpoint: "not a URL" }),
      profile({ endpoint: "http://remote.example.com" }),
      profile({ config: { credentialEnvKey: "UNSAFE_KEY" } }),
      profile({ providerKind: "amazon-bedrock" }),
    ]) {
      await expect(
        adapter.planActivation({
          context: context(root),
          profile: invalid,
          modelMappings: mappings(),
          baseline: null,
        }),
      ).resolves.toMatchObject({ canApply: false, status: "blocked" });
    }

    const missingSecretInput = {
      context: context(root),
      profile: profile(),
      modelMappings: mappings(),
      baseline: await adapter.inspect(context(root)),
    };
    const missingSecretPlan = await adapter.planActivation(missingSecretInput);
    expect(missingSecretPlan.blockedReasons).toContain(
      "provider-secret-missing",
    );

    const staleAdapter = createAgentClaudeProviderAdapter({
      ...options(root),
      hooks: {
        beforeWrite: async () => {
          await fs.writeFile(targetPath, '{"external":true}\n');
        },
      },
    });
    const staleInput = {
      ...missingSecretInput,
      baseline: await staleAdapter.inspect(context(root)),
    };
    const stalePlan = await staleAdapter.planActivation(staleInput);
    await expect(
      staleAdapter.apply(context(root), stalePlan, {
        profile: staleInput.profile,
        modelMappings: staleInput.modelMappings,
      }),
    ).rejects.toThrow("AGENT_CLAUDE_PROVIDER_CONCURRENT_CHANGE");

    const symlinkRoot = await temporaryRoot();
    await fs.symlink(targetPath, path.join(symlinkRoot, "settings.json"));
    await expect(staleAdapter.inspect(context(symlinkRoot))).rejects.toThrow(
      "AGENT_CLAUDE_PROVIDER_CONFIG_INVALID",
    );
  });

  it("restores the exact prior file after post-write verification failure", async () => {
    const root = await temporaryRoot();
    const targetPath = path.join(root, "settings.json");
    const original = '{"model":"claude-haiku-4-5","unknown":true}';
    await fs.writeFile(targetPath, original);
    const adapter = createAgentClaudeProviderAdapter({
      ...options(root),
      hooks: {
        afterWrite: async () => {
          await fs.writeFile(targetPath, '{"model":"wrong-model"}\n');
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
    ).rejects.toThrow("AGENT_CLAUDE_PROVIDER_WRITE_FAILED");
    await expect(fs.readFile(targetPath, "utf8")).resolves.toBe(original);
  });

  it("imports supported native provider modes as read-only or credential-safe profiles", async () => {
    const root = await temporaryRoot();
    const targetPath = path.join(root, "settings.json");
    const adapter = createAgentClaudeProviderAdapter(options(root));

    for (const [envKey, provider] of [
      ["CLAUDE_CODE_USE_BEDROCK", "amazon-bedrock"],
      ["CLAUDE_CODE_USE_VERTEX", "google-vertex"],
      ["CLAUDE_CODE_USE_FOUNDRY", "microsoft-foundry"],
    ] as const) {
      await fs.writeFile(
        targetPath,
        `{\n // Claude accepts JSONC\n "env": {"${envKey}": "1",},\n}\n`,
      );
      const imported = await adapter.importCurrent(context(root));
      expect(imported).toMatchObject({
        profile: {
          providerKind: provider,
          protocol: "platform-native",
          config: {},
        },
        modelMappings: [],
      });
      expect(imported.warnings).toContain("native-provider-read-only");
    }

    await fs.writeFile(
      targetPath,
      JSON.stringify({
        model: "claude-haiku-4",
        env: { ANTHROPIC_API_KEY: "native-api-key" },
      }),
    );
    const direct = await adapter.importCurrent(context(root));
    expect(direct).toMatchObject({
      profile: {
        providerKind: "anthropic",
        protocol: "anthropic-messages",
        endpoint: null,
        config: { credentialEnvKey: "ANTHROPIC_API_KEY" },
      },
    });
    expect(JSON.stringify(direct)).not.toContain("native-api-key");

    await fs.writeFile(targetPath, '{"model":" "}');
    await expect(adapter.inspect(context(root))).resolves.toMatchObject({
      values: { model: null },
    });

    await fs.rm(targetPath);
    await expect(adapter.inspect(context(root))).resolves.toMatchObject({
      values: {
        provider: "anthropic",
        protocol: "platform-native",
        credentialStatus: "platform-managed",
        model: null,
      },
    });
  });

  it("reports every invalid profile boundary without reading credentials into public state", async () => {
    const root = await temporaryRoot();
    const throwingSecrets = {
      read: vi.fn().mockRejectedValue(new Error("keychain unavailable")),
    };
    const adapter = createAgentClaudeProviderAdapter({
      ...options(root),
      secretStore: throwingSecrets,
    });
    const baseline = await adapter.inspect(context(root));
    const cases: Array<{
      candidate: AgentProviderProfile;
      mappings?: AgentProviderModelMapping[];
      reason: string;
    }> = [
      {
        candidate: profile({ name: "" }),
        reason: "provider-name-invalid",
      },
      {
        candidate: profile({ name: "x".repeat(81) }),
        reason: "provider-name-invalid",
      },
      {
        candidate: profile(),
        mappings: [],
        reason: "primary-model-required",
      },
      {
        candidate: profile(),
        mappings: [...mappings(), ...mappings()],
        reason: "primary-model-required",
      },
      {
        candidate: profile(),
        mappings: [
          ...mappings(),
          {
            id: "secondary",
            providerProfileId: "profile-claude",
            routeKey: "secondary",
            modelId: "other",
            parameters: {},
          },
        ],
        reason: "primary-model-required",
      },
      {
        candidate: profile(),
        mappings: [roleMappings()[0]!, roleMappings()[1]!, roleMappings()[1]!],
        reason: "primary-model-required",
      },
      {
        candidate: profile(),
        mappings: [
          roleMappings()[0]!,
          {
            ...roleMappings()[1]!,
            parameters: { temperature: 0 },
          },
        ],
        reason: "primary-model-required",
      },
      {
        candidate: profile(),
        mappings: [
          roleMappings()[0]!,
          {
            ...roleMappings()[1]!,
            modelId: `bad${String.fromCharCode(0)}model`,
          },
        ],
        reason: "primary-model-required",
      },
      {
        candidate: profile(),
        mappings: [
          {
            ...mappings()[0]!,
            parameters: { temperature: 0 },
          },
        ],
        reason: "primary-model-required",
      },
      {
        candidate: profile(),
        mappings: mappings("bad\u0000model"),
        reason: "primary-model-required",
      },
      {
        candidate: profile({
          providerKind: "anthropic-compatible",
          endpoint: null,
        }),
        reason: "provider-endpoint-required",
      },
      {
        candidate: profile({ config: { unexpected: true } }),
        reason: "provider-config-unsupported",
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

    for (const testCase of cases) {
      const plan = await adapter.planActivation({
        context: context(root),
        profile: testCase.candidate,
        modelMappings: testCase.mappings ?? mappings(),
        baseline,
      });
      expect(plan.canApply).toBe(false);
      expect(plan.blockedReasons).toContain(testCase.reason);
      expect(JSON.stringify(plan)).not.toContain("keychain unavailable");
    }
  });

  it("returns explicit isolation statuses for native, unavailable, and mismatched test targets", async () => {
    const root = await temporaryRoot();
    const now = vi.fn().mockReturnValue(42);
    const connectionProbe = vi.fn();
    const modelProbe = vi.fn();
    const adapter = createAgentClaudeProviderAdapter({
      ...options(root),
      now,
      testConnection: connectionProbe,
      testModel: modelProbe,
    });
    const native = profile({
      providerKind: "anthropic",
      protocol: "platform-native",
      endpoint: null,
      config: {},
      secretRef: null,
    });
    const unavailable = profile({ secretRef: null });
    const invalid = profile({ protocol: "openai-chat" });

    await expect(
      adapter.testConnection?.(context(root), {
        profile: native,
        modelMappings: mappings(),
      }),
    ).resolves.toMatchObject({
      status: "unsupported",
      startedAt: 42,
      finishedAt: 42,
    });
    await expect(
      adapter.testModel?.(
        context(root),
        { profile: native, modelMappings: mappings() },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ status: "unsupported", totalMs: 0 });
    await expect(
      adapter.testConnection?.(context(root), {
        profile: unavailable,
        modelMappings: mappings(),
      }),
    ).resolves.toMatchObject({ status: "no-credentials" });
    await expect(
      adapter.testConnection?.(context(root), {
        profile: invalid,
        modelMappings: mappings(),
      }),
    ).resolves.toMatchObject({ status: "unsupported" });
    await expect(
      adapter.testConnection?.(context(root), {
        profile: invalid,
        modelMappings: [],
      }),
    ).resolves.toMatchObject({ status: "unsupported", model: null });
    await expect(
      adapter.testModel?.(
        context(root),
        { profile: invalid, modelMappings: [] },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ status: "unsupported", model: null });
    await expect(
      adapter.testModel?.(
        context(root),
        { profile: invalid, modelMappings: mappings() },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ status: "unsupported" });
    await expect(
      adapter.testModel?.(
        context(root),
        { profile: unavailable, modelMappings: mappings() },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ status: "no-credentials" });
    for (const method of ["testConnection", "testModel"] as const) {
      const action =
        method === "testConnection"
          ? adapter.testConnection?.(context(root), {
              profile: profile({ platformId: "codex" }),
              modelMappings: mappings(),
            })
          : adapter.testModel?.(
              context(root),
              {
                profile: profile({ platformId: "codex" }),
                modelMappings: mappings(),
              },
              new AbortController().signal,
            );
      await expect(action).rejects.toThrow(
        "AGENT_PROVIDER_PROFILE_PLATFORM_MISMATCH",
      );
    }
    expect(connectionProbe).not.toHaveBeenCalled();
    expect(modelProbe).not.toHaveBeenCalled();
  });

  it("uses the official endpoint for direct API profiles and validates apply plans", async () => {
    const root = await temporaryRoot();
    const targetPath = path.join(root, "settings.json");
    const connectionProbe = vi.fn().mockResolvedValue({
      protocol: "anthropic-messages",
      endpointOrigin: "https://api.anthropic.com",
      model: "claude-sonnet-4-6",
      status: "ok",
      startedAt: 1,
      finishedAt: 2,
      totalMs: 1,
      retryCount: 0,
      modelCount: 1,
      modelAvailable: true,
    });
    const modelProbe = vi.fn().mockResolvedValue({
      protocol: "anthropic-messages",
      endpointOrigin: "https://api.anthropic.com",
      model: "claude-sonnet-4-6",
      status: "ok",
      startedAt: 1,
      finishedAt: 2,
      totalMs: 1,
      firstTokenMs: 1,
      retryCount: 0,
      inputTokens: 1,
      outputTokens: 1,
      outputPreview: "OK",
    });
    const direct = profile({
      providerKind: "anthropic",
      endpoint: null,
    });
    const adapter = createAgentClaudeProviderAdapter({
      ...options(root),
      testConnection: connectionProbe,
      testModel: modelProbe,
    });
    await adapter.testConnection?.(context(root), {
      profile: direct,
      modelMappings: mappings(),
    });
    expect(connectionProbe).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://api.anthropic.com" }),
    );
    await adapter.testModel?.(
      context(root),
      { profile: direct, modelMappings: mappings() },
      new AbortController().signal,
    );
    expect(modelProbe).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://api.anthropic.com" }),
    );

    const activation = {
      context: context(root),
      profile: direct,
      modelMappings: mappings(),
      baseline: await adapter.inspect(context(root)),
    };
    const plan = await adapter.planActivation(activation);
    const invalidPlans = [
      { ...plan, platformId: "codex" },
      { ...plan, profileId: "other" },
      { ...plan, adapterVersion: "stale" },
      { ...plan, currentDigest: "stale" },
      { ...plan, status: "blocked" as const },
      { ...plan, canApply: false },
    ];
    for (const invalid of invalidPlans) {
      await expect(
        adapter.apply(context(root), invalid, {
          profile: direct,
          modelMappings: mappings(),
        }),
      ).rejects.toThrow("AGENT_CLAUDE_PROVIDER_PLAN_INVALID");
    }

    const mismatchedDecision = {
      ...plan,
      decisions: plan.decisions.map((decision) =>
        decision.field === "model"
          ? { ...decision, desired: "different-model" }
          : decision,
      ),
    };
    await expect(
      adapter.apply(context(root), mismatchedDecision, {
        profile: direct,
        modelMappings: mappings(),
      }),
    ).rejects.toThrow("AGENT_CLAUDE_PROVIDER_PLAN_INVALID");
    await expect(fs.stat(targetPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("distinguishes missing secrets from other invalid profiles during apply", async () => {
    const root = await temporaryRoot();
    const validAdapter = createAgentClaudeProviderAdapter(options(root));
    const activation = {
      context: context(root),
      profile: profile(),
      modelMappings: mappings(),
      baseline: await validAdapter.inspect(context(root)),
    };
    const plan = await validAdapter.planActivation(activation);

    const missingSecret = createAgentClaudeProviderAdapter({
      ...options(root),
      secretStore: secretStore(null),
    });
    await expect(
      missingSecret.apply(context(root), plan, {
        profile: activation.profile,
        modelMappings: activation.modelMappings,
      }),
    ).rejects.toThrow("AGENT_CLAUDE_PROVIDER_SECRET_MISSING");

    await expect(
      validAdapter.apply(context(root), plan, {
        profile: profile({ protocol: "unsupported" }),
        modelMappings: mappings(),
      }),
    ).rejects.toThrow("AGENT_CLAUDE_PROVIDER_PROFILE_INVALID");
  });

  it("reports failed verification and all rollback outcomes", async () => {
    const root = await temporaryRoot();
    const targetPath = path.join(root, "settings.json");
    const adapter = createAgentClaudeProviderAdapter(options(root));
    const before = await adapter.inspect(context(root));
    const activation = {
      context: context(root),
      profile: profile(),
      modelMappings: mappings(),
      baseline: before,
    };
    const plan = await adapter.planActivation(activation);
    const receipt = await adapter.apply(context(root), plan, {
      profile: activation.profile,
      modelMappings: activation.modelMappings,
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
    await fs.writeFile(targetPath, '{"model":"external"}\n');
    const changed = await adapter.inspect(context(root));
    await expect(
      adapter.verify(context(root), plan, {
        ...receipt,
        nativeDigestAfter: changed.nativeDigest,
      }),
    ).resolves.toMatchObject({ verified: false });

    const deleteRoot = await temporaryRoot();
    const deleteAdapter = createAgentClaudeProviderAdapter(options(deleteRoot));
    const missingState = await deleteAdapter.inspect(context(deleteRoot));
    await fs.writeFile(path.join(deleteRoot, "settings.json"), "{}\n");
    await expect(
      deleteAdapter.rollback(context(deleteRoot), {
        ...receipt,
        backupRef: null,
        nativeDigestBefore: missingState.nativeDigest,
      }),
    ).resolves.toMatchObject({ restored: true });
    await expect(
      fs.stat(path.join(deleteRoot, "settings.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });

    await fs.writeFile(path.join(deleteRoot, "settings.json"), "{}\n");
    await expect(
      deleteAdapter.rollback(context(deleteRoot), {
        ...receipt,
        backupRef: null,
        nativeDigestBefore: "different",
      }),
    ).resolves.toMatchObject({
      restored: false,
      errorCode: "provider-rollback-mismatch",
    });
    await expect(
      deleteAdapter.rollback(
        { ...context(deleteRoot), rootPath: "relative" },
        receipt,
      ),
    ).resolves.toMatchObject({
      restored: false,
      nativeDigest: null,
      errorCode: "provider-rollback-failed",
    });
  });
});
