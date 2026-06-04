import { useTranslation } from "react-i18next";
import {
  ArrowLeftIcon,
  ArrowUpIcon,
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
  ShieldIcon,
  RefreshCwIcon,
  AlertTriangleIcon,
  InfoIcon,
  CheckCircleIcon,
  Loader2Icon,
  StickyNoteIcon,
  XIcon,
} from "lucide-react";
import { SkillIcon } from "./SkillIcon";
import { SkillCodePane } from "./SkillCodePane";
import { useState, useEffect, useMemo, useRef } from "react";
import { SkillPlatformPanel } from "./SkillPlatformPanel";
import { ProjectSkillPreviewSidebar } from "./ProjectSkillPreviewSidebar";
import { SkillPreviewPane } from "./SkillPreviewPane";
import { normalizeLocalSkillDirectoryPath } from "../../services/skill-store-source";
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
  downloadSkillZipExport,
  formatSkillSafetyScanError,
  formatSkillTranslationError,
  getErrorMessage,
  getSafetyScanAIConfig,
  groupSkillSafetyFindings,
  resolveSkillDescription,
} from "./detail-utils";
import {
  computeSkillContentFingerprint,
  type RegistrySkillUpdateStatus,
} from "../../services/skill-store-update";
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
import {
  getDeployedProjectSkillTargets,
  getDeployableProjectTargetDirs,
  getMissingProjectTargetDirs,
  type ProjectDeployedSkillTarget,
} from "../../services/project-skill-targets";
import {
  getSkillSafetyFindingTitle,
  getSkillSafetyMethodDescription,
  getSkillSafetySummary,
} from "./safety-i18n";
import { getRuntimeCapabilities } from "../../runtime";
import type { Skill } from "@prompthub/shared/types";
import type { SkillProject } from "@prompthub/shared/types";
import type { ProjectDetailSkillContext } from "./project-detail-adapter";
import { PlatformIcon } from "../ui/PlatformIcon";
import { AgentSkillPreviewSidebar } from "./AgentSkillPreviewSidebar";
import { AgentSkillDetailActions } from "./AgentSkillDetailActions";

const OPEN_CREATE_SKILL_PROJECT_MODAL_EVENT = "open-create-skill-project-modal";

function getProjectDeployTargets(project: SkillProject): string[] {
  const configured = Array.isArray(project.deployTargets)
    ? project.deployTargets.filter(
        (entry) => typeof entry === "string" && entry.trim().length > 0,
      )
    : [];

  if (configured.length > 0) {
    return Array.from(new Set(configured));
  }

  const normalizedRoot = project.rootPath.replace(/[\\/]+$/, "");
  return normalizedRoot ? [`${normalizedRoot}/.agents/skills`] : [];
}

/**
 * Full-width Skill Detail Page
 * 全宽技能详情页
 */
export type InstallMode = "copy" | "symlink";

