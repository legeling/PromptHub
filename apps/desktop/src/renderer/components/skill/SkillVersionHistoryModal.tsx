import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  Clock3Icon,
  GitBranchIcon,
  GitCompareIcon,
  HistoryIcon,
  Loader2Icon,
  MinusIcon,
  PlusIcon,
  RotateCcwIcon,
  TrashIcon,
} from "lucide-react";
import { Modal } from "../ui";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import type { Skill, SkillVersion } from "@prompthub/shared/types";
import { generateTextDiff, restoreSkillVersion } from "./detail-utils";
import { scheduleAllSaveSync } from "../../services/webdav-save-sync";
import {
  buildVersionFileDiffEntries,
  resolveVersionSnapshots,
  snapshotsFromLocalFiles,
} from "./version-utils";

interface SkillVersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  skill: Skill;
  currentContent: string;
  onReload: () => Promise<void>;
}

type CompareTarget = "current" | string;
type ContentView = "preview" | "diff";

function SkillDiffView({
  oldText,
  newText,
  label,
  emptyLabel,
}: {
  oldText: string;
  newText: string;
  label: string;
  emptyLabel: string;
}) {
  const diff = useMemo(
    () => generateTextDiff(oldText, newText),
    [oldText, newText],
  );
  const stats = useMemo(
    () => ({
      added: diff.filter((line) => line.type === "add").length,
      removed: diff.filter((line) => line.type === "remove").length,
    }),
    [diff],
  );
  const isUnchanged = stats.added === 0 && stats.removed === 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        {!isUnchanged ? (
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-green-600 dark:text-green-300">
              <PlusIcon className="h-3 w-3" />
              {stats.added}
            </span>
            <span className="flex items-center gap-1 text-red-600 dark:text-red-300">
              <MinusIcon className="h-3 w-3" />
              {stats.removed}
            </span>
          </div>
        ) : null}
      </div>

      {isUnchanged ? (
        <div className="rounded-2xl border border-border app-wallpaper-surface px-4 py-8 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border app-wallpaper-surface font-mono text-xs">
          <div className="max-h-[360px] overflow-auto">
            {diff.map((line, index) => (
              <div
                key={`${line.type}-${index}-${line.oldLineNum ?? 0}-${line.newLineNum ?? 0}`}
                className={`flex ${
                  line.type === "add"
                    ? "bg-green-500/15 text-green-700 dark:text-green-300"
                    : line.type === "remove"
                      ? "bg-red-500/15 text-red-700 dark:text-red-300"
                      : "text-foreground/80"
                }`}
              >
                <div className="flex w-16 flex-shrink-0 select-none border-r border-border/60 text-muted-foreground/60">
                  <span className="w-8 border-r border-border/40 px-1 text-right">
                    {line.oldLineNum || ""}
                  </span>
                  <span className="w-8 px-1 text-right">
                    {line.newLineNum || ""}
                  </span>
                </div>
                <div className="w-5 flex-shrink-0 text-center font-bold">
                  {line.type === "add"
                    ? "+"
                    : line.type === "remove"
                      ? "-"
                      : " "}
                </div>
                <div className="flex-1 whitespace-pre-wrap break-all px-2 py-0.5">
                  {line.content || " "}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SkillVersionHistoryModal({
  isOpen,
  onClose,
  skill,
  currentContent,
  onReload,
}: SkillVersionHistoryModalProps) {
  const { t } = useTranslation();
  const [versions, setVersions] = useState<SkillVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );
  const [compareTarget, setCompareTarget] = useState<CompareTarget>("current");
  const [view, setView] = useState<ContentView>("preview");
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [versionToDelete, setVersionToDelete] = useState<SkillVersion | null>(
    null,
  );
  const [currentFilesSnapshot, setCurrentFilesSnapshot] = useState<
    Array<{ relativePath: string; content: string }>
  >([]);
  const [expandedFilePaths, setExpandedFilePaths] = useState<Set<string>>(
    new Set(),
  );

  const loadVersions = useCallback(async () => {
    setIsLoading(true);
    try {
      const [versionsResult, currentFilesResult] = await Promise.allSettled([
        window.api.skill.versionGetAll(skill.id),
        window.api.skill.readLocalFiles(skill.id),
      ]);
      if (versionsResult.status !== "fulfilled") {
        throw versionsResult.reason;
      }
      const nextVersions = versionsResult.value;
      setVersions(nextVersions);
      setCurrentFilesSnapshot(
        currentFilesResult.status === "fulfilled"
          ? snapshotsFromLocalFiles(currentFilesResult.value, currentContent)
          : resolveVersionSnapshots(null, currentContent),
      );
      setSelectedVersionId(nextVersions[0]?.id ?? null);
      setCompareTarget("current");
      setView("preview");
    } catch (error) {
      console.error("Failed to load skill versions:", error);
    } finally {
      setIsLoading(false);
    }
  }, [currentContent, skill.id]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    void loadVersions();
  }, [isOpen, loadVersions]);

  const selectedVersion = useMemo(
    () => versions.find((item) => item.id === selectedVersionId) ?? null,
    [selectedVersionId, versions],
  );

  const compareOptions = useMemo(
    () => [
      {
        id: "current",
        label: t("skill.currentVersion", "Current Version"),
        content: currentContent,
      },
      ...versions
        .filter((version) => version.id !== selectedVersionId)
        .map((version) => ({
          id: version.id,
          label: `v${version.version}`,
          content: version.content || "",
        })),
    ],
    [currentContent, selectedVersionId, t, versions],
  );

  useEffect(() => {
    if (!compareOptions.some((option) => option.id === compareTarget)) {
      setCompareTarget("current");
    }
  }, [compareOptions, compareTarget]);

  const compareVersion = useMemo(
    () =>
      compareTarget === "current"
        ? null
        : (versions.find((version) => version.id === compareTarget) ?? null),
    [compareTarget, versions],
  );

  const compareLabel = compareVersion
    ? `v${compareVersion.version}`
    : t("skill.currentVersion", "Current Version");
  const selectedFilesSnapshot = useMemo(
    () =>
      resolveVersionSnapshots(selectedVersion, selectedVersion?.content || ""),
    [selectedVersion],
  );
  const compareFilesSnapshot = useMemo(
    () =>
      compareTarget === "current"
        ? currentFilesSnapshot
        : resolveVersionSnapshots(
            compareVersion,
            compareVersion?.content || "",
          ),
    [compareTarget, compareVersion, currentFilesSnapshot],
  );
  const fileDiffEntries = useMemo(
    () =>
      buildVersionFileDiffEntries(compareFilesSnapshot, selectedFilesSnapshot),
    [compareFilesSnapshot, selectedFilesSnapshot],
  );
  const changedFileEntries = useMemo(
    () => fileDiffEntries.filter((entry) => !entry.unchanged),
    [fileDiffEntries],
  );

  useEffect(() => {
    const nextExpanded = new Set<string>();
    for (const entry of changedFileEntries) {
      nextExpanded.add(entry.path);
    }
    if (nextExpanded.size === 0 && fileDiffEntries[0]) {
      nextExpanded.add(fileDiffEntries[0].path);
    }
    setExpandedFilePaths(nextExpanded);
  }, [changedFileEntries, compareTarget, fileDiffEntries, selectedVersionId]);

  const toggleFileExpanded = (path: string) => {
    setExpandedFilePaths((previous) => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const expandAllFiles = () =>
    setExpandedFilePaths(new Set(fileDiffEntries.map((entry) => entry.path)));

  const collapseAllFiles = () => setExpandedFilePaths(new Set());

  const handleRestore = async () => {
    if (!selectedVersion) {
      return;
    }

    setIsRestoring(true);
    try {
      await restoreSkillVersion(skill.id, selectedVersion, onReload);
      onClose();
    } catch (error) {
      console.error("Failed to restore skill version:", error);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDelete = async () => {
    if (!versionToDelete) {
      return;
    }

    setIsDeleting(true);
    try {
      await window.api.skill.versionDelete(skill.id, versionToDelete.id);
      scheduleAllSaveSync("skill:delete-version");
      setVersionToDelete(null);
      await loadVersions();
    } catch (error) {
      console.error("Failed to delete skill version:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("skill.versionHistory", "Version History")}
      size="2xl"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
          {t("common.loading", "Loading...")}
        </div>
      ) : versions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <HistoryIcon className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <div className="text-sm font-medium text-foreground">
            {t("skill.noVersionHistory", "No version history yet")}
          </div>
          <div className="mt-2 max-w-md text-xs leading-6 text-muted-foreground">
            {t(
              "skill.noVersionHistoryHint",
              "Editing SKILL.md or the file tree will automatically create snapshots that can be restored here.",
            )}
          </div>
        </div>
      ) : (
        <div className="grid h-[min(72vh,760px)] min-h-[460px] gap-4 overflow-hidden lg:grid-cols-[220px,1fr]">
          <div
            className="sticky top-0 flex min-h-0 flex-col rounded-2xl border border-border bg-background/60 p-3"
            data-testid="skill-version-timeline-pane"
          >
            <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Clock3Icon className="h-3.5 w-3.5" />
              {t("skill.versionTimeline", "Timeline")}
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {versions.map((version) => (
                <button
                  key={version.id}
                  type="button"
                  onClick={() => setSelectedVersionId(version.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                    version.id === selectedVersionId
                      ? "border-primary/40 bg-primary/5"
                      : "border-transparent hover:border-border hover:app-wallpaper-surface"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      v{version.version}
                    </span>
                    <GitBranchIcon className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {new Date(version.createdAt).toLocaleString()}
                  </div>
                  {version.note ? (
                    <div className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {version.note}
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div
            className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-background/60"
            data-testid="skill-version-content-pane"
          >
            <div className="border-b border-border px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {selectedVersion
                      ? t("skill.restoreVersion", {
                          version: selectedVersion.version,
                          defaultValue: `Restore to this version`,
                        })
                      : t("skill.versionHistory", "Version History")}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {selectedVersion?.note ||
                      t(
                        "skill.versionRestoreHint",
                        "Select a version to restore",
                      )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-xl border border-border app-wallpaper-surface p-1">
                    <button
                      type="button"
                      onClick={() => setView("preview")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        view === "preview"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground"
                      }`}
                    >
                      {t("common.preview", "Preview")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setView("diff")}
                      className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        view === "diff"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground"
                      }`}
                    >
                      <GitCompareIcon className="h-3.5 w-3.5" />
                      {t("skill.diffView", "Diff")}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      selectedVersion && setVersionToDelete(selectedVersion)
                    }
                    disabled={!selectedVersion || isDeleting || isRestoring}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <Loader2Icon className="h-4 w-4 animate-spin" />
                    ) : (
                      <TrashIcon className="h-4 w-4" />
                    )}
                    {t("common.delete", "Delete")}
                  </button>
                  <button
                    type="button"
                    onClick={handleRestore}
                    disabled={!selectedVersion || isRestoring}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isRestoring ? (
                      <>
                        <Loader2Icon className="h-4 w-4 animate-spin" />
                        {t("skill.restoring", "Restoring...")}
                      </>
                    ) : (
                      <>
                        <RotateCcwIcon className="h-4 w-4" />
                        {t("skill.restore", "Restore")}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {view === "diff" ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t("skill.compareAgainst", "Compare Against")}
                      </div>
                      <select
                        value={compareTarget}
                        onChange={(event) =>
                          setCompareTarget(event.target.value as CompareTarget)
                        }
                        className="h-10 rounded-xl border border-border app-wallpaper-surface px-3 text-sm outline-none transition-colors focus:border-primary/40"
                      >
                        {compareOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={expandAllFiles}
                        className="rounded-lg border border-border app-wallpaper-surface px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                      >
                        {t("skill.expandAll", "Expand All")}
                      </button>
                      <button
                        type="button"
                        onClick={collapseAllFiles}
                        className="rounded-lg border border-border app-wallpaper-surface px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                      >
                        {t("skill.collapseAll", "Collapse All")}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full app-wallpaper-surface px-3 py-1">
                      {t("skill.filesInVersion", "Files in Version")}:{" "}
                      {fileDiffEntries.length}
                    </span>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">
                      {t("skill.filesChanged", {
                        count: changedFileEntries.length,
                        defaultValue: `${changedFileEntries.length} file(s) changed`,
                      })}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {fileDiffEntries.map((entry) => {
                      const isExpanded = expandedFilePaths.has(entry.path);
                      const compareSummary = t("skill.compareSummary", {
                        from: compareLabel,
                        to: selectedVersion
                          ? `v${selectedVersion.version}`
                          : "-",
                        defaultValue: `${compareLabel} -> ${selectedVersion ? `v${selectedVersion.version}` : "-"}`,
                      });

                      return (
                        <div
                          key={entry.path}
                          className="overflow-hidden rounded-2xl border border-border bg-background/70"
                        >
                          <button
                            type="button"
                            onClick={() => toggleFileExpanded(entry.path)}
                            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                {isExpanded ? (
                                  <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
                                )}
                                <span className="truncate font-mono text-sm text-foreground">
                                  {entry.path}
                                </span>
                              </div>
                              <div className="mt-1 pl-6 text-xs text-muted-foreground">
                                {entry.unchanged
                                  ? t("skill.noChanges", "No changes")
                                  : compareSummary}
                              </div>
                            </div>
                            <div
                              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                entry.unchanged
                                  ? "app-wallpaper-surface text-muted-foreground"
                                  : "bg-primary/10 text-primary"
                              }`}
                            >
                              {entry.unchanged
                                ? t("skill.noChanges", "No changes")
                                : t("skill.diffView", "Diff")}
                            </div>
                          </button>
                          {isExpanded ? (
                            <div className="border-t border-border px-4 py-4">
                              <SkillDiffView
                                oldText={entry.oldContent}
                                newText={entry.newContent}
                                label={entry.path}
                                emptyLabel={t("skill.noChanges", "No changes")}
                              />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t("skill.currentVersion", "Current Version")}
                    </div>
                    <pre className="min-h-[280px] overflow-auto rounded-2xl border border-border app-wallpaper-surface p-4 text-xs leading-6 text-foreground whitespace-pre-wrap">
                      {currentContent ||
                        t("skill.noContent", "No content available")}
                    </pre>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {selectedVersion
                        ? `v${selectedVersion.version}`
                        : t("skill.selectedVersion", "Selected Version")}
                    </div>
                    <pre className="min-h-[280px] overflow-auto rounded-2xl border border-border app-wallpaper-surface p-4 text-xs leading-6 text-foreground whitespace-pre-wrap">
                      {selectedVersion?.content ||
                        t("skill.noContent", "No content available")}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        isOpen={Boolean(versionToDelete)}
        onClose={() => {
          if (isDeleting) {
            return;
          }
          setVersionToDelete(null);
        }}
        onConfirm={handleDelete}
        title={t("skill.deleteVersionTitle", "Delete version snapshot")}
        message={t("skill.deleteVersionConfirm", {
          version: versionToDelete?.version ?? "",
        })}
        confirmText={
          isDeleting
            ? t("common.loading", "Loading...")
            : t("common.delete", "Delete")
        }
        cancelText={t("common.cancel", "Cancel")}
        variant="destructive"
      />
    </Modal>
  );
}
