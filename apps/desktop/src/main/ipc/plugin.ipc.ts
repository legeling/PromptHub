import { ipcMain } from "electron";
import path from "path";
import { CorePluginLibraryService } from "@prompthub/core";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import { getPlatformById } from "@prompthub/shared/constants/platforms";
import type { PluginLibraryEntry } from "@prompthub/shared/types/plugin";
import { getPlatformPluginDir } from "../services/skill-installer-utils";

const PLUGIN_TARGET_PLATFORM_IDS: Record<string, string> = {
  codex: "codex",
  "claude-code": "claude",
  cursor: "cursor",
  "gemini-cli": "gemini",
  kiro: "kiro",
  "github-copilot": "copilot",
};

function normalizePluginDirectorySegment(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "plugin"
  );
}

function resolveAgentPluginTargetPath(
  targetId: string,
  plugin: PluginLibraryEntry,
): string | undefined {
  const platformId = PLUGIN_TARGET_PLATFORM_IDS[targetId];
  if (!platformId) {
    return undefined;
  }
  const platform = getPlatformById(platformId);
  if (!platform) {
    return undefined;
  }

  const pluginBaseDir = getPlatformPluginDir(platform);
  const pluginName = normalizePluginDirectorySegment(
    plugin.name || plugin.displayName || plugin.id,
  );
  const pluginVersion = normalizePluginDirectorySegment(
    plugin.version || plugin.id.replace(/:/g, "-"),
  );
  return path.join(pluginBaseDir, pluginName, pluginVersion);
}

export function registerPluginIPC(
  service = new CorePluginLibraryService({
    materializePackages: true,
    resolvePluginTargetPath: resolveAgentPluginTargetPath,
  }),
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
  ipcMain.handle(IPC_CHANNELS.PLUGIN_DISTRIBUTE, async (_event, request) =>
    service.distributePlugin(request),
  );
  ipcMain.handle(IPC_CHANNELS.PLUGIN_TARGET_MATRIX, async () =>
    service.getTargetMatrix(),
  );
}
