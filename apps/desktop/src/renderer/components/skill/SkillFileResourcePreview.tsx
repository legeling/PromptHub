import { useEffect, type WheelEvent } from "react";
import { createPortal } from "react-dom";
import {
  FileIcon,
  Maximize2Icon,
  MinusIcon,
  MusicIcon,
  PlusIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import {
  MAX_RESOURCE_ZOOM,
  MIN_RESOURCE_ZOOM,
  type FileEntry,
} from "./skill-file-editor-utils";

import { useResourceImagePan } from "./use-resource-image-pan";

type ResourceImageMode = "inline" | "fullscreen";

interface ImageZoomControlsProps {
  imageZoom: number;
  mode: ResourceImageMode;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onOpenFullscreen?: () => void;
  zoomOutLabel: string;
  zoomInLabel: string;
  resetZoomLabel: string;
  fullscreenLabel: string;
}

interface ImageResourceCanvasProps extends Omit<
  ImageZoomControlsProps,
  "mode"
> {
  file: FileEntry;
  mode?: ResourceImageMode;
  onImageWheelZoom: (event: WheelEvent<HTMLDivElement>) => void;
}

function ImageZoomControls({
  imageZoom,
  mode,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onOpenFullscreen,
  zoomOutLabel,
  zoomInLabel,
  resetZoomLabel,
  fullscreenLabel,
}: ImageZoomControlsProps) {
  const isFullscreenMode = mode === "fullscreen";
  const centerLabel = isFullscreenMode ? resetZoomLabel : fullscreenLabel;

  return (
    <div className="skill-file-editor__zoom-controls">
      <button
        className="skill-file-editor__editor-tab skill-file-editor__editor-tab--icon"
        type="button"
        onClick={onZoomOut}
        disabled={imageZoom <= MIN_RESOURCE_ZOOM}
        title={zoomOutLabel}
        aria-label={zoomOutLabel}
      >
        <MinusIcon
          aria-hidden="true"
          style={{ width: "0.875rem", height: "0.875rem" }}
        />
      </button>
      <button
        className="skill-file-editor__editor-tab"
        type="button"
        onClick={isFullscreenMode ? onResetZoom : onOpenFullscreen}
        disabled={!isFullscreenMode && !onOpenFullscreen}
        title={centerLabel}
        aria-label={centerLabel}
      >
        {isFullscreenMode ? (
          <RotateCcwIcon
            aria-hidden="true"
            style={{ width: "0.875rem", height: "0.875rem" }}
          />
        ) : (
          <Maximize2Icon
            aria-hidden="true"
            style={{ width: "0.875rem", height: "0.875rem" }}
          />
        )}
        <span>{Math.round(imageZoom * 100)}%</span>
      </button>
      <button
        className="skill-file-editor__editor-tab skill-file-editor__editor-tab--icon"
        type="button"
        onClick={onZoomIn}
        disabled={imageZoom >= MAX_RESOURCE_ZOOM}
        title={zoomInLabel}
        aria-label={zoomInLabel}
      >
        <PlusIcon
          aria-hidden="true"
          style={{ width: "0.875rem", height: "0.875rem" }}
        />
      </button>
    </div>
  );
}

function ImageResourceCanvas({
  file,
  imageZoom,
  onImageWheelZoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onOpenFullscreen,
  zoomOutLabel,
  zoomInLabel,
  resetZoomLabel,
  fullscreenLabel,
  mode = "inline",
}: ImageResourceCanvasProps) {
  const pan = useResourceImagePan(file.content);
  const resetView = () => {
    pan.reset();
    onResetZoom();
  };

  return (
    <div
      className={`skill-file-editor__resource-preview skill-file-editor__resource-preview--image skill-file-editor__resource-preview--image-${mode}`}
      onWheel={onImageWheelZoom}
    >
      <div
        className={`skill-file-editor__resource-image-viewport !items-center !justify-center !overflow-hidden touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary${
          pan.isPanning
            ? " skill-file-editor__resource-image-viewport--panning"
            : ""
        }`}
        {...pan.handlers}
        tabIndex={0}
        role="region"
        aria-label={file.path}
        onDoubleClick={resetView}
      >
        <div
          ref={pan.stageRef}
          className="skill-file-editor__resource-image-stage"
          style={{
            width: `${imageZoom * 100}%`,
            height: `${imageZoom * 100}%`,
          }}
        >
          <img
            draggable={false}
            src={file.content}
            alt={file.path}
            className="skill-file-editor__resource-image"
          />
        </div>
      </div>
      <ImageZoomControls
        imageZoom={imageZoom}
        mode={mode}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onResetZoom={resetView}
        onOpenFullscreen={onOpenFullscreen}
        zoomOutLabel={zoomOutLabel}
        zoomInLabel={zoomInLabel}
        resetZoomLabel={resetZoomLabel}
        fullscreenLabel={fullscreenLabel}
      />
    </div>
  );
}

export function ResourceImageFullscreenPreview({
  file,
  isOpen,
  imageZoom,
  onClose,
  onImageWheelZoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  zoomOutLabel,
  zoomInLabel,
  resetZoomLabel,
  fullscreenLabel,
  closeLabel,
}: {
  file: FileEntry | null;
  isOpen: boolean;
  imageZoom: number;
  onClose: () => void;
  onImageWheelZoom: (event: WheelEvent<HTMLDivElement>) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  zoomOutLabel: string;
  zoomInLabel: string;
  resetZoomLabel: string;
  fullscreenLabel: string;
  closeLabel: string;
}) {
  useEffect(() => {
    if (!isOpen || !file) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [file, isOpen, onClose]);

  if (!isOpen || !file) return null;

  return createPortal(
    <div
      className="skill-file-editor__fullscreen-preview"
      role="dialog"
      aria-modal="true"
      aria-label={fullscreenLabel}
    >
      <div className="skill-file-editor__fullscreen-preview-header">
        <span className="skill-file-editor__fullscreen-preview-title">
          {file.path}
        </span>
        <button
          className="skill-file-editor__fullscreen-preview-close"
          type="button"
          onClick={onClose}
          title={closeLabel}
          aria-label={closeLabel}
        >
          <XIcon aria-hidden="true" style={{ width: "1rem", height: "1rem" }} />
        </button>
      </div>
      <ImageResourceCanvas
        key={file.path}
        file={file}
        imageZoom={imageZoom}
        onImageWheelZoom={onImageWheelZoom}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onResetZoom={onResetZoom}
        zoomOutLabel={zoomOutLabel}
        zoomInLabel={zoomInLabel}
        resetZoomLabel={resetZoomLabel}
        fullscreenLabel={fullscreenLabel}
        mode="fullscreen"
      />
    </div>,
    document.body,
  );
}

export function ResourcePreview({
  file,
  emptyLabel,
  imageZoom,
  onImageWheelZoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onOpenFullscreen,
  zoomOutLabel,
  zoomInLabel,
  resetZoomLabel,
  fullscreenLabel,
}: {
  file: FileEntry;
  emptyLabel: string;
  imageZoom: number;
  onImageWheelZoom: (event: WheelEvent<HTMLDivElement>) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onOpenFullscreen: () => void;
  zoomOutLabel: string;
  zoomInLabel: string;
  resetZoomLabel: string;
  fullscreenLabel: string;
}) {
  if (file.encoding !== "data-url" || !file.previewKind) {
    return (
      <div className="skill-file-editor__resource-preview skill-file-editor__resource-preview--empty">
        <FileIcon style={{ width: "2rem", height: "2rem" }} />
        <span>{emptyLabel}</span>
      </div>
    );
  }

  if (file.previewKind === "image") {
    return (
      <ImageResourceCanvas
        key={file.path}
        file={file}
        imageZoom={imageZoom}
        onImageWheelZoom={onImageWheelZoom}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onResetZoom={onResetZoom}
        onOpenFullscreen={onOpenFullscreen}
        zoomOutLabel={zoomOutLabel}
        zoomInLabel={zoomInLabel}
        resetZoomLabel={resetZoomLabel}
        fullscreenLabel={fullscreenLabel}
      />
    );
  }

  if (file.previewKind === "audio") {
    return (
      <div className="skill-file-editor__resource-preview skill-file-editor__resource-preview--media">
        <MusicIcon style={{ width: "2rem", height: "2rem" }} />
        <audio
          controls
          src={file.content}
          className="skill-file-editor__resource-audio"
        />
      </div>
    );
  }

  if (file.previewKind === "video") {
    return (
      <div className="skill-file-editor__resource-preview">
        <video
          controls
          src={file.content}
          className="skill-file-editor__resource-video"
        />
      </div>
    );
  }

  return (
    <div className="skill-file-editor__resource-preview">
      <iframe
        src={file.content}
        title={file.path}
        className="skill-file-editor__resource-pdf"
      />
    </div>
  );
}
