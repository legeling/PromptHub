import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  DownloadIcon,
  FilePlus2Icon,
  FileTextIcon,
  Loader2Icon,
  XIcon,
} from "lucide-react";
import type { TFunction } from "i18next";
import type {
  CloudStoreDiff,
  SkillPackageSnapshot,
} from "@prompthub/shared/types";
import type { RegistrySkillUpdateCheck } from "../../services/skill-store-update";
import {
  buildSkillPackageDiff,
  type SkillPackageFileDiff,
} from "../../services/skill-package-diff";
import { generateTextDiff } from "./detail-utils";

interface SkillStoreUpdateReviewDialogProps {
  check: RegistrySkillUpdateCheck | null;
  cloudDiff?: CloudStoreDiff | null;
  overwriteLocalChanges: boolean;
  decisionMode?: boolean;
  isLoading: boolean;
  t: TFunction;
  onClose: () => void;
  onConfirm: () => void;
}

const MAX_SOURCE_LINES = 600;
const MAX_RENDERED_DIFF_LINES = 260;

function getComparableContent(file: SkillPackageFileDiff | undefined): {
  local: string;
  remote: string;
  truncated: boolean;
} {
  if (!file || file.previewKind !== "text") {
    return { local: "", remote: "", truncated: false };
  }
  const local = file.local?.content ?? "";
  const remote = file.remote?.content ?? "";
  const localLines = local.split("\n");
  const remoteLines = remote.split("\n");
  const truncated =
    localLines.length > MAX_SOURCE_LINES ||
    remoteLines.length > MAX_SOURCE_LINES;
  return {
    local: localLines.slice(0, MAX_SOURCE_LINES).join("\n"),
    remote: remoteLines.slice(0, MAX_SOURCE_LINES).join("\n"),
    truncated,
  };
}

function buildLegacySnapshots(check: RegistrySkillUpdateCheck): {
  local: SkillPackageSnapshot;
  remote: SkillPackageSnapshot;
} {
  const localContent =
    check.installedSkill?.content ?? check.installedSkill?.instructions ?? "";
  return {
    local: check.localPackageSnapshot ?? {
      content: localContent,
      directoryFingerprint:
        check.localDirectoryFingerprint || check.localHash || "local",
      scope: "package",
    },
    remote: check.remotePackageSnapshot ?? {
      content: check.remoteContent ?? "",
      directoryFingerprint:
        check.remoteDirectoryFingerprint || check.remoteHash || "remote",
      scope: "skill-md",
    },
  };
}

function getCloudFallbackDiff(
  diff: CloudStoreDiff | null | undefined,
): SkillPackageFileDiff[] {
  if (!diff) return [];
  return [
    ...diff.added.map((path) => ({ path, status: "added" as const })),
    ...diff.modified.map((path) => ({ path, status: "modified" as const })),
    ...diff.removed.map((path) => ({ path, status: "removed" as const })),
  ].map((file) => ({ ...file, previewKind: "truncated" as const }));
}

