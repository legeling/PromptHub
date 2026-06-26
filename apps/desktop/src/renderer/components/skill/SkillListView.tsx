import { useTranslation } from "react-i18next";
import {
  CuboidIcon,
  StarIcon,
  TrashIcon,
  SendIcon,
  CheckSquareIcon,
  SquareIcon,
  ShieldCheckIcon,
  ShieldAlertIcon,
  ShieldIcon,
} from "lucide-react";
import { SkillIcon } from "./SkillIcon";
import { useState, useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useSkillStore } from "../../stores/skill.store";
import { useSettingsStore } from "../../stores/settings.store";
import { PlatformIcon } from "../ui/PlatformIcon";
import { filterDetectedPlatforms } from "../../services/platform-visibility";
import type { Skill, SkillSafetyLevel } from "@prompthub/shared/types";
import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
import { getRuntimeCapabilities } from "../../runtime";
import { SkillVariantBadgeList } from "./SkillVariantBadgeList";
import { buildMySkillSourceBadges } from "../../services/skill-source-badges";
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

// Estimated row height for the virtualizer. Real heights are measured via
// `measureElement` once a row is rendered so the scrollbar stays accurate.
// Rows are intentionally compact; user/source tags share one metadata line.
// 行高初值供 virtualizer 估算；实际高度通过 measureElement 在每行首次渲染时
// 修正，避免滚动时出现长跳变。标签与来源徽章共用一行，保持列表密度。
const ESTIMATED_ROW_HEIGHT = 72;

function getSafetyIconProps(level: SkillSafetyLevel): {
  Icon: typeof ShieldCheckIcon;
  className: string;
  label: string;
} {
  switch (level) {
    case "safe":
      return {
        Icon: ShieldCheckIcon,
        className: "text-emerald-500",
        label: "Safe",
      };
    case "warn":
      return {
        Icon: ShieldAlertIcon,
        className: "text-yellow-500",
        label: "Needs review",
      };
    case "high-risk":
      return {
        Icon: ShieldAlertIcon,
        className: "text-orange-500",
        label: "High risk",
      };
    case "blocked":
      return {
        Icon: ShieldAlertIcon,
        className: "text-destructive",
        label: "Blocked",
      };
  }
}

function normalizePlatformStatusMap(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, boolean] => {
      const [, installed] = entry;
      return typeof installed === "boolean";
    }),
  );
}

interface SkillListViewProps {
  skills: Skill[];
  skillsWithStoreUpdates?: Set<string>;
  onContextMenu?: (event: React.MouseEvent, skill: Skill) => void;
  onDropTag?: (skill: Skill, tag: string) => void;
  onQuickInstall: (skill: Skill) => void;
  onRequestDelete?: (skillId: string, skillName: string) => void;
  selectionMode?: boolean;
  selectedSkillIds?: Set<string>;
  onToggleSelection?: (skillId: string) => void;
}

const skillPlatformStatusCache = new Map<string, Record<string, boolean>>();

/**
 * Compact List View for Skills
 * 技能紧凑列表视图
 *
 * Uses @tanstack/react-virtual to keep rendering bounded for users with
 * thousands of skills. Each row's height is dynamically measured because
 * it varies with tag count and platform availability.
 * 使用 @tanstack/react-virtual 限制渲染节点数量，应对用户拥有数千条
 * skill 的场景。每行高度因标签数量与平台可用情况而变化，所以使用
 * measureElement 进行动态测量。
 */
