import { importChildMcpServersForPlugin as importPluginChildMcp } from "@prompthub/core/plugin-child-mcp";
import { readPluginDistributionStatus } from "@prompthub/core/plugin-distribution-status";
import { isNativePluginRegistered } from "../services/plugin-native-installation";
import { ipcMain } from "electron";
import path from "path";
import { CorePluginLibraryService, getPluginLibraryFilePath } from "@prompthub/core";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import { redactMcpServerConfig } from "@prompthub/shared/utils/mcp-config";
import type { PluginDeleteOptions, PluginImportChildMcpResult, PluginImportSourceRequest, PluginLibrarySnapshot, PluginMarketSource } from "@prompthub/shared/types/plugin";
import { createDesktopMcpLibraryService } from "../services/desktop-mcp-library";
import { exportAgentAssetDirectorySnapshot, restoreAgentAssetDirectorySnapshot } from "../services/agent-asset-file-snapshot";
import { fetchWithNetworkProxy } from "../services/network-proxy";
import { resolveAgentPluginTargetPath } from "./plugin-target-paths";
import { distributeDesktopPlugin, removeDesktopPluginDistribution, deleteDesktopPlugin } from "../services/desktop-plugin-distribution";
import { attachTargetInventory, registerCodexPluginIPC } from "./plugin-codex.ipc";

export function importChildMcpServersForPlugin(
  service: CorePluginLibraryService,
  pluginId: string,
): PluginImportChildMcpResult {
  return importPluginChildMcp(
    service,
    pluginId,
    createDesktopMcpLibraryService(),
  );
}