function formatFileSize(sizeBytes: number | undefined): string {
  if (sizeBytes === undefined) return "-";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SkillStoreUpdateReviewDialog({
  check,
  cloudDiff,
  overwriteLocalChanges,
  decisionMode = false,
  isLoading,
  t,
  onClose,
  onConfirm,
}: SkillStoreUpdateReviewDialogProps) {
  const packageDiff = useMemo(() => {
    if (!check) return [];
    const snapshots = buildLegacySnapshots(check);
    const completeDiff = buildSkillPackageDiff(
      snapshots.local,
      snapshots.remote,
    );
    const fallbackDiff = getCloudFallbackDiff(cloudDiff);
    const paths = new Set(completeDiff.map((file) => file.path));
    return [
      ...completeDiff,
      ...fallbackDiff.filter((file) => !paths.has(file.path)),
    ];
  }, [check, cloudDiff]);
  const [selectedPath, setSelectedPath] = useState("SKILL.md");
  useEffect(() => {
    if (packageDiff.some((file) => file.path === selectedPath)) return;
    setSelectedPath(
      packageDiff.find((file) => file.path.toLowerCase() === "skill.md")
        ?.path ??
        packageDiff[0]?.path ??
        "SKILL.md",
    );
  }, [packageDiff, selectedPath]);
  const selectedFile = packageDiff.find((file) => file.path === selectedPath);
  const comparableContent = useMemo(
    () => getComparableContent(selectedFile),
    [selectedFile],
  );
  const textDiff = useMemo(() => {
    return generateTextDiff(comparableContent.local, comparableContent.remote);
  }, [comparableContent]);
  const renderedDiff = textDiff.slice(0, MAX_RENDERED_DIFF_LINES);
  const changedFiles = packageDiff.map((file) => file.path);
  const addedFiles = packageDiff.filter((file) => file.status === "added");
  const modifiedFiles = packageDiff.filter(
    (file) => file.status === "modified",
  );
  const removedFiles = packageDiff.filter((file) => file.status === "removed");

  if (!check) return null;

  const skillName =
    check.registrySkill?.name || check.installedSkill?.name || "Skill";

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex animate-in items-center justify-center p-4 fade-in duration-base ease-enter">
      <div
        className="absolute inset-0 bg-background/60 backdrop-blur-sm"
        role="presentation"
        aria-hidden="true"
        onClick={isLoading ? undefined : onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="skill-store-update-review-title"
        className="relative flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border app-wallpaper-panel-strong shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-base ease-enter"
      >
        <header className="flex items-start gap-3 border-b border-border p-5">
          <div className="min-w-0 flex-1">
            <h2
              id="skill-store-update-review-title"
              className="text-base font-semibold text-foreground"
            >
              {t("skill.updateReviewTitle", "Review Skill update")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{skillName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            aria-label={t("common.close", "Close")}
            title={t("common.close", "Close")}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <XIcon aria-hidden="true" className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <FileTextIcon
                  className="h-4 w-4 text-primary"
                  aria-hidden="true"
                />
                {t("skill.updateReviewCompleteDiff", "Complete package diff")}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t(
                  "skill.updateReviewChangedFiles",
                  "{{count}} changed files",
                  {
                    count: changedFiles.length,
                  },
                )}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <FilePlus2Icon
                  className="h-4 w-4 text-primary"
                  aria-hidden="true"
                />
                {t("skill.updateReviewPackage", "Package")}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t(
                  "skill.updateReviewPackageSummary",
                  "+{{added}} · ~{{modified}} · -{{removed}}",
                  {
                    added: addedFiles.length,
                    modified: modifiedFiles.length,
                    removed: removedFiles.length,
                  },
                )}
              </p>
            </div>
          </div>

          <section className="overflow-hidden rounded-xl border border-border">
            <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("skill.updateReviewFiles", "Changed files")}
              </h3>
              <span className="text-[11px] text-muted-foreground">
                {changedFiles.length}
              </span>
            </div>
            {packageDiff.length > 0 ? (
              <div className="grid min-h-80 md:grid-cols-[15rem_minmax(0,1fr)]">
                <div className="max-h-[26rem] overflow-auto border-b border-border bg-muted/10 p-2 md:border-b-0 md:border-r">
                  {packageDiff.map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      aria-pressed={file.path === selectedPath}
                      onClick={() => setSelectedPath(file.path)}
                      className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                        file.path === selectedPath
                          ? "bg-primary/10 text-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <span
                        className={`w-4 shrink-0 text-center font-mono font-semibold ${
                          file.status === "added"
                            ? "text-emerald-600"
                            : file.status === "removed"
                              ? "text-red-600"
                              : "text-amber-600"
                        }`}
                      >
                        {file.status === "added"
                          ? "+"
                          : file.status === "removed"
                            ? "-"
                            : "~"}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono">
                        {file.path}
                      </span>
                      <span className="sr-only">
                        {t(
                          `skill.updateReview${
                            file.status === "added"
                              ? "Added"
                              : file.status === "removed"
                                ? "Removed"
                                : "Modified"
                          }`,
                          file.status,
                        )}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="min-w-0 bg-background">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs font-semibold text-foreground">
                        {selectedFile?.path}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatFileSize(selectedFile?.local?.sizeBytes)} →{" "}
                        {formatFileSize(selectedFile?.remote?.sizeBytes)}
                      </p>
                    </div>
                    {selectedFile?.previewKind === "text" ? (
                      <span className="text-[11px] text-muted-foreground">
                        +{textDiff.filter((line) => line.type === "add").length}{" "}
                        / -
                        {
                          textDiff.filter((line) => line.type === "remove")
                            .length
                        }
                      </span>
                    ) : null}
                  </div>
                  {selectedFile?.previewKind === "text" ? (
                    <>
                      <pre className="max-h-[22rem] overflow-auto p-3 text-[11px] leading-5">
                        {renderedDiff.map((line, index) => (
                          <div
                            key={`${line.type}-${index}`}
                            className={
                              line.type === "add"
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                : line.type === "remove"
                                  ? "bg-red-500/10 text-red-700 dark:text-red-300"
                                  : "text-muted-foreground"
                            }
                          >
                            <span className="mr-2 inline-block w-3 select-none text-center opacity-70">
                              {line.type === "add"
                                ? "+"
                                : line.type === "remove"
                                  ? "-"
                                  : " "}
                            </span>
                            {line.content || " "}
                          </div>
                        ))}
                      </pre>
                      {(renderedDiff.length < textDiff.length ||
                        comparableContent.truncated) && (
                        <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                          {t(
                            "skill.updateReviewDiffTruncated",
                            "The preview is truncated. The complete package will be checked before it is written.",
                          )}
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="flex min-h-64 items-center justify-center p-6 text-center text-xs text-muted-foreground">
                      {selectedFile?.previewKind === "binary"
                        ? t(
                            "skill.updateReviewBinaryPreview",
                            "Binary file changed. Hashes and sizes were compared; text preview is unavailable.",
                          )
                        : t(
                            "skill.updateReviewTruncatedPreview",
                            "This text file exceeds the safe preview limit. Its complete hash and size were compared.",
                          )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="p-6 text-center text-xs text-muted-foreground">
                {t(
                  "skill.updateReviewNoPackageDiff",
                  "No package file differences are available.",
                )}
              </p>
            )}
          </section>

          {overwriteLocalChanges && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              {t(
                "skill.updateReviewOverwriteWarning",
                "This action will replace local changes after you confirm.",
              )}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border p-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="h-10 rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            {decisionMode
              ? t("skill.updateReviewKeepLocal", "Keep local version")
              : t("common.cancel", "Cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2Icon
                className="h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <DownloadIcon className="h-4 w-4" aria-hidden="true" />
            )}
            {decisionMode
              ? t("skill.updateReviewUseSource", "Use source version")
              : overwriteLocalChanges
                ? t(
                    "skill.updateReviewConfirmOverwrite",
                    "Overwrite and update",
                  )
                : t("skill.updateReviewConfirm", "Confirm update")}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
