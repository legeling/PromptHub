import fs from "node:fs";
import path from "node:path";
import { DatabaseAdapter } from "@prompthub/db";
import { PluginStorage } from "./plugin-storage";
import { collectPluginPackageFiles } from "./canonical-plugin-library";
import { materializePluginResourceBundle } from "./plugin-resource-schema";
import { encodeCanonicalResourceDirectory } from "./canonical-resource-path";
import type { PluginVersion } from "@prompthub/shared/types/plugin";

export function materializePortablePlugins(
  databasePath: string,
  root: string,
  target: string,
): void {
  const database = new DatabaseAdapter(databasePath, { readOnly: true });
  try {
    const storage = new PluginStorage(database, root);
    const histories = new Map<string, PluginVersion[]>();
    for (const version of storage.readVersions()) {
      const group = histories.get(version.pluginId) ?? [];
      group.push(version);
      histories.set(version.pluginId, group);
    }
    fs.mkdirSync(target, { recursive: true, mode: 0o700 });
    for (const plugin of storage.read())
      materializePluginResourceBundle({
        bundlePath: path.join(
          target,
          encodeCanonicalResourceDirectory(plugin.id),
        ),
        plugin,
        versions: histories.get(plugin.id) ?? [],
        packageFiles: plugin.localPackagePath
          ? collectPluginPackageFiles(plugin.localPackagePath)
          : [],
      });
  } finally {
    database.close();
  }
}
