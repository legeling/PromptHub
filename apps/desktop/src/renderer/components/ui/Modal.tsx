import { ReactNode, useEffect, useId, useRef, useState } from "react";
import { XIcon } from "lucide-react";
import { clsx } from "clsx";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  headerActions?: ReactNode;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "full" | "fullscreen";
  showCloseButton?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
}

/**
 * Size mapping to CSS values for smooth transitions.
 * Use fixed units (px, vh, vw) to ensure browser can interpolate effectively.
 */
const SIZE_CONFIG = {
  sm: { maxWidth: "400px", height: "auto", maxHeight: "85vh" },
  md: { maxWidth: "500px", height: "auto", maxHeight: "85vh" },
  lg: { maxWidth: "600px", height: "auto", maxHeight: "85vh" },
  xl: { maxWidth: "800px", height: "auto", maxHeight: "85vh" },
  "2xl": { maxWidth: "1000px", height: "auto", maxHeight: "85vh" },
  full: { maxWidth: "1200px", height: "auto", maxHeight: "85vh" },
  // Fullscreen keeps 64px margin on all sides to avoid overlapping OS window controls
  fullscreen: {
    maxWidth: "calc(100vw - 128px)",
    height: "calc(100vh - 128px)",
    maxHeight: "none",
  },
};

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  headerActions,
  children,
  size = "md",
  showCloseButton = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
}: ModalProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const subtitleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Handle mount/unmount animation logic
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      // Double requestAnimationFrame ensures the browser hits the starting state (opacity 0)
      // before applying the entrance animation.
      let isCancelled = false;
      let innerRafId: number | null = null;
      const rafId = requestAnimationFrame(() => {
        if (isCancelled) return;
        innerRafId = requestAnimationFrame(() => {
          if (isCancelled) return;
          setIsAnimating(true);
        });
      });
      return () => {
        isCancelled = true;
        cancelAnimationFrame(rafId);
        if (innerRafId !== null) {
          cancelAnimationFrame(innerRafId);
        }
      };
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle ESC key close
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;

    if (closeOnEscape) {
      document.addEventListener("keydown", handleEsc);
    }
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose, closeOnEscape]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    return () => {
      const previousFocus = previousFocusRef.current;
      const modal = modalRef.current;
      const activeElement = document.activeElement;
      const focusIsInsideModal =
        activeElement instanceof Node && modal?.contains(activeElement);

      if (
        previousFocus?.isConnected &&
        (!modal || activeElement === document.body || focusIsInsideModal)
      ) {
        previousFocus.focus({ preventScroll: true });
      }

      previousFocusRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !shouldRender) {
      return;
    }

    const modal = modalRef.current;
    if (!modal) {
      return;
    }

    const activeElement = document.activeElement;
    if (activeElement instanceof Node && modal.contains(activeElement)) {
      return;
    }

    modal.focus({ preventScroll: true });
  }, [isOpen, shouldRender]);

  if (!shouldRender) return null;

  const isFullscreen = size === "fullscreen";
  const config =
    SIZE_CONFIG[size as keyof typeof SIZE_CONFIG] || SIZE_CONFIG.md;

  const modalContent = (
    <div
      className={clsx(
        "fixed inset-0 z-[9999] flex items-center justify-center transition-all duration-base",
        isAnimating ? "ease-enter" : "ease-exit",
        // In fullscreen mode, use p-16 (64px) to move the entire modal box away from traffic lights
        isFullscreen ? "p-16" : "p-4",
      )}
      style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0 }}
    >
      {/* Backdrop */}
      <div
        data-testid="modal-backdrop"
        role="presentation"
        aria-hidden="true"
        className={clsx(
          "absolute inset-0 bg-background/60 backdrop-blur-md transition-opacity",
          isAnimating ? "duration-base ease-enter opacity-100" : "duration-quick ease-exit opacity-0",
        )}
        onClick={closeOnBackdrop ? onClose : undefined}
      />

      {/* Modal Container */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={title && subtitle ? subtitleId : undefined}
        aria-label={title ? undefined : t("common.dialog", "Dialog")}
        tabIndex={-1}
        className={clsx(
          "relative app-wallpaper-panel-strong shadow-[0_0_100px_-20px_rgba(0,0,0,0.6)] border border-border",
          "overflow-hidden flex flex-col rounded-2xl focus:outline-none",
          "transition-all",
          // Different timing for enter vs exit so the dialog snaps shut
          // a little faster than it eases open.
          // 入场 / 出场分别用不同时长与曲线，让关闭比打开略快。
          isAnimating
            ? "duration-base ease-enter opacity-100 scale-100 translate-y-0"
            : "duration-quick ease-exit opacity-0 scale-enter-from translate-y-4",
        )}
        style={{
          margin: "auto",
          width: "100%",
          maxWidth: config.maxWidth,
          height: isFullscreen ? config.height : "auto",
          maxHeight: config.maxHeight,
        }}
      >
        {/* Header / Title Bar */}
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 relative z-10 app-wallpaper-surface">
            <div className="flex-1 min-w-0">
              <h2
                id={titleId}
                className="text-xl font-bold tracking-tight text-foreground truncate"
              >
                {title}
              </h2>
              {subtitle && (
                <p
                  id={subtitleId}
                  className="mt-0.5 text-xs text-muted-foreground line-clamp-2"
                >
                  {subtitle}
                </p>
              )}
            </div>
            <div className="ml-4 flex max-w-full shrink-0 flex-wrap items-center justify-end gap-3">
              {headerActions}
              {showCloseButton ? (
                <>
                  <div className="w-[1px] h-4 bg-border mx-1" />
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label={t("common.close", "Close")}
                    className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-base"
                  >
                    <XIcon aria-hidden="true" className="w-5 h-5" />
                  </button>
                </>
              ) : null}
            </div>
          </div>
        )}

        {/* Form / Content Area */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
