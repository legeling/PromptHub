import type { CorePluginLibraryService } from "@prompthub/core";
import {
  distributeManagedPlugin,
  removeManagedPluginDistribution,
} from "@prompthub/core/plugin-distribution-workflow";
import type {
  PluginDistributeRequest,
  PluginDistributeResult,
  PluginUndistributeRequest,
  PluginUndistributeResult,
  PluginLibraryFile,
  PluginDeleteOptions,
} from "@prompthub/shared/types/plugin";
import {
  installNativePlugin,
  uninstallNativePlugin,
  type PluginNativeInstallationOptions,
} from "./plugin-native-installation";

export async function distributeDesktopPlugin(
  service: CorePluginLibraryService,
  request: PluginDistributeRequest,
  options: PluginNativeInstallationOptions = {},
): Promise<PluginDistributeResult> {
  return distributeManagedPlugin(service, request, {
    install: (plugin, target) => installNativePlugin(plugin, target, options),
    uninstall: (plugin, id) => uninstallNativePlugin(plugin, id, options),
  });
}

export async function removeDesktopPluginDistribution(
  service: CorePluginLibraryService,
  request: PluginUndistributeRequest,
  options: PluginNativeInstallationOptions = {},
): Promise<PluginUndistributeResult> {
  return removeManagedPluginDistribution(service, request, {
    install: (plugin, target) => installNativePlugin(plugin, target, options),
    uninstall: (plugin, id) => uninstallNativePlugin(plugin, id, options),
  });
}

export async function deleteDesktopPlugin(
  service: CorePluginLibraryService,
  id: string,
  options: PluginDeleteOptions = {},
): Promise<PluginLibraryFile> {
  const plugin = service.read().plugins.find((entry) => entry.id === id);
  if (plugin && options.removeDistributedTargets) {
    const ids = plugin.distributedTargetIds ?? [];
    if (ids.length) {
      const result = await removeDesktopPluginDistribution(service, {
        pluginId: id,
        targetIds: ids,
      });
      if (result.failures?.length)
        throw new Error(
          result.failures
            .map((failure) => `${failure.targetId}: ${failure.error}`)
            .join("; "),
        );
    }
  }
  return service.deletePlugin(id);
}
