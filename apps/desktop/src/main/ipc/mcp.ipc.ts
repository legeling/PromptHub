import { ipcMain } from "electron";
import { CoreMcpLibraryService, getMcpTargetPresets } from "@prompthub/core";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import { SkillInstaller } from "../services/skill-installer";
import type {
  McpApplyTarget,
  McpCreateFromSourceRequest,
  McpMarketTemplate,
  McpRemoveTargetNames,
  McpServerDraft,
  McpTargetKind,
} from "@prompthub/shared/types/mcp";

export function registerMcpIPC(service = new CoreMcpLibraryService()): void {
  ipcMain.handle(IPC_CHANNELS.MCP_LIBRARY_GET, async () => service.read());
  ipcMain.handle(IPC_CHANNELS.MCP_MARKET_LIST, async () =>
    service.getMarketTemplates(),
  );
  ipcMain.handle(IPC_CHANNELS.MCP_MARKET_SOURCES, async () =>
    service.getMarketSources(),
  );
  ipcMain.handle(IPC_CHANNELS.MCP_TARGET_PRESETS, async () =>
    getMcpTargetPresets(),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_SERVER_CREATE,
    async (_event, draft: McpServerDraft) => service.createServer(draft),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_SERVER_CREATE_FROM_SOURCE,
    async (_event, request: McpCreateFromSourceRequest) =>
      service.createFromSource(request),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_SERVER_UPDATE,
    async (_event, id: string, draft: McpServerDraft) =>
      service.updateServer(id, draft),
  );
  ipcMain.handle(IPC_CHANNELS.MCP_SERVER_DELETE, async (_event, id: string) =>
    service.deleteServer(id),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_TEMPLATE_INSTALL,
    async (_event, templateId: string) => service.installTemplate(templateId),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_MARKET_INSTALL_TEMPLATE,
    async (_event, template: McpMarketTemplate) =>
      service.installMarketTemplate(template),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_FETCH_REMOTE_CONTENT,
    async (_event, url: string) => {
      if (typeof url !== "string" || url.trim().length === 0) {
        throw new Error("mcp:fetchRemoteContent requires a non-empty url");
      }
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new Error("mcp:fetchRemoteContent received an invalid URL");
      }
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("mcp:fetchRemoteContent only allows http/https URLs");
      }
      return await SkillInstaller.fetchRemoteContent(url);
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_PREVIEW,
    async (_event, target: McpTargetKind, serverIds: string[]) =>
      service.preview(target, serverIds),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_APPLY,
    async (_event, target: McpApplyTarget) => service.apply(target),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_REMOVE,
    async (_event, target: McpApplyTarget) => service.removeFromTarget(target),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_REMOVE_NAMES,
    async (_event, target: McpRemoveTargetNames) =>
      service.removeNamesFromTarget(target),
  );
  ipcMain.handle(IPC_CHANNELS.MCP_TARGET_STATUS, async () =>
    service.getTargetStatus(),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_IMPORT_FILE,
    async (_event, filePath: string) => service.importFromFile(filePath),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_HEALTH_CHECK,
    async (_event, identifier: string) => service.checkServer(identifier),
  );
  ipcMain.handle(IPC_CHANNELS.MCP_HEALTH_CHECK_ALL, async () =>
    service.checkAllServers(),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_ENV_IMPORT,
    async (
      _event,
      identifier: string,
      envFilePath: string,
      selectedKeys?: string[],
    ) => service.importEnvForServer(identifier, envFilePath, selectedKeys),
  );
}
