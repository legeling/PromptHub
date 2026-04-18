import { ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangleIcon, Loader2 } from 'lucide-react';

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

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  isLoading = false,
}: ConfirmDialogProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Focus on cancel button to prevent accidental operations
      // 聚焦到取消按钮，防止误操作
      setTimeout(() => {
        cancelButtonRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onConfirm]);

  if (!isOpen) return null;

  const content = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      {/* Background mask */}
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      {/* 对话框 */}
      <div className="relative bg-card rounded-xl shadow-2xl border border-border w-full max-w-sm p-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Icon */}
        {/* 图标 */}
        {variant === 'destructive' && (
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangleIcon className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
          </div>
        )}

        {/* Title */}
        {/* 标题 */}
        {title && (
          <h3 className="text-lg font-semibold text-center mb-2">{title}</h3>
        )}

        {/* Message */}
        {/* 消息 */}
        <div className="text-sm text-muted-foreground text-center mb-6">
          {message}
        </div>

        {/* Buttons */}
        {/* 按钮 */}
        <div className="flex gap-3">
          <button
            ref={cancelButtonRef}
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 h-10 px-4 rounded-lg border border-border bg-background hover:bg-muted transition-colors text-sm font-medium disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            ref={confirmButtonRef}
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 h-10 px-4 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2 ${
              variant === 'destructive'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-primary hover:bg-primary/90'
            }`}
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
