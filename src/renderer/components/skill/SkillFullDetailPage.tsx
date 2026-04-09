import { useTranslation } from "react-i18next";
import {
  ArrowLeftIcon,
  ArrowUpIcon,
  CuboidIcon,
  GlobeIcon,
  HistoryIcon,
  BookOpenIcon,
  CodeIcon,
  PencilIcon,
  SaveIcon,
  StarIcon,
  TrashIcon,
  FolderOpenIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { SkillIcon } from "./SkillIcon";
import { SkillCodePane } from "./SkillCodePane";
import { useState, useEffect, useMemo, useRef } from "react";
import { SkillPlatformPanel } from "./SkillPlatformPanel";
import { SkillPreviewPane } from "./SkillPreviewPane";
import { useSkillStore } from "../../stores/skill.store";
import { useSettingsStore } from "../../stores/settings.store";
import { useToast } from "../ui/Toast";
import { UnsavedChangesDialog } from "../ui/UnsavedChangesDialog";
import { EditSkillModal } from "./EditSkillModal";
import { SkillFileEditor } from "./SkillFileEditor";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Modal, Textarea } from "../ui";
import "highlight.js/styles/github-dark.css";
import "./SkillMarkdown.css";
import {
  downloadSkillExport,
  getErrorMessage,
  resolveSkillDescription,
  stripFrontmatter,
} from "./detail-utils";
import { useSkillPlatform } from "./use-skill-platform";
import { SkillVersionHistoryModal } from "./SkillVersionHistoryModal";
import type { SkillSafetyReport } from "../../../shared/types";

/**
 * Full-width Skill Detail Page
 * 全宽技能详情页
 */
export type InstallMode = "copy" | "symlink";

