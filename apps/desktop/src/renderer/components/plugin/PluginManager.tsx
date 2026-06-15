import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BotIcon,
  CheckCircleIcon,
  CopyIcon,
  DownloadIcon,
  InfoIcon,
  Loader2Icon,
  PackageIcon,
  RefreshCwIcon,
  SearchIcon,
  StoreIcon,
  TrashIcon,
  XCircleIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  PluginInventorySummary,
  PluginLibraryEntry,
  PluginMarketEntry,
  PluginMarketPreview,
  PluginTargetCompatibility,
  PluginTargetStatus,
} from "@prompthub/shared/types/plugin";
import { PLUGIN_INVENTORY_KEYS } from "@prompthub/shared/types/plugin";
import { usePluginStore } from "../../stores/plugin.store";
import { Spinner } from "../ui/Spinner";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";

type PluginTab = "library" | "market" | "targets";

const tabIconClassName = "h-4 w-4";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function inventoryTotal(inventory: PluginInventorySummary): number {
  return PLUGIN_INVENTORY_KEYS.reduce((sum, key) => sum + inventory[key], 0);
}

function getInventoryLabel(
  key: keyof PluginInventorySummary,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const labels: Record<keyof PluginInventorySummary, string> = {
    skills: t("plugin.inventory.skills", "Skills"),
    mcpServers: t("plugin.inventory.mcpServers", "MCP servers"),
    apps: t("plugin.inventory.apps", "Apps"),
    commands: t("plugin.inventory.commands", "Commands"),
    hooks: t("plugin.inventory.hooks", "Hooks"),
    agents: t("plugin.inventory.agents", "Agents"),
    assets: t("plugin.inventory.assets", "Assets"),
    docs: t("plugin.inventory.docs", "Docs"),
    lspServers: t("plugin.inventory.lspServers", "LSP servers"),
    scripts: t("plugin.inventory.scripts", "Scripts"),
  };
  return labels[key];
}

function InventoryChips({ inventory }: { inventory: PluginInventorySummary }) {
  const { t } = useTranslation();
  const chips = PLUGIN_INVENTORY_KEYS.map((key) => ({
    key,
    label: getInventoryLabel(key, t),
    count: inventory[key],
  })).filter((item) => item.count > 0);

  if (chips.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        {t("plugin.inventoryEmpty", "Inventory will be validated on install")}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="rounded-full border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground"
        >
          {chip.label} · {chip.count}
        </span>
      ))}
    </div>
  );
}

function getStatusLabel(
  status: PluginTargetStatus,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const labels: Record<PluginTargetStatus, string> = {
    native: t("plugin.targetStatus.native", "Native"),
    adapter: t("plugin.targetStatus.adapter", "Adapter"),
    "runtime-only": t("plugin.targetStatus.runtimeOnly", "Runtime only"),
    composite: t("plugin.targetStatus.composite", "Composite"),
    pending: t("plugin.targetStatus.pending", "Pending"),
  };
  return labels[status];
}

function getClassificationLabel(
  classification: PluginMarketEntry["classification"],
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (classification === "bundle") {
    return t("plugin.classification.bundle", "Bundle");
  }
  if (classification === "single-skill") {
    return t("plugin.classification.singleSkill", "Single Skill");
  }
  if (classification === "runtime-module") {
    return t("plugin.classification.runtimeModule", "Runtime module");
  }
  if (classification === "invalid") {
    return t("plugin.classification.invalid", "Invalid");
  }
  return t("plugin.classification.pending", "Pending scan");
}

function PluginCard({
  plugin,
  onDelete,
}: {
  plugin: PluginLibraryEntry;
  onDelete: (plugin: PluginLibraryEntry) => void;
}) {
  const { t } = useTranslation();

  return (
    <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <PackageIcon className="h-4 w-4 shrink-0 text-primary" />
            <h3 className="truncate text-sm font-semibold text-foreground">
              {plugin.displayName}
            </h3>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {plugin.description ||
              t("plugin.noDescription", "No description provided")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onDelete(plugin)}
          aria-label={t("plugin.deletePlugin", "Delete plugin")}
          title={t("plugin.deletePlugin", "Delete plugin")}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4">
        <InventoryChips inventory={plugin.inventory} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">
          {plugin.trustLevel}
        </span>
        {plugin.version ? <span>v{plugin.version}</span> : null}
        <span>
          {t("plugin.installedAt", {
            defaultValue: "Installed {{date}}",
            date: new Date(plugin.installedAt).toLocaleDateString(),
          })}
        </span>
      </div>
    </article>
  );
}

