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
  registerSafeHandler(
    IPC_CHANNELS.AGENT_CODEX_ACCOUNT_SAVE_CURRENT,
    (label, id) => {
      if (
        typeof label !== "string" ||
        (id !== undefined && typeof id !== "string")
      ) {
        throw new Error("AGENT_CODEX_ACCOUNT_REQUEST_INVALID");
      }
      return service.saveCurrent(label, typeof id === "string" ? id : undefined);
    },
  );
  registerSafeHandler(IPC_CHANNELS.AGENT_CODEX_ACCOUNT_IMPORT, (request) => {
    if (!isAccountRequest(request))
      throw new Error("AGENT_CODEX_ACCOUNT_REQUEST_INVALID");
    return service.importAccount(request);
  });
  registerSafeHandler(IPC_CHANNELS.AGENT_CODEX_ACCOUNT_ACTIVATE, (id) =>
    service.activate(id as string),
  );
  registerSafeHandler(IPC_CHANNELS.AGENT_CODEX_ACCOUNT_DELETE, (id) =>
    service.delete(id as string),
  );
}

function isAccountRequest(
  value: unknown,
): value is ImportAgentCodexAccountRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (
    "label" in value &&
    typeof value.label === "string" &&
    (!("id" in value) ||
      value.id === undefined ||
      typeof value.id === "string") &&
    (!("authJson" in value) ||
      value.authJson === undefined ||
      typeof value.authJson === "string")
  );
}
