import { runSkillContentSafetyScan } from "../../services/skill-content-scan";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  CheckIcon,
  CodeIcon,
  FolderOpenIcon,
  HistoryIcon,
  InfoIcon,
  Loader2Icon,
  RefreshCwIcon,
  SaveIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  ShieldIcon,
  StarIcon,
  TrashIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  PluginDistributeMode,
  PluginLibraryEntry,
  PluginSourceUpdateCheck,
  PluginTargetCompatibility,
} from "@prompthub/shared/types/plugin";
import type { SkillSafetyReport } from "@prompthub/shared/types";
import { PlatformIcon } from "../ui/PlatformIcon";
import { useToast } from "../ui/Toast";
import { UnsavedChangesDialog } from "../ui/UnsavedChangesDialog";
import { Modal, Textarea } from "../ui";
import { usePluginStore } from "../../stores/plugin.store";
import { useSettingsStore } from "../../stores/settings.store";
import { useSkillStore } from "../../stores/skill.store";
import { copyTextToClipboard } from "../../utils/clipboard";
import {
  formatSkillTranslationError,
  formatSkillSafetyScanError,
  getSafetyScanAIConfig,
} from "../skill/detail-utils";
import { getSkillSafetyLevelLabel } from "../skill/safety-i18n";
import { PluginVersionHistoryModal } from "./PluginVersionHistoryModal";
import { AgentPluginDetailActions } from "./AgentPluginDetailActions";
import {
  DetailTabButton,
  PluginDetailAvatar,
  buildPluginSafetyScanContent,
  computePluginSafetyScore,
  getPluginDescriptionText,
  getPluginLocalPackagePath,
  getPluginSafetySourceUrl,
  getPluginTargetPlatformId,
  getPluginTextFingerprint,
  getPluginTranslationTargetLanguage,
  getSourceUpdateLabel,
  getSourceUpdateTone,
  normalizePluginTranslatedText,
} from "./plugin-detail-utils";
import {
  PluginFilesPanel,
  PluginOverview,
  PluginSourcePanel,
} from "./PluginDetailContent";
import {
  PluginPackageHealthPanel,
  PluginSafetyAssessmentPanel,
  SourceUpdateDiffRow,
  formatPluginInventorySummary,
  getPackageHealthLabel,
  getPackageHealthTone,
  getPluginSafetyTone,
} from "./PluginDetailDiagnostics";

type PluginDetailTab = "overview" | "source" | "files";

export interface PluginFullDetailPageProps {
  plugin: PluginLibraryEntry;
  targetMatrix: PluginTargetCompatibility[];
  isImportingChildSkills?: boolean;
  isImportingChildMcp?: boolean;
  agentContext?: {
    isManaged?: boolean;
    platformId: string;
    platformName: string;
    sourcePath: string;
  } | null;
  agentActions?: {
    isImporting?: boolean;
    onImport?: () => void | Promise<void>;
    onOpenFolder?: () => void | Promise<void>;
    onOpenManagedPlugin?: () => void | Promise<void>;
  } | null;
  onBack: () => void;
  onDelete: (plugin: PluginLibraryEntry) => void;
  onDistribute: (
    targetIds: string[],
    mode: PluginDistributeMode,
  ) => Promise<void>;
  onRemoveDistribution?: (
    target: PluginTargetCompatibility,
  ) => Promise<void> | void;
  onToggleFavorite?: (plugin: PluginLibraryEntry) => void | Promise<void>;
  onImportChildSkills?: (plugin: PluginLibraryEntry) => void | Promise<void>;
  onImportChildMcp?: (plugin: PluginLibraryEntry) => void | Promise<void>;
  onOpenStore: () => void;
}

