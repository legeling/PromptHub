import { ipcMain } from "electron";
import path from "path";
import {
  CoreMcpLibraryService,
  getMcpLibraryFilePath,
  getMcpTargetPresets,
  type McpTargetPreset,
} from "@prompthub/core";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import { isMcpTargetKind } from "@prompthub/shared/types/mcp";
import { SkillInstaller } from "../services/skill-installer";
import {
  exportAgentAssetDirectorySnapshot,
  restoreAgentAssetDirectorySnapshot,
} from "../services/agent-asset-file-snapshot";
import type {
  McpApplyTarget,
  McpCreateFromSourceRequest,
  McpLibraryFile,
  McpMarketTemplate,
  McpRemoveTargetNames,
  McpServerDraft,
  McpTargetKind,
  McpTargetScope,
} from "@prompthub/shared/types/mcp";

const MCP_TARGET_SCOPES = new Set<McpTargetScope>([
  "global",
  "workspace",
  "custom",
]);

function normalizeMcpTargetPresetPayload(
  presets: unknown,
): McpTargetPreset[] | undefined {
  if (!Array.isArray(presets)) {
    return undefined;
  }

  return presets.flatMap((preset): McpTargetPreset[] => {
    if (!preset || typeof preset !== "object" || Array.isArray(preset)) {
      return [];
    }
    const record = preset as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      !isMcpTargetKind(record.target) ||
      typeof record.scope !== "string" ||
      !MCP_TARGET_SCOPES.has(record.scope as McpTargetScope) ||
      typeof record.label !== "string" ||
      typeof record.path !== "string" ||
      record.path.trim().length === 0
    ) {
      return [];
    }

    return [
      {
        id: record.id,
        target: record.target,
        scope: record.scope as McpTargetScope,
        label: record.label,
        path: record.path,
        platformId:
          typeof record.platformId === "string" ? record.platformId : undefined,
      },
    ];
  });
}

export function registerMcpIPC(service = new CoreMcpLibraryService()): void {
  ipcMain.handle(IPC_CHANNELS.MCP_LIBRARY_GET, async () => service.read());
  ipcMain.handle(
    IPC_CHANNELS.MCP_LIBRARY_REPLACE,
    async (_event, library: McpLibraryFile) => service.write(library),
  );
  ipcMain.handle(IPC_CHANNELS.MCP_LIBRARY_EXPORT_FILES, async () =>
    exportAgentAssetDirectorySnapshot(path.dirname(getMcpLibraryFilePath())),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_LIBRARY_RESTORE_FILES,
    async (_event, files) =>
      restoreAgentAssetDirectorySnapshot(
        path.dirname(getMcpLibraryFilePath()),
        Array.isArray(files) ? files : [],
      ),
  );
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
  ipcMain.handle(
    IPC_CHANNELS.MCP_TARGET_STATUS,
    async (_event, presets?: McpTargetPreset[]) =>
      service.getTargetStatus(normalizeMcpTargetPresetPayload(presets)),
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
