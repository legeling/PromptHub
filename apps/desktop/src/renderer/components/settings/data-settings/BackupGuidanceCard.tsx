import { useTranslation } from "react-i18next";
import { ChevronDownIcon, CompassIcon } from "lucide-react";
import { useSettingsStore } from "../../../stores/settings.store";

/**
 * v0.6.3 (#97/#139/#71): a static three-step self-help path for backup,
 * device migration and version rollback. The actions themselves live right
 * below in the panel; this card only explains the end-to-end flow so the
 * capability is discoverable. Collapsed state persists in local settings.
 * 备份/迁移/回退三步自助指引：动作按钮在面板下方已有，本卡只负责把
 * 完整路径讲清楚（可折叠，折叠状态本地持久化）。
 */
export function BackupGuidanceCard() {
  const { t } = useTranslation();
  const collapsed = useSettingsStore((state) => state.backupGuideCollapsed);
  const setBackupGuideCollapsed = useSettingsStore(
    (state) => state.setBackupGuideCollapsed,
  );

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20">
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-controls="backup-guidance-body"
        onClick={() => setBackupGuideCollapsed(!collapsed)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <CompassIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {t("settings.backupGuideTitle")}
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-base ${
            collapsed ? "-rotate-90" : ""
          }`}
        />
      </button>
      <div
        id="backup-guidance-body"
        hidden={collapsed}
        className="px-4 pb-4"
      >
        <ol className="list-decimal space-y-1.5 pl-5 text-xs leading-5 text-muted-foreground marker:text-primary">
          <li>{t("settings.backupGuideStep1")}</li>
          <li>{t("settings.backupGuideStep2")}</li>
          <li>{t("settings.backupGuideStep3")}</li>
        </ol>
      </div>
    </div>
  );
}
