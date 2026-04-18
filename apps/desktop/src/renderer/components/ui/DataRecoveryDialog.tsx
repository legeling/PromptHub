import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  RecoveryCandidate,
  RecoveryDataSource,
  RecoveryPreviewItem,
  RecoveryPreviewResult,
} from "@prompthub/shared/types";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  FolderOpen,
  HardDrive,
  Search,
} from "lucide-react";

import { Modal } from "./Modal";

interface DataRecoveryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  databases: RecoveryCandidate[];
  persistDismiss?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function sourceTypeLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  sourceType: RecoveryCandidate["sourceType"],
): string {
  return t(`recovery.sourceType.${sourceType}`);
}

function dataSourceLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  source: RecoveryDataSource,
): string {
  return t(`recovery.dataSource.${source}`);
}

function previewKindLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  item: RecoveryPreviewItem,
): string {
  return t(`recovery.previewKind.${item.kind}`);
}

export function DataRecoveryDialog({
  isOpen,
  onClose,
  databases,
  persistDismiss = true,
}: DataRecoveryDialogProps): JSX.Element | null {
  const { t } = useTranslation();
  const [selectedSourcePath, setSelectedSourcePath] = useState<string | null>(
    databases[0]?.sourcePath ?? null,
  );
  const [preview, setPreview] = useState<RecoveryPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showConfirmDismiss, setShowConfirmDismiss] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCandidate = useMemo(() => {
    if (!selectedSourcePath) {
      return databases[0] ?? null;
    }
    return (
      databases.find((candidate) => candidate.sourcePath === selectedSourcePath) ??
      databases[0] ??
      null
    );
  }, [databases, selectedSourcePath]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setSelectedSourcePath(databases[0]?.sourcePath ?? null);
    setPreview(null);
    setPreviewLoading(false);
    setIsRecovering(false);
    setIsSuccess(false);
    setShowConfirmDismiss(false);
    setError(null);
  }, [isOpen, databases]);

  useEffect(() => {
    if (!isOpen || !selectedCandidate) {
      return;
    }

    let cancelled = false;
    setPreview(null);
    setError(null);

    if (!selectedCandidate.previewAvailable) {
      setPreview({
        sourcePath: selectedCandidate.sourcePath,
        previewAvailable: false,
        description:
          selectedCandidate.description ?? t("recovery.previewUnavailable"),
        items: [],
        truncated: false,
      });
      return;
    }

    setPreviewLoading(true);
    void window.electron
      ?.previewRecovery?.(selectedCandidate.sourcePath)
      .then((result) => {
        if (!cancelled) {
          setPreview(result ?? null);
        }
      })
      .catch((previewError) => {
        if (!cancelled) {
          setPreview({
            sourcePath: selectedCandidate.sourcePath,
            previewAvailable: false,
            description:
              previewError instanceof Error
                ? previewError.message
                : String(previewError),
            items: [],
            truncated: false,
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedCandidate, t]);

  if (!selectedCandidate) {
    return null;
  }

  const requestClose = (): void => {
    if (isSuccess || isRecovering) {
      return;
    }
    onClose();
  };

  const handleRecover = async (): Promise<void> => {
    setIsRecovering(true);
    setError(null);
    try {
      const result = await window.electron?.performRecovery?.(
        selectedCandidate.sourcePath,
      );
      if (result?.success) {
        setIsSuccess(true);
        setIsRecovering(false);
      } else {
        setError(result?.error || "Unknown error");
        setIsRecovering(false);
      }
    } catch (recoverError) {
      setError(
        recoverError instanceof Error ? recoverError.message : String(recoverError),
      );
      setIsRecovering(false);
    }
  };

  const handleDismiss = async (): Promise<void> => {
    if (!showConfirmDismiss) {
      setShowConfirmDismiss(true);
      return;
    }
    if (persistDismiss) {
      await window.electron?.dismissRecovery?.();
    }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={requestClose}
      title={t("recovery.title")}
      size="lg"
    >
      <div className="flex flex-col gap-5">
        {isSuccess ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
            <p className="text-sm text-foreground font-medium text-center">
              {t("recovery.success")}
            </p>
            <p className="text-xs text-muted-foreground text-center">
              {t("recovery.restarting")}
            </p>
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("recovery.description")}
            </p>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="rounded-xl border border-border bg-accent/20 p-3 flex flex-col gap-3 min-h-[20rem]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {t("recovery.sourcesTitle")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("recovery.sourcesDescription")}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {t("recovery.sourceCount", { count: databases.length })}
                  </span>
                </div>

                <div className="flex flex-col gap-2 overflow-y-auto pr-1">
                  {databases.map((candidate) => {
                    const isSelected =
                      candidate.sourcePath === selectedCandidate.sourcePath;
                    return (
                      <button
                        key={candidate.sourcePath}
                        type="button"
                        onClick={() => setSelectedSourcePath(candidate.sourcePath)}
                        className={`rounded-lg border p-3 text-left transition-colors ${
                          isSelected
                            ? "border-primary bg-primary/10"
                            : "border-border bg-background hover:bg-accent/40"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              {sourceTypeLabel(t, candidate.sourceType)}
                            </p>
                            <p className="text-xs text-muted-foreground break-all mt-1">
                              {candidate.displayPath}
                            </p>
                          </div>
                          <span className="text-[11px] rounded-full border border-border px-2 py-0.5 text-muted-foreground shrink-0">
                            {candidate.promptCount}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-foreground/70">
                          <span>{t("recovery.promptCount", { count: candidate.promptCount })}</span>
                          <span>{t("recovery.folderCount", { count: candidate.folderCount })}</span>
                          <span>{t("recovery.skillCount", { count: candidate.skillCount })}</span>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {candidate.dataSources.map((source) => (
                            <span
                              key={`${candidate.sourcePath}-${source}`}
                              className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-muted-foreground"
                            >
                              {dataSourceLabel(t, source)}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-background p-4 flex flex-col gap-4 min-h-[20rem]">
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {sourceTypeLabel(t, selectedCandidate.sourceType)}
                      </p>
                      <p className="text-xs text-muted-foreground break-all mt-1">
                        {selectedCandidate.displayPath}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                      <Clock3 className="w-3.5 h-3.5" />
                      {formatDateTime(selectedCandidate.lastModified)}
                    </div>
                  </div>

                  {selectedCandidate.description && (
                    <p className="text-xs text-muted-foreground">
                      {selectedCandidate.description}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-3 pt-1">
                    <div className="flex items-center gap-1.5 text-xs text-foreground/70">
                      <DatabaseZap className="w-3.5 h-3.5 text-primary/70" />
                      {t("recovery.promptCount", { count: selectedCandidate.promptCount })}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-foreground/70">
                      <FolderOpen className="w-3.5 h-3.5 text-primary/70" />
                      {t("recovery.folderCount", { count: selectedCandidate.folderCount })}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-foreground/70">
                      <HardDrive className="w-3.5 h-3.5 text-primary/70" />
                      {t("recovery.skillCount", { count: selectedCandidate.skillCount })}
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {t("recovery.dbSize", {
                      size: formatBytes(selectedCandidate.dbSizeBytes),
                    })}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-accent/20 p-3 flex-1 min-h-[12rem]">
                  <div className="flex items-center gap-2 mb-3">
                    <Search className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">
                      {t("recovery.previewTitle")}
                    </p>
                  </div>

                  {previewLoading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      {t("recovery.previewLoading")}
                    </div>
                  ) : preview?.previewAvailable && preview.items.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {preview.items.map((item, index) => (
                        <div
                          key={`${item.kind}-${item.id ?? item.title}-${index}`}
                          className="rounded-md border border-border bg-background px-3 py-2"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-foreground break-words">
                                {item.title}
                              </p>
                              <div className="flex flex-wrap gap-2 mt-1 text-[11px] text-muted-foreground">
                                <span>{previewKindLabel(t, item)}</span>
                                {item.subtitle && <span>{item.subtitle}</span>}
                              </div>
                            </div>
                            <span className="text-[11px] text-muted-foreground shrink-0">
                              {formatDateTime(item.updatedAt ?? null)}
                            </span>
                          </div>
                        </div>
                      ))}
                      {preview.truncated && (
                        <p className="text-[11px] text-muted-foreground">
                          {t("recovery.previewTruncated")}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {preview?.description ?? t("recovery.previewEmpty")}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive">
                  {t("recovery.failed", { error })}
                </p>
              </div>
            )}

            {showConfirmDismiss && (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                <p className="text-xs text-yellow-700 dark:text-yellow-400">
                  {t("recovery.confirmDismiss")}
                </p>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-1">
              <button
                onClick={handleDismiss}
                disabled={isRecovering}
                className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              >
                {t("recovery.dismiss")}
              </button>
              <button
                onClick={handleRecover}
                disabled={isRecovering || !selectedCandidate}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isRecovering
                  ? t("recovery.recovering")
                  : t("recovery.recoverSelected")}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
