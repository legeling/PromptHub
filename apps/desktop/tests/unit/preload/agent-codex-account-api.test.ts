import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock("electron", () => ({ ipcRenderer: mocks }));

import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import { agentApi } from "../../../src/preload/api/agent";

describe("Agent Codex account preload API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("forwards fixed account-management channels", async () => {
    const imported = { label: "Work", authJson: "write-only-json" };
    await agentApi.listCodexAccounts();
    await agentApi.saveCurrentCodexAccount("Personal");
    await agentApi.importCodexAccount(imported);
    await agentApi.activateCodexAccount("account-2");
    await agentApi.deleteCodexAccount("account-1");

    expect(mocks.invoke.mock.calls).toEqual([
      [IPC_CHANNELS.AGENT_CODEX_ACCOUNTS_LIST],
      [IPC_CHANNELS.AGENT_CODEX_ACCOUNT_SAVE_CURRENT, "Personal", undefined],
      [IPC_CHANNELS.AGENT_CODEX_ACCOUNT_IMPORT, imported],
      [IPC_CHANNELS.AGENT_CODEX_ACCOUNT_ACTIVATE, "account-2"],
      [IPC_CHANNELS.AGENT_CODEX_ACCOUNT_DELETE, "account-1"],
    ]);
  });
});
