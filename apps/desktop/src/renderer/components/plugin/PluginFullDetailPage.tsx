import {
  lazy,
  Suspense,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowLeftIcon,
  CheckIcon,
  CheckSquareIcon,
  CodeIcon,
  CopyIcon,
  CopyPlusIcon,
  ExternalLinkIcon,
  FolderOpenIcon,
  InfoIcon,
  LinkIcon,
  SendIcon,
  SquareIcon,
  StoreIcon,
  TrashIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  PluginDistributeMode,
  PluginInventorySummary,
  PluginLibraryEntry,
  PluginTargetCompatibility,
} from "@prompthub/shared/types/plugin";
import { PLUGIN_INVENTORY_KEYS } from "@prompthub/shared/types/plugin";
import { Spinner } from "../ui/Spinner";
import { PlatformIcon } from "../ui/PlatformIcon";
import { useToast } from "../ui/Toast";

const LazySkillFileEditor = lazy(() =>
  import("../skill/SkillFileEditor").then((module) => ({
    default: module.SkillFileEditor,
  })),
);

const SAFE_PLUGIN_ICON_URL_PATTERN =
  /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i;

type PluginDetailTab = "overview" | "source" | "files";

interface PluginFullDetailPageProps {
  plugin: PluginLibraryEntry;
  targetMatrix: PluginTargetCompatibility[];
  onBack: () => void;
  onDelete: (plugin: PluginLibraryEntry) => void;
  onDistribute: (
    targetIds: string[],
    mode: PluginDistributeMode,
  ) => Promise<void>;
  onOpenStore: () => void;
}

function getPluginInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function resolvePluginIconUrl(iconUrl?: string | null): string {
  const trimmed = iconUrl?.trim() ?? "";
  if (!trimmed) return "";
  if (SAFE_PLUGIN_ICON_URL_PATTERN.test(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : "";
  } catch {
    return "";
  }
}

function getPluginBrandStyle(brandColor?: string): CSSProperties | undefined {
  if (!brandColor || !/^#[0-9a-f]{6}$/i.test(brandColor)) {
    return undefined;
  }
  return {
    backgroundColor: `${brandColor}1A`,
    color: brandColor,
  };
}

function PluginDetailAvatar({ plugin }: { plugin: PluginLibraryEntry }) {
  const [imageFailed, setImageFailed] = useState(false);
  const iconUrl = resolvePluginIconUrl(plugin.iconUrl || plugin.logoUrl);
  const brandStyle = getPluginBrandStyle(plugin.brandColor);

  if (iconUrl && !imageFailed) {
    return (
      <div
        className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border/60 bg-background"
        style={brandStyle}
      >
        <img
          data-testid="plugin-detail-avatar-image"
          src={iconUrl}
          alt=""
          aria-hidden="true"
          className="h-11 w-11 object-contain"
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary/10 text-2xl font-semibold text-primary"
      style={brandStyle}
    >
      {getPluginInitial(plugin.displayName)}
    </div>
  );
}

function getInventoryUnitLabel(
  key: keyof PluginInventorySummary,
  count: number,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const suffix = count === 1 ? "One" : "Other";
  const labels: Record<keyof PluginInventorySummary, string> = {
    skills: t(`plugin.inventoryUnit.skills${suffix}`, "Skill"),
    mcpServers: t(`plugin.inventoryUnit.mcpServers${suffix}`, "MCP server"),
    apps: t(`plugin.inventoryUnit.apps${suffix}`, "App"),
    commands: t(`plugin.inventoryUnit.commands${suffix}`, "command"),
    hooks: t(`plugin.inventoryUnit.hooks${suffix}`, "hook"),
    agents: t(`plugin.inventoryUnit.agents${suffix}`, "agent"),
    assets: t(`plugin.inventoryUnit.assets${suffix}`, "asset"),
    docs: t(`plugin.inventoryUnit.docs${suffix}`, "doc"),
    lspServers: t(`plugin.inventoryUnit.lspServers${suffix}`, "LSP server"),
    scripts: t(`plugin.inventoryUnit.scripts${suffix}`, "script"),
  };
  return labels[key];
}

function InventorySummary({
  inventory,
}: {
  inventory: PluginInventorySummary;
}) {
  const { t } = useTranslation();
  const chips = PLUGIN_INVENTORY_KEYS.map((key) => ({
    key,
    count: inventory[key],
    label: t("plugin.inventoryChip", {
      count: inventory[key],
      defaultValue: "Includes {{count}} {{label}}",
      label: getInventoryUnitLabel(key, inventory[key], t),
    }),
  })).filter((item) => item.count > 0);

  if (chips.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("plugin.inventoryEmpty", "No child assets detected.")}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground"
        >
          {chip.label}
        </span>
      ))}
    </div>
  );
}

