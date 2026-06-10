import type { HTMLAttributes } from "react";
import type { SkillVariantBadge } from "../../services/skill-variant-badges";

interface SkillVariantBadgeListProps extends HTMLAttributes<HTMLDivElement> {
  badges: SkillVariantBadge[];
  className?: string;
}

function toneClassName(tone: SkillVariantBadge["tone"]): string {
  switch (tone) {
    case "official":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "community":
      return "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300";
    case "local":
      return "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300";
    case "git":
      return "bg-slate-500/10 text-slate-700 dark:text-slate-300";
    case "stable":
      return "bg-blue-500/10 text-blue-700 dark:text-blue-300";
    case "dev":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "branch":
      return "bg-violet-500/10 text-violet-700 dark:text-violet-300";
    case "installed":
      return "bg-green-500/10 text-green-700 dark:text-green-300";
    case "update":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  }
}

export function SkillVariantBadgeList({
  badges,
  className = "mt-2 flex flex-wrap gap-1.5",
  ...divProps
}: SkillVariantBadgeListProps) {
  if (badges.length === 0) {
    return null;
  }

  return (
    <div {...divProps} className={className}>
      {badges.map((badge) => (
        <span
          key={badge.key}
          title={badge.title}
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${toneClassName(badge.tone)}`}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}
