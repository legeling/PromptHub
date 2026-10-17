import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import type { CliInstallMethod } from "@prompthub/shared/types";
import { getCliStatus, installCli } from "../services/cli-installer";
import { logStartupEvent } from "../startup-log";
import path from "node:path";
import { getCacheDir } from "../runtime-paths";
import { CliStatusCache } from "../services/cli-status-cache";

export function registerCliIPC(): void {
  const cache = new CliStatusCache(
    path.join(getCacheDir(), "cli-status.json"),
    getCliStatus,
  );
  ipcMain.handle(
    IPC_CHANNELS.CLI_STATUS,
    async (_event, force: unknown = false) => {
      if (typeof force !== "boolean")
        throw new Error("CLI status force must be a boolean");
      const started = Date.now();
      logStartupEvent({ event: "cli:status_started" });
      try {
        const status = await cache.get(force);
        logStartupEvent({
          event: "cli:status_completed",
          durationMs: Date.now() - started,
          installed: status.installed,
          packageManager: status.packageManager,
          releaseLookupFailed: Boolean(status.error),
        });
        return status;
      } catch (error) {
        logStartupEvent({
          event: "cli:status_failed",
          durationMs: Date.now() - started,
          errorType: error instanceof Error ? error.name : typeof error,
        });
        throw error;
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CLI_INSTALL,
    async (_event, method?: CliInstallMethod) => {
      cache.invalidate();
      return installCli(method);
    },
  );
}
