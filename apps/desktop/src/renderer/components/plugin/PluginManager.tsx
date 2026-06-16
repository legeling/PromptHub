import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BotIcon,
  CheckIcon,
  CheckCircleIcon,
  CheckSquareIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  FolderOpenIcon,
  InfoIcon,
  ListChecksIcon,
  Loader2Icon,
  PackageIcon,
  PackagePlusIcon,
  RefreshCwIcon,
  SearchIcon,
  StoreIcon,
  TrashIcon,
  XCircleIcon,
  XIcon,
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
import { Modal } from "../ui/Modal";
import { PlatformIcon } from "../ui/PlatformIcon";
import { useToast } from "../ui/Toast";

type PluginTab = "library" | "market" | "targets";

const tabIconClassName = "h-4 w-4";
const AGENT_PLUGIN_HEADER_CLASS =
  "h-[132px] border-b border-border app-wallpaper-panel-strong";

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

function getMarketSourceLabel(
  sourceId: string,
  displayName: string,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (sourceId === "openai-curated") {
    return t("plugin.sources.codexOfficial", "Codex Plugin Store");
  }
  if (sourceId === "prompthub-official") {
    return t("plugin.sources.promptHubOfficial", "Official Store");
  }
  return displayName;
}

function getPluginEntryId(entry: PluginLibraryEntry | PluginMarketEntry) {
  return entry.id;
}

function getPluginCategoryKey(entry: PluginLibraryEntry | PluginMarketEntry) {
  return entry.category?.trim() || "uncategorized";
}

function getPluginCategoryLabel(
  categoryKey: string,
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (categoryKey === "all") {
    return t("common.showAll", "All");
  }
  if (categoryKey === "uncategorized") {
    return t("plugin.uncategorized", "Uncategorized");
  }
  return categoryKey;
}

function getPluginInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function getTargetPlatformIconId(targetId: string): string {
  const iconIds: Record<string, string> = {
    "claude-code": "claude",
    "gemini-cli": "gemini",
    "github-copilot": "copilot",
    "roo-code": "kilo",
  };
  return iconIds[targetId] ?? targetId;
}

function getTargetDescription(
  target: PluginTargetCompatibility,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  return (
    target.description ||
    target.adapterOutput ||
    target.unsupportedReason ||
    t("plugin.targetPendingDesc", "Adapter evidence is pending.")
  );
}

