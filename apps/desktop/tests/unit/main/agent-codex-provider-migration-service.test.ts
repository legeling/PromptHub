import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AgentProviderProfilePublic,
  CreateAgentProviderProfileRequest,
} from "@prompthub/shared";

import {
  createAgentCodexProviderMigrationService,
  type AgentCodexProviderMigrationProfileService,
  type AgentCodexProviderMigrationSourceReader,
  type AgentCodexProviderMigrationSource,
} from "../../../src/main/services/agent-codex-provider-migration-service";
import type { AgentSecretStore } from "../../../src/main/services/agent-secret-store";

function source(
  overrides: Partial<AgentCodexProviderMigrationSource> = {},
): AgentCodexProviderMigrationSource {
  return {
    providerId: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    wireApi: "chat",
    envKey: null,
    credentialSource: "legacy-managed",
    credential: "managed-secret",
    isActive: true,
    profileModel: "deepseek-chat",
    ...overrides,
  };
}

function profile(
  request: CreateAgentProviderProfileRequest,
  id = `profile-${request.profile.config.legacyProviderId as string}`,
): AgentProviderProfilePublic {
  return {
    id,
    ...request.profile,
    endpoint: request.profile.endpoint ?? null,
    archived: false,
    createdAt: 1,
    updatedAt: 1,
    modelMappings: request.modelMappings.map((mapping, index) => ({
      id: `${id}-mapping-${index}`,
      providerProfileId: id,
      ...mapping,
    })),
    secretState: request.secret ? "available" : "none",
  };
}

interface Harness {
  service: ReturnType<typeof createAgentCodexProviderMigrationService>;
  sourceReader: AgentCodexProviderMigrationSourceReader;
  profiles: AgentCodexProviderMigrationProfileService;
  secrets: AgentSecretStore;
}

function createHarness(
  sources: AgentCodexProviderMigrationSource[] = [source()],
): Harness {
  const sourceReader: AgentCodexProviderMigrationSourceReader = {
    inspect: vi.fn(async () => ({
      nativeDigest: "native-digest",
      defaultModel: "gpt-5.4",
      sources,
    })),
  };
  const profiles: AgentCodexProviderMigrationProfileService = {
    list: vi.fn(async () => []),
    create: vi.fn(async (request) => profile(request)),
    delete: vi.fn(async () => undefined),
  };
  const persisted = new Map<string, string>(
    sources.flatMap((entry) =>
      entry.credentialSource === "legacy-managed" && entry.credential
        ? [[`codex-provider:${entry.providerId}`, entry.credential]]
        : [],
    ),
  );
  const secrets: AgentSecretStore = {
    read: vi.fn(async (ref) => persisted.get(ref) ?? null),
    write: vi.fn(async (ref, value) => {
      persisted.set(ref, value);
    }),
    clear: vi.fn(async (ref) => {
      persisted.delete(ref);
    }),
    has: vi.fn(async (ref) => persisted.has(ref)),
    hasMany: vi.fn(
      async (refs: string[]) =>
        new Set(refs.filter((ref) => persisted.has(ref))),
    ),
  };
  return {
    service: createAgentCodexProviderMigrationService({
      sourceReader,
      profiles,
      secrets,
    }),
    sourceReader,
    profiles,
    secrets,
  };
}

