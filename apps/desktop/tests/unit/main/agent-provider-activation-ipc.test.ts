import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentProviderActivationExecutionResult,
  AgentProviderActivationPlan,
  AgentProviderAdapterContext,
  AgentProviderConnectionTestResult,
  AgentProviderImportPreview,
  AgentProviderModelTestResult,
} from "@prompthub/shared";

const handleMock = vi.fn();

vi.mock("electron", () => ({
  ipcMain: { handle: handleMock },
}));

type Handler = (...args: unknown[]) => Promise<unknown>;

const context: AgentProviderAdapterContext = {
  agentId: "codex",
  platformId: "codex",
  rootPath: "/Users/test/.codex",
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
    config: {},
    source: "native-import",
  },
  modelMappings: [{ routeKey: "primary", modelId: "gpt-5.4", parameters: {} }],
  warnings: [],
};

const plan: AgentProviderActivationPlan = {
  platformId: "codex",
  profileId: "profile-1",
  adapterVersion: "model-profile-v1",
  currentDigest: "digest-current",
  status: "apply",
  decisions: [{ field: "model", status: "apply" }],
  canApply: true,
  requiresReview: false,
  blockedReasons: [],
};

const activationResult: AgentProviderActivationExecutionResult = {
  status: "verified",
  plan,
  verification: {
    verified: true,
    nativeDigest: "digest-after",
    state: {
      platformId: "codex",
      adapterVersion: "model-profile-v1",
      nativeDigest: "digest-after",
      values: { model: "gpt-5.5" },
    },
  },
  rollback: null,
};

