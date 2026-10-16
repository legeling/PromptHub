import { ipcMain, safeStorage } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import { parseDesktopCausalSyncRequest } from "@prompthub/shared/utils/causal-sync-request";
import type { DesktopCausalSyncResult } from "@prompthub/shared/types/causal-sync";
import { CoreSettingsStore } from "@prompthub/core/settings-store";
import { getUserDataPath } from "@prompthub/core/runtime-paths";
import { getDatabase } from "../database";
import {
  DesktopCausalSyncService,
  type DesktopCausalSyncContext,
} from "../services/causal-sync-service";

function currentContext(): DesktopCausalSyncContext {
  const database = getDatabase(),
    rootPath = getUserDataPath();
  return {
    database,
    rootPath,
    settings: new CoreSettingsStore({
      database,
      rootPath,
      legacyEncryption: safeStorage,
    }),
  };
}

export function registerCausalSyncIPC(
  context: () => DesktopCausalSyncContext = currentContext,
): void {
  const service = new DesktopCausalSyncService();
  ipcMain.handle(
    IPC_CHANNELS.CAUSAL_SYNC_RUN,
    async (_event, input: unknown): Promise<DesktopCausalSyncResult> => {
      try {
        return await service.run(
          parseDesktopCausalSyncRequest(input),
          context(),
        );
      } catch {
        // Transport errors may contain credential-bearing URLs; expose a bounded public result.
        return {
          status: "failed",
          error: "Causal synchronization could not be completed",
        };
      }
    },
  );
}
