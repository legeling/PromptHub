import { useState, useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { XIcon, MinusIcon, LogOutIcon } from 'lucide-react';
import { useSettingsStore } from '../../stores/settings.store';
import { Checkbox } from './Checkbox';

interface CloseDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CloseDialog({ isOpen, onClose }: CloseDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const messageId = useId();
  const [rememberChoice, setRememberChoice] = useState(false);
  // Only subscribe to the action we need, not the entire store
  // 只订阅需要的 action，而不是整个 store
  const setCloseAction = useSettingsStore((state) => state.setCloseAction);

  // Reset checkbox state each time dialog opens to avoid residual state
  // 每次打开都重置勾选状态，避免上次残留
  useEffect(() => {
    if (isOpen) {
      setRememberChoice(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    dialogRef.current?.focus({ preventScroll: true });

    return () => {
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

  const handleCancel = () => {
    // Important: User only closed the dialog (didn't choose minimize/exit)
    // Need to notify main process to reset pendingCloseAction, otherwise next close click won't show dialog again
    // 重要：用户只是关闭了弹窗（没有选择最小化/退出）
    // 需要通知主进程重置 pendingCloseAction，否则下次点关闭将不会再次弹窗
    window.electron?.sendCloseDialogCancel?.();
    onClose();
  };

  // ESC to close
  // ESC 关闭
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };

    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  const handleMinimize = () => {
    if (rememberChoice) {
      setCloseAction('minimize');
    }
    window.electron?.sendCloseDialogResult?.('minimize', rememberChoice);
    onClose();
  };

  const handleExit = () => {
    if (rememberChoice) {
      setCloseAction('exit');
    }
    window.electron?.sendCloseDialogResult?.('exit', rememberChoice);
    onClose();
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      {/* Background mask */}
      {/* 背景遮罩 */}
      <div
        data-testid="close-dialog-backdrop"
        role="presentation"
        aria-hidden="true"
        className="absolute inset-0 bg-background/60 backdrop-blur-md animate-in fade-in duration-base ease-enter"
        onClick={handleCancel}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Dialog content */}
      {/* 对话框内容 */}
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        tabIndex={-1}
        className="relative app-wallpaper-panel-strong shadow-2xl border border-border rounded-2xl overflow-hidden w-full max-w-sm animate-in fade-in zoom-in-95 duration-base ease-enter"
      >
        {/* Title bar */}
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 id={titleId} className="text-lg font-semibold text-foreground">
            {t('closeDialog.title')}
          </h2>
          <button
            type="button"
            onClick={handleCancel}
            aria-label={t('common.close', 'Close')}
            className="p-2 -mr-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <XIcon aria-hidden="true" className="w-5 h-5" />
          </button>
        </div>

        {/* Content area */}
        {/* 内容区 */}
        <div className="p-6 space-y-4">
          <p id={messageId} className="text-muted-foreground text-sm">
            {t('closeDialog.message')}
          </p>

          {/* Option buttons */}
          {/* 选项按钮 */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleMinimize}
              className="w-full flex items-center gap-3 p-4 rounded-xl border border-border hover:bg-accent hover:border-primary/50 transition-all group"
            >
              <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <MinusIcon aria-hidden="true" className="w-5 h-5" />
              </div>
              <span className="font-medium text-foreground">
                {t('closeDialog.minimizeToTray')}
              </span>
            </button>

            <button
              type="button"
              onClick={handleExit}
              className="w-full flex items-center gap-3 p-4 rounded-xl border border-border hover:bg-accent hover:border-destructive/50 transition-all group"
            >
              <div className="p-2 rounded-lg bg-destructive/10 text-destructive group-hover:bg-destructive group-hover:text-destructive-foreground transition-colors">
                <LogOutIcon aria-hidden="true" className="w-5 h-5" />
              </div>
              <span className="font-medium text-foreground">
                {t('closeDialog.exitApp')}
              </span>
            </button>
          </div>

          {/* Remember choice */}
          {/* 记住选择 */}
          <div className="flex items-center">
            <Checkbox
              checked={rememberChoice}
              onChange={setRememberChoice}
              label={t('closeDialog.rememberChoice')}
              className="text-muted-foreground"
            />
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
