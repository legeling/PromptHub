import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  CopyPlusIcon,
  LinkIcon,
  Loader2Icon,
  PlugIcon,
  SearchIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  PluginDistributeMode,
  PluginLibraryEntry,
  PluginTargetCompatibility,
} from "@prompthub/shared/types/plugin";
import { Modal } from "../ui/Modal";
import { notifyTaskResult } from "../../services/application-notifications";
import { useToast } from "../ui/Toast";
import { getPluginInstallErrorMessage } from "./plugin-manager-utils";
import { getPluginTargetMatrixForEntry } from "./plugin-detail-utils";

interface PluginLibraryDeployDialogProps {
  agentName: string;
  isOpen: boolean;
  onDistribute: (
    plugin: PluginLibraryEntry,
    targetIds: string[],
    mode: PluginDistributeMode,
  ) => Promise<void>;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  plugins: PluginLibraryEntry[];
  targets: PluginTargetCompatibility[];
}

function matchesPlugin(plugin: PluginLibraryEntry, query: string): boolean {
  if (!query) return true;
  return [
    plugin.name,
    plugin.displayName,
    plugin.description ?? "",
    plugin.author?.name ?? "",
    plugin.category ?? "",
    ...(plugin.tags ?? []),
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function isInstalledOnTargets(
  plugin: PluginLibraryEntry,
  targetIds: Set<string>,
): boolean {
  return (plugin.distributedTargetIds ?? []).some((id) => targetIds.has(id));
}

export function PluginLibraryDeployDialog({
  agentName,
  isOpen,
  onDistribute,
  onClose,
  onRefresh,
  plugins,
  targets,
}: PluginLibraryDeployDialogProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const applyingRef = useRef(false);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<PluginDistributeMode>("copy");
  const [isApplying, setIsApplying] = useState(false);
  const targetIds = useMemo(
    () => targets.filter((target) => target.enabled).map((target) => target.id),
    [targets],
  );
  const targetIdSet = useMemo(() => new Set(targetIds), [targetIds]);
  const hasInstallTarget = targetIds.length > 0;
  const canInstallPlugin = (plugin: PluginLibraryEntry): boolean =>
    hasInstallTarget &&
    getPluginTargetMatrixForEntry(targets, plugin)
      .filter((target) => targetIdSet.has(target.id))
      .every((target) => target.enabled);
  const filteredPlugins = useMemo(
    () =>
      plugins.filter((plugin) =>
        matchesPlugin(plugin, query.trim().toLowerCase()),
      ),
    [plugins, query],
  );
  const selectedPlugins = useMemo(
    () => plugins.filter((plugin) => selectedIds.has(plugin.id)),
    [plugins, selectedIds],
  );

  useEffect(() => {
    if (isOpen) return;
    setQuery("");
    setSelectedIds(new Set());
    setMode("copy");
    setIsApplying(false);
    applyingRef.current = false;
  }, [isOpen]);

  const togglePlugin = (plugin: PluginLibraryEntry): void => {
    if (
      !hasInstallTarget ||
      !canInstallPlugin(plugin) ||
      isInstalledOnTargets(plugin, targetIdSet) ||
      isApplying
    ) {
      return;
    }
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(plugin.id)) next.delete(plugin.id);
      else next.add(plugin.id);
      return next;
    });
  };

  const apply = async (): Promise<void> => {
    if (
      applyingRef.current ||
      selectedPlugins.length === 0 ||
      targetIds.length === 0 ||
      selectedPlugins.some((plugin) => !canInstallPlugin(plugin))
    ) {
      return;
    }
    applyingRef.current = true;
    setIsApplying(true);
    try {
      let installFailure: unknown = null;
      let completed = 0;
      for (const plugin of selectedPlugins) {
        try {
          await onDistribute(plugin, targetIds, mode);
          completed += 1;
        } catch (error) {
          installFailure = error;
          break;
        }
      }
      try {
        await onRefresh();
      } catch (error) {
        console.error("Plugin deployment inventory refresh failed:", error);
        if (!installFailure) {
          showToast(
            t(
              "plugin.installRefreshError",
              "The Plugin operation finished, but the list could not be refreshed. Refresh the page to verify the current status.",
            ),
            "error",
          );
          notifyTaskResult("resourceTask", "attention", "plugin", true);
          return;
        }
      }
      if (installFailure) {
        showToast(getPluginInstallErrorMessage(installFailure, t), "error");
        notifyTaskResult(
          "resourceTask",
          completed > 0 ? "attention" : "error",
          "plugin",
          true,
        );
        return;
      }
      notifyTaskResult("resourceTask", "success", "plugin");
      onClose();
    } finally {
      applyingRef.current = false;
      setIsApplying(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      showCloseButton
      title={t("plugin.addPluginToAgent", "Add Plugin")}
      subtitle={
        plugins.length === 0
          ? undefined
          : t("plugin.installMyPluginToAgentHint", {
              agent: agentName,
              defaultValue:
                "Select one or more Plugins from My Plugins and install them into {{agent}}.",
            })
      }
    >
      {plugins.length === 0 ? (
        <div className="space-y-5">
          <div className="flex min-h-56 items-center justify-center rounded-md border border-dashed border-border px-6 text-center text-sm text-muted-foreground">
            {t("plugin.noPluginsAvailable", "No Plugins available")}
          </div>
          <div className="flex justify-end border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-md border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-accent"
            >
              {t("common.close", "Close")}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {!hasInstallTarget ? (
            <div
              role="status"
              className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
            >
              {t(
                "plugin.agentPluginInstallUnsupported",
                "This Agent does not support Plugin installation.",
              )}
            </div>
          ) : null}
          <section className="rounded-md border border-border p-4">
            <div className="mb-3 text-xs font-medium uppercase text-muted-foreground">
              {t("skill.importMode", "Install mode")}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(["copy", "symlink"] as const).map((option) => {
                const selected = mode === option;
                const Icon = option === "copy" ? CopyPlusIcon : LinkIcon;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    disabled={!hasInstallTarget || isApplying}
                    onClick={() => setMode(option)}
                    className={`flex min-h-20 items-start gap-3 rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      selected
                        ? "border-primary/50 bg-primary/5"
                        : "border-border bg-accent/30 hover:bg-accent/50"
                    }`}
                  >
                    <Icon
                      aria-hidden="true"
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        selected ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">
                        {option === "copy"
                          ? t("skill.copy", "Copy")
                          : t("skill.symlink", "Symlink")}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {option === "copy"
                          ? t("plugin.copyModeDesc")
                          : t("plugin.symlinkModeDesc")}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-md border border-border p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs font-medium uppercase text-muted-foreground">
                  {t("plugin.selectPlugin", "Select Plugin")}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(
                    "plugin.selectPluginsToAgentHint",
                    "Choose one or more Plugins to install into this Agent.",
                  )}
                </p>
              </div>
              <label className="relative block w-full sm:w-72">
                <SearchIcon
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  aria-label={t("agents.searchAssets", "Search assets")}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  placeholder={t("agents.searchAssets", "Search assets")}
                />
              </label>
            </div>

            {filteredPlugins.length === 0 ? (
              <div className="mt-4 rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                {t("plugin.noFilteredAgentPlugins", "No matching Plugins")}
              </div>
            ) : (
              <div
                data-testid="plugin-library-deploy-grid"
                className="mt-4 grid max-h-[390px] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3"
              >
                {filteredPlugins.map((plugin) => {
                  const installed = isInstalledOnTargets(plugin, targetIdSet);
                  const selected = selectedIds.has(plugin.id);
                  const compatible = canInstallPlugin(plugin);
                  return (
                    <button
                      key={plugin.id}
                      type="button"
                      aria-label={plugin.displayName || plugin.name}
                      aria-pressed={installed ? undefined : selected}
                      disabled={installed || isApplying || !compatible}
                      onClick={() => togglePlugin(plugin)}
                      className={`flex min-h-36 flex-col justify-between rounded-md border p-4 text-left transition-colors ${
                        selected
                          ? "border-primary/50 bg-primary/5"
                          : installed
                            ? "border-border bg-accent/20 opacity-60"
                            : "border-border bg-accent/30 hover:bg-accent/50"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="flex items-start justify-between gap-2">
                          <span className="truncate text-sm font-semibold">
                            {plugin.displayName || plugin.name}
                          </span>
                          {installed ? (
                            <span className="shrink-0 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
                              {t(
                                "plugin.alreadyOnAgent",
                                "Already on this Agent",
                              )}
                            </span>
                          ) : null}
                        </span>
                        {!compatible &&
                        targets.some(
                          (target) => target.requiresNativeManifest,
                        ) ? (
                          <span className="mt-2 block text-xs text-muted-foreground">
                            {t(
                              "plugin.targetDescriptions.nativeManifestRequired",
                              { name: agentName },
                            )}
                          </span>
                        ) : null}
                        <span className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
                          {plugin.description || plugin.name}
                        </span>
                      </span>
                      <span className="mt-3 flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[10px] text-muted-foreground">
                          {plugin.version || plugin.name}
                        </span>
                        <span
                          aria-hidden="true"
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                            selected
                              ? "border-primary bg-primary text-white"
                              : "border-muted-foreground/30"
                          }`}
                        >
                          {selected ? <CheckIcon className="h-3 w-3" /> : null}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">
              {t("skill.selectedCount", { count: selectedIds.size })}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isApplying}
                className="h-10 rounded-md border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-60"
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                type="button"
                onClick={() => void apply()}
                disabled={
                  selectedIds.size === 0 ||
                  isApplying ||
                  !hasInstallTarget ||
                  selectedPlugins.some((plugin) => !canInstallPlugin(plugin))
                }
                className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
              >
                {isApplying ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <PlugIcon className="h-4 w-4" />
                )}
                {t("plugin.installSelectedToAgent", {
                  count: selectedIds.size,
                  defaultValue: "Install {{count}} selected Plugin(s)",
                })}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
