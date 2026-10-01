import { useDataSettingsControllerContext } from "./useDataSettingsController";
import { DataSettingsSection } from "./DataSettingsSection";
import {
  InboxIcon,
  Loader2Icon,
  RefreshCwIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "lucide-react";
import { Checkbox } from "../../ui";
import { BackupGuidanceCard } from "./BackupGuidanceCard";

export function BackupPanel() {
  const {
    activeSubsection,
    t,
    webRuntime,
    settings,
    upgradeBackups,
    loadingUpgradeBackups,
    upgradeBackupActionId,
    showAllUpgradeBackups,
    setShowAllUpgradeBackups,
    setRestoreCandidate,
    setDeleteCandidate,
    isBackupDropTargetActive,
    setIsBackupDropTargetActive,
    exportScope,
    setExportScope,
    refreshUpgradeBackups,
    formatBytes,
    visibleUpgradeBackups,
    hiddenUpgradeBackupsCount,
    handleSelectiveExport,
    handleFullBackup,
    handleImportBackup,
    backupDropDescription,
    handleBackupDrop,
    exportScopeItems,
    DEFAULT_VISIBLE_UPGRADE_BACKUPS,
    EXPANDED_UPGRADE_BACKUP_MAX_HEIGHT,
  } = useDataSettingsControllerContext();

  return (
    <>
      {webRuntime || activeSubsection === "backup" ? (
        <DataSettingsSection title={t("settings.backup")}>
          {/* v0.6.3 #97/#139: end-to-end migration/rollback path, one glance. */}
          {/* 备份迁移回退三步指引。 */}
          <div className="p-4 pb-0">
            <BackupGuidanceCard />
          </div>
          {/* 选择性导出（只导出） */}
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">
                  {t("settings.selectiveExport", "选择性导出")}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {t(
                    "settings.selectiveExportDesc",
                    "按需导出指定数据（仅导出，不提供导入）",
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleSelectiveExport}
                className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                {t("settings.export", "导出")}
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {exportScopeItems.map((item) => {
                const checked = exportScope[item.key];
                return (
                  <button
                    type="button"
                    key={item.key}
                    aria-pressed={checked}
                    onClick={() =>
                      setExportScope((prev) => {
                        if (item.key === "images") {
                          return {
                            ...prev,
                            images: !checked,
                            videos: !checked,
                          };
                        }

                        return {
                          ...prev,
                          [item.key]: !checked,
                        };
                      })
                    }
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors select-none outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                      checked
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/60 hover:bg-muted/40"
                    }`}
                  >
                    <div className="pointer-events-none">
                      <div aria-hidden="true">
                        <Checkbox
                          checked={checked}
                          onChange={() => {}}
                          ariaLabel={item.label}
                        />
                      </div>
                    </div>
                    <span className="text-sm">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 全量备份/恢复 */}
          <div className="p-4 space-y-3 border-t border-border">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">
                  {t("settings.fullBackup", "全量备份 / 恢复")}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {t(
                    "settings.fullBackupDesc",
                    "用于迁移/跨设备恢复：包含 prompts、图片、AI 配置、系统设置、规则与 Skill",
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleFullBackup()}
                  className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
                  title={t("settings.fullBackupExport", "全量备份")}
                >
                  {t("settings.fullBackupExport", "全量备份")}
                </button>
                <button
                  type="button"
                  onClick={handleImportBackup}
                  title={t("settings.import", "导入数据")}
                  aria-label={t("settings.import", "导入数据")}
                  className="h-9 px-4 rounded-lg bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors"
                >
                  {t("settings.import", "导入数据")}
                </button>
              </div>
            </div>

            <div
              onDragOver={(event) => {
                event.preventDefault();
                if (
                  Array.from(event.dataTransfer.items).some(
                    (item) => item.kind === "file",
                  )
                ) {
                  setIsBackupDropTargetActive(true);
                }
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                if (
                  Array.from(event.dataTransfer.items).some(
                    (item) => item.kind === "file",
                  )
                ) {
                  setIsBackupDropTargetActive(true);
                }
              }}
              onDragLeave={(event) => {
                if (
                  !event.currentTarget.contains(
                    event.relatedTarget as Node | null,
                  )
                ) {
                  setIsBackupDropTargetActive(false);
                }
              }}
              onDrop={(event) => {
                void handleBackupDrop(event);
              }}
              className={`rounded-xl border border-dashed px-4 py-5 transition-colors ${
                isBackupDropTargetActive
                  ? "border-primary bg-primary/8"
                  : "border-border bg-muted/15"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    isBackupDropTargetActive
                      ? "bg-primary text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <InboxIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="text-sm font-medium text-foreground">
                    {t("settings.backupDropRestore", "拖拽恢复备份")}
                  </div>
                  <div className="text-xs leading-5 text-muted-foreground">
                    {backupDropDescription}
                  </div>
                  <div className="text-[11px] text-muted-foreground/80">
                    {t(
                      "settings.backupDropRestoreFormats",
                      "Supported: .json, .phub.gz, .gz, .zip",
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {!webRuntime ? (
            <div className="p-4 space-y-3 border-t border-border">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">
                    {t("settings.upgradeBackups", "升级备份")}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {t(
                      "settings.upgradeBackupsDesc",
                      "升级前自动创建的本地回滚点。恢复某个快照时，会先把当前状态保存为新快照，再回滚并自动重启。",
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void refreshUpgradeBackups()}
                  disabled={loadingUpgradeBackups}
                  className="h-8 shrink-0 whitespace-nowrap px-3 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCwIcon
                    className={`w-4 h-4 shrink-0 ${loadingUpgradeBackups ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                  {t("common.refresh", "Refresh")}
                </button>
              </div>

              {upgradeBackups.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                  {loadingUpgradeBackups
                    ? t(
                        "settings.upgradeBackupsLoading",
                        "Loading upgrade backups...",
                      )
                    : t(
                        "settings.upgradeBackupsEmpty",
                        "No automatic upgrade backups found yet.",
                      )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2.5">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-foreground">
                        {t(
                          "settings.upgradeBackupsSummary",
                          "{{count}} rollback snapshot(s)",
                          { count: upgradeBackups.length },
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {showAllUpgradeBackups
                          ? t(
                              "settings.upgradeBackupsSummaryExpanded",
                              "Showing full history in a scrollable list",
                            )
                          : hiddenUpgradeBackupsCount > 0
                            ? t(
                                "settings.upgradeBackupsSummaryCollapsed",
                                "Latest {{count}} shown by default",
                                {
                                  count: DEFAULT_VISIBLE_UPGRADE_BACKUPS,
                                },
                              )
                            : t(
                                "settings.upgradeBackupsSummaryCompact",
                                "All snapshots fit in the compact list",
                              )}
                      </span>
                    </div>

                    {hiddenUpgradeBackupsCount > 0 ? (
                      <button
                        type="button"
                        aria-expanded={showAllUpgradeBackups}
                        onClick={() =>
                          setShowAllUpgradeBackups((current) => !current)
                        }
                        className="h-8 px-3 rounded-lg bg-background text-sm hover:bg-accent transition-colors inline-flex items-center gap-2"
                      >
                        {showAllUpgradeBackups ? (
                          <ChevronUpIcon
                            className="w-4 h-4"
                            aria-hidden="true"
                          />
                        ) : (
                          <ChevronDownIcon
                            className="w-4 h-4"
                            aria-hidden="true"
                          />
                        )}
                        {showAllUpgradeBackups
                          ? t("common.collapse", "Collapse")
                          : t(
                              "settings.upgradeBackupsShowAll",
                              "Show all {{count}}",
                              { count: upgradeBackups.length },
                            )}
                      </button>
                    ) : null}
                  </div>

                  <div
                    className="space-y-2 overflow-y-auto pr-1"
                    style={{
                      maxHeight:
                        showAllUpgradeBackups &&
                        upgradeBackups.length > DEFAULT_VISIBLE_UPGRADE_BACKUPS
                          ? `${EXPANDED_UPGRADE_BACKUP_MAX_HEIGHT}px`
                          : undefined,
                    }}
                  >
                    {visibleUpgradeBackups.map((backup) => {
                      const busy = upgradeBackupActionId === backup.backupId;
                      return (
                        <div
                          key={backup.backupId}
                          className="rounded-xl border border-border bg-card/60 p-3 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium truncate">
                                {backup.manifest.fromVersion}
                                {backup.manifest.toVersion
                                  ? ` -> ${backup.manifest.toVersion}`
                                  : ""}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1 break-all">
                                {backup.backupId}
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground shrink-0">
                              {formatBytes(backup.sizeBytes)}
                            </div>
                          </div>

                          <div className="text-xs text-muted-foreground space-y-1">
                            <div>
                              {t("settings.upgradeBackupCreatedAt", "快照时间")}
                              ：
                              {new Date(
                                backup.manifest.createdAt,
                              ).toLocaleString()}
                            </div>
                            <div>
                              {t("settings.upgradeBackupItems", "包含项目")}：
                              {backup.manifest.copiedItems
                                .filter((item) =>
                                  [
                                    "prompthub.db",
                                    "data",
                                    "config",
                                    "skills",
                                    "workspace",
                                  ].some((k) => item.includes(k)),
                                )
                                .join("、") ||
                                backup.manifest.copiedItems.join("、")}
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setDeleteCandidate(backup)}
                              disabled={busy}
                              className="h-8 px-3 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors disabled:opacity-50"
                            >
                              {t("common.delete", "Delete")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setRestoreCandidate(backup)}
                              disabled={busy}
                              className="h-8 px-3 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                              {busy ? (
                                <Loader2Icon
                                  className="w-4 h-4 animate-spin"
                                  aria-hidden="true"
                                />
                              ) : null}
                              {t(
                                "settings.upgradeBackupRestoreAction",
                                "回滚到此快照",
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DataSettingsSection>
      ) : null}
    </>
  );
}
