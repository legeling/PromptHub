import { useEffect, useMemo, useState } from "react";
import {
  CheckIcon,
  CheckSquareIcon,
  CopyPlusIcon,
  FileTextIcon,
  FolderPlusIcon,
  PackageIcon,
  FolderOpenIcon,
  GithubIcon,
  LinkIcon,
  Loader2Icon,
  SendIcon,
  SquareIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Settings2Icon,
} from "lucide-react";
import type { TFunction } from "i18next";
import type { Skill, SkillProject } from "@prompthub/shared/types";
import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
import { PlatformIcon } from "../ui/PlatformIcon";
import { getProtocolDisplayLabel, getSkillSourceMeta } from "./detail-utils";
import { getRuntimeCapabilities } from "../../runtime";
import type { ProjectDeployedSkillTarget } from "../../services/project-skill-targets";

interface SkillPlatformPanelProps {
  availablePlatforms: SkillPlatform[];
  handleExport: (format: "skillmd" | "zip") => void;
  installMode: "copy" | "symlink";
  projectDeployMode?: "copy" | "symlink";
  installProgress: { current: number; total: number } | null;
  isBatchInstalling: boolean;
  selectedPlatforms: Set<string>;
  selectedSkill: Skill;
  selectAllPlatforms: () => void;
  deselectAllPlatforms: () => void;
  setInstallMode: (mode: "copy" | "symlink") => void;
  setProjectDeployMode?: (mode: "copy" | "symlink") => void;
  skillMdInstallStatus: Record<string, boolean>;
  t: TFunction;
  togglePlatformSelection: (platformId: string) => void;
  uninstallFromPlatform: (platformId: string) => void;
  uninstalledPlatforms: SkillPlatform[];
  onBatchInstall: () => void;
  projects?: SkillProject[];
  getProjectDeployTargets?: (project: SkillProject) => string[];
  projectSkillImportPreferencesByProjectId?: Record<
    string,
    ProjectSkillImportPreferences
  >;
  setProjectSkillImportPreferences?: (
    projectId: string,
    preferences: ProjectSkillImportPreferences,
  ) => void;
  isProjectDeploying?: boolean;
  onCreateProject?: () => void;
  onDeployToProjects?: (
    projectIds: string[],
    targetDirsByProjectId?: Record<string, string[]>,
  ) => void | Promise<void>;
  getProjectDeployedTargets?: (
    project: SkillProject,
  ) => ProjectDeployedSkillTarget[];
  onRemoveFromProjectTargets?: (
    projectId: string,
    targets: ProjectDeployedSkillTarget[],
  ) => void | Promise<void>;
}

interface ProjectSkillImportPreferences {
  selectedTargetIds: string[];
  customTargets: string[];
}

const PROJECT_TARGET_OPTIONS = [
  ".agents/skills",
  ".claude/skills",
  ".gemini/skills",
] as const;

