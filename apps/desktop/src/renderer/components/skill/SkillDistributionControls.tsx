import { useId } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangleIcon,
  CopyPlusIcon,
  FolderIcon,
  InfoIcon,
  LayersIcon,
  LinkIcon,
  ListChecksIcon,
  Loader2Icon,
  SendIcon,
  Settings2Icon,
} from "lucide-react";
import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
import type { SkillInstallMode } from "@prompthub/shared/types";
import {
  DistributionCheck,
  SkillPlatformTargetRow,
} from "./SkillPlatformTargetRow";
import {
  isDistributionTargetSelected,
  SHARED_TARGET_ID,
  summarizeDistributionSelection,
} from "./skill-distribution-selection";

interface SkillDistributionControlsProps {
  availablePlatforms: SkillPlatform[];
  skillName: string;
  installMode: SkillInstallMode;
  setInstallMode: (mode: SkillInstallMode) => void;
  installStatus: Record<string, boolean>;
  selectedPlatforms: Set<string>;
  isBusy: boolean;
  installProgress: { current: number; total: number } | null;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onApply: () => void;
  onCancel?: () => void;
  hideFooter?: boolean;
  layout?: "grid" | "list";
}

function DistributionMode({
  mode,
  onChange,
  disabled,
}: {
  mode: SkillInstallMode;
  onChange: (mode: SkillInstallMode) => void;
  disabled: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg bg-accent/50 p-1">
        {(["copy", "symlink"] satisfies SkillInstallMode[]).map((value) => {
          const Icon = value === "copy" ? CopyPlusIcon : LinkIcon;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              disabled={disabled}
              onClick={() => onChange(value)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60 ${mode === value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
              {t(value === "copy" ? "skill.copyMode" : "skill.symlink")}
            </button>
          );
        })}
      </div>
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <InfoIcon aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t(`skill.distribution.${mode}Hint`)}
      </p>
    </div>
  );
}

function SharedDistributionTarget({
  skillName,
  selected,
  installed,
  disabled,
  onToggle,
}: {
  skillName: string;
  selected: boolean;
  installed: boolean;
  disabled: boolean;
  onToggle: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="space-y-3 border-t border-border pt-5"
    >
      <h4
        id={titleId}
        className="flex items-center gap-2 text-sm font-semibold"
      >
        <Settings2Icon aria-hidden="true" className="h-4 w-4" />
        {t("skill.distribution.advancedTargets")}
      </h4>
      <div className="rounded-xl border border-border bg-accent/20 p-3">
        <button
          type="button"
          aria-label={t("skill.distribution.sharedDirectory")}
          aria-pressed={selected}
          disabled={disabled}
          onClick={onToggle}
          className="flex w-full items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          <span className="rounded-lg bg-primary/10 p-2 text-primary">
            <FolderIcon aria-hidden="true" className="h-5 w-5" />
          </span>
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium">
              {t("skill.distribution.sharedDirectory")}
            </span>
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
              {t("skill.distribution.experimental")}
            </span>
          </span>
          <DistributionCheck checked={selected} />
        </button>
        <code className="mt-3 block break-all rounded-md bg-accent/50 px-2 py-1.5 text-[11px] text-muted-foreground">{`~/.agents/skills/${skillName}/`}</code>
        <p className="mt-3 text-xs text-foreground">
          {t("skill.distribution.sharedDescription")}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {t("skill.distribution.sharedCompatibility")}
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t("skill.distribution.sharedExcluded")}
        </p>
        {(installed || selected) && (
          <p className="mt-2 text-xs text-primary">
            {t(
              installed === selected
                ? "skill.installed"
                : selected
                  ? "skill.distribution.pendingInstall"
                  : "skill.distribution.pendingUninstall",
            )}
          </p>
        )}
      </div>
    </section>
  );
}

