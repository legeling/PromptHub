import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowLeftIcon,
  BotIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
  CheckCircleIcon,
  CheckSquareIcon,
  Clock3Icon,
  CopyIcon,
  DatabaseIcon,
  DownloadIcon,
  EyeIcon,
  FolderOpenIcon,
  GlobeIcon,
  InboxIcon,
  LayoutGridIcon,
  ListIcon,
  ListChecksIcon,
  Loader2Icon,
  PackageIcon,
  PackagePlusIcon,
  RefreshCwIcon,
  SendIcon,
  Settings2Icon,
  StarIcon,
  StoreIcon,
  TagsIcon,
  TrashIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  PluginDistributeMode,
  PluginImportSourceRequest,
  PluginInventorySummary,
  PluginLibraryEntry,
  PluginMarketEntry,
  PluginMarketPreview,
  PluginSourceUpdateCheck,
  PluginTargetCompatibility,
  PluginTargetInstalledPlugin,
  PluginTargetStatus,
} from "@prompthub/shared/types/plugin";
import { PLUGIN_INVENTORY_KEYS } from "@prompthub/shared/types/plugin";
import type { ScannedSkill } from "@prompthub/shared/types";
import { usePluginStore } from "../../stores/plugin.store";
import type {
  PluginLibraryGalleryColumnMode,
  PluginLibraryViewMode,
} from "../../stores/plugin.store";
import { useSkillStore } from "../../stores/skill.store";
import { useMcpStore } from "../../stores/mcp.store";
import { useUIStore } from "../../stores/ui.store";
import {
  DEFAULT_SKILL_LIST_PAGE_SIZE,
  SKILL_LIST_PAGE_SIZE_OPTIONS,
  useSettingsStore,
} from "../../stores/settings.store";
import { Spinner } from "../ui/Spinner";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import { Modal } from "../ui/Modal";
import { PlatformIcon } from "../ui/PlatformIcon";
import { CardStatusBadge } from "../ui/CardStatusBadge";
import { Select, type SelectOption } from "../ui/Select";
import { useToast } from "../ui/Toast";
import { copyTextToClipboard } from "../../utils/clipboard";
import { PluginAgentTargetPicker } from "./PluginAgentTargetPicker";
import { PluginFullDetailPage } from "./PluginFullDetailPage";
import { buildAgentDetailPlugin } from "./agent-plugin-detail-adapter";
import { SkillRenderBoundary } from "../skill/SkillRenderBoundary";
import { SkillStoreSourceEditModal } from "../skill/SkillStoreSourceEditModal";
import { SkillStoreSourceForm } from "../skill/SkillStoreSourceForm";
import type { CustomStoreSourceType } from "../../services/custom-store-source";

type PluginTab = "library" | "market" | "targets";
type PluginLibraryFilter = "all" | "favorites" | "distributed" | "pending";
type AgentPluginFilter =
  | "all"
  | "my-plugins"
  | "agent-installed"
  | "distributed"
  | "pending";
type PluginBatchTagMode = "add" | "remove";

const tabIconClassName = "h-4 w-4";
const AGENT_PLUGIN_HEADER_CLASS =
  "h-[132px] border-b border-border app-wallpaper-panel-strong";
const MARKET_PREVIEW_PREFETCH_CONCURRENCY = 6;
const MARKET_GRID_GAP_PX = 12;
const MARKET_GRID_ROW_HEIGHT_PX = 132;
const MARKET_GRID_HEADER_HEIGHT_PX = 36;
const MARKET_GRID_BOTTOM_GUTTER_PX = 24;
const MARKET_CATALOG_VIRTUALIZE_THRESHOLD = 240;
const PLUGIN_LIBRARY_GALLERY_AUTO_MIN_WIDTH_PX = 360;
const PLUGIN_LIBRARY_GALLERY_MANUAL_MIN_WIDTH_PX = 280;
const PLUGIN_LIBRARY_GALLERY_COLUMNS: PluginLibraryGalleryColumnMode[] = [
  "auto",
  "2",
  "3",
  "4",
];
const OPEN_ADD_PLUGIN_MODAL_EVENT = "open-add-plugin-modal";
const SAFE_PLUGIN_ICON_DATA_URL_PATTERN =
  /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i;

const SkillScanPreview = lazy(() =>
  import("../skill/SkillScanPreview").then((module) => ({
    default: module.SkillScanPreview,
  })),
);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getPluginLibraryGalleryGridStyle(
  columns: PluginLibraryGalleryColumnMode,
): CSSProperties {
  if (columns === "auto") {
    return {
      gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${PLUGIN_LIBRARY_GALLERY_AUTO_MIN_WIDTH_PX}px), 1fr))`,
    };
  }

  const columnCount = Number(columns);
  const totalGapRem = columnCount - 1;

  return {
    gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, max(${PLUGIN_LIBRARY_GALLERY_MANUAL_MIN_WIDTH_PX}px, calc((100% - ${totalGapRem}rem) / ${columnCount}))), 1fr))`,
  };
}

function hasFileItems(dataTransfer: DataTransfer): boolean {
  return (
    Array.from(dataTransfer.items ?? []).some((item) => item.kind === "file") ||
    dataTransfer.files.length > 0
  );
}

function normalizeDroppedPluginPath(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, "/").trim();
  if (!normalizedPath) {
    return "";
  }

  const lowerPath = normalizedPath.toLowerCase();
  const markerDirectories = [
    "/.codex-plugin/plugin.json",
    "/.claude-plugin/plugin.json",
    "/.cursor-plugin/plugin.json",
    "/.plugin/plugin.json",
    "/.github/plugin/plugin.json",
  ];
  for (const marker of markerDirectories) {
    if (lowerPath.endsWith(marker)) {
      return normalizedPath.slice(0, normalizedPath.length - marker.length);
    }
  }

  const markerFiles = ["/plugin.json", "/gemini-extension.json", "/power.md"];
  for (const marker of markerFiles) {
    if (lowerPath.endsWith(marker)) {
      return normalizedPath.slice(0, normalizedPath.length - marker.length);
    }
  }

  if (/[\\/][^\\/]+\.[^\\/]+$/.test(normalizedPath)) {
    return "";
  }

  return normalizedPath;
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

function getInventoryChipLabel(
  key: keyof PluginInventorySummary,
  count: number,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  return t("plugin.inventoryChip", {
    defaultValue: "{{count}} {{label}}",
    count,
    label: getInventoryUnitLabel(key, count, t),
  });
}

function InventoryChips({ inventory }: { inventory: PluginInventorySummary }) {
  const { t } = useTranslation();
  const chips = PLUGIN_INVENTORY_KEYS.map((key) => ({
    key,
    label: getInventoryChipLabel(key, inventory[key], t),
    count: inventory[key],
  })).filter((item) => item.count > 0);

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="rounded-full border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground"
        >
          {chip.label}
        </span>
      ))}
    </div>
  );
}

function getStatusLabel(
  status: PluginTargetStatus,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (status === "runtime-only" || status === "composite") {
    return t("plugin.targetStatus.unsupportedPlugin", "Unsupported");
  }
  const labels: Record<PluginTargetStatus, string> = {
    native: t("plugin.targetStatus.native", "Native"),
    adapter: t("plugin.targetStatus.adapter", "Adapter"),
    "runtime-only": t("plugin.targetStatus.runtimeOnly", "Runtime only"),
    composite: t("plugin.targetStatus.composite", "Composite"),
    pending: t("plugin.targetStatus.pending", "Pending"),
  };
  return labels[status];
}

function getAgentPluginFilterButtonClass(
  isActive: boolean,
  tone: "default" | "managed" | "external",
): string {
  if (tone === "managed") {
    return isActive
      ? "rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 font-medium text-emerald-700 shadow-sm dark:text-emerald-300"
      : "rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-700 transition-colors hover:bg-emerald-500/15 dark:text-emerald-300";
  }
  if (tone === "external") {
    return isActive
      ? "rounded-full border border-amber-500/35 bg-amber-500/15 px-2.5 py-1 font-medium text-amber-700 shadow-sm dark:text-amber-300"
      : "rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 font-medium text-amber-700 transition-colors hover:bg-amber-500/15 dark:text-amber-300";
  }
  return isActive
    ? "rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-medium text-primary shadow-sm"
    : "rounded-full border border-border bg-background/60 px-2.5 py-1 text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary";
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
    return t("plugin.sources.codexOfficial", "Codex Official Store");
  }
  if (sourceId === "prompthub-official") {
    return t("plugin.sources.promptHubOfficial", "Official Store");
  }
  return displayName;
}

function getPluginCategoryLabel(
  category: string,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  return t(`plugin.categories.${category}`, category);
}

function getPluginTrustLabel(
  trustLevel: PluginMarketEntry["trustLevel"],
  t: ReturnType<typeof useTranslation>["t"],
): string {
  return t(`plugin.trust.${trustLevel}`, trustLevel);
}

function getPluginLibraryFilterLabel(
  filter: PluginLibraryFilter,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (filter === "all") {
    return t("plugin.allPlugins", "All Plugins");
  }
  if (filter === "favorites") {
    return t("plugin.favorites", "Favorites");
  }
  if (filter === "distributed") {
    return t("plugin.distributed", "Distributed");
  }
  return t("plugin.pendingDistribution", "Pending");
}

function normalizePluginUserTag(input: string): string {
  return input.trim().toLowerCase();
}

function uniquePluginTags(tags: string[]): string[] {
  return Array.from(
    new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0)),
  );
}

function getPluginUserTags(plugin: PluginLibraryEntry): string[] {
  return uniquePluginTags(plugin.userTags ?? []);
}

function getPluginDisplayTags(
  entry: PluginLibraryEntry | PluginMarketEntry,
): string[] {
  const userTags = "userTags" in entry ? (entry.userTags ?? []) : [];
  return uniquePluginTags([...(entry.tags ?? []), ...userTags]);
}

function updatePluginUserTags(
  currentTags: string[] | undefined,
  tag: string,
  mode: PluginBatchTagMode,
): string[] {
  const normalized = normalizePluginUserTag(tag);
  const existing = uniquePluginTags(currentTags ?? []);
  if (!normalized) {
    return existing;
  }
  if (mode === "add") {
    return existing.includes(normalized) ? existing : [...existing, normalized];
  }
  return existing.filter((item) => item !== normalized);
}

