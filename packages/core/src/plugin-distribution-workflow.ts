import type { CorePluginLibraryService } from "./plugin-library";
import type {
  PluginDistributedTarget,
  PluginLibraryEntry,
  PluginDistributeRequest,
  PluginDistributeResult,
  PluginUndistributeRequest,
  PluginUndistributeResult,
  PluginTargetFailure,
} from "@prompthub/shared/types/plugin";

export interface PluginNativeLifecycle {
  install(
    plugin: PluginLibraryEntry,
    target: PluginDistributedTarget,
  ): Promise<void>;
  uninstall(plugin: PluginLibraryEntry, targetId: string): Promise<void>;
}

function currentPlugin(service: CorePluginLibraryService, id: string) {
  const library = service.read();
  const plugin = library.plugins.find((entry) => entry.id === id);
  if (!plugin) throw new Error(`Plugin does not exist: ${id}`);
  return { library, plugin };
}

/** Each target commits independently; failures never hide already completed targets. */
export async function distributeManagedPlugin(
  service: CorePluginLibraryService,
  request: PluginDistributeRequest,
  native: PluginNativeLifecycle,
): Promise<PluginDistributeResult> {
  if (!request.targetIds.length)
    throw new Error("At least one Plugin target is required");
  currentPlugin(service, request.pluginId);
  const targets: PluginDistributedTarget[] = [],
    failures: PluginTargetFailure[] = [];
  for (const targetId of new Set(request.targetIds)) {
    try {
      const completed = await service.runDistributionTargetOperation(
        request.pluginId,
        targetId,
        async () => {
          const prepared = service.preparePluginDistribution({
            ...request,
            targetIds: [targetId],
          });
          for (const target of prepared.targets)
            await native.install(prepared.plugin, target);
          return service.completePluginDistribution(prepared);
        },
      );
      targets.push(...completed.targets);
    } catch (error) {
      failures.push({
        targetId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { ...currentPlugin(service, request.pluginId), targets, failures };
}

export async function removeManagedPluginDistribution(
  service: CorePluginLibraryService,
  request: PluginUndistributeRequest,
  native: PluginNativeLifecycle,
): Promise<PluginUndistributeResult> {
  if (!request.targetIds.length)
    throw new Error("At least one Plugin target is required");
  const { plugin } = currentPlugin(service, request.pluginId);
  const removedTargetIds: string[] = [],
    skippedTargetIds: string[] = [],
    failures: PluginTargetFailure[] = [];
  for (const targetId of new Set(request.targetIds)) {
    if (!plugin.distributedTargetIds?.includes(targetId)) {
      skippedTargetIds.push(targetId);
      continue;
    }
    try {
      const removed = await service.runDistributionTargetOperation(
        request.pluginId,
        targetId,
        async () => {
          await native.uninstall(plugin, targetId);
          return service.removePluginDistribution({
            ...request,
            targetIds: [targetId],
          });
        },
      );
      removedTargetIds.push(...removed.removedTargetIds);
    } catch (error) {
      failures.push({
        targetId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    ...currentPlugin(service, request.pluginId),
    removedTargetIds,
    skippedTargetIds,
    failures,
  };
}
