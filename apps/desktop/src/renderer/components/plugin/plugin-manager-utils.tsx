import { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type {
  PluginInventorySummary,
  PluginLibraryEntry,
  PluginMarketEntry,
  PluginTargetCompatibility,
  PluginTargetStatus,
} from "@prompthub/shared/types/plugin";
import { PLUGIN_INVENTORY_KEYS } from "@prompthub/shared/types/plugin";
import type { PluginLibraryGalleryColumnMode } from "../../stores/plugin.store";

const SAFE_PLUGIN_ICON_DATA_URL_PATTERN =
  /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i;

export type PluginTab = "library" | "market" | "targets";
export type PluginLibraryFilter =
  | "all"
  | "favorites"
  | "distributed"
  | "pending";
export type AgentPluginFilter =
  | "all"
  | "my-plugins"
  | "agent-installed"
  | "distributed"
  | "pending";
export type PluginBatchTagMode = "add" | "remove";

export const TAB_ICON_CLASS_NAME = "h-4 w-4";
export const AGENT_PLUGIN_HEADER_CLASS =
  "h-[132px] border-b border-border app-wallpaper-panel-strong";
export const MARKET_PREVIEW_PREFETCH_CONCURRENCY = 6;
export const MARKET_GRID_GAP_PX = 12;
export const MARKET_GRID_ROW_HEIGHT_PX = 132;
export const MARKET_GRID_HEADER_HEIGHT_PX = 36;
export const MARKET_GRID_BOTTOM_GUTTER_PX = 24;
export const MARKET_CATALOG_VIRTUALIZE_THRESHOLD = 240;
export const PLUGIN_LIBRARY_GALLERY_AUTO_MIN_WIDTH_PX = 360;
export const PLUGIN_LIBRARY_GALLERY_MANUAL_MIN_WIDTH_PX = 280;
export const PLUGIN_LIBRARY_GALLERY_COLUMNS: PluginLibraryGalleryColumnMode[] =
  ["auto", "2", "3", "4"];
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isPluginDownloadNetworkError(message: string): boolean {
  return (
    /CONNECT tunnel failed/i.test(message) ||
    /could not resolve host/i.test(message) ||
    /failed to connect/i.test(message) ||
    /network is unreachable/i.test(message) ||
    /connection (?:reset|timed out)/i.test(message) ||
    /Git (?:clone|command).*timed out/i.test(message) ||
    /proxy(?:connect| connection)?[^.]{0,80}(?:502|503|504)/i.test(message)
  );
}

function isPluginSourceAccessError(message: string): boolean {
  return /authentication failed|access denied|could not read username|repository .*not found|fatal: repository|401 unauthorized|403 forbidden|MISSING_SOURCE|INVALID_SOURCE|来源不存在|source (?:is )?(?:missing|invalid)/i.test(
    message,
  );
}

function isPluginPackageValidationError(message: string): boolean {
  return /MISSING_MANIFEST|INVALID_(?:JSON|PATH|PACKAGE)|PACKAGE_TOO_LARGE|manifest (?:is )?invalid|manifest.*(?:not found|missing|regular file|exceeds)|没有找到.*manifest|下载后没有找到|不是 JSON|路径不安全|unsafe path|package too large/i.test(
    message,
  );
}

function sanitizePluginInstallReason(message: string): string {
  return message
    .replace(/^Error invoking remote method ['"][^'"]+['"]:\s*/i, "")
    .replace(/^CorePluginError:\s*/i, "")
    .replace(/https?:\/\/\S+/gi, "[Plugin source]")
    .replace(/(?:\/Users\/|\/home\/|[A-Za-z]:\\).*$/g, "[local path]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

type PluginInstallFailureKind =
  | "duplicate"
  | "git"
  | "network"
  | "package"
  | "source"
  | "storage"
  | "unexpected";

function classifyPluginInstallFailure(
  message: string,
): PluginInstallFailureKind {
  if (isPluginDownloadNetworkError(message)) return "network";
  if (
    /DUPLICATE_PLUGIN|Plugin 已(?:安装|导入)|already installed/i.test(message)
  ) {
    return "duplicate";
  }
  if (
    /ENOSPC|no space left|read-only file system|EACCES|EPERM/i.test(message)
  ) {
    return "storage";
  }
  if (isPluginSourceAccessError(message)) return "source";
  if (isPluginPackageValidationError(message)) return "package";
  if (
    /GIT_FAILED|Git 命令执行失败|Git command failed|spawn git/i.test(message)
  ) {
    return "git";
  }
  return "unexpected";
}

const PLUGIN_INSTALL_ERROR_COPY = {
  duplicate: [
    "plugin.installDuplicateError",
    "This Plugin is already installed. Open My Plugins to manage it.",
  ],
  git: [
    "plugin.installGitError",
    "PromptHub could not run Git to download the Plugin. Check that Git is available and the source can be reached.",
  ],
  network: [
    "plugin.installNetworkError",
    "Could not download the Plugin. Check the proxy mode in Settings > Network Settings, then try again.",
  ],
  package: [
    "plugin.installPackageError",
    "The Plugin package failed validation. Its manifest, size, or file paths are invalid; choose another source or report the store item.",
  ],
  source: [
    "plugin.installSourceError",
    "Plugin source is unavailable or access was denied. Check the repository address and permissions, then try again.",
  ],
  storage: [
    "plugin.installStorageError",
    "PromptHub could not save the Plugin locally. Check disk space and folder permissions, then try again.",
  ],
} as const;

export function getPluginInstallErrorMessage(
  error: unknown,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const message = getErrorMessage(error);
  const kind = classifyPluginInstallFailure(message);
  if (kind !== "unexpected") {
    const [key, defaultValue] = PLUGIN_INSTALL_ERROR_COPY[kind];
    return t(key, { defaultValue });
  }
  return t("plugin.installUnexpectedError", {
    defaultValue:
      "Could not complete this Plugin operation. Reason: {{reason}}. Review the reason and try again.",
    reason:
      sanitizePluginInstallReason(message) || t("common.unknown", "Unknown"),
  });
}

export function getPluginBatchInstallResultMessage({
  failed,
  firstFailure,
  succeeded,
  t,
}: {
  failed: number;
  firstFailure: string;
  succeeded: number;
  t: ReturnType<typeof useTranslation>["t"];
}): string {
  const summary = t("plugin.batchInstallResult", {
    defaultValue:
      "Batch install finished: {{succeeded}} succeeded, {{failed}} failed",
    failed,
    succeeded,
  });
  if (!firstFailure) return summary;
  return t("plugin.batchInstallFirstFailure", {
    defaultValue: "{{summary}}. First failure: {{reason}}",
    reason: firstFailure,
    summary,
  });
}

export function getPluginLibraryGalleryGridStyle(
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

export function hasFileItems(dataTransfer: DataTransfer): boolean {
  return (
    Array.from(dataTransfer.items ?? []).some((item) => item.kind === "file") ||
    dataTransfer.files.length > 0
  );
}

export function normalizeDroppedPluginPath(filePath: string): string {
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

export function getInventoryLabel(
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

export function getInventoryUnitLabel(
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

export function getInventoryChipLabel(
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

export function InventoryChips({
  inventory,
}: {
  inventory: PluginInventorySummary;
}) {
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

export function getStatusLabel(
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

export function getAgentPluginFilterButtonClass(
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

export function getClassificationLabel(
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

export function getMarketSourceLabel(
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

export function getPluginCategoryLabel(
  category: string,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  return t(`plugin.categories.${category}`, category);
}

export function getPluginTrustLabel(
  trustLevel: PluginMarketEntry["trustLevel"],
  t: ReturnType<typeof useTranslation>["t"],
): string {
  return t(`plugin.trust.${trustLevel}`, trustLevel);
}

export function getPluginLibraryFilterLabel(
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

export function normalizePluginUserTag(input: string): string {
  return input.trim().toLowerCase();
}

export function uniquePluginTags(tags: string[]): string[] {
  return Array.from(
    new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0)),
  );
}

export function getPluginUserTags(plugin: PluginLibraryEntry): string[] {
  return uniquePluginTags(plugin.userTags ?? []);
}

export function getPluginDisplayTags(
  entry: PluginLibraryEntry | PluginMarketEntry,
): string[] {
  const userTags = "userTags" in entry ? (entry.userTags ?? []) : [];
  return uniquePluginTags([...(entry.tags ?? []), ...userTags]);
}

export function updatePluginUserTags(
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

export function collectPluginTagSuggestions(
  plugins: PluginLibraryEntry[],
): string[] {
  return Array.from(
    new Set(
      plugins
        .flatMap((plugin) => getPluginDisplayTags(plugin))
        .filter((tag) => tag.trim()),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export function getPluginLibrarySourceKey(plugin: PluginLibraryEntry): string {
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

export function getPluginLibrarySourceLabel(
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

export function shouldShowMarketTrustBadge(entry: PluginMarketEntry): boolean {
  if (
    entry.trustLevel === "official" &&
    (entry.marketplaceId === "openai-curated" ||
      entry.marketplaceId === "prompthub-official")
  ) {
    return false;
  }
  return true;
}

export function getPluginPolicyValueLabel(
  scope: "installation" | "authentication",
  value: string,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  return t(`plugin.policy.${scope}.${value}`, value);
}

export function getPluginEntryId(
  entry: PluginLibraryEntry | PluginMarketEntry,
) {
  return entry.id;
}

export type PluginStoreCatalogRow =
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

export function getMarketGridColumns(width: number): number {
  if (width >= 1280) return 4;
  if (width >= 1024) return 3;
  if (width >= 640) return 2;
  return 1;
}

export function buildPluginStoreCatalogRows(options: {
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

export function getPluginLocalPackagePath(plugin: PluginLibraryEntry): string {
  return (
    plugin.localPackagePath ||
    plugin.source.localPackagePath ||
    plugin.managedPath ||
    plugin.localRepositoryPath ||
    plugin.source.localRepositoryPath ||
    ""
  );
}

export function getPluginInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function resolvePluginIconUrl(iconUrl?: string | null): string {
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

export function getPluginBrandStyle(
  brandColor?: string,
): CSSProperties | undefined {
  if (!brandColor || !/^#[0-9a-f]{6}$/i.test(brandColor)) {
    return undefined;
  }
  return {
    backgroundColor: `${brandColor}1A`,
    color: brandColor,
  };
}

export function PluginAvatar({
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

export function getTargetPlatformIconId(targetId: string): string {
  const iconIds: Record<string, string> = {
    "claude-code": "claude",
    "gemini-cli": "gemini",
    "github-copilot": "copilot",
  };
  return iconIds[targetId] ?? targetId;
}

export function getTargetDescription(
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

export function getTargetUnsupportedTitle(
  target: PluginTargetCompatibility,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  return t("plugin.targetUnsupportedBundleTitle", {
    defaultValue: "{{name}} does not support PromptHub Plugin bundles",
    name: target.displayName,
  });
}
