import { useTranslation } from "react-i18next";
import {
  CuboidIcon,
  StarIcon,
  TrashIcon,
  DownloadIcon,
  BellDotIcon,
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

const MAX_STAGGERED_ROWS = 12;

// Estimated row height for the virtualizer. Real heights are measured via
// `measureElement` once a row is rendered so the scrollbar stays accurate.
// Rows expand a bit when tags are present; we estimate slightly above the no-
// tags baseline to keep early scroll positions stable.
// 行高初值供 virtualizer 估算；实际高度通过 measureElement 在每行首次渲染时
// 修正，避免滚动时出现长跳变。带标签的行会略高，所以初值取无标签态稍高的值。
const ESTIMATED_ROW_HEIGHT = 84;

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
          skillPlatformStatusCache.get(skill.name) ?? {},
        ]),
      );
      setPlatformStatuses(nextStatuses);

      const missingNames = Array.from(
        new Set(
          skills
            .map((skill) => skill.name)
            .filter((name) => !skillPlatformStatusCache.has(name)),
        ),
      );

      if (missingNames.length === 0) {
        return;
      }

      try {
        const statusByName = (await window.api.skill.getMdInstallStatusBatch(
          missingNames,
        )) as Record<string, unknown>;

        for (const [name, status] of Object.entries(statusByName)) {
          skillPlatformStatusCache.set(
            name,
            normalizePlatformStatusMap(status),
          );
        }

        setPlatformStatuses(
          Object.fromEntries(
            skills.map((skill) => [
              skill.id,
              skillPlatformStatusCache.get(skill.name) ?? {},
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
          <CuboidIcon className="w-20 h-20 opacity-20" />
          <div className="absolute inset-0 border-4 border-primary/10 rounded-full animate-pulse" />
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2">
          {isDistributionView
            ? t("skill.noSkills", "暂无技能")
            : filterType === "favorites"
              ? t("skill.noFavorites", "暂无收藏技能")
              : t("skill.noSkills", "暂无技能")}
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
              ? t("skill.noFavoritesHint", "点击技能卡片上的星标添加收藏")
              : t(
                  "skill.noSkillsHint",
                  "从 Skill 商店添加、扫描本地环境或手动创建技能开始使用",
                )}
        </p>
      </div>
    );
  }

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  return (
    <div ref={scrollParentRef} className="h-full overflow-y-auto">
      <div
        className="relative w-full"
        style={{ height: `${totalSize}px` }}
      >
        {virtualItems.map((virtualRow) => {
          const skill = skills[virtualRow.index];
          if (!skill) return null;
          const isSelected = selectedSkillId === skill.id;
          const isChecked = selectedSkillIds.has(skill.id);
          const installCount = getInstallCount(skill.id);
          const totalPlatforms = availablePlatforms.length;
          const hasStoreUpdate = skillsWithStoreUpdates.has(skill.id);
          const visibleTags = normalizeStringArray(skill.tags).slice(0, 3);
          const isFirstRow = virtualRow.index === 0;

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              onClick={() => {
                if (selectionMode) {
                  onToggleSelection?.(skill.id);
                  return;
                }
                selectSkill(skill.id);
              }}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
                animationDelay: `${Math.min(virtualRow.index, MAX_STAGGERED_ROWS) * 30}ms`,
              }}
              className={`group flex items-center gap-4 px-6 py-4 cursor-pointer transition-all animate-in fade-in slide-in-from-left-2 ${
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
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelection?.(skill.id);
                  }}
                  className={`shrink-0 p-1 rounded-md transition-colors ${
                    isChecked
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                  title={
                    isChecked
                      ? t("common.selected", "已选中")
                      : t("common.select", "选择")
                  }
                >
                  {isChecked ? (
                    <CheckSquareIcon className="w-4 h-4" />
                  ) : (
                    <SquareIcon className="w-4 h-4" />
                  )}
                </button>
              )}

              {/* Icon */}
              <div className="shrink-0">
                <SkillIcon
                  iconUrl={skill.icon_url}
                  iconEmoji={skill.icon_emoji}
                  backgroundColor={skill.icon_background}
                  name={skill.name}
                  size="md"
                  className={
                    isSelected
                      ? "ring-2 ring-primary shadow-lg shadow-primary/20"
                      : ""
                  }
                />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3
                    className={`font-semibold truncate transition-colors ${isSelected ? "text-primary" : "text-foreground group-hover:text-primary"}`}
                  >
                    {skill.name}
                  </h3>
                  {hasStoreUpdate ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-300"
                      title={t("skill.updateAvailable", "Update available")}
                    >
                      <BellDotIcon className="h-3 w-3 animate-pulse" />
                      {t("skill.updateAvailable", "Update available")}
                    </span>
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
                      <ShieldIcon className="w-3.5 h-3.5 shrink-0 text-muted-foreground/30" />
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {skill.description || t("skill.defaultDescription")}
                </p>
                {visibleTags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {visibleTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Platform indicators */}
              {runtimeCapabilities.skillPlatformIntegration && totalPlatforms > 0 && (
                <div className="flex items-center gap-1 shrink-0">
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
                  <span className="text-[10px] text-primary font-medium ml-1">
                    {installCount}/{totalPlatforms}
                  </span>
                </div>
              )}

              {/* Actions */}
              {!selectionMode && (
                <div className="flex items-center gap-1 shrink-0">
                  {runtimeCapabilities.skillPlatformIntegration && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onQuickInstall(skill);
                      }}
                      className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all active:scale-press-in"
                      title={t("skill.quickInstall", "快速安装")}
                    >
                      <DownloadIcon className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(skill.id);
                    }}
                    className={`p-2 rounded-lg transition-all active:scale-press-in ${
                      skill.is_favorite
                        ? "text-yellow-500 hover:text-yellow-600"
                        : "text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10"
                    }`}
                    title={
                      skill.is_favorite
                        ? t("skill.removeFavorite")
                        : t("skill.addFavorite")
                    }
                  >
                    <StarIcon
                      className={`w-4 h-4 ${skill.is_favorite ? "fill-current" : ""}`}
                    />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onRequestDelete) {
                        onRequestDelete(skill.id, skill.name);
                      }
                    }}
                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all active:scale-press-in"
                    title={t("common.delete")}
                  >
                    <TrashIcon className="w-4 h-4" />
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
