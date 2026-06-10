import { useEffect, useState } from "react";
import {
  CheckCircleIcon,
  DownloadIcon,
  Loader2Icon,
  TerminalSquareIcon,
  RefreshCwIcon,
  AlertCircleIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CliInstallMethod, CliStatus } from "@prompthub/shared/types";
import { SettingItem, SettingSection } from "./shared";
import { useToast } from "../ui/Toast";

const UNKNOWN_LABEL = "Unknown";

const FALLBACK_STATUS: CliStatus = {
  installed: false,
  command: "prompthub",
  version: null,
  packageManager: null,
  packageManagerVersion: null,
  releaseTag: "",
  installCommand: null,
  installSource: "",
};

export function CLISettings() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [status, setStatus] = useState<CliStatus>(FALLBACK_STATUS);
  const [isLoading, setIsLoading] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);

  const refreshStatus = async () => {
    setIsLoading(true);
    try {
      const nextStatus = await window.electron?.cli?.getStatus?.();
      if (nextStatus) {
        setStatus(nextStatus);
      }
    } catch (error) {
      console.error("Failed to load CLI status:", error);
      showToast(t("settings.cliStatusLoadFailed"), "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refreshStatus();
  }, []);

  const handleInstall = async (method?: CliInstallMethod) => {
    setIsInstalling(true);
    try {
      const result = await window.electron?.cli?.install?.(method);
      if (!result?.success) {
        showToast(
          result?.error || t("settings.cliInstallFailed"),
          "error",
        );
        return;
      }

      showToast(t("settings.cliInstallSuccess"), "success");
      await refreshStatus();
    } catch (error) {
      console.error("Failed to install CLI:", error);
      showToast(t("settings.cliInstallFailed"), "error");
    } finally {
      setIsInstalling(false);
    }
  };

  const primaryInstallMethod = status.packageManager ?? "pnpm";

  return (
    <div className="space-y-6">
      <SettingSection title={t("settings.cliTitle")}>
        <div className="space-y-0">
          <SettingItem
            label={t("settings.cliInstallStatus")}
            description={
              isLoading
                ? t("settings.cliCheckingStatus")
                : status.installed
                  ? t("settings.cliInstalledDesc", {
                      version: status.version || UNKNOWN_LABEL,
                    })
                  : t("settings.cliNotInstalledDesc")
            }
          >
            <div className="flex items-center gap-2 text-sm">
              {isLoading ? (
                <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : status.installed ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1 text-green-600 dark:text-green-400">
                  <CheckCircleIcon className="h-4 w-4" />
                  {t("settings.cliInstalled")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-amber-700 dark:text-amber-300">
                  <AlertCircleIcon className="h-4 w-4" />
                  {t("settings.cliNotInstalled")}
                </span>
              )}
            </div>
          </SettingItem>

          {status.installed && status.version ? (
            <SettingItem label={t("settings.cliVersionLabel")}>
              <span className="text-sm text-muted-foreground">{status.version}</span>
            </SettingItem>
          ) : null}

          <SettingItem
            label={t("settings.cliPackageManagerLabel")}
            description={t("settings.cliPackageManagerDesc")}
          >
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TerminalSquareIcon className="h-4 w-4" />
              <span>
                {status.packageManager
                  ? `${status.packageManager}${status.packageManagerVersion ? ` ${status.packageManagerVersion}` : ""}`
                  : t("settings.cliPackageManagerMissing")}
              </span>
            </div>
          </SettingItem>
        </div>
      </SettingSection>

      <SettingSection title={t("settings.cliActionsTitle")}>
        <div className="space-y-4 px-4 py-4">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleInstall(primaryInstallMethod)}
              disabled={isInstalling || status.installed}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isInstalling ? (
                <Loader2Icon
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin"
                />
              ) : (
                <DownloadIcon aria-hidden="true" className="h-4 w-4" />
              )}
              {t("settings.cliInstallWith", {
                manager: primaryInstallMethod,
              })}
            </button>
            {status.packageManager !== "npm" ? (
              <button
                type="button"
                onClick={() => void handleInstall("npm")}
                disabled={isInstalling || status.installed}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <DownloadIcon aria-hidden="true" className="h-4 w-4" />
                {t("settings.cliInstallWith", { manager: "npm" })}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void refreshStatus()}
              disabled={isLoading || isInstalling}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCwIcon
                aria-hidden="true"
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
              {t("settings.cliRefreshStatus")}
            </button>
          </div>
          <div className="rounded-xl bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">{t("settings.cliFeatureTitle")}</p>
            <p className="mt-1.5 whitespace-pre-line">{t("settings.cliFeatureDesc")}</p>
          </div>
        </div>
      </SettingSection>
    </div>
  );
}
