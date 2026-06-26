import React from "react";
import {
  CheckSquareIcon,
  SendIcon,
  SquareIcon,
  StarIcon,
  TrashIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Skill } from "@prompthub/shared/types";
import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
import { SkillIcon } from "./SkillIcon";
import { getRuntimeCapabilities } from "../../runtime";
import { SkillVariantBadgeList } from "./SkillVariantBadgeList";
import { buildMySkillSourceBadges } from "../../services/skill-source-badges";
import { PlatformIcon } from "../ui/PlatformIcon";
import { CardStatusBadge } from "../ui/CardStatusBadge";

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    );
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter(
            (item): item is string =>
              typeof item === "string" && item.trim().length > 0,
          )
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

interface SkillGalleryCardProps {
  animationDelayMs: number;
  distributedPlatforms?: Array<Pick<SkillPlatform, "id" | "name">>;
  hasStoreUpdate?: boolean;
  isSelected: boolean;
  isSelectionMode: boolean;
  onDelete: (skill: Skill) => void;
  onContextMenu?: (event: React.MouseEvent, skill: Skill) => void;
  onDropTag?: (skill: Skill, tag: string) => void;
  onOpen: (skillId: string) => void;
  onQuickInstall: (skill: Skill) => void;
  onToggleFavorite: (skillId: string) => void;
  onToggleSelection: (skillId: string) => void;
  skill: Skill;
}

function SkillGalleryCardComponent({
  animationDelayMs,
  distributedPlatforms,
  hasStoreUpdate = false,
  isSelected,
  isSelectionMode,
  onDelete,
  onContextMenu,
  onDropTag,
  onOpen,
  onQuickInstall,
  onToggleFavorite,
  onToggleSelection,
  skill,
}: SkillGalleryCardProps) {
  const { t } = useTranslation();
  const runtimeCapabilities = getRuntimeCapabilities();
  const visibleTags = normalizeStringArray(skill.tags).slice(0, 4);
  const sourceBadges = buildMySkillSourceBadges(skill, t);
  const showDistribution =
    runtimeCapabilities.skillPlatformIntegration &&
    !isSelectionMode &&
    distributedPlatforms !== undefined;
  const visibleDistributedPlatforms = (distributedPlatforms ?? []).slice(0, 6);
  const selectLabel = isSelected
    ? t("common.clear", "清空")
    : t("common.select", "选择");
  const favoriteLabel = skill.is_favorite
    ? t("skill.removeFavorite", "取消收藏")
    : t("skill.addFavorite", "添加收藏");
  const primaryActionLabel = isSelectionMode
    ? `${selectLabel}: ${skill.name}`
    : `${t("skill.viewDetail", "View Details")}: ${skill.name}`;

  const handlePrimaryAction = () => {
    if (isSelectionMode) {
      onToggleSelection(skill.id);
      return;
    }
    onOpen(skill.id);
  };

  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    handlePrimaryAction();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={primaryActionLabel}
      aria-pressed={isSelectionMode ? isSelected : undefined}
      onClick={handlePrimaryAction}
      onKeyDown={handleCardKeyDown}
      onContextMenu={(event) => onContextMenu?.(event, skill)}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("application/x-prompthub-tag")) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        const tag = event.dataTransfer.getData("application/x-prompthub-tag");
        if (!tag) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onDropTag?.(skill, tag);
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
      {isSelectionMode && (
        <button
          type="button"
          aria-pressed={isSelected}
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelection(skill.id);
          }}
          aria-label={selectLabel}
          className={`absolute right-4 top-4 z-10 p-2 rounded-lg border transition-colors ${
            isSelected
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-border bg-background/80 text-muted-foreground hover:text-foreground"
          }`}
          title={selectLabel}
        >
          {isSelected ? (
            <CheckSquareIcon aria-hidden="true" className="w-4 h-4" />
          ) : (
            <SquareIcon aria-hidden="true" className="w-4 h-4" />
          )}
        </button>
      )}

      <div className="flex items-start justify-between gap-3 mb-4">
        <SkillIcon
          iconUrl={skill.icon_url}
          iconEmoji={skill.icon_emoji}
          backgroundColor={skill.icon_background}
          name={skill.name}
          size="lg"
          className="transition-transform group-hover:scale-110 group-hover:shadow-lg"
        />
        {!isSelectionMode && (
          <div
            data-testid="skill-card-header-meta"
            className="flex min-w-0 flex-1 flex-col items-end gap-2"
          >
            {hasStoreUpdate ? (
              <CardStatusBadge
                label={t("skill.updateAvailable", "Update available")}
                testId={`skill-card-status-${skill.id}`}
              />
            ) : null}
            {showDistribution ? (
              <div
                data-testid="skill-distributed-targets"
                className="flex min-h-8 max-w-full flex-wrap items-center justify-end gap-1.5"
              >
                {visibleDistributedPlatforms.length > 0 ? (
                  visibleDistributedPlatforms.map((platform) => (
                    <PlatformIcon
                      key={platform.id}
                      platformId={platform.id}
                      size={18}
                      title={platform.name}
                    />
                  ))
                ) : (
                  <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
                    {t("skill.notDistributed", "Not distributed")}
                  </span>
                )}
                {(distributedPlatforms?.length ?? 0) > 6 ? (
                  <span className="text-[10px] text-muted-foreground">
                    +{(distributedPlatforms?.length ?? 0) - 6}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div
              data-testid="skill-card-actions"
              className="flex w-full justify-end gap-1"
            >
              {runtimeCapabilities.skillPlatformIntegration && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onQuickInstall(skill);
                  }}
                  aria-label={t("skill.quickInstall", "快速安装")}
                  className="opacity-0 group-hover:opacity-100 p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all active:scale-press-in"
                  title={t("skill.quickInstall", "快速安装")}
                >
                  <SendIcon aria-hidden="true" className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleFavorite(skill.id);
                }}
                aria-label={favoriteLabel}
                className={`p-2 rounded-lg transition-all active:scale-press-in ${
                  skill.is_favorite
                    ? "text-yellow-500 hover:text-yellow-600"
                    : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10"
                }`}
                title={favoriteLabel}
              >
                <StarIcon
                  aria-hidden="true"
                  className={`w-4 h-4 ${skill.is_favorite ? "fill-current" : ""}`}
                />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(skill);
                }}
                aria-label={t("skill.delete", "删除")}
                className="opacity-0 group-hover:opacity-100 p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all active:scale-press-in"
                title={t("skill.delete", "删除")}
              >
                <TrashIcon aria-hidden="true" className="w-4 h-4" />
              </button>
            </div>
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
          t(
            "skill.defaultDescription",
            "Skill 描述，帮助 AI 理解何时使用此 Skill",
          )}
      </p>
      <SkillVariantBadgeList
        badges={sourceBadges}
        className="mb-3 flex flex-wrap gap-1.5"
      />
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
