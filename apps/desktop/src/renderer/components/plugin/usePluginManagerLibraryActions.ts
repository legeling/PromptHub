import type {
  PluginDistributeMode,
  PluginLibraryEntry,
  PluginTargetCompatibility,
} from "@prompthub/shared/types/plugin";
import { useTranslation } from "react-i18next";
import { useToast } from "../ui/Toast";
import type { PluginManagerBindings } from "./usePluginManagerBindings";
import type { PluginManagerState } from "./usePluginManagerState";
import {
  getErrorMessage,
  getPluginLocalPackagePath,
} from "./plugin-manager-utils";

interface PluginManagerLibraryActionOptions {
  selectedLibraryPlugins: PluginLibraryEntry[];
  bindings: PluginManagerBindings;
  showToast: ReturnType<typeof useToast>["showToast"];
  state: PluginManagerState;
  t: ReturnType<typeof useTranslation>["t"];
}

function replaceLibraryPluginInLocalViews(
  plugin: PluginLibraryEntry,
  state: PluginManagerState,
) {
  state.setDetailLibraryPlugin((current) =>
    current?.id === plugin.id ? plugin : current,
  );
  state.setAgentTargetPicker((current) =>
    current?.plugins.some((entry) => entry.id === plugin.id)
      ? {
          ...current,
          plugins: current.plugins.map((entry) =>
            entry.id === plugin.id ? plugin : entry,
          ),
        }
      : current,
  );
}

function useOpenLibraryAgentTargetsAction(state: PluginManagerState) {
  return (plugin: PluginLibraryEntry) =>
    state.setAgentTargetPicker({ plugins: [plugin], targetIds: [] });
}

function useOpenBatchLibraryAgentTargetsAction(
  selectedLibraryPlugins: PluginLibraryEntry[],
  state: PluginManagerState,
) {
  return () => {
    if (selectedLibraryPlugins.length > 0)
      state.setAgentTargetPicker({
        plugins: selectedLibraryPlugins,
        targetIds: [],
      });
  };
}

function useOpenBatchTagDialogAction(
  selectedLibraryPlugins: PluginLibraryEntry[],
  state: PluginManagerState,
) {
  return () => {
    if (selectedLibraryPlugins.length > 0) state.setBatchTagDialogOpen(true);
  };
}

function useDistributePluginAction(options: PluginManagerLibraryActionOptions) {
  const { bindings, state } = options;
  return async (
    plugin: PluginLibraryEntry,
    targetIds: string[],
    mode: PluginDistributeMode,
  ) => {
    const result = await bindings.pluginStore.distributePlugin(
      plugin.id,
      targetIds,
      mode,
    );
    const distributedPlugin = result.library.plugins.find(
      (entry) => entry.id === plugin.id,
    );
    if (distributedPlugin)
      replaceLibraryPluginInLocalViews(distributedPlugin, state);
  };
}

function useRemovePluginDistributionAction(
  options: PluginManagerLibraryActionOptions,
) {
  const { bindings, showToast, state, t } = options;
  return async (
    plugin: PluginLibraryEntry,
    target: PluginTargetCompatibility,
  ) => {
    if (state.removingLibraryPluginId) return;
    state.setRemovingLibraryPluginId(plugin.id);
    try {
      const result = await bindings.pluginStore.removePluginDistribution(
        plugin.id,
        [target.id],
      );
      const updatedPlugin =
        result.library.plugins.find((entry) => entry.id === plugin.id) ?? null;
      if (updatedPlugin) replaceLibraryPluginInLocalViews(updatedPlugin, state);
      showToast(
        t("plugin.removePluginFromAgentSuccess", {
          agent: target.displayName,
          defaultValue: "Removed Plugin from {{agent}}",
        }),
        "success",
      );
    } catch (error) {
      console.error("Failed to remove Plugin distribution:", error);
      showToast(getErrorMessage(error), "error");
      throw error;
    } finally {
      state.setRemovingLibraryPluginId(null);
    }
  };
}

function useOpenLibraryFolderAction() {
  return (plugin: PluginLibraryEntry) => {
    const localPath = getPluginLocalPackagePath(plugin);
    if (localPath) void window.electron?.openPath?.(localPath);
  };
}

function useToggleFavoriteAction(options: PluginManagerLibraryActionOptions) {
  const { bindings, showToast, state } = options;
  return async (plugin: PluginLibraryEntry) => {
    try {
      const library = await bindings.pluginStore.updatePluginMetadata(
        plugin.id,
        { isFavorite: plugin.isFavorite !== true },
      );
      const updatedPlugin =
        library.plugins.find((entry) => entry.id === plugin.id) ?? null;
      if (updatedPlugin) replaceLibraryPluginInLocalViews(updatedPlugin, state);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };
}

function useDeletePluginAction(options: PluginManagerLibraryActionOptions) {
  const { bindings, showToast, state, t } = options;
  return async () => {
    const plugin = state.deleteTarget;
    if (!plugin) return;
    state.setIsDeleting(true);
    try {
      await bindings.pluginStore.deletePlugin(
        plugin.id,
        state.removeDistributedOnDelete
          ? { removeDistributedTargets: true }
          : undefined,
      );
      showToast(
        t("plugin.deleteSuccess", {
          defaultValue: "Deleted {{name}}",
          name: plugin.displayName,
        }),
      );
      state.setDetailLibraryPlugin(null);
      state.setDeleteTarget(null);
      state.setRemoveDistributedOnDelete(false);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      state.setIsDeleting(false);
    }
  };
}

export function usePluginManagerLibraryActions(
  options: PluginManagerLibraryActionOptions,
) {
  const handleOpenLibraryAgentTargets = useOpenLibraryAgentTargetsAction(
    options.state,
  );
  const handleOpenBatchLibraryAgentTargets =
    useOpenBatchLibraryAgentTargetsAction(
      options.selectedLibraryPlugins,
      options.state,
    );
  const handleOpenBatchTagDialog = useOpenBatchTagDialogAction(
    options.selectedLibraryPlugins,
    options.state,
  );
  const handleDistributePlugin = useDistributePluginAction(options);
  const handleRemovePluginDistribution =
    useRemovePluginDistributionAction(options);
  const handleOpenLibraryFolder = useOpenLibraryFolderAction();
  const handleToggleFavorite = useToggleFavoriteAction(options);
  const handleDelete = useDeletePluginAction(options);
  return {
    handleOpenLibraryAgentTargets,
    handleOpenBatchLibraryAgentTargets,
    handleOpenBatchTagDialog,
    handleDistributePlugin,
    handleRemovePluginDistribution,
    handleOpenLibraryFolder,
    handleToggleFavorite,
    handleDelete,
  };
}
