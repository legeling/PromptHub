import { MinusIcon, PlusIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactElement,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import { resolveLocalImageSrc } from "../../utils/media-url";

const ZOOM_LEVELS = [
  { percent: 25, size: "w-1/4 h-1/4" },
  { percent: 50, size: "w-1/2 h-1/2" },
  { percent: 75, size: "w-3/4 h-3/4" },
  { percent: 100, size: "w-full h-full" },
  { percent: 125, size: "w-[125%] h-[125%]" },
  { percent: 150, size: "w-[150%] h-[150%]" },
  { percent: 200, size: "w-[200%] h-[200%]" },
  { percent: 300, size: "w-[300%] h-[300%]" },
  { percent: 400, size: "w-[400%] h-[400%]" },
];
const FIT_INDEX = 3;

function useZoomCenter(
  viewportRef: RefObject<HTMLDivElement>,
  index: number,
): void {
  const previousPercent = useRef(ZOOM_LEVELS[index].percent);
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const percent = ZOOM_LEVELS[index].percent;
    if (viewport) {
      const ratio = percent / previousPercent.current;
      viewport.scrollLeft =
        (viewport.scrollLeft + viewport.clientWidth / 2) * ratio -
        viewport.clientWidth / 2;
      viewport.scrollTop =
        (viewport.scrollTop + viewport.clientHeight / 2) * ratio -
        viewport.clientHeight / 2;
    }
    previousPercent.current = percent;
  }, [index, viewportRef]);
}

function useImagePan(enabled: boolean) {
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!enabled || event.button !== 0) return;
    event.preventDefault();
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: event.currentTarget.scrollLeft,
      top: event.currentTarget.scrollTop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    event.currentTarget.scrollLeft = start.left + start.x - event.clientX;
    event.currentTarget.scrollTop = start.top + start.y - event.clientY;
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  };
}

function ZoomControls({
  index,
  onStep,
  onReset,
}: {
  index: number;
  onStep: (step: number) => void;
  onReset: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const buttonClass =
    "inline-flex h-10 min-w-10 items-center justify-center rounded-lg px-2 text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40";
  return (
    <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-border bg-popover p-1 shadow-lg">
      <button
        type="button"
        aria-label={t("common.zoomOut")}
        title={t("common.zoomOut")}
        disabled={index === 0}
        onClick={() => onStep(-1)}
        className={buttonClass}
      >
        <MinusIcon aria-hidden="true" className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label={t("common.resetZoom")}
        title={t("common.resetZoom")}
        onClick={onReset}
        className={`${buttonClass} min-w-16 tabular-nums`}
      >
        <span aria-live="polite">{ZOOM_LEVELS[index].percent}%</span>
      </button>
      <button
        type="button"
        aria-label={t("common.zoomIn")}
        title={t("common.zoomIn")}
        disabled={index === ZOOM_LEVELS.length - 1}
        onClick={() => onStep(1)}
        className={buttonClass}
      >
        <PlusIcon aria-hidden="true" className="h-5 w-5" />
      </button>
    </div>
  );
}

export function ImagePreviewViewport({
  imageSrc,
  onError,
  alt,
  resolveSource = resolveLocalImageSrc,
}: {
  imageSrc: string;
  onError: () => void;
  alt?: string;
  resolveSource?: (src: string) => string;
}): ReactElement {
  const { t } = useTranslation();
  const [index, setIndex] = useState(FIT_INDEX);
  const viewportRef = useRef<HTMLDivElement>(null);
  useZoomCenter(viewportRef, index);
  const stepZoom = useCallback((step: number) => {
    setIndex((current) =>
      Math.max(0, Math.min(ZOOM_LEVELS.length - 1, current + step)),
    );
  }, []);
  const pan = useImagePan(index > FIT_INDEX);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return;
      event.preventDefault();
      event.stopPropagation();
      stepZoom(event.deltaY < 0 ? 1 : -1);
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [stepZoom]);
  return (
    <>
      <div
        ref={viewportRef}
        {...pan}
        className={`flex h-full w-full overflow-auto overscroll-contain touch-none ${index > FIT_INDEX ? "cursor-grab active:cursor-grabbing" : ""}`}
      >
        <div className={`m-auto shrink-0 ${ZOOM_LEVELS[index].size}`}>
          <img
            src={resolveSource(imageSrc)}
            alt={alt ?? t("prompt.preview")}
            draggable={false}
            onError={onError}
            className="h-full w-full select-none object-contain"
          />
        </div>
      </div>
      <ZoomControls
        index={index}
        onStep={stepZoom}
        onReset={() => {
          setIndex(FIT_INDEX);
          if (viewportRef.current) {
            viewportRef.current.scrollLeft = 0;
            viewportRef.current.scrollTop = 0;
          }
        }}
      />
    </>
  );
}
