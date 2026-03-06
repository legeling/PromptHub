import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settings.store";
import { SettingSection, SettingItem, ToggleSwitch } from "./shared";
import { Select } from "../ui/Select";

export function GeneralSettings() {
  const { t } = useTranslation();
  const settings = useSettingsStore();

  return (
    <div className="space-y-6">
      <SettingSection title={t("settings.startup")}>
        <SettingItem
          label={t("settings.launchAtStartup")}
          description={t("settings.launchAtStartupDesc")}
        >
          <ToggleSwitch
            checked={settings.launchAtStartup}
            onChange={settings.setLaunchAtStartup}
          />
        </SettingItem>
        <SettingItem
          label={t("settings.minimizeOnLaunch")}
          description={t("settings.minimizeOnLaunchDesc")}
        >
          <ToggleSwitch
            checked={settings.minimizeOnLaunch}
            onChange={settings.setMinimizeOnLaunch}
          />
        </SettingItem>
        <SettingItem
          label={t("settings.clipboardImport", "剪切板快速导入")}
          description={t(
            "settings.clipboardImportDesc",
            "获得焦点时检测剪切板代码块并提示导入",
          )}
        >
          <ToggleSwitch
            checked={settings.clipboardImportEnabled}
            onChange={settings.setClipboardImportEnabled}
          />
        </SettingItem>
        {/* Windows close behavior settings */}
        {/* Windows 关闭行为设置 */}
        {navigator.platform.toLowerCase().includes("win") && (
          <SettingItem
            label={t("settings.closeAction")}
            description={t("settings.closeActionDesc")}
          >
            <Select
              value={settings.closeAction}
              onChange={(value) =>
                settings.setCloseAction(value as "ask" | "minimize" | "exit")
              }
              options={[
                { value: "ask", label: t("settings.askEveryTime") },
                { value: "minimize", label: t("settings.closeToTray") },
                { value: "exit", label: t("settings.closeApp") },
              ]}
              className="w-40"
            />
          </SettingItem>
        )}
      </SettingSection>

      <SettingSection title={t("settings.editor")}>
        <SettingItem
          label={t("settings.autoSave")}
          description={t("settings.autoSaveDesc")}
        >
          <ToggleSwitch
            checked={settings.autoSave}
            onChange={settings.setAutoSave}
          />
        </SettingItem>
        <SettingItem
          label={t("settings.showLineNumbers")}
          description={t("settings.showLineNumbersDesc")}
        >
          <ToggleSwitch
            checked={settings.showLineNumbers}
            onChange={settings.setShowLineNumbers}
          />
        </SettingItem>
      </SettingSection>
    </div>
  );
}
