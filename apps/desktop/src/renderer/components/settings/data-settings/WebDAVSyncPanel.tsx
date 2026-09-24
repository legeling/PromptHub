import { useDataSettingsControllerContext } from "./useDataSettingsController";
import {
  DataSettingsSection,
  getSyncPanelContentClassName,
} from "./DataSettingsSection";
import {
  CloudIcon,
  UploadIcon,
  DownloadIcon,
  RefreshCwIcon,
} from "lucide-react";
import { Select } from "../../ui/Select";
import { ToggleSwitch, PasswordInput } from "../shared";
import { SyncProviderSelector } from "./SyncProviderSelector";

export function WebDAVSyncPanel() {
  const {
    activeSubsection,
    t,
    webRuntime,
    settings,
    webdavTesting,
    webdavUploading,
    webdavDownloading,
    webdavConfigComplete,
    webdavIsSyncSource,
    WEBDAV_SYNC_ON_SAVE_AVAILABLE,
    handleWebDAVConnectionCheck,
    handleWebDAVUpload,
    handleWebDAVDownload,
  } = useDataSettingsControllerContext();

  return (
    <>
      {!webRuntime && activeSubsection === "webdav" ? (
        <DataSettingsSection title={t("settings.webdavSyncMenu", "WebDAV")}>
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <CloudIcon className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {t("settings.webdavSyncMenu", "WebDAV")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("settings.webdavEnabledDesc")}
                </p>
              </div>
              <ToggleSwitch
                ariaLabel={t("settings.webdavSyncMenu", "WebDAV")}
                checked={settings.webdavEnabled}
                onChange={settings.setWebdavEnabled}
              />
            </div>
            <SyncProviderSelector />
            <div
              className={getSyncPanelContentClassName(!settings.webdavEnabled)}
            >
              <fieldset
                disabled={!settings.webdavEnabled}
                className="space-y-3 min-w-0"
              >
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {t("settings.webdavUrl")}
                  </label>
                  <input
                    type="text"
                    aria-label={`${t("settings.webdavSyncMenu", "WebDAV")} ${t("settings.webdavUrl")}`}
                    placeholder="https://dav.example.com/path"
                    value={settings.webdavUrl}
                    onChange={(e) => settings.setWebdavUrl(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {t("settings.webdavUsername")}
                  </label>
                  <input
                    type="text"
                    aria-label={`${t("settings.webdavSyncMenu", "WebDAV")} ${t("settings.webdavUsername")}`}
                    placeholder={t("settings.webdavUsername")}
                    value={settings.webdavUsername}
                    onChange={(e) => settings.setWebdavUsername(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {t("settings.webdavPassword")}
                  </label>
                  <PasswordInput
                    ariaLabel={`${t("settings.webdavSyncMenu", "WebDAV")} ${t("settings.webdavPassword")}`}
                    placeholder={t("settings.webdavPassword")}
                    value={settings.webdavPassword}
                    onChange={settings.setWebdavPassword}
                    disabled={!settings.webdavEnabled}
                    className="h-9"
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => void handleWebDAVConnectionCheck()}
                    disabled={webdavTesting || !webdavConfigComplete}
                    className="h-8 px-4 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCwIcon
                      className={`w-4 h-4 ${webdavTesting ? "animate-spin" : ""}`}
                      aria-hidden="true"
                    />
                    {t("settings.testConnection")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleWebDAVUpload()}
                    disabled={webdavUploading || !webdavConfigComplete}
                    className="h-8 px-4 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <UploadIcon className="w-4 h-4" aria-hidden="true" />
                    {t("settings.backupToRemote", "Back up to remote")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleWebDAVDownload()}
                    disabled={webdavDownloading || !webdavConfigComplete}
                    className="h-8 px-4 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <DownloadIcon className="w-4 h-4" aria-hidden="true" />
                    {t("settings.updateFromRemote", "Update from remote")}
                  </button>
                </div>

                {/* 自动运行（定时同步） */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t("settings.webdavAutoRun", "自动运行")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {webdavIsSyncSource
                        ? t("settings.webdavAutoRunDesc")
                        : t(
                            "settings.syncSourceInactiveDesc",
                            "This target stays available for manual backup and restore, but automatic sync only runs for the current sync source.",
                          )}
                    </p>
                  </div>
                  <div className="min-w-[140px]">
                    <Select
                      ariaLabel={`${t("settings.webdavSyncMenu", "WebDAV")} ${t("settings.webdavAutoRun", "Auto Run")}`}
                      value={String(settings.webdavAutoSyncInterval)}
                      disabled={!settings.webdavEnabled || !webdavIsSyncSource}
                      onChange={(val) =>
                        settings.setWebdavAutoSyncInterval(Number(val))
                      }
                      options={[
                        { value: "0", label: t("common.off", "关闭") },
                        {
                          value: "5",
                          label: t("settings.every5min", "每 5 分钟"),
                        },
                        {
                          value: "15",
                          label: t("settings.every15min", "每 15 分钟"),
                        },
                        {
                          value: "30",
                          label: t("settings.every30min", "每 30 分钟"),
                        },
                        {
                          value: "60",
                          label: t("settings.every60min", "每 60 分钟"),
                        },
                      ]}
                    />
                  </div>
                </div>

                {/* 启动后自动运行一次 */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t("settings.webdavSyncOnStartup", "启动后自动运行一次")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("settings.webdavSyncOnStartupDesc")}
                    </p>
                  </div>
                  <div className="min-w-[180px]">
                    <Select
                      ariaLabel={`${t("settings.webdavSyncMenu", "WebDAV")} ${t("settings.webdavSyncOnStartup", "Run Once on Startup")}`}
                      value={String(
                        settings.webdavSyncOnStartup
                          ? settings.webdavSyncOnStartupDelay
                          : -1,
                      )}
                      disabled={!settings.webdavEnabled || !webdavIsSyncSource}
                      onChange={(val) => {
                        const num = Number(val);
                        if (num === -1) {
                          settings.setWebdavSyncOnStartup(false);
                        } else {
                          settings.setWebdavSyncOnStartup(true);
                          settings.setWebdavSyncOnStartupDelay(num);
                        }
                      }}
                      options={[
                        { value: "-1", label: t("common.off", "关闭") },
                        {
                          value: "0",
                          label: t(
                            "settings.startupImmediate",
                            "启动后立即运行",
                          ),
                        },
                        {
                          value: "5",
                          label: t(
                            "settings.startupDelay5s",
                            "启动后第 5 秒运行一次",
                          ),
                        },
                        {
                          value: "10",
                          label: t(
                            "settings.startupDelay10s",
                            "启动后第 10 秒运行一次",
                          ),
                        },
                        {
                          value: "30",
                          label: t(
                            "settings.startupDelay30s",
                            "启动后第 30 秒运行一次",
                          ),
                        },
                      ]}
                    />
                  </div>
                </div>

                {/* 保存时同步（实验性质） */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t("settings.webdavSyncOnSave", "保存时同步（实验性质）")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {WEBDAV_SYNC_ON_SAVE_AVAILABLE
                        ? t("settings.webdavSyncOnSaveDesc")
                        : t("settings.webdavSyncOnSaveUnavailableDesc")}
                    </p>
                  </div>
                  <ToggleSwitch
                    ariaLabel={t(
                      "settings.webdavSyncOnSave",
                      "Sync on Save (Experimental)",
                    )}
                    checked={settings.webdavSyncOnSave}
                    onChange={settings.setWebdavSyncOnSave}
                    disabled={
                      !settings.webdavEnabled ||
                      !webdavIsSyncSource ||
                      !WEBDAV_SYNC_ON_SAVE_AVAILABLE
                    }
                  />
                </div>

                {/* 包含图片 */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t("settings.webdavIncludeImages", "包含图片")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("settings.webdavIncludeImagesDesc")}
                    </p>
                  </div>
                  <ToggleSwitch
                    ariaLabel={t("settings.webdavIncludeImages", "包含图片")}
                    checked={settings.webdavIncludeImages}
                    onChange={settings.setWebdavIncludeImages}
                    disabled={!settings.webdavEnabled}
                  />
                </div>

                {/* 增量同步 */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t("settings.webdavIncrementalSync", "增量同步")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("settings.webdavIncrementalSyncDesc")}
                    </p>
                  </div>
                  <ToggleSwitch
                    ariaLabel={t("settings.webdavIncrementalSync", "增量同步")}
                    checked={settings.webdavIncrementalSync}
                    onChange={settings.setWebdavIncrementalSync}
                    disabled={!settings.webdavEnabled}
                  />
                </div>

                {/* 加密备份（实验性） */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t("settings.webdavEncryption", "加密备份（实验性）")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 text-amber-500">
                      {t("settings.webdavEncryptionDesc")}
                    </p>
                  </div>
                  <ToggleSwitch
                    ariaLabel={t(
                      "settings.webdavEncryption",
                      "加密备份（实验性）",
                    )}
                    checked={settings.webdavEncryptionEnabled}
                    onChange={settings.setWebdavEncryptionEnabled}
                    disabled={!settings.webdavEnabled}
                  />
                </div>

                {/* 加密密码输入框 */}
                {settings.webdavEncryptionEnabled && (
                  <div className="pt-2">
                    <PasswordInput
                      ariaLabel={t(
                        "settings.webdavEncryptionPasswordPlaceholder",
                        "输入加密密码（可选）",
                      )}
                      placeholder={t(
                        "settings.webdavEncryptionPasswordPlaceholder",
                        "输入加密密码（可选）",
                      )}
                      value={settings.webdavEncryptionPassword}
                      onChange={settings.setWebdavEncryptionPassword}
                      disabled={!settings.webdavEnabled}
                      className="h-9"
                    />
                  </div>
                )}
              </fieldset>
            </div>
          </div>
        </DataSettingsSection>
      ) : null}
    </>
  );
}
