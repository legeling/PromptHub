/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from "vitest";

import type {
  AgentProviderActivationExecutionResult,
  AgentProviderActivationPlan,
  AgentProviderImportPreview,
  AgentProviderProfilePublic,
  AgentProviderSnapshot,
} from "@prompthub/shared";
import { createAgentProviderTrayService } from "../../../src/main/services/agent-provider-tray-service";

function profile(
  id: string,
  platformId: string,
  overrides: Partial<AgentProviderProfilePublic> = {},
): AgentProviderProfilePublic {
  return {
    id,
    platformId,
    name: `${platformId} ${id}`,
    providerKind: "openai-compatible",
    protocol: "openai-chat",
    endpoint: "https://example.com",
    config: {},
    source: "manual",
    archived: false,
    createdAt: 1,
    updatedAt: 2,
    modelMappings: [
      {
        id: `${id}-mapping`,
        providerProfileId: id,
        routeKey: "primary",
        modelId: `${id}-model`,
        parameters: {},
      },
    ],
    secretState: "available",
    ...overrides,
  };
}

function snapshot(
  platformId: string,
  providerProfileId: string | null,
): AgentProviderSnapshot {
  return {
    id: `${platformId}-snapshot`,
    platformId,
    providerProfileId,
    nativeDigest: `${platformId}-digest`,
    redactedSnapshot: {},
    backupRef: null,
    operation: "activate",
    result: "verified",
    createdAt: 3,
  };
}

function plan(
  overrides: Partial<AgentProviderActivationPlan> = {},
): AgentProviderActivationPlan {
  return {
    platformId: "claude",
    profileId: "profile-2",
    adapterVersion: "v1",
    currentDigest: "current-digest",
    status: "apply",
    decisions: [
      {
        field: "model",
        status: "apply",
        current: "old",
        desired: "new",
      },
    ],
    canApply: true,
    requiresReview: false,
    blockedReasons: [],
    ...overrides,
  };
}

function verifiedResult(
  activationPlan: AgentProviderActivationPlan,
): AgentProviderActivationExecutionResult {
  return {
    status: "verified",
    plan: activationPlan,
    verification: {
      verified: true,
      nativeDigest: "verified-digest",
      state: {
        platformId: activationPlan.platformId,
        adapterVersion: activationPlan.adapterVersion,
        nativeDigest: "verified-digest",
        values: {},
      },
    },
    rollback: null,
  };
}

function importedCurrent(
  platformId: string,
  options: {
    providerKind?: string;
    protocol?: string;
    endpoint?: string | null;
    model?: string | null;
    credentialStatus?: string;
    credentialKind?: string;
  } = {},
): AgentProviderImportPreview {
  const providerKind = options.providerKind ?? "platform-default";
  const protocol = options.protocol ?? "platform-native";
  const endpoint = options.endpoint ?? null;
  const model = options.model ?? `${platformId}-model`;
  return {
    state: {
      platformId,
      adapterVersion: "v1",
      nativeDigest: `${platformId}-native-digest`,
      values: {
        provider: providerKind,
        protocol,
        endpoint,
        model,
        credentialStatus: options.credentialStatus ?? "platform-managed",
        credentialKind: options.credentialKind ?? "none",
      },
    },
    profile: {
      platformId,
      name: `${platformId} current`,
      providerKind,
      protocol,
      endpoint,
      config: {},
      secretRef: null,
      source: "native-import",
    },
    modelMappings: model
      ? [{ routeKey: "primary", modelId: model, parameters: {} }]
      : [],
    warnings: [],
  };
}

