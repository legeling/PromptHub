import { ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangleIcon } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string | ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  variant = 'default',
}: ConfirmDialogProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
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
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 对话框 */}
      <div className="relative bg-card rounded-xl shadow-2xl border border-border w-full max-w-sm p-6 animate-in fade-in zoom-in-95 duration-200">
        {/* 图标 */}
        {variant === 'destructive' && (
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangleIcon className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
          </div>
        )}

        {/* 标题 */}
        {title && (
          <h3 className="text-lg font-semibold text-center mb-2">{title}</h3>
        )}

        {/* 消息 */}
        <div className="text-sm text-muted-foreground text-center mb-6">
          {message}
        </div>

        {/* 按钮 */}
        <div className="flex gap-3">
          <button
            ref={cancelButtonRef}
            onClick={onClose}
            className="flex-1 h-10 px-4 rounded-lg border border-border bg-background hover:bg-muted transition-colors text-sm font-medium"
          >
            {cancelText}
          </button>
          <button
            ref={confirmButtonRef}
            onClick={onConfirm}
            className={`flex-1 h-10 px-4 rounded-lg text-white text-sm font-medium transition-colors ${
              variant === 'destructive'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-primary hover:bg-primary/90'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
