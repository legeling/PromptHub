import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentProviderModelMapping,
  AgentProviderProfile,
  CreateAgentProviderModelMappingInput,
  CreateAgentProviderProfileInput,
  UpdateAgentProviderProfileInput,
} from "@prompthub/shared";

import {
  AgentProviderProfileService,
  type AgentProviderProfileServiceStorage,
  type AgentProviderProfileServiceSecretStore,
} from "../../../src/main/services/agent-provider-profile-service";

const PROFILE_INPUT: Omit<CreateAgentProviderProfileInput, "secretRef"> = {
  platformId: "claude",
  name: "Work",
  providerKind: "anthropic-compatible",
  protocol: "messages",
  endpoint: "https://example.com",
  config: { timeoutMs: 30_000 },
  source: "manual",
};

const MAPPINGS: CreateAgentProviderModelMappingInput[] = [
  {
    routeKey: "primary",
    modelId: "claude-sonnet-4",
    parameters: {},
  },
];

function profile(
  overrides: Partial<AgentProviderProfile> = {},
): AgentProviderProfile {
  return {
    id: "profile-1",
    platformId: "claude",
    name: "Work",
    providerKind: "anthropic-compatible",
    protocol: "messages",
    endpoint: "https://example.com",
    config: { timeoutMs: 30_000 },
    secretRef: null,
    source: "manual",
    archived: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function mapping(
  overrides: Partial<AgentProviderModelMapping> = {},
): AgentProviderModelMapping {
  return {
    id: "mapping-1",
    providerProfileId: "profile-1",
    routeKey: "primary",
    modelId: "claude-sonnet-4",
    parameters: {},
    ...overrides,
  };
}

interface Harness {
  service: AgentProviderProfileService;
  storage: AgentProviderProfileServiceStorage;
  secrets: AgentProviderProfileServiceSecretStore;
}

function createHarness(): Harness {
  const storage: AgentProviderProfileServiceStorage = {
    createProfileWithMappings: vi.fn(() => profile()),
    getProfileById: vi.fn(() => profile()),
    listProfiles: vi.fn(() => []),
    listModelMappings: vi.fn(() => [mapping()]),
    listModelMappingsForProfiles: vi.fn(() => []),
    updateProfileWithMappings: vi.fn((_id, input) =>
      profile({
        ...input,
        updatedAt: 2,
      }),
    ),
    archiveProfile: vi.fn(() => profile({ archived: true, updatedAt: 2 })),
    deleteProfile: vi.fn(() => true),
  };
  const secrets: AgentProviderProfileServiceSecretStore = {
    read: vi.fn(async () => null),
    write: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
    hasMany: vi.fn(async () => new Set<string>()),
  };
  return {
    service: new AgentProviderProfileService(storage, secrets),
    storage,
    secrets,
  };
}

describe("AgentProviderProfileService", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  it("rejects unsupported profile writes before persistence or secret access", async () => {
    await expect(
      harness.service.create({
        profile: { ...PROFILE_INPUT, platformId: "kimi" },
        modelMappings: MAPPINGS,
      }),
    ).rejects.toThrow("AGENT_PROVIDER_ADAPTER_UNSUPPORTED");
    vi.mocked(harness.storage.getProfileById).mockReturnValue(
      profile({ platformId: "kimi" }),
    );
    await expect(
      harness.service.update({
        id: "profile-1",
        expectedUpdatedAt: 1,
        profile: { name: "Changed" },
        secretAction: "preserve",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_ADAPTER_UNSUPPORTED");
    expect(harness.storage.createProfileWithMappings).not.toHaveBeenCalled();
    expect(harness.storage.updateProfileWithMappings).not.toHaveBeenCalled();
    expect(harness.secrets.read).not.toHaveBeenCalled();
    expect(harness.secrets.write).not.toHaveBeenCalled();
  });

  it("lists public records with one bounded secret lookup and never exposes refs", async () => {
    vi.mocked(harness.storage.listProfiles).mockReturnValue([
      profile({
        id: "profile-1",
        secretRef: "agent-provider:profile-1",
      }),
      profile({
        id: "profile-2",
        name: "Personal",
        secretRef: "agent-provider:profile-2",
      }),
      profile({ id: "profile-3", name: "No key" }),
    ]);
    vi.mocked(harness.storage.listModelMappingsForProfiles).mockReturnValue([
      mapping({
        id: "mapping-profile-1",
        providerProfileId: "profile-1",
      }),
      mapping({
        id: "mapping-profile-2",
        providerProfileId: "profile-2",
      }),
    ]);
    vi.mocked(harness.secrets.hasMany).mockResolvedValue(
      new Set(["agent-provider:profile-2"]),
    );

    const result = await harness.service.list({
      platformId: "claude",
      includeArchived: true,
    });

    expect(harness.secrets.hasMany).toHaveBeenCalledOnce();
    expect(harness.secrets.hasMany).toHaveBeenCalledWith([
      "agent-provider:profile-1",
      "agent-provider:profile-2",
    ]);
    expect(result.map((item) => item.secretState)).toEqual([
      "missing",
      "available",
      "none",
    ]);
    expect(JSON.stringify(result)).not.toContain("agent-provider:");
    expect(result[0]?.modelMappings).toEqual([
      mapping({
        id: "mapping-profile-1",
        providerProfileId: "profile-1",
      }),
    ]);
  });

  it("creates a profile with a write-only secret and returns only public state", async () => {
    vi.mocked(harness.storage.updateProfileWithMappings).mockReturnValue(
      profile({
        secretRef: "agent-provider:profile-1",
        updatedAt: 2,
      }),
    );
    vi.mocked(harness.secrets.hasMany).mockResolvedValue(
      new Set(["agent-provider:profile-1"]),
    );

    const result = await harness.service.create({
      profile: PROFILE_INPUT,
      modelMappings: MAPPINGS,
      secret: "top-secret",
    });

    expect(harness.storage.createProfileWithMappings).toHaveBeenCalledWith(
      { ...PROFILE_INPUT, secretRef: null },
      MAPPINGS,
    );
    expect(harness.secrets.write).toHaveBeenCalledWith(
      "agent-provider:profile-1",
      "top-secret",
    );
    expect(harness.storage.updateProfileWithMappings).toHaveBeenCalledWith(
      "profile-1",
      { secretRef: "agent-provider:profile-1" },
      1,
      undefined,
    );
    expect(result.secretState).toBe("available");
    expect(JSON.stringify(result)).not.toContain("top-secret");
    expect(JSON.stringify(result)).not.toContain("agent-provider:");
  });

  it("creates a profile without a secret and resolves persisted mappings", async () => {
    const result = await harness.service.create({
      profile: PROFILE_INPUT,
      modelMappings: MAPPINGS,
      secret: null,
    });

    expect(result.secretState).toBe("none");
    expect(result.modelMappings).toEqual([mapping()]);
    expect(harness.secrets.write).not.toHaveBeenCalled();
    expect(harness.storage.updateProfileWithMappings).not.toHaveBeenCalled();
  });

  it("removes the partial profile when secret persistence fails", async () => {
    vi.mocked(harness.secrets.write).mockRejectedValue(new Error("disk path"));

    await expect(
      harness.service.create({
        profile: PROFILE_INPUT,
        modelMappings: MAPPINGS,
        secret: "top-secret",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_CREATE_FAILED");

    expect(harness.storage.deleteProfile).toHaveBeenCalledWith("profile-1");
    expect(harness.secrets.clear).toHaveBeenCalledWith(
      "agent-provider:profile-1",
    );
  });

  it("reports a dedicated error if create compensation cannot finish", async () => {
    vi.mocked(harness.secrets.write).mockRejectedValue(new Error("disk path"));
    vi.mocked(harness.storage.deleteProfile).mockImplementation(() => {
      throw new Error("db locked");
    });

    await expect(
      harness.service.create({
        profile: PROFILE_INPUT,
        modelMappings: MAPPINGS,
        secret: "top-secret",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_CREATE_ROLLBACK_FAILED");
  });

  it("reports create failures before a profile exists and false cleanup results", async () => {
    vi.mocked(harness.storage.createProfileWithMappings).mockImplementationOnce(
      () => {
        throw new Error("constraint");
      },
    );
    await expect(
      harness.service.create({
        profile: PROFILE_INPUT,
        modelMappings: MAPPINGS,
      }),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_CREATE_FAILED");
    expect(harness.storage.deleteProfile).not.toHaveBeenCalled();

    vi.mocked(harness.storage.createProfileWithMappings).mockReturnValue(
      profile(),
    );
    vi.mocked(harness.secrets.write).mockRejectedValueOnce(new Error("disk"));
    vi.mocked(harness.storage.deleteProfile).mockReturnValueOnce(false);
    await expect(
      harness.service.create({
        profile: PROFILE_INPUT,
        modelMappings: MAPPINGS,
        secret: "secret",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_CREATE_ROLLBACK_FAILED");
  });

  it("preserves an existing secret while updating public fields", async () => {
    vi.mocked(harness.storage.getProfileById).mockReturnValue(profile());

    const result = await harness.service.update({
      id: " profile-1 ",
      expectedUpdatedAt: 1,
      profile: { name: "Renamed" },
      secretAction: "preserve",
    });

    expect(result.name).toBe("Renamed");
    expect(harness.secrets.write).not.toHaveBeenCalled();
    expect(harness.secrets.clear).not.toHaveBeenCalled();

    await expect(
      harness.service.update({
        id: "profile-1",
        expectedUpdatedAt: 1,
        profile: {},
        secretAction: "preserve",
        secret: "must-not-be-accepted",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_SECRET_INVALID");
  });

  it("replaces a secret and restores it if the database update fails", async () => {
    vi.mocked(harness.storage.getProfileById).mockReturnValue(
      profile({ secretRef: "agent-provider:profile-1" }),
    );
    vi.mocked(harness.secrets.read).mockResolvedValue("old-secret");
    vi.mocked(harness.storage.updateProfileWithMappings).mockImplementation(
      () => {
        throw new Error("changed externally");
      },
    );

    await expect(
      harness.service.update({
        id: "profile-1",
        expectedUpdatedAt: 1,
        profile: { name: "Renamed" },
        secretAction: "replace",
        secret: "new-secret",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_UPDATE_FAILED");

    expect(harness.secrets.write).toHaveBeenNthCalledWith(
      1,
      "agent-provider:profile-1",
      "new-secret",
    );
    expect(harness.secrets.write).toHaveBeenNthCalledWith(
      2,
      "agent-provider:profile-1",
      "old-secret",
    );
  });

  it("migrates a stored legacy ref and clears it after a successful replacement", async () => {
    vi.mocked(harness.storage.getProfileById).mockReturnValue(
      profile({ secretRef: "legacy-provider:profile-1" }),
    );
    vi.mocked(harness.secrets.read).mockResolvedValue("old-secret");
    vi.mocked(harness.storage.updateProfileWithMappings).mockReturnValue(
      profile({
        secretRef: "agent-provider:profile-1",
        updatedAt: 2,
      }),
    );

    const result = await harness.service.update({
      id: "profile-1",
      expectedUpdatedAt: 1,
      profile: {},
      secretAction: "replace",
      secret: "new-secret",
    });

    expect(result.secretState).toBe("available");
    expect(harness.secrets.clear).toHaveBeenCalledWith(
      "legacy-provider:profile-1",
    );
  });

  it("restores profile mappings and secret state when legacy cleanup fails after the database update", async () => {
    const existing = profile({ secretRef: "legacy-provider:profile-1" });
    const updated = profile({
      name: "Renamed",
      secretRef: "agent-provider:profile-1",
      updatedAt: 2,
    });
    vi.mocked(harness.storage.getProfileById).mockReturnValue(existing);
    vi.mocked(harness.storage.listModelMappings).mockReturnValue([mapping()]);
    vi.mocked(harness.secrets.read).mockResolvedValue("old-secret");
    vi.mocked(harness.storage.updateProfileWithMappings)
      .mockReturnValueOnce(updated)
      .mockReturnValueOnce(
        profile({ secretRef: existing.secretRef, updatedAt: 3 }),
      );
    vi.mocked(harness.secrets.clear)
      .mockRejectedValueOnce(new Error("legacy keychain cleanup denied"))
      .mockResolvedValue(undefined);

    await expect(
      harness.service.update({
        id: "profile-1",
        expectedUpdatedAt: 1,
        profile: { name: "Renamed" },
        secretAction: "replace",
        secret: "new-secret",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_UPDATE_FAILED");

    expect(harness.storage.updateProfileWithMappings).toHaveBeenNthCalledWith(
      2,
      "profile-1",
      expect.objectContaining({
        name: "Work",
        secretRef: "legacy-provider:profile-1",
      }),
      2,
      [
        {
          routeKey: "primary",
          modelId: "claude-sonnet-4",
          parameters: {},
        },
      ],
    );
    expect(harness.secrets.clear).toHaveBeenNthCalledWith(
      1,
      "legacy-provider:profile-1",
    );
    expect(harness.secrets.clear).toHaveBeenNthCalledWith(
      2,
      "agent-provider:profile-1",
    );
    expect(harness.secrets.write).toHaveBeenLastCalledWith(
      "legacy-provider:profile-1",
      "old-secret",
    );
  });

  it("keeps the replacement secret when database compensation fails", async () => {
    vi.mocked(harness.storage.getProfileById).mockReturnValue(
      profile({ secretRef: "legacy-provider:profile-1" }),
    );
    vi.mocked(harness.secrets.read).mockResolvedValue("old-secret");
    vi.mocked(harness.storage.updateProfileWithMappings)
      .mockReturnValueOnce(
        profile({
          secretRef: "agent-provider:profile-1",
          updatedAt: 2,
        }),
      )
      .mockImplementationOnce(() => {
        throw new Error("database rollback denied");
      });
    vi.mocked(harness.secrets.clear).mockRejectedValueOnce(
      new Error("legacy keychain cleanup denied"),
    );

    await expect(
      harness.service.update({
        id: "profile-1",
        expectedUpdatedAt: 1,
        profile: {},
        secretAction: "replace",
        secret: "new-secret",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_UPDATE_ROLLBACK_FAILED");

    expect(harness.secrets.clear).toHaveBeenCalledTimes(1);
    expect(harness.secrets.clear).toHaveBeenCalledWith(
      "legacy-provider:profile-1",
    );
    expect(harness.secrets.write).toHaveBeenCalledTimes(1);
    expect(harness.secrets.write).toHaveBeenCalledWith(
      "agent-provider:profile-1",
      "new-secret",
    );
  });

  it("restores a legacy ref after a failed replacement and reports restore failures", async () => {
    vi.mocked(harness.storage.getProfileById).mockReturnValue(
      profile({ secretRef: "legacy-provider:profile-1" }),
    );
    vi.mocked(harness.secrets.read).mockResolvedValue("old-secret");
    vi.mocked(harness.storage.updateProfileWithMappings).mockImplementation(
      () => {
        throw new Error("db");
      },
    );

    await expect(
      harness.service.update({
        id: "profile-1",
        expectedUpdatedAt: 1,
        profile: {},
        secretAction: "replace",
        secret: "new-secret",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_UPDATE_FAILED");
    expect(harness.secrets.clear).toHaveBeenCalledWith(
      "agent-provider:profile-1",
    );
    expect(harness.secrets.write).toHaveBeenLastCalledWith(
      "legacy-provider:profile-1",
      "old-secret",
    );

    vi.clearAllMocks();
    vi.mocked(harness.storage.getProfileById).mockReturnValue(profile());
    vi.mocked(harness.storage.listModelMappings).mockReturnValue([mapping()]);
    vi.mocked(harness.secrets.read).mockResolvedValue(null);
    vi.mocked(harness.storage.updateProfileWithMappings).mockImplementation(
      () => {
        throw new Error("db");
      },
    );
    vi.mocked(harness.secrets.clear).mockRejectedValue(new Error("denied"));
    await expect(
      harness.service.update({
        id: "profile-1",
        expectedUpdatedAt: 1,
        profile: {},
        secretAction: "replace",
        secret: "new-secret",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_UPDATE_ROLLBACK_FAILED");
  });

  it("clears a managed secret only after the database reference is removed", async () => {
    vi.mocked(harness.storage.getProfileById).mockReturnValue(
      profile({ secretRef: "agent-provider:profile-1" }),
    );
    vi.mocked(harness.secrets.read).mockResolvedValue("old-secret");
    vi.mocked(harness.storage.updateProfileWithMappings).mockReturnValue(
      profile({ secretRef: null, updatedAt: 2 }),
    );

    const result = await harness.service.update({
      id: "profile-1",
      expectedUpdatedAt: 1,
      profile: { name: "Renamed" },
      secretAction: "clear",
      modelMappings: MAPPINGS,
    });

    expect(harness.storage.updateProfileWithMappings).toHaveBeenCalledWith(
      "profile-1",
      { name: "Renamed", secretRef: null },
      1,
      MAPPINGS,
    );
    expect(harness.secrets.clear).toHaveBeenCalledWith(
      "agent-provider:profile-1",
    );
    expect(result.secretState).toBe("none");
  });

  it("handles clear without a prior ref and classifies update failures", async () => {
    vi.mocked(harness.storage.getProfileById).mockReturnValue(profile());
    const result = await harness.service.update({
      id: "profile-1",
      expectedUpdatedAt: 1,
      profile: {},
      secretAction: "clear",
    });
    expect(result.secretState).toBe("none");
    expect(harness.secrets.clear).not.toHaveBeenCalled();

    vi.mocked(harness.storage.updateProfileWithMappings).mockImplementation(
      () => {
        throw new Error("stale");
      },
    );
    await expect(
      harness.service.update({
        id: "profile-1",
        expectedUpdatedAt: 1,
        profile: {},
        secretAction: "clear",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_UPDATE_FAILED");

    await expect(
      harness.service.update({
        id: "profile-1",
        expectedUpdatedAt: 1,
        profile: {},
        secretAction: "clear",
        secret: "unexpected",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_SECRET_INVALID");
  });

  it("restores the database reference when clearing the secret fails", async () => {
    vi.mocked(harness.storage.getProfileById)
      .mockReturnValueOnce(
        profile({ secretRef: "agent-provider:profile-1", updatedAt: 1 }),
      )
      .mockReturnValue(profile({ secretRef: null, updatedAt: 2 }));
    vi.mocked(harness.secrets.read).mockResolvedValue("old-secret");
    vi.mocked(harness.secrets.clear).mockRejectedValue(new Error("denied"));
    vi.mocked(harness.storage.updateProfileWithMappings)
      .mockReturnValueOnce(profile({ secretRef: null, updatedAt: 2 }))
      .mockReturnValueOnce(
        profile({
          secretRef: "agent-provider:profile-1",
          updatedAt: 3,
        }),
      );

    await expect(
      harness.service.update({
        id: "profile-1",
        expectedUpdatedAt: 1,
        profile: {},
        secretAction: "clear",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_UPDATE_FAILED");

    expect(harness.storage.updateProfileWithMappings).toHaveBeenNthCalledWith(
      2,
      "profile-1",
      {
        name: "Work",
        providerKind: "anthropic-compatible",
        protocol: "messages",
        endpoint: "https://example.com",
        config: { timeoutMs: 30_000 },
        secretRef: "agent-provider:profile-1",
        source: "manual",
      },
      2,
      MAPPINGS,
    );
  });

  it("reports a dedicated error when clear compensation cannot restore the profile", async () => {
    vi.mocked(harness.storage.getProfileById).mockReturnValue(
      profile({ secretRef: "agent-provider:profile-1" }),
    );
    vi.mocked(harness.secrets.read).mockResolvedValue("old-secret");
    vi.mocked(harness.secrets.clear).mockRejectedValue(new Error("denied"));
    vi.mocked(harness.storage.updateProfileWithMappings)
      .mockReturnValueOnce(profile({ secretRef: null, updatedAt: 2 }))
      .mockImplementationOnce(() => {
        throw new Error("db locked");
      });

    await expect(
      harness.service.update({
        id: "profile-1",
        expectedUpdatedAt: 1,
        profile: {},
        secretAction: "clear",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_UPDATE_ROLLBACK_FAILED");
  });

  it("archives without touching the managed secret", async () => {
    vi.mocked(harness.storage.getProfileById).mockReturnValue(
      profile({ secretRef: "agent-provider:profile-1" }),
    );
    vi.mocked(harness.storage.archiveProfile).mockReturnValue(
      profile({
        secretRef: "agent-provider:profile-1",
        archived: true,
        updatedAt: 2,
      }),
    );

    const result = await harness.service.archive("profile-1", 1);

    expect(result.archived).toBe(true);
    expect(harness.secrets.write).not.toHaveBeenCalled();
    expect(harness.secrets.clear).not.toHaveBeenCalled();
  });

  it("duplicates public configuration and mappings without copying credentials", async () => {
    vi.mocked(harness.storage.getProfileById).mockReturnValue(
      profile({ secretRef: "agent-provider:profile-1" }),
    );
    vi.mocked(harness.storage.createProfileWithMappings).mockReturnValue(
      profile({
        id: "profile-2",
        name: "Work Copy",
        source: "manual",
      }),
    );
    vi.mocked(harness.storage.listModelMappings).mockImplementation((id) =>
      id === "profile-1"
        ? [mapping()]
        : [
            mapping({
              id: "mapping-2",
              providerProfileId: "profile-2",
            }),
          ],
    );

    const result = await harness.service.duplicate("profile-1", " Work Copy ");

    expect(harness.storage.createProfileWithMappings).toHaveBeenCalledWith(
      {
        platformId: "claude",
        name: "Work Copy",
        providerKind: "anthropic-compatible",
        protocol: "messages",
        endpoint: "https://example.com",
        config: { timeoutMs: 30_000 },
        secretRef: null,
        source: "manual",
      },
      MAPPINGS,
    );
    expect(result.id).toBe("profile-2");
    expect(result.secretState).toBe("none");
    expect(harness.secrets.read).not.toHaveBeenCalled();
    expect(harness.secrets.write).not.toHaveBeenCalled();
  });

  it("exports a versioned public document with a missing-secret requirement", () => {
    vi.mocked(harness.storage.getProfileById).mockReturnValue(
      profile({ secretRef: "agent-provider:profile-1" }),
    );

    const exported = harness.service.export("profile-1");

    expect(exported).toEqual({
      version: 1,
      profile: PROFILE_INPUT,
      modelMappings: MAPPINGS,
      requiresSecret: true,
    });
    expect(JSON.stringify(exported)).not.toContain("agent-provider:");
  });

  it("rejects duplicate and export requests for missing profiles", async () => {
    vi.mocked(harness.storage.getProfileById).mockReturnValue(null);

    await expect(
      harness.service.duplicate("profile-1", "Copy"),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_NOT_FOUND");
    expect(() => harness.service.export("profile-1")).toThrow(
      "AGENT_PROVIDER_PROFILE_NOT_FOUND",
    );
  });

  it("deletes only after clearing the secret and restores it on database failure", async () => {
    vi.mocked(harness.storage.getProfileById).mockReturnValue(
      profile({ secretRef: "agent-provider:profile-1" }),
    );
    vi.mocked(harness.secrets.read).mockResolvedValue("old-secret");
    vi.mocked(harness.storage.deleteProfile).mockReturnValue(false);

    await expect(harness.service.delete("profile-1")).rejects.toThrow(
      "AGENT_PROVIDER_PROFILE_DELETE_FAILED",
    );

    expect(
      vi.mocked(harness.secrets.clear).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(harness.storage.deleteProfile).mock.invocationCallOrder[0]!,
    );
    expect(harness.secrets.write).toHaveBeenLastCalledWith(
      "agent-provider:profile-1",
      "old-secret",
    );
  });

  it("deletes a profile without a secret and rejects missing profiles", async () => {
    vi.mocked(harness.storage.getProfileById).mockReturnValue(profile());
    await expect(harness.service.delete("profile-1")).resolves.toBeUndefined();
    expect(harness.secrets.read).not.toHaveBeenCalled();
    expect(harness.secrets.clear).not.toHaveBeenCalled();

    vi.mocked(harness.storage.getProfileById).mockReturnValue(null);
    await expect(harness.service.delete("profile-1")).rejects.toThrow(
      "AGENT_PROVIDER_PROFILE_NOT_FOUND",
    );
  });

  it("reports a dedicated error when delete compensation cannot restore a secret", async () => {
    vi.mocked(harness.storage.getProfileById).mockReturnValue(
      profile({ secretRef: "agent-provider:profile-1" }),
    );
    vi.mocked(harness.secrets.read).mockResolvedValue("old-secret");
    vi.mocked(harness.storage.deleteProfile).mockReturnValue(false);
    vi.mocked(harness.secrets.write).mockRejectedValue(new Error("disk full"));

    await expect(harness.service.delete("profile-1")).rejects.toThrow(
      "AGENT_PROVIDER_PROFILE_DELETE_ROLLBACK_FAILED",
    );
  });

  it("rejects arbitrary secret references and malformed secret actions", async () => {
    await expect(
      harness.service.create({
        profile: {
          ...PROFILE_INPUT,
          secretRef: "renderer-controlled",
        } as typeof PROFILE_INPUT,
        modelMappings: MAPPINGS,
      }),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_INPUT_INVALID");

    await expect(
      harness.service.update({
        id: "profile-1",
        expectedUpdatedAt: 1,
        profile: {},
        secretAction: "replace",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_SECRET_INVALID");

    await expect(
      harness.service.update({
        id: "profile-1",
        expectedUpdatedAt: 1,
        profile: {},
        secretAction: "invalid",
      } as never),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_SECRET_INVALID");
    vi.mocked(harness.storage.getProfileById).mockReturnValue(null);
    await expect(
      harness.service.update({
        id: "profile-1",
        expectedUpdatedAt: 1,
        profile: {},
        secretAction: "preserve",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_NOT_FOUND");
  });

  it("rejects malformed profile records, ids, and optimistic timestamps", async () => {
    await expect(
      harness.service.create({
        profile: [] as never,
        modelMappings: [],
      }),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_INPUT_INVALID");
    await expect(
      harness.service.create({
        profile: Object.create(Date.prototype) as typeof PROFILE_INPUT,
        modelMappings: [],
      }),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_INPUT_INVALID");
    await expect(harness.service.delete("")).rejects.toThrow(
      "AGENT_PROVIDER_PROFILE_INPUT_INVALID",
    );
    await expect(harness.service.archive("profile-1", -1)).rejects.toThrow(
      "AGENT_PROVIDER_PROFILE_INPUT_INVALID",
    );
    await expect(harness.service.archive("profile-1", 1.5)).rejects.toThrow(
      "AGENT_PROVIDER_PROFILE_INPUT_INVALID",
    );
    await expect(
      harness.service.archive("profile-1", Number.POSITIVE_INFINITY),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_INPUT_INVALID");
  });
});
