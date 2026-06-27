import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  CheckIcon,
  CheckSquareIcon,
  CodeIcon,
  CopyIcon,
  CopyPlusIcon,
  ExternalLinkIcon,
  FolderOpenIcon,
  HistoryIcon,
  InfoIcon,
  LanguagesIcon,
  LinkIcon,
  Loader2Icon,
  PencilIcon,
  RefreshCwIcon,
  SaveIcon,
  SendIcon,
  ServerIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  ShieldIcon,
  SquareIcon,
  StarIcon,
  StickyNoteIcon,
  StoreIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  PluginDistributeMode,
  PluginInventorySummary,
  PluginLibraryEntry,
  PluginPackageHealthCheck,
  PluginSourceUpdateCheck,
  PluginTargetCompatibility,
} from "@prompthub/shared/types/plugin";
import { PLUGIN_INVENTORY_KEYS } from "@prompthub/shared/types/plugin";
import type { SkillSafetyReport } from "@prompthub/shared/types";
import { Spinner } from "../ui/Spinner";
import { PlatformIcon } from "../ui/PlatformIcon";
import { useToast } from "../ui/Toast";
import { UnsavedChangesDialog } from "../ui/UnsavedChangesDialog";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Modal, Textarea } from "../ui";
import {
  DETAIL_PAGE_PREVIEW_GRID_CLASS,
  DETAIL_PAGE_SOURCE_CLASS,
} from "../layout/detailPageLayout";
import { usePluginStore } from "../../stores/plugin.store";
import { useSettingsStore } from "../../stores/settings.store";
import { useSkillStore } from "../../stores/skill.store";
import { copyTextToClipboard } from "../../utils/clipboard";
import {
  formatSkillTranslationError,
  formatSkillSafetyScanError,
  getSafetyScanAIConfig,
  groupSkillSafetyFindings,
} from "../skill/detail-utils";
import {
  getSkillSafetyFindingTitle,
  getSkillSafetyLevelLabel,
} from "../skill/safety-i18n";
import { PluginVersionHistoryModal } from "./PluginVersionHistoryModal";
import { AgentPluginDetailActions } from "./AgentPluginDetailActions";
import { AgentPluginPreviewSidebar } from "./AgentPluginPreviewSidebar";

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
  isImportingChildSkills?: boolean;
  isImportingChildMcp?: boolean;
  agentContext?: {
    isManaged?: boolean;
    platformId: string;
    platformName: string;
    sourcePath: string;
  } | null;
  agentActions?: {
    isImporting?: boolean;
    onImport?: () => void | Promise<void>;
    onOpenFolder?: () => void | Promise<void>;
    onOpenManagedPlugin?: () => void | Promise<void>;
  } | null;
  onBack: () => void;
  onDelete: (plugin: PluginLibraryEntry) => void;
  onDistribute: (
    targetIds: string[],
    mode: PluginDistributeMode,
  ) => Promise<void>;
  onRemoveDistribution?: (
    target: PluginTargetCompatibility,
  ) => Promise<void> | void;
  onToggleFavorite?: (plugin: PluginLibraryEntry) => void | Promise<void>;
  onImportChildSkills?: (plugin: PluginLibraryEntry) => void | Promise<void>;
  onImportChildMcp?: (plugin: PluginLibraryEntry) => void | Promise<void>;
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

function getSourceUpdateTone(status?: PluginSourceUpdateCheck["status"]) {
  if (status === "update-available") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  if (status === "local-modified" || status === "conflict") {
    return "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300";
  }
  if (status === "up-to-date") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";
  }
  return "border-border bg-background text-muted-foreground";
}

function getSourceUpdateLabel(
  check: PluginSourceUpdateCheck | undefined,
  isChecking: boolean,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (isChecking) return t("plugin.checkingUpdates", "Checking...");
  if (!check) return t("plugin.checkForUpdates", "Check updates");
  if (check.status === "update-available") {
    return t("plugin.updateAvailable", "Update available");
  }
  if (check.status === "local-modified") {
    return t("plugin.localChanges", "Local changes");
  }
  if (check.status === "conflict") {
    return t("plugin.updateConflict", "Update conflict");
  }
  if (check.status === "up-to-date") {
    return t("plugin.upToDate", "Up to date");
  }
  return t("plugin.noSourceUpdate", "No source update");
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
      defaultValue: "{{count}} {{label}}",
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

function computePluginSafetyScore(report: SkillSafetyReport): number {
  const findingCount = report.findings.length;
  switch (report.level) {
    case "blocked":
      return Math.max(0, 10 - findingCount * 2);
    case "high-risk":
      return Math.max(20, 40 - findingCount * 3);
    case "warn":
      return Math.max(50, 70 - findingCount * 4);
    case "safe":
      return Math.max(80, 100 - findingCount * 5);
    default:
      return 50;
  }
}

function getPluginSafetySourceUrl(plugin: PluginLibraryEntry): string {
  return (
    plugin.repository ||
    plugin.source.repository ||
    plugin.source.url ||
    plugin.homepage ||
    ""
  );
}

function buildPluginSafetyScanContent(
  plugin: PluginLibraryEntry,
  localPackagePath: string,
): string {
  const sourceUrl = getPluginSafetySourceUrl(plugin);
  const lines = [
    "# Plugin Safety Assessment Input",
    "",
    "This is a static PromptHub Plugin package summary. Review metadata, source provenance, inventory, and package signals. Do not assume any plugin scripts, hooks, MCP servers, commands, apps, or tools have been executed.",
    "",
    "## Identity",
    `id: ${plugin.id}`,
    `name: ${plugin.name}`,
    `displayName: ${plugin.displayName}`,
    `version: ${plugin.version || "unknown"}`,
    `trustLevel: ${plugin.trustLevel}`,
    `classification: ${plugin.classification}`,
    `category: ${plugin.category || "unknown"}`,
    "",
    "## Description",
    plugin.description || "No short description provided.",
    "",
    "## Long Description",
    plugin.longDescription || "No long description provided.",
    "",
    "## Inventory",
    ...PLUGIN_INVENTORY_KEYS.map((key) => `${key}: ${plugin.inventory[key]}`),
    "",
    "## Source",
    `sourceKind: ${plugin.source.kind}`,
    `sourceLabel: ${plugin.source.label || "unknown"}`,
    `sourceUrl: ${sourceUrl || "unknown"}`,
    `repository: ${plugin.repository || plugin.source.repository || "unknown"}`,
    `homepage: ${plugin.homepage || "unknown"}`,
    `packagePath: ${plugin.source.packagePath || "unknown"}`,
    `localPackagePath: ${localPackagePath || "unknown"}`,
    `managedPath: ${plugin.managedPath || "unknown"}`,
    "",
    "## Static Review Scope",
    "- Plugin installation records only the bundle in My Plugins.",
    "- Child Skills and MCP configs require explicit import before distribution.",
    "- Apps/connectors, commands, hooks, scripts, and MCP servers must not be executed during this scan.",
  ];

  return lines.join("\n");
}

function getPluginDescriptionText(
  plugin: PluginLibraryEntry,
  fallback: string,
): string {
  const sections = [plugin.description, plugin.longDescription]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return sections.length > 0 ? sections.join("\n\n") : fallback;
}

function getPluginTextFingerprint(content: string): string {
  let hash = 0;
  for (let index = 0; index < content.length; index += 1) {
    hash = (hash * 31 + content.charCodeAt(index)) >>> 0;
  }
  return `${content.length}:${hash.toString(16)}`;
}

function stripPluginTranslationFrontmatter(content: string): string {
  const trimmed = content.trim();
  if (!trimmed.startsWith("---")) {
    return trimmed;
  }

  const lines = trimmed.split(/\r?\n/);
  const endIndex = lines.findIndex(
    (line, index) => index > 0 && line === "---",
  );
  if (endIndex === -1) {
    return trimmed;
  }
  return lines
    .slice(endIndex + 1)
    .join("\n")
    .trim();
}

function normalizePluginTranslatedText(content: string): string {
  const body = stripPluginTranslationFrontmatter(content);
  const translatedLines = body
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .match(/^<t>(.*)<\/t>$/)?.[1]
        ?.trim(),
    )
    .filter((line): line is string => Boolean(line));

  if (translatedLines.length > 0) {
    return translatedLines.join("\n\n");
  }

  return body.replace(/<\/?t>/g, "").trim();
}

