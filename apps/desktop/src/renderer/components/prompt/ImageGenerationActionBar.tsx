import {
  CopyIcon,
  DownloadIcon,
  ImageIcon,
  StarIcon,
  XIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ReactElement } from "react";

interface ImageGenerationActionBarProps {
  selectedCount: number;
  targetCount: number;
  allFavorite: boolean;
  canAttach: boolean;
  onFavorite: () => void;
  onAttach: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onClear: () => void;
}

const buttonClass =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-40";

export function ImageGenerationActionBar(
  props: ImageGenerationActionBarProps,
): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      role="toolbar"
      aria-label={t("generation.imageActions")}
      className="flex h-14 shrink-0 items-center justify-between gap-2 border-t border-border bg-card/95 px-3 sm:px-5"
    >
      <span
        className="min-w-0 truncate text-sm text-muted-foreground"
        aria-live="polite"
      >
        {props.selectedCount > 0
          ? t("generation.selectedCount", { count: props.selectedCount })
          : props.targetCount > 0
            ? t("generation.currentImage")
            : t("generation.selectedCount", { count: 0 })}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={props.onFavorite}
          disabled={props.targetCount === 0}
          aria-pressed={props.allFavorite}
          aria-label={t("generation.favorite")}
          title={t("generation.favorite")}
          className={buttonClass}
        >
          <StarIcon
            aria-hidden="true"
            className={`h-4 w-4 ${props.allFavorite ? "fill-current text-amber-500" : ""}`}
          />
        </button>
        <button
          type="button"
          onClick={props.onAttach}
          disabled={!props.canAttach}
          aria-label={t("prompt.addToPrompt")}
          title={t("prompt.addToPrompt")}
          className={buttonClass}
        >
          <ImageIcon aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={props.onCopy}
          disabled={props.targetCount !== 1}
          aria-label={t("generation.copyImage")}
          title={t(
            props.targetCount > 1
              ? "generation.selectOneToCopy"
              : "generation.copyImage",
          )}
          className={buttonClass}
        >
          <CopyIcon aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={props.onDownload}
          disabled={props.targetCount === 0}
          aria-label={t("generation.download")}
          title={t("generation.download")}
          className={buttonClass}
        >
          <DownloadIcon aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={props.onClear}
          disabled={props.selectedCount === 0}
          aria-label={t("prompt.clearSelection")}
          title={t("prompt.clearSelection")}
          className={buttonClass}
        >
          <XIcon aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
