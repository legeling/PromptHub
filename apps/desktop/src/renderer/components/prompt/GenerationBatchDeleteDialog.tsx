import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GenerationBatchManifest } from "@prompthub/shared/types";
import { deleteGenerationBatch } from "../../services/generation-workbench-runner";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";

interface Props {
  batch: GenerationBatchManifest;
  onClose: () => void;
  onDeleted: (batchId: string) => void;
}

export function GenerationBatchDeleteDialog({
  batch,
  onClose,
  onDeleted,
}: Props) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const confirm = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setFailed(false);
    try {
      const result = await deleteGenerationBatch(batch.id);
      onDeleted(batch.id);
      showToast(
        t(
          result.cleanupPending
            ? "generation.deleteCleanupPending"
            : "generation.batchDeleted",
        ),
        result.cleanupPending ? "warning" : "success",
      );
      onClose();
    } catch (error) {
      console.error("Failed to delete generation batch:", error);
      setFailed(true);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };
  return (
    <ConfirmDialog
      isOpen
      title={t("generation.deleteBatch")}
      message={
        <>
          <p>
            {t(
              batch.slots.some((slot) => slot.output)
                ? "generation.deleteBatchWithFiles"
                : "generation.deleteBatchConfirm",
              {
                title: batch.title,
                count: batch.slots.filter((slot) => slot.output).length,
              },
            )}
          </p>
          {failed && (
            <p role="alert" className="mt-3 text-destructive">
              {t("generation.deleteBatchFailed")}
            </p>
          )}
        </>
      }
      confirmText={t("generation.deleteBatch")}
      variant="destructive"
      isLoading={pending}
      onClose={onClose}
      onConfirm={() => void confirm()}
    />
  );
}
