import { useMemo, useState } from "react";
import { GripVerticalIcon, ImagesIcon, UploadIcon, XIcon } from "lucide-react";
import type {
  GenerationReferenceImage,
  PromptSummary,
} from "@prompthub/shared/types";
import { useTranslation } from "react-i18next";
import {
  resolveLocalGenerationImageSrc,
  resolveLocalImageSrc,
} from "../../utils/media-url";

interface ImageGenerationReferencePickerProps {
  prompts: PromptSummary[];
  references: GenerationReferenceImage[];
  onAddLocalImages: () => Promise<void>;
  onDropLocalImages: (files: File[]) => Promise<void>;
  onAddPromptImage: (reference: GenerationReferenceImage) => void;
  onRemove: (index: number) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
}

const SUPPORTED_REFERENCE_FILE_PATTERN = /\.(?:jpe?g|png|webp)$/iu;
const PROMPT_MEDIA_PAGE_SIZE = 24;

function referenceKey(reference: GenerationReferenceImage): string {
  return `${reference.source}:${reference.promptId ?? ""}:${reference.batchId ?? ""}:${reference.outputId ?? ""}:${reference.fileName}`;
}

function resolveReferencePreview(reference: GenerationReferenceImage): string {
  if (reference.source === "generation" && reference.batchId) {
    return resolveLocalGenerationImageSrc(
      `${reference.batchId}/${reference.fileName}`,
    );
  }
  return resolveLocalImageSrc(reference.fileName);
}

export function ImageGenerationReferencePicker({
  prompts,
  references,
  onAddLocalImages,
  onDropLocalImages,
  onAddPromptImage,
  onRemove,
  onMove,
}: ImageGenerationReferencePickerProps) {
  const { t } = useTranslation();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [visiblePromptImageCount, setVisiblePromptImageCount] = useState(
    PROMPT_MEDIA_PAGE_SIZE,
  );
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const selectedFileNames = new Set(
    references.map((reference) => reference.fileName),
  );
  const promptImages = useMemo(
    () =>
      prompts.flatMap((prompt) =>
        (prompt.images ?? [])
          .filter((fileName) => SUPPORTED_REFERENCE_FILE_PATTERN.test(fileName))
          .map((fileName) => ({
            fileName,
            promptId: prompt.id,
            promptTitle: prompt.title,
          })),
      ),
    [prompts],
  );
  const visiblePromptImages = promptImages.slice(0, visiblePromptImageCount);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {t("generation.referenceCount", {
            count: references.length,
          })}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setLibraryOpen((value) => !value)}
            disabled={promptImages.length === 0}
            aria-expanded={libraryOpen}
            className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ImagesIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {t("generation.choosePromptReferences")}
          </button>
        </div>
      </div>

      <button
        type="button"
        data-testid="generation-reference-dropzone"
        aria-label={t("generation.addLocalReferences")}
        onClick={() => void onAddLocalImages()}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(event) => {
          event.preventDefault();
          void onDropLocalImages(Array.from(event.dataTransfer.files));
        }}
        className="group flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/10 px-4 py-4 text-center transition-colors hover:border-primary/45 hover:bg-primary/[0.03] disabled:cursor-not-allowed disabled:opacity-55"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
          <UploadIcon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="text-xs font-medium text-foreground">
          {t("generation.dropReferenceImages")}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {t("generation.addLocalReferences")}
        </span>
      </button>

      {references.length > 0 && (
        <div role="list" className="grid grid-cols-2 gap-2">
          {references.map((reference, index) => (
            <div
              key={referenceKey(reference)}
              role="listitem"
              aria-label={t("generation.referenceItem", {
                index: index + 1,
                name: reference.fileName,
              })}
              draggable
              onDragStart={() => setDraggedIndex(index)}
              onDragEnd={() => setDraggedIndex(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (draggedIndex !== null && draggedIndex !== index) {
                  onMove(draggedIndex, index);
                }
                setDraggedIndex(null);
              }}
              className="group relative flex min-w-0 items-center gap-2 rounded-md border border-border bg-background p-1.5"
            >
              <GripVerticalIcon
                className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground"
                aria-hidden="true"
              />
              <img
                src={resolveReferencePreview(reference)}
                alt=""
                className="h-10 w-10 shrink-0 rounded object-cover"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-medium">
                  {reference.fileName}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {reference.source === "generation"
                    ? t("generation.referenceSourceGeneration")
                    : reference.source === "prompt"
                      ? (prompts.find(
                          (prompt) => prompt.id === reference.promptId,
                        )?.title ?? t("generation.referenceSourcePrompt"))
                      : t("generation.referenceSourceLocal")}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onRemove(index)}
                aria-label={t("generation.removeReference", {
                  name: reference.fileName,
                })}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      {libraryOpen && (
        <div className="max-h-48 overflow-y-auto border-t border-border pt-3">
          <div className="grid grid-cols-3 gap-2">
            {visiblePromptImages.map((image) => {
              const reference: GenerationReferenceImage = {
                source: "prompt",
                fileName: image.fileName,
                promptId: image.promptId,
              };
              const selected = selectedFileNames.has(reference.fileName);
              return (
                <button
                  type="button"
                  key={`${image.promptId}:${image.fileName}`}
                  onClick={() => onAddPromptImage(reference)}
                  disabled={selected}
                  aria-label={t("generation.selectPromptReference", {
                    name: image.fileName,
                    prompt: image.promptTitle,
                  })}
                  aria-pressed={selected}
                  className="relative aspect-square overflow-hidden rounded-md border border-border disabled:opacity-45"
                >
                  <img
                    src={resolveLocalImageSrc(image.fileName)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-background/90 px-1 py-0.5 text-[9px]">
                    {image.promptTitle}
                  </span>
                </button>
              );
            })}
          </div>
          {visiblePromptImageCount < promptImages.length && (
            <button
              type="button"
              onClick={() =>
                setVisiblePromptImageCount((count) =>
                  Math.min(count + PROMPT_MEDIA_PAGE_SIZE, promptImages.length),
                )
              }
              className="mt-2 h-8 w-full rounded-md border border-border text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {t("generation.showMorePromptReferences")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
