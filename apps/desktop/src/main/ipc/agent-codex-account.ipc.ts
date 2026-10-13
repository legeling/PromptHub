import { ipcMain } from "electron";

import type { ImportAgentCodexAccountRequest } from "@prompthub/shared";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";

import type { AgentCodexAccountService } from "../services/agent-codex-account-service";

const PUBLIC_ERROR =
  /^(AGENT_CODEX_ACCOUNT_[A-Z0-9_]+|AGENT_PROVIDER_ADAPTER_UNSUPPORTED)$/;

function registerSafeHandler(
  channel: string,
  handler: (...args: unknown[]) => unknown | Promise<unknown>,
): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof Error && PUBLIC_ERROR.test(error.message)) {
        throw new Error(error.message);
      }
      console.error("[agent-codex-account] operation failed");
      throw new Error("AGENT_CODEX_ACCOUNT_OPERATION_FAILED");
    }
  });
}

export function registerAgentCodexAccountIPC(
  service: AgentCodexAccountService,
): void {
  registerSafeHandler(IPC_CHANNELS.AGENT_CODEX_ACCOUNTS_LIST, () =>
    service.list(),
  );
  registerSafeHandler(IPC_CHANNELS.AGENT_CODEX_ACCOUNT_SAVE_CURRENT, (label) =>
    service.saveCurrent(label as string),
  );
  registerSafeHandler(IPC_CHANNELS.AGENT_CODEX_ACCOUNT_IMPORT, (request) =>
    service.importAccount(request as ImportAgentCodexAccountRequest),
  );
  registerSafeHandler(IPC_CHANNELS.AGENT_CODEX_ACCOUNT_ACTIVATE, (id) =>
    service.activate(id as string),
  );
  registerSafeHandler(IPC_CHANNELS.AGENT_CODEX_ACCOUNT_DELETE, (id) =>
    service.delete(id as string),
  );
}
