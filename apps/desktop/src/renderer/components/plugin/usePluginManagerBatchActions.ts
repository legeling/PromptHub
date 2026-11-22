import { useTranslation } from "react-i18next";
import type {
  PluginLibraryEntry,
  PluginMarketEntry,
} from "@prompthub/shared/types/plugin";
import { useToast } from "../ui/Toast";
import type { PluginManagerBindings } from "./usePluginManagerBindings";
import type { PluginManagerState } from "./usePluginManagerState";
import type { PluginBatchTagMode } from "./plugin-manager-utils";
import {
  getPluginBatchInstallResultMessage,
  getPluginInstallErrorMessage,
  getPluginUserTags,
  updatePluginUserTags,
} from "./plugin-manager-utils";

interface PluginManagerBatchActionOptions {
  selectedInstallEntries: PluginMarketEntry[];
  selectedInstalledMarketPlugins: PluginLibraryEntry[];
  selectedLibraryPlugins: PluginLibraryEntry[];
  selectedLibraryPluginsAllFavorite: boolean;
  selectedMarketEntryCount: number;
  bindings: PluginManagerBindings;
  showToast: ReturnType<typeof useToast>["showToast"];
  state: PluginManagerState;
  t: ReturnType<typeof useTranslation>["t"];
}

async function updatePluginDetail(
  plugin: PluginLibraryEntry,
  metadata: Parameters<
    PluginManagerBindings["pluginStore"]["updatePluginMetadata"]
  >[1],
  bindings: PluginManagerBindings,
  state: PluginManagerState,
) {
  const library = await bindings.pluginStore.updatePluginMetadata(
    plugin.id,
    metadata,
  );
  const updatedPlugin =
    library.plugins.find((entry) => entry.id === plugin.id) ?? null;
  if (updatedPlugin)
    state.setDetailLibraryPlugin((current) =>
      current?.id === updatedPlugin.id ? updatedPlugin : current,
    );
}

function useBatchInstallAction(options: PluginManagerBatchActionOptions) {
  const { bindings, selectedInstallEntries, showToast, state, t } = options;
  return async () => {
    if (selectedInstallEntries.length === 0)
      return showToast(
        t("plugin.batchNoInstallTargets", "No plugins to install"),
      );
    state.setIsBatchInstalling(true);
    let succeeded = 0;
    let failed = 0;
    let firstFailure = "";
    for (const entry of selectedInstallEntries) {
      state.setInstallingId(entry.id);
      try {
        await bindings.pluginStore.installMarketPlugin(entry.id);
        succeeded += 1;
      } catch (error) {
        const explainedFailure = getPluginInstallErrorMessage(error, t);
        console.error("Plugin batch install failed:", explainedFailure);
        failed += 1;
        firstFailure ||= explainedFailure;
      }
    }
    state.setInstallingId(null);
    state.setIsBatchInstalling(false);
    state.setSelectedMarketEntryIds(new Set());
    bindings.pluginStore.setSelectedTab("market");
    showToast(
      getPluginBatchInstallResultMessage({
        failed,
        firstFailure,
        succeeded,
        t,
      }),
      failed > 0 ? "error" : "success",
    );
  };
}

function useBatchUpdateAction(options: PluginManagerBatchActionOptions) {
  const {
    bindings,
    selectedInstalledMarketPlugins,
    selectedMarketEntryCount,
    showToast,
    state,
    t,
  } = options;
  return async () => {
    if (selectedInstalledMarketPlugins.length === 0) {
      state.setBatchMarketUpdateConfirmOpen(false);
      return showToast(
        t("plugin.batchNoUpdateTargets", "No installed Plugins to update"),
        "info",
      );
    }
    state.setIsBatchUpdating(true);
    let succeeded = 0;
    let skipped =
      selectedMarketEntryCount - selectedInstalledMarketPlugins.length;
    let failed = 0;
    for (const plugin of selectedInstalledMarketPlugins) {
      try {
        const result = await bindings.pluginStore.updatePluginFromSource(
          plugin.id,
        );
        result.status === "updated" || result.status === "up-to-date"
          ? (succeeded += 1)
          : (skipped += 1);
      } catch (error) {
        console.error("Plugin batch update failed:", error);
        failed += 1;
      }
    }
    state.setIsBatchUpdating(false);
    state.setBatchMarketUpdateConfirmOpen(false);
    state.setSelectedMarketEntryIds(new Set());
    showToast(
      t("plugin.batchStoreUpdateResult", {
        defaultValue:
          "Batch update finished: {{succeeded}} succeeded, {{skipped}} skipped, {{failed}} failed",
        failed,
        skipped,
        succeeded,
      }),
      failed > 0 ? "error" : "success",
    );
  };
}

function useBatchRemoveAction(options: PluginManagerBatchActionOptions) {
  const {
    bindings,
    selectedInstalledMarketPlugins,
    selectedMarketEntryCount,
    showToast,
    state,
    t,
  } = options;
  return async () => {
    if (selectedInstalledMarketPlugins.length === 0) {
      state.setBatchMarketRemoveConfirmOpen(false);
      return showToast(
        t("plugin.batchNoRemoveTargets", "No installed Plugins to remove"),
        "info",
      );
    }
    state.setIsBatchRemovingMarket(true);
    let failed = 0;
    for (const plugin of selectedInstalledMarketPlugins) {
      try {
        await bindings.pluginStore.deletePlugin(plugin.id);
      } catch (error) {
        console.error("Plugin store batch remove failed:", error);
        failed += 1;
      }
    }
    const succeeded = selectedInstalledMarketPlugins.length - failed;
    const skipped =
      selectedMarketEntryCount - selectedInstalledMarketPlugins.length;
    state.setIsBatchRemovingMarket(false);
    state.setBatchMarketRemoveConfirmOpen(false);
    state.setSelectedMarketEntryIds(new Set());
    showToast(
      t("plugin.batchStoreRemoveResult", {
        defaultValue:
          "Batch remove finished: {{succeeded}} succeeded, {{skipped}} skipped, {{failed}} failed",
        failed,
        skipped,
        succeeded,
      }),
      failed > 0 ? "error" : "success",
    );
  };
}

