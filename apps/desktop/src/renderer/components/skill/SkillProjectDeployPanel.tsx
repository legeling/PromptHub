import { useMemo, useState } from "react";
import {
  CheckIcon,
  DownloadIcon,
  FolderPlusIcon,
  Loader2Icon,
} from "lucide-react";
import type { TFunction } from "i18next";
import type { Skill, SkillProject } from "@prompthub/shared/types";

interface SkillProjectDeployPanelProps {
  projects: SkillProject[];
  getProjectDeployTargets: (project: SkillProject) => string[];
  isDeploying: boolean;
  onCreateProject: () => void;
  onDeploy: (projectIds: string[]) => void | Promise<void>;
  selectedSkill: Skill;
  t: TFunction;
}

export function SkillProjectDeployPanel({
  projects,
  getProjectDeployTargets,
  isDeploying,
  onCreateProject,
  onDeploy,
  selectedSkill,
  t,
}: SkillProjectDeployPanelProps) {
  const normalizedProjects = projects ?? [];
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(
    () => new Set(),
  );

  const projectsWithTargets = useMemo(
    () =>
      normalizedProjects.map((project) => ({
        project,
        targets: getProjectDeployTargets(project),
      })),
    [getProjectDeployTargets, normalizedProjects],
  );

  const toggleProject = (projectId: string) => {
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

  return (
    <section className="app-wallpaper-panel rounded-2xl border border-border p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">
          {t("skill.projectDeploy", "Project Deployment")}
        </h3>
        <button
          type="button"
          onClick={onCreateProject}
          className="inline-flex items-center gap-2 rounded-xl border border-border app-wallpaper-surface px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          <FolderPlusIcon className="h-3.5 w-3.5" />
          {t("skill.addProject", "Add Project")}
        </button>
      </div>

      {projectsWithTargets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-accent/30 px-4 py-5 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">
            {t("skill.noProjects", "No projects yet")}
          </p>
          <p className="mt-2 leading-relaxed">
            {t(
              "skill.globalProjectDeployHint",
              "Register a project first, then PromptHub can deploy this global skill into that project's local agent folders.",
            )}
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t(
              "skill.globalProjectDeployHint",
              "Register a project first, then PromptHub can deploy this global skill into that project's local agent folders.",
            )}
          </p>

          <div className="space-y-2">
            {projectsWithTargets.map(({ project, targets }) => {
              const isSelected = selectedProjectIds.has(project.id);

              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => toggleProject(project.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                    isSelected
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-accent/40 hover:bg-accent"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">
                      {project.name}
                    </div>
                    <div className="mt-1 break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {project.rootPath}
                    </div>
                    <div className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                      {t("skill.projectDeploySelectedCount", {
                        count: targets.length,
                        defaultValue: "{{count}} selected",
                      })}
                      {": "}
                      {targets.join(", ")}
                    </div>
                  </div>
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                      isSelected
                        ? "border-primary bg-primary text-white"
                        : "border-muted-foreground/30"
                    }`}
                  >
                    {isSelected ? <CheckIcon className="h-3 w-3" /> : null}
                  </div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => void onDeploy(Array.from(selectedProjectIds))}
            disabled={selectedProjectIds.size === 0 || isDeploying}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {isDeploying ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <DownloadIcon className="h-4 w-4" />
            )}
            {t("skill.deployToProjects", {
              name: selectedSkill.name,
              defaultValue: `Deploy ${selectedSkill.name} to Selected Projects`,
            })}
          </button>
        </>
      )}
    </section>
  );
}
