import { useTranslation } from "react-i18next";
import type { AutoSyncHistoryEntry } from "../../../services/sync-history";

export function useAutoSyncPresentation() {
  const { t } = useTranslation();

  const getAutoSyncProviderLabel = (
    provider: AutoSyncHistoryEntry["provider"],
  ) => {
    if (provider === "webdav") return t("settings.webdavSyncMenu", "WebDAV");
    if (provider === "s3")
      return t("settings.s3SyncMenu", "S3 Compatible Storage");
    return t("settings.selfHostedSyncMenu", "Self-Hosted PromptHub");
  };

  const getAutoSyncReasonLabel = (reason: AutoSyncHistoryEntry["reason"]) => {
    if (reason === "manual")
      return t("settings.autoSyncReasonManual", "Manual");
    if (reason === "startup")
      return t("settings.autoSyncReasonStartup", "Startup");
    if (reason === "startup-resume") {
      return t("settings.autoSyncReasonStartupResume", "Startup resume");
    }
    return t("settings.autoSyncReasonInterval", "Interval");
  };

  const getAutoSyncStatusLabel = (status: AutoSyncHistoryEntry["status"]) => {
    if (status === "success")
      return t("settings.autoSyncStatusSuccess", "Success");
    if (status === "failed")
      return t("settings.autoSyncStatusFailed", "Failed");
    return t("settings.autoSyncStatusSkipped", "Skipped");
  };

  const getAutoSyncStatusClassName = (
    status: AutoSyncHistoryEntry["status"],
  ) => {
    if (status === "success") {
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";
    }
    if (status === "failed") {
      return "border-destructive/30 bg-destructive/10 text-destructive";
    }
    return "border-border bg-muted text-muted-foreground";
  };

  return {
    getAutoSyncProviderLabel,
    getAutoSyncReasonLabel,
    getAutoSyncStatusLabel,
    getAutoSyncStatusClassName,
  };
}
