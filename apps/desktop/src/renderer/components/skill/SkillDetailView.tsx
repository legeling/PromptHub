import { useTranslation } from "react-i18next";
import {
  XIcon,
  CuboidIcon,
  GithubIcon,
  CopyIcon,
  CheckIcon,
  DownloadIcon,
  SendIcon,
  GlobeIcon,
  Edit3Icon,
  BookOpenIcon,
  CodeIcon,
  ChevronRightIcon,
  PencilIcon,
  FileTextIcon,
  PackageIcon,
  Loader2Icon,
  CheckSquareIcon,
  SquareIcon,
  FolderOpenIcon,
  LinkIcon,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSkillStore } from "../../stores/skill.store";
import { useSettingsStore } from "../../stores/settings.store";
import { useToast } from "../ui/Toast";
import { UnsavedChangesDialog } from "../ui/UnsavedChangesDialog";
import { PlatformIcon } from "../ui/PlatformIcon";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import "highlight.js/styles/github-dark.css";
import {
  downloadSkillExport,
  downloadSkillZipExport,
  getErrorMessage,
  getSkillSourceMeta,
} from "./detail-utils";
import { useSkillPlatform } from "./use-skill-platform";
import { copyTextToClipboard } from "../../utils/clipboard";

const LazyEditSkillModal = lazy(() =>
  import("./EditSkillModal").then((module) => ({
    default: module.EditSkillModal,
  })),
);
const LazySkillFileEditor = lazy(() =>
  import("./SkillFileEditor").then((module) => ({
    default: module.SkillFileEditor,
  })),
);
const LazySkillMarkdown = lazy(() =>
  import("./SkillMarkdown").then((module) => ({
    default: module.SkillMarkdown,
  })),
);

