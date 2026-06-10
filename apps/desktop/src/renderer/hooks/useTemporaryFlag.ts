import { useCallback, useEffect, useRef, useState } from "react";

export function useTemporaryFlag(resetDelayMs: number) {
  const [isActive, setIsActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      clearTimer();
    };
  }, [clearTimer]);

  const trigger = useCallback(() => {
    clearTimer();
    setIsActive(true);
    timerRef.current = setTimeout(() => {
      if (!isMountedRef.current) {
        return;
      }
      setIsActive(false);
      timerRef.current = null;
    }, resetDelayMs);
  }, [clearTimer, resetDelayMs]);

  return [isActive, trigger] as const;
}
