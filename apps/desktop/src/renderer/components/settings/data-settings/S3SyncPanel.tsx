import { useDataSettingsControllerContext } from "./useDataSettingsController";
import {
  DataSettingsSection,
  getSyncPanelContentClassName,
} from "./DataSettingsSection";
import { UploadIcon, DownloadIcon, RefreshCwIcon } from "lucide-react";
import { Select } from "../../ui/Select";
import { ToggleSwitch, PasswordInput } from "../shared";
import { SyncProviderSelector } from "./SyncProviderSelector";

export function S3SyncPanel() {
  const {
    activeSubsection,
    t,
    webRuntime,
    settings,
    s3Testing,
    s3Uploading,
    s3Downloading,
    s3ConfigComplete,
    s3ControlsDisabled,
    s3IsSyncSource,
    handleS3ConnectionCheck,
    handleS3Upload,
    handleS3Download,
  } = useDataSettingsControllerContext();

  return (
    <>
      {!webRuntime && activeSubsection === "s3" ? (
        <DataSettingsSection
          title={t("settings.s3SyncMenu", "S3 Compatible Storage")}
        >
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  {t("settings.s3SyncMenu", "S3 Compatible Storage")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t(
                    "settings.s3StorageDesc",
                    "Configure an S3-compatible object storage backup target such as AWS S3, Cloudflare R2, OSS, or COS.",
                  )}
                </p>
              </div>
              <ToggleSwitch
                ariaLabel={t("settings.s3SyncMenu", "S3 Compatible Storage")}
                checked={settings.s3StorageEnabled}
                onChange={settings.setS3StorageEnabled}
              />
            </div>

            <SyncProviderSelector />

            <div className={getSyncPanelContentClassName(s3ControlsDisabled)}>
              <fieldset
                disabled={s3ControlsDisabled}
                className="space-y-3 min-w-0"
              >
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {t("settings.s3Endpoint", "API endpoint")}
                  </label>
                  <input
                    type="url"
                    aria-label={t("settings.s3Endpoint", "API endpoint")}
                    placeholder="https://s3.example.com"
                    value={settings.s3Endpoint}
                    onChange={(e) => settings.setS3Endpoint(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {t("settings.s3Region", "Region")}
                  </label>
                  <input
                    type="text"
                    aria-label={t("settings.s3Region", "Region")}
                    placeholder="us-east-1"
                    value={settings.s3Region}
                    onChange={(e) => settings.setS3Region(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {t("settings.s3Bucket", "Bucket")}
                  </label>
                  <input
                    type="text"
                    aria-label={t("settings.s3Bucket", "Bucket")}
                    placeholder="prompthub-backups"
                    value={settings.s3Bucket}
                    onChange={(e) => settings.setS3Bucket(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {t("settings.s3AccessKeyId", "Access Key ID")}
                  </label>
                  <input
                    type="text"
                    aria-label={t("settings.s3AccessKeyId", "Access Key ID")}
                    placeholder={t("settings.s3AccessKeyId", "Access Key ID")}
                    value={settings.s3AccessKeyId}
                    onChange={(e) => settings.setS3AccessKeyId(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {t("settings.s3SecretAccessKey", "Secret Access Key")}
                  </label>
                  <PasswordInput
                    ariaLabel={t(
                      "settings.s3SecretAccessKey",
                      "Secret Access Key",
                    )}
                    placeholder={t(
                      "settings.s3SecretAccessKey",
                      "Secret Access Key",
                    )}
                    value={settings.s3SecretAccessKey}
                    onChange={settings.setS3SecretAccessKey}
                    disabled={!settings.s3StorageEnabled}
                    className="h-9"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {t(
                      "settings.s3BackupPrefix",
                      "Backup directory (optional)",
                    )}
                  </label>
                  <input
                    type="text"
                    aria-label={t(
                      "settings.s3BackupPrefix",
                      "Backup directory (optional)",
                    )}
                    placeholder="/prompthub"
                    value={settings.s3BackupPrefix}
                    onChange={(e) => settings.setS3BackupPrefix(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
                  />
                </div>
              </fieldset>
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => void handleS3ConnectionCheck()}
                disabled={
                  s3Testing || !s3ConfigComplete || !settings.s3StorageEnabled
                }
                className="h-8 px-4 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <RefreshCwIcon
                  className={`w-4 h-4 ${s3Testing ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                {t("settings.testConnection")}
              </button>
              <button
                type="button"
                onClick={() => void handleS3Upload()}
                disabled={
                  s3Uploading || !s3ConfigComplete || !settings.s3StorageEnabled
                }
                className="h-8 px-4 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <UploadIcon className="w-4 h-4" aria-hidden="true" />
                {t("settings.backupToRemote", "Back up to remote")}
              </button>
              <button
                type="button"
                onClick={() => void handleS3Download()}
                disabled={
                  s3Downloading ||
                  !s3ConfigComplete ||
                  !settings.s3StorageEnabled
                }
                className="h-8 px-4 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <DownloadIcon className="w-4 h-4" aria-hidden="true" />
                {t("settings.updateFromRemote", "Update from remote")}
              </button>
            </div>

            <div className={getSyncPanelContentClassName(s3ControlsDisabled)}>
              <fieldset
                disabled={s3ControlsDisabled}
                className="space-y-3 min-w-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t("settings.webdavAutoRun", "Automatic sync")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s3IsSyncSource
                        ? t("settings.webdavAutoRunDesc")
                        : t(
                            "settings.syncSourceInactiveDesc",
                            "This target stays available for manual backup and restore, but automatic sync only runs for the current sync source.",
                          )}
                    </p>
                  </div>
                  <div className="min-w-[140px]">
                    <Select
                      ariaLabel={`${t("settings.s3SyncMenu", "S3 Compatible Storage")} ${t("settings.webdavAutoRun", "Auto Run")}`}
                      value={String(settings.s3AutoSyncInterval)}
                      onChange={(val) =>
                        settings.setS3AutoSyncInterval(Number(val))
                      }
                      disabled={!settings.s3StorageEnabled || !s3IsSyncSource}
                      options={[
                        { value: "0", label: t("common.off", "Off") },
                        {
                          value: "5",
                          label: t("settings.every5min", "Every 5 minutes"),
                        },
                        {
                          value: "15",
                          label: t("settings.every15min", "Every 15 minutes"),
                        },
                        {
                          value: "30",
                          label: t("settings.every30min", "Every 30 minutes"),
                        },
                        {
                          value: "60",
                          label: t("settings.every60min", "Every 60 minutes"),
                        },
                      ]}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t("settings.webdavSyncOnStartup", "Run Once on Startup")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("settings.webdavSyncOnStartupDesc")}
                    </p>
                  </div>
                  <div className="min-w-[180px]">
                    <Select
                      ariaLabel={`${t("settings.s3SyncMenu", "S3 Compatible Storage")} ${t("settings.webdavSyncOnStartup", "Run Once on Startup")}`}
                      value={String(
                        settings.s3SyncOnStartup
                          ? settings.s3SyncOnStartupDelay
                          : -1,
                      )}
                      onChange={(val) => {
                        const num = Number(val);
                        if (num === -1) {
                          settings.setS3SyncOnStartup(false);
                        } else {
                          settings.setS3SyncOnStartup(true);
                          settings.setS3SyncOnStartupDelay(num);
                        }
                      }}
                      disabled={!settings.s3StorageEnabled || !s3IsSyncSource}
                      options={[
                        { value: "-1", label: t("common.off", "Off") },
                        {
                          value: "0",
                          label: t(
                            "settings.startupImmediate",
                            "Run immediately on startup",
                          ),
                        },
                        {
                          value: "5",
                          label: t(
                            "settings.startupDelay5s",
                            "Run 5 seconds after startup",
                          ),
                        },
                        {
                          value: "10",
                          label: t(
                            "settings.startupDelay10s",
                            "Run 10 seconds after startup",
                          ),
                        },
                        {
                          value: "30",
                          label: t(
                            "settings.startupDelay30s",
                            "Run 30 seconds after startup",
                          ),
                        },
                      ]}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t(
                        "settings.webdavSyncOnSave",
                        "Sync on Save (Experimental)",
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("settings.webdavSyncOnSaveDesc")}
                    </p>
                  </div>
                  <ToggleSwitch
                    ariaLabel={t(
                      "settings.webdavSyncOnSave",
                      "Sync on Save (Experimental)",
                    )}
                    checked={settings.s3SyncOnSave}
                    onChange={settings.setS3SyncOnSave}
                    disabled={!settings.s3StorageEnabled || !s3IsSyncSource}
                  />
                </div>

                <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t("settings.webdavIncludeImages", "Include Images")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("settings.webdavIncludeImagesDesc")}
                    </p>
                  </div>
                  <ToggleSwitch
                    ariaLabel={t(
                      "settings.webdavIncludeImages",
                      "Include Images",
                    )}
                    checked={settings.s3IncludeImages}
                    onChange={settings.setS3IncludeImages}
                    disabled={!settings.s3StorageEnabled}
                  />
                </div>

                <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t("settings.webdavIncrementalSync", "Incremental Sync")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("settings.webdavIncrementalSyncDesc")}
                    </p>
                  </div>
                  <ToggleSwitch
                    ariaLabel={t(
                      "settings.webdavIncrementalSync",
                      "Incremental Sync",
                    )}
                    checked={settings.s3IncrementalSync}
                    onChange={settings.setS3IncrementalSync}
                    disabled={!settings.s3StorageEnabled}
                  />
                </div>

                <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t(
                        "settings.webdavEncryption",
                        "Encrypt Backup (Experimental)",
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 text-amber-500">
                      {t("settings.webdavEncryptionDesc")}
                    </p>
                  </div>
                  <ToggleSwitch
                    ariaLabel={t(
                      "settings.webdavEncryption",
                      "Encrypt Backup (Experimental)",
                    )}
                    checked={settings.s3EncryptionEnabled}
                    onChange={settings.setS3EncryptionEnabled}
                    disabled={!settings.s3StorageEnabled}
                  />
                </div>

                {settings.s3EncryptionEnabled ? (
                  <div className="pt-2">
                    <PasswordInput
                      ariaLabel={t(
                        "settings.webdavEncryptionPasswordPlaceholder",
                        "Enter encryption password (optional, leave empty to skip)",
                      )}
                      placeholder={t(
                        "settings.webdavEncryptionPasswordPlaceholder",
                        "Enter encryption password (optional, leave empty to skip)",
                      )}
                      value={settings.s3EncryptionPassword}
                      onChange={settings.setS3EncryptionPassword}
                      disabled={!settings.s3StorageEnabled}
                      className="h-9"
                    />
                  </div>
                ) : null}
              </fieldset>
            </div>
          </div>
        </DataSettingsSection>
      ) : null}
    </>
  );
}
