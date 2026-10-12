/**
 * @vitest-environment node
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AgentProviderAdapterContext,
  AgentProviderApplyReceipt,
  AgentProviderModelMapping,
  AgentProviderProfile,
} from "@prompthub/shared";
import { createAgentKimiProviderAdapter } from "../../../src/main/services/agent-kimi-provider-adapter";

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kimi-boundary-"));
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
  return { agentId: "kimi", platformId: "kimi", rootPath };
}

function profile(
  overrides: Partial<AgentProviderProfile> = {},
): AgentProviderProfile {
  return {
    id: "profile-kimi-boundary",
    platformId: "kimi",
    name: "Kimi boundary",
    providerKind: "kimi",
    protocol: "openai-chat",
    endpoint: "https://api.moonshot.ai/v1",
    config: { providerId: "prompthub-kimi" },
    secretRef: "agent-provider:profile-kimi-boundary",
    source: "manual",
    archived: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function mappings(
  modelId = "work/kimi-k2",
  parameters: Record<string, unknown> = {
    upstreamModelId: "kimi-k2",
    maxContextSize: 131_072,
  },
): AgentProviderModelMapping[] {
  return [
    {
      id: "mapping-kimi-boundary",
      providerProfileId: "profile-kimi-boundary",
      routeKey: "primary",
      modelId,
      parameters,
    },
  ];
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

function options(root: string, overrides: Record<string, unknown> = {}) {
  return {
    backupRoot: path.join(root, "backups"),
    backupEncryption: encryption(),
    secretStore: { read: vi.fn().mockResolvedValue("main-only-kimi-key") },
    now: () => 42,
    ...overrides,
  };
}

describe("Kimi Provider adapter boundaries", () => {
  it("rejects invalid contexts, unavailable imports, and malformed endpoints", async () => {
    const root = await temporaryRoot();
    const adapter = createAgentKimiProviderAdapter(options(root));

    await expect(
      adapter.inspect({ ...context(root), agentId: "codex" }),
    ).rejects.toThrow("AGENT_KIMI_PROVIDER_CONTEXT_INVALID");
    await expect(
      adapter.inspect({ ...context(root), platformId: "claude" }),
    ).rejects.toThrow("AGENT_KIMI_PROVIDER_CONTEXT_INVALID");
    await expect(
      adapter.inspect({ ...context(root), rootPath: "relative/root" }),
    ).rejects.toThrow("AGENT_KIMI_PROVIDER_CONTEXT_INVALID");
    await expect(
      adapter.inspect({ ...context(root), rootPath: `${root}\0escape` }),
    ).rejects.toThrow("AGENT_KIMI_PROVIDER_CONTEXT_INVALID");
    await expect(adapter.importCurrent(context(root))).rejects.toThrow(
      "AGENT_KIMI_PROVIDER_IMPORT_UNAVAILABLE",
    );

    const plan = await adapter.planActivation({
      context: context(root),
      profile: profile({ endpoint: "https://%zz" }),
      modelMappings: mappings(),
      baseline: null,
    });
    expect(plan.blockedReasons).toContain("provider-endpoint-invalid");
  });

  it("reports each unsupported profile boundary without resolving a secret", async () => {
    const root = await temporaryRoot();
    const secretStore = {
      read: vi.fn().mockRejectedValue(new Error("keychain unavailable")),
    };
    const adapter = createAgentKimiProviderAdapter(
      options(root, { secretStore }),
    );
    const candidates: Array<{
      candidateProfile: AgentProviderProfile;
      candidateMappings: AgentProviderModelMapping[];
      reason: string;
    }> = [
      {
        candidateProfile: profile({ name: "" }),
        candidateMappings: mappings(),
        reason: "provider-name-invalid",
      },
      {
        candidateProfile: profile({ providerKind: "unknown" }),
        candidateMappings: mappings(),
        reason: "provider-kind-unsupported",
      },
      {
        candidateProfile: profile({ config: { providerId: 42 } }),
        candidateMappings: mappings(),
        reason: "provider-id-invalid",
      },
      {
        candidateProfile: profile(),
        candidateMappings: mappings(""),
        reason: "primary-model-required",
      },
      {
        candidateProfile: profile(),
        candidateMappings: mappings("alias", {
          upstreamModelId: "",
          maxContextSize: 131_072,
        }),
        reason: "upstream-model-required",
      },
      {
        candidateProfile: profile(),
        candidateMappings: mappings("alias", {
          upstreamModelId: "upstream",
          maxContextSize: 10_000_001,
        }),
        reason: "model-context-size-invalid",
      },
      {
        candidateProfile: profile(),
        candidateMappings: mappings("alias", {
          upstreamModelId: "upstream",
          maxContextSize: 131_072,
          extra: true,
        }),
        reason: "model-parameters-unsupported",
      },
      {
        candidateProfile: profile({
          config: { providerId: "prompthub-kimi", extra: true },
        }),
        candidateMappings: mappings(),
        reason: "provider-config-unsupported",
      },
      {
        candidateProfile: profile({ protocol: "anthropic-messages" }),
        candidateMappings: mappings(),
        reason: "provider-protocol-unsupported",
      },
      {
        candidateProfile: profile({
          providerKind: "vertexai",
          protocol: "platform-native",
        }),
        candidateMappings: mappings(),
        reason: "native-provider-read-only",
      },
      {
        candidateProfile: profile({
          protocol: "platform-native",
          config: {
            providerId: "prompthub-kimi",
            nativeAuthOwnership: "oauth",
          },
          endpoint: "https://api.moonshot.ai/v1",
          secretRef: "managed-secret",
        }),
        candidateMappings: mappings(),
        reason: "native-provider-read-only",
      },
      {
        candidateProfile: profile({ secretRef: null }),
        candidateMappings: mappings(),
        reason: "provider-credential-required",
      },
      {
        candidateProfile: profile(),
        candidateMappings: [
          ...mappings(),
          {
            ...mappings("secondary")[0],
            id: "mapping-secondary",
            routeKey: "secondary",
          },
        ],
        reason: "model-parameters-unsupported",
      },
    ];

    for (const candidate of candidates) {
      const plan = await adapter.planActivation({
        context: context(root),
        profile: candidate.candidateProfile,
        modelMappings: candidate.candidateMappings,
        baseline: null,
      });
      expect(plan.canApply).toBe(false);
      expect(plan.blockedReasons).toContain(candidate.reason);
    }

    const failedSecretPlan = await adapter.planActivation({
      context: context(root),
      profile: profile(),
      modelMappings: mappings(),
      baseline: null,
    });
    expect(failedSecretPlan.blockedReasons).toEqual(
      expect.arrayContaining([
        "provider-secret-unavailable",
        "provider-secret-missing",
      ]),
    );
  });

  it("keeps platform mismatches and stale native profiles read-only", async () => {
    const root = await temporaryRoot();
    await fs.writeFile(
      path.join(root, "config.toml"),
      [
        'default_model = "managed/k3"',
        "[providers.managed]",
        'type = "kimi"',
        "[providers.managed.oauth]",
        'storage = "keyring"',
        'key = "opaque"',
        '[models."managed/k3"]',
        'provider = "managed"',
        'model = "k3"',
        "max_context_size = 1048576",
        "",
      ].join("\n"),
    );
    const adapter = createAgentKimiProviderAdapter(options(root));
    const wrongPlatform = profile({ platformId: "codex" });

    await expect(
      adapter.testConnection!(context(root), {
        profile: wrongPlatform,
        modelMappings: mappings(),
      }),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_PLATFORM_MISMATCH");
    await expect(
      adapter.testModel!(
        context(root),
        {
          profile: wrongPlatform,
          modelMappings: mappings(),
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_PLATFORM_MISMATCH");

    const mismatchPlan = await adapter.planActivation({
      context: context(root),
      profile: wrongPlatform,
      modelMappings: mappings(),
      baseline: null,
    });
    expect(mismatchPlan.blockedReasons).toContain("provider-platform-mismatch");

    const nativeProfile = profile({
      providerKind: "kimi",
      protocol: "platform-native",
      endpoint: null,
      config: { providerId: "managed", nativeAuthOwnership: "oauth" },
      secretRef: null,
    });
    const staleMappings = mappings("managed/k3", {
      upstreamModelId: "different-upstream",
      maxContextSize: 1_048_576,
    });
    const nativePlan = await adapter.planActivation({
      context: context(root),
      profile: nativeProfile,
      modelMappings: staleMappings,
      baseline: null,
    });
    expect(nativePlan.blockedReasons).toContain(
      "native-provider-state-mismatch",
    );
    await expect(
      adapter.testModel!(
        context(root),
        {
          profile: nativeProfile,
          modelMappings: staleMappings,
        },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      status: "unsupported",
      model: "different-upstream",
      startedAt: 42,
      finishedAt: 42,
    });

    const currentMappings = mappings("managed/k3", {
      upstreamModelId: "k3",
      maxContextSize: 1_048_576,
    });
    await expect(
      adapter.testModel!(
        context(root),
        {
          profile: nativeProfile,
          modelMappings: currentMappings,
        },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      status: "unsupported",
      model: "k3",
      startedAt: 42,
      finishedAt: 42,
    });
  });

  it("reports missing native credentials and empty model mappings without leaking values", async () => {
    const root = await temporaryRoot();
    await fs.writeFile(
      path.join(root, "config.toml"),
      [
        'default_model = "work/kimi-k2"',
        "[providers.work]",
        'type = "kimi"',
        'base_url = " "',
        '[models."work/kimi-k2"]',
        'provider = "work"',
        'model = "kimi-k2"',
        "max_context_size = 131072",
        "",
      ].join("\n"),
    );
    const adapter = createAgentKimiProviderAdapter(options(root));
    const imported = await adapter.importCurrent(context(root));
    expect(imported.warnings).toContain("native-credential-missing");

    const target = {
      profile: profile({ secretRef: null }),
      modelMappings: [] as AgentProviderModelMapping[],
    };
    await expect(
      adapter.testConnection!(context(root), target),
    ).resolves.toMatchObject({
      status: "no-credentials",
      model: null,
    });
    await expect(
      adapter.testModel!(context(root), target, new AbortController().signal),
    ).resolves.toMatchObject({
      status: "no-credentials",
      model: null,
    });
  });

  it("rejects stale, tampered, and no-longer-valid activation inputs", async () => {
    const root = await temporaryRoot();
    const adapter = createAgentKimiProviderAdapter(options(root));
    const target = { profile: profile(), modelMappings: mappings() };
    const baseline = await adapter.inspect(context(root));
    const plan = await adapter.planActivation({
      context: context(root),
      ...target,
      baseline,
    });

    const invalidPlans = [
      { ...plan, platformId: "codex" },
      { ...plan, profileId: "different-profile" },
      { ...plan, adapterVersion: "stale-adapter" },
      { ...plan, currentDigest: "stale-digest" },
      { ...plan, status: "blocked" as const },
      { ...plan, canApply: false },
    ];
    for (const invalidPlan of invalidPlans) {
      await expect(
        adapter.apply(context(root), invalidPlan, target),
      ).rejects.toThrow("AGENT_KIMI_PROVIDER_PLAN_INVALID");
    }

    const tamperedPlan = {
      ...plan,
      decisions: plan.decisions.map((decision) =>
        decision.field === "model"
          ? { ...decision, desired: "tampered/model" }
          : decision,
      ),
    };
    await expect(
      adapter.apply(context(root), tamperedPlan, target),
    ).rejects.toThrow("AGENT_KIMI_PROVIDER_PLAN_INVALID");

    await expect(
      adapter.apply(context(root), plan, {
        ...target,
        profile: profile({ name: "" }),
      }),
    ).rejects.toThrow("AGENT_KIMI_PROVIDER_PROFILE_INVALID");
  });

  it("reports verification mismatches and fails closed on damaged rollback data", async () => {
    const root = await temporaryRoot();
    const backupEncryption = encryption();
    const adapter = createAgentKimiProviderAdapter(
      options(root, { backupEncryption }),
    );
    const target = { profile: profile(), modelMappings: mappings() };
    const plan = await adapter.planActivation({
      context: context(root),
      ...target,
      baseline: await adapter.inspect(context(root)),
    });
    const receipt = await adapter.apply(context(root), plan, target);

    await expect(
      adapter.verify(context(root), plan, {
        ...receipt,
        nativeDigestAfter: "wrong-digest",
      }),
    ).resolves.toMatchObject({
      verified: false,
      errorCode: "provider-state-mismatch",
    });

    const mismatchRollback = await adapter.rollback(context(root), {
      ...receipt,
      nativeDigestBefore: "wrong-before-digest",
    });
    expect(mismatchRollback).toMatchObject({
      restored: false,
      errorCode: "provider-rollback-mismatch",
    });

    await expect(
      adapter.rollback(context(root), { ...receipt, backupRef: null }),
    ).resolves.toMatchObject({
      restored: false,
      errorCode: "provider-rollback-failed",
    });

    const secondPlan = await adapter.planActivation({
      context: context(root),
      ...target,
      baseline: await adapter.inspect(context(root)),
    });
    const secondReceipt = await adapter.apply(
      context(root),
      secondPlan,
      target,
    );
    const invalidBundle = backupEncryption
      .encryptString('{"version":2,"config":null}')
      .toString("base64");
    await fs.writeFile(
      secondReceipt.backupRef!,
      JSON.stringify({ version: 1, payload: invalidBundle }),
    );
    await expect(
      adapter.rollback(context(root), secondReceipt),
    ).resolves.toMatchObject({
      restored: false,
      errorCode: "provider-rollback-failed",
    });
  });

  it("replaces legacy scalar sections and requires encrypted backups", async () => {
    const root = await temporaryRoot();
    const configPath = path.join(root, "config.toml");
    await fs.writeFile(
      configPath,
      [
        'default_model = "legacy"',
        'providers = "legacy-provider-section"',
        'models = "legacy-model-section"',
        "",
      ].join("\n"),
    );
    const adapter = createAgentKimiProviderAdapter(options(root));
    const target = { profile: profile(), modelMappings: mappings() };
    const plan = await adapter.planActivation({
      context: context(root),
      ...target,
      baseline: await adapter.inspect(context(root)),
    });
    await expect(adapter.apply(context(root), plan, target)).resolves.toEqual(
      expect.objectContaining({ platformId: "kimi" }),
    );
    expect(await fs.readFile(configPath, "utf8")).toContain(
      "[providers.prompthub-kimi]",
    );

    const unencryptedRoot = await temporaryRoot();
    const unencrypted = createAgentKimiProviderAdapter(
      options(unencryptedRoot, {
        backupEncryption: encryption(false),
      }),
    );
    const unencryptedTarget = {
      profile: profile(),
      modelMappings: mappings(),
    };
    const unencryptedPlan = await unencrypted.planActivation({
      context: context(unencryptedRoot),
      ...unencryptedTarget,
      baseline: await unencrypted.inspect(context(unencryptedRoot)),
    });
    await expect(
      unencrypted.apply(
        context(unencryptedRoot),
        unencryptedPlan,
        unencryptedTarget,
      ),
    ).rejects.toThrow("AGENT_CONFIG_BACKUP_ENCRYPTION_UNAVAILABLE");
  });

  it("updates an existing managed provider and model without dropping extension fields", async () => {
    const root = await temporaryRoot();
    const configPath = path.join(root, "config.toml");
    await fs.writeFile(
      configPath,
      [
        'default_model = "work/kimi-k2"',
        "[providers.prompthub-kimi]",
        'type = "kimi"',
        'base_url = "https://old.example/v1"',
        'api_key = "old-key"',
        'extension = "keep-provider"',
        '[models."work/kimi-k2"]',
        'provider = "prompthub-kimi"',
        'model = "old-model"',
        "max_context_size = 4096",
        'extension = "keep-model"',
        "",
      ].join("\n"),
    );
    const adapter = createAgentKimiProviderAdapter(options(root));
    const target = {
      profile: profile({ endpoint: null }),
      modelMappings: mappings(),
    };
    const plan = await adapter.planActivation({
      context: context(root),
      ...target,
      baseline: await adapter.inspect(context(root)),
    });
    await adapter.apply(context(root), plan, target);

    const saved = await fs.readFile(configPath, "utf8");
    expect(saved).toContain('extension = "keep-provider"');
    expect(saved).toContain('extension = "keep-model"');
    expect(saved).toContain('base_url = "https://api.moonshot.ai/v1"');
    expect(saved).toContain('model = "kimi-k2"');
  });

  it("does not treat arbitrary receipts as valid rollback authority", async () => {
    const root = await temporaryRoot();
    const adapter = createAgentKimiProviderAdapter(options(root));
    const fakeReceipt: AgentProviderApplyReceipt = {
      platformId: "kimi",
      profileId: "profile-kimi-boundary",
      adapterVersion: "kimi-provider-profile-v1",
      nativeDigestBefore: "before",
      nativeDigestAfter: "after",
      backupRef: path.join(root, "outside.enc"),
      appliedAt: 1,
    };

    await expect(
      adapter.rollback(context(root), fakeReceipt),
    ).resolves.toMatchObject({
      restored: false,
      nativeDigest: null,
      errorCode: "provider-rollback-failed",
    });
  });
});
