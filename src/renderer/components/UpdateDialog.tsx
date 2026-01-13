import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DownloadIcon, CheckCircleIcon, XIcon, Loader2Icon, RefreshCwIcon, FolderOpenIcon, ExternalLinkIcon, ZapIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSettingsStore } from '../stores/settings.store';

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
  const settings = useSettingsStore();
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(initialStatus || null);
  const [useMirror, setUseMirror] = useState<boolean>(settings.useUpdateMirror);
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [platform, setPlatform] = useState<string>('');

  useEffect(() => {
    if (initialStatus) {
      setUpdateStatus(initialStatus);
    }
  }, [initialStatus]);

  useEffect(() => {
    // Get current version and platform
    // 获取当前版本和平台
    window.electron?.updater?.getVersion().then(setCurrentVersion);
    window.electron?.updater?.getPlatform?.().then(setPlatform);

    // Listen for update status
    // 监听更新状态
    const handleStatus = (status: UpdateStatus) => {
      setUpdateStatus(status);
    };

    const offUpdaterStatus = window.electron?.updater?.onStatus(handleStatus);

    // --- DEV MODE: Simulate update status for testing UI ---
    // 开发模式：模拟更新状态以测试 UI
    const devTimers: Array<ReturnType<typeof setTimeout>> = [];
    if (process.env.NODE_ENV === 'development') {
      // Uncomment one of the following to test different states
      // 取消注释以下任一项来测试不同状态

      devTimers.push(setTimeout(() => {
        setUpdateStatus({
          status: 'available',
          info: {
            version: '0.2.6-beta',
            releaseNotes: `## 🚀 新功能 / New Features\n- 模拟开发环境下的更新提示\n- Simulated update prompt in dev mode\n\n## ✨ 优化 / Improvements\n- 更好的更新体验\n- Better update experience\n\n## 🐛 修复 / Bug Fixes\n- 修复了一些已知问题\n- Fixed some known issues`,
            releaseDate: new Date().toISOString(),
          },
        });
      }, 1500));

      devTimers.push(setTimeout(() => {
        setUpdateStatus({ status: 'not-available', info: { version: '0.2.5' } });
      }, 1500));

      devTimers.push(setTimeout(() => {
        setUpdateStatus({ status: 'downloading', progress: { percent: 45, bytesPerSecond: 1024000, total: 50000000, transferred: 22500000 } });
      }, 1500));
    }
    // --- END DEV MODE ---

    return () => {
      // Precise cleanup: remove only this dialog's listener, avoid affecting App-level listeners
      // 精确清理：只移除本弹窗的监听，避免影响 App 层监听
      if (typeof offUpdaterStatus === 'function') {
        offUpdaterStatus();
      } else {
        window.electron?.updater?.offStatus?.();
      }
      devTimers.forEach((t) => clearTimeout(t));
    };
  }, []);

  // When dialog opens, always force a fresh update check (no cache)
  // 当对话框打开时，总是强制检查更新（不使用缓存）
  useEffect(() => {
    if (isOpen) {
      // Force check every time the dialog opens
      // Using global mirror setting by default
      handleCheckUpdate(settings.useUpdateMirror);
    }
  }, [isOpen]);

  const handleCheckUpdate = async (mirror: boolean) => {
    setUseMirror(mirror);
    setUpdateStatus({ status: 'checking' });
    const result = await window.electron?.updater?.check(mirror);
    // If update check returns an error (e.g. in dev), set error status
    // 如果检查更新返回错误（例如开发环境），设置错误状态
    if (result && !result.success) {
      setUpdateStatus({ status: 'error', error: result.error || '检查更新失败' });
    }
    // Note: success cases are handled via onStatus callback
    // 注意：成功的情况会通过 onStatus 回调处理
  };

  const handleDownload = async () => {
    await window.electron?.updater?.download(useMirror);
  };

  const handleInstall = async () => {
    await window.electron?.updater?.install();
  };

  if (!isOpen) return null;

  const renderContent = () => {
    if (!updateStatus) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
          <p className="text-muted-foreground mb-4">
            {t('settings.version')}: {currentVersion}
          </p>
          <button
            onClick={() => handleCheckUpdate(false)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
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
          <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
            <Loader2Icon className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">
              {useMirror ? t('settings.usingMirrorSource') : t('settings.checking')}
            </p>
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
          <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
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
          <div className="flex-1 flex flex-col items-center justify-center py-8">
            <div className="w-full max-w-md mb-4">
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
            {!isMac && (
              <p className="text-xs text-muted-foreground mb-4">
                {t('settings.installRestartHint')}
              </p>
            )}
            {isMac && (
              <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-sm text-amber-600 dark:text-amber-400 whitespace-pre-line">
                  {t('settings.macManualInstall')}
                </p>
              </div>
            )}
            <div className="flex flex-col gap-2">
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
              {!isMac && (
                <button
                  onClick={() => window.electron?.updater?.openDownloadedUpdate?.()}
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted/50 transition-colors text-sm"
                >
                  <FolderOpenIcon className="w-4 h-4" />
                  {t('settings.openDownloadFolder')}
                </button>
              )}
            </div>
          </div>
        );

      case 'error':
        return (
          <div className="text-center py-6 flex flex-col h-full shrink-0">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-500/10 flex items-center justify-center">
              <XIcon className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="font-semibold text-lg mb-1 text-red-500">{t('common.error')}</h3>
            <p className="text-sm text-muted-foreground break-all whitespace-pre-wrap max-h-24 overflow-y-auto mb-4 px-2">
              {updateStatus.error}
            </p>

            {/* SHA512 error: show open folder button */}
            {updateStatus.error.includes('SHA512') && (
              <div className="mb-4">
                <button
                  onClick={() => window.electron?.updater?.openDownloadedUpdate?.()}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-green-600 text-white hover:bg-green-700 transition-all text-sm font-medium shadow-sm active:scale-95"
                >
                  <FolderOpenIcon className="w-4 h-4" />
                  打开下载文件夹
                </button>
              </div>
            )}

            <div className="space-y-4 mt-auto">
              <div className="p-4 rounded-xl bg-muted/30 border border-border/50 text-left">
                <p className="text-xs text-muted-foreground mb-3">{t('settings.manualDownloadHint')}</p>
                <button
                  onClick={() => window.electron?.updater?.openReleases()}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-background border border-border hover:bg-muted transition-all text-sm font-medium shadow-sm active:scale-95"
                >
                  <ExternalLinkIcon className="w-4 h-4 text-muted-foreground" />
                  {t('settings.manualDownload')}
                </button>
              </div>
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
