import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2Icon,
  CheckIcon,
  ChevronDownIcon,
  FolderPlusIcon,
  Loader2Icon,
  Settings2Icon,
} from "lucide-react";

import type {
  ScannedSkill,
  Skill,
  SkillProject,
} from "@prompthub/shared/types";
import { useSettingsStore } from "../../stores/settings.store";
import { getProjectTargetDirsRequiringDeployment } from "../../services/project-skill-targets";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";

function areStringSetsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((entry, index) => entry === right[index]);
}

function getPresetProjectImportTargets(rootPath: string): Array<{
  id: string;
  label: string;
  path: string;
}> {
  const normalizedRoot = rootPath.replace(/[\\/]+$/, "");
  return [
    {
      id: `${normalizedRoot}/.agents/skills`,
      label: ".agents/skills",
      path: `${normalizedRoot}/.agents/skills`,
    },
    {
      id: `${normalizedRoot}/.claude/skills`,
      label: ".claude/skills",
      path: `${normalizedRoot}/.claude/skills`,
    },
    {
      id: `${normalizedRoot}/.gemini/skills`,
      label: ".gemini/skills",
      path: `${normalizedRoot}/.gemini/skills`,
    },
  ];
}

export interface SkillLibraryImportPayload {
  skillIds: string[];
  targetDirs: string[];
  importMode: "copy" | "symlink";
}

interface SkillLibraryImportModalProps {
  isOpen: boolean;
  isDeploying: boolean;
  onClose: () => void;
  onConfirm: (payload: SkillLibraryImportPayload) => void | Promise<void>;
  onPickCustomTarget?: () => Promise<string | null | undefined>;
  project?: SkillProject | null;
  scannedSkills: ScannedSkill[];
  skills: Skill[];
  fixedTargetDirs?: string[];
  showTargetSettings?: boolean;
  title?: string;
  description?: string;
  selectHint?: string;
  confirmLabel?: (count: number) => string;
}

