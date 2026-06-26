import type {
  PluginLibraryEntry,
  PluginTargetCompatibility,
  PluginTargetInstalledPlugin,
} from "@prompthub/shared/types/plugin";

export interface AgentPluginDetailContext {
  isManaged?: boolean;
  platformId: string;
  platformName: string;
  sourcePath: string;
}

export function buildAgentDetailPlugin(params: {
  managedPlugin?: PluginLibraryEntry | null;
  plugin: PluginTargetInstalledPlugin;
  target: PluginTargetCompatibility;
}): PluginLibraryEntry {
  const { managedPlugin, plugin, target } = params;
  const now = Date.now();

  return {
    id: `agent:${target.id}:${plugin.name.toLowerCase()}`,
    name: plugin.name,
    displayName: plugin.displayName,
    description:
      plugin.description ||
      managedPlugin?.description ||
      "No description provided",
    longDescription: managedPlugin?.longDescription,
    iconUrl: managedPlugin?.iconUrl,
    logoUrl: managedPlugin?.logoUrl,
    brandColor: managedPlugin?.brandColor,
    version: plugin.version || managedPlugin?.version,
    author: managedPlugin?.author,
    category: managedPlugin?.category,
    trustLevel: managedPlugin?.trustLevel ?? "custom",
    inventory: plugin.inventory,
    classification: managedPlugin?.classification ?? "bundle",
    source: {
      kind: "local",
      sourceId: target.id,
      label: target.displayName,
      localRepositoryPath: plugin.sourcePath,
      localPackagePath: plugin.sourcePath,
      url: plugin.sourcePath,
    },
    homepage: managedPlugin?.homepage,
    repository: managedPlugin?.repository,
    managedPath: plugin.sourcePath,
    localRepositoryPath: plugin.sourcePath,
    localPackagePath: plugin.sourcePath,
    installedAt: managedPlugin?.installedAt ?? now,
    updatedAt: managedPlugin?.updatedAt ?? now,
  };
}
