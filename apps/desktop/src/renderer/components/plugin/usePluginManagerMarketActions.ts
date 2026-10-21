import type {
  PluginMarketEntry,
  PluginTargetCompatibility,
  PluginTargetInstalledPlugin,
} from "@prompthub/shared/types/plugin";
import { useTranslation } from "react-i18next";
import { copyTextToClipboard } from "../../utils/clipboard";
import { useToast } from "../ui/Toast";
import type { PluginManagerBindings } from "./usePluginManagerBindings";
import type { PluginManagerState } from "./usePluginManagerState";
import {
  getErrorMessage,
  getPluginInstallErrorMessage,
} from "./plugin-manager-utils";

interface PluginManagerMarketActionOptions {
  bindings: PluginManagerBindings;
  showToast: ReturnType<typeof useToast>["showToast"];
  state: PluginManagerState;
  t: ReturnType<typeof useTranslation>["t"];
}

function useMarketInstallAction(options: PluginManagerMarketActionOptions) {
  const { bindings, showToast, state, t } = options;
  return async (entry: PluginMarketEntry) => {
    state.setInstallingId(entry.id);
    showToast(t("skill.installing"), "info");
    try {
      const result = await bindings.pluginStore.installMarketPlugin(entry.id);
      showToast(
        t("plugin.installSuccess", {
          defaultValue: "Installed {{name}}",
          name: result.plugin.displayName,
        }),
      );
      state.setDetailMarketEntry((current) =>
        current?.id === entry.id ? null : current,
      );
    } catch (error) {
      showToast(getPluginInstallErrorMessage(error, t), "error");
    } finally {
      state.setInstallingId(null);
    }
  };
}

function useTargetPluginImportAction(
  options: PluginManagerMarketActionOptions,
) {
  const { bindings, showToast, state, t } = options;
  return async (
    target: PluginTargetCompatibility,
    plugin: PluginTargetInstalledPlugin,
  ) => {
    if (!plugin.sourcePath) {
      showToast(
        t(
          "plugin.importAgentPluginMissingPath",
          "This Agent Plugin does not expose a local package path.",
        ),
        "error",
      );
      return;
    }
    state.setImportingTargetPluginId(plugin.id);
    try {
      const result = await bindings.pluginStore.importLocalPluginPackage({
        sourcePath: plugin.sourcePath,
        sourceTargetId: target.id,
        sourceTargetName: target.displayName,
      });
      showToast(
        t("plugin.importAgentPluginSuccess", {
          defaultValue: "Imported {{name}} to My Plugins",
          name: result.plugin.displayName,
        }),
      );
    } catch (error) {
      showToast(getPluginInstallErrorMessage(error, t), "error");
    } finally {
      state.setImportingTargetPluginId(null);
    }
  };
}

function useMarketPreviewAction(options: PluginManagerMarketActionOptions) {
  const { bindings, showToast, state } = options;
  return async (entry: PluginMarketEntry) => {
    state.setPreviewingId(entry.id);
    try {
      await bindings.pluginStore.previewMarketPlugin(entry.id);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      state.setPreviewingId(null);
    }
  };
}

function useMarketDetailAction(
  marketPreviews: PluginManagerBindings["pluginStore"]["marketPreviews"],
  setDetailMarketEntry: PluginManagerState["setDetailMarketEntry"],
  handlePreview: (entry: PluginMarketEntry) => Promise<void>,
) {
  return (entry: PluginMarketEntry) => {
    setDetailMarketEntry(entry);
    if (!marketPreviews[entry.id]) void handlePreview(entry);
  };
}

function useCodexLinkCopyAction(options: PluginManagerMarketActionOptions) {
  const { bindings, showToast, t } = options;
  return async (entry: PluginMarketEntry) => {
    const link =
      bindings.pluginStore.marketPreviews[entry.id]?.codexDetailUrl ??
      entry.codexDetailUrl;
    if (!link) return;
    try {
      await copyTextToClipboard(link);
      showToast(t("plugin.codexLinkCopied", "Copied Codex link"));
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };
}

export function usePluginManagerMarketActions(
  options: PluginManagerMarketActionOptions,
) {
  const handleInstall = useMarketInstallAction(options);
  const handleImportTargetPlugin = useTargetPluginImportAction(options);
  const handlePreview = useMarketPreviewAction(options);
  const handleOpenMarketDetail = useMarketDetailAction(
    options.bindings.pluginStore.marketPreviews,
    options.state.setDetailMarketEntry,
    handlePreview,
  );
  const handleCopyCodexLink = useCodexLinkCopyAction(options);
  return {
    handleInstall,
    handleImportTargetPlugin,
    handleOpenMarketDetail,
    handleCopyCodexLink,
  };
}
