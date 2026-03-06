import React, { useEffect, useMemo, lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CuboidIcon,
  RefreshCwIcon,
  TrashIcon,
  StarIcon,
  LayoutGridIcon,
  ListIcon,
  DownloadIcon,
  FolderInputIcon,
  CheckSquareIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { SkillIcon } from "./SkillIcon";
import { useSkillStore } from "../../stores/skill.store";
import { useSettingsStore } from "../../stores/settings.store";
import { SkillFullDetailPage } from "./SkillFullDetailPage";
import { SkillQuickInstall } from "./SkillQuickInstall";
import { SkillStore } from "./SkillStore";
import { SkillScanPreview } from "./SkillScanPreview";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import type { Skill, ScannedSkill } from "../../../shared/types";

// Lazy load list view for better performance
// 懒加载列表视图以提升性能
const SkillListView = lazy(() =>
  import("./SkillListView").then((m) => ({ default: m.SkillListView })),
);

export function SkillManager() {
  const { t } = useTranslation();
  const skills = useSkillStore((state) => state.skills);
  const loadSkills = useSkillStore((state) => state.loadSkills);
  const deleteSkill = useSkillStore((state) => state.deleteSkill);
  const toggleFavorite = useSkillStore((state) => state.toggleFavorite);
  const isLoading = useSkillStore((state) => state.isLoading);
  const selectedSkillId = useSkillStore((state) => state.selectedSkillId);
  const selectSkill = useSkillStore((state) => state.selectSkill);
  const filterType = useSkillStore((state) => state.filterType);
  const viewMode = useSkillStore((state) => state.viewMode);
  const setViewMode = useSkillStore((state) => state.setViewMode);
  const storeView = useSkillStore((state) => state.storeView);
  const deployedSkillNames = useSkillStore((state) => state.deployedSkillNames);
  const loadDeployedStatus = useSkillStore((state) => state.loadDeployedStatus);
  const skillFilterTags = useSkillStore((state) => state.filterTags);
  const customSkillScanPaths = useSettingsStore(
    (state) => state.customSkillScanPaths,
  );
  const isDistributionView = storeView === "distribution";

  // Get filtered skills - filter directly in useMemo instead of using store function
  // 直接在 useMemo 中过滤，而不是使用 store 函数（避免函数引用作为依赖）
  const filteredSkills = useMemo(() => {
    let result = skills;
    if (isDistributionView) {
      result = [...skills].sort((a, b) => {
        const aDeployed = deployedSkillNames.has(a.name) ? 1 : 0;
        const bDeployed = deployedSkillNames.has(b.name) ? 1 : 0;
        return bDeployed - aDeployed;
      });
    } else if (filterType === "favorites")
      result = result.filter((s) => s.is_favorite);
    else if (filterType === "installed")
      result = result.filter((s) => !!s.registry_slug);
    else if (filterType === "deployed")
      result = result.filter((s) => deployedSkillNames.has(s.name));
    // Apply tag filter
    if (skillFilterTags.length > 0) {
      result = result.filter(
        (s) => s.tags && skillFilterTags.some((tag) => s.tags!.includes(tag)),
      );
    }
    return result;
  }, [
    skills,
    filterType,
    deployedSkillNames,
    skillFilterTags,
    isDistributionView,
  ]);

  // Quick install state
  // 快速安装状态
  const [quickInstallSkill, setQuickInstallSkill] = useState<Skill | null>(
    null,
  );

  // Scan preview state
  // 扫描预览状态
  const [showScanPreview, setShowScanPreview] = useState(false);
  const [scannedSkills, setScannedSkills] = useState<ScannedSkill[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(
    new Set(),
  );

  const scanLocalPreview = useSkillStore((state) => state.scanLocalPreview);
  const importScannedSkills = useSkillStore(
    (state) => state.importScannedSkills,
  );

  // Delete confirmation dialog state
  // 删除确认对话框状态
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    skillIds: string[];
    skillNames: string[];
  }>({ isOpen: false, skillIds: [], skillNames: [] });

  const handleScanLocal = async (customPaths?: string[]) => {
    setIsScanning(true);
    try {
      const result = await scanLocalPreview(customPaths);
      setScannedSkills(result);
      setShowScanPreview(true);
    } catch (err) {
      console.error("Failed to scan local skills:", err);
    } finally {
      setIsScanning(false);
    }
  };

  // Re-scan handler passed down to the preview modal
  // 传给预览弹窗的重新扫描回调
  const handleRescan = async (customPaths: string[]) => {
    const result = await scanLocalPreview(customPaths);
    setScannedSkills(result);
  };

  const handleImportScanned = async (skillsToImport: ScannedSkill[]) => {
    const result = await importScannedSkills(skillsToImport);
    // Refresh deployed status after import
    await loadDeployedStatus();
    return result.importedCount;
  };

  // Load skills on mount, then load deployed status
  useEffect(() => {
    loadSkills().then(() => loadDeployedStatus());
  }, [loadSkills, loadDeployedStatus]);

  useEffect(() => {
    if (storeView === "store") {
      setIsSelectionMode(false);
      setSelectedSkillIds(new Set());
    }
  }, [storeView]);

  // Store view: show the skill store page
  // 商店视图：显示技能商店页面
  if (storeView === "store") {
    return <SkillStore />;
  }

  // If a skill is selected, show full detail page (same behavior for both gallery and list views)
  // 如果选中了技能，显示全宽详情页（画廊和列表视图使用相同交互）
  if (selectedSkillId && !isSelectionMode) {
    return <SkillFullDetailPage />;
  }

  const selectedSkills = filteredSkills.filter((skill) =>
    selectedSkillIds.has(skill.id),
  );
  const allVisibleSelected =
    filteredSkills.length > 0 &&
    filteredSkills.every((skill) => selectedSkillIds.has(skill.id));

  const toggleSelectionMode = () => {
    setIsSelectionMode((prev) => !prev);
    setSelectedSkillIds(new Set());
  };

  const toggleSkillSelection = (skillId: string) => {
    setSelectedSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) {
        next.delete(skillId);
      } else {
        next.add(skillId);
      }
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedSkillIds(new Set());
      return;
    }
    setSelectedSkillIds(new Set(filteredSkills.map((skill) => skill.id)));
  };

  const handleBatchFavorite = async () => {
    const shouldFavorite = selectedSkills.some((skill) => !skill.is_favorite);
    for (const skill of selectedSkills) {
      if (skill.is_favorite !== shouldFavorite) {
        await toggleFavorite(skill.id);
      }
    }
    setSelectedSkillIds(new Set());
  };

  const handleBatchDelete = async () => {
    if (selectedSkills.length === 0) return;
    setDeleteConfirm({
      isOpen: true,
      skillIds: selectedSkills.map((s) => s.id),
      skillNames: selectedSkills.map((s) => s.name),
    });
  };

  const confirmDelete = async () => {
    for (const id of deleteConfirm.skillIds) {
      await deleteSkill(id);
    }
    setDeleteConfirm({ isOpen: false, skillIds: [], skillNames: [] });
    setSelectedSkillIds(new Set());
    setIsSelectionMode(false);
  };

  const headerTitle = isDistributionView
    ? t("nav.distribution", "分发")
    : filterType === "favorites"
      ? t("nav.favorites", "收藏")
      : filterType === "installed"
        ? t("skill.imported", "已导入")
        : filterType === "deployed"
          ? t("skill.deployed", "已分发")
          : t("nav.mySkills", "我的 Skills");

  const emptyStateTitle = isDistributionView
    ? t("skill.noSkills", "暂无技能")
    : filterType === "favorites"
      ? t("skill.noFavorites", "暂无收藏技能")
      : filterType === "installed"
        ? t("skill.noImportedSkills", "还没有已导入的技能")
        : filterType === "deployed"
          ? t("skill.noDeployedSkills", "还没有已分发的技能")
          : t("skill.noSkills", "暂无技能");

  const emptyStateHint = isDistributionView
    ? t(
        "skill.noDistributionSkillsHint",
        "先导入 skill，再在这里安装、同步或卸载到 Claude、Cursor 等平台。",
      )
    : filterType === "favorites"
      ? t("skill.noFavoritesHint", "点击技能卡片上的星标添加收藏")
      : filterType === "installed"
        ? t(
            "skill.noImportedSkillsHint",
            "从 Skill 商店、本地扫描、GitHub 或手动创建导入后，它们会出现在这里。",
          )
        : filterType === "deployed"
          ? t(
              "skill.noDeployedSkillsHint",
              "将技能分发到 Claude、Cursor 等平台后，这里会显示已分发项目。",
            )
          : t(
              "skill.noSkillsHint",
              "从 Skill 商店添加、扫描本地环境或手动创建技能开始使用",
            );

  const headerSubtitle = isDistributionView
    ? t(
        "skill.distributionHint",
        "集中管理 skill 在各个平台上的安装、同步与卸载。",
      )
    : t("skill.workspaceHint", "统一管理所有已导入的 skills，不区分来源渠道。");
  const distributionStatsLabel = isDistributionView
    ? t("skill.distributionStats", {
        deployed: deployedSkillNames.size,
        total: skills.length,
        defaultValue: `已分发 ${deployedSkillNames.size} / 全部 ${skills.length}`,
      })
    : null;

  return (
    <div className="flex-1 flex flex-row h-full bg-background overflow-hidden relative">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="h-14 px-6 border-b border-border flex items-center justify-between shrink-0 bg-background/50 backdrop-blur-sm z-10">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <CuboidIcon className="w-5 h-5 text-primary" />
              <div>
                <h2 className="text-lg font-semibold">{headerTitle}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {headerSubtitle}
                </p>
              </div>
            </div>
            <div className="h-4 w-px bg-border mx-1" />
            <span className="text-[11px] font-medium text-muted-foreground bg-accent/50 px-2 py-0.5 rounded-full border border-white/5">
              {isDistributionView
                ? distributionStatsLabel
                : `${filteredSkills.length}${filterType !== "all" ? ` / ${skills.length}` : ""}`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isSelectionMode ? (
              <>
                <span className="text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                  {t("skill.selectedCount", {
                    count: selectedSkillIds.size,
                    defaultValue: `已选 ${selectedSkillIds.size} 项`,
                  })}
                </span>
                <button
                  onClick={handleSelectAllVisible}
                  className="p-2 rounded-lg bg-accent text-foreground hover:bg-accent/80 transition-colors"
                  title={
                    allVisibleSelected
                      ? t("common.clear", "清空")
                      : t("common.selectAll", "全选")
                  }
                >
                  {allVisibleSelected ? (
                    <CheckSquareIcon className="w-4 h-4" />
                  ) : (
                    <SquareIcon className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={handleBatchFavorite}
                  disabled={selectedSkillIds.size === 0}
                  className="p-2 rounded-lg bg-accent text-foreground hover:bg-accent/80 transition-colors disabled:opacity-50"
                  title={
                    selectedSkills.every((skill) => skill.is_favorite)
                      ? t("skill.removeFavorite", "取消收藏")
                      : t("skill.addFavorite", "添加收藏")
                  }
                >
                  <StarIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={handleBatchDelete}
                  disabled={selectedSkillIds.size === 0}
                  className="p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/15 transition-colors disabled:opacity-50"
                  title={t("common.delete", "删除")}
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={toggleSelectionMode}
                  className="p-2 rounded-lg bg-accent text-foreground hover:bg-accent/80 transition-colors"
                  title={t("common.cancel", "取消")}
                >
                  <XIcon className="w-4 h-4" />
                </button>
                <div className="h-4 w-px bg-border" />
              </>
            ) : (
              <>
                <button
                  onClick={toggleSelectionMode}
                  className="p-2 rounded-lg bg-accent text-foreground hover:bg-accent/80 transition-colors"
                  title={t("skill.batchManage", "批量管理")}
                >
                  <CheckSquareIcon className="w-4 h-4" />
                </button>
                <div className="h-4 w-px bg-border" />
              </>
            )}
            {/* View mode toggle */}
            {/* 视图模式切换 */}
            <div className="flex items-center bg-muted rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("gallery")}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === "gallery"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title={t("skill.galleryView", "画廊视图")}
              >
                <LayoutGridIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === "list"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title={t("skill.listView", "列表视图")}
              >
                <ListIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="h-4 w-px bg-border" />
            <button
              onClick={() => handleScanLocal(customSkillScanPaths)}
              disabled={isScanning}
              className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
              title={t("skill.scanLocal", "Scan local skills")}
            >
              <FolderInputIcon
                className={`w-4 h-4 ${isScanning ? "animate-spin" : ""}`}
              />
            </button>
            <div className="h-4 w-px bg-border" />
            <button
              onClick={async () => {
                await loadSkills();
                await loadDeployedStatus();
              }}
              className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors"
              title={t("settings.refresh")}
            >
              <RefreshCwIcon
                className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {viewMode === "list" ? (
            /* List View */
            /* 列表视图 */
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              }
            >
              <SkillListView
                skills={filteredSkills}
                onQuickInstall={setQuickInstallSkill}
                onRequestDelete={(id, name) =>
                  setDeleteConfirm({
                    isOpen: true,
                    skillIds: [id],
                    skillNames: [name],
                  })
                }
                selectionMode={isSelectionMode}
                selectedSkillIds={selectedSkillIds}
                onToggleSelection={toggleSkillSelection}
              />
            </Suspense>
          ) : (
            /* Gallery View */
            /* 画廊视图 */
            <div className="p-6">
              {filteredSkills.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground animate-in fade-in zoom-in-95 duration-500 py-20">
                  <div className="p-8 bg-accent/30 rounded-full mb-6 relative">
                    <CuboidIcon className="w-20 h-20 opacity-20" />
                    <div className="absolute inset-0 border-4 border-primary/10 rounded-full animate-pulse" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    {emptyStateTitle}
                  </h3>
                  <p className="text-sm opacity-70 mb-8 max-w-sm text-center">
                    {emptyStateHint}
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {filteredSkills.map((skill, index) => {
                    const isSelected = selectedSkillIds.has(skill.id);

                    return (
                    <div
                      key={skill.id}
                      onClick={() => {
                        if (isSelectionMode) {
                          toggleSkillSelection(skill.id);
                          return;
                        }
                        selectSkill(skill.id);
                      }}
                      style={{ animationDelay: `${index * 50}ms` }}
                      className={`group relative bg-card border rounded-2xl p-5 transition-all cursor-pointer animate-in fade-in slide-in-from-bottom-4 ${
                        isSelectionMode
                          ? isSelected
                            ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
                            : "border-border hover:border-primary/40"
                          : "border-border hover:border-primary/50 hover:shadow-xl hover:-translate-y-1"
                      }`}
                    >
                      {isSelectionMode && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSkillSelection(skill.id);
                          }}
                          className={`absolute right-4 top-4 z-10 p-2 rounded-lg border transition-colors ${
                            isSelected
                              ? "border-primary/40 bg-primary/15 text-primary"
                              : "border-border bg-background/80 text-muted-foreground hover:text-foreground"
                          }`}
                          title={
                            isSelected
                              ? t("common.clear", "清空")
                              : t("common.select", "选择")
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
                          name={skill.name}
                          size="lg"
                          className="transition-transform group-hover:scale-110 group-hover:shadow-lg"
                        />
                        {!isSelectionMode && <div className="flex gap-1">
                          {/* Quick install button */}
                          {/* 快速安装按钮 */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setQuickInstallSkill(skill);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all active:scale-90"
                            title={t("skill.quickInstall", "快速安装")}
                          >
                            <DownloadIcon className="w-4 h-4" />
                          </button>
                          {/* Favorite button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(skill.id);
                            }}
                            className={`p-2 rounded-lg transition-all active:scale-90 ${
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
                          {/* Delete button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm({
                                isOpen: true,
                                skillIds: [skill.id],
                                skillNames: [skill.name],
                              });
                            }}
                            className="opacity-0 group-hover:opacity-100 p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all active:scale-90"
                            title={t("skill.delete", "删除")}
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>}
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
                            "技能描述，帮助 AI 理解何时使用此技能",
                          )}
                      </p>
                    </div>
                  )})}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quick Install Modal */}
      {/* 快速安装弹窗 */}
      {quickInstallSkill && (
        <SkillQuickInstall
          skill={quickInstallSkill}
          onClose={() => setQuickInstallSkill(null)}
        />
      )}

      {/* Scan Preview Modal */}
      {/* 扫描预览弹窗 */}
      {showScanPreview && (
        <SkillScanPreview
          scannedSkills={scannedSkills}
          installedPaths={
            // Build a set of source_url values (which store localPath on import)
            // so the preview can accurately identify already-imported skills.
            // 从 DB source_url 字段构建路径集合（导入时存的就是 localPath），精准判断已导入条目。
            new Set(
              skills.filter((s) => s.source_url).map((s) => s.source_url!),
            )
          }
          onImport={handleImportScanned}
          onRescan={handleRescan}
          onClose={() => setShowScanPreview(false)}
        />
      )}

      {/* Delete confirmation dialog */}
      {/* 删除确认对话框 */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() =>
          setDeleteConfirm({ isOpen: false, skillIds: [], skillNames: [] })
        }
        onConfirm={confirmDelete}
        variant="destructive"
        title={t("skill.confirmDeleteTitle", "确认删除")}
        message={
          <div className="space-y-2">
            <p>
              {deleteConfirm.skillNames.length === 1
                ? t("skill.confirmDeleteSingle", {
                    name: deleteConfirm.skillNames[0],
                    defaultValue: `确定要删除技能「${deleteConfirm.skillNames[0]}」吗？`,
                  })
                : t("skill.confirmDeleteMultiple", {
                    count: deleteConfirm.skillNames.length,
                    defaultValue: `确定要删除选中的 ${deleteConfirm.skillNames.length} 个技能吗？`,
                  })}
            </p>
            <p className="text-xs text-muted-foreground/80">
              {t(
                "skill.deleteHint",
                "仅从 PromptHub 库中移除，不会删除源文件目录。已分发到平台的安装会同时卸载。",
              )}
            </p>
          </div>
        }
        confirmText={t("common.delete", "删除")}
        cancelText={t("common.cancel", "取消")}
      />
    </div>
  );
}
