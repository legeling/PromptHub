import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpenIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  Loader2Icon,
  RefreshCwIcon,
  DownloadIcon,
  SendIcon,
  PencilIcon,
  TrashIcon,
  PlusIcon,
  SearchIcon,
  FolderIcon,
  CheckCircle2Icon,
} from "lucide-react";

import type {
  ScannedSkill,
  Skill,
  SkillProject,
} from "@prompthub/shared/types";
import { useSettingsStore } from "../../stores/settings.store";
import { useSkillStore } from "../../stores/skill.store";
import { useToast } from "../ui/Toast";
import { Modal } from "../ui/Modal";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Input } from "../ui/Input";
import { SkillQuickInstall } from "./SkillQuickInstall";
import { filterVisibleScannedSkills } from "../../services/skill-filter";
import { SkillFullDetailPage } from "./SkillFullDetailPage";
import { buildProjectDetailSkill } from "./project-detail-adapter";
import { SkillLibraryImportModal } from "./SkillLibraryImportModal";
import {
  getDeployableProjectTargetDirs,
  getProjectTargetDirsRequiringDeployment,
  normalizeProjectPathForComparison,
} from "../../services/project-skill-targets";
import {
  buildSkillLibraryIdentityLookup,
  isExternalScannedSkillInstall,
  matchScannedSkillWithLookup,
} from "../../services/skill-scan-status";

const OPEN_CREATE_SKILL_PROJECT_MODAL_EVENT = "open-create-skill-project-modal";
const PROJECT_SECTION_HEADER_CLASS =
  "h-[132px] border-b border-border app-wallpaper-panel-strong";

function inferProjectNameFromPath(rootPath: string): string {
  const normalized = rootPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "";
}

function getProjectInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

function getExtraProjectScanPaths(
  rootPath: string,
  scanPaths: string[],
): string[] {
  const normalizedRoot = normalizeProjectPathForComparison(rootPath);
  return scanPaths.filter(
    (entry) => normalizeProjectPathForComparison(entry) !== normalizedRoot,
  );
}

function getDefaultProjectDeployTargets(rootPath: string): string[] {
  const normalizedRoot = rootPath.replace(/[\\/]+$/, "");
  if (!normalizedRoot) {
    return [];
  }
  return [`${normalizedRoot}/.agents/skills`];
}

function getProjectDeployTargets(project: SkillProject): string[] {
  const configured = Array.isArray(project.deployTargets)
    ? project.deployTargets.filter(
        (entry) => typeof entry === "string" && entry.trim().length > 0,
      )
    : [];
  return Array.from(
    new Set(
      configured.length > 0
        ? configured
        : getDefaultProjectDeployTargets(project.rootPath),
    ),
  );
}

function getTargetSummary(
  targetDirs: string[],
  projectRootPath: string,
): string {
  const normalizedRoot = projectRootPath
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
  const labels = Array.from(
    new Set(
      targetDirs.map((targetDir) => {
        const normalizedTarget = targetDir
          .replace(/\\/g, "/")
          .replace(/\/+$/, "");
        if (
          normalizedRoot &&
          normalizedTarget.startsWith(`${normalizedRoot}/`)
        ) {
          return normalizedTarget.slice(normalizedRoot.length + 1);
        }
        return normalizedTarget;
      }),
    ),
  );

  return labels.join(", ");
}

interface ProjectFormModalProps {
  isOpen: boolean;
  project?: SkillProject | null;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    rootPath: string;
    scanPaths: string[];
  }) => boolean | Promise<boolean>;
}

