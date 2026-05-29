import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRightIcon,
  CheckSquareIcon,
  Loader2Icon,
  RefreshCwIcon,
  SendIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import type { Skill } from "@prompthub/shared/types";
import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
import { useToast } from "../ui/Toast";
import { PlatformIcon } from "../ui/PlatformIcon";
import { useSettingsStore } from "../../stores/settings.store";
import { filterDetectedPlatforms } from "../../services/platform-visibility";
import {
  syncSkillsToPlatforms,
  type SkillInstallMode,
  unsyncSkillsFromPlatforms,
} from "../../services/skill-platform-sync";

interface SkillBatchDeployDialogProps {
  skills: Skill[];
  onClose: () => void;
  onComplete?: () => Promise<void> | void;
}

export function SkillBatchDeployDialog({
  skills,
  onClose,
  onComplete,
}: SkillBatchDeployDialogProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const skillNameById = useMemo(
    () => new Map(skills.map((skill) => [skill.id, skill.name])),
    [skills],
  );
  const [actionMode, setActionMode] = useState<"deploy" | "undeploy">("deploy");
  const skillInstallMethod = useSettingsStore(
    (state) => state.skillInstallMethod,
  );
  const disabledPlatformIds = useSettingsStore(
    (state) => state.disabledPlatformIds,
  );
  const [installMode, setInstallMode] =
    useState<SkillInstallMode>(skillInstallMethod);
  const [supportedPlatforms, setSupportedPlatforms] = useState<SkillPlatform[]>(
    [],
  );
  const [detectedPlatforms, setDetectedPlatforms] = useState<string[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(
    new Set(),
  );
  const [loadingPlatforms, setLoadingPlatforms] = useState(true);
  const [isDeploying, setIsDeploying] = useState(false);
  const [lastFailures, setLastFailures] = useState<
    Array<{ skillId: string; platformId: string; reason: string }>
  >([]);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    skillId: string;
    platformId: string;
  } | null>(null);

  const availablePlatforms = useMemo(
    () =>
      filterDetectedPlatforms(
        supportedPlatforms,
        detectedPlatforms,
        disabledPlatformIds,
      ),
    [detectedPlatforms, disabledPlatformIds, supportedPlatforms],
  );
  const totalTargets = skills.length * selectedPlatforms.size;

  useEffect(() => {
    if (availablePlatforms.length === 0) return;

    setSelectedPlatforms((previous) => {
      if (previous.size > 0) {
        return previous;
      }
      return new Set(availablePlatforms.map((platform) => platform.id));
    });
  }, [availablePlatforms]);

  useEffect(() => {
    let cancelled = false;

    async function loadPlatforms() {
      setLoadingPlatforms(true);
      try {
        const [platforms, detected] = await Promise.all([
          window.api.skill.getSupportedPlatforms(),
          window.api.skill.detectPlatforms(),
        ]);
        if (cancelled) {
          return;
        }
        setSupportedPlatforms(platforms);
        setDetectedPlatforms(detected);
      } catch (error) {
        console.error("Failed to load skill platforms:", error);
      } finally {
        if (!cancelled) {
          setLoadingPlatforms(false);
        }
      }
    }

    void loadPlatforms();

    return () => {
      cancelled = true;
    };
  }, []);

  const togglePlatform = (platformId: string) => {
    setSelectedPlatforms((previous) => {
      const next = new Set(previous);
      if (next.has(platformId)) {
        next.delete(platformId);
      } else {
        next.add(platformId);
      }
      return next;
    });
  };

  const handleToggleAll = () => {
    if (selectedPlatforms.size === availablePlatforms.length) {
      setSelectedPlatforms(new Set());
      return;
    }
    setSelectedPlatforms(
      new Set(availablePlatforms.map((platform) => platform.id)),
    );
  };

  const handleDeploy = async () => {
    if (skills.length === 0 || selectedPlatforms.size === 0) {
      return;
    }

    setIsDeploying(true);
    setLastFailures([]);
    try {
      const result =
        actionMode === "deploy"
          ? await syncSkillsToPlatforms(
              skills,
              Array.from(selectedPlatforms),
              installMode,
              setProgress,
            )
          : await unsyncSkillsFromPlatforms(
              skills,
              Array.from(selectedPlatforms),
              setProgress,
            );
      await onComplete?.();
      setLastFailures(result.failures);

      if (result.successCount > 0) {
        showToast(
          t(
            actionMode === "deploy"
              ? "skill.batchDeploySummary"
              : "skill.batchUndeploySummary",
            {
              success: result.successCount,
              total: result.totalCount,
              defaultValue:
                actionMode === "deploy"
                  ? `Synced ${result.successCount}/${result.totalCount} targets`
                  : `Uninstalled ${result.successCount}/${result.totalCount} targets`,
            },
          ),
          result.failures.length === 0 ? "success" : "warning",
        );
      }

      if (result.fallbacks.length > 0) {
        const preview = result.fallbacks
          .slice(0, 2)
          .map((item) => {
            const skillName = skillNameById.get(item.skillId) ?? item.skillId;
            return `${skillName} -> ${item.platformId}`;
          })
          .join(", ");
        showToast(
          t("skill.batchDeployFallback", {
            count: result.fallbacks.length,
            preview,
            defaultValue:
              `${result.fallbacks.length} target(s) used copy install because symlinks were unavailable: ${preview}`,
          }),
          "warning",
        );
      }

      if (result.failures.length > 0) {
        const preview = result.failures
          .slice(0, 2)
          .map((item) => {
            const skillName = skillNameById.get(item.skillId) ?? item.skillId;
            return `${skillName} -> ${item.platformId}`;
          })
          .join(", ");
        showToast(
          t("skill.batchDeployFailed", {
            count: result.failures.length,
            preview,
            defaultValue: `${result.failures.length} target(s) failed to sync: ${preview}`,
          }),
          "error",
        );
      } else {
        onClose();
      }
    } catch (error) {
      console.error("Failed to batch deploy skills:", error);
      showToast(
        `${t("skill.updateFailed", "Update failed")}: ${String(error)}`,
        "error",
      );
    } finally {
      setIsDeploying(false);
      setProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-border app-wallpaper-panel-strong shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <SendIcon className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">
                {t("skill.batchDeploy", "Batch Deploy")}
              </h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("skill.batchDeployHint", {
                count: skills.length,
                defaultValue: `Deploy ${skills.length} skill(s) to selected platforms.`,
              })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          <div className="space-y-4">
            <section className="rounded-2xl border border-border bg-background/60 p-4">
              <h3 className="text-sm font-semibold">
                {t("skill.batchAction", "Action Mode")}
              </h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["deploy", t("skill.batchDeploy", "Batch Deploy")],
                    [
                      "undeploy",
                      t(
                        "skill.batchUndeploy",
                        "Batch Uninstall from Platforms",
                      ),
                    ],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setActionMode(mode)}
                    className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                      actionMode === mode
                        ? "border-primary/40 bg-primary/5 text-primary"
                        : "border-border app-wallpaper-surface hover:border-primary/25"
                    }`}
                  >
                    <div className="text-sm font-medium">{label}</div>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-background/60 p-4">
              <h3 className="text-sm font-semibold">
                {actionMode === "deploy"
                  ? t("skill.installMethod", "Install Method")
                  : t("skill.operation", "Operation")}
              </h3>
              {actionMode === "deploy" ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {(["copy", "symlink"] as SkillInstallMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setInstallMode(mode)}
                      className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                        installMode === mode
                          ? "border-primary/40 bg-primary/5"
                          : "border-border app-wallpaper-surface hover:border-primary/25"
                      }`}
                    >
                      <div className="text-sm font-medium">
                        {mode === "symlink"
                          ? t("skill.symlink", "Symlink")
                          : t("skill.copyMode", "Copy")}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {mode === "symlink"
                          ? t(
                              "skill.symlinkHint",
                              "Creates a symlink in the platform directory — lighter updates going forward.",
                            )
                          : t(
                              "skill.copyHint",
                              "Copies SKILL.md to the platform directory — more compatible.",
                            )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-border app-wallpaper-surface px-4 py-3 text-sm text-muted-foreground">
                  {t(
                    "skill.batchUndeployHint",
                    "Removes corresponding skills from selected platform directories. Your local PromptHub repo is not affected.",
                  )}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-background/60 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {t("skill.targetPlatforms", "Target Platforms")}
                </h3>
                <div className="flex flex-wrap items-center gap-3">
                  {availablePlatforms.length > 0 ? (
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                      {t("skill.selectedPlatforms", {
                        count: selectedPlatforms.size,
                        defaultValue: `${selectedPlatforms.size} selected`,
                      })}
                    </span>
                  ) : null}
                  {availablePlatforms.length > 0 ? (
                    <button
                      onClick={handleToggleAll}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      {selectedPlatforms.size === availablePlatforms.length
                        ? t("skill.deselectAll", "Deselect All")
                        : t("skill.selectAll", "Select All")}
                    </button>
                  ) : null}
                </div>
              </div>

              {loadingPlatforms ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                  {t("common.loading", "Loading...")}
                </div>
              ) : availablePlatforms.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  {t(
                    "skill.noDetectedPlatforms",
                    "No syncable platform directories detected.",
                  )}
                </div>
              ) : (
                <>
                  <div className="mb-3 rounded-2xl border border-primary/15 bg-primary/[0.04] px-4 py-3 text-xs leading-6 text-muted-foreground">
                    {actionMode === "deploy"
                      ? t(
                          "skill.batchDeployDefaultsHint",
                          "Detected platforms are selected by default. Confirm the targets before starting batch sync.",
                        )
                      : t(
                          "skill.batchUndeployDefaultsHint",
                          "This only removes PromptHub-distributed skills from selected platforms. Your local repo remains untouched.",
                        )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {availablePlatforms.map((platform) => {
                      const isSelected = selectedPlatforms.has(platform.id);
                      return (
                        <button
                          key={platform.id}
                          type="button"
                          onClick={() => togglePlatform(platform.id)}
                          className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
                            isSelected
                              ? "border-primary/40 bg-primary/5 shadow-sm shadow-primary/10"
                              : "border-border app-wallpaper-surface hover:border-primary/25"
                          }`}
                        >
                          <div className="rounded-xl bg-accent p-2">
                            <PlatformIcon platformId={platform.id} size={20} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium">
                              {platform.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {platform.id}
                            </div>
                          </div>
                          {isSelected ? (
                            <CheckSquareIcon className="h-4 w-4 text-primary" />
                          ) : (
                            <SquareIcon className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-background/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  {t("skill.selectedSkills", "Selected Skills")}
                </h3>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  {skills.length}
                </span>
              </div>
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {skills.map((skill) => (
                  <div
                    key={skill.id}
                    className="flex items-center justify-between rounded-xl border border-border app-wallpaper-surface px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {skill.name}
                      </div>
                      {skill.description ? (
                        <div className="truncate text-xs text-muted-foreground">
                          {skill.description}
                        </div>
                      ) : null}
                    </div>
                    {skill.version ? (
                      <span className="ml-3 shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                        v{skill.version}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-background/60 p-4">
              <h3 className="text-sm font-semibold">
                {t("skill.syncSummary", "Sync Summary")}
              </h3>
              <div className="mt-4 grid gap-2 grid-cols-3">
                <div className="rounded-xl border border-border app-wallpaper-surface px-3 py-2">
                  <div className="text-[10px] font-medium uppercase tracking-wide leading-tight text-muted-foreground">
                    {t("skill.selectedSkills", "Selected Skills")}
                  </div>
                  <div className="mt-1 text-xl font-semibold text-foreground">
                    {skills.length}
                  </div>
                </div>
                <div className="rounded-xl border border-border app-wallpaper-surface px-3 py-2">
                  <div className="text-[10px] font-medium uppercase tracking-wide leading-tight text-muted-foreground">
                    {t("skill.targetPlatforms", "Target Platforms")}
                  </div>
                  <div className="mt-1 text-xl font-semibold text-foreground">
                    {selectedPlatforms.size}
                  </div>
                </div>
                <div className="rounded-xl border border-border app-wallpaper-surface px-3 py-2">
                  <div className="text-[10px] font-medium uppercase tracking-wide leading-tight text-muted-foreground">
                    {t("skill.totalTargets", "Total Targets")}
                  </div>
                  <div className="mt-1 text-xl font-semibold text-foreground">
                    {totalTargets}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-border app-wallpaper-surface px-4 py-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("skill.executionPlan", "Execution Plan")}
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm text-foreground">
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    {actionMode === "deploy"
                      ? t("skill.batchDeploy", "Batch Deploy")
                      : t(
                          "skill.batchUndeploy",
                          "Batch Uninstall from Platforms",
                        )}
                  </span>
                  <ArrowRightIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">
                    {selectedPlatforms.size > 0
                      ? availablePlatforms
                          .filter((platform) =>
                            selectedPlatforms.has(platform.id),
                          )
                          .map((platform) => platform.name)
                          .join(", ")
                      : t("skill.noPlatformSelected", "No platform selected")}
                  </span>
                </div>
              </div>

              {progress ? (
                <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <RefreshCwIcon className="h-4 w-4 animate-spin text-primary" />
                    {t("skill.syncingProgress", {
                      current: progress.current,
                      total: progress.total,
                      defaultValue: `Syncing ${progress.current}/${progress.total}...`,
                    })}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {skillNameById.get(progress.skillId) ?? progress.skillId} {"->"} {progress.platformId}
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-primary/10">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${Math.max(
                          6,
                          Math.round((progress.current / progress.total) * 100),
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ) : null}

              {lastFailures.length > 0 ? (
                <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-3">
                  <div className="text-sm font-medium text-foreground">
                    {t("skill.batchDeployFailureList", "Failed Targets")}
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {lastFailures.slice(0, 6).map((failure) => (
                      <div key={`${failure.skillId}-${failure.platformId}`}>
                        {skillNameById.get(failure.skillId) ?? failure.skillId} {"->"} {failure.platformId}:{" "}
                        {failure.reason}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            disabled={isDeploying}
            className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            onClick={handleDeploy}
            disabled={
              isDeploying ||
              loadingPlatforms ||
              selectedPlatforms.size === 0 ||
              availablePlatforms.length === 0
            }
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDeploying ? (
              <>
                <Loader2Icon className="h-4 w-4 animate-spin" />
                {t("skill.syncing", "Syncing")}
              </>
            ) : (
              <>
                <SendIcon className="h-4 w-4" />
                {actionMode === "deploy"
                  ? t("skill.batchDeploy", "Batch Deploy")
                  : t("skill.batchUndeploy", "Batch Uninstall from Platforms")}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
