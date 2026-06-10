import { useState, useEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DownloadIcon, CheckCircleIcon, XIcon, Loader2Icon, RefreshCwIcon, FolderOpenIcon, ExternalLinkIcon, ZapIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { Modal } from './ui/Modal';
import { Checkbox } from './ui/Checkbox';
import { useSettingsStore } from '../stores/settings.store';
import {
  getManualBackupStatus,
} from "../services/backup-status";
import { runPreUpgradeBackup } from "../services/backup-orchestrator";
import { resolvePromptMarkdownHref } from "./prompt/prompt-markdown-url";

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

type MacInstallSource = 'direct' | 'homebrew' | 'unknown';

const releaseNoteMarkdownComponents: ComponentProps<typeof ReactMarkdown>["components"] = {
  a: ({
    children,
    href,
    node: _node,
    ...props
  }: ComponentProps<"a"> & { children?: ReactNode; node?: unknown }) => {
    const safeHref = resolvePromptMarkdownHref(href);

    if (!safeHref) {
      return <span {...props}>{children}</span>;
    }

    return (
      <a
        {...props}
        href={safeHref}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  },
};

export type UpdateStatus =
  | { status: 'checking' }
  | { status: 'available'; info: UpdateInfo }
  | { status: 'not-available'; info: UpdateInfo }
  | { status: 'downloading'; progress: ProgressInfo }
  | { status: 'downloaded'; info: UpdateInfo }
  | { status: 'error'; error: string };

function isStableUpgradeState(
  status: UpdateStatus | null,
): status is Extract<UpdateStatus, { status: 'available' | 'downloaded' }> {
  return status?.status === 'available' || status?.status === 'downloaded';
}

interface UpdateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialStatus?: UpdateStatus | null;
}

export function UpdateDialog({ isOpen, onClose, initialStatus }: UpdateDialogProps) {
  const { t } = useTranslation();
  // Only subscribe to the field we need, not the entire store
  // 只订阅需要的字段，而不是整个 store
  const useUpdateMirror = useSettingsStore((state) => state.useUpdateMirror);
  const updateChannel = useSettingsStore((state) => state.updateChannel);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(initialStatus || null);
  const updateStatusRef = useRef<UpdateStatus | null>(initialStatus || null);
  const [useMirror, setUseMirror] = useState<boolean>(useUpdateMirror);
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [platform, setPlatform] = useState<string>('');
  const [installSource, setInstallSource] = useState<MacInstallSource>('unknown');
  const [lastManualBackupAt, setLastManualBackupAt] = useState<string | null>(null);
  const [lastManualBackupVersion, setLastManualBackupVersion] = useState<string | null>(null);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [hasAcknowledgedBackup, setHasAcknowledgedBackup] = useState(false);
  const [isManualRefreshPending, setIsManualRefreshPending] = useState(false);

  useEffect(() => {
    // Keep the ref in sync with the `initialStatus` prop, including `null`
    // transitions. If we only wrote the ref on truthy values (the previous
    // behavior), a parent that cleared `initialStatus` back to null would
    // leave the ref holding a stale `available` / `downloaded`, and the
    // "ignore transient checking" guard plus the `preserveVisibleStatus`
    // computation would both misbehave on the next open.
    setUpdateStatus(initialStatus ?? null);
    updateStatusRef.current = initialStatus ?? null;
  }, [initialStatus]);

  useEffect(() => {
    updateStatusRef.current = updateStatus;
  }, [updateStatus]);

  useEffect(() => {
    // Get current version and platform
    // 获取当前版本和平台
    window.electron?.updater?.getVersion().then(setCurrentVersion);
    window.electron?.updater?.getPlatform?.().then(setPlatform);
    window.electron?.updater?.getInstallSource?.().then((source: MacInstallSource) => {
      setInstallSource(source);
    });
    getManualBackupStatus().then((status) => {
      setLastManualBackupAt(status.lastManualBackupAt);
      setLastManualBackupVersion(status.lastManualBackupVersion);
    });

    // Listen for update status
    // 监听更新状态
    const handleStatus = (status: UpdateStatus) => {
      // Use the ref to read the latest state — this effect runs once with an
      // empty dep array, so the closure-captured `updateStatus` would be
      // stale on subsequent invocations and miss already-known
      // 'available'/'downloaded' states.
      if (
        status.status === 'checking' &&
        isStableUpgradeState(updateStatusRef.current)
      ) {
        return;
      }

      updateStatusRef.current = status;
      setUpdateStatus(status);
      if (status.status !== 'checking') {
        setIsManualRefreshPending(false);
      }
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
  //
  // Note: this effect intentionally does NOT depend on `initialStatus`. The
  // parent App pushes status into `initialStatus` while the dialog is open;
  // depending on it here produced a feedback loop where every status update
  // re-triggered the check, which produced the next status, and so on —
  // this was the root cause of the flickering reported in #117/#118.
  useEffect(() => {
    if (isOpen) {
      setHasAcknowledgedBackup(false);
      // Force check every time the dialog opens
      // Using global mirror setting by default
      getManualBackupStatus().then((status) => {
        setLastManualBackupAt(status.lastManualBackupAt);
        setLastManualBackupVersion(status.lastManualBackupVersion);
      });
      void handleCheckUpdate(useUpdateMirror, {
        preserveVisibleStatus: isStableUpgradeState(updateStatusRef.current),
      });
    }
  }, [isOpen, updateChannel, useUpdateMirror]);

  const handleCheckUpdate = async (
    mirror: boolean,
    options?: { preserveVisibleStatus?: boolean },
  ) => {
    setUseMirror(mirror);
    setIsManualRefreshPending(true);
    if (!options?.preserveVisibleStatus) {
      setUpdateStatus({ status: 'checking' });
    }
    const result = await window.electron?.updater?.check({
      useMirror: mirror,
      channel: updateChannel,
    });
    // If update check returns an error (e.g. in dev), set error status
    // 如果检查更新返回错误（例如开发环境），设置错误状态
    if (result && !result.success) {
      setIsManualRefreshPending(false);
      setUpdateStatus({
        status: 'error',
        error: result.error || t('settings.updateCheckFailed'),
      });
    }
    // Note: success cases are handled via onStatus callback
    // 注意：成功的情况会通过 onStatus 回调处理
  };

  const handleDownload = async () => {
    if (platform === 'darwin' && installSource === 'homebrew') {
      setUpdateStatus({
        status: 'error',
        error: t('settings.homebrewUpdateRequired'),
      });
      return;
    }
    await window.electron?.updater?.download({
      useMirror,
      channel: updateChannel,
    });
  };

  const handleInstall = async () => {
    if (!canInstallUpgrade) {
      return;
    }
    if (platform === 'darwin' && installSource === 'homebrew') {
      setUpdateStatus({
        status: 'error',
        error: t('settings.homebrewUpdateRequired'),
      });
      return;
    }
    setIsInstalling(true);
    try {
      const result = await window.electron?.updater?.install();
      if (result && !result.success) {
        setUpdateStatus({
          status: 'error',
          error: result.error || 'Automatic upgrade backup failed',
        });
      }
    } finally {
      setIsInstalling(false);
    }
  };

  const handleBackupBeforeUpgrade = async () => {
    if (!currentVersion) {
      return;
    }

    setIsCreatingBackup(true);
    try {
      const status = await runPreUpgradeBackup(currentVersion);
      setLastManualBackupAt(status.lastManualBackupAt);
      setLastManualBackupVersion(status.lastManualBackupVersion);
    } catch (error) {
      setUpdateStatus({
        status: 'error',
        error:
          error instanceof Error ? error.message : t('common.error', 'Error'),
      });
    } finally {
      setIsCreatingBackup(false);
    }
  };

  if (!isOpen) return null;

  const hasCurrentVersionManualBackup =
    !!currentVersion &&
    !!lastManualBackupAt &&
    lastManualBackupVersion === currentVersion;
  const canInstallUpgrade = hasAcknowledgedBackup;
  const channelLabel = t(
    updateChannel === 'preview'
      ? 'settings.previewChannel'
      : 'settings.stableChannel',
  );
  const isMacHomebrew = platform === 'darwin' && installSource === 'homebrew';

  const primaryButtonClass =
    'inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50';
  const secondaryButtonClass =
    'inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background/80 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50';
  const mutedButtonClass =
    'inline-flex items-center justify-center gap-2 rounded-xl bg-muted px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50';

  const renderBackupGate = ({
    showDescription,
    showConfirmation,
  }: {
    showDescription: boolean;
    showConfirmation: boolean;
  }) => {
    const backupStatusMessage = hasCurrentVersionManualBackup && lastManualBackupAt
      ? t('settings.backupReadyForUpgrade', { time: lastManualBackupAt })
      : currentVersion
        ? t('settings.backupMissingForUpgrade', { version: currentVersion })
        : t('settings.backupRequiredForUpgradeDesc');
    const backupStatusClass = hasCurrentVersionManualBackup
      ? 'border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-300'
      : 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300';

    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="flex items-start gap-3">
          <ZapIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 flex-1">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                {t('settings.backupRequiredForUpgrade')}
              </p>
              <p className="text-xs text-muted-foreground">
                {showDescription
                  ? t('settings.backupRequiredForUpgradeDesc')
                  : t('settings.backupOptionalForUpgradeDesc')}
              </p>
            </div>
            <div className={`mt-3 rounded-lg border px-3 py-2 ${backupStatusClass}`}>
              <p className="text-xs leading-5">{backupStatusMessage}</p>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleBackupBeforeUpgrade}
            disabled={isCreatingBackup}
            className={secondaryButtonClass}
          >
            {isCreatingBackup ? (
              <Loader2Icon aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <DownloadIcon aria-hidden="true" className="h-4 w-4" />
            )}
            {t('settings.backupBeforeUpgrade')}
          </button>
        </div>
        {showConfirmation ? (
          <div className="mt-3 rounded-lg border border-border/60 bg-background/60 px-3 py-3">
            <Checkbox
              checked={hasAcknowledgedBackup}
              onChange={setHasAcknowledgedBackup}
              label={t('settings.backupConfirmUpgrade')}
              className="items-start gap-3 text-left"
            />
          </div>
        ) : null}
      </div>
    );
  };

  const renderReleaseNotes = (releaseNotes: string) => (
    <section className="rounded-xl border border-border/60 bg-muted/30">
      <div className="border-b border-border/50 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('settings.releaseNotes')}
        </p>
      </div>
      <div className="max-h-[360px] overflow-y-auto px-4 py-3 sm:max-h-[440px]">
        <div className="prose prose-sm dark:prose-invert max-w-none break-words prose-headings:text-foreground prose-h1:text-base prose-h1:font-semibold prose-h2:text-sm prose-h2:font-semibold prose-h3:text-sm prose-h3:font-medium prose-p:my-2 prose-p:text-[13px] prose-p:text-foreground/85 prose-li:text-[13px] prose-li:text-foreground/85 prose-pre:overflow-x-auto prose-pre:border prose-pre:border-border prose-pre:bg-background/80 prose-code:text-primary">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeSanitize]}
            components={releaseNoteMarkdownComponents}
          >
            {releaseNotes}
          </ReactMarkdown>
        </div>
      </div>
    </section>
  );

  const getStatusVersion = (info?: UpdateInfo) =>
    info?.version || currentVersion || '...';

  const getStatusError = (error: unknown) =>
    typeof error === 'string' && error.length > 0
      ? error
      : t('common.unknownError');

  const getProgressPercent = (progress?: ProgressInfo) => {
    if (typeof progress?.percent !== 'number' || !Number.isFinite(progress.percent)) {
      return 0;
    }

    return Math.min(100, Math.max(0, progress.percent));
  };

  const renderContent = () => {
    if (!updateStatus) {
      return (
        <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
          <p className="mb-4 text-sm text-muted-foreground">
            {t('settings.version')}: {currentVersion || '...'}
          </p>
          <button
            type="button"
            onClick={() => handleCheckUpdate(useUpdateMirror)}
            className={primaryButtonClass}
          >
            <RefreshCwIcon aria-hidden="true" className="w-4 h-4" />
            {t('settings.checkUpdate')}
          </button>
        </div>
      );
    }

    switch (updateStatus.status) {
      case 'checking':
        return (
          <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
            <Loader2Icon className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-sm text-muted-foreground">
              {useMirror ? t('settings.usingMirrorSource') : t('settings.checking')}
            </p>
          </div>
        );

      case 'available':
        const availableVersion = getStatusVersion(updateStatus.info);
        return (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-500/10">
                <DownloadIcon className="w-6 h-6 text-green-500" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-lg">{t('settings.updateAvailable')}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('settings.version')}: {availableVersion}
                </p>
              </div>
            </div>
            {updateStatus.info?.releaseNotes && (
              renderReleaseNotes(updateStatus.info.releaseNotes)
            )}
            {isMacHomebrew && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
                <p className="text-sm text-amber-600 dark:text-amber-400 whitespace-pre-line">
                  {t('settings.homebrewUpdateHint')}
                </p>
                <pre className="mt-3 overflow-x-auto rounded-xl bg-background/80 px-3 py-2 text-xs text-foreground border border-border">
                  brew update{`\n`}brew upgrade --cask prompthub
                </pre>
              </div>
            )}
            {!isMacHomebrew &&
              renderBackupGate({
                showDescription: false,
                showConfirmation: false,
              })}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={isMacHomebrew ? () => window.electron?.updater?.openReleases() : handleDownload}
                disabled={isCreatingBackup}
                className={primaryButtonClass}
              >
                {isMacHomebrew ? (
                  <>
                    <ExternalLinkIcon aria-hidden="true" className="w-4 h-4" />
                    {t('settings.openReleasesPage')}
                  </>
                ) : (
                  <>
                    <DownloadIcon aria-hidden="true" className="w-4 h-4" />
                    {t('settings.downloadUpdate')}
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                className={mutedButtonClass}
              >
                {t('settings.installLater')}
              </button>
            </div>
          </div>
        );

      case 'not-available':
        return (
          <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
            <CheckCircleIcon className="w-12 h-12 mx-auto mb-4 text-green-500" />
            <h3 className="font-semibold text-lg mb-1">{t('settings.noUpdate')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('settings.noUpdateDesc', { version: currentVersion })}
            </p>
          </div>
        );

      case 'downloading':
        const percent = getProgressPercent(updateStatus.progress);
        return (
          <div className="flex min-h-[320px] flex-col items-center justify-center py-4">
            <div className="w-full max-w-md mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span>{t('settings.downloading')}</span>
                <span>{percent.toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-smooth"
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
        const isMacHomebrewDownloaded = isMac && installSource === 'homebrew';
        const downloadedVersion = getStatusVersion(updateStatus.info);
        return (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-500/10">
                <CheckCircleIcon className="w-6 h-6 text-green-500" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-lg">{t('settings.downloadComplete')}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('settings.version')}: {downloadedVersion}
                </p>
              </div>
            </div>
            {!isMac && (
              <p className="text-xs text-muted-foreground">
                {t('settings.installRestartHint')}
              </p>
            )}
            {isMac && !isMacHomebrewDownloaded && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
                <p className="text-sm text-amber-600 dark:text-amber-400 whitespace-pre-line">
                  {t('settings.macManualInstall')}
                </p>
              </div>
            )}
            {!isMacHomebrewDownloaded &&
              renderBackupGate({
                showDescription: true,
                showConfirmation: true,
              })}
            <div className="flex flex-col gap-2">
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={
                    isMacHomebrewDownloaded
                      ? () => window.electron?.updater?.openReleases()
                      : handleInstall
                  }
                  disabled={
                    isMacHomebrewDownloaded
                      ? false
                      : isCreatingBackup || isInstalling || !canInstallUpgrade
                  }
                  className={primaryButtonClass}
                >
                  {isMacHomebrewDownloaded ? (
                    <>
                      <ExternalLinkIcon aria-hidden="true" className="w-4 h-4" />
                      {t('settings.openReleasesPage')}
                    </>
                  ) : isMac ? (
                    <>
                      <FolderOpenIcon aria-hidden="true" className="w-4 h-4" />
                      {t('settings.openDownloadFolder')}
                    </>
                  ) : (
                    <>
                      {isInstalling ? (
                        <Loader2Icon aria-hidden="true" className="w-4 h-4 animate-spin" />
                      ) : null}
                      {t('settings.installNow')}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className={mutedButtonClass}
                >
                  {t('settings.installLater')}
                </button>
              </div>
              {!isMac && !isMacHomebrewDownloaded && (
                <button
                  type="button"
                  onClick={() => window.electron?.updater?.openDownloadedUpdate?.()}
                  className={secondaryButtonClass}
                >
                  <FolderOpenIcon aria-hidden="true" className="w-4 h-4" />
                  {t('settings.openDownloadFolder')}
                </button>
              )}
            </div>
          </div>
        );

      case 'error':
        const errorText = getStatusError(updateStatus.error);
        const isHomebrewError = errorText === t('settings.homebrewUpdateRequired');
        return (
          <div className="flex min-h-[320px] flex-col text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-500/10 flex items-center justify-center">
              <XIcon className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="font-semibold text-lg mb-1 text-red-500">{t('common.error')}</h3>
            <p className="text-sm text-muted-foreground break-all whitespace-pre-wrap max-h-24 overflow-y-auto mb-4 px-2">
              {errorText.includes('SHA512')
                ? t('error.sha512Desc', errorText)
                : errorText}
            </p>

            {isHomebrewError && (
              <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-left">
                <p className="text-sm text-amber-600 dark:text-amber-400 whitespace-pre-line">
                  {t('settings.homebrewUpdateHint')}
                </p>
                <pre className="mt-3 overflow-x-auto rounded-xl bg-background/80 px-3 py-2 text-xs text-foreground border border-border">
                  brew update{`\n`}brew upgrade --cask prompthub
                </pre>
              </div>
            )}

            {/* SHA512 error: show open folder button */}
            {errorText.includes('SHA512') && (
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() => window.electron?.updater?.openDownloadedUpdate?.()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700"
                >
                  <FolderOpenIcon aria-hidden="true" className="w-4 h-4" />
                  {t('settings.openDownloadFolder')}
                </button>
              </div>
            )}

            <div className="space-y-4 mt-auto">
              <div className="p-4 rounded-xl bg-muted/30 border border-border/50 text-left">
                <p className="text-xs text-muted-foreground mb-3">{t('settings.manualDownloadHint')}</p>
                <button
                  type="button"
                  onClick={() => window.electron?.updater?.openReleases()}
                  className={`${secondaryButtonClass} w-full`}
                >
                  <ExternalLinkIcon aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
                  {t('settings.manualDownload')}
                </button>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('settings.checkUpdate')}
      subtitle={`${t('settings.version')}: ${currentVersion || '...'}`}
      size="xl"
      headerActions={
        <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            {channelLabel}
          </span>
          <button
            type="button"
            onClick={() => void handleCheckUpdate(useUpdateMirror, {
              preserveVisibleStatus: isStableUpgradeState(updateStatus),
            })}
            disabled={isManualRefreshPending}
            aria-label={t('settings.checkUpdate')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
          >
            <RefreshCwIcon aria-hidden="true" className={`h-3.5 w-3.5 ${isManualRefreshPending ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('settings.checkUpdate')}</span>
          </button>
        </div>
      }
    >
      {renderContent()}
    </Modal>
  );
}
