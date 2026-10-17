import { useDataSettingsControllerContext } from "./useDataSettingsController";
import {
  DataSettingsSection,
  getSyncPanelContentClassName,
} from "./DataSettingsSection";
import {
  UploadIcon,
  DownloadIcon,
  RefreshCwIcon,
  ServerCogIcon,
} from "lucide-react";
import { Select } from "../../ui/Select";
import { ToggleSwitch, PasswordInput } from "../shared";

export function SelfHostedSyncPanel() {
  const {
    activeSubsection,
    t,
    webRuntime,
    settings,
    selfHostedTesting,
    selfHostedUploading,
    selfHostedDownloading,
    selfHostedConfigComplete,
    handleSelfHostedConnectionCheck,
    handleSelfHostedPush,
    handleSelfHostedPull,
  } = useDataSettingsControllerContext();

  return (
    <>
      {!webRuntime && activeSubsection === "selfHosted" ? (
        <DataSettingsSection
          title={t("settings.selfHostedSyncMenu", "Self-Hosted PromptHub")}
        >
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <ServerCogIcon className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {t("settings.selfHostedSyncMenu", "Self-Hosted PromptHub")}
                </p>
              </div>
              <ToggleSwitch
                ariaLabel={t(
                  "settings.selfHostedSyncMenu",
                  "Self-Hosted PromptHub",
                )}
                checked={settings.selfHostedSyncEnabled}
                onChange={settings.setSelfHostedSyncEnabled}
              />
            </div>

            <div
              className={getSyncPanelContentClassName(
                !settings.selfHostedSyncEnabled,
              )}
            >
              <fieldset
                disabled={!settings.selfHostedSyncEnabled}
                className="space-y-3 min-w-0"
              >
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {t(
                      "settings.selfHostedSyncServer",
                      "Self-Hosted PromptHub URL",
                    )}
                  </label>
                  <input
                    type="text"
                    aria-label={t(
                      "settings.selfHostedSyncServer",
                      "Self-Hosted PromptHub URL",
                    )}
                    placeholder="https://backup.example.com"
                    value={settings.selfHostedSyncUrl}
                    onChange={(e) =>
                      settings.setSelfHostedSyncUrl(e.target.value)
                    }
                    className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {t("settings.webdavUsername")}
                  </label>
                  <input
                    type="text"
                    aria-label={`${t("settings.selfHostedSyncMenu", "Self-Hosted PromptHub")} ${t("settings.webdavUsername")}`}
                    placeholder={t("settings.webdavUsername")}
                    value={settings.selfHostedSyncUsername}
                    onChange={(e) =>
                      settings.setSelfHostedSyncUsername(e.target.value)
                    }
                    className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {t("settings.webdavPassword")}
                  </label>
                  <PasswordInput
                    ariaLabel={`${t("settings.selfHostedSyncMenu", "Self-Hosted PromptHub")} ${t("settings.webdavPassword")}`}
                    placeholder={t("settings.webdavPassword")}
                    value={settings.selfHostedSyncPassword}
                    onChange={settings.setSelfHostedSyncPassword}
                    disabled={!settings.selfHostedSyncEnabled}
                    className="h-9"
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => void handleSelfHostedConnectionCheck()}
                    disabled={selfHostedTesting || !selfHostedConfigComplete}
                    className="h-8 px-4 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCwIcon
                      className={`w-4 h-4 ${selfHostedTesting ? "animate-spin" : ""}`}
                      aria-hidden="true"
                    />
                    {t("settings.testConnection")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSelfHostedPush()}
                    disabled={selfHostedUploading || !selfHostedConfigComplete}
                    className="h-8 px-4 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <UploadIcon className="w-4 h-4" aria-hidden="true" />
                    {t("settings.backupToRemote", "Create remote backup")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSelfHostedPull()}
                    disabled={
                      selfHostedDownloading || !selfHostedConfigComplete
                    }
                    className="h-8 px-4 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <DownloadIcon className="w-4 h-4" aria-hidden="true" />
                    {t("settings.updateFromRemote", "Restore latest backup")}
                  </button>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t("settings.selfHostedAutoRun", "Automatic Backup")}
                    </p>
                  </div>
                  <div className="min-w-[140px]">
                    <Select
                      ariaLabel={`${t("settings.selfHostedSyncMenu", "Self-Hosted PromptHub")} ${t("settings.selfHostedAutoRun", "Automatic Backup")}`}
                      value={String(settings.selfHostedAutoSyncInterval)}
                      onChange={(val) =>
                        settings.setSelfHostedAutoSyncInterval(Number(val))
                      }
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

                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {t(
                        "settings.selfHostedSyncOnStartup",
                        "Run Once on Startup",
                      )}
                    </p>
                  </div>
                  <div className="min-w-[180px]">
                    <Select
                      ariaLabel={`${t("settings.selfHostedSyncMenu", "Self-Hosted PromptHub")} ${t("settings.selfHostedSyncOnStartup", "Run Once on Startup")}`}
                      value={String(
                        settings.selfHostedSyncOnStartup
                          ? settings.selfHostedSyncOnStartupDelay
                          : -1,
                      )}
                      onChange={(val) => {
                        const num = Number(val);
                        if (num === -1) {
                          settings.setSelfHostedSyncOnStartup(false);
                        } else {
                          settings.setSelfHostedSyncOnStartup(true);
                          settings.setSelfHostedSyncOnStartupDelay(num);
                        }
                      }}
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
              </fieldset>
            </div>
          </div>
        </DataSettingsSection>
      ) : null}
    </>
  );
}
