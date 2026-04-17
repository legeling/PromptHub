import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";
import {
  DatabaseZap,
  FolderOpen,
  HardDrive,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

interface RecoverableDatabase {
  sourcePath: string;
  promptCount: number;
  folderCount: number;
  skillCount: number;
  dbSizeBytes: number;
}

interface DataRecoveryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  databases: RecoverableDatabase[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DataRecoveryDialog({
  isOpen,
  onClose,
  databases,
}: DataRecoveryDialogProps): JSX.Element | null {
  const { t } = useTranslation();
  const [isRecovering, setIsRecovering] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showConfirmDismiss, setShowConfirmDismiss] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pick the best candidate (most prompts)
  const best =
    databases.length > 0
      ? databases.reduce((a, b) => (a.promptCount >= b.promptCount ? a : b))
      : null;

  if (!best) return null;

  const requestClose = (): void => {
    if (isSuccess || isRecovering) {
      return;
    }
    void handleDismiss();
  };

  const handleRecover = async (): Promise<void> => {
    setIsRecovering(true);
    setError(null);
    try {
      const result = await window.electron?.performRecovery?.(best.sourcePath);
      if (result?.success) {
        // Show success state — main process will auto-restart the app shortly
        setIsSuccess(true);
        setIsRecovering(false);
      } else {
        setError(result?.error || "Unknown error");
        setIsRecovering(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsRecovering(false);
    }
  };

  const handleDismiss = async (): Promise<void> => {
    if (!showConfirmDismiss) {
      setShowConfirmDismiss(true);
      return;
    }
    await window.electron?.dismissRecovery?.();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={requestClose}
      title={t("recovery.title")}
      size="md"
    >
      <div className="flex flex-col gap-5">
        {/* Success state — app will restart shortly */}
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
            {/* Description */}
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("recovery.description")}
            </p>

            {/* Source info card */}
            <div className="rounded-xl border border-border bg-accent/30 p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                <span className="font-medium">{t("recovery.sourceLabel")}</span>
              </div>
              <p className="text-xs text-foreground/80 font-mono break-all pl-5.5">
                {best.sourcePath}
              </p>

              {/* Stats */}
              <div className="flex flex-wrap gap-3 mt-1 pl-5.5">
                <div className="flex items-center gap-1.5 text-xs text-foreground/70">
                  <DatabaseZap className="w-3.5 h-3.5 text-primary/70" />
                  {t("recovery.promptCount", { count: best.promptCount })}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-foreground/70">
                  <FolderOpen className="w-3.5 h-3.5 text-primary/70" />
                  {t("recovery.folderCount", { count: best.folderCount })}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-foreground/70">
                  <HardDrive className="w-3.5 h-3.5 text-primary/70" />
                  {t("recovery.skillCount", { count: best.skillCount })}
                </div>
              </div>
              <div className="text-xs text-muted-foreground pl-5.5">
                {t("recovery.dbSize", { size: formatBytes(best.dbSizeBytes) })}
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive">
                  {t("recovery.failed", { error })}
                </p>
              </div>
            )}

            {/* Confirm dismiss warning */}
            {showConfirmDismiss && (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                <p className="text-xs text-yellow-700 dark:text-yellow-400">
                  {t("recovery.confirmDismiss")}
                </p>
              </div>
            )}

            {/* Actions */}
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
                disabled={isRecovering}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isRecovering
                  ? t("recovery.recovering")
                  : t("recovery.recover")}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
