import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { useToast } from "../components/ui/Toast";
import {
  BACKUP_IMPORT_ACCEPT,
  formatBackupImportError,
  pickSupportedBackupFile,
  previewImportFile,
  restoreFromFile,
  type ImportPreviewSummary,
} from "../services/database-backup";
import { hasAnySkipped } from "../services/database-backup-format";
import { createUpgradeBackup } from "../services/upgrade-backup";
import { isWebRuntime } from "../runtime";

export interface BackupImportPreviewState {
  file: File;
  summary: ImportPreviewSummary;
}

export function formatImportSkippedDetails(
  skipped: ImportPreviewSummary["skipped"],
): string {
  return [
    skipped.prompts > 0 ? `prompts: ${skipped.prompts}` : null,
    skipped.folders > 0 ? `folders: ${skipped.folders}` : null,
    skipped.versions > 0 ? `versions: ${skipped.versions}` : null,
    skipped.outputFormatItems > 0
      ? `output format items: ${skipped.outputFormatItems}`
      : null,
    skipped.rules > 0 ? `rules: ${skipped.rules}` : null,
    skipped.skills > 0 ? `skills: ${skipped.skills}` : null,
    skipped.skillVersions > 0 ? `skill versions: ${skipped.skillVersions}` : null,
    skipped.skillFiles > 0 ? `skill files: ${skipped.skillFiles}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(", ");
}

export function useBackupImportController() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [importPreview, setImportPreview] =
    useState<BackupImportPreviewState | null>(null);
  const [confirmingImport, setConfirmingImport] = useState(false);

  const beginImportFromFile = useCallback(
    async (file: File) => {
      try {
        const preview = await previewImportFile(file);
        setImportPreview({ file, summary: preview.summary });
      } catch (error) {
        console.error("Import failed:", error);
        showToast(`${t("toast.importFailed")}: ${formatBackupImportError(error)}`, "error");
      }
    },
    [showToast, t],
  );

  const requestFileSelection = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = BACKUP_IMPORT_ACCEPT;
    input.onchange = (event) => {
      const file = pickSupportedBackupFile(
        (event.target as HTMLInputElement).files ?? [],
      );
      if (file) {
        void beginImportFromFile(file);
      }
    };
    input.click();
  }, [beginImportFromFile]);

  const closeImportPreview = useCallback(() => {
    if (confirmingImport) {
      return;
    }
    setImportPreview(null);
  }, [confirmingImport]);

  const confirmImport = useCallback(async () => {
    if (!importPreview) {
      return;
    }

    setConfirmingImport(true);
    try {
      if (!isWebRuntime()) {
        const currentVersion = await window.electron?.updater?.getVersion?.();
        await createUpgradeBackup({
          fromVersion: currentVersion || undefined,
          toVersion: currentVersion || undefined,
        });
      }

      const skipped = await restoreFromFile(importPreview.file);
      if (hasAnySkipped(skipped)) {
        showToast(
          t("toast.importPartialSuccess", {
            details: formatImportSkippedDetails(skipped),
          }),
          "success",
        );
      } else {
        showToast(t("toast.importSuccess"), "success");
      }

      setImportPreview(null);
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error("Import failed:", error);
      showToast(`${t("toast.importFailed")}: ${formatBackupImportError(error)}`, "error");
    } finally {
      setConfirmingImport(false);
    }
  }, [importPreview, showToast, t]);

  return {
    importPreview,
    confirmingImport,
    beginImportFromFile,
    requestFileSelection,
    closeImportPreview,
    confirmImport,
  };
}
