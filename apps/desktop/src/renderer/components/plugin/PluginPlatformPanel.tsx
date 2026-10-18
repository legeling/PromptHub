import { usePluginStore } from "../../stores/plugin.store";
import { useEffect, useMemo, useState } from "react";
import {
  CheckIcon,
  CheckSquareIcon,
  CopyPlusIcon,
  LinkIcon,
  Loader2Icon,
  SendIcon,
  SquareIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  PluginDistributeMode,
  PluginLibraryEntry,
  PluginTargetCompatibility,
} from "@prompthub/shared/types/plugin";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { PlatformIcon } from "../ui/PlatformIcon";
import { SharedPluginTargetCard } from "./SharedPluginTargetCard";
import { useToast } from "../ui/Toast";
import {
  getPluginTargetDescription,
  getPluginTargetMatrixForEntry,
  getPluginTargetPlatformId,
} from "./plugin-detail-utils";

export function PluginPlatformPanel({
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
  const observations = usePluginStore(
    (state) => state.distributionSnapshot[plugin.id],
  );
  const refreshStatus = usePluginStore(
    (state) => state.refreshDistributionStatus,
  );
  useEffect(() => {
    void refreshStatus(plugin.id);
  }, [plugin.id, refreshStatus]);
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
    () =>
      new Set(
        observations
          ? Object.entries(observations)
              .filter(([, value]) => value.installed)
              .map(([id]) => id)
          : (plugin.distributedTargetIds ?? []),
      ),
    [plugin.distributedTargetIds, observations],
  );
  const effectiveTargetMatrix = useMemo(
    () => getPluginTargetMatrixForEntry(targetMatrix, plugin),
    [plugin, targetMatrix],
  );
  const supportedTargets = useMemo(
    () => effectiveTargetMatrix.filter((target) => target.enabled),
    [effectiveTargetMatrix],
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
      (current) =>
        new Set([...current, ...selectableAgents.map((target) => target.id)]),
    );
  };

  const deselectAllTargets = () => {
    setSelectedTargetIds(
      (current) => new Set([...current].filter((id) => id === "shared-agents")),
    );
  };

  const sharedTarget = effectiveTargetMatrix.find(
    (target) => target.id === "shared-agents",
  );
  const selectableAgents = undistributedTargets.filter(
    (target) => target.id !== "shared-agents",
  );
  const selectedAll =
    selectableAgents.length > 0 &&
    selectableAgents.every((target) => selectedTargetIds.has(target.id));

  const distributeToSelectedTargets = async (redistribute = false) => {
    const targets = redistribute
      ? supportedTargets
          .filter((target) => distributedTargetIds.has(target.id))
          .map((target) => target.id)
      : [...selectedTargetIds];
    if (!localPackagePath || targets.length === 0 || isDistributing) {
      return;
    }
    setIsDistributing(true);
    try {
      await onDistribute(targets, installMode);
      showToast(
        t("plugin.distributionSuccess", {
          count: targets.length,
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
                  : t("skill.distribution.applyChanges")}
              </button>
            </div>
          ) : null}

          {distributedTargetIds.size > 0 && (
            <button
              type="button"
              disabled={
                isDistributing ||
                Boolean(isRemovingTargetId) ||
                selectedCount > 0
              }
              onClick={() => void distributeToSelectedTargets(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:bg-accent disabled:opacity-50"
            >
              <SendIcon aria-hidden="true" className="h-4 w-4" />
              {t("skill.distribution.redistribute")}
            </button>
          )}
          <div className="space-y-2">
            {effectiveTargetMatrix
              .filter((target) => target.id !== "shared-agents")
              .map((target) => {
                const isDistributed = distributedTargetIds.has(target.id);
                const selected =
                  !isDistributed && selectedTargetIds.has(target.id);
                const description = getPluginTargetDescription(target, t);
                const contentState = observations?.[target.id]?.contentState;
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
                        <div className="flex min-w-0 items-center gap-2">
                          <h4 className="truncate text-sm font-medium text-foreground">
                            {target.displayName}
                          </h4>
                          {target.status === "native" ? (
                            <span className="shrink-0 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 dark:text-emerald-300">
                              {t("plugin.targetStatus.native", "Native")}
                            </span>
                          ) : null}
                        </div>
                        <p className="line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
                          {isDistributed
                            ? contentState && contentState !== "synced"
                              ? t(`resourceLibrary.content.${contentState}`)
                              : t("plugin.installed", "Installed")
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
          {sharedTarget ? (
            <SharedPluginTargetCard
              selected={selectedTargetIds.has(sharedTarget.id)}
              installed={distributedTargetIds.has(sharedTarget.id)}
              busy={
                isDistributing ||
                isRemovingTargetId === sharedTarget.id ||
                !localPackagePath
              }
              onToggle={() => toggleTarget(sharedTarget)}
              onRemove={
                onRemoveDistribution
                  ? () =>
                      setPendingRemoveTarget({
                        ...sharedTarget,
                        displayName: t("plugin.sharedDirectory"),
                      })
                  : undefined
              }
            />
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