export function usePluginFullDetailController({
  agentActions,
  agentContext,
  isImportingChildMcp,
  isImportingChildSkills,
  plugin,
  targetMatrix,
  onBack,
  onDelete,
  onDistribute,
  onRemoveDistribution,
  onToggleFavorite,
  onImportChildMcp,
  onImportChildSkills,
}: PluginFullDetailPageProps) {
  const { i18n, t } = useTranslation();
  const { showToast } = useToast();
  const isAgentDetail = Boolean(agentContext);
  const aiModels = useSettingsStore((state) => state.aiModels);
  const translationMode = useSettingsStore((state) => state.translationMode);
  const translateContent = useSkillStore((state) => state.translateContent);
  const getTranslationState = useSkillStore(
    (state) => state.getTranslationState,
  );
  const [activeTab, setActiveTab] = useState<PluginDetailTab>("overview");
  const [fileEditorHasUnsavedChanges, setFileEditorHasUnsavedChanges] =
    useState(false);
  const [isUnsavedDialogOpen, setIsUnsavedDialogOpen] = useState(false);
  const [pendingUnsavedAction, setPendingUnsavedAction] = useState<
    (() => void) | null
  >(null);
  const localPackagePath = getPluginLocalPackagePath(plugin);
  const sourceUpdateCheck = usePluginStore(
    (state) => state.sourceUpdateChecks[plugin.id],
  );
  const getPluginSourceUpdateStatus = usePluginStore(
    (state) => state.getPluginSourceUpdateStatus,
  );
  const updatePluginFromSource = usePluginStore(
    (state) => state.updatePluginFromSource,
  );
  const updatePluginMetadata = usePluginStore(
    (state) => state.updatePluginMetadata,
  );
  const packageHealthCheck = usePluginStore(
    (state) => state.packageHealthChecks[plugin.id],
  );
  const checkInstalledPluginPackage = usePluginStore(
    (state) => state.checkInstalledPluginPackage,
  );
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isUpdatingFromSource, setIsUpdatingFromSource] = useState(false);
  const [isCheckingPackage, setIsCheckingPackage] = useState(false);
  const [isScanningSafety, setIsScanningSafety] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const contentScrollRef = useRef<HTMLElement | null>(null);
  const userNotesSaveInFlightRef = useRef(false);
  const safetyScanInFlightRef =
    useRef<Promise<SkillSafetyReport | null> | null>(null);
  const [draftUserNotes, setDraftUserNotes] = useState(plugin.userNotes ?? "");
  const [isEditingUserNotes, setIsEditingUserNotes] = useState(false);
  const [isSavingUserNotes, setIsSavingUserNotes] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState(false);
  const [isSafetyReportModalOpen, setIsSafetyReportModalOpen] = useState(false);
  const [isPackageCheckModalOpen, setIsPackageCheckModalOpen] = useState(false);
  const [pendingSourceUpdateMode, setPendingSourceUpdateMode] = useState<
    "update" | "overwrite" | null
  >(null);
  const [snapshotNote, setSnapshotNote] = useState("");
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [translatedDescription, setTranslatedDescription] = useState("");
  const [showTranslatedDescription, setShowTranslatedDescription] =
    useState(false);
  const [isTranslatingDescription, setIsTranslatingDescription] =
    useState(false);
  const createPluginVersion = usePluginStore(
    (state) => state.createPluginVersion,
  );
  const descriptionSourceText = useMemo(
    () =>
      getPluginDescriptionText(
        plugin,
        t("plugin.noDescription", "No description provided"),
      ),
    [plugin, t],
  );
  const descriptionFingerprint = useMemo(
    () => getPluginTextFingerprint(descriptionSourceText),
    [descriptionSourceText],
  );
  const targetLang = useMemo(
    () => getPluginTranslationTargetLanguage(i18n.language),
    [i18n.language],
  );
  const translationCacheKey = `plugindoc_v1_${plugin.id}_${targetLang}_${translationMode}`;
  const cachedDescriptionTranslation = useMemo(
    () => getTranslationState(translationCacheKey, descriptionFingerprint),
    [descriptionFingerprint, getTranslationState, translationCacheKey],
  );

  const checkSourceUpdate = async (
    showSuccess = false,
  ): Promise<PluginSourceUpdateCheck | null> => {
    if (isCheckingUpdate) return null;
    setIsCheckingUpdate(true);
    try {
      const check = await getPluginSourceUpdateStatus(plugin.id);
      if (showSuccess && check.status === "up-to-date") {
        showToast(t("plugin.upToDate", "Up to date"), "success");
      }
      return check;
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      );
      return null;
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const updateFromSource = async (overwriteLocalChanges = false) => {
    if (isUpdatingFromSource) return;
    setIsUpdatingFromSource(true);
    try {
      const result = await updatePluginFromSource(plugin.id, {
        overwriteLocalChanges,
      });
      if (result.status === "updated") {
        showToast(t("plugin.updateSuccess", "Plugin updated"), "success");
      } else if (result.status === "up-to-date") {
        showToast(t("plugin.upToDate", "Up to date"), "success");
      } else if (result.status === "conflict") {
        showToast(
          t(
            "plugin.updateConflictHint",
            "Source and local Plugin package both changed. Review before overwriting.",
          ),
          "error",
        );
      } else if (result.status === "local-modified") {
        showToast(
          t(
            "plugin.localChangesHint",
            "Local Plugin package has changes. Overwrite only if you want to replace them.",
          ),
          "error",
        );
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    } finally {
      setIsUpdatingFromSource(false);
    }
  };

  useEffect(() => {
    void checkSourceUpdate(false);
  }, [plugin.id]);

  useEffect(() => {
    setFileEditorHasUnsavedChanges(false);
    setIsUnsavedDialogOpen(false);
    setPendingUnsavedAction(null);
    setDraftUserNotes(plugin.userNotes ?? "");
    setIsEditingUserNotes(false);
  }, [plugin.id]);

  useEffect(() => {
    setTranslatedDescription("");
    setShowTranslatedDescription(false);
    setIsTranslatingDescription(false);
  }, [plugin.id, descriptionFingerprint, targetLang, translationMode]);

  useEffect(() => {
    const normalizedCachedTranslation = cachedDescriptionTranslation.value
      ? normalizePluginTranslatedText(cachedDescriptionTranslation.value)
      : "";

    if (
      cachedDescriptionTranslation.isStale ||
      !cachedDescriptionTranslation.hasTranslation ||
      !normalizedCachedTranslation
    ) {
      setTranslatedDescription("");
      setShowTranslatedDescription(false);
      return;
    }

    setTranslatedDescription(normalizedCachedTranslation);
    setShowTranslatedDescription(true);
  }, [
    cachedDescriptionTranslation.hasTranslation,
    cachedDescriptionTranslation.isStale,
    cachedDescriptionTranslation.value,
  ]);

  useEffect(() => {
    if (!isEditingUserNotes) {
      setDraftUserNotes(plugin.userNotes ?? "");
    }
  }, [isEditingUserNotes, plugin.userNotes]);

  const requestLeaveFileEditing = (action: () => void) => {
    if (activeTab !== "files" || !fileEditorHasUnsavedChanges) {
      action();
      return;
    }

    setPendingUnsavedAction(() => action);
    setIsUnsavedDialogOpen(true);
  };

  const sourceUpdateLabel = getSourceUpdateLabel(
    sourceUpdateCheck,
    isCheckingUpdate,
    t,
  );
  const sourceUpdateTone = getSourceUpdateTone(sourceUpdateCheck?.status);
  const canUpdateFromSource = sourceUpdateCheck?.status === "update-available";
  const canOverwriteSourceUpdate =
    sourceUpdateCheck?.status === "conflict" ||
    sourceUpdateCheck?.status === "local-modified";
  const safetyTone = getPluginSafetyTone(plugin.safetyReport?.level);
  const safetyPillLabel = isScanningSafety
    ? t("plugin.safetyScanning", "Scanning...")
    : plugin.safetyReport
      ? `${t("skill.safetyLevelLabel", "Risk Level")} - ${getSkillSafetyLevelLabel(t, plugin.safetyReport.level)}`
      : t("plugin.safetyAssessment", "Safety Assessment");
  const packageHealthLabel = getPackageHealthLabel(
    packageHealthCheck,
    isCheckingPackage,
    t,
  );
  const packageHealthTone = getPackageHealthTone(
    packageHealthCheck,
    isCheckingPackage,
  );

  const reviewSourceUpdate = async (overwriteLocalChanges = false) => {
    const check = (await checkSourceUpdate(true)) ?? sourceUpdateCheck;
    if (!check) return;
    if (check.status === "up-to-date") {
      showToast(t("plugin.upToDate", "Up to date"), "success");
      return;
    }
    if (check.status === "not-installed") {
      showToast(t("plugin.notInstalled", "Not installed"), "error");
      return;
    }
    setPendingSourceUpdateMode(
      overwriteLocalChanges || check.status !== "update-available"
        ? "overwrite"
        : "update",
    );
  };

  const confirmPendingSourceUpdate = async () => {
    const mode = pendingSourceUpdateMode;
    if (!mode) return;
    await updateFromSource(mode === "overwrite");
    setPendingSourceUpdateMode(null);
  };

  const openSafetyAssessment = () => {
    if (plugin.safetyReport && !isScanningSafety) {
      setIsSafetyReportModalOpen(true);
      return;
    }
    if (!isScanningSafety) {
      void runSafetyAssessment();
    }
  };

  const openPackageCheck = () => {
    if (packageHealthCheck && !isCheckingPackage) {
      setIsPackageCheckModalOpen(true);
      return;
    }
    if (!isCheckingPackage) {
      void runPackageCheck();
    }
  };

  const copyPluginTitle = async () => {
    try {
      await copyTextToClipboard(plugin.displayName);
      showToast(t("common.copied", "Copied"), "success");
    } catch (error) {
      console.error("Failed to copy plugin title:", error);
      showToast(t("common.copyFailed", "Copy failed"), "error");
    }
  };

  const translatePluginDescription = async (forceRefresh = false) => {
    if (!forceRefresh && translatedDescription) {
      setShowTranslatedDescription((current) => !current);
      return;
    }
    if (isTranslatingDescription) {
      return;
    }

    setIsTranslatingDescription(true);
    try {
      const translated = await translateContent(
        descriptionSourceText,
        translationCacheKey,
        targetLang,
        {
          forceRefresh,
          sourceFingerprint: descriptionFingerprint,
        },
      );

      const normalized = normalizePluginTranslatedText(translated);
      if (!normalized) {
        throw new Error("TRANSLATION_EMPTY");
      }

      setTranslatedDescription(normalized);
      setShowTranslatedDescription(true);
      showToast(
        forceRefresh
          ? t("skill.translateRefreshed", "Translation refreshed")
          : t("skill.translateSuccess", "Translation complete"),
        "success",
      );
    } catch (error) {
      showToast(formatSkillTranslationError(error, t), "error");
    } finally {
      setIsTranslatingDescription(false);
    }
  };

  const buildDefaultSnapshotNote = () =>
    t("plugin.snapshotDefaultNote", {
      defaultValue: "Manual snapshot {{timestamp}}",
      timestamp: new Date().toLocaleString(),
    });

  const openSnapshotModal = () => {
    setSnapshotNote(buildDefaultSnapshotNote());
    setIsSnapshotModalOpen(true);
  };

  const handleCreateSnapshot = async () => {
    if (isCreatingSnapshot) return;
    setIsCreatingSnapshot(true);
    try {
      await createPluginVersion(
        plugin.id,
        snapshotNote.trim() || buildDefaultSnapshotNote(),
      );
      setIsSnapshotModalOpen(false);
      showToast(
        t("plugin.snapshotCreated", "Version snapshot created"),
        "success",
      );
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : t("plugin.createSnapshotFailed", "Failed to create snapshot"),
        "error",
      );
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  const saveUserNotes = async () => {
    if (userNotesSaveInFlightRef.current) return;
    userNotesSaveInFlightRef.current = true;
    setIsSavingUserNotes(true);
    try {
      await updatePluginMetadata(plugin.id, { userNotes: draftUserNotes });
      setIsEditingUserNotes(false);
      showToast(t("plugin.userNotesSaved", "Notes saved"), "success");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    } finally {
      userNotesSaveInFlightRef.current = false;
      setIsSavingUserNotes(false);
    }
  };

  const cancelUserNotes = () => {
    setDraftUserNotes(plugin.userNotes ?? "");
    setIsEditingUserNotes(false);
  };

  const handleContentScroll = () => {
    const scrollTop = contentScrollRef.current?.scrollTop ?? 0;
    setShowBackToTop(scrollTop > 480);
  };

  const scrollToTop = () => {
    contentScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const runPackageCheck = async () => {
    if (isCheckingPackage) return;
    setIsCheckingPackage(true);
    try {
      const check = await checkInstalledPluginPackage(plugin.id);
      if (check.status === "ok") {
        showToast(
          t("plugin.packageCheckSuccess", "Package check passed"),
          "success",
        );
      } else {
        showToast(
          t(
            "plugin.packageCheckIssue",
            "Plugin package needs review. See package check details.",
          ),
          "error",
        );
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    } finally {
      setIsCheckingPackage(false);
    }
  };

  const runSafetyAssessment = () => {
    if (safetyScanInFlightRef.current) {
      return safetyScanInFlightRef.current;
    }


    const scanPromise = (async () => {
      setIsScanningSafety(true);
      try {
        const report = await runSkillContentSafetyScan({
          name: plugin.displayName || plugin.name,
          content: buildPluginSafetyScanContent(plugin),
          sourceUrl: getPluginSafetySourceUrl(plugin),
          localRepoPath: localPackagePath || undefined,
        });
        const scoredReport: SkillSafetyReport = {
          ...report,
          score: report.score ?? computePluginSafetyScore(report),
        };
        await updatePluginMetadata(plugin.id, { safetyReport: scoredReport });
        showToast(
          t("plugin.safetyScanSuccess", "Safety assessment complete"),
          "success",
        );
        return scoredReport;
      } catch (error) {
        showToast(formatSkillSafetyScanError(error, t), "error");
        return null;
      } finally {
        setIsScanningSafety(false);
        safetyScanInFlightRef.current = null;
      }
    })();

    safetyScanInFlightRef.current = scanPromise;
    return scanPromise;
  };

  return {
    t,
    agentActions,
    agentContext,
    isImportingChildMcp,
    isImportingChildSkills,
    plugin,
    targetMatrix,
    onBack,
    onDelete,
    onDistribute,
    onRemoveDistribution,
    onToggleFavorite,
    onImportChildMcp,
    onImportChildSkills,
    isAgentDetail,
    activeTab,
    setActiveTab,
    fileEditorHasUnsavedChanges,
    setFileEditorHasUnsavedChanges,
    isUnsavedDialogOpen,
    setIsUnsavedDialogOpen,
    pendingUnsavedAction,
    setPendingUnsavedAction,
    localPackagePath,
    sourceUpdateCheck,
    isCheckingUpdate,
    isUpdatingFromSource,
    isCheckingPackage,
    isScanningSafety,
    showBackToTop,
    contentScrollRef,
    draftUserNotes,
    setDraftUserNotes,
    isEditingUserNotes,
    setIsEditingUserNotes,
    isSavingUserNotes,
    isVersionHistoryOpen,
    setIsVersionHistoryOpen,
    isSnapshotModalOpen,
    setIsSnapshotModalOpen,
    isSafetyReportModalOpen,
    setIsSafetyReportModalOpen,
    isPackageCheckModalOpen,
    setIsPackageCheckModalOpen,
    pendingSourceUpdateMode,
    setPendingSourceUpdateMode,
    snapshotNote,
    setSnapshotNote,
    isCreatingSnapshot,
    translatedDescription,
    showTranslatedDescription,
    isTranslatingDescription,
    descriptionSourceText,
    requestLeaveFileEditing,
    sourceUpdateLabel,
    sourceUpdateTone,
    canUpdateFromSource,
    canOverwriteSourceUpdate,
    safetyTone,
    safetyPillLabel,
    packageHealthCheck,
    packageHealthLabel,
    packageHealthTone,
    reviewSourceUpdate,
    confirmPendingSourceUpdate,
    openSafetyAssessment,
    openPackageCheck,
    copyPluginTitle,
    translatePluginDescription,
    openSnapshotModal,
    handleCreateSnapshot,
    saveUserNotes,
    cancelUserNotes,
    handleContentScroll,
    scrollToTop,
    runPackageCheck,
    runSafetyAssessment,
  };
}

export type PluginFullDetailViewModel = ReturnType<
  typeof usePluginFullDetailController
>;