export function SkillLibraryImportModal({
  isOpen,
  isDeploying,
  onClose,
  onConfirm,
  onPickCustomTarget,
  project = null,
  scannedSkills,
  skills,
  fixedTargetDirs,
  showTargetSettings = true,
  title,
  description,
  selectHint,
  confirmLabel,
}: SkillLibraryImportModalProps) {
  const { t } = useTranslation();
  const advancedPanelId = useId();
  const isOpenRef = useRef(isOpen);
  const openSessionRef = useRef(0);
  const confirmInFlightRef = useRef(false);
  const targetPickerInFlightRef = useRef(false);
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
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(
    new Set(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customTargets, setCustomTargets] = useState<string[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPickingCustomTarget, setIsPickingCustomTarget] = useState(false);
  const [importMode, setImportMode] = useState<"copy" | "symlink">(
    projectSkillImportModePreference,
  );
  const presetTargets = useMemo(
    () =>
      showTargetSettings && project
        ? getPresetProjectImportTargets(project.rootPath)
        : [],
    [project, showTargetSettings],
  );
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    isOpenRef.current = isOpen;
    if (isOpen) {
      openSessionRef.current += 1;
    }
    if (!isOpen) {
      setSelectedSkillIds(new Set());
      setSearchQuery("");
      setShowAdvanced(false);
      confirmInFlightRef.current = false;
      targetPickerInFlightRef.current = false;
      setIsConfirming(false);
      setIsPickingCustomTarget(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!showTargetSettings) {
      setImportMode(projectSkillImportModePreference);
      setCustomTargets([]);
      setSelectedTargetIds(new Set(fixedTargetDirs ?? []));
      return;
    }

    const savedPreferences = project
      ? projectSkillImportPreferencesByProjectId[project.id]
      : undefined;

    const nextCustomTargets = savedPreferences?.customTargets ?? [];
    const availableTargetIds = new Set([
      ...presetTargets.map((target) => target.id),
      ...nextCustomTargets,
    ]);
    const nextSelectedTargetIds = (
      savedPreferences?.selectedTargetIds ?? []
    ).filter((entry) => availableTargetIds.has(entry));

    const nextTargetSelection = new Set(
      nextSelectedTargetIds.length > 0
        ? nextSelectedTargetIds
        : presetTargets[0]
          ? [presetTargets[0].id]
          : [],
    );

    setImportMode(projectSkillImportModePreference);
    setCustomTargets((previous) =>
      areStringArraysEqual(previous, nextCustomTargets)
        ? previous
        : nextCustomTargets,
    );
    setSelectedTargetIds((previous) =>
      areStringSetsEqual(previous, nextTargetSelection)
        ? previous
        : nextTargetSelection,
    );
  }, [
    fixedTargetDirs,
    isOpen,
    presetTargets,
    project,
    projectSkillImportModePreference,
    projectSkillImportPreferencesByProjectId,
    showTargetSettings,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setProjectSkillImportModePreference(importMode);
  }, [
    importMode,
    isOpen,
    project,
    setProjectSkillImportModePreference,
    showTargetSettings,
  ]);

  useEffect(() => {
    if (!isOpen || !project || !showTargetSettings) {
      return;
    }

    const nextSelectedTargetIds = Array.from(selectedTargetIds);
    const savedPreferences =
      projectSkillImportPreferencesByProjectId[project.id];
    const hasSavedTargetPreferences =
      (savedPreferences?.selectedTargetIds.length ?? 0) > 0 ||
      (savedPreferences?.customTargets.length ?? 0) > 0;
    if (
      hasSavedTargetPreferences &&
      nextSelectedTargetIds.length === 0 &&
      customTargets.length === 0
    ) {
      return;
    }

    setProjectSkillImportPreferences(project.id, {
      selectedTargetIds: nextSelectedTargetIds,
      customTargets,
    });
  }, [
    customTargets,
    isOpen,
    project,
    projectSkillImportPreferencesByProjectId,
    selectedTargetIds,
    setProjectSkillImportPreferences,
    showTargetSettings,
  ]);

  const visibleSkills = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) {
      return skills;
    }

    return skills.filter((skill) =>
      [skill.name, skill.description, skill.author, ...(skill.tags || [])]
        .filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        )
        .some((value) => value.toLowerCase().includes(keyword)),
    );
  }, [searchQuery, skills]);

  const allTargetPaths = useMemo(() => {
    if (!showTargetSettings) {
      return fixedTargetDirs ?? [];
    }
    return [...presetTargets.map((target) => target.path), ...customTargets];
  }, [customTargets, fixedTargetDirs, presetTargets, showTargetSettings]);

  const selectedTargetDirs = useMemo(
    () =>
      showTargetSettings
        ? allTargetPaths.filter((target) => selectedTargetIds.has(target))
        : allTargetPaths,
    [allTargetPaths, selectedTargetIds, showTargetSettings],
  );

  useEffect(() => {
    setSelectedSkillIds((previous) => {
      const next = new Set(
        [...previous].filter((skillId) => {
          const skill = skills.find((entry) => entry.id === skillId);
          if (!skill) {
            return false;
          }
          return (
            getProjectTargetDirsRequiringDeployment(
              scannedSkills,
              skill,
              selectedTargetDirs,
            ).length > 0
          );
        }),
      );

      return next.size === previous.size ? previous : next;
    });
  }, [scannedSkills, selectedTargetDirs, skills]);

  const toggleSkill = (skill: Skill) => {
    const missingTargetDirs = getProjectTargetDirsRequiringDeployment(
      scannedSkills,
      skill,
      selectedTargetDirs,
    );
    if (missingTargetDirs.length === 0) {
      return;
    }

    setSelectedSkillIds((previous) => {
      const next = new Set(previous);
      if (next.has(skill.id)) {
        next.delete(skill.id);
      } else {
        next.add(skill.id);
      }
      return next;
    });
  };

  const toggleTarget = (targetId: string) => {
    setSelectedTargetIds((previous) => {
      const next = new Set(previous);
      if (next.has(targetId)) {
        next.delete(targetId);
      } else {
        next.add(targetId);
      }
      return next;
    });
  };

  const handleAddCustomTarget = async () => {
    if (!onPickCustomTarget || targetPickerInFlightRef.current) {
      return;
    }

    targetPickerInFlightRef.current = true;
    setIsPickingCustomTarget(true);
    const pickerSession = openSessionRef.current;
    try {
      const selectedPath = await onPickCustomTarget();
      if (
        !selectedPath ||
        !isOpenRef.current ||
        openSessionRef.current !== pickerSession
      ) {
        return;
      }

      setCustomTargets((previous) =>
        previous.includes(selectedPath) ? previous : [...previous, selectedPath],
      );
      setSelectedTargetIds((previous) => new Set([...previous, selectedPath]));
    } finally {
      if (isOpenRef.current && openSessionRef.current === pickerSession) {
        targetPickerInFlightRef.current = false;
        setIsPickingCustomTarget(false);
      }
    }
  };

  const handleConfirm = async () => {
    if (
      confirmInFlightRef.current ||
      isDeploying ||
      selectedSkillIds.size === 0 ||
      selectedTargetDirs.length === 0
    ) {
      return;
    }

    confirmInFlightRef.current = true;
    setIsConfirming(true);
    try {
      await onConfirm({
        skillIds: Array.from(selectedSkillIds),
        targetDirs: selectedTargetDirs,
        importMode,
      });
    } finally {
      confirmInFlightRef.current = false;
      setIsConfirming(false);
    }
  };

  const renderImportMode = () => (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {t("skill.importMode", "Import Mode")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={importMode === "copy"}
          onClick={() => setImportMode("copy")}
          className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
            importMode === "copy"
              ? "border-primary/40 bg-primary/5"
              : "border-border bg-background hover:bg-accent"
          }`}
        >
          <div className="text-sm font-medium text-foreground">
            {t("skill.copyMode", "Copy")}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t(
              "skill.projectImportCopyModeHint",
              "Copy a standalone snapshot into the selected project folders.",
            )}
          </div>
        </button>
        <button
          type="button"
          aria-pressed={importMode === "symlink"}
          onClick={() => setImportMode("symlink")}
          className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
            importMode === "symlink"
              ? "border-primary/40 bg-primary/5"
              : "border-border bg-background hover:bg-accent"
          }`}
        >
          <div className="text-sm font-medium text-foreground">
            {t("skill.symlink", "Symlink")}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t(
              "skill.projectImportSymlinkModeHint",
              "Link the project folder to My Skills so source updates stay in sync.",
            )}
          </div>
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title ?? t("skill.importFromMySkills", "Import from My Skills")}
      size="2xl"
    >
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          {description ??
            t(
              "skill.importFromMySkillsHint",
              "Select one or more skills from My Skills and deploy them into this project's local agent folders.",
            )}
        </p>

        {showTargetSettings ? (
          <div className="rounded-2xl border border-border app-wallpaper-surface p-4">
            <button
              type="button"
              aria-controls={advancedPanelId}
              aria-expanded={showAdvanced}
              onClick={() => setShowAdvanced((previous) => !previous)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Settings2Icon aria-hidden="true" className="h-4 w-4" />
                  {t(
                    "skill.advancedImportSettings",
                    "Advanced Import Settings",
                  )}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t(
                    "skill.advancedImportSettingsHint",
                    "Choose one or more target folders. If you skip this, PromptHub defaults to .agents/skills.",
                  )}
                </div>
              </div>
              <ChevronDownIcon
                aria-hidden="true"
                className={`h-4 w-4 text-muted-foreground transition-transform ${
                  showAdvanced ? "rotate-180" : "rotate-0"
                }`}
              />
            </button>

            {showAdvanced ? (
              <div id={advancedPanelId} className="mt-4 space-y-4">
                {renderImportMode()}

                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {t("skill.projectTargetFolders", "Target Folders")}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {presetTargets.map((target) => {
                      const isSelected = selectedTargetIds.has(target.id);
                      return (
                        <button
                          key={target.id}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => toggleTarget(target.id)}
                          className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                            isSelected
                              ? "border-primary/40 bg-primary/5"
                              : "border-border bg-background hover:bg-accent"
                          }`}
                        >
                          <div className="text-sm font-medium text-foreground">
                            {target.label}
                          </div>
                          <div className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                            {target.path}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {customTargets.length > 0 ? (
                    <div className="space-y-2">
                      {customTargets.map((target) => {
                        const isSelected = selectedTargetIds.has(target);
                        return (
                          <button
                            key={target}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => toggleTarget(target)}
                            className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                              isSelected
                                ? "border-primary/40 bg-primary/5"
                                : "border-border bg-background hover:bg-accent"
                            }`}
                          >
                            <div className="text-sm font-medium text-foreground">
                              {t(
                                "skill.customProjectDeployTarget",
                                "Custom target",
                              )}
                            </div>
                            <div className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                              {target}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    disabled={!onPickCustomTarget || isPickingCustomTarget}
                    onClick={() => void handleAddCustomTarget()}
                    className="inline-flex items-center gap-2 rounded-xl border border-border app-wallpaper-surface px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <FolderPlusIcon aria-hidden="true" className="h-4 w-4" />
                    {t("skill.addDeployTarget", "Add Folder")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <section className="rounded-2xl border border-border app-wallpaper-surface p-4">
            {renderImportMode()}
          </section>
        )}

        <section className="space-y-4 rounded-2xl border border-border app-wallpaper-surface p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {t("skill.selectSkillsToImport", "Select Skills")}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {selectHint ??
                  t(
                    "skill.selectSkillsToImportHint",
                    "Choose one or more skills to import into the selected project folders.",
                  )}
              </p>
            </div>

            <div className="w-full lg:max-w-sm">
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                aria-label={t("skill.searchSkill", "Search skills...")}
                placeholder={t("skill.searchSkill", "Search skills...")}
              />
            </div>
          </div>

          {skills.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              {t("skill.noSkills", "No skills found")}
            </div>
          ) : (
            <div className="max-h-[380px] overflow-y-auto pr-1">
              {visibleSkills.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("skill.noResults", "No skills found")}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {visibleSkills.map((skill) => {
                    const isSelected = selectedSkillIds.has(skill.id);
                    const missingTargetDirs =
                      getProjectTargetDirsRequiringDeployment(
                        scannedSkills,
                        skill,
                        selectedTargetDirs,
                      );
                    const deployedTargetCount =
                      selectedTargetDirs.length - missingTargetDirs.length;
                    const isFullyImported =
                      selectedTargetDirs.length > 0 &&
                      missingTargetDirs.length === 0;
                    const isPartiallyImported =
                      deployedTargetCount > 0 && !isFullyImported;

                    return (
                      <button
                        key={skill.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => toggleSkill(skill)}
                        disabled={isFullyImported}
                        className={`flex min-h-[148px] flex-col items-start justify-between gap-4 rounded-2xl border px-4 py-4 text-left transition-colors ${
                          isSelected
                            ? "border-primary/40 bg-primary/5"
                            : isFullyImported
                              ? "border-border bg-accent/20 opacity-70"
                              : "border-border bg-accent/40 hover:bg-accent"
                        }`}
                      >
                        <div className="min-w-0 w-full flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="truncate text-base font-semibold text-foreground">
                              {skill.name}
                            </div>
                            {isFullyImported ? (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
                                <CheckCircle2Icon
                                  aria-hidden="true"
                                  className="h-3 w-3"
                                />
                                {t("skill.importedBadge", "Already Imported")}
                              </span>
                            ) : isPartiallyImported ? (
                              <span className="inline-flex shrink-0 items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                                {t(
                                  "skill.partiallyImportedBadge",
                                  "Partially Imported",
                                )}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                            {skill.description ||
                              skill.author ||
                              skill.local_repo_path ||
                              skill.source_url}
                          </div>
                        </div>
                        <div className="flex w-full items-center justify-between gap-3">
                          <div className="truncate text-[11px] text-muted-foreground">
                            {(skill.tags || []).slice(0, 3).join(", ")}
                          </div>
                          <div
                            aria-hidden="true"
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                              isSelected
                                ? "border-primary bg-primary text-white"
                                : isFullyImported
                                  ? "border-muted-foreground/20 bg-muted"
                                  : "border-muted-foreground/30"
                            }`}
                          >
                            {isSelected ? (
                              <CheckIcon aria-hidden="true" className="h-3 w-3" />
                            ) : null}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-xl border border-border app-wallpaper-surface px-4 py-2 text-sm text-foreground transition-colors hover:bg-accent"
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={
              selectedSkillIds.size === 0 ||
              selectedTargetDirs.length === 0 ||
              isDeploying ||
              isConfirming
            }
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {isDeploying || isConfirming ? (
              <Loader2Icon
                aria-hidden="true"
                className="h-4 w-4 animate-spin"
              />
            ) : null}
            {confirmLabel
              ? confirmLabel(selectedSkillIds.size)
              : t("skill.importSelectedToProject", {
                  count: selectedSkillIds.size,
                  defaultValue: `Import ${selectedSkillIds.size} selected skill(s)`,
                })}
          </button>
        </div>
      </div>
    </Modal>
  );
}