export function registerPluginIPC(
  service = new CorePluginLibraryService({
    fetchFn: fetchWithNetworkProxy,
    materializePackages: true,
    resolvePluginTargetPath: resolveAgentPluginTargetPath,
  }),
): void {
  registerCodexPluginIPC(service);
  ipcMain.handle(IPC_CHANNELS.PLUGIN_LIBRARY_GET, async () => service.read());
  ipcMain.handle(IPC_CHANNELS.PLUGIN_LIBRARY_EXPORT_SNAPSHOT, async () =>
    service.exportSnapshot(),
  );
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_LIBRARY_RESTORE_SNAPSHOT,
    async (_event, snapshot: PluginLibrarySnapshot) =>
      service.restoreSnapshot(snapshot),
  );
  ipcMain.handle(IPC_CHANNELS.PLUGIN_LIBRARY_EXPORT_FILES, async () =>
    exportAgentAssetDirectorySnapshot(path.dirname(getPluginLibraryFilePath())),
  );
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_LIBRARY_RESTORE_FILES,
    async (_event, files) =>
      restoreAgentAssetDirectorySnapshot(
        path.dirname(getPluginLibraryFilePath()),
        Array.isArray(files) ? files : [],
      ),
  );
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_MARKET_LIST,
    async (_event, sources?: PluginMarketSource[]) =>
      service.getMarketEntries(sources),
  );
  ipcMain.handle(IPC_CHANNELS.PLUGIN_MARKET_SOURCES, async () =>
    service.getMarketSources(),
  );
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_MARKET_PREVIEW,
    async (_event, entryId: string, sources?: PluginMarketSource[]) =>
      service.previewMarketPlugin(entryId, sources),
  );
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_MARKET_INSTALL,
    async (_event, entryId: string, sources?: PluginMarketSource[]) =>
      service.installMarketPlugin(entryId, sources),
  );
  ipcMain.handle(IPC_CHANNELS.PLUGIN_IMPORT_LOCAL, async (_event, request) =>
    service.importLocalPluginPackage(request),
  );
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_SOURCE_PREVIEW,
    async (_event, request: PluginImportSourceRequest) =>
      service.previewSourcePlugin(request),
  );
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_IMPORT_SOURCE,
    async (_event, request: PluginImportSourceRequest) =>
      service.importSourcePlugin(request),
  );
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_SOURCE_UPDATE_STATUS,
    async (_event, pluginId: string, sources?: PluginMarketSource[]) =>
      service.getPluginSourceUpdateStatus(pluginId, sources),
  );
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_SOURCE_UPDATE,
    async (
      _event,
      pluginId: string,
      options?: { overwriteLocalChanges?: boolean },
      sources?: PluginMarketSource[],
    ) => service.updatePluginFromSource(pluginId, options, sources),
  );
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_UPDATE_METADATA,
    async (_event, pluginId: string, metadata) =>
      service.updatePluginMetadata(pluginId, metadata),
  );
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_DELETE,
    async (_event, id: string, options?: PluginDeleteOptions) =>
      deleteDesktopPlugin(service, id, options),
  );
  ipcMain.handle(IPC_CHANNELS.PLUGIN_DISTRIBUTE, async (_event, request) =>
    distributeDesktopPlugin(service, request),
  );
  ipcMain.handle(IPC_CHANNELS.PLUGIN_UNDISTRIBUTE, async (_event, request) =>
    removeDesktopPluginDistribution(service, request),
  );
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_IMPORT_CHILD_MCP,
    async (_event, pluginId: string) => {
      const result = importChildMcpServersForPlugin(service, pluginId);
      return {
        ...result,
        imported: result.imported.map(redactMcpServerConfig),
      };
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_PACKAGE_HEALTH_CHECK,
    async (_event, pluginId: string) =>
      service.checkInstalledPluginPackage(pluginId),
  );
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_VERSION_GET_ALL,
    async (_event, pluginId: string) => {
      if (typeof pluginId !== "string" || pluginId.trim().length === 0) {
        throw new Error("plugin:versionGetAll requires a non-empty pluginId");
      }
      return service.getPluginVersions(pluginId);
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_VERSION_CREATE,
    async (_event, pluginId: string, note?: string) => {
      if (typeof pluginId !== "string" || pluginId.trim().length === 0) {
        throw new Error("plugin:versionCreate requires a non-empty pluginId");
      }
      if (note !== undefined && typeof note !== "string") {
        throw new Error("plugin:versionCreate expects note to be a string");
      }
      return service.createPluginVersion(pluginId, note);
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_VERSION_ROLLBACK,
    async (_event, pluginId: string, version: number) => {
      if (typeof pluginId !== "string" || pluginId.trim().length === 0) {
        throw new Error("plugin:versionRollback requires a non-empty pluginId");
      }
      if (typeof version !== "number" || !Number.isFinite(version)) {
        throw new Error(
          "plugin:versionRollback requires version to be a finite number",
        );
      }
      return service.rollbackPluginVersion(pluginId, version);
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_VERSION_DELETE,
    async (_event, pluginId: string, versionId: string) => {
      if (typeof pluginId !== "string" || pluginId.trim().length === 0) {
        throw new Error("plugin:versionDelete requires a non-empty pluginId");
      }
      if (typeof versionId !== "string" || versionId.trim().length === 0) {
        throw new Error("plugin:versionDelete requires a non-empty versionId");
      }
      return service.deletePluginVersion(pluginId, versionId);
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_DISTRIBUTION_STATUS,
    (_event, pluginId?: unknown) => {
      if (
        pluginId !== undefined &&
        (typeof pluginId !== "string" || !pluginId.trim())
      )
        throw new Error("Invalid Plugin status identifier");
      const plugins = service
        .read()
        .plugins.filter(
          (plugin) => pluginId === undefined || plugin.id === pluginId,
        );
      return readPluginDistributionStatus(plugins, {
        resolvePath: resolveAgentPluginTargetPath,
        nativeRegistered: (targetId, plugin) =>
          isNativePluginRegistered(plugin, targetId),
        includeContent: pluginId !== undefined,
      });
    },
  );
  ipcMain.handle(IPC_CHANNELS.PLUGIN_TARGET_MATRIX, async () =>
    attachTargetInventory(service),
  );
}