export function SkillDistributionControls(
  props: SkillDistributionControlsProps,
): JSX.Element {
  const { t } = useTranslation();
  const {
    availablePlatforms,
    skillName,
    installMode,
    setInstallMode,
    installStatus,
    selectedPlatforms,
    isBusy,
    installProgress,
    onToggle,
    onSelectAll,
    onApply,
    onCancel,
    hideFooter = false,
    layout = "list",
  } = props;
  const nativePlatforms = availablePlatforms.filter(
    (p) => p.id !== SHARED_TARGET_ID,
  );
  const hasShared = availablePlatforms.some((p) => p.id === SHARED_TARGET_ID);
  const summary = summarizeDistributionSelection(
    availablePlatforms,
    installStatus,
    selectedPlatforms,
  );
  return (
    <div className="space-y-5">
      <DistributionMode
        mode={installMode}
        onChange={setInstallMode}
        disabled={isBusy}
      />
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <LayersIcon aria-hidden="true" className="h-4 w-4 text-primary" />
            {t("skill.distribution.platforms")}
          </h4>
          <button
            type="button"
            disabled={isBusy || nativePlatforms.length === 0}
            onClick={onSelectAll}
            className="flex shrink-0 items-center gap-1.5 text-xs text-primary hover:underline disabled:opacity-50"
          >
            <ListChecksIcon aria-hidden="true" className="h-4 w-4" />
            {t("skill.distribution.selectAllPlatforms")}
          </button>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("skill.platformSelectionHint")}
        </p>
        <div
          className={
            layout === "grid"
              ? "grid grid-cols-1 gap-2 sm:grid-cols-2"
              : "space-y-2"
          }
        >
          {nativePlatforms.map((platform) => (
            <SkillPlatformTargetRow
              key={platform.id}
              platform={platform}
              t={t}
              isInstalled={Boolean(installStatus[platform.id])}
              isSelected={isDistributionTargetSelected(
                platform.id,
                installStatus,
                selectedPlatforms,
              )}
              isBatchInstalling={isBusy}
              onToggle={() => onToggle(platform.id)}
            />
          ))}
        </div>
        {nativePlatforms.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t("skill.noPlatformsDetected")}
          </p>
        )}
      </section>
      {hasShared && (
        <SharedDistributionTarget
          skillName={skillName}
          selected={summary.sharedSelected}
          installed={Boolean(installStatus[SHARED_TARGET_ID])}
          disabled={isBusy}
          onToggle={() => onToggle(SHARED_TARGET_ID)}
        />
      )}
      {summary.duplicateDiscovery && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200"
        >
          <AlertTriangleIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
          {t("skill.sharedTargetDuplicateWarning")}
        </p>
      )}
      {!hideFooter && (
        <SkillDistributionFooter
          availablePlatforms={availablePlatforms}
          installStatus={installStatus}
          selectedPlatforms={selectedPlatforms}
          isBusy={isBusy}
          installProgress={installProgress}
          onApply={onApply}
          onCancel={onCancel}
          layout={layout}
        />
      )}
    </div>
  );
}

export function SkillDistributionFooter({
  availablePlatforms,
  installStatus,
  selectedPlatforms,
  isBusy,
  installProgress,
  onApply,
  onCancel,
  layout = "list",
}: Pick<
  SkillDistributionControlsProps,
  | "availablePlatforms"
  | "installStatus"
  | "selectedPlatforms"
  | "isBusy"
  | "installProgress"
  | "onApply"
  | "onCancel"
  | "layout"
>): JSX.Element {
  const { t } = useTranslation();
  const summary = summarizeDistributionSelection(
    availablePlatforms,
    installStatus,
    selectedPlatforms,
  );
  const redistributionCount =
    summary.installs + summary.removals === 0
      ? summary.platformCount + Number(summary.sharedSelected)
      : 0;
  return (
    <footer
      className={`border-t border-border bg-card pt-4 ${layout === "grid" ? "flex flex-wrap items-center justify-between gap-3 pb-1" : "space-y-3 pb-1"}`}
    >
      <div aria-live="polite" className="space-y-1">
        <p className="text-xs font-medium">
          {t("skill.distribution.selectionSummary", {
            count: summary.platformCount,
            shared: t(
              summary.sharedSelected
                ? "skill.distribution.sharedEnabled"
                : "skill.distribution.sharedDisabled",
            ),
          })}
        </p>
        <p className="text-xs text-muted-foreground">
          {redistributionCount > 0
            ? t("skill.distribution.redistributeHint", {
                count: redistributionCount,
              })
            : t("skill.distribution.pendingSummary", {
                install: summary.installs,
                uninstall: summary.removals,
              })}
        </p>
      </div>
      <div className={`flex gap-2 ${layout === "list" ? "w-full" : ""}`}>
        {onCancel && (
          <button
            type="button"
            disabled={isBusy}
            onClick={onCancel}
            className="rounded-lg border border-border px-5 py-2.5 text-sm hover:bg-accent disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
        )}
        <button
          type="button"
          onClick={onApply}
          disabled={
            isBusy ||
            summary.installs + summary.removals + redistributionCount === 0
          }
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isBusy ? (
            <Loader2Icon aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <SendIcon aria-hidden="true" className="h-4 w-4" />
          )}
          {isBusy
            ? installProgress
              ? `${installProgress.current}/${installProgress.total}`
              : t("skill.installing")
            : t(
                redistributionCount > 0
                  ? "skill.distribution.redistribute"
                  : "skill.distribution.applyChanges",
              )}
        </button>
      </div>
    </footer>
  );
}
