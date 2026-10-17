import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ImageIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ImagePreviewViewport } from "./ImagePreviewViewport";

interface ImagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string | null;
  imageSources?: readonly string[];
}

function buildGallerySources(
  imageSrc: string | null,
  imageSources?: readonly string[],
): string[] {
  if (!imageSrc) return [];
  const sources = imageSources?.filter(Boolean) ?? [];
  return sources.includes(imageSrc) ? sources : [imageSrc];
}

function useImageGallery(
  imageSrc: string | null,
  imageSources: readonly string[] | undefined,
  isOpen: boolean,
) {
  const sources = useMemo(
    () => buildGallerySources(imageSrc, imageSources),
    [imageSrc, imageSources],
  );
  const [selectedSrc, setSelectedSrc] = useState(imageSrc);
  const selectedIndex = sources.indexOf(selectedSrc ?? "");
  const initialIndex = sources.indexOf(imageSrc ?? "");
  const activeIndex =
    selectedIndex >= 0 ? selectedIndex : Math.max(initialIndex, 0);
  const activeSrc = sources[activeIndex] ?? imageSrc;
  const selectIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < sources.length) setSelectedSrc(sources[index]);
    },
    [sources],
  );
  useEffect(() => setSelectedSrc(imageSrc), [imageSrc, isOpen]);
  return { activeIndex, activeSrc, selectIndex, sources };
}

function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [locked]);
}

function usePreviewFocus(enabled: boolean) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!enabled || !dialog) return;
    const trigger = document.activeElement;
    dialog.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const buttons = dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    dialog.addEventListener('keydown', trapFocus);
    return () => {
      dialog.removeEventListener('keydown', trapFocus);
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [enabled]);
  return dialogRef;
}

function useGalleryKeyboard({
  activeIndex,
  enabled,
  onClose,
  selectIndex,
}: {
  activeIndex: number;
  enabled: boolean;
  onClose: () => void;
  selectIndex: (index: number) => void;
}) {
  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!["Escape", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      // Capture preview shortcuts before the underlying editor's document
      // listener can close or navigate its own modal.
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") selectIndex(activeIndex - 1);
      if (event.key === "ArrowRight") selectIndex(activeIndex + 1);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [activeIndex, enabled, onClose, selectIndex]);
}

function GalleryButton({
  direction,
  disabled,
  label,
  onClick,
}: {
  direction: "previous" | "next";
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  const Icon = direction === "previous" ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`absolute top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur-sm transition-colors duration-quick hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-default disabled:opacity-25 disabled:hover:bg-black/55 ${direction === "previous" ? "left-3 sm:left-6" : "right-3 sm:right-6"}`}
    >
      <Icon aria-hidden="true" className="h-6 w-6" />
    </button>
  );
}

function GalleryControls({
  activeIndex,
  positionLabel,
  previousLabel,
  nextLabel,
  selectIndex,
  total,
}: {
  activeIndex: number;
  positionLabel: string;
  previousLabel: string;
  nextLabel: string;
  selectIndex: (index: number) => void;
  total: number;
}) {
  return (
    <>
      <div
        aria-live="polite"
        className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-white/15 bg-black/55 px-3 py-1.5 text-sm font-medium text-white shadow-lg backdrop-blur-sm sm:top-5"
      >
        {positionLabel}
      </div>
      <GalleryButton
        direction="previous"
        disabled={activeIndex === 0}
        label={previousLabel}
        onClick={() => selectIndex(activeIndex - 1)}
      />
      <GalleryButton
        direction="next"
        disabled={activeIndex === total - 1}
        label={nextLabel}
        onClick={() => selectIndex(activeIndex + 1)}
      />
    </>
  );
}

function PreviewContent({
  activeSrc,
  imageError,
  onError,
}: {
  activeSrc: string;
  imageError: boolean;
  onError: () => void;
}) {
  const { t } = useTranslation();
  if (imageError) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg bg-white/10 p-12 text-white/70">
        <ImageIcon aria-hidden="true" className="mb-4 h-16 w-16 opacity-50" />
        <p className="text-sm">{t("common.imageLoadFailed")}</p>
      </div>
    );
  }
  return (
    <ImagePreviewViewport key={activeSrc} imageSrc={activeSrc} onError={onError} />
  );
}

function ClosePreviewButton({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={t("common.close", "Close")}
      className="absolute right-3 top-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white transition-colors duration-quick hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:right-5 sm:top-5"
    >
      <XIcon aria-hidden="true" className="h-6 w-6" />
    </button>
  );
}

export function ImagePreviewModal({
  isOpen,
  onClose,
  imageSrc,
  imageSources,
}: ImagePreviewModalProps) {
  const { t } = useTranslation();
  const gallery = useImageGallery(imageSrc, imageSources, isOpen);
  const [imageError, setImageError] = useState(false);
  const enabled = isOpen && Boolean(gallery.activeSrc);
  const dialogRef = usePreviewFocus(enabled);
  useBodyScrollLock(enabled);
  useGalleryKeyboard({
    activeIndex: gallery.activeIndex,
    enabled,
    onClose,
    selectIndex: gallery.selectIndex,
  });
  useEffect(() => setImageError(false), [gallery.activeSrc]);
  if (!enabled || !gallery.activeSrc) return null;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("prompt.preview")}
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 px-16 py-14 backdrop-blur-sm animate-in fade-in duration-base sm:px-24"
    >
      <ClosePreviewButton onClose={onClose} />
      {gallery.sources.length > 1 ? (
        <GalleryControls
          activeIndex={gallery.activeIndex}
          positionLabel={t("prompt.imagePosition", {
            current: gallery.activeIndex + 1,
            total: gallery.sources.length,
            defaultValue: "Image {{current}} of {{total}}",
          })}
          previousLabel={t("prompt.previousImage", "Previous image")}
          nextLabel={t("prompt.nextImage", "Next image")}
          selectIndex={gallery.selectIndex}
          total={gallery.sources.length}
        />
      ) : null}
      <div className="flex h-full w-full min-h-0 min-w-0 items-center justify-center outline-none">
        <PreviewContent
          activeSrc={gallery.activeSrc}
          imageError={imageError}
          onError={() => setImageError(true)}
        />
      </div>
      <div
        data-testid="image-preview-backdrop"
        role="presentation"
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        onClick={onClose}
      />
    </div>,
    document.body,
  );
}
