import { ipcMain } from "electron";
import { registerMcpVersionIPC } from "./mcp-version.ipc";
import {
  getMcpTargetPresets,
  type McpTargetPreset,
} from "@prompthub/core";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
import { isMcpTargetKind } from "@prompthub/shared/types/mcp";
import {
  mergeMcpLibraryFromTransport,
  redactMcpLibraryForTransport,
  redactMcpServerConfig,
} from "@prompthub/shared/utils/mcp-config";
import { SkillInstaller } from "../services/skill-installer";
import { getBuiltinAgentOverride } from "../services/skill-installer-utils";
import {
  authorizeMcpMarketFetch,
  readRegisteredMcpMarketSources,
  replaceCustomMcpMarketSources,
} from "@prompthub/core/mcp-market-source-registry";
import type {
  McpApplyTarget,
  McpCreateFromSourceRequest,
  McpCreateFromSourceResult,
  McpLibraryFile,
  McpEnvImportResult,
  McpImportResult,
  McpMarketTemplate,
  McpMarketFetchRequest,
  McpMarketSource,
  McpMarketUpdateResult,
  McpRemoveTargetNames,
  McpServerDraft,
  McpTargetSyncOptions,
  McpTargetKind,
  McpTargetScope,
} from "@prompthub/shared/types/mcp";
import { createDesktopMcpLibraryService } from "../services/desktop-mcp-library";
import { exportMcpStorageFiles, restoreMcpStorageFiles } from "../services/mcp-storage-file-snapshot";

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

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return items.length > 0 ? Array.from(new Set(items)) : undefined;
}

function normalizeMcpTargetSyncOptions(
  value: unknown,
): McpTargetSyncOptions | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return {
    disabledPlatformIds: normalizeStringArray(record.disabledPlatformIds),
    includeDisabled: record.includeDisabled === true,
    recreateMissing: record.recreateMissing === true,
    forceConflicts: record.forceConflicts === true,
    targetBindingIds: normalizeStringArray(record.targetBindingIds),
  };
}

function assertNonEmptyIdentifier(
  identifier: unknown,
  channel: string,
): string {
  if (typeof identifier !== "string" || identifier.trim().length === 0) {
    throw new Error(`${channel} requires a non-empty server identifier`);
  }
  return identifier.trim();
}

function redactMcpImportResult(result: McpImportResult): McpImportResult {
  return {
    ...result,
    imported: result.imported.map(redactMcpServerConfig),
  };
}

function redactMcpCreateFromSourceResult(
  result: McpCreateFromSourceResult,
): McpCreateFromSourceResult {
  return {
    ...result,
    imported: result.imported.map(redactMcpServerConfig),
  };
}

function redactMcpEnvImportResult(
  result: McpEnvImportResult,
): McpEnvImportResult {
  return { ...result, server: redactMcpServerConfig(result.server) };
}

function redactMcpMarketUpdateResult(
  result: McpMarketUpdateResult,
): McpMarketUpdateResult {
  return { ...result, server: redactMcpServerConfig(result.server) };
}

