import {
  CheckIcon,
  DownloadIcon,
  EyeIcon,
  Loader2Icon,
  PlusIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { RegistrySkill } from "@prompthub/shared/types";
import { SkillIcon } from "./SkillIcon";
import { SkillVariantBadgeList } from "./SkillVariantBadgeList";
import { buildSkillVariantBadges } from "../../services/skill-variant-badges";

const MAX_STAGGERED_STORE_CARDS = 12;

function getRegistrySkillPendingKey(skill: RegistrySkill): string {
  return skill.source_id || skill.source_url || skill.slug;
}

interface SkillStoreCardProps {
  skill: RegistrySkill;
  isInstalled: boolean;
  hasUpdate?: boolean;
  index: number;
  storeLabel?: string;
  storeTone?: "official" | "community" | "git" | "local";
  batchMode?: boolean;
  isSelected?: boolean;
  installingSourceIds?: Record<string, true>;
  onQuickInstall?: (skill: RegistrySkill, e: React.MouseEvent) => void;
  onOpenDetail?: (skill: RegistrySkill, e: React.MouseEvent) => void;
  onClick: () => void;
}

export function SkillStoreCard({
  skill,
  isInstalled,
  hasUpdate = false,
  index,
  storeLabel,
  storeTone,
  batchMode = false,
  isSelected = false,
  installingSourceIds,
  onQuickInstall,
  onOpenDetail,
  onClick,
}: SkillStoreCardProps) {
  const { t } = useTranslation();
  const isInstallingThis = Boolean(
    installingSourceIds?.[getRegistrySkillPendingKey(skill)],
  );
  const variantBadges = buildSkillVariantBadges(skill, t, {
    hasUpdate,
    isInstalled,
  });
  const statusBadges = variantBadges.filter(
    (badge) => badge.tone === "installed" || badge.tone === "update",
  );
  const branchBadges = variantBadges.filter(
    (badge) =>
      badge.tone === "branch" ||
      badge.tone === "dev" ||
      badge.tone === "stable",
  );
  const badges = storeLabel
    ? [
        {
          key: "store-source",
          label: storeLabel,
          title: skill.source_label || skill.source_url,
          tone: storeTone || variantBadges[0]?.tone || "git",
        },
        ...branchBadges,
        ...statusBadges,
      ]
    : variantBadges;

  return (
    <div
      onClick={onClick}
      style={{
        animationDelay: `${Math.min(index, MAX_STAGGERED_STORE_CARDS) * 30}ms`,
        contentVisibility: "auto",
        containIntrinsicSize: "86px",
      }}
      className={`group relative flex items-center gap-3 p-3.5 app-wallpaper-surface border rounded-xl hover:border-primary/40 transition-all cursor-pointer animate-in fade-in slide-in-from-bottom-2 hover:shadow-md ${
        isSelected
          ? "border-primary/70 ring-1 ring-primary/30"
          : "border-border"
      }`}
    >
      {batchMode && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
          aria-pressed={isSelected}
          aria-label={
            isSelected
              ? t("skill.unselectStoreSkill", "Unselect store skill")
              : t("skill.selectStoreSkill", "Select store skill")
          }
          title={
            isSelected
              ? t("skill.unselectStoreSkill", "Unselect store skill")
              : t("skill.selectStoreSkill", "Select store skill")
          }
          className={`group/select grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition-all active:scale-press-in ${
            isSelected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card/80 text-muted-foreground/70 hover:border-primary/45 hover:bg-primary/10 hover:text-primary"
          }`}
        >
          {isSelected ? (
            <CheckIcon className="h-3.5 w-3.5" />
          ) : (
            <span className="h-3 w-3 rounded-[4px] border border-current transition-colors group-hover/select:border-primary" />
          )}
        </button>
      )}

      <SkillIcon
        iconUrl={skill.icon_url}
        iconEmoji={skill.icon_emoji}
        backgroundColor={skill.icon_background}
        name={skill.name}
        size="md"
      />

      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
          {skill.name}
        </h4>
        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
          {skill.description}
        </p>
        <SkillVariantBadgeList
          badges={badges}
          className="mt-2 flex flex-wrap gap-1"
        />
        {skill.weekly_installs && (
          <div className="mt-1.5 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            {skill.weekly_installs}/wk
          </div>
        )}
      </div>

      <div className="shrink-0">
        {isInstallingThis ? (
          <button
            disabled
            className="p-1.5 text-primary bg-primary/10 rounded-lg transition-all disabled:opacity-80"
            title={t("skill.installing", "Installing...")}
          >
            <Loader2Icon className="w-4 h-4 animate-spin text-primary" />
          </button>
        ) : batchMode ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenDetail?.(skill, event);
            }}
            className="grid h-7 w-7 place-items-center rounded-lg border border-border/70 bg-card/80 text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/10 hover:text-primary active:scale-press-in"
            aria-label={t("common.viewDetail", "View detail")}
            title={t("common.viewDetail", "View detail")}
          >
            <EyeIcon className="h-4 w-4" />
          </button>
        ) : hasUpdate ? (
          <div
            className="p-1.5 text-amber-500"
            title={t("skill.updateAvailable", "Update available")}
          >
            <DownloadIcon className="w-4 h-4" />
          </div>
        ) : isInstalled ? (
          <div
            className="p-1.5 text-green-500"
            title={t("skill.imported", "Imported")}
          >
            <CheckIcon className="w-4 h-4" />
          </div>
        ) : (
          <button
            onClick={(e) => onQuickInstall?.(skill, e)}
            disabled={isInstallingThis}
            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all active:scale-press-in disabled:opacity-50"
            title={t("skill.install", "Install")}
          >
            <PlusIcon className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