function collectPluginTagSuggestions(plugins: PluginLibraryEntry[]): string[] {
  return Array.from(
    new Set(
      plugins
        .flatMap((plugin) => getPluginDisplayTags(plugin))
        .filter((tag) => tag.trim()),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

function getPluginLibrarySourceKey(plugin: PluginLibraryEntry): string {
  return [
    plugin.source.sourceId,
    plugin.source.label,
    plugin.source.repository,
    plugin.source.localPackagePath,
    plugin.source.localRepositoryPath,
    plugin.managedPath,
    plugin.localPackagePath,
    plugin.localRepositoryPath,
    plugin.source.kind,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("|");
}

function getPluginLibrarySourceLabel(
  plugin: PluginLibraryEntry,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (plugin.source.sourceId === "openai-curated") {
    return t("plugin.sources.codexOfficial", "Codex Official Store");
  }
  if (plugin.source.sourceId === "prompthub-official") {
    return t("plugin.sources.promptHubOfficial", "Official Store");
  }
  if (plugin.source.label) {
    return plugin.source.label;
  }
  if (plugin.source.repository) {
    return plugin.source.repository;
  }
  if (plugin.source.kind === "local") {
    return t("plugin.localSource", "Local source");
  }
  return t("plugin.unknownSource", "Unknown source");
}

function shouldShowMarketTrustBadge(entry: PluginMarketEntry): boolean {
  if (
    entry.trustLevel === "official" &&
    (entry.marketplaceId === "openai-curated" ||
      entry.marketplaceId === "prompthub-official")
  ) {
    return false;
  }
  return true;
}

function getPluginPolicyValueLabel(
  scope: "installation" | "authentication",
  value: string,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  return t(`plugin.policy.${scope}.${value}`, value);
}

function getPluginEntryId(entry: PluginLibraryEntry | PluginMarketEntry) {
  return entry.id;
}

type PluginStoreCatalogRow =
  | {
      type: "section";
      key: string;
      label: string;
      count: number;
      tone: "installed" | "available";
    }
  | {
      type: "plugins";
      key: string;
      entries: PluginMarketEntry[];
      installed: boolean;
    };

function getMarketGridColumns(width: number): number {
  if (width >= 1280) return 4;
  if (width >= 1024) return 3;
  if (width >= 640) return 2;
  return 1;
}

function buildPluginStoreCatalogRows(options: {
  availableLabel: string;
  availableEntries: PluginMarketEntry[];
  columns: number;
  installedEntries: PluginMarketEntry[];
  installedLabel: string;
}): PluginStoreCatalogRow[] {
  const rows: PluginStoreCatalogRow[] = [];
  const appendSection = (
    key: string,
    label: string,
    entries: PluginMarketEntry[],
    installed: boolean,
  ) => {
    if (entries.length === 0) return;
    rows.push({
      type: "section",
      key: `${key}-header`,
      label,
      count: entries.length,
      tone: installed ? "installed" : "available",
    });

    for (let index = 0; index < entries.length; index += options.columns) {
      const rowEntries = entries.slice(index, index + options.columns);
      rows.push({
        type: "plugins",
        key: `${key}-${index}-${rowEntries.map(getPluginEntryId).join("|")}`,
        entries: rowEntries,
        installed,
      });
    }
  };

  appendSection(
    "installed",
    options.installedLabel,
    options.installedEntries,
    true,
  );
  appendSection(
    "available",
    options.availableLabel,
    options.availableEntries,
    false,
  );
  return rows;
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

function getPluginInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function resolvePluginIconUrl(iconUrl?: string | null): string {
  const trimmed = iconUrl?.trim() ?? "";
  if (!trimmed) {
    return "";
  }
  if (SAFE_PLUGIN_ICON_DATA_URL_PATTERN.test(trimmed)) {
    return trimmed;
  }
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

function PluginAvatar({
  entry,
  size = "md",
  testId,
}: {
  entry: Pick<
    PluginLibraryEntry | PluginMarketEntry,
    "displayName" | "iconUrl" | "logoUrl" | "brandColor"
  >;
  size?: "sm" | "md" | "lg";
  testId?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const iconUrl = resolvePluginIconUrl(entry.iconUrl || entry.logoUrl);
  const sizeClass =
    size === "lg"
      ? "h-16 w-16 rounded-2xl text-2xl"
      : size === "sm"
        ? "h-10 w-10 rounded-xl text-sm"
        : "h-12 w-12 rounded-xl text-base";
  const imageClass = size === "lg" ? "h-11 w-11" : "h-8 w-8";
  const brandStyle = getPluginBrandStyle(entry.brandColor);

  if (iconUrl && !imageFailed) {
    return (
      <div
        data-testid={testId}
        className={`grid shrink-0 place-items-center overflow-hidden border border-border/60 bg-background ${sizeClass}`}
        style={brandStyle}
      >
        <img
          data-testid="plugin-avatar-image"
          src={iconUrl}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className={`${imageClass} object-contain`}
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      data-testid={testId}
      className={`grid shrink-0 place-items-center bg-primary/10 font-semibold text-primary ${sizeClass}`}
      style={brandStyle}
    >
      {getPluginInitial(entry.displayName)}
    </div>
  );
}

function getTargetPlatformIconId(targetId: string): string {
  const iconIds: Record<string, string> = {
    "claude-code": "claude",
    "gemini-cli": "gemini",
    "github-copilot": "copilot",
  };
  return iconIds[targetId] ?? targetId;
}

function getTargetDescription(
  target: PluginTargetCompatibility,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const localizedDescription = t(`plugin.targetDescriptions.${target.id}`, {
    defaultValue: "",
    name: target.displayName,
  }).trim();
  if (localizedDescription) {
    return localizedDescription;
  }
  if (!target.enabled) {
    return t("plugin.targetDescriptions.unsupportedBundle", {
      defaultValue:
        "{{name}} does not expose a complete PromptHub Plugin bundle surface.",
      name: target.displayName,
    });
  }
  return (
    target.description ||
    target.adapterOutput ||
    target.unsupportedReason ||
    t("plugin.targetPendingDesc", "Adapter evidence is pending.")
  );
}

function getTargetUnsupportedTitle(
  target: PluginTargetCompatibility,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  return t("plugin.targetUnsupportedBundleTitle", {
    defaultValue: "{{name}} does not support PromptHub Plugin bundles",
    name: target.displayName,
  });
}

function PluginBatchTagDialog({
  onClose,
  onSubmit,
  plugins,
}: {
  onClose: () => void;
  onSubmit: (tag: string, mode: PluginBatchTagMode) => Promise<void>;
  plugins: PluginLibraryEntry[];
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<PluginBatchTagMode>("add");
  const [tagInput, setTagInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const suggestedTags = useMemo(
    () => collectPluginTagSuggestions(plugins),
    [plugins],
  );
  const affectedCount = useMemo(() => {
    const normalized = normalizePluginUserTag(tagInput);
    if (!normalized) return 0;
    return plugins.filter((plugin) => {
      const nextTags = updatePluginUserTags(plugin.userTags, normalized, mode);
      return (
        JSON.stringify(nextTags) !== JSON.stringify(getPluginUserTags(plugin))
      );
    }).length;
  }, [mode, plugins, tagInput]);

  const handleSubmit = async () => {
    if (!tagInput.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit(tagInput, mode);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t("plugin.batchTags", "Batch Tags")}
      size="lg"
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-background/60 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <TagsIcon aria-hidden="true" className="h-4 w-4 text-primary" />
            {t("plugin.batchTagsHint", {
              count: plugins.length,
              defaultValue:
                "Add or remove user tags across {{count}} selected Plugins.",
            })}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["add", t("plugin.addTag", "Add tag")],
              ["remove", t("plugin.removeTag", "Remove tag")],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                mode === value
                  ? "border-primary/40 bg-primary/5 text-primary"
                  : "border-border app-wallpaper-surface hover:border-primary/25"
              }`}
            >
              <div className="text-sm font-medium">{label}</div>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {t("plugin.tag", "Tag")}
            <input
              type="text"
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && tagInput.trim() && !isSubmitting) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder={t(
                "plugin.enterTagHint",
                "Enter new tag and press Enter",
              )}
              className="mt-2 h-11 w-full rounded-xl border border-border app-wallpaper-surface px-3 text-sm outline-none transition-colors focus:border-primary/40"
            />
          </label>
          <div className="text-xs text-muted-foreground">
            {t("plugin.batchTagAffected", {
              count: affectedCount,
              defaultValue: "{{count}} Plugins will be updated",
            })}
          </div>
        </div>

        {suggestedTags.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("plugin.existingTags", "Existing tags")}
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestedTags.slice(0, 20).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTagInput(tag)}
                  className="rounded-full border border-border app-wallpaper-surface px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/25 hover:text-foreground"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting || !tagInput.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2Icon
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin"
                />
                {t("common.saving", "Saving")}
              </>
            ) : mode === "add" ? (
              t("plugin.addTag", "Add tag")
            ) : (
              t("plugin.removeTag", "Remove tag")
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PluginCard({
  batchMode = false,
  isSelected = false,
  plugin,
  sourceUpdateStatus,
  targetMatrix,
  onDelete,
  onContextMenu,
  onOpenAgentTargets,
  onOpenDetail,
  onOpenFolder,
  onToggleFavorite,
  onToggleSelection,
}: {
  batchMode?: boolean;
  isSelected?: boolean;
  plugin: PluginLibraryEntry;
  sourceUpdateStatus?: PluginSourceUpdateCheck["status"];
  targetMatrix: PluginTargetCompatibility[];
  onDelete: (plugin: PluginLibraryEntry) => void;
  onContextMenu: (event: MouseEvent, plugin: PluginLibraryEntry) => void;
  onOpenAgentTargets: (plugin: PluginLibraryEntry) => void;
  onOpenDetail: (plugin: PluginLibraryEntry) => void;
  onOpenFolder: (plugin: PluginLibraryEntry) => void;
  onToggleFavorite: (plugin: PluginLibraryEntry) => void;
  onToggleSelection: (plugin: PluginLibraryEntry) => void;
}) {
  const { t } = useTranslation();
  const cardLabel = plugin.description
    ? `${plugin.displayName}. ${plugin.description}`
    : plugin.displayName;
  const distributedTargets = (plugin.distributedTargetIds ?? [])
    .map((targetId) => targetMatrix.find((target) => target.id === targetId))
    .filter((target): target is PluginTargetCompatibility => Boolean(target));
  const visibleDistributedTargets = distributedTargets.slice(0, 6);
  const displayTags = getPluginDisplayTags(plugin);
  const hasLocalPackage = Boolean(
    plugin.localPackagePath ||
    plugin.source.localPackagePath ||
    plugin.managedPath ||
    plugin.localRepositoryPath ||
    plugin.source.localRepositoryPath,
  );
  const sourceUpdateBadge =
    sourceUpdateStatus === "update-available"
      ? {
          label: t("plugin.updateAvailable", "Update available"),
          tone: "info" as const,
        }
      : sourceUpdateStatus === "local-modified"
        ? {
            label: t("plugin.localChanges", "Local changes"),
            tone: "danger" as const,
          }
        : sourceUpdateStatus === "conflict"
          ? {
              label: t("plugin.updateConflict", "Update conflict"),
              tone: "danger" as const,
            }
          : null;

  return (
    <article
      data-testid={`plugin-library-card-${plugin.id}`}
      role="button"
      tabIndex={0}
      aria-label={cardLabel}
      aria-pressed={batchMode ? isSelected : undefined}
      onClick={() =>
        batchMode ? onToggleSelection(plugin) : onOpenDetail(plugin)
      }
      onContextMenu={(event) => onContextMenu(event, plugin)}
      onKeyDown={(event) => {
        if (event.currentTarget !== event.target) {
          return;
        }
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        if (batchMode) {
          onToggleSelection(plugin);
        } else {
          onOpenDetail(plugin);
        }
      }}
      className={`group relative min-h-[220px] cursor-pointer rounded-2xl border app-wallpaper-panel p-5 transition-all ${
        isSelected
          ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
          : "border-border hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl"
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
          className={`absolute right-4 top-4 z-10 grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition-all active:scale-press-in ${
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

      <div
        data-testid={`plugin-library-card-body-${plugin.id}`}
        className="flex h-full w-full flex-col items-start rounded-lg text-left"
      >
        <div className="mb-4 flex w-full items-start justify-between gap-3">
          <PluginAvatar
            entry={plugin}
            size="lg"
            testId={`plugin-library-card-icon-${plugin.id}`}
          />
          {!batchMode ? (
            <div className="flex min-w-0 flex-1 flex-col items-end gap-2">
              {sourceUpdateBadge ? (
                <CardStatusBadge
                  label={sourceUpdateBadge.label}
                  testId={`plugin-card-status-${plugin.id}`}
                  tone={sourceUpdateBadge.tone}
                />
              ) : null}
              <div
                data-testid={`plugin-card-agent-targets-${plugin.id}`}
                className="flex min-h-8 max-w-full flex-wrap items-center justify-end gap-1.5"
                title={t(
                  "plugin.distributedAgentTargets",
                  "Distributed Agent targets",
                )}
              >
                {visibleDistributedTargets.length > 0 ? (
                  visibleDistributedTargets.map((target) => (
                    <PlatformIcon
                      key={target.id}
                      platformId={getTargetPlatformIconId(target.id)}
                      size={18}
                      title={target.displayName}
                    />
                  ))
                ) : (
                  <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
                    {t("plugin.notDistributed", "Not distributed")}
                  </span>
                )}
                {distributedTargets.length >
                visibleDistributedTargets.length ? (
                  <span className="text-[10px] text-muted-foreground">
                    +
                    {distributedTargets.length -
                      visibleDistributedTargets.length}
                  </span>
                ) : null}
              </div>
              <div
                data-testid={`plugin-card-actions-${plugin.id}`}
                className="flex w-full justify-end gap-1"
              >
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleFavorite(plugin);
                  }}
                  aria-label={
                    plugin.isFavorite
                      ? t("plugin.removeFromFavorites", {
                          defaultValue: "Remove {{name}} from favorites",
                          name: plugin.displayName,
                        })
                      : t("plugin.addToFavorites", {
                          defaultValue: "Add {{name}} to favorites",
                          name: plugin.displayName,
                        })
                  }
                  className={`rounded-lg p-2 opacity-0 transition-all group-hover:opacity-100 active:scale-press-in ${
                    plugin.isFavorite
                      ? "text-amber-500 hover:bg-amber-500/10"
                      : "text-muted-foreground hover:bg-amber-500/10 hover:text-amber-500"
                  }`}
                  title={
                    plugin.isFavorite
                      ? t("plugin.removeFavorite", "Remove Favorite")
                      : t("plugin.addFavorite", "Add Favorite")
                  }
                >
                  <StarIcon
                    aria-hidden="true"
                    className={`h-4 w-4 ${
                      plugin.isFavorite ? "fill-current" : ""
                    }`}
                  />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenAgentTargets(plugin);
                  }}
                  aria-label={t("plugin.selectAgentTargetsForPlugin", {
                    defaultValue: "Select Agent targets for {{name}}",
                    name: plugin.displayName,
                  })}
                  className="rounded-lg p-2 text-muted-foreground opacity-0 transition-all hover:bg-primary/10 hover:text-primary group-hover:opacity-100 active:scale-press-in"
                  title={t("plugin.selectAgentTargets", "Select Agent targets")}
                >
                  <SendIcon aria-hidden="true" className="h-4 w-4" />
                </button>
                {hasLocalPackage ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenFolder(plugin);
                    }}
                    aria-label={t(
                      "plugin.openPluginFolder",
                      "Open Plugin folder",
                    )}
                    className="rounded-lg p-2 text-muted-foreground opacity-0 transition-all hover:bg-accent hover:text-foreground group-hover:opacity-100 active:scale-press-in"
                    title={t("plugin.openPluginFolder", "Open Plugin folder")}
                  >
                    <FolderOpenIcon aria-hidden="true" className="h-4 w-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(plugin);
                  }}
                  aria-label={t("plugin.deletePlugin", "Delete Plugin")}
                  className="rounded-lg p-2 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 active:scale-press-in"
                  title={t("plugin.deletePlugin", "Delete Plugin")}
                >
                  <TrashIcon aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <h3
            className="mb-2 line-clamp-1 text-lg font-bold text-foreground transition-colors group-hover:text-primary"
            title={plugin.displayName}
          >
            {plugin.displayName}
          </h3>
          <p className="mb-4 line-clamp-2 h-10 text-sm italic leading-relaxed text-muted-foreground opacity-80">
            {plugin.description ||
              plugin.author?.name ||
              t("plugin.noDescription", "No description provided")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
              {t("plugin.installed", "Installed")}
            </span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {getPluginTrustLabel(plugin.trustLevel, t)}
            </span>
            {plugin.category ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {getPluginCategoryLabel(plugin.category, t)}
              </span>
            ) : null}
            {displayTags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function PluginListRow({
  batchMode = false,
  isSelected = false,
  plugin,
  sourceUpdateStatus,
  targetMatrix,
  onDelete,
  onContextMenu,
  onOpenAgentTargets,
  onOpenDetail,
  onOpenFolder,
  onToggleFavorite,
  onToggleSelection,
}: {
  batchMode?: boolean;
  isSelected?: boolean;
  plugin: PluginLibraryEntry;
  sourceUpdateStatus?: PluginSourceUpdateCheck["status"];
  targetMatrix: PluginTargetCompatibility[];
  onDelete: (plugin: PluginLibraryEntry) => void;
  onContextMenu: (event: MouseEvent, plugin: PluginLibraryEntry) => void;
  onOpenAgentTargets: (plugin: PluginLibraryEntry) => void;
  onOpenDetail: (plugin: PluginLibraryEntry) => void;
  onOpenFolder: (plugin: PluginLibraryEntry) => void;
  onToggleFavorite: (plugin: PluginLibraryEntry) => void;
  onToggleSelection: (plugin: PluginLibraryEntry) => void;
}) {
  const { t } = useTranslation();
  const cardLabel = plugin.description
    ? `${plugin.displayName}. ${plugin.description}`
    : plugin.displayName;
  const distributedTargets = (plugin.distributedTargetIds ?? [])
    .map((targetId) => targetMatrix.find((target) => target.id === targetId))
    .filter((target): target is PluginTargetCompatibility => Boolean(target));
  const hasLocalPackage = Boolean(getPluginLocalPackagePath(plugin));
  const sourceUpdateBadge =
    sourceUpdateStatus === "update-available"
      ? {
          label: t("plugin.updateAvailable", "Update available"),
          tone: "info" as const,
        }
      : sourceUpdateStatus === "local-modified"
        ? {
            label: t("plugin.localChanges", "Local changes"),
            tone: "danger" as const,
          }
        : sourceUpdateStatus === "conflict"
          ? {
              label: t("plugin.updateConflict", "Update conflict"),
              tone: "danger" as const,
            }
          : null;

  return (
    <article
      data-testid={`plugin-library-row-${plugin.id}`}
      role="button"
      tabIndex={0}
      aria-label={cardLabel}
      aria-pressed={batchMode ? isSelected : undefined}
      onClick={() =>
        batchMode ? onToggleSelection(plugin) : onOpenDetail(plugin)
      }
      onContextMenu={(event) => onContextMenu(event, plugin)}
      onKeyDown={(event) => {
        if (event.currentTarget !== event.target) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (batchMode) {
          onToggleSelection(plugin);
        } else {
          onOpenDetail(plugin);
        }
      }}
      className={`group flex cursor-pointer items-center gap-4 rounded-2xl border app-wallpaper-panel px-4 py-3 transition-all ${
        isSelected
          ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
          : "border-border hover:border-primary/40 hover:bg-accent/30"
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
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition-all active:scale-press-in ${
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
      <PluginAvatar
        entry={plugin}
        size="sm"
        testId={`plugin-library-row-icon-${plugin.id}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
            {plugin.displayName}
          </h3>
          {sourceUpdateBadge ? (
            <CardStatusBadge
              label={sourceUpdateBadge.label}
              tone={sourceUpdateBadge.tone}
            />
          ) : null}
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            {getPluginTrustLabel(plugin.trustLevel, t)}
          </span>
        </div>
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
          {plugin.description ||
            plugin.author?.name ||
            t("plugin.noDescription", "No description provided")}
        </p>
        <div className="mt-2 flex min-h-5 flex-wrap items-center gap-1.5">
          {distributedTargets.length > 0 ? (
            distributedTargets
              .slice(0, 6)
              .map((target) => (
                <PlatformIcon
                  key={target.id}
                  platformId={getTargetPlatformIconId(target.id)}
                  size={16}
                  title={target.displayName}
                />
              ))
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {t("plugin.notDistributed", "Not distributed")}
            </span>
          )}
        </div>
      </div>
      {!batchMode ? (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite(plugin);
            }}
            aria-label={
              plugin.isFavorite
                ? t("plugin.removeFromFavorites", {
                    defaultValue: "Remove {{name}} from favorites",
                    name: plugin.displayName,
                  })
                : t("plugin.addToFavorites", {
                    defaultValue: "Add {{name}} to favorites",
                    name: plugin.displayName,
                  })
            }
            className={`rounded-lg p-2 text-muted-foreground transition-colors hover:bg-amber-500/10 hover:text-amber-500 ${
              plugin.isFavorite ? "text-amber-500" : ""
            }`}
            title={
              plugin.isFavorite
                ? t("plugin.removeFavorite", "Remove Favorite")
                : t("plugin.addFavorite", "Add Favorite")
            }
          >
            <StarIcon
              aria-hidden="true"
              className={`h-4 w-4 ${plugin.isFavorite ? "fill-current" : ""}`}
            />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenAgentTargets(plugin);
            }}
            aria-label={t("plugin.selectAgentTargetsForPlugin", {
              defaultValue: "Select Agent targets for {{name}}",
              name: plugin.displayName,
            })}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            title={t("plugin.selectAgentTargets", "Select Agent targets")}
          >
            <SendIcon aria-hidden="true" className="h-4 w-4" />
          </button>
          {hasLocalPackage ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenFolder(plugin);
              }}
              aria-label={t("plugin.openPluginFolder", "Open Plugin folder")}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title={t("plugin.openPluginFolder", "Open Plugin folder")}
            >
              <FolderOpenIcon aria-hidden="true" className="h-4 w-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(plugin);
            }}
            aria-label={t("plugin.deletePlugin", "Delete Plugin")}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            title={t("plugin.deletePlugin", "Delete Plugin")}
          >
            <TrashIcon aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </article>
  );
}

function MarketCard({
  batchMode = false,
  entry,
  isSelected = false,
  installed,
  preview,
  onOpenDetail,
  onToggleSelection,
}: {
  batchMode?: boolean;
  entry: PluginMarketEntry;
  isSelected?: boolean;
  installed: boolean;
  preview?: PluginMarketPreview;
  onOpenDetail: (entry: PluginMarketEntry) => void;
  onToggleSelection: (entry: PluginMarketEntry) => void;
}) {
  const { t } = useTranslation();
  const activeEntry = preview?.entry ?? entry;
  const cardDescription = activeEntry.description || preview?.longDescription;
  const cardLabel = cardDescription
    ? `${activeEntry.displayName}. ${cardDescription}`
    : activeEntry.displayName;

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
            onToggleSelection(activeEntry);
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
          name: activeEntry.displayName,
        })}
        title={cardLabel}
        onClick={() =>
          batchMode ? onToggleSelection(activeEntry) : onOpenDetail(activeEntry)
        }
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <PluginAvatar entry={activeEntry} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
            {activeEntry.displayName}
          </h3>
          {cardDescription ? (
            <p className="mt-0.5 line-clamp-2 min-h-8 text-xs leading-4 text-muted-foreground">
              {cardDescription}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {getMarketSourceLabel(
                activeEntry.marketplaceId,
                activeEntry.source.label || activeEntry.marketplaceId,
                t,
              )}
            </span>
            {activeEntry.category ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {getPluginCategoryLabel(activeEntry.category, t)}
              </span>
            ) : null}
            {shouldShowMarketTrustBadge(activeEntry) ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {getPluginTrustLabel(activeEntry.trustLevel, t)}
              </span>
            ) : null}
            {installed ? (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
                {t("plugin.installed", "Installed")}
              </span>
            ) : null}
          </div>
        </div>
      </button>
    </article>
  );
}

function PluginStoreCatalog({
  availableEntries,
  batchMode,
  installedEntries,
  marketPreviews,
  onOpenDetail,
  onToggleSelection,
  scrollRef,
  selectedEntryIds,
}: {
  availableEntries: PluginMarketEntry[];
  batchMode: boolean;
  installedEntries: PluginMarketEntry[];
  marketPreviews: Record<string, PluginMarketPreview>;
  onOpenDetail: (entry: PluginMarketEntry) => void;
  onToggleSelection: (entry: PluginMarketEntry) => void;
  scrollRef: RefObject<HTMLDivElement>;
  selectedEntryIds: Set<string>;
}) {
  const { t } = useTranslation();
  const catalogRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollMargin, setScrollMargin] = useState(0);
  const totalCount = installedEntries.length + availableEntries.length;
  const installedLabel = t("plugin.installedSection", "Installed");
  const availableLabel = t("plugin.availableSection", "Available");

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const update = () => {
      setContainerWidth(
        Math.max(0, node.clientWidth || window.innerWidth || 1024),
      );
      setScrollMargin(catalogRef.current?.offsetTop ?? 0);
    };
    update();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [scrollRef]);

  const columns = useMemo(
    () => getMarketGridColumns(containerWidth || 1024),
    [containerWidth],
  );
  const rows = useMemo(
    () =>
      buildPluginStoreCatalogRows({
        availableEntries,
        availableLabel,
        columns,
        installedEntries,
        installedLabel,
      }),
    [
      availableEntries,
      availableLabel,
      columns,
      installedEntries,
      installedLabel,
    ],
  );

  const renderSectionHeader = (
    label: string,
    count: number,
    tone: "installed" | "available",
  ) => (
    <div className="mb-4 flex items-center gap-2">
      <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
        {label}
      </h2>
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
          tone === "installed"
            ? "bg-emerald-500/10 text-emerald-500"
            : "bg-primary/10 text-primary"
        }`}
      >
        {count}
      </span>
    </div>
  );

  const renderCard = (entry: PluginMarketEntry, installed: boolean) => (
    <MarketCard
      key={entry.id}
      batchMode={batchMode}
      entry={entry}
      isSelected={selectedEntryIds.has(entry.id)}
      installed={installed}
      preview={marketPreviews[entry.id]}
      onOpenDetail={onOpenDetail}
      onToggleSelection={onToggleSelection}
    />
  );

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    scrollMargin,
    estimateSize: (index) =>
      rows[index]?.type === "section"
        ? MARKET_GRID_HEADER_HEIGHT_PX
        : MARKET_GRID_ROW_HEIGHT_PX + MARKET_GRID_GAP_PX,
    overscan: 5,
    getItemKey: (index) => rows[index]?.key ?? `plugin-store-row-${index}`,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();

  if (totalCount <= MARKET_CATALOG_VIRTUALIZE_THRESHOLD) {
    return (
      <div className="space-y-8">
        {installedEntries.length > 0 ? (
          <section>
            {renderSectionHeader(
              installedLabel,
              installedEntries.length,
              "installed",
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {installedEntries.map((entry) => renderCard(entry, true))}
            </div>
          </section>
        ) : null}

        {availableEntries.length > 0 ? (
          <section>
            {renderSectionHeader(
              availableLabel,
              availableEntries.length,
              "available",
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {availableEntries.map((entry) => renderCard(entry, false))}
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={catalogRef}
      className="relative w-full"
      data-testid="plugin-store-virtual-catalog"
      style={{ height: `${totalHeight + MARKET_GRID_BOTTOM_GUTTER_PX}px` }}
    >
      {virtualRows.map((virtualRow) => {
        const row = rows[virtualRow.index];
        if (!row) return null;

        return (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            data-testid="plugin-store-virtual-row"
            ref={rowVirtualizer.measureElement}
            className="absolute left-0 right-0"
            style={{
              top: 0,
              transform: `translateY(${virtualRow.start - scrollMargin}px)`,
            }}
          >
            {row.type === "section" ? (
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
                  {row.label}
                </h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    row.tone === "installed"
                      ? "bg-emerald-500/10 text-emerald-500"
                      : "bg-primary/10 text-primary"
                  }`}
                >
                  {row.count}
                </span>
              </div>
            ) : (
              <div
                className="grid"
                style={{
                  gap: `${MARKET_GRID_GAP_PX}px`,
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                }}
              >
                {row.entries.map((entry) => renderCard(entry, row.installed))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PluginDetailBadges({
  entry,
  sourceLabel,
}: {
  entry: PluginLibraryEntry | PluginMarketEntry;
  sourceLabel: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
        {sourceLabel}
      </span>
      {entry.category ? (
        <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
          {getPluginCategoryLabel(entry.category, t)}
        </span>
      ) : null}
      <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
        {getPluginTrustLabel(entry.trustLevel, t)}
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

  const activeEntry = preview?.entry ?? entry;
  const displayName = preview?.displayName ?? activeEntry.displayName;
  const summaryDescription = preview?.description ?? activeEntry.description;
  const overviewDescription = preview?.longDescription;
  const sourceLabel = getMarketSourceLabel(
    activeEntry.marketplaceId,
    activeEntry.source.label || activeEntry.marketplaceId,
    t,
  );
  const activeInventory = preview?.inventory ?? activeEntry.inventory;
  const codexLink = preview?.codexDetailUrl ?? activeEntry.codexDetailUrl;
  const installDisabled =
    installed || installing || preview?.canInstall === false;

  return (
    <Modal
      isOpen={Boolean(entry)}
      onClose={onClose}
      size="xl"
      showCloseButton
      title={displayName}
      subtitle={summaryDescription}
    >
      <div className="flex min-h-0 flex-col">
        <div className="space-y-4 px-6 py-5">
          <div className="flex items-start gap-4">
            <PluginAvatar entry={activeEntry} size="lg" />
            <div className="min-w-0 flex-1 space-y-3">
              <PluginDetailBadges
                entry={activeEntry}
                sourceLabel={sourceLabel}
              />
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

          {overviewDescription ? (
            <section className="rounded-2xl border border-border bg-background/60 p-4">
              <h3 className="text-sm font-medium text-foreground">
                {t("plugin.overviewTitle", "Overview")}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {overviewDescription}
              </p>
            </section>
          ) : null}

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
            {activeEntry.policy?.installation ? (
              <div className="rounded-xl border border-border bg-background/60 p-3">
                <dt className="text-xs font-medium text-muted-foreground">
                  {t("plugin.policyInstallation", "Install")}
                </dt>
                <dd className="mt-1 text-foreground">
                  {getPluginPolicyValueLabel(
                    "installation",
                    activeEntry.policy.installation,
                    t,
                  )}
                </dd>
              </div>
            ) : null}
            {activeEntry.policy?.authentication ? (
              <div className="rounded-xl border border-border bg-background/60 p-3">
                <dt className="text-xs font-medium text-muted-foreground">
                  {t("plugin.policyAuth", "Auth")}
                </dt>
                <dd className="mt-1 text-foreground">
                  {getPluginPolicyValueLabel(
                    "authentication",
                    activeEntry.policy.authentication,
                    t,
                  )}
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
            {activeEntry.source.packagePath ? (
              <div className="rounded-xl border border-border bg-background/60 p-3 md:col-span-2">
                <dt className="text-xs font-medium text-muted-foreground">
                  {t("plugin.packagePath", "Package path")}
                </dt>
                <dd className="mt-1 break-all font-mono text-xs text-foreground">
                  {activeEntry.source.packagePath}
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
                onClick={() => onCopyCodexLink(activeEntry)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <CopyIcon className="h-4 w-4" />
                {t("plugin.copyCodexLink", "Copy Codex link")}
              </button>
            ) : null}
            <button
              type="button"
              disabled={installDisabled}
              onClick={() => onInstall(activeEntry)}
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

function PluginSourcePreviewModal({
  importing,
  onBackToEdit,
  onClose,
  onImport,
  preview,
  request,
}: {
  importing: boolean;
  onBackToEdit: () => void;
  onClose: () => void;
  onImport: () => void;
  preview: PluginMarketPreview | null;
  request: PluginImportSourceRequest | null;
}) {
  const { t } = useTranslation();

  if (!preview || !request) {
    return null;
  }

  const sourceLabel =
    request.label?.trim() ||
    preview.entry.source.label ||
    request.url ||
    t("plugin.customSource", "Custom source");
  const installDisabled = importing || preview.canInstall === false;

  return (
    <Modal
      isOpen={Boolean(preview)}
      onClose={onClose}
      size="xl"
      showCloseButton
      closeOnBackdrop={!importing}
      closeOnEscape={!importing}
      title={t("plugin.confirmSourceImportTitle", "Confirm Plugin import")}
      subtitle={preview.displayName}
    >
      <div className="space-y-5">
        <div className="flex items-start gap-4">
          <PluginAvatar entry={preview.entry} size="lg" />
          <div className="min-w-0 flex-1 space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              {preview.displayName}
            </h3>
            {preview.description ? (
              <p className="text-sm leading-6 text-muted-foreground">
                {preview.description}
              </p>
            ) : null}
            <PluginDetailBadges
              entry={preview.entry}
              sourceLabel={sourceLabel}
            />
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
          </div>
        </div>

        {preview.longDescription ? (
          <section className="rounded-2xl border border-border bg-background/60 p-4">
            <h3 className="text-sm font-medium text-foreground">
              {t("plugin.overviewTitle", "Overview")}
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {preview.longDescription}
            </p>
          </section>
        ) : null}

        <section className="rounded-2xl border border-border bg-muted/20 p-4">
          <div className="mb-3 text-sm font-medium text-foreground">
            {t("plugin.inventoryTitle", "Inventory")}
          </div>
          <InventoryChips inventory={preview.inventory} />
        </section>

        {preview.unsupportedReason ? (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            {preview.unsupportedReason}
          </div>
        ) : null}

        <dl className="grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-xl border border-border bg-background/60 p-3 md:col-span-2">
            <dt className="text-xs font-medium text-muted-foreground">
              {t("plugin.sourceUrlLabel", "Plugin URL")}
            </dt>
            <dd className="mt-1 break-all font-mono text-xs text-foreground">
              {request.url}
            </dd>
          </div>
          {request.branch ? (
            <div className="rounded-xl border border-border bg-background/60 p-3">
              <dt className="text-xs font-medium text-muted-foreground">
                {t("plugin.sourceBranchLabel", "Branch")}
              </dt>
              <dd className="mt-1 break-all font-mono text-xs text-foreground">
                {request.branch}
              </dd>
            </div>
          ) : null}
          {request.packagePath ? (
            <div className="rounded-xl border border-border bg-background/60 p-3">
              <dt className="text-xs font-medium text-muted-foreground">
                {t("plugin.sourcePackagePathLabel", "Package path")}
              </dt>
              <dd className="mt-1 break-all font-mono text-xs text-foreground">
                {request.packagePath}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={onBackToEdit}
            disabled={importing}
            className="inline-flex h-10 items-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("plugin.editSource", "Edit source")}
          </button>
          <button
            type="button"
            onClick={onImport}
            disabled={installDisabled}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            {importing ? (
              <Loader2Icon
                aria-hidden="true"
                className="h-4 w-4 animate-spin"
              />
            ) : (
              <PackagePlusIcon aria-hidden="true" className="h-4 w-4" />
            )}
            {t("plugin.importPlugin", "Import Plugin")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

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

function AgentInstalledPluginDetailPage({
  isImported,
  isImporting,
  managedPlugin,
  onBack,
  onImport,
  onOpenFolder,
  onOpenManagedPlugin,
  plugin,
  target,
}: {
  isImported?: boolean;
  isImporting?: boolean;
  managedPlugin?: PluginLibraryEntry | null;
  onBack: () => void;
  onImport: () => void;
  onOpenFolder: () => void;
  onOpenManagedPlugin?: () => void;
  plugin: PluginTargetInstalledPlugin;
  target: PluginTargetCompatibility;
}) {
  const detailPlugin = buildAgentDetailPlugin({
    managedPlugin,
    plugin,
    target,
  });

  return (
    <PluginFullDetailPage
      agentActions={{
        isImporting,
        onImport: isImported ? undefined : onImport,
        onOpenFolder,
        onOpenManagedPlugin,
      }}
      agentContext={{
        isManaged: isImported,
        platformId: target.id,
        platformName: target.displayName,
        sourcePath: plugin.sourcePath ?? "",
      }}
      plugin={detailPlugin}
      targetMatrix={[]}
      onBack={onBack}
      onDelete={() => undefined}
      onDistribute={async () => undefined}
      onOpenStore={() => undefined}
    />
  );
}

function AgentPluginView({
  initialSelectedTargetId,
  targets,
  installedPlugins,
  isLoading,
  importingTargetPluginId,
  removingLibraryPluginId,
  onRefresh,
  onDistributeLibraryPlugin,
  onRemoveLibraryPlugin,
  onImportTargetPlugin,
  onOpenLibraryPlugin,
  onOpenStore,
}: {
  initialSelectedTargetId?: string | null;
  targets: PluginTargetCompatibility[];
  installedPlugins: PluginLibraryEntry[];
  isLoading: boolean;
  importingTargetPluginId?: string | null;
  removingLibraryPluginId?: string | null;
  onRefresh: () => void;
  onDistributeLibraryPlugin: (
    plugin: PluginLibraryEntry,
    target: PluginTargetCompatibility,
  ) => void;
  onRemoveLibraryPlugin: (
    plugin: PluginLibraryEntry,
    target: PluginTargetCompatibility,
  ) => void;
  onImportTargetPlugin: (
    target: PluginTargetCompatibility,
    plugin: PluginTargetInstalledPlugin,
  ) => void;
  onOpenLibraryPlugin: (plugin: PluginLibraryEntry) => void;
  onOpenStore: () => void;
}) {
  const { t } = useTranslation();
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [selectedTargetPlugin, setSelectedTargetPlugin] =
    useState<PluginTargetInstalledPlugin | null>(null);
  const [agentPluginFilter, setAgentPluginFilter] =
    useState<AgentPluginFilter>("all");
  const [pendingRemoveLibraryPlugin, setPendingRemoveLibraryPlugin] =
    useState<PluginLibraryEntry | null>(null);

  useEffect(() => {
    setSelectedTargetId((current) => {
      if (
        initialSelectedTargetId &&
        targets.some((target) => target.id === initialSelectedTargetId)
      ) {
        return initialSelectedTargetId;
      }
      if (current && targets.some((target) => target.id === current)) {
        return current;
      }
      return (
        targets.find((target) => target.enabled)?.id ?? targets[0]?.id ?? null
      );
    });
  }, [initialSelectedTargetId, targets]);

  const selectedTarget = useMemo(
    () =>
      targets.find((target) => target.id === selectedTargetId) ??
      targets.find((target) => target.enabled) ??
      targets[0] ??
      null,
    [selectedTargetId, targets],
  );
  const targetInstalledPlugins = selectedTarget?.installedPlugins ?? [];
  const targetDistributedPlugins = useMemo(() => {
    if (!selectedTarget) {
      return [];
    }
    return installedPlugins.filter((plugin) =>
      (plugin.distributedTargetIds ?? []).includes(selectedTarget.id),
    );
  }, [installedPlugins, selectedTarget]);
  const targetPendingPlugins = useMemo(() => {
    if (!selectedTarget) {
      return installedPlugins;
    }
    return installedPlugins.filter(
      (plugin) =>
        !(plugin.distributedTargetIds ?? []).includes(selectedTarget.id),
    );
  }, [installedPlugins, selectedTarget]);
  const importedTargetPluginKeys = useMemo(
    () =>
      new Set(
        installedPlugins
          .map((plugin) =>
            plugin.source.sourceId
              ? `${plugin.source.sourceId}:${plugin.name.toLowerCase()}`
              : "",
          )
          .filter(Boolean),
      ),
    [installedPlugins],
  );
  const totalPluginCount =
    installedPlugins.length + targetInstalledPlugins.length;
  const agentPluginFilterCounts: Record<AgentPluginFilter, number> = {
    all: totalPluginCount,
    "my-plugins": installedPlugins.length,
    "agent-installed": targetInstalledPlugins.length,
    distributed: targetDistributedPlugins.length,
    pending: targetPendingPlugins.length,
  };
  const visibleTargetInstalledPlugins =
    agentPluginFilter === "all" || agentPluginFilter === "agent-installed"
      ? targetInstalledPlugins
      : [];
  const visibleLibraryPlugins =
    agentPluginFilter === "all" || agentPluginFilter === "my-plugins"
      ? installedPlugins
      : agentPluginFilter === "distributed"
        ? targetDistributedPlugins
        : agentPluginFilter === "pending"
          ? targetPendingPlugins
          : [];
  const visibleFilteredPluginCount =
    visibleTargetInstalledPlugins.length + visibleLibraryPlugins.length;
  const selectedTargetPluginStillExists = Boolean(
    selectedTargetPlugin &&
    targetInstalledPlugins.some(
      (plugin) => plugin.id === selectedTargetPlugin.id,
    ),
  );

  useEffect(() => {
    if (selectedTargetPlugin && !selectedTargetPluginStillExists) {
      setSelectedTargetPlugin(null);
    }
  }, [selectedTargetPlugin, selectedTargetPluginStillExists]);

  useEffect(() => {
    if (
      pendingRemoveLibraryPlugin &&
      !installedPlugins.some(
        (plugin) => plugin.id === pendingRemoveLibraryPlugin.id,
      )
    ) {
      setPendingRemoveLibraryPlugin(null);
    }
  }, [installedPlugins, pendingRemoveLibraryPlugin]);

  if (
    selectedTarget &&
    selectedTargetPlugin &&
    selectedTargetPluginStillExists
  ) {
    const isImported = importedTargetPluginKeys.has(
      `${selectedTarget.id}:${selectedTargetPlugin.name.toLowerCase()}`,
    );
    const managedPlugin = installedPlugins.find(
      (plugin) =>
        plugin.name.toLowerCase() === selectedTargetPlugin.name.toLowerCase(),
    );
    return (
      <>
        <AgentInstalledPluginDetailPage
          isImported={isImported}
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
    ...getPluginDisplayTags(entry),
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

export function PluginManager() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [detailMarketEntry, setDetailMarketEntry] =
    useState<PluginMarketEntry | null>(null);
  const [detailLibraryPlugin, setDetailLibraryPlugin] =
    useState<PluginLibraryEntry | null>(null);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedMarketEntryIds, setSelectedMarketEntryIds] = useState<
    Set<string>
  >(new Set());
  const [selectedLibraryPluginIds, setSelectedLibraryPluginIds] = useState<
    Set<string>
  >(new Set());
  const [batchDeleteConfirmOpen, setBatchDeleteConfirmOpen] = useState(false);
  const [batchMarketRemoveConfirmOpen, setBatchMarketRemoveConfirmOpen] =
    useState(false);
  const [batchTagDialogOpen, setBatchTagDialogOpen] = useState(false);
  const [isBatchInstalling, setIsBatchInstalling] = useState(false);
  const [isBatchUpdating, setIsBatchUpdating] = useState(false);
  const [isBatchRemovingMarket, setIsBatchRemovingMarket] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PluginLibraryEntry | null>(
    null,
  );
  const [removeDistributedOnDelete, setRemoveDistributedOnDelete] =
    useState(false);
  const [removeDistributedOnBatchDelete, setRemoveDistributedOnBatchDelete] =
    useState(false);
  const [agentTargetPicker, setAgentTargetPicker] = useState<{
    plugins: PluginLibraryEntry[];
    targetIds: string[];
  } | null>(null);
  const [initialAgentPluginTargetId, setInitialAgentPluginTargetId] = useState<
    string | null
  >(null);
  const [importingTargetPluginId, setImportingTargetPluginId] = useState<
    string | null
  >(null);
  const [isImportingLocalPlugin, setIsImportingLocalPlugin] = useState(false);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const [isAddPluginModalOpen, setIsAddPluginModalOpen] = useState(false);
  const [isSourceImportOpen, setIsSourceImportOpen] = useState(false);
  const [isPreviewingSourcePlugin, setIsPreviewingSourcePlugin] =
    useState(false);
  const [isImportingSourcePlugin, setIsImportingSourcePlugin] = useState(false);
  const [sourceImportUrl, setSourceImportUrl] = useState("");
  const [sourceImportBranch, setSourceImportBranch] = useState("");
  const [sourceImportPackagePath, setSourceImportPackagePath] = useState("");
  const [sourceImportLabel, setSourceImportLabel] = useState("");
  const [sourceImportPreview, setSourceImportPreview] = useState<{
    preview: PluginMarketPreview;
    request: PluginImportSourceRequest;
  } | null>(null);
  const [childSkillImportPlugin, setChildSkillImportPlugin] =
    useState<PluginLibraryEntry | null>(null);
  const [childSkillScanResults, setChildSkillScanResults] = useState<
    ScannedSkill[]
  >([]);
  const [isScanningChildSkills, setIsScanningChildSkills] = useState(false);
  const [isImportingChildMcp, setIsImportingChildMcp] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [removingLibraryPluginId, setRemovingLibraryPluginId] = useState<
    string | null
  >(null);
  const [editingCustomSourceId, setEditingCustomSourceId] = useState<
    string | null
  >(null);
  const [pendingDeleteCustomSourceId, setPendingDeleteCustomSourceId] =
    useState<string | null>(null);
  const [sourceType, setSourceType] =
    useState<CustomStoreSourceType>("marketplace-json");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceBranch, setSourceBranch] = useState("");
  const [sourceDirectory, setSourceDirectory] = useState("");
  const marketPreviewPrefetchInFlightRef = useRef<Set<string>>(new Set());
  const {
    library,
    marketEntries,
    marketPreviews,
    marketSources,
    sourceUpdateChecks,
    customStoreSources,
    targetMatrix,
    selectedTab,
    selectedMarketSourceId,
    libraryViewMode,
    libraryGalleryColumns,
    filterTags: libraryTagFilters,
    searchQuery,
    isLoading,
    error,
    load,
    setSelectedTab,
    setSelectedMarketSourceId,
    setLibraryViewMode,
    setLibraryGalleryColumns,
    addCustomStoreSource,
    updateCustomStoreSource,
    removeCustomStoreSource,
    toggleCustomStoreSource,
    previewMarketPlugin,
    installMarketPlugin,
    importLocalPluginPackage,
    previewSourcePlugin,
    importSourcePlugin,
    importChildMcpServers,
    distributePlugin,
    removePluginDistribution,
    updatePluginFromSource,
    updatePluginMetadata,
    deletePlugin,
  } = usePluginStore();
  const skills = useSkillStore((state) => state.skills);
  const loadSkills = useSkillStore((state) => state.loadSkills);
  const scanLocalPreview = useSkillStore((state) => state.scanLocalPreview);
  const importScannedSkills = useSkillStore(
    (state) => state.importScannedSkills,
  );
  const selectSkill = useSkillStore((state) => state.selectSkill);
  const setSkillStoreView = useSkillStore((state) => state.setStoreView);
  const requestPluginChildSkillDeploy = useSkillStore(
    (state) => state.requestPluginChildSkillDeploy,
  );
  const loadMcp = useMcpStore((state) => state.load);
  const selectMcpServer = useMcpStore((state) => state.selectServer);
  const setMcpSelectedTab = useMcpStore((state) => state.setSelectedTab);
  const requestPluginChildMcpDeploy = useMcpStore(
    (state) => state.requestPluginChildMcpDeploy,
  );
  const setAppModule = useUIStore((state) => state.setAppModule);
  const storedPluginPageSize = useSettingsStore(
    (state) => state.skillListPageSize,
  );
  const setPluginPageSize = useSettingsStore(
    (state) => state.setSkillListPageSize,
  );
  const pageSize = SKILL_LIST_PAGE_SIZE_OPTIONS.includes(
    storedPluginPageSize as (typeof SKILL_LIST_PAGE_SIZE_OPTIONS)[number],
  )
    ? storedPluginPageSize
    : DEFAULT_SKILL_LIST_PAGE_SIZE;
  const [currentLibraryPage, setCurrentLibraryPage] = useState(1);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    plugin: PluginLibraryEntry;
  } | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (
      selectedMarketSourceId === "all" ||
      selectedMarketSourceId === "new-custom" ||
      marketSources.length === 0
    ) {
      return;
    }
    if (marketSources.some((source) => source.id === selectedMarketSourceId)) {
      return;
    }
    const fallback =
      marketSources.find((source) => source.id === "prompthub-official") ??
      marketSources[0];
    setSelectedMarketSourceId(fallback.id);
  }, [marketSources, selectedMarketSourceId, setSelectedMarketSourceId]);

  const selectedCustomSource = useMemo(
    () =>
      customStoreSources.find(
        (source) => source.id === selectedMarketSourceId,
      ) ?? null,
    [customStoreSources, selectedMarketSourceId],
  );
  const selectedMarketSource = useMemo(
    () =>
      marketSources.find((source) => source.id === selectedMarketSourceId) ??
      null,
    [marketSources, selectedMarketSourceId],
  );
  const pendingDeleteCustomSource = useMemo(
    () =>
      customStoreSources.find(
        (source) => source.id === pendingDeleteCustomSourceId,
      ) ?? null,
    [customStoreSources, pendingDeleteCustomSourceId],
  );
  const customSourceTypeOptions = useMemo(
    () => [
      {
        value: "marketplace-json" as const,
        icon: <DatabaseIcon className="h-4 w-4" />,
      },
      {
        value: "git-repo" as const,
        icon: <GlobeIcon className="h-4 w-4" />,
      },
    ],
    [],
  );

  const handleAddCustomSource = () => {
    if (!sourceName.trim() || !sourceUrl.trim()) {
      showToast(
        t("skill.storeSourceRequired", "Store name and URL are required"),
        "error",
      );
      return;
    }
    try {
      addCustomStoreSource(sourceName, sourceUrl, sourceType, {
        branch: sourceBranch,
        directory: sourceDirectory,
      });
      setSourceName("");
      setSourceUrl("");
      setSourceBranch("");
      setSourceDirectory("");
      void load();
    } catch (sourceError) {
      showToast(getErrorMessage(sourceError), "error");
    }
  };

  const handleUpdateCustomSource = (payload: {
    branch?: string;
    directory?: string;
    id: string;
    name: string;
    type: CustomStoreSourceType;
    url: string;
  }) => {
    try {
      updateCustomStoreSource(payload);
      setEditingCustomSourceId(null);
      void load();
    } catch (sourceError) {
      showToast(getErrorMessage(sourceError), "error");
    }
  };

  const handleConfirmDeleteCustomSource = () => {
    if (!pendingDeleteCustomSource) return;
    removeCustomStoreSource(pendingDeleteCustomSource.id);
    setPendingDeleteCustomSourceId(null);
    setEditingCustomSourceId(null);
  };

  const installedPlugins = useMemo(
    () => library?.plugins ?? [],
    [library?.plugins],
  );
  const installedSkillPaths = useMemo(
    () =>
      new Set(
        skills.flatMap((skill) =>
          [skill.local_repo_path, skill.source_url].filter(
            (value): value is string =>
              typeof value === "string" && value.length > 0,
          ),
        ),
      ),
    [skills],
  );
  const [libraryFilter, setLibraryFilter] =
    useState<PluginLibraryFilter>("all");
  const [librarySourceFilter, setLibrarySourceFilter] = useState("all");
  const libraryGalleryColumnOptions = useMemo<SelectOption[]>(
    () =>
      PLUGIN_LIBRARY_GALLERY_COLUMNS.map((columns) => ({
        value: columns,
        label:
          columns === "auto"
            ? t("plugin.galleryColumnsAuto", "Auto")
            : t("plugin.galleryColumnsCount", {
                count: Number(columns),
                defaultValue: "{{count}} columns",
              }),
      })),
    [t],
  );
  const libraryGalleryGridStyle = useMemo(
    () => getPluginLibraryGalleryGridStyle(libraryGalleryColumns ?? "auto"),
    [libraryGalleryColumns],
  );
  const selectedLibraryDetailPlugin = useMemo(() => {
    if (!detailLibraryPlugin) {
      return null;
    }
    return (
      installedPlugins.find((plugin) => plugin.id === detailLibraryPlugin.id) ??
      detailLibraryPlugin
    );
  }, [detailLibraryPlugin, installedPlugins]);
  const installedIds = useMemo(
    () => new Set(installedPlugins.map((plugin) => plugin.id)),
    [installedPlugins],
  );
  const installedPluginById = useMemo(
    () => new Map(installedPlugins.map((plugin) => [plugin.id, plugin])),
    [installedPlugins],
  );
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const baseVisiblePlugins = useMemo(
    () =>
      installedPlugins.filter(
        (plugin) =>
          matchesPluginSearch(plugin, normalizedSearchQuery) &&
          (libraryFilter === "all" ||
            (libraryFilter === "favorites"
              ? plugin.isFavorite === true
              : libraryFilter === "distributed"
                ? (plugin.distributedTargetIds?.length ?? 0) > 0
                : (plugin.distributedTargetIds?.length ?? 0) === 0)),
      ),
    [installedPlugins, libraryFilter, normalizedSearchQuery],
  );
  const libraryFilterCounts = useMemo(() => {
    const counts: Record<PluginLibraryFilter, number> = {
      all: installedPlugins.length,
      favorites: 0,
      distributed: 0,
      pending: 0,
    };

    for (const plugin of installedPlugins) {
      if (plugin.isFavorite === true) {
        counts.favorites += 1;
      }
      if ((plugin.distributedTargetIds?.length ?? 0) > 0) {
        counts.distributed += 1;
      } else {
        counts.pending += 1;
      }
    }

    return counts;
  }, [installedPlugins]);
  const libraryFilterOptions = useMemo(
    () =>
      [
        {
          icon: <PackageIcon className="h-3.5 w-3.5" />,
          value: "all",
          label: getPluginLibraryFilterLabel("all", t),
          count: libraryFilterCounts.all,
        },
        {
          icon: <StarIcon className="h-3.5 w-3.5" />,
          value: "favorites",
          label: getPluginLibraryFilterLabel("favorites", t),
          count: libraryFilterCounts.favorites,
        },
        {
          icon: <SendIcon className="h-3.5 w-3.5" />,
          value: "distributed",
          label: getPluginLibraryFilterLabel("distributed", t),
          count: libraryFilterCounts.distributed,
        },
        {
          icon: <Clock3Icon className="h-3.5 w-3.5" />,
          value: "pending",
          label: getPluginLibraryFilterLabel("pending", t),
          count: libraryFilterCounts.pending,
        },
      ] satisfies Array<{
        icon: ReactNode;
        value: PluginLibraryFilter;
        label: string;
        count: number;
      }>,
    [libraryFilterCounts, t],
  );
  const librarySourceEntries = useMemo(() => {
    const entries = new Map<string, { label: string; count: number }>();

    for (const plugin of baseVisiblePlugins) {
      const key = getPluginLibrarySourceKey(plugin);
      const current = entries.get(key);
      entries.set(key, {
        label: getPluginLibrarySourceLabel(plugin, t),
        count: (current?.count ?? 0) + 1,
      });
    }

    return Array.from(entries.entries())
      .map(([value, entry]) => ({ value, ...entry }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [baseVisiblePlugins, t]);
  const hasActiveLibrarySourceFilter = librarySourceFilter !== "all";
  const activeLibrarySourceFilter = librarySourceEntries.some(
    (entry) => entry.value === librarySourceFilter,
  )
    ? librarySourceFilter
    : "all";
  const librarySourceOptions = useMemo<SelectOption[]>(
    () => [
      {
        value: "all",
        label: (
          <span className="flex w-full items-center justify-between gap-2">
            <span>{t("plugin.allSources", "All sources")}</span>
            <span className="text-xs text-muted-foreground">
              {baseVisiblePlugins.length}
            </span>
          </span>
        ),
        labelText: t("plugin.allSources", "All sources"),
      },
      ...librarySourceEntries.map((entry) => ({
        value: entry.value,
        label: (
          <span className="flex w-full items-center justify-between gap-2">
            <span className="truncate">{entry.label}</span>
            <span className="text-xs text-muted-foreground">{entry.count}</span>
          </span>
        ),
        labelText: entry.label,
      })),
    ],
    [baseVisiblePlugins.length, librarySourceEntries, t],
  );
  const filteredLibraryPlugins = useMemo(() => {
    return baseVisiblePlugins.filter((plugin) => {
      const matchesSource =
        activeLibrarySourceFilter === "all" ||
        getPluginLibrarySourceKey(plugin) === activeLibrarySourceFilter;
      const matchesTag =
        libraryTagFilters.length === 0 ||
        libraryTagFilters.some((tag) =>
          getPluginDisplayTags(plugin).includes(tag),
        );
      return matchesSource && matchesTag;
    });
  }, [activeLibrarySourceFilter, baseVisiblePlugins, libraryTagFilters]);
  const libraryTotalPages = Math.max(
    1,
    Math.ceil(filteredLibraryPlugins.length / pageSize),
  );
  const visiblePlugins = useMemo(() => {
    const startIndex = (currentLibraryPage - 1) * pageSize;
    return filteredLibraryPlugins.slice(startIndex, startIndex + pageSize);
  }, [currentLibraryPage, filteredLibraryPlugins, pageSize]);
  const libraryVisiblePageNumbers = useMemo(() => {
    const pages: number[] = [];
    const start = Math.max(1, currentLibraryPage - 2);
    const end = Math.min(libraryTotalPages, start + 4);
    for (let page = start; page <= end; page += 1) {
      pages.push(page);
    }
    return pages;
  }, [currentLibraryPage, libraryTotalPages]);
  useEffect(() => {
    setCurrentLibraryPage(1);
  }, [
    activeLibrarySourceFilter,
    libraryTagFilters,
    libraryFilter,
    normalizedSearchQuery,
    pageSize,
  ]);

  useEffect(() => {
    setCurrentLibraryPage((page) => Math.min(page, libraryTotalPages));
  }, [libraryTotalPages]);
  const sourceFilteredMarketEntries = useMemo(
    () =>
      marketEntries.filter(
        (entry) =>
          selectedMarketSourceId === "all" ||
          entry.marketplaceId === selectedMarketSourceId,
      ),
    [marketEntries, selectedMarketSourceId],
  );
  const visibleMarketEntries = useMemo(
    () =>
      sourceFilteredMarketEntries.filter((entry) =>
        matchesPluginSearch(entry, normalizedSearchQuery),
      ),
    [normalizedSearchQuery, sourceFilteredMarketEntries],
  );
  const marketPreviewPrefetchEntries = useMemo(
    () =>
      visibleMarketEntries.filter(
        (entry) =>
          !marketPreviews[entry.id] && (!entry.description || !entry.iconUrl),
      ),
    [marketPreviews, visibleMarketEntries],
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
  const selectedInstalledMarketPlugins = useMemo(
    () =>
      selectedMarketEntries
        .map((entry) => installedPluginById.get(entry.id))
        .filter((plugin): plugin is PluginLibraryEntry => Boolean(plugin)),
    [installedPluginById, selectedMarketEntries],
  );
  const selectedLibraryPlugins = useMemo(
    () =>
      installedPlugins.filter((plugin) =>
        selectedLibraryPluginIds.has(getPluginEntryId(plugin)),
      ),
    [installedPlugins, selectedLibraryPluginIds],
  );
  const selectedLibraryPluginsAllFavorite =
    selectedLibraryPlugins.length > 0 &&
    selectedLibraryPlugins.every((plugin) => plugin.isFavorite === true);
  const selectedLibraryDistributedTargetCount = useMemo(
    () =>
      selectedLibraryPlugins.reduce(
        (sum, plugin) => sum + (plugin.distributedTargetIds?.length ?? 0),
        0,
      ),
    [selectedLibraryPlugins],
  );
  const deleteTargetDistributedTargetCount =
    deleteTarget?.distributedTargetIds?.length ?? 0;
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
  const currentMarketTitle =
    selectedMarketSourceId === "all"
      ? t("plugin.pluginStore", "Plugins Store")
      : selectedMarketSourceId === "new-custom"
        ? t("skill.addStoreSource", "Add Store")
        : selectedMarketSource
          ? getMarketSourceLabel(
              selectedMarketSource.id,
              selectedMarketSource.displayName,
              t,
            )
          : t("plugin.pluginStore", "Plugins Store");
  const currentMarketCount =
    selectedMarketSourceId === "all" || normalizedSearchQuery
      ? visibleMarketEntries.length
      : sourceFilteredMarketEntries.length;
  const currentViewTitle =
    selectedTab === "library"
      ? t("plugin.myPlugins", "My Plugins")
      : currentMarketTitle;
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
          count: filteredLibraryPlugins.length,
        })
      : t("plugin.loadedStoreEntries", {
          defaultValue: "Loaded {{count}}",
          count: currentMarketCount,
        });
  const shouldShowInitialLoading =
    isLoading &&
    !library &&
    !(selectedTab === "market" && visibleMarketEntries.length > 0);

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
      label: t("plugin.pluginStore", "Plugins Store"),
      count: marketEntries.length,
      icon: <StoreIcon className={tabIconClassName} />,
    },
    {
      id: "targets",
      label: t("plugin.pluginTargets", "Agent Plugin"),
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

  useEffect(() => {
    if (selectedTab !== "market" || marketPreviewPrefetchEntries.length === 0) {
      return;
    }

    const entriesToPreview = marketPreviewPrefetchEntries.filter((entry) => {
      if (marketPreviewPrefetchInFlightRef.current.has(entry.id)) {
        return false;
      }
      marketPreviewPrefetchInFlightRef.current.add(entry.id);
      return true;
    });
    if (entriesToPreview.length === 0) {
      return;
    }

    let cursor = 0;
    const runNextPreview = async (): Promise<void> => {
      const entry = entriesToPreview[cursor];
      cursor += 1;
      if (!entry) {
        return;
      }
      try {
        await previewMarketPlugin(entry.id);
      } catch (previewError) {
        console.warn("Plugin market preview prefetch failed:", previewError);
      } finally {
        marketPreviewPrefetchInFlightRef.current.delete(entry.id);
      }
      await runNextPreview();
    };

    void Promise.all(
      Array.from(
        {
          length: Math.min(
            MARKET_PREVIEW_PREFETCH_CONCURRENCY,
            entriesToPreview.length,
          ),
        },
        () => runNextPreview(),
      ),
    );
  }, [marketPreviewPrefetchEntries, previewMarketPlugin, selectedTab]);

  useEffect(() => {
    if (selectedTab !== "library" && detailLibraryPlugin) {
      setDetailLibraryPlugin(null);
    }
  }, [detailLibraryPlugin, selectedTab]);

  useEffect(() => {
    const openAddPluginModal = () => {
      setSelectedTab("library");
      setIsAddPluginModalOpen(true);
    };

    document.addEventListener(OPEN_ADD_PLUGIN_MODAL_EVENT, openAddPluginModal);
    return () => {
      document.removeEventListener(
        OPEN_ADD_PLUGIN_MODAL_EVENT,
        openAddPluginModal,
      );
    };
  }, [setSelectedTab]);

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

  const handleImportLocalPlugin = async () => {
    if (isImportingLocalPlugin) {
      return;
    }

    setIsImportingLocalPlugin(true);
    try {
      const sourcePath = await window.electron?.selectFolder?.();
      if (!sourcePath) {
        return;
      }
      const result = await importLocalPluginPackage({ sourcePath });
      setSelectedTab("library");
      showToast(
        t("plugin.importLocalPluginSuccess", {
          defaultValue: "Imported {{name}} to My Plugins",
          name: result.plugin.displayName,
        }),
        "success",
      );
    } catch (importError) {
      showToast(getErrorMessage(importError), "error");
    } finally {
      setIsImportingLocalPlugin(false);
    }
  };

  const handleDropImport = async (files: FileList | File[]) => {
    if (isImportingLocalPlugin) {
      return;
    }

    const sourcePaths = Array.from(files)
      .map((file) => window.electron?.getPathForFile?.(file) || "")
      .map(normalizeDroppedPluginPath)
      .filter((value) => value.length > 0);
    const uniqueSourcePaths = Array.from(new Set(sourcePaths));

    if (uniqueSourcePaths.length === 0) {
      showToast(
        t(
          "plugin.dropImportUnsupported",
          "Drop a local Plugin package folder from your filesystem.",
        ),
        "error",
      );
      return;
    }

    setIsImportingLocalPlugin(true);
    try {
      let importedCount = 0;
      let firstPluginName = "";

      for (const sourcePath of uniqueSourcePaths) {
        const result = await importLocalPluginPackage({ sourcePath });
        importedCount += 1;
        firstPluginName ||= result.plugin.displayName;
      }

      setSelectedTab("library");
      showToast(
        importedCount === 1
          ? t("plugin.importLocalPluginSuccess", {
              defaultValue: "Imported {{name}} to My Plugins",
              name: firstPluginName,
            })
          : t("plugin.dropImportSuccess", {
              count: importedCount,
              defaultValue:
                "Imported {{count}} Plugin package(s) to My Plugins",
            }),
        "success",
      );
    } catch (importError) {
      showToast(getErrorMessage(importError), "error");
    } finally {
      setIsImportingLocalPlugin(false);
    }
  };

  const resetSourceImportForm = () => {
    setSourceImportUrl("");
    setSourceImportBranch("");
    setSourceImportPackagePath("");
    setSourceImportLabel("");
  };

  const buildSourceImportRequest = (): PluginImportSourceRequest | null => {
    const url = sourceImportUrl.trim();
    if (!url) {
      showToast(
        t("plugin.importSourceUrlRequired", "Plugin URL is required"),
        "error",
      );
      return null;
    }
    return {
      url,
      branch: sourceImportBranch.trim() || undefined,
      packagePath: sourceImportPackagePath.trim() || undefined,
      label: sourceImportLabel.trim() || undefined,
    };
  };

  const handleCloseSourceImport = () => {
    if (isImportingSourcePlugin || isPreviewingSourcePlugin) {
      return;
    }
    setIsSourceImportOpen(false);
    resetSourceImportForm();
  };

  const handlePreviewSourcePlugin = async () => {
    const request = buildSourceImportRequest();
    if (!request) {
      return;
    }

    setIsPreviewingSourcePlugin(true);
    try {
      const preview = await previewSourcePlugin(request);
      setSourceImportPreview({ preview, request });
      setIsSourceImportOpen(false);
    } catch (previewError) {
      showToast(getErrorMessage(previewError), "error");
    } finally {
      setIsPreviewingSourcePlugin(false);
    }
  };

  const handleBackToSourceImportEdit = () => {
    if (isImportingSourcePlugin) {
      return;
    }
    setSourceImportPreview(null);
    setIsSourceImportOpen(true);
  };

  const handleCloseSourcePreview = () => {
    if (isImportingSourcePlugin) {
      return;
    }
    setSourceImportPreview(null);
    resetSourceImportForm();
  };

  const handleConfirmSourceImport = async () => {
    if (!sourceImportPreview) {
      return;
    }
    setIsImportingSourcePlugin(true);
    try {
      const result = await importSourcePlugin(sourceImportPreview.request);
      setSourceImportPreview(null);
      resetSourceImportForm();
      showToast(
        t("plugin.importSourcePluginSuccess", {
          defaultValue: "Imported {{name}} to My Plugins",
          name: result.plugin.displayName,
        }),
        "success",
      );
    } catch (importError) {
      showToast(getErrorMessage(importError), "error");
    } finally {
      setIsImportingSourcePlugin(false);
    }
  };

  const handleImportTargetPlugin = async (
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
    setImportingTargetPluginId(plugin.id);
    try {
      const result = await importLocalPluginPackage({
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
    } catch (importError) {
      showToast(getErrorMessage(importError), "error");
    } finally {
      setImportingTargetPluginId(null);
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

  const handleLibraryContextMenu = (
    event: MouseEvent,
    plugin: PluginLibraryEntry,
  ) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, plugin });
  };

  const openSinglePluginTagDialog = (plugin: PluginLibraryEntry) => {
    setSelectedLibraryPluginIds(new Set([plugin.id]));
    setBatchTagDialogOpen(true);
  };

  const goToLibraryPage = (page: number) => {
    setCurrentLibraryPage(Math.min(Math.max(page, 1), libraryTotalPages));
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

  const handleBatchUpdateMarketPlugins = async () => {
    if (selectedInstalledMarketPlugins.length === 0) {
      showToast(
        t("plugin.batchNoUpdateTargets", "No installed Plugins to update"),
        "info",
      );
      return;
    }

    setIsBatchUpdating(true);
    let succeeded = 0;
    let skipped =
      selectedMarketEntries.length - selectedInstalledMarketPlugins.length;
    let failed = 0;

    for (const plugin of selectedInstalledMarketPlugins) {
      try {
        const result = await updatePluginFromSource(plugin.id);
        if (result.status === "updated" || result.status === "up-to-date") {
          succeeded += 1;
        } else {
          skipped += 1;
        }
      } catch (updateError) {
        console.error("Plugin batch update failed:", updateError);
        failed += 1;
      }
    }

    setIsBatchUpdating(false);
    setSelectedMarketEntryIds(new Set());
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

  const handleBatchRemoveMarketPlugins = async () => {
    if (selectedInstalledMarketPlugins.length === 0) {
      setBatchMarketRemoveConfirmOpen(false);
      showToast(
        t("plugin.batchNoRemoveTargets", "No installed Plugins to remove"),
        "info",
      );
      return;
    }

    setIsBatchRemovingMarket(true);
    let failed = 0;
    for (const plugin of selectedInstalledMarketPlugins) {
      try {
        await deletePlugin(plugin.id);
      } catch (removeError) {
        console.error("Plugin store batch remove failed:", removeError);
        failed += 1;
      }
    }

    const succeeded = selectedInstalledMarketPlugins.length - failed;
    const skipped =
      selectedMarketEntries.length - selectedInstalledMarketPlugins.length;
    setIsBatchRemovingMarket(false);
    setBatchMarketRemoveConfirmOpen(false);
    setSelectedMarketEntryIds(new Set());
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

  const handleBatchDelete = async () => {
    if (selectedLibraryPlugins.length === 0) {
      setBatchDeleteConfirmOpen(false);
      return;
    }

    setIsDeleting(true);
    let failed = 0;
    for (const plugin of selectedLibraryPlugins) {
      try {
        await deletePlugin(
          plugin.id,
          removeDistributedOnBatchDelete
            ? { removeDistributedTargets: true }
            : undefined,
        );
      } catch (deleteError) {
        console.error("Plugin batch delete failed:", deleteError);
        failed += 1;
      }
    }
    setIsDeleting(false);
    setBatchDeleteConfirmOpen(false);
    setRemoveDistributedOnBatchDelete(false);
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
      await copyTextToClipboard(link);
      showToast(t("plugin.codexLinkCopied", "Copied Codex link"));
    } catch (copyError) {
      showToast(getErrorMessage(copyError), "error");
    }
  };

  const handleOpenLibraryAgentTargets = (plugin: PluginLibraryEntry) => {
    setAgentTargetPicker({ plugins: [plugin], targetIds: [] });
  };

  const handleOpenBatchLibraryAgentTargets = () => {
    if (selectedLibraryPlugins.length === 0) {
      return;
    }
    setAgentTargetPicker({
      plugins: selectedLibraryPlugins,
      targetIds: [],
    });
  };

  const handleOpenBatchTagDialog = () => {
    if (selectedLibraryPlugins.length === 0) {
      return;
    }
    setBatchTagDialogOpen(true);
  };

  const handleBatchFavorite = async () => {
    if (selectedLibraryPlugins.length === 0) {
      return;
    }

    const nextFavoriteState = !selectedLibraryPluginsAllFavorite;
    let updatedCount = 0;
    let failedCount = 0;

    for (const plugin of selectedLibraryPlugins) {
      if (plugin.isFavorite === nextFavoriteState) {
        continue;
      }
      try {
        const library = await updatePluginMetadata(plugin.id, {
          isFavorite: nextFavoriteState,
        });
        const updatedPlugin =
          library.plugins.find((entry) => entry.id === plugin.id) ?? null;
        if (updatedPlugin) {
          setDetailLibraryPlugin((current) =>
            current?.id === updatedPlugin.id ? updatedPlugin : current,
          );
        }
        updatedCount += 1;
      } catch (favoriteError) {
        failedCount += 1;
        console.error("Failed to update Plugin favorite:", favoriteError);
      }
    }

    setSelectedLibraryPluginIds(new Set());
    showToast(
      failedCount > 0
        ? t("plugin.batchFavoritePartialFailure", {
            defaultValue: "{{updated}} updated, {{failed}} failed",
            failed: failedCount,
            updated: updatedCount,
          })
        : t("plugin.batchFavoriteSuccess", {
            count: updatedCount,
            defaultValue: "Updated {{count}} Plugin(s)",
          }),
      failedCount > 0 ? "error" : "success",
    );
  };

  const handleBatchTagSubmit = async (
    tag: string,
    mode: PluginBatchTagMode,
  ) => {
    let updatedCount = 0;
    let failedCount = 0;

    for (const plugin of selectedLibraryPlugins) {
      const nextTags = updatePluginUserTags(plugin.userTags, tag, mode);
      if (
        JSON.stringify(nextTags) === JSON.stringify(getPluginUserTags(plugin))
      ) {
        continue;
      }
      try {
        const library = await updatePluginMetadata(plugin.id, {
          userTags: nextTags,
        });
        const updatedPlugin =
          library.plugins.find((entry) => entry.id === plugin.id) ?? null;
        if (updatedPlugin) {
          setDetailLibraryPlugin((current) =>
            current?.id === updatedPlugin.id ? updatedPlugin : current,
          );
        }
        updatedCount += 1;
      } catch (tagError) {
        failedCount += 1;
        console.error("Failed to update Plugin user tags:", tagError);
      }
    }

    setSelectedLibraryPluginIds(new Set());
    showToast(
      failedCount > 0
        ? t("plugin.batchTagPartialFailure", {
            defaultValue: "{{updated}} updated, {{failed}} failed",
            failed: failedCount,
            updated: updatedCount,
          })
        : t("plugin.batchTagSuccess", {
            count: updatedCount,
            defaultValue: "Updated {{count}} Plugin(s)",
          }),
      failedCount > 0 ? "error" : "success",
    );
  };

  const handleDistributePlugin = async (
    plugin: PluginLibraryEntry,
    targetIds: string[],
    mode: PluginDistributeMode,
  ) => {
    const result = await distributePlugin(plugin.id, targetIds, mode);
    const distributedPlugin = result.library.plugins.find(
      (entry) => entry.id === plugin.id,
    );
    if (distributedPlugin) {
      setDetailLibraryPlugin((current) =>
        current?.id === distributedPlugin.id ? distributedPlugin : current,
      );
      setAgentTargetPicker((current) =>
        current?.plugins.some((entry) => entry.id === distributedPlugin.id)
          ? {
              ...current,
              plugins: current.plugins.map((entry) =>
                entry.id === distributedPlugin.id ? distributedPlugin : entry,
              ),
            }
          : current,
      );
    }
  };

  const handleRemovePluginDistribution = async (
    plugin: PluginLibraryEntry,
    target: PluginTargetCompatibility,
  ) => {
    if (removingLibraryPluginId) {
      return;
    }

    setRemovingLibraryPluginId(plugin.id);
    try {
      const result = await removePluginDistribution(plugin.id, [target.id]);
      const updatedPlugin =
        result.library.plugins.find((entry) => entry.id === plugin.id) ?? null;
      if (updatedPlugin) {
        setDetailLibraryPlugin((current) =>
          current?.id === updatedPlugin.id ? updatedPlugin : current,
        );
        setAgentTargetPicker((current) =>
          current?.plugins.some((entry) => entry.id === updatedPlugin.id)
            ? {
                ...current,
                plugins: current.plugins.map((entry) =>
                  entry.id === updatedPlugin.id ? updatedPlugin : entry,
                ),
              }
            : current,
        );
      }
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
    } finally {
      setRemovingLibraryPluginId(null);
    }
  };

  const handleOpenLibraryFolder = (plugin: PluginLibraryEntry) => {
    const localPath = getPluginLocalPackagePath(plugin);
    if (!localPath) {
      return;
    }
    void window.electron?.openPath?.(localPath);
  };

  const handleToggleFavorite = async (plugin: PluginLibraryEntry) => {
    try {
      const library = await updatePluginMetadata(plugin.id, {
        isFavorite: plugin.isFavorite !== true,
      });
      const updatedPlugin =
        library.plugins.find((entry) => entry.id === plugin.id) ?? null;
      if (updatedPlugin) {
        setDetailLibraryPlugin((current) =>
          current?.id === updatedPlugin.id ? updatedPlugin : current,
        );
      }
    } catch (favoriteError) {
      showToast(getErrorMessage(favoriteError), "error");
    }
  };

  const handleImportChildSkills = async (plugin: PluginLibraryEntry) => {
    const localPackagePath = getPluginLocalPackagePath(plugin);
    if (!localPackagePath) {
      showToast(
        t(
          "plugin.importChildSkillsMissingPackage",
          "This Plugin has no local package folder to scan.",
        ),
        "error",
      );
      return;
    }

    setIsScanningChildSkills(true);
    try {
      const scannedSkills = await scanLocalPreview([localPackagePath]);
      setChildSkillScanResults(scannedSkills);
      if (scannedSkills.length === 0) {
        setChildSkillImportPlugin(null);
        showToast(
          t(
            "plugin.noChildSkillsFound",
            "No importable Skills were found in this Plugin.",
          ),
          "info",
        );
        return;
      }
      setChildSkillImportPlugin(plugin);
    } catch (scanError) {
      showToast(getErrorMessage(scanError), "error");
    } finally {
      setIsScanningChildSkills(false);
    }
  };

  const handleRescanChildSkills = async (customPaths: string[]) => {
    if (!childSkillImportPlugin) {
      return false;
    }
    const localPackagePath = getPluginLocalPackagePath(childSkillImportPlugin);
    if (!localPackagePath) {
      return false;
    }
    try {
      const scannedSkills = await scanLocalPreview([
        localPackagePath,
        ...customPaths,
      ]);
      setChildSkillScanResults(scannedSkills);
      showToast(
        t("skill.scanLocalComplete", {
          count: scannedSkills.length,
          defaultValue: "Found {{count}} skill(s)",
        }),
        "success",
      );
      return true;
    } catch (scanError) {
      showToast(getErrorMessage(scanError), "error");
      return false;
    }
  };

  const handleImportScannedChildSkills = async (
    scannedSkills: ScannedSkill[],
    userTagsByPath?: Record<string, string[]>,
  ) => {
    try {
      const result = await importScannedSkills(
        scannedSkills,
        userTagsByPath,
        "copy",
      );
      await loadSkills();
      const importedCount = result.importedCount;
      const importedSkillIds = result.importedSkills
        .map((skill) => skill.id)
        .filter((id): id is string => Boolean(id));
      const firstImportedSkillId = result.importedSkills[0]?.id;
      if (importedCount > 0) {
        requestPluginChildSkillDeploy(importedSkillIds);
        setSkillStoreView("my-skills");
        if (firstImportedSkillId) {
          selectSkill(firstImportedSkillId);
        }
        setAppModule("skill");
      }
      showToast(
        t("plugin.importChildSkillsSuccess", {
          count: importedCount,
          defaultValue: "Imported {{count}} Skill(s) to My Skills",
        }),
        result.failed.length > 0 ? "error" : "success",
      );
      return importedCount;
    } catch (importError) {
      showToast(getErrorMessage(importError), "error");
      throw importError;
    }
  };

  const handleImportChildMcp = async (plugin: PluginLibraryEntry) => {
    setIsImportingChildMcp(true);
    try {
      const result = await importChildMcpServers(plugin.id);
      if (result.imported.length > 0) {
        await loadMcp();
        requestPluginChildMcpDeploy(
          result.imported
            .map((server) => server.id)
            .filter((id): id is string => Boolean(id)),
        );
        setMcpSelectedTab("library");
        selectMcpServer(result.imported[0]?.id ?? null);
        setAppModule("mcp");
      }

      if (result.imported.length > 0) {
        showToast(
          t("plugin.importChildMcpSuccess", {
            count: result.imported.length,
            defaultValue: "Imported {{count}} MCP server(s) to My MCP",
          }),
          result.failedFiles.length > 0 ? "error" : "success",
        );
        return;
      }

      if (result.scannedFiles.length === 0) {
        showToast(
          t(
            "plugin.noChildMcpFound",
            "No importable MCP configs were found in this Plugin.",
          ),
          "info",
        );
        return;
      }

      if (result.skipped.length > 0 && result.failedFiles.length === 0) {
        showToast(
          t(
            "plugin.importChildMcpSkipped",
            "Detected MCP servers already exist in My MCP.",
          ),
          "info",
        );
        return;
      }

      showToast(
        t(
          "plugin.importChildMcpFailed",
          "No MCP servers were imported from detected Plugin configs.",
        ),
        "error",
      );
    } catch (importError) {
      showToast(getErrorMessage(importError), "error");
    } finally {
      setIsImportingChildMcp(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    setIsDeleting(true);
    try {
      await deletePlugin(
        deleteTarget.id,
        removeDistributedOnDelete
          ? { removeDistributedTargets: true }
          : undefined,
      );
      showToast(
        t("plugin.deleteSuccess", {
          defaultValue: "Deleted {{name}}",
          name: deleteTarget.displayName,
        }),
      );
      setDetailLibraryPlugin(null);
      setDeleteTarget(null);
      setRemoveDistributedOnDelete(false);
    } catch (deleteError) {
      showToast(getErrorMessage(deleteError), "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const childSkillImportModal = childSkillImportPlugin ? (
    <Suspense fallback={null}>
      <SkillScanPreview
        scannedSkills={childSkillScanResults}
        installedPaths={installedSkillPaths}
        onImport={handleImportScannedChildSkills}
        onRescan={handleRescanChildSkills}
        onClose={() => {
          setChildSkillImportPlugin(null);
          setChildSkillScanResults([]);
        }}
      />
    </Suspense>
  ) : null;
  const contextMenuItems: ContextMenuItem[] = contextMenu
    ? [
        {
          label: t("plugin.viewDetail", "View Details"),
          icon: <EyeIcon className="h-4 w-4" />,
          onClick: () => setDetailLibraryPlugin(contextMenu.plugin),
        },
        {
          label:
            contextMenu.plugin.isFavorite === true
              ? t("plugin.removeFavorite", "Remove Favorite")
              : t("plugin.addFavorite", "Add Favorite"),
          icon: (
            <StarIcon
              className={`h-4 w-4 ${
                contextMenu.plugin.isFavorite === true
                  ? "fill-amber-400 text-amber-400"
                  : ""
              }`}
            />
          ),
          onClick: () => void handleToggleFavorite(contextMenu.plugin),
        },
        {
          label: t("plugin.batchTags", "Batch Tags"),
          icon: <TagsIcon className="h-4 w-4" />,
          onClick: () => openSinglePluginTagDialog(contextMenu.plugin),
        },
        {
          label: t("plugin.selectAgentTargets", "Select Agent targets"),
          icon: <SendIcon className="h-4 w-4" />,
          onClick: () => handleOpenLibraryAgentTargets(contextMenu.plugin),
        },
        {
          label: t("plugin.openPluginFolder", "Open Plugin folder"),
          icon: <FolderOpenIcon className="h-4 w-4" />,
          disabled: !getPluginLocalPackagePath(contextMenu.plugin),
          onClick: () => handleOpenLibraryFolder(contextMenu.plugin),
        },
        {
          label: t("common.delete", "Delete"),
          icon: <TrashIcon className="h-4 w-4" />,
          variant: "destructive",
          onClick: () => setDeleteTarget(contextMenu.plugin),
        },
      ]
    : [];

  if (selectedTab === "library" && selectedLibraryDetailPlugin) {
    return (
      <>
        <SkillRenderBoundary
          resetKey={selectedLibraryDetailPlugin.id}
          title={t(
            "plugin.detailRenderError",
            "This plugin cannot be opened right now",
          )}
          description={t(
            "plugin.detailRenderErrorHint",
            "This render error was contained so the page stays usable. You can go back to the list or retry loading the detail view now.",
          )}
          primaryActionLabel={t("common.back", "Back")}
          onPrimaryAction={() => setDetailLibraryPlugin(null)}
          secondaryActionLabel={t("common.retry", "Retry")}
          onSecondaryAction={() => {
            void load({ force: true });
          }}
        >
          <PluginFullDetailPage
            isImportingChildMcp={isImportingChildMcp}
            isImportingChildSkills={isScanningChildSkills}
            plugin={selectedLibraryDetailPlugin}
            targetMatrix={targetMatrix}
            onBack={() => setDetailLibraryPlugin(null)}
            onDelete={(plugin) => setDeleteTarget(plugin)}
            onDistribute={(targetIds, mode) =>
              handleDistributePlugin(
                selectedLibraryDetailPlugin,
                targetIds,
                mode,
              )
            }
            onRemoveDistribution={(target) =>
              handleRemovePluginDistribution(
                selectedLibraryDetailPlugin,
                target,
              )
            }
            onToggleFavorite={(plugin) => void handleToggleFavorite(plugin)}
            onImportChildMcp={(plugin) => void handleImportChildMcp(plugin)}
            onImportChildSkills={(plugin) =>
              void handleImportChildSkills(plugin)
            }
            onOpenStore={() => {
              setDetailLibraryPlugin(null);
              setSelectedTab("market");
            }}
          />
        </SkillRenderBoundary>
        <ConfirmDialog
          isOpen={Boolean(deleteTarget)}
          onClose={() => {
            if (!isDeleting) {
              setDeleteTarget(null);
              setRemoveDistributedOnDelete(false);
            }
          }}
          onConfirm={handleDelete}
          title={t("plugin.deleteConfirmTitle", "Delete plugin")}
          message={
            <div className="space-y-3 text-left">
              <p className="text-center">
                {t("plugin.deleteConfirmMessage", {
                  defaultValue: "Delete {{name}} from My Plugins?",
                  name: deleteTarget?.displayName ?? "",
                })}
              </p>
              {deleteTargetDistributedTargetCount > 0 ? (
                <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-left">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-border text-primary"
                    checked={removeDistributedOnDelete}
                    onChange={(event) =>
                      setRemoveDistributedOnDelete(event.currentTarget.checked)
                    }
                  />
                  <span>
                    <span className="block text-sm font-medium text-foreground">
                      {t("plugin.deleteDistributedTargetsLabel", {
                        defaultValue:
                          "Also remove distributed Agent Plugin packages ({{count}})",
                        count: deleteTargetDistributedTargetCount,
                      })}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t("plugin.deleteDistributedTargetsHelp", {
                        defaultValue:
                          "Only Agent Plugin package copies/symlinks are removed. Imported child assets stay untouched.",
                      })}
                    </span>
                  </span>
                </label>
              ) : null}
            </div>
          }
          confirmText={t("common.delete", "Delete")}
          cancelText={t("common.cancel", "Cancel")}
          variant="destructive"
          isLoading={isDeleting}
        />
        <PluginAgentTargetPicker
          isOpen={Boolean(agentTargetPicker)}
          onClose={() => setAgentTargetPicker(null)}
          onDistribute={handleDistributePlugin}
          plugin={agentTargetPicker?.plugins[0] ?? null}
          plugins={agentTargetPicker?.plugins ?? []}
          targetMatrix={targetMatrix}
          initialTargetIds={agentTargetPicker?.targetIds ?? []}
        />
        {childSkillImportModal}
      </>
    );
  }

  if (selectedTab === "targets") {
    return (
      <>
        <AgentPluginView
          initialSelectedTargetId={initialAgentPluginTargetId}
          targets={targetMatrix}
          installedPlugins={installedPlugins}
          isLoading={isLoading}
          importingTargetPluginId={importingTargetPluginId}
          removingLibraryPluginId={removingLibraryPluginId}
          onRefresh={() => void load({ force: true })}
          onDistributeLibraryPlugin={(plugin, target) =>
            setAgentTargetPicker({ plugins: [plugin], targetIds: [target.id] })
          }
          onRemoveLibraryPlugin={(plugin, target) =>
            void handleRemovePluginDistribution(plugin, target)
          }
          onImportTargetPlugin={(target, plugin) =>
            void handleImportTargetPlugin(target, plugin)
          }
          onOpenLibraryPlugin={(plugin) => {
            setDetailLibraryPlugin(plugin);
            setSelectedTab("library");
          }}
          onOpenStore={() => {
            setInitialAgentPluginTargetId(null);
            setSelectedTab("market");
          }}
        />
        <PluginAgentTargetPicker
          isOpen={Boolean(agentTargetPicker)}
          onClose={() => setAgentTargetPicker(null)}
          onDistribute={handleDistributePlugin}
          plugin={agentTargetPicker?.plugins[0] ?? null}
          plugins={agentTargetPicker?.plugins ?? []}
          targetMatrix={targetMatrix}
          initialTargetIds={agentTargetPicker?.targetIds ?? []}
        />
        {childSkillImportModal}
      </>
    );
  }

  return (
    <div
      data-testid="plugin-manager-shell"
      className="relative flex h-full min-h-0 flex-col overflow-hidden app-wallpaper-section"
      onDragEnter={(event) => {
        if (selectedTab !== "library" || !hasFileItems(event.dataTransfer)) {
          return;
        }

        event.preventDefault();
        setIsDropTargetActive(true);
      }}
      onDragOver={(event) => {
        if (selectedTab !== "library" || !hasFileItems(event.dataTransfer)) {
          return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        if (!isDropTargetActive) {
          setIsDropTargetActive(true);
        }
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return;
        }

        setIsDropTargetActive(false);
      }}
      onDrop={(event) => {
        if (selectedTab !== "library" || !hasFileItems(event.dataTransfer)) {
          return;
        }

        event.preventDefault();
        setIsDropTargetActive(false);
        void handleDropImport(event.dataTransfer.files);
      }}
    >
      <header className="shrink-0 border-b border-border app-wallpaper-panel-strong px-4 py-4 z-10 sm:px-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  {selectedTab === "library" ? (
                    <PackageIcon className="h-5 w-5 text-primary" />
                  ) : (
                    <StoreIcon className="h-5 w-5 text-primary" />
                  )}
                  <h1 className="text-lg font-semibold text-foreground">
                    {currentViewTitle}
                  </h1>
                </div>
                <span className="inline-flex items-center rounded-full border border-white/5 bg-accent/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  {currentViewCountLabel}
                </span>
                {selectedTab === "library" &&
                filteredLibraryPlugins.length > 0 &&
                libraryTotalPages > 1 ? (
                  <span className="text-[11px] text-muted-foreground">
                    {t("plugin.paginationSummary", {
                      start: (currentLibraryPage - 1) * pageSize + 1,
                      end: Math.min(
                        currentLibraryPage * pageSize,
                        filteredLibraryPlugins.length,
                      ),
                      total: filteredLibraryPlugins.length,
                      defaultValue: `${(currentLibraryPage - 1) * pageSize + 1}-${Math.min(
                        currentLibraryPage * pageSize,
                        filteredLibraryPlugins.length,
                      )} / ${filteredLibraryPlugins.length}`,
                    })}
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {currentViewHint}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2 self-start lg:self-center lg:justify-end">
              {selectedTab === "market" ? (
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
              ) : null}
              {selectedTab === "library" ? (
                <>
                  <div className="flex items-center rounded-lg bg-muted p-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        setLibraryViewMode("gallery" as PluginLibraryViewMode)
                      }
                      aria-label={t("plugin.galleryView", "Gallery View")}
                      className={`rounded-md p-2 transition-colors ${
                        libraryViewMode === "gallery"
                          ? "app-wallpaper-surface text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      title={t("plugin.galleryView", "Gallery View")}
                    >
                      <LayoutGridIcon aria-hidden="true" className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setLibraryViewMode("list" as PluginLibraryViewMode)
                      }
                      aria-label={t("plugin.listView", "List View")}
                      className={`rounded-md p-2 transition-colors ${
                        libraryViewMode === "list"
                          ? "app-wallpaper-surface text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      title={t("plugin.listView", "List View")}
                    >
                      <ListIcon aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>
                  {libraryViewMode === "gallery" ? (
                    <Select
                      ariaLabel={t(
                        "plugin.galleryColumnsLabel",
                        "Plugin card columns",
                      )}
                      value={libraryGalleryColumns ?? "auto"}
                      onChange={(value) =>
                        setLibraryGalleryColumns(
                          value as PluginLibraryGalleryColumnMode,
                        )
                      }
                      options={libraryGalleryColumnOptions}
                      className="w-[118px]"
                      triggerClassName="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border app-wallpaper-surface px-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  ) : null}
                </>
              ) : null}
              <button
                type="button"
                onClick={() => void load({ force: true })}
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

          {selectedTab === "library" ? (
            <div
              data-testid="plugin-library-filter-bar"
              className="flex flex-wrap items-center gap-2"
            >
              {libraryFilterOptions.map((option) => {
                const isActive = libraryFilter === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setLibraryFilter(option.value)}
                    aria-label={option.label}
                    aria-pressed={isActive}
                    className={`inline-flex h-9 min-w-[8rem] items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors ${
                      isActive
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border app-wallpaper-surface text-muted-foreground hover:border-primary/25 hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    {option.icon}
                    <span>{option.label}</span>
                    <span
                      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] ${
                        isActive
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {option.count}
                    </span>
                  </button>
                );
              })}
              <Select
                ariaLabel={t("plugin.sourceFilterLabel", "Plugin source")}
                value={activeLibrarySourceFilter}
                onChange={(value) => setLibrarySourceFilter(value)}
                options={librarySourceOptions}
                className="min-w-[13rem] flex-1 sm:flex-none"
                triggerClassName={`h-9 w-full rounded-xl border px-3 text-sm font-medium shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 flex items-center justify-between gap-2 ${
                  hasActiveLibrarySourceFilter
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border app-wallpaper-surface text-muted-foreground hover:border-primary/25 hover:bg-accent hover:text-foreground"
                }`}
              />
            </div>
          ) : null}
        </div>
      </header>

      <main
        ref={contentScrollRef}
        className="min-h-0 flex-1 overflow-y-auto p-6"
      >
        {error ? (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        ) : null}

        {shouldShowInitialLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : selectedTab === "library" ? (
          <div className="space-y-4">
            {visiblePlugins.length > 0 ? (
              libraryViewMode === "list" ? (
                <div
                  data-testid="plugin-library-list"
                  className="flex flex-col gap-3"
                >
                  {visiblePlugins.map((plugin) => (
                    <PluginListRow
                      key={plugin.id}
                      batchMode={isBatchMode}
                      isSelected={selectedLibraryPluginIds.has(plugin.id)}
                      plugin={plugin}
                      sourceUpdateStatus={sourceUpdateChecks[plugin.id]?.status}
                      targetMatrix={targetMatrix}
                      onDelete={setDeleteTarget}
                      onContextMenu={handleLibraryContextMenu}
                      onOpenAgentTargets={handleOpenLibraryAgentTargets}
                      onOpenDetail={setDetailLibraryPlugin}
                      onOpenFolder={handleOpenLibraryFolder}
                      onToggleFavorite={(plugin) =>
                        void handleToggleFavorite(plugin)
                      }
                      onToggleSelection={handleToggleLibrarySelection}
                    />
                  ))}
                </div>
              ) : (
                <div
                  data-testid="plugin-library-grid"
                  className="grid gap-6"
                  style={libraryGalleryGridStyle}
                >
                  {visiblePlugins.map((plugin) => (
                    <PluginCard
                      key={plugin.id}
                      batchMode={isBatchMode}
                      isSelected={selectedLibraryPluginIds.has(plugin.id)}
                      plugin={plugin}
                      sourceUpdateStatus={sourceUpdateChecks[plugin.id]?.status}
                      targetMatrix={targetMatrix}
                      onDelete={setDeleteTarget}
                      onContextMenu={handleLibraryContextMenu}
                      onOpenAgentTargets={handleOpenLibraryAgentTargets}
                      onOpenDetail={setDetailLibraryPlugin}
                      onOpenFolder={handleOpenLibraryFolder}
                      onToggleFavorite={(plugin) =>
                        void handleToggleFavorite(plugin)
                      }
                      onToggleSelection={handleToggleLibrarySelection}
                    />
                  ))}
                </div>
              )
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
            )}
          </div>
        ) : selectedTab === "market" &&
          selectedMarketSourceId === "new-custom" ? (
          <SkillStoreSourceForm
            branch={sourceBranch}
            directory={sourceDirectory}
            handleAddSource={handleAddCustomSource}
            setBranch={setSourceBranch}
            setDirectory={setSourceDirectory}
            setSourceName={setSourceName}
            setSourceType={setSourceType}
            setSourceUrl={setSourceUrl}
            sourceName={sourceName}
            sourceType={sourceType}
            sourceUrl={sourceUrl}
            t={t}
            typeOptions={customSourceTypeOptions}
          />
        ) : selectedTab === "market" ? (
          <div className="space-y-8">
            {selectedCustomSource ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    setEditingCustomSourceId(selectedCustomSource.id)
                  }
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-accent/50 px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                >
                  <Settings2Icon aria-hidden="true" className="h-4 w-4" />
                  {t("common.edit", "Edit")}
                </button>
              </div>
            ) : null}
            {visibleMarketEntries.length > 0 ? (
              <PluginStoreCatalog
                availableEntries={availableMarketEntries}
                batchMode={isBatchMode}
                installedEntries={installedMarketEntries}
                marketPreviews={marketPreviews}
                onOpenDetail={handleOpenMarketDetail}
                onToggleSelection={handleToggleMarketSelection}
                scrollRef={contentScrollRef}
                selectedEntryIds={selectedMarketEntryIds}
              />
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

      {selectedTab === "library" && filteredLibraryPlugins.length > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border app-wallpaper-panel-strong px-4 py-3">
          <div className="text-sm text-muted-foreground">
            {t("plugin.paginationSummary", {
              start: (currentLibraryPage - 1) * pageSize + 1,
              end: Math.min(
                currentLibraryPage * pageSize,
                filteredLibraryPlugins.length,
              ),
              total: filteredLibraryPlugins.length,
              defaultValue: `${(currentLibraryPage - 1) * pageSize + 1}-${Math.min(
                currentLibraryPage * pageSize,
                filteredLibraryPlugins.length,
              )} / ${filteredLibraryPlugins.length}`,
            })}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                {t("prompt.pageSize", "Per page")}
              </span>
              <select
                value={pageSize}
                onChange={(event) => {
                  setPluginPageSize(Number(event.target.value));
                  setCurrentLibraryPage(1);
                }}
                className="rounded-md border border-border bg-muted px-2 py-1 text-sm text-foreground"
              >
                {SKILL_LIST_PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => goToLibraryPage(currentLibraryPage - 1)}
                disabled={currentLibraryPage === 1}
                aria-label={t("common.previous", "Previous")}
                className="rounded-md p-1.5 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                title={t("common.previous", "Previous")}
              >
                <ChevronLeftIcon aria-hidden="true" className="h-4 w-4" />
              </button>
              {libraryVisiblePageNumbers.map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => goToLibraryPage(page)}
                  aria-current={
                    currentLibraryPage === page ? "page" : undefined
                  }
                  className={`h-8 w-8 rounded-md text-sm transition-colors ${
                    currentLibraryPage === page
                      ? "bg-primary text-white"
                      : "hover:bg-accent"
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                onClick={() => goToLibraryPage(currentLibraryPage + 1)}
                disabled={currentLibraryPage === libraryTotalPages}
                aria-label={t("common.next", "Next")}
                className="rounded-md p-1.5 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                title={t("common.next", "Next")}
              >
                <ChevronRightIcon aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
                <>
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
                  <button
                    type="button"
                    onClick={() => void handleBatchUpdateMarketPlugins()}
                    disabled={
                      isBatchUpdating ||
                      selectedInstalledMarketPlugins.length === 0
                    }
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                    aria-label={t(
                      "plugin.batchUpdateSelected",
                      "Update selected",
                    )}
                    title={t("plugin.batchUpdateSelected", "Update selected")}
                  >
                    {isBatchUpdating ? (
                      <Loader2Icon
                        aria-hidden="true"
                        className="h-4 w-4 animate-spin"
                      />
                    ) : (
                      <RefreshCwIcon aria-hidden="true" className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchMarketRemoveConfirmOpen(true)}
                    disabled={
                      isBatchRemovingMarket ||
                      selectedInstalledMarketPlugins.length === 0
                    }
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                    aria-label={t(
                      "plugin.batchRemoveSelected",
                      "Remove selected",
                    )}
                    title={t("plugin.batchRemoveSelected", "Remove selected")}
                  >
                    {isBatchRemovingMarket ? (
                      <Loader2Icon
                        aria-hidden="true"
                        className="h-4 w-4 animate-spin"
                      />
                    ) : (
                      <TrashIcon aria-hidden="true" className="h-4 w-4" />
                    )}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void handleBatchFavorite()}
                    disabled={selectedLibraryPlugins.length === 0}
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                    aria-label={
                      selectedLibraryPluginsAllFavorite
                        ? t("plugin.removeFavorite", "Remove Favorite")
                        : t("plugin.addFavorite", "Add Favorite")
                    }
                    title={
                      selectedLibraryPluginsAllFavorite
                        ? t("plugin.removeFavorite", "Remove Favorite")
                        : t("plugin.addFavorite", "Add Favorite")
                    }
                  >
                    <StarIcon aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenBatchTagDialog}
                    disabled={selectedLibraryPlugins.length === 0}
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                    aria-label={t("plugin.batchTags", "Batch Tags")}
                    title={t("plugin.batchTags", "Batch Tags")}
                  >
                    <TagsIcon aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenBatchLibraryAgentTargets}
                    disabled={selectedLibraryPlugins.length === 0}
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                    aria-label={t(
                      "plugin.batchDistributeSelected",
                      "Distribute selected",
                    )}
                    title={t(
                      "plugin.batchDistributeSelected",
                      "Distribute selected",
                    )}
                  >
                    <SendIcon aria-hidden="true" className="h-4 w-4" />
                  </button>
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
                </>
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
            setRemoveDistributedOnDelete(false);
          }
        }}
        onConfirm={handleDelete}
        title={t("plugin.deleteConfirmTitle", "Delete plugin")}
        message={
          <div className="space-y-3 text-left">
            <p className="text-center">
              {t("plugin.deleteConfirmMessage", {
                defaultValue: "Delete {{name}} from My Plugins?",
                name: deleteTarget?.displayName ?? "",
              })}
            </p>
            {deleteTargetDistributedTargetCount > 0 ? (
              <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-left">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-border text-primary"
                  checked={removeDistributedOnDelete}
                  onChange={(event) =>
                    setRemoveDistributedOnDelete(event.currentTarget.checked)
                  }
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">
                    {t("plugin.deleteDistributedTargetsLabel", {
                      defaultValue:
                        "Also remove distributed Agent Plugin packages ({{count}})",
                      count: deleteTargetDistributedTargetCount,
                    })}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {t("plugin.deleteDistributedTargetsHelp", {
                      defaultValue:
                        "Only Agent Plugin package copies/symlinks are removed. Imported child assets stay untouched.",
                    })}
                  </span>
                </span>
              </label>
            ) : null}
          </div>
        }
        confirmText={t("common.delete", "Delete")}
        cancelText={t("common.cancel", "Cancel")}
        variant="destructive"
        isLoading={isDeleting}
      />
      <ConfirmDialog
        isOpen={batchMarketRemoveConfirmOpen}
        onClose={() => {
          if (!isBatchRemovingMarket) {
            setBatchMarketRemoveConfirmOpen(false);
          }
        }}
        onConfirm={() => void handleBatchRemoveMarketPlugins()}
        title={t(
          "plugin.batchStoreRemoveTitle",
          "Remove selected store Plugins",
        )}
        message={t("plugin.batchStoreRemoveMessage", {
          defaultValue:
            "Remove {{count}} selected installed Plugins from My Plugins?",
          count: selectedInstalledMarketPlugins.length,
        })}
        confirmText={t("plugin.batchRemoveSelected", "Remove selected")}
        cancelText={t("common.cancel", "Cancel")}
        variant="destructive"
        isLoading={isBatchRemovingMarket}
      />
      <ConfirmDialog
        isOpen={batchDeleteConfirmOpen}
        onClose={() => {
          if (!isDeleting) {
            setBatchDeleteConfirmOpen(false);
            setRemoveDistributedOnBatchDelete(false);
          }
        }}
        onConfirm={() => void handleBatchDelete()}
        title={t("plugin.batchDeleteTitle", "Delete selected plugins")}
        message={
          <div className="space-y-3 text-left">
            <p className="text-center">
              {t("plugin.batchDeleteMessage", {
                defaultValue:
                  "Delete {{count}} selected Plugins from My Plugins?",
                count: selectedLibraryPlugins.length,
              })}
            </p>
            {selectedLibraryDistributedTargetCount > 0 ? (
              <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-left">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-border text-primary"
                  checked={removeDistributedOnBatchDelete}
                  onChange={(event) =>
                    setRemoveDistributedOnBatchDelete(
                      event.currentTarget.checked,
                    )
                  }
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">
                    {t("plugin.deleteDistributedTargetsLabel", {
                      defaultValue:
                        "Also remove distributed Agent Plugin packages ({{count}})",
                      count: selectedLibraryDistributedTargetCount,
                    })}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {t("plugin.deleteDistributedTargetsHelp", {
                      defaultValue:
                        "Only Agent Plugin package copies/symlinks are removed. Imported child assets stay untouched.",
                    })}
                  </span>
                </span>
              </label>
            ) : null}
          </div>
        }
        confirmText={t("plugin.batchDeleteSelected", "Delete selected plugins")}
        cancelText={t("common.cancel", "Cancel")}
        variant="destructive"
        isLoading={isDeleting}
      />
      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
      <SkillStoreSourceEditModal
        isOpen={editingCustomSourceId !== null}
        onClose={() => setEditingCustomSourceId(null)}
        onDelete={setPendingDeleteCustomSourceId}
        onSave={handleUpdateCustomSource}
        onToggleEnabled={toggleCustomStoreSource}
        onRefresh={() => void load({ force: true })}
        source={
          customStoreSources.find(
            (source) => source.id === editingCustomSourceId,
          ) ?? null
        }
        typeOptions={customSourceTypeOptions}
      />
      <ConfirmDialog
        isOpen={Boolean(pendingDeleteCustomSource)}
        onClose={() => setPendingDeleteCustomSourceId(null)}
        onConfirm={handleConfirmDeleteCustomSource}
        title={t("skill.deleteStoreSourceTitle", "Delete custom store")}
        message={t("skill.deleteStoreSourceMessage", {
          name: pendingDeleteCustomSource?.name ?? "",
          defaultValue:
            'Delete custom store "{{name}}"? Installed items will stay in your library, but this source and its cached store entries will be removed.',
        })}
        confirmText={t("common.delete", "Delete")}
        cancelText={t("common.cancel", "Cancel")}
        variant="destructive"
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
      <Modal
        isOpen={isAddPluginModalOpen}
        onClose={() => setIsAddPluginModalOpen(false)}
        size="md"
        showCloseButton
        title={t("plugin.addPlugin", "New Plugin")}
        subtitle={t(
          "plugin.chooseAddMethod",
          "Choose how you want to add or manage Plugins.",
        )}
      >
        <div className="space-y-3 px-6 py-5">
          <button
            type="button"
            aria-label={t("plugin.importFromUrl", "Import from URL")}
            onClick={() => {
              setIsAddPluginModalOpen(false);
              setIsSourceImportOpen(true);
            }}
            disabled={isImportingSourcePlugin || isPreviewingSourcePlugin}
            className="group flex w-full items-center gap-4 rounded-xl border border-primary/30 bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="rounded-lg bg-primary p-3 text-primary-foreground">
              {isImportingSourcePlugin || isPreviewingSourcePlugin ? (
                <Loader2Icon
                  aria-hidden="true"
                  className="h-6 w-6 animate-spin"
                />
              ) : (
                <GlobeIcon aria-hidden="true" className="h-6 w-6" />
              )}
            </div>
            <span className="min-w-0">
              <span className="block font-medium text-foreground">
                {t("plugin.importFromUrl", "Import from URL")}
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {t(
                  "plugin.importFromUrlOptionDesc",
                  "Paste a Git, SSH, or HTTPS Plugin source URL.",
                )}
              </span>
            </span>
          </button>

          <button
            type="button"
            aria-label={t("plugin.importLocalPlugin", "Import local Plugin")}
            onClick={() => {
              setIsAddPluginModalOpen(false);
              void handleImportLocalPlugin();
            }}
            disabled={isImportingLocalPlugin}
            className="group flex w-full items-center gap-4 rounded-xl border border-border bg-accent/50 p-4 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="rounded-lg bg-background p-3 transition-colors group-hover:bg-primary/10">
              {isImportingLocalPlugin ? (
                <Loader2Icon
                  aria-hidden="true"
                  className="h-6 w-6 animate-spin text-foreground"
                />
              ) : (
                <FolderOpenIcon
                  aria-hidden="true"
                  className="h-6 w-6 text-foreground"
                />
              )}
            </div>
            <span className="min-w-0">
              <span className="block font-medium text-foreground">
                {t("plugin.importLocalPlugin", "Import local Plugin")}
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {t(
                  "plugin.importLocalPluginOptionDesc",
                  "Choose a local Plugin package folder.",
                )}
              </span>
            </span>
          </button>

          <button
            type="button"
            aria-label={t("plugin.batchManage", "Batch manage Plugins")}
            onClick={() => {
              setIsAddPluginModalOpen(false);
              handleToggleBatchMode();
            }}
            className="group flex w-full items-center gap-4 rounded-xl border border-border bg-accent/50 p-4 text-left transition-colors hover:bg-accent"
          >
            <div className="rounded-lg bg-background p-3 transition-colors group-hover:bg-primary/10">
              {isBatchMode ? (
                <XIcon aria-hidden="true" className="h-6 w-6 text-foreground" />
              ) : (
                <CheckSquareIcon
                  aria-hidden="true"
                  className="h-6 w-6 text-foreground"
                />
              )}
            </div>
            <span className="min-w-0">
              <span className="block font-medium text-foreground">
                {t("plugin.batchManage", "Batch manage Plugins")}
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {t(
                  "plugin.batchManageOptionDesc",
                  "Select multiple installed Plugins for tags, distribution, or deletion.",
                )}
              </span>
            </span>
          </button>
        </div>
      </Modal>
      <Modal
        isOpen={isSourceImportOpen}
        onClose={handleCloseSourceImport}
        size="lg"
        showCloseButton
        closeOnBackdrop={!isImportingSourcePlugin && !isPreviewingSourcePlugin}
        closeOnEscape={!isImportingSourcePlugin && !isPreviewingSourcePlugin}
        title={t("plugin.importFromUrl", "Import from URL")}
        subtitle={t(
          "plugin.importFromUrlDesc",
          "Clone a Git, SSH, or HTTPS Plugin source and import a complete bundle into My Plugins.",
        )}
      >
        <form
          className="space-y-4 px-6 py-5"
          onSubmit={(event) => {
            event.preventDefault();
            void handlePreviewSourcePlugin();
          }}
        >
          <label className="block space-y-1.5" htmlFor="plugin-source-url">
            <span className="text-sm font-medium text-foreground">
              {t("plugin.sourceUrlLabel", "Plugin URL")}
            </span>
            <input
              id="plugin-source-url"
              value={sourceImportUrl}
              onChange={(event) => setSourceImportUrl(event.target.value)}
              placeholder="git@github.com:owner/repo.git"
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              autoFocus
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1.5" htmlFor="plugin-source-branch">
              <span className="text-sm font-medium text-foreground">
                {t("plugin.sourceBranchLabel", "Branch")}
              </span>
              <input
                id="plugin-source-branch"
                value={sourceImportBranch}
                onChange={(event) => setSourceImportBranch(event.target.value)}
                placeholder="main"
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <label
              className="block space-y-1.5"
              htmlFor="plugin-source-package-path"
            >
              <span className="text-sm font-medium text-foreground">
                {t("plugin.sourcePackagePathLabel", "Package path")}
              </span>
              <input
                id="plugin-source-package-path"
                value={sourceImportPackagePath}
                onChange={(event) =>
                  setSourceImportPackagePath(event.target.value)
                }
                placeholder="plugins/example"
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
            </label>
          </div>

          <label className="block space-y-1.5" htmlFor="plugin-source-label">
            <span className="text-sm font-medium text-foreground">
              {t("plugin.sourceLabelLabel", "Source label")}
            </span>
            <input
              id="plugin-source-label"
              value={sourceImportLabel}
              onChange={(event) => setSourceImportLabel(event.target.value)}
              placeholder={t("plugin.sourceLabelPlaceholder", "Team Plugins")}
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <div className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
            {t(
              "plugin.importFromUrlHelp",
              "SSH URLs use your local git and SSH keys. HTTPS URLs are cloned as Git sources; for GitHub rate limits, prefer SSH or retry later.",
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={handleCloseSourceImport}
              disabled={isImportingSourcePlugin || isPreviewingSourcePlugin}
              className="inline-flex h-10 items-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("common.cancel", "Cancel")}
            </button>
            <button
              type="submit"
              disabled={
                isImportingSourcePlugin ||
                isPreviewingSourcePlugin ||
                !sourceImportUrl.trim()
              }
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              {isPreviewingSourcePlugin ? (
                <Loader2Icon
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin"
                />
              ) : (
                <PackagePlusIcon aria-hidden="true" className="h-4 w-4" />
              )}
              {isPreviewingSourcePlugin
                ? t("plugin.scanningPlugin", "Scanning...")
                : t("plugin.scanPlugin", "Scan Plugin")}
            </button>
          </div>
        </form>
      </Modal>
      <PluginSourcePreviewModal
        importing={isImportingSourcePlugin}
        onBackToEdit={handleBackToSourceImportEdit}
        onClose={handleCloseSourcePreview}
        onImport={() => void handleConfirmSourceImport()}
        preview={sourceImportPreview?.preview ?? null}
        request={sourceImportPreview?.request ?? null}
      />
      <PluginAgentTargetPicker
        isOpen={Boolean(agentTargetPicker)}
        onClose={() => setAgentTargetPicker(null)}
        onDistribute={handleDistributePlugin}
        plugin={agentTargetPicker?.plugins[0] ?? null}
        plugins={agentTargetPicker?.plugins ?? []}
        targetMatrix={targetMatrix}
        initialTargetIds={agentTargetPicker?.targetIds ?? []}
      />
      {batchTagDialogOpen ? (
        <PluginBatchTagDialog
          onClose={() => setBatchTagDialogOpen(false)}
          onSubmit={handleBatchTagSubmit}
          plugins={selectedLibraryPlugins}
        />
      ) : null}
      {childSkillImportModal}
      {isDropTargetActive ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="mx-6 w-full max-w-2xl rounded-3xl border border-primary/30 bg-background/95 px-8 py-10 shadow-2xl">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/25">
                <InboxIcon aria-hidden="true" className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <div className="text-lg font-semibold text-foreground">
                  {t("plugin.dropImportTitle", "Drop Plugins to import")}
                </div>
                <div className="text-sm leading-6 text-muted-foreground">
                  {t(
                    "plugin.dropImportDesc",
                    "Drop a local Plugin package folder here to import it into My Plugins.",
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