function getPluginTranslationTargetLanguage(language?: string): string {
  const lang = (language || "").toLowerCase();
  if (lang.startsWith("zh")) return "中文";
  if (lang.startsWith("ja")) return "日本語";
  if (lang.startsWith("ko")) return "한국어";
  return "English";
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
  };
  return iconIds[targetId] ?? targetId;
}

function getPluginTargetDescription(
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
  plugin,
  localPackagePath,
  onDistribute,
  onRemoveDistribution,
  targetMatrix,
}: {
  plugin: PluginLibraryEntry;
  localPackagePath: string;
  onDistribute: (
    targetIds: string[],
    mode: PluginDistributeMode,
  ) => Promise<void>;
  onRemoveDistribution?: (
    target: PluginTargetCompatibility,
  ) => Promise<void> | void;
  targetMatrix: PluginTargetCompatibility[];
}) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [installMode, setInstallMode] = useState<"copy" | "symlink">("copy");
  const [isDistributing, setIsDistributing] = useState(false);
  const [isRemovingTargetId, setIsRemovingTargetId] = useState<string | null>(
    null,
  );
  const [pendingRemoveTarget, setPendingRemoveTarget] =
    useState<PluginTargetCompatibility | null>(null);
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(
    new Set(),
  );
  const distributedTargetIds = useMemo(
    () => new Set(plugin.distributedTargetIds ?? []),
    [plugin.distributedTargetIds],
  );
  const supportedTargets = useMemo(
    () => targetMatrix.filter((target) => target.enabled),
    [targetMatrix],
  );
  const undistributedTargets = useMemo(
    () =>
      supportedTargets.filter((target) => !distributedTargetIds.has(target.id)),
    [distributedTargetIds, supportedTargets],
  );
  const selectedCount = selectedTargetIds.size;

  useEffect(() => {
    const selectableTargetIds = new Set(
      undistributedTargets.map((target) => target.id),
    );
    setSelectedTargetIds((current) => {
      const next = new Set(
        Array.from(current).filter((targetId) =>
          selectableTargetIds.has(targetId),
        ),
      );
      if (next.size === current.size) {
        return current;
      }
      return next;
    });
  }, [undistributedTargets]);

  const toggleTarget = (target: PluginTargetCompatibility) => {
    if (!target.enabled || distributedTargetIds.has(target.id)) return;
    setSelectedTargetIds((current) => {
      const next = new Set(current);
      if (next.has(target.id)) next.delete(target.id);
      else next.add(target.id);
      return next;
    });
  };

  const selectAllTargets = () => {
    setSelectedTargetIds(
      new Set(undistributedTargets.map((target) => target.id)),
    );
  };

  const deselectAllTargets = () => {
    setSelectedTargetIds(new Set());
  };

  const selectedAll =
    undistributedTargets.length > 0 &&
    selectedCount === undistributedTargets.length;

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

  const confirmRemoveDistribution = async () => {
    if (!pendingRemoveTarget || !onRemoveDistribution || isRemovingTargetId) {
      return;
    }
    setIsRemovingTargetId(pendingRemoveTarget.id);
    try {
      await onRemoveDistribution(pendingRemoveTarget);
      setPendingRemoveTarget(null);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    } finally {
      setIsRemovingTargetId(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-6">
        <h3 className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          <span>{t("skill.platformIntegration", "Platform Integration")}</span>
          <span className="text-[10px]">
            {t("plugin.pluginSurfaceLabel", "Plugin")}
          </span>
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

          {undistributedTargets.length > 0 ? (
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
          ) : null}

          <div className="space-y-2">
            {targetMatrix.map((target) => {
              const isDistributed = distributedTargetIds.has(target.id);
              const selected =
                !isDistributed && selectedTargetIds.has(target.id);
              const description = getPluginTargetDescription(target, t);
              const content = (
                <>
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
                        {isDistributed
                          ? t("plugin.installed", "Installed")
                          : selected
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
                  {isDistributed ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <CheckIcon
                        aria-hidden="true"
                        className="h-4 w-4 text-primary"
                      />
                      {onRemoveDistribution ? (
                        <button
                          type="button"
                          onClick={() => setPendingRemoveTarget(target)}
                          disabled={isRemovingTargetId === target.id}
                          className="text-[10px] text-destructive transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                          title={t("plugin.removePluginFromAgent", {
                            agent: target.displayName,
                            name: plugin.displayName,
                            defaultValue: "Remove {{name}} from {{agent}}",
                          })}
                          aria-label={t("plugin.removePluginFromAgent", {
                            agent: target.displayName,
                            name: plugin.displayName,
                            defaultValue: "Remove {{name}} from {{agent}}",
                          })}
                        >
                          {isRemovingTargetId === target.id ? (
                            <span className="inline-flex items-center gap-1">
                              <Loader2Icon
                                aria-hidden="true"
                                className="h-3 w-3 animate-spin"
                              />
                              {t("plugin.removing", "Removing...")}
                            </span>
                          ) : (
                            t("plugin.removeFromAgent", "Remove from Agent")
                          )}
                        </button>
                      ) : null}
                    </div>
                  ) : (
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
                  )}
                </>
              );

              if (!target.enabled) {
                return (
                  <div
                    key={target.id}
                    className="flex w-full items-center justify-between rounded-xl border border-border bg-accent/20 p-3 text-left opacity-55"
                  >
                    {content}
                  </div>
                );
              }

              if (isDistributed) {
                return (
                  <div
                    key={target.id}
                    className="flex w-full items-center justify-between rounded-xl border border-primary bg-primary/5 p-3 text-left"
                  >
                    {content}
                  </div>
                );
              }

              return (
                <button
                  key={target.id}
                  type="button"
                  aria-label={target.displayName}
                  aria-pressed={selected}
                  onClick={() => toggleTarget(target)}
                  className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition-all ${
                    selected
                      ? "cursor-pointer border-primary bg-primary/10"
                      : "cursor-pointer border-border bg-accent/30 hover:bg-accent/50"
                  }`}
                >
                  {content}
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
      <ConfirmDialog
        isOpen={Boolean(pendingRemoveTarget)}
        onClose={() => {
          if (!isRemovingTargetId) {
            setPendingRemoveTarget(null);
          }
        }}
        title={t(
          "plugin.removePluginFromAgentConfirmTitle",
          "Remove Plugin from Agent",
        )}
        message={t("plugin.removePluginFromAgentConfirmDescription", {
          agent: pendingRemoveTarget?.displayName ?? "",
          name: plugin.displayName,
          defaultValue:
            "Remove {{name}} from {{agent}}? This only removes the distributed Agent Plugin package and keeps My Plugins unchanged.",
        })}
        confirmText={t("plugin.removeFromAgent", "Remove from Agent")}
        cancelText={t("common.cancel", "Cancel")}
        variant="destructive"
        isLoading={Boolean(isRemovingTargetId)}
        onConfirm={() => {
          void confirmRemoveDistribution();
        }}
      />
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
          {t("plugin.manifestLabel", "Manifest")}
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

function getPackageHealthLabel(
  check: PluginPackageHealthCheck | undefined,
  isChecking: boolean,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (isChecking) {
    return t("plugin.packageCheckChecking", "Checking...");
  }
  if (!check) {
    return t("plugin.packageCheckNotChecked", "Not checked");
  }
  switch (check.status) {
    case "ok":
      return t("plugin.packageCheckOk", "Package OK");
    case "not-installed":
      return t("plugin.packageCheckNotInstalled", "Not installed");
    case "missing-package":
      return t("plugin.packageCheckMissingPackage", "Package missing");
    case "missing-manifest":
      return t("plugin.packageCheckMissingManifest", "Manifest missing");
    case "invalid":
      return t("plugin.packageCheckNeedsReview", "Needs review");
    default:
      return t("plugin.packageCheckNeedsReview", "Needs review");
  }
}

function getPackageHealthTone(
  check: PluginPackageHealthCheck | undefined,
  isChecking: boolean,
): string {
  if (isChecking) {
    return "border-primary/30 bg-primary/10 text-primary";
  }
  if (!check) {
    return "border-border bg-muted/40 text-muted-foreground";
  }
  if (check.status === "ok") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";
  }
  return "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300";
}

function PluginPackageHealthPanel({
  check,
  isChecking,
  localPackagePath,
  onRunCheck,
}: {
  check?: PluginPackageHealthCheck;
  isChecking: boolean;
  localPackagePath: string;
  onRunCheck: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const label = getPackageHealthLabel(check, isChecking, t);
  const tone = getPackageHealthTone(check, isChecking);
  const details = check?.findings ?? [];

  return (
    <section className="rounded-2xl border border-border app-wallpaper-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
            {t("plugin.packageCheckTitle", "Package Check")}
          </h3>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {t(
              "plugin.packageCheckDescription",
              "Static check for local package files, manifest paths, and symlink boundaries.",
            )}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}
        >
          {isChecking ? (
            <Loader2Icon
              aria-hidden="true"
              className="h-3.5 w-3.5 animate-spin"
            />
          ) : check?.status === "ok" ? (
            <CheckIcon aria-hidden="true" className="h-3.5 w-3.5" />
          ) : (
            <AlertTriangleIcon aria-hidden="true" className="h-3.5 w-3.5" />
          )}
          {label}
        </span>
      </div>

      <button
        type="button"
        onClick={() => void onRunCheck()}
        disabled={isChecking || !localPackagePath}
        className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={t("plugin.runPackageCheck", "Run package check")}
        title={t("plugin.runPackageCheck", "Run package check")}
      >
        {isChecking ? (
          <Loader2Icon
            aria-hidden="true"
            className="h-3.5 w-3.5 animate-spin"
          />
        ) : (
          <CheckIcon aria-hidden="true" className="h-3.5 w-3.5" />
        )}
        {t("plugin.runPackageCheck", "Run package check")}
      </button>

      {check ? (
        <div className="mt-4 space-y-3 text-xs">
          {check.packagePath ? (
            <div>
              <div className="font-semibold text-muted-foreground">
                {t("plugin.packagePathLabel", "Package path")}
              </div>
              <div className="mt-1 break-all rounded-lg bg-muted/50 px-2.5 py-2 text-foreground/80">
                {check.packagePath}
              </div>
            </div>
          ) : null}
          {check.manifestPath ? (
            <div>
              <div className="font-semibold text-muted-foreground">
                {t("plugin.manifestPathLabel", "Manifest path")}
              </div>
              <div className="mt-1 break-all rounded-lg bg-muted/50 px-2.5 py-2 text-foreground/80">
                {check.manifestPath}
              </div>
            </div>
          ) : null}
          {details.length > 0 ? (
            <div className="space-y-2">
              <div className="font-semibold text-muted-foreground">
                {t("plugin.packageCheckFindings", "Findings")}
              </div>
              {details.map((finding, index) => (
                <div
                  key={`${finding.code}-${index}`}
                  className="rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-2 text-red-700 dark:text-red-200"
                >
                  <div className="font-semibold">{finding.code}</div>
                  <div className="mt-1 leading-5">{finding.message}</div>
                  {finding.path ? (
                    <div className="mt-1 break-all text-red-700/80 dark:text-red-200/80">
                      {finding.path}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-emerald-500/10 px-2.5 py-2 text-emerald-700 dark:text-emerald-200">
              {t(
                "plugin.packageCheckNoFindings",
                "No package boundary issues found.",
              )}
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function getPluginSafetyTone(level?: SkillSafetyReport["level"]): string {
  if (level === "safe") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (level === "warn") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  if (level === "high-risk" || level === "blocked") {
    return "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300";
  }
  return "border-border bg-background text-muted-foreground";
}

function PluginSafetyAssessmentPanel({
  isScanning,
  onRunSafetyAssessment,
  report,
}: {
  isScanning: boolean;
  onRunSafetyAssessment: () => void | Promise<void>;
  report?: SkillSafetyReport;
}) {
  const { t, i18n } = useTranslation();
  const groupedFindings = useMemo(
    () => groupSkillSafetyFindings(report?.findings ?? []),
    [report?.findings],
  );
  const tone = getPluginSafetyTone(report?.level);

  return (
    <section className="rounded-2xl border border-border app-wallpaper-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
            {t("plugin.safetyAssessment", "Safety Assessment")}
          </h3>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {t(
              "plugin.safetyAssessmentHint",
              "AI review of static Plugin metadata, source provenance, inventory, and package signals. It never executes Plugin code.",
            )}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}
        >
          {isScanning ? (
            <ShieldAlertIcon
              aria-hidden="true"
              className="h-3.5 w-3.5 animate-pulse"
            />
          ) : report?.level === "safe" ? (
            <ShieldCheckIcon aria-hidden="true" className="h-3.5 w-3.5" />
          ) : report ? (
            <ShieldAlertIcon aria-hidden="true" className="h-3.5 w-3.5" />
          ) : (
            <ShieldIcon aria-hidden="true" className="h-3.5 w-3.5" />
          )}
          {isScanning
            ? t("plugin.safetyScanning", "Scanning...")
            : report
              ? getSkillSafetyLevelLabel(t, report.level)
              : t("plugin.safetyNoReport", "Not assessed")}
        </span>
      </div>

      {report ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm leading-6 text-foreground/90">
                {report.summary}
              </p>
              {report.score !== undefined ? (
                <div className="shrink-0 text-right">
                  <div className="text-lg font-bold text-foreground">
                    {report.score}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t("plugin.safetyScore", "Score")} / 100
                  </div>
                </div>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span>
                {t("plugin.safetyFilesChecked", "{{count}} item(s) checked", {
                  count: report.checkedFileCount,
                })}
              </span>
              <span>
                {t("plugin.safetyScanMethod", "Method")}:{" "}
                {t("plugin.safetyScanMethodAI", "AI-assisted")}
              </span>
              <span>
                {t("plugin.safetyScanTime", "Scanned")}:{" "}
                {new Date(report.scannedAt).toLocaleString(
                  i18n.language || undefined,
                )}
              </span>
            </div>
          </div>

          {groupedFindings.length > 0 ? (
            <div className="space-y-2">
              {groupedFindings.map((finding) => (
                <div
                  key={`${finding.code}-${finding.severity}`}
                  className="rounded-xl border border-border bg-background/70 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {getSkillSafetyFindingTitle(t, finding)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        finding.severity === "high"
                          ? "bg-red-500/15 text-red-700 dark:text-red-300"
                          : finding.severity === "warn"
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                            : "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                      }`}
                    >
                      {finding.severity === "high"
                        ? t("skill.safetySeverityHigh", "High")
                        : finding.severity === "warn"
                          ? t("skill.safetySeverityWarn", "Warning")
                          : t("skill.safetySeverityInfo", "Info")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {finding.detail}
                  </p>
                  {finding.evidences[0] ? (
                    <code className="mt-2 block break-all rounded-lg bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground">
                      {finding.evidences[0]}
                    </code>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              {t("plugin.safetyNoFindings", "No issues found")}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          {t(
            "plugin.safetyNoReportDescription",
            "Run a safety assessment before distributing unfamiliar Plugin packages.",
          )}
        </p>
      )}

      <button
        type="button"
        onClick={() => void onRunSafetyAssessment()}
        disabled={isScanning}
        className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={t("plugin.runSafetyAssessment", "Run safety assessment")}
        title={t("plugin.runSafetyAssessment", "Run safety assessment")}
      >
        {isScanning ? (
          <Loader2Icon
            aria-hidden="true"
            className="h-3.5 w-3.5 animate-spin"
          />
        ) : (
          <ShieldIcon aria-hidden="true" className="h-3.5 w-3.5" />
        )}
        {isScanning
          ? t("plugin.safetyScanning", "Scanning...")
          : t("plugin.runSafetyAssessment", "Run safety assessment")}
      </button>
    </section>
  );
}

function PluginOverview({
  agentActions,
  agentContext,
  descriptionText,
  draftUserNotes,
  hasTranslatedDescription,
  isEditingUserNotes,
  isCheckingPackage,
  isImportingChildMcp,
  isImportingChildSkills,
  isScanningSafety,
  isSavingUserNotes,
  isShowingTranslatedDescription,
  isTranslatingDescription,
  localPackagePath,
  onCancelUserNotes,
  onDistribute,
  onRemoveDistribution,
  onImportChildMcp,
  onImportChildSkills,
  onRunPackageCheck,
  onRunSafetyAssessment,
  onSaveUserNotes,
  onStartEditUserNotes,
  onTranslateDescription,
  onUserNotesChange,
  packageHealthCheck,
  plugin,
  targetMatrix,
}: {
  agentActions?: {
    isImporting?: boolean;
    onImport?: () => void | Promise<void>;
    onOpenFolder?: () => void | Promise<void>;
    onOpenManagedPlugin?: () => void | Promise<void>;
  } | null;
  agentContext?: {
    isManaged?: boolean;
    platformId: string;
    platformName: string;
    sourcePath: string;
  } | null;
  descriptionText: string;
  draftUserNotes: string;
  hasTranslatedDescription: boolean;
  isEditingUserNotes: boolean;
  isCheckingPackage: boolean;
  isImportingChildMcp?: boolean;
  isImportingChildSkills?: boolean;
  isScanningSafety: boolean;
  isSavingUserNotes: boolean;
  isShowingTranslatedDescription: boolean;
  isTranslatingDescription: boolean;
  localPackagePath: string;
  onCancelUserNotes: () => void;
  onDistribute: (
    targetIds: string[],
    mode: PluginDistributeMode,
  ) => Promise<void>;
  onRemoveDistribution?: (
    target: PluginTargetCompatibility,
  ) => Promise<void> | void;
  onImportChildMcp?: (plugin: PluginLibraryEntry) => void | Promise<void>;
  onImportChildSkills?: (plugin: PluginLibraryEntry) => void | Promise<void>;
  onRunPackageCheck: () => void | Promise<void>;
  onRunSafetyAssessment: () => void | Promise<void>;
  onSaveUserNotes: () => void | Promise<void>;
  onStartEditUserNotes: () => void;
  onTranslateDescription: (forceRefresh?: boolean) => void | Promise<void>;
  onUserNotesChange: (notes: string) => void;
  packageHealthCheck?: PluginPackageHealthCheck;
  plugin: PluginLibraryEntry;
  targetMatrix: PluginTargetCompatibility[];
}) {
  const { t } = useTranslation();
  const canImportChildSkills = plugin.inventory.skills > 0;
  const canImportChildMcp = plugin.inventory.mcpServers > 0;
  const userNotes = plugin.userNotes ?? "";
  const isAgentDetail = Boolean(agentContext);

  return (
    <div className={`${DETAIL_PAGE_SOURCE_CLASS} ${DETAIL_PAGE_PREVIEW_GRID_CLASS}`}>
      <div className="space-y-6">
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
              {t("plugin.descriptionTitle", "Plugin Description")}
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void onTranslateDescription(false)}
                disabled={isTranslatingDescription}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors ${
                  isShowingTranslatedDescription && hasTranslatedDescription
                    ? "bg-primary/10 text-primary"
                    : "bg-accent/50 text-muted-foreground hover:bg-accent hover:text-foreground"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {isTranslatingDescription ? (
                  <Loader2Icon
                    aria-hidden="true"
                    className="h-3.5 w-3.5 animate-spin"
                  />
                ) : (
                  <LanguagesIcon aria-hidden="true" className="h-3.5 w-3.5" />
                )}
                {isTranslatingDescription
                  ? t("skill.translating", "Translating...")
                  : isShowingTranslatedDescription && hasTranslatedDescription
                    ? t("skill.showOriginal", "Show Original")
                    : hasTranslatedDescription
                      ? t("skill.showTranslation", "Show Translation")
                      : t("skill.translate", "AI Translate")}
              </button>
              {hasTranslatedDescription ? (
                <button
                  type="button"
                  onClick={() => void onTranslateDescription(true)}
                  disabled={isTranslatingDescription}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent/50 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  title={t("skill.refreshTranslation", "Refresh Translation")}
                  aria-label={t(
                    "skill.refreshTranslation",
                    "Refresh Translation",
                  )}
                >
                  <RefreshCwIcon
                    aria-hidden="true"
                    className={`h-3.5 w-3.5 ${isTranslatingDescription ? "animate-spin" : ""}`}
                  />
                </button>
              ) : null}
            </div>
          </div>
          <div className="rounded-2xl border border-border app-wallpaper-panel p-5">
            <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">
              {descriptionText}
            </p>
          </div>
        </section>

        {!isAgentDetail ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
                <StickyNoteIcon className="h-4 w-4 shrink-0 text-primary" />
                <h3 className="truncate text-xs font-bold uppercase tracking-[0.2em]">
                  {t("plugin.userNotes", "Personal Notes")}
                </h3>
              </div>
              {isEditingUserNotes ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void onSaveUserNotes()}
                    disabled={isSavingUserNotes}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                    aria-label={t("common.save", "Save")}
                    title={t("common.save", "Save")}
                  >
                    {isSavingUserNotes ? (
                      <Loader2Icon
                        aria-hidden="true"
                        className="h-4 w-4 animate-spin"
                      />
                    ) : (
                      <SaveIcon aria-hidden="true" className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onCancelUserNotes}
                    disabled={isSavingUserNotes}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                    aria-label={t("common.cancel", "Cancel")}
                    title={t("common.cancel", "Cancel")}
                  >
                    <XIcon aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onStartEditUserNotes}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
                  aria-label={t("plugin.editUserNotes", "Edit notes")}
                  title={t("plugin.editUserNotes", "Edit notes")}
                >
                  <PencilIcon aria-hidden="true" className="h-4 w-4" />
                </button>
              )}
            </div>

            <div
              data-testid="plugin-user-notes-card"
              className="rounded-2xl border border-border app-wallpaper-panel p-4"
            >
              {isEditingUserNotes ? (
                <Textarea
                  aria-label={t("plugin.userNotes", "Personal Notes")}
                  value={draftUserNotes}
                  onChange={(event) => onUserNotesChange(event.target.value)}
                  placeholder={t(
                    "plugin.userNotesPlaceholder",
                    "Add private notes about how you use this Plugin...",
                  )}
                  rows={5}
                  disabled={isSavingUserNotes}
                  className="min-h-[120px] resize-y"
                />
              ) : userNotes.trim() ? (
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/85">
                  {userNotes}
                </p>
              ) : (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t("plugin.userNotesEmpty", "No personal notes yet.")}
                </p>
              )}
            </div>
          </section>
        ) : null}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
              {t("plugin.inventoryTitle", "Inventory")}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {canImportChildSkills ? (
                <button
                  type="button"
                  onClick={() => void onImportChildSkills?.(plugin)}
                  disabled={!localPackagePath || isImportingChildSkills}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={t("plugin.importChildSkillsFromPlugin", {
                    defaultValue: "Import Skills from {{name}}",
                    name: plugin.displayName,
                  })}
                  title={
                    localPackagePath
                      ? t("plugin.importChildSkills", "Import Skills")
                      : t(
                          "plugin.localPackageMissing",
                          "Local package not available",
                        )
                  }
                >
                  {isImportingChildSkills ? (
                    <Loader2Icon
                      aria-hidden="true"
                      className="h-3.5 w-3.5 animate-spin"
                    />
                  ) : (
                    <CopyPlusIcon aria-hidden="true" className="h-3.5 w-3.5" />
                  )}
                  {t("plugin.importChildSkills", "Import Skills")}
                </button>
              ) : null}
              {canImportChildMcp ? (
                <button
                  type="button"
                  onClick={() => void onImportChildMcp?.(plugin)}
                  disabled={!localPackagePath || isImportingChildMcp}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={t("plugin.importChildMcpFromPlugin", {
                    defaultValue: "Import MCP from {{name}}",
                    name: plugin.displayName,
                  })}
                  title={
                    localPackagePath
                      ? t("plugin.importChildMcp", "Import MCP")
                      : t(
                          "plugin.localPackageMissing",
                          "Local package not available",
                        )
                  }
                >
                  {isImportingChildMcp ? (
                    <Loader2Icon
                      aria-hidden="true"
                      className="h-3.5 w-3.5 animate-spin"
                    />
                  ) : (
                    <ServerIcon aria-hidden="true" className="h-3.5 w-3.5" />
                  )}
                  {t("plugin.importChildMcp", "Import MCP")}
                </button>
              ) : null}
            </div>
          </div>
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
        {isAgentDetail && agentContext ? (
          <AgentPluginPreviewSidebar
            isImporting={agentActions?.isImporting}
            isManaged={agentContext.isManaged}
            onImport={agentActions?.onImport}
            onOpenFolder={agentActions?.onOpenFolder}
            onOpenManagedPlugin={agentActions?.onOpenManagedPlugin}
            platformId={agentContext.platformId}
            platformName={agentContext.platformName}
            sourcePath={agentContext.sourcePath}
          />
        ) : (
          <>
            <PluginSafetyAssessmentPanel
              isScanning={isScanningSafety}
              onRunSafetyAssessment={onRunSafetyAssessment}
              report={plugin.safetyReport}
            />
            <PluginPackageHealthPanel
              check={packageHealthCheck}
              isChecking={isCheckingPackage}
              localPackagePath={localPackagePath}
              onRunCheck={onRunPackageCheck}
            />
            <PluginPlatformPanel
              plugin={plugin}
              localPackagePath={localPackagePath}
              onDistribute={onDistribute}
              onRemoveDistribution={onRemoveDistribution}
              targetMatrix={targetMatrix}
            />
          </>
        )}
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
    <div className={`${DETAIL_PAGE_SOURCE_CLASS} space-y-6`}>
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
  onUnsavedChange,
  plugin,
  readOnly = false,
}: {
  localPackagePath: string;
  onUnsavedChange?: (hasUnsaved: boolean) => void;
  plugin: PluginLibraryEntry;
  readOnly?: boolean;
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
          onUnsavedChange={onUnsavedChange}
          readOnly={readOnly}
          surfaceLabels={{
            noFiles: t("plugin.noFiles", "No local files for this Plugin"),
            modalTitle: t("plugin.fileEditor", "Plugin File Editor"),
          }}
        />
      </Suspense>
    </div>
  );
}

