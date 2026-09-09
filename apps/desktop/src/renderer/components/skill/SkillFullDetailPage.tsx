import { runSkillContentSafetyScan } from "../../services/skill-content-scan";
import { useTranslation } from "react-i18next";
import { SaveIcon } from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useId,
  useState,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { normalizeLocalSkillDirectoryPath } from "../../services/skill-store-source";
import { useSkillStore } from "../../stores/skill.store";
import { useSettingsStore } from "../../stores/settings.store";
import { useToast } from "../ui/Toast";
import { UnsavedChangesDialog } from "../ui/UnsavedChangesDialog";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Modal, Textarea } from "../ui";
import "highlight.js/styles/github-dark.css";
import "./SkillMarkdown.css";
import {
  downloadSkillExport,
  downloadSkillZipExport,
  formatSkillSafetyScanError,
  formatSkillTranslationError,
  getErrorMessage,
  getSafetyScanAIConfig,
  resolveSkillDescription,
} from "./detail-utils";
import { computeSkillContentFingerprint } from "../../services/skill-store-update";
import {
  isSkillTranslationStale,
  readSkillTranslationSidecar,
  writeSkillTranslationSidecar,
  type SkillTranslationSidecar,
} from "../../services/skill-translation-sidecar";
import {
  readSkillUserSidecar,
  writeSkillUserSidecar,
} from "../../services/skill-user-sidecar";
import { scheduleAllSaveSync } from "../../services/webdav-save-sync";
import { useSkillPlatform } from "./use-skill-platform";
import { SkillVersionHistoryModal } from "./SkillVersionHistoryModal";
import type { SkillSafetyReport } from "@prompthub/shared/types";
import { type ProjectDeployedSkillTarget } from "../../services/project-skill-targets";
import { getRuntimeCapabilities } from "../../runtime";
import { copyTextToClipboard } from "../../utils/clipboard";
import { SkillUpdateSafetyReviewDialog } from "./SkillUpdateSafetyReviewDialog";
import { SkillStoreUpdateReviewDialog } from "./SkillStoreUpdateReviewDialog";
import { useSkillSourceUpdate } from "./useSkillSourceUpdate";
import {
  getProjectDeployTargets,
  useSkillProjectDistribution,
} from "./useSkillProjectDistribution";
import { SkillSafetyReportModal } from "./SkillSafetyReportModal";
import { SkillDetailHeader } from "./SkillDetailHeader";
import { SkillDetailTabs } from "./SkillDetailTabs";
import { SkillDetailContent } from "./SkillDetailContent";
import type { SkillFullDetailPageProps } from "./skill-detail-types";
const LazyEditSkillModal = lazy(() =>
  import("./EditSkillModal").then((module) => ({
    default: module.EditSkillModal,
  })),
);

/**
 * Full-width Skill Detail Page
 * 全宽技能详情页
 */
export type InstallMode = "copy" | "symlink";