function createHarness() {
  const profiles = [
    profile("profile-1", "claude"),
    profile("profile-2", "claude"),
    profile("profile-3", "qwen"),
    profile("ignored", "unsupported"),
  ];
  const preview = vi.fn(async (input: { profileId: string }) =>
    input.profileId === "profile-1"
      ? plan({
          profileId: "profile-1",
          currentDigest: "claude-digest",
          status: "preserve",
          decisions: [{ field: "model", status: "preserve" }],
        })
      : plan(),
  );
  const activate = vi.fn(async (input) => verifiedResult(await preview(input)));
  const importCurrent = vi.fn(async ({ context }) =>
    context.platformId === "claude"
      ? importedCurrent("claude", {
          providerKind: "custom-gateway",
          protocol: "anthropic-messages",
          endpoint: "https://gateway.example.com",
          model: "claude-work",
          credentialStatus: "configured",
          credentialKind: "api-key",
        })
      : importedCurrent(context.platformId, {
          providerKind: "qwen-oauth",
        }),
  );
  const service = createAgentProviderTrayService({
    activate,
    getLatestVerifiedSnapshot: vi.fn((platformId: string) =>
      platformId === "claude"
        ? snapshot("claude", "profile-1")
        : snapshot(platformId, null),
    ),
    listProfiles: vi.fn(async () => profiles),
    importCurrent,
    preview,
    resolveContext: (agentId) => ({
      agentId,
      platformId: agentId,
      rootPath: `/tmp/${agentId}`,
    }),
    resolvePlatformName: (platformId) =>
      ({ claude: "Claude Code", qwen: "Qwen Code" })[platformId] ?? null,
    supportedPlatformIds: ["claude", "qwen"],
  });
  return { activate, importCurrent, preview, profiles, service };
}

