import { ipcMain } from "electron";
import { CorePluginLibraryService } from "@prompthub/core";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";

export function registerPluginIPC(
  service = new CorePluginLibraryService({ materializePackages: true }),
): void {
  ipcMain.handle(IPC_CHANNELS.PLUGIN_LIBRARY_GET, async () => service.read());
  ipcMain.handle(IPC_CHANNELS.PLUGIN_MARKET_LIST, async () =>
    service.getMarketEntries(),
  );
  ipcMain.handle(IPC_CHANNELS.PLUGIN_MARKET_SOURCES, async () =>
    service.getMarketSources(),
  );
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_MARKET_PREVIEW,
    async (_event, entryId: string) => service.previewMarketPlugin(entryId),
  );
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_MARKET_INSTALL,
    async (_event, entryId: string) => service.installMarketPlugin(entryId),
  );
  ipcMain.handle(IPC_CHANNELS.PLUGIN_DELETE, async (_event, id: string) =>
    service.deletePlugin(id),
  );
  ipcMain.handle(IPC_CHANNELS.PLUGIN_TARGET_MATRIX, async () =>
    service.getTargetMatrix(),
  );
}
