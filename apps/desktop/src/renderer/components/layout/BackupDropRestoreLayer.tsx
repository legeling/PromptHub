import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArchiveIcon } from "lucide-react";

import { pickSupportedBackupFile } from "../../services/database-backup";
import type { useBackupImportController } from "../../hooks/useBackupImportController";
import { isWebRuntime } from "../../runtime";

type BackupImportController = ReturnType<typeof useBackupImportController>;

interface BackupDropRestoreLayerProps {
  controller: BackupImportController;
}

/**
 * Window-level drop zone: dragging a PromptHub backup archive anywhere onto
 * the app window previews it and opens the shared restore confirmation
 * dialog. Restore itself reuses the backup import controller so the global
 * drop path and the settings-page drop path behave identically.
 */
export function BackupDropRestoreLayer({
  controller,
}: BackupDropRestoreLayerProps) {
  const { t } = useTranslation();
  const [isDraggingBackup, setIsDraggingBackup] = useState(false);
  const dragCounterRef = useRef(0);
  const beginImportFromFile = controller.beginImportFromFile;
  const previewOpenRef = useRef(controller.importPreview !== null);
  previewOpenRef.current = controller.importPreview !== null;

  useEffect(() => {
    if (isWebRuntime()) {
      return;
    }

    const hasBackupFile = (dataTransfer: DataTransfer | null): boolean =>
      !!dataTransfer && pickSupportedBackupFile(dataTransfer.files) !== null;

    // Only file-system drags may enter the global backup-restore contract.
    // Application-internal drags (prompt hierarchy MIME / text-only) must stay
    // transparent: a blanket `dropEffect = "copy"` conflicts with their
    // `effectAllowed = "move"` and Chromium shows no-drop 🚫 and never fires drop.
    const hasFilePayload = (dataTransfer: DataTransfer | null): boolean => {
      if (!dataTransfer) {
        return false;
      }
      if (dataTransfer.files && dataTransfer.files.length > 0) {
        return true;
      }
      if (
        dataTransfer.items &&
        Array.from(dataTransfer.items).some((item) => item.kind === "file")
      ) {
        return true;
      }
      return (
        !!dataTransfer.types && Array.from(dataTransfer.types).includes("Files")
      );
    };

    const handleDragEnter = (event: globalThis.DragEvent) => {
      if (!hasFilePayload(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      dragCounterRef.current += 1;
      if (hasBackupFile(event.dataTransfer) && !previewOpenRef.current) {
        setIsDraggingBackup(true);
      }
    };

    const handleDragOver = (event: globalThis.DragEvent) => {
      if (!hasFilePayload(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
    };

    const handleDragLeave = (event: globalThis.DragEvent) => {
      if (!hasFilePayload(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDraggingBackup(false);
      }
    };

    const handleDrop = async (event: globalThis.DragEvent) => {
      if (!hasFilePayload(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      dragCounterRef.current = 0;
      setIsDraggingBackup(false);

      const file = event.dataTransfer
        ? pickSupportedBackupFile(event.dataTransfer.files)
        : null;
      if (file && !previewOpenRef.current) {
        await beginImportFromFile(file);
      }
    };

    document.addEventListener("dragenter", handleDragEnter);
    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("dragleave", handleDragLeave);
    document.addEventListener("drop", handleDrop);

    return () => {
      document.removeEventListener("dragenter", handleDragEnter);
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("dragleave", handleDragLeave);
      document.removeEventListener("drop", handleDrop);
    };
  }, [beginImportFromFile]);

  if (!isDraggingBackup) {
    return null;
  }

  return (
    <div
      data-testid="backup-drop-overlay"
      className="fixed inset-0 z-[9999] m-4 flex items-center justify-center rounded-2xl border-4 border-dashed border-primary bg-primary/20 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-4 rounded-xl bg-background/90 p-8 shadow-lg">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <ArchiveIcon className="h-8 w-8 text-primary" aria-hidden="true" />
        </div>
        <div className="text-lg font-semibold">
          {t("app.dropToRestore", "Drop to restore backup")}
        </div>
        <div className="text-sm text-muted-foreground">
          {t(
            "app.dropToRestoreHint",
            "This opens the restore review and will overwrite existing data.",
          )}
        </div>
      </div>
    </div>
  );
}