export function SkillListView({
  skills,
  skillsWithStoreUpdates = new Set<string>(),
  onContextMenu,
  onDropTag,
  onQuickInstall,
  onRequestDelete,
  selectionMode = false,
  selectedSkillIds = new Set<string>(),
  onToggleSelection,
}: SkillListViewProps) {
  const { t } = useTranslation();
  const selectedSkillId = useSkillStore((state) => state.selectedSkillId);
  const selectSkill = useSkillStore((state) => state.selectSkill);
  const toggleFavorite = useSkillStore((state) => state.toggleFavorite);
  const filterType = useSkillStore((state) => state.filterType);
  const storeView = useSkillStore((state) => state.storeView);
  const runtimeCapabilities = getRuntimeCapabilities();
  const disabledPlatformIds = useSettingsStore(
    (state) => state.disabledPlatformIds,
  );

  // Platform status cache
  const [platformStatuses, setPlatformStatuses] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [supportedPlatforms, setSupportedPlatforms] = useState<SkillPlatform[]>(
    [],
  );
  const [detectedPlatforms, setDetectedPlatforms] = useState<string[]>([]);

  // Load platforms on mount
  useEffect(() => {
    if (!runtimeCapabilities.skillPlatformIntegration) {
      setSupportedPlatforms([]);
      setDetectedPlatforms([]);
      return;
    }

    const loadPlatforms = async () => {
      try {
        const platforms = await window.api.skill.getSupportedPlatforms();
        setSupportedPlatforms(platforms);
        const detected = await window.api.skill.detectPlatforms();
        setDetectedPlatforms(detected);
      } catch (e) {
        console.error("Failed to load platforms:", e);
      }
    };
    loadPlatforms();
  }, [runtimeCapabilities.skillPlatformIntegration]);

  // Load install status for all skills
  useEffect(() => {
    if (!runtimeCapabilities.skillPlatformIntegration) {
      setPlatformStatuses({});
      return;
    }

    const loadStatuses = async () => {
      const nextStatuses = Object.fromEntries(
        skills.map((skill) => [
          skill.id,
          skillPlatformStatusCache.get(skill.id) ?? {},
        ]),
      );
      setPlatformStatuses(nextStatuses);

      const skillIdsToRefresh = Array.from(
        new Set(skills.map((skill) => skill.id)),
      );

      try {
        const statusBySkillId = (await window.api.skill.getMdInstallStatusBatch(
          skillIdsToRefresh,
        )) as Record<string, unknown>;

        for (const [skillId, status] of Object.entries(statusBySkillId)) {
          skillPlatformStatusCache.set(
            skillId,
            normalizePlatformStatusMap(status),
          );
        }

        setPlatformStatuses(
          Object.fromEntries(
            skills.map((skill) => [
              skill.id,
              skillPlatformStatusCache.get(skill.id) ?? {},
            ]),
          ),
        );
      } catch (error) {
        console.error("Failed to load install status batch:", error);
      }
    };
    if (skills.length > 0) {
      void loadStatuses();
    } else {
      setPlatformStatuses({});
    }
  }, [runtimeCapabilities.skillPlatformIntegration, skills]);

  const availablePlatforms = useMemo(() => {
    return filterDetectedPlatforms(
      supportedPlatforms,
      detectedPlatforms,
      disabledPlatformIds,
    );
  }, [supportedPlatforms, detectedPlatforms, disabledPlatformIds]);

  // Get install count for a skill
  const getInstallCount = (skillId: string) => {
    const status = platformStatuses[skillId];
    if (!status) return 0;
    return Object.values(status).filter(Boolean).length;
  };

  // Scroll container for the virtualizer. The component owns its own scroll
  // surface so the parent can remain `overflow-hidden` and let virtualization
  // measure the visible window correctly.
  // 虚拟化滚动容器由本组件持有，父级保持 overflow-hidden，virtualizer 才能
  // 正确测量可视窗口。
  const scrollParentRef = useRef<HTMLDivElement | null>(null);

  const rowVirtualizer = useVirtualizer({
    count: skills.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 6,
    // Stable identity across renders so measured heights survive list
    // re-orderings and incremental updates.
    getItemKey: (index) => skills[index]?.id ?? `__missing-${index}`,
  });

  if (skills.length === 0) {
    const isDistributionView = storeView === "distribution";
    const webSkillLibraryMode =
      !runtimeCapabilities.skillDistribution && !runtimeCapabilities.skillStore;
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground animate-in fade-in zoom-in-95 duration-slow py-20">
        <div className="p-8 bg-accent/30 rounded-full mb-6 relative">
          <CuboidIcon aria-hidden="true" className="w-20 h-20 opacity-20" />
          <div className="absolute inset-0 border-4 border-primary/10 rounded-full animate-pulse" />
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2">
          {isDistributionView
            ? t("skill.noSkills", "暂无 Skill")
            : filterType === "favorites"
              ? t("skill.noFavorites", "暂无收藏 Skill")
              : t("skill.noSkills", "暂无 Skill")}
        </h3>
        <p className="text-sm opacity-70 mb-8 max-w-sm text-center">
          {webSkillLibraryMode
            ? t(
                "skill.webLibraryHint",
                "Create or import your own skills here. Platform distribution and skill marketplaces are desktop-only.",
              )
            : isDistributionView
              ? t(
                  "skill.noDistributionSkillsHint",
                  "先导入 skill，再在这里安装、同步或卸载到 Claude、Cursor 等平台。",
                )
              : filterType === "favorites"
                ? t("skill.noFavoritesHint", "点击 Skill 卡片上的星标添加收藏")
                : t(
                    "skill.noSkillsHint",
                    "从 Skill 商店添加、扫描本地环境或手动创建 Skill 开始使用",
                  )}
        </p>
      </div>
    );
  }

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  return (
    <div ref={scrollParentRef} className="h-full overflow-y-auto">
      <div className="relative w-full" style={{ height: `${totalSize}px` }}>
        {virtualItems.map((virtualRow) => {
          const skill = skills[virtualRow.index];
          if (!skill) return null;
          const isSelected = selectedSkillId === skill.id;
          const isChecked = selectedSkillIds.has(skill.id);
          const installCount = getInstallCount(skill.id);
          const totalPlatforms = availablePlatforms.length;
          const hasStoreUpdate = skillsWithStoreUpdates.has(skill.id);
          const visibleTags = normalizeStringArray(skill.tags).slice(0, 3);
          const sourceBadges = buildMySkillSourceBadges(skill, t);
          const hasMetadata = sourceBadges.length > 0 || visibleTags.length > 0;
          const isFirstRow = virtualRow.index === 0;
          const selectionLabel = isChecked
            ? t("common.selected", "已选中")
            : t("common.select", "选择");
          const favoriteLabel = skill.is_favorite
            ? t("skill.removeFavorite")
            : t("skill.addFavorite");
          const rowActionLabel = selectionMode
            ? `${selectionLabel}: ${skill.name}`
            : `${t("skill.viewDetail", "View Details")}: ${skill.name}`;
          const handlePrimaryAction = () => {
            if (selectionMode) {
              onToggleSelection?.(skill.id);
              return;
            }
            selectSkill(skill.id);
          };

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              onContextMenu={(event) => onContextMenu?.(event, skill)}
              onDragOver={(event) => {
                if (
                  !event.dataTransfer.types.includes(
                    "application/x-prompthub-tag",
                  )
                ) {
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(event) => {
                const tag = event.dataTransfer.getData(
                  "application/x-prompthub-tag",
                );
                if (!tag) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                onDropTag?.(skill, tag);
              }}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className={`group flex min-h-[72px] items-center gap-3 px-5 py-3 cursor-pointer transition-colors ${
                isFirstRow ? "" : "border-t border-border"
              } ${
                selectionMode && isChecked
                  ? "bg-primary/8"
                  : isSelected
                    ? "bg-primary/5"
                    : "hover:bg-accent/50"
              }`}
            >
              {selectionMode && (
                <button
                  type="button"
                  aria-pressed={isChecked}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelection?.(skill.id);
                  }}
                  aria-label={selectionLabel}
                  className={`shrink-0 p-1 rounded-md transition-colors ${
                    isChecked
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                  title={selectionLabel}
                >
                  {isChecked ? (
                    <CheckSquareIcon aria-hidden="true" className="w-4 h-4" />
                  ) : (
                    <SquareIcon aria-hidden="true" className="w-4 h-4" />
                  )}
                </button>
              )}

              <button
                type="button"
                aria-label={rowActionLabel}
                aria-pressed={selectionMode ? isChecked : undefined}
                onClick={handlePrimaryAction}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {/* Icon */}
                <div className="shrink-0">
                  <SkillIcon
                    iconUrl={skill.icon_url}
                    iconEmoji={skill.icon_emoji}
                    backgroundColor={skill.icon_background}
                    name={skill.name}
                    size="md"
                    decorative
                    aria-hidden="true"
                    className={
                      isSelected
                        ? "ring-2 ring-primary shadow-lg shadow-primary/20"
                        : ""
                    }
                  />
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3
                      className={`truncate font-semibold leading-5 transition-colors ${isSelected ? "text-primary" : "text-foreground group-hover:text-primary"}`}
                    >
                      {skill.name}
                    </h3>
                    {hasStoreUpdate ? (
                      <CardStatusBadge
                        label={t("skill.updateAvailable", "Update available")}
                        testId={`skill-row-status-${skill.id}`}
                      />
                    ) : null}
                    {/* Safety shield icon */}
                    {skill.safetyReport ? (
                      (() => {
                        const { Icon, className, label } = getSafetyIconProps(
                          skill.safetyReport.level,
                        );
                        return (
                          <span
                            title={`${t("skill.safetyLevelLabel", "Safety")}: ${label}`}
                          >
                            <Icon
                              aria-hidden="true"
                              className={`w-3.5 h-3.5 shrink-0 ${className}`}
                            />
                          </span>
                        );
                      })()
                    ) : (
                      <span
                        title={t(
                          "skill.safetyAssessmentEmpty",
                          "No safety scan run yet",
                        )}
                      >
                        <ShieldIcon
                          aria-hidden="true"
                          className="w-3.5 h-3.5 shrink-0 text-muted-foreground/30"
                        />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {skill.description || t("skill.defaultDescription")}
                  </p>
                  {hasMetadata ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <SkillVariantBadgeList
                        badges={sourceBadges}
                        className="contents"
                      />
                      {visibleTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                {/* Platform indicators */}
                {runtimeCapabilities.skillPlatformIntegration &&
                  totalPlatforms > 0 && (
                    <div className="flex w-28 shrink-0 items-center justify-end gap-1">
                      {availablePlatforms.slice(0, 3).map((platform) => {
                        const isInstalled =
                          platformStatuses[skill.id]?.[platform.id];
                        return (
                          <div
                            key={platform.id}
                            className="flex items-center justify-center"
                            title={`${platform.name}: ${isInstalled ? t("skill.installed") : t("skill.notInstalled", "未安装")}`}
                          >
                            <PlatformIcon
                              platformId={platform.id}
                              size={16}
                              className={
                                isInstalled ? "opacity-100" : "opacity-40"
                              }
                            />
                          </div>
                        );
                      })}
                      <span className="ml-1 min-w-8 text-right text-[10px] font-medium text-primary">
                        {installCount}/{totalPlatforms}
                      </span>
                    </div>
                  )}
              </button>

              {/* Actions */}
              {!selectionMode && (
                <div className="flex shrink-0 items-center gap-1">
                  {runtimeCapabilities.skillPlatformIntegration && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onQuickInstall(skill);
                      }}
                      aria-label={t("skill.quickInstall", "快速安装")}
                      className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all active:scale-press-in"
                      title={t("skill.quickInstall", "快速安装")}
                    >
                      <SendIcon aria-hidden="true" className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(skill.id);
                    }}
                    aria-label={favoriteLabel}
                    className={`p-2 rounded-lg transition-all active:scale-press-in ${
                      skill.is_favorite
                        ? "text-yellow-500 hover:text-yellow-600"
                        : "text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10"
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
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onRequestDelete) {
                        onRequestDelete(skill.id, skill.name);
                      }
                    }}
                    aria-label={t("common.delete")}
                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all active:scale-press-in"
                    title={t("common.delete")}
                  >
                    <TrashIcon aria-hidden="true" className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