function MarketCard({
  entry,
  installed,
  installing,
  previewing,
  expanded,
  preview,
  onPreview,
  onInstall,
  onCopyCodexLink,
}: {
  entry: PluginMarketEntry;
  installed: boolean;
  installing: boolean;
  previewing: boolean;
  expanded: boolean;
  preview?: PluginMarketPreview;
  onPreview: (entry: PluginMarketEntry) => void;
  onInstall: (entry: PluginMarketEntry) => void;
  onCopyCodexLink: (entry: PluginMarketEntry) => void;
}) {
  const { t } = useTranslation();
  const activeInventory = preview?.inventory ?? entry.inventory;
  const codexLink = preview?.codexDetailUrl ?? entry.codexDetailUrl;
  const installDisabled =
    installed || installing || preview?.canInstall === false;

  return (
    <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StoreIcon className="h-4 w-4 shrink-0 text-primary" />
            <h3 className="truncate text-sm font-semibold text-foreground">
              {entry.displayName}
            </h3>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {entry.description ||
              t(
                "plugin.marketInventoryDeferred",
                "Plugin inventory is checked before install.",
              )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <button
            type="button"
            disabled={previewing}
            onClick={() => onPreview(entry)}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {previewing ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <InfoIcon className="h-4 w-4" />
            )}
            {t("plugin.preview", "Preview")}
          </button>
          <button
            type="button"
            disabled={installDisabled}
            onClick={() => onInstall(entry)}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            {installing ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : installed ? (
              <CheckCircleIcon className="h-4 w-4" />
            ) : (
              <DownloadIcon className="h-4 w-4" />
            )}
            {installed
              ? t("plugin.installed", "Installed")
              : t("plugin.install", "Install")}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">
          {entry.source.label || entry.marketplaceId}
        </span>
        {entry.category ? <span>{entry.category}</span> : null}
        <span>{entry.trustLevel}</span>
        {entry.policy?.installation ? (
          <span>
            {t("plugin.policyInstallation", "Install")}:{" "}
            {entry.policy.installation}
          </span>
        ) : null}
        {entry.policy?.authentication ? (
          <span>
            {t("plugin.policyAuth", "Auth")}: {entry.policy.authentication}
          </span>
        ) : null}
      </div>

      {activeInventory ? (
        <div className="mt-4">
          <InventoryChips inventory={activeInventory} />
        </div>
      ) : null}

      {expanded && preview ? (
        <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`rounded-full px-2 py-1 ${
                preview.canInstall
                  ? "bg-green-500/10 text-green-700 dark:text-green-400"
                  : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
              }`}
            >
              {getClassificationLabel(preview.classification, t)}
            </span>
            {preview.version ? (
              <span className="text-muted-foreground">v{preview.version}</span>
            ) : null}
            {preview.author?.name ? (
              <span className="text-muted-foreground">
                {preview.author.name}
              </span>
            ) : null}
          </div>
          {preview.unsupportedReason ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              {preview.unsupportedReason}
            </p>
          ) : null}
          <dl className="mt-3 space-y-2 text-xs text-muted-foreground">
            {preview.manifestUrl ? (
              <div>
                <dt className="font-medium text-foreground">
                  {t("plugin.manifestUrl", "Manifest")}
                </dt>
                <dd className="mt-0.5 break-all font-mono">
                  {preview.manifestUrl}
                </dd>
              </div>
            ) : null}
            {entry.source.packagePath ? (
              <div>
                <dt className="font-medium text-foreground">
                  {t("plugin.packagePath", "Package path")}
                </dt>
                <dd className="mt-0.5 break-all font-mono">
                  {entry.source.packagePath}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}

      {codexLink ? (
        <button
          type="button"
          onClick={() => onCopyCodexLink(entry)}
          className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline"
        >
          <CopyIcon className="h-3.5 w-3.5" />
          {t("plugin.copyCodexLink", "Copy Codex link")}
        </button>
      ) : null}
    </article>
  );
}

function TargetCard({ target }: { target: PluginTargetCompatibility }) {
  const { t } = useTranslation();
  const enabled = target.enabled;

  return (
    <article
      className={`rounded-lg border p-4 ${
        enabled
          ? "border-border bg-card shadow-sm"
          : "border-border/60 bg-muted/30 opacity-70"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {enabled ? (
              <CheckCircleIcon className="h-4 w-4 shrink-0 text-green-600" />
            ) : (
              <XCircleIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <h3 className="truncate text-sm font-semibold text-foreground">
              {target.displayName}
            </h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {target.description ||
              target.adapterOutput ||
              target.unsupportedReason ||
              t("plugin.targetPendingDesc", "Adapter evidence is pending.")}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-xs font-medium ${
            enabled
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {getStatusLabel(target.status, t)}
        </span>
      </div>

      <dl className="mt-4 space-y-2 text-xs text-muted-foreground">
        {target.nativeMarker ? (
          <div>
            <dt className="font-medium text-foreground">
              {t("plugin.nativeMarker", "Native marker")}
            </dt>
            <dd className="mt-0.5 break-all font-mono">
              {target.nativeMarker}
            </dd>
          </div>
        ) : null}
        {target.installSurface ? (
          <div>
            <dt className="font-medium text-foreground">
              {t("plugin.installSurface", "Install surface")}
            </dt>
            <dd className="mt-0.5">{target.installSurface}</dd>
          </div>
        ) : null}
        {!enabled && target.unsupportedReason ? (
          <div>
            <dt className="font-medium text-foreground">
              {t("plugin.unsupportedReason", "Why disabled")}
            </dt>
            <dd className="mt-0.5">{target.unsupportedReason}</dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
}

function matchesPluginSearch(
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
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

export function PluginManager() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [expandedMarketEntryId, setExpandedMarketEntryId] = useState<
    string | null
  >(null);
  const [selectedMarketSourceId, setSelectedMarketSourceId] =
    useState("openai-curated");
  const [deleteTarget, setDeleteTarget] = useState<PluginLibraryEntry | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const {
    library,
    marketEntries,
    marketPreviews,
    marketSources,
    targetMatrix,
    selectedTab,
    searchQuery,
    isLoading,
    error,
    load,
    setSelectedTab,
    setSearchQuery,
    previewMarketPlugin,
    installMarketPlugin,
    deletePlugin,
  } = usePluginStore();

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (
      selectedMarketSourceId !== "all" &&
      marketSources.length > 0 &&
      !marketSources.some((source) => source.id === selectedMarketSourceId)
    ) {
      setSelectedMarketSourceId("all");
    }
  }, [marketSources, selectedMarketSourceId]);

  const installedPlugins = useMemo(
    () => library?.plugins ?? [],
    [library?.plugins],
  );
  const installedIds = useMemo(
    () => new Set(installedPlugins.map((plugin) => plugin.id)),
    [installedPlugins],
  );
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const visiblePlugins = useMemo(
    () =>
      installedPlugins.filter((plugin) =>
        matchesPluginSearch(plugin, normalizedSearchQuery),
      ),
    [installedPlugins, normalizedSearchQuery],
  );
  const marketSourceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of marketEntries) {
      counts.set(
        entry.marketplaceId,
        (counts.get(entry.marketplaceId) ?? 0) + 1,
      );
    }
    return counts;
  }, [marketEntries]);
  const visibleMarketEntries = useMemo(
    () =>
      marketEntries.filter(
        (entry) =>
          (selectedMarketSourceId === "all" ||
            entry.marketplaceId === selectedMarketSourceId) &&
          matchesPluginSearch(entry, normalizedSearchQuery),
      ),
    [marketEntries, normalizedSearchQuery, selectedMarketSourceId],
  );
  const enabledTargetCount = useMemo(
    () => targetMatrix.filter((target) => target.enabled).length,
    [targetMatrix],
  );
  const installedInventoryCount = useMemo(
    () =>
      installedPlugins.reduce(
        (sum, plugin) => sum + inventoryTotal(plugin.inventory),
        0,
      ),
    [installedPlugins],
  );

  const tabs: Array<{
    id: PluginTab;
    label: string;
    count: number;
    icon: ReactNode;
  }> = [
    {
      id: "library",
      label: t("plugin.myPlugins", "My Plugins"),
      count: installedPlugins.length,
      icon: <PackageIcon className={tabIconClassName} />,
    },
    {
      id: "market",
      label: t("plugin.pluginStore", "Plugin Store"),
      count: marketEntries.length,
      icon: <StoreIcon className={tabIconClassName} />,
    },
    {
      id: "targets",
      label: t("plugin.pluginTargets", "Plugin Targets"),
      count: targetMatrix.length,
      icon: <BotIcon className={tabIconClassName} />,
    },
  ];

  const handleInstall = async (entry: PluginMarketEntry) => {
    setInstallingId(entry.id);
    try {
      const result = await installMarketPlugin(entry.id);
      showToast(
        t("plugin.installSuccess", {
          defaultValue: "Installed {{name}}",
          name: result.plugin.displayName,
        }),
      );
    } catch (installError) {
      showToast(getErrorMessage(installError), "error");
    } finally {
      setInstallingId(null);
    }
  };

  const handlePreview = async (entry: PluginMarketEntry) => {
    setPreviewingId(entry.id);
    try {
      await previewMarketPlugin(entry.id);
      setExpandedMarketEntryId(entry.id);
    } catch (previewError) {
      showToast(getErrorMessage(previewError), "error");
    } finally {
      setPreviewingId(null);
    }
  };

  const handleCopyCodexLink = async (entry: PluginMarketEntry) => {
    const link =
      marketPreviews[entry.id]?.codexDetailUrl ?? entry.codexDetailUrl;
    if (!link) {
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      showToast(t("plugin.codexLinkCopied", "Copied Codex link"));
    } catch (copyError) {
      showToast(getErrorMessage(copyError), "error");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    setIsDeleting(true);
    try {
      await deletePlugin(deleteTarget.id);
      showToast(
        t("plugin.deleteSuccess", {
          defaultValue: "Deleted {{name}}",
          name: deleteTarget.displayName,
        }),
      );
      setDeleteTarget(null);
    } catch (deleteError) {
      showToast(getErrorMessage(deleteError), "error");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-card/50 px-6 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <PackageIcon className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold text-foreground">
                {t("plugin.title", "Plugins")}
              </h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "plugin.subtitle",
                "Manage complete capability bundles and their agent targets.",
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border bg-muted/40 px-3 py-1.5">
              {t("plugin.statsInstalled", {
                defaultValue: "{{count}} installed",
                count: installedPlugins.length,
              })}
            </span>
            <span className="rounded-full border border-border bg-muted/40 px-3 py-1.5">
              {t("plugin.statsInventory", {
                defaultValue: "{{count}} assets",
                count: installedInventoryCount,
              })}
            </span>
            <span className="rounded-full border border-border bg-muted/40 px-3 py-1.5">
              {t("plugin.statsTargets", {
                defaultValue: "{{count}} enabled targets",
                count: enabledTargetCount,
              })}
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  selectedTab === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {tab.icon}
                {tab.label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    selectedTab === tab.id
                      ? "bg-white/20 text-white"
                      : "bg-background text-muted-foreground"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative min-w-[220px] flex-1 lg:w-80">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("plugin.searchPlaceholder", "Search plugins")}
                className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <RefreshCwIcon className="h-4 w-4" />
              {t("common.refresh", "Refresh")}
            </button>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-6">
        {error ? (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        ) : null}

        {isLoading && !library ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : selectedTab === "library" ? (
          visiblePlugins.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visiblePlugins.map((plugin) => (
                <PluginCard
                  key={plugin.id}
                  plugin={plugin}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          ) : (
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-6 text-center">
              <PackageIcon className="h-10 w-10 text-muted-foreground/50" />
              <h2 className="mt-3 text-base font-semibold text-foreground">
                {t("plugin.emptyLibraryTitle", "No plugins installed")}
              </h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                {t(
                  "plugin.emptyLibraryDesc",
                  "Install complete plugin bundles from the store, then decide which child assets go to each agent.",
                )}
              </p>
            </div>
          )
        ) : selectedTab === "market" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSelectedMarketSourceId("all")}
                className={`rounded-full border px-3 py-1.5 transition-colors ${
                  selectedMarketSourceId === "all"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {t("plugin.allSources", "All sources")} · {marketEntries.length}
              </button>
              {marketSources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => setSelectedMarketSourceId(source.id)}
                  className={`rounded-full border px-3 py-1.5 transition-colors ${
                    selectedMarketSourceId === source.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {source.displayName} ·{" "}
                  {marketSourceCounts.get(source.id) ?? 0}
                </button>
              ))}
            </div>
            {visibleMarketEntries.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {visibleMarketEntries.map((entry) => (
                  <MarketCard
                    key={entry.id}
                    entry={entry}
                    installed={installedIds.has(entry.id)}
                    installing={installingId === entry.id}
                    previewing={previewingId === entry.id}
                    expanded={expandedMarketEntryId === entry.id}
                    preview={marketPreviews[entry.id]}
                    onPreview={handlePreview}
                    onInstall={handleInstall}
                    onCopyCodexLink={handleCopyCodexLink}
                  />
                ))}
              </div>
            ) : (
              <div className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-6 text-center">
                <StoreIcon className="h-10 w-10 text-muted-foreground/50" />
                <h2 className="mt-3 text-base font-semibold text-foreground">
                  {t("plugin.emptyMarketTitle", "No store entries")}
                </h2>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  {t(
                    "plugin.emptyMarketDesc",
                    "Check the network connection or refresh the plugin store sources.",
                  )}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {targetMatrix.map((target) => (
              <TargetCard key={target.id} target={target} />
            ))}
          </div>
        )}
      </main>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => {
          if (!isDeleting) {
            setDeleteTarget(null);
          }
        }}
        onConfirm={handleDelete}
        title={t("plugin.deleteConfirmTitle", "Delete plugin")}
        message={t("plugin.deleteConfirmMessage", {
          defaultValue:
            "Delete {{name}} from My Plugins? Child assets already copied elsewhere are not removed.",
          name: deleteTarget?.displayName ?? "",
        })}
        confirmText={t("common.delete", "Delete")}
        cancelText={t("common.cancel", "Cancel")}
        variant="destructive"
        isLoading={isDeleting}
      />
    </div>
  );
}
