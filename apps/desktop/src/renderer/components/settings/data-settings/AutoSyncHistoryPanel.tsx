import { useDataSettingsControllerContext } from "./useDataSettingsController";
import {
  DataSettingsSection,
  getSyncPanelContentClassName,
} from "./DataSettingsSection";
import { InboxIcon } from "lucide-react";

export function AutoSyncHistoryPanel() {
  const {
    t,
    settings,
    autoSyncHistory,
    showAutoSyncHistory,
    getAutoSyncProviderLabel,
    getAutoSyncReasonLabel,
    getAutoSyncStatusLabel,
    getAutoSyncStatusClassName,
  } = useDataSettingsControllerContext();

  return (
    <>
      {showAutoSyncHistory ? (
        <DataSettingsSection
          title={t("settings.autoSyncHistoryTitle", "Sync history")}
        >
          <div className="p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              {t(
                "settings.autoSyncHistoryDesc",
                "Recent manual backups and automatic sync attempts. Credentials and remote addresses are never stored here.",
              )}
            </p>
            {autoSyncHistory.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center">
                <InboxIcon
                  aria-hidden="true"
                  className="mx-auto mb-2 h-5 w-5 text-muted-foreground"
                />
                <p className="text-sm text-muted-foreground">
                  {t(
                    "settings.autoSyncHistoryEmpty",
                    "No sync has been recorded yet.",
                  )}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {autoSyncHistory.slice(0, 8).map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-border bg-background px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {getAutoSyncProviderLabel(entry.provider)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {getAutoSyncReasonLabel(entry.reason)}
                        </span>
                        {entry.localChanged ? (
                          <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                            {t(
                              "settings.autoSyncLocalChanged",
                              "Updated local data",
                            )}
                          </span>
                        ) : null}
                      </div>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${getAutoSyncStatusClassName(entry.status)}`}
                      >
                        {getAutoSyncStatusLabel(entry.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(entry.finishedAt).toLocaleString()}
                    </p>
                    {entry.message ? (
                      <p className="mt-1 break-words text-xs text-muted-foreground">
                        {entry.message}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DataSettingsSection>
      ) : null}
    </>
  );
}
