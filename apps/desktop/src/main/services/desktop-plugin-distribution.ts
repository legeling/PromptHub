import type { CorePluginLibraryService } from "@prompthub/core";
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
  const prepared = service.preparePluginDistribution(request);
  // Record each target only after its native installation succeeds. Earlier successful targets remain usable if a later target fails.
  for (const target of prepared.targets) {
    await installNativePlugin(prepared.plugin, target, options);
    service.completePluginDistribution({ ...prepared, targets: [target] });
  }
  const library = service.read();
  const plugin = library.plugins.find(
    (entry) => entry.id === prepared.plugin.id,
  );
  if (!plugin)
    throw new Error(
      `Plugin disappeared during distribution: ${prepared.plugin.id}`,
    );
  return { ...prepared, plugin, library };
}

export async function removeDesktopPluginDistribution(
  service: CorePluginLibraryService,
  request: PluginUndistributeRequest,
  options: PluginNativeInstallationOptions = {},
): Promise<PluginUndistributeResult> {
  const plugin = service
    .read()
    .plugins.find((entry) => entry.id === request.pluginId);
  if (!plugin) throw new Error(`Plugin does not exist: ${request.pluginId}`);
  for (const targetId of request.targetIds) {
    if (plugin.distributedTargetIds?.includes(targetId))
      await uninstallNativePlugin(plugin, targetId, options);
  }
  return service.removePluginDistribution(request);
}

export async function deleteDesktopPlugin(
  service: CorePluginLibraryService,
  id: string,
  options: PluginDeleteOptions = {},
): Promise<PluginLibraryFile> {
  const plugin = service.read().plugins.find((entry) => entry.id === id);
  if (plugin && options.removeDistributedTargets) {
    for (const targetId of plugin.distributedTargetIds ?? [])
      await uninstallNativePlugin(plugin, targetId);
  }
  return service.deletePlugin(id, options);
}
