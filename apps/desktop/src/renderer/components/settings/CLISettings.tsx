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
import type {
  CliInstallMethod,
  CliInstallResult,
  CliStatus,
} from "@prompthub/shared/types";
import { SettingItem, SettingSection } from "./shared";
import { useToast } from "../ui/Toast";
import { copyTextToClipboard } from "../../utils/clipboard";
import { useCLIStatusStore } from "../../stores/cli-status.store";

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
const INSTALL_ERROR_KEYS: Record<
  NonNullable<CliInstallResult["errorCode"]>,
  string
> = {
  environment: "settings.cliInstallEnvironmentError",
  permission: "settings.cliInstallPermissionError",
  timeout: "settings.cliInstallTimeoutError",
  network: "settings.cliInstallNetworkError",
  failed: "settings.cliInstallFailed",
};

export function CLISettings() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const {
    status: cachedStatus,
    error: statusError,
    hasChecked,
    isChecking,
    check,
  } = useCLIStatusStore();
  const status = cachedStatus ?? FALLBACK_STATUS;
  const isLoading = !hasChecked || isChecking;
  const isInitialCheck = !cachedStatus && isLoading;
  const [isInstalling, setIsInstalling] = useState(false);
  const [installFailure, setInstallFailure] = useState<{
    message: string;
    details: string;
  } | null>(null);

  const refreshStatus = () => check(true);

  useEffect(() => {
    void check();
  }, [check]);

  const handleInstall = async (method?: CliInstallMethod) => {
    const installMethod = method ?? status.packageManager;
    if (!installMethod) {
      showToast(t("settings.cliPackageManagerInstallUnavailable"), "error");
      return;
    }

    setIsInstalling(true);
    setInstallFailure(null);
    try {
      const result = await window.electron?.cli?.install?.(installMethod);
      if (!result?.success) {
        const message =
          result?.error === PACKAGE_MANAGER_NOT_FOUND_ERROR
            ? t("settings.cliPackageManagerInstallUnavailable")
            : t(INSTALL_ERROR_KEYS[result?.errorCode ?? "failed"]);
        setInstallFailure({
          message,
          details: [result?.error, result?.stderr, result?.stdout]
            .filter(Boolean)
            .join("\n"),
        });
        showToast(message, "error");
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
      setInstallFailure({
        message: t("settings.cliInstallFailed"),
        details: error instanceof Error ? error.message : String(error),
      });
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
  const displayedFailure =
    installFailure ??
    (statusError || status.error
      ? {
          message: t("settings.cliStatusLoadFailed"),
          details: statusError || status.error,
        }
      : null);
  const hasLegacyWrapper = Boolean(status.legacyCommandPath);
  const primaryInstallMethod = status.packageManager ?? "pnpm";
  const canInstallCli =
    !isLoading &&
    !isInstalling &&
    !statusError &&
    !status.error &&
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
              isInitialCheck
                ? t("settings.cliCheckingStatus")
                : !cachedStatus && statusError
                  ? t("settings.cliStatusLoadFailed")
                  : status.installed
                    ? t("settings.cliInstalledDesc", {
                        version: status.version || UNKNOWN_LABEL,
                      })
                    : t("settings.cliNotInstalledDesc")
            }
          >
            <div className="flex items-center gap-2 text-sm">
              {isInitialCheck ? (
                <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : !cachedStatus && statusError ? (
                <AlertCircleIcon
                  className="h-4 w-4 text-destructive"
                  aria-label={t("settings.cliStatusLoadFailed")}
                />
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

          <SettingItem label={t("settings.cliPackageManagerLabel")}>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TerminalSquareIcon className="h-4 w-4" />
              <span>
                {status.packageManager
                  ? `${status.packageManager}${status.packageManagerVersion ? ` ${status.packageManagerVersion}` : ""}`
                  : cachedStatus
                    ? t("settings.cliPackageManagerMissing")
                    : "—"}
              </span>
            </div>
          </SettingItem>
        </div>
      </SettingSection>

      <SettingSection title={t("settings.cliActionsTitle")}>
        <div className="space-y-4 px-4 py-4">
          {status.fromCache && status.checkedAt ? (
            <p className="text-xs text-muted-foreground">
              {t("settings.cliCachedStatus", {
                time: new Date(status.checkedAt).toLocaleString(),
              })}
            </p>
          ) : null}
          {displayedFailure && (
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm"
            >
              <p className="text-destructive">{displayedFailure.message}</p>
              {displayedFailure.details && (
                <details className="mt-2 text-muted-foreground">
                  <summary className="cursor-pointer text-xs">
                    {t("settings.cliInstallErrorDetails")}
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs">
                    {displayedFailure.details}
                  </pre>
                </details>
              )}
            </div>
          )}
          {status.installed && status.globalBinDirectory && (
            <p
              role="status"
              className="break-words text-xs text-muted-foreground"
            >
              {t("settings.cliGlobalBinHint", {
                path: status.globalBinDirectory,
              })}
            </p>
          )}
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
          {!isLoading &&
          cachedStatus &&
          !status.installed &&
          !hasDetectedPackageManager ? (
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
                      {t("settings.cliCopyCommand")}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </SettingSection>
    </div>
  );
}
