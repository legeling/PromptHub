import {
  BotIcon,
  CheckCircleIcon,
  CheckIcon,
  DownloadIcon,
  FolderOpenIcon,
  Loader2Icon,
  PackageIcon,
  RefreshCwIcon,
  SendIcon,
  StoreIcon,
  TrashIcon,
  XCircleIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  PluginLibraryEntry,
  PluginMarketEntry,
  PluginTargetCompatibility,
  PluginTargetInstalledPlugin,
} from "@prompthub/shared/types/plugin";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { PlatformIcon } from "../ui/PlatformIcon";
import { AgentPluginDetailPage } from "./AgentPluginDetailPage";
import { codexPluginErrorText } from "./codex-plugin-errors";
import {
  AGENT_PLUGIN_HEADER_CLASS,
  type AgentPluginFilter,
  InventoryChips,
  PluginAvatar,
  getAgentPluginFilterButtonClass,
  getPluginDisplayTags,
  getStatusLabel,
  getTargetDescription,
  getTargetPlatformIconId,
  getTargetUnsupportedTitle,
} from "./plugin-manager-utils";
import {
  type AgentPluginViewProps,
  useAgentPluginViewModel,
} from "./useAgentPluginViewModel";

function PluginLibraryRow({
  onDistribute,
  onRemoveDistribution,
  isRemovingDistribution = false,
  onOpenDetail,
  plugin,
  selectedTarget,
}: {
  onDistribute?: () => void;
  onRemoveDistribution?: () => void;
  isRemovingDistribution?: boolean;
  onOpenDetail: (plugin: PluginLibraryEntry) => void;
  plugin: PluginLibraryEntry;
  selectedTarget?: PluginTargetCompatibility | null;
}) {
  const { t } = useTranslation();
  const canDistribute = Boolean(selectedTarget?.enabled && onDistribute);
  const isDistributedToSelectedTarget = Boolean(
    selectedTarget &&
    (plugin.distributedTargetIds ?? []).includes(selectedTarget.id),
  );

  return (
    <article
      data-testid="agent-plugin-card"
      role="button"
      tabIndex={0}
      aria-label={t("plugin.openPluginDetail", {
        defaultValue: "Open Plugin details {{name}}",
        name: plugin.displayName,
      })}
      onClick={() => onOpenDetail(plugin)}
      onKeyDown={(event) => {
        if (event.currentTarget !== event.target) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpenDetail(plugin);
      }}
      className="group rounded-2xl border border-border app-wallpaper-surface transition-colors hover:border-primary/30 hover:bg-accent/30"
    >
      <div className="grid min-h-[124px] grid-cols-[minmax(0,1fr)_8rem] items-stretch gap-4 px-4 py-4 max-[760px]:grid-cols-1 max-[760px]:items-start">
        <div className="min-w-0 text-left">
          <div className="flex min-w-0 items-start gap-3">
            <PluginAvatar entry={plugin} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <div className="truncate text-base font-semibold text-foreground">
                  {plugin.displayName}
                </div>
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
                  <CheckCircleIcon aria-hidden="true" className="h-3 w-3" />
                  {t("plugin.inMyPlugins", "In My Plugins")}
                </span>
              </div>
              <div className="mt-1.5 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">
                {plugin.description ||
                  plugin.author?.name ||
                  t("plugin.noDescription", "No description provided")}
              </div>
              {plugin.localPackagePath || plugin.managedPath ? (
                <div className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
                  {plugin.localPackagePath ?? plugin.managedPath}
                </div>
              ) : null}
              <div className="mt-3">
                <InventoryChips inventory={plugin.inventory} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex w-full shrink-0 items-end justify-end gap-2 self-end justify-self-end max-[760px]:justify-start">
          {isDistributedToSelectedTarget &&
          selectedTarget &&
          onRemoveDistribution ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onRemoveDistribution();
              }}
              disabled={isRemovingDistribution}
              aria-label={t("plugin.removePluginFromAgent", {
                agent: selectedTarget.displayName,
                defaultValue: "Remove {{name}} from {{agent}}",
                name: plugin.displayName,
              })}
              title={t("plugin.removePluginFromAgent", {
                agent: selectedTarget.displayName,
                defaultValue: "Remove {{name}} from {{agent}}",
                name: plugin.displayName,
              })}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRemovingDistribution ? (
                <Loader2Icon
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin"
                />
              ) : (
                <TrashIcon aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
          ) : canDistribute && selectedTarget ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDistribute();
              }}
              aria-label={t("plugin.distributePluginToAgent", {
                agent: selectedTarget.displayName,
                defaultValue: "Distribute {{name}} to {{agent}}",
                name: plugin.displayName,
              })}
              title={t("plugin.distributePluginToAgent", {
                agent: selectedTarget.displayName,
                defaultValue: "Distribute {{name}} to {{agent}}",
                name: plugin.displayName,
              })}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <SendIcon aria-hidden="true" className="h-4 w-4" />
            </button>
          ) : null}
          {plugin.managedPath || plugin.localPackagePath ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void window.electron?.openPath?.(
                  plugin.localPackagePath ?? plugin.managedPath ?? "",
                );
              }}
              aria-label={t("plugin.openPluginFolder", "Open Plugin folder")}
              title={t("plugin.openPluginFolder", "Open Plugin folder")}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <FolderOpenIcon aria-hidden="true" className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function PluginTargetInstalledRow({
  isImported,
  isImporting,
  onImport,
  onOpenDetail,
  plugin,
}: {
  isImported?: boolean;
  isImporting?: boolean;
  onImport?: () => void;
  onOpenDetail: () => void;
  plugin: PluginTargetInstalledPlugin;
}) {
  const { t } = useTranslation();

  return (
    <article className="rounded-2xl border border-border app-wallpaper-surface px-4 py-4 transition-colors hover:border-primary/30 hover:bg-accent/30">
      <div className="flex min-w-0 items-start gap-3">
        <button
          type="button"
          onClick={onOpenDetail}
          aria-label={t("plugin.openPluginDetail", {
            defaultValue: "Open Plugin details {{name}}",
            name: plugin.displayName,
          })}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <PackageIcon aria-hidden="true" className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="truncate text-base font-semibold text-foreground">
                {plugin.displayName}
              </div>
              <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {t("plugin.inAgentPluginTarget", "Installed in Agent")}
              </span>
              {plugin.nativeCodex ? <span className="text-xs text-muted-foreground">{plugin.nativeCodex.marketplaceName} · {t(plugin.nativeCodex.enabled ? "common.enabled" : "common.disabled")}</span> : null}
            </div>
            <div className="mt-1.5 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">
              {plugin.description ||
                plugin.version ||
                t("plugin.noDescription", "No description provided")}
            </div>
            {plugin.sourcePath ? (
              <div className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
                {plugin.sourcePath}
              </div>
            ) : null}
            <div className="mt-3">
              <InventoryChips inventory={plugin.inventory} />
            </div>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {plugin.sourcePath && onImport ? (
            <button
              type="button"
              onClick={onImport}
              disabled={isImported || isImporting}
              aria-label={
                isImported
                  ? t("plugin.alreadyInMyPlugins", {
                      defaultValue: "{{name}} is already in My Plugins",
                      name: plugin.displayName,
                    })
                  : t("plugin.importAgentPluginToMyPlugins", {
                      defaultValue: "Import {{name}} to My Plugins",
                      name: plugin.displayName,
                    })
              }
              title={
                isImported
                  ? t("plugin.alreadyInMyPlugins", {
                      defaultValue: "{{name}} is already in My Plugins",
                      name: plugin.displayName,
                    })
                  : t("plugin.importToMyPlugins", "Import to My Plugins")
              }
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isImporting ? (
                <Loader2Icon
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin"
                />
              ) : isImported ? (
                <CheckIcon aria-hidden="true" className="h-4 w-4" />
              ) : (
                <DownloadIcon aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
          ) : null}
          {plugin.sourcePath ? (
            <button
              type="button"
              onClick={() =>
                void window.electron?.openPath?.(plugin.sourcePath)
              }
              aria-label={t("plugin.openPluginFolder", "Open Plugin folder")}
              title={t("plugin.openPluginFolder", "Open Plugin folder")}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <FolderOpenIcon aria-hidden="true" className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function AgentPluginView(props: AgentPluginViewProps) {
  const { t } = useTranslation();
  const {
    agentPluginFilter,
    agentPluginFilterCounts,
    importedTargetPluginKeys,
    importingTargetPluginId,
    installedPlugins,
    isLoading,
    onDistributeLibraryPlugin,
    onImportTargetPlugin,
    onOpenLibraryPlugin,
    onOpenStore,
    onRefresh,
    onRemoveLibraryPlugin,
    pendingRemoveLibraryPlugin,
    removingLibraryPluginId,
    selectedTarget,
    selectedTargetPlugin,
    selectedTargetPluginStillExists,
    setAgentPluginFilter,
    setPendingRemoveLibraryPlugin,
    setSelectedTargetId,
    setSelectedTargetPlugin,
    targetInstalledPlugins,
    targets,
    totalPluginCount,
    visibleFilteredPluginCount,
    visibleLibraryPlugins,
    visibleTargetInstalledPlugins,
  } = useAgentPluginViewModel(props);

  if (
    selectedTarget &&
    selectedTargetPlugin &&
    selectedTargetPluginStillExists
  ) {
    const managedPlugin = installedPlugins.find(
      (plugin) =>
        selectedTargetPlugin.nativeCodex
          ? plugin.id === selectedTargetPlugin.managedPluginId
          : plugin.name.toLowerCase() === selectedTargetPlugin.name.toLowerCase(),
    );
    return (
      <>
        <AgentPluginDetailPage
          isImporting={importingTargetPluginId === selectedTargetPlugin.id}
          managedPlugin={managedPlugin}
          onBack={() => setSelectedTargetPlugin(null)}
          onImport={() =>
            onImportTargetPlugin(selectedTarget, selectedTargetPlugin)
          }
          onOpenManagedPlugin={
            managedPlugin ? () => onOpenLibraryPlugin(managedPlugin) : undefined
          }
          onOpenFolder={() =>
            void window.electron?.openPath?.(
              selectedTargetPlugin.sourcePath ?? "",
            )
          }
          onOpenStore={onOpenStore}
          plugin={selectedTargetPlugin}
          target={selectedTarget}
        />
        <ConfirmDialog
          isOpen={Boolean(pendingRemoveLibraryPlugin)}
          onClose={() => setPendingRemoveLibraryPlugin(null)}
          onConfirm={() => {
            if (pendingRemoveLibraryPlugin && selectedTarget) {
              onRemoveLibraryPlugin(pendingRemoveLibraryPlugin, selectedTarget);
            }
          }}
          title={t(
            "plugin.removePluginFromAgentConfirmTitle",
            "Remove Plugin from Agent",
          )}
          message={t("plugin.removePluginFromAgentConfirmDescription", {
            agent: selectedTarget.displayName,
            defaultValue:
              "Remove {{name}} from {{agent}}? This only removes the distributed Agent Plugin package and keeps My Plugins unchanged.",
            name: pendingRemoveLibraryPlugin?.displayName ?? "",
          })}
          confirmText={t("plugin.removeFromAgent", "Remove from Agent")}
          cancelText={t("common.cancel", "Cancel")}
          variant="destructive"
          isLoading={
            pendingRemoveLibraryPlugin
              ? removingLibraryPluginId === pendingRemoveLibraryPlugin.id
              : false
          }
        />
      </>
    );
  }

  return (
    <>
      <div className="flex h-full min-h-0 overflow-hidden">
        <div className="flex min-h-0 w-80 shrink-0 flex-col border-r border-border app-wallpaper-panel-strong">
          <div
            data-testid="agent-plugin-sidebar-header"
            className={`${AGENT_PLUGIN_HEADER_CLASS} shrink-0`}
          >
            <div className="flex h-full items-start justify-between gap-4 px-4 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-foreground">
                  {t("plugin.pluginTargets", "Agent Plugin")}
                </h2>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {t(
                    "plugin.agentPluginSidebarHint",
                    "Browse Plugin-capable agents and manage bundle adapter targets.",
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={onRefresh}
                disabled={isLoading}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border app-wallpaper-surface text-muted-foreground transition-colors hover:text-primary disabled:opacity-60"
                title={t("common.refresh", "Refresh")}
              >
                <RefreshCwIcon
                  aria-hidden="true"
                  className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {targets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                <BotIcon className="mx-auto mb-3 h-10 w-10 opacity-30" />
                <div className="font-medium text-foreground">
                  {t("plugin.noAgentPluginTargets", "No Agent Plugin targets")}
                </div>
              </div>
            ) : (
              targets.map((target) => {
                const isActive = target.id === selectedTarget?.id;
                return (
                  <button
                    key={target.id}
                    type="button"
                    data-testid="agent-plugin-target-row"
                    onClick={() => {
                      setSelectedTargetPlugin(null);
                      setSelectedTargetId(target.id);
                      setAgentPluginFilter("all");
                    }}
                    className={`w-full rounded-2xl border px-3 py-3 text-left transition-colors ${
                      isActive
                        ? "border-primary/40 bg-primary/10"
                        : target.enabled
                          ? "border-border bg-background/60 hover:bg-muted"
                          : "border-border/70 bg-muted/30 opacity-70 hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                        <PlatformIcon
                          aria-hidden="true"
                          platformId={getTargetPlatformIconId(target.id)}
                          size={20}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">
                          {target.displayName}
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {target.enabled
                            ? getTargetDescription(target, t)
                            : getStatusLabel(target.status, t)}
                        </div>
                      </div>
                      <span
                        className={`ml-2 shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          target.enabled
                            ? "border-primary/20 bg-background/70 text-primary"
                            : "border-border bg-background/50 text-muted-foreground"
                        }`}
                      >
                        {getStatusLabel(target.status, t)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div
          key={selectedTarget?.id ?? "no-agent-plugin"}
          data-testid="agent-plugin-detail-shell"
          data-agent-id={selectedTarget?.id ?? ""}
          className="flex min-w-0 flex-1 flex-col app-wallpaper-section animate-in fade-in slide-in-from-right-3 duration-smooth"
        >
          <div
            data-testid="agent-plugin-detail-header"
            className={`${AGENT_PLUGIN_HEADER_CLASS} shrink-0`}
          >
            <div className="flex h-full flex-col gap-4 px-4 py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold text-foreground">
                    {selectedTarget?.displayName ??
                      t("plugin.pluginTargets", "Agent Plugin")}
                  </h3>
                  {selectedTarget?.inventoryError ? <p role="alert" className="mt-2 text-sm text-destructive">{codexPluginErrorText(selectedTarget.inventoryError, t)}</p> : null}
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {selectedTarget
                      ? selectedTarget.enabled
                        ? getTargetDescription(selectedTarget, t)
                        : getTargetUnsupportedTitle(selectedTarget, t)
                      : t(
                          "plugin.agentPluginTargetPending",
                          "Select an agent to inspect Plugin support.",
                        )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={isLoading}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border app-wallpaper-surface text-muted-foreground transition-colors hover:text-primary disabled:opacity-60"
                  title={t("common.refresh", "Refresh")}
                >
                  <RefreshCwIcon
                    aria-hidden="true"
                    className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                  />
                </button>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  data-testid="agent-plugin-filter-all"
                  aria-pressed={agentPluginFilter === "all"}
                  onClick={() => setAgentPluginFilter("all")}
                  className={getAgentPluginFilterButtonClass(
                    agentPluginFilter === "all",
                    "default",
                  )}
                >
                  {t("plugin.agentPluginFilterAll", {
                    count: agentPluginFilterCounts.all,
                    defaultValue: `${agentPluginFilterCounts.all} Plugins`,
                  })}
                </button>
                <button
                  type="button"
                  data-testid="agent-plugin-filter-my-plugins"
                  aria-pressed={agentPluginFilter === "my-plugins"}
                  onClick={() => setAgentPluginFilter("my-plugins")}
                  className={getAgentPluginFilterButtonClass(
                    agentPluginFilter === "my-plugins",
                    "managed",
                  )}
                >
                  {t("plugin.agentPluginFilterMyPlugins", {
                    count: agentPluginFilterCounts["my-plugins"],
                    defaultValue: `${agentPluginFilterCounts["my-plugins"]} My Plugins`,
                  })}
                </button>
                <button
                  type="button"
                  data-testid="agent-plugin-filter-agent-installed"
                  aria-pressed={agentPluginFilter === "agent-installed"}
                  onClick={() => setAgentPluginFilter("agent-installed")}
                  className={getAgentPluginFilterButtonClass(
                    agentPluginFilter === "agent-installed",
                    "external",
                  )}
                >
                  {t("plugin.agentPluginFilterAgentInstalled", {
                    count: agentPluginFilterCounts["agent-installed"],
                    defaultValue: `${agentPluginFilterCounts["agent-installed"]} installed in Agent`,
                  })}
                </button>
                <button
                  type="button"
                  data-testid="agent-plugin-filter-distributed"
                  aria-pressed={agentPluginFilter === "distributed"}
                  onClick={() => setAgentPluginFilter("distributed")}
                  className={getAgentPluginFilterButtonClass(
                    agentPluginFilter === "distributed",
                    "default",
                  )}
                >
                  {t("plugin.agentPluginFilterDistributed", {
                    count: agentPluginFilterCounts.distributed,
                    defaultValue: `${agentPluginFilterCounts.distributed} distributed`,
                  })}
                </button>
                <button
                  type="button"
                  data-testid="agent-plugin-filter-pending"
                  aria-pressed={agentPluginFilter === "pending"}
                  onClick={() => setAgentPluginFilter("pending")}
                  className={getAgentPluginFilterButtonClass(
                    agentPluginFilter === "pending",
                    "default",
                  )}
                >
                  {t("plugin.agentPluginFilterPending", {
                    count: agentPluginFilterCounts.pending,
                    defaultValue: `${agentPluginFilterCounts.pending} pending`,
                  })}
                </button>
              </div>
            </div>
          </div>

          <div
            data-testid="agent-plugin-list"
            className="min-h-0 flex-1 space-y-2 overflow-y-auto p-5"
          >
            {isLoading && targets.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                {t("common.loading", "Loading...")}
              </div>
            ) : !selectedTarget ? (
              <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                <BotIcon className="mx-auto mb-3 h-10 w-10 opacity-30" />
                <div className="font-medium text-foreground">
                  {t("plugin.noAgentPluginTargets", "No Agent Plugin targets")}
                </div>
              </div>
            ) : !selectedTarget.enabled ? (
              <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                <XCircleIcon className="mx-auto mb-3 h-10 w-10 opacity-30" />
                <div className="font-medium text-foreground">
                  {t("plugin.targetDisabledTitle", "Target not supported yet")}
                </div>
                <p className="mx-auto mt-2 max-w-lg">
                  {getTargetDescription(selectedTarget, t)}
                </p>
                {selectedTarget.installSurface ? (
                  <p className="mx-auto mt-3 max-w-lg font-mono text-xs">
                    {selectedTarget.installSurface}
                  </p>
                ) : null}
              </div>
            ) : totalPluginCount === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                <PackageIcon className="mx-auto mb-3 h-10 w-10 opacity-30" />
                <div className="font-medium text-foreground">
                  {t("plugin.noMyPluginsForAgent", "No My Plugins yet")}
                </div>
                <p className="mx-auto mt-2 max-w-lg">
                  {t(
                    "plugin.noMyPluginsForAgentDesc",
                    "Install Plugin bundles from the Official Store before distributing assets to this agent target.",
                  )}
                </p>
              </div>
            ) : visibleFilteredPluginCount === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                <PackageIcon className="mx-auto mb-3 h-10 w-10 opacity-30" />
                <div className="font-medium text-foreground">
                  {t("plugin.noFilteredAgentPlugins", "No matching Plugins")}
                </div>
                <p className="mx-auto mt-2 max-w-lg">
                  {t(
                    "plugin.noFilteredAgentPluginsDesc",
                    "Change the Agent Plugin filter to see other packages for this target.",
                  )}
                </p>
              </div>
            ) : (
              <>
                {visibleTargetInstalledPlugins.map((plugin) => (
                  <PluginTargetInstalledRow
                    key={plugin.id}
                    isImported={importedTargetPluginKeys.has(
                      `${selectedTarget.id}:${plugin.name.toLowerCase()}`,
                    )}
                    isImporting={importingTargetPluginId === plugin.id}
                    plugin={plugin}
                    onImport={() =>
                      onImportTargetPlugin(selectedTarget, plugin)
                    }
                    onOpenDetail={() => setSelectedTargetPlugin(plugin)}
                  />
                ))}
                {visibleLibraryPlugins.map((plugin) => (
                  <PluginLibraryRow
                    key={plugin.id}
                    plugin={plugin}
                    selectedTarget={selectedTarget}
                    isRemovingDistribution={
                      removingLibraryPluginId === plugin.id
                    }
                    onOpenDetail={onOpenLibraryPlugin}
                    onDistribute={
                      selectedTarget?.enabled
                        ? () =>
                            onDistributeLibraryPlugin(plugin, selectedTarget)
                        : undefined
                    }
                    onRemoveDistribution={
                      selectedTarget?.enabled
                        ? () => setPendingRemoveLibraryPlugin(plugin)
                        : undefined
                    }
                  />
                ))}
              </>
            )}
          </div>

          <div className="border-t border-border p-3">
            <button
              type="button"
              onClick={onOpenStore}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-primary/90"
            >
              <StoreIcon aria-hidden="true" className="h-4 w-4" />
              {t("plugin.openOfficialStore", "Open Official Store")}
            </button>
          </div>
        </div>
      </div>
      <ConfirmDialog
        isOpen={Boolean(pendingRemoveLibraryPlugin)}
        onClose={() => setPendingRemoveLibraryPlugin(null)}
        onConfirm={() => {
          if (pendingRemoveLibraryPlugin && selectedTarget) {
            onRemoveLibraryPlugin(pendingRemoveLibraryPlugin, selectedTarget);
          }
        }}
        title={t(
          "plugin.removePluginFromAgentConfirmTitle",
          "Remove Plugin from Agent",
        )}
        message={t("plugin.removePluginFromAgentConfirmDescription", {
          agent: selectedTarget?.displayName ?? "",
          defaultValue:
            "Remove {{name}} from {{agent}}? This only removes the distributed Agent Plugin package and keeps My Plugins unchanged.",
          name: pendingRemoveLibraryPlugin?.displayName ?? "",
        })}
        confirmText={t("plugin.removeFromAgent", "Remove from Agent")}
        cancelText={t("common.cancel", "Cancel")}
        variant="destructive"
        isLoading={
          pendingRemoveLibraryPlugin
            ? removingLibraryPluginId === pendingRemoveLibraryPlugin.id
            : false
        }
      />
    </>
  );
}

export function matchesPluginSearch(
  entry: PluginLibraryEntry | PluginMarketEntry,
  query: string,
): boolean {
  if (!query) {
    return true;
  }
  return [
    entry.name,
    entry.displayName,
    entry.description ?? "",
    entry.category ?? "",
    entry.trustLevel,
    entry.source.label ?? "",
    entry.source.repository ?? "",
    entry.source.packagePath ?? "",
    ...getPluginDisplayTags(entry),
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}
