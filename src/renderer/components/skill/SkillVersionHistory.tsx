import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Modal, ConfirmDialog } from "../ui";
import {
  ClockIcon,
  RotateCcwIcon,
  GitCompareIcon,
  PlusIcon,
  MinusIcon,
  FileTextIcon,
  FolderIcon,
  SaveIcon,
} from "lucide-react";
import type {
  Skill,
  SkillVersion,
  SkillFileSnapshot,
} from "../../../shared/types";
import { useSkillStore } from "../../stores/skill.store";

interface SkillVersionHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  skill: Skill;
  onRestore: (version: SkillVersion) => void;
}

// ─── LCS-based diff algorithm ───────────────────────────────────────────────

function computeLCS(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

interface DiffLine {
  type: "add" | "remove" | "unchanged";
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

function generateDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = (oldText || "").split("\n");
  const newLines = (newText || "").split("\n");

  if (oldText === newText) {
    return oldLines.map((line, i) => ({
      type: "unchanged" as const,
      content: line,
      oldLineNum: i + 1,
      newLineNum: i + 1,
    }));
  }

  const dp = computeLCS(oldLines, newLines);
  const stack: DiffLine[] = [];

  let i = oldLines.length;
  let j = newLines.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({
        type: "unchanged",
        content: oldLines[i - 1],
        oldLineNum: i,
        newLineNum: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({
        type: "add",
        content: newLines[j - 1],
        newLineNum: j,
      });
      j--;
    } else if (i > 0) {
      stack.push({
        type: "remove",
        content: oldLines[i - 1],
        oldLineNum: i,
      });
      i--;
    }
  }

  const diff: DiffLine[] = [];
  while (stack.length > 0) {
    diff.push(stack.pop()!);
  }
  return diff;
}

// ─── Git-style diff view ────────────────────────────────────────────────────

function GitDiffView({
  oldText,
  newText,
  label,
}: {
  oldText: string;
  newText: string;
  label: string;
}) {
  const diff = useMemo(
    () => generateDiff(oldText, newText),
    [oldText, newText],
  );

  const stats = useMemo(() => {
    const added = diff.filter((d) => d.type === "add").length;
    const removed = diff.filter((d) => d.type === "remove").length;
    return { added, removed };
  }, [diff]);

  const isUnchanged = stats.added === 0 && stats.removed === 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground uppercase">
          {label}
        </div>
        {!isUnchanged && (
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-green-600">
              <PlusIcon className="w-3 h-3" />
              {stats.added}
            </span>
            <span className="flex items-center gap-1 text-red-600">
              <MinusIcon className="w-3 h-3" />
              {stats.removed}
            </span>
          </div>
        )}
      </div>

      {isUnchanged ? (
        <div className="text-sm text-muted-foreground italic p-3 bg-muted/30 rounded-lg">
          No changes
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden font-mono text-xs">
          <div className="max-h-64 overflow-y-auto">
            {diff.map((line, index) => (
              <div
                key={index}
                className={`flex ${
                  line.type === "add"
                    ? "bg-green-500/15 text-green-700 dark:text-green-300"
                    : line.type === "remove"
                      ? "bg-red-500/15 text-red-700 dark:text-red-300"
                      : "bg-transparent text-foreground/80"
                }`}
              >
                <div className="flex-shrink-0 w-16 flex text-muted-foreground/50 select-none border-r border-border/50">
                  <span className="w-8 text-right px-1 border-r border-border/30">
                    {line.oldLineNum || ""}
                  </span>
                  <span className="w-8 text-right px-1">
                    {line.newLineNum || ""}
                  </span>
                </div>
                <div
                  className={`flex-shrink-0 w-5 text-center font-bold ${
                    line.type === "add"
                      ? "text-green-600"
                      : line.type === "remove"
                        ? "text-red-600"
                        : ""
                  }`}
                >
                  {line.type === "add"
                    ? "+"
                    : line.type === "remove"
                      ? "-"
                      : " "}
                </div>
                <div className="flex-1 px-2 py-0.5 whitespace-pre-wrap break-all">
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

// ─── File list tab for multi-file snapshots ─────────────────────────────────

function FileSnapshotView({
  files,
  compareFiles,
  showDiff,
}: {
  files: SkillFileSnapshot[];
  compareFiles?: SkillFileSnapshot[];
  showDiff: boolean;
}) {
  const [selectedFile, setSelectedFile] = useState<string>(
    files[0]?.relativePath || "",
  );
  const { t } = useTranslation();

  const currentFile = files.find((f) => f.relativePath === selectedFile);
  const compareFile = compareFiles?.find(
    (f) => f.relativePath === selectedFile,
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase">
        <FolderIcon className="w-3.5 h-3.5" />
        {t("skill.filesInVersion")}
      </div>
      <div className="flex gap-2 flex-wrap">
        {files.map((file) => (
          <button
            key={file.relativePath}
            onClick={() => setSelectedFile(file.relativePath)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedFile === file.relativePath
                ? "bg-primary text-white"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            <FileTextIcon className="w-3 h-3" />
            {file.relativePath}
          </button>
        ))}
      </div>
      {currentFile &&
        (showDiff && compareFile ? (
          <GitDiffView
            oldText={compareFile.content}
            newText={currentFile.content}
            label={currentFile.relativePath}
          />
        ) : (
          <div className="p-3 rounded-lg bg-muted/50 text-sm font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">
            {currentFile.content || t("skill.noContent")}
          </div>
        ))}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function SkillVersionHistory({
  isOpen,
  onClose,
  skill,
  onRestore,
}: SkillVersionHistoryProps) {
  const [versions, setVersions] = useState<SkillVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<SkillVersion | null>(
    null,
  );
  const [compareVersion, setCompareVersion] = useState<SkillVersion | null>(
    null,
  );
  const [showDiff, setShowDiff] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [createNote, setCreateNote] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const { t } = useTranslation();
  const { createVersion } = useSkillStore();

  useEffect(() => {
    if (isOpen && skill) {
      loadVersions();
    }
  }, [isOpen, skill]);

  const loadVersions = async () => {
    setIsLoading(true);
    setShowDiff(false);
    setCompareVersion(null);
    try {
      const historyVersions: SkillVersion[] =
        await window.api.skill.versionGetAll(skill.id);

      // Build current version entry from skill data
      const currentVersion: SkillVersion = {
        id: "current",
        skillId: skill.id,
        version:
          skill.currentVersion ??
          (historyVersions.length > 0 ? historyVersions[0].version : 1),
        content: skill.content || skill.instructions,
        note: t("skill.currentVersion"),
        createdAt: new Date(skill.updated_at).toISOString(),
      };

      const allVersions = [
        currentVersion,
        ...historyVersions.filter((v) => v.version !== currentVersion.version),
      ];

      setVersions(allVersions);
      if (allVersions.length > 0) {
        setSelectedVersion(allVersions[0]);
      }
    } catch (error) {
      console.error("Failed to load skill versions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = () => {
    if (selectedVersion && selectedVersion.id !== "current") {
      setShowRestoreConfirm(true);
    }
  };

  const confirmRestore = () => {
    if (selectedVersion) {
      onRestore(selectedVersion);
      setShowRestoreConfirm(false);
      onClose();
    }
  };

  const handleCreateVersion = async () => {
    setIsCreating(true);
    try {
      const success = await createVersion(skill.id, createNote || undefined);
      if (success) {
        setShowCreateInput(false);
        setCreateNote("");
        await loadVersions();
      }
    } finally {
      setIsCreating(false);
    }
  };

  const isCurrentVersion = selectedVersion?.id === "current";

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={t("skill.versionHistory")}
        size="2xl"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">{t("common.loading")}</div>
          </div>
        ) : versions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ClockIcon className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">{t("skill.noVersions")}</p>
          </div>
        ) : (
          <div className="flex gap-4 min-h-[400px]">
            {/* Version list */}
            <div className="w-48 border-r border-border pr-4 space-y-1">
              <div className="text-xs text-muted-foreground mb-2 px-1">
                {showDiff ? t("skill.compareVersions") : t("skill.version")}
              </div>
              {versions.map((version) => (
                <button
                  key={version.id}
                  onClick={() => {
                    if (showDiff) {
                      setCompareVersion(version);
                    } else {
                      setSelectedVersion(version);
                    }
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    showDiff
                      ? compareVersion?.id === version.id
                        ? "bg-green-500 text-white"
                        : selectedVersion?.id === version.id
                          ? "bg-red-500 text-white"
                          : "hover:bg-muted"
                      : selectedVersion?.id === version.id
                        ? "bg-primary text-white"
                        : "hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">v{version.version}</span>
                    {version.id === "current" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/20 leading-none">
                        Current
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-xs mt-0.5 ${
                      showDiff
                        ? compareVersion?.id === version.id ||
                          selectedVersion?.id === version.id
                          ? "text-white/70"
                          : "text-muted-foreground"
                        : selectedVersion?.id === version.id
                          ? "text-white/70"
                          : "text-muted-foreground"
                    }`}
                  >
                    {new Date(version.createdAt).toLocaleString()}
                  </div>
                  {version.note && version.id !== "current" && (
                    <div
                      className={`text-xs mt-1 truncate ${
                        showDiff
                          ? compareVersion?.id === version.id ||
                            selectedVersion?.id === version.id
                            ? "text-white/60"
                            : "text-muted-foreground/70"
                          : selectedVersion?.id === version.id
                            ? "text-white/60"
                            : "text-muted-foreground/70"
                      }`}
                    >
                      {version.note}
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Version content / Diff comparison */}
            <div className="flex-1 space-y-4 overflow-y-auto">
              {showDiff && selectedVersion && compareVersion ? (
                <>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 p-2 rounded-lg bg-muted/30">
                    <span className="px-2 py-1 rounded bg-red-500/20 text-red-600 font-mono text-xs">
                      v{selectedVersion.version}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="px-2 py-1 rounded bg-green-500/20 text-green-600 font-mono text-xs">
                      v{compareVersion.version}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(selectedVersion.createdAt).toLocaleDateString()}{" "}
                      →{" "}
                      {new Date(compareVersion.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Diff: SKILL.md content */}
                  {(selectedVersion.content || compareVersion.content) && (
                    <GitDiffView
                      oldText={selectedVersion.content || ""}
                      newText={compareVersion.content || ""}
                      label="SKILL.md"
                    />
                  )}

                  {/* Diff: multi-file snapshots */}
                  {(selectedVersion.filesSnapshot ||
                    compareVersion.filesSnapshot) && (
                    <FileSnapshotView
                      files={
                        compareVersion.filesSnapshot ||
                        selectedVersion.filesSnapshot ||
                        []
                      }
                      compareFiles={selectedVersion.filesSnapshot}
                      showDiff={true}
                    />
                  )}
                </>
              ) : selectedVersion ? (
                <>
                  {/* SKILL.md content */}
                  {selectedVersion.content && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground uppercase mb-2">
                        SKILL.md
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50 text-sm font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">
                        {selectedVersion.content}
                      </div>
                    </div>
                  )}

                  {/* Multi-file snapshots */}
                  {selectedVersion.filesSnapshot &&
                    selectedVersion.filesSnapshot.length > 0 && (
                      <FileSnapshotView
                        files={selectedVersion.filesSnapshot}
                        showDiff={false}
                      />
                    )}

                  {/* Version note */}
                  {selectedVersion.note && selectedVersion.id !== "current" && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground uppercase mb-2">
                        {t("skill.versionNote")}
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50 text-sm">
                        {selectedVersion.note}
                      </div>
                    </div>
                  )}

                  {/* Empty state: no content and no files */}
                  {!selectedVersion.content &&
                    (!selectedVersion.filesSnapshot ||
                      selectedVersion.filesSnapshot.length === 0) && (
                      <div className="text-sm text-muted-foreground italic p-3 bg-muted/30 rounded-lg">
                        {t("skill.noContent")}
                      </div>
                    )}
                </>
              ) : null}
            </div>
          </div>
        )}

        {/* Create version input */}
        {showCreateInput && (
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
            <input
              type="text"
              value={createNote}
              onChange={(e) => setCreateNote(e.target.value)}
              placeholder={t("skill.versionNotePlaceholder")}
              className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isCreating) {
                  handleCreateVersion();
                }
              }}
              autoFocus
            />
            <button
              onClick={handleCreateVersion}
              disabled={isCreating}
              className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isCreating ? t("skill.creating") : t("common.confirm")}
            </button>
            <button
              onClick={() => {
                setShowCreateInput(false);
                setCreateNote("");
              }}
              className="h-9 px-4 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
            >
              {t("common.cancel")}
            </button>
          </div>
        )}

        {/* Action buttons */}
        {versions.length > 0 && selectedVersion && (
          <div className="flex justify-between mt-6 pt-4 border-t border-border">
            <div className="flex gap-2">
              <button
                onClick={() => setShowCreateInput(!showCreateInput)}
                className={`flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium border border-border transition-colors ${
                  showCreateInput ? "bg-muted" : "hover:bg-muted"
                }`}
              >
                <SaveIcon className="w-4 h-4" />
                {t("skill.createVersion")}
              </button>
              <button
                onClick={() => {
                  if (showDiff) {
                    setShowDiff(false);
                    setCompareVersion(null);
                  } else {
                    setShowDiff(true);
                  }
                }}
                className={`flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium transition-colors ${
                  showDiff ? "bg-primary text-white" : "hover:bg-muted"
                }`}
              >
                <GitCompareIcon className="w-4 h-4" />
                {showDiff ? t("common.cancel") : t("skill.compareVersions")}
              </button>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="h-9 px-4 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
              >
                {t("common.cancel")}
              </button>
              {!showDiff && !isCurrentVersion && (
                <button
                  onClick={handleRestore}
                  className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <RotateCcwIcon className="w-4 h-4" />
                  {t("skill.restoreVersion")}
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={showRestoreConfirm}
        onClose={() => setShowRestoreConfirm(false)}
        onConfirm={confirmRestore}
        title={t("skill.restoreVersion")}
        message={t("skill.restoreConfirm", {
          version: selectedVersion?.version,
        })}
        confirmText={t("skill.restoreVersion")}
        cancelText={t("common.cancel")}
      />
    </>
  );
}
