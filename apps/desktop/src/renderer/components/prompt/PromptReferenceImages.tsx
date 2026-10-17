import { XIcon } from "lucide-react";
import { useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { ImagePreviewModal } from "../ui/ImagePreviewModal";
import { resolveLocalImageSrc } from "../../utils/media-url";

interface PromptReferenceImagesProps {
  images: readonly string[];
  onRemove: (index: number) => void;
}

export function PromptReferenceImages({
  images,
  onRemove,
}: PromptReferenceImagesProps): ReactElement {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<string | null>(null);
  return (
    <>
      {images.map((image, index) => (
        <div
          key={`${image}-${index}`}
          className="group relative h-24 w-24 overflow-hidden rounded-lg border border-border"
        >
          <button
            type="button"
            onClick={() => setPreview(image)}
            aria-label={t("prompt.previewReferenceImage", { index: index + 1 })}
            className="h-full w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          >
            <img
              src={resolveLocalImageSrc(image)}
              alt={`preview-${index}`}
              className="h-full w-full object-cover"
            />
          </button>
          <button
            type="button"
            onClick={() => onRemove(index)}
            aria-label={t("prompt.removeReferenceImage", { index: index + 1 })}
            className="absolute right-1 top-1 rounded-full border border-border bg-popover p-1 text-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <XIcon className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      ))}
      <ImagePreviewModal
        isOpen={preview !== null && images.includes(preview)}
        imageSrc={preview}
        imageSources={images}
        onClose={() => setPreview(null)}
      />
    </>
  );
}
