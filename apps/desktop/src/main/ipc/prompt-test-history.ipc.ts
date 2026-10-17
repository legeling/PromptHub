import { ipcMain } from "electron";
import type Database from "@prompthub/db/adapter";
import { PromptTestHistoryDB } from "@prompthub/db/prompt-test-history";
import { PromptTestHistoryService } from "@prompthub/core/prompt-test-history";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import type { PromptTestHistoryReply } from "@prompthub/shared/types/prompt-test-history";

function reply<T>(operation: () => T): PromptTestHistoryReply<T> {
  try {
    return { ok: true, data: operation() };
  } catch (error) {
    console.error("Prompt test history operation failed", error);
    return { ok: false, error: "Could not access prompt test history" };
  }
}

export function registerPromptTestHistoryIPC(db: Database.Database): void {
  const service = new PromptTestHistoryService(new PromptTestHistoryDB(db));
  ipcMain.handle(IPC_CHANNELS.PROMPT_TEST_HISTORY_ADD, (_, input: unknown) =>
    reply(() => service.add(input)),
  );
  ipcMain.handle(
    IPC_CHANNELS.PROMPT_TEST_HISTORY_LIST,
    (_, promptId: unknown, offset: unknown) =>
      reply(() => service.list(promptId, offset)),
  );
  ipcMain.handle(
    IPC_CHANNELS.PROMPT_TEST_HISTORY_GET,
    (_, promptId: unknown, id: unknown) =>
      reply(() => service.get(promptId, id)),
  );
  ipcMain.handle(
    IPC_CHANNELS.PROMPT_TEST_HISTORY_DELETE,
    (_, promptId: unknown, id: unknown) =>
      reply(() => service.delete(promptId, id)),
  );
}
