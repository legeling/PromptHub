import { ResourceLibraryItem } from "../resources/ResourceLibraryItem";
import { useMemo, useState, type MouseEvent } from "react";
import {
  CheckIcon,
  FolderOpenIcon,
  Loader2Icon,
  SendIcon,
  StarIcon,
  TagsIcon,
  TrashIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  PluginLibraryEntry,
  PluginSourceUpdateCheck,
  PluginTargetCompatibility,
} from "@prompthub/shared/types/plugin";
import { CardStatusBadge } from "../ui/CardStatusBadge";
import { Modal } from "../ui/Modal";
import { PlatformIcon } from "../ui/PlatformIcon";
import {
  type PluginBatchTagMode,
  PluginAvatar,
  collectPluginTagSuggestions,
  getPluginCategoryLabel,
  getPluginDisplayTags,
  getPluginLocalPackagePath,
  getPluginTrustLabel,
  getPluginUserTags,
  getTargetPlatformIconId,
  normalizePluginUserTag,
  updatePluginUserTags,
} from "./plugin-manager-utils";

export function PluginBatchTagDialog({
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

export function PluginCard({
  batchMode = false,
  isSelected = false,
  plugin,
  sourceUpdateStatus,
  distributionKnown = true,
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
  distributionKnown?: boolean;
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
  const visibleDistributedTargets = distributedTargets.slice(0, 3);
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
    <ResourceLibraryItem
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
      view="gallery"
      selected={isSelected}
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
                className="flex min-h-8 max-w-full flex-nowrap items-center justify-end gap-1.5 overflow-hidden"
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
                    {t(
                      distributionKnown
                        ? "plugin.notDistributed"
                        : "resourceLibrary.statusUnknown",
                    )}
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
    </ResourceLibraryItem>
  );
}

export function PluginListRow({
  batchMode = false,
  isSelected = false,
  plugin,
  sourceUpdateStatus,
  distributionKnown = true,
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
  distributionKnown?: boolean;
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
    <ResourceLibraryItem
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
      view="list"
      selected={isSelected}
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
              .slice(0, 3)
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
              {t(
                distributionKnown
                  ? "plugin.notDistributed"
                  : "resourceLibrary.statusUnknown",
              )}
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
    </ResourceLibraryItem>
  );
}