function getPluginLocalPackagePath(plugin: PluginLibraryEntry): string {
  return (
    plugin.localPackagePath ||
    plugin.source.localPackagePath ||
    plugin.managedPath ||
    plugin.localRepositoryPath ||
    plugin.source.localRepositoryPath ||
    ""
  );
}

function DetailTabButton({
  active,
  children,
  icon,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative py-3 text-sm font-semibold transition-colors ${
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <div className="flex items-center gap-2">
        {icon}
        {children}
      </div>
      {active ? (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-primary" />
      ) : null}
    </button>
  );
}

function getPluginTargetPlatformId(targetId: string): string {
  const iconIds: Record<string, string> = {
    "claude-code": "claude",
    "gemini-cli": "gemini",
    "github-copilot": "copilot",
    "roo-code": "kilo",
  };
  return iconIds[targetId] ?? targetId;
}

function getPluginTargetDescription(
  target: PluginTargetCompatibility,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (!target.enabled) {
    return (
      target.unsupportedReason ||
      t(
        "plugin.targetUnsupportedForBundle",
        "This target does not support PromptHub Plugin bundles yet.",
      )
    );
  }
  return (
    target.adapterOutput ||
    target.installSurface ||
    target.description ||
    t(
      "plugin.targetAdapterReady",
      "Ready for adapter-backed Plugin distribution.",
    )
  );
}

function PluginPlatformPanel({
  localPackagePath,
  onDistribute,
  targetMatrix,
}: {
  localPackagePath: string;
  onDistribute: (
    targetIds: string[],
    mode: PluginDistributeMode,
  ) => Promise<void>;
  targetMatrix: PluginTargetCompatibility[];
}) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [installMode, setInstallMode] = useState<"copy" | "symlink">("copy");
  const [isDistributing, setIsDistributing] = useState(false);
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(
    new Set(),
  );
  const supportedTargets = targetMatrix.filter((target) => target.enabled);
  const selectedCount = selectedTargetIds.size;

  const toggleTarget = (target: PluginTargetCompatibility) => {
    if (!target.enabled) return;
    setSelectedTargetIds((current) => {
      const next = new Set(current);
      if (next.has(target.id)) next.delete(target.id);
      else next.add(target.id);
      return next;
    });
  };

  const selectAllTargets = () => {
    setSelectedTargetIds(new Set(supportedTargets.map((target) => target.id)));
  };

  const deselectAllTargets = () => {
    setSelectedTargetIds(new Set());
  };

  const selectedAll =
    supportedTargets.length > 0 && selectedCount === supportedTargets.length;

  const distributeToSelectedTargets = async () => {
    if (!localPackagePath || selectedCount === 0 || isDistributing) {
      return;
    }
    setIsDistributing(true);
    try {
      await onDistribute(Array.from(selectedTargetIds), installMode);
      showToast(
        t("plugin.distributionSuccess", {
          count: selectedCount,
          defaultValue: "Distributed Plugin to {{count}} Agent target(s).",
        }),
        "success",
      );
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    } finally {
      setIsDistributing(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-6">
        <h3 className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          <span>{t("skill.platformIntegration", "Platform Integration")}</span>
          <span className="text-[10px]">PLUGIN</span>
        </h3>

        <section className="space-y-4 rounded-2xl border border-border app-wallpaper-panel p-5">
          <div className="flex items-center gap-1 rounded-lg bg-accent/50 p-1">
            <button
              type="button"
              aria-pressed={installMode === "copy"}
              onClick={() => setInstallMode("copy")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors ${
                installMode === "copy"
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CopyPlusIcon aria-hidden="true" className="h-3 w-3" />
              {t("skill.copyMode", "Copy")}
            </button>
            <button
              type="button"
              aria-pressed={installMode === "symlink"}
              onClick={() => setInstallMode("symlink")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors ${
                installMode === "symlink"
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LinkIcon aria-hidden="true" className="h-3 w-3" />
              {t("skill.symlink", "Symlink")}
            </button>
          </div>

          <p className="text-[10px] leading-relaxed text-muted-foreground">
            {installMode === "copy"
              ? t(
                  "plugin.copyModeDesc",
                  "Copy: write this Plugin package into each selected Agent's configured Plugin directory.",
                )
              : t(
                  "plugin.symlinkModeDesc",
                  "Symlink: link each selected Agent's Plugin directory back to this managed package.",
                )}
          </p>

          <div className="flex flex-col gap-2 rounded-xl border border-border bg-accent/30 p-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={selectedAll ? deselectAllTargets : selectAllTargets}
                className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {selectedAll ? (
                  <>
                    <CheckSquareIcon aria-hidden="true" className="h-4 w-4" />
                    {t("skill.deselectAll", "Deselect All")}
                  </>
                ) : (
                  <>
                    <SquareIcon aria-hidden="true" className="h-4 w-4" />
                    {t("skill.selectAll", "Select All")}
                  </>
                )}
              </button>
              {selectedCount > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {selectedCount} {t("skill.selected", "selected")}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void distributeToSelectedTargets()}
              disabled={
                !localPackagePath || selectedCount === 0 || isDistributing
              }
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white shadow-lg shadow-primary/20 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <SendIcon aria-hidden="true" className="h-3.5 w-3.5" />
              {isDistributing
                ? t("plugin.distributing", "Distributing...")
                : t(
                    "plugin.distributeToSelectedAgents",
                    "Distribute to selected Agents",
                  )}
            </button>
          </div>

          <div className="space-y-2">
            {targetMatrix.map((target) => {
              const selected = selectedTargetIds.has(target.id);
              const description = getPluginTargetDescription(target, t);
              return (
                <button
                  key={target.id}
                  type="button"
                  disabled={!target.enabled}
                  aria-label={target.enabled ? target.displayName : undefined}
                  aria-pressed={target.enabled ? selected : undefined}
                  onClick={() => toggleTarget(target)}
                  className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition-all ${
                    !target.enabled
                      ? "cursor-not-allowed border-border bg-accent/20 opacity-55"
                      : selected
                        ? "cursor-pointer border-primary bg-primary/10"
                        : "cursor-pointer border-border bg-accent/30 hover:bg-accent/50"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center"
                    >
                      <PlatformIcon
                        platformId={getPluginTargetPlatformId(target.id)}
                        size={28}
                      />
                    </div>
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-medium text-foreground">
                        {target.displayName}
                      </h4>
                      <p className="line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
                        {selected
                          ? t(
                              "plugin.selectedForDistribution",
                              "Selected for Plugin distribution",
                            )
                          : target.enabled
                            ? t("skill.clickToSelect", "Click to select")
                            : description}
                      </p>
                    </div>
                  </div>
                  <div
                    aria-hidden="true"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                      selected
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/30"
                    }`}
                  >
                    {selected ? (
                      <CheckIcon className="h-3 w-3 text-white" />
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          {!localPackagePath ? (
            <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              {t(
                "plugin.localPackageMissingHint",
                "This Plugin has no local package folder yet, so files and adapter output cannot be generated.",
              )}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function PluginContentPreview({
  localPackagePath,
  plugin,
}: {
  localPackagePath: string;
  plugin: PluginLibraryEntry;
}) {
  const { t } = useTranslation();
  const contentBlocks = [
    plugin.longDescription,
    plugin.homepage
      ? `${t("plugin.homepage", "Homepage")}: ${plugin.homepage}`
      : "",
    plugin.repository || plugin.source.repository
      ? `${t("plugin.repository", "Repository")}: ${
          plugin.repository || plugin.source.repository
        }`
      : "",
    localPackagePath
      ? `${t("plugin.localPackagePath", "Local package")}: ${localPackagePath}`
      : "",
  ].filter((value): value is string => Boolean(value?.trim()));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          {t("plugin.contentTitle", "Plugin Content")}
        </h3>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          MANIFEST
        </span>
      </div>
      <div className="rounded-2xl border border-border app-wallpaper-panel p-5">
        {contentBlocks.length > 0 ? (
          <div className="space-y-4">
            {contentBlocks.map((block, index) => (
              <p
                key={`${index}-${block.slice(0, 24)}`}
                className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground/90"
              >
                {block}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-7 text-muted-foreground">
            {t(
              "plugin.contentEmpty",
              "No extended Plugin content is available yet. Open the Files tab to inspect the package files.",
            )}
          </p>
        )}
      </div>
    </section>
  );
}

function PluginOverview({
  localPackagePath,
  onDistribute,
  plugin,
  targetMatrix,
}: {
  localPackagePath: string;
  onDistribute: (
    targetIds: string[],
    mode: PluginDistributeMode,
  ) => Promise<void>;
  plugin: PluginLibraryEntry;
  targetMatrix: PluginTargetCompatibility[];
}) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
            {t("plugin.descriptionTitle", "Plugin Description")}
          </h3>
          <div className="rounded-2xl border border-border app-wallpaper-panel p-5">
            <p className="text-sm leading-7 text-foreground/90">
              {plugin.description ||
                t("plugin.noDescription", "No description provided")}
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
            {t("plugin.inventoryTitle", "Inventory")}
          </h3>
          <div className="rounded-2xl border border-border app-wallpaper-panel p-5">
            <InventorySummary inventory={plugin.inventory} />
          </div>
        </section>

        <PluginContentPreview
          localPackagePath={localPackagePath}
          plugin={plugin}
        />
      </div>

      <div className="space-y-6">
        <PluginPlatformPanel
          localPackagePath={localPackagePath}
          onDistribute={onDistribute}
          targetMatrix={targetMatrix}
        />
      </div>
    </div>
  );
}

function PluginSourcePanel({
  localPackagePath,
  plugin,
}: {
  localPackagePath: string;
  plugin: PluginLibraryEntry;
}) {
  const { t } = useTranslation();
  const sourceJson = useMemo(
    () => JSON.stringify(plugin.source, null, 2),
    [plugin],
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          {t("plugin.metadata", "Plugin Metadata")}
        </h3>
        <div className="grid gap-3 rounded-2xl border border-border app-wallpaper-panel p-4 md:grid-cols-2">
          <MetadataItem label={t("plugin.id", "Plugin ID")} value={plugin.id} />
          <MetadataItem
            label={t("plugin.classificationLabel", "Classification")}
            value={plugin.classification}
          />
          <MetadataItem
            label={t("plugin.localPackagePath", "Local package")}
            value={
              localPackagePath ||
              t("plugin.localPackageMissing", "Not available")
            }
            wide
          />
          <MetadataItem
            label={t("plugin.source", "Source")}
            value={
              plugin.source.label ||
              plugin.source.repository ||
              plugin.source.url ||
              "-"
            }
            wide
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          {t("plugin.sourceManifest", "Source / Manifest")}
        </h3>
        <div className="overflow-hidden rounded-2xl border border-border app-wallpaper-panel">
          <pre className="max-h-[52vh] overflow-auto whitespace-pre-wrap break-words p-5 text-xs text-foreground/80">
            {sourceJson}
          </pre>
        </div>
      </section>
    </div>
  );
}

function MetadataItem({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "md:col-span-2" : undefined}>
      <div className="text-[11px] font-medium text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 break-words font-mono text-xs text-foreground">
        {value}
      </div>
    </div>
  );
}

function PluginFilesPanel({
  localPackagePath,
  plugin,
}: {
  localPackagePath: string;
  plugin: PluginLibraryEntry;
}) {
  const { t } = useTranslation();

  if (!localPackagePath) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 px-6 text-center">
        <FolderOpenIcon className="h-10 w-10 text-muted-foreground/50" />
        <h2 className="mt-3 text-base font-semibold text-foreground">
          {t("plugin.noLocalFilesTitle", "No local Plugin files")}
        </h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {t(
            "plugin.noLocalFilesDesc",
            "Install or materialize the Plugin package before browsing files.",
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden app-wallpaper-panel">
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center">
            <Spinner
              size="lg"
              tone="muted"
              label={t("common.loading", "Loading...")}
            />
          </div>
        }
      >
        <LazySkillFileEditor
          skillId={plugin.id}
          localPath={localPackagePath}
          skillName={plugin.displayName}
          isOpen
          mode="inline"
        />
      </Suspense>
    </div>
  );
}

export function PluginFullDetailPage({
  plugin,
  targetMatrix,
  onBack,
  onDelete,
  onDistribute,
  onOpenStore,
}: PluginFullDetailPageProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<PluginDetailTab>("overview");
  const localPackagePath = getPluginLocalPackagePath(plugin);

  const openLocalPackage = async () => {
    if (!localPackagePath) return;
    try {
      const result = await window.electron?.openPath?.(localPackagePath);
      if (result && !result.success) {
        showToast(
          result.error ||
            t("plugin.openPluginFolderFailed", "Failed to open Plugin folder"),
          "error",
        );
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    }
  };

  const copyLocalPackagePath = async () => {
    if (!localPackagePath) return;
    try {
      await navigator.clipboard.writeText(localPackagePath);
      showToast(t("plugin.localPathCopied", "Plugin path copied"));
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    }
  };

  return (
    <div
      data-testid="plugin-full-detail-page"
      className="flex h-full min-h-0 flex-col overflow-hidden app-wallpaper-section"
    >
      <header className="shrink-0 border-b border-border app-wallpaper-panel-strong px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <button
              type="button"
              onClick={onBack}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={t("common.back", "Back")}
              title={t("common.back", "Back")}
            >
              <ArrowLeftIcon aria-hidden="true" className="h-5 w-5" />
            </button>
            <PluginDetailAvatar plugin={plugin} />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold text-foreground">
                {plugin.displayName}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-600 dark:text-emerald-300">
                  {t("plugin.installed", "Installed")}
                </span>
                {plugin.version ? (
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
                    v{plugin.version}
                  </span>
                ) : null}
                {plugin.category ? (
                  <span className="rounded-full bg-muted px-2.5 py-1 font-medium">
                    {plugin.category}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onOpenStore}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <StoreIcon aria-hidden="true" className="h-4 w-4" />
              {t("plugin.openOfficialStore", "Open Plugins Store")}
            </button>
            <button
              type="button"
              onClick={() => void copyLocalPackagePath()}
              disabled={!localPackagePath}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
              aria-label={t("plugin.copyLocalPackagePath", "Copy Plugin path")}
              title={t("plugin.copyLocalPackagePath", "Copy Plugin path")}
            >
              <CopyIcon aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void openLocalPackage()}
              disabled={!localPackagePath}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
              aria-label={t("plugin.openPluginFolder", "Open Plugin folder")}
              title={t("plugin.openPluginFolder", "Open Plugin folder")}
            >
              <ExternalLinkIcon aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(plugin)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              aria-label={t("plugin.deletePlugin", "Delete Plugin")}
              title={t("plugin.deletePlugin", "Delete Plugin")}
            >
              <TrashIcon aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex shrink-0 items-center gap-6 border-b border-border bg-accent/20 px-6">
        <DetailTabButton
          active={activeTab === "overview"}
          icon={<InfoIcon aria-hidden="true" className="h-4 w-4" />}
          onClick={() => setActiveTab("overview")}
        >
          {t("common.preview", "Preview")}
        </DetailTabButton>
        <DetailTabButton
          active={activeTab === "source"}
          icon={<CodeIcon aria-hidden="true" className="h-4 w-4" />}
          onClick={() => setActiveTab("source")}
        >
          {t("common.content", "Source / Content")}
        </DetailTabButton>
        <DetailTabButton
          active={activeTab === "files"}
          icon={<FolderOpenIcon aria-hidden="true" className="h-4 w-4" />}
          onClick={() => setActiveTab("files")}
        >
          {t("skill.files", "Files")}
        </DetailTabButton>
      </div>

      <main
        className={`flex min-h-0 flex-1 flex-col ${
          activeTab === "files" ? "overflow-hidden" : "overflow-y-auto p-6"
        }`}
      >
        {activeTab === "overview" ? (
          <PluginOverview
            localPackagePath={localPackagePath}
            onDistribute={onDistribute}
            plugin={plugin}
            targetMatrix={targetMatrix}
          />
        ) : activeTab === "source" ? (
          <PluginSourcePanel
            localPackagePath={localPackagePath}
            plugin={plugin}
          />
        ) : (
          <PluginFilesPanel
            localPackagePath={localPackagePath}
            plugin={plugin}
          />
        )}
      </main>
    </div>
  );
}
