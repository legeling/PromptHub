import { ipcMain } from "electron";
import {
  CorePluginLibraryService,
  emptyPluginInventory,
} from "@prompthub/core";
import {
  CodexPluginService,
  validateCodexPluginMutation,
} from "@prompthub/core/codex-plugins/service";
import { CodexPluginError } from "@prompthub/core/codex-plugins/error";
import { getPluginNativeMarketplaceName } from "@prompthub/core/plugin-library/shared";
import type { CodexInstalledPlugin } from "@prompthub/shared/types/codex-plugin";
import type {
  PluginLibraryEntry,
  PluginNativeMutationResult,
  PluginTargetCompatibility,
  PluginTargetInstalledPlugin,
} from "@prompthub/shared/types/plugin";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import { createDesktopCodexPluginService } from "../services/codex-plugin-service";
import { removeDesktopPluginDistribution } from "../services/desktop-plugin-distribution";
import {
  buildTargetPlugin,
  pluginInventoryTotal,
  scanInstalledPluginsForTarget,
} from "./plugin-target-inventory";

export function mapCodexInstalledPlugins(
  plugins: CodexInstalledPlugin[],
  library: PluginLibraryEntry[],
): PluginTargetInstalledPlugin[] {
  const managedIds = new Map(
    library.map((entry) => [
      `${entry.name}@${getPluginNativeMarketplaceName(entry.id)}`,
      entry.id,
    ]),
  );
  return plugins.map((plugin) => {
    const metadata = plugin.sourcePath
      ? buildTargetPlugin(
          "codex",
          plugin.sourcePath,
          plugin.name,
          [".codex-plugin/plugin.json"],
          false,
        )
      : null;
    return {
      ...metadata,
      id: `codex:${plugin.pluginId}`,
      name: plugin.name,
      displayName: metadata?.displayName ?? plugin.name,
      version: plugin.version,
      sourcePath: plugin.sourcePath,
      inventory: metadata?.inventory ?? emptyPluginInventory(),
      nativeCodex: plugin,
      managedPluginId: managedIds.get(plugin.pluginId),
    };
  });
}

function targetWithPlugins(
  target: PluginTargetCompatibility,
  plugins: PluginTargetInstalledPlugin[],
): PluginTargetCompatibility {
  return {
    ...target,
    installedPlugins: plugins,
    installedInventoryCount: plugins.reduce(
      (sum, plugin) => sum + pluginInventoryTotal(plugin.inventory),
      0,
    ),
    inventoryError: undefined,
  };
}

export async function attachTargetInventory(
  service: CorePluginLibraryService,
  native = createDesktopCodexPluginService(),
): Promise<PluginTargetCompatibility[]> {
  const library = service.read().plugins;
  return Promise.all(
    service.getTargetMatrix().map(async (target) => {
      if (target.id !== "codex") {
        const plugins = scanInstalledPluginsForTarget(target.id);
        return plugins.length ? targetWithPlugins(target, plugins) : target;
      }
      try {
        return targetWithPlugins(
          target,
          mapCodexInstalledPlugins(await native.list(), library),
        );
      } catch (error) {
        return {
          ...target,
          installedPlugins: [],
          inventoryError:
            error instanceof CodexPluginError ? error.code : "read-failed",
        };
      }
    }),
  );
}

export async function mutateCodexPlugin(
  service: CorePluginLibraryService,
  input: unknown,
  native: CodexPluginService = createDesktopCodexPluginService(),
): Promise<PluginNativeMutationResult> {
  try {
    const request = validateCodexPluginMutation(input);
    const target = service
      .getTargetMatrix()
      .find((entry) => entry.id === "codex");
    if (!target) throw new CodexPluginError("runtime-missing");
    const library = service.read().plugins;
    const managed = library.find(
      (plugin) =>
        `${plugin.name}@${getPluginNativeMarketplaceName(plugin.id)}` ===
          request.pluginId && plugin.distributedTargetIds?.includes("codex"),
    );
    let after: CodexInstalledPlugin[];
    if (managed && request.operation === "uninstall") {
      const result = await removeDesktopPluginDistribution(service, {
        pluginId: managed.id,
        targetIds: ["codex"],
      });
      if (result.failures?.length)
        throw new CodexPluginError("operation-failed");
      after = await native.list();
      if (after.some((plugin) => plugin.pluginId === request.pluginId))
        throw new CodexPluginError("verification-failed");
    } else {
      after = await native.mutate(request);
    }
    const currentLibrary = service.read();
    return {
      success: true,
      target: targetWithPlugins(
        target,
        mapCodexInstalledPlugins(after, currentLibrary.plugins),
      ),
      library: currentLibrary,
    };
  } catch (error) {
    return {
      success: false,
      errorCode:
        error instanceof CodexPluginError ? error.code : "operation-failed",
    };
  }
}

export function registerCodexPluginIPC(
  service: CorePluginLibraryService,
): void {
  ipcMain.handle(IPC_CHANNELS.PLUGIN_CODEX_MUTATE, (_event, request: unknown) =>
    mutateCodexPlugin(service, request),
  );
}
