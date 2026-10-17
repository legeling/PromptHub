import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
  type RefObject,
  type HTMLAttributes,
} from "react";

interface ResourceImagePan {
  stageRef: RefObject<HTMLDivElement>;
  isPanning: boolean;
  reset: () => void;
  handlers: Pick<
    HTMLAttributes<HTMLDivElement>,
    | "onPointerDown"
    | "onPointerMove"
    | "onPointerUp"
    | "onPointerCancel"
    | "onLostPointerCapture"
    | "onKeyDown"
  >;
}

/** Transient canvas position; independent of scroll overflow and image scale. */
export function useResourceImagePan(source: string): ResourceImagePan {
  const stageRef = useRef<HTMLDivElement>(null);
  const offset = useRef({ x: 0, y: 0 });
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const moveTo = (x: number, y: number) => {
    offset.current = { x, y };
    // Pointer coordinates are dynamic presentation data, not layout styles.
    if (stageRef.current) stageRef.current.style.translate = `${x}px ${y}px`;
  };
  const reset = () => {
    moveTo(0, 0);
    drag.current = null;
    setIsPanning(false);
  };
  useLayoutEffect(() => {
    offset.current = { x: 0, y: 0 };
    if (stageRef.current) stageRef.current.style.translate = "0px 0px";
    drag.current = null;
    setIsPanning(false);
  }, [source]);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || drag.current) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: offset.current.x,
      top: offset.current.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanning(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (start?.id !== event.pointerId) return;
    moveTo(
      start.left + event.clientX - start.x,
      start.top + event.clientY - start.y,
    );
  };
  const stop = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [-32, 0],
      ArrowRight: [32, 0],
      ArrowUp: [0, -32],
      ArrowDown: [0, 32],
    };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    event.stopPropagation();
    moveTo(offset.current.x + step[0], offset.current.y + step[1]);
  };
  return {
    stageRef,
    isPanning,
    reset,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: stop,
      onPointerCancel: stop,
      onLostPointerCapture: stop,
      onKeyDown,
    },
  };
}
