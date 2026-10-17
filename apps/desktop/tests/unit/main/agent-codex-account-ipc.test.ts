import { beforeEach, describe, expect, it, vi } from "vitest";

const handleMock = vi.fn();

vi.mock("electron", () => ({ ipcMain: { handle: handleMock } }));

async function setup() {
  vi.resetModules();
  handleMock.mockReset();
  const [{ registerAgentCodexAccountIPC }, { IPC_CHANNELS }] =
    await Promise.all([
      import("../../../src/main/ipc/agent-codex-account.ipc"),
      import("@prompthub/shared/constants/ipc-channels"),
    ]);
  const summary = {
    id: "account-1",
    label: "Personal",
    maskedAccountId: "••••123456",
    isActive: true,
    createdAt: 1,
    updatedAt: 1,
  };
  const service = {
    list: vi.fn(async () => [summary]),
    saveCurrent: vi.fn(async () => summary),
    importAccount: vi.fn(async () => summary),
    activate: vi.fn(async () => ({ account: summary, preservedCurrent: true })),
    delete: vi.fn(async () => undefined),
  };
  registerAgentCodexAccountIPC(service);
  const handlers = Object.fromEntries(
    handleMock.mock.calls.map(([channel, handler]) => [channel, handler]),
  ) as Record<string, (...args: unknown[]) => Promise<unknown>>;
  return { handlers, IPC_CHANNELS, service };
}

describe("Agent Codex account IPC", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("registers the account surface and never echoes write-only JSON", async () => {
    const { handlers, IPC_CHANNELS, service } = await setup();
    await handlers[IPC_CHANNELS.AGENT_CODEX_ACCOUNTS_LIST](null);
    await handlers[IPC_CHANNELS.AGENT_CODEX_ACCOUNT_SAVE_CURRENT](
      null,
      "Personal",
    );
    await handlers[IPC_CHANNELS.AGENT_CODEX_ACCOUNT_IMPORT](null, {
      label: "Work",
      authJson: '{"tokens":{"access_token":"secret-token"}}',
    });
    await handlers[IPC_CHANNELS.AGENT_CODEX_ACCOUNT_ACTIVATE](
      null,
      "account-1",
    );
    await handlers[IPC_CHANNELS.AGENT_CODEX_ACCOUNT_DELETE](null, "account-1");

    expect(service.importAccount).toHaveBeenCalledWith({
      label: "Work",
      authJson: '{"tokens":{"access_token":"secret-token"}}',
    });
    expect(service.activate).toHaveBeenCalledWith("account-1");
    expect(
      JSON.stringify(
        await handlers[IPC_CHANNELS.AGENT_CODEX_ACCOUNTS_LIST](null),
      ),
    ).not.toContain("secret-token");
  });

  it("passes public account errors and redacts unexpected failures", async () => {
    const { handlers, IPC_CHANNELS, service } = await setup();
    service.activate.mockRejectedValueOnce(new Error("AGENT_PROVIDER_ADAPTER_UNSUPPORTED"));
    await expect(handlers[IPC_CHANNELS.AGENT_CODEX_ACCOUNT_ACTIVATE](null, "disabled")).rejects.toThrow("AGENT_PROVIDER_ADAPTER_UNSUPPORTED");
    service.activate.mockRejectedValueOnce(
      new Error("AGENT_CODEX_ACCOUNT_NOT_FOUND"),
    );
    await expect(
      handlers[IPC_CHANNELS.AGENT_CODEX_ACCOUNT_ACTIVATE](null, "missing"),
    ).rejects.toThrow("AGENT_CODEX_ACCOUNT_NOT_FOUND");

    service.importAccount.mockRejectedValueOnce(
      new Error("secret-token at /private/auth.json"),
    );
    await expect(
      handlers[IPC_CHANNELS.AGENT_CODEX_ACCOUNT_IMPORT](null, {
        label: "Work",
      }),
    ).rejects.toThrow("AGENT_CODEX_ACCOUNT_OPERATION_FAILED");
    expect(service.importAccount).toHaveBeenCalledWith({ label: "Work" });
  });

  it("rejects malformed imports before invoking the account service", async () => {
    const { handlers, IPC_CHANNELS, service } = await setup();
    await expect(
      handlers[IPC_CHANNELS.AGENT_CODEX_ACCOUNT_IMPORT](null, {}),
    ).rejects.toThrow("AGENT_CODEX_ACCOUNT_REQUEST_INVALID");
    expect(service.importAccount).not.toHaveBeenCalled();
  });
});
