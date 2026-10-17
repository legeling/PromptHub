import { useEffect, useState } from "react";
import {
  CopyIcon,
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
import { copyTextToClipboard } from "../../utils/clipboard";

const UNKNOWN_LABEL = "Unknown";
const EMPTY_MANUAL_COMMANDS: Record<CliInstallMethod, string> = {
  pnpm: "",
  npm: "",
};

const FALLBACK_STATUS: CliStatus = {
  installed: false,
  command: "prompthub",
  version: null,
  packageManager: null,
  packageManagerVersion: null,
  releaseTag: "",
  installCommand: null,
  manualInstallCommands: EMPTY_MANUAL_COMMANDS,
  installSource: "",
};

const PACKAGE_MANAGER_NOT_FOUND_ERROR = "CLI_PACKAGE_MANAGER_NOT_FOUND";

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
    const installMethod = method ?? status.packageManager;
    if (!installMethod) {
      showToast(t("settings.cliPackageManagerInstallUnavailable"), "error");
      return;
    }

    setIsInstalling(true);
    try {
      const result = await window.electron?.cli?.install?.(installMethod);
      if (!result?.success) {
        showToast(
          result?.error === PACKAGE_MANAGER_NOT_FOUND_ERROR
            ? t("settings.cliPackageManagerInstallUnavailable")
            : result?.error || t("settings.cliInstallFailed"),
          "error",
        );
        return;
      }

      showToast(
        result.removedLegacyCommand
          ? t("settings.cliLegacyMigrationSuccess")
          : t("settings.cliInstallSuccess"),
        "success",
      );
      await refreshStatus();
    } catch (error) {
      console.error("Failed to install CLI:", error);
      showToast(t("settings.cliInstallFailed"), "error");
    } finally {
      setIsInstalling(false);
    }
  };

  const handleCopyManualCommand = async (command: string) => {
    try {
      await copyTextToClipboard(command);
      showToast(t("settings.cliInstallCommandCopied"), "success");
    } catch (error) {
      console.error("Failed to copy CLI install command:", error);
      showToast(t("settings.cliInstallCommandCopyFailed"), "error");
    }
  };

  const hasDetectedPackageManager = Boolean(status.packageManager);
  const hasLegacyWrapper = Boolean(status.legacyCommandPath);
  const primaryInstallMethod = status.packageManager ?? "pnpm";
  const canInstallCli =
    !isLoading &&
    !isInstalling &&
    !status.installed &&
    hasDetectedPackageManager;
  const manualCommands = Object.entries(
    status.manualInstallCommands ?? EMPTY_MANUAL_COMMANDS,
  ).filter((entry): entry is [CliInstallMethod, string] => Boolean(entry[1]));

  return (
    <div className="space-y-6">
      <SettingSection title={t("settings.cliTitle")}>
        <div className="space-y-0">
          <SettingItem
            label={t("settings.cliInstallStatus")}
            status={
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
              <span className="text-sm text-muted-foreground">
                {status.version}
              </span>
            </SettingItem>
          ) : null}

          <SettingItem
            label={t("settings.cliPackageManagerLabel")}
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
              onClick={() =>
                void handleInstall(status.packageManager ?? undefined)
              }
              disabled={!canInstallCli}
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
              {t(
                hasLegacyWrapper
                  ? "settings.cliReplaceWith"
                  : "settings.cliInstallWith",
                { manager: primaryInstallMethod },
              )}
            </button>
            {status.packageManager !== "npm" ? (
              <button
                type="button"
                onClick={() => void handleInstall("npm")}
                disabled={!canInstallCli}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <DownloadIcon aria-hidden="true" className="h-4 w-4" />
                {t(
                  hasLegacyWrapper
                    ? "settings.cliReplaceWith"
                    : "settings.cliInstallWith",
                  { manager: "npm" },
                )}
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
          {!isLoading && status.legacyCommandPath ? (
            <div
              role="status"
              className="flex gap-3 border-y border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-900 dark:text-amber-200"
            >
              <AlertCircleIcon
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <div className="min-w-0 text-xs">
                <p className="font-medium">
                  {t("settings.cliLegacyWrapperTitle")}
                </p>
                <p className="mt-1 text-amber-800 dark:text-amber-300">
                  {t("settings.cliLegacyWrapperDesc")}
                </p>
                <code className="mt-1.5 block overflow-x-auto whitespace-nowrap text-foreground">
                  {status.legacyCommandPath}
                </code>
              </div>
            </div>
          ) : null}
          {!isLoading && !status.installed && !hasDetectedPackageManager ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {t("settings.cliPackageManagerInstallUnavailable")}
            </p>
          ) : null}
          {!status.installed && manualCommands.length > 0 ? (
            <div className="space-y-3 rounded-xl border border-border bg-background p-4">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t("settings.cliManualInstallTitle")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("settings.cliManualInstallDesc")}
                </p>
              </div>
              <div className="space-y-2">
                {manualCommands.map(([manager, command]) => (
                  <div
                    key={manager}
                    className="flex min-w-0 items-center gap-2 rounded-lg bg-muted/40 p-2"
                  >
                    <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-xs text-foreground">
                      {command}
                    </code>
                    <button
                      type="button"
                      onClick={() => void handleCopyManualCommand(command)}
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/60"
                      aria-label={t("settings.cliCopyInstallCommand", {
                        manager,
                      })}
                    >
                      <CopyIcon aria-hidden="true" className="h-3.5 w-3.5" />
                      {t("common.copy")}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="rounded-xl bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">
              {t("settings.cliFeatureTitle")}
            </p>
            <p className="mt-1.5 whitespace-pre-line">
              {t("settings.cliFeatureDesc")}
            </p>
          </div>
        </div>
      </SettingSection>
    </div>
  );
}
