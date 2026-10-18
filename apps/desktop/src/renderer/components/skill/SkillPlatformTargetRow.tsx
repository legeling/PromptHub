import type { SkillPlatformInstallStatus } from "@prompthub/shared/types";
import { CheckIcon } from "lucide-react";
import type { TFunction } from "i18next";
import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
import { PlatformIcon } from "../ui/PlatformIcon";

export function DistributionCheck({
  checked,
}: {
  checked: boolean;
}): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"}`}
    >
      {checked && <CheckIcon className="h-3.5 w-3.5" />}
    </span>
  );
}

export function SkillPlatformTargetRow({
  isBatchInstalling,
  isInstalled,
  contentState,
  isSelected,
  onToggle,
  platform,
  t,
}: {
  isBatchInstalling: boolean;
  isInstalled: boolean;
  contentState?: SkillPlatformInstallStatus["contentState"];
  isSelected: boolean;
  onToggle: () => void;
  platform: SkillPlatform;
  t: TFunction;
}): JSX.Element {
  const pending = isInstalled !== isSelected;
  const status = pending
    ? t(
        isSelected
          ? "skill.distribution.pendingInstall"
          : "skill.distribution.pendingUninstall",
      )
    : t(isInstalled ? "skill.installed" : "skill.distribution.notInstalled");
  return (
    <button
      type="button"
      aria-label={platform.name}
      aria-pressed={isSelected}
      disabled={isBatchInstalling}
      onClick={onToggle}
      className={`flex w-full min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60 ${isSelected ? "border-primary/60 bg-primary/5" : "border-border bg-card hover:bg-accent/40"}`}
    >
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center"
      >
        <PlatformIcon platformId={platform.id} size={28} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {platform.name}
        </span>
        <span
          className={`mt-0.5 block text-xs ${pending ? "text-primary" : "text-muted-foreground"}`}
        >
          {isInstalled && !pending && contentState && contentState !== "synced"
            ? t(`resourceLibrary.content.${contentState}`)
            : status}
        </span>
        {platform.id === "cherry-studio" && (
          <span className="block text-[11px] text-muted-foreground">
            {t("skill.distribution.copyOnly")}
          </span>
        )}
      </span>
      <DistributionCheck checked={isSelected} />
    </button>
  );
}
