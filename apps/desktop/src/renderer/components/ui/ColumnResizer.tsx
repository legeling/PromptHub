/**
 * ColumnResizer — a vertical drag handle that lets the user adjust the
 * width of the column to its left (pane layouts where the next sibling
 * expands to fill remaining space).
 *
 * Designed for issue #119: users on large displays wanted to be able to
 * expand the folder sidebar and prompt list beyond their fixed defaults.
 *
 * Behavior:
 *   - Pointer down on the handle starts a drag.
 *   - While dragging, every pointer move calls `onResize(nextWidth)` with
 *     the clamped new width. Callers can throttle / persist as they like.
 *   - Double-clicking the handle resets to the provided default width so
 *     users can recover from an accidental drag without opening settings.
 *   - The handle also supports keyboard (ArrowLeft / ArrowRight) for
 *     accessibility; each keystroke moves 16 px, Shift+Arrow moves 64 px.
 *
 * The component renders a thin, invisible hit target with a visible hover /
 * active bar so it blends with the surrounding layout until the user
 * actually reaches for it.
 *
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

export interface ColumnResizerProps {
  /**
   * Current width of the column being resized, in px. Used as the drag
   * starting point and for keyboard / double-click fallbacks.
   */
  currentWidth: number;
  /** Lower bound in px. Drag will clamp to this. */
  min: number;
  /** Upper bound in px. Drag will clamp to this. */
  max: number;
  /** Width to return to on double-click. */
  defaultWidth: number;
  /** Called with the new width (already clamped). */
  onResize: (nextWidth: number) => void;
  /** Accessible label. */
  ariaLabel: string;
  /** Optional className to merge onto the root handle. */
  className?: string;
  /**
   * Where the visible 1px divider line sits inside the hit target. `center`
   * works for in-flow handles. `start` lets callers place the hit target
   * outside an adjacent scroll pane without moving the visual divider.
   */
  barPosition?: "center" | "start";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function ColumnResizer({
  currentWidth,
  min,
  max,
  defaultWidth,
  onResize,
  ariaLabel,
  className = "",
  barPosition = "center",
}: ColumnResizerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{
    startX: number;
    startWidth: number;
    pointerId: number;
  } | null>(null);

  // While dragging, temporarily disable text selection on the whole document
  // so the user can move the pointer freely.
  useEffect(() => {
    if (!isDragging) return;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [isDragging]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // Only primary button (left-click / primary touch). Ignore
      // middle-click, right-click, and auxiliary buttons.
      if (event.button !== 0) return;
      event.preventDefault();
      dragStateRef.current = {
        startX: event.clientX,
        startWidth: currentWidth,
        pointerId: event.pointerId,
      };
      // setPointerCapture is not always implemented in test environments
      // (jsdom). Guard so missing support doesn't abort the drag.
      try {
        (event.currentTarget as HTMLDivElement).setPointerCapture?.(
          event.pointerId,
        );
      } catch {
        // Pointer capture is a nice-to-have for sticky drags; the drag still
        // works without it.
      }
      setIsDragging(true);
    },
    [currentWidth],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      const delta = event.clientX - state.startX;
      const next = clamp(state.startWidth + delta, min, max);
      onResize(next);
    },
    [max, min, onResize],
  );

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      if (!state) return;
      try {
        (event.currentTarget as HTMLDivElement).releasePointerCapture?.(
          state.pointerId,
        );
      } catch {
        // releasePointerCapture can throw if capture was already lost
        // (for example the pointer was canceled). That is expected.
      }
      dragStateRef.current = null;
      setIsDragging(false);
    },
    [],
  );

  const handleDoubleClick = useCallback(() => {
    onResize(clamp(defaultWidth, min, max));
  }, [defaultWidth, max, min, onResize]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 64 : 16;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onResize(clamp(currentWidth - step, min, max));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onResize(clamp(currentWidth + step, min, max));
      } else if (
        event.key === "Home" ||
        event.key === "End" ||
        event.key === "Enter" ||
        event.key === " "
      ) {
        // Reset on Home / End / Enter / Space for keyboard-only users.
        event.preventDefault();
        onResize(clamp(defaultWidth, min, max));
      }
    },
    [currentWidth, defaultWidth, max, min, onResize],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={Math.round(currentWidth)}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-label={ariaLabel}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      // Hit area (w-2 = 8px) is wider than the visible bar so the handle
      // is easy to grab. shrink-0 prevents the flex parent from squeezing
      // the handle when it runs low on space. touch-none disables the
      // browser's default touch panning so a swipe on the handle becomes
      // a pointer event we can drive.
      className={`group relative flex w-2 shrink-0 cursor-col-resize items-stretch touch-none outline-none focus-visible:bg-primary/20 ${className}`}
      data-testid="column-resizer"
    >
      <div
        className={`pointer-events-none absolute inset-y-0 w-px transition-colors duration-quick ${
          barPosition === "start" ? "left-0" : "left-1/2 -translate-x-1/2"
        } ${
          isDragging
            ? "bg-primary/80"
            : "bg-border/40 group-hover:bg-primary/60"
        }`}
        aria-hidden
      />
    </div>
  );
}