function useBatchDeleteAction(options: PluginManagerBatchActionOptions) {
  const { bindings, selectedLibraryPlugins, showToast, state, t } = options;
  return async () => {
    if (selectedLibraryPlugins.length === 0)
      return state.setBatchDeleteConfirmOpen(false);
    state.setIsDeleting(true);
    let failed = 0;
    for (const plugin of selectedLibraryPlugins) {
      try {
        await bindings.pluginStore.deletePlugin(
          plugin.id,
          state.removeDistributedOnBatchDelete
            ? { removeDistributedTargets: true }
            : undefined,
        );
      } catch (error) {
        console.error("Plugin batch delete failed:", error);
        failed += 1;
      }
    }
    state.setIsDeleting(false);
    state.setBatchDeleteConfirmOpen(false);
    state.setRemoveDistributedOnBatchDelete(false);
    state.setSelectedLibraryPluginIds(new Set());
    showToast(
      t("plugin.batchDeleteResult", {
        defaultValue:
          "Batch delete finished: {{succeeded}} succeeded, {{failed}} failed",
        failed,
        succeeded: selectedLibraryPlugins.length - failed,
      }),
      failed > 0 ? "error" : "success",
    );
  };
}

function useBatchFavoriteAction(options: PluginManagerBatchActionOptions) {
  const {
    bindings,
    selectedLibraryPlugins,
    selectedLibraryPluginsAllFavorite,
    showToast,
    state,
    t,
  } = options;
  return async () => {
    if (selectedLibraryPlugins.length === 0) return;
    const nextFavoriteState = !selectedLibraryPluginsAllFavorite;
    const result = await updateMatchingPlugins(
      selectedLibraryPlugins,
      (plugin) => plugin.isFavorite !== nextFavoriteState,
      (plugin) =>
        updatePluginDetail(
          plugin,
          { isFavorite: nextFavoriteState },
          bindings,
          state,
        ),
    );
    state.setSelectedLibraryPluginIds(new Set());
    showToast(
      result.failed > 0
        ? t("plugin.batchFavoritePartialFailure", {
            defaultValue: "{{updated}} updated, {{failed}} failed",
            failed: result.failed,
            updated: result.updated,
          })
        : t("plugin.batchFavoriteSuccess", {
            count: result.updated,
            defaultValue: "Updated {{count}} Plugin(s)",
          }),
      result.failed > 0 ? "error" : "success",
    );
  };
}

function useBatchTagAction(options: PluginManagerBatchActionOptions) {
  const { bindings, selectedLibraryPlugins, showToast, state, t } = options;
  return async (tag: string, mode: PluginBatchTagMode) => {
    const result = await updateMatchingPlugins(
      selectedLibraryPlugins,
      (plugin) =>
        JSON.stringify(updatePluginUserTags(plugin.userTags, tag, mode)) !==
        JSON.stringify(getPluginUserTags(plugin)),
      (plugin) =>
        updatePluginDetail(
          plugin,
          { userTags: updatePluginUserTags(plugin.userTags, tag, mode) },
          bindings,
          state,
        ),
    );
    state.setSelectedLibraryPluginIds(new Set(result.failedIds));
    showToast(
      result.failed > 0
        ? t("plugin.batchTagPartialFailure", {
            defaultValue: "{{updated}} updated, {{failed}} failed",
            failed: result.failed,
            updated: result.updated,
          })
        : t("plugin.batchTagSuccess", {
            count: result.updated,
            defaultValue: "Updated {{count}} Plugin(s)",
          }),
      result.failed > 0 ? "error" : "success",
    );
    return result.failed === 0;
  };
}

async function updateMatchingPlugins(
  plugins: PluginLibraryEntry[],
  shouldUpdate: (plugin: PluginLibraryEntry) => boolean,
  update: (plugin: PluginLibraryEntry) => Promise<void>,
) {
  let updated = 0;
  const failedIds: string[] = [];
  for (const plugin of plugins) {
    if (!shouldUpdate(plugin)) continue;
    try {
      await update(plugin);
      updated += 1;
    } catch {
      failedIds.push(plugin.id);
    }
  }
  return { failed: failedIds.length, failedIds, updated };
}

export function usePluginManagerBatchActions(
  options: PluginManagerBatchActionOptions,
) {
  const handleBatchInstall = useBatchInstallAction(options);
  const handleBatchUpdateMarketPlugins = useBatchUpdateAction(options);
  const handleBatchRemoveMarketPlugins = useBatchRemoveAction(options);
  const handleBatchDelete = useBatchDeleteAction(options);
  const handleBatchFavorite = useBatchFavoriteAction(options);
  const handleBatchTagSubmit = useBatchTagAction(options);
  return {
    handleBatchInstall,
    handleBatchUpdateMarketPlugins,
    handleBatchRemoveMarketPlugins,
    handleBatchDelete,
    handleBatchFavorite,
    handleBatchTagSubmit,
  };
}
