import { useEffect, useRef, type RefObject } from "react";

export function useGenerationLightboxControls(
  onClose: () => void,
  onPrevious: () => void,
  onNext: () => void,
): RefObject<HTMLDivElement> {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog
      .querySelector<HTMLButtonElement>('button:not([tabindex="-1"])')
      ?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const buttons = dialog.querySelectorAll<HTMLButtonElement>(
        'button:not(:disabled):not([tabindex="-1"])',
      );
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
    dialog.addEventListener("keydown", trapFocus);
    return () => {
      document.body.style.overflow = overflow;
      dialog.removeEventListener("keydown", trapFocus);
      if (trigger instanceof HTMLElement && trigger.isConnected) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, []);
  useLightboxKeyboard(onClose, onPrevious, onNext);
  return dialogRef;
}

function useLightboxKeyboard(
  onClose: () => void,
  onPrevious: () => void,
  onNext: () => void,
): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!["Escape", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onPrevious();
      if (event.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose, onPrevious, onNext]);
}
