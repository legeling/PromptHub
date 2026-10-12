/**
 * @vitest-environment node
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parse as parseJsonc } from "jsonc-parser";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AgentProviderAdapterContext,
  AgentProviderApplyReceipt,
  AgentProviderModelMapping,
  AgentProviderProfile,
} from "@prompthub/shared";
import { createAgentQwenProviderAdapter } from "../../../src/main/services/agent-qwen-provider-adapter";

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "qwen-boundary-"));
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
  return { agentId: "qwen", platformId: "qwen", rootPath };
}

function profile(
  overrides: Partial<AgentProviderProfile> = {},
): AgentProviderProfile {
  return {
    id: "profile-qwen-boundary",
    platformId: "qwen",
    name: "Qwen boundary",
    providerKind: "openai",
    protocol: "openai-chat",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    config: {
      providerId: "openai",
      envKey: "DASHSCOPE_API_KEY",
    },
    secretRef: "agent-provider:profile-qwen-boundary",
    source: "manual",
    archived: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function mappings(
  modelId = "qwen3.6-plus",
  parameters: Record<string, unknown> = {},
): AgentProviderModelMapping[] {
  return [
    {
      id: "mapping-qwen-boundary",
      providerProfileId: "profile-qwen-boundary",
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
    secretStore: { read: vi.fn().mockResolvedValue("main-only-qwen-key") },
    now: () => 42,
    ...overrides,
  };
}

async function activation(root: string) {
  const adapter = createAgentQwenProviderAdapter(options(root));
  const target = { profile: profile(), modelMappings: mappings() };
  const plan = await adapter.planActivation({
    context: context(root),
    ...target,
    baseline: await adapter.inspect(context(root)),
  });
  return { adapter, target, plan };
}

describe("Qwen Provider adapter boundaries", () => {
  it("rejects invalid contexts, unavailable imports, and malformed root values", async () => {
    const root = await temporaryRoot();
    const adapter = createAgentQwenProviderAdapter(options(root));
    const invalidContexts = [
      { ...context(root), agentId: "codex" },
      { ...context(root), platformId: "kimi" },
      { ...context(root), rootPath: "" },
      { ...context(root), rootPath: "relative/root" },
      { ...context(root), rootPath: `${root}\0escape` },
    ];
    for (const invalid of invalidContexts) {
      await expect(adapter.inspect(invalid)).rejects.toThrow(
        "AGENT_QWEN_PROVIDER_CONTEXT_INVALID",
      );
    }
    await expect(adapter.importCurrent(context(root))).rejects.toThrow(
      "AGENT_QWEN_PROVIDER_IMPORT_UNAVAILABLE",
    );

    await fs.writeFile(path.join(root, "settings.json"), "[]");
    await expect(adapter.inspect(context(root))).rejects.toThrow(
      "AGENT_QWEN_PROVIDER_CONFIG_INVALID",
    );
  });

  it("treats incomplete and unknown native selections as non-importable", async () => {
    const root = await temporaryRoot();
    const adapter = createAgentQwenProviderAdapter(options(root));
    const fixtures = [
      {
        security: { auth: { selectedType: " " } },
        model: { name: "orphan-model" },
      },
      {
        security: { auth: { selectedType: "custom" } },
        providerProtocol: { custom: "unsupported" },
        model: { name: "orphan-model" },
      },
      {
        security: { auth: {} },
        model: { name: "orphan-model" },
      },
    ];
    for (const fixture of fixtures) {
      await fs.writeFile(
        path.join(root, "settings.json"),
        JSON.stringify(fixture),
      );
      await expect(adapter.importCurrent(context(root))).rejects.toThrow(
        "AGENT_QWEN_PROVIDER_IMPORT_UNAVAILABLE",
      );
    }
  });

  it("reports every direct profile boundary and secret failure", async () => {
    const root = await temporaryRoot();
    const adapter = createAgentQwenProviderAdapter(
      options(root, {
        secretStore: {
          read: vi.fn().mockRejectedValue(new Error("keychain unavailable")),
        },
      }),
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
        candidateMappings: mappings("model", { temperature: 1 }),
        reason: "primary-model-required",
      },
      {
        candidateProfile: profile(),
        candidateMappings: [
          ...mappings(),
          { ...mappings("other")[0], id: "other", routeKey: "secondary" },
        ],
        reason: "primary-model-required",
      },
      {
        candidateProfile: profile({ providerKind: "unknown" }),
        candidateMappings: mappings(),
        reason: "provider-protocol-unsupported",
      },
      {
        candidateProfile: profile({ endpoint: null }),
        candidateMappings: mappings(),
        reason: "provider-endpoint-invalid",
      },
      {
        candidateProfile: profile({ endpoint: "not a url" }),
        candidateMappings: mappings(),
        reason: "provider-endpoint-invalid",
      },
      {
        candidateProfile: profile({
          config: {
            providerId: "openai",
            envKey: "DASHSCOPE_API_KEY",
            extra: true,
          },
        }),
        candidateMappings: mappings(),
        reason: "provider-config-unsupported",
      },
      {
        candidateProfile: profile({ secretRef: null }),
        candidateMappings: mappings(),
        reason: "provider-credential-required",
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
    const failedSecret = await adapter.planActivation({
      context: context(root),
      profile: profile(),
      modelMappings: mappings(),
      baseline: null,
    });
    expect(failedSecret.blockedReasons).toEqual(
      expect.arrayContaining([
        "provider-secret-unavailable",
        "provider-secret-missing",
      ]),
    );
  });

  it("keeps native authentication read-only and rejects stale native state", async () => {
    const root = await temporaryRoot();
    await fs.writeFile(
      path.join(root, "settings.json"),
      JSON.stringify({
        $version: 4,
        modelProviders: {},
        security: { auth: { selectedType: "qwen-oauth" } },
        model: { name: "qwen-oauth-model" },
      }),
    );
    const adapter = createAgentQwenProviderAdapter(options(root));
    const nativeProfile = profile({
      providerKind: "qwen-oauth",
      protocol: "platform-native",
      endpoint: null,
      config: {
        providerId: "qwen-oauth",
        nativeAuthOwnership: "oauth",
      },
      secretRef: null,
    });
    const current = {
      profile: nativeProfile,
      modelMappings: mappings("qwen-oauth-model"),
    };
    await expect(
      adapter.testConnection!(context(root), current),
    ).resolves.toMatchObject({
      status: "unsupported",
      startedAt: 42,
      finishedAt: 42,
    });
    await expect(
      adapter.testModel!(context(root), current, new AbortController().signal),
    ).resolves.toMatchObject({
      status: "unsupported",
      model: "qwen-oauth-model",
      startedAt: 42,
      finishedAt: 42,
    });

    const stalePlan = await adapter.planActivation({
      context: context(root),
      profile: nativeProfile,
      modelMappings: mappings("different-model"),
      baseline: null,
    });
    expect(stalePlan.blockedReasons).toContain(
      "native-provider-state-mismatch",
    );
    const writableNative = await adapter.planActivation({
      context: context(root),
      profile: {
        ...nativeProfile,
        endpoint: "https://example.com",
        secretRef: "managed",
        config: {
          ...nativeProfile.config,
          extra: true,
        },
      },
      modelMappings: mappings("qwen-oauth-model"),
      baseline: null,
    });
    expect(writableNative.blockedReasons).toContain(
      "native-provider-read-only",
    );
  });

  it("rejects profile platform mismatches in tests and plans", async () => {
    const root = await temporaryRoot();
    const adapter = createAgentQwenProviderAdapter(options(root));
    const wrongProfile = profile({ platformId: "codex" });
    await expect(
      adapter.testConnection!(context(root), {
        profile: wrongProfile,
        modelMappings: mappings(),
      }),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_PLATFORM_MISMATCH");
    await expect(
      adapter.testModel!(
        context(root),
        {
          profile: wrongProfile,
          modelMappings: mappings(),
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_PLATFORM_MISMATCH");
    const plan = await adapter.planActivation({
      context: context(root),
      profile: wrongProfile,
      modelMappings: mappings(),
      baseline: null,
    });
    expect(plan.blockedReasons).toContain("provider-platform-mismatch");
  });

  it("reports no credentials for test requests with invalid targets", async () => {
    const root = await temporaryRoot();
    const adapter = createAgentQwenProviderAdapter(
      options(root, {
        secretStore: { read: vi.fn().mockResolvedValue(null) },
      }),
    );
    const target = {
      profile: profile({ secretRef: null }),
      modelMappings: [] as AgentProviderModelMapping[],
    };
    await expect(
      adapter.testConnection!(context(root), target),
    ).resolves.toMatchObject({ status: "no-credentials", model: null });
    await expect(
      adapter.testModel!(context(root), target, new AbortController().signal),
    ).resolves.toMatchObject({ status: "no-credentials", model: null });

    const unsupportedTarget = {
      profile: profile({ protocol: "platform-native" }),
      modelMappings: mappings(),
    };
    const unsupportedAdapter = createAgentQwenProviderAdapter(options(root));
    await expect(
      unsupportedAdapter.testConnection!(context(root), unsupportedTarget),
    ).resolves.toMatchObject({ status: "unsupported" });
    await expect(
      unsupportedAdapter.testModel!(
        context(root),
        unsupportedTarget,
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ status: "unsupported" });
  });

  it("rejects stale, tampered, and no-longer-valid activation inputs", async () => {
    const root = await temporaryRoot();
    const { adapter, target, plan } = await activation(root);
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
      ).rejects.toThrow("AGENT_QWEN_PROVIDER_PLAN_INVALID");
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
      adapter.apply(context(root), tamperedPlan, target),
    ).rejects.toThrow("AGENT_QWEN_PROVIDER_PLAN_INVALID");
    await expect(
      adapter.apply(context(root), plan, {
        ...target,
        profile: profile({ name: "" }),
      }),
    ).rejects.toThrow("AGENT_QWEN_PROVIDER_PROFILE_INVALID");
  });

  it("updates an exact model identity and removes deprecated credential fields", async () => {
    const root = await temporaryRoot();
    const settingsPath = path.join(root, "settings.json");
    await fs.writeFile(
      settingsPath,
      `{
        "$version": 3,
        "modelProviders": {
          "openai": [{
            "id": "qwen3.6-plus",
            "envKey": "OLD_KEY",
            "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1/",
            "description": "keep"
          }, {
            "id": "other",
            "envKey": "OTHER_KEY",
            "baseUrl": "https://other.example/v1",
            "description": "keep other"
          }]
        },
        "security": {
          "auth": {
            "selectedType": "openai",
            "apiKey": "remove",
            "baseUrl": "https://remove.example"
          }
        },
        "model": { "name": "old" }
      }`,
    );
    const { adapter, target, plan } = await activation(root);
    await adapter.apply(context(root), plan, target);
    const saved = parseJsonc(await fs.readFile(settingsPath, "utf8")) as Record<
      string,
      unknown
    >;
    expect(saved.$version).toBe(4);
    expect(saved.modelProviders).toMatchObject({
      openai: [
        {
          id: "qwen3.6-plus",
          envKey: "DASHSCOPE_API_KEY",
          baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          description: "keep",
        },
        {
          id: "other",
          envKey: "OTHER_KEY",
          baseUrl: "https://other.example/v1",
          description: "keep other",
        },
      ],
    });
    expect(saved.security).toEqual({ auth: { selectedType: "openai" } });
  });

  it("reports verification and rollback failures without accepting arbitrary receipts", async () => {
    const root = await temporaryRoot();
    const backupEncryption = encryption();
    const adapter = createAgentQwenProviderAdapter(
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
        nativeDigestAfter: "wrong",
      }),
    ).resolves.toMatchObject({
      verified: false,
      errorCode: "provider-state-mismatch",
    });
    await expect(
      adapter.rollback(context(root), {
        ...receipt,
        nativeDigestBefore: "wrong",
      }),
    ).resolves.toMatchObject({
      restored: false,
      errorCode: "provider-rollback-mismatch",
    });
    await expect(
      adapter.rollback(context(root), { ...receipt, backupRef: null }),
    ).resolves.toMatchObject({
      restored: false,
      errorCode: "provider-rollback-failed",
    });

    const fakeReceipt: AgentProviderApplyReceipt = {
      platformId: "qwen",
      profileId: target.profile.id,
      adapterVersion: "qwen-provider-profile-v1",
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

    const nextPlan = await adapter.planActivation({
      context: context(root),
      ...target,
      baseline: await adapter.inspect(context(root)),
    });
    const nextReceipt = await adapter.apply(context(root), nextPlan, target);
    const invalidBundle = backupEncryption
      .encryptString('{"version":2,"settings":null,"env":null}')
      .toString("base64");
    await fs.writeFile(
      nextReceipt.backupRef!,
      JSON.stringify({ version: 1, payload: invalidBundle }),
    );
    await expect(
      adapter.rollback(context(root), nextReceipt),
    ).resolves.toMatchObject({
      restored: false,
      errorCode: "provider-rollback-failed",
    });

    const malformedBackupPath = path.join(
      root,
      "backups",
      "qwen",
      "malformed",
      "provider-bundle.json.enc",
    );
    await fs.mkdir(path.dirname(malformedBackupPath), { recursive: true });
    const malformedBundle = backupEncryption
      .encryptString("not-json")
      .toString("base64");
    await fs.writeFile(
      malformedBackupPath,
      JSON.stringify({ version: 1, payload: malformedBundle }),
    );
    await expect(
      adapter.rollback(context(root), {
        ...receipt,
        backupRef: malformedBackupPath,
      }),
    ).resolves.toMatchObject({
      restored: false,
      errorCode: "provider-rollback-failed",
    });
  });

  it("requires encrypted backups and restores both files after post-write verification fails", async () => {
    const unencryptedRoot = await temporaryRoot();
    const unencrypted = createAgentQwenProviderAdapter(
      options(unencryptedRoot, { backupEncryption: encryption(false) }),
    );
    const target = { profile: profile(), modelMappings: mappings() };
    const unencryptedPlan = await unencrypted.planActivation({
      context: context(unencryptedRoot),
      ...target,
      baseline: await unencrypted.inspect(context(unencryptedRoot)),
    });
    await expect(
      unencrypted.apply(context(unencryptedRoot), unencryptedPlan, target),
    ).rejects.toThrow("AGENT_CONFIG_BACKUP_ENCRYPTION_UNAVAILABLE");

    const root = await temporaryRoot();
    const settingsPath = path.join(root, "settings.json");
    const envPath = path.join(root, ".env");
    const originalSettings = '{"$version":4,"keep":true}\n';
    const originalEnv = "export KEEP='single-quoted'\n";
    await fs.writeFile(settingsPath, originalSettings);
    await fs.writeFile(envPath, originalEnv);
    const adapter = createAgentQwenProviderAdapter(
      options(root, {
        hooks: {
          afterWrite: () =>
            fs.writeFile(settingsPath, '{"externallyChanged":true}\n'),
        },
      }),
    );
    const plan = await adapter.planActivation({
      context: context(root),
      ...target,
      baseline: await adapter.inspect(context(root)),
    });
    await expect(adapter.apply(context(root), plan, target)).rejects.toThrow(
      "AGENT_QWEN_PROVIDER_WRITE_FAILED",
    );
    expect(await fs.readFile(settingsPath, "utf8")).toBe(originalSettings);
    expect(await fs.readFile(envPath, "utf8")).toBe(originalEnv);
  });

  it("imports a direct provider with a missing native credential as incomplete", async () => {
    const root = await temporaryRoot();
    await fs.writeFile(
      path.join(root, "settings.json"),
      JSON.stringify({
        $version: 4,
        modelProviders: {
          openai: [
            {
              id: "qwen3.6-plus",
              envKey: "MISSING_KEY",
              baseUrl: "https://example.com/v1",
            },
          ],
        },
        security: { auth: { selectedType: "openai" } },
        model: { name: "qwen3.6-plus" },
      }),
    );
    const imported = await createAgentQwenProviderAdapter(
      options(root),
    ).importCurrent(context(root));
    expect(imported.warnings).toContain("native-credential-missing");
    expect(imported.warnings).not.toContain("native-credential-not-imported");
  });
});
