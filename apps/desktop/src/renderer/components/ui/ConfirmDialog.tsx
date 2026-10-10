import { ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangleIcon, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string | ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
  isLoading?: boolean;
}

function cycleDialogFocus(dialog: HTMLElement | null, backwards: boolean): void {
  if (!dialog) return;
  const controls = Array.from(dialog.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
  )).filter((control) => !control.closest('[hidden], [aria-hidden="true"]'));
  const index = controls.findIndex((control) => control === document.activeElement);
  const next = index < 0 ? (backwards ? controls.length - 1 : 0)
    : (index + (backwards ? -1 : 1) + controls.length) % controls.length;
  controls[next]?.focus();
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  variant = 'default',
  isLoading = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const confirmLabel = confirmText ?? t('common.confirm');
  const cancelLabel = cancelText ?? t('common.cancel');
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
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

    // Focus on cancel button to prevent accidental operations
    // 聚焦到取消按钮，防止误操作
    const timer = setTimeout(() => {
      cancelButtonRef.current?.focus();
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
      const dialogs = document.querySelectorAll('[role="alertdialog"]');
      if (dialogs[dialogs.length - 1] !== dialogRef.current) return;
      if (!['Escape', 'Enter', 'Tab'].includes(e.key)) return;
      e.stopImmediatePropagation();
      if (isLoading) { e.preventDefault(); return; }
      const active = document.activeElement;
      if (e.key === 'Enter' && active instanceof HTMLElement &&
        dialogRef.current?.contains(active) &&
        active !== confirmButtonRef.current && active !== cancelButtonRef.current) return;
      e.preventDefault();
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        if (document.activeElement === cancelButtonRef.current) onClose();
        else onConfirm();
      } else {
        cycleDialogFocus(dialogRef.current, e.shiftKey);
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, isLoading, onClose, onConfirm]);

  if (!isOpen) return null;

  const content = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      {/* Background mask */}
      {/* 背景遮罩 */}
      <div
        data-testid="confirm-dialog-backdrop"
        role="presentation"
        aria-hidden="true"
        className="absolute inset-0 bg-background/60 backdrop-blur-sm"
        onClick={() => { if (!isLoading) onClose(); }}
      />

      {/* Dialog */}
      {/* 对话框 */}
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : confirmLabel}
        aria-describedby={messageId}
        className="relative app-wallpaper-panel-strong rounded-xl shadow-2xl border border-border w-full max-w-sm p-6 animate-in fade-in zoom-in-95 duration-base"
      >
        {/* Icon */}
        {/* 图标 */}
        {variant === 'destructive' && (
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangleIcon aria-hidden="true" className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
          </div>
        )}

        {/* Title */}
        {/* 标题 */}
        {title && (
          <h3 id={titleId} className="text-lg font-semibold text-center mb-2">{title}</h3>
        )}

        {/* Message */}
        {/* 消息 */}
        <div id={messageId} className="text-sm text-muted-foreground text-center mb-6">
          {message}
        </div>

        {/* Buttons */}
        {/* 按钮 */}
        <div className="flex gap-3">
          <button
            type="button"
            ref={cancelButtonRef}
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 h-10 px-4 rounded-lg border border-border app-wallpaper-surface hover:bg-accent transition-colors text-sm font-medium disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmButtonRef}
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 h-10 px-4 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2 ${
              variant === 'destructive'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-primary hover:bg-primary/90'
            }`}
          >
            {isLoading && <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin shrink-0" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