export function SkillDetailView() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const selectedSkillId = useSkillStore((state) => state.selectedSkillId);
  const skills = useSkillStore((state) => state.skills);
  const selectSkill = useSkillStore((state) => state.selectSkill);
  const updateSkill = useSkillStore((state) => state.updateSkill);
  const skillInstallMethod = useSettingsStore(
    (state) => state.skillInstallMethod,
  );

  // Memoize selectedSkill to avoid unnecessary re-renders
  // 使用 useMemo 缓存 selectedSkill，避免不必要的重新渲染
  const selectedSkill = useMemo(
    () => skills.find((s) => s.id === selectedSkillId),
    [skills, selectedSkillId],
  );

  const [copyStatus, setCopyStatus] = useState<Record<string, boolean>>({});
  const copyStatusTimersRef = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});
  const isMountedRef = useRef(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isFileEditorOpen, setIsFileEditorOpen] = useState(false);
  const [fileEditorHasUnsavedChanges, setFileEditorHasUnsavedChanges] =
    useState(false);
  const [isUnsavedDialogOpen, setIsUnsavedDialogOpen] = useState(false);
  const [pendingUnsavedAction, setPendingUnsavedAction] = useState<
    (() => void) | null
  >(null);
  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview");
  const [editedInstructions, setEditedInstructions] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Confirmation dialog states
  // 确认对话框状态
  const [confirmInstallOpen, setConfirmInstallOpen] = useState(false);
  const [confirmUninstallOpen, setConfirmUninstallOpen] = useState(false);
  const [pendingUninstallPlatform, setPendingUninstallPlatform] = useState<
    string | null
  >(null);

  // Refresh status when skill selection changes
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      Object.values(copyStatusTimersRef.current).forEach((timer) => {
        clearTimeout(timer);
      });
      copyStatusTimersRef.current = {};
    };
  }, []);

  const clearCopyStatusTimer = useCallback((key: string) => {
    const timer = copyStatusTimersRef.current[key];
    if (timer) {
      clearTimeout(timer);
      delete copyStatusTimersRef.current[key];
    }
  }, []);

  const scheduleCopyStatusReset = useCallback(
    (key: string) => {
      clearCopyStatusTimer(key);
      copyStatusTimersRef.current[key] = setTimeout(() => {
        if (!isMountedRef.current) {
          return;
        }
        setCopyStatus((current) => ({ ...current, [key]: false }));
        delete copyStatusTimersRef.current[key];
      }, 2000);
    },
    [clearCopyStatusTimer],
  );

  useEffect(() => {
    if (selectedSkill) {
      setEditedInstructions(selectedSkill.instructions || "");
      setIsEditing(false);
      setCopyStatus({});
      Object.values(copyStatusTimersRef.current).forEach((timer) => {
        clearTimeout(timer);
      });
      copyStatusTimersRef.current = {};
    }
  }, [selectedSkill?.id]);
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
    uninstallFromPlatform,
    uninstalledPlatforms,
  } = useSkillPlatform(selectedSkill, skillInstallMethod);

  // Show install confirmation dialog
  // 显示安装确认对话框
  const showInstallConfirm = () => {
    if (!selectedSkill || selectedPlatforms.size === 0) return;
    setConfirmInstallOpen(true);
  };

  const requestCloseFileEditor = (action: () => void) => {
    if (!fileEditorHasUnsavedChanges) {
      action();
      return;
    }

    setPendingUnsavedAction(() => action);
    setIsUnsavedDialogOpen(true);
  };

  // Batch install selected platforms (called after confirmation)
  // 批量安装选中的平台（确认后调用）
  const batchInstall = async () => {
    setConfirmInstallOpen(false);

    try {
      const result = await installSelectedPlatforms();
      if (result.successCount > 0) {
        showToast(
          `${t("skill.installSuccess", "Operation successful")} ${result.successCount}/${result.totalCount}`,
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

  // Show uninstall confirmation dialog
  // 显示卸载确认对话框
  const showUninstallConfirm = (platformId: string) => {
    if (!selectedSkill) return;
    setPendingUninstallPlatform(platformId);
    setConfirmUninstallOpen(true);
  };

  // Uninstall from a single platform (called after confirmation)
  // 从单个平台卸载（确认后调用）
  const confirmUninstallFromPlatform = async () => {
    if (!selectedSkill || !pendingUninstallPlatform) return;

    setConfirmUninstallOpen(false);
    const platformId = pendingUninstallPlatform;
    setPendingUninstallPlatform(null);

    try {
      await uninstallFromPlatform(platformId);
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
  const sourceMeta = getSkillSourceMeta(selectedSkill, t);

  const handleCopy = async (text: string, key: string) => {
    try {
      await copyTextToClipboard(text);
      setCopyStatus((current) => ({ ...current, [key]: true }));
      scheduleCopyStatusReset(key);
    } catch (error) {
      console.error("Failed to copy skill content:", error);
      showToast(t("common.copyFailed", "Copy failed"), "error");
    }
  };

  const handleSaveInstructions = async () => {
    if (!selectedSkill) return;
    setIsSaving(true);
    try {
      await updateSkill(selectedSkill.id, { instructions: editedInstructions });
      setIsEditing(false);
    } catch (error) {
      showToast(
        `${t("skill.updateFailed")}: ${getErrorMessage(error)}`,
        "error",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async (format: "skillmd" | "zip") => {
    if (!selectedSkill) return;
    try {
      if (format === "zip") {
        const zipResult = await window.api.skill.exportZip(selectedSkill.id);
        downloadSkillZipExport(zipResult);
      } else {
        const content = await window.api.skill.export(selectedSkill.id, format);
        downloadSkillExport(content, selectedSkill.name, format);
      }

      if (!isMountedRef.current) {
        return;
      }
      const statusKey = `export_${format}`;
      setCopyStatus((current) => ({ ...current, [statusKey]: true }));
      scheduleCopyStatusReset(statusKey);
    } catch (error) {
      showToast(
        `${t("skill.exportFailed", "Export failed")}: ${getErrorMessage(error)}`,
        "error",
      );
    }
  };

  return (
    <div className="flex flex-col h-full app-wallpaper-panel border-l border-border animate-in slide-in-from-right duration-smooth w-full md:w-[500px] lg:w-[650px] shadow-2xl relative z-30">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 app-wallpaper-surface z-10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary text-white rounded-2xl shadow-lg shadow-primary/20">
            <CuboidIcon aria-hidden="true" className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-bold text-xl text-foreground leading-tight">
              {selectedSkill.name}
            </h2>
            <div className="flex items-center gap-3 mt-1.5">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
                <GlobeIcon aria-hidden="true" className="w-3.5 h-3.5" />
                {selectedSkill.author || t("skill.localStorage")}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsEditModalOpen(true)}
            className="p-2.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full transition-all active:scale-press-in"
            title={t("skill.edit", "Edit Skill")}
          >
            <PencilIcon aria-hidden="true" className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setIsFileEditorOpen(true)}
            className="p-2.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full transition-all active:scale-press-in"
            title={t("skill.fileEditor", "File Editor")}
          >
            <FolderOpenIcon aria-hidden="true" className="w-5 h-5" />
          </button>
          <button
            type="button"
            aria-label={t("common.close", "Close")}
            onClick={() => selectSkill(null)}
            className="p-2.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-full transition-all active:scale-press-in"
          >
            <XIcon aria-hidden="true" className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center px-6 gap-6 border-b border-border bg-accent/20">
        <button
          type="button"
          onClick={() => setActiveTab("preview")}
          className={`py-3 text-sm font-semibold relative transition-colors ${activeTab === "preview" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          <div className="flex items-center gap-2">
            <BookOpenIcon aria-hidden="true" className="w-4 h-4" />
            {t("common.preview", "Preview")}
          </div>
          {activeTab === "preview" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("code")}
          className={`py-3 text-sm font-semibold relative transition-colors ${activeTab === "code" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          <div className="flex items-center gap-2">
            <CodeIcon aria-hidden="true" className="w-4 h-4" />
            {t("common.content", "Source")}
          </div>
          {activeTab === "code" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-32">
        {activeTab === "preview" ? (
          <>
            {/* Description */}
            <section className="space-y-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2">
                {t("skill.skillDescription", "Description")}
              </h3>
              <div className="bg-accent/10 p-5 rounded-2xl border border-white/5">
                <p className="text-base text-foreground/90 leading-relaxed italic">
                  {selectedSkill.description ||
                    t("skill.defaultDescriptionLong")}
                </p>
              </div>
            </section>

            {/* SKILL.md Platform Installation */}
            {/* SKILL.md 平台安装 */}
            {availablePlatforms.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">
                    {t("skill.platformIntegration").toUpperCase()}
                  </h3>
                  <span className="text-[10px] text-muted-foreground">
                    SKILL.md
                  </span>
                </div>

                {/* Batch install toolbar */}
                {/* 批量安装工具栏 */}
                {uninstalledPlatforms.length > 0 && (
                  <div className="flex items-center justify-between gap-2 p-3 bg-accent/30 rounded-xl border border-border">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={
                          selectedPlatforms.size === uninstalledPlatforms.length
                            ? deselectAllPlatforms
                            : selectAllPlatforms
                        }
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
                        disabled={isBatchInstalling}
                      >
                        {selectedPlatforms.size ===
                        uninstalledPlatforms.length ? (
                          <>
                            <CheckSquareIcon
                              aria-hidden="true"
                              className="w-4 h-4"
                            />
                            {t("skill.deselectAll", "Deselect All")}
                          </>
                        ) : (
                          <>
                            <SquareIcon
                              aria-hidden="true"
                              className="w-4 h-4"
                            />
                            {t("skill.selectAll", "Select All")}
                          </>
                        )}
                      </button>
                      {selectedPlatforms.size > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {t("skill.selected", "Selected")}{" "}
                          {selectedPlatforms.size}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={showInstallConfirm}
                      disabled={
                        selectedPlatforms.size === 0 || isBatchInstalling
                      }
                      className="px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-lg shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                    >
                      {isBatchInstalling ? (
                        <>
                          <Loader2Icon
                            aria-hidden="true"
                            className="w-3.5 h-3.5 animate-spin"
                          />
                          {installProgress
                            ? `${installProgress.current}/${installProgress.total}`
                            : t("skill.installing", "Installing...")}
                        </>
                      ) : (
                        <>
                          <SendIcon
                            aria-hidden="true"
                            className="w-3.5 h-3.5"
                          />
                          {t("skill.batchInstall", "Install All")}
                        </>
                      )}
                    </button>
                  </div>
                )}

                <div
                  className={`grid gap-3 ${availablePlatforms.length === 1 ? "grid-cols-1" : availablePlatforms.length === 2 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-3"}`}
                >
                  {availablePlatforms.map((platform) => {
                    const isInstalled = skillMdInstallStatus[platform.id];
                    const isSelected = selectedPlatforms.has(platform.id);

                    return (
                      <div
                        key={platform.id}
                        className={`relative rounded-2xl border transition-all ${
                          isInstalled
                            ? "bg-primary/5 border-primary shadow-sm cursor-default"
                            : isSelected
                              ? "bg-primary/10 border-primary cursor-pointer"
                              : "bg-sidebar-accent/30 border-border hover:bg-sidebar-accent/50 cursor-pointer"
                        } ${isBatchInstalling && !isInstalled ? "opacity-70 cursor-wait" : ""}`}
                      >
                        <button
                          type="button"
                          aria-label={platform.name}
                          aria-pressed={isInstalled ? undefined : isSelected}
                          disabled={isInstalled || isBatchInstalling}
                          onClick={() => togglePlatformSelection(platform.id)}
                          className={`w-full p-4 text-left rounded-2xl disabled:cursor-default disabled:opacity-100 ${isInstalled ? "pr-24" : ""}`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div
                              aria-hidden="true"
                              className="w-8 h-8 flex items-center justify-center flex-shrink-0"
                            >
                              <PlatformIcon
                                aria-hidden="true"
                                platformId={platform.id}
                                size={26}
                              />
                            </div>
                            {isInstalled ? (
                              <CheckIcon
                                aria-hidden="true"
                                className="w-4 h-4 text-primary"
                              />
                            ) : (
                              <div
                                aria-hidden="true"
                                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                  isSelected
                                    ? "bg-primary border-primary"
                                    : "border-muted-foreground/30"
                                }`}
                              >
                                {isSelected && (
                                  <CheckIcon
                                    aria-hidden="true"
                                    className="w-3 h-3 text-white"
                                  />
                                )}
                              </div>
                            )}
                          </div>
                          <h4 className="font-bold text-sm">{platform.name}</h4>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {isInstalled
                              ? t("skill.installed")
                              : isSelected
                                ? t(
                                    "skill.selectedForInstall",
                                    "Pending install",
                                  )
                                : t("skill.clickToSelect", "Click to select")}
                          </p>
                        </button>
                        {isInstalled && (
                          <button
                            type="button"
                            onClick={() => showUninstallConfirm(platform.id)}
                            className="absolute top-4 right-4 text-[10px] text-destructive hover:underline"
                            title={t("skill.uninstall", "Uninstall")}
                          >
                            {t("skill.uninstall", "Uninstall")}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Markdown Instructions */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2">
                  {t("skill.instructionsSection")}
                  <span className="text-[10px] lowercase font-normal opacity-60">
                    {t("common.preview")}
                  </span>
                </h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void handleCopy(selectedSkill.instructions || "", "instr")
                    }
                    className="p-1 px-3 bg-accent/50 hover:bg-accent rounded-lg text-xs flex items-center gap-1.5 transition-colors"
                  >
                    {copyStatus["instr"] ? (
                      <CheckIcon
                        aria-hidden="true"
                        className="w-3.5 h-3.5 text-green-500"
                      />
                    ) : (
                      <CopyIcon aria-hidden="true" className="w-3.5 h-3.5" />
                    )}
                    {copyStatus["instr"]
                      ? t("skill.copied")
                      : t("skill.copyMd")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(!isEditing)}
                    className={`p-1 px-3 rounded-lg text-xs flex items-center gap-1.5 transition-colors ${isEditing ? "bg-primary text-white" : "bg-accent/50 hover:bg-accent"}`}
                  >
                    <Edit3Icon aria-hidden="true" className="w-3.5 h-3.5" />
                    {isEditing ? t("skill.editing") : t("common.edit")}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-sidebar-accent/20 overflow-hidden shadow-inner min-h-[200px]">
                {isEditing ? (
                  <div className="flex flex-col">
                    <textarea
                      value={editedInstructions}
                      onChange={(e) => setEditedInstructions(e.target.value)}
                      className="w-full h-[400px] p-5 bg-background text-sm font-mono border-none focus:ring-0 focus:outline-none resize-none overflow-auto"
                      placeholder={t("skill.instructionsPlaceholder")}
                    />
                    <div className="p-3 bg-accent/30 border-t border-border flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditing(false);
                          setEditedInstructions(
                            selectedSkill.instructions || "",
                          );
                        }}
                        className="px-3 py-1.5 text-xs text-muted-foreground hover:bg-white/5 rounded-lg transition-colors"
                      >
                        {t("skill.cancel")}
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveInstructions}
                        disabled={isSaving}
                        className="px-4 py-1.5 bg-primary text-white text-xs font-bold rounded-lg shadow-lg shadow-primary/20 disabled:opacity-50"
                      >
                        {isSaving ? t("common.saving") : t("skill.saveChanges")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 prose dark:prose-invert prose-sm max-w-none prose-pre:bg-muted prose-pre:border prose-pre:border-border text-[13px]">
                    {selectedSkill.instructions ? (
                      <div className="markdown-body">
                        <Suspense
                          fallback={
                            <div className="text-sm text-muted-foreground">
                              {t("common.loading", "Loading...")}
                            </div>
                          }
                        >
                          <LazySkillMarkdown
                            content={selectedSkill.instructions}
                            sourceUrl={selectedSkill.source_url}
                            contentUrl={selectedSkill.content_url}
                            enableHighlight
                          />
                        </Suspense>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-10 opacity-30">
                        <BookOpenIcon
                          aria-hidden="true"
                          className="w-12 h-12 mb-2"
                        />
                        <p>{t("skill.noInstructions")}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </>
        ) : (
          /* Source Tab: Raw Config & Metadata */
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-smooth">
            <section className="space-y-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">
                {t("skill.metadata").toUpperCase()}
              </h3>
              <div className="bg-accent/10 border border-white/5 rounded-2xl p-5 space-y-4">
                <div className="flex justify-between items-center text-sm border-b border-white/5 pb-3">
                  <span className="text-muted-foreground">{t("skill.id")}</span>
                  <span className="font-mono text-[11px] bg-black/30 px-2 py-0.5 rounded">
                    {selectedSkill.id}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm border-b border-white/5 pb-3">
                  <span className="text-muted-foreground">
                    {t("skill.protocol")}
                  </span>
                  <span className="font-bold uppercase tracking-tight flex items-center gap-1.5 text-primary">
                    <ChevronRightIcon aria-hidden="true" className="w-4 h-4" />
                    {selectedSkill.protocol_type}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm border-b border-white/5 pb-3">
                  <span className="text-muted-foreground">
                    {t("skill.createdAt")}
                  </span>
                  <span className="opacity-80">
                    {new Date(selectedSkill.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">
                    {t("skill.updatedAt")}
                  </span>
                  <span className="opacity-80">
                    {new Date(selectedSkill.updated_at).toLocaleString()}
                  </span>
                </div>
              </div>
            </section>

            {sourceMeta && (
              <section>
                {sourceMeta.kind === "local" ? (
                  <button
                    type="button"
                    onClick={() =>
                      window.electron?.openPath?.(sourceMeta.value)
                    }
                    className="w-full flex items-center justify-center gap-3 p-5 bg-accent/70 border border-border text-foreground rounded-2xl hover:bg-accent transition-colors font-bold shadow-lg"
                  >
                    <FolderOpenIcon aria-hidden="true" className="w-5 h-5" />
                    {t("skill.openLocalSource", "Open Local Skill Folder")}
                  </button>
                ) : (
                  <a
                    href={sourceMeta.value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center justify-center gap-3 p-5 text-white rounded-2xl hover:opacity-90 transition-opacity font-bold shadow-lg ${
                      sourceMeta.kind === "github"
                        ? "bg-github"
                        : "bg-slate-700"
                    }`}
                  >
                    {sourceMeta.kind === "github" ? (
                      <GithubIcon aria-hidden="true" className="w-5 h-5" />
                    ) : (
                      <LinkIcon aria-hidden="true" className="w-5 h-5" />
                    )}
                    {sourceMeta.kind === "github"
                      ? t("skill.visitRepo", "Visit Skill Repository")
                      : t("skill.openRemoteSource", "Open Source Link")}
                  </a>
                )}
              </section>
            )}

            {/* Export Section */}
            <section className="space-y-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">
                {t("skill.export", "Export")}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleExport("skillmd")}
                  className="flex items-center justify-center gap-2 p-4 bg-accent/50 hover:bg-accent border border-border rounded-xl transition-colors group"
                >
                  <FileTextIcon
                    aria-hidden="true"
                    className="w-5 h-5 text-primary"
                  />
                  <div className="text-left">
                    <div className="font-medium text-sm">SKILL.md</div>
                    <div className="text-[10px] text-muted-foreground">
                      {t("skill.exportSkillMd", "Claude compatible format")}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleExport("zip")}
                  className="flex items-center justify-center gap-2 p-4 bg-accent/50 hover:bg-accent border border-border rounded-xl transition-colors group"
                >
                  <PackageIcon
                    aria-hidden="true"
                    className="w-5 h-5 text-primary"
                  />
                  <div className="text-left">
                    <div className="font-medium text-sm">ZIP</div>
                    <div className="text-[10px] text-muted-foreground">
                      {t("skill.exportZip", "Full local repo archive")}
                    </div>
                  </div>
                </button>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && (
        <Suspense fallback={null}>
          <LazyEditSkillModal
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            skill={selectedSkill}
          />
        </Suspense>
      )}

      {/* File Editor Modal */}
      {isFileEditorOpen && (
        <Suspense fallback={null}>
          <LazySkillFileEditor
            skillId={selectedSkill.id}
            skillName={selectedSkill.name}
            isOpen={isFileEditorOpen}
            onClose={() => {
              requestCloseFileEditor(() => {
                setIsFileEditorOpen(false);
              });
            }}
            onUnsavedChange={setFileEditorHasUnsavedChanges}
          />
        </Suspense>
      )}
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

      {/* Install Confirmation Dialog */}
      {/* 安装确认对话框 */}
      <ConfirmDialog
        isOpen={confirmInstallOpen}
        onClose={() => setConfirmInstallOpen(false)}
        onConfirm={batchInstall}
        title={t("skill.confirmInstallTitle", "Confirm Install")}
        message={
          <div>
            <p>
              {t(
                "skill.confirmInstallMessage",
                "Install skill to the following platforms:",
              )}
            </p>
            <ul className="mt-2 space-y-1">
              {Array.from(selectedPlatforms).map((platformId) => {
                const platform = availablePlatforms.find(
                  (p) => p.id === platformId,
                );
                return platform ? (
                  <li
                    key={platformId}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span aria-hidden="true">
                      <PlatformIcon
                        aria-hidden="true"
                        platformId={platformId}
                        size={16}
                      />
                    </span>
                    <span>{platform.name}</span>
                  </li>
                ) : null;
              })}
            </ul>
          </div>
        }
        confirmText={t("skill.batchInstall", "Install All")}
        cancelText={t("common.cancel", "Cancel")}
      />

      {/* Uninstall Confirmation Dialog */}
      {/* 卸载确认对话框 */}
      <ConfirmDialog
        isOpen={confirmUninstallOpen}
        onClose={() => {
          setConfirmUninstallOpen(false);
          setPendingUninstallPlatform(null);
        }}
        onConfirm={confirmUninstallFromPlatform}
        title={t("skill.confirmUninstallTitle", "Confirm Uninstall")}
        message={
          pendingUninstallPlatform ? (
            <p>
              {t(
                "skill.confirmUninstallMessage",
                "Are you sure you want to uninstall this skill from {{platform}}?",
                {
                  platform:
                    availablePlatforms.find(
                      (p) => p.id === pendingUninstallPlatform,
                    )?.name || pendingUninstallPlatform,
                },
              )}
            </p>
          ) : null
        }
        confirmText={t("skill.uninstall", "Uninstall")}
        cancelText={t("common.cancel", "Cancel")}
        variant="destructive"
      />
    </div>
  );
}
