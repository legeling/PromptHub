import { getPlatformById } from "@prompthub/shared/constants/platforms";
import type {
  PluginDistributedTarget,
  PluginLibraryEntry,
} from "@prompthub/shared/types/plugin";
import {
  isNativePluginRegistered as registered,
  installNativePlugin as install,
  uninstallNativePlugin as uninstall,
  type PluginNativeInstallationOptions as CoreOptions,
} from "@prompthub/core/plugin-native-installation";
import { getPlatformRootDir } from "./skill-installer-utils";
import { backupCodexPluginConfig } from "./codex-plugin-service";

export type PluginNativeInstallationOptions = Omit<CoreOptions, "getRoot"> & {
  getRoot?: CoreOptions["getRoot"];
};

function coreOptions(options: PluginNativeInstallationOptions): CoreOptions {
  return {
    ...options,
    beforeMutation: options.beforeMutation ?? (async (targetId, root) => {
      if (targetId === "codex") await backupCodexPluginConfig(root);
    }),
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

export function isNativePluginRegistered(
  plugin: PluginLibraryEntry,
  targetId: string,
): boolean {
  return registered(plugin, targetId, coreOptions({}));
}