export function SkillFullDetailPage() {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const selectedSkillId = useSkillStore((state) => state.selectedSkillId);
  const skills = useSkillStore((state) => state.skills);
  const selectSkill = useSkillStore((state) => state.selectSkill);
  const deleteSkill = useSkillStore((state) => state.deleteSkill);
  const toggleFavorite = useSkillStore((state) => state.toggleFavorite);
  const loadSkills = useSkillStore((state) => state.loadSkills);
  const syncSkillFromRepo = useSkillStore((state) => state.syncSkillFromRepo);

  const selectedSkill = useMemo(
    () => skills.find((s) => s.id === selectedSkillId),
    [skills, selectedSkillId],
  );

  const [copyStatus, setCopyStatus] = useState<Record<string, boolean>>({});
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"preview" | "code" | "files">(
    "preview",
  );

  const translationMode = useSettingsStore((state) => state.translationMode);
  const skillInstallMethod = useSettingsStore(
    (state) => state.skillInstallMethod,
  );
  const autoScanInstalledSkills = useSettingsStore(
    (state) => state.autoScanInstalledSkills,
  );
  const [installMode, setInstallMode] = useState<InstallMode>(
    () => skillInstallMethod,
  );
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [isScanningSafety, setIsScanningSafety] = useState(false);
  const [safetyReport, setSafetyReport] = useState<SkillSafetyReport | null>(
    null,
  );
  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [snapshotNote, setSnapshotNote] = useState("");
  const [resolvedSkillMdContent, setResolvedSkillMdContent] = useState("");
  const [fileEditorHasUnsavedChanges, setFileEditorHasUnsavedChanges] =
    useState(false);
  const [isUnsavedDialogOpen, setIsUnsavedDialogOpen] = useState(false);
  const [pendingUnsavedAction, setPendingUnsavedAction] = useState<
    (() => void) | null
  >(null);
  const translateContent = useSkillStore((state) => state.translateContent);
  const getTranslation = useSkillStore((state) => state.getTranslation);
  const clearTranslation = useSkillStore((state) => state.clearTranslation);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const buildDefaultSnapshotNote = () =>
    t("skill.snapshotDefaultNote", {
      timestamp: new Date().toLocaleString(i18n.language || undefined),
      defaultValue: `Manual snapshot ${new Date().toLocaleString()}`,
    });

  const targetLang = useMemo(() => {
    const lang = (i18n.language || "").toLowerCase();
    return lang.startsWith("zh")
      ? "中文"
      : lang.startsWith("ja")
        ? "日本語"
        : lang.startsWith("ko")
          ? "한국어"
          : "English";
  }, [i18n.language]);

  const resolvedDescription = useMemo(
    () => resolveSkillDescription(resolvedSkillMdContent),
    [resolvedSkillMdContent],
  );
  const safetyTone =
    safetyReport?.level === "blocked"
      ? "border-destructive/40 bg-destructive/5 text-destructive"
      : safetyReport?.level === "high-risk"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300"
        : safetyReport?.level === "warn"
          ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300"
          : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";

  const translationCacheKey = selectedSkill
    ? `skill_${selectedSkill.id}_${targetLang}_${translationMode}`
    : "";
  const descriptionTranslationCacheKey = selectedSkill
    ? `skill_desc_${selectedSkill.id}_${targetLang}_${translationMode}`
    : "";
  const cachedInstructionsTranslation = translationCacheKey
    ? getTranslation(translationCacheKey)
    : null;
  const cachedDescriptionTranslation = descriptionTranslationCacheKey
    ? getTranslation(descriptionTranslationCacheKey)
    : null;
  // Refresh when skill changes
  useEffect(() => {
    if (selectedSkill) {
      setShowTranslation(false);
    }
  }, [selectedSkill?.id]);

  useEffect(() => {
    let cancelled = false;

    async function resolveSkillMdContent() {
      if (!selectedSkill) {
        setResolvedSkillMdContent("");
        return;
      }

      try {
        const syncedSkill = await syncSkillFromRepo(selectedSkill.id);
        const repoSkillMd =
          syncedSkill?.instructions ||
          syncedSkill?.content ||
          selectedSkill.instructions ||
          selectedSkill.content ||
          "";
        if (!cancelled) {
          setResolvedSkillMdContent(repoSkillMd);
        }
      } catch {
        if (!cancelled) {
          setResolvedSkillMdContent(
            selectedSkill.instructions || selectedSkill.content || "",
          );
        }
      }
    }

    void resolveSkillMdContent();

    return () => {
      cancelled = true;
    };
  }, [
    selectedSkill?.id,
    selectedSkill?.instructions,
    selectedSkill?.content,
    selectedSkill?.updated_at,
    syncSkillFromRepo,
  ]);

  useEffect(() => {
    if (!selectedSkill || !autoScanInstalledSkills) {
      return;
    }

    let cancelled = false;

    const runScan = async () => {
      setIsScanningSafety(true);
      try {
        const report = await window.api.skill.scanSafety({
          name: selectedSkill.name,
          content:
            resolvedSkillMdContent ||
            selectedSkill.instructions ||
            selectedSkill.content,
          sourceUrl: selectedSkill.source_url,
          contentUrl: selectedSkill.content_url,
          localRepoPath: selectedSkill.local_repo_path,
        });
        if (!cancelled) {
          setSafetyReport(report);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("Failed to auto-scan skill safety:", error);
        }
      } finally {
        if (!cancelled) {
          setIsScanningSafety(false);
        }
      }
    };

    void runScan();

    return () => {
      cancelled = true;
    };
  }, [
    autoScanInstalledSkills,
    resolvedSkillMdContent,
    selectedSkill,
  ]);
  const {
    availablePlatforms,
    batchInstall: installSelectedPlatforms,
    deselectAllPlatforms,
    installProgress,
    installStatus: skillMdInstallStatus,
    isBatchInstalling,
    selectedPlatforms,
    selectAllPlatforms,
    togglePlatformSelection,
    uninstallFromPlatform: uninstallSkillFromPlatform,
    uninstalledPlatforms,
  } = useSkillPlatform(selectedSkill, installMode);

  const batchInstall = async () => {
    try {
      const result = await installSelectedPlatforms();
      if (result.successCount > 0) {
        const modeLabel =
          installMode === "symlink"
            ? t("skill.symlink", "Symlink")
            : t("skill.copyMode", "Copy");
        showToast(
          `${t("skill.installSuccess", "Installation successful")} (${modeLabel}) — ${result.successCount}/${result.totalCount}`,
          "success",
        );
      }
    } catch (error) {
      console.error("Batch install failed:", error);
      showToast(
        `${t("skill.updateFailed")}: ${getErrorMessage(error)}`,
        "error",
      );
    }
  };

  const uninstallFromPlatform = async (platformId: string) => {
    try {
      await uninstallSkillFromPlatform(platformId);
      showToast(t("skill.uninstallSuccess", "Uninstall successful"), "success");
    } catch (error) {
      console.error(`Failed to uninstall from ${platformId}:`, error);
      showToast(
        `${t("skill.updateFailed")}: ${getErrorMessage(error)}`,
        "error",
      );
    }
  };

  if (!selectedSkill) return null;

  const runSafetyScan = async () => {
    setIsScanningSafety(true);
    try {
      const report = await window.api.skill.scanSafety({
        name: selectedSkill.name,
        content:
          resolvedSkillMdContent ||
          selectedSkill.instructions ||
          selectedSkill.content,
        sourceUrl: selectedSkill.source_url,
        contentUrl: selectedSkill.content_url,
        localRepoPath: selectedSkill.local_repo_path,
      });
      setSafetyReport(report);
      return report;
    } catch (error) {
      showToast(
        `${t("skill.safetyScanFailed", "Safety scan failed")}: ${getErrorMessage(error)}`,
        "error",
      );
      return null;
    } finally {
      setIsScanningSafety(false);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopyStatus({ ...copyStatus, [key]: true });
    setTimeout(() => {
      setCopyStatus({ ...copyStatus, [key]: false });
    }, 2000);
  };

  const handleExport = async (format: "skillmd" | "json") => {
    if (!selectedSkill) return;
    try {
      const content = await window.api.skill.export(selectedSkill.id, format);
      downloadSkillExport(content, selectedSkill.name, format);

      setCopyStatus({ ...copyStatus, [`export_${format}`]: true });
      setTimeout(() => {
        setCopyStatus({ ...copyStatus, [`export_${format}`]: false });
      }, 2000);
    } catch (error) {
      showToast(
        `${t("skill.exportFailed", "Export failed")}: ${getErrorMessage(error)}`,
        "error",
      );
    }
  };

  const handleDelete = () => {
    if (!selectedSkill) return;
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedSkill) return;
    await deleteSkill(selectedSkill.id);
    setIsDeleteConfirmOpen(false);
    selectSkill(null);
  };

  const handleTranslateSkill = async (forceRefresh = false) => {
    if (!selectedSkill) return;

    if (!forceRefresh && cachedInstructionsTranslation) {
      setShowTranslation(!showTranslation);
      return;
    }

    setIsTranslating(true);
    try {
      if (forceRefresh) {
        clearTranslation(translationCacheKey);
        clearTranslation(descriptionTranslationCacheKey);
      }

      const stripped = stripFrontmatter(resolvedSkillMdContent);
      const promises: Promise<unknown>[] = [
        translateContent(stripped, translationCacheKey, targetLang, {
          forceRefresh,
        }),
      ];

      if (resolvedDescription) {
        promises.push(
          translateContent(
            resolvedDescription,
            descriptionTranslationCacheKey,
            targetLang,
            { forceRefresh },
          ),
        );
      }

      await Promise.all(promises);
      setShowTranslation(true);
      showToast(
        forceRefresh
          ? t("skill.translateRefreshed", "Translation refreshed")
          : t("skill.translateSuccess", "Translation complete"),
        "success",
      );
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "AI_NOT_CONFIGURED") {
        showToast(
          t(
            "skill.aiNotConfigured",
            "Please configure AI model in Settings first",
          ),
          "error",
        );
      } else {
        showToast(
          `${t("skill.translateFailed", "Translation failed")}: ${getErrorMessage(error)}`,
          "error",
        );
      }
    } finally {
      setIsTranslating(false);
    }
  };

  const handleContentScroll = () => {
    const scrollTop = contentScrollRef.current?.scrollTop ?? 0;
    setShowBackToTop(scrollTop > 480);
  };

  const scrollToTop = () => {
    contentScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const requestLeaveFileEditing = (action: () => void) => {
    if (activeTab !== "files" || !fileEditorHasUnsavedChanges) {
      action();
      return;
    }

    setPendingUnsavedAction(() => action);
    setIsUnsavedDialogOpen(true);
  };

  const openSnapshotModal = () => {
    setSnapshotNote(buildDefaultSnapshotNote());
    setIsSnapshotModalOpen(true);
  };

  const handleCreateSnapshot = async () => {
    if (!selectedSkill) return;

    setIsCreatingSnapshot(true);
    try {
      await window.api.skill.versionCreate(
        selectedSkill.id,
        snapshotNote.trim() || buildDefaultSnapshotNote(),
      );
      await loadSkills();
      setIsSnapshotModalOpen(false);
      showToast(t("skill.snapshotCreated"), "success");
    } catch (error) {
      console.error("Failed to create skill snapshot:", error);
      showToast(
        `${t("skill.updateFailed", "Update failed")}: ${getErrorMessage(error)}`,
        "error",
      );
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Header with back button */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              requestLeaveFileEditing(() => {
                selectSkill(null);
              });
            }}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-all active:scale-95"
            title={t("common.back", "返回")}
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <SkillIcon
            iconUrl={selectedSkill.icon_url}
            iconEmoji={selectedSkill.icon_emoji}
            backgroundColor={selectedSkill.icon_background}
            name={selectedSkill.name}
            size="lg"
          />
          <div>
            <h2 className="font-bold text-xl text-foreground leading-tight">
              {selectedSkill.name}
            </h2>
            <div className="mt-1 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
                <GlobeIcon className="w-3.5 h-3.5" />
                {selectedSkill.author || t("skill.localStorage")}
              </div>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {t("skill.currentVersion", "当前版本")} v
                {selectedSkill.currentVersion || 0}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openSnapshotModal}
            disabled={isCreatingSnapshot}
            className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:opacity-50"
            title={t("skill.createSnapshot", "创建快照")}
          >
            <SaveIcon className="h-4 w-4" />
            {t("skill.snapshot", "快照")}
          </button>
          <button
            onClick={() => toggleFavorite(selectedSkill.id)}
            className={`p-2.5 rounded-full transition-all active:scale-95 ${
              selectedSkill.is_favorite
                ? "text-yellow-500 hover:text-yellow-600"
                : "text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10"
            }`}
            title={
              selectedSkill.is_favorite
                ? t("skill.removeFavorite", "取消收藏")
                : t("skill.addFavorite", "添加收藏")
            }
          >
            <StarIcon
              className={`w-5 h-5 ${selectedSkill.is_favorite ? "fill-current" : ""}`}
            />
          </button>
          <button
            onClick={() => {
              void runSafetyScan();
            }}
            className="p-2.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full transition-all active:scale-95"
            title={t("skill.runSafetyAssessment", "立即检查")}
          >
            {safetyReport?.level === "safe" ? (
              <ShieldCheckIcon className="w-5 h-5" />
            ) : (
              <ShieldAlertIcon className="w-5 h-5" />
            )}
          </button>
          <button
            onClick={() => setIsVersionHistoryOpen(true)}
            className="p-2.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full transition-all active:scale-95"
            title={t("skill.versionHistory", "版本历史")}
          >
            <HistoryIcon className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsEditModalOpen(true)}
            className="p-2.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full transition-all active:scale-95"
            title={t("skill.edit", "编辑技能")}
          >
            <PencilIcon className="w-5 h-5" />
          </button>
          <button
            onClick={handleDelete}
            className="p-2.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-all active:scale-95"
            title={t("common.delete", "删除")}
          >
            <TrashIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 py-3 border-b border-border/70 bg-muted/10">
        <div className={`rounded-xl border px-4 py-3 ${safetyTone}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">
                {t("skill.safetyAssessment", "安全评估")}
              </div>
              <p className="mt-1 text-xs opacity-90">
                {safetyReport?.summary ||
                  t(
                    "skill.safetyAssessmentEmpty",
                    "还没有运行安全评估。你可以手动检查，也可以在设置里开启自动复查已安装 Skills。",
                  )}
              </p>
            </div>
            <button
              onClick={() => {
                void runSafetyScan();
              }}
              disabled={isScanningSafety}
              className="shrink-0 rounded-lg border border-current/20 px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50"
            >
              {isScanningSafety
                ? t("skill.safetyScanning", "检查中...")
                : t("skill.runSafetyAssessment", "立即检查")}
            </button>
          </div>
          {safetyReport && safetyReport.findings.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs opacity-90">
              {safetyReport.findings.slice(0, 4).map((finding) => (
                <li
                  key={`${finding.code}-${finding.filePath || finding.evidence || ""}`}
                >
                  • {finding.title}
                  {finding.filePath ? ` · ${finding.filePath}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center px-6 gap-6 border-b border-border bg-accent/20">
        <button
          onClick={() => {
            requestLeaveFileEditing(() => {
              setActiveTab("preview");
            });
          }}
          className={`py-3 text-sm font-semibold relative transition-colors ${activeTab === "preview" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          <div className="flex items-center gap-2">
            <BookOpenIcon className="w-4 h-4" />
            {t("common.preview", "预览")}
          </div>
          {activeTab === "preview" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
          )}
        </button>
        <button
          onClick={() => {
            requestLeaveFileEditing(() => {
              setActiveTab("code");
            });
          }}
          className={`py-3 text-sm font-semibold relative transition-colors ${activeTab === "code" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          <div className="flex items-center gap-2">
            <CodeIcon className="w-4 h-4" />
            {t("common.content", "源码/内容")}
          </div>
          {activeTab === "code" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("files")}
          className={`py-3 text-sm font-semibold relative transition-colors ${activeTab === "files" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          <div className="flex items-center gap-2">
            <FolderOpenIcon className="w-4 h-4" />
            {t("skill.files", "文件")}
          </div>
          {activeTab === "files" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
          )}
        </button>
      </div>

      {/* Main content - two column layout */}
      <div
        ref={contentScrollRef}
        onScroll={handleContentScroll}
        className="flex-1 overflow-y-auto"
      >
        {activeTab === "files" ? (
          /* Files Tab: inline file editor fills the entire content area */
          <SkillFileEditor
            skillId={selectedSkill.id}
            skillName={selectedSkill.name}
            isOpen={true}
            onSave={() => loadSkills()}
            onUnsavedChange={setFileEditorHasUnsavedChanges}
            mode="inline"
          />
        ) : (
          <div className="max-w-6xl mx-auto p-6">
            {activeTab === "preview" ? (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-stretch">
                <SkillPreviewPane
                  cachedDescriptionTranslation={cachedDescriptionTranslation}
                  cachedInstructionsTranslation={cachedInstructionsTranslation}
                  copyStatus={copyStatus}
                  handleCopy={handleCopy}
                handleTranslateSkill={handleTranslateSkill}
                isTranslating={isTranslating}
                resolvedDescription={resolvedDescription}
                selectedSkill={selectedSkill}
                showTranslation={showTranslation}
                skillContent={resolvedSkillMdContent}
                t={t}
                translationMode={translationMode}
              />

                <SkillPlatformPanel
                  availablePlatforms={availablePlatforms}
                  handleExport={handleExport}
                  installMode={installMode}
                  installProgress={installProgress}
                  isBatchInstalling={isBatchInstalling}
                  onBatchInstall={batchInstall}
                  selectedPlatforms={selectedPlatforms}
                  selectedSkill={selectedSkill}
                  selectAllPlatforms={selectAllPlatforms}
                  deselectAllPlatforms={deselectAllPlatforms}
                  setInstallMode={setInstallMode}
                  skillMdInstallStatus={skillMdInstallStatus}
                  t={t}
                  togglePlatformSelection={togglePlatformSelection}
                  uninstallFromPlatform={uninstallFromPlatform}
                  uninstalledPlatforms={uninstalledPlatforms}
                />
              </div>
            ) : (
              <SkillCodePane
                copyStatus={copyStatus}
                handleCopy={handleCopy}
                selectedSkill={selectedSkill}
                skillContent={resolvedSkillMdContent}
                t={t}
              />
            )}
          </div>
        )}
      </div>

      {showBackToTop && activeTab !== "files" && (
        <button
          onClick={scrollToTop}
          className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2 inline-flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2 text-sm font-medium text-foreground shadow-lg backdrop-blur hover:bg-accent transition-colors"
        >
          <ArrowUpIcon className="w-4 h-4" />
          {t("common.backToTop", "回到顶部")}
        </button>
      )}

      {/* Edit Modal */}
      <EditSkillModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        skill={selectedSkill}
      />

      {/* Delete confirmation dialog */}
      {/* 删除确认对话框 */}
      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={confirmDelete}
        variant="destructive"
        title={t("skill.confirmDeleteTitle", "确认删除")}
        message={
          <div className="space-y-2">
            <p>
              {t("skill.confirmDeleteSingle", {
                name: selectedSkill?.name || "",
                defaultValue: `确定要删除技能「${selectedSkill?.name || ""}」吗？`,
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
      <UnsavedChangesDialog
        isOpen={isUnsavedDialogOpen}
        onClose={() => {
          setIsUnsavedDialogOpen(false);
          setPendingUnsavedAction(null);
        }}
        onSave={() => {
          setIsUnsavedDialogOpen(false);
          setPendingUnsavedAction(null);
        }}
        onDiscard={() => {
          setIsUnsavedDialogOpen(false);
          pendingUnsavedAction?.();
          setPendingUnsavedAction(null);
        }}
      />

      <SkillVersionHistoryModal
        isOpen={isVersionHistoryOpen}
        onClose={() => setIsVersionHistoryOpen(false)}
        skill={selectedSkill}
        currentContent={resolvedSkillMdContent}
        onReload={loadSkills}
      />

      <Modal
        isOpen={isSnapshotModalOpen}
        onClose={() => {
          if (!isCreatingSnapshot) {
            setIsSnapshotModalOpen(false);
          }
        }}
        title={t("skill.createSnapshot", "创建快照")}
        size="lg"
      >
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            {t(
              "skill.snapshotPrompt",
              "输入本次快照说明",
            )}
          </div>
          <Textarea
            value={snapshotNote}
            onChange={(event) => setSnapshotNote(event.target.value)}
            placeholder={t(
              "skill.versionNotePlaceholder",
              "描述本次变更...",
            )}
            rows={4}
            autoFocus
            disabled={isCreatingSnapshot}
          />
          <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setIsSnapshotModalOpen(false)}
              disabled={isCreatingSnapshot}
              className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              {t("common.cancel", "取消")}
            </button>
            <button
              type="button"
              onClick={handleCreateSnapshot}
              disabled={isCreatingSnapshot}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isCreatingSnapshot ? (
                <>
                  <SaveIcon className="h-4 w-4 animate-pulse" />
                  {t("common.saving", "保存中")}
                </>
              ) : (
                <>
                  <SaveIcon className="h-4 w-4" />
                  {t("skill.createSnapshot", "创建快照")}
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
