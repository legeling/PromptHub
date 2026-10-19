import { useState, useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  DownloadIcon,
  CheckCircleIcon,
  XIcon,
  Loader2Icon,
  RefreshCwIcon,
  FolderOpenIcon,
  ExternalLinkIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { Modal } from "./ui/Modal";
import { Select } from "./ui/Select";
import { UpdateReleaseNotes } from "./UpdateReleaseNotes";
import { useSettingsStore } from "../stores/settings.store";
import { runPreUpgradeBackup } from "../services/backup-orchestrator";

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

type MacInstallSource = "direct" | "homebrew" | "unknown";
type UpdateSource = "automatic" | "official" | "mirror";

function formatTransferBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const mebibytes = bytes / (1024 * 1024);
  if (mebibytes >= 1) return `${mebibytes.toFixed(1)} MB`;
  const kibibytes = bytes / 1024;
  if (kibibytes >= 1) return `${kibibytes.toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}

export type UpdateStatus =
  | { status: "checking" }
  | { status: "available"; info: UpdateInfo }
  | { status: "not-available"; info: UpdateInfo }
  | { status: "downloading"; progress: ProgressInfo }
  | { status: "downloaded"; info: UpdateInfo }
  | { status: "error"; error: string };

function isStableUpgradeState(
  status: UpdateStatus | null,
): status is Extract<UpdateStatus, { status: "available" | "downloaded" }> {
  return status?.status === "available" || status?.status === "downloaded";
}

interface UpdateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialStatus?: UpdateStatus | null;
}

export function UpdateDialog({
  isOpen,
  onClose,
  initialStatus,
}: UpdateDialogProps): ReactNode {
  const { t } = useTranslation();
  // Only subscribe to the field we need, not the entire store
  // 只订阅需要的字段，而不是整个 store
  const useUpdateMirror = useSettingsStore((state) => state.useUpdateMirror);
  const updateMirrorSource = useSettingsStore(
    (state) => state.updateMirrorSource,
  );
  const updateChannel = useSettingsStore((state) => state.updateChannel);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(
    initialStatus || null,
  );
  const updateStatusRef = useRef<UpdateStatus | null>(initialStatus || null);
  const lastUpdateInfoRef = useRef<UpdateInfo | null>(
    initialStatus?.status === "available" ||
      initialStatus?.status === "downloaded"
      ? initialStatus.info
      : null,
  );
  const [downloadSource, setDownloadSource] = useState<UpdateSource>(
    useUpdateMirror ? "mirror" : "automatic",
  );
  const [currentVersion, setCurrentVersion] = useState<string>("");
  const [platform, setPlatform] = useState<string>("");
  const [installSource, setInstallSource] =
    useState<MacInstallSource>("unknown");
  const [backupExported, setBackupExported] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isManualRefreshPending, setIsManualRefreshPending] = useState(false);
  const [isChangingDownloadSource, setIsChangingDownloadSource] =
    useState(false);
  const downloadRequestRef = useRef(0);

  useEffect(() => {
    setDownloadSource(useUpdateMirror ? "mirror" : "automatic");
  }, [useUpdateMirror]);

  useEffect(() => {
    // Keep the ref in sync with the `initialStatus` prop, including `null`
    // transitions. If we only wrote the ref on truthy values (the previous
    // behavior), a parent that cleared `initialStatus` back to null would
    // leave the ref holding a stale `available` / `downloaded`, and the
    // "ignore transient checking" guard plus the `preserveVisibleStatus`
    // computation would both misbehave on the next open.
    setUpdateStatus(initialStatus ?? null);
    updateStatusRef.current = initialStatus ?? null;
    if (
      initialStatus?.status === "available" ||
      initialStatus?.status === "downloaded"
    ) {
      lastUpdateInfoRef.current = initialStatus.info;
    } else if (initialStatus === null) {
      lastUpdateInfoRef.current = null;
    }
  }, [initialStatus]);

  useEffect(() => {
    updateStatusRef.current = updateStatus;
  }, [updateStatus]);

  useEffect(() => {
    // Get current version and platform
    // 获取当前版本和平台
    window.electron?.updater?.getVersion().then(setCurrentVersion);
    window.electron?.updater?.getPlatform?.().then(setPlatform);
    window.electron?.updater
      ?.getInstallSource?.()
      .then((source: MacInstallSource) => {
        setInstallSource(source);
      });

    // Listen for update status
    // 监听更新状态
    const handleStatus = (status: UpdateStatus) => {
      // Use the ref to read the latest state — this effect runs once with an
      // empty dep array, so the closure-captured `updateStatus` would be
      // stale on subsequent invocations and miss already-known
      // 'available'/'downloaded' states.
      if (
        status.status === "checking" &&
        isStableUpgradeState(updateStatusRef.current)
      ) {
        return;
      }

      updateStatusRef.current = status;
      if (status.status === "downloading" && status.progress.percent > 0) {
        setIsChangingDownloadSource(false);
      }
      if (status.status === "available" || status.status === "downloaded") {
        lastUpdateInfoRef.current = status.info;
      } else if (status.status === "not-available") {
        lastUpdateInfoRef.current = null;
      }
      setUpdateStatus(status);
      if (status.status !== "checking") {
        setIsManualRefreshPending(false);
      }
    };

    const offUpdaterStatus = window.electron?.updater?.onStatus(handleStatus);

    return () => {
      // Precise cleanup: remove only this dialog's listener, avoid affecting App-level listeners
      // 精确清理：只移除本弹窗的监听，避免影响 App 层监听
      if (typeof offUpdaterStatus === "function") {
        offUpdaterStatus();
      } else {
        window.electron?.updater?.offStatus?.();
      }
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
      setBackupExported(false);
      void handleCheckUpdate(useUpdateMirror ? "mirror" : "automatic", {
        preserveVisibleStatus: isStableUpgradeState(updateStatusRef.current),
      });
    }
  }, [isOpen, updateChannel, useUpdateMirror]);

  const handleCheckUpdate = async (
    source: UpdateSource,
    options?: { preserveVisibleStatus?: boolean },
  ) => {
    setDownloadSource(source);
    setIsManualRefreshPending(true);
    if (!options?.preserveVisibleStatus) {
      setUpdateStatus({ status: "checking" });
    }
    const result = await window.electron?.updater?.check({
      source,
      channel: updateChannel,
      mirror: updateMirrorSource,
    });
    // If update check returns an error (e.g. in dev), set error status
    // 如果检查更新返回错误（例如开发环境），设置错误状态
    if (result && !result.success) {
      setIsManualRefreshPending(false);
      setUpdateStatus({
        status: "error",
        error: result.error || t("settings.updateCheckFailed"),
      });
    }
    // Note: success cases are handled via onStatus callback
    // 注意：成功的情况会通过 onStatus 回调处理
  };

  const resetDownloadProgress = () => {
    const status: UpdateStatus = {
      status: "downloading",
      progress: { percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 },
    };
    updateStatusRef.current = status;
    setUpdateStatus(status);
  };

  const handleDownload = async (source: UpdateSource = downloadSource) => {
    if (platform === "darwin" && installSource === "homebrew") {
      setUpdateStatus({
        status: "error",
        error: t("settings.homebrewUpdateRequired"),
      });
      return;
    }
    const requestId = ++downloadRequestRef.current;
    resetDownloadProgress();
    try {
      const updater = window.electron?.updater;
      if (!updater?.download) {
        throw new Error(t("settings.updateDownloadFailed"));
      }
      const result = await updater.download({
        source,
        channel: updateChannel,
        mirror: updateMirrorSource,
      });
      if (
        requestId === downloadRequestRef.current &&
        result &&
        !result.success &&
        !result.cancelled
      ) {
        setUpdateStatus({
          status: "error",
          error: result.error || t("settings.updateDownloadFailed"),
        });
      }
    } catch (error) {
      if (requestId !== downloadRequestRef.current) return;
      setUpdateStatus({
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : t("settings.updateDownloadFailed"),
      });
    }
  };

  const handleDownloadSourceChange = async (source: UpdateSource) => {
    if (source === downloadSource) return;
    setDownloadSource(source);

    if (updateStatusRef.current?.status !== "downloading") return;

    setIsChangingDownloadSource(true);
    try {
      await handleDownload(source);
    } finally {
      setIsChangingDownloadSource(false);
    }
  };

  const handleInstall = async () => {
    if (platform === "darwin" && installSource === "homebrew") {
      setUpdateStatus({
        status: "error",
        error: t("settings.homebrewUpdateRequired"),
      });
      return;
    }
    setIsInstalling(true);
    try {
      const result = await window.electron?.updater?.install();
      if (result && !result.success) {
        setUpdateStatus({
          status: "error",
          error: result.error || t("settings.updateInstallFailed"),
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
      await runPreUpgradeBackup(currentVersion);
      setBackupExported(true);
    } catch (error) {
      setUpdateStatus({
        status: "error",
        error:
          error instanceof Error ? error.message : t("common.error", "Error"),
      });
    } finally {
      setIsCreatingBackup(false);
    }
  };

  if (!isOpen) return null;

  const channelLabel = t(
    updateChannel === "preview"
      ? "settings.previewChannel"
      : "settings.stableChannel",
  );
  const isMacHomebrew = platform === "darwin" && installSource === "homebrew";

  const primaryButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50";
  const secondaryButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background/80 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50";
  const mutedButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-xl bg-muted px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50";

  const updateInfo =
    updateStatus?.status === "available" ||
    updateStatus?.status === "downloaded"
      ? updateStatus.info
      : lastUpdateInfoRef.current;
  const hasRelease =
    updateStatus?.status === "available" ||
    updateStatus?.status === "downloaded" ||
    updateStatus?.status === "downloading";
  const isDownloading = updateStatus?.status === "downloading";
  const isDownloaded = updateStatus?.status === "downloaded";
  const percent =
    updateStatus?.status === "downloading" &&
    Number.isFinite(updateStatus.progress.percent)
      ? Math.min(100, Math.max(0, updateStatus.progress.percent))
      : 0;

  const renderDownloadSourceControl = () => (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {t("settings.downloadSource")}
      </p>
      <Select
        ariaLabel={t("settings.downloadSource")}
        value={downloadSource}
        onChange={(source) => {
          if (
            source === "automatic" ||
            source === "official" ||
            source === "mirror"
          ) {
            void handleDownloadSourceChange(source);
          }
        }}
        options={[
          { value: "automatic", label: t("settings.downloadSourceAutomatic") },
          { value: "official", label: t("settings.downloadSourceOfficial") },
          { value: "mirror", label: t("settings.downloadSourceMirror") },
        ]}
        dropdownWidth="trigger"
      />
      {isChangingDownloadSource && (
        <p role="status" className="text-xs text-muted-foreground">
          {t("settings.downloadRestarting")}
        </p>
      )}
    </div>
  );

  const renderHomebrewHint = () => (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-sm leading-6 text-muted-foreground">
        {t("settings.homebrewUpdateHint")}
      </p>
      <pre className="mt-3 overflow-x-auto text-xs">
        brew update{`\n`}brew upgrade --cask prompthub
      </pre>
    </div>
  );

  const renderRelease = () => (
    <div className="grid h-[min(58vh,560px)] min-h-0 grid-cols-1 overflow-y-auto md:grid-cols-[220px_minmax(0,1fr)] md:overflow-hidden">
      <aside className="flex flex-col gap-5 border-b border-border bg-muted/30 p-6 md:border-b-0 md:border-r">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {isDownloaded ? (
            <CheckCircleIcon aria-hidden="true" className="h-7 w-7" />
          ) : (
            <DownloadIcon aria-hidden="true" className="h-7 w-7" />
          )}
        </div>
        <div>
          <p className="break-all text-3xl font-semibold tracking-tight">
            {updateInfo?.version || currentVersion}
          </p>
          <h3 className="mt-2 text-base font-medium">
            {t(
              isDownloaded
                ? "settings.downloadComplete"
                : isDownloading
                  ? "settings.downloading"
                  : "settings.updateAvailable",
            )}
          </h3>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("settings.version")}: {currentVersion || "..."}
          </p>
        </div>
        {!isMacHomebrew && !isDownloaded && (
          <div className="mt-auto border-t border-border pt-4">
            {renderDownloadSourceControl()}
          </div>
        )}
      </aside>
      <section
        aria-label={t("settings.releaseNotes")}
        tabIndex={0}
        className="min-w-0 p-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary md:overflow-y-auto"
      >
        <h3 className="mb-5 border-b border-border pb-4 text-lg font-semibold">
          {t("settings.releaseNotes")}
        </h3>
        {updateInfo?.releaseNotes ? (
          <UpdateReleaseNotes notes={updateInfo.releaseNotes} />
        ) : (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-muted-foreground">
              {t("settings.updateNotesUnavailable")}
            </p>
            <button
              type="button"
              onClick={() => window.electron?.updater?.openReleases()}
              className={secondaryButtonClass}
            >
              <ExternalLinkIcon aria-hidden="true" className="h-4 w-4" />
              {t("settings.openReleasesPage")}
            </button>
          </div>
        )}
        {isMacHomebrew && <div className="mt-5">{renderHomebrewHint()}</div>}
      </section>
    </div>
  );

  const renderContent = () => {
    if (hasRelease) return renderRelease();
    if (updateStatus?.status === "error") {
      const errorText = updateStatus.error || t("common.unknownError");
      return (
        <div className="space-y-5 p-8 text-center">
          <XIcon
            aria-hidden="true"
            className="mx-auto h-10 w-10 text-destructive"
          />
          <h3 className="text-lg font-semibold">{t("common.error")}</h3>
          <p
            role="alert"
            className="break-words whitespace-pre-wrap text-sm text-muted-foreground"
          >
            {errorText.includes("SHA512")
              ? t("error.sha512Desc", errorText)
              : errorText}
          </p>
          {errorText === t("settings.homebrewUpdateRequired") &&
            renderHomebrewHint()}
          {errorText.includes("SHA512") && (
            <button
              type="button"
              onClick={() => window.electron?.updater?.openDownloadedUpdate?.()}
              className={secondaryButtonClass}
            >
              <FolderOpenIcon aria-hidden="true" className="h-4 w-4" />
              {t("settings.openDownloadFolder")}
            </button>
          )}
          <p className="text-xs text-muted-foreground">
            {t("settings.manualDownloadHint")}
          </p>
          <button
            type="button"
            onClick={() => window.electron?.updater?.openReleases()}
            className={secondaryButtonClass}
          >
            <ExternalLinkIcon aria-hidden="true" className="h-4 w-4" />
            {t("settings.manualDownload")}
          </button>
        </div>
      );
    }
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 p-8 text-center">
        {updateStatus?.status === "not-available" ? (
          <>
            <CheckCircleIcon
              aria-hidden="true"
              className="h-12 w-12 text-primary"
            />
            <h3 className="text-lg font-semibold">{t("settings.noUpdate")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("settings.noUpdateDesc", { version: currentVersion })}
            </p>
          </>
        ) : (
          <>
            <Loader2Icon
              aria-hidden="true"
              className="h-8 w-8 animate-spin text-primary"
            />
            <p role="status" className="text-sm text-muted-foreground">
              {t(
                downloadSource === "mirror"
                  ? "settings.usingMirrorSource"
                  : "settings.checking",
              )}
            </p>
          </>
        )}
      </div>
    );
  };

  const renderFooter = () => {
    if (!hasRelease) return undefined;
    return (
      <div className="-mx-6 border-t border-border px-6 pt-4">
        {updateStatus?.status === "downloading" && (
          <div aria-live="polite" className="mb-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>{t("settings.downloading")}</span>
              <span className="tabular-nums">{percent.toFixed(1)}%</span>
            </div>
            <progress
              aria-label={t("settings.downloading")}
              aria-valuenow={percent}
              max={100}
              value={percent}
              className="block h-2 w-full overflow-hidden rounded-full bg-muted [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"
            />
            <div className="flex flex-wrap justify-between gap-2 text-xs tabular-nums text-muted-foreground">
              <span>
                {formatTransferBytes(updateStatus.progress.transferred)} /{" "}
                {formatTransferBytes(updateStatus.progress.total)}
              </span>
              <span>
                {formatTransferBytes(updateStatus.progress.bytesPerSecond)}/s
              </span>
            </div>
          </div>
        )}
        {isDownloaded && !isMacHomebrew && (
          <p className="mb-3 text-xs text-muted-foreground">
            {t("settings.installRestartHint")}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            {!isMacHomebrew && !isDownloading && (
              <>
                <span className="flex items-center gap-2">
                  <ShieldCheckIcon
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0"
                  />
                  {t("settings.updateAutomaticSnapshot")}
                </span>
                <button
                  type="button"
                  onClick={handleBackupBeforeUpgrade}
                  disabled={isCreatingBackup || isInstalling}
                  className="inline-flex items-center gap-2 text-primary hover:underline disabled:opacity-50"
                >
                  {isCreatingBackup ? (
                    <Loader2Icon
                      aria-hidden="true"
                      className="h-4 w-4 animate-spin"
                    />
                  ) : (
                    <DownloadIcon aria-hidden="true" className="h-4 w-4" />
                  )}
                  {t("settings.updateExportBackup")}
                </button>
                {backupExported && (
                  <span role="status">
                    {t("settings.updateBackupExported")}
                  </span>
                )}
              </>
            )}
            {isDownloading && (
              <button
                type="button"
                onClick={() => window.electron?.updater?.openReleases()}
                className={secondaryButtonClass}
              >
                <ExternalLinkIcon aria-hidden="true" className="h-4 w-4" />
                {t("settings.manualDownload")}
              </button>
            )}
            {isDownloaded && platform !== "darwin" && (
              <button
                type="button"
                onClick={() =>
                  window.electron?.updater?.openDownloadedUpdate?.()
                }
                className="inline-flex items-center gap-2 hover:text-foreground"
              >
                <FolderOpenIcon aria-hidden="true" className="h-4 w-4" />
                {t("settings.openDownloadFolder")}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className={mutedButtonClass}
            >
              {t("settings.installLater")}
            </button>
            {!isDownloading && (
              <button
                type="button"
                onClick={
                  isMacHomebrew
                    ? () => window.electron?.updater?.openReleases()
                    : isDownloaded
                      ? handleInstall
                      : () => void handleDownload()
                }
                disabled={isCreatingBackup || isInstalling}
                className={primaryButtonClass}
              >
                {isInstalling ? (
                  <Loader2Icon
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin"
                  />
                ) : isMacHomebrew ? (
                  <ExternalLinkIcon aria-hidden="true" className="h-4 w-4" />
                ) : (
                  <DownloadIcon aria-hidden="true" className="h-4 w-4" />
                )}
                {t(
                  isMacHomebrew
                    ? "settings.openReleasesPage"
                    : isDownloaded
                      ? "settings.installNow"
                      : "settings.downloadUpdate",
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("settings.checkUpdate")}
      subtitle={`${t("settings.version")}: ${currentVersion || "..."}`}
      size="2xl"
      contentClassName={
        hasRelease ? "flex flex-col overflow-hidden" : "overflow-y-auto"
      }
      footer={renderFooter()}
      headerActions={
        <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            {channelLabel}
          </span>
          <button
            type="button"
            onClick={() =>
              void handleCheckUpdate(useUpdateMirror ? "mirror" : "automatic", {
                preserveVisibleStatus: isStableUpgradeState(updateStatus),
              })
            }
            disabled={isManualRefreshPending || isDownloading || isInstalling}
            aria-label={t("settings.checkUpdate")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
          >
            <RefreshCwIcon
              aria-hidden="true"
              className={`h-3.5 w-3.5 ${isManualRefreshPending ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">
              {t("settings.checkUpdate")}
            </span>
          </button>
        </div>
      }
    >
      {renderContent()}
    </Modal>
  );
}
