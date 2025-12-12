import { useState, useEffect } from 'react';
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
  const [rememberChoice, setRememberChoice] = useState(false);
  const settings = useSettingsStore();

  // 每次打开都重置勾选状态，避免上次残留
  useEffect(() => {
    if (isOpen) {
      setRememberChoice(false);
    }
  }, [isOpen]);

  const handleCancel = () => {
    // 重要：用户只是关闭了弹窗（没有选择最小化/退出）
    // 需要通知主进程重置 pendingCloseAction，否则下次点关闭将不会再次弹窗
    window.electron?.sendCloseDialogCancel?.();
    onClose();
  };

  // ESC 关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const handleMinimize = () => {
    if (rememberChoice) {
      settings.setCloseAction('minimize');
    }
    window.electron?.sendCloseDialogResult?.('minimize', rememberChoice);
    onClose();
  };

  const handleExit = () => {
    if (rememberChoice) {
      settings.setCloseAction('exit');
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
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-white/50 dark:bg-black/50 backdrop-blur-md"
        onClick={handleCancel}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* 对话框内容 */}
      <div className="relative bg-card shadow-2xl border border-border rounded-2xl overflow-hidden w-full max-w-sm">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            {t('closeDialog.title')}
          </h2>
          <button
            onClick={handleCancel}
            className="p-2 -mr-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="p-6 space-y-4">
          <p className="text-muted-foreground text-sm">
            {t('closeDialog.message')}
          </p>

          {/* 选项按钮 */}
          <div className="space-y-3">
            <button
              onClick={handleMinimize}
              className="w-full flex items-center gap-3 p-4 rounded-xl border border-border hover:bg-accent hover:border-primary/50 transition-all group"
            >
              <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <MinusIcon className="w-5 h-5" />
              </div>
              <span className="font-medium text-foreground">
                {t('closeDialog.minimizeToTray')}
              </span>
            </button>

            <button
              onClick={handleExit}
              className="w-full flex items-center gap-3 p-4 rounded-xl border border-border hover:bg-accent hover:border-destructive/50 transition-all group"
            >
              <div className="p-2 rounded-lg bg-destructive/10 text-destructive group-hover:bg-destructive group-hover:text-destructive-foreground transition-colors">
                <LogOutIcon className="w-5 h-5" />
              </div>
              <span className="font-medium text-foreground">
                {t('closeDialog.exitApp')}
              </span>
            </button>
          </div>

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
