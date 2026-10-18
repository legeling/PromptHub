import type {
  PluginLibraryEntry,
  PluginMetadataUpdate,
} from "@prompthub/shared/types/plugin";
import {
  CorePluginError,
  type CorePluginLibraryService,
} from "../plugin-library";
import {
  distributeManagedPlugin,
  removeManagedPluginDistribution,
  type PluginNativeLifecycle,
} from "../plugin-distribution-workflow";
import {
  ensureNoUnknownOptions,
  parseCsv,
  requirePositional,
  takeFlag,
  takeOption,
} from "./args";

const actions = new Set([
  "import",
  "metadata",
  "targets",
  "check",
  "check-update",
  "update",
  "rollback",
  "delete-version",
  "distribute",
  "redistribute",
  "undistribute",
]);

function finish(args: string[]): void {
  ensureNoUnknownOptions(args);
  if (args.length)
    throw new CorePluginError(
      "USAGE_ERROR",
      `Unexpected arguments: ${args.join(" ")}`,
    );
}

function versionArgument(args: string[]): number {
  const value = Number(takeOption(args, "--version"));
  if (!Number.isSafeInteger(value) || value < 1)
    throw new CorePluginError(
      "USAGE_ERROR",
      "A positive --version is required",
    );
  finish(args);
  return value;
}

function metadataArgument(args: string[]): PluginMetadataUpdate {
  const favorite = takeFlag(args, "--favorite");
  const unfavorite = takeFlag(args, "--unfavorite");
  if (favorite && unfavorite)
    throw new CorePluginError(
      "USAGE_ERROR",
      "Choose --favorite or --unfavorite",
    );
  const tags = takeOption(args, "--tags");
  const notes = takeOption(args, "--notes");
  finish(args);
  return {
    ...(favorite || unfavorite ? { isFavorite: favorite } : {}),
    ...(tags !== undefined ? { userTags: parseCsv(tags) ?? [] } : {}),
    ...(notes !== undefined ? { userNotes: notes } : {}),
  };
}

async function importPlugin(
  service: CorePluginLibraryService,
  args: string[],
): Promise<unknown> {
  const source = requirePositional(args, 0, "Plugin source");
  args.shift();
  const branch = takeOption(args, "--branch");
  const directory = takeOption(args, "--directory");
  finish(args);
  if (/^(https?:\/\/|ssh:\/\/|git@)/i.test(source))
    return service.importSourcePlugin({
      url: source,
      branch,
      packagePath: directory,
    });
  if (branch || directory)
    throw new CorePluginError(
      "USAGE_ERROR",
      "--branch and --directory require a Git source",
    );
  return service.importLocalPluginPackage({ sourcePath: source });
}

async function distribute(
  service: CorePluginLibraryService,
  plugin: PluginLibraryEntry,
  action: string,
  args: string[],
  native: PluginNativeLifecycle,
): Promise<unknown> {
  const targetIds = parseCsv(takeOption(args, "--targets")) ?? [];
  if (!targetIds.length)
    throw new CorePluginError("USAGE_ERROR", "Explicit --targets are required");
  if (action === "undistribute") {
    finish(args);
    return removeManagedPluginDistribution(
      service,
      { pluginId: plugin.id, targetIds },
      native,
    );
  }
  const mode = takeOption(args, "--mode") ?? "copy";
  if (mode !== "copy" && mode !== "symlink")
    throw new CorePluginError("USAGE_ERROR", "--mode must be copy or symlink");
  finish(args);
  if (
    action === "redistribute" &&
    targetIds.some((id) => !plugin.distributedTargetIds?.includes(id))
  )
    throw new CorePluginError(
      "INVALID_INPUT",
      "Redistribution only accepts existing targets",
    );
  return distributeManagedPlugin(
    service,
    { pluginId: plugin.id, targetIds, mode },
    native,
  );
}

interface Options {
  service: CorePluginLibraryService;
  resolve(identifier: string): PluginLibraryEntry;
  native: PluginNativeLifecycle;
}

export async function handlePluginManagement(
  action: string,
  args: string[],
  options: Options,
): Promise<{ value: unknown; failed?: boolean } | undefined> {
  if (!actions.has(action)) return undefined;
  const { service, resolve, native } = options;
  if (action === "import") return { value: await importPlugin(service, args) };
  if (action === "targets") {
    finish(args);
    return { value: service.getTargetMatrix() };
  }
  const plugin = resolve(requirePositional(args, 0, "Plugin id or name"));
  args.shift();
  if (action === "metadata")
    return {
      value: service.updatePluginMetadata(plugin.id, metadataArgument(args)),
    };
  if (action === "rollback") {
    const value = service.rollbackPluginVersion(
      plugin.id,
      versionArgument(args),
    );
    if (!value)
      throw new CorePluginError("NOT_FOUND", "Plugin version not found");
    return { value };
  }
  if (action === "delete-version") {
    const id = requirePositional(args, 0, "Version id");
    args.shift();
    finish(args);
    if (!service.deletePluginVersion(plugin.id, id))
      throw new CorePluginError("NOT_FOUND", "Plugin version not found");
    return { value: { deleted: true, pluginId: plugin.id, versionId: id } };
  }
  if (["distribute", "redistribute", "undistribute"].includes(action)) {
    const value = await distribute(service, plugin, action, args, native);
    return {
      value,
      failed: Boolean(
        value &&
        typeof value === "object" &&
        "failures" in value &&
        Array.isArray(value.failures) &&
        value.failures.length,
      ),
    };
  }
  const overwriteLocalChanges =
    action === "update" && takeFlag(args, "--force");
  finish(args);
  if (action === "check")
    return { value: service.checkInstalledPluginPackage(plugin.id) };
  if (action === "check-update")
    return { value: await service.getPluginSourceUpdateStatus(plugin.id) };
  return {
    value: await service.updatePluginFromSource(plugin.id, {
      overwriteLocalChanges,
    }),
  };
}