export function SkillPlatformPanel({
  availablePlatforms,
  handleExport,
  installMode,
  projectDeployMode = "copy",
  installProgress,
  isBatchInstalling,
  selectedPlatforms,
  selectedSkill,
  selectAllPlatforms,
  deselectAllPlatforms,
  setInstallMode,
  setProjectDeployMode,
  skillMdInstallStatus,
  t,
  togglePlatformSelection,
  uninstallFromPlatform,
  uninstalledPlatforms,
  onBatchInstall,
  projects,
  getProjectDeployTargets,
  projectSkillImportPreferencesByProjectId = {},
  setProjectSkillImportPreferences,
  isProjectDeploying = false,
  onCreateProject,
  onDeployToProjects,
  getProjectDeployedTargets,
  onRemoveFromProjectTargets,
}: SkillPlatformPanelProps) {
  const sourceMeta = getSkillSourceMeta(selectedSkill, t);
  const runtimeCapabilities = getRuntimeCapabilities();
  const showPlatformIntegration = runtimeCapabilities.skillPlatformIntegration;
  const showLocalSourceShortcut =
    runtimeCapabilities.desktopWindowControls && sourceMeta?.kind === "local";
  const normalizedProjects = projects ?? [];
  const hasGlobalIntegration =
    showPlatformIntegration && availablePlatforms.length > 0;
  const hasProjectIntegration =
    showPlatformIntegration &&
    typeof getProjectDeployTargets === "function" &&
    typeof onCreateProject === "function" &&
    typeof onDeployToProjects === "function";
  const showIntegrationSection = hasGlobalIntegration || hasProjectIntegration;
  const [integrationScope, setIntegrationScope] = useState<
    "global" | "project"
  >(hasGlobalIntegration ? "global" : "project");
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [showProjectAdvanced, setShowProjectAdvanced] = useState(false);
  const [projectTargetSelections, setProjectTargetSelections] = useState<
    Record<string, string[]>
  >({});

  useEffect(() => {
    if (
      integrationScope === "global" &&
      !hasGlobalIntegration &&
      hasProjectIntegration
    ) {
      setIntegrationScope("project");
      return;
    }

    if (
      integrationScope === "project" &&
      !hasProjectIntegration &&
      hasGlobalIntegration
    ) {
      setIntegrationScope("global");
    }
  }, [hasGlobalIntegration, hasProjectIntegration, integrationScope]);

  useEffect(() => {
    setIntegrationScope(hasGlobalIntegration ? "global" : "project");
    setSelectedProjectIds(new Set());
    setShowProjectAdvanced(false);
    setProjectTargetSelections({});
  }, [hasGlobalIntegration, selectedSkill.id]);

  const effectiveSelectedProjectIds = useMemo(() => {
    const validProjectIds = new Set(
      normalizedProjects.map((project) => project.id),
    );
    return new Set(
      Array.from(selectedProjectIds).filter((projectId) =>
        validProjectIds.has(projectId),
      ),
    );
  }, [normalizedProjects, selectedProjectIds]);

  const toggleProjectSelection = (projectId: string) => {
    setSelectedProjectIds((previous) => {
      const next = new Set(previous);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const buildProjectTargetPath = (
    project: SkillProject,
    relativeTarget: string,
  ) => {
    const normalizedRoot = project.rootPath.replace(/[\\/]+$/, "");
    return `${normalizedRoot}/${relativeTarget}`;
  };

  const getPresetProjectTargets = (project: SkillProject) => {
    if (!project.rootPath.replace(/[\\/]+$/, "")) {
      return [];
    }
    return PROJECT_TARGET_OPTIONS.map((relativeTarget) => ({
      id: buildProjectTargetPath(project, relativeTarget),
      label: relativeTarget,
      path: buildProjectTargetPath(project, relativeTarget),
    }));
  };

  const getProjectCustomTargets = (project: SkillProject): string[] => {
    const savedCustomTargets =
      projectSkillImportPreferencesByProjectId[project.id]?.customTargets ?? [];
    return Array.from(new Set(savedCustomTargets));
  };

  const getInitialTargetSelection = (project: SkillProject): string[] => {
    const presetTargets = getPresetProjectTargets(project);
    const availableTargetIds = new Set([
      ...presetTargets.map((target) => target.id),
      ...getProjectCustomTargets(project),
    ]);
    const savedTargetIds = (
      projectSkillImportPreferencesByProjectId[project.id]?.selectedTargetIds ??
      []
    ).filter((targetId) => availableTargetIds.has(targetId));
    if (savedTargetIds.length > 0) {
      return [savedTargetIds[0]];
    }

    const firstPreset = presetTargets[0];
    return firstPreset ? [firstPreset.id] : [];
  };

  const getProjectTargetSelection = (project: SkillProject): string[] => {
    const selected = projectTargetSelections[project.id];
    return selected && selected.length > 0
      ? [selected[0]]
      : getInitialTargetSelection(project);
  };

  const summarizeTargetDirs = (
    targetDirs: string[],
    projectRootPath: string,
  ): string => {
    const normalizedRoot = projectRootPath
      .replace(/\\/g, "/")
      .replace(/\/+$/, "");
    return Array.from(
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
    ).join(", ");
  };

  const selectedProjectTargetLabel = useMemo(() => {
    const firstProject = normalizedProjects[0];
    if (!firstProject) {
      return PROJECT_TARGET_OPTIONS[0];
    }
    const firstTarget = getProjectTargetSelection(firstProject)[0];
    if (!firstTarget) {
      return PROJECT_TARGET_OPTIONS[0];
    }
    return summarizeTargetDirs([firstTarget], firstProject.rootPath);
  }, [
    normalizedProjects,
    projectSkillImportPreferencesByProjectId,
    projectTargetSelections,
  ]);

  const setProjectTargetForAllProjects = (relativeTarget: string) => {
    const nextSelections = Object.fromEntries(
      normalizedProjects.map((project) => [
        project.id,
        [buildProjectTargetPath(project, relativeTarget)],
      ]),
    );
    setProjectTargetSelections(nextSelections);

    for (const project of normalizedProjects) {
      setProjectSkillImportPreferences?.(project.id, {
        selectedTargetIds: [buildProjectTargetPath(project, relativeTarget)],
        customTargets: getProjectCustomTargets(project),
      });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-6">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] flex items-center justify-between">
          <span>
            {showPlatformIntegration
              ? t("skill.platformIntegration", "Platform Integration")
              : t("skill.webSkillLibrary", "Skill Workspace")}
          </span>
          <span className="text-[10px]">SKILL.md</span>
        </h3>

        {showIntegrationSection && (
          <section className="app-wallpaper-panel rounded-2xl border border-border p-5 space-y-4">
            {hasGlobalIntegration && hasProjectIntegration ? (
              <div className="flex items-center gap-1 rounded-lg bg-accent/50 p-1">
                <button
                  type="button"
                  aria-pressed={integrationScope === "global"}
                  onClick={() => setIntegrationScope("global")}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    integrationScope === "global"
                      ? "bg-primary text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("skill.globalDistribution", "Global Distribution")}
                </button>
                <button
                  type="button"
                  aria-pressed={integrationScope === "project"}
                  onClick={() => setIntegrationScope("project")}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    integrationScope === "project"
                      ? "bg-primary text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("skill.projectDistribution", "Project Distribution")}
                </button>
              </div>
            ) : null}

            {integrationScope === "project" && hasProjectIntegration ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">
                      {t("skill.projectDistribution", "Project Distribution")}
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      {t(
                        "skill.globalProjectDeployHint",
                        "Select projects and distribute to their local agent folders.",
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onCreateProject?.()}
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border app-wallpaper-surface px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    <FolderPlusIcon
                      aria-hidden="true"
                      className="h-3.5 w-3.5"
                    />
                    {t("skill.addProject", "Add Project")}
                  </button>
                </div>

                <div className="rounded-2xl border border-border app-wallpaper-surface p-3">
                  <button
                    type="button"
                    aria-expanded={showProjectAdvanced}
                    onClick={() =>
                      setShowProjectAdvanced((previous) => !previous)
                    }
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Settings2Icon aria-hidden="true" className="h-4 w-4" />
                        {t(
                          "skill.advancedImportSettings",
                          "Advanced Import Settings",
                        )}
                      </div>
                    </div>
                    <ChevronDownIcon
                      aria-hidden="true"
                      className={`h-4 w-4 text-muted-foreground transition-transform ${
                        showProjectAdvanced ? "rotate-180" : "rotate-0"
                      }`}
                    />
                  </button>

                  {showProjectAdvanced ? (
                    <div className="mt-3 space-y-2">
                      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        {t("skill.importMode", "Import Mode")}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-accent/40 p-1">
                        <button
                          type="button"
                          onClick={() => setProjectDeployMode?.("copy")}
                          title={t(
                            "skill.projectImportCopyModeHint",
                            "Copy a standalone snapshot into the selected project folders.",
                          )}
                          className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                            projectDeployMode === "copy"
                              ? "bg-primary text-white shadow-sm"
                              : "text-muted-foreground hover:bg-background hover:text-foreground"
                          }`}
                        >
                          <CopyPlusIcon
                            aria-hidden="true"
                            className="h-3.5 w-3.5"
                          />
                          {t("skill.copyMode", "Copy")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setProjectDeployMode?.("symlink")}
                          title={t(
                            "skill.projectImportSymlinkModeHint",
                            "Link the project folder to My Skills so source updates stay in sync.",
                          )}
                          className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                            projectDeployMode === "symlink"
                              ? "bg-primary text-white shadow-sm"
                              : "text-muted-foreground hover:bg-background hover:text-foreground"
                          }`}
                        >
                          <LinkIcon
                            aria-hidden="true"
                            className="h-3.5 w-3.5"
                          />
                          {t("skill.symlink", "Symlink")}
                        </button>
                      </div>
                      <div className="pt-2">
                        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                          {t("skill.projectTargetFolders", "Target Folders")}
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-1.5">
                          {PROJECT_TARGET_OPTIONS.map((relativeTarget) => {
                            const isTargetSelected =
                              selectedProjectTargetLabel === relativeTarget;
                            return (
                              <button
                                key={relativeTarget}
                                type="button"
                                onClick={() =>
                                  setProjectTargetForAllProjects(relativeTarget)
                                }
                                className={`inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-medium transition-colors ${
                                  isTargetSelected
                                    ? "bg-primary text-white shadow-sm"
                                    : "bg-accent/60 text-muted-foreground hover:bg-background hover:text-foreground"
                                }`}
                                title={relativeTarget}
                              >
                                {isTargetSelected ? (
                                  <CheckIcon
                                    aria-hidden="true"
                                    className="h-3.5 w-3.5 shrink-0"
                                  />
                                ) : null}
                                <span className="truncate">
                                  {relativeTarget}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                {normalizedProjects.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-accent/30 px-4 py-5 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">
                      {t("skill.noProjects", "No projects yet")}
                    </p>
                    <p className="mt-2 leading-relaxed">
                      {t(
                        "skill.noProjectsHint",
                        "Add a project root to scan and manage project-local skills.",
                      )}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="text-xs text-muted-foreground">
                      {t("skill.projectDeploySelectedCount", {
                        count: effectiveSelectedProjectIds.size,
                        defaultValue: "{{count}} selected",
                      })}
                    </div>

                    <div className="space-y-2">
                      {normalizedProjects.map((project) => {
                        const isSelected = effectiveSelectedProjectIds.has(
                          project.id,
                        );
                        const deployedTargets =
                          getProjectDeployedTargets?.(project) ?? [];

                        return (
                          <div
                            key={project.id}
                            className={`rounded-2xl border transition-colors ${
                              isSelected
                                ? "border-primary/40 bg-primary/5"
                                : "border-border bg-accent/30 hover:bg-accent/50"
                            }`}
                          >
                            <div className="flex w-full items-start justify-between gap-3 px-4 py-3">
                              <button
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() =>
                                  toggleProjectSelection(project.id)
                                }
                                className="flex min-w-0 flex-1 items-start gap-3 text-left"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-medium text-foreground">
                                    {project.name}
                                  </div>
                                  <div
                                    className="mt-1 truncate text-[11px] leading-relaxed text-muted-foreground"
                                    title={project.rootPath}
                                  >
                                    {project.rootPath}
                                  </div>
                                  <div
                                    className="mt-2 truncate text-[11px] leading-relaxed text-muted-foreground"
                                    title={getProjectTargetSelection(
                                      project,
                                    ).join("\n")}
                                  >
                                    {t(
                                      "skill.projectTargetFolders",
                                      "Target Folders",
                                    )}
                                    :{" "}
                                    {summarizeTargetDirs(
                                      getProjectTargetSelection(project),
                                      project.rootPath,
                                    )}
                                  </div>
                                  {deployedTargets.length > 0 ? (
                                    <div className="mt-2 text-[11px] leading-relaxed text-emerald-600 dark:text-emerald-300">
                                      {t("skill.projectDeployedTargetCount", {
                                        count: deployedTargets.length,
                                        defaultValue:
                                          "Distributed to {{count}} target folder(s)",
                                      })}
                                    </div>
                                  ) : null}
                                </div>
                                <div
                                  aria-hidden="true"
                                  className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                                    isSelected
                                      ? "border-primary bg-primary text-white"
                                      : "border-muted-foreground/30"
                                  }`}
                                >
                                  {isSelected ? (
                                    <CheckIcon
                                      aria-hidden="true"
                                      className="h-3 w-3"
                                    />
                                  ) : null}
                                </div>
                              </button>
                              {deployedTargets.length > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void onRemoveFromProjectTargets?.(
                                      project.id,
                                      deployedTargets,
                                    );
                                  }}
                                  className="mt-1 shrink-0 rounded-lg border border-destructive/30 px-2 py-1 text-[10px] font-medium text-destructive hover:bg-destructive/10"
                                >
                                  {t(
                                    "skill.removeFromProject",
                                    "Remove from Project",
                                  )}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const selectedIds = Array.from(
                          effectiveSelectedProjectIds,
                        );
                        const targetDirsByProjectId = Object.fromEntries(
                          selectedIds.map((projectId) => {
                            const project = normalizedProjects.find(
                              (entry) => entry.id === projectId,
                            );
                            return [
                              projectId,
                              project ? getProjectTargetSelection(project) : [],
                            ];
                          }),
                        );
                        void onDeployToProjects?.(
                          selectedIds,
                          targetDirsByProjectId,
                        );
                      }}
                      disabled={
                        effectiveSelectedProjectIds.size === 0 ||
                        isProjectDeploying
                      }
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
                    >
                      {isProjectDeploying ? (
                        <Loader2Icon
                          aria-hidden="true"
                          className="h-4 w-4 animate-spin"
                        />
                      ) : (
                        <SendIcon aria-hidden="true" className="h-4 w-4" />
                      )}
                      {t("skill.deployToProjects", {
                        name: selectedSkill.name,
                        defaultValue: `Deploy ${selectedSkill.name} to Selected Projects`,
                      })}
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                <div className="text-sm font-semibold text-foreground">
                  {t("skill.globalDistribution", "Global Distribution")}
                </div>
                <div className="flex items-center gap-1 rounded-lg bg-accent/50 p-1">
                  <button
                    type="button"
                    aria-pressed={installMode === "copy"}
                    onClick={() => setInstallMode("copy")}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] font-medium transition-colors ${
                      installMode === "copy"
                        ? "bg-primary text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <CopyPlusIcon aria-hidden="true" className="w-3 h-3" />
                    {t("skill.copyMode", "Copy")}
                  </button>
                  <button
                    type="button"
                    aria-pressed={installMode === "symlink"}
                    onClick={() => setInstallMode("symlink")}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] font-medium transition-colors ${
                      installMode === "symlink"
                        ? "bg-primary text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <LinkIcon aria-hidden="true" className="w-3 h-3" />
                    {t("skill.symlink", "Symlink")}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  {installMode === "copy"
                    ? t(
                        "skill.copyModeDesc",
                        "Copy: Copies the SKILL.md file to each platform directory. Each copy is independent — edits in PromptHub won't sync automatically.",
                      )
                    : t(
                        "skill.symlinkDesc",
                        "Symlink: Creates a symbolic link pointing to the source file. All platforms share the same source — edits sync instantly, but requires filesystem support.",
                      )}
                </p>

                {uninstalledPlatforms.length > 0 && (
                  <div className="flex flex-col gap-2 p-3 bg-accent/30 rounded-xl border border-border">
                    <div className="flex items-center justify-between">
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
                          {selectedPlatforms.size}{" "}
                          {t("skill.selected", "selected")}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={onBatchInstall}
                      disabled={
                        selectedPlatforms.size === 0 || isBatchInstalling
                      }
                      className="w-full px-3 py-2 bg-primary text-white text-xs font-bold rounded-lg shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
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

                <div className="space-y-2">
                  {availablePlatforms.map((platform) => {
                    const isInstalled = skillMdInstallStatus[platform.id];
                    const isSelected = selectedPlatforms.has(platform.id);

                    return (
                      <div
                        key={platform.id}
                        role={isInstalled ? undefined : "button"}
                        tabIndex={
                          isInstalled || isBatchInstalling ? undefined : 0
                        }
                        aria-label={isInstalled ? undefined : platform.name}
                        aria-pressed={isInstalled ? undefined : isSelected}
                        onClick={() => {
                          if (isInstalled || isBatchInstalling) return;
                          togglePlatformSelection(platform.id);
                        }}
                        onKeyDown={(event) => {
                          if (isInstalled || isBatchInstalling) return;
                          if (event.key !== "Enter" && event.key !== " ")
                            return;

                          event.preventDefault();
                          togglePlatformSelection(platform.id);
                        }}
                        className={`p-3 rounded-xl border transition-all flex items-center justify-between ${
                          isInstalled
                            ? "bg-primary/5 border-primary cursor-default"
                            : isSelected
                              ? "bg-primary/10 border-primary cursor-pointer"
                              : "bg-accent/30 border-border hover:bg-accent/50 cursor-pointer"
                        } ${isBatchInstalling && !isInstalled ? "opacity-70 cursor-wait" : ""}`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            aria-hidden="true"
                            className="w-9 h-9 flex items-center justify-center flex-shrink-0"
                          >
                            <PlatformIcon platformId={platform.id} size={28} />
                          </div>
                          <div>
                            <h4 className="font-medium text-sm">
                              {platform.name}
                            </h4>
                            <p className="text-[10px] text-muted-foreground">
                              {isInstalled
                                ? t("skill.installed")
                                : isSelected
                                  ? t("skill.selectedForInstall")
                                  : t("skill.clickToSelect")}
                            </p>
                          </div>
                        </div>
                        {isInstalled ? (
                          <div className="flex items-center gap-2">
                            <CheckIcon
                              aria-hidden="true"
                              className="w-4 h-4 text-primary"
                            />
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                uninstallFromPlatform(platform.id);
                              }}
                              className="text-[10px] text-destructive hover:underline"
                            >
                              {t("skill.uninstall")}
                            </button>
                          </div>
                        ) : (
                          <div
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                              isSelected
                                ? "bg-primary border-primary"
                                : "border-muted-foreground/30"
                            }`}
                          >
                            {isSelected ? (
                              <CheckIcon
                                aria-hidden="true"
                                className="w-3 h-3 text-white"
                              />
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        )}

        <section className="app-wallpaper-panel rounded-2xl border border-border p-5 space-y-4">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">
            {t("skill.metadata")}
          </h3>
          <div className="grid grid-cols-1 gap-3">
            <div className="flex justify-between items-center text-sm gap-4">
              <span className="text-muted-foreground">{t("skill.id")}</span>
              <span className="font-mono text-[10px] bg-accent px-2 py-0.5 rounded truncate max-w-[150px]">
                {selectedSkill.id}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm gap-4">
              <span className="text-muted-foreground">
                {t("skill.protocol")}
              </span>
              <span className="font-bold uppercase tracking-tight flex items-center gap-1 text-primary text-xs">
                <ChevronRightIcon aria-hidden="true" className="w-3.5 h-3.5" />
                {getProtocolDisplayLabel(selectedSkill.protocol_type)}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm gap-4">
              <span className="text-muted-foreground">
                {t("skill.createdAt")}
              </span>
              <span className="text-xs opacity-80">
                {new Date(selectedSkill.created_at).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm gap-4">
              <span className="text-muted-foreground">
                {t("skill.updatedAt")}
              </span>
              <span className="text-xs opacity-80">
                {new Date(selectedSkill.updated_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </section>

        <section className="app-wallpaper-panel rounded-2xl border border-border p-5 space-y-4">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">
            {t("skill.export")}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleExport("skillmd")}
              className="flex flex-col items-center gap-1 p-3 bg-accent/50 hover:bg-accent border border-border rounded-xl transition-colors"
            >
              <FileTextIcon
                aria-hidden="true"
                className="w-5 h-5 text-primary"
              />
              <span className="font-medium text-xs">SKILL.md</span>
            </button>
            <button
              type="button"
              onClick={() => handleExport("zip")}
              className="flex flex-col items-center gap-1 p-3 bg-accent/50 hover:bg-accent border border-border rounded-xl transition-colors"
            >
              <PackageIcon
                aria-hidden="true"
                className="w-5 h-5 text-primary"
              />
              <span className="font-medium text-xs">ZIP</span>
            </button>
          </div>
        </section>
      </div>

      <div className="pt-6">
        {sourceMeta &&
          (sourceMeta.kind === "local" && showLocalSourceShortcut ? (
            <button
              type="button"
              onClick={() => window.electron?.openPath?.(sourceMeta.value)}
              className="w-full min-h-[148px] flex items-center gap-3 p-5 bg-accent/70 border border-border text-foreground rounded-2xl hover:bg-accent transition-colors text-left"
              title={sourceMeta.displayValue}
            >
              <FolderOpenIcon aria-hidden="true" className="w-5 h-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold break-words">
                  {sourceMeta.sourceLabel}
                </div>
                <div className="mt-1 whitespace-normal break-words text-xs leading-relaxed text-muted-foreground">
                  {sourceMeta.displayValue}
                </div>
              </div>
            </button>
          ) : sourceMeta.kind === "local" ? (
            <div
              className="w-full min-h-[148px] flex items-center gap-3 p-5 bg-accent/70 border border-border text-foreground rounded-2xl text-left"
              title={sourceMeta.displayValue}
            >
              <FolderOpenIcon aria-hidden="true" className="w-5 h-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold break-words">
                  {sourceMeta.sourceLabel}
                </div>
                <div className="mt-1 whitespace-normal break-words text-xs leading-relaxed text-muted-foreground">
                  {sourceMeta.displayValue}
                </div>
              </div>
            </div>
          ) : (
            <a
              href={sourceMeta.value}
              target="_blank"
              rel="noopener noreferrer"
              className={`w-full min-h-[148px] flex items-center gap-3 p-5 text-white rounded-2xl hover:opacity-90 transition-opacity text-left ${
                sourceMeta.kind === "github" ? "bg-[#24292e]" : "bg-slate-700"
              }`}
              title={sourceMeta.displayValue}
            >
              {sourceMeta.kind === "github" ? (
                <GithubIcon aria-hidden="true" className="w-5 h-5 shrink-0" />
              ) : (
                <LinkIcon aria-hidden="true" className="w-5 h-5 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold break-words">
                  {sourceMeta.sourceLabel}
                </div>
                <div className="mt-1 whitespace-normal break-words text-xs leading-relaxed text-white/70">
                  {sourceMeta.displayValue}
                </div>
              </div>
            </a>
          ))}
      </div>
    </div>
  );
}
