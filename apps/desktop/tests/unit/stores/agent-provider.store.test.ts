import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentProviderActivationPlan,
  AgentProviderActivationExecutionResult,
  AgentProviderConnectionTestResult,
  AgentProviderImportPreview,
  AgentProviderModelTestResult,
  AgentProviderProfilePublic,
} from "@prompthub/shared";

import { installWindowMocks } from "../../helpers/window";
import { useAgentProviderStore } from "../../../src/renderer/stores/agent-provider.store";

const profile: AgentProviderProfilePublic = {
  id: "profile-1",
  platformId: "codex",
  name: "Work",
  providerKind: "platform-native",
  protocol: "platform-native",
  endpoint: null,
  config: {},
  source: "manual",
  archived: false,
  createdAt: 1,
  updatedAt: 2,
  modelMappings: [
    {
      id: "mapping-1",
      providerProfileId: "profile-1",
      routeKey: "primary",
      modelId: "gpt-5.4",
      parameters: {},
    },
  ],
  secretState: "none",
};

const importPreview: AgentProviderImportPreview = {
  state: {
    platformId: "codex",
    adapterVersion: "model-profile-v1",
    nativeDigest: "digest-current",
    values: { model: "gpt-5.4" },
  },
  profile: {
    platformId: "codex",
    name: "Native",
    providerKind: "platform-native",
    protocol: "platform-native",
    endpoint: null,
    config: {},
    secretRef: null,
    source: "native-import",
  },
  modelMappings: [{ routeKey: "primary", modelId: "gpt-5.4", parameters: {} }],
  warnings: [],
};

const activationPlan: AgentProviderActivationPlan = {
  platformId: "codex",
  profileId: "profile-1",
  adapterVersion: "model-profile-v1",
  currentDigest: "digest-current",
  status: "conflict",
  decisions: [
    {
      field: "model",
      status: "conflict",
      current: "gpt-5.5",
      desired: "gpt-5.4",
    },
  ],
  canApply: false,
  requiresReview: true,
  blockedReasons: [],
};

function resetStore() {
  useAgentProviderStore.setState({
    platformId: null,
    profiles: [],
    selectedProfileId: null,
    importPreview: null,
    activationPlan: null,
    activationResult: null,
    connectionResult: null,
    modelTestResult: null,
    modelTestRequestId: null,
    currentState: null,
    busyAction: null,
    errorCode: null,
  });
}

