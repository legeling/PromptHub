import { CheckIcon, Loader2Icon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { RegistrySkill } from "../../../shared/types";
import { SkillIcon } from "./SkillIcon";

const MAX_STAGGERED_STORE_CARDS = 12;

interface SkillStoreCardProps {
  skill: RegistrySkill;
  isInstalled: boolean;
  index: number;
  installingSlug?: string | null;
  onQuickInstall?: (skill: RegistrySkill, e: React.MouseEvent) => void;
  onClick: () => void;
}

export function SkillStoreCard({
  skill,
  isInstalled,
  index,
  installingSlug,
  onQuickInstall,
  onClick,
}: SkillStoreCardProps) {
  const { t } = useTranslation();
  const isInstallingThis = installingSlug === skill.slug;

  return (
    <div
      onClick={onClick}
      style={{
        animationDelay: `${Math.min(index, MAX_STAGGERED_STORE_CARDS) * 30}ms`,
        contentVisibility: "auto",
        containIntrinsicSize: "86px",
      }}
      className="group relative flex items-center gap-3 p-3.5 bg-card border border-border rounded-xl hover:border-primary/40 transition-all cursor-pointer animate-in fade-in slide-in-from-bottom-2 hover:shadow-md"
    >
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
        {skill.weekly_installs && (
          <div className="mt-1.5 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            {skill.weekly_installs}/wk
          </div>
        )}
      </div>

      <div className="shrink-0">
        {isInstalled ? (
          <div className="p-1.5 text-green-500" title={t("skill.imported", "Imported")}>
            <CheckIcon className="w-4 h-4" />
          </div>
        ) : (
          <button
            onClick={(e) => onQuickInstall?.(skill, e)}
            disabled={isInstallingThis}
            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all active:scale-90 disabled:opacity-50"
            title={t("skill.install", "Install")}
          >
            {isInstallingThis ? (
              <Loader2Icon className="w-4 h-4 animate-spin text-primary" />
            ) : (
              <PlusIcon className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
