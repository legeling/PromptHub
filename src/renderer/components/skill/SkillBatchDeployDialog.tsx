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
import type { Skill } from "../../../shared/types";
import type { SkillPlatform } from "../../../shared/constants/platforms";
import { useToast } from "../ui/Toast";
import { PlatformIcon } from "../ui/PlatformIcon";
import { useSettingsStore } from "../../stores/settings.store";
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
  const [actionMode, setActionMode] = useState<"deploy" | "undeploy">("deploy");
  const skillInstallMethod = useSettingsStore(
    (state) => state.skillInstallMethod,
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
    Array<{ skillName: string; platformId: string; reason: string }>
  >([]);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    skillName: string;
    platformId: string;
  } | null>(null);

  const availablePlatforms = useMemo(
    () =>
      supportedPlatforms.filter((platform) =>
        detectedPlatforms.includes(platform.id),
      ),
    [detectedPlatforms, supportedPlatforms],
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
                  ? `已同步 ${result.successCount}/${result.totalCount} 个目标`
                  : `已卸载 ${result.successCount}/${result.totalCount} 个目标`,
            },
          ),
          result.failures.length === 0 ? "success" : "warning",
        );
      }

      if (result.failures.length > 0) {
        const preview = result.failures
          .slice(0, 2)
          .map((item) => `${item.skillName} -> ${item.platformId}`)
          .join(", ");
        showToast(
          t("skill.batchDeployFailed", {
            count: result.failures.length,
            preview,
            defaultValue: `${result.failures.length} 个目标同步失败: ${preview}`,
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
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <SendIcon className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">
                {t("skill.batchDeploy", "批量同步到平台")}
              </h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("skill.batchDeployHint", {
                count: skills.length,
                defaultValue: `将选中的 ${skills.length} 个 skill 一次同步到多个平台。`,
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
                {t("skill.batchAction", "操作模式")}
              </h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["deploy", t("skill.batchDeploy", "批量同步到平台")],
                    ["undeploy", t("skill.batchUndeploy", "批量从平台卸载")],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setActionMode(mode)}
                    className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                      actionMode === mode
                        ? "border-primary/40 bg-primary/5 text-primary"
                        : "border-border bg-card hover:border-primary/25"
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
                  ? t("skill.installMethod", "安装方式")
                  : t("skill.operation", "操作")}
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
                          : "border-border bg-card hover:border-primary/25"
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
                              "平台目录保留软链接，后续更新更轻量。",
                            )
                          : t(
                              "skill.copyHint",
                              "复制一份 SKILL.md 到平台目录，兼容性更稳。",
                            )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                  {t(
                    "skill.batchUndeployHint",
                    "会从所选平台目录移除对应 skill，不影响 PromptHub 本地仓库。",
                  )}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-background/60 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {t("skill.targetPlatforms", "目标平台")}
                </h3>
                <div className="flex flex-wrap items-center gap-3">
                  {availablePlatforms.length > 0 ? (
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                      {t("skill.selectedPlatforms", {
                        count: selectedPlatforms.size,
                        defaultValue: `已选 ${selectedPlatforms.size}`,
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
                  {t("common.loading", "加载中")}
                </div>
              ) : availablePlatforms.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  {t(
                    "skill.noDetectedPlatforms",
                    "当前没有检测到可同步的平台目录。",
                  )}
                </div>
              ) : (
                <>
                  <div className="mb-3 rounded-2xl border border-primary/15 bg-primary/[0.04] px-4 py-3 text-xs leading-6 text-muted-foreground">
                    {actionMode === "deploy"
                      ? t(
                          "skill.batchDeployDefaultsHint",
                          "默认已选中当前检测到的平台。建议先确认平台目录，再开始批量同步。",
                        )
                      : t(
                          "skill.batchUndeployDefaultsHint",
                          "仅会移除 PromptHub 分发出去的 skill，不会删除本地仓库中的原始文件。",
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
                              : "border-border bg-card hover:border-primary/25"
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
                  {t("skill.selectedSkills", "已选技能")}
                </h3>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  {skills.length}
                </span>
              </div>
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {skills.map((skill) => (
                  <div
                    key={skill.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2"
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
                {t("skill.syncSummary", "同步摘要")}
              </h3>
              <div className="mt-4 grid gap-2 grid-cols-3">
                <div className="rounded-xl border border-border bg-card px-3 py-2">
                  <div className="text-[10px] font-medium uppercase tracking-wide leading-tight text-muted-foreground">
                    {t("skill.selectedSkills", "已选技能")}
                  </div>
                  <div className="mt-1 text-xl font-semibold text-foreground">
                    {skills.length}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card px-3 py-2">
                  <div className="text-[10px] font-medium uppercase tracking-wide leading-tight text-muted-foreground">
                    {t("skill.targetPlatforms", "目标平台")}
                  </div>
                  <div className="mt-1 text-xl font-semibold text-foreground">
                    {selectedPlatforms.size}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card px-3 py-2">
                  <div className="text-[10px] font-medium uppercase tracking-wide leading-tight text-muted-foreground">
                    {t("skill.totalTargets", "总目标数")}
                  </div>
                  <div className="mt-1 text-xl font-semibold text-foreground">
                    {totalTargets}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-border bg-card px-4 py-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("skill.executionPlan", "执行计划")}
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm text-foreground">
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    {actionMode === "deploy"
                      ? t("skill.batchDeploy", "批量同步到平台")
                      : t("skill.batchUndeploy", "批量从平台卸载")}
                  </span>
                  <ArrowRightIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">
                    {selectedPlatforms.size > 0
                      ? availablePlatforms
                          .filter((platform) => selectedPlatforms.has(platform.id))
                          .map((platform) => platform.name)
                          .join(", ")
                      : t("skill.noPlatformSelected", "尚未选择平台")}
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
                      defaultValue: `正在同步 ${progress.current}/${progress.total}`,
                    })}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {progress.skillName} {"->"} {progress.platformId}
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
                    {t("skill.batchDeployFailureList", "未完成的目标")}
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {lastFailures.slice(0, 6).map((failure) => (
                      <div key={`${failure.skillName}-${failure.platformId}`}>
                        {failure.skillName} {"->"} {failure.platformId}:{" "}
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
            {t("common.cancel", "取消")}
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
                {t("skill.syncing", "同步中")}
              </>
            ) : (
              <>
                <SendIcon className="h-4 w-4" />
                {actionMode === "deploy"
                  ? t("skill.batchDeploy", "批量同步到平台")
                  : t("skill.batchUndeploy", "批量从平台卸载")}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
