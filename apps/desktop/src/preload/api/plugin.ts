import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import type {
  PluginDistributeRequest,
  PluginDistributeResult,
  PluginDeleteOptions,
  PluginImportLocalRequest,
  PluginImportSourceRequest,
  PluginImportChildMcpResult,
  PluginInstallResult,
  PluginLibraryFile,
  PluginLibrarySnapshot,
  PluginMarketEntry,
  PluginMarketPreview,
  PluginMarketSource,
  PluginMetadataUpdate,
  PluginPackageHealthCheck,
  PluginSourceUpdateCheck,
  PluginSourceUpdateResult,
  PluginTargetCompatibility,
  PluginUndistributeRequest,
  PluginUndistributeResult,
  PluginVersion,
  PluginVersionRollbackResult,
} from "@prompthub/shared/types/plugin";
import type { AgentAssetFileSnapshot } from "@prompthub/shared/types/sync";

export const pluginApi = {
  getLibrary: (): Promise<PluginLibraryFile> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_LIBRARY_GET),
  exportLibrarySnapshot: (): Promise<PluginLibrarySnapshot> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_LIBRARY_EXPORT_SNAPSHOT),
  restoreLibrarySnapshot: (
    snapshot: PluginLibrarySnapshot,
  ): Promise<PluginLibraryFile> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_LIBRARY_RESTORE_SNAPSHOT, snapshot),
  exportDataFiles: (): Promise<AgentAssetFileSnapshot[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_LIBRARY_EXPORT_FILES),
  restoreDataFiles: (files: AgentAssetFileSnapshot[]): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_LIBRARY_RESTORE_FILES, files),
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
  importLocalPluginPackage: (
    request: PluginImportLocalRequest,
  ): Promise<PluginInstallResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_IMPORT_LOCAL, request),
  previewSourcePlugin: (
    request: PluginImportSourceRequest,
  ): Promise<PluginMarketPreview> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_SOURCE_PREVIEW, request),
  importSourcePlugin: (
    request: PluginImportSourceRequest,
  ): Promise<PluginInstallResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_IMPORT_SOURCE, request),
  getPluginSourceUpdateStatus: (
    pluginId: string,
    sources?: PluginMarketSource[],
  ): Promise<PluginSourceUpdateCheck> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_SOURCE_UPDATE_STATUS,
      pluginId,
      sources,
    ),
  updatePluginFromSource: (
    pluginId: string,
    options?: { overwriteLocalChanges?: boolean },
    sources?: PluginMarketSource[],
  ): Promise<PluginSourceUpdateResult> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_SOURCE_UPDATE,
      pluginId,
      options,
      sources,
    ),
  updatePluginMetadata: (
    pluginId: string,
    metadata: PluginMetadataUpdate,
  ): Promise<PluginLibraryFile> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_UPDATE_METADATA, pluginId, metadata),
  distributePlugin: (
    request: PluginDistributeRequest,
  ): Promise<PluginDistributeResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_DISTRIBUTE, request),
  removePluginDistribution: (
    request: PluginUndistributeRequest,
  ): Promise<PluginUndistributeResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_UNDISTRIBUTE, request),
  importChildMcpServers: (
    pluginId: string,
  ): Promise<PluginImportChildMcpResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_IMPORT_CHILD_MCP, pluginId),
  checkInstalledPluginPackage: (
    pluginId: string,
  ): Promise<PluginPackageHealthCheck> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_PACKAGE_HEALTH_CHECK, pluginId),
  versionGetAll: (pluginId: string): Promise<PluginVersion[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_VERSION_GET_ALL, pluginId),
  versionCreate: (
    pluginId: string,
    note?: string,
  ): Promise<PluginVersion> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_VERSION_CREATE, pluginId, note),
  versionRollback: (
    pluginId: string,
    version: number,
  ): Promise<PluginVersionRollbackResult | null> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_VERSION_ROLLBACK,
      pluginId,
      version,
    ),
  versionDelete: (pluginId: string, versionId: string): Promise<boolean> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_VERSION_DELETE,
      pluginId,
      versionId,
    ),
  deletePlugin: (
    id: string,
    options?: PluginDeleteOptions,
  ): Promise<PluginLibraryFile> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_DELETE, id, options),
  getTargetMatrix: (): Promise<PluginTargetCompatibility[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_TARGET_MATRIX),
};