export function PluginFullDetailPage({
  agentActions,
  agentContext,
  isImportingChildMcp,
  isImportingChildSkills,
  plugin,
  targetMatrix,
  onBack,
  onDelete,
  onDistribute,
  onRemoveDistribution,
  onToggleFavorite,
  onImportChildMcp,
  onImportChildSkills,
  onOpenStore,
}: PluginFullDetailPageProps) {
  const { i18n, t } = useTranslation();
  const { showToast } = useToast();
  const isAgentDetail = Boolean(agentContext);
  const aiModels = useSettingsStore((state) => state.aiModels);
  const translationMode = useSettingsStore((state) => state.translationMode);
  const translateContent = useSkillStore((state) => state.translateContent);
  const getTranslationState = useSkillStore(
    (state) => state.getTranslationState,
  );
  const [activeTab, setActiveTab] = useState<PluginDetailTab>("overview");
  const [fileEditorHasUnsavedChanges, setFileEditorHasUnsavedChanges] =
    useState(false);
  const [isUnsavedDialogOpen, setIsUnsavedDialogOpen] = useState(false);
  const [pendingUnsavedAction, setPendingUnsavedAction] = useState<
    (() => void) | null
  >(null);
  const localPackagePath = getPluginLocalPackagePath(plugin);
  const sourceUpdateCheck = usePluginStore(
    (state) => state.sourceUpdateChecks[plugin.id],
  );
  const getPluginSourceUpdateStatus = usePluginStore(
    (state) => state.getPluginSourceUpdateStatus,
  );
  const updatePluginFromSource = usePluginStore(
    (state) => state.updatePluginFromSource,
  );
  const updatePluginMetadata = usePluginStore(
    (state) => state.updatePluginMetadata,
  );
  const packageHealthCheck = usePluginStore(
    (state) => state.packageHealthChecks[plugin.id],
  );
  const checkInstalledPluginPackage = usePluginStore(
    (state) => state.checkInstalledPluginPackage,
  );
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isUpdatingFromSource, setIsUpdatingFromSource] = useState(false);
  const [isCheckingPackage, setIsCheckingPackage] = useState(false);
  const [isScanningSafety, setIsScanningSafety] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const contentScrollRef = useRef<HTMLElement | null>(null);
  const userNotesSaveInFlightRef = useRef(false);
  const safetyScanInFlightRef =
    useRef<Promise<SkillSafetyReport | null> | null>(null);
  const [draftUserNotes, setDraftUserNotes] = useState(plugin.userNotes ?? "");
  const [isEditingUserNotes, setIsEditingUserNotes] = useState(false);
  const [isSavingUserNotes, setIsSavingUserNotes] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState(false);
  const [snapshotNote, setSnapshotNote] = useState("");
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [translatedDescription, setTranslatedDescription] = useState("");
  const [showTranslatedDescription, setShowTranslatedDescription] =
    useState(false);
  const [isTranslatingDescription, setIsTranslatingDescription] =
    useState(false);
  const createPluginVersion = usePluginStore(
    (state) => state.createPluginVersion,
  );
  const descriptionSourceText = useMemo(
    () =>
      getPluginDescriptionText(
        plugin,
        t("plugin.noDescription", "No description provided"),
      ),
    [plugin, t],
  );
  const descriptionFingerprint = useMemo(
    () => getPluginTextFingerprint(descriptionSourceText),
    [descriptionSourceText],
  );
  const targetLang = useMemo(
    () => getPluginTranslationTargetLanguage(i18n.language),
    [i18n.language],
  );
  const translationCacheKey = `plugindoc_v1_${plugin.id}_${targetLang}_${translationMode}`;
  const cachedDescriptionTranslation = useMemo(
    () => getTranslationState(translationCacheKey, descriptionFingerprint),
    [descriptionFingerprint, getTranslationState, translationCacheKey],
  );

  const checkSourceUpdate = async (showSuccess = false) => {
    if (isCheckingUpdate) return;
    setIsCheckingUpdate(true);
    try {
      const check = await getPluginSourceUpdateStatus(plugin.id);
      if (showSuccess && check.status === "up-to-date") {
        showToast(t("plugin.upToDate", "Up to date"), "success");
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const updateFromSource = async (overwriteLocalChanges = false) => {
    if (isUpdatingFromSource) return;
    setIsUpdatingFromSource(true);
    try {
      const result = await updatePluginFromSource(plugin.id, {
        overwriteLocalChanges,
      });
      if (result.status === "updated") {
        showToast(t("plugin.updateSuccess", "Plugin updated"), "success");
      } else if (result.status === "up-to-date") {
        showToast(t("plugin.upToDate", "Up to date"), "success");
      } else if (result.status === "conflict") {
        showToast(
          t(
            "plugin.updateConflictHint",
            "Source and local Plugin package both changed. Review before overwriting.",
          ),
          "error",
        );
      } else if (result.status === "local-modified") {
        showToast(
          t(
            "plugin.localChangesHint",
            "Local Plugin package has changes. Overwrite only if you want to replace them.",
          ),
          "error",
        );
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    } finally {
      setIsUpdatingFromSource(false);
    }
  };

  useEffect(() => {
    void checkSourceUpdate(false);
  }, [plugin.id]);

  useEffect(() => {
    setFileEditorHasUnsavedChanges(false);
    setIsUnsavedDialogOpen(false);
    setPendingUnsavedAction(null);
    setDraftUserNotes(plugin.userNotes ?? "");
    setIsEditingUserNotes(false);
  }, [plugin.id]);

  useEffect(() => {
    setTranslatedDescription("");
    setShowTranslatedDescription(false);
    setIsTranslatingDescription(false);
  }, [plugin.id, descriptionFingerprint, targetLang, translationMode]);

  useEffect(() => {
    const normalizedCachedTranslation = cachedDescriptionTranslation.value
      ? normalizePluginTranslatedText(cachedDescriptionTranslation.value)
      : "";

    if (
      cachedDescriptionTranslation.isStale ||
      !cachedDescriptionTranslation.hasTranslation ||
      !normalizedCachedTranslation
    ) {
      setTranslatedDescription("");
      setShowTranslatedDescription(false);
      return;
    }

    setTranslatedDescription(normalizedCachedTranslation);
    setShowTranslatedDescription(true);
  }, [
    cachedDescriptionTranslation.hasTranslation,
    cachedDescriptionTranslation.isStale,
    cachedDescriptionTranslation.value,
  ]);

  useEffect(() => {
    if (!isEditingUserNotes) {
      setDraftUserNotes(plugin.userNotes ?? "");
    }
  }, [isEditingUserNotes, plugin.userNotes]);

  const requestLeaveFileEditing = (action: () => void) => {
    if (activeTab !== "files" || !fileEditorHasUnsavedChanges) {
      action();
      return;
    }

    setPendingUnsavedAction(() => action);
    setIsUnsavedDialogOpen(true);
  };

  const sourceUpdateLabel = getSourceUpdateLabel(
    sourceUpdateCheck,
    isCheckingUpdate,
    t,
  );
  const sourceUpdateTone = getSourceUpdateTone(sourceUpdateCheck?.status);
  const canUpdateFromSource = sourceUpdateCheck?.status === "update-available";
  const canOverwriteSourceUpdate =
    sourceUpdateCheck?.status === "conflict" ||
    sourceUpdateCheck?.status === "local-modified";

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
      await copyTextToClipboard(localPackagePath);
      showToast(t("plugin.localPathCopied", "Plugin path copied"));
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    }
  };

  const copyPluginTitle = async () => {
    try {
      await copyTextToClipboard(plugin.displayName);
      showToast(t("common.copied", "Copied"), "success");
    } catch (error) {
      console.error("Failed to copy plugin title:", error);
      showToast(t("common.copyFailed", "Copy failed"), "error");
    }
  };

  const translatePluginDescription = async (forceRefresh = false) => {
    if (!forceRefresh && translatedDescription) {
      setShowTranslatedDescription((current) => !current);
      return;
    }
    if (isTranslatingDescription) {
      return;
    }

    setIsTranslatingDescription(true);
    try {
      const translated = await translateContent(
        descriptionSourceText,
        translationCacheKey,
        targetLang,
        {
          forceRefresh,
          sourceFingerprint: descriptionFingerprint,
        },
      );

      const normalized = normalizePluginTranslatedText(translated);
      if (!normalized) {
        throw new Error("TRANSLATION_EMPTY");
      }

      setTranslatedDescription(normalized);
      setShowTranslatedDescription(true);
      showToast(
        forceRefresh
          ? t("skill.translateRefreshed", "Translation refreshed")
          : t("skill.translateSuccess", "Translation complete"),
        "success",
      );
    } catch (error) {
      showToast(formatSkillTranslationError(error, t), "error");
    } finally {
      setIsTranslatingDescription(false);
    }
  };

  const buildDefaultSnapshotNote = () =>
    t("plugin.snapshotDefaultNote", {
      defaultValue: "Manual snapshot {{timestamp}}",
      timestamp: new Date().toLocaleString(),
    });

  const openSnapshotModal = () => {
    setSnapshotNote(buildDefaultSnapshotNote());
    setIsSnapshotModalOpen(true);
  };

  const handleCreateSnapshot = async () => {
    if (isCreatingSnapshot) return;
    setIsCreatingSnapshot(true);
    try {
      await createPluginVersion(
        plugin.id,
        snapshotNote.trim() || buildDefaultSnapshotNote(),
      );
      setIsSnapshotModalOpen(false);
      showToast(
        t("plugin.snapshotCreated", "Version snapshot created"),
        "success",
      );
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : t("plugin.createSnapshotFailed", "Failed to create snapshot"),
        "error",
      );
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  const saveUserNotes = async () => {
    if (userNotesSaveInFlightRef.current) return;
    userNotesSaveInFlightRef.current = true;
    setIsSavingUserNotes(true);
    try {
      await updatePluginMetadata(plugin.id, { userNotes: draftUserNotes });
      setIsEditingUserNotes(false);
      showToast(t("plugin.userNotesSaved", "Notes saved"), "success");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    } finally {
      userNotesSaveInFlightRef.current = false;
      setIsSavingUserNotes(false);
    }
  };

  const cancelUserNotes = () => {
    setDraftUserNotes(plugin.userNotes ?? "");
    setIsEditingUserNotes(false);
  };

  const handleContentScroll = () => {
    const scrollTop = contentScrollRef.current?.scrollTop ?? 0;
    setShowBackToTop(scrollTop > 480);
  };

  const scrollToTop = () => {
    contentScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const runPackageCheck = async () => {
    if (isCheckingPackage) return;
    setIsCheckingPackage(true);
    try {
      const check = await checkInstalledPluginPackage(plugin.id);
      if (check.status === "ok") {
        showToast(
          t("plugin.packageCheckSuccess", "Package check passed"),
          "success",
        );
      } else {
        showToast(
          t(
            "plugin.packageCheckIssue",
            "Plugin package needs review. See package check details.",
          ),
          "error",
        );
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    } finally {
      setIsCheckingPackage(false);
    }
  };

  const runSafetyAssessment = () => {
    if (safetyScanInFlightRef.current) {
      return safetyScanInFlightRef.current;
    }

    const aiConfig = getSafetyScanAIConfig(aiModels);
    if (!aiConfig) {
      showToast(
        t(
          "plugin.configureAiForSafety",
          "Please configure an AI model in settings first",
        ),
        "error",
      );
      return Promise.resolve(null);
    }

    const scanPromise = (async () => {
      setIsScanningSafety(true);
      try {
        const report = await window.api.skill.scanSafety({
          name: plugin.displayName || plugin.name,
          content: buildPluginSafetyScanContent(plugin, localPackagePath),
          sourceUrl: getPluginSafetySourceUrl(plugin),
          localRepoPath: localPackagePath || undefined,
          aiConfig,
        });
        const scoredReport: SkillSafetyReport = {
          ...report,
          score: report.score ?? computePluginSafetyScore(report),
        };
        await updatePluginMetadata(plugin.id, { safetyReport: scoredReport });
        showToast(
          t("plugin.safetyScanSuccess", "Safety assessment complete"),
          "success",
        );
        return scoredReport;
      } catch (error) {
        showToast(formatSkillSafetyScanError(error, t), "error");
        return null;
      } finally {
        setIsScanningSafety(false);
        safetyScanInFlightRef.current = null;
      }
    })();

    safetyScanInFlightRef.current = scanPromise;
    return scanPromise;
  };

  return (
    <div
      data-testid="plugin-full-detail-page"
      className="relative flex h-full min-h-0 flex-col overflow-hidden app-wallpaper-section"
    >
      <header className="shrink-0 border-b border-border app-wallpaper-panel-strong px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <button
              type="button"
              onClick={() => requestLeaveFileEditing(onBack)}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={t("common.back", "Back")}
              title={t("common.back", "Back")}
            >
              <ArrowLeftIcon aria-hidden="true" className="h-5 w-5" />
            </button>
            <PluginDetailAvatar plugin={plugin} />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold text-foreground">
                <button
                  type="button"
                  onClick={() => void copyPluginTitle()}
                  className="block max-w-full cursor-default truncate rounded-md text-left transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  title={t("plugin.copyTitle", {
                    defaultValue: "Copy title: {{name}}",
                    name: plugin.displayName,
                  })}
                  aria-label={t("plugin.copyTitle", {
                    defaultValue: "Copy title: {{name}}",
                    name: plugin.displayName,
                  })}
                >
                  {plugin.displayName}
                </button>
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-600 dark:text-emerald-300">
                  {isAgentDetail
                    ? t("plugin.inAgentPluginTarget", "Installed in Agent")
                    : t("plugin.installed", "Installed")}
                </span>
                {plugin.version ? (
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
                    v{plugin.version}
                  </span>
                ) : null}
                {agentContext ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 font-medium text-muted-foreground">
                    <span aria-hidden="true">
                      <PlatformIcon
                        platformId={getPluginTargetPlatformId(
                          agentContext.platformId,
                        )}
                        size={14}
                      />
                    </span>
                    {agentContext.platformName}
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
            {isAgentDetail && agentContext ? (
              <AgentPluginDetailActions
                isImporting={agentActions?.isImporting}
                isManaged={agentContext.isManaged}
                onImport={agentActions?.onImport}
                onOpenFolder={agentActions?.onOpenFolder}
                onOpenManagedPlugin={agentActions?.onOpenManagedPlugin}
                t={t}
              />
            ) : (
              <>
                <button
                  type="button"
                  onClick={openSnapshotModal}
                  disabled={isCreatingSnapshot}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={t("plugin.createSnapshot", "Create Snapshot")}
                  title={t("plugin.createSnapshot", "Create Snapshot")}
                >
                  {isCreatingSnapshot ? (
                    <Loader2Icon
                      aria-hidden="true"
                      className="h-4 w-4 animate-spin"
                    />
                  ) : (
                    <SaveIcon aria-hidden="true" className="h-4 w-4" />
                  )}
                  {t("plugin.snapshot", "Snapshot")}
                </button>
                <button
                  type="button"
                  onClick={() => void onToggleFavorite?.(plugin)}
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background transition-colors ${
                    plugin.isFavorite
                      ? "text-amber-500 hover:bg-amber-500/10"
                      : "text-muted-foreground hover:bg-amber-500/10 hover:text-amber-500"
                  }`}
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
                  onClick={() => setIsVersionHistoryOpen(true)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  aria-label={t("plugin.versionHistory", "Version History")}
                  title={t("plugin.versionHistory", "Version History")}
                >
                  <HistoryIcon aria-hidden="true" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void checkSourceUpdate(true)}
                  disabled={isCheckingUpdate || isUpdatingFromSource}
                  className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${sourceUpdateTone}`}
                  aria-label={sourceUpdateLabel}
                  title={sourceUpdateLabel}
                >
                  {isCheckingUpdate ? (
                    <Loader2Icon
                      aria-hidden="true"
                      className="h-4 w-4 animate-spin"
                    />
                  ) : sourceUpdateCheck?.status === "conflict" ||
                    sourceUpdateCheck?.status === "local-modified" ? (
                    <AlertTriangleIcon
                      aria-hidden="true"
                      className="h-4 w-4"
                    />
                  ) : (
                    <RefreshCwIcon aria-hidden="true" className="h-4 w-4" />
                  )}
                  {sourceUpdateLabel}
                </button>
                {canUpdateFromSource ? (
                  <button
                    type="button"
                    onClick={() => void updateFromSource(false)}
                    disabled={isUpdatingFromSource}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                    aria-label={t(
                      "plugin.updateFromSource",
                      "Update from source",
                    )}
                    title={t("plugin.updateFromSource", "Update from source")}
                  >
                    {isUpdatingFromSource ? (
                      <Loader2Icon
                        aria-hidden="true"
                        className="h-4 w-4 animate-spin"
                      />
                    ) : (
                      <RefreshCwIcon aria-hidden="true" className="h-4 w-4" />
                    )}
                    {t("plugin.updateFromSource", "Update from source")}
                  </button>
                ) : null}
                {canOverwriteSourceUpdate ? (
                  <button
                    type="button"
                    onClick={() => void updateFromSource(true)}
                    disabled={isUpdatingFromSource}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-300"
                    aria-label={t(
                      "plugin.overwriteFromSource",
                      "Overwrite from source",
                    )}
                    title={t(
                      "plugin.overwriteFromSource",
                      "Overwrite from source",
                    )}
                  >
                    {isUpdatingFromSource ? (
                      <Loader2Icon
                        aria-hidden="true"
                        className="h-4 w-4 animate-spin"
                      />
                    ) : (
                      <AlertTriangleIcon
                        aria-hidden="true"
                        className="h-4 w-4"
                      />
                    )}
                    {t("plugin.overwriteFromSource", "Overwrite from source")}
                  </button>
                ) : null}
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
                  aria-label={t(
                    "plugin.copyLocalPackagePath",
                    "Copy Plugin path",
                  )}
                  title={t("plugin.copyLocalPackagePath", "Copy Plugin path")}
                >
                  <CopyIcon aria-hidden="true" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void openLocalPackage()}
                  disabled={!localPackagePath}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                  aria-label={t(
                    "plugin.openPluginFolder",
                    "Open Plugin folder",
                  )}
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
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex shrink-0 items-center gap-6 border-b border-border bg-accent/20 px-6">
        <DetailTabButton
          active={activeTab === "overview"}
          icon={<InfoIcon aria-hidden="true" className="h-4 w-4" />}
          onClick={() =>
            requestLeaveFileEditing(() => setActiveTab("overview"))
          }
        >
          {t("common.preview", "Preview")}
        </DetailTabButton>
        <DetailTabButton
          active={activeTab === "source"}
          icon={<CodeIcon aria-hidden="true" className="h-4 w-4" />}
          onClick={() => requestLeaveFileEditing(() => setActiveTab("source"))}
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
        ref={contentScrollRef}
        onScroll={handleContentScroll}
        className={`flex min-h-0 flex-1 flex-col ${
          activeTab === "files" ? "overflow-hidden" : "overflow-y-auto p-6"
        }`}
      >
        {activeTab === "overview" ? (
          <PluginOverview
            agentActions={agentActions}
            agentContext={agentContext}
            descriptionText={
              showTranslatedDescription && translatedDescription
                ? translatedDescription
                : descriptionSourceText
            }
            draftUserNotes={draftUserNotes}
            hasTranslatedDescription={Boolean(translatedDescription)}
            isEditingUserNotes={isEditingUserNotes}
            isCheckingPackage={isCheckingPackage}
            isImportingChildMcp={isImportingChildMcp}
            isImportingChildSkills={isImportingChildSkills}
            isScanningSafety={isScanningSafety}
            isSavingUserNotes={isSavingUserNotes}
            isShowingTranslatedDescription={showTranslatedDescription}
            isTranslatingDescription={isTranslatingDescription}
            localPackagePath={localPackagePath}
            onCancelUserNotes={cancelUserNotes}
            onDistribute={onDistribute}
            onRemoveDistribution={onRemoveDistribution}
            onImportChildMcp={onImportChildMcp}
            onImportChildSkills={onImportChildSkills}
            onRunPackageCheck={runPackageCheck}
            onRunSafetyAssessment={runSafetyAssessment}
            onSaveUserNotes={saveUserNotes}
            onStartEditUserNotes={() => setIsEditingUserNotes(true)}
            onTranslateDescription={translatePluginDescription}
            onUserNotesChange={setDraftUserNotes}
            packageHealthCheck={packageHealthCheck}
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
            onUnsavedChange={setFileEditorHasUnsavedChanges}
            plugin={plugin}
            readOnly={isAgentDetail}
          />
        )}
      </main>
      {showBackToTop && activeTab !== "files" ? (
        <button
          type="button"
          onClick={scrollToTop}
          className="absolute bottom-6 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-border app-wallpaper-surface px-4 py-2 text-sm font-medium text-foreground shadow-lg transition-all duration-base hover:-translate-x-1/2 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-accent hover:text-primary hover:shadow-xl"
        >
          <ArrowUpIcon className="h-4 w-4" aria-hidden="true" />
          {t("common.backToTop", "Back to Top")}
        </button>
      ) : null}
      <UnsavedChangesDialog
        isOpen={isUnsavedDialogOpen}
        onClose={() => {
          setIsUnsavedDialogOpen(false);
          setPendingUnsavedAction(null);
        }}
        onSave={() => {
          setIsUnsavedDialogOpen(false);
          setPendingUnsavedAction(null);
        }}
        onDiscard={() => {
          setIsUnsavedDialogOpen(false);
          pendingUnsavedAction?.();
          setPendingUnsavedAction(null);
        }}
      />
      <PluginVersionHistoryModal
        isOpen={isVersionHistoryOpen}
        onClose={() => setIsVersionHistoryOpen(false)}
        plugin={plugin}
      />
      <Modal
        isOpen={isSnapshotModalOpen}
        onClose={() => {
          if (!isCreatingSnapshot) setIsSnapshotModalOpen(false);
        }}
        title={t("plugin.createSnapshot", "Create Snapshot")}
        size="md"
      >
        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">
              {t("plugin.snapshotNote", "Snapshot note")}
            </span>
            <Textarea
              value={snapshotNote}
              onChange={(event) => setSnapshotNote(event.target.value)}
              disabled={isCreatingSnapshot}
              rows={4}
              aria-label={t("plugin.snapshotNote", "Snapshot note")}
              placeholder={t(
                "plugin.snapshotNotePlaceholder",
                "Describe what changed in this Plugin package.",
              )}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsSnapshotModalOpen(false)}
              disabled={isCreatingSnapshot}
              className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("common.cancel", "Cancel")}
            </button>
            <button
              type="button"
              onClick={() => void handleCreateSnapshot()}
              disabled={isCreatingSnapshot}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              {isCreatingSnapshot ? (
                <Loader2Icon
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin"
                />
              ) : (
                <SaveIcon aria-hidden="true" className="h-4 w-4" />
              )}
              {t("plugin.createSnapshot", "Create Snapshot")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
