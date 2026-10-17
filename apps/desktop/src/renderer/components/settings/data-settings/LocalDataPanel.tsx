import { useDataSettingsControllerContext } from "./useDataSettingsController";
import { DataSettingsSection } from "./DataSettingsSection";
import { FolderIcon, ExternalLinkIcon } from "lucide-react";

export function LocalDataPanel() {
  const {
    activeSubsection,
    t,
    webRuntime,
    currentDataPath,
    pendingDataPath,
    runtimePaths,
    dataPathActionLoading,
    cacheSize,
    clearingCache,
    handleClearCache,
    formatBytes,
    normalizedDataPath,
    handleChangeDataPath,
  } = useDataSettingsControllerContext();

  return (
    <>
      {!webRuntime && activeSubsection === "local" ? (
        <DataSettingsSection title={t("settings.dataPath")}>
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <FolderIcon className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">{t("settings.dataPath")}</p>
                <button
                  type="button"
                  onClick={() =>
                    currentDataPath &&
                    window.electron?.openPath?.(currentDataPath)
                  }
                  className="text-xs text-primary font-mono mt-0.5 hover:underline flex items-center gap-1 cursor-pointer"
                  title={t("settings.openFolder")}
                >
                  {currentDataPath || t("common.loading")}
                  <ExternalLinkIcon className="w-3 h-3" aria-hidden="true" />
                </button>
                {pendingDataPath && pendingDataPath !== currentDataPath ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("settings.pendingDataPath")}{" "}
                    <span className="font-mono">{pendingDataPath}</span>
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => void handleChangeDataPath()}
                disabled={dataPathActionLoading}
                className="h-8 px-3 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors"
              >
                {dataPathActionLoading
                  ? t("common.loading")
                  : t("settings.change")}
              </button>
            </div>
          </div>
        </DataSettingsSection>
      ) : null}

      {!webRuntime && activeSubsection === "local" ? (
        <DataSettingsSection title={t("settings.dbInfo")}>
          <div className="divide-y divide-border">
            {normalizedDataPath ? (
              <>
                {[
                  {
                    label: t("settings.applicationData"),
                    path: runtimePaths?.userDataPath ?? normalizedDataPath,
                    actionLabel: t("settings.openFolder"),
                  },
                  {
                    label: t("settings.databaseFile"),
                    path:
                      runtimePaths?.databasePath ??
                      `${normalizedDataPath}/data/prompthub.db`,
                    actionLabel: t("settings.openFolder"),
                  },
                  {
                    label: t("settings.promptsData"),
                    path:
                      runtimePaths?.promptsDir ??
                      `${normalizedDataPath}/data/prompts`,
                    actionLabel: t("settings.openFolder"),
                  },
                  {
                    label: t("settings.applicationLogs"),
                    path: runtimePaths?.logsDir ?? `${normalizedDataPath}/logs`,
                    actionLabel: t("settings.openLogs"),
                  },
                  {
                    label: t("settings.autoSyncLogData"),
                    path:
                      runtimePaths?.autoSyncLogPath ??
                      `${normalizedDataPath}/logs/auto-sync.jsonl`,
                    actionLabel: t("settings.openLogs"),
                  },
                  {
                    label: t("settings.rulesData"),
                    path:
                      runtimePaths?.rulesDir ??
                      `${normalizedDataPath}/data/rules`,
                    actionLabel: t("settings.openFolder"),
                  },
                  {
                    label: t("settings.skillsData"),
                    path:
                      runtimePaths?.skillsDir ??
                      `${normalizedDataPath}/data/skills`,
                    actionLabel: t("settings.openFolder"),
                  },
                  {
                    label: t("settings.mcpData"),
                    path:
                      runtimePaths?.mcpDir ?? `${normalizedDataPath}/data/mcp`,
                    actionLabel: t("settings.openFolder"),
                  },
                  {
                    label: t("settings.backupsData"),
                    path:
                      runtimePaths?.backupsDir ??
                      `${normalizedDataPath}/backups`,
                    actionLabel: t("settings.openFolder"),
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between gap-4 px-5 py-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {item.label}
                      </p>
                      <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
                        {item.path}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void window.electron?.openPath?.(item.path)
                      }
                      className="h-8 shrink-0 rounded-lg border border-border bg-muted px-3 text-sm text-foreground transition-colors hover:bg-muted/80"
                    >
                      {item.actionLabel}
                    </button>
                  </div>
                ))}

                {/* Cache row */}
                <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {t("settings.cacheData")}
                      {cacheSize !== null && (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          ({formatBytes(cacheSize)})
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={clearingCache}
                    onClick={() => void handleClearCache()}
                    className="h-8 shrink-0 rounded-lg border border-border bg-muted px-3 text-sm text-foreground transition-colors hover:bg-muted/80 disabled:opacity-50"
                  >
                    {clearingCache
                      ? t("common.loading")
                      : t("settings.clearCache")}
                  </button>
                </div>
              </>
            ) : (
              <div className="px-5 py-4">
                <p className="text-sm italic text-muted-foreground">
                  {t("common.loading")}
                </p>
              </div>
            )}
          </div>
        </DataSettingsSection>
      ) : null}
    </>
  );
}
