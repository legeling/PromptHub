import { getPlatformById } from "@prompthub/shared/constants/platforms";
import type {
  PluginDistributedTarget,
  PluginLibraryEntry,
} from "@prompthub/shared/types/plugin";
import {
  installNativePlugin as install,
  uninstallNativePlugin as uninstall,
  type PluginNativeInstallationOptions as CoreOptions,
} from "@prompthub/core/plugin-native-installation";
import { getPlatformRootDir } from "./skill-installer-utils";

export type PluginNativeInstallationOptions = Omit<CoreOptions, "getRoot"> & {
  getRoot?: CoreOptions["getRoot"];
};

function coreOptions(options: PluginNativeInstallationOptions): CoreOptions {
  return {
    ...options,
    getRoot:
      options.getRoot ??
      ((id) => {
        const platform = getPlatformById(id);
        if (!platform) throw new Error(`Unknown Plugin platform: ${id}`);
        return getPlatformRootDir(platform);
      }),
  };
}

export function installNativePlugin(
  plugin: PluginLibraryEntry,
  target: PluginDistributedTarget,
  options: PluginNativeInstallationOptions = {},
): Promise<void> {
  return install(plugin, target, coreOptions(options));
}

export function uninstallNativePlugin(
  plugin: PluginLibraryEntry,
  targetId: string,
  options: PluginNativeInstallationOptions = {},
): Promise<void> {
  return uninstall(plugin, targetId, coreOptions(options));
}
