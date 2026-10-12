import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AgentProviderMigrationPreview,
  AgentProviderMigrationResult,
} from "@prompthub/shared";

const handleMock = vi.fn();

vi.mock("electron", () => ({
  ipcMain: { handle: handleMock },
}));

type Handler = (...args: unknown[]) => Promise<unknown>;

const preview: AgentProviderMigrationPreview = {
  agentId: "codex",
  nativeDigest: "digest",
  candidates: [],
};
const result: AgentProviderMigrationResult = { profiles: [] };

async function setup() {
  vi.resetModules();
  handleMock.mockReset();
  const [{ registerAgentProviderMigrationIPC }, { IPC_CHANNELS }] =
    await Promise.all([
      import("../../../src/main/ipc/agent-provider-migration.ipc"),
      import("@prompthub/shared/constants/ipc-channels"),
    ]);
  const service = {
    preview: vi.fn(async () => preview),
    migrate: vi.fn(async () => result),
  };
  registerAgentProviderMigrationIPC(service);
  return {
    IPC_CHANNELS,
    service,
    handlers: Object.fromEntries(
      handleMock.mock.calls.map(([channel, handler]) => [channel, handler]),
    ) as Record<string, Handler>,
  };
}

describe("Agent provider migration IPC", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("registers preview and apply with validated public payloads", async () => {
    const { handlers, IPC_CHANNELS, service } = await setup();
    await expect(
      handlers[IPC_CHANNELS.AGENT_PROVIDER_MIGRATION_PREVIEW](null, "codex"),
    ).resolves.toEqual(preview);
    await expect(
      handlers[IPC_CHANNELS.AGENT_PROVIDER_MIGRATION_APPLY](null, {
        agentId: "codex",
        expectedNativeDigest: "digest",
        providerIds: ["deepseek"],
      }),
    ).resolves.toEqual(result);

    expect(service.preview).toHaveBeenCalledWith("codex");
    expect(service.migrate).toHaveBeenCalledWith({
      agentId: "codex",
      expectedNativeDigest: "digest",
      providerIds: ["deepseek"],
    });
  });

  it("rejects malformed requests before calling the service", async () => {
    const { handlers, IPC_CHANNELS, service } = await setup();
    await expect(
      handlers[IPC_CHANNELS.AGENT_PROVIDER_MIGRATION_PREVIEW](null, null),
    ).rejects.toThrow("AGENT_PROVIDER_MIGRATION_INPUT_INVALID");
    await expect(
      handlers[IPC_CHANNELS.AGENT_PROVIDER_MIGRATION_APPLY](null, {
        agentId: "codex",
        expectedNativeDigest: "digest",
        providerIds: [42],
      }),
    ).rejects.toThrow("AGENT_PROVIDER_MIGRATION_INPUT_INVALID");
    await expect(
      handlers[IPC_CHANNELS.AGENT_PROVIDER_MIGRATION_APPLY](null, null),
    ).rejects.toThrow("AGENT_PROVIDER_MIGRATION_INPUT_INVALID");
    await expect(
      handlers[IPC_CHANNELS.AGENT_PROVIDER_MIGRATION_APPLY](null, []),
    ).rejects.toThrow("AGENT_PROVIDER_MIGRATION_INPUT_INVALID");
    expect(service.preview).not.toHaveBeenCalled();
    expect(service.migrate).not.toHaveBeenCalled();
  });

  it("preserves stable errors and redacts unexpected failures", async () => {
    const { handlers, IPC_CHANNELS, service } = await setup();
    vi.mocked(service.migrate).mockRejectedValueOnce(
      new Error("AGENT_PROVIDER_MIGRATION_STALE"),
    );
    await expect(
      handlers[IPC_CHANNELS.AGENT_PROVIDER_MIGRATION_APPLY](null, {
        agentId: "codex",
        expectedNativeDigest: "digest",
        providerIds: ["deepseek"],
      }),
    ).rejects.toThrow("AGENT_PROVIDER_MIGRATION_STALE");

    vi.mocked(service.preview).mockRejectedValueOnce(
      new Error("token=private-secret at /private/config.toml"),
    );
    const failure = await handlers[
      IPC_CHANNELS.AGENT_PROVIDER_MIGRATION_PREVIEW
    ](null, "codex").catch((error: unknown) => error);
    if (!(failure instanceof Error)) throw new Error("Expected IPC rejection");
    expect(failure.message).toBe("AGENT_PROVIDER_MIGRATION_FAILED");
    expect(failure.message).not.toContain("private-secret");
  });
});
