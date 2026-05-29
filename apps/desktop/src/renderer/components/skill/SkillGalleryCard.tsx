import React from "react";
import {
  BellDotIcon,
  CheckSquareIcon,
  DownloadIcon,
  SquareIcon,
  StarIcon,
  TrashIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Skill } from "@prompthub/shared/types";
import { SkillIcon } from "./SkillIcon";
import { getRuntimeCapabilities } from "../../runtime";
import { SkillVariantBadgeList } from "./SkillVariantBadgeList";
import { buildSkillVariantBadges } from "../../services/skill-variant-badges";

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

interface SkillGalleryCardProps {
  animationDelayMs: number;
  hasStoreUpdate?: boolean;
  isSelected: boolean;
  isSelectionMode: boolean;
  onDelete: (skill: Skill) => void;
  onOpen: (skillId: string) => void;
  onQuickInstall: (skill: Skill) => void;
  onToggleFavorite: (skillId: string) => void;
  onToggleSelection: (skillId: string) => void;
  skill: Skill;
}

function SkillGalleryCardComponent({
  animationDelayMs,
  hasStoreUpdate = false,
  isSelected,
  isSelectionMode,
  onDelete,
  onOpen,
  onQuickInstall,
  onToggleFavorite,
  onToggleSelection,
  skill,
}: SkillGalleryCardProps) {
  const { t } = useTranslation();
  const runtimeCapabilities = getRuntimeCapabilities();
  const visibleTags = normalizeStringArray(skill.tags).slice(0, 4);
  const variantBadges = buildSkillVariantBadges(skill, t);

  return (
    <div
      onClick={() => {
        if (isSelectionMode) {
          onToggleSelection(skill.id);
          return;
        }
        onOpen(skill.id);
      }}
      style={{
        animationDelay: `${animationDelayMs}ms`,
        contentVisibility: "auto",
        containIntrinsicSize: "220px",
      }}
      className={`group relative app-wallpaper-panel border rounded-2xl p-5 transition-all cursor-pointer animate-in fade-in slide-in-from-bottom-4 ${
        isSelectionMode
          ? isSelected
            ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
            : "border-border hover:border-primary/40"
          : "border-border hover:border-primary/50 hover:shadow-xl hover:-translate-y-1"
      }`}
      >
      {hasStoreUpdate ? (
        <div
          className="absolute left-4 top-4 z-10 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-600 dark:text-amber-300"
          title={t("skill.updateAvailable", "Update available")}
        >
          <BellDotIcon className="h-3.5 w-3.5 animate-pulse" />
          {t("skill.updateAvailable", "Update available")}
        </div>
      ) : null}
      {isSelectionMode && (
        <button
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelection(skill.id);
          }}
          className={`absolute right-4 top-4 z-10 p-2 rounded-lg border transition-colors ${
            isSelected
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-border bg-background/80 text-muted-foreground hover:text-foreground"
          }`}
          title={
            isSelected ? t("common.clear", "清空") : t("common.select", "选择")
          }
        >
          {isSelected ? (
            <CheckSquareIcon className="w-4 h-4" />
          ) : (
            <SquareIcon className="w-4 h-4" />
          )}
        </button>
      )}

      <div className="flex items-start justify-between mb-4">
        <SkillIcon
          iconUrl={skill.icon_url}
          iconEmoji={skill.icon_emoji}
          backgroundColor={skill.icon_background}
          name={skill.name}
          size="lg"
          className="transition-transform group-hover:scale-110 group-hover:shadow-lg"
        />
        {!isSelectionMode && (
          <div className="flex gap-1">
            {runtimeCapabilities.skillPlatformIntegration && (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onQuickInstall(skill);
                }}
                className="opacity-0 group-hover:opacity-100 p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all active:scale-press-in"
                title={t("skill.quickInstall", "快速安装")}
              >
                <DownloadIcon className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={(event) => {
                event.stopPropagation();
                onToggleFavorite(skill.id);
              }}
              className={`p-2 rounded-lg transition-all active:scale-press-in ${
                skill.is_favorite
                  ? "text-yellow-500 hover:text-yellow-600"
                  : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10"
              }`}
              title={
                skill.is_favorite
                  ? t("skill.removeFavorite", "取消收藏")
                  : t("skill.addFavorite", "添加收藏")
              }
            >
              <StarIcon
                className={`w-4 h-4 ${skill.is_favorite ? "fill-current" : ""}`}
              />
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onDelete(skill);
              }}
              className="opacity-0 group-hover:opacity-100 p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all active:scale-press-in"
              title={t("skill.delete", "删除")}
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <h3
        className="font-bold text-foreground text-lg mb-2 line-clamp-1 group-hover:text-primary transition-colors"
        title={skill.name}
      >
        {skill.name}
      </h3>
      <p className="text-sm text-muted-foreground line-clamp-2 h-10 mb-4 leading-relaxed italic opacity-80">
        {skill.description ||
          t("skill.defaultDescription", "技能描述，帮助 AI 理解何时使用此技能")}
      </p>
      <SkillVariantBadgeList badges={variantBadges} className="mb-3 flex flex-wrap gap-1.5" />
      {visibleTags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {visibleTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export const SkillGalleryCard = React.memo(SkillGalleryCardComponent);