function PluginCard({
  batchMode = false,
  isSelected = false,
  plugin,
  onOpenDetail,
  onToggleSelection,
  onDelete,
}: {
  batchMode?: boolean;
  isSelected?: boolean;
  plugin: PluginLibraryEntry;
  onOpenDetail: (plugin: PluginLibraryEntry) => void;
  onToggleSelection: (plugin: PluginLibraryEntry) => void;
  onDelete: (plugin: PluginLibraryEntry) => void;
}) {
  const { t } = useTranslation();
  const cardLabel = plugin.description
    ? `${plugin.displayName}. ${plugin.description}`
    : plugin.displayName;

  return (
    <article
      className={`group relative flex items-center gap-3 rounded-xl border app-wallpaper-surface p-3.5 transition-all hover:border-primary/40 hover:shadow-md ${
        isSelected
          ? "border-primary/70 ring-1 ring-primary/30"
          : "border-border"
      }`}
    >
      {batchMode ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelection(plugin);
          }}
          aria-pressed={isSelected}
          aria-label={
            isSelected
              ? t("plugin.unselectPlugin", "Unselect plugin")
              : t("plugin.selectPlugin", "Select plugin")
          }
          title={
            isSelected
              ? t("plugin.unselectPlugin", "Unselect plugin")
              : t("plugin.selectPlugin", "Select plugin")
          }
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition-all active:scale-press-in ${
            isSelected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card/80 text-muted-foreground/70 hover:border-primary/45 hover:bg-primary/10 hover:text-primary"
          }`}
        >
          {isSelected ? (
            <CheckIcon aria-hidden="true" className="h-3.5 w-3.5" />
          ) : (
            <span className="h-3 w-3 rounded-[4px] border border-current" />
          )}
        </button>
      ) : null}

      <button
        type="button"
        aria-label={cardLabel}
        onClick={() =>
          batchMode ? onToggleSelection(plugin) : onOpenDetail(plugin)
        }
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-base font-semibold text-primary">
          {getPluginInitial(plugin.displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
            {plugin.displayName}
          </h3>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {plugin.description ||
              plugin.author?.name ||
              t("plugin.noDescription", "No description provided")}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
              {t("plugin.installed", "Installed")}
            </span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {plugin.trustLevel}
            </span>
            {plugin.category ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {plugin.category}
              </span>
            ) : null}
          </div>
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenDetail(plugin);
          }}
          className="grid h-8 w-8 place-items-center rounded-lg border border-border/70 bg-card/80 text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/10 hover:text-primary active:scale-press-in"
          aria-label={t("common.viewDetail", "View detail")}
          title={t("common.viewDetail", "View detail")}
        >
          <EyeIcon aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(plugin);
          }}
          aria-label={t("plugin.deletePlugin", "Delete plugin")}
          title={t("plugin.deletePlugin", "Delete plugin")}
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}

function MarketCard({
  batchMode = false,
  entry,
  isSelected = false,
  installed,
  installing,
  preview,
  onOpenDetail,
  onToggleSelection,
  onInstall,
}: {
  batchMode?: boolean;
  entry: PluginMarketEntry;
  isSelected?: boolean;
  installed: boolean;
  installing: boolean;
  preview?: PluginMarketPreview;
  onOpenDetail: (entry: PluginMarketEntry) => void;
  onToggleSelection: (entry: PluginMarketEntry) => void;
  onInstall: (entry: PluginMarketEntry) => void;
}) {
  const { t } = useTranslation();
  const activeInventory = preview?.inventory ?? entry.inventory;
  const installDisabled =
    installed || installing || preview?.canInstall === false;
  const cardLabel = entry.description
    ? `${entry.displayName}. ${entry.description}`
    : entry.displayName;

  return (
    <article
      className={`group relative flex items-center gap-3 rounded-xl border app-wallpaper-surface p-3.5 transition-all hover:border-primary/40 hover:shadow-md ${
        isSelected
          ? "border-primary/70 ring-1 ring-primary/30"
          : "border-border"
      }`}
    >
      {batchMode ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelection(entry);
          }}
          aria-pressed={isSelected}
          aria-label={
            isSelected
              ? t("plugin.unselectStorePlugin", "Unselect store plugin")
              : t("plugin.selectStorePlugin", "Select store plugin")
          }
          title={
            isSelected
              ? t("plugin.unselectStorePlugin", "Unselect store plugin")
              : t("plugin.selectStorePlugin", "Select store plugin")
          }
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition-all active:scale-press-in ${
            isSelected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card/80 text-muted-foreground/70 hover:border-primary/45 hover:bg-primary/10 hover:text-primary"
          }`}
        >
          {isSelected ? (
            <CheckIcon aria-hidden="true" className="h-3.5 w-3.5" />
          ) : (
            <span className="h-3 w-3 rounded-[4px] border border-current" />
          )}
        </button>
      ) : null}

      <button
        type="button"
        aria-label={t("plugin.openPluginDetail", {
          defaultValue: "Open plugin details {{name}}",
          name: entry.displayName,
        })}
        title={cardLabel}
        onClick={() =>
          batchMode ? onToggleSelection(entry) : onOpenDetail(entry)
        }
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-base font-semibold text-primary">
          {getPluginInitial(entry.displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
            {entry.displayName}
          </h3>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {entry.description ||
              t(
                "plugin.marketInventoryDeferred",
                "Plugin inventory is checked before install.",
              )}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {getMarketSourceLabel(
                entry.marketplaceId,
                entry.source.label || entry.marketplaceId,
                t,
              )}
            </span>
            {entry.category ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {entry.category}
              </span>
            ) : null}
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {entry.trustLevel}
            </span>
            {installed ? (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
                {t("plugin.installed", "Installed")}
              </span>
            ) : null}
          </div>
          {activeInventory ? (
            <div className="mt-2">
              <InventoryChips inventory={activeInventory} />
            </div>
          ) : null}
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenDetail(entry);
          }}
          className="grid h-8 w-8 place-items-center rounded-lg border border-border/70 bg-card/80 text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/10 hover:text-primary active:scale-press-in"
          aria-label={t("common.viewDetail", "View detail")}
          title={t("common.viewDetail", "View detail")}
        >
          <EyeIcon aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={installDisabled}
          onClick={(event) => {
            event.stopPropagation();
            onInstall(entry);
          }}
          aria-label={
            installed
              ? t("plugin.installed", "Installed")
              : t("plugin.install", "Install")
          }
          title={
            installed
              ? t("plugin.installed", "Installed")
              : t("plugin.install", "Install")
          }
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary active:scale-press-in disabled:cursor-not-allowed disabled:opacity-50"
        >
          {installing ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : installed ? (
            <CheckCircleIcon className="h-4 w-4 text-emerald-500" />
          ) : (
            <PackagePlusIcon className="h-4 w-4" />
          )}
        </button>
      </div>
    </article>
  );
}

function PluginDetailBadges({
  entry,
  sourceLabel,
}: {
  entry: PluginLibraryEntry | PluginMarketEntry;
  sourceLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
        {sourceLabel}
      </span>
      {entry.category ? (
        <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
          {entry.category}
        </span>
      ) : null}
      <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
        {entry.trustLevel}
      </span>
      {entry.version ? (
        <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
          v{entry.version}
        </span>
      ) : null}
    </div>
  );
}