export function registerMcpIPC(
  service = createDesktopMcpLibraryService(),
): void {
  registerMcpVersionIPC(service);
  ipcMain.handle(IPC_CHANNELS.MCP_LIBRARY_GET, async () =>
    redactMcpLibraryForTransport(service.readForTransport()),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_LIBRARY_REPLACE,
    async (_event, library: McpLibraryFile) =>
      redactMcpLibraryForTransport(
        service.write(mergeMcpLibraryFromTransport(service.readForTransport(), library)),
      ),
  );
  ipcMain.handle(IPC_CHANNELS.MCP_LIBRARY_EXPORT_FILES, async () =>
    exportMcpStorageFiles(),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_LIBRARY_RESTORE_FILES,
    async (_event, files) => {
      restoreMcpStorageFiles(files);
    },
  );
  ipcMain.handle(IPC_CHANNELS.MCP_MARKET_LIST, async () =>
    service.getMarketTemplates(),
  );
  ipcMain.handle(IPC_CHANNELS.MCP_MARKET_SOURCES, async () =>
    readRegisteredMcpMarketSources(),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_MARKET_SOURCES_REPLACE,
    async (_event, sources: McpMarketSource[]) =>
      replaceCustomMcpMarketSources(Array.isArray(sources) ? sources : []),
  );
  ipcMain.handle(IPC_CHANNELS.MCP_TARGET_PRESETS, async () =>
    getMcpTargetPresets(undefined, undefined, undefined, Object.fromEntries(
      SKILL_PLATFORMS.map(({ id }) => [id, getBuiltinAgentOverride(id) ?? {}]),
    )),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_SERVER_CREATE,
    async (_event, draft: McpServerDraft) =>
      redactMcpServerConfig(service.createServer(draft)),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_SERVER_CREATE_FROM_SOURCE,
    async (_event, request: McpCreateFromSourceRequest) =>
      redactMcpCreateFromSourceResult(service.createFromSource(request)),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_SERVER_UPDATE,
    async (_event, id: string, draft: McpServerDraft) =>
      redactMcpServerConfig(service.updateServer(id, draft)),
  );
  ipcMain.handle(IPC_CHANNELS.MCP_SERVER_DELETE, async (_event, id: string) =>
    redactMcpLibraryForTransport(service.deleteServer(id)),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_TEMPLATE_INSTALL,
    async (_event, templateId: string) =>
      redactMcpServerConfig(service.installTemplate(templateId)),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_MARKET_INSTALL_TEMPLATE,
    async (_event, template: McpMarketTemplate) =>
      redactMcpServerConfig(service.installMarketTemplate(template)),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_MARKET_CHECK_UPDATE,
    async (_event, identifier: string, template: McpMarketTemplate) =>
      service.checkMarketTemplateUpdate(identifier, template),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_MARKET_APPLY_UPDATE,
    async (
      _event,
      identifier: string,
      template: McpMarketTemplate,
      force?: boolean,
    ) =>
      redactMcpMarketUpdateResult(
        service.updateFromMarketTemplate(identifier, template, force === true),
      ),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_FETCH_REMOTE_CONTENT,
    async (_event, request: McpMarketFetchRequest) => {
      if (
        !request ||
        typeof request !== "object" ||
        typeof request.sourceId !== "string" ||
        typeof request.url !== "string" ||
        request.url.trim().length === 0
      ) {
        throw new Error("mcp:fetchRemoteContent requires a non-empty url");
      }
      const authorized = authorizeMcpMarketFetch(request.sourceId, request.url);
      return await SkillInstaller.fetchRemoteContent(authorized.url, {
        allowPrivateNetwork: authorized.allowPrivateNetwork,
        allowInsecurePrivateNetworkHttp:
          authorized.allowInsecurePrivateNetworkHttp,
      });
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
    async (_event, filePath: string) =>
      redactMcpImportResult(service.importFromFile(filePath)),
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
    ) =>
      redactMcpEnvImportResult(
        service.importEnvForServer(identifier, envFilePath, selectedKeys),
      ),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_TARGET_SYNC_CHECK,
    async (_event, identifier: string, options?: McpTargetSyncOptions) =>
      service.checkServerTargetSync(
        assertNonEmptyIdentifier(
          identifier,
          IPC_CHANNELS.MCP_TARGET_SYNC_CHECK,
        ),
        normalizeMcpTargetSyncOptions(options),
      ),
  );
  ipcMain.handle(
    IPC_CHANNELS.MCP_TARGET_SYNC_APPLY,
    async (_event, identifier: string, options?: McpTargetSyncOptions) =>
      service.syncServerToBoundTargets(
        assertNonEmptyIdentifier(
          identifier,
          IPC_CHANNELS.MCP_TARGET_SYNC_APPLY,
        ),
        normalizeMcpTargetSyncOptions(options),
      ),
  );
}
