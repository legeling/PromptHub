import { useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { ImagePreviewViewport } from "../ui/ImagePreviewViewport";
import { useGenerationLightboxControls } from "./useGenerationLightboxControls";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  ImageIcon,
  StarIcon,
  XIcon,
} from "lucide-react";
import type {
  GenerationBatchManifest,
  GenerationOutputRecord,
} from "@prompthub/shared/types";
import { useTranslation } from "react-i18next";
import { resolveLocalGenerationImageSrc } from "../../utils/media-url";

interface ImageGenerationLightboxProps {
  batch: GenerationBatchManifest;
  output: GenerationOutputRecord;
  position: number;
  total: number;
  canAttach: boolean;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onToggleFavorite: () => void;
  onDownload: () => void;
  onCopyImage: () => void;
  onAttach: () => void;
}

const actionButtonClass =
  "flex h-9 w-9 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white";

function GenerationPreview({
  batch,
  output,
}: Pick<ImageGenerationLightboxProps, "batch" | "output">): ReactElement {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <p role="status" className="m-auto text-white/80">
        {t("common.imageLoadFailed")}
      </p>
    );
  return (
    <ImagePreviewViewport
      imageSrc={`${batch.id}/${output.fileName}`}
      resolveSource={resolveLocalGenerationImageSrc}
      alt={t("generation.outputAlt", { index: output.slotIndex + 1 })}
      onError={() => setFailed(true)}
    />
  );
}

export function ImageGenerationLightbox({
  batch,
  output,
  position,
  total,
  canAttach,
  onClose,
  onPrevious,
  onNext,
  onToggleFavorite,
  onDownload,
  onCopyImage,
  onAttach,
}: ImageGenerationLightboxProps): ReactElement {
  const { t } = useTranslation();
  const dialogRef = useGenerationLightboxControls(onClose, onPrevious, onNext);

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={batch.title}
      className="fixed inset-0 z-[10000] overflow-hidden"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/90"
        onClick={onClose}
        aria-hidden="true"
        tabIndex={-1}
      />
      <div className="pointer-events-none relative z-10 flex h-full min-h-0 flex-col items-center gap-3 px-4 py-4 outline-none sm:px-8">
        <div className="pointer-events-auto flex w-full shrink-0 items-center justify-between gap-4 text-white">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{batch.title}</div>
            <div className="text-xs text-white/70">{`${position} / ${total}`}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("generation.closeLightbox")}
            title={t("generation.closeLightbox")}
            className={actionButtonClass}
          >
            <XIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="pointer-events-auto relative flex min-h-0 w-full flex-1 pb-16">
          <GenerationPreview
            key={`${batch.id}/${output.id}`}
            batch={batch}
            output={output}
          />
        </div>
        <div className="pointer-events-auto flex shrink-0 items-center gap-1.5 rounded-md border border-white/15 bg-black/40 px-2 py-1.5">
          <button
            type="button"
            onClick={onPrevious}
            aria-label={t("generation.previousImage")}
            className={actionButtonClass}
          >
            <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label={t("generation.nextImage")}
            className={actionButtonClass}
          >
            <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="mx-1 h-5 w-px bg-white/15" aria-hidden="true" />
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-label={t("generation.favorite")}
            aria-pressed={output.favorite}
            className={actionButtonClass}
          >
            <StarIcon
              className={`h-4 w-4 ${output.favorite ? "fill-current text-amber-500" : ""}`}
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            onClick={onDownload}
            aria-label={t("generation.download")}
            className={actionButtonClass}
          >
            <DownloadIcon className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onCopyImage}
            aria-label={t("generation.copyImage")}
            title={t("generation.copyImage")}
            className={actionButtonClass}
          >
            <CopyIcon className="h-4 w-4" aria-hidden="true" />
          </button>
          {canAttach && (
            <button
              type="button"
              onClick={onAttach}
              aria-label={t("prompt.addToPrompt")}
              className={actionButtonClass}
            >
              <ImageIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