export function SkillFullDetailPage({
  overrideSkill,
  agentActions,
  agentContext,
  projectContext,
  projectActions,
  onBack,
}: SkillFullDetailPageProps = {}) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const runtimeCapabilities = getRuntimeCapabilities();
  const selectedSkillId = useSkillStore((state) => state.selectedSkillId);
  const skills = useSkillStore((state) => state.skills);
  const selectSkill = useSkillStore((state) => state.selectSkill);
  const deleteSkill = useSkillStore((state) => state.deleteSkill);
  const toggleFavorite = useSkillStore((state) => state.toggleFavorite);
  const loadSkills = useSkillStore((state) => state.loadSkills);
  const syncSkillFromRepo = useSkillStore((state) => state.syncSkillFromRepo);
  const saveSafetyReport = useSkillStore((state) => state.saveSafetyReport);

  const selectedSkill = useMemo(() => {
    if (overrideSkill) {
      return overrideSkill;
    }
    return skills.find((s) => s.id === selectedSkillId);
  }, [overrideSkill, skills, selectedSkillId]);
  const displayCurrentVersion = Math.max(selectedSkill?.currentVersion ?? 0, 1);
  const isProjectDetail = Boolean(projectContext);
  const isAgentDetail = Boolean(agentContext);
  const isExternalDetail = isProjectDetail || isAgentDetail;
  const selectedSkillRecordId = selectedSkill?.id ?? null;
  const sourceUpdate = useSkillSourceUpdate(selectedSkill ?? null);
  const isCheckingSourceUpdate = sourceUpdate.isChecking;
  const isUpdatingSource = sourceUpdate.isUpdating;
  const handleCheckSourceUpdate = sourceUpdate.check;
  const projectDistribution = useSkillProjectDistribution(
    selectedSkill ?? null,
  );
  const {
    skillProjects,
    isDeploying: isProjectDeploying,
    deleteDistributionSummary: projectDeleteDistributionSummary,
    pendingRemoval: pendingProjectRemoval,
    deployMode: projectDeployMode,
    openCreateProjectModal,
    deployToProjects: handleDeployToProjects,
    setProjectDeployMode: handleSetProjectDeployMode,
    getDeployedTargets: getProjectDeployedTargets,
    requestRemove: requestRemoveFromProjectTargets,
    getAllDeployedTargets: getAllProjectDeployedTargets,
    inspectDeleteDistribution: inspectProjectDeleteDistribution,
    confirmRemove: confirmRemoveFromProjectTargets,
    cancelPendingRemoval,
    resetDeleteDistributionSummary,
  } = projectDistribution;
  const deleteCopyInstallationsInputId = useId();
  const deleteCopyInstallationsLabelId = useId();
  const deleteCopyInstallationsHelpId = useId();

  const [copyStatus, setCopyStatus] = useState<Record<string, boolean>>({});
  const copyStatusTimersRef = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});
  const isMountedRef = useRef(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"preview" | "code" | "files">(
    "preview",
  );

  const translationMode = useSettingsStore((state) => state.translationMode);
  const skillInstallMethod = useSettingsStore(
    (state) => state.skillInstallMethod,
  );
  const projectSkillImportPreferencesByProjectId = useSettingsStore(
    (state) => state.projectSkillImportPreferencesByProjectId,
  );
  const setProjectSkillImportPreferences = useSettingsStore(
    (state) => state.setProjectSkillImportPreferences,
  );
  const aiModels = useSettingsStore((state) => state.aiModels);
  const [installMode, setInstallMode] = useState<InstallMode>(
    () => skillInstallMethod,
  );
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeletingSkill, setIsDeletingSkill] = useState(false);
  const [pendingUninstallPlatform, setPendingUninstallPlatform] = useState<
    string | null
  >(null);
  const [isUninstallingPlatform, setIsUninstallingPlatform] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [isScanningSafety, setIsScanningSafety] = useState(false);
  const [isSafetyModalOpen, setIsSafetyModalOpen] = useState(false);
  const [safetyReport, setSafetyReport] = useState<SkillSafetyReport | null>(
    () => selectedSkill?.safetyReport ?? null,
  );
  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [skillUserNotes, setSkillUserNotes] = useState("");
  const [draftSkillUserNotes, setDraftSkillUserNotes] = useState("");
  const [isEditingUserNotes, setIsEditingUserNotes] = useState(false);
  const [isLoadingUserNotes, setIsLoadingUserNotes] = useState(false);
  const [isSavingUserNotes, setIsSavingUserNotes] = useState(false);
  const [deleteCopyInstallations, setDeleteCopyInstallations] = useState(false);
  const [snapshotNote, setSnapshotNote] = useState("");
  const [resolvedSkillMdContent, setResolvedSkillMdContent] = useState("");
  const [fileEditorHasUnsavedChanges, setFileEditorHasUnsavedChanges] =
    useState(false);
  const [isUnsavedDialogOpen, setIsUnsavedDialogOpen] = useState(false);
  const [pendingUnsavedAction, setPendingUnsavedAction] = useState<
    (() => void) | null
  >(null);
  const translateContent = useSkillStore((state) => state.translateContent);
  const getTranslationState = useSkillStore(
    (state) => state.getTranslationState,
  );
  const clearTranslation = useSkillStore((state) => state.clearTranslation);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const stalePromptFingerprintRef = useRef<string | null>(null);
  const translationInFlightRef = useRef(false);
  const safetyScanInFlightRef =
    useRef<Promise<SkillSafetyReport | null> | null>(null);
  const userNotesSaveInFlightRef = useRef(false);
  const snapshotCreateInFlightRef = useRef(false);
  const deleteInFlightRef = useRef(false);
  const platformInstallInFlightRef = useRef(false);
  const platformUninstallInFlightRef = useRef(false);
  const [isRetranslatePromptOpen, setIsRetranslatePromptOpen] = useState(false);

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

  const safetyTone =
    safetyReport?.level === "blocked"
      ? "border-destructive/40 bg-destructive/5 text-destructive"
      : safetyReport?.level === "high-risk"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300"
        : safetyReport?.level === "warn"
          ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300"
          : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  const translationCacheKey = selectedSkill
    ? `skilldoc_v2_${selectedSkill.id}_${targetLang}_${translationMode}`
    : "";
  const instructionsTranslationFingerprint = useMemo(
    () => computeSkillContentFingerprint(resolvedSkillMdContent),
    [resolvedSkillMdContent],
  );
  const instructionsTranslationState = translationCacheKey
    ? getTranslationState(
        translationCacheKey,
        instructionsTranslationFingerprint,
      )
    : { value: null, hasTranslation: false, isStale: false };
  const [translationSidecar, setTranslationSidecar] =
    useState<SkillTranslationSidecar | null>(null);
  const hasSidecarTranslation = Boolean(translationSidecar?.content);
  const hasStaleTranslation = translationSidecar
    ? isSkillTranslationStale(translationSidecar, resolvedSkillMdContent)
    : instructionsTranslationState.isStale;
  const hasSavedTranslation =
    hasSidecarTranslation || instructionsTranslationState.hasTranslation;
  const effectiveInstructionsTranslation = hasStaleTranslation
    ? null
    : (translationSidecar?.content ?? instructionsTranslationState.value);
  const hasDisplayableTranslation = Boolean(effectiveInstructionsTranslation);
  const effectiveSkillMdContent =
    showTranslation && effectiveInstructionsTranslation
      ? effectiveInstructionsTranslation
      : resolvedSkillMdContent;
  const resolvedDescription = useMemo(
    () =>
      resolveSkillDescription(effectiveSkillMdContent) ||
      selectedSkill?.description ||
      "",
    [effectiveSkillMdContent, selectedSkill?.description],
  );
  // Refresh when skill changes
  useEffect(() => {
    if (!runtimeCapabilities.skillFileEditing && activeTab === "files") {
      setActiveTab("preview");
    }
  }, [activeTab, runtimeCapabilities.skillFileEditing]);

  useEffect(() => {
    if (selectedSkill) {
      setCopyStatus({});
      Object.values(copyStatusTimersRef.current).forEach((timer) => {
        clearTimeout(timer);
      });
      copyStatusTimersRef.current = {};
      stalePromptFingerprintRef.current = null;
      setShowTranslation(false);
      setIsRetranslatePromptOpen(false);
      setTranslationSidecar(null);
      setResolvedSkillMdContent(
        selectedSkill.instructions || selectedSkill.content || "",
      );
      // Restore persisted safety report when switching skills
      setSafetyReport(selectedSkill.safetyReport ?? null);
    }
  }, [selectedSkill?.id]);

  useEffect(() => {
    if (!selectedSkill) {
      setShowTranslation(false);
      return;
    }

    if (hasStaleTranslation) {
      setShowTranslation(false);
      return;
    }

    setShowTranslation(hasSavedTranslation);
  }, [hasSavedTranslation, hasStaleTranslation, selectedSkill?.id]);

  useEffect(() => {
    let cancelled = false;

    async function resolveSkillMdContent() {
      if (!selectedSkill) {
        setResolvedSkillMdContent("");
        return;
      }

      if (isExternalDetail) {
        try {
          const localSkillDirectory = normalizeLocalSkillDirectoryPath(
            selectedSkill.local_repo_path || selectedSkill.source_url || "",
          );
          const repoSkillMd = await window.api.skill.readLocalFileByPath(
            localSkillDirectory,
            "SKILL.md",
          );
          if (!cancelled) {
            setResolvedSkillMdContent(
              repoSkillMd?.content ||
                selectedSkill.instructions ||
                selectedSkill.content ||
                "",
            );
          }
        } catch {
          if (!cancelled) {
            setResolvedSkillMdContent(
              selectedSkill.instructions || selectedSkill.content || "",
            );
          }
        }
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
    isExternalDetail,
    syncSkillFromRepo,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadUserNotes() {
      if (!selectedSkillRecordId || isExternalDetail) {
        setSkillUserNotes("");
        setDraftSkillUserNotes("");
        setIsEditingUserNotes(false);
        return;
      }

      setIsLoadingUserNotes(true);
      try {
        const sidecar = await readSkillUserSidecar(selectedSkillRecordId);
        if (!cancelled) {
          const notes = sidecar?.notes ?? "";
          setSkillUserNotes(notes);
          setDraftSkillUserNotes(notes);
          setIsEditingUserNotes(false);
        }
      } catch {
        if (!cancelled) {
          setSkillUserNotes("");
          setDraftSkillUserNotes("");
          setIsEditingUserNotes(false);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingUserNotes(false);
        }
      }
    }

    void loadUserNotes();

    return () => {
      cancelled = true;
    };
  }, [isExternalDetail, selectedSkillRecordId]);

  useEffect(() => {
    let cancelled = false;

    async function loadTranslationSidecar() {
      if (!selectedSkill) {
        setTranslationSidecar(null);
        return;
      }

      if (isExternalDetail) {
        setTranslationSidecar(null);
        return;
      }

      try {
        const sidecar = await readSkillTranslationSidecar(
          selectedSkill.id,
          targetLang,
          translationMode,
        );

        if (!cancelled) {
          setTranslationSidecar(sidecar);
        }
      } catch {
        if (!cancelled) {
          setTranslationSidecar(null);
        }
      }
    }

    void loadTranslationSidecar();

    return () => {
      cancelled = true;
    };
  }, [isExternalDetail, selectedSkill?.id, targetLang, translationMode]);

  useEffect(() => {
    if (!selectedSkill || !resolvedSkillMdContent.trim()) {
      stalePromptFingerprintRef.current = null;
      return;
    }

    if (!hasStaleTranslation) {
      stalePromptFingerprintRef.current = null;
      return;
    }

    if (
      stalePromptFingerprintRef.current === instructionsTranslationFingerprint
    ) {
      return;
    }

    stalePromptFingerprintRef.current = instructionsTranslationFingerprint;
    setIsRetranslatePromptOpen(true);
  }, [
    hasStaleTranslation,
    instructionsTranslationFingerprint,
    resolvedSkillMdContent,
    selectedSkill?.id,
  ]);

  const {
    availablePlatforms,
    batchInstall: installSelectedPlatforms,
    deselectAllPlatforms,
    installProgress,
    installDetails: skillMdInstallDetails = {},
    installStatus: skillMdInstallStatus,
    isBatchInstalling,
    selectedPlatforms,
    selectAllPlatforms,
    togglePlatformSelection,
    uninstallFromPlatform: uninstallSkillFromPlatform,
    uninstalledPlatforms,
  } = useSkillPlatform(selectedSkill, installMode);

  const batchInstall = async () => {
    if (platformInstallInFlightRef.current) {
      return;
    }
    platformInstallInFlightRef.current = true;
    try {
      const result = await installSelectedPlatforms();
      if (result.successCount > 0) {
        const failedPlatformIds = new Set(
          result.failures.map((failure) => failure.platformId),
        );
        const successfulPlatforms = Array.from(selectedPlatforms)
          .filter((platformId) => !failedPlatformIds.has(platformId))
          .slice(0, result.successCount)
          .map(
            (platformId) =>
              availablePlatforms.find((entry) => entry.id === platformId)
                ?.name ?? platformId,
          );
        showToast(
          successfulPlatforms.length === 1
            ? t("skill.installToPlatformSuccess", {
                skill: selectedSkill.name,
                platform: successfulPlatforms[0],
                defaultValue:
                  "{{skill}} installed to {{platform}} successfully",
              })
            : t("skill.installToPlatformsSuccess", {
                skill: selectedSkill.name,
                count: result.successCount,
                platforms: successfulPlatforms.join(", "),
                defaultValue:
                  "{{skill}} installed to {{count}} platforms successfully: {{platforms}}",
              }),
          "success",
        );
      }
      if (result.fallbacks.length > 0) {
        const details = result.fallbacks
          .map((fallback) => {
            const platform = availablePlatforms.find(
              (entry) => entry.id === fallback.platformId,
            );
            const label = platform?.name ?? fallback.platformId;
            return t("skill.installFallbackRow", {
              platform: label,
              reason: fallback.reason,
              defaultValue:
                "{{platform}}: switched to copy install ({{reason}})",
            });
          })
          .join("\n");
        showToast(
          t("skill.installFallbackWarning", {
            details,
            defaultValue:
              "Symlink was not available for some platforms. PromptHub used copy install instead.\n{{details}}",
          }),
          "warning",
        );
      }
      // Surface per-platform failures instead of swallowing them. Without
      // this, a partial failure looked like a silent success — the user
      // saw e.g. "2/3" in the toast but had no idea which platform failed
      // or why. See #93.
      if (result.failures.length > 0) {
        const details = result.failures
          .map((failure) => {
            const platform = availablePlatforms.find(
              (entry) => entry.id === failure.platformId,
            );
            const label = platform?.name ?? failure.platformId;
            return t("skill.installFailureRow", {
              platform: label,
              reason: failure.reason,
              defaultValue: "{{platform}}: {{reason}}",
            });
          })
          .join("\n");
        showToast(
          t("skill.installPartialFailure", {
            details,
            defaultValue: "Some platforms could not be installed\n{{details}}",
          }),
          "error",
        );
      }
    } catch (error) {
      console.error("Batch install failed:", error);
      showToast(
        `${t("skill.updateFailed")}: ${getErrorMessage(error)}`,
        "error",
      );
    } finally {
      platformInstallInFlightRef.current = false;
    }
  };

  const requestUninstallFromPlatform = (platformId: string) => {
    setPendingUninstallPlatform(platformId);
  };

  const confirmUninstallFromPlatform = async () => {
    if (!pendingUninstallPlatform || platformUninstallInFlightRef.current) {
      return;
    }

    const platformId = pendingUninstallPlatform;
    platformUninstallInFlightRef.current = true;
    setIsUninstallingPlatform(true);

    try {
      await uninstallSkillFromPlatform(platformId);
      showToast(t("skill.uninstallSuccess", "Uninstall successful"), "success");
    } catch (error) {
      console.error(`Failed to uninstall from ${platformId}:`, error);
      showToast(
        `${t("skill.updateFailed")}: ${getErrorMessage(error)}`,
        "error",
      );
    } finally {
      platformUninstallInFlightRef.current = false;
      setIsUninstallingPlatform(false);
      setPendingUninstallPlatform(null);
    }
  };

  if (!selectedSkill) return null;

  const hasSourceUpdateMetadata = Boolean(
    (selectedSkill.source_url || selectedSkill.content_url) &&
    (!isExternalDetail ||
      Boolean(agentContext?.isManaged && !agentContext.isPlatformBuiltin)),
  );
  const sourceUpdateButtonLabel = t(
    "skill.checkSourceUpdatesAction",
    "Check Source Updates",
  );
  const createSnapshotLabel = t("skill.createSnapshot", "Create Snapshot");
  const installedPlatformDetails = Object.values(skillMdInstallDetails).filter(
    (status) => status.installed,
  );
  const hasCopyInstallations =
    installedPlatformDetails.some(
      (status) => status.mode === "copy" || !status.mode,
    ) || projectDeleteDistributionSummary.hasCopy;
  const hasSymlinkInstallations =
    installedPlatformDetails.some((status) => status.mode === "symlink") ||
    projectDeleteDistributionSummary.hasSymlink;
  const hasDistributedInstallations =
    installedPlatformDetails.length > 0 ||
    projectDeleteDistributionSummary.hasCopy ||
    projectDeleteDistributionSummary.hasSymlink;

  const runSafetyScan = () => {
    if (safetyScanInFlightRef.current) {
      return safetyScanInFlightRef.current;
    }

    let scanPromise: Promise<SkillSafetyReport | null>;
    scanPromise = (async () => {
      setIsScanningSafety(true);
      try {
        const report = await runSkillContentSafetyScan({
          name: selectedSkill.name,
          content:
            resolvedSkillMdContent ||
            selectedSkill.instructions ||
            selectedSkill.content,
          sourceUrl: selectedSkill.source_url,
          contentUrl: selectedSkill.content_url,
          localRepoPath: selectedSkill.local_repo_path,
          aiConfig: getSafetyScanAIConfig(aiModels),
        });
        setSafetyReport(report);
        // Persist to DB + update store
        try {
          await saveSafetyReport(selectedSkill.id, report);
        } catch (err) {
          console.warn("Failed to persist safety report:", err);
        }
        return report;
      } catch (error) {
        showToast(formatSkillSafetyScanError(error, t), "error");
        return null;
      } finally {
        if (safetyScanInFlightRef.current === scanPromise) {
          safetyScanInFlightRef.current = null;
          setIsScanningSafety(false);
        }
      }
    })();
    safetyScanInFlightRef.current = scanPromise;
    return scanPromise;
  };

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

  const handleCopySkillTitle = async () => {
    if (!selectedSkill?.name) {
      return;
    }

    try {
      await copyTextToClipboard(selectedSkill.name);
      showToast(t("common.copied", "Copied"), "success");
    } catch (error) {
      console.error("Failed to copy skill title:", error);
      showToast(t("common.copyFailed", "Copy failed"), "error");
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

  const handleDelete = () => {
    if (isExternalDetail) return;
    if (!selectedSkill) return;
    setDeleteCopyInstallations(false);
    resetDeleteDistributionSummary();
    setIsDeleteConfirmOpen(true);
    void inspectProjectDeleteDistribution().catch((error) => {
      console.warn(
        "Failed to inspect project distributions before delete:",
        error,
      );
    });
  };

  const confirmDelete = async () => {
    if (isExternalDetail) return;
    if (!selectedSkill) return;
    if (deleteInFlightRef.current) {
      return;
    }
    deleteInFlightRef.current = true;
    setIsDeletingSkill(true);
    try {
      const projectTargets = getAllProjectDeployedTargets();
      const removableProjectTargets = await Promise.all(
        projectTargets.map(async ({ target }) => {
          const status = await window.api.skill.getLocalPathStatus(
            target.localPath,
          );
          if (!status.exists) {
            return null;
          }
          if (status.mode === "symlink" || deleteCopyInstallations) {
            return target;
          }
          return null;
        }),
      );
      await Promise.all(
        removableProjectTargets
          .filter((target): target is ProjectDeployedSkillTarget =>
            Boolean(target),
          )
          .map((target) =>
            window.api.skill.deleteLocalFileByPath(target.localPath, "."),
          ),
      );
      await deleteSkill(selectedSkill.id, {
        removeCopyInstallations: deleteCopyInstallations,
      });
      setIsDeleteConfirmOpen(false);
      selectSkill(null);
    } finally {
      deleteInFlightRef.current = false;
      setIsDeletingSkill(false);
    }
  };

  const handleTranslateSkill = async (forceRefresh = false) => {
    if (!selectedSkill) return;

    if (!forceRefresh && hasDisplayableTranslation && !hasStaleTranslation) {
      setShowTranslation(!showTranslation);
      return;
    }
    if (translationInFlightRef.current) {
      return;
    }
    translationInFlightRef.current = true;

    setIsTranslating(true);
    try {
      if (forceRefresh) {
        clearTranslation(translationCacheKey);
      }

      const translated = await translateContent(
        resolvedSkillMdContent,
        translationCacheKey,
        targetLang,
        {
          forceRefresh,
          sourceFingerprint: instructionsTranslationFingerprint,
        },
      );

      if (!translated) {
        throw new Error("TRANSLATION_EMPTY");
      }

      if (!isExternalDetail) {
        const nextSidecar = await writeSkillTranslationSidecar({
          skillId: selectedSkill.id,
          sourceContent: resolvedSkillMdContent,
          translatedContent: translated,
          targetLanguage: targetLang,
          translationMode,
        });

        setTranslationSidecar(nextSidecar);
      }
      setShowTranslation(true);
      setIsRetranslatePromptOpen(false);
      showToast(
        forceRefresh
          ? t("skill.translateRefreshed", "Translation refreshed")
          : t("skill.translateSuccess", "Translation complete"),
        "success",
      );
    } catch (error: unknown) {
      showToast(formatSkillTranslationError(error, t), "error");
    } finally {
      translationInFlightRef.current = false;
      setIsTranslating(false);
    }
  };

  const handleSaveUserNotes = async () => {
    if (!selectedSkill || isExternalDetail) return;
    if (userNotesSaveInFlightRef.current) {
      return;
    }
    userNotesSaveInFlightRef.current = true;

    setIsSavingUserNotes(true);
    try {
      const sidecar = await writeSkillUserSidecar({
        skillId: selectedSkill.id,
        notes: draftSkillUserNotes,
      });
      setSkillUserNotes(sidecar.notes);
      setDraftSkillUserNotes(sidecar.notes);
      setIsEditingUserNotes(false);
      showToast(t("skill.userNotesSaved", "Notes saved"), "success");
    } catch (error) {
      console.error("Failed to save skill notes:", error);
      showToast(
        `${t("skill.updateFailed", "Update failed")}: ${getErrorMessage(error)}`,
        "error",
      );
    } finally {
      userNotesSaveInFlightRef.current = false;
      setIsSavingUserNotes(false);
    }
  };

  const handleCancelUserNotes = () => {
    setDraftSkillUserNotes(skillUserNotes);
    setIsEditingUserNotes(false);
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
    if (snapshotCreateInFlightRef.current) {
      return;
    }
    snapshotCreateInFlightRef.current = true;

    setIsCreatingSnapshot(true);
    try {
      await window.api.skill.versionCreate(
        selectedSkill.id,
        snapshotNote.trim() || buildDefaultSnapshotNote(),
      );
      scheduleAllSaveSync("skill:create-snapshot");
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
      snapshotCreateInFlightRef.current = false;
      setIsCreatingSnapshot(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full app-wallpaper-section overflow-hidden animate-in fade-in slide-in-from-right-4 duration-smooth">
      <SkillDetailHeader
        agentActions={agentActions}
        agentContext={agentContext}
        currentVersion={displayCurrentVersion}
        isCreatingSnapshot={isCreatingSnapshot}
        isExternalDetail={isExternalDetail}
        isProjectDetail={isProjectDetail}
        projectActions={projectActions}
        projectContext={projectContext}
        selectedSkill={selectedSkill}
        snapshotLabel={createSnapshotLabel}
        sourceUpdate={{
          buttonLabel: sourceUpdateButtonLabel,
          checking: isCheckingSourceUpdate,
          hasMetadata: hasSourceUpdateMetadata,
          updating: isUpdatingSource,
          onCheck: handleCheckSourceUpdate,
        }}
        onBack={() =>
          requestLeaveFileEditing(() => {
            if (onBack) onBack();
            else selectSkill(null);
          })
        }
        onCopyTitle={handleCopySkillTitle}
        onDelete={handleDelete}
        onEdit={() => setIsEditModalOpen(true)}
        onOpenSnapshot={openSnapshotModal}
        onOpenVersionHistory={() => setIsVersionHistoryOpen(true)}
        onToggleFavorite={() => toggleFavorite(selectedSkill.id)}
      />
      <SkillDetailTabs
        activeTab={activeTab}
        canEditFiles={runtimeCapabilities.skillFileEditing}
        isScanningSafety={isScanningSafety}
        safetyReport={safetyReport}
        safetyTone={safetyTone}
        onOpenSafetyReport={() => setIsSafetyModalOpen(true)}
        onRunSafetyScan={runSafetyScan}
        onSelectTab={(tab) => {
          if (tab === "files") setActiveTab(tab);
          else requestLeaveFileEditing(() => setActiveTab(tab));
        }}
      />
      <SkillDetailContent
        activeTab={activeTab}
        agentActions={agentActions}
        agentContext={agentContext}
        canEditFiles={runtimeCapabilities.skillFileEditing}
        codePaneProps={{
          availablePlatforms,
          copyStatus,
          handleCopy,
          installDetails: skillMdInstallDetails,
          selectedSkill,
          skillContent: effectiveSkillMdContent,
          t,
        }}
        contentScrollRef={contentScrollRef}
        draftUserNotes={draftSkillUserNotes}
        isEditingUserNotes={isEditingUserNotes}
        isExternalDetail={isExternalDetail}
        isLoadingUserNotes={isLoadingUserNotes}
        isProjectDetail={isProjectDetail}
        isSavingUserNotes={isSavingUserNotes}
        platformPanelProps={{
          availablePlatforms,
          handleExport,
          installMode,
          installProgress,
          isBatchInstalling,
          isProjectDeploying,
          onBatchInstall: batchInstall,
          onCreateProject: openCreateProjectModal,
          onDeployToProjects: handleDeployToProjects,
          getProjectDeployedTargets,
          onRemoveFromProjectTargets: requestRemoveFromProjectTargets,
          projectDeployMode,
          projectSkillImportPreferencesByProjectId,
          selectedPlatforms,
          selectedSkill,
          projects: skillProjects,
          selectAllPlatforms,
          deselectAllPlatforms,
          setInstallMode,
          setProjectDeployMode: handleSetProjectDeployMode,
          setProjectSkillImportPreferences,
          skillMdInstallStatus,
          t,
          togglePlatformSelection,
          getProjectDeployTargets,
          uninstallFromPlatform: requestUninstallFromPlatform,
          uninstalledPlatforms,
        }}
        previewPaneProps={{
          cachedInstructionsTranslation: effectiveInstructionsTranslation,
          copyStatus,
          handleCopy,
          handleTranslateSkill,
          hasStaleTranslation,
          isTranslating,
          resolvedDescription,
          selectedSkill,
          showTranslation,
          skillContent: effectiveSkillMdContent,
          t,
          translationMode,
        }}
        projectActions={projectActions}
        projectContext={projectContext}
        selectedSkill={selectedSkill}
        showBackToTop={showBackToTop}
        userNotes={skillUserNotes}
        onCancelUserNotes={handleCancelUserNotes}
        onContentScroll={handleContentScroll}
        onEditUserNotes={() => setIsEditingUserNotes(true)}
        onFileEditorUnsavedChange={setFileEditorHasUnsavedChanges}
        onReloadSkills={loadSkills}
        onSaveUserNotes={handleSaveUserNotes}
        onScrollToTop={scrollToTop}
        onUserNotesChange={setDraftSkillUserNotes}
      />
      {/* Edit Modal */}
      {isEditModalOpen ? (
        <Suspense fallback={null}>
          <LazyEditSkillModal
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            skill={selectedSkill}
          />
        </Suspense>
      ) : null}

      <SkillUpdateSafetyReviewDialog
        review={sourceUpdate.pendingReview?.review ?? null}
        trustSource={sourceUpdate.trustReviewedSource}
        isLoading={isUpdatingSource}
        t={t}
        onTrustSourceChange={sourceUpdate.setTrustReviewedSource}
        onClose={sourceUpdate.closeReview}
        onConfirm={() => void sourceUpdate.confirmReview()}
      />

      <SkillStoreUpdateReviewDialog
        check={sourceUpdate.sourceReviewCheck}
        overwriteLocalChanges={sourceUpdate.sourceReviewOverwrite}
        decisionMode
        isLoading={isUpdatingSource}
        t={t}
        onClose={sourceUpdate.closeSourceReview}
        onConfirm={() => void sourceUpdate.applySourceReview()}
      />

      {/* Delete confirmation dialog */}
      {/* 删除确认对话框 */}
      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        onClose={() => {
          if (!isDeletingSkill) {
            setIsDeleteConfirmOpen(false);
          }
        }}
        onConfirm={confirmDelete}
        variant="destructive"
        isLoading={isDeletingSkill}
        title={t("skill.confirmDeleteTitle", "Confirm Delete")}
        message={
          <div className="space-y-2">
            <p>
              {t("skill.confirmDeleteSingle", {
                name: selectedSkill?.name || "",
                defaultValue: `Are you sure you want to delete skill "${selectedSkill?.name || ""}"?`,
              })}
            </p>
            <p className="text-xs text-muted-foreground/80">
              {hasDistributedInstallations
                ? t(
                    "skill.deleteDistributedHint",
                    "Deletes this Skill's PromptHub record, managed package, and version history. Linked external source folders are preserved. Distributed symlinks will be removed because they point back to PromptHub.",
                  )
                : t(
                    "skill.deleteSourceOnlyHint",
                    "Deletes this Skill's PromptHub record, managed package, and version history. Linked external source folders are preserved.",
                  )}
            </p>
            {hasSymlinkInstallations ? (
              <p className="text-xs text-destructive">
                {t(
                  "skill.deleteSymlinkInstallationsHint",
                  "Symlink distributions will be deleted directly.",
                )}
              </p>
            ) : null}
            {hasCopyInstallations ? (
              <label
                htmlFor={deleteCopyInstallationsInputId}
                className="flex items-start gap-2 rounded-xl border border-border bg-accent/30 p-3 text-xs"
              >
                <input
                  id={deleteCopyInstallationsInputId}
                  type="checkbox"
                  aria-labelledby={deleteCopyInstallationsLabelId}
                  aria-describedby={deleteCopyInstallationsHelpId}
                  className="mt-0.5 h-4 w-4 accent-primary"
                  checked={deleteCopyInstallations}
                  onChange={(event) =>
                    setDeleteCopyInstallations(event.currentTarget.checked)
                  }
                />
                <span>
                  <span
                    id={deleteCopyInstallationsLabelId}
                    className="block font-medium text-foreground"
                  >
                    {t(
                      "skill.deleteCopyInstallationsLabel",
                      "Also delete copied distributions",
                    )}
                  </span>
                  <span
                    id={deleteCopyInstallationsHelpId}
                    className="mt-1 block text-muted-foreground"
                  >
                    {t(
                      "skill.deleteCopyInstallationsHelp",
                      "Leave unchecked to keep copied Agent or project folders as detached copies.",
                    )}
                  </span>
                </span>
              </label>
            ) : null}
          </div>
        }
        confirmText={t("common.delete", "Delete")}
        cancelText={t("common.cancel", "Cancel")}
      />
      <ConfirmDialog
        isOpen={pendingProjectRemoval !== null}
        onClose={() => {
          if (!isProjectDeploying) {
            cancelPendingRemoval();
          }
        }}
        onConfirm={() => {
          void confirmRemoveFromProjectTargets();
        }}
        variant="destructive"
        isLoading={isProjectDeploying}
        title={t("skill.confirmProjectRemoveTitle", "Remove from project")}
        message={
          <div className="space-y-2">
            <p>
              {t("skill.confirmProjectRemoveMessage", {
                name: selectedSkill?.name || "",
                project: pendingProjectRemoval?.project.name || "",
                count: pendingProjectRemoval?.targets.length ?? 0,
                defaultValue:
                  "Remove {{name}} from {{count}} selected project folder(s) in {{project}}?",
              })}
            </p>
            <p className="text-xs text-muted-foreground/80">
              {t(
                "skill.projectRemoveDistributionHint",
                "Copied project folders are deleted from the project. Symlink project folders remove only the link.",
              )}
            </p>
          </div>
        }
        confirmText={t("skill.removeFromProject", "Remove from Project")}
        cancelText={t("common.cancel", "Cancel")}
      />
      <ConfirmDialog
        isOpen={pendingUninstallPlatform !== null}
        onClose={() => {
          if (!isUninstallingPlatform) {
            setPendingUninstallPlatform(null);
          }
        }}
        onConfirm={() => {
          void confirmUninstallFromPlatform();
        }}
        variant="destructive"
        isLoading={isUninstallingPlatform}
        title={t("skill.confirmUninstallTitle", "Confirm Uninstall")}
        message={
          <div className="space-y-2">
            <p>
              {t(
                "skill.confirmUninstallMessage",
                "Are you sure you want to uninstall this skill from {{platform}}?",
                {
                  platform:
                    availablePlatforms.find(
                      (platform) => platform.id === pendingUninstallPlatform,
                    )?.name ||
                    pendingUninstallPlatform ||
                    "",
                },
              )}
            </p>
            <p className="text-xs text-muted-foreground/80">
              {skillMdInstallDetails[pendingUninstallPlatform || ""]?.mode ===
              "symlink"
                ? t(
                    "skill.platformUninstallSymlinkHint",
                    "This removes the symlink from the selected platform. The PromptHub source stays in place.",
                  )
                : t(
                    "skill.platformUninstallCopyHint",
                    "This removes the copied skill folder from the selected platform.",
                  )}
            </p>
          </div>
        }
        confirmText={t("skill.uninstall", "Uninstall")}
        cancelText={t("common.cancel", "Cancel")}
      />
      <ConfirmDialog
        isOpen={isRetranslatePromptOpen}
        onClose={() => setIsRetranslatePromptOpen(false)}
        onConfirm={() => {
          void handleTranslateSkill(true);
        }}
        title={t(
          "skill.translationOutdatedTitle",
          "Saved translation is outdated",
        )}
        message={t(
          "skill.translationOutdatedMessage",
          "This skill's SKILL.md changed after the last translation. Retranslate now?",
        )}
        confirmText={t("skill.retranslateNow", "Retranslate now")}
        cancelText={t("common.cancel", "Cancel")}
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
        title={t("skill.createSnapshot", "Create Snapshot")}
        size="lg"
      >
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            {t("skill.snapshotPrompt", "Enter a note for this snapshot")}
          </div>
          <Textarea
            aria-label={t(
              "skill.snapshotPrompt",
              "Enter a note for this snapshot",
            )}
            value={snapshotNote}
            onChange={(event) => setSnapshotNote(event.target.value)}
            placeholder={t(
              "skill.versionNotePlaceholder",
              "Describe the changes...",
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
              {t("common.cancel", "Cancel")}
            </button>
            <button
              type="button"
              onClick={handleCreateSnapshot}
              disabled={isCreatingSnapshot}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isCreatingSnapshot ? (
                <>
                  <SaveIcon
                    aria-hidden="true"
                    className="h-4 w-4 animate-pulse"
                  />
                  {t("common.saving", "Saving")}
                </>
              ) : (
                <>
                  <SaveIcon aria-hidden="true" className="h-4 w-4" />
                  {t("skill.createSnapshot", "Create Snapshot")}
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      <SkillSafetyReportModal
        isOpen={isSafetyModalOpen}
        isScanning={isScanningSafety}
        report={safetyReport}
        onClose={() => setIsSafetyModalOpen(false)}
        onRescan={async () => {
          setIsSafetyModalOpen(false);
          await runSafetyScan();
          setIsSafetyModalOpen(true);
        }}
      />
    </div>
  );
}