const connectionResult: AgentProviderConnectionTestResult = {
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

const modelTestResult: AgentProviderModelTestResult = {
  platformId: "codex",
  profileId: "profile-1",
  protocol: "responses",
  endpointOrigin: "https://gateway.example.com",
  model: "gpt-5.4",
  status: "ok",
  startedAt: 10,
  finishedAt: 30,
  totalMs: 20,
  firstTokenMs: 12,
  retryCount: 0,
  inputTokens: 8,
  outputTokens: 1,
  outputPreview: "OK",
};

async function setup(overrides: Record<string, ReturnType<typeof vi.fn>> = {}) {
  vi.resetModules();
  handleMock.mockReset();
  const [{ registerAgentProviderActivationIPC }, { IPC_CHANNELS }] =
    await Promise.all([
      import("../../../src/main/ipc/agent-provider-activation.ipc"),
      import("@prompthub/shared/constants/ipc-channels"),
    ]);
  const service = {
    testCurrentConnection: vi.fn(async () => ({
      ...connectionResult,
      profileId: "native:codex",
    })),
    testCurrentModel: vi.fn(async () => ({
      ...modelTestResult,
      profileId: "native:codex",
    })),
    testConnection: vi.fn(async () => connectionResult),
    testModel: vi.fn(async () => modelTestResult),
    importCurrent: vi.fn(async () => importPreview),
    preview: vi.fn(async () => plan),
    activate: vi.fn(async () => activationResult),
    ...overrides,
  };
  const resolveContext = vi.fn(() => context);
  registerAgentProviderActivationIPC(service, resolveContext);
  return {
    IPC_CHANNELS,
    service,
    resolveContext,
    handlers: Object.fromEntries(
      handleMock.mock.calls.map(([channel, handler]) => [channel, handler]),
    ) as Record<string, Handler>,
  };
}

describe("Agent Provider activation IPC", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves main-owned paths for test, import, preview, and activation", async () => {
    const { handlers, IPC_CHANNELS, resolveContext, service } = await setup();

    await expect(
      handlers[IPC_CHANNELS.AGENT_PROVIDER_TEST_CURRENT_CONNECTION](null, {
        agentId: "codex",
      }),
    ).resolves.toMatchObject({ profileId: "native:codex" });
    await expect(
      handlers[IPC_CHANNELS.AGENT_PROVIDER_TEST_CURRENT_MODEL](
        { sender: { id: 7 } },
        {
          agentId: "codex",
          requestId: "native-model-test-1",
        },
      ),
    ).resolves.toMatchObject({ profileId: "native:codex" });
    await expect(
      handlers[IPC_CHANNELS.AGENT_PROVIDER_TEST_CONNECTION](null, {
        agentId: "codex",
        profileId: "profile-1",
      }),
    ).resolves.toEqual(connectionResult);
    await expect(
      handlers[IPC_CHANNELS.AGENT_PROVIDER_TEST_MODEL](
        { sender: { id: 7 } },
        {
          agentId: "codex",
          profileId: "profile-1",
          requestId: "model-test-request-1",
        },
      ),
    ).resolves.toEqual(modelTestResult);
    await expect(
      handlers[IPC_CHANNELS.AGENT_PROVIDER_IMPORT_CURRENT](null, {
        agentId: "codex",
      }),
    ).resolves.toEqual(importPreview);
    await expect(
      handlers[IPC_CHANNELS.AGENT_PROVIDER_PREVIEW](null, {
        agentId: "codex",
        profileId: "profile-1",
      }),
    ).resolves.toEqual(plan);
    await expect(
      handlers[IPC_CHANNELS.AGENT_PROVIDER_ACTIVATE](null, {
        agentId: "codex",
        profileId: "profile-1",
        expectedCurrentDigest: "digest-current",
        resolutions: [{ field: "model", action: "use-profile" }],
      }),
    ).resolves.toEqual(activationResult);

    expect(resolveContext).toHaveBeenCalledTimes(7);
    expect(resolveContext).toHaveBeenNthCalledWith(1, "codex");
    expect(resolveContext).toHaveBeenNthCalledWith(2, "codex");
    expect(service.testCurrentConnection).toHaveBeenCalledWith({ context });
    expect(service.testCurrentModel).toHaveBeenCalledWith(
      { context },
      expect.any(AbortSignal),
    );
    expect(service.testConnection).toHaveBeenCalledWith({
      context,
      profileId: "profile-1",
    });
    expect(service.testModel).toHaveBeenCalledWith(
      {
        context,
        profileId: "profile-1",
      },
      expect.any(AbortSignal),
    );
    expect(service.importCurrent).toHaveBeenCalledWith({ context });
    expect(service.preview).toHaveBeenCalledWith({
      context,
      profileId: "profile-1",
    });
    expect(service.activate).toHaveBeenCalledWith({
      context,
      profileId: "profile-1",
      expectedCurrentDigest: "digest-current",
      resolutions: [{ field: "model", action: "use-profile" }],
    });
    expect(JSON.stringify(handleMock.mock.calls)).not.toContain(
      "/Users/test/.codex",
    );
  });

  it("scopes model-test cancellation to the requesting renderer", async () => {
    const testModel = vi.fn(
      async (
        _input: { context: AgentProviderAdapterContext; profileId: string },
        signal: AbortSignal,
      ) =>
        new Promise<AgentProviderModelTestResult>((resolve) => {
          signal.addEventListener(
            "abort",
            () => resolve({ ...modelTestResult, status: "cancelled" }),
            { once: true },
          );
        }),
    );
    const { handlers, IPC_CHANNELS } = await setup({ testModel });
    const running = handlers[IPC_CHANNELS.AGENT_PROVIDER_TEST_MODEL](
      { sender: { id: 7 } },
      {
        agentId: "codex",
        profileId: "profile-1",
        requestId: "model-test-request-2",
      },
    );

    await vi.waitFor(() => expect(testModel).toHaveBeenCalled());
    await expect(
      handlers[IPC_CHANNELS.AGENT_PROVIDER_CANCEL_MODEL_TEST](
        { sender: { id: 8 } },
        { requestId: "model-test-request-2" },
      ),
    ).resolves.toBe(false);
    await expect(
      handlers[IPC_CHANNELS.AGENT_PROVIDER_CANCEL_MODEL_TEST](
        { sender: { id: 7 } },
        { requestId: "model-test-request-2" },
      ),
    ).resolves.toBe(true);
    await expect(running).resolves.toMatchObject({ status: "cancelled" });
  });

  it("cancels an active model test when its renderer is destroyed", async () => {
    const testModel = vi.fn(
      async (
        _input: { context: AgentProviderAdapterContext; profileId: string },
        signal: AbortSignal,
      ) =>
        new Promise<AgentProviderModelTestResult>((resolve) => {
          signal.addEventListener(
            "abort",
            () => resolve({ ...modelTestResult, status: "cancelled" }),
            { once: true },
          );
        }),
    );
    const { handlers, IPC_CHANNELS } = await setup({ testModel });
    const sender = Object.assign(new EventEmitter(), { id: 9 });
    const running = handlers[IPC_CHANNELS.AGENT_PROVIDER_TEST_MODEL](
      { sender },
      {
        agentId: "codex",
        profileId: "profile-1",
        requestId: "model-test-request-3",
      },
    );

    await vi.waitFor(() => expect(testModel).toHaveBeenCalled());
    sender.emit("destroyed");
    await expect(running).resolves.toMatchObject({ status: "cancelled" });
    expect(sender.listenerCount("destroyed")).toBe(0);
  });

  it("rejects malformed renderer requests before filesystem resolution", async () => {
    const { handlers, IPC_CHANNELS, resolveContext, service } = await setup();
    const invalidRequests: Array<[string, unknown]> = [
      [IPC_CHANNELS.AGENT_PROVIDER_IMPORT_CURRENT, null],
      [IPC_CHANNELS.AGENT_PROVIDER_TEST_CURRENT_CONNECTION, { agentId: "" }],
      [
        IPC_CHANNELS.AGENT_PROVIDER_TEST_CURRENT_MODEL,
        { agentId: "codex", requestId: "../bad" },
      ],
      [
        IPC_CHANNELS.AGENT_PROVIDER_TEST_CONNECTION,
        { agentId: "codex", profileId: "" },
      ],
      [
        IPC_CHANNELS.AGENT_PROVIDER_TEST_MODEL,
        {
          agentId: "codex",
          profileId: "profile-1",
          requestId: "../bad",
        },
      ],
      [IPC_CHANNELS.AGENT_PROVIDER_CANCEL_MODEL_TEST, { requestId: "" }],
      [IPC_CHANNELS.AGENT_PROVIDER_IMPORT_CURRENT, { agentId: "" }],
      [
        IPC_CHANNELS.AGENT_PROVIDER_PREVIEW,
        { agentId: "codex", profileId: "" },
      ],
      [
        IPC_CHANNELS.AGENT_PROVIDER_ACTIVATE,
        {
          agentId: "codex",
          profileId: "profile-1",
          expectedCurrentDigest: "",
        },
      ],
      [
        IPC_CHANNELS.AGENT_PROVIDER_ACTIVATE,
        {
          agentId: "codex",
          profileId: "profile-1",
          expectedCurrentDigest: "digest",
          resolutions: null,
        },
      ],
      [
        IPC_CHANNELS.AGENT_PROVIDER_ACTIVATE,
        {
          agentId: "codex",
          profileId: "profile-1",
          expectedCurrentDigest: "digest",
          resolutions: [{ field: "", action: "use-profile" }],
        },
      ],
      [
        IPC_CHANNELS.AGENT_PROVIDER_ACTIVATE,
        {
          agentId: "codex",
          profileId: "profile-1",
          expectedCurrentDigest: "digest",
          resolutions: [{ field: "model", action: "overwrite" }],
        },
      ],
    ];

    for (const [channel, request] of invalidRequests) {
      await expect(handlers[channel](null, request)).rejects.toThrow(
        "AGENT_PROVIDER_REQUEST_INVALID",
      );
    }
    expect(resolveContext).not.toHaveBeenCalled();
    expect(service.importCurrent).not.toHaveBeenCalled();
    expect(service.testConnection).not.toHaveBeenCalled();
    expect(service.preview).not.toHaveBeenCalled();
    expect(service.activate).not.toHaveBeenCalled();
  });

  it("passes stable errors and redacts unexpected main-process failures", async () => {
    const { handlers, IPC_CHANNELS, service } = await setup();
    vi.mocked(service.preview).mockRejectedValueOnce(
      new Error("AGENT_PROVIDER_PLAN_BLOCKED"),
    );
    await expect(
      handlers[IPC_CHANNELS.AGENT_PROVIDER_PREVIEW](null, {
        agentId: "codex",
        profileId: "profile-1",
      }),
    ).rejects.toThrow("AGENT_PROVIDER_PLAN_BLOCKED");

    vi.mocked(service.activate).mockRejectedValueOnce(
      new Error("/private/config token=secret-value"),
    );
    const failure = await handlers[IPC_CHANNELS.AGENT_PROVIDER_ACTIVATE](null, {
      agentId: "codex",
      profileId: "profile-1",
      expectedCurrentDigest: "digest-current",
    }).catch((error: unknown) => error);
    if (!(failure instanceof Error)) throw new Error("Expected IPC rejection");
    expect(failure.message).toBe("AGENT_PROVIDER_OPERATION_FAILED");
    expect(failure.message).not.toContain("secret-value");
  });
});
