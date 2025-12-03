import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DownloadIcon, CheckCircleIcon, XIcon, Loader2Icon, RefreshCwIcon } from 'lucide-react';

interface UpdateInfo {
  version: string;
  releaseNotes?: string;
  releaseDate?: string;
}

interface ProgressInfo {
  percent: number;
  bytesPerSecond: number;
  total: number;
  transferred: number;
}

type UpdateStatus = 
  | { status: 'checking' }
  | { status: 'available'; info: UpdateInfo }
  | { status: 'not-available'; info: UpdateInfo }
  | { status: 'downloading'; progress: ProgressInfo }
  | { status: 'downloaded'; info: UpdateInfo }
  | { status: 'error'; error: string };

interface UpdateDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UpdateDialog({ isOpen, onClose }: UpdateDialogProps) {
  const { t } = useTranslation();
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>('');

  useEffect(() => {
    // 获取当前版本
    window.electron?.updater?.getVersion().then(setCurrentVersion);

    // 监听更新状态
    const handleStatus = (status: UpdateStatus) => {
      setUpdateStatus(status);
    };

    window.electron?.updater?.onStatus(handleStatus);

    return () => {
      window.electron?.updater?.offStatus();
    };
  }, []);

  // 当对话框打开时，如果没有缓存状态才自动检查
  useEffect(() => {
    if (isOpen && updateStatus === null) {
      // 首次打开时自动检查更新
      handleCheckUpdate();
    }
  }, [isOpen]);

  const handleCheckUpdate = async () => {
    setUpdateStatus({ status: 'checking' });
    const result = await window.electron?.updater?.check();
    // 如果检查更新返回错误（例如开发环境），设置错误状态
    if (result && !result.success) {
      setUpdateStatus({ status: 'error', error: result.error || '检查更新失败' });
    }
    // 注意：成功的情况会通过 onStatus 回调处理
  };

  const handleDownload = async () => {
    await window.electron?.updater?.download();
  };

  const handleInstall = async () => {
    await window.electron?.updater?.install();
  };

  if (!isOpen) return null;

  const renderContent = () => {
    if (!updateStatus) {
      return (
        <div className="text-center py-8">
          <p className="text-muted-foreground mb-4">
            {t('settings.version')}: {currentVersion}
          </p>
          <button
            onClick={handleCheckUpdate}
            className="flex items-center gap-2 mx-auto px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            <RefreshCwIcon className="w-4 h-4" />
            {t('settings.checkUpdate')}
          </button>
        </div>
      );
    }

    switch (updateStatus.status) {
      case 'checking':
        return (
          <div className="text-center py-8">
            <Loader2Icon className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">{t('settings.checking')}</p>
          </div>
        );

      case 'available':
        return (
          <div className="py-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <DownloadIcon className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">{t('settings.updateAvailable')}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('settings.updateAvailableDesc', { version: updateStatus.info.version })}
                </p>
              </div>
            </div>
            {updateStatus.info.releaseNotes && (
              <div className="mb-4 p-3 rounded-lg bg-muted/50 max-h-40 overflow-y-auto">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {t('settings.releaseNotes')}
                </p>
                <p className="text-sm whitespace-pre-wrap">{updateStatus.info.releaseNotes}</p>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleDownload}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
              >
                <DownloadIcon className="w-4 h-4" />
                {t('settings.downloadUpdate')}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
              >
                {t('settings.installLater')}
              </button>
            </div>
          </div>
        );

      case 'not-available':
        return (
          <div className="text-center py-8">
            <CheckCircleIcon className="w-12 h-12 mx-auto mb-4 text-green-500" />
            <h3 className="font-semibold text-lg mb-1">{t('settings.noUpdate')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('settings.noUpdateDesc', { version: currentVersion })}
            </p>
          </div>
        );

      case 'downloading':
        const percent = updateStatus.progress?.percent || 0;
        return (
          <div className="py-8">
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span>{t('settings.downloading')}</span>
                <span>{percent.toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
            <p className="text-center text-sm text-muted-foreground">
              {t('settings.downloadProgress', { percent: percent.toFixed(1) })}
            </p>
          </div>
        );

      case 'downloaded':
        return (
          <div className="py-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircleIcon className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">{t('settings.downloadComplete')}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('settings.downloadCompleteDesc')}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleInstall}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
              >
                {t('settings.installNow')}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
              >
                {t('settings.installLater')}
              </button>
            </div>
          </div>
        );

      case 'error':
        return (
          <div className="text-center py-8">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
              <XIcon className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="font-semibold text-lg mb-1 text-red-500">{t('common.error')}</h3>
            <p className="text-sm text-muted-foreground break-all whitespace-pre-wrap max-h-40 overflow-y-auto">
              {updateStatus.error}
            </p>
            <button
              onClick={handleCheckUpdate}
              className="mt-4 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
            >
              {t('settings.checkUpdate')}
            </button>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md mx-4 p-6 rounded-2xl bg-card border border-border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('settings.checkUpdate')}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-muted transition-colors"
          >
            <XIcon className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        {renderContent()}
      </div>
    </div>
  );
}
