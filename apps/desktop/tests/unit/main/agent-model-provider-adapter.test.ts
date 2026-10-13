/**
 * @vitest-environment node
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { getAgentDefinitionById } from "@prompthub/shared/constants/agent-definitions";

import type {
  AgentModelConfiguration,
  AgentProviderActivationPlan,
  AgentProviderActivationInput,
  AgentProviderAdapterContext,
  AgentProviderApplyReceipt,
  AgentProviderModelMapping,
  AgentProviderProfile,
  UpdateAgentModelResult,
} from "@prompthub/shared";
import { createAgentModelProviderAdapter } from "../../../src/main/services/agent-model-provider-adapter";

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-provider-"));
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

function profile(platformId = "claude"): AgentProviderProfile {
  return {
    id: "profile-1",
    platformId,
    name: "Work",
    providerKind: "platform-native",
    protocol: "native",
    endpoint: null,
    config: {},
    secretRef: null,
    source: "manual",
    archived: false,
    createdAt: 1,
    updatedAt: 1,
  };
}

function mapping(routeKey: string, modelId: string): AgentProviderModelMapping {
  return {
    id: `mapping-${routeKey}`,
    providerProfileId: "profile-1",
    routeKey,
    modelId,
    parameters: {},
  };
}

function activationInput(
  context: AgentProviderAdapterContext,
  modelMappings: AgentProviderModelMapping[],
  baseline: AgentProviderActivationInput["baseline"] = null,
): AgentProviderActivationInput {
  return {
    context,
    profile: profile(context.platformId),
    modelMappings,
    baseline,
  };
}

function modelConfiguration(
  overrides: Partial<AgentModelConfiguration> = {},
): AgentModelConfiguration {
  return {
    agentId: "claude",
    adapter: "claude-settings-v1",
    status: "configured",
    model: "claude-sonnet-4-5",
    secondaryModel: null,
    fallbackModels: [],
    provider: "anthropic",
    endpoint: null,
    availableModels: [],
    credentialStatus: "platform-managed",
    sourceRelativePath: "settings.json",
    canSetModel: true,
    formattingMayChange: false,
    ...overrides,
  };
}

describe("Agent model Provider Profile adapter", () => {
  it("uses the Agent definition for a rollback target without observed source metadata", async () => {
    const rootPath = await temporaryRoot();
    const definition = getAgentDefinitionById("claude");
    if (!definition?.modelConfig) throw new Error("Missing Claude model fixture");
    const config = definition.modelConfig;
    const originalPaths = config.relativePaths;
    const targetPath = "rollback-settings.json";
    config.relativePaths = [targetPath];
    try {
      await fs.writeFile(path.join(rootPath, targetPath), "{}");
      const context = { agentId: "claude", platformId: "claude", rootPath };
      const adapter = createAgentModelProviderAdapter("claude", {
        backupRoot: path.join(rootPath, "backups"),
        inspect: vi.fn().mockResolvedValue(modelConfiguration({ status: "missing", model: null, sourceRelativePath: null })),
      });
      const before = await adapter.inspect(context);
      await expect(adapter.rollback(context, {
        platformId: "claude", adapterVersion: before.adapterVersion,
        profileId: "profile-1", nativeDigestBefore: before.nativeDigest,
        nativeDigestAfter: before.nativeDigest, backupRef: null, appliedAt: 1,
      })).resolves.toMatchObject({ restored: true });
      await expect(fs.stat(path.join(rootPath, targetPath))).rejects.toThrow();
    } finally {
      config.relativePaths = originalPaths;
    }
  });

  it("inspects and imports a redacted Claude model profile", async () => {
    const rootPath = await temporaryRoot();
    await fs.writeFile(
      path.join(rootPath, "settings.json"),
      JSON.stringify({
        model: "claude-sonnet-4-5",
        env: {
          ANTHROPIC_API_KEY: "secret-token",
          ANTHROPIC_BASE_URL: "https://gateway.example.com/v1?token=secret",
        },
      }),
    );
    const context = {
      agentId: "claude",
      platformId: "claude",
      rootPath,
    };
    const adapter = createAgentModelProviderAdapter("claude", {
      backupRoot: path.join(rootPath, "backups"),
    });

    const state = await adapter.inspect(context);
    expect(state.values).toMatchObject({
      model: "claude-sonnet-4-5",
      provider: "custom-gateway",
      endpoint: "https://gateway.example.com/v1",
      credentialStatus: "configured",
    });
    expect(JSON.stringify(state)).not.toContain("secret-token");

    await expect(adapter.importCurrent(context)).resolves.toMatchObject({
      profile: {
        platformId: "claude",
        providerKind: "custom-gateway",
        endpoint: "https://gateway.example.com/v1",
        secretRef: null,
        source: "native-import",
      },
      modelMappings: [{ routeKey: "primary", modelId: "claude-sonnet-4-5" }],
    });
  });

  it("plans supported model routes and reports unknown routes", async () => {
    const rootPath = await temporaryRoot();
    await fs.writeFile(
      path.join(rootPath, "settings.json"),
      JSON.stringify({ model: "claude-sonnet-4-5" }),
    );
    const context = {
      agentId: "claude",
      platformId: "claude",
      rootPath,
    };
    const adapter = createAgentModelProviderAdapter("claude", {
      backupRoot: path.join(rootPath, "backups"),
    });
    const current = await adapter.inspect(context);

    const plan = await adapter.planActivation(
      activationInput(
        context,
        [
          mapping("primary", "claude-opus-4-1"),
          mapping("vision", "claude-opus-4-1"),
        ],
        current,
      ),
    );

    expect(plan.status).toBe("unsupported");
    expect(plan.canApply).toBe(false);
    expect(plan.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "model", status: "apply" }),
        expect.objectContaining({
          field: "route:vision",
          status: "unsupported",
        }),
      ]),
    );
  });

  it("blocks provider endpoints, secrets, and non-native protocols it cannot project", async () => {
    const rootPath = await temporaryRoot();
    await fs.writeFile(
      path.join(rootPath, "settings.json"),
      JSON.stringify({ model: "claude-sonnet-4-5" }),
    );
    const context = {
      agentId: "claude",
      platformId: "claude",
      rootPath,
    };
    const adapter = createAgentModelProviderAdapter("claude", {
      backupRoot: path.join(rootPath, "backups"),
    });
    const input = activationInput(context, [
      mapping("primary", "claude-opus-4-1"),
    ]);
    input.profile = {
      ...input.profile,
      protocol: "messages",
      endpoint: "https://gateway.example.com",
      secretRef: "agent-provider:profile-1",
    };

    await expect(adapter.planActivation(input)).resolves.toMatchObject({
      status: "blocked",
      canApply: false,
      blockedReasons: [
        "provider-endpoint-unsupported",
        "provider-secret-unsupported",
        "provider-protocol-unsupported",
      ],
    });
  });

  it("applies, verifies, and rolls back a real Claude settings file", async () => {
    const rootPath = await temporaryRoot();
    const targetPath = path.join(rootPath, "settings.json");
    const original = `${JSON.stringify(
      {
        model: "claude-sonnet-4-5",
        env: { ANTHROPIC_API_KEY: "secret-token" },
        permissions: { allow: ["Read"] },
      },
      null,
      2,
    )}\n`;
    await fs.writeFile(targetPath, original);
    const context = {
      agentId: "claude",
      platformId: "claude",
      rootPath,
    };
    const adapter = createAgentModelProviderAdapter("claude", {
      backupRoot: path.join(rootPath, "backups"),
      now: () => 42,
    });
    const current = await adapter.inspect(context);
    const plan = await adapter.planActivation(
      activationInput(
        context,
        [mapping("primary", "claude-opus-4-1")],
        current,
      ),
    );

    const receipt = await adapter.apply(
      context,
      plan,
      activationInput(
        context,
        [mapping("primary", "claude-opus-4-1")],
        current,
      ),
    );
    await expect(adapter.verify(context, plan, receipt)).resolves.toMatchObject(
      {
        verified: true,
        state: { values: { model: "claude-opus-4-1" } },
      },
    );
    const updated = await fs.readFile(targetPath, "utf8");
    expect(updated).toContain("claude-opus-4-1");
    expect(updated).toContain("secret-token");
    expect(updated).toContain('"permissions"');

    await expect(adapter.rollback(context, receipt)).resolves.toEqual({
      restored: true,
      nativeDigest: current.nativeDigest,
    });
    await expect(fs.readFile(targetPath, "utf8")).resolves.toBe(original);
  });

  it("supports OpenCode primary and secondary model mappings", async () => {
    const rootPath = await temporaryRoot();
    await fs.writeFile(
      path.join(rootPath, "opencode.jsonc"),
      `{\n  // keep\n  "model": "openai/gpt-5",\n  "small_model": "openai/gpt-5-mini"\n}\n`,
    );
    const context = {
      agentId: "opencode",
      platformId: "opencode",
      rootPath,
    };
    const adapter = createAgentModelProviderAdapter("opencode", {
      backupRoot: path.join(rootPath, "backups"),
    });
    const current = await adapter.inspect(context);
    const plan = await adapter.planActivation(
      activationInput(
        context,
        [
          mapping("primary", "anthropic/claude-sonnet-4-5"),
          mapping("secondary", "anthropic/claude-haiku-4-5"),
        ],
        current,
      ),
    );
    const receipt = await adapter.apply(
      context,
      plan,
      activationInput(
        context,
        [
          mapping("primary", "anthropic/claude-sonnet-4-5"),
          mapping("secondary", "anthropic/claude-haiku-4-5"),
        ],
        current,
      ),
    );

    await expect(adapter.verify(context, plan, receipt)).resolves.toMatchObject(
      {
        verified: true,
        state: {
          values: {
            model: "anthropic/claude-sonnet-4-5",
            secondaryModel: "anthropic/claude-haiku-4-5",
          },
        },
      },
    );
    await expect(
      fs.readFile(path.join(rootPath, "opencode.jsonc"), "utf8"),
    ).resolves.toContain("// keep");
  });

  it("blocks missing mappings, invalid configs, and cross-platform contexts", async () => {
    const rootPath = await temporaryRoot();
    const context = {
      agentId: "claude",
      platformId: "claude",
      rootPath,
    };
    const adapter = createAgentModelProviderAdapter("claude", {
      backupRoot: path.join(rootPath, "backups"),
    });

    await expect(
      adapter.planActivation(activationInput(context, [])),
    ).resolves.toMatchObject({
      status: "blocked",
      blockedReasons: ["primary-model-required"],
    });
    await fs.writeFile(path.join(rootPath, "settings.json"), "{ invalid");
    await expect(
      adapter.planActivation(
        activationInput(context, [mapping("primary", "claude-opus-4-1")]),
      ),
    ).resolves.toMatchObject({
      status: "blocked",
      blockedReasons: ["native-config-invalid"],
    });
    await expect(
      adapter.inspect({ ...context, platformId: "codex" }),
    ).rejects.toThrow("AGENT_PROVIDER_CONTEXT_PLATFORM_MISMATCH");
  });

  it("blocks duplicate routes, parameters, unsupported and read-only native configs", async () => {
    const rootPath = await temporaryRoot();
    const context = {
      agentId: "claude",
      platformId: "claude",
      rootPath,
    };
    const duplicate = mapping("primary", "claude-opus-4-1");
    const parameterized = {
      ...mapping("secondary", "claude-haiku-4-5"),
      parameters: { temperature: 0.2 },
    };
    const adapter = createAgentModelProviderAdapter("claude", {
      backupRoot: path.join(rootPath, "backups"),
      inspect: vi.fn().mockResolvedValue(modelConfiguration()),
    });

    await expect(
      adapter.planActivation(
        activationInput(context, [
          duplicate,
          { ...duplicate, id: "duplicate" },
          parameterized,
        ]),
      ),
    ).resolves.toMatchObject({
      status: "blocked",
      blockedReasons: ["duplicate-model-route", "model-parameters-unsupported"],
    });

    for (const config of [
      modelConfiguration({ status: "unsupported" }),
      modelConfiguration({ canSetModel: false }),
    ]) {
      const blockedAdapter = createAgentModelProviderAdapter("claude", {
        backupRoot: path.join(rootPath, "backups"),
        inspect: vi.fn().mockResolvedValue(config),
      });
      await expect(
        blockedAdapter.planActivation(
          activationInput(context, [mapping("primary", "claude-opus-4-1")]),
        ),
      ).resolves.toMatchObject({ status: "blocked" });
    }
  });

  it("rejects unavailable imports and represents an empty native profile without inventing models", async () => {
    const rootPath = await temporaryRoot();
    const context = {
      agentId: "claude",
      platformId: "claude",
      rootPath,
    };
    for (const status of ["invalid", "unsupported"] as const) {
      const adapter = createAgentModelProviderAdapter("claude", {
        backupRoot: path.join(rootPath, "backups"),
        inspect: vi.fn().mockResolvedValue(modelConfiguration({ status })),
      });
      await expect(adapter.importCurrent(context)).rejects.toThrow(
        "AGENT_PROVIDER_IMPORT_UNAVAILABLE",
      );
    }

    const empty = createAgentModelProviderAdapter("claude", {
      backupRoot: path.join(rootPath, "backups"),
      inspect: vi.fn().mockResolvedValue(
        modelConfiguration({
          status: "missing",
          model: null,
          provider: null,
          adapter: null,
          sourceRelativePath: null,
        }),
      ),
    });
    await expect(empty.importCurrent(context)).resolves.toMatchObject({
      profile: {
        name: "claude native",
        providerKind: "platform-default",
      },
      modelMappings: [],
      warnings: [],
    });

    const opencode = createAgentModelProviderAdapter("opencode", {
      backupRoot: path.join(rootPath, "backups"),
      inspect: vi.fn().mockResolvedValue(
        modelConfiguration({
          agentId: "opencode",
          adapter: "opencode-config-v1",
          model: "openai/gpt-5",
          secondaryModel: "openai/gpt-5-mini",
          formattingMayChange: true,
          sourceRelativePath: "opencode.jsonc",
        }),
      ),
    });
    await expect(
      opencode.importCurrent({
        agentId: "opencode",
        platformId: "opencode",
        rootPath,
      }),
    ).resolves.toMatchObject({
      modelMappings: [
        { routeKey: "primary", modelId: "openai/gpt-5" },
        { routeKey: "secondary", modelId: "openai/gpt-5-mini" },
      ],
      warnings: ["native-formatting-may-change"],
    });
  });

  it("rejects unsupported factories, profile mismatches, and every stale apply boundary", async () => {
    const rootPath = await temporaryRoot();
    expect(() =>
      createAgentModelProviderAdapter("nanoclaw", {
        backupRoot: path.join(rootPath, "backups"),
      }),
    ).toThrow("AGENT_PROVIDER_ADAPTER_UNSUPPORTED");
    expect(() =>
      createAgentModelProviderAdapter("antigravity", {
        backupRoot: path.join(rootPath, "backups"),
      }),
    ).not.toThrow();
    const context = {
      agentId: "claude",
      platformId: "claude",
      rootPath,
    };
    const adapter = createAgentModelProviderAdapter("claude", {
      backupRoot: path.join(rootPath, "backups"),
      inspect: vi.fn().mockResolvedValue(modelConfiguration()),
      update: vi.fn(),
    });
    await expect(
      adapter.planActivation({
        ...activationInput(context, [mapping("primary", "claude-opus-4-1")]),
        profile: profile("codex"),
      }),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_PLATFORM_MISMATCH");
    const current = await adapter.inspect(context);
    const valid = await adapter.planActivation(
      activationInput(
        context,
        [mapping("primary", "claude-opus-4-1")],
        current,
      ),
    );
    const invalidPlans: AgentProviderActivationPlan[] = [
      { ...valid, platformId: "codex" },
      { ...valid, adapterVersion: "other" },
      { ...valid, currentDigest: "stale" },
      { ...valid, status: "preserve" },
      { ...valid, canApply: false },
    ];
    for (const invalid of invalidPlans) {
      await expect(
        adapter.apply(context, invalid, activationInput(context, [])),
      ).rejects.toThrow("AGENT_PROVIDER_APPLY_PLAN_INVALID");
    }

    const noPrimaryPlan: AgentProviderActivationPlan = {
      ...valid,
      decisions: [
        {
          field: "secondaryModel",
          status: "apply",
          desired: "claude-haiku-4-5",
        },
      ],
    };
    const noPrimaryAdapter = createAgentModelProviderAdapter("claude", {
      backupRoot: path.join(rootPath, "backups"),
      inspect: vi.fn().mockResolvedValue(modelConfiguration({ model: null })),
      update: vi.fn(),
    });
    await expect(
      noPrimaryAdapter.apply(
        context,
        {
          ...noPrimaryPlan,
          currentDigest: (await noPrimaryAdapter.inspect(context)).nativeDigest,
        },
        activationInput(
          context,
          [mapping("primary", "claude-opus-4-1")],
          current,
        ),
      ),
    ).rejects.toThrow("AGENT_PROVIDER_PRIMARY_MODEL_REQUIRED");
  });

  it("reports verification mismatches without leaking adapter state", async () => {
    const rootPath = await temporaryRoot();
    const context = {
      agentId: "claude",
      platformId: "claude",
      rootPath,
    };
    const config = modelConfiguration();
    const adapter = createAgentModelProviderAdapter("claude", {
      backupRoot: path.join(rootPath, "backups"),
      inspect: vi.fn().mockResolvedValue(config),
    });
    const state = await adapter.inspect(context);
    const plan: AgentProviderActivationPlan = {
      platformId: "claude",
      profileId: "profile-1",
      adapterVersion: adapter.version,
      currentDigest: state.nativeDigest,
      status: "apply",
      decisions: [
        {
          field: "model",
          status: "apply",
          desired: "claude-opus-4-1",
        },
        { field: "provider", status: "preserve" },
      ],
      canApply: true,
      requiresReview: false,
      blockedReasons: [],
    };
    const receipt: AgentProviderApplyReceipt = {
      platformId: "claude",
      profileId: "profile-1",
      adapterVersion: adapter.version,
      nativeDigestBefore: state.nativeDigest,
      nativeDigestAfter: state.nativeDigest,
      backupRef: null,
      appliedAt: 1,
    };
    for (const invalidReceipt of [
      { ...receipt, platformId: "codex" },
      { ...receipt, adapterVersion: "other" },
      { ...receipt, nativeDigestAfter: "other" },
      receipt,
    ]) {
      await expect(
        adapter.verify(context, plan, invalidReceipt),
      ).resolves.toMatchObject({
        verified: false,
        errorCode: "provider-state-mismatch",
      });
    }
  });

  it("rolls back a newly created file and fails closed for bad backup or target paths", async () => {
    const rootPath = await temporaryRoot();
    const backupRoot = path.join(rootPath, "backups");
    const context = {
      agentId: "claude",
      platformId: "claude",
      rootPath,
    };
    const adapter = createAgentModelProviderAdapter("claude", {
      backupRoot,
    });
    const current = await adapter.inspect(context);
    const plan = await adapter.planActivation(
      activationInput(
        context,
        [mapping("primary", "claude-opus-4-1")],
        current,
      ),
    );
    const receipt = await adapter.apply(
      context,
      plan,
      activationInput(
        context,
        [mapping("primary", "claude-opus-4-1")],
        current,
      ),
    );
    expect(receipt.backupRef).toBeNull();
    await expect(adapter.rollback(context, receipt)).resolves.toEqual({
      restored: true,
      nativeDigest: current.nativeDigest,
    });
    await expect(
      fs.stat(path.join(rootPath, "settings.json")),
    ).rejects.toThrow();

    await expect(
      adapter.rollback(context, {
        ...receipt,
        backupRef: path.join(rootPath, "outside.json"),
      }),
    ).resolves.toMatchObject({
      restored: false,
      errorCode: "provider-rollback-failed",
    });

    const malicious = createAgentModelProviderAdapter("claude", {
      backupRoot,
      inspect: vi
        .fn()
        .mockResolvedValue(
          modelConfiguration({ sourceRelativePath: "../outside.json" }),
        ),
    });
    await expect(
      malicious.rollback(context, { ...receipt, backupRef: null }),
    ).resolves.toMatchObject({
      restored: false,
      errorCode: "provider-rollback-failed",
    });

    const absoluteTarget = createAgentModelProviderAdapter("claude", {
      backupRoot,
      inspect: vi
        .fn()
        .mockResolvedValue(
          modelConfiguration({ sourceRelativePath: path.join(rootPath, "x") }),
        ),
    });
    await expect(
      absoluteTarget.rollback(context, { ...receipt, backupRef: null }),
    ).resolves.toMatchObject({
      restored: false,
      errorCode: "provider-rollback-failed",
    });

    const defaultTarget = createAgentModelProviderAdapter("claude", {
      backupRoot,
      inspect: vi.fn().mockResolvedValue(
        modelConfiguration({
          status: "missing",
          model: null,
          sourceRelativePath: null,
        }),
      ),
    });
    const missingState = await defaultTarget.inspect(context);
    await expect(
      defaultTarget.rollback(context, {
        ...receipt,
        backupRef: null,
        nativeDigestBefore: missingState.nativeDigest,
      }),
    ).resolves.toMatchObject({ restored: true });
  });

  it("reports a rollback digest mismatch", async () => {
    const rootPath = await temporaryRoot();
    const targetPath = path.join(rootPath, "settings.json");
    await fs.writeFile(targetPath, JSON.stringify({ model: "old" }));
    const context = {
      agentId: "claude",
      platformId: "claude",
      rootPath,
    };
    const adapter = createAgentModelProviderAdapter("claude", {
      backupRoot: path.join(rootPath, "backups"),
    });
    const before = await adapter.inspect(context);
    const plan = await adapter.planActivation(
      activationInput(context, [mapping("primary", "new")], before),
    );
    const receipt = await adapter.apply(
      context,
      plan,
      activationInput(context, [mapping("primary", "new")], before),
    );

    await expect(
      adapter.rollback(context, {
        ...receipt,
        nativeDigestBefore: "different",
      }),
    ).resolves.toMatchObject({
      restored: false,
      errorCode: "provider-rollback-mismatch",
    });
  });

  it("uses the current primary model when only an OpenCode secondary route is applied", async () => {
    const rootPath = await temporaryRoot();
    const context = {
      agentId: "opencode",
      platformId: "opencode",
      rootPath,
    };
    const inspect = vi.fn().mockResolvedValue(
      modelConfiguration({
        agentId: "opencode",
        model: "openai/gpt-5",
        secondaryModel: null,
        sourceRelativePath: "opencode.jsonc",
      }),
    );
    const update = vi.fn().mockResolvedValue({
      ...modelConfiguration({
        agentId: "opencode",
        model: "openai/gpt-5",
        secondaryModel: "openai/gpt-5-mini",
        sourceRelativePath: "opencode.jsonc",
      }),
      backupPath: null,
    } satisfies UpdateAgentModelResult);
    const adapter = createAgentModelProviderAdapter("opencode", {
      backupRoot: path.join(rootPath, "backups"),
      inspect,
      update,
    });
    const state = await adapter.inspect(context);
    const plan: AgentProviderActivationPlan = {
      platformId: "opencode",
      profileId: "profile-1",
      adapterVersion: adapter.version,
      currentDigest: state.nativeDigest,
      status: "apply",
      decisions: [
        {
          field: "secondaryModel",
          status: "apply",
          desired: "openai/gpt-5-mini",
        },
      ],
      canApply: true,
      requiresReview: false,
      blockedReasons: [],
    };

    await adapter.apply(context, plan, activationInput(context, []));
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "openai/gpt-5",
        secondaryModel: "openai/gpt-5-mini",
      }),
      expect.anything(),
    );

    const withExistingSecondary = createAgentModelProviderAdapter("opencode", {
      backupRoot: path.join(rootPath, "backups"),
      inspect: vi.fn().mockResolvedValue(
        modelConfiguration({
          agentId: "opencode",
          model: "openai/gpt-5",
          secondaryModel: "openai/gpt-5-mini",
          sourceRelativePath: "opencode.jsonc",
        }),
      ),
      update,
    });
    const existingState = await withExistingSecondary.inspect(context);
    await withExistingSecondary.apply(
      context,
      {
        ...plan,
        currentDigest: existingState.nativeDigest,
        decisions: [
          {
            field: "model",
            status: "apply",
            desired: "openai/gpt-5.1",
          },
        ],
      },
      activationInput(context, []),
    );
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        model: "openai/gpt-5.1",
        secondaryModel: "openai/gpt-5-mini",
      }),
      expect.anything(),
    );

    const withoutSecondary = createAgentModelProviderAdapter("opencode", {
      backupRoot: path.join(rootPath, "backups"),
      inspect,
      update,
    });
    await withoutSecondary.apply(
      context,
      {
        ...plan,
        decisions: [
          {
            field: "model",
            status: "apply",
            desired: "openai/gpt-5.1",
          },
        ],
      },
      activationInput(context, []),
    );
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({ secondaryModel: null }),
      expect.anything(),
    );
  });
});
