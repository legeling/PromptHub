import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  DownloadIcon,
  FolderOpenIcon,
  Loader2Icon,
  PlusIcon,
  SendIcon,
  TrashIcon,
} from "lucide-react";
import type { TFunction } from "i18next";
import type { Skill } from "@prompthub/shared/types";

interface ProjectSkillPreviewSidebarProps {
  deployTargets: string[];
  isDeploying: boolean;
  isImporting: boolean;
  isImportAvailable: boolean;
  isImported?: boolean;
  isRemoving?: boolean;
  onAddDeployTarget: () => void | Promise<void>;
  onDeploy: (targetDirs: string[]) => void | Promise<void>;
  onImport: () => void | Promise<void>;
  onRemoveFromProject?: () => void | Promise<void>;
  selectedSkill: Skill;
  sourcePath: string;
  symlinkTargetPath?: string;
  t: TFunction;
}

export function ProjectSkillPreviewSidebar({
  deployTargets,
  isDeploying,
  isImporting,
  isImportAvailable,
  isImported = false,
  isRemoving = false,
  onAddDeployTarget,
  onDeploy,
  onImport,
  onRemoveFromProject,
  selectedSkill,
  sourcePath,
  symlinkTargetPath,
  t,
}: ProjectSkillPreviewSidebarProps) {
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(
    () => new Set(deployTargets),
  );
  const showSymlinkTarget = Boolean(symlinkTargetPath);
  const sourceTitle = showSymlinkTarget
    ? t("skill.openAgentShortcut", "Open agent shortcut")
    : t("skill.openLocalSource", "Open Local Skill Folder");

  const sortedTargets = useMemo(
    () =>
      Array.from(
        new Set(deployTargets.filter((entry) => entry.trim().length > 0)),
      ),
    [deployTargets],
  );
  const previousDeployTargetsRef = useRef<Set<string>>(new Set(sortedTargets));

  useEffect(() => {
    const previousTargets = previousDeployTargetsRef.current;
    const currentTargets = new Set(sortedTargets);

    setSelectedTargets((previousSelectedTargets) => {
      let didChange = false;
      const nextSelectedTargets = new Set<string>();

      for (const target of previousSelectedTargets) {
        if (currentTargets.has(target)) {
          nextSelectedTargets.add(target);
        } else {
          didChange = true;
        }
      }

      for (const target of sortedTargets) {
        if (!previousTargets.has(target)) {
          nextSelectedTargets.add(target);
          didChange = true;
        }
      }

      return didChange ? nextSelectedTargets : previousSelectedTargets;
    });

    previousDeployTargetsRef.current = currentTargets;
  }, [sortedTargets]);

  const effectiveSelectedTargets = useMemo(() => {
    return new Set(
      Array.from(selectedTargets).filter((entry) =>
        sortedTargets.includes(entry),
      ),
    );
  }, [selectedTargets, sortedTargets]);

  const toggleTarget = (target: string) => {
    setSelectedTargets((previous) => {
      const next = new Set(previous);
      if (next.has(target)) {
        next.delete(target);
      } else {
        next.add(target);
      }
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col space-y-6">
      <section className="space-y-4">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">
          {t("skill.platformIntegration", "Platform Integration")}
        </h3>
        <div className="app-wallpaper-panel rounded-2xl border border-border p-5 space-y-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t(
              "skill.projectImportHint",
              "Import this project-local skill into My Skills first. Use copy import for isolated snapshots, or symlink import when you want one source of truth and easier maintenance.",
            )}
          </p>
          {isImported ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                {t(
                  "skill.projectImportedHint",
                  "This skill is already managed in My Skills. If the project copy changes, you can re-import to refresh it.",
                )}
              </div>
              <button
                type="button"
                onClick={() => void onRemoveFromProject?.()}
                disabled={isRemoving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
              >
                {isRemoving ? (
                  <Loader2Icon
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin"
                  />
                ) : (
                  <TrashIcon aria-hidden="true" className="h-4 w-4" />
                )}
                {t("skill.removeFromProject", "Remove from Project")}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => void onImport()}
                disabled={!isImportAvailable || isImporting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {isImporting ? (
                  <Loader2Icon
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin"
                  />
                ) : (
                  <DownloadIcon aria-hidden="true" className="h-4 w-4" />
                )}
                {t("skill.addToLibrary", "Import to My Skills")}
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">
          {t("skill.projectDeploy", "Project Deployment")}
        </h3>
        <div className="app-wallpaper-panel rounded-2xl border border-border p-5 space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t(
              "skill.projectDeployHint",
              "Deploy this skill directly into project-local agent folders. PromptHub defaults to .agents/skills and lets you add more target folders when needed.",
            )}
          </p>

          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {t("skill.projectDeploySelectedCount", {
                count: effectiveSelectedTargets.size,
                defaultValue: "{{count}} selected",
              })}
            </div>
            <button
              type="button"
              onClick={() => void onAddDeployTarget()}
              className="inline-flex items-center gap-2 rounded-xl border border-border app-wallpaper-surface px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <PlusIcon aria-hidden="true" className="h-3.5 w-3.5" />
              {t("skill.addDeployTarget", "Add Folder")}
            </button>
          </div>

          <div className="space-y-2">
            {sortedTargets.map((target) => {
              const isSelected = effectiveSelectedTargets.has(target);
              return (
                <button
                  key={target}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => toggleTarget(target)}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                    isSelected
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-accent/40 hover:bg-accent"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">
                      {target.endsWith("/.agents/skills") ||
                      target.endsWith("\\.agents\\skills")
                        ? t(
                            "skill.defaultProjectDeployTarget",
                            "Default .agents target",
                          )
                        : t("skill.customProjectDeployTarget", "Custom target")}
                    </div>
                    <div className="mt-1 break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {target}
                    </div>
                  </div>
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                      isSelected
                        ? "border-primary bg-primary text-white"
                        : "border-muted-foreground/30"
                    }`}
                  >
                    {isSelected ? (
                      <CheckIcon aria-hidden="true" className="h-3 w-3" />
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => void onDeploy(Array.from(effectiveSelectedTargets))}
            disabled={effectiveSelectedTargets.size === 0 || isDeploying}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {isDeploying ? (
              <Loader2Icon
                aria-hidden="true"
                className="h-4 w-4 animate-spin"
              />
            ) : (
              <SendIcon aria-hidden="true" className="h-4 w-4" />
            )}
            {t("skill.deployToProjectFolders", {
              name: selectedSkill.name,
              defaultValue: `Deploy ${selectedSkill.name} to Project Folders`,
            })}
          </button>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">
          {t("skill.source", "Source")}
        </h3>
        <div className="app-wallpaper-panel rounded-2xl border border-border p-5 space-y-3">
          <button
            type="button"
            onClick={() => void window.electron?.openPath?.(sourcePath)}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-accent/60 px-4 py-4 text-left transition-colors hover:bg-accent"
            title={sourcePath}
          >
            <FolderOpenIcon
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-primary"
            />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">
                {sourceTitle}
              </div>
              <div className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">
                {sourcePath}
              </div>
            </div>
          </button>
          {showSymlinkTarget ? (
            <button
              type="button"
              onClick={() =>
                void window.electron?.openPath?.(symlinkTargetPath ?? "")
              }
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-accent/60 px-4 py-4 text-left transition-colors hover:bg-accent"
              title={symlinkTargetPath}
            >
              <FolderOpenIcon
                aria-hidden="true"
                className="h-5 w-5 shrink-0 text-primary"
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">
                  {t("skill.openSourceSkillFolder", "Open source Skill folder")}
                </div>
                <div className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">
                  {symlinkTargetPath}
                </div>
              </div>
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