function ProjectFormModal({
  isOpen,
  project,
  onClose,
  onSubmit,
}: ProjectFormModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [rootPath, setRootPath] = useState("");
  const [scanPathInput, setScanPathInput] = useState("");
  const [scanPaths, setScanPaths] = useState<string[]>([]);
  const [isNameAutoDerived, setIsNameAutoDerived] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isOpenRef = useRef(isOpen);
  const formSessionRef = useRef(0);
  const saveInFlightRef = useRef(false);

  useEffect(() => {
    isOpenRef.current = isOpen;
    if (!isOpen) {
      return;
    }
    formSessionRef.current += 1;

    setName(project?.name ?? "");
    setRootPath(project?.rootPath ?? "");
    setScanPaths(
      project
        ? getExtraProjectScanPaths(project.rootPath, project.scanPaths ?? [])
        : [],
    );
    setScanPathInput("");
    setIsNameAutoDerived(!project);
    setError(null);
    setIsSaving(false);
    saveInFlightRef.current = false;
  }, [isOpen, project]);

  useEffect(() => {
    if (!isOpen || !isNameAutoDerived) {
      return;
    }

    const inferredName = inferProjectNameFromPath(rootPath);
    setName(inferredName);
  }, [isNameAutoDerived, isOpen, rootPath]);

  const addScanPath = (value?: string) => {
    const nextPath = (value ?? scanPathInput).trim();
    if (!nextPath) {
      return;
    }
    setScanPaths((prev) =>
      prev.includes(nextPath) ? prev : [...prev, nextPath],
    );
    setScanPathInput("");
  };

  const removeScanPath = (targetPath: string) => {
    setScanPaths((prev) => prev.filter((path) => path !== targetPath));
  };

  const handlePickFolder = async (target: "root" | "scan") => {
    const selectedPath = await window.electron?.selectFolder?.();
    if (!selectedPath) {
      return;
    }

    if (target === "root") {
      setRootPath(selectedPath);
      return;
    }

    addScanPath(selectedPath);
  };

  const handleSubmit = async () => {
    if (saveInFlightRef.current) {
      return;
    }

    if (!name.trim() || !rootPath.trim()) {
      setError(
        t(
          "skill.projectFormRequired",
          "Project name and root path are required.",
        ),
      );
      return;
    }

    saveInFlightRef.current = true;
    setIsSaving(true);
    const submitSession = formSessionRef.current;
    try {
      const didSave = await onSubmit({
        name: name.trim(),
        rootPath: rootPath.trim(),
        scanPaths,
      });
      if (
        didSave &&
        isOpenRef.current &&
        formSessionRef.current === submitSession
      ) {
        onClose();
      }
    } finally {
      if (isOpenRef.current && formSessionRef.current === submitSession) {
        saveInFlightRef.current = false;
        setIsSaving(false);
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        project
          ? t("skill.editProject", "Edit Project")
          : t("skill.addProject", "Add Project")
      }
      size="lg"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            {t("skill.projectRootPath", "Project Root Path")}
          </label>
          <p className="text-xs text-muted-foreground">
            {t(
              "skill.projectRootPathFirstHint",
              "Choose the project root first. PromptHub can infer the project name and start scanning right away.",
            )}
          </p>
          <div
            data-testid="project-root-path-row"
            className="flex w-full items-start gap-2"
          >
            <div
              data-testid="project-root-path-input-shell"
              className="min-w-0 flex-1"
            >
              <Input
                aria-label={t("skill.projectRootPath", "Project Root Path")}
                value={rootPath}
                onChange={(event) => {
                  setRootPath(event.target.value);
                }}
                placeholder={t(
                  "skill.projectRootPathPlaceholder",
                  "/path/to/project",
                )}
              />
            </div>
            <button
              type="button"
              onClick={() => void handlePickFolder("root")}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-border app-wallpaper-surface px-4 text-sm text-foreground transition-colors hover:bg-accent"
            >
              <FolderOpenIcon aria-hidden="true" className="h-4 w-4" />
              {t("skill.browseFolder", "Browse")}
            </button>
          </div>
        </div>

        <Input
          label={t("skill.projectName", "Project Name")}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setIsNameAutoDerived(false);
          }}
          placeholder={t("skill.projectNamePlaceholder", "Workspace Project")}
          error={error ?? undefined}
        />

        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            {t("skill.projectScanPaths", "Scan Paths")}
          </label>
          <div
            data-testid="project-scan-path-row"
            className="flex w-full items-start gap-2"
          >
            <div
              data-testid="project-scan-path-input-shell"
              className="min-w-0 flex-1"
            >
              <Input
                aria-label={t("skill.projectScanPaths", "Scan Paths")}
                value={scanPathInput}
                onChange={(event) => setScanPathInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addScanPath();
                  }
                }}
                placeholder={t(
                  "skill.projectScanPathPlaceholder",
                  "Optional extra directories to scan",
                )}
              />
            </div>
            <button
              type="button"
              onClick={() => addScanPath()}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-border app-wallpaper-surface px-4 text-sm text-foreground transition-colors hover:bg-accent"
            >
              <PlusIcon aria-hidden="true" className="h-4 w-4" />
              {t("common.add", "Add")}
            </button>
            <button
              type="button"
              onClick={() => void handlePickFolder("scan")}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-border app-wallpaper-surface px-4 text-sm text-foreground transition-colors hover:bg-accent"
            >
              <FolderOpenIcon aria-hidden="true" className="h-4 w-4" />
              {t("skill.browseFolder", "Browse")}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "skill.projectScanPathsHint",
              "PromptHub always scans the project root plus default skill folders like .claude/skills, .agents/skills, skills, and .gemini. Add extra scan paths here only if your project uses custom locations.",
            )}
          </p>
          <div className="space-y-2">
            {scanPaths.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                {t(
                  "skill.projectScanPathsEmpty",
                  "No extra scan paths configured yet. PromptHub will still scan the project root automatically.",
                )}
              </div>
            ) : (
              scanPaths.map((scanPath) => (
                <div
                  key={scanPath}
                  className="flex items-center gap-2 rounded-xl border border-border app-wallpaper-surface px-3 py-2"
                >
                  <FolderIcon className="h-4 w-4 text-primary" />
                  <span className="flex-1 truncate font-mono text-xs text-foreground">
                    {scanPath}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeScanPath(scanPath)}
                    className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                  >
                    <TrashIcon aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border app-wallpaper-surface px-4 py-2 text-sm text-foreground transition-colors hover:bg-accent"
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? (
              <Loader2Icon
                aria-hidden="true"
                className="h-4 w-4 animate-spin"
              />
            ) : null}
            {project
              ? t("common.save", "Save")
              : t("skill.addProject", "Add Project")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function inferDisplayPath(localPath: string): string {
  const parts = localPath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length < 2) {
    return localPath;
  }

  return `.../${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

export function SkillProjectsView() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const skills = useSkillStore((state) => state.skills);
  const searchQuery = useSkillStore((state) => state.searchQuery);
  const scanProjectSkills = useSkillStore((state) => state.scanProjectSkills);
  const projectScanState = useSkillStore((state) => state.projectScanState);
  const selectedProjectId = useSkillStore((state) => state.selectedProjectId);
  const selectProject = useSkillStore((state) => state.selectProject);
  const selectSkill = useSkillStore((state) => state.selectSkill);
  const importScannedSkills = useSkillStore(
    (state) => state.importScannedSkills,
  );
  const loadDeployedStatus = useSkillStore((state) => state.loadDeployedStatus);
  const setStoreView = useSkillStore((state) => state.setStoreView);
  const skillProjects = useSettingsStore((state) => state.skillProjects);
  const addSkillProject = useSettingsStore((state) => state.addSkillProject);
  const updateSkillProject = useSettingsStore(
    (state) => state.updateSkillProject,
  );
  const removeSkillProject = useSettingsStore(
    (state) => state.removeSkillProject,
  );

  const [editingProject, setEditingProject] = useState<SkillProject | null>(
    null,
  );
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [quickInstallSkill, setQuickInstallSkill] = useState<Skill | null>(
    null,
  );
  const [isImportingPath, setIsImportingPath] = useState<string | null>(null);
  const [isDeployingPath, setIsDeployingPath] = useState<string | null>(null);
  const [isRemovingPath, setIsRemovingPath] = useState<string | null>(null);
  const [isLibraryImportModalOpen, setIsLibraryImportModalOpen] =
    useState(false);
  const [isImportingLibrarySkills, setIsImportingLibrarySkills] =
    useState(false);
  const [selectedProjectSkillPath, setSelectedProjectSkillPath] = useState<
    string | null
  >(null);
  const [projectPendingDelete, setProjectPendingDelete] =
    useState<SkillProject | null>(null);
  const autoScannedProjectIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (skillProjects.length === 0) {
      if (selectedProjectId !== null) {
        selectProject(null);
      }
      return;
    }

    const hasSelectedProject = skillProjects.some(
      (project) => project.id === selectedProjectId,
    );
    if (!hasSelectedProject) {
      selectProject(skillProjects[0].id);
    }
  }, [selectProject, selectedProjectId, skillProjects]);

  const selectedProject = useMemo(() => {
    if (!selectedProjectId) {
      return skillProjects[0] ?? null;
    }
    return (
      skillProjects.find((project) => project.id === selectedProjectId) ?? null
    );
  }, [selectedProjectId, skillProjects]);

  const currentProjectState =
    (selectedProject && projectScanState[selectedProject.id]) || null;
  const currentProjectDeployTargets = useMemo(
    () => (selectedProject ? getProjectDeployTargets(selectedProject) : []),
    [selectedProject],
  );
  const visibleProjectSkills = useMemo(() => {
    return filterVisibleScannedSkills(
      currentProjectState?.scannedSkills || [],
      searchQuery,
    );
  }, [currentProjectState?.scannedSkills, searchQuery]);

  useEffect(() => {
    if (!visibleProjectSkills.length && selectedProjectSkillPath !== null) {
      setSelectedProjectSkillPath(null);
      return;
    }

    if (!selectedProjectSkillPath) {
      return;
    }

    const stillExists = visibleProjectSkills.some(
      (skill) => skill.localPath === selectedProjectSkillPath,
    );
    if (!stillExists) {
      setSelectedProjectSkillPath(null);
    }
  }, [selectedProjectSkillPath, visibleProjectSkills]);

  useEffect(() => {
    setSelectedProjectSkillPath(null);
  }, [selectedProjectId]);

  const handleOpenCreate = useCallback(() => {
    setEditingProject(null);
    setIsProjectModalOpen(true);
  }, []);

  const handleAddProjectDeployTarget = useCallback(async () => {
    if (!selectedProject) {
      return;
    }

    const selectedPath = await window.electron?.selectFolder?.();
    if (!selectedPath) {
      return;
    }

    updateSkillProject(selectedProject.id, {
      deployTargets: [...currentProjectDeployTargets, selectedPath],
    });
  }, [currentProjectDeployTargets, selectedProject, updateSkillProject]);

  useEffect(() => {
    const handleOpenProjectModal = () => {
      handleOpenCreate();
    };

    document.addEventListener(
      OPEN_CREATE_SKILL_PROJECT_MODAL_EVENT,
      handleOpenProjectModal,
    );

    return () => {
      document.removeEventListener(
        OPEN_CREATE_SKILL_PROJECT_MODAL_EVENT,
        handleOpenProjectModal,
      );
    };
  }, [handleOpenCreate]);

  const handleSaveProject = async (input: {
    name: string;
    rootPath: string;
    scanPaths: string[];
  }): Promise<boolean> => {
    try {
      if (editingProject) {
        updateSkillProject(editingProject.id, input);
        showToast(t("skill.projectUpdated", "Project updated"), "success");
      } else {
        const createdProject = addSkillProject(input);
        selectProject(createdProject.id);
        showToast(
          t(
            "skill.projectCreatedAndScanning",
            "Project added. Scanning now...",
          ),
          "success",
        );
        await handleScanProject(createdProject, { suppressToast: true });
      }
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      showToast(
        errorMessage === "Skill project name and rootPath are required"
          ? t(
              "skill.projectFormRequired",
              "Project name and root path are required.",
            )
          : errorMessage === "Skill project root path already exists"
            ? t(
                "skill.projectRootPathExists",
                "This project root path is already registered.",
              )
            : errorMessage ||
              t("skill.projectSaveFailed", "Failed to save project"),
        "error",
      );
      return false;
    }
  };

  const handleConfirmDeleteProject = () => {
    if (!projectPendingDelete) {
      return;
    }

    const currentIndex = skillProjects.findIndex(
      (project) => project.id === projectPendingDelete.id,
    );
    const nextProject =
      skillProjects[currentIndex + 1] ||
      skillProjects[currentIndex - 1] ||
      null;

    removeSkillProject(projectPendingDelete.id);
    selectProject(nextProject?.id ?? null);
    setSelectedProjectSkillPath(null);
    setProjectPendingDelete(null);
    showToast(t("skill.projectDeleted", "Project removed"), "success");
  };

  const handleScanProject = useCallback(
    async (
      project: SkillProject,
      options?: { suppressToast?: boolean; suppressErrorToast?: boolean },
    ) => {
      try {
        const scanned = await scanProjectSkills(project);
        updateSkillProject(project.id, { lastScannedAt: Date.now() });
        if (!options?.suppressToast) {
          showToast(
            t("skill.projectScanComplete", {
              count: scanned.length,
              defaultValue: `Scanned ${scanned.length} skills`,
            }),
            "success",
          );
        }
        return scanned;
      } catch (error) {
        if (!options?.suppressErrorToast) {
          showToast(
            error instanceof Error
              ? error.message
              : t("skill.projectScanFailed", "Failed to scan project skills"),
            "error",
          );
        }
        throw error;
      }
    },
    [scanProjectSkills, showToast, t, updateSkillProject],
  );

  const handleImportProjectSkill = async (
    scannedSkill: ScannedSkill,
    importMode: "copy" | "symlink",
  ) => {
    setIsImportingPath(scannedSkill.localPath);
    try {
      let repoSkillMd: { content?: string } | null = null;
      if (!scannedSkill.instructions.trim()) {
        try {
          repoSkillMd =
            (await window.api.skill.readLocalFileByPath?.(
              scannedSkill.localPath,
              "SKILL.md",
            )) ?? null;
        } catch {
          repoSkillMd = null;
        }
      }
      const hydratedScannedSkill =
        repoSkillMd?.content && repoSkillMd.content.trim().length > 0
          ? {
              ...scannedSkill,
              instructions: repoSkillMd.content,
            }
          : scannedSkill;
      const result = await importScannedSkills(
        [hydratedScannedSkill],
        undefined,
        importMode,
      );
      if (result.importedCount === 0) {
        throw new Error(
          result.failed[0]?.reason ||
            result.skipped[0]?.reason ||
            t("skill.importFailed", "Failed to import skills"),
        );
      }

      showToast(
        t("skill.projectImportSuccess", {
          mode:
            importMode === "symlink"
              ? t("skill.symlink", "Symlink")
              : t("skill.copyMode", "Copy"),
          defaultValue: "Imported to My Skills ({{mode}})",
        }),
        "success",
      );
      await loadDeployedStatus({ force: true });
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : t("skill.importFailed", "Failed to import skills"),
        "error",
      );
    } finally {
      setIsImportingPath(null);
    }
  };

  const handleRemoveProjectSkill = useCallback(
    async (scannedSkill: ScannedSkill) => {
      if (!selectedProject) {
        return;
      }

      setIsRemovingPath(scannedSkill.localPath);
      try {
        await window.api.skill.deleteLocalFileByPath(
          scannedSkill.localPath,
          ".",
        );
        await handleScanProject(selectedProject, { suppressToast: true });
        showToast(
          t("skill.removeFromProjectSuccess", "Removed from project"),
          "success",
        );
        setSelectedProjectSkillPath(null);
      } catch (error) {
        showToast(
          error instanceof Error
            ? error.message
            : t(
                "skill.removeFromProjectFailed",
                "Failed to remove project skill",
              ),
          "error",
        );
      } finally {
        setIsRemovingPath(null);
      }
    },
    [
      handleScanProject,
      selectedProject,
      setSelectedProjectSkillPath,
      showToast,
      t,
    ],
  );

  useEffect(() => {
    if (!selectedProject) {
      return;
    }

    const scanState = projectScanState[selectedProject.id];
    if (scanState?.isScanning || scanState?.scannedAt || scanState?.error) {
      return;
    }

    if (autoScannedProjectIdsRef.current.has(selectedProject.id)) {
      return;
    }

    autoScannedProjectIdsRef.current.add(selectedProject.id);
    void handleScanProject(selectedProject, { suppressToast: true }).catch(
      () => {
        return undefined;
      },
    );
  }, [handleScanProject, projectScanState, selectedProject]);

  const importedLibrarySkillLookup = useMemo(() => {
    return buildSkillLibraryIdentityLookup(skills);
  }, [skills]);

  const getImportedLibrarySkill = useCallback(
    (scannedSkill: ScannedSkill): Skill | null => {
      return matchScannedSkillWithLookup(
        scannedSkill,
        importedLibrarySkillLookup,
      );
    },
    [importedLibrarySkillLookup],
  );

  const selectedScannedSkill = useMemo(
    () =>
      visibleProjectSkills.find(
        (skill) => skill.localPath === selectedProjectSkillPath,
      ) ?? null,
    [selectedProjectSkillPath, visibleProjectSkills],
  );

  const selectedImportedSkill = useMemo(
    () =>
      selectedScannedSkill
        ? getImportedLibrarySkill(selectedScannedSkill)
        : null,
    [getImportedLibrarySkill, selectedScannedSkill],
  );

  const selectedDetailSkill = useMemo(() => {
    if (!selectedProject || !selectedScannedSkill) {
      return null;
    }
    return buildProjectDetailSkill({
      scannedSkill: selectedScannedSkill,
      importedSkill: selectedImportedSkill,
      projectName: selectedProject.name,
      projectRootPath: selectedProject.rootPath,
      projectDeployTargets: currentProjectDeployTargets,
    });
  }, [
    currentProjectDeployTargets,
    selectedImportedSkill,
    selectedProject,
    selectedScannedSkill,
  ]);

  const handleDeployProjectSkill = useCallback(
    async (targetDirs: string[]) => {
      if (!selectedProject || !selectedDetailSkill || targetDirs.length === 0) {
        return;
      }

      const sourcePath =
        selectedDetailSkill.local_repo_path ||
        selectedDetailSkill.source_url ||
        "";
      if (!sourcePath.trim()) {
        showToast(
          t(
            "skill.projectDeployMissingSource",
            "Missing local skill source path.",
          ),
          "error",
        );
        return;
      }

      const deployableTargetDirs = getDeployableProjectTargetDirs(
        sourcePath,
        selectedDetailSkill.name,
        targetDirs,
      );
      if (deployableTargetDirs.length === 0) {
        showToast(
          t(
            "skill.projectDeployAlreadyAtTarget",
            "This skill is already inside the selected project target folders.",
          ),
          "warning",
        );
        return;
      }

      setIsDeployingPath(sourcePath);
      try {
        await Promise.all(
          deployableTargetDirs.map((targetDir) =>
            window.api.skill.copyRepoByPathToDirectory(
              sourcePath,
              selectedDetailSkill.name,
              targetDir,
            ),
          ),
        );
        await handleScanProject(selectedProject, { suppressToast: true });
        showToast(
          t("skill.projectDeploySuccess", {
            count: deployableTargetDirs.length,
            defaultValue: "Deployed to {{count}} project folder(s).",
          }),
          "success",
        );
      } catch (error) {
        showToast(
          t("skill.projectDeployFailed", {
            reason: error instanceof Error ? error.message : String(error),
            defaultValue: "Failed to deploy project skill: {{reason}}",
          }),
          "error",
        );
      } finally {
        setIsDeployingPath(null);
      }
    },
    [handleScanProject, selectedDetailSkill, selectedProject, showToast, t],
  );

  const handleImportLibrarySkillsToProject = useCallback(
    async ({
      skillIds,
      targetDirs,
      importMode,
    }: {
      skillIds: string[];
      targetDirs: string[];
      importMode: "copy" | "symlink";
    }) => {
      if (
        !selectedProject ||
        skillIds.length === 0 ||
        targetDirs.length === 0
      ) {
        return;
      }

      const selectedLibrarySkills = skills.filter((skill) =>
        skillIds.includes(skill.id),
      );

      setIsImportingLibrarySkills(true);
      try {
        const ensuredRepoPaths = await Promise.all(
          selectedLibrarySkills.map(async (skill) => {
            const repoPath = await window.api.skill.getRepoPath(skill.id);
            if (!repoPath) {
              throw new Error(
                `${skill.name}: ${t(
                  "skill.projectDeployMissingSource",
                  "Missing local skill source path.",
                )}`,
              );
            }
            return {
              skill,
              repoPath,
            };
          }),
        );

        const scannedProjectSkills = currentProjectState?.scannedSkills ?? [];
        const copyJobs = ensuredRepoPaths.flatMap(({ skill, repoPath }) =>
          getProjectTargetDirsRequiringDeployment(
            scannedProjectSkills,
            skill,
            targetDirs,
          ).map((targetDir) => ({
            repoPath,
            skill,
            targetDir,
          })),
        );

        if (copyJobs.length === 0) {
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
          copyJobs.map(({ skill, repoPath, targetDir }) =>
            window.api.skill.copyRepoByPathToDirectory(
              repoPath,
              skill.name,
              targetDir,
              { ifExists: "overwrite", mode: importMode },
            ),
          ),
        );
        setIsLibraryImportModalOpen(false);
        showToast(
          t("skill.projectImportLibrarySuccess", {
            count: selectedLibrarySkills.length,
            mode:
              importMode === "symlink"
                ? t("skill.symlink", "Symlink")
                : t("skill.copyMode", "Copy"),
            targets: getTargetSummary(targetDirs, selectedProject.rootPath),
            defaultValue:
              "Imported {{count}} library skill(s) into this project via {{mode}} ({{targets}}).",
          }),
          "success",
        );
        void handleScanProject(selectedProject, {
          suppressToast: true,
          suppressErrorToast: true,
        }).catch(() => {
          showToast(
            t("skill.projectImportLibraryRescanFailed", {
              defaultValue:
                "Import completed, but PromptHub could not refresh the project list. Please rescan manually.",
            }),
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
        setIsImportingLibrarySkills(false);
      }
    },
    [
      currentProjectState?.scannedSkills,
      handleScanProject,
      selectedProject,
      showToast,
      skills,
      t,
    ],
  );

  const handleOpenProjectSkillDetail = useCallback(
    (scannedSkill: ScannedSkill) => {
      setStoreView("projects");
      selectSkill(null);
      setSelectedProjectSkillPath(scannedSkill.localPath);
    },
    [selectSkill, setStoreView],
  );

  const handleBackToProjectSkills = useCallback(() => {
    setStoreView("projects");
    selectSkill(null);
    setSelectedProjectSkillPath(null);
  }, [selectSkill, setStoreView]);

  const isShowingProjectDetail = Boolean(
    selectedScannedSkill && selectedDetailSkill,
  );

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {isShowingProjectDetail ? (
        <SkillFullDetailPage
          overrideSkill={selectedDetailSkill ?? undefined}
          projectContext={
            selectedScannedSkill && selectedProject
              ? {
                  scannedSkill: selectedScannedSkill,
                  importedSkill: selectedImportedSkill,
                  projectName: selectedProject.name,
                  projectRootPath: selectedProject.rootPath,
                  projectDeployTargets: currentProjectDeployTargets,
                }
              : null
          }
          projectActions={
            selectedScannedSkill
              ? {
                  isDeploying:
                    isDeployingPath === selectedScannedSkill.localPath,
                  isImporting:
                    isImportingPath === selectedScannedSkill.localPath,
                  isRemoving: isRemovingPath === selectedScannedSkill.localPath,
                  onAddDeployTarget: handleAddProjectDeployTarget,
                  onDeployToProjectTargets: handleDeployProjectSkill,
                  onImport: () =>
                    handleImportProjectSkill(selectedScannedSkill, "copy"),
                  onOpenManagedSkill: selectedImportedSkill
                    ? () => {
                        setStoreView("my-skills");
                        selectSkill(selectedImportedSkill.id);
                      }
                    : undefined,
                  onRemoveFromProject: () =>
                    handleRemoveProjectSkill(selectedScannedSkill),
                }
              : null
          }
          onBack={handleBackToProjectSkills}
        />
      ) : (
        <>
          <div className="w-80 shrink-0 border-r border-border app-wallpaper-panel-strong">
            <div className={PROJECT_SECTION_HEADER_CLASS}>
              <div className="flex h-full items-start justify-between gap-4 px-4 py-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-foreground">
                    {t("nav.projects", "Projects")}
                  </h2>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {t(
                      "skill.projectsSidebarHint",
                      "Register project directories and manage their local skills.",
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleOpenCreate}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-colors hover:bg-primary/90"
                  aria-label={t("skill.addProject", "Add Project")}
                  title={t("skill.addProject", "Add Project")}
                >
                  <FolderPlusIcon aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-2 overflow-y-auto p-3">
              {skillProjects.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  <FolderIcon className="mx-auto mb-3 h-10 w-10 opacity-30" />
                  <div className="font-medium text-foreground">
                    {t("skill.noProjects", "No projects yet")}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t(
                      "skill.noProjectsHint",
                      "Add a project root to scan and manage project-local skills.",
                    )}
                  </div>
                </div>
              ) : (
                skillProjects.map((project) => {
                  const isActive = selectedProject?.id === project.id;
                  const scanState = projectScanState[project.id];
                  return (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => selectProject(project.id)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                        isActive
                          ? "border-primary/40 bg-primary/5"
                          : "border-border app-wallpaper-surface hover:bg-accent"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-sm font-semibold text-primary">
                            {getProjectInitial(project.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-foreground">
                              {project.name}
                            </div>
                            <div className="mt-1 truncate text-[11px] text-muted-foreground">
                              {project.rootPath}
                            </div>
                          </div>
                        </div>
                        {scanState?.isScanning ? (
                          <Loader2Icon
                            aria-hidden="true"
                            className="h-4 w-4 shrink-0 animate-spin text-primary"
                          />
                        ) : null}
                      </div>
                      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                          {t("skill.projectSkillCount", {
                            count: scanState?.scannedSkills.length || 0,
                            defaultValue: `${scanState?.scannedSkills.length || 0} skills`,
                          })}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 overflow-hidden">
            {selectedProject ? (
              <div
                key={selectedProject.id}
                data-testid="project-detail-shell"
                data-project-id={selectedProject.id}
                className="min-w-0 flex-1 overflow-hidden animate-in fade-in slide-in-from-right-3 duration-smooth"
              >
                <div className="flex h-full min-h-0 flex-col overflow-hidden">
                  <div className={PROJECT_SECTION_HEADER_CLASS}>
                    <div className="flex h-full items-start justify-between gap-4 px-6 py-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-base font-semibold text-primary">
                            {getProjectInitial(selectedProject.name)}
                          </div>
                          <h2 className="truncate text-xl font-semibold text-foreground">
                            {selectedProject.name}
                          </h2>
                        </div>
                        <div className="mt-1.5 space-y-1 text-sm text-muted-foreground">
                          <div className="line-clamp-1 break-all">
                            {selectedProject.rootPath}
                          </div>
                          <div className="text-xs">
                            {t("skill.projectSkillCount", {
                              count:
                                currentProjectState?.scannedSkills.length || 0,
                              defaultValue: `${currentProjectState?.scannedSkills.length || 0} skills`,
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2 self-end">
                        <button
                          type="button"
                          onClick={() =>
                            void handleScanProject(selectedProject)
                          }
                          disabled={currentProjectState?.isScanning}
                          aria-label={t("common.refresh", "Refresh")}
                          title={t("common.refresh", "Refresh")}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border app-wallpaper-surface text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
                        >
                          {currentProjectState?.isScanning ? (
                            <Loader2Icon
                              aria-hidden="true"
                              className="h-4 w-4 animate-spin"
                            />
                          ) : (
                            <RefreshCwIcon
                              aria-hidden="true"
                              className="h-4 w-4"
                            />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProject(selectedProject);
                            setIsProjectModalOpen(true);
                          }}
                          aria-label={t("common.edit", "Edit")}
                          title={t("common.edit", "Edit")}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border app-wallpaper-surface text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <PencilIcon aria-hidden="true" className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setProjectPendingDelete(selectedProject)
                          }
                          aria-label={t(
                            "skill.deleteProjectTitle",
                            "Delete project",
                          )}
                          title={t(
                            "skill.deleteProjectTitle",
                            "Delete project",
                          )}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 text-destructive transition-colors hover:border-destructive/30 hover:bg-destructive/10"
                        >
                          <TrashIcon aria-hidden="true" className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {currentProjectState?.error ? (
                    <div className="mx-6 mt-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {currentProjectState.error}
                    </div>
                  ) : null}

                  <div className="min-h-0 flex-1 overflow-y-auto p-6">
                    {(currentProjectState?.scannedSkills.length || 0) === 0 ? (
                      <div className="flex min-h-[280px] flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-accent/10 px-6 text-center text-muted-foreground">
                        <SearchIcon className="mb-4 h-10 w-10 opacity-30" />
                        <div className="text-base font-semibold text-foreground">
                          {t(
                            "skill.projectNoScanResults",
                            "No scanned skills yet",
                          )}
                        </div>
                        <div className="mt-2 max-w-xl text-sm text-muted-foreground">
                          {t(
                            "skill.projectNoScanResultsHint",
                            "Run a scan to discover SKILL.md files inside this project, then choose whether to import them into PromptHub or just manage the source paths directly.",
                          )}
                        </div>
                      </div>
                    ) : visibleProjectSkills.length === 0 ? (
                      <div className="flex min-h-[240px] flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-accent/10 px-6 text-center text-muted-foreground">
                        <SearchIcon className="mb-4 h-10 w-10 opacity-30" />
                        <div className="text-base font-semibold text-foreground">
                          {t("skill.noResults", "No skills found")}
                        </div>
                      </div>
                    ) : (
                      <div
                        data-testid="project-skills-list"
                        className="space-y-2"
                      >
                        {visibleProjectSkills.map((scannedSkill) => {
                          const importedSkill =
                            getImportedLibrarySkill(scannedSkill);
                          const isInMySkills = Boolean(importedSkill);
                          const isExternalInstall =
                            isExternalScannedSkillInstall(
                              scannedSkill,
                              isInMySkills,
                            );

                          return (
                            <article
                              key={scannedSkill.filePath}
                              data-testid="project-skill-card"
                              className="group rounded-2xl border border-border app-wallpaper-surface transition-colors hover:border-primary/30 hover:bg-accent/30"
                            >
                              <div className="grid min-h-[124px] grid-cols-[minmax(0,1fr)_12rem] items-stretch gap-4 px-4 py-4 max-[760px]:grid-cols-1 max-[760px]:items-start">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleOpenProjectSkillDetail(scannedSkill)
                                  }
                                  className="min-w-0 self-stretch text-left"
                                >
                                  <div className="flex min-w-0 items-start gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">
                                      {getProjectInitial(scannedSkill.name)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                                        <div className="truncate text-base font-semibold text-foreground">
                                          {scannedSkill.name}
                                        </div>
                                        {scannedSkill.version ? (
                                          <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                            v{scannedSkill.version}
                                          </span>
                                        ) : null}
                                        {isInMySkills ? (
                                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
                                            <CheckCircle2Icon
                                              aria-hidden="true"
                                              className="h-3 w-3"
                                            />
                                            {t(
                                              "skill.inMySkillsBadge",
                                              "In My Skills",
                                            )}
                                          </span>
                                        ) : null}
                                      </div>
                                      <div className="mt-1.5 line-clamp-2 min-h-12 max-w-3xl text-sm leading-6 text-muted-foreground">
                                        {scannedSkill.description ||
                                          scannedSkill.author}
                                      </div>
                                      <div className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
                                        {inferDisplayPath(
                                          scannedSkill.localPath,
                                        )}
                                      </div>
                                      <div className="mt-3 flex flex-wrap gap-1.5">
                                        {isExternalInstall ? (
                                          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                                            {t(
                                              "skill.externalInstall",
                                              "External install",
                                            )}
                                          </span>
                                        ) : (
                                          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                                            {scannedSkill.installMode ===
                                            "symlink"
                                              ? t(
                                                  "skill.installModeSymlink",
                                                  "Symlink install",
                                                )
                                              : t(
                                                  "skill.installModeCopy",
                                                  "Copy install",
                                                )}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </button>
                                <div
                                  data-testid="project-skill-actions"
                                  className="flex w-full shrink-0 items-end justify-end gap-2 self-end justify-self-end max-[760px]:justify-start"
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void window.electron?.openPath?.(
                                        scannedSkill.localPath,
                                      )
                                    }
                                    aria-label={t(
                                      "skill.openSkillFolder",
                                      "Open Folder",
                                    )}
                                    title={t(
                                      "skill.openSkillFolder",
                                      "Open Folder",
                                    )}
                                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                  >
                                    <FolderOpenIcon
                                      aria-hidden="true"
                                      className="h-4 w-4"
                                    />
                                  </button>
                                  {isInMySkills && importedSkill ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setStoreView("my-skills");
                                          selectSkill(importedSkill.id);
                                        }}
                                        aria-label={t(
                                          "skill.openInMySkills",
                                          "Open in My Skills",
                                        )}
                                        title={t(
                                          "skill.openInMySkills",
                                          "Open in My Skills",
                                        )}
                                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                      >
                                        <BookOpenIcon
                                          aria-hidden="true"
                                          className="h-4 w-4"
                                        />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setQuickInstallSkill(importedSkill)
                                        }
                                        aria-label={t(
                                          "skill.importAndDistribute",
                                          "Distribute",
                                        )}
                                        title={t(
                                          "skill.importAndDistribute",
                                          "Distribute",
                                        )}
                                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-colors hover:bg-primary/90"
                                      >
                                        <SendIcon
                                          aria-hidden="true"
                                          className="h-4 w-4"
                                        />
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleImportProjectSkill(
                                          scannedSkill,
                                          "copy",
                                        )
                                      }
                                      disabled={
                                        isImportingPath ===
                                        scannedSkill.localPath
                                      }
                                      aria-label={t(
                                        "skill.addToLibrary",
                                        "Import to My Skills",
                                      )}
                                      title={t(
                                        "skill.addToLibrary",
                                        "Import to My Skills",
                                      )}
                                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
                                    >
                                      {isImportingPath ===
                                      scannedSkill.localPath ? (
                                        <Loader2Icon
                                          aria-hidden="true"
                                          className="h-4 w-4 animate-spin"
                                        />
                                      ) : (
                                        <DownloadIcon
                                          aria-hidden="true"
                                          className="h-4 w-4"
                                        />
                                      )}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleRemoveProjectSkill(
                                        scannedSkill,
                                      )
                                    }
                                    disabled={
                                      isRemovingPath === scannedSkill.localPath
                                    }
                                    aria-label={t(
                                      "skill.removeFromProject",
                                      "Remove from Project",
                                    )}
                                    title={`${t("skill.removeFromProject", "Remove from Project")}: ${scannedSkill.name}`}
                                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
                                  >
                                    {isRemovingPath ===
                                    scannedSkill.localPath ? (
                                      <Loader2Icon
                                        aria-hidden="true"
                                        className="h-4 w-4 animate-spin"
                                      />
                                    ) : (
                                      <TrashIcon
                                        aria-hidden="true"
                                        className="h-4 w-4"
                                      />
                                    )}
                                  </button>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-border p-3">
                    <button
                      type="button"
                      onClick={() => setIsLibraryImportModalOpen(true)}
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-primary/90"
                    >
                      <BookOpenIcon aria-hidden="true" className="h-4 w-4" />
                      {t("skill.importFromMySkills", "Import from My Skills")}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-center text-muted-foreground">
                <div>
                  <FolderIcon className="mx-auto mb-4 h-12 w-12 opacity-30" />
                  <div className="text-lg font-semibold text-foreground">
                    {t("skill.selectProject", "Select a Project")}
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {t(
                      "skill.selectProjectHint",
                      "Choose a registered project on the left or add a new one to start scanning project-local skills.",
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <ProjectFormModal
        isOpen={isProjectModalOpen}
        project={editingProject}
        onClose={() => {
          setIsProjectModalOpen(false);
          setEditingProject(null);
        }}
        onSubmit={handleSaveProject}
      />

      <ConfirmDialog
        isOpen={projectPendingDelete !== null}
        onClose={() => setProjectPendingDelete(null)}
        onConfirm={handleConfirmDeleteProject}
        variant="destructive"
        title={t("skill.deleteProjectTitle", "Delete project")}
        message={t("skill.deleteProjectMessage", {
          name: projectPendingDelete?.name || "",
          defaultValue:
            'Remove project "{{name}}" from PromptHub? This only removes the project workspace record and does not delete any files.',
        })}
        confirmText={t("common.delete", "Delete")}
        cancelText={t("common.cancel", "Cancel")}
      />

      {quickInstallSkill ? (
        <SkillQuickInstall
          skill={quickInstallSkill}
          onClose={() => setQuickInstallSkill(null)}
        />
      ) : null}

      <SkillLibraryImportModal
        isOpen={isLibraryImportModalOpen}
        isDeploying={isImportingLibrarySkills}
        onClose={() => setIsLibraryImportModalOpen(false)}
        onPickCustomTarget={() => window.electron?.selectFolder?.()}
        onConfirm={handleImportLibrarySkillsToProject}
        project={selectedProject}
        scannedSkills={currentProjectState?.scannedSkills ?? []}
        skills={skills}
      />
    </div>
  );
}