describe("agent provider tray service", () => {
  it("exposes one verified current-state query for tray and workspace", async () => {
    const { service } = createHarness();

    await expect(service.getCurrentState("claude")).resolves.toEqual({
      platformId: "claude",
      status: "verified",
      currentProfileId: "profile-1",
      officialService: {
        status: "inactive",
        summary: {
          classification: "official",
          name: "Anthropic",
          providerKind: "anthropic",
          protocol: "platform-native",
          endpoint: null,
          model: null,
          credential: "unknown",
          officialRestoreAvailable: true,
        },
      },
      nativeConfig: {
        classification: "custom",
        name: "claude current",
        providerKind: "custom-gateway",
        protocol: "anthropic-messages",
        endpoint: "https://gateway.example.com",
        model: "claude-work",
        credential: "configured-api-key",
        officialRestoreAvailable: true,
      },
      checkedAt: expect.any(Number),
    });
    await expect(service.getCurrentState("qwen")).resolves.toEqual({
      platformId: "qwen",
      status: "none",
      currentProfileId: null,
      officialService: {
        status: "active",
        summary: {
          classification: "official",
          name: "qwen current",
          providerKind: "qwen-oauth",
          protocol: "platform-native",
          endpoint: null,
          model: "qwen-model",
          credential: "platform-managed",
          officialRestoreAvailable: false,
        },
      },
      nativeConfig: {
        classification: "official",
        name: "qwen current",
        providerKind: "qwen-oauth",
        protocol: "platform-native",
        endpoint: null,
        model: "qwen-model",
        credential: "platform-managed",
        officialRestoreAvailable: false,
      },
      checkedAt: expect.any(Number),
    });
  });

  it("distinguishes stale and unreadable native state without a current marker", async () => {
    const { importCurrent, preview, service } = createHarness();
    preview.mockResolvedValueOnce(
      plan({
        profileId: "profile-1",
        status: "external-modified",
        canApply: false,
        requiresReview: true,
      }),
    );

    await expect(service.getCurrentState("claude")).resolves.toMatchObject({
      platformId: "claude",
      status: "stale",
      currentProfileId: null,
    });

    preview.mockRejectedValueOnce(new Error("native path token=secret"));
    await expect(service.getCurrentState("claude")).resolves.toMatchObject({
      platformId: "claude",
      status: "unavailable",
      currentProfileId: null,
    });

    importCurrent.mockRejectedValueOnce(
      new Error("native file contained token=secret"),
    );
    await expect(service.getCurrentState("claude")).resolves.toEqual({
      platformId: "claude",
      status: "unavailable",
      currentProfileId: null,
      nativeConfig: null,
      officialService: {
        status: "unavailable",
        summary: {
          classification: "official",
          name: "Anthropic",
          providerKind: "anthropic",
          protocol: "platform-native",
          endpoint: null,
          model: null,
          credential: "unknown",
          officialRestoreAvailable: false,
        },
      },
      checkedAt: expect.any(Number),
    });
  });

  it("recognizes platform-managed Claude channels and Codex bearer credentials", async () => {
    const { importCurrent, service } = createHarness();
    importCurrent.mockResolvedValueOnce(
      importedCurrent("claude", {
        providerKind: "amazon-bedrock",
        model: "claude-sonnet-4",
      }),
    );
    await expect(service.getCurrentState("claude")).resolves.toMatchObject({
      nativeConfig: {
        classification: "official",
        credential: "platform-managed",
        officialRestoreAvailable: false,
      },
    });

    const codexHarness = createAgentProviderTrayService({
      activate: vi.fn(),
      getLatestVerifiedSnapshot: vi.fn(() => null),
      importCurrent: vi.fn(async () =>
        importedCurrent("codex", {
          providerKind: "custom-openai",
          credentialStatus: "configured",
        }),
      ),
      listProfiles: vi.fn(async () => []),
      preview: vi.fn(),
      resolveContext: () => ({
        agentId: "codex",
        platformId: "codex",
        rootPath: "/tmp/codex",
      }),
      resolvePlatformName: () => "Codex",
      supportedPlatformIds: ["codex"],
    });
    await expect(codexHarness.getCurrentState("codex")).resolves.toMatchObject({
      nativeConfig: { credential: "configured-auth-token" },
    });
  });

  it("rejects unsupported platforms and treats an orphan snapshot as stale", async () => {
    const { profiles, service } = createHarness();
    profiles.splice(
      profiles.findIndex((candidate) => candidate.id === "profile-1"),
      1,
    );

    await expect(service.getCurrentState("claude")).resolves.toMatchObject({
      status: "stale",
      currentProfileId: null,
    });
    await expect(service.getCurrentState("unsupported")).rejects.toThrow(
      "AGENT_PROVIDER_PLATFORM_UNSUPPORTED",
    );
  });

  it("projects supported profiles in registry order with verified current state", async () => {
    const { service } = createHarness();

    await expect(service.listGroups()).resolves.toEqual([
      {
        agentId: "claude",
        name: "Claude Code",
        currentProfileId: "profile-1",
        profiles: [
          {
            id: "profile-1",
            name: "claude profile-1",
            model: "profile-1-model",
            isCurrent: true,
          },
          {
            id: "profile-2",
            name: "claude profile-2",
            model: "profile-2-model",
            isCurrent: false,
          },
        ],
      },
      {
        agentId: "qwen",
        name: "Qwen Code",
        currentProfileId: null,
        profiles: [
          {
            id: "profile-3",
            name: "qwen profile-3",
            model: "profile-3-model",
            isCurrent: false,
          },
        ],
      },
    ]);
  });

  it("requires the full workspace when preview reports conflicts", async () => {
    const { activate, preview, service } = createHarness();
    preview.mockResolvedValue(
      plan({
        status: "conflict",
        canApply: false,
        requiresReview: true,
      }),
    );
    const confirm = vi.fn();

    await expect(
      service.switchProfile(
        { agentId: "claude", profileId: "profile-2" },
        confirm,
      ),
    ).resolves.toEqual({
      status: "review-required",
      agentId: "claude",
      profileId: "profile-2",
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });

  it("does not mark a stale verified snapshot as the current profile", async () => {
    const { preview, service } = createHarness();
    preview.mockResolvedValueOnce(
      plan({
        profileId: "profile-1",
        status: "external-modified",
        canApply: false,
        requiresReview: true,
      }),
    );

    const groups = await service.listGroups();

    expect(groups[0]).toMatchObject({
      agentId: "claude",
      currentProfileId: null,
      profiles: [
        expect.objectContaining({ id: "profile-1", isCurrent: false }),
        expect.objectContaining({ id: "profile-2", isCurrent: false }),
      ],
    });
  });

  it("treats an unreadable verified snapshot as stale", async () => {
    const { preview, service } = createHarness();
    preview.mockRejectedValueOnce(new Error("unreadable native config"));

    const groups = await service.listGroups();

    expect(groups[0]?.currentProfileId).toBeNull();
  });

  it("uses the first mapping fallback and supports profiles without a model", async () => {
    const { profiles, service } = createHarness();
    profiles.push(
      profile("profile-4", "qwen", {
        modelMappings: [
          {
            id: "secondary",
            providerProfileId: "profile-4",
            routeKey: "secondary",
            modelId: "fallback-model",
            parameters: {},
          },
        ],
      }),
      profile("profile-5", "qwen", { modelMappings: [] }),
    );

    const groups = await service.listGroups();
    const qwen = groups.find((group) => group.agentId === "qwen");

    expect(qwen?.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "profile-4", model: "fallback-model" }),
        expect.objectContaining({ id: "profile-5", model: null }),
      ]),
    );
  });

  it("does not activate a no-change plan or a cancelled confirmation", async () => {
    const { activate, preview, service } = createHarness();
    preview.mockResolvedValueOnce(
      plan({
        profileId: "profile-1",
        status: "preserve",
        decisions: [{ field: "model", status: "preserve" }],
      }),
    );

    await expect(
      service.switchProfile(
        { agentId: "claude", profileId: "profile-1" },
        vi.fn(),
      ),
    ).resolves.toEqual({
      status: "already-active",
      agentId: "claude",
      profileId: "profile-1",
    });

    preview.mockResolvedValueOnce(plan());
    const confirm = vi.fn(async () => false);
    await expect(
      service.switchProfile(
        { agentId: "claude", profileId: "profile-2" },
        confirm,
      ),
    ).resolves.toEqual({
      status: "cancelled",
      agentId: "claude",
      profileId: "profile-2",
    });
    expect(confirm).toHaveBeenCalledWith({
      agentName: "Claude Code",
      profileName: "claude profile-2",
      model: "profile-2-model",
      changedFields: 1,
    });
    expect(activate).not.toHaveBeenCalled();
  });

  it("activates only the confirmed preview digest through the shared service", async () => {
    const { activate, service } = createHarness();

    await expect(
      service.switchProfile(
        { agentId: "claude", profileId: "profile-2" },
        async () => true,
      ),
    ).resolves.toEqual({
      status: "verified",
      agentId: "claude",
      profileId: "profile-2",
    });
    expect(activate).toHaveBeenCalledWith({
      context: expect.objectContaining({
        agentId: "claude",
        platformId: "claude",
      }),
      profileId: "profile-2",
      expectedCurrentDigest: "current-digest",
    });
  });

  it("fails closed for unknown profiles and activation failures", async () => {
    const { activate, service } = createHarness();

    await expect(
      service.switchProfile(
        { agentId: "claude", profileId: "missing" },
        async () => true,
      ),
    ).resolves.toEqual({
      status: "failed",
      agentId: "claude",
      profileId: "missing",
    });

    activate.mockRejectedValueOnce(new Error("secret value must not escape"));
    await expect(
      service.switchProfile(
        { agentId: "claude", profileId: "profile-2" },
        async () => true,
      ),
    ).resolves.toEqual({
      status: "failed",
      agentId: "claude",
      profileId: "profile-2",
    });

    activate.mockResolvedValueOnce({
      ...verifiedResult(plan()),
      status: "rolled-back",
      errorCode: "provider-verification-failed",
    });
    await expect(
      service.switchProfile(
        { agentId: "claude", profileId: "profile-2" },
        async () => true,
      ),
    ).resolves.toEqual({
      status: "failed",
      agentId: "claude",
      profileId: "profile-2",
    });
  });
});