function PluginStoreDetailModal({
  entry,
  installed,
  installing,
  preview,
  previewing,
  onClose,
  onCopyCodexLink,
  onInstall,
}: {
  entry: PluginMarketEntry | null;
  installed: boolean;
  installing: boolean;
  preview?: PluginMarketPreview;
  previewing: boolean;
  onClose: () => void;
  onCopyCodexLink: (entry: PluginMarketEntry) => void;
  onInstall: (entry: PluginMarketEntry) => void;
}) {
  const { t } = useTranslation();

  if (!entry) {
    return null;
  }

  const sourceLabel = getMarketSourceLabel(
    entry.marketplaceId,
    entry.source.label || entry.marketplaceId,
    t,
  );
  const activeInventory = preview?.inventory ?? entry.inventory;
  const codexLink = preview?.codexDetailUrl ?? entry.codexDetailUrl;
  const installDisabled =
    installed || installing || preview?.canInstall === false;

  return (
    <Modal
      isOpen={Boolean(entry)}
      onClose={onClose}
      size="xl"
      showCloseButton
      title={entry.displayName}
      subtitle={
        entry.description ||
        t(
          "plugin.marketInventoryDeferred",
          "Plugin inventory is checked before install.",
        )
      }
    >
      <div className="flex min-h-0 flex-col">
        <div className="space-y-4 px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary/10 text-2xl font-semibold text-primary">
              {getPluginInitial(entry.displayName)}
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <PluginDetailBadges entry={entry} sourceLabel={sourceLabel} />
              {previewing ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
                  <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                  {t("plugin.loadingPreview", "Loading manifest preview")}
                </div>
              ) : null}
              {preview ? (
                <div className="flex flex-wrap gap-2 text-xs">
                  <span
                    className={`rounded-full px-2.5 py-1 font-medium ${
                      preview.canInstall
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                        : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    {getClassificationLabel(preview.classification, t)}
                  </span>
                  {preview.author?.name ? (
                    <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
                      {preview.author.name}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {activeInventory ? (
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="mb-3 text-sm font-medium text-foreground">
                {t("plugin.inventoryTitle", "Inventory")}
              </div>
              <InventoryChips inventory={activeInventory} />
            </div>
          ) : null}

          {preview?.unsupportedReason ? (
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
              {preview.unsupportedReason}
            </div>
          ) : null}

          <dl className="grid gap-3 text-sm md:grid-cols-2">
            {entry.policy?.installation ? (
              <div className="rounded-xl border border-border bg-background/60 p-3">
                <dt className="text-xs font-medium text-muted-foreground">
                  {t("plugin.policyInstallation", "Install")}
                </dt>
                <dd className="mt-1 text-foreground">
                  {entry.policy.installation}
                </dd>
              </div>
            ) : null}
            {entry.policy?.authentication ? (
              <div className="rounded-xl border border-border bg-background/60 p-3">
                <dt className="text-xs font-medium text-muted-foreground">
                  {t("plugin.policyAuth", "Auth")}
                </dt>
                <dd className="mt-1 text-foreground">
                  {entry.policy.authentication}
                </dd>
              </div>
            ) : null}
            {preview?.manifestUrl ? (
              <div className="rounded-xl border border-border bg-background/60 p-3 md:col-span-2">
                <dt className="text-xs font-medium text-muted-foreground">
                  {t("plugin.manifestUrl", "Manifest")}
                </dt>
                <dd className="mt-1 break-all font-mono text-xs text-foreground">
                  {preview.manifestUrl}
                </dd>
              </div>
            ) : null}
            {entry.source.packagePath ? (
              <div className="rounded-xl border border-border bg-background/60 p-3 md:col-span-2">
                <dt className="text-xs font-medium text-muted-foreground">
                  {t("plugin.packagePath", "Package path")}
                </dt>
                <dd className="mt-1 break-all font-mono text-xs text-foreground">
                  {entry.source.packagePath}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-4">
          <div className="min-w-0 text-xs text-muted-foreground">
            {codexLink ? codexLink : sourceLabel}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {codexLink ? (
              <button
                type="button"
                onClick={() => onCopyCodexLink(entry)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <CopyIcon className="h-4 w-4" />
                {t("plugin.copyCodexLink", "Copy Codex link")}
              </button>
            ) : null}
            <button
              type="button"
              disabled={installDisabled}
              onClick={() => onInstall(entry)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
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
      </div>
    </Modal>
  );
}

function PluginLibraryDetailModal({
  plugin,
  onClose,
  onDelete,
}: {
  plugin: PluginLibraryEntry | null;
  onClose: () => void;
  onDelete: (plugin: PluginLibraryEntry) => void;
}) {
  const { t } = useTranslation();

  if (!plugin) {
    return null;
  }

  return (
    <Modal
      isOpen={Boolean(plugin)}
      onClose={onClose}
      size="xl"
      showCloseButton
      title={plugin.displayName}
      subtitle={
        plugin.description ||
        plugin.author?.name ||
        t("plugin.noDescription", "No description provided")
      }
    >
      <div className="space-y-4 px-6 py-5">
        <div className="flex items-start gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary/10 text-2xl font-semibold text-primary">
            {getPluginInitial(plugin.displayName)}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <PluginDetailBadges
              entry={plugin}
              sourceLabel={t("plugin.myPlugins", "My Plugins")}
            />
            <InventoryChips inventory={plugin.inventory} />
          </div>
        </div>

        <dl className="grid gap-3 text-sm md:grid-cols-2">
          {plugin.localPackagePath || plugin.managedPath ? (
            <div className="rounded-xl border border-border bg-background/60 p-3 md:col-span-2">
              <dt className="text-xs font-medium text-muted-foreground">
                {t("plugin.localPackagePath", "Local package")}
              </dt>
              <dd className="mt-1 break-all font-mono text-xs text-foreground">
                {plugin.localPackagePath ?? plugin.managedPath}
              </dd>
            </div>
          ) : null}
          <div className="rounded-xl border border-border bg-background/60 p-3">
            <dt className="text-xs font-medium text-muted-foreground">
              {t("plugin.installedAtLabel", "Installed at")}
            </dt>
            <dd className="mt-1 text-foreground">
              {new Date(plugin.installedAt).toLocaleString()}
            </dd>
          </div>
          <div className="rounded-xl border border-border bg-background/60 p-3">
            <dt className="text-xs font-medium text-muted-foreground">
              {t("plugin.classificationLabel", "Classification")}
            </dt>
            <dd className="mt-1 text-foreground">
              {getClassificationLabel(plugin.classification, t)}
            </dd>
          </div>
        </dl>

        <div className="flex justify-end border-t border-border pt-4">
          <button
            type="button"
            onClick={() => onDelete(plugin)}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-4 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/15"
          >
            <TrashIcon className="h-4 w-4" />
            {t("plugin.deletePlugin", "Delete plugin")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PluginLibraryRow({ plugin }: { plugin: PluginLibraryEntry }) {
  const { t } = useTranslation();

  return (
    <article
      data-testid="agent-plugin-card"
      className="group rounded-2xl border border-border app-wallpaper-surface transition-colors hover:border-primary/30 hover:bg-accent/30"
    >
      <div className="grid min-h-[124px] grid-cols-[minmax(0,1fr)_8rem] items-stretch gap-4 px-4 py-4 max-[760px]:grid-cols-1 max-[760px]:items-start">
        <div className="min-w-0 text-left">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">
              {plugin.displayName.trim().charAt(0).toUpperCase() || "?"}
            </div>
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
          {plugin.managedPath || plugin.localPackagePath ? (
            <button
              type="button"
              onClick={() =>
                void window.electron?.openPath?.(
                  plugin.localPackagePath ?? plugin.managedPath ?? "",
                )
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

function AgentPluginView({
  targets,
  installedPlugins,
  installedInventoryCount,
  isLoading,
  onRefresh,
  onOpenStore,
}: {
  targets: PluginTargetCompatibility[];
  installedPlugins: PluginLibraryEntry[];
  installedInventoryCount: number;
  isLoading: boolean;
  onRefresh: () => void;
  onOpenStore: () => void;
}) {
  const { t } = useTranslation();
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedTargetId((current) => {
      if (current && targets.some((target) => target.id === current)) {
        return current;
      }
      return (
        targets.find((target) => target.enabled)?.id ?? targets[0]?.id ?? null
      );
    });
  }, [targets]);

  const selectedTarget = useMemo(
    () =>
      targets.find((target) => target.id === selectedTargetId) ??
      targets.find((target) => target.enabled) ??
      targets[0] ??
      null,
    [selectedTargetId, targets],
  );
  const enabledCount = useMemo(
    () => targets.filter((target) => target.enabled).length,
    [targets],
  );

  return (
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
                  onClick={() => setSelectedTargetId(target.id)}
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
                        {getTargetDescription(target, t)}
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
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {selectedTarget
                    ? getTargetDescription(selectedTarget, t)
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
              <span
                className={`rounded-full border px-2.5 py-1 font-medium ${
                  selectedTarget?.enabled
                    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "border-amber-500/35 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                }`}
              >
                {selectedTarget?.enabled
                  ? t("plugin.targetSupported", "Supported")
                  : t("plugin.targetDisabled", "Disabled")}
              </span>
              {selectedTarget ? (
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-medium text-primary">
                  {getStatusLabel(selectedTarget.status, t)}
                </span>
              ) : null}
              <span className="rounded-full border border-border bg-background/60 px-2.5 py-1 text-muted-foreground">
                {t("plugin.agentTargetsSupported", {
                  count: enabledCount,
                  total: targets.length,
                  defaultValue: `${enabledCount}/${targets.length} supported`,
                })}
              </span>
              <span className="rounded-full border border-border bg-background/60 px-2.5 py-1 text-muted-foreground">
                {t("plugin.agentPluginsAvailable", {
                  count: installedPlugins.length,
                  defaultValue: `${installedPlugins.length} My Plugins`,
                })}
              </span>
              <span className="rounded-full border border-border bg-background/60 px-2.5 py-1 text-muted-foreground">
                {t("plugin.agentPluginAssetsAvailable", {
                  count: installedInventoryCount,
                  defaultValue: `${installedInventoryCount} assets`,
                })}
              </span>
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
                {selectedTarget.unsupportedReason ||
                  t(
                    "plugin.targetDisabledDesc",
                    "This agent does not expose a complete Plugin bundle surface yet.",
                  )}
              </p>
              {selectedTarget.installSurface ? (
                <p className="mx-auto mt-3 max-w-lg font-mono text-xs">
                  {selectedTarget.installSurface}
                </p>
              ) : null}
            </div>
          ) : installedPlugins.length === 0 ? (
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
          ) : (
            installedPlugins.map((plugin) => (
              <PluginLibraryRow key={plugin.id} plugin={plugin} />
            ))
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
  const [detailMarketEntry, setDetailMarketEntry] =
    useState<PluginMarketEntry | null>(null);
  const [detailLibraryPlugin, setDetailLibraryPlugin] =
    useState<PluginLibraryEntry | null>(null);
  const [selectedMarketSourceId, setSelectedMarketSourceId] =
    useState("openai-curated");
  const [selectedMarketCategoryId, setSelectedMarketCategoryId] =
    useState("all");
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedMarketEntryIds, setSelectedMarketEntryIds] = useState<
    Set<string>
  >(new Set());
  const [selectedLibraryPluginIds, setSelectedLibraryPluginIds] = useState<
    Set<string>
  >(new Set());
  const [batchDeleteConfirmOpen, setBatchDeleteConfirmOpen] = useState(false);
  const [isBatchInstalling, setIsBatchInstalling] = useState(false);
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

  useEffect(() => {
    setSelectedMarketCategoryId("all");
  }, [selectedMarketSourceId]);

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
  const sourceFilteredMarketEntries = useMemo(
    () =>
      marketEntries.filter(
        (entry) =>
          selectedMarketSourceId === "all" ||
          entry.marketplaceId === selectedMarketSourceId,
      ),
    [marketEntries, selectedMarketSourceId],
  );
  const marketCategoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of sourceFilteredMarketEntries) {
      const key = getPluginCategoryKey(entry);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [
      {
        key: "all",
        label: getPluginCategoryLabel("all", t),
        count: sourceFilteredMarketEntries.length,
      },
      ...Array.from(counts.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, count]) => ({
          key,
          label: getPluginCategoryLabel(key, t),
          count,
        })),
    ];
  }, [sourceFilteredMarketEntries, t]);
  const visibleMarketEntries = useMemo(
    () =>
      sourceFilteredMarketEntries.filter(
        (entry) =>
          (selectedMarketCategoryId === "all" ||
            getPluginCategoryKey(entry) === selectedMarketCategoryId) &&
          matchesPluginSearch(entry, normalizedSearchQuery),
      ),
    [
      normalizedSearchQuery,
      selectedMarketCategoryId,
      sourceFilteredMarketEntries,
    ],
  );
  const installedMarketEntries = useMemo(
    () => visibleMarketEntries.filter((entry) => installedIds.has(entry.id)),
    [installedIds, visibleMarketEntries],
  );
  const availableMarketEntries = useMemo(
    () => visibleMarketEntries.filter((entry) => !installedIds.has(entry.id)),
    [installedIds, visibleMarketEntries],
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
  const selectedMarketEntries = useMemo(
    () =>
      visibleMarketEntries.filter((entry) =>
        selectedMarketEntryIds.has(getPluginEntryId(entry)),
      ),
    [selectedMarketEntryIds, visibleMarketEntries],
  );
  const selectedInstallEntries = useMemo(
    () => selectedMarketEntries.filter((entry) => !installedIds.has(entry.id)),
    [installedIds, selectedMarketEntries],
  );
  const selectedLibraryPlugins = useMemo(
    () =>
      visiblePlugins.filter((plugin) =>
        selectedLibraryPluginIds.has(getPluginEntryId(plugin)),
      ),
    [selectedLibraryPluginIds, visiblePlugins],
  );
  const visibleMarketEntryIds = useMemo(
    () => visibleMarketEntries.map(getPluginEntryId),
    [visibleMarketEntries],
  );
  const visibleLibraryPluginIds = useMemo(
    () => visiblePlugins.map(getPluginEntryId),
    [visiblePlugins],
  );
  const areVisibleMarketEntriesSelected =
    visibleMarketEntryIds.length > 0 &&
    visibleMarketEntryIds.every((id) => selectedMarketEntryIds.has(id));
  const areVisibleLibraryPluginsSelected =
    visibleLibraryPluginIds.length > 0 &&
    visibleLibraryPluginIds.every((id) => selectedLibraryPluginIds.has(id));
  const selectedCount =
    selectedTab === "library"
      ? selectedLibraryPluginIds.size
      : selectedMarketEntryIds.size;
  const currentViewTitle =
    selectedTab === "library"
      ? t("plugin.myPlugins", "My Plugins")
      : t("plugin.pluginStore", "Plugin Store");
  const currentViewHint =
    selectedTab === "library"
      ? t(
          "plugin.myPluginsHint",
          "Installed Plugin bundles stay in PromptHub until you distribute their child assets.",
        )
      : t(
          "plugin.pluginStoreHint",
          "Browse Plugin bundles, open details to inspect inventory, then install or batch install selected entries.",
        );
  const currentViewCountLabel =
    selectedTab === "library"
      ? t("plugin.statsInstalled", {
          defaultValue: "{{count}} installed",
          count: visiblePlugins.length,
        })
      : t("plugin.statsStoreEntries", {
          defaultValue: "{{count}} store entries",
          count: visibleMarketEntries.length,
        });

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

  useEffect(() => {
    if (selectedMarketEntryIds.size === 0) {
      return;
    }
    const visibleIds = new Set(visibleMarketEntryIds);
    setSelectedMarketEntryIds((current) => {
      const next = new Set<string>();
      current.forEach((id) => {
        if (visibleIds.has(id)) {
          next.add(id);
        }
      });
      return next.size === current.size ? current : next;
    });
  }, [selectedMarketEntryIds.size, visibleMarketEntryIds]);

  useEffect(() => {
    if (selectedLibraryPluginIds.size === 0) {
      return;
    }
    const visibleIds = new Set(visibleLibraryPluginIds);
    setSelectedLibraryPluginIds((current) => {
      const next = new Set<string>();
      current.forEach((id) => {
        if (visibleIds.has(id)) {
          next.add(id);
        }
      });
      return next.size === current.size ? current : next;
    });
  }, [selectedLibraryPluginIds.size, visibleLibraryPluginIds]);

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
    } catch (previewError) {
      showToast(getErrorMessage(previewError), "error");
    } finally {
      setPreviewingId(null);
    }
  };

  const handleOpenMarketDetail = (entry: PluginMarketEntry) => {
    setDetailMarketEntry(entry);
    if (!marketPreviews[entry.id]) {
      void handlePreview(entry);
    }
  };

  const handleToggleMarketSelection = (entry: PluginMarketEntry) => {
    setSelectedMarketEntryIds((current) => {
      const next = new Set(current);
      const id = getPluginEntryId(entry);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleLibrarySelection = (plugin: PluginLibraryEntry) => {
    setSelectedLibraryPluginIds((current) => {
      const next = new Set(current);
      const id = getPluginEntryId(plugin);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleBatchMode = () => {
    setIsBatchMode((current) => {
      if (current) {
        setSelectedMarketEntryIds(new Set());
        setSelectedLibraryPluginIds(new Set());
      }
      return !current;
    });
  };

  const handleSelectVisibleEntries = () => {
    if (selectedTab === "library") {
      setSelectedLibraryPluginIds((current) => {
        const next = new Set(current);
        visibleLibraryPluginIds.forEach((id) => {
          if (areVisibleLibraryPluginsSelected) {
            next.delete(id);
          } else {
            next.add(id);
          }
        });
        return next;
      });
      return;
    }

    setSelectedMarketEntryIds((current) => {
      const next = new Set(current);
      visibleMarketEntryIds.forEach((id) => {
        if (areVisibleMarketEntriesSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }
      });
      return next;
    });
  };

  const handleClearBatchSelection = () => {
    setSelectedMarketEntryIds(new Set());
    setSelectedLibraryPluginIds(new Set());
  };

  const handleBatchInstall = async () => {
    if (selectedInstallEntries.length === 0) {
      showToast(t("plugin.batchNoInstallTargets", "No plugins to install"));
      return;
    }

    setIsBatchInstalling(true);
    let succeeded = 0;
    let failed = 0;

    for (const entry of selectedInstallEntries) {
      setInstallingId(entry.id);
      try {
        await installMarketPlugin(entry.id);
        succeeded += 1;
      } catch (installError) {
        console.error("Plugin batch install failed:", installError);
        failed += 1;
      }
    }

    setInstallingId(null);
    setIsBatchInstalling(false);
    setSelectedMarketEntryIds(new Set());
    setSelectedTab("market");
    showToast(
      t("plugin.batchInstallResult", {
        defaultValue:
          "Batch install finished: {{succeeded}} succeeded, {{failed}} failed",
        failed,
        succeeded,
      }),
      failed > 0 ? "error" : "success",
    );
  };

  const handleBatchDelete = async () => {
    if (selectedLibraryPlugins.length === 0) {
      setBatchDeleteConfirmOpen(false);
      return;
    }

    setIsDeleting(true);
    let failed = 0;
    for (const plugin of selectedLibraryPlugins) {
      try {
        await deletePlugin(plugin.id);
      } catch (deleteError) {
        console.error("Plugin batch delete failed:", deleteError);
        failed += 1;
      }
    }
    setIsDeleting(false);
    setBatchDeleteConfirmOpen(false);
    setSelectedLibraryPluginIds(new Set());
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
      setDetailLibraryPlugin(null);
      setDeleteTarget(null);
    } catch (deleteError) {
      showToast(getErrorMessage(deleteError), "error");
    } finally {
      setIsDeleting(false);
    }
  };

  if (selectedTab === "targets") {
    return (
      <AgentPluginView
        targets={targetMatrix}
        installedPlugins={installedPlugins}
        installedInventoryCount={installedInventoryCount}
        isLoading={isLoading}
        onRefresh={() => void load()}
        onOpenStore={() => setSelectedTab("market")}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden app-wallpaper-section">
      <header className="shrink-0 border-b border-border app-wallpaper-panel-strong px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              {selectedTab === "library" ? (
                <PackageIcon className="h-5 w-5 text-primary" />
              ) : (
                <StoreIcon className="h-5 w-5 text-primary" />
              )}
              <h1 className="text-lg font-semibold text-foreground">
                {currentViewTitle}
              </h1>
              <span className="shrink-0 rounded-full border border-white/5 bg-accent/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {currentViewCountLabel}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{currentViewHint}</p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleToggleBatchMode}
              aria-pressed={isBatchMode}
              aria-label={t("plugin.batchManage", "Batch manage plugins")}
              title={t("plugin.batchManage", "Batch manage plugins")}
              className={`rounded-lg p-2 transition-colors ${
                isBatchMode
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <ListChecksIcon aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={isLoading}
              aria-label={t("common.refresh", "Refresh")}
              title={t("common.refresh", "Refresh")}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              <RefreshCwIcon
                aria-hidden="true"
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>
      </header>

      <div
        className="shrink-0 space-y-3 border-b border-border px-6 py-3 app-wallpaper-section"
        data-testid="plugin-store-filter-bar"
      >
        <form
          data-testid="plugin-store-search-form"
          className="flex w-full items-center gap-2 rounded-xl border border-border/70 bg-card/70 px-3 py-2 transition-colors focus-within:bg-background"
          onSubmit={(event) => event.preventDefault()}
        >
          <SearchIcon
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-muted-foreground"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t("plugin.searchPlaceholder", "Search plugins")}
            aria-label={t("plugin.searchPlaceholder", "Search plugins")}
            className="h-6 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-0 focus-visible:ring-0"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t("common.clearSearch", "Clear search")}
              title={t("common.clearSearch", "Clear search")}
            >
              <XIcon aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </form>

        {selectedTab === "market" ? (
          <>
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
              <button
                type="button"
                onClick={() => setSelectedMarketSourceId("all")}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedMarketSourceId === "all"
                    ? "bg-primary text-white shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {t("plugin.allSources", "All sources")} · {marketEntries.length}
              </button>
              {marketSources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => setSelectedMarketSourceId(source.id)}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    selectedMarketSourceId === source.id
                      ? "bg-primary text-white shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {getMarketSourceLabel(source.id, source.displayName, t)} ·{" "}
                  {marketSourceCounts.get(source.id) ?? 0}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
              {marketCategoryOptions.map((category) => (
                <button
                  key={category.key}
                  type="button"
                  onClick={() => setSelectedMarketCategoryId(category.key)}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    selectedMarketCategoryId === category.key
                      ? "bg-primary text-white shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {category.label} · {category.count}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visiblePlugins.map((plugin) => (
                <PluginCard
                  key={plugin.id}
                  batchMode={isBatchMode}
                  isSelected={selectedLibraryPluginIds.has(plugin.id)}
                  plugin={plugin}
                  onOpenDetail={setDetailLibraryPlugin}
                  onToggleSelection={handleToggleLibrarySelection}
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
          <div className="space-y-8">
            {visibleMarketEntries.length > 0 ? (
              <>
                {installedMarketEntries.length > 0 ? (
                  <section>
                    <div className="mb-4 flex items-center gap-2">
                      <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
                        {t("plugin.installedSection", "Installed")}
                      </h2>
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-500">
                        {installedMarketEntries.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {installedMarketEntries.map((entry) => (
                        <MarketCard
                          key={entry.id}
                          batchMode={isBatchMode}
                          entry={entry}
                          isSelected={selectedMarketEntryIds.has(entry.id)}
                          installed
                          installing={installingId === entry.id}
                          preview={marketPreviews[entry.id]}
                          onOpenDetail={handleOpenMarketDetail}
                          onToggleSelection={handleToggleMarketSelection}
                          onInstall={handleInstall}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}

                {availableMarketEntries.length > 0 ? (
                  <section>
                    <div className="mb-4 flex items-center gap-2">
                      <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
                        {t("plugin.availableSection", "Available")}
                      </h2>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                        {availableMarketEntries.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {availableMarketEntries.map((entry) => (
                        <MarketCard
                          key={entry.id}
                          batchMode={isBatchMode}
                          entry={entry}
                          isSelected={selectedMarketEntryIds.has(entry.id)}
                          installed={false}
                          installing={installingId === entry.id}
                          preview={marketPreviews[entry.id]}
                          onOpenDetail={handleOpenMarketDetail}
                          onToggleSelection={handleToggleMarketSelection}
                          onInstall={handleInstall}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}
              </>
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
        ) : null}
      </main>

      {isBatchMode && (
        <div className="shrink-0 border-t border-border app-wallpaper-panel-strong px-6 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full border border-border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground">
              {t("skill.selectedCount", "{{count}} selected", {
                count: selectedCount,
              })}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSelectVisibleEntries}
                disabled={
                  selectedTab === "library"
                    ? visibleLibraryPluginIds.length === 0
                    : visibleMarketEntryIds.length === 0
                }
                className={`rounded-lg p-2 transition-colors disabled:opacity-40 ${
                  selectedTab === "library"
                    ? areVisibleLibraryPluginsSelected
                      ? "bg-primary/10 text-primary hover:bg-primary/15"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    : areVisibleMarketEntriesSelected
                      ? "bg-primary/10 text-primary hover:bg-primary/15"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
                aria-label={t(
                  "plugin.selectVisiblePlugins",
                  "Select visible plugins",
                )}
                title={t(
                  "plugin.selectVisiblePlugins",
                  "Select visible plugins",
                )}
              >
                <CheckSquareIcon aria-hidden="true" className="h-4 w-4" />
              </button>

              {selectedTab === "market" ? (
                <button
                  type="button"
                  onClick={() => void handleBatchInstall()}
                  disabled={
                    isBatchInstalling || selectedInstallEntries.length === 0
                  }
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                  aria-label={t(
                    "plugin.batchInstallSelected",
                    "Install selected",
                  )}
                  title={t("plugin.batchInstallSelected", "Install selected")}
                >
                  {isBatchInstalling ? (
                    <Loader2Icon
                      aria-hidden="true"
                      className="h-4 w-4 animate-spin"
                    />
                  ) : (
                    <PackagePlusIcon aria-hidden="true" className="h-4 w-4" />
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setBatchDeleteConfirmOpen(true)}
                  disabled={isDeleting || selectedLibraryPlugins.length === 0}
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                  aria-label={t(
                    "plugin.batchDeleteSelected",
                    "Delete selected plugins",
                  )}
                  title={t(
                    "plugin.batchDeleteSelected",
                    "Delete selected plugins",
                  )}
                >
                  <TrashIcon aria-hidden="true" className="h-4 w-4" />
                </button>
              )}

              <button
                type="button"
                onClick={handleClearBatchSelection}
                disabled={selectedCount === 0}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                aria-label={t("common.deselectAll", "Deselect All")}
                title={t("common.deselectAll", "Deselect All")}
              >
                <XIcon aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

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
      <ConfirmDialog
        isOpen={batchDeleteConfirmOpen}
        onClose={() => {
          if (!isDeleting) {
            setBatchDeleteConfirmOpen(false);
          }
        }}
        onConfirm={() => void handleBatchDelete()}
        title={t("plugin.batchDeleteTitle", "Delete selected plugins")}
        message={t("plugin.batchDeleteMessage", {
          defaultValue:
            "Delete {{count}} selected plugins from My Plugins? Child assets copied elsewhere are not removed.",
          count: selectedLibraryPlugins.length,
        })}
        confirmText={t("plugin.batchDeleteSelected", "Delete selected plugins")}
        cancelText={t("common.cancel", "Cancel")}
        variant="destructive"
        isLoading={isDeleting}
      />
      <PluginStoreDetailModal
        entry={detailMarketEntry}
        installed={
          detailMarketEntry ? installedIds.has(detailMarketEntry.id) : false
        }
        installing={
          detailMarketEntry ? installingId === detailMarketEntry.id : false
        }
        preview={
          detailMarketEntry ? marketPreviews[detailMarketEntry.id] : undefined
        }
        previewing={
          detailMarketEntry ? previewingId === detailMarketEntry.id : false
        }
        onClose={() => setDetailMarketEntry(null)}
        onCopyCodexLink={handleCopyCodexLink}
        onInstall={handleInstall}
      />
      <PluginLibraryDetailModal
        plugin={detailLibraryPlugin}
        onClose={() => setDetailLibraryPlugin(null)}
        onDelete={(plugin) => {
          setDetailLibraryPlugin(null);
          setDeleteTarget(plugin);
        }}
      />
    </div>
  );
}
