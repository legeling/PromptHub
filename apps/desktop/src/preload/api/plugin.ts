import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import type {
  PluginDistributeRequest,
  PluginDistributeResult,
  PluginInstallResult,
  PluginLibraryFile,
  PluginMarketEntry,
  PluginMarketPreview,
  PluginMarketSource,
  PluginTargetCompatibility,
} from "@prompthub/shared/types/plugin";

export const pluginApi = {
  getLibrary: (): Promise<PluginLibraryFile> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_LIBRARY_GET),
  listMarket: (sources?: PluginMarketSource[]): Promise<PluginMarketEntry[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_MARKET_LIST, sources),
  listMarketSources: (): Promise<PluginMarketSource[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_MARKET_SOURCES),
  previewMarketPlugin: (
    entryId: string,
    sources?: PluginMarketSource[],
  ): Promise<PluginMarketPreview> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_MARKET_PREVIEW, entryId, sources),
  installMarketPlugin: (
    entryId: string,
    sources?: PluginMarketSource[],
  ): Promise<PluginInstallResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_MARKET_INSTALL, entryId, sources),
  distributePlugin: (
    request: PluginDistributeRequest,
  ): Promise<PluginDistributeResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_DISTRIBUTE, request),
  deletePlugin: (id: string): Promise<PluginLibraryFile> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_DELETE, id),
  getTargetMatrix: (): Promise<PluginTargetCompatibility[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_TARGET_MATRIX),
};
