import type { ManagedResourceSnapshot } from "@prompthub/shared/types/managed-resources";
import {
  managedPluginMetadataSchema,
  type ManagedResourceMutation,
} from "@prompthub/shared/utils/managed-resource-schema";
import { parsePluginResourceSnapshot } from "@prompthub/shared/utils/plugin-resource-snapshot";
import {
  readHostedPlugin,
  readHostedPluginFiles,
  writeHostedPlugin,
  snapshotHostedPlugin,
} from "./plugin-packages";
import { updatePluginSnapshotMetadata } from "./plugin-snapshot";
import { ManagedResourceError } from "./errors";

function importResources(
  value: unknown,
  files: boolean,
): ReturnType<typeof readHostedPluginFiles> {
  try {
    const resources = files
      ? readHostedPluginFiles(value)
      : [parsePluginResourceSnapshot(value)];
    if (resources.some((resource) => !resource.files.length))
      throw new Error("Plugin package is empty");
    return resources;
  } catch (cause) {
    throw new ManagedResourceError(
      422,
      `Invalid Plugin import: ${cause instanceof Error ? cause.message : "invalid package"}`,
    );
  }
}

export function mutateHostedPlugin(
  snapshot: ManagedResourceSnapshot,
  mutation: ManagedResourceMutation,
): void {
  if (
    mutation.action === "import-files" ||
    mutation.action === "import-package"
  ) {
    const resources = importResources(
      mutation.value,
      mutation.action === "import-files",
    );
    if (
      resources.some((resource) =>
        snapshot.pluginLibrary?.plugins.some(
          (item) => item.id === resource.plugin.id,
        ),
      )
    )
      throw new ManagedResourceError(409, "Plugin already exists");
    for (const resource of resources) writeHostedPlugin(snapshot, resource);
    return;
  }
  if (mutation.action === "create")
    throw new ManagedResourceError(
      422,
      "Import a complete Plugin package instead of metadata alone",
    );
  if (!snapshot.pluginLibrary?.plugins.some((item) => item.id === mutation.id))
    throw new ManagedResourceError(404, "Plugin not found");
  if (mutation.action === "delete") {
    snapshot.pluginLibrary.plugins = snapshot.pluginLibrary.plugins.filter(
      (item) => item.id !== mutation.id,
    );
    snapshot.pluginLibrary.updatedAt = new Date().toISOString();
    snapshot.pluginPackages = snapshot.pluginPackages?.filter(
      (item) => item.pluginId !== mutation.id,
    );
    updatePluginSnapshotMetadata(snapshot, mutation.id);
    return;
  }
  const resource = readHostedPlugin(snapshot, mutation.id);
  if (mutation.action === "update") {
    const metadata = managedPluginMetadataSchema.safeParse(mutation.value);
    if (!metadata.success)
      throw new ManagedResourceError(422, "Invalid Plugin metadata");
    resource.plugin = {
      ...resource.plugin,
      ...metadata.data,
      updatedAt: Date.now(),
    };
  } else if (mutation.action === "create-version")
    snapshotHostedPlugin(resource, mutation.note);
  else if (mutation.action === "delete-version") {
    if (!resource.versions.some((version) => version.id === mutation.versionId))
      throw new ManagedResourceError(404, "Plugin version not found");
    resource.versions = resource.versions.filter(
      (version) => version.id !== mutation.versionId,
    );
  } else {
    const version = resource.versions.find(
      (version) => version.version === mutation.version,
    );
    if (!version?.packageSnapshot)
      throw new ManagedResourceError(
        422,
        "Plugin version has no complete package snapshot",
      );
    snapshotHostedPlugin(resource, `Before restoring v${version.version}`);
    resource.plugin = { ...version.plugin, updatedAt: Date.now() };
    resource.files = version.packageSnapshot.files;
  }
  writeHostedPlugin(snapshot, resource);
}
