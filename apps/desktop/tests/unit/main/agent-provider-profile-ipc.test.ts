import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentProviderProfileExport,
  AgentProviderProfilePublic,
  CreateAgentProviderProfileRequest,
  UpdateAgentProviderProfileRequest,
} from "@prompthub/shared";

const handleMock = vi.fn();

vi.mock("electron", () => ({
  ipcMain: { handle: handleMock },
}));

const publicProfile: AgentProviderProfilePublic = {
  id: "profile-1",
  platformId: "claude",
  name: "Work",
  providerKind: "anthropic-compatible",
  protocol: "messages",
  endpoint: "https://example.com",
  config: {},
  source: "manual",
  archived: false,
  createdAt: 1,
  updatedAt: 1,
  modelMappings: [],
  secretState: "available",
};

type Handler = (...args: unknown[]) => Promise<unknown>;

async function setup() {
  vi.resetModules();
  handleMock.mockReset();
  const [{ registerAgentProviderProfileIPC }, { IPC_CHANNELS }] =
    await Promise.all([
      import("../../../src/main/ipc/agent-provider-profile.ipc"),
      import("@prompthub/shared/constants/ipc-channels"),
    ]);
  const service = {
    list: vi.fn(async () => [publicProfile]),
    create: vi.fn(async () => publicProfile),
    update: vi.fn(async () => publicProfile),
    archive: vi.fn(async () => ({ ...publicProfile, archived: true })),
    duplicate: vi.fn(async () => ({ ...publicProfile, id: "profile-2" })),
    export: vi.fn(
      (): AgentProviderProfileExport => ({
        version: 1,
        profile: {
          platformId: "claude",
          name: "Work",
          providerKind: "anthropic-compatible",
          protocol: "messages",
          endpoint: "https://example.com",
          config: {},
          source: "manual",
        },
        modelMappings: [],
        requiresSecret: true,
      }),
    ),
    delete: vi.fn(async () => undefined),
  };
  registerAgentProviderProfileIPC(service);
  return {
    IPC_CHANNELS,
    service,
    handlers: Object.fromEntries(
      handleMock.mock.calls.map(([channel, handler]) => [channel, handler]),
    ) as Record<string, Handler>,
  };
}

describe("Agent Provider Profile IPC", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("registers the complete CRUD, duplicate, and export surface", async () => {
    const { handlers, IPC_CHANNELS, service } = await setup();
    const createRequest: CreateAgentProviderProfileRequest = {
      profile: {
        platformId: "claude",
        name: "Work",
        providerKind: "anthropic-compatible",
        protocol: "messages",
        config: {},
        source: "manual",
      },
      modelMappings: [],
      secret: "write-only",
    };
    const updateRequest: UpdateAgentProviderProfileRequest = {
      id: "profile-1",
      expectedUpdatedAt: 1,
      profile: { name: "Renamed" },
      secretAction: "preserve",
    };

    await handlers[IPC_CHANNELS.AGENT_PROVIDER_PROFILES_LIST](null, {
      platformId: "claude",
      includeArchived: true,
    });
    await handlers[IPC_CHANNELS.AGENT_PROVIDER_PROFILES_LIST](null);
    await handlers[IPC_CHANNELS.AGENT_PROVIDER_PROFILES_CREATE](
      null,
      createRequest,
    );
    await handlers[IPC_CHANNELS.AGENT_PROVIDER_PROFILES_UPDATE](
      null,
      updateRequest,
    );
    await handlers[IPC_CHANNELS.AGENT_PROVIDER_PROFILES_ARCHIVE](
      null,
      "profile-1",
      1,
    );
    await handlers[IPC_CHANNELS.AGENT_PROVIDER_PROFILES_DUPLICATE](
      null,
      "profile-1",
      "Copy",
    );
    await handlers[IPC_CHANNELS.AGENT_PROVIDER_PROFILES_EXPORT](
      null,
      "profile-1",
    );
    await handlers[IPC_CHANNELS.AGENT_PROVIDER_PROFILES_DELETE](
      null,
      "profile-1",
    );

    expect(service.list).toHaveBeenNthCalledWith(1, {
      platformId: "claude",
      includeArchived: true,
    });
    expect(service.list).toHaveBeenNthCalledWith(2, {});
    expect(service.create).toHaveBeenCalledWith(createRequest);
    expect(service.update).toHaveBeenCalledWith(updateRequest);
    expect(service.archive).toHaveBeenCalledWith("profile-1", 1);
    expect(service.duplicate).toHaveBeenCalledWith("profile-1", "Copy");
    expect(service.export).toHaveBeenCalledWith("profile-1");
    expect(service.delete).toHaveBeenCalledWith("profile-1");

    const serializedCalls = JSON.stringify(handleMock.mock.calls);
    expect(serializedCalls).not.toContain("write-only");
  });

  it("passes stable service error codes and redacts unexpected failures", async () => {
    const { handlers, IPC_CHANNELS, service } = await setup();
    vi.mocked(service.archive).mockRejectedValueOnce(
      new Error("AGENT_PROVIDER_PROFILE_NOT_FOUND"),
    );
    await expect(
      handlers[IPC_CHANNELS.AGENT_PROVIDER_PROFILES_ARCHIVE](
        null,
        "missing",
        1,
      ),
    ).rejects.toThrow("AGENT_PROVIDER_PROFILE_NOT_FOUND");

    vi.mocked(service.create).mockRejectedValueOnce(
      new Error("database path /private/data and token=secret-value"),
    );
    const failure = await handlers[IPC_CHANNELS.AGENT_PROVIDER_PROFILES_CREATE](
      null,
      {},
    ).catch((error: unknown) => error);
    if (!(failure instanceof Error)) throw new Error("Expected IPC rejection");
    expect(failure.message).toBe("AGENT_PROVIDER_PROFILE_OPERATION_FAILED");
    expect(failure.message).not.toContain("secret-value");
  });
});
