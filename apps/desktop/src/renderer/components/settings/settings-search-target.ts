import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type RefObject,
} from "react";

export const SettingsSearchTarget = createContext("");

export function useSettingsSearchTarget(label: string): {
  ref: RefObject<HTMLDivElement>;
  highlighted: boolean;
} {
  const target = useContext(SettingsSearchTarget);
  const highlighted = target !== "" && target === label;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!highlighted || !ref.current) return;
    ref.current.scrollIntoView?.({ block: "center" });
    ref.current.focus({ preventScroll: true });
  }, [highlighted]);
  return { ref, highlighted };
}
