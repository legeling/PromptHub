import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LockIcon, XIcon } from 'lucide-react';
import { useToast } from '../ui/Toast';

interface PrivateFolderUnlockModalProps {
  isOpen: boolean;
  folderName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function PrivateFolderUnlockModal({
  isOpen,
  folderName,
  onClose,
  onSuccess,
}: PrivateFolderUnlockModalProps) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const { t } = useTranslation();

  if (!isOpen) return null;

  const handleUnlock = async () => {
    if (!password.trim()) {
      showToast(t('folder.masterPasswordRequired'), 'error');
      return;
    }

    setLoading(true);
    try {
      const result = await window.api?.security?.unlock(password);
      if (result?.success) {
        showToast(t('folder.unlockSuccess'), 'success');
        setPassword('');
        onSuccess();
      } else {
        showToast(t('folder.wrongPassword'), 'error');
      }
    } catch (error) {
      showToast(t('folder.unlockFailed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleUnlock();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      {/* 背景遮罩 */}
      <div
        data-testid="private-folder-unlock-backdrop"
        role="presentation"
        aria-hidden="true"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal content */}
      {/* 弹窗内容 */}
      <div className="relative app-wallpaper-panel-strong rounded-xl w-full max-w-sm mx-4 overflow-hidden border border-border animate-in fade-in zoom-in-95 duration-base">
        {/* Title bar */}
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <LockIcon aria-hidden="true" className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold">{t('folder.privateUnlockTitle')}</h2>
          </div>
          <button
            type="button"
            aria-label={t('common.close', '关闭')}
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <XIcon aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        {/* 内容 */}
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('folder.privateUnlockMessage', { name: folderName })}
          </p>

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('folder.unlockPlaceholder')}
            className="w-full h-10 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
            autoFocus
          />

          {/* Action buttons */}
          {/* 操作按钮 */}
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleUnlock}
              disabled={loading}
              className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? t('folder.unlocking') : t('settings.unlock')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
