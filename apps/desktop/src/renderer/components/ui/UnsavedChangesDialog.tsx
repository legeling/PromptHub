import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertCircleIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

interface UnsavedChangesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  onDiscard: () => void;
}

export function UnsavedChangesDialog({
  isOpen,
  onClose,
  onSave,
  onDiscard,
}: UnsavedChangesDialogProps) {
  const { t } = useTranslation();
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const timer = setTimeout(() => {
      saveButtonRef.current?.focus();
    }, 50);

    return () => {
      clearTimeout(timer);

      const previousFocus = previousFocusRef.current;
      const dialog = dialogRef.current;
      const activeElement = document.activeElement;
      const focusIsInsideDialog =
        activeElement instanceof Node && dialog?.contains(activeElement);

      if (
        previousFocus?.isConnected &&
        (!dialog || activeElement === document.body || focusIsInsideDialog)
      ) {
        previousFocus.focus({ preventScroll: true });
      }

      previousFocusRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const content = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      {/* Backdrop */}
      {/* 背景遮罩 */}
      <div
        data-testid="unsaved-changes-backdrop"
        role="presentation"
        aria-hidden="true"
        className="absolute inset-0 bg-background/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      {/* 对话框 */}
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="relative app-wallpaper-panel-strong rounded-xl shadow-2xl border border-border w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-base"
      >
        {/* Icon */}
        {/* 图标 */}
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <AlertCircleIcon aria-hidden="true" className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          </div>
        </div>

        {/* Title */}
        {/* 标题 */}
        <h3 id={titleId} className="text-lg font-semibold text-center mb-2">
          {t("prompt.unsavedChanges", "未保存的更改")}
        </h3>

        {/* Message */}
        {/* 消息 */}
        <div id={messageId} className="text-sm text-muted-foreground text-center mb-6">
          {t("prompt.unsavedChangesMessage", "您有未保存的更改，是否要保存？")}
        </div>

        {/* Buttons */}
        {/* 按钮 */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-10 px-4 rounded-lg border border-border app-wallpaper-surface hover:bg-accent transition-colors text-sm font-medium text-foreground"
          >
            {t("common.cancel", "取消")}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="flex-1 h-10 px-4 rounded-lg border border-border app-wallpaper-surface hover:bg-destructive/10 text-destructive transition-colors text-sm font-medium"
          >
            {t("prompt.discardChanges", "不保存")}
          </button>
          <button
            type="button"
            ref={saveButtonRef}
            onClick={onSave}
            className="flex-1 h-10 px-4 rounded-lg bg-primary text-white text-sm font-medium transition-colors hover:bg-primary/90"
          >
            {t("common.save", "保存")}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