interface SkillFullDetailPageProps {
  overrideSkill?: Skill;
  projectContext?: ProjectDetailSkillContext | null;
  agentContext?: {
    installMode: "copy" | "symlink";
    isManaged?: boolean;
    isPlatformBuiltin?: boolean;
    platformId: string;
    platformName: string;
    sourcePath: string;
    symlinkTargetPath?: string;
  } | null;
  projectActions?: {
    isImporting?: boolean;
    isDeploying?: boolean;
    isRemoving?: boolean;
    onAddDeployTarget?: () => void | Promise<void>;
    onDeployToProjectTargets?: (targetDirs: string[]) => void | Promise<void>;
    onImport?: () => void | Promise<void>;
    onOpenManagedSkill?: () => void | Promise<void>;
    onRemoveFromProject?: () => void | Promise<void>;
  } | null;
  agentActions?: {
    isImporting?: boolean;
    isUninstalling?: boolean;
    onImport?: () => void | Promise<void>;
    onOpenFolder?: () => void | Promise<void>;
    onOpenManagedSkill?: () => void | Promise<void>;
    onOpenSymlinkTarget?: () => void | Promise<void>;
    onUninstall?: () => void | Promise<void>;
  } | null;
  onBack?: () => void;
}

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
  const projectScanState = useSkillStore((state) => state.projectScanState);
  const scanProjectSkills = useSkillStore((state) => state.scanProjectSkills);
  const getInstalledSkillSourceUpdateStatus = useSkillStore(
    (state) => state.getInstalledSkillSourceUpdateStatus,
  );
  const updateInstalledSkillFromSource = useSkillStore(
    (state) => state.updateInstalledSkillFromSource,
  );

  const selectedSkill = useMemo(() => {
    if (overrideSkill) {
      return overrideSkill;
    }
    return skills.find((s) => s.id === selectedSkillId);
  }, [overrideSkill, skills, selectedSkillId]);
  const isProjectDetail = Boolean(projectContext);
  const isAgentDetail = Boolean(agentContext);
  const isExternalDetail = isProjectDetail || isAgentDetail;
  const selectedSkillRecordId = selectedSkill?.id ?? null;

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
  const skillProjects = useSettingsStore((state) => state.skillProjects);
  const projectSkillImportModePreference = useSettingsStore(
    (state) => state.projectSkillImportModePreference,
  );
  const projectSkillImportPreferencesByProjectId = useSettingsStore(
    (state) => state.projectSkillImportPreferencesByProjectId,
  );
  const setProjectSkillImportModePreference = useSettingsStore(
    (state) => state.setProjectSkillImportModePreference,
  );
  const setProjectSkillImportPreferences = useSettingsStore(
    (state) => state.setProjectSkillImportPreferences,
  );
  const aiModels = useSettingsStore((state) => state.aiModels);
  const updateSkillProject = useSettingsStore(
    (state) => state.updateSkillProject,
  );
  const [installMode, setInstallMode] = useState<InstallMode>(
    () => skillInstallMethod,
  );
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [pendingUninstallPlatform, setPendingUninstallPlatform] = useState<
    string | null
  >(null);
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
  const [isCheckingSourceUpdate, setIsCheckingSourceUpdate] = useState(false);
  const [isUpdatingSource, setIsUpdatingSource] = useState(false);
  const [skillUserNotes, setSkillUserNotes] = useState("");
  const [draftSkillUserNotes, setDraftSkillUserNotes] = useState("");
  const [isEditingUserNotes, setIsEditingUserNotes] = useState(false);
  const [isLoadingUserNotes, setIsLoadingUserNotes] = useState(false);
  const [isSavingUserNotes, setIsSavingUserNotes] = useState(false);
  const [sourceUpdateStatus, setSourceUpdateStatus] =
    useState<RegistrySkillUpdateStatus | null>(null);
  const [isProjectDeploying, setIsProjectDeploying] = useState(false);
  const [deleteCopyInstallations, setDeleteCopyInstallations] = useState(false);
  const [
    projectDeleteDistributionSummary,
    setProjectDeleteDistributionSummary,
  ] = useState({
    hasCopy: false,
    hasSymlink: false,
  });
  const [pendingProjectRemoval, setPendingProjectRemoval] = useState<{
    project: SkillProject;
    targets: ProjectDeployedSkillTarget[];
  } | null>(null);
  const [projectDeployMode, setProjectDeployMode] = useState<InstallMode>(
    () => projectSkillImportModePreference,
  );
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
  const [isRetranslatePromptOpen, setIsRetranslatePromptOpen] = useState(false);
  const buildDefaultSnapshotNote = () =>
    t("skill.snapshotDefaultNote", {
      timestamp: new Date().toLocaleString(i18n.language || undefined),
      defaultValue: `Manual snapshot ${new Date().toLocaleString()}`,
    });

  const openCreateProjectModal = () => {
    useSkillStore.getState().setStoreView("projects");
    document.dispatchEvent(new Event(OPEN_CREATE_SKILL_PROJECT_MODAL_EVENT));
  };

  const handleDeployToProjects = async (
    projectIds: string[],
    targetDirsByProjectId?: Record<string, string[]>,
  ) => {
    if (!selectedSkill || projectIds.length === 0) {
      return;
    }

    const selectedProjects = skillProjects.filter((project) =>
      projectIds.includes(project.id),
    );
    const selectedProjectTargets = selectedProjects.map((project) => ({
      project,
      targetDirs:
        targetDirsByProjectId?.[project.id] ?? getProjectDeployTargets(project),
    }));
    if (
      !selectedProjectTargets.some(({ targetDirs }) => targetDirs.length > 0)
    ) {
      showToast(
        t(
          "skill.projectDeployNoTargets",
          "Selected projects do not have any deploy target folders yet.",
        ),
        "error",
      );
      return;
    }

    setIsProjectDeploying(true);
    try {
      const repoPath = await window.api.skill.getRepoPath(selectedSkill.id);
      if (!repoPath) {
        showToast(
          t(
            "skill.projectDeployMissingSource",
            "Missing local skill source path.",
          ),
          "error",
        );
        return;
      }

      const deployableProjectTargets = selectedProjectTargets.map(
        ({ project, targetDirs }) => ({
          project,
          targetDirs: getDeployableProjectTargetDirs(
            repoPath,
            selectedSkill.name,
            targetDirs,
          ),
        }),
      );
      if (
        !deployableProjectTargets.some(
          ({ targetDirs }) => targetDirs.length > 0,
        )
      ) {
        showToast(
          t(
            "skill.projectDeployAlreadyAtTarget",
            "This skill is already inside the selected project target folders.",
          ),
          "warning",
        );
        return;
      }

      const projectTargetJobs = deployableProjectTargets.flatMap(
        ({ project, targetDirs }) => {
          const scannedSkills =
            projectScanState[project.id]?.scannedSkills ?? [];
          return getMissingProjectTargetDirs(
            scannedSkills,
            selectedSkill.name,
            targetDirs,
          ).map((targetDir) => ({ project, targetDir }));
        },
      );
      if (projectTargetJobs.length === 0) {
        showToast(
          t(
            "skill.projectImportAlreadyExists",
            "Selected skills are already imported into the selected project folders.",
          ),
          "warning",
        );
        return;
      }

      await Promise.all(
        projectTargetJobs.map(({ targetDir }) =>
          window.api.skill.copyRepoByPathToDirectory(
            repoPath,
            selectedSkill.name,
            targetDir,
            { ifExists: "skip", mode: projectDeployMode },
          ),
        ),
      );
      showToast(
        t("skill.projectDeploySuccess", {
          count: projectTargetJobs.length,
          mode:
            projectDeployMode === "symlink"
              ? t("skill.symlink", "Symlink")
              : t("skill.copyMode", "Copy"),
          defaultValue: "Deployed to {{count}} project folder(s).",
        }),
        "success",
      );
      void Promise.all(
        selectedProjects.map(async (project) => {
          await scanProjectSkills(project);
          updateSkillProject(project.id, { lastScannedAt: Date.now() });
        }),
      ).catch(() => {
        showToast(
          t(
            "skill.projectImportLibraryRescanFailed",
            "Import completed, but PromptHub could not refresh the project list. Please rescan manually.",
          ),
          "warning",
        );
      });
    } catch (error) {
      showToast(
        t("skill.projectDeployFailed", {
          reason: error instanceof Error ? error.message : String(error),
          defaultValue: "Failed to deploy project skill: {{reason}}",
        }),
        "error",
      );
    } finally {
      setIsProjectDeploying(false);
    }
  };

  useEffect(() => {
    setProjectDeployMode(projectSkillImportModePreference);
  }, [projectSkillImportModePreference]);

  const handleSetProjectDeployMode = (mode: InstallMode) => {
    setProjectDeployMode(mode);
    setProjectSkillImportModePreference(mode);
  };

  const getProjectDeployedTargets = (project: SkillProject) => {
    if (!selectedSkill) {
      return [];
    }
    const scannedSkills = projectScanState[project.id]?.scannedSkills ?? [];
    return getDeployedProjectSkillTargets(
      scannedSkills,
      selectedSkill.name,
      getProjectDeployTargets(project),
    );
  };

  const requestRemoveFromProjectTargets = (
    projectId: string,
    targets: ProjectDeployedSkillTarget[],
  ) => {
    const project = skillProjects.find((entry) => entry.id === projectId);
    if (!project || targets.length === 0) {
      return;
    }
    setPendingProjectRemoval({ project, targets });
  };

  const getAllProjectDeployedTargets = () =>
    skillProjects.flatMap((project) =>
      getProjectDeployedTargets(project).map((target) => ({ project, target })),
    );

  const inspectProjectDeleteDistribution = async () => {
    const targets = getAllProjectDeployedTargets();
    if (targets.length === 0) {
      return;
    }
    const statuses = await Promise.all(
      targets.map(({ target }) =>
        window.api.skill.getLocalPathStatus(target.localPath),
      ),
    );
    setProjectDeleteDistributionSummary({
      hasCopy: statuses.some(
        (status) => status.exists && status.mode !== "symlink",
      ),
      hasSymlink: statuses.some(
        (status) => status.exists && status.mode === "symlink",
      ),
    });
  };

  const confirmRemoveFromProjectTargets = async () => {
    if (!pendingProjectRemoval) {
      return;
    }
    const { project, targets } = pendingProjectRemoval;
    setPendingProjectRemoval(null);
    setIsProjectDeploying(true);
    try {
      await Promise.all(
        targets.map((target) =>
          window.api.skill.deleteLocalFileByPath(target.localPath, "."),
        ),
      );
      showToast(
        t("skill.projectRemoveDistributionSuccess", {
          count: targets.length,
          defaultValue: "Removed from {{count}} project folder(s).",
        }),
        "success",
      );
      await scanProjectSkills(project);
      updateSkillProject(project.id, { lastScannedAt: Date.now() });
    } catch (error) {
      showToast(
        t("skill.projectRemoveDistributionFailed", {
          reason: getErrorMessage(error),
          defaultValue: "Failed to remove project skill: {{reason}}",
        }),
        "error",
      );
    } finally {
      setIsProjectDeploying(false);
    }
  };

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
  const groupedSafetyFindings = useMemo(
    () => groupSkillSafetyFindings(safetyReport?.findings ?? []),
    [safetyReport?.findings],
  );

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
      stalePromptFingerprintRef.current = null;
      setShowTranslation(false);
      setIsRetranslatePromptOpen(false);
      setTranslationSidecar(null);
      setSourceUpdateStatus(null);
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

  useEffect(() => {
    if (!selectedSkill || !autoScanInstalledSkills || isAgentDetail) {
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
          aiConfig: getSafetyScanAIConfig(aiModels),
        });
        if (!cancelled) {
          setSafetyReport(report);
          // Persist to DB + update store
          try {
            await saveSafetyReport(selectedSkill.id, report);
          } catch (err) {
            console.warn("Failed to persist auto-scan safety report:", err);
          }
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
    aiModels,
    autoScanInstalledSkills,
    resolvedSkillMdContent,
    selectedSkill,
    isAgentDetail,
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
    }
  };

  const requestUninstallFromPlatform = (platformId: string) => {
    setPendingUninstallPlatform(platformId);
  };

  const confirmUninstallFromPlatform = async () => {
    if (!pendingUninstallPlatform) {
      return;
    }

    const platformId = pendingUninstallPlatform;
    setPendingUninstallPlatform(null);

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

  const hasSourceUpdateMetadata = Boolean(
    !isExternalDetail && (selectedSkill.source_url || selectedSkill.content_url),
  );
  const showApplySourceUpdate = sourceUpdateStatus === "update-available";
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
      setIsScanningSafety(false);
    }
  };

  const showSourceUpdateToast = (status: RegistrySkillUpdateStatus) => {
    if (status === "update-available") {
      showToast(t("skill.sourceUpdateAvailable", "Update available"), "info");
      return;
    }
    if (status === "up-to-date") {
      showToast(t("skill.sourceUpToDate", "Already up to date"), "success");
      return;
    }
    if (status === "local-modified") {
      showToast(
        t(
          "skill.sourceUpdateLocalModified",
          "Local changes detected. Create a snapshot or review changes before updating.",
        ),
        "warning",
      );
      return;
    }
    if (status === "conflict") {
      showToast(
        t(
          "skill.sourceUpdateConflict",
          "Source and local content both changed. Review versions before overwriting.",
        ),
        "warning",
      );
      return;
    }

    showToast(
      t("skill.sourceUpdateUnavailable", "No source update target found"),
      "error",
    );
  };

  const handleCheckSourceUpdate = async () => {
    if (!selectedSkill) return;

    setIsCheckingSourceUpdate(true);
    try {
      const check = await getInstalledSkillSourceUpdateStatus(selectedSkill.id);
      if (!check) {
        setSourceUpdateStatus(null);
        showToast(
          t("skill.sourceUpdateUnavailable", "No source update target found"),
          "error",
        );
        return;
      }

      setSourceUpdateStatus(check.status);
      showSourceUpdateToast(check.status);
    } catch (error) {
      console.error("Failed to check source updates:", error);
      showToast(
        `${t("skill.updateFailed", "Update failed")}: ${getErrorMessage(error)}`,
        "error",
      );
    } finally {
      setIsCheckingSourceUpdate(false);
    }
  };

  const handleUpdateFromSource = async () => {
    if (!selectedSkill) return;

    setIsUpdatingSource(true);
    try {
      const result = await updateInstalledSkillFromSource(selectedSkill.id);
      if (!result) {
        showToast(
          t("skill.sourceUpdateUnavailable", "No source update target found"),
          "error",
        );
        return;
      }
      if (result.status !== "updated") {
        setSourceUpdateStatus(result.check.status);
        showSourceUpdateToast(result.check.status);
        return;
      }

      setSourceUpdateStatus("up-to-date");
      await loadSkills();
      showToast(
        t("skill.sourceUpdateSuccess", "Updated from source"),
        "success",
      );
    } catch (error) {
      console.error("Failed to update from source:", error);
      showToast(
        `${t("skill.updateFailed", "Update failed")}: ${getErrorMessage(error)}`,
        "error",
      );
    } finally {
      setIsUpdatingSource(false);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopyStatus({ ...copyStatus, [key]: true });
    setTimeout(() => {
      setCopyStatus({ ...copyStatus, [key]: false });
    }, 2000);
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
    if (isExternalDetail) return;
    if (!selectedSkill) return;
    setDeleteCopyInstallations(false);
    setProjectDeleteDistributionSummary({ hasCopy: false, hasSymlink: false });
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
  };

  const handleTranslateSkill = async (forceRefresh = false) => {
    if (!selectedSkill) return;

    if (!forceRefresh && hasDisplayableTranslation && !hasStaleTranslation) {
      setShowTranslation(!showTranslation);
      return;
    }

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
      setIsTranslating(false);
    }
  };

  const handleSaveUserNotes = async () => {
    if (!selectedSkill || isExternalDetail) return;

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
      setIsCreatingSnapshot(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full app-wallpaper-section overflow-hidden animate-in fade-in slide-in-from-right-4 duration-smooth">
      {/* Header with back button */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 app-wallpaper-panel-strong z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              requestLeaveFileEditing(() => {
                if (onBack) {
                  onBack();
                  return;
                }
                selectSkill(null);
              });
            }}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-all active:scale-press-in"
            title={t("common.back", "Back")}
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
              {!isExternalDetail ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  {t("skill.currentVersion", "Version")} v
                  {selectedSkill.currentVersion || 0}
                </span>
              ) : null}
              {agentContext ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  <PlatformIcon
                    platformId={agentContext.platformId}
                    size={14}
                  />
                  {agentContext.platformName}
                </span>
              ) : null}
              {agentContext?.isPlatformBuiltin ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                  {t("skill.platformBuiltin", "Built-in")}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isProjectDetail && projectContext ? (
            <>
              {projectContext.importedSkill ? (
                <button
                  onClick={() => void projectActions?.onOpenManagedSkill?.()}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                  title={t("skill.openInMySkills", "Open in My Skills")}
                >
                  <FolderOpenIcon className="h-4 w-4" />
                  {t("skill.openInMySkills", "Open in My Skills")}
                </button>
              ) : null}
              <button
                onClick={() =>
                  void window.electron?.openPath?.(
                    selectedSkill.local_repo_path ||
                      selectedSkill.source_url ||
                      "",
                  )
                }
                className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                title={t("skill.openLocalSource", "Open Local Skill Folder")}
              >
                <FolderOpenIcon className="h-4 w-4" />
                {t("common.open", "Open")}
              </button>
              {projectActions?.onRemoveFromProject ? (
                <button
                  onClick={() => void projectActions.onRemoveFromProject?.()}
                  disabled={projectActions.isRemoving}
                  className="inline-flex items-center gap-2 rounded-full border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive transition-all hover:bg-destructive/10 disabled:opacity-60"
                  title={t("skill.removeFromProject", "Remove from Project")}
                >
                  {projectActions.isRemoving ? (
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                  ) : (
                    <TrashIcon className="h-4 w-4" />
                  )}
                  {t("skill.removeFromProject", "Remove from Project")}
                </button>
              ) : null}
            </>
          ) : null}
          {isAgentDetail && agentContext ? (
            <AgentSkillDetailActions
              isImporting={agentActions?.isImporting}
              isManaged={agentContext.isManaged}
              isUninstallDisabled={agentContext.isPlatformBuiltin}
              isUninstalling={agentActions?.isUninstalling}
              onImport={agentActions?.onImport}
              onOpenFolder={agentActions?.onOpenFolder}
              onOpenManagedSkill={agentActions?.onOpenManagedSkill}
              onUninstall={agentActions?.onUninstall}
              t={t}
              uninstallDisabledReason={t(
                "skill.platformBuiltinCannotUninstall",
                "Built-in skills cannot be removed from this agent.",
              )}
            />
          ) : null}
          {!isExternalDetail ? (
            <>
              {hasSourceUpdateMetadata ? (
                <button
                  onClick={
                    showApplySourceUpdate
                      ? handleUpdateFromSource
                      : handleCheckSourceUpdate
                  }
                  disabled={isCheckingSourceUpdate || isUpdatingSource}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:opacity-50"
                  title={
                    showApplySourceUpdate
                      ? t("skill.updateFromSource", "Update from Source")
                      : t("skill.checkSourceUpdates", "Check Source Updates")
                  }
                >
                  {isCheckingSourceUpdate || isUpdatingSource ? (
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                  ) : showApplySourceUpdate ? (
                    <RefreshCwIcon className="h-4 w-4" />
                  ) : (
                    <CheckCircleIcon className="h-4 w-4" />
                  )}
                  {isCheckingSourceUpdate
                    ? t("skill.checkingUpdates", "Checking")
                    : isUpdatingSource
                      ? t("skill.updatingFromSource", "Updating")
                      : showApplySourceUpdate
                        ? t("skill.updateFromSource", "Update from Source")
                        : t("skill.checkSourceUpdates", "Check Updates")}
                </button>
              ) : null}
              <button
                onClick={openSnapshotModal}
                disabled={isCreatingSnapshot}
                className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:opacity-50"
                title={t("skill.createSnapshot", "Create Snapshot")}
              >
                <SaveIcon className="h-4 w-4" />
                {t("skill.snapshot", "Snapshot")}
              </button>
              <button
                onClick={() => toggleFavorite(selectedSkill.id)}
                className={`p-2.5 rounded-full transition-all active:scale-press-in ${
                  selectedSkill.is_favorite
                    ? "text-yellow-500 hover:text-yellow-600"
                    : "text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10"
                }`}
                title={
                  selectedSkill.is_favorite
                    ? t("skill.removeFavorite", "Remove Favorite")
                    : t("skill.addFavorite", "Add to Favorites")
                }
              >
                <StarIcon
                  className={`w-5 h-5 ${selectedSkill.is_favorite ? "fill-current" : ""}`}
                />
              </button>
              <button
                onClick={() => setIsVersionHistoryOpen(true)}
                className="p-2.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full transition-all active:scale-press-in"
                title={t("skill.versionHistory", "Version History")}
              >
                <HistoryIcon className="w-5 h-5" />
              </button>
              <button
                onClick={() => setIsEditModalOpen(true)}
                className="p-2.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full transition-all active:scale-press-in"
                title={t("skill.edit", "Edit Skill")}
              >
                <PencilIcon className="w-5 h-5" />
              </button>
              <button
                onClick={handleDelete}
                className="p-2.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-all active:scale-press-in"
                title={t("common.delete", "Delete")}
              >
                <TrashIcon className="w-5 h-5" />
              </button>
            </>
          ) : null}
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
            {t("common.preview", "Preview")}
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
            {t("common.content", "Source / Content")}
          </div>
          {activeTab === "code" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
          )}
        </button>
        {runtimeCapabilities.skillFileEditing && (
          <button
            onClick={() => setActiveTab("files")}
            className={`py-3 text-sm font-semibold relative transition-colors ${activeTab === "files" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <div className="flex items-center gap-2">
              <FolderOpenIcon className="w-4 h-4" />
              {t("skill.files", "Files")}
            </div>
            {activeTab === "files" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        )}

        {/* Safety pill — compact, right-aligned in tab bar */}
        <button
          onClick={() => {
            if (safetyReport && !isScanningSafety) {
              setIsSafetyModalOpen(true);
            } else if (!isScanningSafety) {
              void runSafetyScan();
            }
          }}
          disabled={isScanningSafety}
          title={
            safetyReport
              ? t("skill.safetyModalTitle", "Safety Report")
              : t("skill.safetyAssessmentEmpty", "No safety scan run yet")
          }
          className={`ml-auto my-auto flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${safetyReport ? safetyTone : "border-border text-muted-foreground hover:border-primary/30 hover:text-primary"}`}
        >
          {isScanningSafety ? (
            <ShieldAlertIcon className="w-3.5 h-3.5 animate-pulse" />
          ) : safetyReport?.level === "safe" ? (
            <ShieldCheckIcon className="w-3.5 h-3.5" />
          ) : safetyReport ? (
            <ShieldAlertIcon className="w-3.5 h-3.5" />
          ) : (
            <ShieldIcon className="w-3.5 h-3.5" />
          )}
          {isScanningSafety
            ? t("skill.safetyScanning", "Scanning...")
            : safetyReport
              ? `${t("skill.safetyLevelLabel", "Risk Level")} - ${
                  (
                    {
                      safe: t("skill.safetyLevelSafe", "Safe"),
                      warn: t("skill.safetyLevelWarn", "Needs review"),
                      "high-risk": t("skill.safetyLevelHighRisk", "High risk"),
                      blocked: t("skill.safetyLevelBlocked", "Blocked"),
                    } as Record<string, string>
                  )[safetyReport.level] ?? safetyReport.level
                }`
              : t("skill.safetyAssessment", "Safety Assessment")}
        </button>
      </div>

      {/* Main content - two column layout */}
      <div
        ref={contentScrollRef}
        onScroll={handleContentScroll}
        className={`flex-1 flex flex-col ${runtimeCapabilities.skillFileEditing && activeTab === "files" ? "overflow-hidden" : "overflow-y-auto"}`}
      >
        {runtimeCapabilities.skillFileEditing && activeTab === "files" ? (
          /* Files Tab: inline file editor fills the entire content area */
          <div className="flex-1 flex flex-col app-wallpaper-panel min-h-0 overflow-hidden">
            <SkillFileEditor
              skillId={selectedSkill.id}
              localPath={
                isExternalDetail ? selectedSkill.local_repo_path : undefined
              }
              skillName={selectedSkill.name}
              isOpen={true}
              onSave={() =>
                isExternalDetail ? Promise.resolve() : loadSkills()
              }
              onUnsavedChange={setFileEditorHasUnsavedChanges}
              mode="inline"
            />
          </div>
        ) : (
          <div className="max-w-6xl mx-auto p-6 w-full">
            {activeTab === "preview" ? (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-stretch">
                <SkillPreviewPane
                  cachedInstructionsTranslation={
                    effectiveInstructionsTranslation
                  }
                  copyStatus={copyStatus}
                  handleCopy={handleCopy}
                  handleTranslateSkill={handleTranslateSkill}
                  hasStaleTranslation={hasStaleTranslation}
                  isTranslating={isTranslating}
                  resolvedDescription={resolvedDescription}
                  selectedSkill={selectedSkill}
                  showTranslation={showTranslation}
                  skillContent={effectiveSkillMdContent}
                  t={t}
                  translationMode={translationMode}
                />

                {!isExternalDetail ? (
                  <div className="space-y-6">
                    <section className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
                          <StickyNoteIcon className="h-4 w-4 shrink-0 text-primary" />
                          <h3 className="truncate text-xs font-semibold uppercase tracking-[0.3em]">
                            {t("skill.userNotes", "Personal Notes")}
                          </h3>
                        </div>
                        {isEditingUserNotes ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void handleSaveUserNotes()}
                              disabled={isSavingUserNotes}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                              title={t("common.save", "Save")}
                            >
                              {isSavingUserNotes ? (
                                <Loader2Icon className="h-4 w-4 animate-spin" />
                              ) : (
                                <SaveIcon className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelUserNotes}
                              disabled={isSavingUserNotes}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                              title={t("common.cancel", "Cancel")}
                            >
                              <XIcon className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setIsEditingUserNotes(true)}
                            disabled={isLoadingUserNotes}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-primary disabled:opacity-50"
                            title={t("skill.editUserNotes", "Edit notes")}
                          >
                            {isLoadingUserNotes ? (
                              <Loader2Icon className="h-4 w-4 animate-spin" />
                            ) : (
                              <PencilIcon className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>

                      <div
                        data-testid="skill-user-notes-card"
                        className="app-wallpaper-panel rounded-2xl border border-border p-4"
                      >
                        {isEditingUserNotes ? (
                          <Textarea
                            value={draftSkillUserNotes}
                            onChange={(event) =>
                              setDraftSkillUserNotes(event.target.value)
                            }
                            placeholder={t(
                              "skill.userNotesPlaceholder",
                              "Add private notes for this skill...",
                            )}
                            rows={5}
                            disabled={isSavingUserNotes}
                            className="min-h-[120px] resize-y"
                          />
                        ) : skillUserNotes.trim() ? (
                          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/85">
                            {skillUserNotes}
                          </p>
                        ) : (
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            {t(
                              "skill.userNotesEmpty",
                              "No personal notes yet.",
                            )}
                          </p>
                        )}
                      </div>
                    </section>
                    <SkillPlatformPanel
                      availablePlatforms={availablePlatforms}
                      handleExport={handleExport}
                      installMode={installMode}
                      installProgress={installProgress}
                      isBatchInstalling={isBatchInstalling}
                      isProjectDeploying={isProjectDeploying}
                      onBatchInstall={batchInstall}
                      onCreateProject={openCreateProjectModal}
                      onDeployToProjects={handleDeployToProjects}
                      getProjectDeployedTargets={getProjectDeployedTargets}
                      onRemoveFromProjectTargets={
                        requestRemoveFromProjectTargets
                      }
                      projectDeployMode={projectDeployMode}
                      projectSkillImportPreferencesByProjectId={
                        projectSkillImportPreferencesByProjectId
                      }
                      selectedPlatforms={selectedPlatforms}
                      selectedSkill={selectedSkill}
                      projects={skillProjects}
                      selectAllPlatforms={selectAllPlatforms}
                      deselectAllPlatforms={deselectAllPlatforms}
                      setInstallMode={setInstallMode}
                      setProjectDeployMode={handleSetProjectDeployMode}
                      setProjectSkillImportPreferences={
                        setProjectSkillImportPreferences
                      }
                      skillMdInstallStatus={skillMdInstallStatus}
                      t={t}
                      togglePlatformSelection={togglePlatformSelection}
                      getProjectDeployTargets={getProjectDeployTargets}
                      uninstallFromPlatform={requestUninstallFromPlatform}
                      uninstalledPlatforms={uninstalledPlatforms}
                    />
                  </div>
                ) : isProjectDetail ? (
                  <ProjectSkillPreviewSidebar
                    deployTargets={projectContext?.projectDeployTargets ?? []}
                    isDeploying={Boolean(projectActions?.isDeploying)}
                    isImporting={Boolean(projectActions?.isImporting)}
                    isImported={Boolean(projectContext?.importedSkill)}
                    isRemoving={Boolean(projectActions?.isRemoving)}
                    isImportAvailable={
                      typeof projectActions?.onImport === "function"
                    }
                    onAddDeployTarget={
                      projectActions?.onAddDeployTarget ?? (() => undefined)
                    }
                    onDeploy={
                      projectActions?.onDeployToProjectTargets ??
                      (() => undefined)
                    }
                    onImport={projectActions?.onImport ?? (() => undefined)}
                    onRemoveFromProject={projectActions?.onRemoveFromProject}
                    selectedSkill={selectedSkill}
                    sourcePath={
                      selectedSkill.local_repo_path ||
                      selectedSkill.source_url ||
                      ""
                    }
                    symlinkTargetPath={
                      projectContext?.scannedSkill.installMode === "symlink"
                        ? projectContext.scannedSkill.symlinkTargetPath
                        : undefined
                    }
                    t={t}
                  />
                ) : agentContext ? (
                  <AgentSkillPreviewSidebar
                    installMode={agentContext.installMode}
                    isImporting={Boolean(agentActions?.isImporting)}
                    isManaged={agentContext.isManaged}
                    onImport={agentActions?.onImport}
                    onOpenFolder={agentActions?.onOpenFolder}
                    onOpenSymlinkTarget={agentActions?.onOpenSymlinkTarget}
                    platformId={agentContext.platformId}
                    platformName={agentContext.platformName}
                    sourcePath={agentContext.sourcePath}
                    symlinkTargetPath={agentContext.symlinkTargetPath}
                    t={t}
                  />
                ) : null}
              </div>
            ) : (
              <SkillCodePane
                copyStatus={copyStatus}
                handleCopy={handleCopy}
                selectedSkill={selectedSkill}
                skillContent={effectiveSkillMdContent}
                t={t}
              />
            )}
          </div>
        )}
      </div>

      {showBackToTop && activeTab !== "files" && (
        <button
          onClick={scrollToTop}
          className="absolute bottom-6 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-border app-wallpaper-surface px-4 py-2 text-sm font-medium text-foreground shadow-lg transition-all duration-base hover:-translate-x-1/2 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-accent hover:text-primary hover:shadow-xl"
        >
          <ArrowUpIcon className="w-4 h-4" />
          {t("common.backToTop", "Back to Top")}
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
                    "This removes the skill from PromptHub. Source files are preserved. Distributed symlinks will be removed because they point back to PromptHub.",
                  )
                : t(
                    "skill.deleteSourceOnlyHint",
                    "Only removes this skill from the PromptHub library. Source files are preserved.",
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
              <label className="flex items-start gap-2 rounded-xl border border-border bg-accent/30 p-3 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-primary"
                  checked={deleteCopyInstallations}
                  onChange={(event) =>
                    setDeleteCopyInstallations(event.currentTarget.checked)
                  }
                />
                <span>
                  <span className="block font-medium text-foreground">
                    {t(
                      "skill.deleteCopyInstallationsLabel",
                      "Also delete copied distributions",
                    )}
                  </span>
                  <span className="mt-1 block text-muted-foreground">
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
        onClose={() => setPendingProjectRemoval(null)}
        onConfirm={() => {
          void confirmRemoveFromProjectTargets();
        }}
        variant="destructive"
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
        onClose={() => setPendingUninstallPlatform(null)}
        onConfirm={() => {
          void confirmUninstallFromPlatform();
        }}
        variant="destructive"
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
                  <SaveIcon className="h-4 w-4 animate-pulse" />
                  {t("common.saving", "Saving")}
                </>
              ) : (
                <>
                  <SaveIcon className="h-4 w-4" />
                  {t("skill.createSnapshot", "Create Snapshot")}
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Safety Report Modal */}
      <Modal
        isOpen={isSafetyModalOpen}
        onClose={() => setIsSafetyModalOpen(false)}
        title={t("skill.safetyModalTitle", "Safety Report")}
        size="lg"
      >
        {safetyReport && (
          <div className="space-y-5">
            {/* Header: level badge + meta */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-2">
                <div
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold w-fit ${safetyTone}`}
                >
                  {safetyReport.level === "safe" ? (
                    <ShieldCheckIcon className="w-4 h-4" />
                  ) : (
                    <ShieldAlertIcon className="w-4 h-4" />
                  )}
                  {(
                    {
                      safe: t("skill.safetyLevelSafe", "Safe"),
                      warn: t("skill.safetyLevelWarn", "Needs review"),
                      "high-risk": t("skill.safetyLevelHighRisk", "High risk"),
                      blocked: t("skill.safetyLevelBlocked", "Blocked"),
                    } as Record<string, string>
                  )[safetyReport.level] ?? safetyReport.level}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {getSkillSafetySummary(t, safetyReport)}
                </p>
              </div>
              {safetyReport.score !== undefined && (
                <div
                  className="flex flex-col items-center shrink-0 cursor-help"
                  title={t(
                    "skill.safetyScoreDesc",
                    "Score 0–100 (higher = safer). Based on risk level and number of findings: blocked 0–10, high-risk 20–40, caution 50–70, safe 80–100.",
                  )}
                >
                  <span className="text-2xl font-bold text-foreground">
                    {safetyReport.score}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    {t("skill.safetyScore", "Score")} / 100
                  </span>
                </div>
              )}
            </div>

            {/* Scoring dimensions */}
            {(() => {
              const CONTENT_CODES = new Set([
                "shell-pipe-exec",
                "dangerous-delete",
                "encoded-powershell",
                "encoded-shell-bootstrap",
                "privilege-escalation",
                "system-persistence",
                "secret-access",
                "security-bypass",
                "network-exfil",
                "exec-bit",
                "network-bootstrap",
                "env-mutation",
              ]);
              const SOURCE_CODES = new Set([
                "untrusted-source-host",
                "external-audits",
                "internal-source",
                "unknown-source",
                "invalid-source-url",
                "insecure-source-url",
              ]);
              const REPO_CODES = new Set([
                "persistence-file",
                "high-risk-binary",
                "script-file",
              ]);
              const findings = safetyReport.findings ?? [];
              const contentCount = findings.filter((f) =>
                CONTENT_CODES.has(f.code),
              ).length;
              const sourceCount = findings.filter((f) =>
                SOURCE_CODES.has(f.code),
              ).length;
              const repoCount = findings.filter((f) =>
                REPO_CODES.has(f.code),
              ).length;
              const dims = [
                {
                  key: "content",
                  label: t("skill.safetyDimContent", "Content patterns"),
                  desc: t(
                    "skill.safetyDimContentDesc",
                    "AI review of SKILL.md instructions and suspicious repo files for dangerous commands, privilege escalation, secret access, prompt injection, and exfiltration behavior.",
                  ),
                  count: contentCount,
                },
                {
                  key: "source",
                  label: t("skill.safetyDimSource", "Source trust"),
                  desc: t(
                    "skill.safetyDimSourceDesc",
                    "Source provenance preflight plus AI context review for missing provenance, malformed URLs, custom hosts, and restricted internal addresses.",
                  ),
                  count: sourceCount,
                },
                {
                  key: "repo",
                  label: t("skill.safetyDimRepo", "Repository structure"),
                  desc: t(
                    "skill.safetyDimRepoDesc",
                    "Repository tree review for executable scripts, bundled binaries, persistence-related files, and other risky packaging signals surfaced to the AI scan.",
                  ),
                  count: repoCount,
                },
              ];
              return (
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 space-y-2">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    {t("skill.safetyDimensionTitle", "Scoring Dimensions")}
                  </p>
                  {dims.map((dim) => (
                    <div
                      key={dim.key}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm text-foreground truncate">
                          {dim.label}
                        </span>
                        <span
                          className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-muted text-muted-foreground text-[10px] cursor-help shrink-0"
                          title={dim.desc}
                        >
                          ?
                        </span>
                      </div>
                      <span
                        className={`text-xs font-medium shrink-0 ${
                          dim.count === 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {dim.count === 0
                          ? t("skill.safetyDimNoFindings", "Clean")
                          : t(
                              "skill.safetyDimFindings",
                              "{{count}} finding(s)",
                              {
                                count: dim.count,
                              },
                            )}
                      </span>
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/50 leading-relaxed">
                    {t(
                      "skill.safetyScoreFormula",
                      "Score formula: level sets the base range (blocked 0–10 · high-risk 20–40 · caution 50–70 · safe 80–100), then each finding deducts points within that range.",
                    )}
                  </p>
                </div>
              );
            })()}

            {/* Meta row */}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground border-t border-border pt-3">
              <span>
                {t("skill.safetyFilesChecked", "{{count}} file(s) checked", {
                  count: safetyReport.checkedFileCount,
                })}
              </span>
              <span>
                {t("skill.safetyScanMethod", "Method")}:{" "}
                {t("skill.safetyScanMethodAI", "AI-assisted")}
              </span>
              <span>
                {t("skill.safetyScanTime", "Scanned")}:{" "}
                {new Date(safetyReport.scannedAt).toLocaleString(
                  i18n.language || undefined,
                )}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              {getSkillSafetyMethodDescription(t, safetyReport)}
            </p>

            {/* Findings list */}
            <div className="space-y-2">
              {groupedSafetyFindings.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                  <CheckCircleIcon className="w-4 h-4 shrink-0" />
                  {t("skill.safetyNoFindings", "No issues found")}
                </div>
              ) : (
                groupedSafetyFindings.map((finding, idx) => {
                  const severityConfig = {
                    high: {
                      cls: "border-red-500/30 bg-red-500/5",
                      icon: (
                        <AlertTriangleIcon className="w-4 h-4 text-destructive shrink-0" />
                      ),
                      badge: "bg-red-500/15 text-red-700 dark:text-red-400",
                      label: t("skill.safetySeverityHigh", "High"),
                    },
                    warn: {
                      cls: "border-amber-500/30 bg-amber-500/5",
                      icon: (
                        <AlertTriangleIcon className="w-4 h-4 text-amber-500 shrink-0" />
                      ),
                      badge:
                        "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                      label: t("skill.safetySeverityWarn", "Warning"),
                    },
                    info: {
                      cls: "border-blue-500/20 bg-blue-500/5",
                      icon: (
                        <InfoIcon className="w-4 h-4 text-blue-500 shrink-0" />
                      ),
                      badge: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
                      label: t("skill.safetySeverityInfo", "Info"),
                    },
                  };
                  const cfg =
                    severityConfig[finding.severity] ?? severityConfig.info;
                  return (
                    <div
                      key={idx}
                      className={`rounded-lg border px-4 py-3 ${cfg.cls}`}
                    >
                      <div className="flex items-start gap-3">
                        {cfg.icon}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-foreground">
                              {getSkillSafetyFindingTitle(t, finding)}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.badge}`}
                            >
                              {cfg.label}
                            </span>
                            {finding.count > 1 && (
                              <span className="text-[10px] text-muted-foreground font-medium">
                                × {finding.count}
                              </span>
                            )}
                            {finding.filePaths[0] && (
                              <span className="text-[10px] text-muted-foreground font-mono truncate">
                                {finding.filePaths[0]}
                              </span>
                            )}
                          </div>
                          {finding.detail && (
                            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                              {finding.detail}
                            </p>
                          )}
                          {finding.evidences[0] && (
                            <code className="mt-1.5 block text-[11px] bg-muted/60 rounded px-2 py-1 text-muted-foreground font-mono break-all">
                              {finding.evidences[0]}
                            </code>
                          )}
                          {finding.filePaths.length > 1 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {finding.filePaths.slice(1, 5).map((filePath) => (
                                <span
                                  key={filePath}
                                  className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground font-mono"
                                >
                                  {filePath}
                                </span>
                              ))}
                              {finding.filePaths.length > 5 && (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                  +{finding.filePaths.length - 5}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer: rescan button */}
            <div className="flex items-center justify-end border-t border-border pt-4">
              <button
                type="button"
                onClick={async () => {
                  setIsSafetyModalOpen(false);
                  await runSafetyScan();
                  setIsSafetyModalOpen(true);
                }}
                disabled={isScanningSafety}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                <RefreshCwIcon
                  className={`h-4 w-4 ${isScanningSafety ? "animate-spin" : ""}`}
                />
                {isScanningSafety
                  ? t("skill.safetyScanning", "Scanning...")
                  : t("skill.safetyRescan", "Rescan")}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