describe("Agent Provider renderer store", () => {
  beforeEach(() => {
    installWindowMocks();
    resetStore();
  });

  it("loads profiles and ignores a stale prior platform response", async () => {
    let resolveCodex!: (profiles: AgentProviderProfilePublic[]) => void;
    window.api.agent.listProviderProfiles = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<AgentProviderProfilePublic[]>((resolve) => {
            resolveCodex = resolve;
          }),
      )
      .mockResolvedValueOnce([
        { ...profile, id: "claude-1", platformId: "claude" },
      ]);

    const codexLoad = useAgentProviderStore.getState().load("codex");
    await useAgentProviderStore.getState().load("claude");
    resolveCodex([profile]);
    await codexLoad;

    expect(useAgentProviderStore.getState()).toMatchObject({
      platformId: "claude",
      selectedProfileId: "claude-1",
      profiles: [{ id: "claude-1", platformId: "claude" }],
      busyAction: null,
    });

    window.api.agent.listProviderProfiles = vi.fn().mockResolvedValue([]);
    await useAgentProviderStore.getState().load("empty");
    expect(useAgentProviderStore.getState().selectedProfileId).toBeNull();
  });

  it("loads verified current state with profiles and ignores stale platform state", async () => {
    let resolveCodexState!: (state: {
      platformId: string;
      status: "verified";
      currentProfileId: string;
      checkedAt: number;
    }) => void;
    window.api.agent.getProviderCurrentState = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveCodexState = resolve;
          }),
      )
      .mockResolvedValueOnce({
        platformId: "claude",
        status: "none",
        currentProfileId: null,
        checkedAt: 2,
      });
    window.api.agent.listProviderProfiles = vi
      .fn()
      .mockResolvedValueOnce([profile])
      .mockResolvedValueOnce([
        { ...profile, id: "claude-1", platformId: "claude" },
      ]);

    const codexLoad = useAgentProviderStore.getState().load("codex");
    await useAgentProviderStore.getState().load("claude");
    resolveCodexState({
      platformId: "codex",
      status: "verified",
      currentProfileId: "profile-1",
      checkedAt: 1,
    });
    await codexLoad;

    expect(useAgentProviderStore.getState()).toMatchObject({
      platformId: "claude",
      currentState: {
        platformId: "claude",
        status: "none",
        currentProfileId: null,
      },
    });
  });

  it("keeps profiles available when current native state cannot be read", async () => {
    window.api.agent.listProviderProfiles = vi
      .fn()
      .mockResolvedValue([profile]);
    window.api.agent.getProviderCurrentState = vi
      .fn()
      .mockRejectedValue(new Error("native path token=secret"));

    await useAgentProviderStore.getState().load("codex");

    expect(useAgentProviderStore.getState()).toMatchObject({
      platformId: "codex",
      profiles: [{ id: "profile-1" }],
      currentState: null,
      busyAction: null,
      errorCode: null,
    });
  });

  it("tests the selected profile and stores only the redacted result", async () => {
    const result: AgentProviderConnectionTestResult = {
      platformId: "codex",
      profileId: "profile-1",
      protocol: "responses",
      endpointOrigin: "https://gateway.example.com",
      model: "gpt-5.4",
      status: "ok",
      startedAt: 10,
      finishedAt: 20,
      totalMs: 10,
      retryCount: 0,
      modelCount: 2,
      modelAvailable: true,
    };
    window.api.agent.testProviderConnection = vi.fn().mockResolvedValue(result);

    await expect(
      useAgentProviderStore.getState().testConnection("codex", "profile-1"),
    ).resolves.toEqual(result);
    expect(window.api.agent.testProviderConnection).toHaveBeenCalledWith({
      agentId: "codex",
      profileId: "profile-1",
    });
    expect(useAgentProviderStore.getState()).toMatchObject({
      busyAction: null,
      connectionResult: result,
      errorCode: null,
    });

    window.api.agent.testProviderConnection = vi
      .fn()
      .mockRejectedValue(new Error("credential secret"));
    await expect(
      useAgentProviderStore.getState().testConnection("codex", "profile-1"),
    ).resolves.toBeNull();
    expect(useAgentProviderStore.getState()).toMatchObject({
      busyAction: null,
      errorCode: "AGENT_PROVIDER_OPERATION_FAILED",
    });
  });

  it("runs and cancels an explicit model test by its scoped request id", async () => {
    const result: AgentProviderModelTestResult = {
      platformId: "codex",
      profileId: "profile-1",
      protocol: "responses",
      endpointOrigin: "https://gateway.example.com",
      model: "gpt-5.4",
      status: "cancelled",
      startedAt: 10,
      finishedAt: 20,
      totalMs: 10,
      firstTokenMs: null,
      retryCount: 0,
      inputTokens: null,
      outputTokens: null,
      outputPreview: null,
    };
    let finishModelTest:
      | ((value: AgentProviderModelTestResult) => void)
      | null = null;
    window.api.agent.testProviderModel = vi.fn(
      () =>
        new Promise<AgentProviderModelTestResult>((resolve) => {
          finishModelTest = resolve;
        }),
    );
    window.api.agent.cancelProviderModelTest = vi.fn(async () => {
      finishModelTest?.(result);
      return true;
    });

    const running = useAgentProviderStore
      .getState()
      .testModel("codex", "profile-1");
    await vi.waitFor(() =>
      expect(window.api.agent.testProviderModel).toHaveBeenCalled(),
    );
    const request = vi.mocked(window.api.agent.testProviderModel).mock
      .calls[0]?.[0];
    expect(request).toMatchObject({
      agentId: "codex",
      profileId: "profile-1",
    });
    expect(request?.requestId).toMatch(/^model-test-/);

    await expect(
      useAgentProviderStore.getState().cancelModelTest(),
    ).resolves.toBe(true);
    await expect(running).resolves.toEqual(result);
    expect(window.api.agent.cancelProviderModelTest).toHaveBeenCalledWith({
      requestId: request?.requestId,
    });
    expect(useAgentProviderStore.getState()).toMatchObject({
      busyAction: null,
      modelTestRequestId: null,
      modelTestResult: result,
      errorCode: null,
    });
  });

  it("cancels an in-flight model test when the selected profile changes", async () => {
    const cancelled: AgentProviderModelTestResult = {
      platformId: "codex",
      profileId: "profile-1",
      protocol: "responses",
      endpointOrigin: "https://gateway.example.com",
      model: "gpt-5.4",
      status: "cancelled",
      startedAt: 10,
      finishedAt: 11,
      totalMs: 1,
      firstTokenMs: null,
      retryCount: 0,
      inputTokens: null,
      outputTokens: null,
      outputPreview: null,
    };
    let finish: ((value: AgentProviderModelTestResult) => void) | undefined;
    window.api.agent.testProviderModel = vi.fn(
      () =>
        new Promise<AgentProviderModelTestResult>((resolve) => {
          finish = resolve;
        }),
    );
    window.api.agent.cancelProviderModelTest = vi.fn(async () => {
      finish?.(cancelled);
      return true;
    });

    const running = useAgentProviderStore
      .getState()
      .testModel("codex", "profile-1");
    await vi.waitFor(() =>
      expect(window.api.agent.testProviderModel).toHaveBeenCalled(),
    );
    const requestId = useAgentProviderStore.getState().modelTestRequestId;
    useAgentProviderStore.getState().select("profile-2");

    await vi.waitFor(() =>
      expect(window.api.agent.cancelProviderModelTest).toHaveBeenCalledWith({
        requestId,
      }),
    );
    await expect(running).resolves.toBeNull();
    expect(useAgentProviderStore.getState()).toMatchObject({
      selectedProfileId: "profile-2",
      busyAction: null,
      modelTestRequestId: null,
      modelTestResult: null,
    });
  });

  it("creates, updates, archives, duplicates, and deletes profiles", async () => {
    const archived = { ...profile, archived: true, updatedAt: 3 };
    const duplicate = {
      ...profile,
      id: "profile-2",
      name: "Work Copy",
      updatedAt: 4,
    };
    window.api.agent.createProviderProfile = vi.fn().mockResolvedValue(profile);
    window.api.agent.updateProviderProfile = vi
      .fn()
      .mockResolvedValue({ ...profile, name: "Renamed", updatedAt: 3 });
    window.api.agent.archiveProviderProfile = vi
      .fn()
      .mockResolvedValue(archived);
    window.api.agent.duplicateProviderProfile = vi
      .fn()
      .mockResolvedValue(duplicate);
    window.api.agent.deleteProviderProfile = vi
      .fn()
      .mockResolvedValue(undefined);

    await useAgentProviderStore.getState().createProfile({
      profile: {
        platformId: "codex",
        name: "Work",
        providerKind: "platform-native",
        protocol: "platform-native",
        config: {},
        source: "manual",
      },
      modelMappings: [],
    });
    await useAgentProviderStore.getState().updateProfile({
      id: "profile-1",
      expectedUpdatedAt: 2,
      profile: { name: "Renamed" },
      secretAction: "preserve",
    });
    await useAgentProviderStore.getState().archiveProfile("profile-1", 3);
    await useAgentProviderStore
      .getState()
      .duplicateProfile("profile-1", "Work Copy");
    await useAgentProviderStore.getState().deleteProfile("profile-2");

    expect(window.api.agent.archiveProviderProfile).toHaveBeenCalledWith(
      "profile-1",
      3,
    );
    expect(useAgentProviderStore.getState()).toMatchObject({
      profiles: [archived],
      selectedProfileId: "profile-1",
      busyAction: null,
      errorCode: null,
    });

    useAgentProviderStore.setState({
      profiles: [
        { ...profile, id: "first", name: "Zed", updatedAt: 1 },
        { ...profile, id: "second", name: "Alpha", updatedAt: 1 },
        { ...profile, id: "archived", archived: true, updatedAt: 10 },
      ],
      selectedProfileId: "first",
    });
    window.api.agent.archiveProviderProfile = vi
      .fn()
      .mockResolvedValue({ ...profile, id: "first", archived: true });
    await useAgentProviderStore.getState().archiveProfile("first", 1);
    expect(useAgentProviderStore.getState().selectedProfileId).toBe("second");

    useAgentProviderStore.getState().select("second");
    expect(useAgentProviderStore.getState()).toMatchObject({
      selectedProfileId: "second",
      activationPlan: null,
      activationResult: null,
      errorCode: null,
    });
    window.api.agent.deleteProviderProfile = vi
      .fn()
      .mockResolvedValue(undefined);
    await useAgentProviderStore.getState().deleteProfile("archived");
    expect(useAgentProviderStore.getState().selectedProfileId).toBe("second");
    await useAgentProviderStore.getState().deleteProfile("second");
    expect(useAgentProviderStore.getState().selectedProfileId).toBe("first");

    useAgentProviderStore.setState({
      profiles: [{ ...profile, id: "alpha", name: "Alpha", updatedAt: 1 }],
      selectedProfileId: "alpha",
    });
    window.api.agent.createProviderProfile = vi
      .fn()
      .mockResolvedValue({ ...profile, id: "zed", name: "Zed", updatedAt: 1 });
    await useAgentProviderStore.getState().createProfile({
      profile: {
        platformId: "codex",
        name: "Zed",
        providerKind: "platform-native",
        protocol: "platform-native",
        config: {},
        source: "manual",
      },
      modelMappings: [],
    });
    expect(
      useAgentProviderStore.getState().profiles.map(({ id }) => id),
    ).toEqual(["alpha", "zed"]);

    window.api.agent.archiveProviderProfile = vi
      .fn()
      .mockResolvedValue({ ...profile, id: "alpha", archived: true });
    await useAgentProviderStore.getState().archiveProfile("alpha", 1);
    expect(useAgentProviderStore.getState().selectedProfileId).toBe("zed");
    window.api.agent.archiveProviderProfile = vi
      .fn()
      .mockResolvedValue({ ...profile, id: "alpha", archived: true });
    await useAgentProviderStore.getState().archiveProfile("alpha", 2);
    expect(useAgentProviderStore.getState().selectedProfileId).toBe("zed");

    useAgentProviderStore.setState({
      profiles: [{ ...profile, id: "only" }],
      selectedProfileId: "only",
    });
    await useAgentProviderStore.getState().deleteProfile("only");
    expect(useAgentProviderStore.getState().selectedProfileId).toBeNull();
  });

  it("previews and explicitly adopts current native state without a secret ref", async () => {
    window.api.agent.importCurrentProvider = vi
      .fn()
      .mockResolvedValue(importPreview);
    window.api.agent.createProviderProfile = vi.fn().mockResolvedValue(profile);

    await expect(
      useAgentProviderStore.getState().importCurrent("codex"),
    ).resolves.toEqual(importPreview);
    await expect(
      useAgentProviderStore.getState().adoptImport(),
    ).resolves.toEqual(profile);

    expect(window.api.agent.createProviderProfile).toHaveBeenCalledWith({
      profile: {
        platformId: "codex",
        name: "Native",
        providerKind: "platform-native",
        protocol: "platform-native",
        endpoint: null,
        config: {},
        source: "native-import",
      },
      modelMappings: importPreview.modelMappings,
    });
    expect(
      JSON.stringify(
        vi.mocked(window.api.agent.createProviderProfile).mock.calls,
      ),
    ).not.toContain("secretRef");
  });

  it("creates or reuses the official Profile and opens activation review", async () => {
    const official = {
      ...profile,
      id: "official-1",
      name: "OpenAI Official",
      providerKind: "openai",
      config: { providerId: "openai" },
    };
    const officialPlan = {
      ...activationPlan,
      profileId: "official-1",
      status: "apply" as const,
      canApply: true,
      requiresReview: false,
    };
    window.api.agent.ensureOfficialProviderProfile = vi
      .fn()
      .mockResolvedValue(official);
    window.api.agent.previewProviderActivation = vi
      .fn()
      .mockResolvedValue(officialPlan);
    useAgentProviderStore.setState({ platformId: "codex" });

    await expect(
      useAgentProviderStore.getState().restoreOfficial("codex"),
    ).resolves.toEqual(officialPlan);

    expect(window.api.agent.ensureOfficialProviderProfile).toHaveBeenCalledWith(
      "codex",
    );
    expect(window.api.agent.previewProviderActivation).toHaveBeenCalledWith({
      agentId: "codex",
      profileId: "official-1",
    });
    expect(useAgentProviderStore.getState()).toMatchObject({
      selectedProfileId: "official-1",
      activationPlan: { profileId: "official-1" },
      busyAction: null,
      errorCode: null,
    });
  });

  it("exports only the public portable profile envelope", async () => {
    const exported = {
      version: 1 as const,
      profile: {
        platformId: "codex",
        name: "Work",
        providerKind: "platform-native",
        protocol: "platform-native",
        endpoint: null,
        config: {},
        source: "manual" as const,
      },
      modelMappings: [],
      requiresSecret: false,
    };
    window.api.agent.exportProviderProfile = vi
      .fn()
      .mockResolvedValue(exported);

    await expect(
      useAgentProviderStore.getState().exportProfile("profile-1"),
    ).resolves.toEqual(exported);
    expect(useAgentProviderStore.getState()).toMatchObject({
      busyAction: null,
      errorCode: null,
    });
  });

  it("activates only the reviewed digest and preserves field resolutions", async () => {
    window.api.agent.previewProviderActivation = vi
      .fn()
      .mockResolvedValue(activationPlan);
    window.api.agent.activateProvider = vi.fn().mockResolvedValue({
      status: "verified",
      plan: {
        ...activationPlan,
        status: "apply",
        canApply: true,
        requiresReview: false,
      },
      verification: {
        verified: true,
        nativeDigest: "digest-after",
        state: {
          platformId: "codex",
          adapterVersion: "model-profile-v1",
          nativeDigest: "digest-after",
          values: { model: "gpt-5.4" },
        },
      },
      rollback: null,
    });
    window.api.agent.getProviderCurrentState = vi.fn().mockResolvedValue({
      platformId: "codex",
      status: "verified",
      currentProfileId: "profile-1",
      checkedAt: 3,
    });

    await useAgentProviderStore
      .getState()
      .previewActivation("codex", "profile-1");
    await useAgentProviderStore
      .getState()
      .activatePreview("codex", [{ field: "model", action: "use-profile" }]);

    expect(window.api.agent.activateProvider).toHaveBeenCalledWith({
      agentId: "codex",
      profileId: "profile-1",
      expectedCurrentDigest: "digest-current",
      resolutions: [{ field: "model", action: "use-profile" }],
    });
    expect(useAgentProviderStore.getState().activationResult?.status).toBe(
      "verified",
    );
    expect(window.api.agent.getProviderCurrentState).toHaveBeenCalledWith(
      "codex",
    );
    expect(useAgentProviderStore.getState().currentState).toMatchObject({
      status: "verified",
      currentProfileId: "profile-1",
    });

    useAgentProviderStore.setState({ activationPlan });
    await useAgentProviderStore.getState().activatePreview("codex");
    expect(window.api.agent.activateProvider).toHaveBeenLastCalledWith({
      agentId: "codex",
      profileId: "profile-1",
      expectedCurrentDigest: "digest-current",
    });
  });

  it("refreshes verified current state after archiving or deleting it", async () => {
    const archived = { ...profile, archived: true, updatedAt: 3 };
    window.api.agent.archiveProviderProfile = vi
      .fn()
      .mockResolvedValue(archived);
    window.api.agent.deleteProviderProfile = vi
      .fn()
      .mockResolvedValue(undefined);
    window.api.agent.getProviderCurrentState = vi
      .fn()
      .mockResolvedValueOnce({
        platformId: "codex",
        status: "stale",
        currentProfileId: null,
        checkedAt: 4,
      })
      .mockResolvedValueOnce({
        platformId: "codex",
        status: "none",
        currentProfileId: null,
        checkedAt: 5,
      });
    useAgentProviderStore.setState({
      platformId: "codex",
      profiles: [profile],
      selectedProfileId: "profile-1",
      currentState: {
        nativeConfig: null,
        platformId: "codex",
        status: "verified",
        currentProfileId: "profile-1",
        checkedAt: 3,
      },
    });

    await useAgentProviderStore
      .getState()
      .archiveProfile("profile-1", profile.updatedAt);
    expect(useAgentProviderStore.getState().currentState).toMatchObject({
      status: "stale",
      currentProfileId: null,
    });

    useAgentProviderStore.setState({
      profiles: [profile],
      selectedProfileId: "profile-1",
      currentState: {
        nativeConfig: null,
        platformId: "codex",
        status: "verified",
        currentProfileId: "profile-1",
        checkedAt: 4,
      },
    });
    await useAgentProviderStore.getState().deleteProfile("profile-1");
    expect(useAgentProviderStore.getState().currentState).toMatchObject({
      status: "none",
      currentProfileId: null,
    });
    expect(window.api.agent.getProviderCurrentState).toHaveBeenCalledTimes(2);
  });

  it("does not apply a late activation result to another Agent", async () => {
    let finishActivation!: (
      result: AgentProviderActivationExecutionResult,
    ) => void;
    window.api.agent.activateProvider = vi.fn<
      typeof window.api.agent.activateProvider
    >(
      () =>
        new Promise((resolve) => {
          finishActivation = resolve;
        }),
    );
    useAgentProviderStore.setState({
      platformId: "codex",
      activationPlan,
    });

    const activation = useAgentProviderStore
      .getState()
      .activatePreview("codex");
    useAgentProviderStore.setState({
      platformId: "claude",
      busyAction: null,
      activationPlan: null,
    });
    finishActivation({
      status: "verified",
      plan: { ...activationPlan, status: "apply" },
      verification: {
        verified: true,
        nativeDigest: "digest-after",
        state: {
          platformId: "codex",
          adapterVersion: "model-profile-v1",
          nativeDigest: "digest-after",
          values: {},
        },
      },
      rollback: null,
    });

    await expect(activation).resolves.toMatchObject({ status: "verified" });
    expect(useAgentProviderStore.getState()).toMatchObject({
      platformId: "claude",
      activationPlan: null,
      activationResult: null,
      busyAction: null,
    });
  });

  it("requires import/activation previews and exposes only stable errors", async () => {
    await expect(
      useAgentProviderStore.getState().adoptImport(),
    ).resolves.toBeNull();
    expect(useAgentProviderStore.getState().errorCode).toBe(
      "AGENT_PROVIDER_IMPORT_REQUIRED",
    );
    await expect(
      useAgentProviderStore.getState().activatePreview("codex"),
    ).resolves.toBeNull();
    expect(useAgentProviderStore.getState().errorCode).toBe(
      "AGENT_PROVIDER_PREVIEW_REQUIRED",
    );

    window.api.agent.listProviderProfiles = vi
      .fn()
      .mockRejectedValue(new Error("/private/path token=secret"));
    await useAgentProviderStore.getState().load("codex");
    expect(useAgentProviderStore.getState().errorCode).toBe(
      "AGENT_PROVIDER_OPERATION_FAILED",
    );

    window.api.agent.importCurrentProvider = vi
      .fn()
      .mockRejectedValue(new Error("AGENT_PROVIDER_IMPORT_FAILED"));
    await useAgentProviderStore.getState().importCurrent("codex");
    expect(useAgentProviderStore.getState().errorCode).toBe(
      "AGENT_PROVIDER_IMPORT_FAILED",
    );

    useAgentProviderStore.setState({
      importPreview,
      activationPlan,
      activationResult: {
        status: "failed",
        plan: activationPlan,
        verification: null,
        rollback: null,
      },
    });
    useAgentProviderStore.getState().clearTransient();
    expect(useAgentProviderStore.getState()).toMatchObject({
      importPreview: null,
      activationPlan: null,
      activationResult: null,
      errorCode: null,
    });
  });

  it("handles every write failure without retaining private diagnostics", async () => {
    const failure = new Error("/private/config credential=secret");
    window.api.agent.createProviderProfile = vi.fn().mockRejectedValue(failure);
    window.api.agent.updateProviderProfile = vi.fn().mockRejectedValue(failure);
    window.api.agent.archiveProviderProfile = vi
      .fn()
      .mockRejectedValue(failure);
    window.api.agent.duplicateProviderProfile = vi
      .fn()
      .mockRejectedValue(failure);
    window.api.agent.deleteProviderProfile = vi.fn().mockRejectedValue(failure);
    window.api.agent.exportProviderProfile = vi.fn().mockRejectedValue(failure);
    window.api.agent.previewProviderActivation = vi
      .fn()
      .mockRejectedValue(failure);
    window.api.agent.activateProvider = vi.fn().mockRejectedValue(failure);

    await expect(
      useAgentProviderStore.getState().createProfile({
        modelMappings: [],
        profile: {
          platformId: "codex",
          name: "Work",
          providerKind: "platform-native",
          protocol: "platform-native",
          config: {},
          source: "manual",
        },
      }),
    ).resolves.toBeNull();
    await expect(
      useAgentProviderStore.getState().updateProfile({
        id: "profile-1",
        expectedUpdatedAt: 1,
        profile: {},
        secretAction: "preserve",
      }),
    ).resolves.toBeNull();
    await expect(
      useAgentProviderStore.getState().archiveProfile("profile-1", 1),
    ).resolves.toBeNull();
    await expect(
      useAgentProviderStore.getState().duplicateProfile("profile-1", "Copy"),
    ).resolves.toBeNull();
    await expect(
      useAgentProviderStore.getState().deleteProfile("profile-1"),
    ).resolves.toBe(false);
    await expect(
      useAgentProviderStore.getState().exportProfile("profile-1"),
    ).resolves.toBeNull();
    await expect(
      useAgentProviderStore.getState().previewActivation("codex", "profile-1"),
    ).resolves.toBeNull();
    useAgentProviderStore.setState({ activationPlan });
    await expect(
      useAgentProviderStore.getState().activatePreview("codex"),
    ).resolves.toBeNull();
    useAgentProviderStore.setState({ importPreview });
    window.api.agent.createProviderProfile = vi.fn().mockRejectedValue(failure);
    await expect(
      useAgentProviderStore.getState().adoptImport(),
    ).resolves.toBeNull();

    expect(useAgentProviderStore.getState()).toMatchObject({
      busyAction: null,
      errorCode: "AGENT_PROVIDER_OPERATION_FAILED",
    });
    expect(JSON.stringify(useAgentProviderStore.getState())).not.toContain(
      "private/config",
    );
  });

  it("ignores stale failed loads and platform mismatches", async () => {
    let rejectFirst!: (error: Error) => void;
    let rejectSecond!: (error: Error) => void;
    window.api.agent.listProviderProfiles = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<AgentProviderProfilePublic[]>((_resolve, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<AgentProviderProfilePublic[]>((_resolve, reject) => {
            rejectSecond = reject;
          }),
      );

    const first = useAgentProviderStore.getState().load("codex");
    const second = useAgentProviderStore.getState().load("claude");
    rejectFirst(new Error("AGENT_PROVIDER_LIST_FAILED"));
    await first;
    expect(useAgentProviderStore.getState().errorCode).toBeNull();

    useAgentProviderStore.setState({ platformId: "manually-changed" });
    rejectSecond(new Error("AGENT_PROVIDER_LIST_FAILED"));
    await second;
    expect(useAgentProviderStore.getState().errorCode).toBeNull();
  });
});
