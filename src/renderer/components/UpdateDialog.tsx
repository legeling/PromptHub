import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DownloadIcon, CheckCircleIcon, XIcon, Loader2Icon, RefreshCwIcon, FolderOpenIcon, ExternalLinkIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface UpdateInfo {
  version: string;
  releaseNotes?: string;
  releaseDate?: string;
}

export interface ProgressInfo {
  percent: number;
  bytesPerSecond: number;
  total: number;
  transferred: number;
}

export type UpdateStatus = 
  | { status: 'checking' }
  | { status: 'available'; info: UpdateInfo }
  | { status: 'not-available'; info: UpdateInfo }
  | { status: 'downloading'; progress: ProgressInfo }
  | { status: 'downloaded'; info: UpdateInfo }
  | { status: 'error'; error: string };

interface UpdateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialStatus?: UpdateStatus | null;
}

export function UpdateDialog({ isOpen, onClose, initialStatus }: UpdateDialogProps) {
  const { t } = useTranslation();
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(initialStatus || null);
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [platform, setPlatform] = useState<string>('');

  useEffect(() => {
    if (initialStatus) {
      setUpdateStatus(initialStatus);
    }
  }, [initialStatus]);

  useEffect(() => {
    // 获取当前版本和平台
    window.electron?.updater?.getVersion().then(setCurrentVersion);
    window.electron?.updater?.getPlatform?.().then(setPlatform);

    // 监听更新状态
    const handleStatus = (status: UpdateStatus) => {
      setUpdateStatus(status);
    };

    window.electron?.updater?.onStatus(handleStatus);

    // --- DEV MODE: Simulate update status for testing UI ---
    // 开发模式：模拟更新状态以测试 UI
    if (process.env.NODE_ENV === 'development') {
      // Uncomment one of the following to test different states:
      // 取消注释以下任一项来测试不同状态：
      
      setTimeout(() => {
        setUpdateStatus({
          status: 'available',
          info: {
            version: '0.2.6-beta',
            releaseNotes: `## 🚀 新功能 / New Features\n- 模拟开发环境下的更新提示\n- Simulated update prompt in dev mode\n\n## ✨ 优化 / Improvements\n- 更好的更新体验\n- Better update experience\n\n## 🐛 修复 / Bug Fixes\n- 修复了一些已知问题\n- Fixed some known issues`,
            releaseDate: new Date().toISOString(),
          },
        });
      }, 1500);
      
      setTimeout(() => {
        setUpdateStatus({ status: 'not-available', info: { version: '0.2.5' } });
      }, 1500);
      
      setTimeout(() => {
        setUpdateStatus({ status: 'downloading', progress: { percent: 45, bytesPerSecond: 1024000, total: 50000000, transferred: 22500000 } });
      }, 1500);
    }
    // --- END DEV MODE ---

    return () => {
      window.electron?.updater?.offStatus();
    };
  }, []);

  // 当对话框打开时，总是强制检查更新（不使用缓存）
  useEffect(() => {
    if (isOpen) {
      // 每次打开都强制检查更新
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
              <div className="mb-4 p-4 rounded-lg bg-muted/50 flex-1 min-h-[200px] max-h-[350px] overflow-y-auto prose prose-sm dark:prose-invert max-w-none">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  {t('settings.releaseNotes')}
                </p>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {updateStatus.info.releaseNotes}
                </ReactMarkdown>
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
        const isMac = platform === 'darwin';
        return (
          <div className="py-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircleIcon className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">{t('settings.downloadComplete')}</h3>
                <p className="text-sm text-muted-foreground">
                  {isMac ? '' : t('settings.downloadCompleteDesc')}
                </p>
              </div>
            </div>
            {isMac && (
              <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-sm text-amber-600 dark:text-amber-400 whitespace-pre-line">
                  {t('settings.macManualInstall')}
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleInstall}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
              >
                {isMac ? (
                  <>
                    <FolderOpenIcon className="w-4 h-4" />
                    {t('settings.openDownloadFolder')}
                  </>
                ) : (
                  t('settings.installNow')
                )}
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
            <p className="text-sm text-muted-foreground break-all whitespace-pre-wrap max-h-32 overflow-y-auto mb-4">
              {updateStatus.error}
            </p>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground mb-2">{t('settings.manualDownloadHint')}</p>
              <button
                onClick={() => window.electron?.updater?.openReleases()}
                className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
              >
                <ExternalLinkIcon className="w-4 h-4" />
                {t('settings.manualDownload')}
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-xl mx-4 p-6 rounded-2xl bg-card border border-border shadow-xl min-h-[400px] flex flex-col"
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
        <div className="flex-1 flex flex-col">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
