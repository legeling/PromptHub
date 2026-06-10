import { useEffect, useMemo, useState } from "react";
import type { RuleVersionSnapshot } from "@prompthub/shared/types";
import type { RuleFileId } from "@prompthub/shared/types";
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  BookOpenIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  HistoryIcon,
  Loader2Icon,
  MinusIcon,
  PlusIcon,
  RotateCcwIcon,
  SaveIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { useRulesStore } from "../../stores/rules.store";
import { useToast } from "../ui/Toast";
import { PlatformIcon } from "../ui/PlatformIcon";
import { generateTextDiff } from "../skill/detail-utils";
import { ConfirmDialog } from "../ui/ConfirmDialog";

function getParentDirectory(filePath: string): string {
  const normalized = filePath.replace(/[\\/]+$/, "");
  const separatorIndex = Math.max(
    normalized.lastIndexOf("/"),
    normalized.lastIndexOf("\\"),
  );

  if (separatorIndex <= 0) {
    return normalized;
  }

  return normalized.slice(0, separatorIndex);
}

export function RulesManager() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const currentFile = useRulesStore((state) => state.currentFile);
  const draftContent = useRulesStore((state) => state.draftContent);
  const aiInstruction = useRulesStore((state) => state.aiInstruction);
  const aiSummary = useRulesStore((state) => state.aiSummary);
  const isLoading = useRulesStore((state) => state.isLoading);
  const isSaving = useRulesStore((state) => state.isSaving);
  const isRewriting = useRulesStore((state) => state.isRewriting);
  const error = useRulesStore((state) => state.error);
  const hasLoadedFiles = useRulesStore((state) => state.hasLoadedFiles);
  const loadFiles = useRulesStore((state) => state.loadFiles);
  const setDraftContent = useRulesStore((state) => state.setDraftContent);
  const setAiInstruction = useRulesStore((state) => state.setAiInstruction);
  const saveCurrentRule = useRulesStore((state) => state.saveCurrentRule);
  const resolveCurrentRuleConflict = useRulesStore((state) => state.resolveCurrentRuleConflict);
  const rewriteCurrentRule = useRulesStore((state) => state.rewriteCurrentRule);
  const deleteRuleVersion = useRulesStore((state) => state.deleteRuleVersion);

  const [showAllVersions, setShowAllVersions] = useState(false);
  const VISIBLE_SNAPSHOTS_LIMIT = 5;
  const [deleteConfirm, setDeleteConfirm] = useState<{ ruleId: string; versionId: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [dismissedConflictRuleId, setDismissedConflictRuleId] = useState<RuleFileId | null>(null);
  const [isResolvingConflict, setIsResolvingConflict] = useState(false);
  const [pendingConflictStrategy, setPendingConflictStrategy] = useState<"use-managed" | "use-target" | null>(null);

  useEffect(() => {
    if (!hasLoadedFiles) {
      void loadFiles();
    }
  }, [hasLoadedFiles, loadFiles]);

  useEffect(() => {
    setSelectedVersionId(null);
    setShowAllVersions(false);
    setDismissedConflictRuleId(null);
  }, [currentFile?.id]);

  const syncConflictFile =
    currentFile?.syncStatus === "out-of-sync" &&
    typeof currentFile.targetContent === "string" &&
    dismissedConflictRuleId !== currentFile.id
      ? currentFile
      : null;

  useEffect(() => {
    if (
      selectedVersionId &&
      !currentFile?.versions.some((version) => version.id === selectedVersionId)
    ) {
      setSelectedVersionId(null);
    }
  }, [currentFile?.versions, selectedVersionId]);

  const hasChanges = currentFile ? draftContent !== currentFile.content : false;
  const selectedVersion = useMemo(
    () =>
      currentFile?.versions.find((version) => version.id === selectedVersionId) ??
      null,
    [currentFile?.versions, selectedVersionId],
  );
  // The version whose content matches the saved file = "current saved" version
  const currentSavedVersionId = useMemo(() => {
    if (!currentFile?.versions.length) return null;
    return (
      currentFile.versions.find((v) => v.content === currentFile.content)?.id ?? null
    );
  }, [currentFile]);

  const diffStats = useMemo(() => {
    if (!currentFile) {
      return { added: 0, removed: 0 };
    }
    const diff = generateTextDiff(currentFile.content, draftContent);
    return {
      added: diff.filter((line) => line.type === "add").length,
      removed: diff.filter((line) => line.type === "remove").length,
    };
  }, [currentFile, draftContent]);

  // Diff between selected version and current draft
  const versionDiff = useMemo(() => {
    if (!selectedVersion) return null;
    return generateTextDiff(selectedVersion.content, draftContent);
  }, [selectedVersion, draftContent]);

  const isPreviewingVersion = Boolean(selectedVersion);
  const editorContent = selectedVersion?.content ?? draftContent;

  const getVersionSourceLabel = (
    source: RuleVersionSnapshot["source"],
  ): string => {
    switch (source) {
      case "manual-save":
        return t("rules.versionSourceManualSave", "Saved");
      case "ai-rewrite":
        return t("rules.versionSourceAiRewrite", "AI Draft");
      case "create":
        return t("rules.versionSourceCreate", "Created");
      default:
        return source;
    }
  };

  const handleRestoreVersion = () => {
    if (!selectedVersion) {
      return;
    }

    setDraftContent(selectedVersion.content);
    setSelectedVersionId(null);
    showToast(t("rules.versionRestoreDone", "Snapshot restored to draft"), "success");
  };

  const handleSave = async () => {
    try {
      await saveCurrentRule();
      showToast(t("toast.saved", "Saved successfully"), "success");
    } catch (saveError) {
      showToast(
        saveError instanceof Error
          ? saveError.message
          : t("common.saveFailed", "Save failed"),
        "error",
      );
    }
  };

  const handleOpenLocation = async () => {
    if (!currentFile?.path) {
      return;
    }

    const result = await window.electron?.openPath?.(getParentDirectory(currentFile.path));
    if (result && !result.success) {
      showToast(result.error || t("rules.openLocationFailed", "Failed to open location"), "error");
    }
  };

  const handleResolveConflict = async (
    strategy: "use-managed" | "use-target",
  ) => {
    setIsResolvingConflict(true);
    try {
      await resolveCurrentRuleConflict(strategy);
      setDismissedConflictRuleId(currentFile?.id ?? null);
      showToast(
        strategy === "use-managed"
          ? t("rules.conflictResolvedUseManaged", "Kept the PromptHub version and synced it to the external file")
          : t("rules.conflictResolvedUseTarget", "Kept the external file version and synced it to PromptHub"),
        "success",
      );
    } catch (resolveError) {
      showToast(
        resolveError instanceof Error
          ? resolveError.message
          : t("rules.conflictResolveFailed", "Failed to resolve rule conflict"),
        "error",
      );
    } finally {
      setIsResolvingConflict(false);
      setPendingConflictStrategy(null);
    }
  };

  const handleAiRewrite = async () => {
    try {
      await rewriteCurrentRule();
      showToast(t("rules.aiRewriteDone", "AI draft ready"), "success");
    } catch (rewriteError) {
      showToast(
        rewriteError instanceof Error
          ? rewriteError.message
          : t("rules.aiRewriteFailed", "AI rewrite failed"),
        "error",
      );
    }
  };

  const editorLineCount = editorContent.split("\n").length;
  const editorCharCount = editorContent.length;

  return (
    <>
    <div className="flex h-full min-h-0 bg-background animate-in fade-in duration-base ease-enter">
      <div className="flex min-w-0 flex-1 flex-col">
        <div
          key={currentFile?.id ?? "rules-empty"}
          className="grid min-h-0 flex-1 grid-cols-[minmax(280px,340px)_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] animate-in fade-in slide-in-from-bottom-1 duration-base ease-enter"
        >
          {/* Middle Header */}
          <div className="border-b border-r border-border bg-muted/20 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {currentFile?.platformId === "workspace" ? (
                    <FolderIcon className="h-4 w-4 text-primary" />
                  ) : currentFile ? (
                    <PlatformIcon platformId={currentFile.platformId} size={16} className="h-4 w-4" />
                  ) : (
                    <BookOpenIcon className="h-4 w-4 text-primary" />
                  )}
                  <span className="truncate">
                    {currentFile?.platformName || t("rules.title", "Rules")}
                  </span>
                </div>
                <h3 className="mt-1.5 truncate text-xl font-semibold text-foreground">
                  {currentFile?.name || t("rules.pathUnknown", "No file selected")}
                </h3>
              </div>
              {currentFile?.path ? (
                <button
                  type="button"
                  onClick={() => void handleOpenLocation()}
                  className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title={t("rules.openLocation", "Open Location")}
                  aria-label={t("rules.openLocation", "Open Location")}
                >
                  <FolderOpenIcon aria-hidden="true" className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            {currentFile?.path ? (
              <div className="mt-2.5 flex items-center justify-between text-xs">
                <span className="truncate text-muted-foreground" title={currentFile.path}>
                  {currentFile.path}
                </span>
              </div>
            ) : null}

            {/* Compact diff stats in middle header when there are changes */}
            {hasChanges && !isPreviewingVersion ? (
              <div className="mt-3 flex items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <PlusIcon className="h-3 w-3" />
                  {diffStats.added} {t("rules.diffAdded", "Added")}
                </div>
                <div className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
                  <MinusIcon className="h-3 w-3" />
                  {diffStats.removed} {t("rules.diffRemoved", "Removed")}
                </div>
              </div>
            ) : null}
          </div>

          {/* Right Header */}
          <div className="flex items-start justify-between border-b border-border px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileTextIcon className="h-4 w-4 text-primary" />
                {selectedVersion
                  ? t("rules.diffSnapshotHeader", "Snapshot vs Current Draft")
                  : t("rules.editorCanvas", "Rule Content")}
              </div>
              <h3 className="mt-1 truncate text-lg font-semibold text-foreground">
                {currentFile?.name || t("rules.title", "Rules")}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                {selectedVersion ? (
                  <>
                    <span className="text-muted-foreground">{new Date(selectedVersion.savedAt).toLocaleString()}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      {getVersionSourceLabel(selectedVersion.source)}
                    </span>
                  </>
                ) : (
                  <span className={hasChanges ? "font-medium text-amber-500 dark:text-amber-400" : "text-muted-foreground"}>
                    {hasChanges
                      ? t("rules.draftUnsavedStatus", "Draft has unsaved changes")
                      : t("rules.draftSyncedStatus", "Draft matches the saved file")}
                  </span>
                )}
              </div>
            </div>

            {selectedVersion ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedVersionId(null)}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <ArrowLeftIcon aria-hidden="true" className="h-4 w-4" />
                  {t("rules.versionBackToDraft", "Back to Draft")}
                </button>
                <button
                  type="button"
                  onClick={handleRestoreVersion}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
                >
                  <RotateCcwIcon aria-hidden="true" className="h-4 w-4" />
                  {t("rules.versionRestoreToDraft", "Restore to Draft")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!currentFile || isSaving || !hasChanges}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                  hasChanges
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                {hasChanges && !isSaving ? (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-foreground opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-foreground" />
                  </span>
                ) : (
                  <SaveIcon aria-hidden="true" className="h-4 w-4" />
                )}
                {isSaving ? t("common.saving", "Saving...") : t("rules.saveAndOverwrite", "Save and overwrite file")}
              </button>
            )}
          </div>

          {/* Middle Settings Column */}
          <div className="flex min-h-0 flex-col overflow-y-auto border-r border-border bg-muted/20 p-5">
            <div className="flex flex-col gap-6">
              {/* AI Rewrite */}
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <SparklesIcon className="h-4 w-4 text-primary" />
                  {t("rules.aiRewriteTitle", "Ask AI to improve")}
                </div>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                  {t("rules.aiRewriteHint", "Describe your desired changes and AI will generate a new draft for the current rules file.")}
                </p>
                <textarea
                  aria-label={t("rules.aiRewriteTitle", "Ask AI to improve")}
                  value={aiInstruction}
                  onChange={(event) => setAiInstruction(event.target.value)}
                  className="mt-3 h-24 w-full resize-none rounded-xl border border-border bg-background p-3 text-sm text-foreground outline-none transition-colors focus:border-primary/40 focus:ring-1 focus:ring-primary/40"
                  placeholder={t(
                    "rules.aiRewritePlaceholder",
                    "Example: add testing requirements, reorganize sections, or strengthen constraints while keeping the current markdown headings where possible.",
                  )}
                />
                {aiSummary ? (
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/8 px-3 py-2 text-xs text-primary">
                    <SparklesIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{t("rules.aiRewriteSummary", "AI has generated a new draft. Review it and save when ready.")}</span>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleAiRewrite()}
                  disabled={
                    !currentFile ||
                    isRewriting ||
                    !aiInstruction.trim() ||
                    isPreviewingVersion
                  }
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <SparklesIcon aria-hidden="true" className="h-4 w-4" />
                  {isRewriting
                    ? t("rules.aiRewriteWorking", "Generating draft...")
                    : t("rules.aiRewriteAction", "Improve with AI")}
                </button>
              </div>

              {/* Versions */}
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <HistoryIcon className="h-4 w-4 text-primary" />
                  {t("rules.versionTitle", "History")}
                </div>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                  {t(
                    "rules.versionHint",
                    "Snapshots are read-only history. Select one to preview it, then restore it into the draft if needed.",
                  )}
                </p>
                <div className="mt-3 space-y-2">
                  {currentFile?.versions?.length ? (
                    <>
                      {(showAllVersions
                        ? currentFile.versions
                        : currentFile.versions.slice(0, VISIBLE_SNAPSHOTS_LIMIT)
                      ).map((version) => {
                        const isCurrent = version.id === currentSavedVersionId;
                        const isSelected = selectedVersionId === version.id;
                        return (
                          <div
                            key={version.id}
                            role="button"
                            tabIndex={0}
                            aria-pressed={isSelected}
                            onClick={() => {
                              if (isCurrent) {
                                setSelectedVersionId(null);
                                return;
                              }
                              setSelectedVersionId((currentId) =>
                                currentId === version.id ? null : version.id,
                              );
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                if (isCurrent) {
                                  setSelectedVersionId(null);
                                  return;
                                }
                                setSelectedVersionId((currentId) =>
                                  currentId === version.id ? null : version.id,
                                );
                              }
                            }}
                            className={`group relative w-full rounded-xl border px-3 py-3 text-left transition-all ${
                              isCurrent
                                ? "cursor-pointer border-border bg-card/60 opacity-75 hover:border-border/80 hover:bg-muted/40"
                                : isSelected
                                  ? "cursor-pointer border-primary/50 bg-primary/8 shadow-sm ring-1 ring-primary/20"
                                  : "cursor-pointer border-border bg-card/60 hover:border-border/80 hover:bg-muted/60"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-medium text-foreground">
                                    {new Date(version.savedAt).toLocaleString()}
                                  </span>
                                  {isCurrent && (
                                    <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                      ✓ {t("rules.versionCurrentLabel")}
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1 truncate text-[11px] leading-4 text-muted-foreground">
                                  {version.content
                                    .split("\n")
                                    .map((line) => line.trim())
                                    .find(Boolean) ||
                                    t("rules.emptyHint", "Rule content will appear here.")}
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                                  version.source === "ai-rewrite"
                                    ? "bg-primary/10 text-primary"
                                    : "bg-muted text-muted-foreground"
                                }`}>
                                  {getVersionSourceLabel(version.source)}
                                </span>
                                {!isCurrent && (
                                  <button
                                    type="button"
                                    aria-label={t("rules.versionDeleteAction")}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!currentFile) return;
                                      setDeleteConfirm({ ruleId: currentFile.id, versionId: version.id });
                                    }}
                                    className="hidden rounded-md p-1 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:flex group-hover:opacity-100"
                                  >
                                    <Trash2Icon
                                      aria-hidden="true"
                                      className="h-3 w-3"
                                    />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {currentFile.versions.length > VISIBLE_SNAPSHOTS_LIMIT && (
                        <button
                          type="button"
                          aria-expanded={showAllVersions}
                          onClick={() => setShowAllVersions((v) => !v)}
                          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-xs text-muted-foreground transition-colors hover:border-border/80 hover:bg-muted/40 hover:text-foreground"
                        >
                          {showAllVersions ? (
                            <>
                              <ChevronUpIcon
                                aria-hidden="true"
                                className="h-3.5 w-3.5"
                              />
                              {t("rules.versionShowLess")}
                            </>
                          ) : (
                            <>
                              <ChevronDownIcon
                                aria-hidden="true"
                                className="h-3.5 w-3.5"
                              />
                              {t("rules.versionShowMore", {
                                count: currentFile.versions.length - VISIBLE_SNAPSHOTS_LIMIT,
                              })}
                            </>
                          )}
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-6 text-center">
                      <HistoryIcon className="h-6 w-6 text-muted-foreground/40" />
                      <p className="text-xs leading-5 text-muted-foreground">
                        {t("rules.versionEmpty", "No snapshots yet.")}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Editor Column */}
          <div className="flex min-h-0 min-w-0 flex-col bg-background">
            {error ? (
              <div className="mx-6 mt-4 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <div>{error}</div>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 p-6">
              {isLoading && !currentFile ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  {t("common.loading", "Loading...")}
                </div>
              ) : isPreviewingVersion && versionDiff ? (
                /* Diff view: selected version → current draft */
                <div
                  key="diff"
                  className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm animate-in fade-in zoom-in-95 duration-base ease-enter"
                >
                  {/* Diff toolbar */}
                  <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-muted/30 px-4 py-2.5 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-0.5 font-medium text-amber-600 dark:text-amber-400">
                        <HistoryIcon className="h-3 w-3" />
                        {new Date(selectedVersion!.savedAt).toLocaleString()}
                      </span>
                      <span className="text-muted-foreground">→ {t("rules.diffCurrentDraft", "Current Draft")}</span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span className="text-emerald-500 dark:text-emerald-400">
                        +{versionDiff.filter((l) => l.type === "add").length}
                      </span>
                      <span className="text-destructive">
                        -{versionDiff.filter((l) => l.type === "remove").length}
                      </span>
                    </div>
                  </div>
                  {/* Diff lines */}
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <div className="font-mono text-xs leading-relaxed">
                      {versionDiff.map((line, idx) => (
                        <div
                          key={idx}
                          className={`flex items-start gap-0 ${
                            line.type === "add"
                              ? "bg-emerald-500/8 hover:bg-emerald-500/12"
                              : line.type === "remove"
                                ? "bg-destructive/8 hover:bg-destructive/12"
                                : "hover:bg-muted/30"
                          }`}
                        >
                          {/* Line numbers */}
                          <div className="flex shrink-0 select-none border-r border-border/40 text-muted-foreground/40">
                            <span className="w-10 px-2 py-0.5 text-right">
                              {line.type !== "add" ? (line.oldLineNum ?? "") : ""}
                            </span>
                            <span className="w-10 px-2 py-0.5 text-right">
                              {line.type !== "remove" ? (line.newLineNum ?? "") : ""}
                            </span>
                          </div>
                          {/* Gutter symbol */}
                          <span
                            className={`w-6 shrink-0 py-0.5 text-center font-bold select-none ${
                              line.type === "add"
                                ? "text-emerald-500 dark:text-emerald-400"
                                : line.type === "remove"
                                  ? "text-destructive"
                                  : "text-muted-foreground/20"
                            }`}
                          >
                            {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
                          </span>
                          {/* Content */}
                          <span
                            className={`min-w-0 flex-1 whitespace-pre-wrap break-all py-0.5 pr-4 ${
                              line.type === "add"
                                ? "text-emerald-700 dark:text-emerald-300"
                                : line.type === "remove"
                                  ? "text-destructive"
                                  : "text-foreground"
                            }`}
                          >
                            {line.content || " "}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* Normal editor */
                <div
                  key="editor"
                  className={`flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-colors animate-in fade-in zoom-in-95 duration-base ease-enter ${isRewriting ? "border-primary/40" : "border-border"}`}
                >
                  <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-muted/30 px-4 py-2.5 text-xs">
                    {isRewriting ? (
                      <span className="flex items-center gap-1.5 text-primary">
                        <Loader2Icon className="h-3 w-3 animate-spin" />
                        {t("rules.aiRewriteWorking", "Generating draft...")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {t("rules.draftEditMode", "Draft editor - not saved until you click Save")}
                      </span>
                    )}
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span>{t("rules.editorLineCount", "{{count}} lines", { count: editorLineCount })}</span>
                      <span className="text-border">·</span>
                      <span>{t("rules.editorCharCount", "{{count}} chars", { count: editorCharCount })}</span>
                    </div>
                  </div>
                  <textarea
                    aria-label={t("rules.editorCanvas", "Rule Content")}
                    value={editorContent}
                    onChange={(event) => setDraftContent(event.target.value)}
                    readOnly={isRewriting}
                    className={`h-full min-h-0 w-full flex-1 resize-none bg-card p-5 font-mono text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:ring-1 focus:ring-primary/30 ${isRewriting ? "cursor-not-allowed opacity-50" : ""}`}
                    placeholder={t("rules.emptyHint", "Rule content will appear here.")}
                    spellCheck={false}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
    <ConfirmDialog
      isOpen={deleteConfirm !== null}
      onClose={() => setDeleteConfirm(null)}
      onConfirm={() => {
        if (!deleteConfirm) return;
        setIsDeleting(true);
        void (async () => {
          try {
            await deleteRuleVersion(deleteConfirm.ruleId as RuleFileId, deleteConfirm.versionId);
            if (selectedVersionId === deleteConfirm.versionId) {
              setSelectedVersionId(null);
            }
            showToast(t("rules.versionDeleteDone"), "success");
          } catch {
            showToast(t("common.error"), "error");
          } finally {
            setIsDeleting(false);
            setDeleteConfirm(null);
          }
        })();
      }}
      title={t("rules.versionDeleteAction")}
      message={t("rules.versionDeleteConfirmMessage")}
      confirmText={t("common.delete")}
      cancelText={t("common.cancel")}
      variant="destructive"
      isLoading={isDeleting}
    />
    {syncConflictFile ? (
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
        <button
          type="button"
          aria-label={t("rules.conflictDismiss", "Dismiss rule conflict")}
          className="absolute inset-0 bg-background/60 backdrop-blur-sm"
          onClick={() => setDismissedConflictRuleId(syncConflictFile.id)}
          disabled={isResolvingConflict}
        />
        <div className="relative w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-base">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <AlertCircleIcon aria-hidden="true" className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-foreground">
                {t("rules.conflictTitle", "External rule file changed")}
              </h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {t(
                  "rules.conflictMessage",
                  "The external file no longer matches PromptHub's managed copy. Choose which version to keep as the source of truth. The other version will be overwritten after confirmation.",
                )}
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 text-xs md:grid-cols-2">
            <div className="min-h-0 rounded-lg border border-border bg-background p-3">
              <div className="mb-2 font-medium text-foreground">
                {t("rules.conflictPromptHubVersion", "PromptHub version")}
              </div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">
                {syncConflictFile.content || t("rules.emptyHint", "Rule content will appear here.")}
              </pre>
            </div>
            <div className="min-h-0 rounded-lg border border-border bg-background p-3">
              <div className="mb-2 font-medium text-foreground">
                {t("rules.conflictExternalVersion", "External file version")}
              </div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">
                {syncConflictFile.targetContent || t("rules.emptyHint", "Rule content will appear here.")}
              </pre>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setDismissedConflictRuleId(syncConflictFile.id)}
              disabled={isResolvingConflict}
              className="h-10 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={() => setPendingConflictStrategy("use-managed")}
              disabled={isResolvingConflict}
              className="h-10 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              {t("rules.conflictUseManaged", "Keep PromptHub version")}
            </button>
            <button
              type="button"
              onClick={() => setPendingConflictStrategy("use-target")}
              disabled={isResolvingConflict}
              className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {isResolvingConflict
                ? t("common.saving", "Saving...")
                : t("rules.conflictUseTarget", "Keep external file version")}
            </button>
          </div>
        </div>
      </div>
    ) : null}
    <ConfirmDialog
      isOpen={pendingConflictStrategy !== null}
      onClose={() => setPendingConflictStrategy(null)}
      onConfirm={() => {
        if (!pendingConflictStrategy) return;
        void handleResolveConflict(pendingConflictStrategy);
      }}
      title={
        pendingConflictStrategy === "use-managed"
          ? t("rules.conflictConfirmUseManagedTitle", "Keep PromptHub version?")
          : t("rules.conflictConfirmUseTargetTitle", "Keep external file version?")
      }
      message={
        pendingConflictStrategy === "use-managed"
          ? t(
              "rules.conflictConfirmUseManagedMessage",
              "PromptHub's managed copy will become the source of truth and overwrite the external rule file.",
            )
          : t(
              "rules.conflictConfirmUseTargetMessage",
              "The external rule file will become the source of truth and overwrite PromptHub's managed copy.",
            )
      }
      confirmText={
        pendingConflictStrategy === "use-managed"
          ? t("rules.conflictConfirmUseManagedAction", "Keep PromptHub version")
          : t("rules.conflictConfirmUseTargetAction", "Keep external version")
      }
      cancelText={t("common.cancel")}
      isLoading={isResolvingConflict}
    />
    </>
  );
}
