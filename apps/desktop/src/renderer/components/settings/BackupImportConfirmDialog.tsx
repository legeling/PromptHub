import { useTranslation } from "react-i18next";

import { hasAnySkipped } from "../../services/database-backup-format";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import {
  formatImportSkippedDetails,
  type BackupImportPreviewState,
} from "../../hooks/useBackupImportController";

interface BackupImportConfirmDialogProps {
  importPreview: BackupImportPreviewState | null;
  confirmingImport: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function BackupImportConfirmDialog({
  importPreview,
  confirmingImport,
  onClose,
  onConfirm,
}: BackupImportConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <ConfirmDialog
      isOpen={importPreview !== null}
      onClose={onClose}
      onConfirm={onConfirm}
      title={t("settings.importPreviewTitle", "Review import summary")}
      message={
        importPreview ? (
          <div className="space-y-2 text-left">
            <p>
              {t("settings.importPreviewFile", "File")}: {importPreview.file.name}
            </p>
            <p>
              {t("settings.importPreviewExportedAt", "Exported at")}: {new Date(
                importPreview.summary.exportedAt,
              ).toLocaleString()}
            </p>
            <p>
              {t("settings.importPreviewCounts", "Will import")}: {importPreview.summary.counts.prompts} prompts, {importPreview.summary.counts.folders} folders, {importPreview.summary.counts.versions} versions, {importPreview.summary.counts.outputFormatItems} output format items, {importPreview.summary.counts.rules} rules, {importPreview.summary.counts.skills} skills
            </p>
            <p>
              {t(
                "settings.importPreviewBackupNotice",
                "PromptHub will automatically create a local safety backup of your current state before importing.",
              )}
            </p>
            {hasAnySkipped(importPreview.summary.skipped) ? (
              <p>
                {t("settings.importPreviewSkipped", "Invalid records that will be skipped")}: {formatImportSkippedDetails(importPreview.summary.skipped)}
              </p>
            ) : null}
          </div>
        ) : (
          ""
        )
      }
      confirmText={t(
        "settings.importConfirmAction",
        "Back up current data and import",
      )}
      cancelText={t("common.cancel", "Cancel")}
      variant="destructive"
      isLoading={confirmingImport}
    />
  );
}
