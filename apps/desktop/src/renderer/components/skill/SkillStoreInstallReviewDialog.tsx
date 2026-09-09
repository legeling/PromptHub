import { useMemo } from "react";
import { createPortal } from "react-dom";
import {
  DownloadIcon,
  FilePlus2Icon,
  FileTextIcon,
  Loader2Icon,
  XIcon,
} from "lucide-react";
import type { TFunction } from "i18next";
import type { CloudStoreDiff, RegistrySkill } from "@prompthub/shared/types";
import { generateTextDiff } from "./detail-utils";

interface SkillStoreInstallReviewDialogProps {
  skill: RegistrySkill | null;
  content: string;
  cloudDiff?: CloudStoreDiff | null;
  isLoading: boolean;
  t: TFunction;
  onClose: () => void;
  onConfirm: () => void;
}

const MAX_DIFF_LINES = 260;

export function SkillStoreInstallReviewDialog({
  skill,
  content,
  cloudDiff,
  isLoading,
  t,
  onClose,
  onConfirm,
}: SkillStoreInstallReviewDialogProps) {
  const diff = useMemo(() => generateTextDiff("", content), [content]);
  const changedFiles = cloudDiff
    ? [
        ...new Set([
          ...cloudDiff.added,
          ...cloudDiff.modified,
          ...cloudDiff.removed,
        ]),
      ]
    : [];

  if (!skill) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/60 backdrop-blur-sm"
        role="presentation"
        aria-hidden="true"
        onClick={isLoading ? undefined : onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="skill-store-install-review-title"
        className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border app-wallpaper-panel-strong shadow-2xl"
      >
        <header className="flex items-start gap-3 border-b border-border p-5">
          <div className="min-w-0 flex-1">
            <h2
              id="skill-store-install-review-title"
              className="text-base font-semibold text-foreground"
            >
              {t("skill.installReviewTitle", "Review Skill before adding")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {skill.name} · {skill.version || "latest"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            aria-label={t("common.close", "Close")}
            title={t("common.close", "Close")}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
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
                SKILL.md
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("skill.installReviewLines", "{{count}} lines to add", {
                  count: content.split("\n").length,
                })}
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
                {cloudDiff
                  ? t(
                      "skill.updateReviewChangedFiles",
                      "{{count}} changed files",
                      {
                        count: changedFiles.length,
                      },
                    )
                  : t("skill.installReviewPackageSource", "Source package")}
              </p>
            </div>
          </div>

          {changedFiles.length > 0 && (
            <section className="rounded-xl border border-border p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("skill.updateReviewFiles", "Changed files")}
              </h3>
              <ul className="mt-2 grid gap-1 text-xs text-foreground sm:grid-cols-2">
                {changedFiles.slice(0, 40).map((file) => (
                  <li key={file} className="truncate font-mono">
                    {file}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="overflow-hidden rounded-xl border border-border">
            <div className="border-b border-border bg-muted/30 px-3 py-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("skill.installReviewPreview", "Content to be added")}
              </h3>
            </div>
            <pre className="max-h-72 overflow-auto bg-background p-3 text-[11px] leading-5">
              {diff.slice(0, MAX_DIFF_LINES).map((line, index) => (
                <div
                  key={`${line.type}-${index}`}
                  className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                >
                  <span className="mr-2 inline-block w-3 select-none text-center opacity-70">
                    +
                  </span>
                  {line.content || " "}
                </div>
              ))}
            </pre>
          </section>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border p-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="h-10 rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            {t("common.cancel", "Cancel")}
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
            {t("skill.installReviewConfirm", "Confirm and add")}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
