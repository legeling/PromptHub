import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import type {
  McpCreateFromSourceRequest,
  McpCreateFromSourceResult,
  McpEnvImportResult,
  McpHealthCheckResult,
  McpApplyResult,
  McpApplyTarget,
  McpImportResult,
  McpLibraryFile,
  McpMarketSource,
  McpMarketTemplate,
  McpMarketUpdateCheck,
  McpMarketUpdateResult,
  McpRemoveResult,
  McpRemoveTargetNames,
  McpServerConfig,
  McpServerDraft,
  McpTargetKind,
  McpTargetSyncApplyResult,
  McpTargetSyncCheck,
  McpTargetSyncOptions,
  McpTargetStatusEntry,
} from "@prompthub/shared/types/mcp";
import type { AgentAssetFileSnapshot } from "@prompthub/shared/types/sync";
import type { McpTargetPreset } from "@prompthub/core";

export const mcpApi = {
  listVersions: (
    id: string,
    options?: import("@prompthub/shared/types/mcp").McpVersionListOptions,
  ): Promise<import("@prompthub/shared/types/mcp").McpVersionPage> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_VERSION_LIST, id, options),
  getVersion: (
    id: string,
    version: number,
  ): Promise<import("@prompthub/shared/types/mcp").McpVersionDetail> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_VERSION_GET, id, version),
  compareVersions: (
    id: string,
    from: number,
    to: number,
  ): Promise<import("@prompthub/shared/types/mcp").McpVersionComparison> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_VERSION_COMPARE, id, from, to),
  createVersion: (
    id: string,
    note?: string,
  ): Promise<import("@prompthub/shared/types/mcp").McpVersionDetail> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_VERSION_CREATE, id, note),
  restoreVersion: (
    id: string,
    version: number,
  ): Promise<import("@prompthub/shared/types/mcp").McpVersionDetail> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_VERSION_RESTORE, id, version),
  updateVersionNote: (
    id: string,
    version: number,
    note: string,
  ): Promise<import("@prompthub/shared/types/mcp").McpVersionDetail> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_VERSION_NOTE, id, version, note),
  deleteVersion: (id: string, version: number): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_VERSION_DELETE, id, version),
  getLibrary: (): Promise<McpLibraryFile> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_LIBRARY_GET),
  replaceLibrary: (library: McpLibraryFile): Promise<McpLibraryFile> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_LIBRARY_REPLACE, library),
  exportDataFiles: (): Promise<AgentAssetFileSnapshot[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_LIBRARY_EXPORT_FILES),
  restoreDataFiles: (files: AgentAssetFileSnapshot[]): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_LIBRARY_RESTORE_FILES, files),
  listMarket: (): Promise<McpMarketTemplate[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_MARKET_LIST),
  listMarketSources: (): Promise<McpMarketSource[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_MARKET_SOURCES),
  replaceMarketSources: (
    sources: McpMarketSource[],
  ): Promise<McpMarketSource[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_MARKET_SOURCES_REPLACE, sources),
  fetchRemoteContent: (sourceId: string, url: string): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_FETCH_REMOTE_CONTENT, {
      sourceId,
      url,
    }),
  getTargetPresets: (): Promise<McpTargetPreset[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_TARGET_PRESETS),
  createServer: (draft: McpServerDraft): Promise<McpServerConfig> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_SERVER_CREATE, draft),
  createFromSource: (
    request: McpCreateFromSourceRequest,
  ): Promise<McpCreateFromSourceResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_SERVER_CREATE_FROM_SOURCE, request),
  updateServer: (id: string, draft: McpServerDraft): Promise<McpServerConfig> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_SERVER_UPDATE, id, draft),
  deleteServer: (id: string): Promise<McpLibraryFile> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_SERVER_DELETE, id),
  installTemplate: (templateId: string): Promise<McpServerConfig> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_TEMPLATE_INSTALL, templateId),
  installMarketTemplate: (
    template: McpMarketTemplate,
  ): Promise<McpServerConfig> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_MARKET_INSTALL_TEMPLATE, template),
  checkMarketUpdate: (
    identifier: string,
    template: McpMarketTemplate,
  ): Promise<McpMarketUpdateCheck> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.MCP_MARKET_CHECK_UPDATE,
      identifier,
      template,
    ),
  applyMarketUpdate: (
    identifier: string,
    template: McpMarketTemplate,
    force?: boolean,
  ): Promise<McpMarketUpdateResult> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.MCP_MARKET_APPLY_UPDATE,
      identifier,
      template,
      force,
    ),
  preview: (target: McpTargetKind, serverIds: string[]): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_PREVIEW, target, serverIds),
  apply: (target: McpApplyTarget): Promise<McpApplyResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_APPLY, target),
  remove: (target: McpApplyTarget): Promise<McpRemoveResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_REMOVE, target),
  removeNames: (target: McpRemoveTargetNames): Promise<McpRemoveResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_REMOVE_NAMES, target),
  getTargetStatus: (
    presets?: McpTargetPreset[],
  ): Promise<McpTargetStatusEntry[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_TARGET_STATUS, presets),
  importFile: (filePath: string): Promise<McpImportResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_IMPORT_FILE, filePath),
  checkServer: (identifier: string): Promise<McpHealthCheckResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_HEALTH_CHECK, identifier),
  checkAllServers: (): Promise<McpHealthCheckResult[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_HEALTH_CHECK_ALL),
  importEnv: (
    identifier: string,
    envFilePath: string,
    selectedKeys?: string[],
  ): Promise<McpEnvImportResult> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.MCP_ENV_IMPORT,
      identifier,
      envFilePath,
      selectedKeys,
    ),
  checkTargetSync: (
    identifier: string,
    options?: McpTargetSyncOptions,
  ): Promise<McpTargetSyncCheck[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_TARGET_SYNC_CHECK, identifier, options),
  syncTargets: (
    identifier: string,
    options?: McpTargetSyncOptions,
  ): Promise<McpTargetSyncApplyResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_TARGET_SYNC_APPLY, identifier, options),
};