describe("AgentCodexProviderMigrationService", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness([
      source(),
      source({
        providerId: "env-provider",
        name: "Environment",
        envKey: "OPENAI_API_KEY",
        credentialSource: "environment",
        credential: null,
        isActive: false,
        profileModel: null,
      }),
      source({
        providerId: "inline-provider",
        name: "Inline",
        credentialSource: "native-inline",
        credential: "inline-secret",
        isActive: false,
      }),
    ]);
  });

  it("returns a bounded public preview without credentials or secret refs", async () => {
    const preview = await harness.service.preview("codex");

    expect(preview).toEqual({
      agentId: "codex",
      nativeDigest: "native-digest",
      candidates: [
        expect.objectContaining({
          providerId: "deepseek",
          credentialSource: "legacy-managed",
          credentialReady: true,
          alreadyMigrated: false,
        }),
        expect.objectContaining({
          providerId: "env-provider",
          credentialSource: "environment",
          credentialReady: true,
          alreadyMigrated: false,
        }),
        expect.objectContaining({
          providerId: "inline-provider",
          credentialSource: "native-inline",
          credentialReady: true,
          alreadyMigrated: false,
        }),
      ],
    });
    expect(JSON.stringify(preview)).not.toContain("managed-secret");
    expect(JSON.stringify(preview)).not.toContain("inline-secret");
    expect(JSON.stringify(preview)).not.toContain("codex-provider:");
  });

  it("does no durable work until migrate is explicitly called", async () => {
    await harness.service.preview("codex");

    expect(harness.profiles.create).not.toHaveBeenCalled();
    expect(harness.profiles.delete).not.toHaveBeenCalled();
    expect(harness.secrets.write).not.toHaveBeenCalled();
    expect(harness.secrets.clear).not.toHaveBeenCalled();
  });

  it("migrates selected managed, environment and inline credentials as one batch", async () => {
    const result = await harness.service.migrate({
      agentId: "codex",
      expectedNativeDigest: "native-digest",
      providerIds: ["deepseek", "env-provider", "inline-provider"],
    });

    expect(result.profiles).toHaveLength(3);
    expect(harness.profiles.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        profile: expect.objectContaining({
          platformId: "codex",
          protocol: "chat",
          config: {
            legacyProviderId: "deepseek",
            envKey: null,
          },
        }),
        modelMappings: [
          {
            routeKey: "primary",
            modelId: "deepseek-chat",
            parameters: {},
          },
        ],
        secret: "managed-secret",
      }),
    );
    expect(harness.profiles.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        profile: expect.objectContaining({
          config: {
            legacyProviderId: "env-provider",
            envKey: "OPENAI_API_KEY",
          },
        }),
        modelMappings: [
          { routeKey: "primary", modelId: "gpt-5.4", parameters: {} },
        ],
        secret: null,
      }),
    );
    expect(harness.profiles.create).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ secret: "inline-secret" }),
    );
    expect(harness.secrets.clear).toHaveBeenCalledWith(
      "codex-provider:deepseek",
    );
    expect(harness.secrets.clear).not.toHaveBeenCalledWith(
      "codex-provider:inline-provider",
    );
    expect(JSON.stringify(result)).not.toContain("managed-secret");
    expect(JSON.stringify(result)).not.toContain("inline-secret");
    expect(JSON.stringify(result)).not.toContain("codex-provider:");
    expect(JSON.stringify(result)).not.toContain("agent-provider:");
  });

  it("rejects stale or malformed consent without creating profiles", async () => {
    await expect(
      harness.service.migrate({
        agentId: "codex",
        expectedNativeDigest: "stale",
        providerIds: ["deepseek"],
      }),
    ).rejects.toThrow("AGENT_PROVIDER_MIGRATION_STALE");
    await expect(
      harness.service.migrate({
        agentId: "claude",
        expectedNativeDigest: "native-digest",
        providerIds: ["deepseek"],
      }),
    ).rejects.toThrow("AGENT_PROVIDER_MIGRATION_UNSUPPORTED");
    await expect(
      harness.service.migrate({
        agentId: "codex",
        expectedNativeDigest: "native-digest",
        providerIds: ["deepseek", "deepseek"],
      }),
    ).rejects.toThrow("AGENT_PROVIDER_MIGRATION_INPUT_INVALID");

    expect(harness.profiles.create).not.toHaveBeenCalled();
    expect(harness.secrets.clear).not.toHaveBeenCalled();
  });

  it.each([
    { expectedNativeDigest: "", providerIds: ["deepseek"] },
    { expectedNativeDigest: "native-digest", providerIds: [] },
    { expectedNativeDigest: "native-digest", providerIds: ["../deepseek"] },
    { expectedNativeDigest: "native-digest", providerIds: [42] },
  ])("rejects malformed request shape %#", async (invalid) => {
    await expect(
      harness.service.migrate({
        agentId: "codex",
        expectedNativeDigest: invalid.expectedNativeDigest,
        providerIds: invalid.providerIds as string[],
      }),
    ).rejects.toThrow("AGENT_PROVIDER_MIGRATION_INPUT_INVALID");
    expect(harness.profiles.create).not.toHaveBeenCalled();
  });

  it("rejects unsupported previews and invalid source inventories", async () => {
    await expect(harness.service.preview("claude")).rejects.toThrow(
      "AGENT_PROVIDER_MIGRATION_UNSUPPORTED",
    );

    vi.mocked(harness.sourceReader.inspect).mockResolvedValueOnce({
      nativeDigest: "",
      defaultModel: null,
      sources: [],
    });
    await expect(harness.service.preview("codex")).rejects.toThrow(
      "AGENT_PROVIDER_MIGRATION_SOURCE_INVALID",
    );

    vi.mocked(harness.sourceReader.inspect).mockResolvedValueOnce({
      nativeDigest: "digest",
      defaultModel: null,
      sources: [source(), source({ name: "Duplicate" })],
    });
    await expect(harness.service.preview("codex")).rejects.toThrow(
      "AGENT_PROVIDER_MIGRATION_SOURCE_INVALID",
    );
  });

  it.each([
    null,
    { nativeDigest: 42, sources: [] },
    { nativeDigest: "digest", sources: null },
    {
      nativeDigest: "digest",
      sources: Array.from({ length: 257 }, (_, index) =>
        source({ providerId: `provider-${index}` }),
      ),
    },
    { nativeDigest: "digest", sources: [source({ providerId: "../bad" })] },
    { nativeDigest: "digest", sources: [source({ name: " " })] },
    { nativeDigest: "digest", sources: [source({ baseUrl: 42 as never })] },
    { nativeDigest: "digest", sources: [source({ wireApi: "bad" as never })] },
    { nativeDigest: "digest", sources: [source({ envKey: 42 as never })] },
    {
      nativeDigest: "digest",
      sources: [source({ credentialSource: "bad" as never })],
    },
    { nativeDigest: "digest", sources: [source({ credential: 42 as never })] },
    { nativeDigest: "digest", sources: [source({ isActive: "yes" as never })] },
    {
      nativeDigest: "digest",
      sources: [source({ profileModel: 42 as never })],
    },
  ])("rejects malformed source inventory %#", async (inspection) => {
    vi.mocked(harness.sourceReader.inspect).mockResolvedValueOnce(
      inspection as never,
    );
    await expect(harness.service.preview("codex")).rejects.toThrow(
      "AGENT_PROVIDER_MIGRATION_SOURCE_INVALID",
    );
  });

  it("rejects a selected provider removed after preview without writes", async () => {
    await expect(
      harness.service.migrate({
        agentId: "codex",
        expectedNativeDigest: "native-digest",
        providerIds: ["removed-provider"],
      }),
    ).rejects.toThrow("AGENT_PROVIDER_MIGRATION_SOURCE_MISSING");
    expect(harness.profiles.create).not.toHaveBeenCalled();
    expect(harness.secrets.clear).not.toHaveBeenCalled();
  });

  it("removes partial profiles when profile creation fails", async () => {
    vi.mocked(harness.profiles.create)
      .mockImplementationOnce(async (request) => profile(request))
      .mockRejectedValueOnce(new Error("db locked"));

    await expect(
      harness.service.migrate({
        agentId: "codex",
        expectedNativeDigest: "native-digest",
        providerIds: ["deepseek", "env-provider"],
      }),
    ).rejects.toThrow("AGENT_PROVIDER_MIGRATION_FAILED");

    expect(harness.profiles.delete).toHaveBeenCalledWith("profile-deepseek");
    expect(harness.secrets.clear).not.toHaveBeenCalledWith(
      "codex-provider:deepseek",
    );
  });

  it("deletes a created profile when post-create verification fails", async () => {
    vi.mocked(harness.profiles.create).mockImplementationOnce(
      async (request) => ({
        ...profile(request),
        secretState: "missing",
      }),
    );

    await expect(
      harness.service.migrate({
        agentId: "codex",
        expectedNativeDigest: "native-digest",
        providerIds: ["deepseek"],
      }),
    ).rejects.toThrow("AGENT_PROVIDER_MIGRATION_FAILED");

    expect(harness.profiles.delete).toHaveBeenCalledWith("profile-deepseek");
    expect(harness.secrets.clear).not.toHaveBeenCalledWith(
      "codex-provider:deepseek",
    );
  });

  it("creates a profile without mapping or secret when the source has neither", async () => {
    harness = createHarness([
      source({
        providerId: "local",
        name: "Local",
        baseUrl: "",
        credentialSource: "none",
        credential: null,
        profileModel: null,
      }),
    ]);
    vi.mocked(harness.sourceReader.inspect).mockResolvedValue({
      nativeDigest: "native-digest",
      defaultModel: null,
      sources: [
        source({
          providerId: "local",
          name: "Local",
          baseUrl: "",
          credentialSource: "none",
          credential: null,
          profileModel: null,
        }),
      ],
    });

    await harness.service.migrate({
      agentId: "codex",
      expectedNativeDigest: "native-digest",
      providerIds: ["local"],
    });

    expect(harness.profiles.create).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({ endpoint: null }),
        modelMappings: [],
        secret: null,
      }),
    );
  });

  it("restores cleared legacy secrets when cleanup fails", async () => {
    const secondManaged = source({
      providerId: "managed-two",
      credential: "second-secret",
      isActive: false,
    });
    harness = createHarness([source(), secondManaged]);
    vi.mocked(harness.secrets.clear).mockImplementation(async (ref) => {
      if (ref === "codex-provider:managed-two") {
        throw new Error("disk full");
      }
    });

    await expect(
      harness.service.migrate({
        agentId: "codex",
        expectedNativeDigest: "native-digest",
        providerIds: ["deepseek", "managed-two"],
      }),
    ).rejects.toThrow("AGENT_PROVIDER_MIGRATION_FAILED");

    expect(harness.secrets.write).toHaveBeenCalledWith(
      "codex-provider:deepseek",
      "managed-secret",
    );
    expect(harness.profiles.delete).toHaveBeenCalledWith("profile-deepseek");
    expect(harness.profiles.delete).toHaveBeenCalledWith("profile-managed-two");
  });

  it("reports rollback failure when legacy credential restoration fails", async () => {
    const secondManaged = source({
      providerId: "managed-two",
      credential: "second-secret",
      isActive: false,
    });
    harness = createHarness([source(), secondManaged]);
    vi.mocked(harness.secrets.clear).mockImplementation(async (ref) => {
      if (ref === "codex-provider:managed-two") {
        throw new Error("disk full");
      }
    });
    vi.mocked(harness.secrets.write).mockRejectedValue(
      new Error("restore denied"),
    );

    await expect(
      harness.service.migrate({
        agentId: "codex",
        expectedNativeDigest: "native-digest",
        providerIds: ["deepseek", "managed-two"],
      }),
    ).rejects.toThrow("AGENT_PROVIDER_MIGRATION_ROLLBACK_FAILED");
  });

  it("serializes migration batches", async () => {
    let releaseInspection: (() => void) | undefined;
    const pendingInspection = new Promise<void>((resolve) => {
      releaseInspection = resolve;
    });
    vi.mocked(harness.sourceReader.inspect).mockImplementationOnce(async () => {
      await pendingInspection;
      return {
        nativeDigest: "native-digest",
        defaultModel: null,
        sources: [source()],
      };
    });

    const first = harness.service.migrate({
      agentId: "codex",
      expectedNativeDigest: "native-digest",
      providerIds: ["deepseek"],
    });
    await Promise.resolve();
    await expect(
      harness.service.migrate({
        agentId: "codex",
        expectedNativeDigest: "native-digest",
        providerIds: ["deepseek"],
      }),
    ).rejects.toThrow("AGENT_PROVIDER_MIGRATION_BUSY");
    releaseInspection?.();
    await expect(first).resolves.toEqual({
      profiles: [expect.objectContaining({ id: "profile-deepseek" })],
    });
  });

  it("is idempotent when the selected Provider already has a unified profile", async () => {
    const existing = profile(
      {
        profile: {
          platformId: "codex",
          name: "DeepSeek",
          providerKind: "openai-compatible",
          protocol: "chat",
          endpoint: "https://api.deepseek.com/v1",
          config: { legacyProviderId: "deepseek", envKey: null },
          source: "native-import",
        },
        modelMappings: [],
      },
      "existing-profile",
    );
    vi.mocked(harness.profiles.list).mockResolvedValue([existing]);

    const preview = await harness.service.preview("codex");
    expect(preview.candidates[0]?.alreadyMigrated).toBe(true);

    const result = await harness.service.migrate({
      agentId: "codex",
      expectedNativeDigest: "native-digest",
      providerIds: ["deepseek"],
    });
    expect(result.profiles).toEqual([existing]);
    expect(harness.profiles.create).not.toHaveBeenCalled();
    expect(harness.secrets.clear).not.toHaveBeenCalled();
  });

  it("ignores archived, foreign and malformed legacy profile markers", async () => {
    const valid = profile(
      {
        profile: {
          platformId: "codex",
          name: "DeepSeek",
          providerKind: "openai-compatible",
          protocol: "chat",
          endpoint: null,
          config: { legacyProviderId: "deepseek" },
          source: "native-import",
        },
        modelMappings: [],
      },
      "valid-profile",
    );
    vi.mocked(harness.profiles.list).mockResolvedValue([
      { ...valid, platformId: "claude" },
      { ...valid, id: "archived", archived: true },
      {
        ...valid,
        id: "malformed",
        config: { legacyProviderId: "../deepseek" },
      },
      valid,
      { ...valid, id: "duplicate" },
    ]);

    const next = await harness.service.preview("codex");
    expect(next.candidates[0]?.alreadyMigrated).toBe(true);
  });
});
